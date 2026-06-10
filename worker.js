/**
 * Cloudflare Worker: fetchSiteEmails
 * ────────────────────────────────────
 * Usa Gmail API + OAuth2 per leggere le mail
 * e restituirle al gestionale immobiliare.
 *
 * Progetto: AgenzioImmobiliare
 */

/* CREDENZIALI: NON più nel codice (erano esposte). Ora arrivano dai Secret
   cifrati di Cloudflare (env.CLIENT_ID, env.CLIENT_SECRET, env.REFRESH_TOKEN).
   Configurali in: Worker → Settings → Variables and Secrets → Add (Encrypt).
   Vedi la guida CONFIGURA_SECRETS.md */

/* ── Ottieni Access Token fresco da Refresh Token ─────────────────── */
async function getAccessToken(env) {
  if (!env || !env.CLIENT_ID || !env.CLIENT_SECRET || !env.REFRESH_TOKEN) {
    throw new Error('Credenziali mancanti: configura CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN nei Secret del Worker (Settings → Variables and Secrets).');
  }
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      refresh_token: env.REFRESH_TOKEN,
      grant_type:    'refresh_token'
    })
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Token non ottenuto: ' + JSON.stringify(data));
  return data.access_token;
}

/* ── Decodifica base64url ──────────────────────────────────────────── */
function decodeBase64url(str) {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    return decodeURIComponent(
      binary.split('').map(c =>
        '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
      ).join('')
    );
  } catch(e) {
    return '';
  }
}

/* ── Estrai HTML raw dal payload Gmail ────────────────────────────── */
function extractRawHtml(payload) {
  if (!payload) return '';
  if (payload.body && payload.body.data) return decodeBase64url(payload.body.data);
  if (payload.parts && payload.parts.length) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body && part.body.data)
        return decodeBase64url(part.body.data);
      if (part.mimeType === 'text/plain' && part.body && part.body.data)
        return decodeBase64url(part.body.data);
      if (part.parts) { const n = extractRawHtml(part); if (n) return n; }
    }
  }
  return '';
}

/* ── Estrai testo pulito da HTML ──────────────────────────────────── */
function extractBody(payload) {
  const raw = extractRawHtml(payload);
  return raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

/* ── Parser specifico form contatto sito ─────────────────────────── */
/* Struttura mail: etichette "Nome", "Email", "Telefono", "Messaggio"
   seguite dal valore nella riga/elemento successivo                  */
function parseFormMail(html, plainText) {
  const result = { nome: '', cognome: '', email: '', telefono: '', messaggio: '' };

  /* Prova prima con l'HTML — estrai testo tra tag rimuovendo i tag */
  const text = html
    ? html.replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<\/div>/gi, '\n')
          .replace(/<\/td>/gi, '\n')
          .replace(/<\/tr>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
    : (plainText || '');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  /* Cerca etichette e prendi il valore nella riga successiva */
  const labels = {
    nome:      ['nome', 'name', 'nome e cognome', 'nominativo', 'first name', 'firstname'],
    cognome:   ['cognome', 'surname', 'last name', 'lastname'],
    email:     ['email', 'e-mail', 'mail', 'indirizzo email'],
    telefono:  ['telefono', 'tel', 'cellulare', 'phone', 'numero', 'cell'],
    messaggio: ['messaggio', 'message', 'testo', 'richiesta', 'note', 'descrizione']
  };

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase().replace(/[:\*]/g, '').trim();
    for (const [field, keys] of Object.entries(labels)) {
      if (keys.includes(lineLower) && !result[field]) {
        /* Il valore è nella riga successiva non vuota */
        for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
          const nextLine = lines[j].trim();
          const nextLower = nextLine.toLowerCase().replace(/[:\*]/g, '').trim();
          /* Salta se la riga successiva è un'altra etichetta */
          const isLabel = Object.values(labels).flat().includes(nextLower);
          if (!isLabel && nextLine.length > 0) {
            result[field] = nextLine;
            break;
          }
        }
      }
    }
  }

  /* Fallback: cerca pattern "Etichetta: Valore" sulla stessa riga */
  if (!result.nome || !result.email) {
    const patterns = {
      nome:     /(?:nome|name|nominativo)\s*[:\-]\s*(.+)/i,
      email:    /(?:e-?mail)\s*[:\-]\s*(.+)/i,
      telefono: /(?:telefono|tel|cellulare|phone)\s*[:\-]\s*(.+)/i,
      messaggio:/ (?:messaggio|message|richiesta|note)\s*[:\-]\s*(.+)/i
    };
    for (const [field, regex] of Object.entries(patterns)) {
      if (!result[field]) {
        const m = text.match(regex);
        if (m) result[field] = m[1].trim().slice(0, 200);
      }
    }
  }

  /* Fallback telefono: cerca numero nel testo */
  if (!result.telefono) {
    const m = text.match(/(\+?\d[\d\s\-\.]{7,14}\d)/);
    if (m) result.telefono = m[1].replace(/\s+/g,'').trim();
  }

  /* Fallback email: cerca indirizzo email nel testo */
  if (!result.email) {
    const m = text.match(/[\w.\-+]+@[\w.\-]+\.\w{2,}/);
    if (m) result.email = m[0];
  }

  /* Unisci Nome + Cognome in un unico campo */
  if (result.cognome) {
    result.nome = (result.nome + ' ' + result.cognome).trim();
  }

  return result;
}

/* ── Estrai header da lista ───────────────────────────────────────── */
function getHeader(headers, name) {
  if (!headers) return '';
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

/* ── Estrai numero di telefono dal testo ──────────────────────────── */
function extractPhone(text) {
  const m = text.match(/(\+?\d[\d\s\-\.]{7,14}\d)/);
  return m ? m[1].replace(/\s+/g, '').trim() : '';
}

/* ── Estrai testo tra due etichette ───────────────────────────────── */
function extractBetween(text, start, end) {
  const idx = text.indexOf(start);
  if (idx === -1) return '';
  const after = text.slice(idx + start.length);
  const endIdx = after.indexOf(end);
  return endIdx === -1 ? after.trim().slice(0, 80) : after.slice(0, endIdx).trim();
}

/* ══════════════════════════════════════════════════════════════════
   HANDLER PRINCIPALE
   ══════════════════════════════════════════════════════════════════ */
export default {
  async fetch(request, env) {

    /* ── CORS ───────────────────────────────────────────────────── */
    const corsHeaders = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    /* ── Leggi body richiesta ───────────────────────────────────── */
    let body = {};
    try { body = await request.json(); } catch(e) {}

    const {
      domain_filter,
      subject_filter,
      only_site,
      last_uid: lastHistoryId,
      test_only
    } = body;

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    try {
      /* ── Ottieni Access Token ──────────────────────────────────── */
      const accessToken = await getAccessToken(env);

      /* ── Test connessione: solo verifica token ────────────────── */
      if (test_only) {
        const profileResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        if (!profileResp.ok) throw new Error('Gmail API non raggiungibile');
        const profile = await profileResp.json();
        return json({ ok: true, message: 'Connessione Gmail OK — ' + profile.emailAddress });
      }

      /* ── Costruisci query di ricerca Gmail ────────────────────── */
      let query = 'is:unread';
      if (only_site && domain_filter) {
        query += ' from:' + domain_filter;
      }
      if (only_site && subject_filter) {
        const keywords = subject_filter.split(',').map(k => k.trim()).filter(Boolean);
        if (keywords.length === 1) {
          query += ' subject:' + keywords[0];
        } else if (keywords.length > 1) {
          query += ' subject:(' + keywords.join(' OR ') + ')';
        }
      }

      /* ── Lista messaggi ───────────────────────────────────────── */
      const listUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=' +
        encodeURIComponent(query);

      const listResp = await fetch(listUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
      });
      const listData = await listResp.json();
      const messages = listData.messages || [];

      if (messages.length === 0) {
        return json({ ok: true, mails: [], last_uid: lastHistoryId || 0 });
      }

      /* ── Scarica dettaglio ogni mail ──────────────────────────── */
      const mails = [];
      let newLastId = lastHistoryId || 0;

      for (const msg of messages) {
        /* Salta se già processato (id numerico confrontato come stringa) */
        if (lastHistoryId && msg.id <= lastHistoryId) continue;

        const detailResp = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msg.id + '?format=full',
          { headers: { 'Authorization': 'Bearer ' + accessToken } }
        );
        const detail = await detailResp.json();
        if (!detail || !detail.payload) continue;

        const headers   = detail.payload.headers || [];
        const from      = getHeader(headers, 'From');
        const subject   = getHeader(headers, 'Subject');
        const date      = getHeader(headers, 'Date');
        const rawHtml   = extractRawHtml(detail.payload);
        const bodyText  = extractBody(detail.payload).slice(0, 3000);

        /* ── Estrai campi form dal corpo della mail ────────────────── */
        const form = parseFormMail(rawHtml, bodyText);

        /* ── Filtro dominio sul corpo ──────────────────────────────── */
        if (only_site && domain_filter) {
          const bodyLower = bodyText.toLowerCase();
          const fromLower = from.toLowerCase();
          const domainLower = domain_filter.toLowerCase();
          if (!fromLower.includes(domainLower) && !bodyLower.includes(domainLower)) continue;
        }

        mails.push({
          uid:            msg.id,
          date:           date ? new Date(date).toISOString() : new Date().toISOString(),
          from_name:      form.nome      || from,
          from_email:     form.email     || '',
          reply_to:       form.email     || from,
          subject:        subject,
          body_text:      form.messaggio || bodyText.slice(0, 500),
          phone:          form.telefono  || '',
          property_id:    extractBetween(bodyText, 'Immobile:', '\n'),
          property_title: extractBetween(bodyText, 'Annuncio:', '\n')
        });

        if (msg.id > newLastId) newLastId = msg.id;
      }

      return json({ ok: true, mails, last_uid: newLastId, count: mails.length });

    } catch (err) {
      return json({ ok: false, error: err.message || String(err) });
    }
  }
};
