// modules/acquisizioni/acquisizioni.view.js — Percorso di acquisizione
// ----------------------------------------------------------------------------
// [14 ott 2026] INCARICO FIRMATO A MANO (sezione 9): scansione letta con l'AI,
// tabella di conferma, cliente/immobile/percorso aggiornati, scansione
// archiviata su Firebase Storage (a.incaricoFiles). Vista 'importa'.
// [14 ott 2026] REGISTRO PRESTAZIONI (sezione 10): lavori di fotografi e
// tecnici in D.prestazioni, linguetta 'prest' e riquadro nel percorso;
// "Segna pagato" scrive la spesa in Altre Entrate/Spese (D.altriIncassi).
// [13 ott 2026] PEZZO 4: acquisizioni ferme (soglie FERMO), nella pagina e nel
// riepilogo per il connettore di Claude (window.acquisizioniPerClaude).
// [13 ott 2026] PEZZO 3: presentazione dei servizi (vista 'servizi', pubblica
// pubblico/servizi letto da servizi.html; il PDF e' la stessa pagina in A4).
// [13 ott 2026] PEZZO 2: ringraziamento, foto (fotografo o "le faccio io",
// appuntamento in agenda, conferma e consigli al proprietario) e testi dei
// messaggi modificabili dentro la pagina (D.acqTesti).
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
//   openSchedaImmobile, dlgConfirm, showToast; per la sezione 9 anche
//   callClaude, aiGetConfig, _storage/_storageReady, _currentUserId,
//   nomeConMaiuscole. Tutte chiamate con typeof:
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
var CAT_FOTO = ['fotograf'];

/* ── [13 ott 2026] PEZZO 2: TESTI DEI MESSAGGI ─────────────────────────────
   Scelta A di Enzo: si correggono dentro Acquisizioni ("Testi dei messaggi").
   Quelli corretti stanno in D.acqTesti (in _SYNC_KEYS), un record per testo
   ({id:'ringraziamento', testo:'…'}), cosi' sono uguali su tutti i
   dispositivi; se un testo non c'e' vale quello qui sotto.
   SEGNAPOSTO: una riga con un segnaposto VUOTO di quelli "facoltativi"
   (proprietario, catastali, link_servizi, data, ora) sparisce intera: niente
   "Dati catastali: ." nei messaggi. {nome} vuoto toglie solo la parola.
   Saluto e prima frase sulla stessa riga: prima di aprire WhatsApp il
   gestionale mette la maiuscola a ogni riga che parte minuscola. */
var TESTI = [
  { id:'ringraziamento', nome:'Ringraziamento al proprietario', a:'proprietario',
    std:'Buongiorno {nome}, la ringrazio per la fiducia che mi ha dato affidandomi la vendita di {indirizzo}.\n'
      + 'Da oggi mi occupo io di tutto: documenti, foto, pubblicità e visite, e la terrò aggiornata passo per passo.\n'
      + 'Qui trova come lavoro e cosa faccio per vendere la sua casa: {link_servizi}\n'
      + 'Per qualsiasi cosa sono a disposizione.\n\n{agente}\n{agenzia}' },
  { id:'documenti_prop', nome:'Documenti dal proprietario', a:'proprietario',
    std:'Buongiorno {nome}, la ringrazio ancora per la fiducia.\n'
      + 'Per preparare al meglio la vendita di {indirizzo} mi servono questi documenti:\n\n{documenti}\n\n'
      + 'Può mandarmeli anche in foto qui, oppure passo io a ritirarli: mi dica lei cosa le è più comodo.\n'
      + 'Per qualsiasi dubbio sono a disposizione.\n\n{agente}\n{agenzia}' },
  { id:'documenti_tec', nome:'Documenti dal tecnico', a:'tecnico',
    std:'Buongiorno {nome}, le scrivo per un nuovo incarico di vendita: {immobile}.\n'
      + 'Proprietario: {proprietario}.\n'
      + 'Dati catastali: {catastali}.\n\n'
      + 'Le chiederei, quando può, questi documenti:\n\n{documenti}\n\n'
      + 'Mi fa sapere tempi e costo? Grazie.\n\n{agente}\n{agenzia}' },
  { id:'foto_fotografo', nome:'Foto: messaggio al fotografo', a:'fotografo',
    std:'Buongiorno {nome}, ho un nuovo servizio fotografico da fissare: {immobile}.\n'
      + 'Data proposta: {data} alle {ora}.\n'
      + 'Mi conferma se le va bene? Grazie.\n\n{agente}\n{agenzia}' },
  { id:'foto_proprietario', nome:'Foto: conferma e consigli al proprietario', a:'proprietario',
    std:'Buongiorno {nome}, le confermo le foto della casa per {data} alle {ora}.\n'
      + 'Qualche consiglio per farla uscire al meglio:\n'
      + '- luci tutte accese e tapparelle alzate\n'
      + '- letti fatti, piani della cucina e del bagno liberi\n'
      + '- via dalle stanze oggetti personali e panni stesi, auto lontane dall\'ingresso\n'
      + '- animali, se ci sono, in un\'altra stanza\n'
      + 'Ci vorrà circa un\'ora. Grazie!\n\n{agente}\n{agenzia}' }
];
/* il collegamento alla presentazione dei servizi: per ora lo scrive Enzo,
   col pezzo 3 arrivera' la pagina fatta dall'Hub */
var LINK_ID = 'link_servizi';
var SEGNAPOSTO = [
  ['nome', 'il nome di chi riceve il messaggio'],
  ['proprietario', 'il nome del proprietario'],
  ['indirizzo', 'via e comune dell\'immobile'],
  ['immobile', 'tipo e indirizzo (es. "appartamento in Via del Mare 5, Agropoli")'],
  ['catastali', 'foglio, particella, sub e categoria'],
  ['documenti', 'l\'elenco dei documenti che mancano'],
  ['data', 'il giorno delle foto (es. "giovedì 16 ottobre")'],
  ['ora', 'l\'ora delle foto'],
  ['link_servizi', 'il collegamento alla presentazione dei servizi'],
  ['agente', 'il tuo nome'],
  ['agenzia', 'il nome dell\'agenzia']
];
var FACOLTATIVI = ['proprietario', 'catastali', 'link_servizi', 'data', 'ora'];

/* I messaggi che partono dalla pagina: a chi vanno, con che testo, e dove
   si ricorda che sono partiti. proprietario e tecnico tengono i nomi dei
   campi del pezzo 1 (inviato/canale), cosi' i percorsi gia' aperti restano
   giusti. */
var MSG = {
  grazie:       { tpl:'ringraziamento',    dest:'prop', tappa:'grazie',       campo:'inviato',      ogg:'Grazie per la fiducia' },
  proprietario: { tpl:'documenti_prop',    dest:'prop', tappa:'proprietario', campo:'inviato',      ogg:'Documenti per la vendita' },
  tecnico:      { tpl:'documenti_tec',     dest:'tec',  tappa:'tecnico',      campo:'inviato',      ogg:'Documenti per la vendita' },
  fotografo:    { tpl:'foto_fotografo',    dest:'foto', tappa:'foto',         campo:'invFotografo', ogg:'Servizio fotografico' },
  fotoprop:     { tpl:'foto_proprietario', dest:'prop', tappa:'foto',         campo:'invProp',      ogg:'Le foto della casa' }
};
var GIORNI_SETT = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
var MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];

var _vista = 'elenco';      /* elenco | nuovo | dettaglio | testi | servizi | importa */
var _tab = 'aperte';        /* aperte | chiuse | prest (registro prestazioni) */
var _apertoId = '';
var _cerca = '';
var _attesa = null;         /* timer di "carica un immobile nuovo" */

/* ── [13 ott 2026] PEZZO 3: PRESENTAZIONE DEI SERVIZI ─────────────────────
   Scelte di Enzo: si prepara qui nel gestionale (B), il PDF e' la stessa
   pagina stampata in A4 (A), grafica come Valuta casa (A), con le sezioni
   Chi sono, Metodo, Recensioni e Impegni.
   I testi stanno in D.acqTesti, record {id:'presentazione', dati:{…}}
   (gia' in _SYNC_KEYS: uguali su tutti i dispositivi) e si pubblicano nel
   documento pubblico/servizi, che servizi.html legge senza login.
   Foto, logo, colori, WhatsApp, recensioni e dati dell'agenzia NON stanno
   qui: la pagina li prende da pubblico/valutacasa, quelli che Enzo imposta
   nell'Hub (Link in Bio → Valuta casa). Una volta sola, un posto solo. */
var SV_URL = 'https://agenzioimmobiliare.github.io/servizi.html';
var SV_ICONE = [
  ['valuta','Casa / valutazione'],['documenti','Documenti'],['foto','Foto'],['video','Video'],['portali','Portali e web'],
  ['social','Social'],['clienti','Clienti'],['openhouse','Open House / agenda'],['cartello','Cartello'],['report','Messaggi / report'],
  ['trattativa','Trattativa'],['rogito','Chiavi / rogito'],['stella','Stella']
];
/* Testi di partenza: da rileggere. Non contengono numeri o promesse che il
   gestionale non sa verificare (anni di lavoro, case vendute…). */
var SV_BASE = {
  eyebrow:'Enzo Carnicelli · Agropoli e Cilento',
  tit:'Come vendo', tit2:'la tua casa',
  sot:'Dalla valutazione al rogito: cosa faccio, passo per passo, e cosa puoi aspettarti da me.',
  chi:'Sono Enzo Carnicelli, agente immobiliare ad Agropoli e nel Cilento con FRIMM Capital Casa Paestum.\nLavoro in modo semplice: ti dico quanto vale davvero la tua casa, la preparo per la vendita e la seguo io, di persona, fino al rogito.',
  tel:'', email:'',
  sez:{ chi:true, metodo:true, rec:true, impegni:true },
  servizi:[
    { k:'valuta', t:'Valutazione gratuita', s:'Il prezzo di partenza calcolato sulle quotazioni ufficiali della zona e sulle vendite vere, spiegato per iscritto.' },
    { k:'documenti', t:'Verifica dei documenti', s:'Atto di provenienza, catasto e conformità controllati prima di pubblicare, con il tecnico di fiducia: niente sorprese al rogito.' },
    { k:'foto', t:'Servizio fotografico', s:'Foto luminose e curate, con i consigli per preparare la casa prima dello scatto.' },
    { k:'video', t:'Video tour e reel', s:'Un video verticale per social e portali, che fa vedere la casa prima della visita.' },
    { k:'portali', t:'Pubblicazione sui portali', s:'Annunci sui principali portali immobiliari e nel circuito FRIMM, con testi scritti apposta.' },
    { k:'social', t:'Promozione sui social', s:'Instagram, Facebook e TikTok, per arrivare anche a chi non cerca sui portali.' },
    { k:'clienti', t:'Clienti già in cerca', s:'Propongo la casa a chi mi ha già chiesto un immobile come il tuo.' },
    { k:'openhouse', t:'Open House', s:'Una giornata di visite su appuntamento, quando serve a creare interesse.' },
    { k:'report', t:'Resoconto dopo ogni visita', s:'Ti scrivo com\'è andata e cosa hanno detto i visitatori.' },
    { k:'trattativa', t:'Trattativa e proposta', s:'Gestisco offerte e controproposte e verifico chi vuole comprare.' },
    { k:'rogito', t:'Fino al rogito', s:'Seguo mutuo, notaio e documenti fino alla firma e alla consegna delle chiavi.' },
    { k:'cartello', t:'Cartello vendesi', s:'Sul posto, se lo vuoi.' }
  ],
  metodo:[
    { t:'Valutazione', s:'Vediamo la casa insieme e ti do un prezzo realistico, con i dati alla mano.' },
    { t:'Incarico e documenti', s:'Firmiamo l\'incarico e raccolgo i documenti con il tecnico.' },
    { t:'Foto e video', s:'Prepariamo la casa e facciamo foto e video.' },
    { t:'Pubblicazione', s:'Portali, social e clienti già in cerca, nello stesso momento.' },
    { t:'Visite e resoconti', s:'Accompagno io le visite e ti racconto ogni riscontro.' },
    { t:'Trattativa e rogito', s:'Dalla proposta alla firma dal notaio, ti seguo fino alle chiavi.' }
  ],
  impegni:[
    'Ti dico la verità sul prezzo, anche quando non è quella che speri.',
    'I costi sono scritti nell\'incarico prima di cominciare: niente sorprese.',
    'Dopo ogni visita ti mando un resoconto.',
    'Ti rispondo io, di persona, anche su WhatsApp.'
  ]
};
var _svB = null;                                   /* bozza in modifica */
var _svOn = { letto:false, pub:null, errore:'' };  /* com'e' online */

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
function salva(){ try{ if(typeof window.saveD === 'function') window.saveD(); }catch(e){ console.warn('[Acquisizioni] saveD KO:', e); } try{ if(typeof window.acqAggiornaHome === 'function') window.acqAggiornaHome(); }catch(e){} }
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
  cerca: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  matita:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>',
  stella:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  su:    '<polyline points="18 15 12 9 6 15"/>',
  giu:   '<polyline points="6 9 12 15 18 9"/>',
  x:     '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  ai:    '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
  clip:  '<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>',
  foto:  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  firma: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 17c1.2-1.6 2.2-1.6 3 0s1.8 1.6 3 0"/>',
  cal:   '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
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
function rubrica(cat){
  return (Array.isArray(D.informatori) ? D.informatori : []).filter(function(x){
    var c = String(x && x.categoria || '').toLowerCase();
    return x && x.id && cat.some(function(t){ return c.indexOf(t) === 0; });
  });
}
function tecnici(){ return rubrica(CAT_TEC); }
function fotografi(){ return rubrica(CAT_FOTO); }
function contatto(id){
  if(!id) return null;
  return (Array.isArray(D.informatori) ? D.informatori : []).find(function(x){ return x && x.id === id; }) || null;
}
function tecDi(a){ return contatto(a && a.tappe && a.tappe.tecnico && a.tappe.tecnico.tecnicoId); }
function fotDi(a){ return contatto(a && a.tappe && a.tappe.foto && a.tappe.foto.fotografoId); }
/* aaaa-mm-gg → "giovedì 16 ottobre" */
function dataLunga(s){
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); if(!m) return '';
  var d = new Date(+m[1], +m[2] - 1, +m[3]);
  return GIORNI_SETT[d.getDay()] + ' ' + (+m[3]) + ' ' + MESI[+m[2] - 1];
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
  ['incarico','grazie','proprietario','tecnico','foto'].forEach(function(k){ if(!a.tappe[k] || typeof a.tappe[k] !== 'object') a.tappe[k] = {}; });
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
/* ringraziamento: fatto appena parte (o se Enzo lo segna fatto a voce) */
function statoGrazie(a){ var t = norma(a).tappe.grazie; return (t.inviato || t.fatto) ? 'fatto' : 'fare'; }
/* foto: in corso quando c'e' la data, fatto quando Enzo segna "foto fatte" */
function statoFoto(a){ var t = norma(a).tappe.foto; return t.fatte ? 'fatto' : (t.data ? 'corso' : 'fare'); }
function stati(a, im){
  return { incarico:statoIncarico(a), grazie:statoGrazie(a), proprietario:statoDocs(a, im, 'proprietario'),
           tecnico:statoDocs(a, im, 'tecnico'), foto:statoFoto(a) };
}
var TAPPE_ET = { incarico:'Incarico', grazie:'Grazie', proprietario:'Proprietario', tecnico:'Tecnico', foto:'Foto' };

/* ── [13 ott 2026] PEZZO 4: ACQUISIZIONI FERME ─────────────────────────────
   Scelta A di Enzo (soglie "normali"). Una tappa e' ferma quando dalla sua
   data di riferimento sono passati PIU' giorni della soglia:
     firma      7  dalla preparazione del modulo (o dall'avvio)
     grazie     2  dalla firma
     prop.      7  dalla richiesta dei documenti (o dalla firma, se mai chiesti)
     tecnico   10  idem
     foto       7  dalla firma, finche' non c'e' la data; 2 dopo la data delle
                   foto, se non sono segnate fatte
   UNA SOLA VERITA': questa funzione e' usata dalla pagina e dal riepilogo che
   legge il connettore di Claude. Al connettore passano TUTTE le tappe aperte
   con data di riferimento e soglia: i giorni li ricalcola lui sul giorno in
   cui gli si chiede, cosi' un riepilogo di ieri resta giusto oggi. */
var FERMO = { firma:7, grazie:2, proprietario:7, tecnico:10, fotoFissa:7, fotoFatte:2 };
/* tappe ancora aperte con data di riferimento (d) e soglia (s) */
function attese(a, im){
  var t = norma(a).tappe, out = [], st = stati(a, im), firmato = t.incarico.firmato;
  if(st.incarico !== 'fatto') out.push({ k:'incarico', d:t.incarico.preparato || a.creato, s:FERMO.firma,
    x:t.incarico.preparato ? 'Incarico non ancora firmato (modulo preparato il ' + it(t.incarico.preparato) + ')' : 'Incarico non ancora preparato né firmato' });
  if(firmato && st.grazie !== 'fatto') out.push({ k:'grazie', d:firmato, s:FERMO.grazie, x:'Proprietario non ancora ringraziato (incarico firmato il ' + it(firmato) + ')' });
  ['proprietario','tecnico'].forEach(function(chi){
    if(st[chi] === 'fatto') return;
    var c = contaDocs(a, im, chi), inv = t[chi].inviato, tec = chi === 'tecnico' ? tecDi(a) : null;
    var di = chi === 'tecnico' ? 'dal tecnico' + (tec ? ' ' + bello(tec.nome) : '') : 'dal proprietario';
    if(inv) out.push({ k:chi, d:inv, s:FERMO[chi], x:'Documenti ' + di + ' chiesti il ' + it(inv) + ', ne mancano ' + c.mancanti.length });
    else if(firmato) out.push({ k:chi, d:firmato, s:FERMO[chi], x:'Documenti ' + di + ' non ancora chiesti' + (chi === 'tecnico' && !tec ? ' (tecnico non scelto)' : '') });
  });
  var tf = t.foto;
  if(!tf.fatte){
    if(tf.data) out.push({ k:'foto', d:tf.data, s:FERMO.fotoFatte, x:'Foto del ' + it(tf.data) + ' non segnate come fatte' });
    else if(firmato) out.push({ k:'foto', d:firmato, s:FERMO.fotoFissa, x:'Foto non ancora fissate' });
  }
  return out;
}
/* le attese scadute oggi: [{k, x, gg}] dalla piu' vecchia */
function ferme(a, im){
  if(!a || a.stato === 'chiusa' || a.eliminato || !im) return [];
  return attese(a, im).map(function(w){ return { k:w.k, x:w.x, gg:giorni(w.d) - w.s }; })
    .filter(function(w){ return w.gg > 0; }).sort(function(x, y){ return y.gg - x.gg; });
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
function testiSalvati(){
  if(typeof D === 'undefined' || !D) return [];
  if(!Array.isArray(D.acqTesti)) D.acqTesti = [];
  return D.acqTesti;
}
function testoSalvato(id){
  var r = testiSalvati().find(function(x){ return x && x.id === id; });
  return (r && typeof r.testo === 'string') ? r.testo : null;
}
function modello(id){
  var t = testoSalvato(id);
  if(t !== null && t.trim()) return t;
  var d = TESTI.find(function(x){ return x.id === id; });
  return d ? d.std : '';
}
function linkServizi(){ var t = testoSalvato(LINK_ID); return t ? t.trim() : ''; }
/* riempie i segnaposto; le righe con un facoltativo vuoto spariscono */
function riempi(testo, V){
  var righe = String(testo || '').split('\n').filter(function(r){
    var m = r.match(/\{([a-z_]+)\}/g) || [];
    return !m.some(function(x){ var k = x.slice(1, -1); return FACOLTATIVI.indexOf(k) >= 0 && !String(V[k] || '').trim(); });
  });
  return righe.join('\n')
    .replace(/\{([a-z_]+)\}/g, function(x, k){ return Object.prototype.hasOwnProperty.call(V, k) ? String(V[k] == null ? '' : V[k]) : x; })
    .replace(/[ \t]+,/g, ',').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function destDi(a, im, chi){
  var d = MSG[chi] ? MSG[chi].dest : 'prop';
  if(d === 'tec') return tecDi(a);
  if(d === 'foto') return fotDi(a);
  return propDi(im);
}
function valori(a, im, chi){
  var p = propDi(im), dest = destDi(a, im, chi) || {}, t = norma(a).tappe.foto;
  var dove = im ? (im.indirizzo ? im.indirizzo + (im.comune ? ', ' + im.comune : '') : (im.comune || 'il suo immobile')) : 'il suo immobile';
  var cosa = im ? ((im.tipo ? String(im.tipo).toLowerCase() + ' in ' : 'immobile in ') + (im.indirizzo || '') + (im.comune ? (im.indirizzo ? ', ' : '') + im.comune : '')) : 'un immobile';
  var docChi = chi === 'tecnico' ? 'tecnico' : 'proprietario';
  var m = contaDocs(a, im, docChi).mancanti;
  return {
    nome: bello(dest.nome || ''),
    proprietario: bello(p.nome || ''),
    indirizzo: dove,
    immobile: cosa,
    catastali: catastali(im),
    documenti: m.length ? elenco(a, m) : '- (nessuno: la lista è completa)',
    data: dataLunga(t.data),
    ora: t.ora || '',
    link_servizi: linkServizi(),
    agente: agenteNome(),
    agenzia: agenzia()
  };
}
function testoDi(a, im, chi){ return riempi(modello(MSG[chi].tpl), valori(a, im, chi)); }
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
    /* [14 ott 2026] tabella di conferma dell'incarico letto con l'AI */
    + '#acq-wrap table.acq-imp{width:100%;border-collapse:collapse;font-size:0.84rem}'
    + '#acq-wrap table.acq-imp th{padding:7px 10px;text-align:left;font-size:0.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3);border-bottom:1px solid var(--border)}'
    + '#acq-wrap table.acq-imp td{padding:6px 10px;border-bottom:1px solid var(--border);vertical-align:middle;color:var(--text)}'
    + '#acq-wrap table.acq-imp td.et{font-weight:600;white-space:nowrap}'
    + '#acq-wrap table.acq-imp td:nth-child(3){min-width:180px}'
    /* [14 ott 2026] registro prestazioni: elenco largo, riepilogo stretto */
    + '#acq-wrap .acq-grid-reg{grid-template-columns:minmax(0,2fr) minmax(300px,1fr)}'
    + '@media(max-width:1100px){#acq-wrap .acq-grid-reg{grid-template-columns:1fr}}'
    + '#acq-wrap .acq-num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:currentColor;flex-shrink:0}'
    + '#acq-wrap .acq-num b{color:#fff;font-size:0.72rem}'
    + 'body.dark-mode #acq-wrap .acq-num b{color:#0F172A}'
    /* il numero della tappa sostituisce il pallino delle colonne gx */
    + '#acq-wrap .gx-head::before{display:none!important}'
    /* [13 ott 2026] Enzo: troppo spazio ai lati. Tutta la larghezza, margine stretto */
    + 'html body #acq-wrap .gx-dentro{max-width:none!important;margin:0!important}'
    + 'html body #acq-wrap .gx-corpo{padding:14px 18px!important}'
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
  var n = { incarico:0, grazie:0, proprietario:0, tecnico:0, foto:0 }, nFerme = 0;
  aperte.forEach(function(a){
    var s = stati(a, immDi(a));
    if(ferme(a, immDi(a)).length) nFerme++;
    Object.keys(n).forEach(function(k){ if(s[k] !== 'fatto') n[k]++; });
  });
  var ling = window.gxLinguette([['aperte','In corso',aperte.length,'#334155'],['chiuse','Chiuse',chiuse.length,'#334155'],['prest','Prestazioni',prestVive().length,'var(--brand,#EA580C)']], _tab, '_acqTab');
  var h = window.gxTesta('Acquisizioni', '', 'dal sì del proprietario alla pubblicazione');
  h += '<div class="acq-barra">' + ling + '<div style="flex:1"></div>'
    + '<button class="gx-btn" onclick="_acqServizi()">' + ico(I.stella) + ' Presentazione servizi</button>'
    + '<button class="gx-btn" onclick="_acqTesti()">' + ico(I.matita) + ' Testi dei messaggi</button>'
    + '<button class="gx-btn" onclick="_acqImpAvvia()" title="Hai un incarico già firmato su carta: l\'AI legge la scansione e compila cliente, immobile e percorso">' + ico(I.firma) + ' Incarico firmato a mano</button>'
    + '<button class="gx-btn pieno" onclick="_acqNuovo()">' + ico(I.piu) + ' Nuovo incarico</button></div>';
  /* [14 ott 2026] linguetta Prestazioni: il registro dei professionisti */
  if(_tab === 'prest') return h + disegnaRegistro();
  h += '<div class="gx-cards acq-cards">'
    + window.gxCard('In corso', aperte.length, 'percorsi aperti', 'var(--brand,#EA580C)')
    + window.gxCard('Incarico da firmare', n.incarico, 'firma non ancora segnata', n.incarico ? c.am : c.ok)
    + window.gxCard('Ringraziamento', n.grazie, 'proprietari da ringraziare', n.grazie ? c.am : c.ok)
    + window.gxCard('Documenti', Math.max(n.proprietario, n.tecnico), n.proprietario + ' dal proprietario · ' + n.tecnico + ' dal tecnico', (n.proprietario || n.tecnico) ? c.am : c.ok)
    + window.gxCard('Foto da fare', n.foto, 'servizi non ancora fatti', n.foto ? c.am : c.ok)
    + window.gxCard('Ferme', nFerme, nFerme ? 'una tappa è oltre i giorni previsti' : 'tutto procede', nFerme ? c.ko : c.ok)
    + '</div>';
  /* le ferme in cima (scelta del pezzo 4), poi le piu' recenti */
  var L = (_tab === 'chiuse' ? chiuse : aperte).slice().sort(function(x, y){
    var fx = ferme(x, immDi(x)).length ? 1 : 0, fy = ferme(y, immDi(y)).length ? 1 : 0;
    return (fy - fx) || String(y.creato || '').localeCompare(String(x.creato || ''));
  });
  var righe = L.map(function(a){
    var im = immDi(a), s = stati(a, im), p = propDi(im), tf = norma(a).tappe.foto;
    var sub = [];
    if(p.nome) sub.push(bello(p.nome));
    sub.push((a.stato === 'chiusa' ? 'chiuso il ' + it(a.chiusa) : 'avviato il ' + it(a.creato) + ' · ' + giorni(a.creato) + ' gg'));
    if(tf.data && !tf.fatte) sub.push('foto ' + dataLunga(tf.data) + (tf.ora ? ' alle ' + tf.ora : ''));
    if(!im) sub.push('immobile non più in archivio');
    var F = ferme(a, im);
    return '<div class="gx-riga acq-riga" onclick="_acqApri(\'' + jsq(a.id) + '\')">'
      + '<div style="flex:1;min-width:220px"><div class="tt">' + esc(im ? etichetta(im) : (a.immEt || 'Immobile')) + '</div>'
      + '<div class="sub">' + esc(sub.join(' · ')) + '</div>'
      + (F.length ? '<div class="sub" style="color:' + c.ko + ';font-weight:600">Ferma: ' + esc(F[0].x) + ' · ' + F[0].gg + ' gg oltre' + (F.length > 1 ? ' (+' + (F.length - 1) + ')' : '') + '</div>' : '')
      + '</div>'
      + '<div class="acq-tappe">' + Object.keys(TAPPE_ET).map(function(k){ return pill(s[k], TAPPE_ET[k]); }).join('') + '</div>'
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
    + '<button class="gx-btn pieno" onclick="_acqCaricaNuovo()">' + ico(I.casa) + ' Immobile non in archivio: caricalo ora</button>'
    + '<button class="gx-btn" onclick="_acqImpAvvia()">' + ico(I.firma) + ' Incarico già firmato su carta: leggilo con l\'AI</button></div>';
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
/* chi: una chiave di MSG. Il testo e' quello del modello, gia' riempito. */
function bloccoMsg(a, im, chi){
  var M = MSG[chi], dest = destDi(a, im, chi) || {}, t = norma(a).tappe[M.tappa];
  var quando = t[M.campo], canale = t[M.campo === 'inviato' ? 'canale' : M.campo + 'Canale'];
  var h = '<div style="padding:12px 16px;border-bottom:1px solid var(--border)">'
    + '<div class="gx-sotto">Messaggio' + (dest.nome ? ' per ' + esc(bello(dest.nome)) : '') + ' — puoi correggerlo prima di inviarlo</div>'
    + '<textarea id="acq-msg-' + chi + '" class="acq-msg" rows="' + righeDi(testoDi(a, im, chi)) + '">' + esc(testoDi(a, im, chi)) + '</textarea></div>';
  h += '<div class="acq-azioni">'
    + '<button class="gx-btn pieno" onclick="_acqInvia(\'' + jsq(a.id) + '\',\'' + chi + '\',\'wa\')"' + (dest.tel ? '' : ' disabled title="Manca il numero di telefono"') + '>' + ico(I.wa) + ' WhatsApp</button>'
    + '<button class="gx-btn" onclick="_acqInvia(\'' + jsq(a.id) + '\',\'' + chi + '\',\'mail\')"' + (dest.email ? '' : ' disabled title="Manca l\'indirizzo email"') + '>' + ico(I.mail) + ' Email</button>'
    + '<button class="gx-btn" onclick="_acqCopia(\'' + chi + '\')">' + ico(I.copia) + ' Copia testo</button>'
    + '<span class="nota">' + (quando ? 'Inviato il ' + it(quando) + (canale ? ' via ' + (canale === 'wa' ? 'WhatsApp' : 'email') : '') : 'Non ancora inviato') + '</span>'
    + '</div>';
  if(!dest.tel && !dest.email) h += '<div class="gx-nota" style="margin:0;padding:10px 16px">' + (M.dest === 'prop' ? 'Il proprietario' : 'Questo contatto') + ' non ha né telefono né email: aggiungili nella sua scheda, oppure usa "Copia testo".</div>';
  return h;
}
function sceltaRubrica(a, campoFn, elenco, scelto, vuoto){
  return '<select class="acq-in" onchange="' + campoFn + '(\'' + jsq(a.id) + '\',this.value)"><option value="">— scegli dalla Rubrica —</option>'
    + elenco.map(function(x){ return '<option value="' + esc(x.id) + '"' + (scelto && scelto.id === x.id ? ' selected' : '') + '>' + esc(bello(x.nome) + ' · ' + (x.categoria || '')) + '</option>'; }).join('')
    + '</select>' + (elenco.length ? '' : '<span class="nota">' + vuoto + '</span>');
}
/* il riquadro alto quanto il testo (le righe lunghe vanno a capo: +20%), fra 6 e 22 righe */
function righeDi(t){ var n = String(t || '').split('\n').length; return Math.max(6, Math.min(22, Math.ceil(n * 1.2) + 1)); }
function testa(n, titolo, st){
  return '<span style="display:inline-flex;align-items:center;gap:8px"><span class="acq-num" style="color:' + stCol(st) + '"><b>' + n + '</b></span>' + titolo + '</span>';
}

function disegnaDettaglio(a){
  norma(a);
  var c = C(), im = immDi(a), p = propDi(im), s = stati(a, im), id = jsq(a.id);
  var h = window.gxTesta(im ? etichetta(im) : (a.immEt || 'Acquisizione'), '', (p.nome ? bello(p.nome) + ' · ' : '') + 'avviato il ' + it(a.creato));
  h += '<div class="acq-barra"><button class="gx-btn" onclick="_acqElenco()">&larr; Torna all\'elenco</button>'
    + (im ? '<button class="gx-btn" onclick="_acqScheda(\'' + jsq(im.uuid) + '\')">' + ico(I.casa) + ' Apri scheda immobile</button>' : '')
    + '<div style="flex:1"></div>'
    + (a.stato === 'chiusa'
        ? '<span class="acq-pill" style="color:' + c.no + '"><i></i>Chiuso il ' + esc(it(a.chiusa)) + '</span><button class="gx-btn" onclick="_acqRiapri(\'' + id + '\')">Riapri</button>'
        : '<button class="gx-btn" onclick="_acqChiudi(\'' + id + '\')">Chiudi percorso</button>')
    + '<button class="gx-btn rosso" onclick="_acqElimina(\'' + id + '\')">Elimina</button></div>';

  if(!im){
    h += '<div class="gx-info" style="border-left:4px solid ' + c.ko + '"><b>Immobile non trovato.</b> Il percorso resta qui, ma senza l\'immobile non posso mostrare documenti e incarico. Probabilmente è stato archiviato o eliminato.</div>';
    return h + cronologia(a);
  }
  var F = ferme(a, im);
  if(F.length) h += '<div class="gx-info" style="border-left:4px solid ' + c.ko + '"><b>Percorso fermo.</b> ' + F.map(function(w){ return esc(w.x) + ' — ' + w.gg + ' gg oltre i giorni previsti'; }).join('<br>') + '</div>';
  var tutteFatte = Object.keys(TAPPE_ET).every(function(k){ return s[k] === 'fatto'; });
  if(a.stato !== 'chiusa' && tutteFatte){
    h += '<div class="gx-info" style="border-left:4px solid ' + c.ok + ';display:flex;flex-wrap:wrap;gap:10px;align-items:center"><span style="flex:1;min-width:240px"><b>Tutte le tappe sono fatte: l\'immobile è pronto per la pubblicazione.</b> Portali, social e video si preparano nel Marketing Hub; poi puoi chiudere il percorso.</span>'
      + (typeof window.aprIMarketingHub === 'function' ? '<button class="gx-btn pieno" onclick="aprIMarketingHub()">Apri il Marketing Hub</button>' : '') + '</div>';
  }

  /* 1 · INCARICO — i campi sono quelli della scheda immobile */
  var ti = a.tappe.incarico;
  var conf = String(im.conferimento || '').toLowerCase();
  var inc = '<div class="acq-campi">'
    + '<label>Conferimento<select class="acq-in" onchange="_acqImm(\'' + id + '\',\'conferimento\',this.value)">'
    +   '<option value=""' + (conf ? '' : ' selected') + '>— da indicare —</option>'
    +   '<option' + (conf === 'in esclusiva' ? ' selected' : '') + '>in esclusiva</option>'
    +   '<option' + (conf === 'non esclusiva' ? ' selected' : '') + '>non esclusiva</option></select></label>'
    + '<label>Inizio mandato<input type="date" class="acq-in" value="' + esc(im.incInizio || '') + '" onchange="_acqImm(\'' + id + '\',\'incInizio\',this.value)"></label>'
    + '<label>Scadenza<input type="date" class="acq-in" value="' + esc(im.incFine || '') + '" onchange="_acqImm(\'' + id + '\',\'incFine\',this.value)"></label>'
    + '<label>Provvigione %<input class="acq-in" style="width:80px" value="' + esc(im.incPerc || '') + '" onchange="_acqImm(\'' + id + '\',\'incPerc\',this.value)"></label>'
    + '</div>';
  inc += '<div class="acq-azioni">'
    + '<button class="gx-btn' + (ti.preparato ? '' : ' pieno') + '" onclick="_acqPrepara(\'' + id + '\')">' + ico(I.doc) + ' Prepara incarico</button>'
    + (ti.firmato
        ? '<span class="acq-pill" style="color:' + c.ok + '"><i></i>Firmato il ' + esc(it(ti.firmato)) + '</span><button class="gx-btn" onclick="_acqFirma(\'' + id + '\',\'\')">Annulla firma</button>'
        : '<label style="display:inline-flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--text3);font-weight:700">Firmato il <input type="date" id="acq-firma" class="acq-in" value="' + oggi() + '"></label>'
          + '<button class="gx-btn' + (ti.preparato ? ' pieno' : '') + '" onclick="_acqFirma(\'' + id + '\',(document.getElementById(\'acq-firma\')||{}).value||\'\')">' + ico(I.ok) + ' Segna firmato</button>')
    + '<span class="nota">' + (ti.preparato && !ti.firmato ? 'Modulo preparato il ' + it(ti.preparato) : '') + '</span>'
    + '</div>';
  /* [14 ott 2026] incarico firmato a mano: lettura con l'AI e scansione archiviata */
  var IF = Array.isArray(a.incaricoFiles) ? a.incaricoFiles : [];
  inc += '<div class="acq-azioni">'
    + '<button class="gx-btn" onclick="_acqImpAvvia(\'' + id + '\')" title="L\'incarico è firmato su carta: l\'AI legge la scansione e propone i dati">' + ico(I.ai) + ' Leggi l\'incarico firmato con l\'AI</button>'
    + '<button class="gx-btn" onclick="_acqAllega(\'' + id + '\')"' + (a._archivio ? ' disabled' : '') + '>' + ico(I.clip) + ' Allega la scansione</button>'
    + '<span class="nota">' + (a._archivio ? 'Archiviazione della scansione in corso…' : (IF.length ? '' : 'Scansione dell\'incarico firmato non ancora archiviata')) + '</span></div>';
  inc += IF.map(function(f, i){
    return '<div class="acq-doc"><span style="color:' + c.ok + ';display:inline-flex">' + ico(f.mime === 'application/pdf' ? I.doc : I.foto, 16) + '</span>'
      + '<span class="n">' + esc(f.nome || 'Scansione') + ' <span style="color:var(--text4);font-size:0.76rem">· archiviata il ' + esc(it(f.data)) + '</span></span>'
      + '<a class="gx-btn" href="' + esc(f.url) + '" target="_blank" rel="noopener">Apri</a>'
      + '<button class="gx-btn" onclick="_acqTogliFile(\'' + id + '\',' + i + ')">Togli</button></div>';
  }).join('');
  inc += '<div class="gx-nota" style="margin:0;padding:10px 16px">Sono gli stessi campi della scheda immobile: scrivere qui o là è uguale. "Prepara incarico" apre il modulo FRIMM già compilato.</div>';

  /* 2 · RINGRAZIAMENTO */
  var tg = a.tappe.grazie;
  var gra = bloccoMsg(a, im, 'grazie');
  var graAz = ''
    + (tg.inviato || tg.fatto
        ? (tg.fatto && !tg.inviato ? '<span class="acq-pill" style="color:' + c.ok + '"><i></i>Fatto a voce il ' + esc(it(tg.fatto)) + '</span><button class="gx-btn" onclick="_acqGrazieVoce(\'' + id + '\')">Annulla</button>' : '')
        : '<button class="gx-btn" onclick="_acqGrazieVoce(\'' + id + '\')">' + ico(I.ok) + ' Ringraziato a voce</button>')
    + (linkServizi() ? '' : '<span class="nota">Il collegamento alla presentazione dei servizi non è ancora impostato: aggiungilo in "Testi dei messaggi".</span>');
  if(graAz) gra += '<div class="acq-azioni">' + graAz + '</div>';

  /* 3 · DOCUMENTI DAL PROPRIETARIO */
  var cp = contaDocs(a, im, 'proprietario');
  var ape = apeDi(a);
  var prop = '<div class="acq-azioni"><span class="nota" style="font-weight:700">L\'APE</span><div class="acq-scelta">'
    + ['', 'proprietario', 'tecnico'].map(function(v){
        var et = v === '' ? 'Non so ancora' : (v === 'proprietario' ? 'Ce l\'ha il proprietario' : 'Lo fa il tecnico');
        return '<button class="' + (ape === v ? 'on' : '') + '" onclick="_acqApe(\'' + id + '\',\'' + v + '\')">' + et + '</button>';
      }).join('') + '</div></div>';
  prop += bloccoDocs(a, im, 'proprietario');
  prop += bloccoMsg(a, im, 'proprietario');

  /* 4 · DOCUMENTI DAL TECNICO */
  var ct = contaDocs(a, im, 'tecnico'), tec = tecDi(a);
  var tecS = '<div class="acq-azioni"><span class="nota" style="font-weight:700">Tecnico</span>'
    + sceltaRubrica(a, '_acqTecnico', tecnici(), tec, 'Nella Rubrica non c\'è ancora nessun geometra, architetto o ingegnere: aggiungilo da Anagrafiche → Rubrica.')
    + '</div>';
  tecS += bloccoDocs(a, im, 'tecnico');
  if(tec) tecS += bloccoMsg(a, im, 'tecnico');
  else tecS += '<div class="gx-nota" style="margin:0;padding:10px 16px">Scegli il tecnico per preparare il messaggio.</div>';

  /* 5 · FOTO — scelta A di Enzo: ogni volta fotografo oppure "le faccio io" */
  var tf = a.tappe.foto, fot = fotDi(a);
  var foto = '<div class="acq-azioni"><span class="nota" style="font-weight:700">Chi le fa</span><div class="acq-scelta">'
    + [['fotografo','Il fotografo'],['io','Le faccio io']].map(function(v){
        return '<button class="' + (tf.chi === v[0] ? 'on' : '') + '" onclick="_acqFotoChi(\'' + id + '\',\'' + v[0] + '\')">' + v[1] + '</button>';
      }).join('') + '</div>'
    + (tf.chi === 'fotografo' ? sceltaRubrica(a, '_acqFotografo', fotografi(), fot, 'Nella Rubrica non c\'è ancora nessun fotografo: aggiungilo con la categoria "Fotografo".') : '')
    + '</div>';
  foto += '<div class="acq-campi">'
    + '<label>Giorno<input type="date" id="acq-foto-data" class="acq-in" value="' + esc(tf.data || '') + '"></label>'
    + '<label>Ora<input type="time" id="acq-foto-ora" class="acq-in" value="' + esc(tf.ora || '') + '"></label>'
    + '<label style="justify-content:flex-end"><button class="gx-btn' + (tf.data ? '' : ' pieno') + '" style="padding:6px 12px" onclick="_acqFotoData(\'' + id + '\')">' + ico(I.cal) + (tf.data ? ' Sposta in agenda' : ' Metti in agenda') + '</button></label>'
    + '</div>';
  if(tf.data){
    foto += '<div class="acq-azioni"><span class="acq-pill" style="color:' + c.blu + '"><i></i>In agenda: ' + esc(dataLunga(tf.data)) + (tf.ora ? ' alle ' + esc(tf.ora) : '') + '</span>'
      + (tf.fatte
          ? '<span class="acq-pill" style="color:' + c.ok + '"><i></i>Foto fatte il ' + esc(it(tf.fatte)) + '</span><button class="gx-btn" onclick="_acqFotoFatte(\'' + id + '\')">Annulla</button>'
          : '<button class="gx-btn" onclick="_acqFotoFatte(\'' + id + '\')">' + ico(I.ok) + ' Foto fatte</button>')
      + '</div>';
    if(tf.chi === 'fotografo'){
      if(fot) foto += bloccoMsg(a, im, 'fotografo');
      else foto += '<div class="gx-nota" style="margin:0;padding:10px 16px">Scegli il fotografo per preparare il messaggio.</div>';
    }
    foto += bloccoMsg(a, im, 'fotoprop');
  } else {
    foto += '<div class="gx-nota" style="margin:0;padding:10px 16px">Fissa giorno e ora: l\'appuntamento va in agenda e si preparano i messaggi' + (tf.chi === 'fotografo' ? ' per il fotografo e' : '') + ' per il proprietario.</div>';
  }

  h += '<div class="acq-grid">'
    + '<div>' + window.gxCol(testa(1, 'Incarico', s.incarico), pill(s.incarico), stCol(s.incarico), inc)
    +           window.gxCol(testa(2, 'Ringraziamento', s.grazie), pill(s.grazie), stCol(s.grazie), gra)
    +           window.gxCol(testa(3, 'Documenti dal proprietario', s.proprietario), pill(s.proprietario, cp.ok + ' di ' + cp.tot + ' raccolti'), stCol(s.proprietario), prop) + '</div>'
    + '<div>' + window.gxCol(testa(4, 'Documenti dal tecnico', s.tecnico), pill(s.tecnico, ct.ok + ' di ' + ct.tot + ' raccolti'), stCol(s.tecnico), tecS)
    +           window.gxCol(testa(5, 'Foto', s.foto), pill(s.foto), stCol(s.foto), foto)
    +           bloccoPrestPercorso(a)
    +           cronologia(a) + '</div>'
    + '</div>';
  return h;
}

/* "Testi dei messaggi": un riquadro per testo, con i segnaposto spiegati */
function disegnaTesti(){
  var h = window.gxTesta('Testi dei messaggi', '', 'valgono per tutti i percorsi');
  h += '<div class="acq-barra"><button class="gx-btn" onclick="_acqElenco()">&larr; Torna all\'elenco</button><div style="flex:1"></div>'
    + '<button class="gx-btn pieno" onclick="_acqSalvaTesti()">' + ico(I.ok) + ' Salva i testi</button></div>';
  h += '<div class="gx-info"><b>Come funzionano i segnaposto.</b> Le parole fra parentesi graffe si riempiono da sole con i dati del percorso. '
    + 'Se un dato manca (per esempio i dati catastali), la riga che lo contiene sparisce dal messaggio.<div style="display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px">'
    + SEGNAPOSTO.map(function(x){ return '<span><code>{' + x[0] + '}</code> ' + esc(x[1]) + '</span>'; }).join('') + '</div></div>';
  var link = '<div class="acq-campi"><label style="flex:1;min-width:260px">Collegamento alla presentazione dei servizi'
    + '<input id="acq-t-' + LINK_ID + '" class="acq-in" placeholder="https://…" value="' + esc(linkServizi()) + '"></label>'
    + '<label style="justify-content:flex-end"><button class="gx-btn" style="padding:6px 12px" onclick="(document.getElementById(\'acq-t-' + LINK_ID + '\')||{}).value=\'' + SV_URL + '\'">Usa la pagina dei servizi</button></label></div>'
    + '<div class="gx-nota" style="margin:0;padding:10px 16px">Va al posto di {link_servizi} nel ringraziamento. Finché è vuoto, quella riga non compare. La pagina dei servizi si prepara da "Presentazione servizi": quando la pubblichi, se qui è vuoto il collegamento si mette da solo.</div>';
  h += window.gxCol('Presentazione dei servizi', '', C().blu, link);
  h += '<div class="acq-grid">' + TESTI.map(function(t){
    var corretto = testoSalvato(t.id) !== null && testoSalvato(t.id).trim() !== '' && testoSalvato(t.id) !== t.std;
    var corpo = '<div style="padding:12px 16px"><textarea id="acq-t-' + t.id + '" class="acq-msg" rows="' + righeDi(modello(t.id)) + '">' + esc(modello(t.id)) + '</textarea></div>'
      + '<div class="acq-azioni"><button class="gx-btn" onclick="_acqTestoStd(\'' + t.id + '\')">Rimetti il testo standard</button>'
      + '<span class="nota">' + (corretto ? 'Testo corretto da te' : 'Testo standard') + '</span></div>';
    return '<div>' + window.gxCol(esc(t.nome), 'a: ' + esc(t.a), C().no, corpo) + '</div>';
  }).join('') + '</div>';
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

/* ── PRESENTAZIONE DEI SERVIZI: dati, editor, pubblicazione ─────────────── */
function copia(o){ return JSON.parse(JSON.stringify(o)); }
function svSalvati(){
  var r = testiSalvati().find(function(x){ return x && x.id === 'presentazione'; });
  return (r && r.dati && typeof r.dati === 'object') ? r.dati : null;
}
/* il salvato, completato con i pezzi che mancano (record vecchi o a meta') */
function svCfg(){
  var d = copia(svSalvati() || SV_BASE);
  Object.keys(SV_BASE).forEach(function(k){ if(d[k] === undefined) d[k] = copia(SV_BASE[k]); });
  if(!d.sez || typeof d.sez !== 'object') d.sez = copia(SV_BASE.sez);
  ['servizi','metodo','impegni'].forEach(function(k){ if(!Array.isArray(d[k])) d[k] = copia(SV_BASE[k]); });
  /* telefono ed email: se mai scritti, quelli della scheda dell'agente di questo dispositivo */
  if(!d.tel || !d.email){
    try{
      var ag = (typeof window._agenteCorrente === 'function') ? window._agenteCorrente() : null;
      var a = ag && ag.uuid && Array.isArray(D.agenti) ? D.agenti.find(function(x){ return x && x.uuid === ag.uuid; }) : null;
      if(a){ if(!d.tel) d.tel = a.tel || a.cellulare || ''; if(!d.email) d.email = a.email || ''; }
    }catch(e){}
  }
  return d;
}
function svBozza(){ if(!_svB) _svB = svCfg(); return _svB; }
/* quello che va online: solo testi, niente dati privati */
function svPayload(d){
  var t = function(v, n){ return String(v == null ? '' : v).trim().slice(0, n); };
  return {
    v:1, eyebrow:t(d.eyebrow, 120), tit:t(d.tit, 120), tit2:t(d.tit2, 80), sot:t(d.sot, 400), chi:t(d.chi, 1500),
    tel:t(d.tel, 30), email:t(d.email, 80),
    sez:{ chi:d.sez.chi !== false, metodo:d.sez.metodo !== false, rec:d.sez.rec !== false, impegni:d.sez.impegni !== false },
    servizi:d.servizi.filter(function(x){ return x && x.on !== false && t(x.t, 80); }).map(function(x){ return { k:x.k || 'stella', t:t(x.t, 80), s:t(x.s, 300) }; }),
    metodo:d.metodo.filter(function(x){ return x && t(x.t, 80); }).map(function(x){ return { t:t(x.t, 80), s:t(x.s, 300) }; }),
    impegni:d.impegni.map(function(x){ return t(x, 200); }).filter(Boolean)
  };
}
function svUguale(){ return JSON.stringify(svBozza()) === JSON.stringify(svCfg()); }
function svLeggiOnline(){
  if(!window.LIB || !window.LIB.leggiDoc){ _svOn = { letto:true, pub:null, errore:'manca lib-pubblica.js' }; return; }
  window.LIB.leggiDoc('servizi').then(function(p){ _svOn = { letto:true, pub:p, errore:'' }; })
    .catch(function(e){ _svOn = { letto:true, pub:null, errore:(e && e.message) || 'errore' }; })
    .then(function(){ if(_vista === 'servizi' && document.getElementById('acq-wrap')) disegna(); });
}
function svStato(){
  var c = C();
  if(!_svOn.letto) return ['Controllo…', 'leggo la pagina online', c.no];
  if(/mai pubblicata/.test(_svOn.errore || '')) return ['Mai pubblicata', 'premi "Salva e pubblica"', c.am];
  if(_svOn.errore && !_svOn.pub) return ['Non raggiungibile', /fetch|network/i.test(_svOn.errore) ? 'internet assente o cloud non raggiungibile' : _svOn.errore, c.ko];
  var on = copia(_svOn.pub || {}); delete on.ts;
  if(JSON.stringify(on) === JSON.stringify(svPayload(svCfg()))) return ['Aggiornata', 'pubblicata il ' + new Date(_svOn.pub.ts || Date.now()).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }), c.ok];
  return ['Da aggiornare', 'premi "Salva e pubblica"', c.am];
}

function svIn(path, label, val, max, area){
  return '<label style="flex:1;min-width:220px">' + label
    + (area ? '<textarea class="acq-msg" style="min-height:90px" maxlength="' + max + '" oninput="_acqSvSet(\'' + path + '\',this.value)">' + esc(val) + '</textarea>'
            : '<input class="acq-in" maxlength="' + max + '" value="' + esc(val) + '" oninput="_acqSvSet(\'' + path + '\',this.value)">') + '</label>';
}
function disegnaServizi(){
  var B = svBozza(), c = C(), st = svStato();
  var h = window.gxTesta('Presentazione servizi', '', 'la pagina da mandare ai proprietari');
  h += '<div class="acq-barra"><button class="gx-btn" onclick="_acqSvEsci()">&larr; Torna all\'elenco</button><div style="flex:1"></div>'
    + '<span id="acq-sv-mod" class="acq-pill" style="color:' + c.am + (svUguale() ? ';display:none' : '') + '"><i></i>modifiche da salvare</span>'
    + '<a class="gx-btn" href="' + SV_URL + '" target="_blank" rel="noopener">Apri la pagina</a>'
    + '<a class="gx-btn" href="' + SV_URL + '?pdf=1" target="_blank" rel="noopener">Scarica PDF</a>'
    + '<button class="gx-btn pieno" onclick="_acqSvSalva()">' + ico(I.ok) + ' Salva e pubblica</button></div>';
  h += '<div class="gx-cards acq-cards">'
    + window.gxCard('Pagina online', st[0], st[1], st[2])
    + window.gxCard('Servizi', B.servizi.filter(function(x){ return x.on !== false; }).length, 'su ' + B.servizi.length + ' nell\'elenco', c.blu)
    + window.gxCard('Collegamento nei messaggi', linkServizi() ? 'Impostato' : 'Vuoto', linkServizi() ? 'nel ringraziamento' : 'si mette da solo alla prima pubblicazione', linkServizi() ? c.ok : c.am)
    + '</div>';
  h += '<div class="gx-info">Foto, logo, colori, numero WhatsApp, recensioni e dati dell\'agenzia sono <b>gli stessi della pagina Valuta casa</b>: si cambiano nel Marketing Hub, in Link in Bio → Valuta casa. Qui scrivi solo i testi. '
    + 'Il PDF è questa stessa pagina in formato A4: "Scarica PDF" apre la stampa, scegli "Salva come PDF".</div>';

  var apertura = '<div class="acq-campi">' + svIn('eyebrow', 'Riga sopra il titolo', B.eyebrow, 120) + '</div>'
    + '<div class="acq-campi">' + svIn('tit', 'Titolo, parte scura', B.tit, 120) + svIn('tit2', 'Titolo, parte colorata', B.tit2, 80) + '</div>'
    + '<div class="acq-campi">' + svIn('sot', 'Frase sotto il titolo', B.sot, 400, true) + '</div>'
    + '<div class="acq-campi">' + svIn('tel', 'Telefono (nei contatti)', B.tel, 30) + svIn('email', 'Email (nei contatti)', B.email, 80) + '</div>';
  var sez = '<div class="acq-azioni">' + [['chi','Chi sono'],['metodo','Il metodo'],['impegni','I miei impegni'],['rec','Recensioni']].map(function(x){
      return '<label style="display:inline-flex;gap:6px;align-items:center;font-size:0.84rem;color:var(--text)"><input type="checkbox"' + (B.sez[x[0]] !== false ? ' checked' : '') + ' onchange="_acqSvSez(\'' + x[0] + '\',this.checked)"> ' + x[1] + '</label>';
    }).join('') + '</div><div class="gx-nota" style="margin:0;padding:10px 16px">Le recensioni sono quelle scelte per Valuta casa; se non ce ne sono, la sezione non compare.</div>';
  var chi = '<div class="acq-campi">' + svIn('chi', 'Chi sono — due o tre frasi su di te', B.chi, 1500, true) + '</div>';

  var serv = B.servizi.map(function(x, i){
    return '<div class="acq-doc" style="flex-wrap:wrap;align-items:flex-start' + (x.on === false ? ';opacity:.55' : '') + '">'
      + '<input type="checkbox" title="Mostra nella pagina"' + (x.on !== false ? ' checked' : '') + ' onchange="_acqSvServ(' + i + ',\'on\',this.checked)" style="margin-top:9px">'
      + '<div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px">'
      +   '<div style="display:flex;gap:6px;flex-wrap:wrap"><select class="acq-in" onchange="_acqSvServ(' + i + ',\'k\',this.value)">' + SV_ICONE.map(function(k){ return '<option value="' + k[0] + '"' + (x.k === k[0] ? ' selected' : '') + '>' + esc(k[1]) + '</option>'; }).join('') + '</select>'
      +   '<input class="acq-in" style="flex:1;min-width:160px;font-weight:700" maxlength="80" value="' + esc(x.t) + '" oninput="_acqSvServ(' + i + ',\'t\',this.value)" placeholder="Titolo del servizio"></div>'
      +   '<input class="acq-in" maxlength="300" value="' + esc(x.s) + '" oninput="_acqSvServ(' + i + ',\'s\',this.value)" placeholder="Una frase che spiega cosa fai">'
      + '</div>'
      + '<div style="display:flex;gap:4px">'
      +   '<button class="gx-btn" title="Su" onclick="_acqSvSposta(\'servizi\',' + i + ',-1)"' + (i ? '' : ' disabled') + '>' + ico(I.su) + '</button>'
      +   '<button class="gx-btn" title="Giù" onclick="_acqSvSposta(\'servizi\',' + i + ',1)"' + (i < B.servizi.length - 1 ? '' : ' disabled') + '>' + ico(I.giu) + '</button>'
      +   '<button class="gx-btn rosso" title="Togli" onclick="_acqSvTogli(\'servizi\',' + i + ')">' + ico(I.x) + '</button></div>'
      + '</div>';
  }).join('') + '<div class="acq-azioni"><button class="gx-btn" onclick="_acqSvAggiungi(\'servizi\')">' + ico(I.piu) + ' Aggiungi un servizio</button><span class="nota">la casella a sinistra lo mostra o lo nasconde senza cancellarlo</span></div>';

  var met = B.metodo.map(function(x, i){
    return '<div class="acq-doc" style="align-items:flex-start"><span class="acq-num" style="color:var(--brand,#EA580C);margin-top:6px"><b>' + (i + 1) + '</b></span>'
      + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px"><input class="acq-in" style="font-weight:700" maxlength="80" value="' + esc(x.t) + '" oninput="_acqSvMet(' + i + ',\'t\',this.value)">'
      + '<input class="acq-in" maxlength="300" value="' + esc(x.s) + '" oninput="_acqSvMet(' + i + ',\'s\',this.value)"></div>'
      + '<div style="display:flex;gap:4px"><button class="gx-btn" onclick="_acqSvSposta(\'metodo\',' + i + ',-1)"' + (i ? '' : ' disabled') + '>' + ico(I.su) + '</button>'
      + '<button class="gx-btn rosso" onclick="_acqSvTogli(\'metodo\',' + i + ')">' + ico(I.x) + '</button></div></div>';
  }).join('') + '<div class="acq-azioni"><button class="gx-btn" onclick="_acqSvAggiungi(\'metodo\')">' + ico(I.piu) + ' Aggiungi un passo</button></div>';

  var imp = B.impegni.map(function(x, i){
    return '<div class="acq-doc"><span style="color:var(--acq-ok)">' + ico(I.ok) + '</span><input class="acq-in" style="flex:1;min-width:0" maxlength="200" value="' + esc(x) + '" oninput="_acqSvImp(' + i + ',this.value)">'
      + '<button class="gx-btn rosso" onclick="_acqSvTogli(\'impegni\',' + i + ')">' + ico(I.x) + '</button></div>';
  }).join('') + '<div class="acq-azioni"><button class="gx-btn" onclick="_acqSvAggiungi(\'impegni\')">' + ico(I.piu) + ' Aggiungi un impegno</button></div>';

  h += '<div class="acq-grid"><div>'
    + window.gxCol('Apertura e contatti', 'la parte in alto della pagina', c.blu, apertura)
    + window.gxCol('Sezioni', 'quali parti mostrare', c.no, sez)
    + window.gxCol('Chi sono', 'accanto alla tua foto', c.blu, chi)
    + window.gxCol('I miei impegni', 'cosa può aspettarsi da te il proprietario', c.ok, imp)
    + '</div><div>'
    + window.gxCol('I servizi', 'compaiono in quest\'ordine', 'var(--brand,#EA580C)', serv)
    + window.gxCol('Il metodo', 'le tappe dalla valutazione al rogito', c.blu, met)
    + '</div></div>';
  h += '<div class="acq-barra" style="justify-content:flex-end;margin-top:6px"><button class="gx-btn" onclick="_acqSvAnnulla()">Annulla le modifiche</button><button class="gx-btn pieno" onclick="_acqSvSalva()">' + ico(I.ok) + ' Salva e pubblica</button></div>';
  return h;
}
function svSegna(){ var el = document.getElementById('acq-sv-mod'); if(el) el.style.display = svUguale() ? 'none' : ''; }

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
  else if(_vista === 'importa') cont = disegnaImporta();
  else if(_vista === 'testi') cont = disegnaTesti();
  else if(_vista === 'servizi') cont = disegnaServizi();
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
  _pf = null; _pp = null;   /* un modulo lasciato aperto non deve ricomparire altrove */
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
window.chiudiAcquisizioni = function(){ var w = document.getElementById('acq-wrap'); if(w) w.remove(); aggiornaHome(); };

/* [13 ott 2026] Numeri sul pulsante "Nuovo incarico" della Dashboard
   (#dash-acq-num, nell'index): in corso e ferme. Si aggiorna all'avvio, alla
   chiusura della pagina e ogni 20 secondi se il pulsante e' a video (i dati
   possono arrivare dal cloud in qualsiasi momento). */
function aggiornaHome(){
  try{
    var el = document.getElementById('dash-acq-num'); if(!el || typeof D === 'undefined' || !D) return;
    var ap = vivi().filter(function(a){ return a.stato !== 'chiusa'; });
    var nf = ap.filter(function(a){ return ferme(a, immDi(a)).length; }).length;
    /* [14 ott 2026] il pulsante e' diventato piccolo (scelta C): resta un
       numerino = acquisizioni in corso, giallo se almeno una e' ferma */
    var h = ap.length ? String(ap.length) : '';
    var tit = ap.length ? (ap.length + ' in corso' + (nf ? ', ' + nf + (nf === 1 ? ' ferma' : ' ferme') : '')) : '';
    if(el.textContent !== h) el.textContent = h;
    el.classList.toggle('ferma', !!nf);
    if(el.title !== tit) el.title = tit;
  }catch(e){}
}
window.acqAggiornaHome = aggiornaHome;
setTimeout(aggiornaHome, 1500);
setInterval(function(){ var el = document.getElementById('dash-acq-num'); if(el && el.offsetParent) aggiornaHome(); }, 20000);
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

/* "Immobile non in archivio": si apre la scheda normale di nuovo immobile
   (vedi caricaNuovoImmobile nella sezione 9) e, se nasce un immobile, il
   percorso parte da solo. Niente aggancio dentro saveImmobile: e' gia'
   modificato da un'altra parte del gestionale, e una terza modifica sarebbe
   fragile. */
window._acqCaricaNuovo = function(){
  caricaNuovoImmobile(null, function(nuovo, pagina){
    if(nuovo){ window._acqCrea(nuovo.uuid); avviso('Percorso avviato per ' + etichetta(nuovo)); }
    else if(pagina) disegna(); else window.apriAcquisizioni();
  });
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
  var a = trova(id), im = immDi(a), M = MSG[chi]; if(!a || !im || !M) return;
  var el = document.getElementById('acq-msg-' + chi);
  var testo = el ? el.value : testoDi(a, im, chi);
  var dest = destDi(a, im, chi);
  if(!dest){ avviso(M.dest === 'tec' ? 'Scegli prima il tecnico' : 'Scegli prima il fotografo'); return; }
  var url = '';
  if(canale === 'wa'){
    url = (typeof window._waSendUrl === 'function') ? window._waSendUrl(dest.tel, testo) : '';
    if(!url){ avviso('Numero di telefono mancante o non valido'); return; }
  } else {
    if(!dest.email){ avviso('Indirizzo email mancante'); return; }
    var ogg = M.ogg + ' — ' + etichetta(im);
    url = 'mailto:' + String(dest.email).trim() + '?subject=' + encodeURIComponent(ogg) + '&body=' + encodeURIComponent(testo);
  }
  try{ window.open(url, '_blank'); }catch(e){ window.location.href = url; }
  var t = norma(a).tappe[M.tappa];
  t[M.campo] = oggi();
  t[M.campo === 'inviato' ? 'canale' : M.campo + 'Canale'] = canale;
  var cosa = { grazie:'Ringraziamento', proprietario:'Richiesta documenti', tecnico:'Richiesta documenti', fotografo:'Appuntamento foto', fotoprop:'Conferma foto e consigli' }[chi] || 'Messaggio';
  diario(a, cosa + ' a ' + bello(dest.nome || '') + ' via ' + (canale === 'wa' ? 'WhatsApp' : 'email'));
  salva(); disegna();
};

/* ── PEZZO 2: ringraziamento a voce, foto, testi ── */
window._acqGrazieVoce = function(id){
  var a = trova(id); if(!a) return;
  var t = norma(a).tappe.grazie;
  if(t.fatto && !t.inviato){ t.fatto = ''; diario(a, 'Ringraziamento a voce annullato'); }
  else { t.fatto = oggi(); diario(a, 'Ringraziato a voce'); }
  salva(); disegna();
};
window._acqFotoChi = function(id, chi){
  var a = trova(id); if(!a) return;
  norma(a).tappe.foto.chi = (chi === 'io') ? 'io' : 'fotografo';
  salva(); disegna();
};
window._acqFotografo = function(id, fid){
  var a = trova(id); if(!a) return;
  norma(a).tappe.foto.fotografoId = fid || '';
  var f = fotDi(a); if(f) diario(a, 'Fotografo scelto: ' + bello(f.nome));
  aggiornaEventoFoto(a);
  salva(); disegna();
};
/* L'appuntamento delle foto in agenda: UNO per percorso, ritrovato per id.
   Tipo "appuntamento": non "visita", che genererebbe una riga nel Registro
   Visite. Se Enzo lo ha cancellato dall'agenda, si ricrea. */
function aggiornaEventoFoto(a){
  var t = norma(a).tappe.foto, im = immDi(a);
  if(!t.data || !im) return null;
  if(!Array.isArray(D.eventi)) D.eventi = [];
  var p = propDi(im), f = (t.chi === 'fotografo') ? fotDi(a) : null;
  var campi = {
    titolo: 'Foto · ' + etichetta(im),
    tipo: 'appuntamento',
    data: t.data,
    ora: t.ora || '',
    durataMin: t.ora ? 60 : '',
    cliente: p.nome || '',
    tel: p.tel || '',
    cliUuid: p.uuid || '',
    indirizzo: [im.indirizzo, im.comune].filter(Boolean).join(', '),
    note: 'Servizio fotografico' + (f ? ' con ' + bello(f.nome) : (t.chi === 'io' ? ' (le faccio io)' : '')) + ' — percorso di acquisizione',
    _acqId: a.id
  };
  var i = t.eventoId ? D.eventi.findIndex(function(e){ return e && e.id === t.eventoId; }) : -1;
  if(i >= 0){
    D.eventi[i] = (typeof window.aggiornaRecord === 'function') ? window.aggiornaRecord(D.eventi[i], campi) : Object.assign(D.eventi[i], campi);
  } else {
    campi.id = (typeof window.genUUID === 'function') ? window.genUUID() : ('ev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    D.eventi.push(campi);
    t.eventoId = campi.id;
  }
  return t.eventoId;
}
window._acqFotoData = function(id){
  var a = trova(id); if(!a) return;
  var d = (document.getElementById('acq-foto-data') || {}).value || '';
  var o = (document.getElementById('acq-foto-ora') || {}).value || '';
  if(!d){ avviso('Scegli il giorno delle foto'); return; }
  var t = norma(a).tappe.foto;
  if(!t.chi) t.chi = 'fotografo';
  var sposta = !!t.data && (t.data !== d || (t.ora || '') !== o);
  t.data = d; t.ora = o;
  /* data nuova: i messaggi gia' partiti parlavano dell'altra */
  if(sposta){ t.invFotografo = ''; t.invProp = ''; }
  aggiornaEventoFoto(a);
  diario(a, (sposta ? 'Foto spostate a ' : 'Foto fissate per ') + dataLunga(d) + (o ? ' alle ' + o : '') + ' (in agenda)');
  salva(); disegna();
  try{ if(typeof window.updateBadges === 'function') window.updateBadges(); }catch(e){}
};
window._acqFotoFatte = function(id){
  var a = trova(id); if(!a) return;
  var t = norma(a).tappe.foto;
  if(t.fatte){ t.fatte = ''; diario(a, '"Foto fatte" annullato'); }
  else { t.fatte = oggi(); diario(a, 'Foto fatte'); }
  salva(); disegna();
};
window._acqTesti = function(){ vaiA('testi'); };
window._acqTestoStd = function(tid){
  var d = TESTI.find(function(x){ return x.id === tid; });
  var el = document.getElementById('acq-t-' + tid);
  if(d && el) el.value = d.std;
  avviso('Testo standard rimesso: premi "Salva i testi" per tenerlo');
};
window._acqSalvaTesti = function(){
  var L = testiSalvati();
  var metti = function(id, testo){
    var r = L.find(function(x){ return x && x.id === id; });
    if(r){ r.testo = testo; r._modificata = Date.now(); }
    else L.push({ id:id, testo:testo });
  };
  TESTI.forEach(function(t){
    var el = document.getElementById('acq-t-' + t.id); if(!el) return;
    var v = String(el.value || '').replace(/\r/g, '');
    /* un testo uguale allo standard si salva vuoto: cosi' se un giorno cambio
       lo standard qui nel codice, arriva anche a te */
    metti(t.id, v.trim() === t.std.trim() ? '' : v);
  });
  var lk = document.getElementById('acq-t-' + LINK_ID);
  if(lk) metti(LINK_ID, String(lk.value || '').trim());
  salva();
  avviso('Testi salvati');
  vaiA('elenco');
};

/* ── PEZZO 3: presentazione dei servizi ── */
window._acqServizi = function(){ _svB = null; _svOn = { letto:false, pub:null, errore:'' }; svLeggiOnline(); vaiA('servizi'); };
window._acqSvEsci = function(){
  if(svUguale()){ _svB = null; vaiA('elenco'); return; }
  var esci = function(){ _svB = null; vaiA('elenco'); };
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm('Ci sono modifiche non salvate. Esco senza salvarle?', '', 'Presentazione servizi').then(function(ok){ if(ok) esci(); });
  else if(confirm('Esco senza salvare?')) esci();
};
window._acqSvSet = function(k, v){ svBozza()[k] = v; svSegna(); };
window._acqSvSez = function(k, v){ svBozza().sez[k] = !!v; svSegna(); };
window._acqSvServ = function(i, k, v){ var x = svBozza().servizi[i]; if(!x) return; x[k] = v; svSegna(); if(k === 'on') disegna(); };
window._acqSvMet = function(i, k, v){ var x = svBozza().metodo[i]; if(!x) return; x[k] = v; svSegna(); };
window._acqSvImp = function(i, v){ var L = svBozza().impegni; if(i < L.length){ L[i] = v; svSegna(); } };
window._acqSvSposta = function(lista, i, d){
  var L = svBozza()[lista], j = i + d; if(!L || j < 0 || j >= L.length) return;
  var t = L[i]; L[i] = L[j]; L[j] = t; disegna();
};
window._acqSvTogli = function(lista, i){ var L = svBozza()[lista]; if(L){ L.splice(i, 1); disegna(); } };
window._acqSvAggiungi = function(lista){
  var L = svBozza()[lista]; if(!L) return;
  if(lista === 'servizi') L.push({ k:'stella', t:'', s:'' });
  else if(lista === 'metodo') L.push({ t:'', s:'' });
  else L.push('');
  disegna();
};
window._acqSvAnnulla = function(){ _svB = null; disegna(); };
window._acqSvSalva = function(){
  var B = svBozza();
  /* 1. salvataggio nel gestionale: vale anche se la pubblicazione non riesce */
  var L = testiSalvati(), r = L.find(function(x){ return x && x.id === 'presentazione'; });
  if(r){ r.dati = copia(B); r._modificata = Date.now(); } else L.push({ id:'presentazione', dati:copia(B) });
  salva();
  _svB = null;
  /* 2. pubblicazione: serve Firebase che ci riconosce, come per Link in Bio */
  var fb = !!(window.firebase && window.firebase.auth && window.firebase.auth().currentUser);
  if(!window.LIB || !window.LIB.scriviDoc || !window._db || !fb){
    avviso('Testi salvati. Non pubblicati: questo dispositivo non è collegato al cloud');
    disegna(); return;
  }
  var p = svPayload(svCfg());
  window.LIB.scriviDoc(window._db, 'servizi', p).then(function(){
    _svOn = { letto:true, pub:Object.assign({}, p, { ts:Date.now() }), errore:'' };
    /* il collegamento nei messaggi: se e' vuoto, da adesso e' questa pagina */
    if(!linkServizi()){
      var T = testiSalvati(), k = T.find(function(x){ return x && x.id === LINK_ID; });
      if(k) k.testo = SV_URL; else T.push({ id:LINK_ID, testo:SV_URL });
      salva();
    }
    avviso('Presentazione pubblicata');
    if(_vista === 'servizi') disegna();
  }).catch(function(e){
    var regola = e && e.code === 'permission-denied';
    _svOn.errore = regola ? 'il cloud non permette di scrivere in pubblico/servizi' : ((e && (e.code || e.message)) || String(e));
    avviso(regola ? 'Non pubblicata: manca il permesso del cloud (la stessa regola di Link in Bio)' : 'Pubblicazione non riuscita: ' + _svOn.errore);
    if(_vista === 'servizi') disegna();
  });
  disegna();
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

/* [13 ott 2026] Per il riepilogo che legge il connettore di Claude (index.html,
   blocco CLAUDE). Solo i percorsi aperti; date assolute, i giorni li conta
   il connettore. Niente documenti personali: nome e telefono del
   proprietario come per gli immobili fermi. */
/* ── 9. INCARICO FIRMATO A MANO ─────────────────────────────────────────────
   [14 ott 2026] Scelta A di Enzo: l'incarico firmato su carta si fotografa
   (o si scansiona in PDF), l'AI lo legge e una tabella di conferma porta i
   dati su cliente, immobile e percorso. Stessa regola di "Estrai dati" in
   Analisi Atti: niente si scrive senza conferma, e le caselle che
   sovrascriverebbero un dato gia' scritto partono NON spuntate.
   UN POSTO SOLO: il cliente nuovo nasce qui (come in Rogito storico), ma
   l'immobile nuovo nasce dalla scheda normale (openImmobileModal) gia'
   compilata, cosi' passa da tutti i controlli di saveImmobile (tipo,
   codice progressivo, agente).
   La scansione va su Firebase Storage (users/{utente}/incarichi/) come le
   foto degli immobili, NON nella cartella foto: li' gira la pulizia dei
   doppioni. Il percorso ne tiene solo il collegamento (a.incaricoFiles). */

var _imp = null;   /* { files, stato, errore, dati, cli, imm, fisso, acqId, ck } */

var IMP_DEF = {
  cli: [
    { k:'nome',          l:'Nome e cognome',          campo:'nome',         up:true },
    { k:'cf',            l:'Codice fiscale',          campo:'cf',           up:true },
    { k:'dataNascita',   l:'Data di nascita',         campo:'nascita',      data:true },
    { k:'luogoNascita',  l:'Luogo di nascita',        campo:'luogoNascita', up:true },
    { k:'provNascita',   l:'Provincia di nascita',    campo:'provNascita',  up:true },
    { k:'residenza',     l:'Città di residenza',      campo:'citta',        up:true },
    { k:'provResidenza', l:'Provincia di residenza',  campo:'prov',         up:true },
    { k:'indirizzo',     l:'Indirizzo di residenza',  campo:'indirizzo',    up:true },
    { k:'civico',        l:'Numero civico',           campo:'civico',       up:true },
    { k:'tel',           l:'Telefono',                campo:'tel' },
    { k:'email',         l:'Email',                   campo:'email' }
  ],
  co: [
    { k:'nome',          l:'Secondo intestatario',    campo:'nome',         up:true },
    { k:'dataNascita',   l:'Sua data di nascita',     campo:'nascita',      data:true },
    { k:'tel',           l:'Suo telefono',            campo:'tel' }
  ],
  imm: [
    { k:'comune',        l:'Comune',                  campo:'comune',          modale:'im-comune' },
    { k:'indirizzo',     l:'Indirizzo',               campo:'indirizzo',       modale:'im-indirizzo' },
    { k:'piano',         l:'Piano',                   campo:'piano',           modale:'im-piano' },
    { k:'mq',            l:'Superficie (mq)',         campo:'mq',              modale:'im-mq', dec:true },
    { k:'prezzo',        l:'Prezzo richiesto',        campo:'prezzo',          modale:'im-prezzo', euro:true },
    { k:'intestatoA',    l:'Intestato a (catasto)',   campo:'catIntestatario', modale:'im-cat-intestatario' },
    { k:'catFoglio',     l:'Foglio',                  campo:'catFoglio',       modale:'im-cat-foglio' },
    { k:'catParticella', l:'Particella',              campo:'catParticella',   modale:'im-cat-particella' },
    { k:'catSub',        l:'Subalterno',              campo:'catSub',          modale:'im-cat-sub' },
    { k:'catCategoria',  l:'Categoria catastale',     campo:'catCategoria',    modale:'im-cat-categoria' },
    { k:'catRendita',    l:'Rendita catastale',       campo:'catRendita',      modale:'im-cat-rendita' }
  ],
  inc: [
    { k:'dataFirma',     l:'Firmato il',              campo:'_firma',       data:true },
    { k:'conferimento',  l:'Conferimento',            campo:'conferimento', modale:'im-conf', scelta:['in esclusiva','non esclusiva'] },
    { k:'dal',           l:'Inizio mandato',          campo:'incInizio',    modale:'im-inc-inizio', data:true },
    { k:'al',            l:'Scadenza',                campo:'incFine',      modale:'im-inc-fine', data:true },
    { k:'provvPerc',     l:'Provvigione %',           campo:'incPerc',      modale:'im-inc-perc', dec:true }
  ]
};
var IMP_SEZ_DEST = { cli:'cli', co:'imm', imm:'imm', inc:'imm' };

function impNuovo(fisso, acqId){
  return { files:[], stato:'', errore:'', dati:null, cli:'', imm:fisso || '', fisso:fisso || '', acqId:acqId || '', ck:{} };
}
function impDef(key){ var p = key.split('.'); return (IMP_DEF[p[0]] || []).find(function(d){ return d.k === p[1]; }) || null; }
function cliPerUuid(u){ return u ? ((Array.isArray(D.clienti) ? D.clienti : []).find(function(c){ return c && c.uuid === u; }) || null) : null; }
function immPerUuid(u){ return u ? ((Array.isArray(D.immobili) ? D.immobili : []).find(function(x){ return x && x.uuid === u; }) || null) : null; }
function nuovoUuid(){
  try{ if(typeof window.genUUID === 'function') return window.genUUID(); }catch(e){}
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
/* "ROSSI MARIO" e "Mario Rossi" sono la stessa persona */
function nomeChiave(s){ return String(s || '').toUpperCase().replace(/[^A-ZÀ-Ù]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' '); }
/* "Via G. Verdi, 12" e "VIA G VERDI 12" sono lo stesso indirizzo */
function indChiave(s){ return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function confronto(def, v){
  var s = String(v == null ? '' : v).trim();
  if(def.euro) return String(numero(s) || '');
  if(def.dec) return decimale(s);
  return s.toUpperCase().replace(/\s+/g, ' ');
}
/* "250.000", "250000 €", "250.000,00" → 250000 */
function numero(s){
  var t = String(s == null ? '' : s).replace(/[^\d.,]/g, '');
  if(/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/[.,]/g, '');
  var n = parseFloat(t); return isNaN(n) ? 0 : n;
}
/* "2,5 %" → "2.5": le caselle della scheda immobile sono numeriche */
function decimale(s){ var t = String(s == null ? '' : s).replace(',', '.').replace(/[^\d.]/g, ''); return (t && !isNaN(parseFloat(t))) ? String(parseFloat(t)) : ''; }
function dataOk(s){ return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

/* dove sta il valore letto dall'AI per una riga */
function impRif(key){
  var p = key.split('.'), d = _imp.dati;
  if(p[0] === 'cli') return { o:d.intestatari[0], k:p[1] };
  if(p[0] === 'co')  return { o:d.intestatari[1], k:p[1] };
  if(p[0] === 'imm') return { o:d.immobile, k:p[1] };
  return { o:d.incarico, k:p[1] };
}
function impVal(key){ var r = impRif(key); return r.o ? String(r.o[r.k] == null ? '' : r.o[r.k]).trim() : ''; }
/* il valore che c'e' ORA nella scheda di destinazione; null = scheda nuova */
function impAttuale(key){
  var p = key.split('.'), def = impDef(key);
  if(p[0] === 'cli'){
    if(!_imp.cli || _imp.cli === 'nuovo') return null;
    var c = cliPerUuid(_imp.cli); return c ? String(c[def.campo] == null ? '' : c[def.campo]) : null;
  }
  var im = (_imp.imm && _imp.imm !== 'nuovo') ? immPerUuid(_imp.imm) : null;
  if(!im) return null;
  if(p[0] === 'co'){ var co = (Array.isArray(im.coIntestari) && im.coIntestari[0]) || {}; return String(co[def.campo] || ''); }
  if(def.campo === '_firma'){
    var a = vivi().find(function(x){ return x.immUuid === im.uuid && x.stato !== 'chiusa'; });
    return a ? String(norma(a).tappe.incarico.firmato || '') : '';
  }
  return String(im[def.campo] == null ? '' : im[def.campo]);
}
/* spunta di partenza: dato letto e scheda nuova, campo vuoto o gia' uguale */
function impSpunta(key){
  if(Object.prototype.hasOwnProperty.call(_imp.ck, key)) return _imp.ck[key];
  var v = impVal(key); if(!v) return false;
  var att = impAttuale(key), def = impDef(key);
  return att === null || att.trim() === '' || confronto(def, att) === confronto(def, v);
}
function impRighe(sez){
  return IMP_DEF[sez].map(function(d){ return sez + '.' + d.k; }).filter(function(key){ return impVal(key) !== ''; });
}

/* ── lettura dei file: PDF cosi' com'e', foto rimpicciolite (circa 2000 px) ── */
function leggiFile(lista){
  var arr = Array.prototype.slice.call(lista || []);
  return Promise.all(arr.map(function(f){
    return new Promise(function(ok){
      var isPdf = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name);
      if(isPdf && f.size > 12 * 1024 * 1024){ ok({ errore:f.name + ': PDF troppo grande (oltre 12 MB)' }); return; }
      var fr = new FileReader();
      fr.onerror = function(){ ok({ errore:f.name + ': non riesco a leggerlo' }); };
      fr.onload = function(){
        var url = String(fr.result || '');
        if(isPdf){ ok({ nome:f.name, mime:'application/pdf', b64:url.split(',')[1] || '', dim:f.size }); return; }
        var img = new Image();
        img.onerror = function(){ ok({ errore:f.name + ': formato non leggibile dal browser (salva la foto in JPG o fai un PDF)' }); };
        img.onload = function(){
          var lato = 2000, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, lato / Math.max(w, h));
          var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
          var out = cv.toDataURL('image/jpeg', 0.85), b64 = out.split(',')[1] || '';
          ok({ nome:f.name.replace(/\.[^.]+$/, '') + '.jpg', mime:'image/jpeg', b64:b64, dim:Math.round(b64.length * 0.75) });
        };
        img.src = url;
      };
      fr.readAsDataURL(f);
    });
  }));
}
function scegliFile(poi){
  var i = document.createElement('input');
  i.type = 'file'; i.accept = 'application/pdf,image/*'; i.multiple = true;
  i.onchange = function(){
    leggiFile(i.files).then(function(L){
      var err = L.filter(function(x){ return x.errore; }).map(function(x){ return x.errore; });
      if(err.length) avviso(err.join(' · '));
      poi(L.filter(function(x){ return !x.errore && x.b64; }));
    });
  };
  i.click();
}
function dimTesto(n){ return n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

/* ── archivio online della scansione ── */
function caricaFile(f, im){
  return new Promise(function(ok, ko){
    if(!window._storageReady || !window._storage) return ko(new Error('l\'archivio online non è disponibile in questo momento'));
    var uid = ''; try{ uid = (typeof window._currentUserId === 'function') ? window._currentUserId() : ''; }catch(e){}
    if(!uid) return ko(new Error('utente non riconosciuto'));
    var est = f.mime === 'application/pdf' ? 'pdf' : 'jpg';
    var nome = 'incarico_' + String((im && im.ref) || 'senzaref').replace(/[^a-zA-Z0-9]/g, '') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.' + est;
    var bin = atob(f.b64), arr = new Uint8Array(bin.length);
    for(var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var percorso = 'users/' + uid + '/incarichi/' + nome;
    var ref = window._storage.ref().child(percorso);
    ref.put(new Blob([arr], { type:f.mime }), { contentType:f.mime })
      .then(function(s){ return s.ref.getDownloadURL(); })
      .then(function(url){ ok({ url:url, nome:f.nome, mime:f.mime, data:oggi(), percorso:percorso }); })
      .catch(ko);
  });
}
function archivia(a, im, files){
  if(!files.length) return;
  a._archivio = 'corso'; disegna();
  var fatti = [], i = 0;
  (function prossimo(){
    if(i >= files.length){
      delete a._archivio;
      if(!Array.isArray(a.incaricoFiles)) a.incaricoFiles = [];
      fatti.forEach(function(x){ a.incaricoFiles.push(x); });
      if(fatti.length) diario(a, 'Scansione dell\'incarico archiviata (' + fatti.length + (fatti.length === 1 ? ' file' : ' file') + ')');
      salva(); disegna();
      return;
    }
    caricaFile(files[i], im).then(function(x){ fatti.push(x); i++; prossimo(); }).catch(function(e){
      console.warn('[Acquisizioni] archivio KO:', e);
      avviso('Scansione non archiviata online: ' + ((e && e.message) || 'errore') + '. Riprova con "Allega la scansione".');
      i = files.length; prossimo();
    });
  })();
}

/* ── lettura con l'AI ── */
function impPrompt(){
  return 'Questo è un incarico di mediazione per la VENDITA di un immobile (modulo FRIMM o simile), compilato e firmato a mano. '
    + 'Leggi i dati scritti e rispondi ESCLUSIVAMENTE con un oggetto JSON valido: nessun testo prima o dopo, nessun blocco con i backtick. '
    + 'Usa ESATTAMENTE questa struttura, con "" per ogni dato che non trovi o che non leggi con certezza:\n'
    + '{"intestatari":[{"nome":"","cf":"","dataNascita":"","luogoNascita":"","provNascita":"","residenza":"","provResidenza":"","indirizzo":"","civico":"","tel":"","email":""}],'
    + '"immobile":{"comune":"","indirizzo":"","piano":"","mq":"","prezzo":"","intestatoA":"","catFoglio":"","catParticella":"","catSub":"","catCategoria":"","catRendita":""},'
    + '"incarico":{"dataFirma":"","conferimento":"","dal":"","al":"","provvPerc":""},'
    + '"note":""}\n'
    + 'Regole: "intestatari" sono le persone che conferiscono l\'incarico (al massimo due; la prima è l\'incaricante principale). '
    + '"nome" come è scritto, cognome e nome. Date nel formato AAAA-MM-GG. "provNascita" e "provResidenza" la sigla della provincia. '
    + 'Per la residenza "indirizzo" è la via o piazza senza il numero e "civico" solo il numero; per l\'immobile invece "indirizzo" comprende anche il numero civico. '
    + '"prezzo" e "mq" solo cifre, senza punti delle migliaia né simbolo dell\'euro. '
    + '"conferimento" vale "in esclusiva" oppure "non esclusiva" secondo la casella barrata; se non si capisce, "". '
    + '"provvPerc" solo il numero della percentuale (es. "3" oppure "2,5"). "dataFirma" è la data scritta accanto alle firme. '
    + '"intestatoA" è a chi risulta intestato l\'immobile, se il modulo lo indica. '
    + 'Se una parola scritta a mano è incerta, lascia "" e spiegalo in "note" in una riga. NON inventare nulla.';
}
function impNormaDati(o){
  o = (o && typeof o === 'object') ? o : {};
  if(!Array.isArray(o.intestatari)) o.intestatari = [];
  if(!o.intestatari[0] || typeof o.intestatari[0] !== 'object') o.intestatari[0] = {};
  if(!o.intestatari[1] || typeof o.intestatari[1] !== 'object') o.intestatari[1] = {};
  if(!o.immobile || typeof o.immobile !== 'object') o.immobile = {};
  if(!o.incarico || typeof o.incarico !== 'object') o.incarico = {};
  var c = String(o.incarico.conferimento || '').toLowerCase();
  o.incarico.conferimento = c.indexOf('non') >= 0 ? 'non esclusiva' : (c.indexOf('escl') >= 0 ? 'in esclusiva' : '');
  return o;
}
/* proposte di destinazione: codice fiscale, poi nome; immobile per catasto,
   poi indirizzo, poi l'unico immobile libero del proprietario */
function impProponi(){
  var p = _imp.dati.intestatari[0], m = _imp.dati.immobile;
  var CL = (Array.isArray(D.clienti) ? D.clienti : []).filter(function(c){ return c && !c.eliminata && !c.eliminato; });
  var cli = null, cf = String(p.cf || '').toUpperCase().replace(/\s/g, '');
  if(cf.length >= 11) cli = CL.find(function(c){ return String(c.cf || '').toUpperCase().replace(/\s/g, '') === cf; }) || null;
  if(!cli && nomeChiave(p.nome)) cli = CL.find(function(c){ return nomeChiave(c.nome) === nomeChiave(p.nome); }) || null;
  if(cli && !cli.uuid) cli.uuid = nuovoUuid();
  _imp.cli = cli ? cli.uuid : 'nuovo';
  if(_imp.fisso){ _imp.imm = _imp.fisso; return; }
  var IL = (Array.isArray(D.immobili) ? D.immobili : []).filter(function(x){ return x && x.uuid && !x.eliminato; });
  var f = String(m.catFoglio || '').trim(), pa = String(m.catParticella || '').trim(), sb = String(m.catSub || '').trim(), im = null;
  if(f && pa) im = IL.find(function(x){ return String(x.catFoglio || '').trim() === f && String(x.catParticella || '').trim() === pa && (!sb || String(x.catSub || '').trim() === sb); }) || null;
  if(!im && indChiave(m.indirizzo).length >= 5) im = IL.find(function(x){
    return indChiave(x.indirizzo) === indChiave(m.indirizzo) && (!m.comune || indChiave(x.comune) === indChiave(m.comune));
  }) || null;
  if(!im && cli){
    var suoi = IL.filter(function(x){ var st = String(x.stato || '').toLowerCase(); return x.clienteUuid === cli.uuid && st !== 'venduto' && st !== 'archiviato' && !x.archiviato; });
    if(suoi.length === 1) im = suoi[0];
  }
  _imp.imm = im ? im.uuid : 'nuovo';
}

/* ── disegno ── */
function impRiga(key){
  var def = impDef(key), v = impVal(key), att = impAttuale(key), ck = impSpunta(key);
  var inp;
  if(def.scelta){
    inp = '<select class="acq-in" style="width:100%" onchange="_acqImpVal(\'' + key + '\',this.value)">'
      + '<option value=""' + (v ? '' : ' selected') + '>— non letto —</option>'
      + def.scelta.map(function(s){ return '<option' + (v === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>';
  } else if(def.data && (dataOk(v) || !v)){
    inp = '<input type="date" class="acq-in" style="width:100%" value="' + esc(v) + '" onchange="_acqImpVal(\'' + key + '\',this.value)">';
  } else {
    inp = '<input class="acq-in" style="width:100%" value="' + esc(v) + '" oninput="_acqImpVal(\'' + key + '\',this.value)">';
  }
  var c = C(), cel;
  if(att === null) cel = '<span style="color:' + c.ok + ';font-weight:600">scheda nuova</span>';
  else if(!att.trim()) cel = '<span style="color:var(--text4)">vuoto</span>';
  else if(confronto(def, att) === confronto(def, v)) cel = '<span style="color:var(--text3)">uguale</span>';
  else cel = '<span style="color:' + c.am + ';font-weight:600">' + esc(def.data ? it(att) : (def.euro ? '€ ' + Math.round(numero(att)).toLocaleString('it-IT') : att)) + '</span>';
  return '<tr><td><input type="checkbox"' + (ck ? ' checked' : '') + ' onchange="_acqImpCk(\'' + key + '\',this.checked)" style="cursor:pointer;width:16px;height:16px"></td>'
    + '<td class="et">' + esc(def.l) + '</td><td>' + inp + '</td><td>' + cel + '</td></tr>';
}
function impTabella(sez){
  var R = impRighe(sez);
  if(!R.length) return '<div class="gx-nota" style="margin:0;padding:10px 16px">L\'AI non ha letto dati in questa parte.</div>';
  return '<div style="overflow-x:auto"><table class="acq-imp"><thead><tr><th style="width:34px">Riporta</th><th>Campo</th><th>Letto dall\'AI (correggibile)</th><th>Ora in scheda</th></tr></thead><tbody>'
    + R.map(impRiga).join('') + '</tbody></table></div>';
}
function impSceltaCliente(){
  var L = (Array.isArray(D.clienti) ? D.clienti : []).filter(function(c){ return c && c.uuid && !c.eliminata && !c.eliminato; })
    .slice().sort(function(x, y){ return String(x.nome || '').localeCompare(String(y.nome || '')); });
  return '<div class="acq-campi"><label style="flex:1;min-width:260px">Scheda cliente di destinazione<select class="acq-in" onchange="_acqImpDest(\'cli\',this.value)">'
    + '<option value="nuovo"' + (_imp.cli === 'nuovo' ? ' selected' : '') + '>+ Nuovo cliente (lo creo con questi dati)</option>'
    + L.map(function(c){ return '<option value="' + esc(c.uuid) + '"' + (_imp.cli === c.uuid ? ' selected' : '') + '>' + esc(c.nome || 'senza nome') + (c.tel ? ' · ' + esc(c.tel) : '') + '</option>'; }).join('')
    + '</select></label></div>';
}
function impSceltaImmobile(){
  if(_imp.fisso){ var im = immPerUuid(_imp.fisso); return '<div class="acq-campi"><label style="flex:1">Scheda immobile di destinazione<span style="font-size:0.86rem;color:var(--text);text-transform:none;letter-spacing:0;font-weight:600">' + esc(etichetta(im)) + '</span></label></div>'; }
  var L = (Array.isArray(D.immobili) ? D.immobili : []).filter(function(x){ return x && x.uuid && !x.eliminato && !x.archiviato && String(x.stato || '').toLowerCase() !== 'venduto'; }).slice().reverse();
  return '<div class="acq-campi"><label style="flex:1;min-width:260px">Scheda immobile di destinazione<select class="acq-in" onchange="_acqImpDest(\'imm\',this.value)">'
    + '<option value="nuovo"' + (_imp.imm === 'nuovo' ? ' selected' : '') + '>+ Nuovo immobile (si apre la scheda già compilata)</option>'
    + L.map(function(x){ return '<option value="' + esc(x.uuid) + '"' + (_imp.imm === x.uuid ? ' selected' : '') + '>' + esc(etichetta(x)) + '</option>'; }).join('')
    + '</select></label></div>';
}
function disegnaImporta(){
  if(!_imp) _imp = impNuovo();
  var c = C(), I2 = _imp;
  var h = window.gxTesta('Incarico firmato a mano', '', 'l\'AI legge la scansione, tu confermi');
  h += '<div class="acq-barra"><button class="gx-btn" onclick="_acqImpEsci()">&larr; ' + (I2.acqId ? 'Torna al percorso' : 'Torna all\'elenco') + '</button></div>';
  var fl = I2.files.map(function(f, i){
    return '<div class="acq-doc"><span style="color:var(--text3);display:inline-flex">' + ico(f.mime === 'application/pdf' ? I.doc : I.foto, 16) + '</span>'
      + '<span class="n">' + esc(f.nome) + ' <span style="color:var(--text4);font-size:0.76rem">· ' + dimTesto(f.dim || 0) + '</span></span>'
      + '<button class="gx-btn" onclick="_acqImpTogli(' + i + ')">Togli</button></div>';
  }).join('');
  var st = I2.stato === 'leggo' ? 'L\'AI sta leggendo l\'incarico… (di solito 15-40 secondi)' : '';
  var p1 = '<div class="acq-azioni"><button class="gx-btn' + (I2.files.length ? '' : ' pieno') + '" onclick="_acqImpScegli()">' + ico(I.clip) + (I2.files.length ? ' Aggiungi pagine' : ' Scegli PDF o foto') + '</button>'
    + (I2.files.length ? '<button class="gx-btn' + (I2.dati ? '' : ' pieno') + '" onclick="_acqImpLeggi()"' + (I2.stato === 'leggo' ? ' disabled' : '') + '>' + ico(I.ai) + (I2.dati ? ' Rileggi con l\'AI' : ' Leggi con l\'AI') + '</button>' : '')
    + '<span class="nota">' + esc(st) + '</span></div>' + fl
    + '<div class="gx-nota" style="margin:0;padding:10px 16px">Va bene il PDF della scansione oppure una foto per ogni pagina, anche dal telefono. La scansione viene archiviata con il percorso. Niente viene scritto nelle schede finché non premi "Conferma" in fondo.</div>';
  h += window.gxCol('1 · La scansione dell\'incarico', 'PDF o foto delle pagine', c.blu, p1);
  if(I2.errore) h += '<div class="gx-info" style="border-left:4px solid ' + c.ko + '">' + esc(I2.errore) + '</div>';
  if(!I2.dati) return h;

  var d = I2.dati;
  if(d.note) h += '<div class="gx-info" style="border-left:4px solid ' + c.am + '"><b>Nota dell\'AI:</b> ' + esc(d.note) + '</div>';
  h += '<div class="gx-info">Rileggi ogni riga: l\'AI può sbagliare numeri e nomi scritti a mano. Le righe che cambierebbero un dato già presente in scheda (in arancio) partono <b>non spuntate</b>.</div>';
  var prop = impSceltaCliente() + impTabella('cli');
  var imm = impSceltaImmobile() + impTabella('imm');
  var inc = impTabella('inc');
  if(impRighe('co').length) imm += '<div class="gx-nota" style="margin:0;padding:8px 16px 0">Il secondo intestatario va fra i cointestatari dell\'immobile.</div>' + impTabella('co');
  h += '<div class="acq-grid"><div>'
    + window.gxCol('2 · Il proprietario', I2.cli === 'nuovo' ? 'nuovo cliente' : 'scheda cliente esistente', c.blu, prop)
    + window.gxCol('4 · L\'incarico', 'firma, esclusiva, date e provvigione', 'var(--brand,#EA580C)', inc)
    + '</div><div>'
    + window.gxCol('3 · L\'immobile', I2.imm === 'nuovo' ? 'immobile nuovo' : 'scheda immobile esistente', c.blu, imm)
    + '</div></div>';
  h += '<div class="acq-barra" style="justify-content:flex-end;margin-top:6px"><button class="gx-btn" onclick="_acqImpEsci()">Annulla</button>'
    + '<button class="gx-btn pieno" onclick="_acqImpConferma()">' + ico(I.ok) + (I2.imm === 'nuovo' ? ' Conferma e apri la scheda del nuovo immobile' : ' Conferma e avvia il percorso') + '</button></div>';
  return h;
}

/* ── scrittura ── */
function impScrivi(obj, sez, soloVuoti){
  IMP_DEF[sez].forEach(function(def){
    var key = sez + '.' + def.k, v = impVal(key);
    if(!v || !impSpunta(key) || def.campo === '_firma') return;
    if(soloVuoti && String(obj[def.campo] == null ? '' : obj[def.campo]).trim() !== '') return;
    if(def.data && !dataOk(v)) return;
    var val = v;
    if(def.up) val = v.replace(/\s+/g, ' ').toUpperCase();
    if(def.dec){ val = decimale(v); if(!val) return; }
    if(def.campo === 'comune' && typeof window.nomeConMaiuscole === 'function'){ try{ val = window.nomeConMaiuscole(v); }catch(e){} }
    if(def.euro){
      var n = numero(v); if(!n) return;
      var prima = numero(obj.prezzo);
      if(sez === 'imm' && prima !== n){
        if(!Array.isArray(obj.prezzoStorico)) obj.prezzoStorico = [];
        if(!obj.prezzoStorico.length && prima) obj.prezzoStorico.push({ prezzo:prima, data:obj.dataIns || oggi(), motivo:'Prezzo iniziale' });
        obj.prezzoStorico.push({ prezzo:n, data:oggi(), motivo:obj.prezzoStorico.length ? 'Prezzo dell\'incarico firmato' : 'Prezzo iniziale' });
      }
      val = n;
    }
    obj[def.campo] = val;
  });
}
function impCointestatario(im){
  var R = impRighe('co').filter(impSpunta); if(!R.length) return;
  if(!Array.isArray(im.coIntestari)) im.coIntestari = [];
  if(!im.coIntestari[0]) im.coIntestari[0] = { nome:'', tel:'', nascita:'' };
  impScrivi(im.coIntestari[0], 'co', false);
  if(!im.coIntestari[0].nome) im.coIntestari.splice(0, 1);
}
/* lega il proprietario all'immobile SOLO se l'immobile non ne ha gia' uno */
function impLega(im, cli){
  var idx = D.clienti.indexOf(cli);
  if(im.clienteUuid && im.clienteUuid !== cli.uuid) return false;
  im.clienteUuid = cli.uuid; if(idx >= 0) im.clienteRef = String(idx);
  if(!im.contatto) im.contatto = cli.nome || '';
  if(!im.telefono && cli.tel) im.telefono = cli.tel;
  if(!im.email && cli.email) im.email = cli.email;
  return true;
}
/* la scheda normale del nuovo immobile, gia' compilata */
function impCompilaModale(cli){
  var set = function(id, v){
    var el = document.getElementById(id); if(!el || v === '' || v == null) return;
    el.value = v;
    try{ el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true })); }catch(e){}
  };
  var idx = D.clienti.indexOf(cli);
  if(idx >= 0) set('im-cliente-ref', String(idx));
  set('im-inc', 'vendita');
  ['imm', 'inc'].forEach(function(sez){
    IMP_DEF[sez].forEach(function(def){
      var key = sez + '.' + def.k, v = impVal(key);
      if(!def.modale || !v || !impSpunta(key)) return;
      if(def.data && !dataOk(v)) return;
      if(def.euro){
        var n = numero(v); if(!n) return;
        set(def.modale, Math.round(n).toLocaleString('it-IT'));
        var el = document.getElementById(def.modale); if(el) el.setAttribute('data-raw', String(n));
        return;
      }
      if(def.campo === 'comune' && typeof window.nomeConMaiuscole === 'function'){ try{ v = window.nomeConMaiuscole(v); }catch(e){} }
      if(def.dec){ v = decimale(v); if(!v) return; }
      set(def.modale, v);
    });
  });
  if(!cli.tel) return;
  var t = document.getElementById('im-tel'); if(t && !t.value) t.value = cli.tel;
}
function impConcludi(im, cli){
  var a = vivi().find(function(x){ return x.immUuid === im.uuid && x.stato !== 'chiusa'; });
  if(!a){
    var ag = null; try{ ag = (typeof window._agenteCorrente === 'function') ? window._agenteCorrente() : null; }catch(e){}
    a = norma({ id:nuovoId(), immUuid:im.uuid, immEt:etichetta(im), creato:oggi(), stato:'aperta', agenteUuid:(ag && ag.uuid) || '', ape:'' });
    diario(a, 'Percorso avviato');
    lista().push(a);
  }
  norma(a);
  var firma = impVal('inc.dataFirma');
  if(impSpunta('inc.dataFirma') && dataOk(firma)){
    a.tappe.incarico.firmato = firma;
    if(!im.incInizio) im.incInizio = firma;   /* come "Segna firmato": solo se vuoto */
  }
  diario(a, 'Incarico firmato a mano: dati letti con l\'AI e confermati' + (dataOk(firma) && impSpunta('inc.dataFirma') ? ' (firmato il ' + it(firma) + ')' : ''));
  if(!impLega(im, cli)) diario(a, 'Attenzione: l\'immobile era già collegato a un altro proprietario e non l\'ho cambiato. Controlla la scheda');
  im._modificata = Date.now();
  salva();
  var files = _imp.files.slice();
  _imp = null;
  vaiA('dettaglio', a.id);
  avviso('Percorso aggiornato con i dati dell\'incarico firmato');
  if(files.length) archivia(a, im, files);
}

/* Nuovo immobile dalla scheda normale. Questa pagina si NASCONDE (non si
   chiude) e ricompare quando la scheda si chiude; poi(nuovo|null). Prima
   viveva dentro _acqCaricaNuovo: ora la usano due pulsanti. */
function caricaNuovoImmobile(dopoApertura, poi){
  if(typeof window.openImmobileModal !== 'function'){ avviso('Il modulo Immobili non è ancora caricato: riprova fra un istante'); return; }
  var w = document.getElementById('acq-wrap');
  var prima = {}; (D.immobili || []).forEach(function(x){ if(x && x.uuid) prima[x.uuid] = 1; });
  var torna = function(){
    if(_attesa){ clearInterval(_attesa); _attesa = null; }
    var nuovo = (D.immobili || []).find(function(x){ return x && x.uuid && !prima[x.uuid]; });
    var pag = document.getElementById('acq-wrap');
    if(pag) pag.style.display = '';
    poi(nuovo || null, !!pag);
  };
  try{ window.openImmobileModal(); }
  catch(e){ console.warn('[Acquisizioni] openImmobileModal KO:', e); avviso('Non sono riuscito ad aprire la scheda del nuovo immobile'); return; }
  if(dopoApertura){ setTimeout(function(){ try{ dopoApertura(); }catch(e){ console.warn('[Acquisizioni] compilazione scheda KO:', e); } }, 120); }
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
}

/* ── azioni ── */
window._acqImpAvvia = function(acqId){
  var a = acqId ? trova(acqId) : null;
  _imp = impNuovo(a ? a.immUuid : '', a ? a.id : '');
  vaiA('importa');
};
window._acqImpEsci = function(){
  var torna = _imp && _imp.acqId; _imp = null;
  if(torna && trova(torna)) vaiA('dettaglio', torna); else vaiA('elenco');
};
window._acqImpScegli = function(){
  scegliFile(function(L){ if(!_imp || !L.length) return; _imp.files = _imp.files.concat(L); _imp.errore = ''; disegna(); });
};
window._acqImpTogli = function(i){ if(_imp){ _imp.files.splice(i, 1); disegna(); } };
window._acqImpVal = function(key, v){ if(_imp && _imp.dati){ var r = impRif(key); if(r.o) r.o[r.k] = v; } };
window._acqImpCk = function(key, v){ if(_imp) _imp.ck[key] = !!v; };
window._acqImpDest = function(chi, v){
  if(!_imp) return;
  if(chi === 'cli') _imp.cli = v; else _imp.imm = v;
  /* le spunte si ricalcolano sulla nuova scheda, ma solo per quella parte */
  Object.keys(_imp.ck).forEach(function(key){ if(IMP_SEZ_DEST[key.split('.')[0]] === chi) delete _imp.ck[key]; });
  disegna();
};
window._acqImpLeggi = function(){
  var I2 = _imp; if(!I2 || !I2.files.length || I2.stato === 'leggo') return;
  if(typeof window.callClaude !== 'function'){ I2.errore = 'La funzione AI non è disponibile: controlla l\'indirizzo del Worker nelle Impostazioni AI.'; disegna(); return; }
  var content = [{ type:'text', text:impPrompt() }];
  I2.files.forEach(function(f, i){
    content.push({ type:'text', text:'--- Pagina/file ' + (i + 1) + ': ' + f.nome + ' ---' });
    if(f.mime === 'application/pdf') content.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:f.b64 } });
    else content.push({ type:'image', source:{ type:'base64', media_type:f.mime, data:f.b64 } });
  });
  content.push({ type:'text', text:'Rispondi ORA solo con il JSON richiesto.' });
  var modello = 'claude-sonnet-4-6';
  try{ if(typeof window.aiGetConfig === 'function' && window.aiGetConfig().model) modello = window.aiGetConfig().model; }catch(e){}
  I2.stato = 'leggo'; I2.errore = ''; disegna();
  window.callClaude({ model:modello, max_tokens:1500, messages:[{ role:'user', content:content }] }).then(function(data){
    if(_imp !== I2) return;   /* nel frattempo e' uscito dalla pagina */
    var txt = ''; try{ txt = (data.content || []).map(function(b){ return b.text || ''; }).join('').trim(); }catch(e){}
    var obj = null;
    try{
      var t = txt.replace(/```json/gi, '').replace(/```/g, '').trim(), i1 = t.indexOf('{'), i2 = t.lastIndexOf('}');
      if(i1 >= 0 && i2 > i1) t = t.slice(i1, i2 + 1);
      obj = JSON.parse(t);
    }catch(e){ obj = null; }
    I2.stato = '';
    if(!obj){ I2.errore = 'L\'AI non ha restituito i dati in forma leggibile. Riprova, magari con foto più nitide o un PDF.'; disegna(); return; }
    I2.dati = impNormaDati(obj); I2.ck = {};
    impProponi();
    disegna();
  }).catch(function(err){
    if(_imp !== I2) return;
    I2.stato = ''; I2.errore = 'Errore AI: ' + ((err && err.message) || 'riprova') + '.'; disegna();
  });
};
window._acqImpConferma = function(){
  var I2 = _imp; if(!I2 || !I2.dati) return;
  if(!Array.isArray(D.clienti)) D.clienti = [];
  var cli;
  if(!I2.cli || I2.cli === 'nuovo'){
    if(!impVal('cli.nome') || !impSpunta('cli.nome')){ avviso('Per creare il cliente serve il nome del proprietario, spuntato'); return; }
    cli = { uuid:nuovoUuid(), nome:'', tipo:'venditore', data:oggi(), fonte:'', note:'Da incarico firmato a mano (letto con l\'AI)', _modificata:Date.now() };
    impScrivi(cli, 'cli', false);
    D.clienti.push(cli);
  } else {
    cli = cliPerUuid(I2.cli);
    if(!cli){ avviso('Cliente non trovato: sceglilo di nuovo'); return; }
    impScrivi(cli, 'cli', false);
    if(cli.tipo === 'acquirente') cli.tipo = 'entrambi';   /* un venditore non puo' restare solo acquirente */
    cli._modificata = Date.now();
  }
  /* d'ora in poi il cliente esiste: se la scheda immobile si annulla e si
     riconferma, non nasce un doppione */
  I2.cli = cli.uuid;
  if(!I2.imm || I2.imm === 'nuovo'){
    salva();
    caricaNuovoImmobile(function(){ impCompilaModale(cli); }, function(nuovo, pagina){
      if(_imp !== I2){ if(!pagina) window.apriAcquisizioni(); return; }
      if(!nuovo){
        if(!pagina){ _vista = 'importa'; }
        avviso('Scheda immobile chiusa senza salvare: il cliente è registrato, i dati letti sono ancora qui');
        disegna(); return;
      }
      /* la scheda ha gia' scritto i campi compilati: qui solo cio' che manca */
      impScrivi(nuovo, 'imm', true); impScrivi(nuovo, 'inc', true); impCointestatario(nuovo);
      if(!pagina) _vista = 'importa';
      impConcludi(nuovo, cli);
    });
    return;
  }
  var im = immPerUuid(I2.imm);
  if(!im){ avviso('Immobile non trovato: sceglilo di nuovo'); return; }
  impScrivi(im, 'imm', false); impScrivi(im, 'inc', false); impCointestatario(im);
  impConcludi(im, cli);
};

/* scansione allegata a mano a un percorso gia' aperto (anche un incarico
   preparato col modulo, stampato e firmato) */
window._acqAllega = function(id){
  var a = trova(id), im = immDi(a); if(!a) return;
  scegliFile(function(L){ if(L.length) archivia(a, im, L); });
};
window._acqTogliFile = function(id, i){
  var a = trova(id); if(!a || !Array.isArray(a.incaricoFiles) || !a.incaricoFiles[i]) return;
  var f = a.incaricoFiles[i];
  var fai = function(){
    a.incaricoFiles.splice(i, 1);
    diario(a, 'Scansione dell\'incarico tolta: ' + (f.nome || 'file'));
    salva(); disegna();
    try{ if(f.url && window._storage) window._storage.refFromURL(f.url).delete().catch(function(){}); }catch(e){}
  };
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm('Tolgo "' + (f.nome || 'questo file') + '" dal percorso e dall\'archivio online?', '', 'Scansione incarico').then(function(ok){ if(ok) fai(); });
  else fai();
};


/* ── 10. REGISTRO DELLE PRESTAZIONI ─────────────────────────────────────────
   [14 ott 2026] Scelte di Enzo: registro dei lavori di fotografi e tecnici
   (A, con il Bilancio), linguetta "Prestazioni" in Acquisizioni piu' il
   riquadro dentro ogni percorso, righe proposte dal percorso piu' a mano.
   A CARICO DI (tre casi, scelta del 14 ott):
     'mio'          costo dell'agenzia/agente. "Segna pagato" scrive in
                    Altre Entrate/Spese una spesa PAGATA, sezione struttura.
     'anticipo'     la paghi tu e te la fai restituire dal proprietario.
                    "Segna pagato" scrive un anticipo DA RECUPERARE (stato
                    "Da Incassare"); "Rimborsato" lo porta a "Incassata",
                    che per gli anticipi vuol dire "rientrato" (Bilancio,
                    scelta del 15 set).
     'proprietario' lo paga il proprietario: resta solo qui, niente Bilancio.
   Il Bilancio indovinava la sezione dal TIPO (APE, foto, visure = sempre
   anticipo): la spesa scritta da qui porta sezioneBil, che il Bilancio ora
   legge per primo.
   UN POSTO SOLO: l'importo vive qui; la spesa in Altre Entrate/Spese e' la
   sua copia contabile, legata per id (p.spesaId ↔ spesa._prestId) e
   riallineata a ogni salvataggio. Cancellare = eliminato:true. */

var PREST_TIPI = ['Fotografie Immobile', 'APE Energetico', 'Planimetria / Rilievo', 'Visura Catastale', 'Visura Ipocatastale',
  'Documenti Comune', 'Sanatoria / Pratica Edilizia', 'Perizia Tecnica', 'Consulenza Tecnica'];
var CARICO = {
  mio:          { et:'Mio costo',           breve:'mio costo' },
  anticipo:     { et:'Anticipo per il proprietario', breve:'anticipo' },
  proprietario: { et:'Lo paga il proprietario', breve:'paga il proprietario' }
};
var MOD_PAG = ['Bonifico Bancario', 'Contanti', 'Assegno', 'POS / Carta', 'Fattura'];
var _pf = null;     /* modulo aperto: lavoro nuovo o in modifica */
var _pp = null;     /* { id, cosa:'pagato'|'rimborsato', data, modPag } */
var _rf = { periodo:'anno', prof:'', stato:'' };

function prestLista(){
  if(typeof D === 'undefined' || !D) return [];
  if(!Array.isArray(D.prestazioni)) D.prestazioni = [];
  return D.prestazioni;
}
function prestVive(){ return prestLista().filter(function(p){ return p && !p.eliminato; }); }
function prestTrova(id){ return prestLista().find(function(p){ return p && p.id === id; }) || null; }
function euro(n){ n = Number(n) || 0; return '€ ' + n.toLocaleString('it-IT', { minimumFractionDigits:(n % 1 ? 2 : 0), maximumFractionDigits:2 }); }
function professionisti(){
  var tutti = Array.isArray(D.informatori) ? D.informatori : [];
  var su = tecnici().concat(fotografi()), visti = {};
  su.forEach(function(x){ visti[x.id] = 1; });
  return su.concat(tutti.filter(function(x){ return x && x.id && !visti[x.id]; }));
}
function profNome(p){ var x = contatto(p.profId); return x ? bello(x.nome || '') : (p.profNome || 'professionista non indicato'); }
function prestImm(p){ return p.immUuid ? immPerUuid(p.immUuid) : null; }
/* stato in una parola: da pagare / pagato / da recuperare / rimborsato / proprietario */
function prestStato(p){
  if(p.carico === 'proprietario') return 'proprietario';
  if(!p.pagato) return 'dapagare';
  if(p.carico === 'anticipo') return p.rimborsato ? 'rimborsato' : 'darecuperare';
  return 'pagato';
}
var PST_ET = { dapagare:'Da pagare', pagato:'Pagato', darecuperare:'Da farsi restituire', rimborsato:'Restituito', proprietario:'Paga il proprietario' };
function pstCol(s){ var c = C(); return s === 'dapagare' ? c.am : (s === 'darecuperare' ? c.ko : (s === 'proprietario' ? c.no : c.ok)); }

/* ── la spesa in Altre Entrate/Spese ── */
function spesaDi(p){ return p.spesaId ? ((Array.isArray(D.altriIncassi) ? D.altriIncassi : []).find(function(x){ return x && x.id === p.spesaId; }) || null) : null; }
function spesaScrivi(p){
  if(p.carico === 'proprietario' || !p.pagato) return null;
  if(!Array.isArray(D.altriIncassi)) D.altriIncassi = [];
  var s = spesaDi(p), im = prestImm(p), nuova = !s;
  if(nuova){ s = { id:nuovoUuid(), _prestId:p.id }; D.altriIncassi.push(s); p.spesaId = s.id; }
  var prop = im ? propDi(im) : { nome:'' };
  var idx = im ? D.immobili.indexOf(im) : -1;
  s.tipo = p.tipo || 'Consulenza Tecnica';
  s.direzione = 'uscita';
  s.importo = Number(p.importo) || 0;
  s.data = p.pagato;
  s.modPag = p.modPag || '';
  /* il Bilancio mette per primo il "cliente" nel dettaglio: per un anticipo
     e' chi deve restituire i soldi, per un costo tuo e' il professionista */
  s.cliente = p.carico === 'anticipo' ? (prop.nome || '') : profNome(p);
  s.descr = (p.carico === 'anticipo' ? profNome(p) + ' · ' : '') + (im ? etichetta(im) : '');
  s.immRef = idx >= 0 ? String(idx) : '';
  s.immUuid = im ? im.uuid : '';
  s.sezioneBil = p.carico === 'anticipo' ? 'diretti' : 'struttura';
  s.stato = p.carico === 'anticipo' ? (p.rimborsato ? 'Incassata' : 'Da Incassare') : 'Incassata';
  if(p.spesaDi) s.spesaDi = p.spesaDi;
  s.note = 'Dal registro prestazioni (Acquisizioni)' + (p.note ? ' — ' + p.note : '');
  s._modificata = Date.now();
  return s;
}
function spesaTogli(p){
  if(!p.spesaId || !Array.isArray(D.altriIncassi)) { p.spesaId = ''; return; }
  var i = D.altriIncassi.findIndex(function(x){ return x && x.id === p.spesaId; });
  if(i >= 0) D.altriIncassi.splice(i, 1);   /* come "Elimina" in Altre Entrate/Spese */
  p.spesaId = '';
}

/* ── proposte dal percorso: foto fatte col fotografo, documenti chiesti al
   tecnico, finche' non c'e' un lavoro registrato o Enzo dice "non serve" ── */
function proposte(soloAcq){
  var out = [];
  vivi().forEach(function(a){
    if(soloAcq && a.id !== soloAcq) return;
    norma(a);
    var no = a.prestNo || {}, L = prestVive().filter(function(p){ return p.acqId === a.id; });
    var tf = a.tappe.foto, tt = a.tappe.tecnico, im = immDi(a);
    if(tf.chi === 'fotografo' && tf.fotografoId && tf.fatte && !no.foto && !L.some(function(p){ return p.ruolo === 'foto'; }))
      out.push({ a:a, im:im, ruolo:'foto', profId:tf.fotografoId, tipo:'Fotografie Immobile', data:tf.fatte, x:'Servizio fotografico' });
    if(tt.tecnicoId && tt.inviato && !no.tecnico && !L.some(function(p){ return p.ruolo === 'tecnico'; }))
      out.push({ a:a, im:im, ruolo:'tecnico', profId:tt.tecnicoId, tipo:(a.ape === 'tecnico' ? 'APE Energetico' : ''), data:tt.inviato, x:'Documenti dal tecnico' });
  });
  return out;
}

/* ── periodo ── */
function periodoDi(){
  var d = new Date(), y = d.getFullYear(), m = d.getMonth(), p = function(n){ return (n < 10 ? '0' : '') + n; };
  if(_rf.periodo === 'mese') return [y + '-' + p(m + 1) + '-01', y + '-' + p(m + 1) + '-31'];
  if(_rf.periodo === 'mesescorso'){ var ym = m === 0 ? [y - 1, 12] : [y, m]; return [ym[0] + '-' + p(ym[1]) + '-01', ym[0] + '-' + p(ym[1]) + '-31']; }
  if(_rf.periodo === 'anno') return [y + '-01-01', y + '-12-31'];
  if(_rf.periodo === 'annoscorso') return [(y - 1) + '-01-01', (y - 1) + '-12-31'];
  return ['', ''];
}
function filtrate(){
  var pr = periodoDi();
  return prestVive().filter(function(p){
    var d = String(p.data || '');
    if(pr[0] && (d < pr[0] || d > pr[1])) return false;
    if(_rf.prof && p.profId !== _rf.prof) return false;
    if(_rf.stato && prestStato(p) !== _rf.stato) return false;
    return true;
  }).sort(function(x, y){ return String(y.data || '').localeCompare(String(x.data || '')); });
}

/* ── disegno ── */
function formPrest(){
  if(!_pf) return '';
  var c = C(), f = _pf;
  var prof = professionisti().map(function(x){ return '<option value="' + esc(x.id) + '"' + (f.profId === x.id ? ' selected' : '') + '>' + esc(bello(x.nome || '')) + (x.categoria ? ' — ' + esc(x.categoria) : '') + '</option>'; }).join('');
  var imms = (Array.isArray(D.immobili) ? D.immobili : []).filter(function(x){ return x && x.uuid && !x.eliminato; }).slice().reverse()
    .map(function(x){ return '<option value="' + esc(x.uuid) + '"' + (f.immUuid === x.uuid ? ' selected' : '') + '>' + esc(etichetta(x)) + '</option>'; }).join('');
  var tipi = PREST_TIPI.concat(f.tipo && PREST_TIPI.indexOf(f.tipo) < 0 ? [f.tipo] : []);
  var diChi = '';
  try{
    if(f.carico !== 'proprietario' && typeof window._spesaDiOpzioni === 'function' && Array.isArray(D.agenti) && D.agenti.length > 1)
      diChi = '<label>Di chi è<select class="acq-in" onchange="_acqPfSet(\'spesaDi\',this.value)">' + window._spesaDiOpzioni(f.spesaDi ? { spesaDi:f.spesaDi } : null) + '</select></label>';
  }catch(e){}
  var h = '<div class="acq-campi">'
    + '<label>Lavoro<select class="acq-in" onchange="_acqPfSet(\'tipo\',this.value)"><option value="">— scegli —</option>'
    +   tipi.map(function(t){ return '<option' + (f.tipo === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label>'
    + '<label style="min-width:220px">Professionista<select class="acq-in" onchange="_acqPfSet(\'profId\',this.value)"><option value="">— dalla Rubrica —</option>' + prof + '</select></label>'
    + '<label style="min-width:260px;flex:1">Immobile<select class="acq-in" onchange="_acqPfSet(\'immUuid\',this.value)"' + (f.fisso ? ' disabled' : '') + '><option value="">— nessuno —</option>' + imms + '</select></label>'
    + '<label>Data del lavoro<input type="date" class="acq-in" value="' + esc(f.data || '') + '" onchange="_acqPfSet(\'data\',this.value)"></label>'
    + '<label>Costo €<input class="acq-in" style="width:110px" inputmode="decimal" value="' + esc(f.importo ? String(f.importo).replace('.', ',') : '') + '" oninput="_acqPfSet(\'importo\',this.value,1)"></label>'
    + '</div>'
    + '<div class="acq-azioni"><span class="nota" style="font-weight:700">A carico di</span><span class="acq-scelta">'
    + Object.keys(CARICO).map(function(k){ return '<button class="' + (f.carico === k ? 'on' : '') + '" onclick="_acqPfSet(\'carico\',\'' + k + '\')">' + esc(CARICO[k].et) + '</button>'; }).join('')
    + '</span>' + (diChi ? '<span class="acq-campi" style="padding:0;border:none">' + diChi + '</span>' : '') + '</div>'
    + '<div class="acq-campi"><label style="flex:1">Note<input class="acq-in" value="' + esc(f.note || '') + '" oninput="_acqPfSet(\'note\',this.value,1)" placeholder="es. fattura n. 12, sopralluogo compreso"></label></div>'
    + '<div class="gx-nota" style="margin:0;padding:10px 16px">' + esc(
        f.carico === 'mio' ? 'Quando lo segni pagato, va fra le spese di struttura del Bilancio.'
      : f.carico === 'anticipo' ? 'Quando lo segni pagato, va fra gli anticipi da recuperare; quando il proprietario ti restituisce i soldi premi "Restituito".'
      : 'Lo paga il proprietario: resta nel registro per contare lavori e costi, ma non entra nel Bilancio.') + '</div>'
    + '<div class="acq-azioni" style="justify-content:flex-end"><button class="gx-btn" onclick="_acqPfAnnulla()">Annulla</button>'
    + '<button class="gx-btn pieno" onclick="_acqPfSalva()">' + ico(I.ok) + (f.id ? ' Salva le modifiche' : ' Registra il lavoro') + '</button></div>';
  return window.gxCol(f.id ? 'Modifica lavoro' : 'Nuovo lavoro', 'fotografo, tecnico o altro professionista', 'var(--brand,#EA580C)', h);
}
function rigaPrest(p, conImm){
  var c = C(), s = prestStato(p), im = prestImm(p), id = jsq(p.id), sp = spesaDi(p);
  var sub = [it(p.data), profNome(p)];
  if(conImm) sub.push(im ? etichetta(im) : 'nessun immobile');
  sub.push(CARICO[p.carico] ? CARICO[p.carico].breve : '');
  if(p.pagato) sub.push('pagato il ' + it(p.pagato) + (p.modPag ? ' (' + p.modPag + ')' : ''));
  if(p.rimborsato) sub.push('restituito il ' + it(p.rimborsato));
  var az = '';
  if(s === 'dapagare') az += '<button class="gx-btn pieno" onclick="_acqPpApri(\'' + id + '\',\'pagato\')">Segna pagato</button>';
  if(s === 'darecuperare') az += '<button class="gx-btn" onclick="_acqPpApri(\'' + id + '\',\'rimborsato\')">Restituito</button>';
  if(s === 'pagato' || s === 'darecuperare') az += '<button class="gx-btn" onclick="_acqPrestAnnullaPag(\'' + id + '\')" title="Toglie anche la spesa da Altre Entrate/Spese">Annulla pagamento</button>';
  if(s === 'rimborsato') az += '<button class="gx-btn" onclick="_acqPrestAnnullaRimb(\'' + id + '\')">Annulla restituzione</button>';
  az += '<button class="gx-btn" onclick="_acqPfModifica(\'' + id + '\')" title="Modifica">' + ico(I.matita) + '</button>'
    + '<button class="gx-btn" onclick="_acqPrestElimina(\'' + id + '\')" title="Elimina">' + ico(I.x) + '</button>';
  var avv = (p.pagato && p.carico !== 'proprietario' && !sp)
    ? '<div class="sub" style="color:' + c.ko + ';font-weight:600">La spesa in Altre Entrate/Spese non c\'è più. <a href="#" onclick="event.preventDefault();_acqPrestRiscrivi(\'' + id + '\')" style="color:inherit">Riscrivila</a></div>' : '';
  var h = '<div class="gx-riga" style="align-items:center;gap:12px;flex-wrap:wrap">'
    + '<div style="flex:1;min-width:240px"><div class="tt">' + esc(p.tipo || 'Lavoro') + '</div><div class="sub">' + esc(sub.filter(Boolean).join(' · ')) + '</div>' + avv + '</div>'
    + '<span class="acq-pill" style="color:' + pstCol(s) + '"><i></i>' + esc(PST_ET[s]) + '</span>'
    + '<span style="font-weight:800;min-width:90px;text-align:right;font-variant-numeric:tabular-nums">' + esc(euro(p.importo)) + '</span>'
    + '<span style="display:inline-flex;gap:6px;flex-wrap:wrap">' + az + '</span></div>';
  if(_pp && _pp.id === p.id){
    h += '<div class="acq-campi" style="background:var(--bg2)">'
      + '<label>' + (_pp.cosa === 'pagato' ? 'Pagato il' : 'Restituito il') + '<input type="date" class="acq-in" value="' + esc(_pp.data) + '" onchange="_acqPpSet(\'data\',this.value)"></label>'
      + '<label>Come<select class="acq-in" onchange="_acqPpSet(\'modPag\',this.value)">' + MOD_PAG.map(function(m){ return '<option' + (_pp.modPag === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></label>'
      + '<label style="justify-content:flex-end;flex-direction:row;gap:8px"><button class="gx-btn" onclick="_acqPpChiudi()">Annulla</button><button class="gx-btn pieno" onclick="_acqPpConferma()">' + ico(I.ok) + ' Conferma</button></label>'
      + '</div>';
  }
  return h;
}
function righeProposte(L, conImm){
  return L.map(function(x){
    var prof = contatto(x.profId);
    return '<div class="gx-riga" style="align-items:center;gap:12px;flex-wrap:wrap">'
      + '<div style="flex:1;min-width:240px"><div class="tt">' + esc(x.x) + ' — ' + esc(prof ? bello(prof.nome || '') : 'professionista') + '</div>'
      + '<div class="sub">' + esc([conImm ? (x.im ? etichetta(x.im) : (x.a.immEt || '')) : '', (x.ruolo === 'foto' ? 'foto fatte il ' : 'documenti chiesti il ') + it(x.data)].filter(Boolean).join(' · ')) + '</div></div>'
      + '<button class="gx-btn pieno" onclick="_acqPropRegistra(\'' + jsq(x.a.id) + '\',\'' + x.ruolo + '\')">Registra il costo</button>'
      + '<button class="gx-btn" onclick="_acqPropNo(\'' + jsq(x.a.id) + '\',\'' + x.ruolo + '\')">Non serve</button></div>';
  }).join('');
}
function disegnaRegistro(){
  var c = C(), L = filtrate(), P = proposte();
  var tot = 0, daPag = 0, nDaPag = 0, daRec = 0, prop = 0, nProp = 0;
  L.forEach(function(p){
    var n = Number(p.importo) || 0, s = prestStato(p);
    tot += n;
    if(s === 'dapagare'){ daPag += n; nDaPag++; }
    if(s === 'darecuperare') daRec += n;
    if(s === 'proprietario'){ prop += n; nProp++; }
  });
  var h = '';
  h += '<div class="acq-barra">'
    + '<select class="acq-in" onchange="_acqRf(\'periodo\',this.value)">' + [['mese','Questo mese'],['mesescorso','Mese scorso'],['anno','Quest\'anno'],['annoscorso','Anno scorso'],['tutto','Sempre']].map(function(o){ return '<option value="' + o[0] + '"' + (_rf.periodo === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'
    + '<select class="acq-in" onchange="_acqRf(\'prof\',this.value)"><option value="">Tutti i professionisti</option>' + professionisti().filter(function(x){ return prestVive().some(function(p){ return p.profId === x.id; }); }).map(function(x){ return '<option value="' + esc(x.id) + '"' + (_rf.prof === x.id ? ' selected' : '') + '>' + esc(bello(x.nome || '')) + '</option>'; }).join('') + '</select>'
    + '<select class="acq-in" onchange="_acqRf(\'stato\',this.value)"><option value="">Tutti gli stati</option>' + Object.keys(PST_ET).map(function(k){ return '<option value="' + k + '"' + (_rf.stato === k ? ' selected' : '') + '>' + PST_ET[k] + '</option>'; }).join('') + '</select>'
    + '<div style="flex:1"></div>'
    + '<button class="gx-btn" onclick="_acqPrestStampa()">' + ico(I.doc) + ' Stampa l\'elenco</button>'
    + '<button class="gx-btn pieno" onclick="_acqPfNuovo()">' + ico(I.piu) + ' Aggiungi lavoro</button></div>';
  h += '<div class="gx-cards acq-cards">'
    + window.gxCard('Lavori', L.length, 'nel periodo scelto', c.blu)
    + window.gxCard('Costo totale', euro(tot), 'tutti i lavori del periodo', 'var(--brand,#EA580C)')
    + window.gxCard('Da pagare', euro(daPag), nDaPag + (nDaPag === 1 ? ' lavoro' : ' lavori') + ' ai professionisti', daPag ? c.am : c.ok)
    + window.gxCard('Da farsi restituire', euro(daRec), 'anticipi per i proprietari', daRec ? c.ko : c.ok)
    + window.gxCard('Pagati dai proprietari', euro(prop), nProp + (nProp === 1 ? ' lavoro' : ' lavori') + ', fuori dal Bilancio', c.no)
    + '</div>';
  if(_pf && !_pf.dove) h += formPrest();
  if(P.length) h += window.gxCol('Da registrare', 'lavori fatti nei percorsi, ancora senza costo', c.am, righeProposte(P, true));
  /* per professionista */
  var per = {};
  L.forEach(function(p){
    var k = p.profId || ('nome:' + (p.profNome || '')); if(!per[k]) per[k] = { nome:profNome(p), n:0, tot:0, dp:0, id:p.profId || '' };
    per[k].n++; per[k].tot += Number(p.importo) || 0; if(prestStato(p) === 'dapagare') per[k].dp += Number(p.importo) || 0;
  });
  var PK = Object.keys(per).sort(function(x, y){ return per[y].tot - per[x].tot; });
  var righePer = PK.map(function(k){
    var x = per[k];
    return '<div class="gx-riga" style="align-items:center;gap:12px;cursor:' + (x.id ? 'pointer' : 'default') + '"' + (x.id ? ' onclick="_acqRf(\'prof\',\'' + jsq(_rf.prof === x.id ? '' : x.id) + '\')"' : '') + '>'
      + '<div style="flex:1;min-width:0"><div class="tt">' + esc(x.nome) + '</div><div class="sub">' + x.n + (x.n === 1 ? ' lavoro' : ' lavori') + (x.dp ? ' · da pagare ' + esc(euro(x.dp)) : ' · niente da pagare') + '</div></div>'
      + '<span style="font-weight:800;font-variant-numeric:tabular-nums">' + esc(euro(x.tot)) + '</span></div>';
  }).join('') || '<div class="gx-vuoto">Nessun lavoro nel periodo.</div>';
  var righe = L.map(function(p){ return rigaPrest(p, true); }).join('') || '<div class="gx-vuoto">Nessun lavoro registrato nel periodo. Premi "Aggiungi lavoro", oppure registra il costo dai lavori proposti.</div>';
  h += '<div class="acq-grid acq-grid-reg"><div>'
    + window.gxCol('Lavori', 'i più recenti per primi', c.blu, righe, 'Totale', euro(tot))
    + '</div><div>'
    + window.gxCol('Per professionista', 'tocca un nome per vedere solo i suoi lavori', c.no, righePer)
    + '</div></div>';
  return h;
}
/* il riquadro dentro il percorso */
function bloccoPrestPercorso(a){
  var c = C(), L = prestVive().filter(function(p){ return p.acqId === a.id || (!p.acqId && p.immUuid && p.immUuid === a.immUuid); });
  var P = proposte(a.id), tot = L.reduce(function(s, p){ return s + (Number(p.importo) || 0); }, 0);
  var h = '';
  if(_pf && _pf.dove === a.id) h += '<div style="padding:12px 16px 0">' + formPrest() + '</div>';
  if(P.length) h += righeProposte(P, false);
  h += L.map(function(p){ return rigaPrest(p, false); }).join('');
  if(!L.length && !P.length) h += '<div class="gx-nota" style="margin:0;padding:10px 16px">Nessun lavoro registrato. Quando segni "Foto fatte" col fotografo, o chiedi i documenti al tecnico, qui ti propongo di registrarne il costo.</div>';
  h += '<div class="acq-azioni"><button class="gx-btn" onclick="_acqPfNuovo(\'' + jsq(a.id) + '\')">' + ico(I.piu) + ' Aggiungi lavoro</button>'
    + '<span class="nota">' + (L.length ? L.length + (L.length === 1 ? ' lavoro' : ' lavori') + ' · ' + euro(tot) : '') + '</span></div>';
  return window.gxCol('Lavori dei professionisti', 'costi di fotografo e tecnico per questo immobile', c.blu, h);
}

/* ── azioni ── */
function pfDa(a, extra){
  /* dove: il percorso nella cui pagina si vede il modulo ('' = registro) */
  var f = { id:'', tipo:'', profId:'', immUuid:a ? a.immUuid : '', acqId:a ? a.id : '', fisso:!!a, data:oggi(), importo:'', carico:'mio', spesaDi:'', note:'', ruolo:'',
            dove:(_vista === 'dettaglio' ? _apertoId : '') };
  Object.keys(extra || {}).forEach(function(k){ f[k] = extra[k]; });
  return f;
}
window._acqPfNuovo = function(acqId){ var a = acqId ? trova(acqId) : null; _pf = pfDa(a); _pp = null; disegna(); };
window._acqPfModifica = function(id){
  var p = prestTrova(id); if(!p) return;
  _pf = pfDa(null, { id:p.id, tipo:p.tipo || '', profId:p.profId || '', immUuid:p.immUuid || '', acqId:p.acqId || '', data:p.data || '', importo:p.importo || '', carico:p.carico || 'mio', spesaDi:p.spesaDi || '', note:p.note || '', ruolo:p.ruolo || '' });
  _pp = null; disegna();
};
window._acqPfAnnulla = function(){ _pf = null; disegna(); };
window._acqPfSet = function(k, v, zitto){ if(!_pf) return; _pf[k] = v; if(!zitto) disegna(); };
window._acqPfSalva = function(){
  var f = _pf; if(!f) return;
  var imp = numero(f.importo);
  if(!f.tipo){ avviso('Scegli il lavoro'); return; }
  if(!f.profId){ avviso('Scegli il professionista dalla Rubrica'); return; }
  if(!imp){ avviso('Scrivi il costo'); return; }
  var p = f.id ? prestTrova(f.id) : null, nuovo = !p;
  if(nuovo){ p = { id:nuovoId().replace('acq_', 'pst_'), creato:oggi() }; prestLista().push(p); }
  var prof = contatto(f.profId);
  p.tipo = f.tipo; p.profId = f.profId; p.profNome = prof ? (prof.nome || '') : (p.profNome || '');
  p.immUuid = f.immUuid || ''; p.acqId = (f.acqId && trova(f.acqId) && trova(f.acqId).immUuid === p.immUuid) ? f.acqId : '';
  if(!p.acqId && p.immUuid){ var a0 = vivi().find(function(x){ return x.immUuid === p.immUuid && x.stato !== 'chiusa'; }); if(a0) p.acqId = a0.id; }
  p.data = f.data || oggi(); p.importo = imp; p.carico = f.carico || 'mio'; p.note = f.note || ''; p.ruolo = f.ruolo || p.ruolo || '';
  if(p.carico !== 'proprietario'){
    p.spesaDi = f.spesaDi || p.spesaDi || '';
    if(!p.spesaDi){ try{ if(typeof window._spesaDiValore === 'function') p.spesaDi = window._spesaDiValore(null); }catch(e){} }
  }
  if(p.carico === 'proprietario'){ spesaTogli(p); p.pagato = ''; p.rimborsato = ''; p.modPag = ''; }
  else if(p.carico !== 'anticipo') p.rimborsato = '';
  if(p.pagato) spesaScrivi(p);
  p._modificata = Date.now();
  var a = p.acqId ? trova(p.acqId) : null;
  if(a) diario(a, (nuovo ? 'Lavoro registrato: ' : 'Lavoro modificato: ') + p.tipo + ' — ' + profNome(p) + ', ' + euro(p.importo));
  _pf = null; salva(); disegna();
  avviso(nuovo ? 'Lavoro registrato' : 'Lavoro aggiornato');
};
window._acqPropRegistra = function(acqId, ruolo){
  var x = proposte(acqId).find(function(z){ return z.ruolo === ruolo; }); if(!x) return;
  _pf = pfDa(x.a, { tipo:x.tipo, profId:x.profId, data:x.data, ruolo:ruolo, carico:(ruolo === 'foto' ? 'mio' : 'anticipo') });
  _pp = null;
  disegna();
};
window._acqPropNo = function(acqId, ruolo){
  var a = trova(acqId); if(!a) return;
  if(!a.prestNo || typeof a.prestNo !== 'object') a.prestNo = {};
  a.prestNo[ruolo] = true;
  diario(a, 'Nessun costo da registrare per ' + (ruolo === 'foto' ? 'il servizio fotografico' : 'il tecnico'));
  salva(); disegna();
};
window._acqPpApri = function(id, cosa){ _pp = { id:id, cosa:cosa, data:oggi(), modPag:'Bonifico Bancario' }; disegna(); };
window._acqPpSet = function(k, v){ if(_pp) _pp[k] = v; };
window._acqPpChiudi = function(){ _pp = null; disegna(); };
window._acqPpConferma = function(){
  var q = _pp, p = q && prestTrova(q.id); if(!p) return;
  if(!dataOk(q.data)){ avviso('Scegli la data'); return; }
  if(q.cosa === 'pagato'){ p.pagato = q.data; p.modPag = q.modPag || ''; }
  else { p.rimborsato = q.data; if(q.modPag) p.modRimb = q.modPag; }
  spesaScrivi(p);
  if(q.cosa === 'rimborsato'){ var s = spesaDi(p); if(s && q.modPag) s.modPag = q.modPag; }
  p._modificata = Date.now();
  var a = p.acqId ? trova(p.acqId) : null;
  if(a) diario(a, (q.cosa === 'pagato' ? 'Pagato ' : 'Restituito dal proprietario: ') + p.tipo + ' — ' + profNome(p) + ', ' + euro(p.importo));
  _pp = null; salva(); disegna();
  avviso(q.cosa === 'pagato' ? (p.carico === 'anticipo' ? 'Pagato: in Bilancio fra gli anticipi da recuperare' : 'Pagato: spesa scritta in Altre Entrate/Spese') : 'Restituito: l\'anticipo risulta rientrato');
};
window._acqPrestAnnullaPag = function(id){
  var p = prestTrova(id); if(!p) return;
  var fai = function(){ spesaTogli(p); p.pagato = ''; p.rimborsato = ''; p.modPag = ''; p._modificata = Date.now(); salva(); disegna(); };
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm('Il lavoro torna "da pagare" e la spesa viene tolta da Altre Entrate/Spese. Procedo?', '', 'Annulla pagamento').then(function(ok){ if(ok) fai(); });
  else fai();
};
window._acqPrestAnnullaRimb = function(id){ var p = prestTrova(id); if(!p) return; p.rimborsato = ''; spesaScrivi(p); p._modificata = Date.now(); salva(); disegna(); };
window._acqPrestRiscrivi = function(id){ var p = prestTrova(id); if(!p) return; p.spesaId = ''; spesaScrivi(p); salva(); disegna(); avviso('Spesa riscritta in Altre Entrate/Spese'); };
window._acqPrestElimina = function(id){
  var p = prestTrova(id); if(!p) return;
  var fai = function(){
    spesaTogli(p); p.eliminato = true; p._modificata = Date.now();
    var a = p.acqId ? trova(p.acqId) : null; if(a) diario(a, 'Lavoro eliminato: ' + p.tipo + ' — ' + profNome(p));
    if(_pf && _pf.id === id) _pf = null;
    salva(); disegna();
  };
  var msg = 'Elimino "' + (p.tipo || 'lavoro') + ' — ' + profNome(p) + '"' + (p.spesaId ? ' e la sua spesa in Altre Entrate/Spese' : '') + '?';
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm(msg, '', 'Elimina lavoro').then(function(ok){ if(ok) fai(); });
  else fai();
};
window._acqRf = function(k, v){ _rf[k] = v; disegna(); };
/* stampa: l'elenco filtrato, per mandarlo al professionista o al commercialista */
window._acqPrestStampa = function(){
  var L = filtrate(), tot = 0;
  var per = { mese:'questo mese', mesescorso:'il mese scorso', anno:'quest\'anno', annoscorso:'l\'anno scorso', tutto:'tutti i periodi' }[_rf.periodo] || '';
  var prof = _rf.prof ? contatto(_rf.prof) : null;
  var righe = L.map(function(p){
    tot += Number(p.importo) || 0; var im = prestImm(p);
    return '<tr><td>' + esc(it(p.data)) + '</td><td>' + esc(p.tipo || '') + '</td><td>' + esc(profNome(p)) + '</td><td>' + esc(im ? etichetta(im) : '') + '</td><td>' + esc(CARICO[p.carico] ? CARICO[p.carico].breve : '') + '</td><td>' + esc(PST_ET[prestStato(p)]) + '</td><td style="text-align:right">' + esc(euro(p.importo)) + '</td></tr>';
  }).join('');
  var html = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Prestazioni professionisti</title><style>'
    + 'body{font-family:Inter,Arial,sans-serif;color:#0F172A;margin:28px}h1{font-size:20px;margin:0 0 4px}p{color:#475569;margin:0 0 16px;font-size:13px}'
    + 'table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;border-bottom:2px solid #0F172A;padding:6px}td{border-bottom:1px solid #E2E8F0;padding:6px}'
    + 'tfoot td{font-weight:800;border-top:2px solid #0F172A}@page{size:A4 landscape;margin:12mm}</style></head><body>'
    + '<h1>Prestazioni dei professionisti</h1><p>' + esc(agenzia()) + ' · ' + esc(per) + (prof ? ' · ' + esc(bello(prof.nome || '')) : '') + ' · stampato il ' + esc(it(oggi())) + '</p>'
    + '<table><thead><tr><th>Data</th><th>Lavoro</th><th>Professionista</th><th>Immobile</th><th>A carico</th><th>Stato</th><th style="text-align:right">Costo</th></tr></thead><tbody>' + righe + '</tbody>'
    + '<tfoot><tr><td colspan="6">Totale · ' + L.length + (L.length === 1 ? ' lavoro' : ' lavori') + '</td><td style="text-align:right">' + esc(euro(tot)) + '</td></tr></tfoot></table>'
    + '<script>setTimeout(function(){window.print()},300)<\/script></body></html>';
  var w = window.open('', '_blank'); if(!w){ avviso('Il browser ha bloccato la finestra di stampa'); return; }
  w.document.open(); w.document.write(html); w.document.close();
};


window.acquisizioniPerClaude = function(){
  try{
    return vivi().filter(function(a){ return a.stato !== 'chiusa'; }).map(function(a){
      var im = immDi(a), p = propDi(im), s = im ? stati(a, im) : null;
      return { id:a.id, n:im ? etichetta(im) : (a.immEt || 'Immobile'), ref:(im && im.ref) || '', avv:a.creato || '',
        prop_n:p.nome || '', prop_t:p.tel || '', st:s, foto:(norma(a).tappe.foto.data || ''),
        att:im ? attese(a, im).map(function(w){ return { k:w.k, d:w.d, s:w.s, x:w.x }; }) : [] };
    });
  }catch(e){ console.warn('[Acquisizioni] riepilogo KO:', e); return null; }
};
window.acquisizioniFerme = function(){
  return vivi().filter(function(a){ return a.stato !== 'chiusa'; }).map(function(a){ var im = immDi(a); return { id:a.id, n:im ? etichetta(im) : a.immEt, ferme:ferme(a, im) }; })
    .filter(function(x){ return x.ferme.length; });
};

/* Per le prove e per la Console: i conti di un percorso senza aprire niente. */
window.statoAcquisizione = function(id){
  var a = trova(id); if(!a) return null;
  var im = immDi(a);
  return { stati:stati(a, im), proprietario:contaDocs(a, im, 'proprietario'), tecnico:contaDocs(a, im, 'tecnico'), ferme:ferme(a, im) };
};

})();
