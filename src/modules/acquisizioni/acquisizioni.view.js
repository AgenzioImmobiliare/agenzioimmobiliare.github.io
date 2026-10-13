// modules/acquisizioni/acquisizioni.view.js — Percorso di acquisizione
// ----------------------------------------------------------------------------
// [13 ott 2026] PEZZO 1. Scelte di Enzo: modulo a parte dentro il gestionale
// (A), messaggi WhatsApp/email già scritti che invia lui (A), avvio SOLO dal
// menu (C). Tappe di questo pezzo: incarico, documenti dal proprietario,
// documenti dal tecnico. Ringraziamento e foto arrivano col pezzo 2.
//
// UN POSTO SOLO PER OGNI DATO. Questa pagina NON copia nulla:
//  - date, percentuale ed esclusiva dell'incarico si leggono e si scrivono
//    sulla scheda immobile (incInizio, incFine, incPerc, conferimento);
//  - i documenti raccolti sono la stessa lista "Documenti per la vendita"
//    della scheda immobile (im.docsChecklist, chiavi 0-13);
//  - il tecnico è un contatto della Rubrica (D.informatori), per id.
// La sua collezione D.acquisizioni tiene solo cio' che altrove non c'e':
// lo stato delle tappe, chi porta l'APE, i documenti che non servono,
// quando e come sono partiti i messaggi.
//
// ANCORAGGIO: il percorso porta immUuid, mai la posizione nell'elenco.
// Cancellare = eliminato:true, come valAtti: un record tolto dall'array
// tornerebbe indietro con la fusione al login.
//
// DIPENDENZE dal monolite (via window): D, saveD, genUUID, gxPagina,
//   gxTesta, gxLinguette, gxCard, gxCol, _gxEsc, _waSendUrl, getNomeAgenzia,
//   getNomeAgente, _agenteCorrente, preparaIncarico, openImmobileModal,
//   openSchedaImmobile, dlgConfirm, showToast. Tutte chiamate con typeof:
//   da un modulo un nome mancante non da' un errore visibile, da' una
//   pagina che non si apre.
// ----------------------------------------------------------------------------
(function(){
'use strict';

/* ── 1. COSTANTI ─────────────────────────────────────────────────────────── */

/* Stessa numerazione di DOCS_LABELS / im.docsChecklist nell'index. */
var DOC_NOMI = {
  0:'Atto di proprietà / rogito',
  1:'Visura catastale aggiornata',
  2:'Planimetria catastale',
  3:'Certificato di conformità urbanistica',
  4:'APE (attestato di prestazione energetica)',
  5:'Certificato di agibilità',
  6:'Ultimo atto di acquisto (provenienza)',
  7:'Certificato di stato civile / matrimonio',
  8:'Regolamento condominiale',
  9:'Ultime 3 ricevute delle spese condominiali',
  10:'Dichiarazione liberatoria del mutuo',
  11:'Conformità degli impianti',
  12:'Certificato di destinazione urbanistica',
  13:'Visura ipotecaria'
};
/* Divisione proposta il 13 ott e confermata da Enzo. L'APE (4) sta da una
   parte o dall'altra a seconda di chi lo porta: vedi apeDi(). */
var DOC_PROP = [0, 6, 7, 8, 9, 10];
var DOC_TEC  = [1, 2, 3, 5, 11, 12, 13];
var APE = 4;
/* categorie della Rubrica che contano come "tecnico" */
var CAT_TEC = ['geometra', 'architetto', 'ingegnere', 'tecnico'];

var _vista = 'elenco';      /* elenco | nuovo | dettaglio */
var _tab = 'aperte';        /* aperte | chiuse */
var _apertoId = '';
var _cerca = '';
var _attesa = null;         /* timer di "carica un immobile nuovo" */

/* ── 2. AIUTANTI ─────────────────────────────────────────────────────────── */

function esc(t){
  if(typeof window._gxEsc === 'function') return window._gxEsc(t);
  return String(t == null ? '' : t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function jsq(t){ return String(t == null ? '' : t).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function oggi(){ var d = new Date(), p = function(n){ return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function it(s){ var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : (s || ''); }
function giorni(da){
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(da || ''); if(!m) return 0;
  var a = new Date(+m[1], +m[2] - 1, +m[3]), b = new Date(); b.setHours(0,0,0,0);
  return Math.max(0, Math.round((b - a) / 86400000));
}
function nuovoId(){
  try{ if(typeof window.genUUID === 'function') return 'acq_' + window.genUUID(); }catch(e){}
  return 'acq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
/* "MARIA ROSSI" → "Maria Rossi": i nomi in archivio sono in maiuscolo (scelta
   del 7 ott), ma in un messaggio a una persona sembrano gridati. */
function bello(s){
  return String(s || '').trim().toLowerCase().replace(/(^|[\s'\-])([a-zà-ù])/g, function(m, a, b){ return a + b.toUpperCase(); });
}
function salva(){ try{ if(typeof window.saveD === 'function') window.saveD(); }catch(e){ console.warn('[Acquisizioni] saveD KO:', e); } }
function avviso(msg){
  try{ if(typeof window.showToast === 'function'){ window.showToast(msg); return; } }catch(e){}
  try{ console.log('[Acquisizioni] ' + msg); }catch(e){}
}
function C(){
  /* colori a variabile: chiari di giorno, accesi in modalità scura (vedi css()) */
  return { ok:'var(--acq-ok)', am:'var(--acq-am)', no:'var(--acq-no)', ko:'var(--acq-ko)', blu:'var(--acq-blu)' };
}
function ico(d, n){
  n = n || 14;
  return '<svg width="' + n + '" height="' + n + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">' + d + '</svg>';
}
var I = {
  wa:    '<path d="M21 11.5a8.4 8.4 0 01-12.6 7.3L3 20.5l1.8-5.2A8.4 8.4 0 1121 11.5z"/>',
  mail:  '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  copia: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  doc:   '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  ok:    '<polyline points="20 6 9 17 4 12"/>',
  piu:   '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  casa:  '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  cerca: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
};

/* ── 3. DATI ─────────────────────────────────────────────────────────────── */

function lista(){
  if(typeof D === 'undefined' || !D) return [];
  if(!Array.isArray(D.acquisizioni)) D.acquisizioni = [];
  return D.acquisizioni;
}
function vivi(){ return lista().filter(function(a){ return a && !a.eliminato; }); }
function trova(id){ return lista().find(function(a){ return a && a.id === id; }) || null; }
function immDi(a){
  if(!a || !a.immUuid || !Array.isArray(D.immobili)) return null;
  return D.immobili.find(function(x){ return x && x.uuid === a.immUuid; }) || null;
}
/* Proprietario: scheda cliente collegata per uuid, poi per posizione, poi i
   campi scritti sull'immobile. Stesso ordine di _mobProprietarioDi. */
function propDi(im){
  var out = { nome:'', tel:'', email:'', uuid:'' };
  if(!im) return out;
  var c = null;
  if(im.clienteUuid && Array.isArray(D.clienti)) c = D.clienti.find(function(z){ return z && z.uuid === im.clienteUuid; }) || null;
  if(!c){ var r = parseInt(im.clienteRef, 10); if(!isNaN(r) && Array.isArray(D.clienti) && D.clienti[r]) c = D.clienti[r]; }
  if(c){ out.nome = c.nome || ''; out.tel = c.tel || c.telefono || ''; out.email = c.email || ''; out.uuid = c.uuid || ''; }
  if(!out.nome)  out.nome  = im.contatto || '';
  if(!out.tel)   out.tel   = im.tel || im.telefono || '';
  if(!out.email) out.email = im.email || '';
  return out;
}
function etichetta(im){
  if(!im) return '';
  var p = [];
  if(im.ref) p.push('Ref.' + im.ref);
  p.push(im.indirizzo || im.comune || im.tipo || 'immobile');
  if(im.indirizzo && im.comune) p.push(im.comune);
  return p.join(' · ');
}
function tecnici(){
  return (Array.isArray(D.informatori) ? D.informatori : []).filter(function(x){
    var c = String(x && x.categoria || '').toLowerCase();
    return x && x.id && CAT_TEC.some(function(t){ return c.indexOf(t) === 0; });
  });
}
function tecDi(a){
  var id = a && a.tappe && a.tappe.tecnico && a.tappe.tecnico.tecnicoId;
  if(!id) return null;
  return (Array.isArray(D.informatori) ? D.informatori : []).find(function(x){ return x && x.id === id; }) || null;
}
function agenteNome(){
  try{
    var ag = (typeof window._agenteCorrente === 'function') ? window._agenteCorrente() : null;
    if(ag && ag.uuid && Array.isArray(D.agenti)){
      var a = D.agenti.find(function(x){ return x && x.uuid === ag.uuid; });
      if(a){ var n = ((a.nome || '') + ' ' + (a.cognome || '')).trim(); if(n) return bello(n); }
    }
  }catch(e){}
  try{ if(typeof window.getNomeAgente === 'function') return window.getNomeAgente(); }catch(e){}
  return '';
}
function agenzia(){ try{ return (typeof window.getNomeAgenzia === 'function') ? window.getNomeAgenzia() : ''; }catch(e){ return ''; } }

/* Il record con tutti i pezzi a posto: i percorsi creati da una versione
   precedente o arrivati dal cloud a meta' non devono rompere la pagina. */
function norma(a){
  if(!a.tappe || typeof a.tappe !== 'object') a.tappe = {};
  ['incarico','proprietario','tecnico'].forEach(function(k){ if(!a.tappe[k] || typeof a.tappe[k] !== 'object') a.tappe[k] = {}; });
  if(!a.nonServe || typeof a.nonServe !== 'object') a.nonServe = {};
  if(!Array.isArray(a.diario)) a.diario = [];
  return a;
}
function diario(a, testo){ norma(a).diario.push({ data:oggi(), ora:new Date().toTimeString().slice(0,5), testo:testo }); }

/* ── 4. STATO DELLE TAPPE (funzioni pure) ───────────────────────────────── */

/* chi porta l'APE: '' = non si sa ancora (lo si chiede al proprietario
   "se ce l'ha", ma non conta per chiudere la tappa), 'proprietario', 'tecnico' */
function apeDi(a){ return (a && (a.ape === 'proprietario' || a.ape === 'tecnico')) ? a.ape : ''; }
function docsDi(a, chi){
  var base = (chi === 'tecnico' ? DOC_TEC : DOC_PROP).slice();
  var ape = apeDi(a);
  if(chi === 'tecnico' ? ape === 'tecnico' : ape !== 'tecnico') base.push(APE);
  return base;
}
function raccolto(im, n){ return !!(im && im.docsChecklist && im.docsChecklist[n] === true); }
function serve(a, n){ return !(a && a.nonServe && a.nonServe[n]); }
/* L'APE "da chiarire" compare nella lista del proprietario ma non e' obbligatorio */
function obbligatorio(a, n){ return serve(a, n) && !(n === APE && apeDi(a) === ''); }
function contaDocs(a, im, chi){
  var L = docsDi(a, chi), tot = 0, ok = 0, mancanti = [];
  L.forEach(function(n){
    if(!serve(a, n)) return;
    if(raccolto(im, n)){ if(obbligatorio(a, n)) { tot++; ok++; } return; }
    mancanti.push(n);
    if(obbligatorio(a, n)) tot++;
  });
  return { tot:tot, ok:ok, mancanti:mancanti };
}
/* Ogni tappa: 'fare' | 'corso' | 'fatto' */
function statoIncarico(a){
  var t = norma(a).tappe.incarico;
  if(t.firmato) return 'fatto';
  if(t.preparato) return 'corso';
  return 'fare';
}
function statoDocs(a, im, chi){
  var c = contaDocs(a, im, chi), t = norma(a).tappe[chi];
  if(c.tot > 0 && c.ok === c.tot) return 'fatto';
  if(c.tot === 0 && c.mancanti.length === 0) return 'fatto';
  if(t.inviato || c.ok > 0) return 'corso';
  return 'fare';
}
function stati(a, im){
  return { incarico:statoIncarico(a), proprietario:statoDocs(a, im, 'proprietario'), tecnico:statoDocs(a, im, 'tecnico') };
}
var ST_ET = { fare:'Da fare', corso:'In corso', fatto:'Fatto' };
function stCol(s){ var c = C(); return s === 'fatto' ? c.ok : (s === 'corso' ? c.am : c.no); }

/* ── 5. TESTI DEI MESSAGGI ──────────────────────────────────────────────── */

function elenco(a, ns){
  return ns.map(function(n){
    var t = DOC_NOMI[n];
    if(n === APE && apeDi(a) === '') t += ', se lo ha già';
    return '- ' + t;
  }).join('\n');
}
function firma(){
  var ag = agenteNome(), az = agenzia();
  return [ag, az].filter(Boolean).join('\n');
}
function testoProprietario(a, im){
  var p = propDi(im), m = contaDocs(a, im, 'proprietario').mancanti;
  var nome = bello(p.nome);
  var dove = im ? (im.indirizzo ? im.indirizzo + (im.comune ? ', ' + im.comune : '') : (im.comune || 'il suo immobile')) : 'il suo immobile';
  /* Saluto e prima frase sulla stessa riga: il gestionale, prima di aprire
     WhatsApp, mette la maiuscola a ogni riga che parte minuscola
     (_umanizzaTesto). Cosi' l'anteprima e' uguale al messaggio che parte. */
  if(!m.length) return 'Buongiorno' + (nome ? ' ' + nome : '') + ', la ringrazio: ho ricevuto tutti i documenti che mi servivano per ' + dove + '.\n\n' + firma();
  return 'Buongiorno' + (nome ? ' ' + nome : '') + ', la ringrazio ancora per la fiducia.\n'
    + 'Per preparare al meglio la vendita di ' + dove + ' mi servono questi documenti:\n\n'
    + elenco(a, m) + '\n\n'
    + 'Può mandarmeli anche in foto qui, oppure passo io a ritirarli: mi dica lei cosa le è più comodo.\n'
    + 'Per qualsiasi dubbio sono a disposizione.\n\n' + firma();
}
function catastali(im){
  if(!im) return '';
  var p = [];
  if(im.catFoglio) p.push('foglio ' + im.catFoglio);
  if(im.catParticella) p.push('particella ' + im.catParticella);
  if(im.catSub) p.push('sub ' + im.catSub);
  var s = p.join(', ');
  if(s && im.catCategoria) s += ' (cat. ' + im.catCategoria + ')';
  return s;
}
function testoTecnico(a, im){
  var t = tecDi(a), p = propDi(im), m = contaDocs(a, im, 'tecnico').mancanti;
  var nome = t ? bello(t.nome) : '';
  var cosa = im ? ((im.tipo ? im.tipo.toLowerCase() + ' in ' : 'immobile in ') + (im.indirizzo || '') + (im.comune ? (im.indirizzo ? ', ' : '') + im.comune : '')) : 'un immobile';
  var cat = catastali(im);
  return 'Buongiorno' + (nome ? ' ' + nome : '') + ', le scrivo per un nuovo incarico di vendita: ' + cosa + '.\n'
    + (p.nome ? 'Proprietario: ' + bello(p.nome) + '.\n' : '')
    + (cat ? 'Dati catastali: ' + cat + '.\n' : '')
    + '\nLe chiederei, quando può, questi documenti:\n\n'
    + (m.length ? elenco(a, m) : '- (nessuno: la lista è completa)') + '\n\n'
    + 'Mi fa sapere tempi e costo? Grazie.\n\n' + firma();
}

/* ── 6. CSS ─────────────────────────────────────────────────────────────── */

function css(){
  if(document.getElementById('acq-css')) return;
  var st = document.createElement('style'); st.id = 'acq-css';
  st.textContent = ''
    + '#acq-wrap{--acq-ok:#15803D;--acq-am:#B45309;--acq-no:#64748B;--acq-ko:#B91C1C;--acq-blu:#1D4ED8}'
    + 'body.dark-mode #acq-wrap{--acq-ok:#4ADE80;--acq-am:#FBBF24;--acq-no:#94A3B8;--acq-ko:#F87171;--acq-blu:#93C5FD}'
    + '#acq-wrap .acq-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}'
    + '#acq-wrap .acq-cards .gx-card{min-width:0}'
    + '#acq-wrap .acq-barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:-6px 0 14px}'
    + '#acq-wrap .acq-in{padding:6px 9px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);font-family:inherit;font-size:0.84rem}'
    + '#acq-wrap .acq-pill{display:inline-flex;align-items:center;gap:5px;font-size:0.68rem;font-weight:700;letter-spacing:.3px;text-transform:uppercase;border:1px solid currentColor;border-radius:20px;padding:2px 8px;white-space:nowrap}'
    + '#acq-wrap .acq-pill i{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block}'
    + '#acq-wrap .acq-tappe{display:flex;gap:6px;flex-wrap:wrap}'
    + '#acq-wrap .acq-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:0 14px;align-items:start}'
    + '#acq-wrap .acq-campi{display:flex;flex-wrap:wrap;gap:12px 16px;padding:12px 16px;border-bottom:1px solid var(--border)}'
    + '#acq-wrap .acq-campi label{display:flex;flex-direction:column;gap:4px;font-size:0.7rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px}'
    + '#acq-wrap .acq-azioni{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border)}'
    + '#acq-wrap .acq-azioni .nota{font-size:0.76rem;color:var(--text3)}'
    + '#acq-wrap .acq-doc{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border)}'
    + '#acq-wrap .acq-doc .n{flex:1;min-width:0;font-size:0.86rem;color:var(--text)}'
    + '#acq-wrap .acq-doc.ok .n{color:var(--text3);text-decoration:line-through}'
    + '#acq-wrap .acq-doc.no .n{color:var(--text3);font-style:italic}'
    + '#acq-wrap .acq-spunta{width:22px;height:22px;border-radius:6px;border:1.5px solid var(--border);background:var(--bg);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:transparent;flex-shrink:0;padding:0}'
    + '#acq-wrap .acq-doc.ok .acq-spunta{background:var(--acq-ok);border-color:var(--acq-ok);color:#fff}'
    + 'body.dark-mode #acq-wrap .acq-doc.ok .acq-spunta{color:#0F172A}'
    + '#acq-wrap .acq-msg{width:100%;box-sizing:border-box;min-height:150px;resize:vertical;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-family:inherit;font-size:0.84rem;line-height:1.5}'
    + '#acq-wrap .acq-scelta{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden}'
    + '#acq-wrap .acq-scelta button{background:var(--bg2);color:var(--text2);border:none;border-right:1px solid var(--border);padding:5px 10px;font-family:inherit;font-size:0.76rem;font-weight:600;cursor:pointer}'
    + '#acq-wrap .acq-scelta button:last-child{border-right:none}'
    + '#acq-wrap .acq-scelta button.on{background:var(--brand,#EA580C);color:#fff}'
    + '#acq-wrap .gx-btn.pieno{background:var(--brand,#EA580C);border-color:var(--brand,#EA580C);color:#fff}'
    + '#acq-wrap .gx-btn[disabled]{opacity:.45;cursor:not-allowed}'
    + '#acq-wrap .acq-riga{cursor:pointer}'
    + '#acq-wrap .acq-num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:currentColor;flex-shrink:0}'
    + '#acq-wrap .acq-num b{color:#fff;font-size:0.72rem}'
    + 'body.dark-mode #acq-wrap .acq-num b{color:#0F172A}'
    /* il numero della tappa sostituisce il pallino delle colonne gx */
    + '#acq-wrap .gx-head::before{display:none!important}'
    /* icona della testata: cartella con spunta, nel colore del tema */
    + 'html body #acq-wrap .gx-testa::before{background:color-mix(in srgb,var(--brand,#EA580C) 12%,transparent) url("data:image/svg+xml,%3Csvg%20xmlns=\'http://www.w3.org/2000/svg\'%20width=\'24\'%20height=\'24\'%20viewBox=\'0%200%2024%2024\'%20fill=\'none\'%20stroke=\'%23EA580C\'%20stroke-width=\'2\'%20stroke-linecap=\'round\'%20stroke-linejoin=\'round\'%3E%3Cpath%20d=\'M22%2019a2%202%200%2001-2%202H4a2%202%200%2001-2-2V5a2%202%200%20012-2h5l2%203h9a2%202%200%20012%202z\'/%3E%3Cpolyline%20points=\'9%2014%2011%2016%2015%2012\'/%3E%3C/svg%3E") center/20px no-repeat!important}';
  document.head.appendChild(st);
}

/* ── 7. DISEGNO ─────────────────────────────────────────────────────────── */

function pill(s, testo){
  return '<span class="acq-pill" style="color:' + stCol(s) + '"><i></i>' + esc(testo || ST_ET[s]) + '</span>';
}

function disegnaElenco(){
  var V = vivi(), aperte = V.filter(function(a){ return a.stato !== 'chiusa'; }), chiuse = V.filter(function(a){ return a.stato === 'chiusa'; });
  var c = C();
  var nInc = 0, nProp = 0, nTec = 0;
  aperte.forEach(function(a){
    var s = stati(a, immDi(a));
    if(s.incarico !== 'fatto') nInc++;
    if(s.proprietario !== 'fatto') nProp++;
    if(s.tecnico !== 'fatto') nTec++;
  });
  var ling = window.gxLinguette([['aperte','In corso',aperte.length,'#334155'],['chiuse','Chiuse',chiuse.length,'#334155']], _tab, '_acqTab');
  var h = window.gxTesta('Acquisizioni', '', 'dal sì del proprietario alla pubblicazione');
  h += '<div class="acq-barra">' + ling + '<div style="flex:1"></div>'
    + '<button class="gx-btn pieno" onclick="_acqNuovo()">' + ico(I.piu) + ' Nuovo incarico</button></div>';
  h += '<div class="gx-cards acq-cards">'
    + window.gxCard('In corso', aperte.length, 'percorsi aperti', 'var(--brand,#EA580C)')
    + window.gxCard('Incarico da firmare', nInc, 'firma non ancora segnata', nInc ? c.am : c.ok)
    + window.gxCard('Documenti dal proprietario', nProp, 'percorsi con documenti mancanti', nProp ? c.am : c.ok)
    + window.gxCard('Documenti dal tecnico', nTec, 'percorsi con documenti mancanti', nTec ? c.am : c.ok)
    + '</div>';
  var L = (_tab === 'chiuse' ? chiuse : aperte).slice().sort(function(x, y){ return String(y.creato || '').localeCompare(String(x.creato || '')); });
  var righe = L.map(function(a){
    var im = immDi(a), s = stati(a, im), p = propDi(im);
    var sub = [];
    if(p.nome) sub.push(bello(p.nome));
    sub.push((a.stato === 'chiusa' ? 'chiuso il ' + it(a.chiusa) : 'avviato il ' + it(a.creato) + ' · ' + giorni(a.creato) + ' gg'));
    if(!im) sub.push('immobile non più in archivio');
    return '<div class="gx-riga acq-riga" onclick="_acqApri(\'' + jsq(a.id) + '\')">'
      + '<div style="flex:1;min-width:220px"><div class="tt">' + esc(im ? etichetta(im) : (a.immEt || 'Immobile')) + '</div>'
      + '<div class="sub">' + esc(sub.join(' · ')) + '</div></div>'
      + '<div class="acq-tappe">' + pill(s.incarico, 'Incarico') + pill(s.proprietario, 'Proprietario') + pill(s.tecnico, 'Tecnico') + '</div>'
      + '</div>';
  }).join('');
  if(!righe) righe = '<div class="gx-vuoto">' + (_tab === 'chiuse' ? 'Nessun percorso chiuso.' : 'Nessuna acquisizione in corso. Premi "Nuovo incarico" per iniziare.') + '</div>';
  h += window.gxCol(_tab === 'chiuse' ? 'Percorsi chiusi' : 'Percorsi in corso', 'tocca una riga per aprire le tappe', c.blu, righe);
  return h;
}

function immScegliibili(){
  var occupati = {};
  vivi().forEach(function(a){ if(a.stato !== 'chiusa' && a.immUuid) occupati[a.immUuid] = 1; });
  var L = (Array.isArray(D.immobili) ? D.immobili : []).filter(function(im){
    if(!im || !im.uuid || occupati[im.uuid]) return false;
    if(im.archiviato === true) return false;
    var st = String(im.stato || '').toLowerCase();
    return st !== 'venduto' && st !== 'archiviato' && st !== 'non attivo';
  });
  return L.slice().reverse();   /* in fondo all'elenco ci sono i caricati per ultimi */
}

function disegnaNuovo(){
  var c = C();
  var h = window.gxTesta('Nuovo incarico', '', 'scegli l\'immobile');
  h += '<div class="acq-barra"><button class="gx-btn" onclick="_acqElenco()">&larr; Torna all\'elenco</button></div>';
  h += '<div class="gx-info">Scegli l\'immobile per cui parte l\'acquisizione. Se non è ancora in archivio, '
    + '<b>caricalo ora</b>: appena lo salvi il percorso si apre da solo.</div>';
  h += '<div class="acq-barra" style="margin-top:0"><span style="display:inline-flex;align-items:center;gap:6px;color:var(--text3)">' + ico(I.cerca) + '</span>'
    + '<input id="acq-cerca" class="acq-in" style="flex:1;min-width:220px" placeholder="Cerca per Ref, indirizzo, comune o proprietario" value="' + esc(_cerca) + '" oninput="_acqCerca(this.value)">'
    + '<button class="gx-btn pieno" onclick="_acqCaricaNuovo()">' + ico(I.casa) + ' Immobile non in archivio: caricalo ora</button></div>';
  h += '<div id="acq-scelte">' + righeScelte() + '</div>';
  return h;
}
function righeScelte(){
  var q = _cerca.trim().toLowerCase();
  var L = immScegliibili().filter(function(im){
    if(!q) return true;
    var p = propDi(im);
    return [im.ref, im.indirizzo, im.comune, im.tipo, im.contatto, p.nome].join(' ').toLowerCase().indexOf(q) >= 0;
  });
  var tot = L.length;
  L = L.slice(0, 40);
  var righe = L.map(function(im){
    var p = propDi(im);
    var sub = [im.tipo, p.nome ? bello(p.nome) : 'proprietario non indicato', im.prezzo ? ('€ ' + String(im.prezzo).replace(/\B(?=(\d{3})+(?!\d))/g, '.')) : ''].filter(Boolean).join(' · ');
    return '<div class="gx-riga acq-riga" onclick="_acqCrea(\'' + jsq(im.uuid) + '\')">'
      + '<div style="flex:1;min-width:0"><div class="tt">' + esc(etichetta(im)) + '</div><div class="sub">' + esc(sub) + '</div></div>'
      + '<span class="gx-btn">Avvia percorso</span></div>';
  }).join('');
  if(!righe) righe = '<div class="gx-vuoto">' + (q ? 'Nessun immobile corrisponde alla ricerca.' : 'Tutti gli immobili attivi hanno già un percorso aperto.') + '</div>';
  return window.gxCol('Immobili in archivio', tot > 40 ? 'i più recenti per primi · ne mostro 40 su ' + tot + ', usa la ricerca' : 'i più recenti per primi', C().blu, righe);
}

function bloccoDocs(a, im, chi){
  var L = docsDi(a, chi);
  return L.map(function(n){
    var ok = raccolto(im, n), no = !serve(a, n);
    var nome = DOC_NOMI[n] + (n === APE && apeDi(a) === '' ? ' — solo se lo ha già' : '');
    return '<div class="acq-doc' + (ok ? ' ok' : '') + (no ? ' no' : '') + '">'
      + '<button class="acq-spunta" title="' + (ok ? 'Togli la spunta' : 'Segna come raccolto') + '" onclick="_acqDoc(\'' + jsq(a.id) + '\',' + n + ')"' + (no ? ' disabled style="opacity:.35;cursor:default"' : '') + '>' + ico(I.ok, 14) + '</button>'
      + '<span class="n">' + esc(nome) + (no ? ' — non serve' : '') + '</span>'
      + (ok ? '' : '<button class="gx-btn" onclick="_acqNonServe(\'' + jsq(a.id) + '\',' + n + ')">' + (no ? 'Serve' : 'Non serve') + '</button>')
      + '</div>';
  }).join('');
}
function bloccoMsg(a, im, chi, testo, tel, email, chiNome){
  var t = norma(a).tappe[chi];
  var mancanti = contaDocs(a, im, chi).mancanti.length;
  var h = '<div style="padding:12px 16px;border-bottom:1px solid var(--border)">'
    + '<div class="gx-sotto">Messaggio' + (chiNome ? ' per ' + esc(bello(chiNome)) : '') + ' — puoi correggerlo prima di inviarlo</div>'
    + '<textarea id="acq-msg-' + chi + '" class="acq-msg">' + esc(testo) + '</textarea></div>';
  h += '<div class="acq-azioni">'
    + '<button class="gx-btn pieno" onclick="_acqInvia(\'' + jsq(a.id) + '\',\'' + chi + '\',\'wa\')"' + (tel ? '' : ' disabled title="Manca il numero di telefono"') + '>' + ico(I.wa) + ' WhatsApp</button>'
    + '<button class="gx-btn" onclick="_acqInvia(\'' + jsq(a.id) + '\',\'' + chi + '\',\'mail\')"' + (email ? '' : ' disabled title="Manca l\'indirizzo email"') + '>' + ico(I.mail) + ' Email</button>'
    + '<button class="gx-btn" onclick="_acqCopia(\'' + chi + '\')">' + ico(I.copia) + ' Copia testo</button>'
    + '<span class="nota">' + (t.inviato ? 'Inviato il ' + it(t.inviato) + (t.canale ? ' via ' + (t.canale === 'wa' ? 'WhatsApp' : 'email') : '') : (mancanti ? 'Non ancora inviato' : '')) + '</span>'
    + '</div>';
  return h;
}

function disegnaDettaglio(a){
  norma(a);
  var c = C(), im = immDi(a), p = propDi(im), s = stati(a, im);
  var h = window.gxTesta(im ? etichetta(im) : (a.immEt || 'Acquisizione'), '', (p.nome ? bello(p.nome) + ' · ' : '') + 'avviato il ' + it(a.creato));
  h += '<div class="acq-barra"><button class="gx-btn" onclick="_acqElenco()">&larr; Torna all\'elenco</button>'
    + (im ? '<button class="gx-btn" onclick="_acqScheda(\'' + jsq(im.uuid) + '\')">' + ico(I.casa) + ' Apri scheda immobile</button>' : '')
    + '<div style="flex:1"></div>'
    + (a.stato === 'chiusa'
        ? '<span class="acq-pill" style="color:' + c.no + '"><i></i>Chiuso il ' + esc(it(a.chiusa)) + '</span><button class="gx-btn" onclick="_acqRiapri(\'' + jsq(a.id) + '\')">Riapri</button>'
        : '<button class="gx-btn" onclick="_acqChiudi(\'' + jsq(a.id) + '\')">Chiudi percorso</button>')
    + '<button class="gx-btn rosso" onclick="_acqElimina(\'' + jsq(a.id) + '\')">Elimina</button></div>';

  if(!im){
    h += '<div class="gx-info" style="border-left:4px solid ' + c.ko + '"><b>Immobile non trovato.</b> Il percorso resta qui, ma senza l\'immobile non posso mostrare documenti e incarico. Probabilmente è stato archiviato o eliminato.</div>';
    return h + cronologia(a);
  }
  if(a.stato !== 'chiusa' && s.incarico === 'fatto' && s.proprietario === 'fatto' && s.tecnico === 'fatto'){
    h += '<div class="gx-info" style="border-left:4px solid ' + c.ok + '"><b>Tutte le tappe sono fatte.</b> Puoi chiudere il percorso. Il ringraziamento con la presentazione dei servizi e le foto arrivano con il prossimo aggiornamento.</div>';
  }

  /* 1 · INCARICO — i campi sono quelli della scheda immobile */
  var ti = a.tappe.incarico;
  var conf = String(im.conferimento || '').toLowerCase();
  var inc = '<div class="acq-campi">'
    + '<label>Conferimento<select class="acq-in" onchange="_acqImm(\'' + jsq(a.id) + '\',\'conferimento\',this.value)">'
    +   '<option value=""' + (conf ? '' : ' selected') + '>— da indicare —</option>'
    +   '<option' + (conf === 'in esclusiva' ? ' selected' : '') + '>in esclusiva</option>'
    +   '<option' + (conf === 'non esclusiva' ? ' selected' : '') + '>non esclusiva</option></select></label>'
    + '<label>Inizio mandato<input type="date" class="acq-in" value="' + esc(im.incInizio || '') + '" onchange="_acqImm(\'' + jsq(a.id) + '\',\'incInizio\',this.value)"></label>'
    + '<label>Scadenza<input type="date" class="acq-in" value="' + esc(im.incFine || '') + '" onchange="_acqImm(\'' + jsq(a.id) + '\',\'incFine\',this.value)"></label>'
    + '<label>Provvigione %<input class="acq-in" style="width:80px" value="' + esc(im.incPerc || '') + '" onchange="_acqImm(\'' + jsq(a.id) + '\',\'incPerc\',this.value)"></label>'
    + '</div>';
  inc += '<div class="acq-azioni">'
    + '<button class="gx-btn' + (ti.preparato ? '' : ' pieno') + '" onclick="_acqPrepara(\'' + jsq(a.id) + '\')">' + ico(I.doc) + ' Prepara incarico</button>'
    + (ti.firmato
        ? '<span class="acq-pill" style="color:' + c.ok + '"><i></i>Firmato il ' + esc(it(ti.firmato)) + '</span><button class="gx-btn" onclick="_acqFirma(\'' + jsq(a.id) + '\',\'\')">Annulla firma</button>'
        : '<label style="display:inline-flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--text3);font-weight:700">Firmato il <input type="date" id="acq-firma" class="acq-in" value="' + oggi() + '"></label>'
          + '<button class="gx-btn' + (ti.preparato ? ' pieno' : '') + '" onclick="_acqFirma(\'' + jsq(a.id) + '\',(document.getElementById(\'acq-firma\')||{}).value||\'\')">' + ico(I.ok) + ' Segna firmato</button>')
    + '<span class="nota">' + (ti.preparato && !ti.firmato ? 'Modulo preparato il ' + it(ti.preparato) : '') + '</span>'
    + '</div>';
  inc += '<div class="gx-nota" style="margin:0;padding:10px 16px">Sono gli stessi campi della scheda immobile: scrivere qui o là è uguale. "Prepara incarico" apre il modulo FRIMM già compilato.</div>';

  /* 2 · DOCUMENTI DAL PROPRIETARIO */
  var cp = contaDocs(a, im, 'proprietario');
  var ape = apeDi(a);
  var prop = '<div class="acq-azioni"><span class="nota" style="font-weight:700">L\'APE</span><div class="acq-scelta">'
    + ['', 'proprietario', 'tecnico'].map(function(v){
        var et = v === '' ? 'Non so ancora' : (v === 'proprietario' ? 'Ce l\'ha il proprietario' : 'Lo fa il tecnico');
        return '<button class="' + (ape === v ? 'on' : '') + '" onclick="_acqApe(\'' + jsq(a.id) + '\',\'' + v + '\')">' + et + '</button>';
      }).join('') + '</div></div>';
  prop += bloccoDocs(a, im, 'proprietario');
  prop += bloccoMsg(a, im, 'proprietario', testoProprietario(a, im), p.tel, p.email, p.nome);
  if(!p.tel && !p.email) prop += '<div class="gx-nota" style="margin:0;padding:10px 16px">Il proprietario non ha né telefono né email: aggiungili nella sua scheda, oppure usa "Copia testo".</div>';

  /* 3 · DOCUMENTI DAL TECNICO */
  var ct = contaDocs(a, im, 'tecnico'), T = tecnici(), tec = tecDi(a);
  var tecS = '<div class="acq-azioni"><span class="nota" style="font-weight:700">Tecnico</span>'
    + '<select class="acq-in" onchange="_acqTecnico(\'' + jsq(a.id) + '\',this.value)"><option value="">— scegli dalla Rubrica —</option>'
    + T.map(function(x){ return '<option value="' + esc(x.id) + '"' + (tec && tec.id === x.id ? ' selected' : '') + '>' + esc(bello(x.nome) + ' · ' + (x.categoria || '')) + '</option>'; }).join('')
    + '</select>'
    + (T.length ? '' : '<span class="nota">Nella Rubrica non c\'è ancora nessun geometra, architetto o ingegnere: aggiungilo da Anagrafiche → Rubrica.</span>')
    + '</div>';
  tecS += bloccoDocs(a, im, 'tecnico');
  if(tec) tecS += bloccoMsg(a, im, 'tecnico', testoTecnico(a, im), tec.tel, tec.email, tec.nome);
  else tecS += '<div class="gx-nota" style="margin:0;padding:10px 16px">Scegli il tecnico per preparare il messaggio.</div>';

  function testa(n, titolo, st, dx){
    return '<span style="display:inline-flex;align-items:center;gap:8px"><span class="acq-num" style="color:' + stCol(st) + '"><b>' + n + '</b></span>' + titolo + '</span>';
  }
  h += '<div class="acq-grid">'
    + '<div>' + window.gxCol(testa(1, 'Incarico', s.incarico), pill(s.incarico), stCol(s.incarico), inc) + cronologia(a) + '</div>'
    + '<div>' + window.gxCol(testa(2, 'Documenti dal proprietario', s.proprietario), pill(s.proprietario, cp.ok + ' di ' + cp.tot + ' raccolti'), stCol(s.proprietario), prop)
    +           window.gxCol(testa(3, 'Documenti dal tecnico', s.tecnico), pill(s.tecnico, ct.ok + ' di ' + ct.tot + ' raccolti'), stCol(s.tecnico), tecS) + '</div>'
    + '</div>';
  return h;
}
function cronologia(a){
  var D2 = (a.diario || []).slice().reverse();
  if(!D2.length) return '';
  var righe = D2.map(function(d){
    return '<div class="gx-riga"><span class="gx-num" style="min-width:90px;font-size:0.8rem;color:var(--text3);text-align:left">' + esc(it(d.data)) + (d.ora ? ' ' + esc(d.ora) : '') + '</span>'
      + '<div style="flex:1;min-width:0" class="tt">' + esc(d.testo) + '</div></div>';
  }).join('');
  return window.gxCol('Cronologia', 'cosa è successo in questo percorso', C().no, righe);
}

function disegna(){
  css();
  if(typeof window.gxPagina !== 'function' || typeof window.gxTesta !== 'function'){
    if(typeof window.dlgAlert === 'function') window.dlgAlert('La grafica delle pagine non è ancora pronta: riprova fra un istante.', '', 'Acquisizioni');
    return;
  }
  var cont;
  if(_vista === 'dettaglio'){
    var a = trova(_apertoId);
    if(!a || a.eliminato){ _vista = 'elenco'; cont = disegnaElenco(); }
    else cont = disegnaDettaglio(a);
  }
  else if(_vista === 'nuovo') cont = disegnaNuovo();
  else cont = disegnaElenco();
  var w = document.getElementById('acq-wrap');
  if(w){
    var corpo = w.querySelector('.gx-dentro');
    if(corpo){ var sc = w.querySelector('.gx-corpo'), y = sc ? sc.scrollTop : 0; corpo.innerHTML = cont; if(sc) sc.scrollTop = y; return; }
  }
  window.gxPagina('acq-wrap', 'Acquisizioni', 'chiudiAcquisizioni()', cont);
}
function vaiA(vista, id){
  _vista = vista; if(id !== undefined) _apertoId = id;
  disegna();
  var sc = document.querySelector('#acq-wrap .gx-corpo'); if(sc) sc.scrollTop = 0;
}

/* ── 8. AZIONI (esposte su window per gli onclick) ──────────────────────── */

window.apriAcquisizioni = function(){
  try{ _vista = 'elenco'; disegna(); }
  catch(e){
    console.warn('[Acquisizioni] KO:', e);
    if(typeof window.dlgAlert === 'function') window.dlgAlert('Non sono riuscito ad aprire la pagina Acquisizioni: ' + e.message, '', 'Acquisizioni');
  }
};
window.chiudiAcquisizioni = function(){ var w = document.getElementById('acq-wrap'); if(w) w.remove(); };
window._acqTab = function(t){ _tab = t; disegna(); };
window._acqElenco = function(){ vaiA('elenco'); };
window._acqNuovo = function(){ _cerca = ''; vaiA('nuovo'); setTimeout(function(){ var i = document.getElementById('acq-cerca'); if(i) i.focus(); }, 50); };
window._acqApri = function(id){ vaiA('dettaglio', id); };
window._acqCerca = function(v){ _cerca = v || ''; var box = document.getElementById('acq-scelte'); if(box) box.innerHTML = righeScelte(); };

window._acqCrea = function(immUuid){
  var im = (D.immobili || []).find(function(x){ return x && x.uuid === immUuid; });
  if(!im){ avviso('Immobile non trovato'); return; }
  var gia = vivi().find(function(a){ return a.immUuid === immUuid && a.stato !== 'chiusa'; });
  if(gia){ vaiA('dettaglio', gia.id); return; }
  var ag = null; try{ ag = (typeof window._agenteCorrente === 'function') ? window._agenteCorrente() : null; }catch(e){}
  var a = norma({ id:nuovoId(), immUuid:immUuid, immEt:etichetta(im), creato:oggi(), stato:'aperta',
                  agenteUuid:(ag && ag.uuid) || '', ape:'' });
  diario(a, 'Percorso avviato');
  lista().push(a);
  salva();
  vaiA('dettaglio', a.id);
};

/* "Immobile non in archivio": questa pagina si NASCONDE (non si chiude), si
   apre la scheda normale di nuovo immobile e, quando quella si chiude, la
   pagina ricompare: se nel frattempo e' nato un immobile, il percorso parte
   da solo. Nascondere invece di alzare la finestra sopra la pagina: dalla
   scheda immobile si possono aprire altre finestre (nuovo cliente…) che
   altrimenti resterebbero sotto, invisibili.
   Niente aggancio dentro saveImmobile: e' gia' modificato da un'altra parte
   del gestionale, e una terza modifica sarebbe fragile. */
window._acqCaricaNuovo = function(){
  if(typeof window.openImmobileModal !== 'function'){ avviso('Il modulo Immobili non è ancora caricato: riprova fra un istante'); return; }
  var w = document.getElementById('acq-wrap');
  var prima = {}; (D.immobili || []).forEach(function(x){ if(x && x.uuid) prima[x.uuid] = 1; });
  var torna = function(){
    if(_attesa){ clearInterval(_attesa); _attesa = null; }
    var nuovo = (D.immobili || []).find(function(x){ return x && x.uuid && !prima[x.uuid]; });
    var pag = document.getElementById('acq-wrap');
    if(pag) pag.style.display = '';
    if(nuovo){ window._acqCrea(nuovo.uuid); avviso('Percorso avviato per ' + etichetta(nuovo)); }
    else if(pag) disegna(); else window.apriAcquisizioni();
  };
  try{ window.openImmobileModal(); }
  catch(e){ console.warn('[Acquisizioni] openImmobileModal KO:', e); avviso('Non sono riuscito ad aprire la scheda del nuovo immobile'); return; }
  if(w) w.style.display = 'none';
  if(_attesa) clearInterval(_attesa);
  var inizio = Date.now(), visto = false;
  _attesa = setInterval(function(){
    var m = document.getElementById('modal-immobile');
    var aperto = !!(m && m.classList.contains('open'));
    if(aperto){ visto = true; return; }
    /* chiusa (salvata o annullata), oppure mai aperta dopo 3 secondi */
    if(visto || Date.now() - inizio > 3000) torna();
  }, 400);
};

window._acqScheda = function(immUuid){
  var i = (D.immobili || []).findIndex(function(x){ return x && x.uuid === immUuid; });
  if(i < 0){ avviso('Scheda non trovata'); return; }
  window.chiudiAcquisizioni();
  if(typeof window.openSchedaImmobile === 'function') window.openSchedaImmobile(i);
};

/* scrive UN campo sulla scheda immobile (incarico) */
window._acqImm = function(id, campo, valore){
  var a = trova(id), im = immDi(a);
  if(!im || ['conferimento','incInizio','incFine','incPerc'].indexOf(campo) < 0) return;
  im[campo] = String(valore == null ? '' : valore).trim();
  salva(); disegna();
};
window._acqPrepara = function(id){
  var a = trova(id), im = immDi(a); if(!a || !im) return;
  norma(a);
  if(!a.tappe.incarico.preparato){ a.tappe.incarico.preparato = oggi(); diario(a, 'Modulo d\'incarico preparato'); salva(); }
  if(typeof window.preparaIncarico === 'function') window.preparaIncarico(im.uuid);
  else avviso('La preparazione dell\'incarico non è disponibile');
  disegna();
};
window._acqFirma = function(id, data){
  var a = trova(id), im = immDi(a); if(!a) return;
  norma(a);
  if(!data){
    a.tappe.incarico.firmato = '';
    diario(a, 'Firma dell\'incarico annullata');
  } else {
    a.tappe.incarico.firmato = data;
    if(im && !im.incInizio) im.incInizio = data;   /* solo se vuoto: mai sopra un dato scritto a mano */
    diario(a, 'Incarico firmato il ' + it(data));
  }
  salva(); disegna();
};
window._acqApe = function(id, v){
  var a = trova(id); if(!a) return;
  a.ape = (v === 'proprietario' || v === 'tecnico') ? v : '';
  salva(); disegna();
};
/* la spunta e' quella della lista "Documenti per la vendita" della scheda */
window._acqDoc = function(id, n){
  var a = trova(id), im = immDi(a); if(!a || !im) return;
  if(!im.docsChecklist || typeof im.docsChecklist !== 'object') im.docsChecklist = {};
  var ora = !(im.docsChecklist[n] === true);
  im.docsChecklist[n] = ora;
  diario(a, (ora ? 'Raccolto: ' : 'Tolto dai raccolti: ') + DOC_NOMI[n]);
  salva(); disegna();
};
window._acqNonServe = function(id, n){
  var a = trova(id); if(!a) return;
  norma(a);
  if(a.nonServe[n]) delete a.nonServe[n]; else a.nonServe[n] = true;
  salva(); disegna();
};
window._acqTecnico = function(id, tid){
  var a = trova(id); if(!a) return;
  norma(a).tappe.tecnico.tecnicoId = tid || '';
  var t = tecDi(a);
  if(t) diario(a, 'Tecnico scelto: ' + bello(t.nome));
  salva(); disegna();
};
window._acqCopia = function(chi){
  var el = document.getElementById('acq-msg-' + chi); if(!el) return;
  var fatto = function(){ avviso('Testo copiato'); };
  try{ navigator.clipboard.writeText(el.value).then(fatto, function(){ el.select(); document.execCommand('copy'); fatto(); }); }
  catch(e){ try{ el.select(); document.execCommand('copy'); fatto(); }catch(_){} }
};
window._acqInvia = function(id, chi, canale){
  var a = trova(id), im = immDi(a); if(!a || !im) return;
  var el = document.getElementById('acq-msg-' + chi);
  var testo = el ? el.value : (chi === 'tecnico' ? testoTecnico(a, im) : testoProprietario(a, im));
  var dest = chi === 'tecnico' ? tecDi(a) : propDi(im);
  if(!dest){ avviso('Scegli prima il tecnico'); return; }
  var url = '';
  if(canale === 'wa'){
    url = (typeof window._waSendUrl === 'function') ? window._waSendUrl(dest.tel, testo) : '';
    if(!url){ avviso('Numero di telefono mancante o non valido'); return; }
  } else {
    if(!dest.email){ avviso('Indirizzo email mancante'); return; }
    var ogg = 'Documenti per la vendita — ' + etichetta(im);
    url = 'mailto:' + encodeURIComponent(dest.email) + '?subject=' + encodeURIComponent(ogg) + '&body=' + encodeURIComponent(testo);
  }
  try{ window.open(url, '_blank'); }catch(e){ window.location.href = url; }
  norma(a);
  a.tappe[chi].inviato = oggi();
  a.tappe[chi].canale = canale;
  diario(a, 'Richiesta documenti ' + (chi === 'tecnico' ? 'al tecnico ' : 'al proprietario ') + bello(dest.nome || '') + ' via ' + (canale === 'wa' ? 'WhatsApp' : 'email'));
  salva(); disegna();
};
window._acqChiudi = function(id){
  var a = trova(id); if(!a) return;
  a.stato = 'chiusa'; a.chiusa = oggi(); diario(a, 'Percorso chiuso');
  salva(); _tab = 'aperte'; vaiA('elenco');
};
window._acqRiapri = function(id){
  var a = trova(id); if(!a) return;
  var altro = vivi().find(function(x){ return x !== a && x.immUuid === a.immUuid && x.stato !== 'chiusa'; });
  if(altro){ avviso('Per questo immobile c\'è già un percorso aperto'); vaiA('dettaglio', altro.id); return; }
  a.stato = 'aperta'; a.chiusa = ''; diario(a, 'Percorso riaperto');
  salva(); disegna();
};
window._acqElimina = function(id){
  var a = trova(id); if(!a) return;
  var fai = function(){ a.eliminato = true; diario(a, 'Percorso eliminato'); salva(); vaiA('elenco'); };
  if(typeof window.dlgConfirm === 'function'){
    window.dlgConfirm('Elimino questo percorso? Documenti e dati dell\'incarico restano nella scheda immobile.', '', 'Elimina percorso')
      .then(function(ok){ if(ok) fai(); });
  } else if(confirm('Elimino questo percorso?')) fai();
};

/* Per le prove e per la Console: i conti di un percorso senza aprire niente. */
window.statoAcquisizione = function(id){
  var a = trova(id); if(!a) return null;
  var im = immDi(a);
  return { stati:stati(a, im), proprietario:contaDocs(a, im, 'proprietario'), tecnico:contaDocs(a, im, 'tecnico') };
};

})();
