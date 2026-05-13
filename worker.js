/**
 * Cloudflare Worker: fetchSiteEmails
 * ────────────────────────────────────
 * Usa Gmail API + OAuth2 per leggere le mail
 * e restituirle al gestionale immobiliare.
 *
 * Progetto: AgenzioImmobiliare
 */

const CLIENT_ID     = '622292782379-etg1b0t913ajsks8sbsg1d4tdrg1qcs9.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Sh_cRzYKRpJCgYIARAAGAQSNwF-L9Ir1AZ8BjCnSeSLwQFnxALDJYx7ylGm6bnd3MfVhARttlVwihFws5AXIlmafl-i3rNR49Y';

/* ── Ottieni Access Token fresco da Refresh Token ─────────────────── */
async function getAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
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

/* ── Estrai testo dal payload Gmail ───────────────────────────────── */
function extractBody(payload) {
  if (!payload) return '';

  /* Corpo diretto */
  if (payload.body && payload.body.data) {
    return decodeBase64url(payload.body.data);
  }

  /* Parti multipart — cerca text/plain prima, poi text/html */
  if (payload.parts && payload.parts.length) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        const html = decodeBase64url(part.body.data);
        /* Rimuovi tag HTML basilare */
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      /* Ricorsivo per multipart annidati */
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return '';
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
  async fetch(request) {

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
      const accessToken = await getAccessToken();

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
        const replyTo   = getHeader(headers, 'Reply-To') || from;
        const bodyText  = extractBody(detail.payload).slice(0, 1500);

        /* Parsing nome e email dal campo From */
        const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) || ['', '', from];
        const fromName  = fromMatch[1].trim().replace(/^"|"$/g, '');
        const fromEmail = fromMatch[2] ? fromMatch[2].trim() : from.trim();

        /* Filtro aggiuntivo sul corpo (domain_filter) */
        if (only_site && domain_filter) {
          const bodyLower = bodyText.toLowerCase();
          const fromLower = from.toLowerCase();
          const domainLower = domain_filter.toLowerCase();
          if (!fromLower.includes(domainLower) && !bodyLower.includes(domainLower)) {
            continue;
          }
        }

        mails.push({
          uid:            msg.id,
          date:           date ? new Date(date).toISOString() : new Date().toISOString(),
          from_name:      fromName,
          from_email:     fromEmail,
          reply_to:       replyTo,
          subject:        subject,
          body_text:      bodyText,
          phone:          extractPhone(bodyText),
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
