/**
 * Cloudflare Worker "social-meta" — [11 ott 2026] Piano Social, Tappa 2
 * ─────────────────────────────────────────────────────────────────────────
 * Pubblica su Instagram e sulla Pagina Facebook le immagini di un post del
 * Piano Social (carosello o grafica di un immobile) ALL'ORA SCRITTA, solo se
 * Enzo ha premuto "Approva" nell'Hub.
 *
 * Come lavora:
 *  - "Approva" nell'Hub manda le immagini JPEG (POST /immagine): finiscono nella
 *    cartella R2 privata, sotto un nome casuale. Il Worker le fa vedere a Meta
 *    da GET /img/<nome> (Instagram vuole scaricare la foto da un indirizzo
 *    internet): la cartella resta privata, niente indirizzo r2.dev.
 *  - Poi l'Hub manda il lavoro (POST /approva): social, ora, testo, immagini.
 *    Il lavoro si salva nella stessa cartella (lavori/<idea>__<social>.json).
 *  - La SVEGLIA del Worker (Cron, ogni 5 minuti) guarda i lavori: quando è
 *    l'ora pubblica, e scrive nel lavoro com'è andata.
 *  - L'Hub, quando lo apri, chiede GET /esiti e segna da sé "pubblicato" o
 *    l'errore. Niente regole Firestore da cambiare.
 *  - La chiave della Pagina NON passa in chat né nell'Hub: si ottiene con
 *    /collega (accesso con Facebook) e il Worker la tiene nella cartella R2
 *    privata (config/meta.json).
 *
 * Da impostare su Cloudflare (Worker → Settings):
 *   Bindings → R2 bucket:  nome variabile  IMG   →  bucket  social-enzo
 *   Variables and Secrets (Secret):
 *     CHIAVE      parola d'ordine inventata da Enzo (l'Hub la manda a ogni richiesta)
 *     APP_ID      ID dell'app Meta
 *     APP_SECRET  chiave segreta dell'app Meta (Impostazioni → Di base)
 *   Triggers → Cron Triggers:  *​/5 * * * *   (ogni 5 minuti)
 *
 * Indirizzi:
 *   GET  /collega?chiave=…   accesso con Facebook: sceglie la Pagina e il suo Instagram
 *   GET  /ritorno            Facebook torna qui
 *   GET  /img/<nome>         l'immagine (pubblica, nome casuale: serve a Meta)
 *   GET  /stato              Pagina e Instagram collegati (prova)
 *   POST /immagine           corpo = JPEG → { nome }
 *   POST /approva            { idea, p:'ig'|'fb', quando (ISO), testo, img:[nomi], titolo }
 *   POST /sposta             { idea, p, quando }
 *   POST /togli              { idea, p }
 *   GET  /esiti              tutti i lavori con il loro stato
 *
 * [21 ott 2026] REEL (Instagram e Pagina Facebook)
 *   POST /video              corpo = MP4/MOV (massimo 95 MB) → { nome }
 *   GET  /vid/<nome>         il video (pubblico, nome casuale: serve a Meta)
 *   POST /approva            { idea, p, quando, testo, tipo:'reel', video:nome, copertina:secondi }
 *   Meta prepara i video con calma: la pubblicazione va in DUE TEMPI.
 *   Alla sveglia dell'ora giusta si consegna il video (stato "preparazione");
 *   alle sveglie dopo si controlla se Meta ha finito e si pubblica.
 *   Instagram: anche nella griglia del profilo (share_to_feed), copertina al
 *   secondo scelto (thumb_offset). Facebook: Reel della Pagina; la copertina
 *   la sceglie Facebook.
 *   Nessun permesso nuovo: bastano quelli già dati con /collega.
 *
 * [21 ott 2026] TIKTOK (con Metricool, tramite Claude)
 *   POST /approva            { idea, p:'tt', quando, testo, img:[nomi] | tipo:'reel', video:nome }
 *   Il Worker NON pubblica su TikTok: tiene solo i file (link pubblici /img/ e
 *   /vid/) e il lavoro. Ogni lunedì Claude legge i TikTok approvati dal
 *   connettore del gestionale e li programma su Metricool, che si copia i file
 *   e pubblica all'ora scritta. Niente Facebook richiesto per TikTok.
 *   La sveglia salta i lavori TikTok; la pulizia li toglie 3 giorni dopo l'ora
 *   di uscita (con i loro file).
 *
 * [25 ott 2026] ANCHE INSTAGRAM E FACEBOOK CON METRICOOL (stesso trattamento di TikTok)
 *   Il Worker NON pubblica più in diretta su Instagram e Facebook: come per
 *   TikTok, tiene solo i file (link pubblici /img/ e /vid/) e il lavoro
 *   approvato. Ogni lunedì Claude legge gli Instagram/Facebook approvati dal
 *   connettore del gestionale (strumento meta_approvati) e li programma su
 *   Metricool, che si copia i file e pubblica all'ora scritta.
 *   La sveglia salta anche questi lavori; la pulizia li toglie 3 giorni dopo
 *   l'ora di uscita, come per TikTok. Le funzioni di pubblicazione diretta
 *   (pubblicaIG/pubblicaFB/avviaReelIG/avviaReelFB) restano nel file ma non
 *   sono più richiamate da nessuna piattaforma: il Worker è solo "magazzino".
 */
const VERSIONE_WORKER = '2026-10-25-meta-metricool';

const VER_BASE = 'v23.0';
const SCOPE = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management';
const MAX_IMG = 8 * 1024 * 1024;     // Instagram accetta JPEG fino a 8 MB
const MAX_TENTATIVI = 3;
/* Cloudflare non accetta richieste oltre 100 MB: tengo un margine */
const MAX_VIDEO = 95 * 1024 * 1024;
/* oltre questo tempo, un video che Meta sta ancora preparando diventa errore */
const PREP_MAX_MS = 60 * 60000;

function ver(env) { return String(env.GRAPH_VER || VER_BASE); }
function graph(env, perc) { return 'https://graph.facebook.com/' + ver(env) + '/' + perc; }
function cors(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Chiave',
    'Access-Control-Max-Age': '86400'
  }, extra || {});
}
function json(obj, stato) { return new Response(JSON.stringify(obj), { status: stato || 200, headers: cors({ 'Content-Type': 'application/json; charset=utf-8' }) }); }
function errore(msg, stato, codice) { return json({ ok: false, errore: msg, codice: codice || '' }, stato || 400); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function pagina(titolo, corpo) {
  return new Response('<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(titolo) + '</title>' +
    '<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#0F172A;line-height:1.5}h1{font-size:1.3rem}' +
    'button,.b{background:#EA580C;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block;margin:4px 0}' +
    'textarea{width:100%;height:90px;font-family:monospace;font-size:.85rem;padding:8px;border:1px solid #CBD5E1;border-radius:8px}.ko{color:#B91C1C}.ok{color:#15803D}' +
    'li{margin:6px 0}</style></head><body>' + corpo + '</body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
function chiaveOk(env, data) {
  const a = String(env.CHIAVE || ''), b = String(data || '');
  if (!a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cartella(env) {
  if (!env.IMG) { const e = new Error('manca la cartella R2: Settings → Bindings → R2 bucket, nome variabile IMG, bucket social-enzo'); e.codice = 'r2'; throw e; }
  return env.IMG;
}
function casuale() { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
/* [21 ott 2026] il social di un lavoro: Instagram, Facebook o TikTok */
function soc(p) { return p === 'fb' ? 'fb' : (p === 'tt' ? 'tt' : 'ig'); }
function nomeLavoro(idea, p) { return 'lavori/' + String(idea).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) + '__' + p + '.json'; }
async function leggiJson(env, nome) { const o = await cartella(env).get(nome); if (!o) return null; try { return JSON.parse(await o.text()); } catch (e) { return null; } }
async function scriviJson(env, nome, dato) { await cartella(env).put(nome, JSON.stringify(dato), { httpMetadata: { contentType: 'application/json' } }); }

/* ── la Pagina collegata ── */
async function config(env) {
  const c = await leggiJson(env, 'config/meta.json');
  if (!c || !c.token || !c.pageId) { const e = new Error('Facebook non è ancora collegato: apri /collega?chiave=… e fai l\'accesso'); e.codice = 'collega'; throw e; }
  return c;
}

/* errore di Meta in parole semplici */
function erroreMeta(d, stato) {
  const er = (d && d.error) || {};
  const cod = er.code, sub = er.error_subcode;
  let m = '';
  if (cod === 190) m = 'il collegamento con Facebook è scaduto o è stato tolto: rifai /collega';
  else if (cod === 10 || cod === 200 || cod === 3) m = 'manca un permesso dell\'app Meta (' + (er.message || 'permesso') + '): rifai /collega e accetta tutto';
  else if (cod === 4 || cod === 17 || cod === 32 || cod === 613) m = 'Meta chiede di rallentare: riprovo più tardi';
  else if (cod === 9004 || sub === 2207052) m = 'Instagram non è riuscito a scaricare l\'immagine';
  else if (cod === 36003 || sub === 2207009) m = 'Instagram non accetta il formato dell\'immagine (serve tra 4:5 e 1,91:1)';
  else if (sub === 2207042) m = 'Instagram: raggiunto il limite di pubblicazioni di oggi';
  else if (cod === 100) m = 'Meta non accetta un dato: ' + (er.error_user_msg || er.message || '');
  const e = new Error(m || ('Meta ha risposto ' + (stato || '') + (er.message ? ': ' + er.message : '')));
  e.codice = String(cod || stato || ''); e.stato = stato;
  e.riprova = (cod === 4 || cod === 17 || cod === 32 || cod === 613 || cod === 2 || cod === 1 || (stato >= 500));
  return e;
}
async function chiamaMeta(env, metodo, perc, param) {
  const opz = { method: metodo };
  let url = graph(env, perc);
  if (metodo === 'GET' || metodo === 'DELETE') url += (url.indexOf('?') < 0 ? '?' : '&') + new URLSearchParams(param || {}).toString();
  else { opz.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }; opz.body = new URLSearchParams(param || {}); }
  let r;
  try { r = await fetch(url, opz); } catch (e) { const er = new Error('Meta non risponde'); er.riprova = true; throw er; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw erroreMeta(d, r.status);
  return d;
}

/* ── collegamento con Facebook (una volta) ── */
function collega(url, env) {
  if (!chiaveOk(env, url.searchParams.get('chiave'))) return pagina('Chiave sbagliata', '<h1 class="ko">Chiave sbagliata</h1><p>Apri l\'indirizzo così: <code>/collega?chiave=LA_TUA_CHIAVE</code> (la stessa del Secret CHIAVE).</p>');
  if (!env.APP_ID || !env.APP_SECRET) return pagina('Mancano i dati dell\'app', '<h1 class="ko">Mancano APP_ID o APP_SECRET</h1><p>Aggiungili come Secret del Worker e riprova.</p>');
  const q = new URLSearchParams({ client_id: env.APP_ID, redirect_uri: url.origin + '/ritorno', response_type: 'code', scope: SCOPE, state: String(url.searchParams.get('chiave')) });
  return Response.redirect('https://www.facebook.com/' + ver(env) + '/dialog/oauth?' + q.toString(), 302);
}
async function ritorno(url, env) {
  const ch = url.searchParams.get('state');
  if (!chiaveOk(env, ch)) return pagina('Non valido', '<h1 class="ko">Richiesta non valida</h1><p>Riparti da /collega?chiave=…</p>');
  if (url.searchParams.get('error')) return pagina('Annullato', '<h1 class="ko">Collegamento annullato</h1><p>Facebook dice: ' + esc(url.searchParams.get('error_description') || url.searchParams.get('error')) + '</p>');
  try {
    const breve = await chiamaMeta(env, 'GET', 'oauth/access_token', { client_id: env.APP_ID, client_secret: env.APP_SECRET, redirect_uri: url.origin + '/ritorno', code: url.searchParams.get('code') || '' });
    const lungo = await chiamaMeta(env, 'GET', 'oauth/access_token', { grant_type: 'fb_exchange_token', client_id: env.APP_ID, client_secret: env.APP_SECRET, fb_exchange_token: breve.access_token });
    const pag = await chiamaMeta(env, 'GET', 'me/accounts', { access_token: lungo.access_token, fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '50' });
    const elenco = (pag.data || []).filter(p => p && p.access_token);
    if (!elenco.length) return pagina('Nessuna Pagina', '<h1 class="ko">Nessuna Pagina trovata</h1><p>Durante l\'accesso spunta la Pagina dell\'agenzia e il suo account Instagram, poi riprova da /collega.</p>');
    /* la scelta della Pagina resta per 15 minuti in un foglio temporaneo */
    const id = casuale();
    await scriviJson(env, 'config/scelta-' + id + '.json', { scade: Date.now() + 15 * 60000, pagine: elenco });
    const righe = elenco.map(p => '<li><b>' + esc(p.name) + '</b>' +
      (p.instagram_business_account ? ' · Instagram <b>@' + esc(p.instagram_business_account.username || p.instagram_business_account.id) + '</b>' : ' · <span class="ko">nessun Instagram collegato</span>') +
      '<br><a class="b" href="/scegli?s=' + id + '&p=' + encodeURIComponent(p.id) + '&chiave=' + encodeURIComponent(ch) + '">Usa questa Pagina</a></li>').join('');
    return pagina('Scegli la Pagina', '<h1>Scegli la Pagina dell\'agenzia</h1><ul>' + righe + '</ul>');
  } catch (e) {
    return pagina('Errore', '<h1 class="ko">Collegamento non riuscito</h1><p>' + esc(e.message) + '</p><p>Riprova da /collega.</p>');
  }
}
async function scegli(url, env) {
  if (!chiaveOk(env, url.searchParams.get('chiave'))) return pagina('Non valido', '<h1 class="ko">Richiesta non valida</h1>');
  const nome = 'config/scelta-' + String(url.searchParams.get('s') || '').replace(/[^a-f0-9]/g, '') + '.json';
  const s = await leggiJson(env, nome);
  await cartella(env).delete(nome).catch(() => {});
  if (!s || s.scade < Date.now()) return pagina('Scaduto', '<h1 class="ko">Tempo scaduto</h1><p>Riparti da /collega.</p>');
  const p = (s.pagine || []).find(x => x.id === url.searchParams.get('p'));
  if (!p) return pagina('Errore', '<h1 class="ko">Pagina non trovata</h1>');
  const ig = p.instagram_business_account || null;
  await scriviJson(env, 'config/meta.json', { pageId: p.id, pageName: p.name, token: p.access_token, igId: ig ? ig.id : '', igUser: ig ? (ig.username || '') : '', collegato: new Date().toISOString() });
  return pagina('Collegato', '<h1 class="ok">Collegato</h1><p>Pagina <b>' + esc(p.name) + '</b>' + (ig ? ' e Instagram <b>@' + esc(ig.username || ig.id) + '</b>' : '') + '.</p>' +
    (ig ? '' : '<p class="ko">Questa Pagina non ha un account Instagram professionale collegato: per ora pubblicherò solo su Facebook.</p>') +
    '<p>La chiave della Pagina è al sicuro nella cartella privata del Worker. Torna nell\'Hub: Piano Social → Orari e automatico → <b>Prova il collegamento</b>.</p>');
}

/* ── immagini ── */
async function riceviImmagine(request, env) {
  const tipo = String(request.headers.get('Content-Type') || '');
  if (!/^image\/jpe?g$/i.test(tipo)) return errore('serve un\'immagine JPEG');
  const len = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (len > MAX_IMG) return errore('immagine troppo pesante (massimo 8 MB)', 413);
  /* leggo tutto (al massimo 8 MB): non mi fido solo della lunghezza dichiarata */
  const dati = await request.arrayBuffer();
  if (!dati.byteLength) return errore('immagine vuota');
  if (dati.byteLength > MAX_IMG) return errore('immagine troppo pesante (massimo 8 MB)', 413);
  const inizio = new Uint8Array(dati, 0, 3);
  if (inizio[0] !== 0xFF || inizio[1] !== 0xD8 || inizio[2] !== 0xFF) return errore('il file non è un JPEG');
  const nome = 'img/' + casuale() + '.jpg';
  await cartella(env).put(nome, dati, { httpMetadata: { contentType: 'image/jpeg' } });
  return json({ ok: true, nome: nome.slice(4) });
}
async function mostraImmagine(nome, env) {
  const n = String(nome || '').replace(/[^a-z0-9.]/g, '');
  if (!/^[a-f0-9]{32}\.jpg$/.test(n)) return new Response('non trovata', { status: 404 });
  const o = await cartella(env).get('img/' + n);
  if (!o) return new Response('non trovata', { status: 404 });
  return new Response(o.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
}

/* ── video dei Reel ── */
function nomeVideoOk(n) { return /^[a-f0-9]{32}\.(mp4|mov)$/.test(String(n || '')); }
async function riceviVideo(request, env) {
  const tipo = String(request.headers.get('Content-Type') || '').toLowerCase();
  const est = /^video\/mp4$/.test(tipo) ? 'mp4' : (/^video\/quicktime$/.test(tipo) ? 'mov' : '');
  if (!est) return errore('serve un video MP4 o MOV');
  const len = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (!len) return errore('video vuoto o senza lunghezza');
  if (len > MAX_VIDEO) return errore('video troppo pesante (massimo 95 MB): esportalo più leggero', 413);
  const nome = 'vid/' + casuale() + '.' + est;
  /* il video passa diretto nella cartella, senza tenerlo tutto in memoria */
  await cartella(env).put(nome, request.body, { httpMetadata: { contentType: tipo } });
  /* controllo che sia davvero un MP4/MOV: dal 5° byte c'è la scritta "ftyp" (o "moov"/"wide" nei MOV vecchi) */
  const testa = await cartella(env).get(nome, { range: { offset: 0, length: 12 } });
  const b = testa ? new Uint8Array(await testa.arrayBuffer()) : new Uint8Array(0);
  const etichetta = String.fromCharCode.apply(null, Array.from(b.slice(4, 8)));
  if (['ftyp', 'moov', 'wide', 'mdat', 'free'].indexOf(etichetta) < 0) {
    await cartella(env).delete(nome).catch(() => {});
    return errore('il file non è un video MP4 o MOV');
  }
  return json({ ok: true, nome: nome.slice(4) });
}
/* Meta può chiedere il video a pezzi (Range): lo servo pezzo per pezzo */
async function mostraVideo(nome, request, env) {
  const n = String(nome || '').replace(/[^a-z0-9.]/g, '');
  if (!nomeVideoOk(n)) return new Response('non trovato', { status: 404 });
  const R = cartella(env), key = 'vid/' + n;
  const tipo = n.slice(-4) === '.mov' ? 'video/quicktime' : 'video/mp4';
  const rg = String(request.headers.get('Range') || '');
  const m = rg.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const info = await R.head(key);
    if (!info) return new Response('non trovato', { status: 404 });
    const tot = info.size;
    let da, a;
    if (m[1] === '') { const coda = parseInt(m[2], 10); da = Math.max(0, tot - coda); a = tot - 1; }
    else { da = parseInt(m[1], 10); a = m[2] === '' ? tot - 1 : Math.min(parseInt(m[2], 10), tot - 1); }
    if (isNaN(da) || isNaN(a) || da > a || da >= tot) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + tot } });
    const o = await R.get(key, { range: { offset: da, length: a - da + 1 } });
    if (!o) return new Response('non trovato', { status: 404 });
    return new Response(o.body, { status: 206, headers: { 'Content-Type': tipo, 'Content-Length': String(a - da + 1), 'Content-Range': 'bytes ' + da + '-' + a + '/' + tot, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' } });
  }
  const o = await R.get(key);
  if (!o) return new Response('non trovato', { status: 404 });
  return new Response(o.body, { headers: { 'Content-Type': tipo, 'Content-Length': String(o.size), 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' } });
}
async function togliVideo(env, nome) { if (nomeVideoOk(nome)) { try { await cartella(env).delete('vid/' + nome); } catch (e) {} } }

/* ── lavori ── */
function controllaQuando(q) {
  const t = new Date(q || '').getTime();
  if (isNaN(t)) return 'manca l\'ora di uscita';
  if (t < Date.now() + 4 * 60000) return 'l\'ora di uscita deve essere almeno fra 5 minuti';
  return '';
}
async function approva(request, env) {
  const b = await request.json().catch(() => ({}));
  /* [28 ott 2026] 'st' = Storia Instagram: solo tenuta con un link pubblico per
     Metricool (autoPublish false, l'adesivo lo mette Enzo nell'app), mai
     pubblicata in diretta da questo Worker — vedi il filtro in sveglia() e
     pulizia() più sotto. */
  const p = b.p === 'ig' || b.p === 'fb' || b.p === 'tt' || b.p === 'st' ? b.p : '';
  if (!b.idea || !p) return errore('mancano il post o il social');
  const pb = controllaQuando(b.quando); if (pb) return errore(pb);
  /* [21 ott 2026] Reel: un video al posto delle immagini */
  const reel = b.tipo === 'reel';
  const video = reel ? String(b.video || '').replace(/[^a-z0-9.]/g, '') : '';
  if (reel && !nomeVideoOk(video)) return errore('manca il video del Reel');
  if (reel && !(await cartella(env).head('vid/' + video))) return errore('il video non è arrivato: riprova "Approva"');
  const img = (Array.isArray(b.img) ? b.img : []).map(n => String(n).replace(/[^a-z0-9.]/g, '')).filter(n => /^[a-f0-9]{32}\.jpg$/.test(n));
  if (!reel && !img.length) return errore('mancano le immagini');
  if (img.length > 10) return errore('massimo 10 immagini');
  const testo = String(b.testo || '').slice(0, (p === 'ig' || p === 'tt' || p === 'st') ? 2200 : 60000);
  if (p === 'ig' && (testo.match(/#[^\s#]+/g) || []).length > 30) return errore('Instagram accetta al massimo 30 hashtag');
  /* [21 ott 2026] TikTok non passa da Meta: non serve la Pagina collegata.
     [28 ott 2026] Storia: serve comunque l'Instagram professionale collegato
     (è lì che Enzo la pubblica a mano), ma non pubblica nulla questo Worker. */
  if (p !== 'tt') {
    const c = await config(env);
    if ((p === 'ig' || p === 'st') && !c.igId) return errore('la Pagina collegata non ha un Instagram professionale');
  }
  const nome = nomeLavoro(b.idea, p);
  const vecchio = await leggiJson(env, nome);
  if (vecchio && vecchio.stato === 'pubblicato') return errore('già pubblicato', 409, 'pubblicato');
  if (vecchio && (vecchio.stato === 'in corso' || vecchio.stato === 'preparazione')) return errore('lo sto pubblicando proprio adesso', 409, 'incorso');
  if (vecchio && Array.isArray(vecchio.img)) await togliImmagini(env, vecchio.img.filter(n => img.indexOf(n) < 0));
  if (vecchio && vecchio.video && vecchio.video !== video) await togliVideo(env, vecchio.video);
  const lavoro = { idea: String(b.idea), p, quando: new Date(b.quando).toISOString(), testo, img, titolo: String(b.titolo || '').slice(0, 120), stato: 'attesa', tentativi: 0, approvato: new Date().toISOString() };
  if (reel) {
    lavoro.tipo = 'reel'; lavoro.video = video;
    const sec = Number(b.copertina);
    if (isFinite(sec) && sec > 0) lavoro.copertina = Math.min(Math.round(sec * 10) / 10, 900);
  }
  await scriviJson(env, nome, lavoro);
  return json({ ok: true, lavoro });
}
async function sposta(request, env) {
  const b = await request.json().catch(() => ({}));
  const nome = nomeLavoro(b.idea || '', soc(b.p));
  const l = await leggiJson(env, nome); if (!l) return errore('questo post non è approvato', 404, 'manca');
  if (l.stato === 'pubblicato' || l.stato === 'in corso' || l.stato === 'preparazione') return errore('è già uscito o sta uscendo', 409, l.stato === 'preparazione' ? 'in corso' : l.stato);
  const pb = controllaQuando(b.quando); if (pb) return errore(pb);
  l.quando = new Date(b.quando).toISOString(); l.stato = 'attesa'; l.tentativi = 0; delete l.errore;
  await scriviJson(env, nome, l);
  return json({ ok: true, lavoro: l });
}
async function togliImmagini(env, nomi) { for (const n of (nomi || [])) { try { await cartella(env).delete('img/' + n); } catch (e) {} } }
async function togli(request, env) {
  const b = await request.json().catch(() => ({}));
  const nome = nomeLavoro(b.idea || '', soc(b.p));
  const l = await leggiJson(env, nome);
  if (!l) return json({ ok: true, giaTolto: true });
  if (l.stato === 'pubblicato') return errore('è già pubblicato: per toglierlo cancellalo da ' + (l.p === 'ig' ? 'Instagram' : 'Facebook'), 409, 'pubblicato');
  if (l.stato === 'in corso' || l.stato === 'preparazione') return errore('lo sto pubblicando proprio adesso', 409, 'incorso');
  await togliImmagini(env, l.img);
  if (l.video) await togliVideo(env, l.video);
  await cartella(env).delete(nome);
  return json({ ok: true });
}
async function esiti(env) {
  const out = []; let cur;
  do {
    const r = await cartella(env).list({ prefix: 'lavori/', cursor: cur, limit: 500 });
    for (const o of r.objects) { const l = await leggiJson(env, o.key); if (l) out.push({ idea: l.idea, p: l.p, tipo: l.tipo || '', quando: l.quando, stato: l.stato, link: l.link || '', errore: l.errore || '', pubblicato: l.pubblicato || '' }); }
    cur = r.truncated ? r.cursor : null;
  } while (cur);
  return json({ ok: true, lavori: out, versione: VERSIONE_WORKER });
}
async function stato(env) {
  const c = await config(env);
  const pg = await chiamaMeta(env, 'GET', c.pageId, { fields: 'name', access_token: c.token });
  let ig = null;
  if (c.igId) ig = await chiamaMeta(env, 'GET', c.igId, { fields: 'username', access_token: c.token });
  return json({ ok: true, pagina: pg.name || c.pageName, instagram: ig ? (ig.username || c.igUser) : '', r2: true, versione: VERSIONE_WORKER });
}

/* ── pubblicazione ── */
function attesa(ms) { return new Promise(r => setTimeout(r, ms)); }
async function contenitorePronto(env, c, id) {
  for (let i = 0; i < 12; i++) {
    const s = await chiamaMeta(env, 'GET', id, { fields: 'status_code', access_token: c.token });
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Instagram non ha accettato l\'immagine (' + s.status_code + ')');
    await attesa(2500);
  }
  const e = new Error('Instagram è lento a preparare il post'); e.riprova = true; throw e;
}
async function pubblicaIG(env, c, l, base) {
  const urls = l.img.map(n => base + '/img/' + n);
  let creazione;
  if (urls.length === 1) {
    creazione = (await chiamaMeta(env, 'POST', c.igId + '/media', { image_url: urls[0], caption: l.testo, access_token: c.token })).id;
  } else {
    const figli = [];
    for (const u of urls) figli.push((await chiamaMeta(env, 'POST', c.igId + '/media', { image_url: u, is_carousel_item: 'true', access_token: c.token })).id);
    for (const f of figli) await contenitorePronto(env, c, f);
    creazione = (await chiamaMeta(env, 'POST', c.igId + '/media', { media_type: 'CAROUSEL', children: figli.join(','), caption: l.testo, access_token: c.token })).id;
  }
  await contenitorePronto(env, c, creazione);
  const pub = await chiamaMeta(env, 'POST', c.igId + '/media_publish', { creation_id: creazione, access_token: c.token });
  let link = '';
  try { link = (await chiamaMeta(env, 'GET', pub.id, { fields: 'permalink', access_token: c.token })).permalink || ''; } catch (e) {}
  return { id: pub.id, link };
}
async function pubblicaFB(env, c, l, base) {
  const urls = l.img.map(n => base + '/img/' + n);
  if (urls.length === 1) {
    const r = await chiamaMeta(env, 'POST', c.pageId + '/photos', { url: urls[0], message: l.testo, published: 'true', access_token: c.token });
    const id = r.post_id || r.id;
    return { id, link: 'https://www.facebook.com/' + id };
  }
  const foto = [];
  for (const u of urls) foto.push((await chiamaMeta(env, 'POST', c.pageId + '/photos', { url: u, published: 'false', access_token: c.token })).id);
  const param = { message: l.testo, access_token: c.token };
  foto.forEach((id, i) => { param['attached_media[' + i + ']'] = JSON.stringify({ media_fbid: id }); });
  const r = await chiamaMeta(env, 'POST', c.pageId + '/feed', param);
  return { id: r.id, link: 'https://www.facebook.com/' + r.id };
}
/* ── Reel, primo tempo: consegna del video a Meta ── */
async function avviaReelIG(env, c, l, base) {
  const param = { media_type: 'REELS', video_url: base + '/vid/' + l.video, caption: l.testo, share_to_feed: 'true', access_token: c.token };
  if (l.copertina) param.thumb_offset = String(Math.round(l.copertina * 1000));
  return (await chiamaMeta(env, 'POST', c.igId + '/media', param)).id;
}
async function avviaReelFB(env, c, l, base) {
  const st = await chiamaMeta(env, 'POST', c.pageId + '/video_reels', { upload_phase: 'start', access_token: c.token });
  if (!st.video_id) throw new Error('Facebook non ha aperto il caricamento del Reel');
  /* Facebook scarica il video dal nostro indirizzo (file_url) */
  const dove = st.upload_url || ('https://rupload.facebook.com/video-upload/' + ver(env) + '/' + st.video_id);
  let r;
  try { r = await fetch(dove, { method: 'POST', headers: { 'Authorization': 'OAuth ' + c.token, 'file_url': base + '/vid/' + l.video } }); }
  catch (e) { const er = new Error('Facebook non risponde al caricamento del video'); er.riprova = true; throw er; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error || d.success === false) throw erroreMeta(d, r.status);
  await chiamaMeta(env, 'POST', c.pageId + '/video_reels', { upload_phase: 'finish', video_id: st.video_id, video_state: 'PUBLISHED', description: l.testo, access_token: c.token });
  return st.video_id;
}
/* ── Reel, secondo tempo: Meta ha finito di preparare? ── */
async function reelPronto(env, c, l) {
  if (l.p === 'ig') {
    const s = await chiamaMeta(env, 'GET', l.contenitore, { fields: 'status_code,status', access_token: c.token });
    if (s.status_code === 'FINISHED') return true;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
      const det = String(s.status || '');
      const e = new Error('Instagram non ha accettato il video' + (/2207026/.test(det) ? ': formato non adatto (serve MP4 H.264, verticale 9:16, da 3 secondi a 15 minuti)' : (det ? ' (' + det + ')' : '')));
      e.riprova = false; throw e;
    }
    return false;
  }
  const s = await chiamaMeta(env, 'GET', l.contenitore, { fields: 'status', access_token: c.token });
  const st = s.status || {};
  const fasi = [st.uploading_phase, st.processing_phase, st.publishing_phase].filter(Boolean);
  const rotta = fasi.find(f => f.status === 'error');
  if (st.video_status === 'error' || rotta) {
    const det = (rotta && rotta.errors && rotta.errors[0] && rotta.errors[0].message) || '';
    const e = new Error('Facebook non ha accettato il video' + (det ? ' (' + det + ')' : '')); e.riprova = false; throw e;
  }
  return !!(st.publishing_phase && st.publishing_phase.status === 'complete');
}
/* Instagram pubblica solo quando glielo dico; Facebook ha già pubblicato da sé */
async function chiudiReel(env, c, l) {
  if (l.p === 'ig') {
    const pub = await chiamaMeta(env, 'POST', c.igId + '/media_publish', { creation_id: l.contenitore, access_token: c.token });
    let link = '';
    try { link = (await chiamaMeta(env, 'GET', pub.id, { fields: 'permalink', access_token: c.token })).permalink || ''; } catch (e) {}
    return { id: pub.id, link };
  }
  return { id: l.contenitore, link: 'https://www.facebook.com/reel/' + l.contenitore };
}

/* pulizia, una volta al giorno: lavori usciti o tolti da più di 30 giorni e immagini che
   nessun lavoro usa più (dopo 2 giorni: quelle di un "Approva" non andato a buon fine) */
async function pulizia(env) {
  const R = cartella(env), ora = Date.now();
  const ultima = await R.get('config/pulizia.txt');
  if (ultima && ora - Number(await ultima.text()) < 24 * 3600000) return;
  await R.put('config/pulizia.txt', String(ora));
  const usate = new Set(); let cur;
  do {
    const r = await R.list({ prefix: 'lavori/', cursor: cur, limit: 500 });
    for (const o of r.objects) {
      const l = await leggiJson(env, o.key); if (!l) continue;
      /* [21 ott 2026] TikTok: Metricool si copia i file quando Claude lo programma;
         3 giorni dopo l'ora di uscita il lavoro e i suoi file non servono più;
         [25 ott 2026] anche Instagram e Facebook, stesso trattamento: qui lo
         stato resta sempre "attesa" (il Worker non pubblica più), quindi senza
         questo ramo il lavoro e le sue immagini non verrebbero mai tolti;
         [28 ott 2026] anche le Storie ('st'), stesso motivo */
      if (l.p === 'tt' || l.p === 'ig' || l.p === 'fb' || l.p === 'st') {
        if (ora - new Date(l.quando).getTime() > 3 * 86400000) { await R.delete(o.key); continue; }
        (l.img || []).forEach(n => usate.add(n)); if (l.video) usate.add(l.video);
        continue;
      }
      const vecchio =(l.stato === 'pubblicato' || l.stato === 'errore') && ora - new Date(l.pubblicato || l.quando).getTime() > 30 * 86400000;
      if (vecchio) { await R.delete(o.key); continue; }
      if (l.stato !== 'pubblicato' || ora - new Date(l.pubblicato).getTime() < 7 * 86400000) { (l.img || []).forEach(n => usate.add(n)); if (l.video) usate.add(l.video); }
    }
    cur = r.truncated ? r.cursor : null;
  } while (cur);
  /* immagini (img/) e video dei Reel (vid/): stessa regola */
  for (const pref of ['img/', 'vid/']) {
    cur = null;
    do {
      const r = await R.list({ prefix: pref, cursor: cur, limit: 500 });
      for (const o of r.objects) {
        const n = o.key.slice(4), t = o.uploaded ? new Date(o.uploaded).getTime() : 0;
        if (!usate.has(n) && t && ora - t > 2 * 86400000) await R.delete(o.key);
      }
      cur = r.truncated ? r.cursor : null;
    } while (cur);
  }
}

async function sveglia(env) {
  const base = String(env.INDIRIZZO || '').replace(/\/+$/, '');
  if (!base) { console.log('[sveglia] manca INDIRIZZO: apri una volta /stato dall\'Hub'); return; }
  let c; try { c = await config(env); } catch (e) { console.log('[sveglia] ' + e.message); return; }
  const ora = Date.now(); let cur;
  do {
    const r = await cartella(env).list({ prefix: 'lavori/', cursor: cur, limit: 500 });
    for (const o of r.objects) {
      const l = await leggiJson(env, o.key);
      if (!l) continue;
      /* [21 ott 2026] TikTok lo pubblica Metricool (programmato da Claude): qui niente;
         [25 ott 2026] anche Instagram e Facebook, stesso trattamento;
         [28 ott 2026] anche le Storie ('st'): Metricool le manda al telefono di
         Enzo (autoPublish false), MAI in automatico da questo Worker — una
         storia non ha l'adesivo (sondaggio/domanda/quiz) che va messo a mano,
         quindi non deve mai finire nel ramo pubblicaIG/pubblicaFB qui sotto. */
      if (l.p === 'tt' || l.p === 'ig' || l.p === 'fb' || l.p === 'st') continue;
      /* rimasto "in corso" da più di 15 minuti: la sveglia si è interrotta a metà. Non ripubblico
         (potrebbe essere già uscito): lo segnalo, e si controlla a mano */
      if (l.stato === 'in corso' && new Date(l.inCorsoDa || 0).getTime() < ora - 15 * 60000) {
        l.stato = 'errore'; l.errore = 'pubblicazione interrotta a metà: controlla su ' + (l.p === 'ig' ? 'Instagram' : 'Facebook') + ' se è uscito, poi segnalo a mano';
        await scriviJson(env, o.key, l); continue;
      }
      /* [21 ott 2026] Reel consegnato: Meta ha finito di prepararlo? */
      if (l.stato === 'preparazione') {
        if (new Date(l.prepDa || 0).getTime() < ora - PREP_MAX_MS) {
          l.stato = 'errore'; l.errore = 'Meta non ha finito di preparare il video in un\'ora: controlla su ' + (l.p === 'ig' ? 'Instagram' : 'Facebook') + ' se è uscito';
          await scriviJson(env, o.key, l); continue;
        }
        let pronto = false;
        try { pronto = await reelPronto(env, c, l); }
        catch (e) {
          if (e && e.riprova) continue;   /* Meta lento o occupato: riprovo alla prossima sveglia */
          l.stato = 'errore'; l.errore = (e && e.message) || String(e); await scriviJson(env, o.key, l); continue;
        }
        if (!pronto) continue;
        l.stato = 'in corso'; l.inCorsoDa = new Date().toISOString(); await scriviJson(env, o.key, l);
        try {
          const esito = await chiudiReel(env, c, l);
          l.stato = 'pubblicato'; l.pubblicato = new Date().toISOString(); l.postId = esito.id; l.link = esito.link; delete l.errore;
        } catch (e) {
          l.errore = (e && e.message) || String(e);
          l.stato = (e && e.riprova) ? 'preparazione' : 'errore';
        }
        await scriviJson(env, o.key, l); continue;
      }
      if (l.stato !== 'attesa' || new Date(l.quando).getTime() > ora) continue;
      /* segno "in corso" PRIMA di chiamare Meta: così due sveglie non pubblicano due volte */
      l.stato = 'in corso'; l.inCorsoDa = new Date().toISOString(); l.tentativi = (l.tentativi || 0) + 1; await scriviJson(env, o.key, l);
      try {
        if (l.tipo === 'reel') {
          /* primo tempo: consegno il video, la pubblicazione arriva alle sveglie dopo */
          l.contenitore = l.p === 'ig' ? await avviaReelIG(env, c, l, base) : await avviaReelFB(env, c, l, base);
          l.stato = 'preparazione'; l.prepDa = new Date().toISOString(); delete l.errore;
          await scriviJson(env, o.key, l); continue;
        }
        const esito = l.p === 'ig' ? await pubblicaIG(env, c, l, base) : await pubblicaFB(env, c, l, base);
        l.stato = 'pubblicato'; l.pubblicato = new Date().toISOString(); l.postId = esito.id; l.link = esito.link; delete l.errore;
      } catch (e) {
        l.errore = (e && e.message) || String(e);
        l.stato = (e && e.riprova && l.tentativi < MAX_TENTATIVI) ? 'attesa' : 'errore';
        if (l.stato === 'attesa') l.quando = new Date(Date.now() + 10 * 60000).toISOString();
      }
      await scriviJson(env, o.key, l);
    }
    cur = r.truncated ? r.cursor : null;
  } while (cur);
  try { await pulizia(env); } catch (e) { console.log('[pulizia] ' + ((e && e.message) || e)); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    try {
      if (request.method === 'GET' && url.pathname.indexOf('/img/') === 0) return await mostraImmagine(url.pathname.slice(5), env);
      if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.indexOf('/vid/') === 0) return await mostraVideo(url.pathname.slice(5), request, env);
      if (request.method === 'GET' && url.pathname === '/collega') return collega(url, env);
      if (request.method === 'GET' && url.pathname === '/ritorno') return await ritorno(url, env);
      if (request.method === 'GET' && url.pathname === '/scegli') return await scegli(url, env);
      if (!chiaveOk(env, request.headers.get('X-Chiave'))) return errore('chiave sbagliata o mancante', 401, 'chiave');
      /* l'indirizzo pubblico del Worker serve alla sveglia per dare a Meta le immagini */
      if (!env.INDIRIZZO) { try { await cartella(env).put('config/indirizzo.txt', url.origin); } catch (e) {} }
      if (request.method === 'GET' && url.pathname === '/stato') return await stato(env);
      if (request.method === 'GET' && url.pathname === '/esiti') return await esiti(env);
      if (request.method === 'POST' && url.pathname === '/immagine') return await riceviImmagine(request, env);
      if (request.method === 'POST' && url.pathname === '/video') return await riceviVideo(request, env);
      if (request.method === 'POST' && url.pathname === '/approva') return await approva(request, env);
      if (request.method === 'POST' && url.pathname === '/sposta') return await sposta(request, env);
      if (request.method === 'POST' && url.pathname === '/togli') return await togli(request, env);
      return errore('indirizzo sconosciuto', 404);
    } catch (e) {
      return errore((e && e.message) || String(e), e && e.stato === 401 ? 401 : 502, e && e.codice);
    }
  },
  async scheduled(evento, env, ctx) {
    /* l'indirizzo pubblico: dal Secret INDIRIZZO se c'è, altrimenti quello ricordato */
    if (!env.INDIRIZZO && env.IMG) {
      try { const o = await env.IMG.get('config/indirizzo.txt'); if (o) env = Object.assign({}, env, { INDIRIZZO: (await o.text()).trim() }); } catch (e) {}
    }
    ctx.waitUntil(sveglia(env));
  }
};
