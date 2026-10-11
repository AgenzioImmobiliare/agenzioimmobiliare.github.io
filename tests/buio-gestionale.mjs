/* ════════════════════════════════════════════════════════════════════════
   BUIO DEL GESTIONALE — generatore                           [11 ott 2026]
   Uso, dalla cartella del sito (come tests/controllo.mjs):
     CHROMIUM=percorso-del-browser node tests/buio-gestionale.mjs
   (serve Playwright: ln -sf <cartella node_modules> tests/node_modules)

   Stesso metodo dell'Hub (tests/buio-hub.py), ma gli stili li legge dal
   BROWSER: il gestionale ne aggiunge tanti da codice (moduli, sezioni rifatte)
   e solo aprendo le pagine esistono tutti. Il programma:
     1. apre il gestionale in chiaro con dati finti, al computer e al telefono,
        e passa da tutte le voci del menù e dalle schermate del telefono;
     2. legge TUTTE le regole di stile caricate (document.styleSheets);
     3. RICOPIA tutte le regole che danno un colore, nello stesso ordine e con
        la STESSA forza (prefisso :where(.dark-mode), che non aggiunge forza),
        cambiando i colori che al buio non si leggerebbero: bianchi →
        var(--hb-card), grigi chiari → var(--hb-sub), tinte chiare → stessa
        tinta trasparente, testi scuri → --text/--text2/--text3 o tinta
        schiarita, bordi chiari → var(--hb-bordo), fondi var(--navy) →
        var(--hb-pieno). Copiando anche le regole che non cambiano, fra le copie
        vale lo stesso ordine dell'originale: un pulsante arancione resta
        arancione anche se la sua classe base diventa scura;
     4. fa lo stesso con i colori scritti dentro style="…" in index.html e nei
        moduli (src/modules), comprese le stringhe del codice;
     5. riscrive SOLO il blocco <style id="buio-gen">. Un piccolo script lo tiene
        sempre in fondo alla pagina, dopo tutti gli stili (anche quelli che il
        gestionale aggiunge mentre lo usi), così le copie battono le originali;
        le regole scure scritte a mano (body.dark-mode …) hanno più forza e
        vincono comunque.
   Non toccati: regole già scure (dark-mode), mappe (leaflet), stampa,
   anteprime di stampa (EXCL qui sotto).
   ════════════════════════════════════════════════════════════════════════ */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = 8766, BASE = 'http://localhost:' + PORTA;
const EXCL = '#rep-preview,#rep-anteprima,#si-proposta-preview,[style*="210mm"],[style*="297mm"],.leaflet-container';
const SALTA = /dark-mode|leaflet|hub-buio|::-webkit-scrollbar|:root|@page|\bprint\b|#login-screen|\.lg-|anteprima|preview|foglio|stampa|#admin-panel|^html$|^body$/;

/* ── colori ── */
function parse(v){
  v = String(v || '').trim().toLowerCase();
  if(v === 'white') return [[1,1,1],1];
  if(v === 'black') return [[0,0,0],1];
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if(m){ let h = m[1]; if(h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join(''); if(h.length !== 6 && h.length !== 8) return [null,null];
    return [[0,2,4].map(i => parseInt(h.substr(i,2),16)/255), h.length === 8 ? parseInt(h.substr(6,2),16)/255 : 1]; }
  m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  if(m){ let a = m[4] == null ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4])/100 : parseFloat(m[4])); return [[+m[1]/255, +m[2]/255, +m[3]/255], a]; }
  return [null,null];
}
function lum(c){ const f = x => x <= .03928 ? x/12.92 : Math.pow((x+.055)/1.055, 2.4); return .2126*f(c[0]) + .7152*f(c[1]) + .0722*f(c[2]); }
function hls(c){ const [r,g,b] = c, mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2; let h = 0, s = 0;
  if(mx !== mn){ const d = mx-mn; s = l > .5 ? d/(2-mx-mn) : d/(mx+mn); h = mx === r ? (g-b)/d + (g < b ? 6 : 0) : mx === g ? (b-r)/d + 2 : (r-g)/d + 4; h /= 6; } return [h,l,s]; }
function rgbDa(h,l,s){ if(!s) return [l,l,l]; const q = l < .5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const t = x => { x = (x+1)%1; return x < 1/6 ? p+(q-p)*6*x : x < .5 ? q : x < 2/3 ? p+(q-p)*(2/3-x)*6 : p; }; return [t(h+1/3), t(h), t(h-1/3)]; }
const hex = c => '#' + c.map(x => Math.round(Math.max(0, Math.min(1, x))*255).toString(16).padStart(2,'0')).join('').toUpperCase();
function bgMap(c, a){
  if(a < .5) return null;
  const L = lum(c), [h,l,s] = hls(c);
  if(L < .55) return null;
  if(s < .25 || l > .985) return l > .985 ? 'var(--hb-card)' : 'var(--hb-sub)';
  const [r,g,b] = rgbDa(h, .55, Math.min(1, Math.max(.55, s)));
  return 'rgba(' + Math.round(r*255) + ',' + Math.round(g*255) + ',' + Math.round(b*255) + ',.16)';
}
function fgMap(c){
  const L = lum(c), [h,l,s] = hls(c);
  if(L > .30) return null;
  if(s < .18) return L < .06 ? 'var(--text)' : (L < .16 ? 'var(--text2)' : 'var(--text3)');
  return hex(rgbDa(h, .74, Math.min(.85, Math.max(.5, s))));
}
function bdMap(c){ return lum(c) > .6 ? 'var(--hb-bordo)' : null; }

/* ── 1) le regole lette dal browser → copie scure ── */
const COLRE = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\bwhite\b/gi;
const PROP = /^(background|background-color|background-image|color|border|border-(top|right|bottom|left)|border-color|border-(top|right|bottom|left)-color|outline|outline-color)$/;
function regola(sel, decls){
  if(!sel || SALTA.test(sel)) return null;
  const out = []; let cambiate = 0, fondoFisso = false;
  for(const d of decls){
    if(!/^background/.test(d.p)) continue;
    const v = d.v;
    if(/^(transparent|none|inherit|initial|unset)$/i.test(v)) continue;
    if(/var\(/.test(v)) { if(!/var\(--(?:[a-z0-9-]*pale|bg[0-9]?|hb-card|hb-sub|card|white|surface)[,)]/i.test(v)) fondoFisso = true; continue; }
    const cs = v.match(COLRE); if(!cs) continue;
    const [c, a] = parse(cs[0]); if(c && a > .5 && !bgMap(c, a)) fondoFisso = true;
  }
  for(const d of decls){
    const { p, v } = d, I = d.imp ? '!important' : '';
    if(p === 'background' || p === 'background-color' || p === 'background-image'){
      if(/^var\(--navy[23]?\)$/.test(v)){ out.push('background-color:var(--hb-pieno)' + I); cambiate++; continue; }
      if(/var\(|url\(/.test(v) || !v.match(COLRE)){ out.push(p + ':' + v + I); continue; }
      const cs = v.match(COLRE).map(parse);
      const mp = cs.map(([c, a]) => c ? bgMap(c, a) : null);
      if(/gradient/.test(v)){
        if(mp.every(Boolean)){ out.push('background-image:none' + I, 'background-color:' + mp[0] + I); cambiate++; }
        else out.push(p + ':' + v + I);
      } else if(mp[0] && cs.length === 1){
        out.push((p === 'background-image' ? 'background-color' : p) + ':' + v.replace(COLRE, mp[0]) + I); cambiate++;
      } else out.push(p + ':' + v + I);
    } else if(p === 'color'){
      const [c] = parse(v); const nv = (c && !fondoFisso) ? fgMap(c) : null;
      if(nv){ out.push('color:' + nv + I); cambiate++; } else out.push('color:' + v + I);
    } else {
      /* bordi e contorni: solo il colore */
      const cp = /color$/.test(p) ? p : p + '-color';
      if(/var\(/.test(v)){ if(/color$/.test(p)) out.push(cp + ':' + v + I); continue; }
      const cs = v.match(COLRE); if(!cs) continue;
      const [c] = parse(cs[0]); const nv = c ? bdMap(c) : null;
      if(nv){ out.push(cp + ':' + nv + I); cambiate++; } else out.push(cp + ':' + cs[0] + I);
    }
  }
  if(!out.length) return null;
  /* stessa forza dell'originale: :where() non ne aggiunge */
  const pre = x => {
    if(/^body\b/.test(x)) return 'body:where(.dark-mode)' + x.slice(4);
    if(/^html\s+body\b/.test(x)) return x.replace(/^html\s+body/, 'html body:where(.dark-mode)');
    if(/^html\b/.test(x)) return null;
    return ':where(body.dark-mode) ' + x;
  };
  const parti = sel.split(/,(?![^(]*\))/).map(x => x.trim()).filter(Boolean).map(pre).filter(Boolean);
  if(!parti.length) return null;
  return { t: parti.join(',') + '{' + out.join(';') + '}', c: cambiate > 0 };
}

/* ── server e browser ── */
const TIPI = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const server = await new Promise(res => { const s = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if(p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if(!f.startsWith(ROOT)){ r.writeHead(403); r.end(); return; }
  fs.readFile(f, (e, b) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': TIPI[path.extname(f).toLowerCase()] || 'application/octet-stream' }); r.end(b); });
}).listen(PORTA, () => res(s)); });
const { chromium } = await import('playwright');
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const oggi = new Date().toISOString().slice(0, 10);
const FINTI = {
  clienti: [ { uuid:'c1', id:'c1', nome:'MARIO ROSSI', tel:'3330000001', tipo:'acquirente', stato:'attivo', data:oggi, citta:'Agropoli' },
             { uuid:'c2', id:'c2', nome:'ANNA BIANCHI', tel:'3330000002', tipo:'venditore', stato:'attivo', data:oggi } ],
  immobili: [ { uuid:'i1', id:'i1', ref:'0001', tipo:'Appartamento', titolo:'Appartamento prova', comune:'Agropoli', prezzo:150000, mq:90, locali:3, stato:'attivo', contatto:'ANNA BIANCHI', clienteUuid:'c2', data:oggi } ],
  visite: [ { id:'v1', data:oggi, ora:'10:00', cliente:'MARIO ROSSI', cliUuid:'c1', immRef:'0001', immUuid:'i1', esito:'IN ATTESA' } ]
};
async function entra(mobile){
  const ctx = await browser.newContext(mobile ? { viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true } : { viewport:{ width:1660, height:1000 } });
  await ctx.route(u => !u.href.startsWith(BASE), r => r.abort());
  await ctx.addInitScript(() => { try{ localStorage.setItem('darkMode', '0'); }catch(e){} });
  const pg = await ctx.newPage();
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(BASE + '/index.html', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(2500);
  await pg.evaluate(fin => {
    try{ _entraNelGestionale({ id:'u1', ruolo:'agente', nome:'Prova', email:'prova@esempio.it' }); }catch(e){}
    try{ _currentUser.ruolo = 'admin'; _currentUser.role = 'admin'; }catch(e){}
    try{ for(const k of Object.keys(fin)){ if(Array.isArray(D[k]) && !D[k].length) D[k] = fin[k]; } }catch(e){}
    const st = document.createElement('style'); st.textContent = '#login-screen,#admin-panel,#fb-auth-avviso{display:none!important}'; document.head.appendChild(st);
  }, FINTI);
  await pg.waitForTimeout(2500);
  return { ctx, pg };
}
/* tutte le regole di stile della pagina, in ordine */
async function leggiRegole(pg){
  return pg.evaluate(() => {
    const out = [];
    /* "a: b; c: url(x;y); d: e" → [{p, v, imp}] rispettando parentesi e virgolette */
    const decl = txt => {
      const d = []; let cur = '', par = 0, q = '';
      const fine = () => { const i = cur.indexOf(':'); if(i > 0){ const p = cur.slice(0, i).trim().toLowerCase(); let v = cur.slice(i + 1).trim(); const imp = /!\s*important$/i.test(v); v = v.replace(/!\s*important$/i, '').trim();
        if(v && /^(background|background-color|background-image|color|border|border-(top|right|bottom|left)|border-color|border-(top|right|bottom|left)-color|outline|outline-color)$/.test(p)) d.push({ p, v, imp }); } cur = ''; };
      for(const ch of txt){
        if(q){ cur += ch; if(ch === q) q = ''; continue; }
        if(ch === '"' || ch === "'"){ q = ch; cur += ch; continue; }
        if(ch === '(') par++; if(ch === ')') par--;
        if(ch === ';' && !par){ fine(); continue; }
        cur += ch;
      }
      fine(); return d;
    };
    const giro = (rules, media) => { for(const r of rules){
      if(r.type === 1){ const d = decl(r.style.cssText); if(d.length) out.push({ s: r.selectorText, d, m: media }); }
      else if(r.type === 4){ const mt = r.conditionText || r.media.mediaText; if(!/print/.test(mt)) giro(r.cssRules, mt); }
      else if(r.cssRules) giro(r.cssRules, media);
    } };
    for(const sh of document.styleSheets){
      const n = sh.ownerNode; if(n && (n.id === 'buio-gen' || n.id === 'buio-fisso')) continue;
      try{ giro(sh.cssRules, ''); }catch(e){}
    }
    return out;
  });
}
const regole = [], visti = new Set();
const aggiungi = L => L.forEach(r => { const k = r.m + '|' + r.s + '|' + JSON.stringify(r.d); if(!visti.has(k)){ visti.add(k); regole.push(r); } });

/* computer: tutte le voci del menù */
{
  const { ctx, pg } = await entra(false);
  aggiungi(await leggiRegole(pg));
  const voci = await pg.evaluate(() => { const out = [];
    document.querySelectorAll('#app-sidebar [onclick]').forEach(el => { const c = el.getAttribute('onclick') || '';
      const m = c.match(/sbGo\('([^']+)'\)|go\('([^']+)'\)|(apri\w+|aprI\w+|open\w+)\(\)/); if(!m) return;
      if(m[1] || m[2]) out.push({ t:'s', id:m[1] || m[2] }); else if(!/aprIMarketingHub|openModuliWindow/.test(m[3])) out.push({ t:'f', id:m[3] }); });
    const v = new Set(); return out.filter(x => !v.has(x.t + x.id) && v.add(x.t + x.id)); });
  for(const v of voci){
    await pg.evaluate(v => { try{ if(v.t === 's'){ if(typeof sbGo === 'function') sbGo(v.id); else go(v.id); } else window[v.id](); }catch(e){} }, v).catch(() => {});
    await pg.waitForTimeout(500);
    aggiungi(await leggiRegole(pg));
  }
  console.log('computer: ' + voci.length + ' voci aperte');
  await ctx.close();
}
/* telefono: le schermate in basso e il menù "Altro" */
{
  const { ctx, pg } = await entra(true);
  for(const s of ['home','clienti','immobili','agenda']){
    await pg.evaluate(s => { try{ mobShow(s); }catch(e){} }, s); await pg.waitForTimeout(500);
    aggiungi(await leggiRegole(pg));
  }
  for(const s of ['attivita','richieste','notizie','lead-web','sopralluogo']){
    await pg.evaluate(s => { try{ mobMoreGoto(s); }catch(e){} }, s); await pg.waitForTimeout(500);
    aggiungi(await leggiRegole(pg));
  }
  console.log('telefono: schermate aperte');
  await ctx.close();
}
await browser.close(); server.close();

/* copie scure di TUTTE le regole con un colore, nell'ordine originale:
   anche quelle che non cambiano, così fra le copie l'ordine resta quello vero */
const fatte = regole.map(r => ({ ...(regola(r.s, r.d) || {}), m: r.m })).filter(x => x.t);
let css = '', mediaAperto = '';
for(const x of fatte){
  if(x.m !== mediaAperto){ if(mediaAperto) css += '}\n'; if(x.m) css += '@media ' + x.m + '{\n'; mediaAperto = x.m; }
  css += x.t + '\n';
}
if(mediaAperto) css += '}\n';

/* ── 2) colori scritti nel codice (style="…" e stringhe JS) ── */
const sorgenti = [path.join(ROOT, 'index.html')];
(function giro(d){ for(const f of fs.readdirSync(d)){ const p = path.join(d, f); if(fs.statSync(p).isDirectory()) giro(p); else if(/\.js$/.test(f)) sorgenti.push(p); } })(path.join(ROOT, 'src', 'modules'));
let testo = sorgenti.map(f => fs.readFileSync(f, 'utf8')).join('\n');
testo = testo.replace(/<style id="buio-gen">[\s\S]*?<\/style>/, '').replace(/<style id="buio-fisso">[\s\S]*?<\/style>/, '');
const inl = new Map();
const metti = (prop, nv, lit) => { const k = prop + '|' + nv; if(!inl.has(k)) inl.set(k, new Set()); inl.get(k).add(lit); };
for(const m of testo.matchAll(/(?<![a-zA-Z-])(background-color|background|color|border-color|border(?:-top|-bottom|-left|-right)?)\s*:\s*(#[0-9a-fA-F]{3,8}|white)(?![0-9a-fA-F])/g)){
  const [c, a] = parse(m[2]); if(!c) continue;
  if(m[1].startsWith('background')){ const nv = bgMap(c, a); if(nv) metti('background', nv, m[0]); }
  else if(m[1] === 'color'){ const nv = fgMap(c); if(nv) metti('color', nv, m[0]); }
  else { const nv = bdMap(c); if(nv) metti('border-color', nv, m[0]); }
}
for(const m of testo.matchAll(/(?<![a-zA-Z-])(border(?:-top|-bottom|-left|-right)?)\s*:\s*(\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted)\s+)(#[0-9a-fA-F]{3,8})(?![0-9a-fA-F])/g)){
  const [c] = parse(m[3]); if(!c) continue; const nv = bdMap(c); if(nv) metti('border-color', nv, m[0]);
}
for(const m of testo.matchAll(/(?<![a-zA-Z-])background(?:-color)?\s*:\s*var\(--navy[23]?\)/g)) metti('background', 'var(--hb-pieno)', m[0]);
for(const m of testo.matchAll(/(?<![a-zA-Z-])background\s*:\s*linear-gradient\([^;"'`]*?\)(?=[;"'`!\s])/g)){
  const cs = (m[0].match(/#[0-9a-fA-F]{3,8}\b/g) || []).map(parse);
  if(!cs.length || /var\(/.test(m[0])) continue;
  const mp = cs.map(([c, a]) => c ? bgMap(c, a) : null);
  if(mp.every(Boolean)) metti('background', mp[0], m[0]);
}
const lettere = new Set([...testo.matchAll(/['"](#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})['"]/g)].map(m => m[1].toUpperCase()));
for(const v of lettere){
  const [c, a] = parse(v); if(!c) continue;
  const rgb = 'rgb(' + c.map(x => Math.round(x * 255)).join(', ') + ')';   /* come il browser scrive i colori messi da JS (el.style.color = '#…') */
  const f = fgMap(c); if(f){ metti('color', f, 'color:' + v); metti('color', f, 'color: ' + v); metti('--c', f, '--c:' + v); metti('color', f, 'color: ' + rgb); }
  const b = bgMap(c, a); if(b){ ['background:', 'background-color:', 'background: '].forEach(p => metti('background', b, p + v)); metti('background', b, 'background: ' + rgb); metti('background', b, 'background-color: ' + rgb); }
}
const nott = ':not(:is(' + EXCL + ') *):not(:is(' + EXCL + '))';
/* niente colori scritti nel codice dentro il login e il pannello Amministrazione */
let righe = [];
for(const [k, lits] of [...inl.entries()].sort()){
  const [prop, nv] = k.split('|');
  const sel = [];
  [...lits].sort().forEach(l => {
    /* "color:#…" si trova anche dentro "border-color:#…": per il testo si cerca
       solo a inizio stile o dopo un punto e virgola */
    const pre = /^color/i.test(l) ? [['^', ''], ['*', ';'], ['*', '; ']] : [['*', '']];
    const corto = /#[0-9a-f]{3}$/i.test(l);   /* #FFF dentro #FFFFFF: serve guardare cosa segue */
    pre.forEach(([op, p]) => {
      if(corto){ [';', ' ', '!'].forEach(c => sel.push('[style' + op + '="' + p + l + c + '" i]')); if(op === '*') sel.push('[style$="' + p + l + '" i]'); else sel.push('[style="' + l + '" i]'); }
      else sel.push('[style' + op + '="' + p + l + '" i]');
    });
  });
  righe.push('body.dark-mode :is(' + sel.join(',') + ')' + nott + ':not(#login-screen *):not(#admin-panel *){' + prop + ':' + nv + '!important}');
}
css += '/* colori scritti nel codice */\n' + righe.join('\n') + '\n';

/* ── 3) dentro index.html, primo stile della pagina ── */
const fIdx = path.join(ROOT, 'index.html');
let h = fs.readFileSync(fIdx, 'utf8');
const blocco = '<style id="buio-gen">\n/* [11 ott 2026] MODALITÀ SCURA DEL GESTIONALE — BLOCCO GENERATO da tests/buio-gestionale.mjs,\n   non correggere a mano: si rifà rilanciando lo script. Vale solo con body.dark-mode.\n   Lo script qui sotto lo tiene sempre in fondo agli stili. */\n' + css + '</style>\n'
  + '<script>/* [11 ott 2026] tiene il buio generato (e la parte fissa) IN FONDO ALLA PAGINA, dopo tutti gli stili.\n'
  + '   In fondo alla testa non bastava: molti stili del file il browser li mette nel corpo, quindi dopo. */\n'
  + '(function(){ function giu(){ var b=document.body; if(!b) return; ["buio-gen","buio-fisso"].forEach(function(id){ var s=document.getElementById(id); if(s && s!==b.lastElementChild) b.appendChild(s); }); }\n'
  + '  function nuovo(m){ for(var i=0;i<m.length;i++){ for(var j=0;j<m[i].addedNodes.length;j++){ var n=m[i].addedNodes[j]; if((n.nodeName==="STYLE" || (n.nodeName==="LINK" && /stylesheet/i.test(n.rel||""))) && n.id!=="buio-gen" && n.id!=="buio-fisso"){ giu(); return; } } } }\n'
  + '  function via(){ giu(); try{ var o=new MutationObserver(nuovo); o.observe(document.head,{childList:true}); o.observe(document.body,{childList:true}); }catch(e){} }\n'
  + '  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", via); else via();\n'
  + '})();</script>\n';
const reBlocco = /<style id="buio-gen">[\s\S]*?<\/style>\n<script>\/\* \[11 ott 2026\] tiene il buio generato[\s\S]*?<\/script>\n/;
if(reBlocco.test(h)) h = h.replace(reBlocco, () => blocco);
else { const i = h.indexOf('</head>'); h = h.slice(0, i) + blocco + h.slice(i); }
fs.writeFileSync(fIdx, h);
console.log('regole lette: ' + regole.length + ' · copie scure: ' + fatte.length + ' · colori nel codice: ' + righe.length + ' · ' + Math.round(css.length / 1024) + ' KB');
