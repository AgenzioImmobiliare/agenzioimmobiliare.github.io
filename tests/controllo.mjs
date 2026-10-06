/* ══════════════════════════════════════════════════════════════════════
   CONTROLLO AUTOMATICO DEL SITO (5 ottobre 2026)
   ----------------------------------------------------------------------
   Cosa fa, in ordine:
   1) controlla la sintassi di ogni blocco <script> delle pagine e di ogni
      file .js (stesso controllo di "node --check");
   2) apre il gestionale in Chromium con un utente finto e dati finti,
      e visita TUTTE le voci del menù laterale (anche quelle nuove: l'elenco
      lo legge dal menù, non è scritto qui);
   3) apre il Marketing Hub e tutte le sue sezioni;
   4) apre le pagine pubbliche (valuta-casa, linkinbio).
   Ogni errore JavaScript (pageerror) fa fallire il controllo.
   Nessuna richiesta esce verso internet: Firebase e i servizi esterni sono
   bloccati, quindi nessun dato vero viene letto o scritto.

   Uso in locale:  node tests/controllo.mjs
   (variabili: CHROMIUM=percorso del browser, FOTO=cartella per le foto)
   Su GitHub parte da solo a ogni caricamento: .github/workflows/controllo.yml
   ══════════════════════════════════════════════════════════════════════ */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = 8765;
const BASE = 'http://localhost:' + PORTA;
const FOTO = process.env.FOTO || '';
if (FOTO) fs.mkdirSync(FOTO, { recursive: true });
const problemi = [];
const avvisi = [];

/* ── 1) SINTASSI ─────────────────────────────────────────────────────── */
function controllaSintassi() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrl-'));
  const pagine = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  let n = 0;
  for (const f of pagine) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
    let m, i = 0;
    while ((m = re.exec(h))) {
      const attr = m[1] || '';
      if (/\ssrc=/.test(attr)) continue;
      if (/type=["']?(application\/ld\+json|text\/template|text\/plain)/i.test(attr)) continue;
      i++; n++;
      const mod = /type=["']?module/i.test(attr);
      const p = path.join(tmp, f.replace(/\W/g, '_') + '_' + i + (mod ? '.mjs' : '.js'));
      fs.writeFileSync(p, m[2]);
      try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); }
      catch (e) {
        const riga = h.slice(0, m.index).split('\n').length;
        problemi.push(`SINTASSI ${f} blocco ${i} (inizia alla riga ${riga}): ` +
          String(e.stderr).split('\n').filter(Boolean).slice(0, 4).join(' | '));
      }
    }
  }
  const js = [];
  (function giro(dir) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.') || d.name === 'node_modules' || d.name === 'tests') continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) giro(p);
      else if (d.name.endsWith('.js') && d.name !== 'worker.js') js.push(p);
    }
  })(ROOT);
  for (const p of js) {
    n++;
    /* i moduli ES (src/modules) vanno controllati come moduli */
    const src = fs.readFileSync(p, 'utf8');
    const comeModulo = /^\s*(import|export)\s/m.test(src);
    const q = path.join(tmp, 'f_' + path.relative(ROOT, p).replace(/\W/g, '_') + (comeModulo ? '.mjs' : '.js'));
    fs.writeFileSync(q, src);
    try { execFileSync(process.execPath, ['--check', q], { stdio: 'pipe' }); }
    catch (e) {
      problemi.push(`SINTASSI ${path.relative(ROOT, p)}: ` +
        String(e.stderr).split('\n').filter(Boolean).slice(0, 4).join(' | '));
    }
  }
  console.log(`Sintassi: controllati ${n} blocchi e file`);
}

/* ── server locale ───────────────────────────────────────────────────── */
const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
function avviaServer() {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
      fs.readFile(f, (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'content-type': TIPI[path.extname(f)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(PORTA, () => res(s));
  });
}

/* errori che dipendono solo dall'essere offline: non sono difetti */
const RUMORE = [/Failed to load resource/i, /firebase is not defined/i, /ERR_FAILED/i,
  /net::/i, /Init Firebase fallito/i, /fonts\.g/i];
function eRumore(t) { return RUMORE.some(r => r.test(t)); }

function sorveglia(pagina, dove) {
  pagina.on('pageerror', e => {
    if (eRumore(e.message)) return;
    problemi.push(`ERRORE JS [${dove()}] ${e.message.split('\n')[0]}`);
  });
  pagina.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (eRumore(t)) return;
    avvisi.push(`console [${dove()}] ${t.split('\n')[0].slice(0, 220)}`);
  });
  /* le finestrelle si chiudono da sole; "vuoi lasciare la pagina?" si accetta, altrimenti la ricarica si blocca */
  pagina.on('dialog', d => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
}

/* dati finti, giusto per far disegnare liste e schede */
function datiFinti() {
  const oggi = new Date().toISOString().slice(0, 10);
  return {
    clienti: [
      { uuid: 'c1', id: 'c1', nome: 'MARIO ROSSI', tel: '3330000001', tipo: 'acquirente', stato: 'attivo', data: oggi },
      { uuid: 'c2', id: 'c2', nome: 'ANNA BIANCHI', tel: '3330000002', tipo: 'venditore', stato: 'attivo', data: oggi }
    ],
    immobili: [
      { uuid: 'i1', id: 'i1', ref: '0001', titolo: 'Appartamento prova', comune: 'Agropoli', prezzo: 150000,
        mq: 90, locali: 3, stato: 'attivo', contatto: 'ANNA BIANCHI', clienteUuid: 'c2', data: oggi }
    ],
    visite: [
      { id: 'v1', data: oggi, ora: '10:00', cliente: 'MARIO ROSSI', cliUuid: 'c1', immRef: '0001',
        immUuid: 'i1', esito: 'IN ATTESA' }
    ]
  };
}

async function main() {
  controllaSintassi();
  const server = await avviaServer();
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  let qui = 'avvio';
  const dove = () => qui;

  /* ── 2) GESTIONALE ─────────────────────────────────────────────────── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1660, height: 1000 } });
    await ctx.route(u => !u.href.startsWith(BASE), r => r.abort());
    const pg = await ctx.newPage();
    sorveglia(pg, dove);
    const fin = datiFinti();
    /* carica la pagina ed entra con l'utente finto; gli errori del login sono difetti veri */
    async function entra() {
      qui = 'gestionale: caricamento';
      try { await pg.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }); }
      catch (e) { await pg.waitForTimeout(1000); await pg.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }); }
      await pg.waitForTimeout(2500);
      qui = 'gestionale: login';
      const errLogin = await pg.evaluate(fin => {
        const err = [];
        /* si entra come agente (così initApp carica davvero l'app: per l'admin
           aprirebbe solo il pannello di amministrazione) e poi si promuove
           l'utente ad admin, perché la guardia di go() lasci aprire tutto */
        try { _entraNelGestionale({ id: 'u1', ruolo: 'agente', nome: 'Prova', email: 'prova@esempio.it' }); } catch (e) { err.push('login: ' + e.message); }
        try { _currentUser.ruolo = 'admin'; _currentUser.role = 'admin'; } catch (e) {}
        try { for (const k of Object.keys(fin)) { if (Array.isArray(D[k]) && !D[k].length) D[k] = fin[k]; } } catch (e) {}
        /* offline Firebase non risponde e la schermata di login torna su: la nascondo */
        const st = document.createElement('style');
        st.textContent = '#login-screen,#admin-panel,#fb-auth-avviso{display:none!important}';
        document.head.appendChild(st);
        return err;
      }, fin);
      errLogin.forEach(e => problemi.push('ERRORE JS [gestionale: login] ' + e));
      await pg.waitForTimeout(2500);
    }
    await entra();

    /* le voci del menù laterale, lette dalla pagina */
    const voci = await pg.evaluate(() => {
      const out = [];
      document.querySelectorAll('#app-sidebar [onclick]').forEach(el => {
        const c = el.getAttribute('onclick') || '';
        const m = c.match(/sbGo\('([^']+)'\)|go\('([^']+)'\)|(apri\w+|aprI\w+|open\w+)\(\)/);
        if (!m) return;
        const nome = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        if (m[1] || m[2]) out.push({ tipo: 'sez', id: m[1] || m[2], nome });
        else out.push({ tipo: 'fn', id: m[3], nome });
      });
      const visti = new Set();
      return out.filter(v => !visti.has(v.tipo + v.id) && visti.add(v.tipo + v.id));
    });
    /* aprIMarketingHub apre un'altra finestra: l'Hub si prova a parte */
    const DA_SALTARE = new Set(['aprIMarketingHub', 'openModuliWindow']);
    let provate = 0;
    /* prima le sezioni normali, poi le finestre a tutta pagina (una per volta,
       ricaricando, così non si coprono a vicenda nelle foto) */
    const ordinate = voci.filter(v => v.tipo === 'sez').concat(voci.filter(v => v.tipo === 'fn'));
    let primaFn = true;
    for (const v of ordinate) {
      if (DA_SALTARE.has(v.id)) continue;
      if (v.tipo === 'fn') { if (!primaFn) await entra(); primaFn = false; }
      qui = `gestionale: ${v.nome || v.id}`;
      await pg.evaluate(v => {
        if (!_currentUser) _currentUser = { id: 'u1', user: 'prova@esempio.it', ruolo: 'admin', role: 'admin', nome: 'Prova' };
        if (v.tipo === 'sez') {
          if (typeof window.sbGo === 'function') window.sbGo(v.id); else go(v.id);
        } else if (typeof window[v.id] === 'function') {
          window[v.id]();
        } else {
          throw new Error('Funzione del menù inesistente: ' + v.id);
        }
      }, v).catch(e => problemi.push(`ERRORE JS [${qui}] ${e.message.split('\n')[0]}`));
      await pg.waitForTimeout(800);
      if (v.tipo === 'sez') {
        const aperta = await pg.evaluate(id => { const el = document.getElementById('sec-' + id); return !!(el && el.classList.contains('active')); }, v.id);
        if (!aperta) problemi.push(`SEZIONE NON APERTA [${qui}] go('${v.id}') non ha mostrato #sec-${v.id}`);
      }
      if (FOTO) await pg.screenshot({ path: path.join(FOTO, 'g_' + v.id.replace(/\W/g, '_') + '.png') }).catch(() => {});
      provate++;
    }
    console.log(`Gestionale: provate ${provate} voci del menù`);
    if (provate < 20) problemi.push(`Gestionale: trovate solo ${provate} voci nel menù — il login finto non è andato a buon fine?`);
    await ctx.close();
  }

  /* ── 3) MARKETING HUB ──────────────────────────────────────────────── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1660, height: 1000 } });
    await ctx.route(u => !u.href.startsWith(BASE), r => r.abort());
    const pg = await ctx.newPage();
    sorveglia(pg, dove);
    qui = 'hub: caricamento';
    await pg.goto(BASE + '/indexplus.html', { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(2500);
    const sezioni = await pg.evaluate(() => {
      window._mktAuthOk = () => true;
      const s = new Set();
      document.querySelectorAll('[onclick]').forEach(el => {
        const m = (el.getAttribute('onclick') || '').match(/switchSection\('([^']+)'\)/);
        if (m) s.add(m[1]);
      });
      return [...s];
    });
    for (const s of sezioni) {
      qui = 'hub: ' + s;
      await pg.evaluate(s => switchSection(s), s).catch(e => problemi.push(`ERRORE JS [${qui}] ${e.message.split('\n')[0]}`));
      await pg.waitForTimeout(500);
      if (FOTO) await pg.screenshot({ path: path.join(FOTO, 'h_' + s + '.png') }).catch(() => {});
    }
    console.log(`Hub: provate ${sezioni.length} sezioni`);
    if (sezioni.length < 10) problemi.push(`Hub: trovate solo ${sezioni.length} sezioni`);
    await ctx.close();
  }

  /* ── 4) PAGINE PUBBLICHE ───────────────────────────────────────────── */
  for (const [pagina, w] of [['valuta-casa.html', 390], ['valuta-casa.html', 1660], ['linkinbio.html', 390]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    await ctx.route(u => !u.href.startsWith(BASE), r => r.abort());
    const pg = await ctx.newPage();
    qui = `${pagina} (${w}px)`;
    sorveglia(pg, dove);
    await pg.goto(BASE + '/' + pagina + '?nostat=1', { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1500);
    if (FOTO) await pg.screenshot({ path: path.join(FOTO, 'p_' + pagina + '_' + w + '.png'), fullPage: true }).catch(() => {});
    await ctx.close();
  }

  await browser.close();
  server.close();

  /* ── esito ─────────────────────────────────────────────────────────── */
  if (avvisi.length) {
    console.log(`\nAvvisi in console (non bloccanti): ${avvisi.length}`);
    [...new Set(avvisi)].slice(0, 30).forEach(a => console.log('  · ' + a));
  }
  if (problemi.length) {
    console.log(`\nPROBLEMI: ${problemi.length}`);
    [...new Set(problemi)].forEach(p => console.log('  ✗ ' + p));
    process.exit(1);
  }
  console.log('\nTutto a posto: nessun errore.');
}

main().catch(e => { console.error('Il controllo stesso si è fermato:', e); process.exit(2); });
