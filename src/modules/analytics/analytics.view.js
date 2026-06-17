// modules/analytics/analytics.view.js — modulo Analytics & Statistiche (read-only).
//
// CASO SPECIALE: nel monolite questo era GIÀ un modulo IIFE auto-contenuto
// (window.AN = (function(){ ... })()), come confermato dal commento storico
// "modulo Analytics (IIFE isolato)". L'estrazione è quindi la più pulita di tutte:
// l'intero IIFE (righe 57080-58194 dell'originale) è spostato qui as-is.
//
// È una vista READ-ONLY: legge D, calcola KPI/funnel/grafici e produce report.
// NON muta lo stato (zero saveD/push/splice nel corpo).
//
// L'IIFE incapsula i suoi helper (_provVal, _provAgente, _anNum, _D, PAL, _sCh...)
// ed espone l'API via `window.AN` + `window.renderAnalytics` (vedi fondo IIFE).
//
// DIPENDENZE ESTERNE (monolite via window): Chart (Chart.js), showToast, go,
//   _lsKey, _scD, stampaBrochure, _pratIdx. Lo stato D è letto via window.D
//   (l'IIFE referenzia `D`, che è globale del monolite — vedi nota sotto).
import { state } from '../../core/state.js';

// L'IIFE usa `D` come riferimento globale (era nello scope del monolite).
// In un ES module serve renderlo disponibile: lo prendiamo da window come Proxy live.
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

window.AN = (function(){

// ══════════════════════════════════════════════════
// LETTURA DATI DAL localStorage DEL GESTIONALE
// Chiave: lecaseAZ2_{userId}
// ══════════════════════════════════════════════════
var D = null;

function _leggiLS() {
  // INTEGRATO: 1) dati live in memoria dell'app  2) fallback localStorage.
  // L'app dichiara `let D` (non su window) ma esiste l'helper _scD() e noi
  // abbiamo aggiunto un alias window.D. Proviamo tutte le vie.
  try {
    var AD = null;
    try { if (typeof window !== 'undefined' && window._scD) AD = window._scD(); } catch (e) {}
    if (!AD) { try { if (typeof window !== 'undefined' && window.D) AD = window.D; } catch (e) {} }
    if (AD) {
      var _hasLive = (
        ((AD.immobili  && AD.immobili.length)  || 0) +
        ((AD.clienti   && AD.clienti.length)   || 0) +
        ((AD.visite    && AD.visite.length)    || 0) +
        ((AD.pratiche  && AD.pratiche.length)  || 0) +
        ((AD.richieste && AD.richieste.length) || 0)
      ) > 0;
      if (_hasLive) {
        var snap = {
          immobili:    AD.immobili    || [],
          pratiche:    AD.pratiche    || [],
          visite:      AD.visite      || [],
          clienti:     AD.clienti     || [],
          richieste:   AD.richieste   || [],
          agenti:      AD.agenti      || [],
          informatori: AD.informatori || [],
          attivita:    AD.attivita    || [],
          provvigioni: AD.provvigioni || []
        };
        var ek = document.getElementById('an-error-key');
        if (ek) ek.textContent = 'dati live del gestionale (memoria)';
        return snap;
      }
    }
  } catch (e) {}

  // Fallback: localStorage. Usa la chiave esatta dell'utente se disponibile.
  try {
    var exact = null;
    try { if (typeof window !== 'undefined' && typeof window._lsKey === 'function') exact = window._lsKey(); } catch (e) {}
    var BAD = /(_fotoCache|_manifest|_localTs|_chunk|_meta|_bak|_backup)/;
    function _isDataKey(k){
      return k && k.indexOf('lecaseAZ2') === 0 && !BAD.test(k) && !/_\d+$/.test(k);
    }
    var raw = null, ek2 = document.getElementById('an-error-key');
    if (exact) {
      raw = localStorage.getItem(exact);
      if (raw && ek2) ek2.textContent = exact;
    }
    if (!raw) {
      // scegli, tra le chiavi DATI valide, quella con payload JSON più ricco
      var best = null, bestScore = -1, bestKey = '';
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!_isDataKey(k)) continue;
        var v = localStorage.getItem(k);
        if (!v) continue;
        var score = 0;
        try {
          var o = JSON.parse(v);
          score = (o && (
            ((o.immobili  && o.immobili.length)  || 0) +
            ((o.clienti   && o.clienti.length)   || 0) +
            ((o.visite    && o.visite.length)    || 0) +
            ((o.pratiche  && o.pratiche.length)  || 0)
          )) || 0;
        } catch (e) { score = -1; }
        if (score > bestScore) { bestScore = score; best = v; bestKey = k; }
      }
      if (best && bestScore >= 0) { raw = best; if (ek2) ek2.textContent = bestKey; }
    }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function _agDaImm(im, ctx) {
  var src = (ctx && ctx.agenti) ? ctx : D;
  if (im.agenteRef != null && !isNaN(parseInt(im.agenteRef))) {
    var a = src && src.agenti && src.agenti[parseInt(im.agenteRef)];
    if (a) return a.nome || '';
  }
  return im.agente || '';
}

function _agDaPrat(p, ctx) {
  var src = (ctx && ctx.agenti) ? ctx : D;
  if (p.agenteIdx != null && !isNaN(parseInt(p.agenteIdx))) {
    var a = src && src.agenti && src.agenti[parseInt(p.agenteIdx)];
    if (a) return a.nome || '';
  }
  return p.agente || '';
}

function _statoImm(im, idx, ctx) {
  var src = (ctx && ctx.pratiche) ? ctx : D;
  var s = (im.stato || '').toLowerCase();
  if (s === 'archiviato' || s === 'non attivo') return 'non attivo';
  if (s === 'venduto') return 'venduto';
  var p = ((src && src.pratiche) || []).find(function(p) { return String(p.immRef) === String(idx); });
  if (!p) return 'attivo';
  var sp = p.stato || '';
  if (sp === 'venduto' || sp === 'vendita') {
    if (p.drogito) { var oggi = new Date(); oggi.setHours(0,0,0,0); return new Date(p.drogito+'T00:00:00') <= oggi ? 'venduto' : 'proposta'; }
    return 'proposta';
  }
  if (sp === 'proposta') return 'proposta';
  if (sp === 'revoca' || sp === 'archiviata') return 'non attivo';
  return 'attivo';
}

function _anNum(x){ var n=parseFloat(x); return isNaN(n)?0:n; }

/* ── Helper provvigioni (livello modulo: usati da _normD e _D) ── */
function _provAgente(pv){
  // Restituisce {lordo, netto} spettante all'AGENTE per questa provvigione,
  // con la stessa formula del gestionale (sezione Agenti).
  if(!pv) return {lordo:0, netto:0};
  var lordo = _anNum(pv.quotaAgenteLordo) || _anNum(pv.quotaAgente);
  if(!(lordo>0)){
    // ricava il lordo agente da % agente sul totale provvigione
    var tot = _provVal(pv);
    var pAg = _anNum(pv.percAgente);
    if(tot>0 && pAg>0) lordo = Math.round(tot * pAg/100 * 100)/100;
  }
  if(!(lordo>0)) return {lordo:0, netto:0};
  var netto = _anNum(pv.quotaAgenteNetto);
  if(!(netto>0)){
    var pUff = _anNum(pv.percUfficio) || _anNum(pv.quotaUfficio) || 2.5;
    netto = Math.round((lordo - lordo*pUff/100) * 100)/100;
  }
  return {lordo:lordo, netto:netto};
}
function _provVal(pv){
  if(!pv) return 0;
  // 1) Campo totale esplicito (come usa l'app: D.provvigioni.reduce(p.totale))
  var t = _anNum(pv.totale);
  if(t>0) return t;
  // 2) Somma quote venditore+acquirente
  var q = _anNum(pv.quotaV)+_anNum(pv.quotaA);
  if(q>0) return q;
  // 3) Formula del gestionale (calcProv): importoVendita * (percV+percA) / 100
  var base = _anNum(pv.importoVendita) || _anNum(pv.importo) || _anNum(pv.importoProp);
  var pcv  = _anNum(pv.percV), pca = _anNum(pv.percA);
  if(base>0 && (pcv>0 || pca>0)) return Math.round(base*(pcv+pca)/100*100)/100;
  // 4) Quote agenzia+agente
  var qag = _anNum(pv.quotaAgenzia)+_anNum(pv.quotaAgente);
  if(qag>0) return qag;
  // 5) Quota agente lordo (campo reale del gestionale) — se presente sola,
  //    è la parte agente; il totale agenzia si ricava dalla % agente.
  var lordo = _anNum(pv.quotaAgenteLordo) || _anNum(pv.quotaAgenteNetto);
  if(lordo>0){
    var pAgt = _anNum(pv.percAgente);
    return pAgt>0 ? Math.round(lordo/(pAgt/100)*100)/100 : lordo;
  }
  // 6) Ultimi fallback
  return _anNum(pv.netto) || 0;
}


// Estrae la prima immagine utile da im.foto (stringa data: o array di stringhe)
function _anFotoList(im){
  if(!im) return [];
  var f = im.foto || im.fotos || im.immagini || im.gallery;
  if(!f) return [];
  if(typeof f === 'string') return f.indexOf('data:')===0 ? [f] : (f?[f]:[]);
  if(Array.isArray(f)) return f.filter(function(x){ return typeof x==='string' && x; });
  return [];
}

/* ════════════════════════════════════════════════════════════════════
   BROCHURE IMMOBILE — anteprima A4 verticale professionale (no Marketing Hub)
   ════════════════════════════════════════════════════════════════════ */
function _brEuro(v){ var n=parseFloat(v)||0; return '€ '+n.toLocaleString('it-IT'); }

function _buildBrochureHTML(idx){
  var _DD = (typeof window!=='undefined' && window.D) ? window.D : (D||{});
  var im=(_DD.immobili||[])[idx]; if(!im) return '';
  var fotos=_anFotoList(im);
  var titolo=(im.tipo||'Immobile')+(im.comune?' — '+im.comune:'');
  var prezzo=im.prezzo?_brEuro(im.prezzo):'Trattativa riservata';
  /* griglia caratteristiche principali */
  var carat=[];
  if(im.mq) carat.push(['Superficie', im.mq+' m²']);
  if(im.camere) carat.push(['Camere', im.camere]);
  if(im.bagni) carat.push(['Bagni', im.bagni]);
  if(im.locali) carat.push(['Locali', im.locali]);
  if(im.piano) carat.push(['Piano', im.piano]);
  if(im.anno) carat.push(['Anno', im.anno]);
  if(im.energia) carat.push(['Classe en.', im.energia]);
  if(im.riscaldamento) carat.push(['Riscaldamento', im.riscaldamento]);
  if(im.arredato) carat.push(['Arredato', im.arredato]);
  if(im.esposizione) carat.push(['Esposizione', im.esposizione]);
  /* distanze */
  var distLabels={mare:'Mare',centro:'Centro',stazione:'Stazione',scuole:'Scuole',banca:'Banca',supermercato:'Supermercato',chiesa:'Chiesa',farmacia:'Farmacia',posta:'Posta',ospedale:'Ospedale',stadio:'Stadio'};
  var dist=im.distanze||{};
  var distArr=Object.keys(distLabels).filter(function(k){return dist[k]!=null&&dist[k]!=='';}).map(function(k){
    var m=parseFloat(dist[k])||0; var v=m>=1000?(m/1000).toFixed(1).replace('.0','')+' km':m+' m';
    return [distLabels[k], v];
  });

  /* badge contratto VENDITA/AFFITTO */
  var _contr=String(im.contratto||im.tipoContratto||im.stato||'').toLowerCase();
  var _isAffitto=/affitt|locaz/.test(_contr);
  var _badgeContr=_isAffitto?'AFFITTO':'VENDITA';

  var html='<div class="br-rep">';
  /* intestazione agenzia */
  html+='<div class="br-head"><div><div class="br-agency">FRIMM<span class="br-agency-sub">Capital Casa Paestum</span></div><div class="br-agent">Vincenzo Carnicelli · Agropoli (SA) · 393 297 0082</div></div>'
      +'<div style="text-align:right"><div class="br-badge-contr">'+_badgeContr+'</div><div class="br-ref">'+(im.ref?('Rif. '+im.ref):('Rif. '+(idx+1)))+'</div></div></div>';
  /* titolo + prezzo */
  html+='<div class="br-title-row"><div><div class="br-title">'+titolo+'</div>'
      +(im.indirizzo?'<div class="br-addr">'+im.indirizzo+(im.zona?' · '+im.zona:'')+'</div>':'')
      +'</div><div class="br-price">'+prezzo+'</div></div>';
  /* foto principale + galleria */
  if(fotos.length){
    html+='<div class="br-photo-main"><img src="'+fotos[0]+'"></div>';
    if(fotos.length>1){
      html+='<div class="br-photo-grid">';
      fotos.slice(1,5).forEach(function(f){ html+='<div class="br-photo-thumb"><img src="'+f+'"></div>'; });
      html+='</div>';
    }
  }
  /* caratteristiche */
  if(carat.length){
    html+='<div class="br-sec-title">Caratteristiche</div><div class="br-carat">';
    carat.forEach(function(c){ html+='<div class="br-carat-item"><div class="br-carat-lbl">'+c[0]+'</div><div class="br-carat-val">'+c[1]+'</div></div>'; });
    html+='</div>';
  }
  /* descrizione */
  var _descr = im.descr || im.descrizione || '';
  if(_descr){
    html+='<div class="br-sec-title">Descrizione</div><div class="br-descr">'+String(_descr).replace(/</g,'&lt;').replace(/\n/g,'<br>')+'</div>';
  }
  /* distanze */
  if(distArr.length){
    html+='<div class="br-sec-title">Distanze dai servizi</div><div class="br-dist">';
    distArr.forEach(function(d){ html+='<div class="br-dist-item"><span class="br-dist-lbl">'+d[0]+'</span><span class="br-dist-val">'+d[1]+'</span></div>'; });
    html+='</div>';
  }
  /* QR code dal link portale (se presente) */
  var _qr='';
  try{
    if(im.linkPortale && typeof window.qrDataUrl==='function'){
      var _qd=window.qrDataUrl(im.linkPortale,150);
      if(_qd) _qr=_qd;
    }
  }catch(_e){}
  if(_qr){
    html+='<div class="br-qr-wrap"><img class="br-qr" src="'+_qr+'"><div class="br-qr-cap">Inquadra il QR per tutti i dettagli e le foto dell\'immobile</div></div>';
  }
  html+='<div class="br-foot">Per informazioni e appuntamenti: Vincenzo Carnicelli · 393 297 0082 · FRIMM Capital Casa Paestum</div>';
  html+='</div>';
  return html;
}

function _brochureCSS(){
  return ''
  + '@page{size:A4 portrait;margin:11mm 11mm;}'
  + '*{box-sizing:border-box;}'
  + '.br-rep{font-family:\'Inter\',-apple-system,Segoe UI,Arial,sans-serif;color:#0F172A;background:#fff;}'
  + '.br-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #7C3AED;padding-bottom:9px;margin-bottom:14px;}'
  + '.br-agency{font-size:14pt;font-weight:800;color:#6D28D9;letter-spacing:-.3px;}'
  + '.br-agency-sub{display:block;font-size:8pt;font-weight:700;color:#7C3AED;letter-spacing:1.5px;text-transform:uppercase;margin-top:1px;}'
  + '.br-badge-contr{display:inline-block;font-size:9pt;font-weight:800;letter-spacing:1.5px;color:#fff;background:#6D28D9;border-radius:5px;padding:5px 16px;margin-bottom:5px;}'
  + '.br-agent{font-size:8pt;color:#64748B;margin-top:2px;}'
  + '.br-ref{font-size:8pt;font-weight:700;color:#7C3AED;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:6px;padding:4px 10px;}'
  + '.br-title-row{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;margin-bottom:12px;}'
  + '.br-title{font-size:16pt;font-weight:800;color:#1E293B;line-height:1.15;}'
  + '.br-addr{font-size:9pt;color:#64748B;margin-top:3px;}'
  + '.br-price{font-size:15pt;font-weight:800;color:#15803D;white-space:nowrap;}'
  + '.br-photo-main{width:100%;height:78mm;border-radius:10px;overflow:hidden;margin-bottom:6px;background:#F1F5F9;}'
  + '.br-photo-main img{width:100%;height:100%;object-fit:cover;display:block;}'
  + '.br-photo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px;}'
  + '.br-photo-thumb{height:30mm;border-radius:7px;overflow:hidden;background:#F1F5F9;}'
  + '.br-photo-thumb img{width:100%;height:100%;object-fit:cover;display:block;}'
  + '.br-sec-title{font-size:10.5pt;font-weight:800;color:#6D28D9;margin:14px 0 8px;padding-left:9px;border-left:3px solid #7C3AED;}'
  + '.br-carat{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:6px;}'
  + '.br-carat-item{border:1px solid #E2E8F0;border-radius:8px;padding:8px 10px;background:#FAFAFE;}'
  + '.br-carat-lbl{font-size:7pt;color:#94A3B8;text-transform:uppercase;letter-spacing:.4px;font-weight:700;}'
  + '.br-carat-val{font-size:11pt;font-weight:800;color:#1E293B;margin-top:2px;}'
  + '.br-descr{font-size:9.5pt;line-height:1.6;color:#334155;}'
  + '.br-dist{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}'
  + '.br-dist-item{display:flex;justify-content:space-between;border:1px solid #EEF2F7;border-radius:6px;padding:5px 10px;font-size:8.5pt;}'
  + '.br-dist-lbl{color:#64748B;font-weight:600;} .br-dist-val{font-weight:800;color:#1E293B;}'
  + '.br-qr-wrap{display:flex;flex-direction:column;align-items:center;margin-top:16px;}'
  + '.br-qr{width:34mm;height:34mm;border:1px solid #E2E8F0;border-radius:8px;padding:4px;background:#fff;}'
  + '.br-qr-cap{font-size:8pt;color:#64748B;margin-top:6px;font-weight:600;}'
  + '.br-foot{margin-top:16px;text-align:center;font-size:8pt;color:#7C3AED;border-top:1px solid #E2E8F0;padding-top:8px;font-weight:600;}'
  + '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}';
}

/* Anteprima brochure in-app (riusa l'overlay an-prev-overlay) */
window.brochureImmobile = function(idx){
 try{
  var _DD = (typeof window!=='undefined' && window.D) ? window.D : (D||{});
  var im=(_DD.immobili||[])[idx];
  if(!im){ if(typeof showToast==='function') showToast('Immobile non trovato','','#DC2626'); return; }
  var inner=_buildBrochureHTML(idx);
  window._brBody=inner;
  var ov=document.getElementById('an-prev-overlay');
  if(!ov){
    ov=document.createElement('div'); ov.id='an-prev-overlay';
    ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:20px;';
    document.body.appendChild(ov);
  }
  ov.style.display='flex';
  ov.innerHTML=''
    + '<div style="background:#F1F5F9;border-radius:14px;width:100%;max-width:880px;height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)">'
    +   '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:#fff;border-bottom:1px solid #E2E8F0;flex-shrink:0">'
    +     '<div style="font-weight:800;color:#1E293B;font-size:1rem;display:flex;align-items:center;gap:9px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Brochure Immobile — Anteprima A4</div>'
    +     '<div style="display:flex;gap:8px">'
    +       '<button onclick="stampaBrochure()" style="display:flex;align-items:center;gap:7px;background:#7C3AED;color:#fff;border:none;border-radius:9px;padding:9px 18px;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Stampa / PDF</button>'
    +       '<button onclick="anChiudiAnteprima()" style="background:#F1F5F9;color:#475569;border:1px solid #CBD5E1;border-radius:9px;padding:9px 14px;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit">Chiudi</button>'
    +     '</div>'
    +   '</div>'
    +   '<div style="flex:1;overflow:auto;padding:24px;display:flex;justify-content:center">'
    +     '<div style="background:#fff;width:210mm;min-height:297mm;padding:11mm;box-shadow:0 4px 20px rgba(0,0,0,.15);"><style>'+_brochureCSS()+'</style>'+inner+'</div>'
    +   '</div>'
    + '</div>';
 }catch(e){
   console.error('brochureImmobile error:', e);
   alert('Errore nella generazione della brochure:\n'+(e&&e.message||e));
 }
};

window.stampaBrochure = function(){
  var inner=window._brBody;
  if(!inner){ if(typeof showToast==='function') showToast('Brochure non disponibile','','#DC2626'); return; }
  var w=window.open('','_blank');
  if(!w){ alert('Consenti i popup per stampare la brochure.'); return; }
  w.document.open();
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Brochure Immobile</title><style>'+_brochureCSS()+'</style></head><body>'+inner+'</body></html>');
  w.document.close();
  setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 400);
};

function _normD(raw) {
  var b = { immobili:[], pratiche:[], visite:[], clienti:[], richieste:[], agenti:[], informatori:[], attivita:[], provvigioni:[] };
  Object.assign(b, raw);
  if(!Array.isArray(b.provvigioni)) b.provvigioni = [];

  b.immobili = b.immobili.map(function(im, i) {
    return Object.assign({}, im, {
      agente:_agDaImm(im,b),
      stato:_statoImm(im,i,b),
      data:im.incInizio||im.dataIns||im.data||'',
      comune:im.comune||im.zona||'',
      indirizzo:im.indirizzo||im.via||'',
      foto:im.foto,                    // preservata per la scheda singolo immobile
      _foto:_anFotoList(im)            // lista normalizzata di immagini
    });
  });

  // ── Indici provvigioni per pratica/immobile ──
  // Le provvigioni reali del gestionale stanno in D.provvigioni, NON nella pratica.
  // Collegamento: provv._pratIdx (indice pratica) oppure provv.immRef (indice immobile).

  function _kImm(x){ return (x==null?'':String(x)).trim(); }
  function _kNA(s){ return (s==null?'':String(s)).trim().toLowerCase(); }
  var provByPrat = {}, provByImm = {}, provByVA = {}, provUsed = [];
  b.provvigioni.forEach(function(pv,pj){
    if(!pv) return;
    pv.__i = pj; provUsed[pj] = false;
    if(pv._pratIdx!=null && pv._pratIdx!=='') {
      var kp=String(pv._pratIdx); (provByPrat[kp]=provByPrat[kp]||[]).push(pv);
    }
    if(pv.immRef!=null && pv.immRef!=='') {
      var ki=_kImm(pv.immRef); (provByImm[ki]=provByImm[ki]||[]).push(pv);
    }
    var va=_kNA(pv.venditore)+'|'+_kNA(pv.acquirente);
    if(va!=='|'){ (provByVA[va]=provByVA[va]||[]).push(pv); }
  });

  b.pratiche = b.pratiche.map(function(p, pi) {
    var st = (p.stato||'').toLowerCase();
    // Stato di vendita: nel gestionale è 'vendita' (con drogito+importo).
    var venduta = (st==='vendita' || st==='venduto' || st==='chiuso');
    // Provvigioni collegate: 1) per indice pratica  2) per immobile  3) per venditore+acquirente
    var linked = provByPrat[String(pi)];
    if((!linked||!linked.length) && p.immRef!=null) linked = provByImm[_kImm(p.immRef)];
    if((!linked||!linked.length)) linked = provByVA[_kNA(p.venditore)+'|'+_kNA(p.acquirente)];
    linked = linked || [];
    var provTot = 0, incassato = 0, importoVend = 0, agLordo = 0, agNetto = 0;
    linked.forEach(function(pv){
      if(pv.__i!=null) provUsed[pv.__i]=true;
      provTot   += _provVal(pv);
      incassato += _anNum(pv.pagato)||_anNum(pv.incassato);
      var qa = _provAgente(pv);
      agLordo += qa.lordo; agNetto += qa.netto;
      if(_anNum(pv.importoVendita) > importoVend) importoVend = _anNum(pv.importoVendita);
    });
    // Importo vendita: dalla provvigione, altrimenti dalla pratica (campo reale 'importo').
    if(!importoVend) importoVend = _anNum(p.importo) || _anNum(p.importoProp) || _anNum(p.importoVendita);
    // Data rogito reale = drogito; fallback su dataAcq.
    var dRog = p.drogito || p.dataRogito || p.data || p.dataAcq || '';
    // Prezzo iniziale per calcolo sconto = prezzo richiesto in acquisizione.
    var pIniz = _anNum(p.prezzoRich) || _anNum(p.prezzoInizio) || 0;
    // Agente pratica: 1) campo pratica  2) immobile collegato
    var _agP = _agDaPrat(p,b);
    if(!_agP && p.immRef!=null && p.immRef!==''){
      var _imP = b.immobili[parseInt(p.immRef)];
      if(_imP && _imP.agente) _agP = _imP.agente;
    }
    return Object.assign({}, p, {
      agente:_agP,
      provvigione: provTot,
      provvAgenteLordo: agLordo,
      provvAgenteNetto: agNetto,
      prov: incassato,
      dataRogito: venduta ? dRog : (dRog||''),
      dataInizio: p.dataAcq || p.dataInizio || '',
      importoVendita: importoVend,
      prezzoInizio: pIniz,
      // normalizza lo stato a etichette che i grafici riconoscono
      stato: venduta ? 'venduto' : (st || p.stato || '')
    });
  });

  // Provvigioni non collegate ad alcuna pratica (es. create dalla sezione Provvigioni):
  // le esponiamo separatamente perché rVend possa comunque sommarle.
  b._provOrfane = (b.provvigioni||[]).filter(function(pv){ return pv && pv.__i!=null && !provUsed[pv.__i]; });
  b._provTotaleGlobale = (b.provvigioni||[]).reduce(function(s,pv){ return s + (pv?_provVal(pv):0); }, 0);
  b._provAgenteLordoGlobale = (b.provvigioni||[]).reduce(function(s,pv){ return s + (pv?_provAgente(pv).lordo:0); }, 0);
  b._provAgenteNettoGlobale = (b.provvigioni||[]).reduce(function(s,pv){ return s + (pv?_provAgente(pv).netto:0); }, 0);
  b._provIncassatoGlobale = (b.provvigioni||[]).reduce(function(s,pv){ return s + (pv?(_anNum(pv.pagato)||_anNum(pv.incassato)):0); }, 0);

  b.visite = b.visite.map(function(v) {
    // Risoluzione immobile: per indice; se fallisce, per ref/codice
    var imIx = (v.immRef!=null && v.immRef!=='' && !isNaN(+v.immRef)) ? +v.immRef : -1;
    var im = (imIx>=0) ? b.immobili[imIx] : null;
    if(!im && v.immRef!=null && v.immRef!==''){
      var rk=String(v.immRef);
      for(var ii=0;ii<b.immobili.length;ii++){
        var I=b.immobili[ii];
        if(I && (String(I.ref)===rk || String(I.codice)===rk)){ im=I; imIx=ii; break; }
      }
    }
    // Cliente: da cliRef(indice) -> nome anagrafica; poi vari campi testuali
    var cl = (v.cliRef!=null && v.cliRef!=='' && !isNaN(+v.cliRef)) ? b.clienti[+v.cliRef] : null;
    var nomeCli = cl ? (cl.nome||'') :
                  (v.cliente || v.nominativo || v.nomeCliente || v.cli || '');
    // Agente: campo; poi agenteRef/agenteIdx; poi agente dell'immobile
    var agV = v.agente || '';
    if(!agV){
      var aix=(v.agenteRef!=null&&v.agenteRef!==''?v.agenteRef:(v.agenteIdx!=null&&v.agenteIdx!==''?v.agenteIdx:null));
      if(aix!=null && !isNaN(parseInt(aix)) && b.agenti[parseInt(aix)]) agV=b.agenti[parseInt(aix)].nome||'';
    }
    if(!agV && im && im.agente) agV=im.agente;
    return Object.assign({}, v, {
      immRef: (imIx>=0? imIx : v.immRef),
      cliente: nomeCli,
      agente: agV,
      indirizzo: im?((im.tipo||'')+(im.comune?' \u2014 '+im.comune:'')):(v.immobile||v.immTitolo||'')
    });
  });
  b.clienti = b.clienti.map(function(c) { return Object.assign({}, c, { creato:c.data||c.creato||'' }); });
  b.richieste = b.richieste.map(function(r) { return Object.assign({}, r, { budgetMax:parseFloat(r.budget||r.prezzoMax||r.budgetMax)||0 }); });
  if (!b.agenti || !b.agenti.length) {
    var nm = {};
    b.visite.forEach(function(v){if(v.agente)nm[v.agente]=1;});
    b.pratiche.forEach(function(p){if(p.agente)nm[p.agente]=1;});
    b.immobili.forEach(function(im){if(im.agente)nm[im.agente]=1;});
    b.agenti = Object.keys(nm).map(function(n){return{nome:n};});
  }
  return b;
}

var _DcacheKey=null, _Dcache=null;
function _D() {
  if(!D) return D;
  if(!_sAg){ _DcacheKey=null; _Dcache=null; return D; }
  if(_DcacheKey===_sAg && _Dcache) return _Dcache;
  var t=_anNorm(_sAg);
  function _mine(o){ return _anNorm(_agName(o))===t; }
  var v = {};
  // copia superficiale di tutte le chiavi non-array/array-non-filtrate
  for(var k in D){ v[k]=D[k]; }
  v.immobili    = (D.immobili||[]).filter(_mine);
  v.pratiche    = (D.pratiche||[]).filter(_mine);
  v.visite      = (D.visite||[]).filter(_mine);
  v.provvigioni = (D.provvigioni||[]).filter(_mine);
  // Totali globali RICALCOLATI sul solo agente (per i fallback di rVend).
  v._provTotaleGlobale = v.provvigioni.reduce(function(s,pv){ return s + (pv?_provVal(pv):0); }, 0);
  v._provAgenteLordoGlobale = v.provvigioni.reduce(function(s,pv){ return s + (pv?_provAgente(pv).lordo:0); }, 0);
  v._provAgenteNettoGlobale = v.provvigioni.reduce(function(s,pv){ return s + (pv?(_provAgente(pv).netto):0); }, 0);
  v._provIncassatoGlobale = v.provvigioni.reduce(function(s,pv){ return s + (pv?(_anNum(pv.pagato)||_anNum(pv.incassato)):0); }, 0);
  // Provvigioni "orfane" dell'agente: quelle non collegate a una sua pratica.
  // Indicizzazione lineare (niente loop annidati) per immRef.
  var _immSet={};
  for(var _pi=0;_pi<v.pratiche.length;_pi++){
    var _pp=v.pratiche[_pi];
    if(_pp && _pp.immRef!=null && _pp.immRef!=='') _immSet[String(_pp.immRef)]=1;
  }
  v._provOrfane = (v.provvigioni||[]).filter(function(pv){
    if(!pv) return true;
    if(pv.immRef!=null && pv.immRef!=='' && _immSet[String(pv.immRef)]) return false;
    return true;
  });
  _DcacheKey=_sAg; _Dcache=v;
  return v;
}

function _anEnsureChart(cb) {
  if (window.Chart) { cb(); return; }
  if (window._anChartLoading) { var t=setInterval(function(){ if(window.Chart){clearInterval(t);cb();} },60); return; }
  window._anChartLoading = true;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
  s.onload = function(){ window._anChartLoading = false; cb(); };
  s.onerror = function(){ window._anChartLoading = false;
    var lo=document.getElementById('an-loading'); if(lo) lo.style.display='none';
    var eb=document.getElementById('an-error-box');
    if(eb){ eb.style.display='block'; eb.innerHTML='<h3>&#9888;&#65039; Libreria grafici non caricata</h3><p>Impossibile caricare Chart.js (connessione assente?). Riprova quando sei online.</p>'; }
  };
  document.head.appendChild(s);
}

// Punto d'ingresso usato dal gestionale (go('analytics') -> renderAnalytics()).
function renderAnalytics() {
  var lo = document.getElementById('an-loading');
  var eb = document.getElementById('an-error-box');
  var mc = document.getElementById('an-main-content');
  if (lo) lo.style.display = 'flex';
  if (eb) eb.style.display = 'none';
  if (mc) mc.style.display = 'none';
  _anEnsureChart(function() {
    var raw = _leggiLS();
    var _empty = !raw || (
      (!raw.immobili  || !raw.immobili.length)  &&
      (!raw.clienti   || !raw.clienti.length)   &&
      (!raw.visite    || !raw.visite.length)    &&
      (!raw.pratiche  || !raw.pratiche.length)  &&
      (!raw.richieste || !raw.richieste.length)
    );
    if (_empty) {
      if (lo) lo.style.display = 'none';
      if (eb) eb.style.display = 'block';
      return;
    }
    D = _normD(raw);
    try{ _anDiag(D); }catch(e){}
    var u = '';
    try { u = (typeof _currentUser !== 'undefined' && _currentUser) ? (_currentUser.user || _currentUser.email || _currentUser.id || '') : ''; } catch(e){}
    if (!u) u = raw._currentUser || raw._userName || (D.agenti && D.agenti[0] ? D.agenti[0].nome : '');
    var un = document.getElementById('an-top-user-name'); if (un && u) un.textContent = u;
    var sl = document.getElementById('an-top-sub-label');
    if (sl) sl.textContent = (D.immobili.length) + ' imm \u00b7 ' + (D.clienti.length) + ' cli \u00b7 ' + (D.visite.length) + ' visite';
    if (lo) lo.style.display = 'none';
    if (mc) mc.style.display = 'block';
    initStat();
  });
}

// ══════════════════════════════════════════════════
// MOTORE STATISTICHE
// ══════════════════════════════════════════════════
var _sPD=0,_sDF=null,_sDT=null,_sAg='',_sCh={};
var PAL={blue:['#2563EB','#3B82F6','#60A5FA','#93C5FD'],green:['#15803D','#16A34A','#22C55E','#4ADE80'],gold:['#B45309','#D97706','#F59E0B','#FCD34D'],purple:['#7C3AED','#8B5CF6','#A78BFA','#C4B5FD'],red:['#DC2626','#EF4444','#F87171'],teal:['#0F766E','#0D9488','#14B8A6'],orange:['#C2410C','#EA580C','#F97316'],mixed:['#2563EB','#16A34A','#D97706','#7C3AED','#DC2626','#0F766E','#C2410C','#0369A1']};

function _fD(arr,f){if(!arr||!arr.length)return[];var fr=_sDF?new Date(_sDF):null,to=_sDT?new Date(_sDT):null;if(!fr&&_sPD>0){var n=new Date();fr=new Date(n.getTime()-_sPD*86400000);}return arr.filter(function(item){var raw=item[f]||item.data||item.creato||item.dataRogito||'';if(!raw)return _sPD===0;var d=new Date(raw);if(isNaN(d))return true;if(fr&&d<fr)return false;if(to&&d>to)return false;return true;});}
function _anNorm(s){return (s==null?'':String(s)).trim().toLowerCase();}
function _agName(o){
  // Nome agente da un record: campo agente, oppure risolto da agenteRef/agenteIdx
  if(o && o.agente) return o.agente;
  try{
    var data=_D(); var ags=(data&&data.agenti)||[];
    var ix=(o&&(o.agenteRef!=null&&o.agenteRef!==''?o.agenteRef:(o.agenteIdx!=null&&o.agenteIdx!==''?o.agenteIdx:null)));
    if(ix!=null && !isNaN(parseInt(ix)) && ags[parseInt(ix)]) return ags[parseInt(ix)].nome||'';
    // pratica/provv senza agente: prova l'agente dell'immobile collegato
    if(o && o.immRef!=null && o.immRef!==''){
      var im=(data&&data.immobili)?data.immobili[parseInt(o.immRef)]:null;
      if(im){ if(im.agente) return im.agente;
        if(im.agenteRef!=null&&!isNaN(parseInt(im.agenteRef))&&ags[parseInt(im.agenteRef)]) return ags[parseInt(im.agenteRef)].nome||''; }
    }
  }catch(e){}
  return (o&&o.agente)||'';
}
function _fA(arr){if(!_sAg)return arr;var t=_anNorm(_sAg);return arr.filter(function(i){return _anNorm(_agName(i))===t;});}
function _eu(n){if(!n&&n!==0)return'\u2014';return'\u20ac '+Number(n).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0});}
function _pc(n,d){return d?(n/d*100).toFixed(1)+'%':'0%';}
function _mk(d){var dt=new Date(d);if(isNaN(dt.getTime()))return'';return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');}
function _ml(k){var p=k.split('-');var m=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];return m[parseInt(p[1])-1]+' '+p[0].slice(2);}
function _lm(n){var r=[],now=new Date();for(var i=n-1;i>=0;i--){var d=new Date(now.getFullYear(),now.getMonth()-i,1);r.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));}return r;}
function _dc(id){if(_sCh[id]){try{_sCh[id].destroy();}catch(e){}delete _sCh[id];}}
function _mc(id,cfg){_dc(id);var c=document.getElementById(id);if(!c)return;_sCh[id]=new Chart(c.getContext('2d'),cfg);return _sCh[id];}
function _dm(t,s){var o=Object.assign({},t);for(var k in s){if(s[k]&&typeof s[k]==='object'&&!Array.isArray(s[k])&&t[k]&&typeof t[k]==='object'&&!Array.isArray(t[k]))o[k]=_dm(t[k],s[k]);else o[k]=s[k];}return o;}
function _co(ex){return _dm({responsive:true,maintainAspectRatio:false,animation:{duration:500},plugins:{legend:{labels:{font:{family:"'Plus Jakarta Sans','Inter',sans-serif",size:11},padding:12}},tooltip:{backgroundColor:'rgba(15,23,42,0.9)',titleFont:{size:12,weight:'700'},bodyFont:{size:11},padding:10,cornerRadius:8}},scales:{x:{grid:{color:'rgba(226,232,240,0.6)',drawBorder:false},ticks:{font:{family:"'Plus Jakarta Sans','Inter',sans-serif",size:11},color:'#64748B'}},y:{grid:{color:'rgba(226,232,240,0.6)',drawBorder:false},ticks:{font:{family:"'Plus Jakarta Sans','Inter',sans-serif",size:11},color:'#64748B'}}}},ex||{});}

function _kpi(color,svg,val,lbl){return'<div class="kpi-card '+color+'"><div class="kpi-ico '+color+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+svg+'</svg></div><div class="kpi-value">'+val+'</div><div class="kpi-label">'+lbl+'</div></div>';}

function statTab(tab,btn){document.querySelectorAll('#sec-analytics .stat-tab').forEach(function(b){b.classList.remove('active');});document.querySelectorAll('#sec-analytics .stat-panel').forEach(function(p){p.classList.remove('active');});if(btn)btn.classList.add('active');var p=document.getElementById('an-stat-panel-'+tab);if(p)p.classList.add('active');renderAllStats();}

function setStatPeriod(days,btn){_sPD=days;_sDF=null;_sDT=null;document.getElementById('an-stat-date-from').value='';document.getElementById('an-stat-date-to').value='';document.querySelectorAll('#sec-analytics .period-tab').forEach(function(b){b.classList.remove('active');});if(btn)btn.classList.add('active');_upl();renderAllStats();}
function setStatCustom(){_sDF=document.getElementById('an-stat-date-from').value;_sDT=document.getElementById('an-stat-date-to').value;if(_sDF||_sDT){_sPD=0;document.querySelectorAll('#sec-analytics .period-tab').forEach(function(b){b.classList.remove('active');});}_upl();renderAllStats();}
function _upl(){var l=document.getElementById('an-stat-period-label');if(!l)return;if(_sDF&&_sDT)l.textContent='Periodo: '+_sDF+' \u2192 '+_sDT;else if(_sPD===0)l.textContent='Tutto il periodo';else if(_sPD===30)l.textContent='Ultimi 30 giorni';else if(_sPD===90)l.textContent='Ultimi 3 mesi';else if(_sPD===180)l.textContent='Ultimi 6 mesi';else if(_sPD===365)l.textContent='Ultimo anno';}

function initStat(){
  var data=_D();
  var sel=document.getElementById('an-stat-agente-filter');
  if(sel){var nm={};(data.agenti||[]).forEach(function(a){if(a.nome)nm[a.nome]=1;});(data.immobili||[]).forEach(function(i){if(i.agente)nm[i.agente]=1;});(data.visite||[]).forEach(function(v){if(v.agente)nm[v.agente]=1;});(data.pratiche||[]).forEach(function(p){if(p.agente)nm[p.agente]=1;});sel.innerHTML='<option value="">Tutti gli agenti</option>';Object.keys(nm).sort().forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n;sel.appendChild(o);});sel.onchange=function(){_sAg=this.value;_DcacheKey=null;_Dcache=null;renderAllStats();};}
  var pk=document.getElementById('an-singolo-picker');
  if(pk){pk.innerHTML='<option value="">\u2014 Seleziona un immobile \u2014</option>';(data.immobili||[]).forEach(function(im,i){var o=document.createElement('option');o.value=i;o.textContent=(im.ref||im.codice||'#'+i)+' \u2014 '+(im.indirizzo||im.comune||'N/D');pk.appendChild(o);});}
  _upl();renderAllStats();
}


// ── Diagnostica: cosa legge davvero il modulo dai dati del gestionale ──
function _anDiag(D){
  try{
    var el = document.getElementById('an-diag'); var bd = document.getElementById('an-diag-body');
    if(!el||!bd) return;
    function n(a){ return Array.isArray(a)?a.length:0; }
    var prat = D.pratiche||[], prov = D.provvigioni||[], imm = D.immobili||[];
    var venduteN = prat.filter(function(p){var s=(p.stato||'').toLowerCase();return s==='venduto'||s==='vendita'||s==='chiuso';}).length;
    var conProvv = prat.filter(function(p){return (parseFloat(p.provvigione)||0)>0;}).length;
    var totProvvPr = prat.reduce(function(s,p){return s+(parseFloat(p.provvigione)||0);},0);
    var totProvvGl = D._provTotaleGlobale||0;
    var immConFoto = imm.filter(function(x){return x && x._foto && x._foto.length;}).length;
    var pSample = prat[0] ? Object.keys(prat[0]).slice(0,14).join(', ') : '(nessuna pratica)';
    var pvSample = prov[0] ? Object.keys(prov[0]).slice(0,14).join(', ') : '(nessuna provvigione)';
    var iSample = imm[0] ? ('foto='+(typeof (imm[0].foto)) + (Array.isArray(imm[0].foto)?('['+imm[0].foto.length+']'):'') ) : '(nessun immobile)';
    var rows = [
      'Immobili: '+n(imm)+'  ·  con foto: '+immConFoto,
      'Pratiche: '+n(prat)+'  ·  vendute: '+venduteN+'  ·  con provvigione collegata: '+conProvv,
      'Provvigioni (D.provvigioni): '+n(prov),
      'Somma provvigioni da pratiche: \u20ac '+Math.round(totProvvPr).toLocaleString('it-IT'),
      'Somma provvigioni globale: \u20ac '+Math.round(totProvvGl).toLocaleString('it-IT'),
      'Campi 1ª pratica: '+pSample,
      'Campi 1ª provvigione: '+pvSample,
      '1º immobile: '+iSample
    ];
    var anomalia = (n(prov)===0 && venduteN>0) || (totProvvPr===0 && totProvvGl===0 && n(prov)>0) || (immConFoto===0 && n(imm)>0);
    // Sorgente dati realmente usata (memoria vs localStorage)
    var ek=document.getElementById('an-error-key');
    var srcTxt=ek?ek.textContent:'?';
    bd.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Sorgente: '+srcTxt+'</div>'
      + rows.map(function(r){return '<div>'+r+'</div>';}).join('')
      + (anomalia?'<div style="margin-top:8px;padding:8px;background:#FEF2F2;border-radius:6px;color:#991B1B;font-weight:700">⚠ Anomalia rilevata: alcuni dati attesi risultano a zero. Copia questo riquadro e invialo per la correzione mirata.</div>':'');
    // Pannello SEMPRE visibile quando ci sono dati (o anomalia), così è ispezionabile.
    var mostra = anomalia || (n(imm)+n(prat)+n(prov))>0;
    el.style.display = mostra ? 'block' : 'none';
    el.style.background = anomalia ? '#FFFBEB' : '#F0FDF4';
    el.style.borderColor = anomalia ? '#FCD34D' : '#86EFAC';
    el.style.color = anomalia ? '#92400E' : '#166534';
    var b=document.getElementById('an-diag-body');
    if(b && anomalia) b.style.display='block';
  }catch(e){}
}


// ── Stampa dedicata della sezione Analytics (non usa il sistema stampa app) ──
/* ════════════════════════════════════════════════════════════════════
   REPORT STATISTICHE & ANALYTICS — A4 verticale, anteprima + stampa
   ════════════════════════════════════════════════════════════════════ */

/* CSS condiviso per anteprima e stampa, ottimizzato per A4 portrait */
function _anReportCSS(){
  return ''
  + '@page{size:A4 portrait;margin:12mm 11mm;}'
  + '*{box-sizing:border-box;}'
  + '.an-rep{font-family:\'Inter\',-apple-system,Segoe UI,Arial,sans-serif;color:#0F172A;background:#fff;}'
  + '.an-rep-head{border-bottom:2.5px solid #2563EB;padding-bottom:10px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;}'
  + '.an-rep-head h1{font-size:17pt;color:#1D4ED8;margin:0 0 2px;font-weight:800;letter-spacing:-.3px;}'
  + '.an-rep-head .sub{font-size:8.5pt;color:#64748B;font-weight:500;}'
  + '.an-rep-head .logo{font-size:8pt;color:#94A3B8;text-align:right;font-weight:600;line-height:1.4;}'
  + '.an-sec{margin-bottom:22px;}'
  + '.an-sec-title{font-size:11pt;font-weight:800;color:#1E293B;margin:0 0 10px;padding:6px 0 6px 11px;border-left:4px solid #2563EB;background:linear-gradient(90deg,#EFF6FF,transparent);border-radius:0 6px 6px 0;}'
  + '.an-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;}'
  + '.an-kpi{border:1px solid #E2E8F0;border-radius:9px;padding:11px 12px;background:#fff;border-top:3px solid #94A3B8;}'
  + '.an-kpi .v{font-size:16pt;font-weight:800;color:#0F172A;line-height:1.05;letter-spacing:-.5px;}'
  + '.an-kpi .l{font-size:7.5pt;color:#64748B;font-weight:600;margin-top:3px;}'
  + '.an-kpi.blue{border-top-color:#2563EB;}.an-kpi.green{border-top-color:#16A34A;}.an-kpi.gold{border-top-color:#D97706;}'
  + '.an-kpi.purple{border-top-color:#7C3AED;}.an-kpi.teal{border-top-color:#0D9488;}.an-kpi.red{border-top-color:#DC2626;}.an-kpi.orange{border-top-color:#EA580C;}'
  + '.an-charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;}'
  + '.an-chart{border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px;background:#fff;break-inside:avoid;page-break-inside:avoid;}'
  + '.an-chart.full{grid-column:1 / -1;}'
  + '.an-chart h3{font-size:9.5pt;font-weight:700;color:#1E293B;margin:0 0 2px;}'
  + '.an-chart .csub{font-size:7.5pt;color:#94A3B8;margin:0 0 8px;font-weight:500;}'
  + '.an-chart img{width:100%;height:auto;display:block;}'
  + '.an-rep table{width:100%;border-collapse:collapse;font-size:8pt;margin-top:4px;}'
  + '.an-rep th{background:#F1F5F9;color:#475569;font-weight:700;text-transform:uppercase;letter-spacing:.4px;font-size:7pt;padding:6px 8px;text-align:left;border-bottom:1px solid #CBD5E1;}'
  + '.an-rep td{padding:6px 8px;border-bottom:1px solid #EEF2F7;color:#334155;}'
  + '.an-rep-foot{margin-top:8px;text-align:center;font-size:7pt;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:6px;}'
  + '.an-pagebreak{page-break-before:always;break-before:page;}'
  + '.an-singolo-print{break-inside:auto;}'
  + '.an-singolo-print .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0;}'
  + '.an-singolo-print .kpi-card{border:1px solid #E2E8F0;border-radius:9px;padding:10px 12px;background:#fff;break-inside:avoid;}'
  + '.an-singolo-print .kpi-value{font-size:15pt;font-weight:800;color:#0F172A;}'
  + '.an-singolo-print .kpi-label{font-size:7.5pt;color:#64748B;font-weight:600;}'
  + '.an-singolo-print .kpi-ico{display:none;}'
  + '.an-singolo-print .chart-card{border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px;margin-bottom:10px;break-inside:avoid;}'
  + '.an-singolo-print img{max-width:100%;height:auto;border-radius:6px;}'
  + '.an-singolo-print canvas{max-width:100%!important;height:auto!important;}'
  + '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.an-noprint{display:none!important;}}';
}

/* Renderizza tutti i tab e costruisce l'HTML del report A4.
   Restituisce una Promise con la stringa HTML completa del <body>. */
function _buildAnalyticsReportHTML(){
  return new Promise(function(resolve){
    var tabTitles={panoramica:'Panoramica Generale',immobili:'Immobili & Portafoglio',vendite:'Vendite & Provvigioni',visite:'Visite & Attività',clienti:'Clienti',singolo:'Singolo Immobile'};
    var renderers={panoramica:typeof rPan==='function'?rPan:null,immobili:typeof rImm==='function'?rImm:null,vendite:typeof rVend==='function'?rVend:null,visite:typeof rVis==='function'?rVis:null,clienti:typeof rCli==='function'?rCli:null,singolo:typeof renderSingolo==='function'?renderSingolo:null};
    // Solo il tab ATTUALMENTE attivo (non l'intero report)
    var origActive=document.querySelector('#sec-analytics .stat-panel.active');
    var activeTab = origActive ? origActive.id.replace('an-stat-panel-','') : 'panoramica';
    var tabs=[activeTab];
    // Renderizza il tab attivo per assicurare canvas aggiornati
    tabs.forEach(function(t){ try{ if(renderers[t]) renderers[t](); }catch(e){} });
    // Attendi che Chart.js completi il disegno
    setTimeout(function(){
      var out='';
      tabs.forEach(function(t,ti){
        var panel=document.getElementById('an-stat-panel-'+t);
        if(!panel) return;
        var secClass = ti>0 ? 'an-sec an-pagebreak' : 'an-sec';
        out += '<div class="'+secClass+'">';
        // (il titolo della sezione è già nell'intestazione del report)
        // ── Caso speciale: Singolo Immobile ha struttura propria (header, gallery,
        //    KPI, timeline). Clono l'intero contenuto invece dell'estrazione generica.
        if(t==='singolo'){
          var sc=document.getElementById('an-singolo-content');
          if(sc && sc.innerHTML.trim() && !sc.querySelector('.stat-empty')){
            var scClone=sc.cloneNode(true);
            // canvas → immagine
            var sCanv=sc.querySelectorAll('canvas'), dCanv=scClone.querySelectorAll('canvas');
            for(var ci=0;ci<sCanv.length && ci<dCanv.length;ci++){
              try{ var im2=document.createElement('img'); im2.src=sCanv[ci].toDataURL('image/png',1.0); im2.style.maxWidth='100%'; dCanv[ci].parentNode.replaceChild(im2,dCanv[ci]); }catch(e){}
            }
            out += '<div class="an-singolo-print">'+scClone.innerHTML+'</div>';
          } else {
            out += '<div style="padding:20px;color:#94A3B8;font-size:9pt">Nessun immobile selezionato. Scegli un immobile dal menu a tendina prima di generare il report.</div>';
          }
          out+='</div>';
          return;
        }
        // KPI
        var kpiGrid=panel.querySelector('.kpi-grid');
        if(kpiGrid){
          var kpis=kpiGrid.querySelectorAll('.kpi-card');
          if(kpis.length){
            out+='<div class="an-kpis">';
            kpis.forEach(function(k){
              var v=k.querySelector('.kpi-value')||k.querySelector('[class*="value"]');
              var l=k.querySelector('.kpi-label')||k.querySelector('[class*="label"]');
              var cls=(k.className.match(/blue|green|gold|purple|teal|red|orange/)||['blue'])[0];
              var vt=v?v.textContent.trim():''; var lt=l?l.textContent.trim():'';
              if(vt||lt) out+='<div class="an-kpi '+cls+'"><div class="v">'+vt+'</div><div class="l">'+lt+'</div></div>';
            });
            out+='</div>';
          }
        }
        // Grafici e tabelle
        var cards=panel.querySelectorAll('.chart-card');
        if(cards.length){
          out+='<div class="an-charts">';
          cards.forEach(function(card){
            var titleEl=card.querySelector('.chart-title');
            var subEl=card.querySelector('.chart-sub');
            var isFull = /col-12/.test(card.className);
            out+='<div class="an-chart'+(isFull?' full':'')+'">';
            if(titleEl) out+='<h3>'+titleEl.textContent.trim()+'</h3>';
            if(subEl) out+='<div class="csub">'+subEl.textContent.trim()+'</div>';
            // canvas → immagine
            var canv=card.querySelector('canvas');
            if(canv){
              try{ out+='<img src="'+canv.toDataURL('image/png',1.0)+'">'; }catch(e){ out+='<div style="color:#94A3B8;font-size:8pt">[grafico non disponibile]</div>'; }
            }
            // tabella (es. performance agenti)
            var tbl=card.querySelector('table');
            if(tbl) out+='<div style="overflow:hidden">'+tbl.outerHTML+'</div>';
            // funnel / zone / heatmap (contenuti HTML)
            var funnel=card.querySelector('.funnel-wrap');
            if(funnel) out+=_anFunnelToTable(funnel);
            var zones=card.querySelector('.zone-grid');
            if(zones && zones.children.length) out+=zones.outerHTML;
            out+='</div>';
          });
          out+='</div>';
        }
        out+='</div>';
      });
      resolve(out);
    }, 550);
  });
}

/* Converte il funnel HTML in una tabellina leggibile per la stampa */
function _anFunnelToTable(funnel){
  try{
    var steps=funnel.querySelectorAll('.funnel-step');
    if(!steps.length) return '';
    var rows='';
    steps.forEach(function(s){
      var l=s.querySelector('.funnel-label'); var v=s.querySelector('.funnel-val');
      rows+='<tr><td>'+(l?l.textContent.trim():'')+'</td><td style="text-align:right;font-weight:700">'+(v?v.textContent.trim():'')+'</td></tr>';
    });
    return '<table>'+rows+'</table>';
  }catch(e){ return ''; }
}

/* Intestazione del report con contesto agente/periodo */
function _anSezioneAttiva(){
  var titoli={panoramica:'Panoramica Generale',immobili:'Immobili & Portafoglio',vendite:'Vendite & Provvigioni',visite:'Visite & Attività',clienti:'Clienti',singolo:'Singolo Immobile'};
  var a=document.querySelector('#sec-analytics .stat-panel.active');
  var k=a?a.id.replace('an-stat-panel-',''):'panoramica';
  return titoli[k]||'Panoramica Generale';
}

function _anReportHead(){
  var agTxt = (typeof _sAg!=='undefined' && _sAg) ? ('Agente: ' + _sAg) : 'Tutti gli agenti';
  var perTxt=(function(){ var l=document.getElementById('an-stat-period-label'); return l?l.textContent.trim():'Tutto il periodo'; })();
  var oggi = new Date().toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
  var sez=_anSezioneAttiva();
  return '<div class="an-rep-head"><div><h1>'+sez+'</h1>'
       + '<div class="sub">Statistiche &amp; Analytics \u00b7 '+agTxt+' \u00b7 '+perTxt+' \u00b7 Generato il '+oggi+'</div></div>'
       + '<div class="logo">Le case dalla A allo Z.io<br>Vincenzo Carnicelli</div></div>';
}

/* ANTEPRIMA in-app: mostra il report in un modale, SENZA aprire la stampa */
function anteprimaAnalytics(){
  var mc=document.getElementById('an-main-content');
  if(!mc){ if(typeof showToast==='function') showToast('Dati non disponibili','','#DC2626'); return; }
  // overlay di caricamento
  var ov=document.getElementById('an-prev-overlay');
  if(!ov){
    ov=document.createElement('div');
    ov.id='an-prev-overlay';
    ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:20px;';
    document.body.appendChild(ov);
  }
  ov.style.display='flex';
  ov.innerHTML='<div style="background:#fff;border-radius:14px;padding:30px 40px;font-family:Inter,sans-serif;font-weight:600;color:#475569;display:flex;align-items:center;gap:12px"><div class="spinner" style="width:22px;height:22px;border-width:3px"></div> Generazione anteprima report…</div>';
  _buildAnalyticsReportHTML().then(function(bodyHtml){
    var inner = '<div class="an-rep">'+_anReportHead()+bodyHtml+'<div class="an-rep-foot">Documento generato automaticamente da Le case dalla A allo Z.io — '+new Date().toLocaleString('it-IT')+'</div></div>';
    ov.innerHTML=''
      + '<div style="background:#F1F5F9;border-radius:14px;width:100%;max-width:920px;height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)">'
      +   '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:#fff;border-bottom:1px solid #E2E8F0;flex-shrink:0">'
      +     '<div style="font-weight:800;color:#1E293B;font-size:1rem;display:flex;align-items:center;gap:9px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Anteprima — '+_anSezioneAttiva()+'</div>'
      +     '<div style="display:flex;gap:8px">'
      +       '<button onclick="anStampaReport()" style="display:flex;align-items:center;gap:7px;background:#2563EB;color:#fff;border:none;border-radius:9px;padding:9px 18px;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Stampa / PDF</button>'
      +       '<button onclick="anChiudiAnteprima()" style="background:#F1F5F9;color:#475569;border:1px solid #CBD5E1;border-radius:9px;padding:9px 14px;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit">Chiudi</button>'
      +     '</div>'
      +   '</div>'
      +   '<div style="flex:1;overflow:auto;padding:24px;display:flex;justify-content:center">'
      +     '<div style="background:#fff;width:210mm;min-height:297mm;padding:12mm 11mm;box-shadow:0 4px 20px rgba(0,0,0,.15);"><style>'+_anReportCSS()+'</style>'+inner+'</div>'
      +   '</div>'
      + '</div>';
    window._anReportBody=inner; // memorizza per la stampa
  });
}

function anChiudiAnteprima(){ var ov=document.getElementById('an-prev-overlay'); if(ov) ov.style.display='none'; }

/* Stampa il report già generato nell'anteprima (apre la finestra di stampa) */
function anStampaReport(){
  var inner=window._anReportBody;
  if(!inner){ stampaAnalytics(); return; }
  var w=window.open('','_blank');
  if(!w){ alert('Consenti i popup per stampare il report.'); return; }
  w.document.open();
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statistiche & Analytics</title><style>'+_anReportCSS()+'</style></head><body>'+inner+'</body></html>');
  w.document.close();
  setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 350);
}

/* Stampa diretta (genera il report e apre la stampa senza anteprima) */
function stampaAnalytics(){
  var mc=document.getElementById('an-main-content');
  if(!mc){ window.print(); return; }
  if(typeof showToast==='function') showToast('Preparazione report…','','#2563EB');
  _buildAnalyticsReportHTML().then(function(bodyHtml){
    var inner='<div class="an-rep">'+_anReportHead()+bodyHtml+'<div class="an-rep-foot">Documento generato automaticamente da Le case dalla A allo Z.io — '+new Date().toLocaleString('it-IT')+'</div></div>';
    var w=window.open('','_blank');
    if(!w){ alert('Consenti i popup per stampare il report.'); return; }
    w.document.open();
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statistiche & Analytics</title><style>'+_anReportCSS()+'</style></head><body>'+inner+'</body></html>');
    w.document.close();
    setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 400);
  });
}

/* Esponi su window: gli onclick inline dei pulsanti dell'anteprima vivono nello
   scope globale, mentre queste funzioni sono dentro l'IIFE di AN (window.AN=...). */
try{
  window.anteprimaAnalytics = anteprimaAnalytics;
  window.anStampaReport = anStampaReport;
  window.anChiudiAnteprima = anChiudiAnteprima;
  window.stampaAnalytics = stampaAnalytics;
}catch(_e){}

function renderAllStats(){var ap=document.querySelector('#sec-analytics .stat-panel.active');if(!ap)return;var tab=ap.id.replace('an-stat-panel-','');if(tab==='panoramica')rPan();else if(tab==='immobili')rImm();else if(tab==='vendite')rVend();else if(tab==='visite')rVis();else if(tab==='clienti')rCli();else if(tab==='singolo')renderSingolo();}

// PANORAMICA
function rPan(){
  var data=_D();
  var imm=data.immobili||[];
  var prat=_fA(_fD(data.pratiche,'dataRogito'));
  var vis=_fA(_fD(data.visite,'data'));
  var prov=prat.reduce(function(s,p){return s+(parseFloat(p.provvigione)||0);},0);
  var att=imm.filter(function(i){return i.stato==='attivo';}).length;
  var rog=prat.filter(function(p){return['venduto','chiuso','vendita'].includes((p.stato||'').toLowerCase());}).length;
  var d30=new Date();d30.setDate(d30.getDate()+30);
  var inc=imm.filter(function(im){return im.incFine&&new Date(im.incFine+'T00:00:00')<=d30&&new Date(im.incFine+'T00:00:00')>=new Date();}).length;
  var ke=document.getElementById('an-kpi-panoramica');if(!ke)return;
  ke.innerHTML=
    _kpi('blue','<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',imm.length,'Immobili in portafoglio')+
    _kpi('green','<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',(data.clienti||[]).length,'Clienti totali')+
    _kpi('gold','<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',rog,'Rogiti nel periodo')+
    _kpi('purple','<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',_eu(prov),'Provvigioni periodo')+
    _kpi('teal','<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',vis.length,'Visite effettuate')+
    _kpi('red','<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',att,'Immobili attivi')+
    _kpi('orange','<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>',inc,'Incarichi scad. 30gg');
  var mn=_lm(_sPD<=90?6:(_sPD<=365?12:18));
  var im2={},pr2={};mn.forEach(function(m){im2[m]=0;pr2[m]=0;});
  imm.forEach(function(i){var k=_mk(i.data||'');if(k&&im2.hasOwnProperty(k))im2[k]++;});
  prat.forEach(function(p){var k=_mk(p.dataRogito||'');if(k&&pr2.hasOwnProperty(k))pr2[k]++;});
  _mc('an-chart-portafoglio',{type:'bar',data:{labels:mn.map(_ml),datasets:[{label:'Nuovi incarichi',data:mn.map(function(m){return im2[m]||0;}),backgroundColor:'rgba(37,99,235,0.75)',borderRadius:5,borderSkipped:false},{label:'Rogiti',data:mn.map(function(m){return pr2[m]||0;}),backgroundColor:'rgba(21,128,61,0.75)',borderRadius:5,borderSkipped:false}]},options:_co({})});
  var tc={};imm.forEach(function(i){var t=i.tipo||'Altro';tc[t]=(tc[t]||0)+1;});var tk=Object.keys(tc).sort(function(a,b){return tc[b]-tc[a];}).slice(0,7);
  _mc('an-chart-tipo-imm',{type:'doughnut',data:{labels:tk,datasets:[{data:tk.map(function(k){return tc[k];}),backgroundColor:PAL.mixed,borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.label+': '+c.raw;}}}}}});
  var leg=document.getElementById('an-chart-tipo-legend');if(leg)leg.innerHTML=tk.map(function(k,i){return'<span style="display:flex;align-items:center;gap:4px;font-size:0.68rem;font-weight:600;color:var(--text2)"><span style="width:8px;height:8px;border-radius:2px;background:'+PAL.mixed[i%PAL.mixed.length]+';flex-shrink:0"></span>'+k+'</span>';}).join('');
  var pv2={};mn.forEach(function(m){pv2[m]=0;});prat.forEach(function(p){var k=_mk(p.dataRogito||'');if(k&&pv2.hasOwnProperty(k))pv2[k]+=parseFloat(p.provvigione)||0;});
  _mc('an-chart-provvigioni',{type:'line',data:{labels:mn.map(_ml),datasets:[{label:'Provvigioni (\u20ac)',data:mn.map(function(m){return Math.round(pv2[m]||0);}),borderColor:PAL.green[0],backgroundColor:'rgba(21,128,61,0.08)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:PAL.green[0],fill:true,tension:0.4}]},options:_co({scales:{y:{ticks:{callback:function(v){return'\u20ac'+v.toLocaleString('it-IT');}}}}})}); 
  var totP=(data.pratiche||[]).filter(function(p){return!['venduto','chiuso','vendita'].includes((p.stato||'').toLowerCase());}).length;
  _rfun('an-funnel-commerciale',[{label:'Visite effettuate',val:vis.length,color:PAL.blue[0]},{label:'Proposte/Trattative',val:totP,color:PAL.gold[0]},{label:'Rogiti conclusi',val:rog,color:PAL.green[0]}]);
  _rtag();
}

function _rfun(id,steps){var el=document.getElementById(id);if(!el)return;var mx=steps[0]?steps[0].val:1;if(!mx)mx=1;el.innerHTML=steps.map(function(s){var pc=(s.val/mx*100).toFixed(0);return'<div class="funnel-step"><div class="funnel-label">'+s.label+'</div><div class="funnel-bar-cont"><div class="funnel-bar-bg"><div class="funnel-bar-fill" style="width:'+pc+'%;background:'+s.color+'">'+(pc>15?s.val:'')+'<span class="funnel-pct">'+(pc>8?pc+'%':'')+'</span></div></div></div><div class="funnel-val">'+s.val+'</div></div>';}).join('');}

function _rtag(){var data=_D();var vis=_fD(data.visite,'data');var prat=_fD(data.pratiche,'dataRogito');var am={};function _a(n){if(!n)return;if(!am[n])am[n]={nome:n,imm:0,visite:0,pratiche:0,provv:0,agLordo:0,agNetto:0};}(data.immobili||[]).forEach(function(i){_a(i.agente);if(i.agente)am[i.agente].imm++;});vis.forEach(function(v){_a(v.agente);if(v.agente)am[v.agente].visite++;});prat.forEach(function(p){_a(p.agente);if(p.agente){am[p.agente].pratiche++;am[p.agente].provv+=parseFloat(p.provvigione)||0;am[p.agente].agLordo+=parseFloat(p.provvAgenteLordo)||0;am[p.agente].agNetto+=parseFloat(p.provvAgenteNetto)||0;}});var ag=Object.values(am).sort(function(a,b){return (b.agLordo||b.provv)-(a.agLordo||a.provv);});var mx=ag[0]?(ag[0].agLordo||ag[0].provv||1):1;var tb=document.getElementById('an-tbody-agenti');if(!tb)return;if(!ag.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--text4);padding:24px">Nessun dato agente nel periodo</td></tr>';return;}tb.innerHTML=ag.map(function(a,i){var cv=a.visite?(a.pratiche/a.visite*100).toFixed(0)+'%':'\u2014';var pp=mx?(((a.agLordo||a.provv)/mx)*100).toFixed(0):0;var bc=[PAL.gold[0],PAL.blue[0],PAL.green[0],PAL.purple[0]][i%4];return'<tr><td style="font-weight:700;color:var(--text3)">'+(i+1)+'</td><td><div style="font-weight:700">'+a.nome+'</div></td><td style="text-align:center">'+a.imm+'</td><td style="text-align:center">'+a.visite+'</td><td style="text-align:center">'+a.pratiche+'</td><td style="font-weight:700;color:var(--green)">'+_eu(a.agLordo||0)+'<div style="font-size:0.68rem;color:var(--text3);font-weight:600">netto '+_eu(a.agNetto||0)+'</div><div style="font-size:0.66rem;color:var(--text4);font-weight:500">agenzia '+_eu(a.provv||0)+'</div></td><td style="text-align:center">'+cv+'</td><td style="min-width:100px"><div class="progress-bar-wrap"><div class="progress-bar"><div class="progress-fill" style="width:'+pp+'%;background:'+bc+'"></div></div><span style="font-size:0.72rem;font-weight:700;color:var(--text3)">'+pp+'%</span></div></td></tr>';}).join('');}

// IMMOBILI
function rImm(){
  var data=_D();var imm=data.immobili||[];
  var att=imm.filter(function(i){return i.stato==='attivo';});
  var ve=imm.filter(function(i){return i.stato==='venduto';});
  var pr=imm.filter(function(i){return i.prezzo;}).map(function(i){return parseFloat(i.prezzo)||0;});
  var mq=imm.filter(function(i){return i.mq;}).map(function(i){return parseFloat(i.mq)||0;});
  var pm=pr.length?Math.round(pr.reduce(function(a,b){return a+b;},0)/pr.length):0;
  var mm=mq.length?Math.round(mq.reduce(function(a,b){return a+b;},0)/mq.length):0;
  var ke=document.getElementById('an-kpi-immobili');if(!ke)return;
  ke.innerHTML=_kpi('blue','<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',imm.length,'Immobili totali')+_kpi('green','<polyline points="20 6 9 17 4 12"/>',att.length,'Attivi')+_kpi('gold','<line x1="18" y1="20" x2="18" y2="10"/>',_eu(pm),'Prezzo medio')+_kpi('purple','<rect x="3" y="3" width="18" height="18" rx="2"/>',mm+' m\u00b2','Superficie media')+_kpi('teal','<path d="M12 2L2 7l10 5 10-5-10-5z"/>',pm&&mm?_eu(Math.round(pm/mm))+'/m\u00b2':'\u2014','Prezzo medio al m\u00b2')+_kpi('red','<circle cx="12" cy="12" r="10"/>',ve.length,'Venduti');
  var z={};imm.forEach(function(i){var c=i.comune||'N/D';if(!z[c])z[c]={pr:[],n:0};z[c].n++;if(i.prezzo)z[c].pr.push(parseFloat(i.prezzo)||0);});
  var za=Object.keys(z).map(function(c){var av=z[c].pr.length?Math.round(z[c].pr.reduce(function(a,b){return a+b;},0)/z[c].pr.length):0;return{zona:c,avg:av,count:z[c].n};}).filter(function(x){return x.avg>0;}).sort(function(a,b){return b.avg-a.avg;}).slice(0,12);
  _mc('an-chart-prezzi-zona',{type:'bar',data:{labels:za.map(function(x){return x.zona;}),datasets:[{label:'Prezzo medio (\u20ac)',data:za.map(function(x){return x.avg;}),backgroundColor:za.map(function(_,i){return'rgba(37,99,235,'+(0.35+i*0.06)+')';}),borderRadius:5,borderSkipped:false}]},options:_co({indexAxis:'y',scales:{x:{ticks:{callback:function(v){return'\u20ac'+v.toLocaleString('it-IT');}}},y:{ticks:{font:{size:11}}}}})});
  var sc={};imm.forEach(function(i){var s=i.stato||'N/D';sc[s]=(sc[s]||0)+1;});var sk=Object.keys(sc);var sco={attivo:'#15803D',venduto:'#2563EB',proposta:'#D97706','non attivo':'#94A3B8'};
  _mc('an-chart-stato-imm',{type:'doughnut',data:{labels:sk,datasets:[{data:sk.map(function(k){return sc[k];}),backgroundColor:sk.map(function(k){return sco[k]||PAL.mixed[0];}),borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{size:11},padding:8}}}}});
  var fa=[0,40,60,80,100,130,160,200,300,99999],fl=['<40','40-60','60-80','80-100','100-130','130-160','160-200','200-300','>300'],fc=new Array(fl.length).fill(0);
  imm.forEach(function(i){var m=parseFloat(i.mq)||0;if(!m)return;for(var f=0;f<fa.length-1;f++){if(m>=fa[f]&&m<fa[f+1]){fc[f]++;break;}}});
  _mc('an-chart-mq-dist',{type:'bar',data:{labels:fl,datasets:[{label:'N\u00b0 immobili',data:fc,backgroundColor:'rgba(124,58,237,0.7)',borderRadius:5,borderSkipped:false}]},options:_co({})});
  var sd=imm.filter(function(i){return i.prezzo&&i.mq;}).map(function(i){return{x:parseFloat(i.mq)||0,y:parseFloat(i.prezzo)||0,label:i.indirizzo||i.comune||''};});
  _mc('an-chart-scatter',{type:'scatter',data:{datasets:[{label:'Immobili',data:sd,backgroundColor:'rgba(37,99,235,0.5)',pointRadius:5,pointHoverRadius:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return(c.raw.label||'')+': '+Math.round(c.raw.x)+'m\u00b2 \u2014 '+_eu(c.raw.y);}}}},scales:{x:{title:{display:true,text:'Superficie (m\u00b2)',font:{size:11}}},y:{title:{display:true,text:'Prezzo (\u20ac)',font:{size:11}},ticks:{callback:function(v){return'\u20ac'+v.toLocaleString('it-IT');}}}}}});
  var he=document.getElementById('an-zone-heat');if(he&&za.length){var mx=za[0].avg||1;he.innerHTML=za.map(function(x){var it=x.avg/mx;var r=Math.round(37+(220-37)*it),g=Math.round(99+(38-99)*(1-it)),b=Math.round(235+(38-235)*(1-it));var bg='rgba('+r+','+g+','+b+',0.12)',bo='rgba('+r+','+g+','+b+',0.4)',tc=it>0.5?'rgb('+r+','+g+','+b+')':'var(--text3)';return'<div class="zone-card" style="background:'+bg+';border-color:'+bo+'"><div class="zone-name">'+x.zona+'</div><div class="zone-price" style="color:'+tc+'">'+_eu(x.avg)+'</div><div class="zone-count">'+x.count+' imm.</div></div>';}).join('');}
}

// VENDITE
function rVend(){
  var data=_D();var pa=_fA(_fD(data.pratiche,'dataRogito'));
  var ro=pa.filter(function(p){return['venduto','chiuso','vendita'].includes((p.stato||'').toLowerCase());});
  var tv=ro.reduce(function(s,p){return s+(parseFloat(p.importoVendita)||0);},0);
  var tp=pa.reduce(function(s,p){return s+(parseFloat(p.provvigione)||0);},0);
  var tAgL=pa.reduce(function(s,p){return s+(parseFloat(p.provvAgenteLordo)||0);},0);
  var tAgN=pa.reduce(function(s,p){return s+(parseFloat(p.provvAgenteNetto)||0);},0);
  // Fallback: se il collegamento pratica↔provvigione non produce nulla,
  // usa i totali del gestionale (sezione Provvigioni).
  if(tp<=0 && data._provTotaleGlobale>0) tp=data._provTotaleGlobale;
  if(tAgL<=0 && data._provAgenteLordoGlobale>0) tAgL=data._provAgenteLordoGlobale;
  if(tAgN<=0 && data._provAgenteNettoGlobale>0) tAgN=data._provAgenteNettoGlobale;
  // Quota agenzia = totale provvigione meno quota lorda agente
  var tAgz=Math.max(0, tp - tAgL);
  // Volume: se nessun importo dalle pratiche, prova dagli importi provvigione.
  if(tv<=0 && Array.isArray(data.provvigioni) && data.provvigioni.length){
    tv=data.provvigioni.reduce(function(s,pv){return s+(parseFloat(pv&&pv.importoVendita)||0);},0);
  }
  var pm=ro.length?Math.round(tv/ro.length):0;
  var ke=document.getElementById('an-kpi-vendite');if(!ke)return;
  ke.innerHTML=_kpi('green','<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>',ro.length,'Rogiti nel periodo')+_kpi('gold','<line x1="12" y1="1" x2="12" y2="23"/>',_eu(tv),'Volume transazioni')+_kpi('blue','<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',_eu(tp),'Provvigioni totali (lordo)')+_kpi('gold','<path d="M3 21h18M5 21V7l7-4 7 4v14"/>',_eu(tAgz),'Quota Agenzia')+_kpi('green','<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0113 0"/>',_eu(tAgL),'Quota Agenti (lordo)')+_kpi('teal','<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0113 0"/>',_eu(tAgN),'Quota Agenti (netto)')+_kpi('purple','<rect x="2" y="3" width="20" height="14" rx="2"/>',_eu(pm),'Prezzo medio rogito')+_kpi('orange','<circle cx="12" cy="12" r="10"/>',pa.filter(function(p){return!['venduto','chiuso','vendita'].includes((p.stato||'').toLowerCase());}).length,'In corso');
  var mn=_lm(_sPD<=90?6:12);var vbm={},pbm={};mn.forEach(function(m){vbm[m]=0;pbm[m]=0;});
  ro.forEach(function(p){var k=_mk(p.dataRogito||'');if(k&&vbm.hasOwnProperty(k)){vbm[k]+=parseFloat(p.importoVendita)||0;pbm[k]+=parseFloat(p.provvigione)||0;}});
  // Aggiungi al grafico le provvigioni non collegate ad alcuna pratica.
  (data._provOrfane||[]).forEach(function(pv){
    var dt=pv.dataPagamento||pv.data||pv.dataCreazione||pv.drogito||'';
    var k=_mk(dt);
    if(k&&pbm.hasOwnProperty(k)){
      pbm[k]+=(parseFloat(pv.totale)||(parseFloat(pv.quotaV)||0)+(parseFloat(pv.quotaA)||0));
      vbm[k]+=parseFloat(pv.importoVendita)||0;
    }
  });
  _mc('an-chart-vendite-tempo',{type:'bar',data:{labels:mn.map(_ml),datasets:[{label:'Volume (\u20ac)',data:mn.map(function(m){return Math.round(vbm[m]||0);}),backgroundColor:'rgba(37,99,235,0.7)',borderRadius:5,borderSkipped:false,yAxisID:'y'},{label:'Provvigioni (\u20ac)',data:mn.map(function(m){return Math.round(pbm[m]||0);}),type:'line',borderColor:PAL.green[0],backgroundColor:'transparent',borderWidth:2.5,pointRadius:4,pointBackgroundColor:PAL.green[0],yAxisID:'y1'}]},options:_co({scales:{y:{type:'linear',position:'left',ticks:{callback:function(v){return'\u20ac'+v.toLocaleString('it-IT');}}},y1:{type:'linear',position:'right',grid:{drawOnChartArea:false},ticks:{callback:function(v){return'\u20ac'+v.toLocaleString('it-IT');}}}},x:{grid:{color:'rgba(226,232,240,0.6)'},ticks:{font:{size:11}}}})}); 
  var sp={};(data.pratiche||[]).forEach(function(p){var s=p.stato||'N/D';sp[s]=(sp[s]||0)+1;});var sk=Object.keys(sp);
  _mc('an-chart-stato-pratiche',{type:'doughnut',data:{labels:sk,datasets:[{data:sk.map(function(k){return sp[k];}),backgroundColor:PAL.mixed,borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{size:11},padding:6}}}}});
  var tbm={},cbm={};mn.forEach(function(m){tbm[m]=0;cbm[m]=0;});ro.forEach(function(p){var dR=new Date(p.dataRogito||'');var dI=new Date(p.dataInizio||p.dataAcq||'');if(!isNaN(dR)&&!isNaN(dI)&&dR>dI){var g=(dR-dI)/86400000;var k=_mk(p.dataRogito||'');if(k&&tbm.hasOwnProperty(k)){tbm[k]+=g;cbm[k]++;}}});
  _mc('an-chart-tempo-rogito',{type:'line',data:{labels:mn.map(_ml),datasets:[{label:'Giorni medi',data:mn.map(function(m){return cbm[m]?Math.round(tbm[m]/cbm[m]):null;}),borderColor:PAL.purple[0],backgroundColor:'rgba(124,58,237,0.08)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:PAL.purple[0],fill:true,tension:0.4,spanGaps:true}]},options:_co({scales:{y:{ticks:{callback:function(v){return v+' gg';}}}}})}); 
  var fs=[0,1,2,3,5,8,12,100],fl=['0-1%','1-2%','2-3%','3-5%','5-8%','8-12%','>12%'],fc=new Array(fl.length).fill(0);
  ro.forEach(function(p){var pI=parseFloat(p.prezzoInizio||0)||0,pF=parseFloat(p.importoVendita)||0;if(!pI||!pF||pF>=pI)return;var sc=(pI-pF)/pI*100;for(var f=0;f<fs.length-1;f++){if(sc>=fs[f]&&sc<fs[f+1]){fc[f]++;break;}}});
  _mc('an-chart-sconto',{type:'bar',data:{labels:fl,datasets:[{label:'N\u00b0 trattative',data:fc,backgroundColor:PAL.gold,borderRadius:5,borderSkipped:false}]},options:_co({})});
}

// VISITE
function rVis(){
  var data=_D();var vis=_fA(_fD(data.visite,'data'));var att=_fD(data.attivita||[],'data');
  var pos=vis.filter(function(v){return(v.esito||'').toUpperCase()==='POSITIVO';}).length;
  var neg=vis.filter(function(v){return['RIFIUTATO','NEGATIVO'].includes((v.esito||'').toUpperCase());}).length;
  var ke=document.getElementById('an-kpi-visite');if(!ke)return;
  ke.innerHTML=_kpi('blue','<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',vis.length,'Visite nel periodo')+_kpi('green','<polyline points="20 6 9 17 4 12"/>',pos,'Esito positivo')+_kpi('red','<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',neg,'Esito negativo')+_kpi('gold','<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',vis.length?(vis.length/((_sPD||365)/7)).toFixed(1):'0','Media visite/settimana')+_kpi('purple','<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>',att.length,'Attivit\u00e0')+_kpi('teal','<rect x="3" y="4" width="18" height="18" rx="2"/>',pos&&vis.length?_pc(pos,vis.length):'\u2014','Conv. visita');
  var mn=_lm(_sPD<=90?6:12);var vm={};mn.forEach(function(m){vm[m]=0;});vis.forEach(function(v){var k=_mk(v.data||'');if(k&&vm.hasOwnProperty(k))vm[k]++;});
  _mc('an-chart-visite-mese',{type:'bar',data:{labels:mn.map(_ml),datasets:[{label:'Visite',data:mn.map(function(m){return vm[m]||0;}),backgroundColor:'rgba(37,99,235,0.7)',borderRadius:5,borderSkipped:false}]},options:_co({})});
  _mc('an-chart-esito-visite',{type:'doughnut',data:{labels:['Positivo','Negativo','In attesa'],datasets:[{data:[pos,neg,vis.length-pos-neg],backgroundColor:[PAL.green[0],PAL.red[0],PAL.gold[1]],borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{size:11},padding:8}}}}});
  _rheat(vis,att);
  var ba={};vis.forEach(function(v){var a=v.agente||'N/D';ba[a]=(ba[a]||0)+1;});var aa=Object.keys(ba).sort(function(a,b){return ba[b]-ba[a];}).slice(0,8);
  _mc('an-chart-visite-agente',{type:'bar',data:{labels:aa,datasets:[{label:'Visite',data:aa.map(function(a){return ba[a];}),backgroundColor:aa.map(function(_,i){return PAL.mixed[i%PAL.mixed.length];}),borderRadius:5,borderSkipped:false}]},options:_co({indexAxis:'y'})});
  var dn=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'],dc=new Array(7).fill(0);vis.forEach(function(v){var d=new Date(v.data||'');if(!isNaN(d))dc[d.getDay()]++;});
  _mc('an-chart-visite-dow',{type:'bar',data:{labels:dn,datasets:[{label:'Visite',data:dc,backgroundColor:['rgba(37,99,235,0.3)','rgba(37,99,235,0.8)','rgba(37,99,235,0.8)','rgba(37,99,235,0.8)','rgba(37,99,235,0.8)','rgba(37,99,235,0.8)','rgba(37,99,235,0.3)'],borderRadius:5,borderSkipped:false}]},options:_co({})});
}

function _rheat(vis,att){
  var el=document.getElementById('an-heatmap-activity');if(!el)return;
  var dm={};var td=new Date();td.setHours(0,0,0,0);var st=new Date(td.getTime()-364*86400000);
  for(var i=0;i<365;i++){var d=new Date(st.getTime()+i*86400000);dm[d.toISOString().slice(0,10)]=0;}
  vis.forEach(function(v){var k=(v.data||'').slice(0,10);if(dm.hasOwnProperty(k))dm[k]++;});
  (att||[]).forEach(function(a){var k=(a.data||a.creato||'').slice(0,10);if(dm.hasOwnProperty(k))dm[k]+=0.5;});
  var mx=Math.max.apply(null,Object.values(dm))||1;var dy=Object.keys(dm).sort();
  var fw=new Date(dy[0]).getDay(),wk=[],cur=new Array(fw).fill(null);
  dy.forEach(function(k){cur.push(k);if(cur.length===7){wk.push(cur);cur=[];}});if(cur.length)wk.push(cur);
  var M=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'],lm=null;
  var h='<div style="display:flex;gap:3px;align-items:flex-start;min-width:600px"><div style="display:flex;flex-direction:column;gap:2px;margin-right:4px;padding-top:16px">';
  ['','Lun','','Mer','','Ven',''].forEach(function(x){h+='<div style="height:12px;font-size:9px;color:var(--text4);font-weight:600;line-height:12px">'+x+'</div>';});
  h+='</div><div style="display:flex;gap:2px">';
  wk.forEach(function(w){var fr=w.find(function(x){return x;});var mo=fr?parseInt(fr.slice(5,7)):null;h+='<div style="display:flex;flex-direction:column;gap:2px"><div style="height:14px;font-size:9px;color:var(--text4);font-weight:700;white-space:nowrap">'+(mo&&mo!==lm?M[mo-1]:'')+'</div>';if(mo!==lm&&mo)lm=mo;for(var d=0;d<7;d++){var k=w[d];if(!k){h+='<div style="width:12px;height:12px;border-radius:2px"></div>';continue;}var v=dm[k]||0;var al=(0.08+v/mx*0.92).toFixed(2);var dt=new Date(k);h+='<div style="width:12px;height:12px;border-radius:2px;background:rgba(37,99,235,'+al+')" title="'+dt.toLocaleDateString('it-IT',{day:'numeric',month:'short'})+': '+Math.round(v)+' att."></div>';}h+='</div>';});
  h+='</div></div><div style="display:flex;align-items:center;gap:4px;margin-top:8px;justify-content:flex-end"><span style="font-size:9px;color:var(--text4);font-weight:600">Meno</span>';
  [0.08,0.3,0.55,0.75,1].forEach(function(a){h+='<div style="width:10px;height:10px;border-radius:2px;background:rgba(37,99,235,'+a+')"></div>';});
  h+='<span style="font-size:9px;color:var(--text4);font-weight:600">Pi\u00f9</span></div>';el.innerHTML=h;
}

// CLIENTI
function rCli(){
  var data=_D();var cli=data.clienti||[];var rich=data.richieste||[];var info=data.informatori||[];
  var ac=cli.filter(function(c){return(c.tipo||'').toLowerCase()==='acquirente';}).length;
  var ve=cli.filter(function(c){return(c.tipo||'').toLowerCase()==='venditore';}).length;
  var ke=document.getElementById('an-kpi-clienti');if(!ke)return;
  ke.innerHTML=_kpi('blue','<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>',cli.length,'Clienti totali')+_kpi('green','<circle cx="8.5" cy="7" r="4"/>',ac,'Acquirenti')+_kpi('gold','<circle cx="12" cy="7" r="4"/>',ve,'Venditori')+_kpi('purple','<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>',rich.length,'Richieste')+_kpi('teal','<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>',info.length,'Informatori')+_kpi('orange','<circle cx="12" cy="12" r="10"/>',rich.filter(function(r){return(r.stato||'').toLowerCase().startsWith('aper');}).length,'Richieste aperte');
  var mn=_lm(12);var cm={};mn.forEach(function(m){cm[m]=0;});cli.forEach(function(c){var k=_mk(c.creato||'');if(k&&cm.hasOwnProperty(k))cm[k]++;});
  _mc('an-chart-nuovi-clienti',{type:'line',data:{labels:mn.map(_ml),datasets:[{label:'Nuovi clienti',data:mn.map(function(m){return cm[m]||0;}),borderColor:PAL.blue[0],backgroundColor:'rgba(37,99,235,0.08)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:PAL.blue[0],fill:true,tension:0.4}]},options:_co({})});
  var tc={};cli.forEach(function(c){var t=c.tipo||'N/D';tc[t]=(tc[t]||0)+1;});var tk=Object.keys(tc);
  _mc('an-chart-tipo-cliente',{type:'doughnut',data:{labels:tk,datasets:[{data:tk.map(function(k){return tc[k];}),backgroundColor:PAL.mixed,borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{size:10},padding:6}}}}});
  var sr={};rich.forEach(function(r){var s=r.stato||'N/D';sr[s]=(sr[s]||0)+1;});var srk=Object.keys(sr);
  _mc('an-chart-stato-richieste',{type:'doughnut',data:{labels:srk,datasets:[{data:srk.map(function(k){return sr[k];}),backgroundColor:[PAL.green[0],PAL.blue[0],PAL.gold[0],PAL.red[0],PAL.purple[0]],borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{size:10},padding:6}}}}});
  var bu=rich.map(function(r){return r.budgetMax||0;}).filter(Boolean);var fb=[0,50000,100000,150000,200000,300000,500000,99999999],fl=['<50k','50-100k','100-150k','150-200k','200-300k','300-500k','>500k'],fc=new Array(fl.length).fill(0);bu.forEach(function(b){for(var f=0;f<fb.length-1;f++){if(b>=fb[f]&&b<fb[f+1]){fc[f]++;break;}}});
  _mc('an-chart-budget-dist',{type:'bar',data:{labels:fl,datasets:[{label:'N\u00b0 richieste',data:fc,backgroundColor:PAL.blue.map(function(_,i){return'rgba(37,99,235,'+(0.35+i*0.15)+')';}),borderRadius:5,borderSkipped:false}]},options:_co({scales:{y:{ticks:{stepSize:1}}}})});
  var ti=document.getElementById('an-top-informatori-list');if(ti){var si=info.slice().sort(function(a,b){return(parseInt(b.segnalazioni)||0)-(parseInt(a.segnalazioni)||0);}).slice(0,6);var ms=si[0]?parseInt(si[0].segnalazioni)||1:1;ti.innerHTML=si.length?si.map(function(x,i){var sg=parseInt(x.segnalazioni)||0;var pp=(sg/ms*100).toFixed(0);return'<div style="display:flex;align-items:center;gap:8px"><div style="width:26px;height:26px;border-radius:50%;background:'+PAL.mixed[i%PAL.mixed.length]+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;flex-shrink:0">'+(i+1)+'</div><div style="flex:1;min-width:0"><div style="font-size:0.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(x.nome||x.cognome||'N/D')+'</div><div style="height:5px;background:var(--bg3);border-radius:3px;margin-top:3px"><div style="height:100%;border-radius:3px;background:'+PAL.mixed[i%PAL.mixed.length]+';width:'+pp+'%"></div></div></div><div style="font-size:0.8rem;font-weight:800;flex-shrink:0">'+sg+'</div></div>';}).join(''):'<div style="padding:16px;text-align:center;color:var(--text4);font-size:0.82rem">Nessun informatore</div>';}
}

// SINGOLO IMMOBILE
function renderSingolo(){
  var pk=document.getElementById('an-singolo-picker'),ct=document.getElementById('an-singolo-content');
  if(!pk||!ct)return;
  var idx=parseInt(pk.value);
  if(isNaN(idx)||pk.value===''){ct.innerHTML='<div class="stat-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><p>Seleziona un immobile per visualizzare le statistiche dettagliate</p></div>';return;}
  var data=_D();var im=(data.immobili||[])[idx];
  if(!im){ct.innerHTML='<div class="stat-empty"><p>Immobile non trovato</p></div>';return;}
  var vi=(data.visite||[]).filter(function(v){return String(v.immRef)===String(idx);});
  var pi=(data.pratiche||[]).filter(function(p){return String(p.immRef)===String(idx);});
  var gg=im.data?Math.round((new Date()-new Date(im.data))/86400000):null;
  var sc={'attivo':'attivo','venduto':'venduto','proposta':'proposta','non attivo':'non-attivo'}[im.stato]||'non-attivo';
  ct.innerHTML=
    '<div style="background:linear-gradient(135deg,#1E3A8A,#2563EB);border-radius:var(--radius-lg);padding:22px 24px;margin-bottom:18px;color:white;">'+
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">'+
    '<div><div style="font-size:0.72rem;font-weight:600;opacity:.7;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">'+(im.tipo||'Immobile')+'</div>'+
    '<div style="font-size:1.3rem;font-weight:800;letter-spacing:-.03em;margin-bottom:4px">'+(im.indirizzo||im.via||'Indirizzo N/D')+'</div>'+
    '<div style="font-size:0.85rem;opacity:.85">'+(im.comune||''+(im.mq?' \u00b7 '+im.mq+' m\u00b2':'')+(im.prezzo?' \u00b7 '+_eu(im.prezzo):''))+'</div></div>'+
    '<div style="text-align:right"><span class="stato-chip '+sc+'" style="background:rgba(255,255,255,.15);color:white;border:1px solid rgba(255,255,255,.2)">'+(im.stato||'\u2014')+'</span>'+
    (gg?'<div style="font-size:0.72rem;opacity:.65;margin-top:6px">'+gg+' giorni in portafoglio</div>':'')+
    '</div></div></div>'+
    _anGallery(im)+
    '<div class="kpi-grid" style="margin-bottom:18px">'+
    _kpi('blue','<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',vi.length,'Visite effettuate')+
    _kpi('gold','<line x1="18" y1="20" x2="18" y2="10"/>',pi.length,'Pratiche')+
    _kpi('green','<polyline points="20 6 9 17 4 12"/>',vi.filter(function(v){return(v.esito||'').toUpperCase()==='POSITIVO';}).length,'Feedback positivi')+
    _kpi('purple','<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',gg?gg+' gg':'\u2014','In portafoglio')+
    '</div>'+
    '<div class="chart-card"><div class="chart-head"><div><div class="chart-title">Storico Visite</div><div class="chart-sub">Cronologia e feedback</div></div></div>'+
    _rvtl(vi)+'</div>';
}

function _anGallery(im){
  var fotos = (im && im._foto && im._foto.length) ? im._foto : _anFotoList(im);
  if(!fotos || !fotos.length){
    return '<div class="chart-card" style="margin-bottom:18px"><div class="stat-empty" style="padding:22px">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>'+
      '<p>Nessuna foto disponibile per questo immobile</p></div></div>';
  }
  var main = fotos[0];
  var thumbs = '';
  if(fotos.length > 1){
    thumbs = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'+
      fotos.map(function(f,i){
        return '<img src="'+f+'" alt="Foto '+(i+1)+'" loading="lazy" '+
          'onclick="(function(el){var m=el.closest(&quot;.chart-card&quot;).querySelector(&quot;.an-foto-main&quot;);if(m)m.src=el.src;})(this)" '+
          'style="width:74px;height:56px;object-fit:cover;border-radius:8px;border:1.5px solid var(--border);cursor:pointer;flex-shrink:0;transition:border-color .15s" '+
          'onmouseover="this.style.borderColor=&quot;var(--brand)&quot;" onmouseout="this.style.borderColor=&quot;var(--border)&quot;">';
      }).join('')+'</div>';
  }
  return '<div class="chart-card" style="margin-bottom:18px;padding:14px 16px">'+
    '<div class="chart-head" style="margin-bottom:10px"><div><div class="chart-title">Galleria Immobile</div>'+
    '<div class="chart-sub">'+fotos.length+(fotos.length===1?' foto':' foto')+'</div></div></div>'+
    '<img class="an-foto-main" src="'+main+'" alt="Foto immobile" '+
    'style="width:100%;max-height:340px;object-fit:cover;border-radius:var(--radius-lg);display:block;background:var(--bg3)">'+
    thumbs+'</div>';
}

function _rvtl(vis){
  if(!vis.length)return'<div class="stat-empty" style="padding:14px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></svg><p>Nessuna visita registrata</p></div>';
  var so=vis.slice().sort(function(a,b){return new Date(b.data)-new Date(a.data);}).slice(0,15);
  return'<div style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto">'+
    so.map(function(v){var d=v.data?new Date(v.data).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'}):'—';var es=(v.esito||'').toUpperCase();var co=es==='POSITIVO'?'#15803D':es==='RIFIUTATO'||es==='NEGATIVO'?'#DC2626':'#B45309';var bg=es==='POSITIVO'?'#F0FDF4':es==='RIFIUTATO'||es==='NEGATIVO'?'#FEF2F2':'#FFFBEB';return'<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg3);border-radius:9px"><div style="width:70px;text-align:center;flex-shrink:0;font-size:0.7rem;font-weight:700;color:var(--text3)">'+d+'</div><div style="flex:1;min-width:0"><div style="font-size:0.82rem;font-weight:600">'+(v.cliente||'Cliente N/D')+'</div><div style="font-size:0.72rem;color:var(--text3)">'+(v.agente?'Agente: '+v.agente:'')+(v.note?' \u00b7 '+v.note.slice(0,60):'')+'</div></div>'+(v.esito?'<span style="padding:2px 8px;border-radius:12px;font-size:0.68rem;font-weight:700;background:'+bg+';color:'+co+'">'+v.esito.slice(0,15)+'</span>':'')+'</div>';}).join('')+'</div>';
}

  // ---- Export pubblico (handler inline + entrypoint gestionale) ----
  window.renderAnalytics = renderAnalytics;
  return {
    renderAnalytics: renderAnalytics,
    statTab: statTab,
    setStatPeriod: setStatPeriod,
    setStatCustom: setStatCustom,
    renderSingolo: renderSingolo,
    stampaAnalytics: stampaAnalytics,
    anteprimaAnalytics: anteprimaAnalytics,
    anStampaReport: anStampaReport,
    anChiudiAnteprima: anChiudiAnteprima
  };
})();

// L'IIFE sopra ha già fatto: window.AN = (...) e window.renderAnalytics = renderAnalytics.
// Riesportiamo per i moduli che vorranno importare direttamente.
export const AN = window.AN;
