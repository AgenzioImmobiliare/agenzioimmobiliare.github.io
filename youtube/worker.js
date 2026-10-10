/**
 * Cloudflare Worker "youtube-shorts" — [10 ott 2026] Piano Social, Tappa 3
 * ─────────────────────────────────────────────────────────────────────────
 * Carica su YouTube il video di un'idea del Piano Social come PROGRAMMATO:
 * il video resta privato fino all'ora scelta (status.publishAt), poi YouTube
 * lo pubblica da solo. Niente R2, niente orologio: l'Hub manda il file quando
 * Enzo preme "Approva e carica".
 *
 * Secret da impostare (Worker → Settings → Variables and Secrets, Encrypt):
 *   CLIENT_ID      ID client OAuth del progetto Google (tipo "Applicazione web")
 *   CLIENT_SECRET  il suo segreto
 *   CHIAVE         una parola d'ordine inventata da Enzo: l'Hub la manda a ogni
 *                  richiesta, senza questa il Worker non fa niente
 *   REFRESH_TOKEN  si ottiene aprendo  https://<indirizzo del worker>/collega?chiave=<CHIAVE>
 *
 * Indirizzi:
 *   GET  /collega?chiave=…  porta al consenso di Google (account del canale)
 *   GET  /ritorno           Google torna qui: mostra il REFRESH_TOKEN da copiare
 *   GET  /stato             nome del canale collegato (prova del collegamento)
 *   POST /carica            corpo = il file video; intestazione X-Meta con
 *                           titolo, descrizione e publishAt (JSON in encodeURIComponent)
 *   POST /sposta            {id, publishAt}: cambia l'ora di uscita
 *   POST /togli             {id}: cancella il video da YouTube
 */

const SCOPE = 'https://www.googleapis.com/auth/youtube';
const MAX_BYTE = 99 * 1024 * 1024;   // i Worker accettano corpi fino a 100 MB

function cors(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Chiave, X-Meta',
    'Access-Control-Max-Age': '86400'
  }, extra || {});
}
function json(obj, stato) {
  return new Response(JSON.stringify(obj), { status: stato || 200, headers: cors({ 'Content-Type': 'application/json; charset=utf-8' }) });
}
function errore(msg, stato, codice) { return json({ ok: false, errore: msg, codice: codice || '' }, stato || 400); }
function pagina(titolo, corpo) {
  return new Response('<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + titolo + '</title>' +
    '<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#0F172A;line-height:1.5}h1{font-size:1.3rem}' +
    'textarea{width:100%;height:110px;font-family:monospace;font-size:.85rem;padding:8px;border:1px solid #CBD5E1;border-radius:8px}' +
    'button{background:#EA580C;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer}.ko{color:#B91C1C}</style></head><body>' +
    corpo + '</body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* confronto della chiave a tempo costante */
function chiaveOk(env, data) {
  const a = String(env.CHIAVE || ''), b = String(data || '');
  if (!a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function accessToken(env) {
  if (!env.CLIENT_ID || !env.CLIENT_SECRET) throw new Error('mancano CLIENT_ID o CLIENT_SECRET nei Secret del Worker');
  if (!env.REFRESH_TOKEN) throw new Error('manca REFRESH_TOKEN: apri /collega e segui le istruzioni');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, refresh_token: env.REFRESH_TOKEN, grant_type: 'refresh_token' })
  });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) {
    const e = new Error(d.error === 'invalid_grant'
      ? 'il collegamento con YouTube è scaduto o è stato revocato: rifai /collega (e controlla che la schermata di consenso sia "In produzione")'
      : 'Google non ha dato il permesso: ' + (d.error_description || d.error || r.status));
    e.codice = 'token'; throw e;
  }
  return d.access_token;
}

/* errore di YouTube in parole semplici */
async function erroreYT(r) {
  const d = await r.json().catch(() => ({}));
  const er = (d && d.error) || {};
  const motivo = (er.errors && er.errors[0] && er.errors[0].reason) || er.status || '';
  const m = {
    quotaExceeded: 'quota giornaliera di YouTube finita: riprova domani',
    uploadLimitExceeded: 'il canale ha raggiunto il limite di caricamenti di oggi',
    youtubeSignupRequired: 'questo account Google non ha ancora un canale YouTube',
    invalidPublishAt: 'l\'ora di uscita non è valida: deve essere nel futuro',
    invalidTitle: 'il titolo non è valido (massimo 100 caratteri, niente < >)',
    invalidDescription: 'la descrizione non è valida (niente < >)',
    forbidden: 'YouTube non permette questa operazione su questo video',
    videoNotFound: 'il video non c\'è più su YouTube'
  }[motivo];
  const e = new Error(m || ('YouTube ha risposto ' + r.status + (er.message ? ': ' + er.message : '')));
  e.codice = motivo || String(r.status); e.stato = r.status;
  return e;
}

function statoVideo(publishAt) {
  return { privacyStatus: 'private', publishAt: publishAt, selfDeclaredMadeForKids: false };
}

async function carica(request, env) {
  let meta = {};
  try { meta = JSON.parse(decodeURIComponent(request.headers.get('X-Meta') || '')); } catch (e) { return errore('dati del video mancanti'); }
  const titolo = String(meta.titolo || '').replace(/[<>]/g, '').trim().slice(0, 100);
  const descr = String(meta.descrizione || '').replace(/[<>]/g, '').trim().slice(0, 4900);
  const quando = new Date(meta.publishAt || '');
  if (!titolo) return errore('manca il titolo');
  if (isNaN(quando.getTime()) || quando.getTime() < Date.now() + 5 * 60000) return errore('l\'ora di uscita deve essere almeno fra 5 minuti', 400, 'invalidPublishAt');
  const len = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (!len || !request.body) return errore('il file video è vuoto');
  if (len > MAX_BYTE) return errore('il video pesa più di 99 MB: esportalo più leggero', 413, 'pesante');
  const tipo = request.headers.get('Content-Type') || 'video/mp4';

  const tok = await accessToken(env);
  const avvio = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + tok,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(len),
      'X-Upload-Content-Type': tipo
    },
    body: JSON.stringify({
      snippet: { title: titolo, description: descr, categoryId: String(meta.categoria || '22'), defaultLanguage: 'it', defaultAudioLanguage: 'it' },
      status: statoVideo(quando.toISOString())
    })
  });
  if (!avvio.ok) throw await erroreYT(avvio);
  const dove = avvio.headers.get('Location');
  if (!dove) throw new Error('YouTube non ha aperto il caricamento');

  /* il file passa dritto dall'Hub a YouTube, senza essere tenuto in memoria */
  const { readable, writable } = new FixedLengthStream(len);
  request.body.pipeTo(writable).catch(() => {});
  const su = await fetch(dove, { method: 'PUT', headers: { 'Content-Type': tipo }, body: readable });
  if (!su.ok) throw await erroreYT(su);
  const v = await su.json();
  return json({ ok: true, id: v.id, publishAt: (v.status && v.status.publishAt) || quando.toISOString(), privacy: v.status && v.status.privacyStatus });
}

async function sposta(request, env) {
  const b = await request.json().catch(() => ({}));
  const quando = new Date(b.publishAt || '');
  if (!b.id) return errore('manca il video');
  if (isNaN(quando.getTime()) || quando.getTime() < Date.now() + 5 * 60000) return errore('l\'ora di uscita deve essere almeno fra 5 minuti', 400, 'invalidPublishAt');
  const tok = await accessToken(env);
  const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ id: String(b.id), status: statoVideo(quando.toISOString()) })
  });
  if (!r.ok) throw await erroreYT(r);
  const v = await r.json();
  return json({ ok: true, id: v.id, publishAt: (v.status && v.status.publishAt) || quando.toISOString() });
}

async function togli(request, env) {
  const b = await request.json().catch(() => ({}));
  if (!b.id) return errore('manca il video');
  const tok = await accessToken(env);
  const r = await fetch('https://www.googleapis.com/youtube/v3/videos?id=' + encodeURIComponent(String(b.id)), {
    method: 'DELETE', headers: { 'Authorization': 'Bearer ' + tok }
  });
  if (r.status === 404) return json({ ok: true, giaTolto: true });
  if (!r.ok) throw await erroreYT(r);
  return json({ ok: true });
}

async function stato(env) {
  const tok = await accessToken(env);
  const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { 'Authorization': 'Bearer ' + tok } });
  if (!r.ok) throw await erroreYT(r);
  const d = await r.json();
  const c = d.items && d.items[0];
  if (!c) return errore('questo account Google non ha un canale YouTube', 400, 'youtubeSignupRequired');
  return json({ ok: true, canale: c.snippet.title, id: c.id });
}

function collega(url, env) {
  if (!chiaveOk(env, url.searchParams.get('chiave'))) return pagina('Chiave sbagliata', '<h1 class="ko">Chiave sbagliata</h1><p>Apri l\'indirizzo così: <code>/collega?chiave=LA_TUA_CHIAVE</code> (la stessa scritta nel Secret CHIAVE).</p>');
  if (!env.CLIENT_ID) return pagina('Manca CLIENT_ID', '<h1 class="ko">Manca CLIENT_ID</h1><p>Aggiungi prima i Secret CLIENT_ID e CLIENT_SECRET del progetto Google.</p>');
  const q = new URLSearchParams({
    client_id: env.CLIENT_ID, redirect_uri: url.origin + '/ritorno', response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    state: String(url.searchParams.get('chiave'))
  });
  return Response.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString(), 302);
}

async function ritorno(url, env) {
  if (!chiaveOk(env, url.searchParams.get('state'))) return pagina('Non valido', '<h1 class="ko">Richiesta non valida</h1><p>Riparti da /collega?chiave=…</p>');
  if (url.searchParams.get('error')) return pagina('Annullato', '<h1 class="ko">Collegamento annullato</h1><p>Google dice: ' + esc(url.searchParams.get('error')) + '</p>');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, redirect_uri: url.origin + '/ritorno', grant_type: 'authorization_code' })
  });
  const d = await r.json().catch(() => ({}));
  if (!d.refresh_token) return pagina('Errore', '<h1 class="ko">Google non ha dato il codice</h1><p>' + esc(d.error_description || d.error || 'risposta senza refresh_token') + '</p><p>Riprova da /collega.</p>');
  return pagina('YouTube collegato', '<h1>YouTube collegato</h1>' +
    '<p>Copia il codice qui sotto e incollalo nel Worker <b>youtube-shorts</b>: Settings → Variables and Secrets → <b>REFRESH_TOKEN</b> (tipo Secret) → Deploy.</p>' +
    '<textarea id="t" readonly>' + esc(d.refresh_token) + '</textarea><p><button onclick="navigator.clipboard.writeText(document.getElementById(\'t\').value);this.textContent=\'Copiato\'">Copia</button></p>' +
    '<p>Poi torna nell\'Hub, Piano Social → Orari e automatico → <b>Prova il collegamento</b>. Chiudi questa pagina: il codice non va mostrato a nessuno.</p>');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    try {
      if (request.method === 'GET' && url.pathname === '/collega') return collega(url, env);
      if (request.method === 'GET' && url.pathname === '/ritorno') return await ritorno(url, env);
      if (!chiaveOk(env, request.headers.get('X-Chiave'))) return errore('chiave sbagliata o mancante', 401, 'chiave');
      if (request.method === 'GET' && url.pathname === '/stato') return await stato(env);
      if (request.method === 'POST' && url.pathname === '/carica') return await carica(request, env);
      if (request.method === 'POST' && url.pathname === '/sposta') return await sposta(request, env);
      if (request.method === 'POST' && url.pathname === '/togli') return await togli(request, env);
      return errore('indirizzo sconosciuto', 404);
    } catch (e) {
      return errore((e && e.message) || String(e), e && e.stato === 401 ? 401 : 502, e && e.codice);
    }
  }
};
