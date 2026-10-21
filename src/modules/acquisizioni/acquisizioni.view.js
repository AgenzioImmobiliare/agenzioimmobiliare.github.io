// modules/acquisizioni/acquisizioni.view.js — Percorso di acquisizione
// ----------------------------------------------------------------------------
// [14 ott 2026] INCARICO FIRMATO A MANO (sezione 9): scansione letta con l'AI,
// tabella di conferma, cliente/immobile/percorso aggiornati, scansione
// archiviata su Firebase Storage (a.incaricoFiles). Vista 'importa'.
// [14 ott 2026] REGISTRO PRESTAZIONI (sezione 10): lavori di fotografi e
// tecnici in D.prestazioni, linguetta 'prest' e riquadro nel percorso;
// "Segna pagato" scrive la spesa in Altre Entrate/Spese (D.altriIncassi).
// [14 ott 2026] CARTELLA FOTO SU GOOGLE DRIVE (sezione 11): script Google
// pubblicato come app web, cartella salvata su im.cartellaFoto.
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
  13:'Visura ipotecaria',
  14:'Documenti d\'identità e codice fiscale'   /* [18 ott 2026] voce nuova, anche nella scheda immobile */
};
/* Divisione proposta il 13 ott e confermata da Enzo. L'APE (4) sta da una
   parte o dall'altra a seconda di chi lo porta: vedi apeDi(). */
var DOC_PROP = [0, 6, 7, 8, 9, 10, 14];
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
      + 'Qui trova i documenti già raccolti e può caricare i suoi: {link_tecnico}\n'
      + 'Mi fa sapere tempi e costo? Grazie.\n\n{agente}\n{agenzia}' },
  { id:'foto_fotografo', nome:'Foto: messaggio al fotografo', a:'fotografo',
    std:'Buongiorno {nome}, ho un nuovo servizio fotografico da fissare: {immobile}.\n'
      + 'Data proposta: {data} alle {ora}.\n'
      + 'Le foto può caricarle in questa cartella: {link_cartella}\n'
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
  ['link_cartella', 'la cartella Google Drive dove caricare le foto'],
  ['link_tecnico', 'la pagina dei documenti per il tecnico, con il codice (se il link è attivo)'],
  ['agente', 'il tuo nome'],
  ['agenzia', 'il nome dell\'agenzia']
];
var FACOLTATIVI = ['proprietario', 'catastali', 'link_servizi', 'link_cartella', 'link_tecnico', 'data', 'ora'];

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

var _vista = 'elenco';      /* elenco | nuovo | dettaglio | testi | servizi | importa | leggidoc */
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
  cartella:'<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
  chiave:'<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  giro:  '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>',
  pers:  '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  lista: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
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
  if(!a || !a.immUuid) return null;
  return immPerUuid(a.immUuid);
}
/* [20 ott 2026] SCHEDE "IN VALUTAZIONE" (scelta di Enzo, A): l'immobile di un
   percorso "Prima la valutazione" non sta in D.immobili ma in
   D.immValutazione, una collezione a parte (in _SYNC_KEYS). Così archivio,
   statistiche, "Dall'agenzia", sito, abbinamenti, mappa, immobili fermi,
   Hub e connettore non la vedono, e le posizioni di D.immobili (usate in
   228 punti) non cambiano. Qui dentro la si trova con immDi/immPerUuid,
   quindi scanner, Drive e lettura AI funzionano subito. Alla firma
   dell'incarico passa in archivio (vedi promuovi); se l'incarico non
   arriva resta qui, archiviata. */
function nascoste(){
  if(typeof D === 'undefined' || !D) return [];
  if(!Array.isArray(D.immValutazione)) D.immValutazione = [];
  return D.immValutazione;
}
function eNascosto(im){ return !!(im && im.inValutazione && !im.passatoA); }
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
  ['incarico','grazie','proprietario','tecnico','foto','valutazione'].forEach(function(k){ if(!a.tappe[k] || typeof a.tappe[k] !== 'object') a.tappe[k] = {}; });
  if(!a.nonServe || typeof a.nonServe !== 'object') a.nonServe = {};
  if(!Array.isArray(a.diario)) a.diario = [];
  return a;
}
function diario(a, testo){ norma(a).diario.push({ data:oggi(), ora:new Date().toTimeString().slice(0,5), testo:testo }); }

/* ── 4. STATO DELLE TAPPE (funzioni pure) ───────────────────────────────── */

/* chi porta l'APE: '' = non si sa ancora (lo si chiede al proprietario
   "se ce l'ha", ma non conta per chiudere la tappa), 'proprietario', 'tecnico' */
function apeDi(a){ return (a && (a.ape === 'proprietario' || a.ape === 'tecnico')) ? a.ape : ''; }
function docsDi(a, chi, im){
  var base = (chi === 'tecnico' ? DOC_TEC : DOC_PROP).slice();
  var ape = apeDi(a);
  if(chi === 'tecnico' ? ape === 'tecnico' : ape !== 'tecnico') base.push(APE);
  /* [17 ott 2026] i documenti in più per la provenienza (successione,
     donazione…) li porta il proprietario: chiave 'p:…', spunta in im.docsProv,
     stesso catalogo della scheda immobile (window.provDocs) */
  if(chi === 'proprietario' && im && typeof window.provDi === 'function' && typeof window.provDocs === 'function'){
    try{ var x = window.provDi(im); window.provDocs(x.p, x.m, x.r).forEach(function(d){ base.push('p:' + d.k); }); }catch(e){}
  }
  return base;
}
function eProv(n){ return typeof n === 'string' && n.indexOf('p:') === 0; }
function nomeDoc(n){ return eProv(n) ? (typeof window.provNomeDoc === 'function' ? window.provNomeDoc(n.slice(2)) : n.slice(2)) : DOC_NOMI[n]; }
function argDoc(n){ return eProv(n) ? '\'' + n + '\'' : String(n); }
function raccolto(im, n){
  if(eProv(n)) return !!(im && im.docsProv && im.docsProv[n.slice(2)] === true);
  return !!(im && im.docsChecklist && im.docsChecklist[n] === true);
}
function serve(a, n){ return !(a && a.nonServe && a.nonServe[n]); }
/* L'APE "da chiarire" compare nella lista del proprietario ma non e' obbligatorio */
function obbligatorio(a, n){ return serve(a, n) && !(n === APE && apeDi(a) === ''); }
function contaDocs(a, im, chi){
  var L = docsDi(a, chi, im), tot = 0, ok = 0, mancanti = [];
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
           tecnico:statoDocs(a, im, 'tecnico'), foto:statoFoto(a), valutazione:statoValutazione(a, im) };
}
var TAPPE_ET = { incarico:'Incarico', grazie:'Grazie', proprietario:'Proprietario', tecnico:'Tecnico', foto:'Foto' };

/* ── [20 ott 2026] PERCORSO FLESSIBILE ─────────────────────────────────────
   Scelte di Enzo: i passi li decide lui. All'avvio sceglie un modello
   ("Prima la valutazione", "Prima l'incarico" o Personalizzato) e poi, in
   ogni momento, aggiunge, toglie o sposta un passo. I passi raggruppano le
   tappe di prima:
     valutazione -> una valutazione salvata in Valutazioni per questo immobile
     documenti   -> documenti dal proprietario + dal tecnico (+ archivio)
     incarico    -> incarico + ringraziamento
     foto        -> foto
   L'ordine sta in a.passi (solo le chiavi scelte). Togliere un passo non
   cancella niente: i dati restano in a.tappe e tornano se lo si rimette.
   I percorsi nati prima di oggi non hanno a.passi: valgono "Prima
   l'incarico", cioe' com'erano. Acquisizioni ferme (scelta "dal passo
   precedente"): conta solo il passo in corso, il primo non fatto, e i
   giorni partono da quando e' finito il passo prima (o dall'avvio). */
var PASSI_ET = { valutazione:'Valutazione', documenti:'Documenti', incarico:'Incarico e grazie', foto:'Foto' };
var MODELLI = {
  valutazione:{ nome:'Prima la valutazione', passi:['documenti','valutazione','incarico','foto'] },
  incarico:{ nome:'Prima l\'incarico', passi:['incarico','documenti','foto'] }
};
var PASSO_DI = { valutazione:'valutazione', proprietario:'documenti', tecnico:'documenti', incarico:'incarico', grazie:'incarico', foto:'foto' };
var _modNuovo = 'valutazione';
var _attesaVl = null;       /* timer: si torna da Valutazioni */
function passiDi(a){
  var visti = {}, P = (Array.isArray(a && a.passi) ? a.passi : []).filter(function(k){
    if(!PASSI_ET[k] || visti[k]) return false; visti[k] = 1; return true;
  });
  return P.length ? P : MODELLI.incarico.passi.slice();
}
function haPasso(a, k){ return passiDi(a).indexOf(k) >= 0; }
function unisci(x, y){ return (x === 'fatto' && y === 'fatto') ? 'fatto' : ((x === 'fare' && y === 'fare') ? 'fare' : 'corso'); }
function statoPasso(a, im, k, st){
  st = st || stati(a, im);
  if(k === 'documenti') return unisci(st.proprietario, st.tecnico);
  if(k === 'incarico') return unisci(st.incarico, st.grazie);
  return st[k] || 'fare';
}
function passoCorrente(a, im, st){
  st = st || stati(a, im);
  var P = passiDi(a);
  for(var i = 0; i < P.length; i++) if(statoPasso(a, im, P[i], st) !== 'fatto') return P[i];
  return '';
}
function valutazioniDi(im){
  if(!im || !im.uuid || typeof D === 'undefined' || !D) return [];
  return (Array.isArray(D.valutazioni) ? D.valutazioni : []).filter(function(v){ return v && !v.eliminata && v.immUuid === im.uuid; })
    .sort(function(x, y){ return String(y.data || '').localeCompare(String(x.data || '')); });
}
function statoValutazione(a, im){
  var t = norma(a).tappe.valutazione;
  if(t.fatta || valutazioniDi(im).length) return 'fatto';
  return t.avviata ? 'corso' : 'fare';
}
function piuRecente(){
  return Array.prototype.slice.call(arguments).filter(Boolean).map(function(x){ return String(x).slice(0, 10); }).sort().pop() || '';
}
/* quando e' finito un passo (aaaa-mm-gg, '' se non si sa) */
function fineDi(a, im, k){
  var t = norma(a).tappe;
  if(k === 'valutazione'){ var V = valutazioniDi(im); return piuRecente(t.valutazione.fatta, V.length ? V[0].data : ''); }
  if(k === 'incarico') return piuRecente(t.incarico.firmato, t.grazie.inviato, t.grazie.fatto);
  if(k === 'foto') return t.foto.fatte || '';
  return (a.fine && a.fine.documenti) || piuRecente(t.proprietario.inviato, t.tecnico.inviato);
}
/* i documenti non hanno una data di "fatto": la si annota la prima volta
   che la lista risulta completa (true = c'e' qualcosa da salvare) */
function annotaFine(a, im){
  if(!a || !im || a.stato === 'chiusa') return false;
  var ok = statoPasso(a, im, 'documenti') === 'fatto', f = a.fine;
  if(ok && !(f && f.documenti)){ a.fine = Object.assign({}, f || {}, { documenti:oggi() }); return true; }
  if(!ok && f && f.documenti){ delete f.documenti; return true; }
  return false;
}
function numIt(n){ return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

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
var FERMO = { firma:7, grazie:2, proprietario:7, tecnico:10, fotoFissa:7, fotoFatte:2, valutazione:7 };
/* tappe ancora aperte con data di riferimento (d) e soglia (s).
   [20 ott 2026] Solo quelle del passo in corso (il primo non fatto, nell'ordine
   scelto da Enzo); la partenza e' la fine del passo prima, o l'avvio. */
function attese(a, im){
  var t = norma(a).tappe, out = [], st = stati(a, im), P = passiDi(a), inizio = a.creato || oggi(), k = '';
  for(var i = 0; i < P.length; i++){
    if(statoPasso(a, im, P[i], st) === 'fatto'){ inizio = piuRecente(inizio, fineDi(a, im, P[i])); continue; }
    k = P[i]; break;
  }
  if(!k) return out;
  var dopo = i > 0 ? ' (dopo ' + PASSI_ET[P[i - 1]].toLowerCase() + ')' : '';
  if(k === 'valutazione') out.push({ k:'valutazione', d:inizio, s:FERMO.valutazione, x:'Valutazione non ancora fatta' + dopo });
  if(k === 'incarico'){
    var firmato = t.incarico.firmato;
    if(st.incarico !== 'fatto') out.push({ k:'incarico', d:piuRecente(inizio, t.incarico.preparato), s:FERMO.firma,
      x:t.incarico.preparato ? 'Incarico non ancora firmato (modulo preparato il ' + it(t.incarico.preparato) + ')' : 'Incarico non ancora preparato né firmato' + dopo });
    else if(st.grazie !== 'fatto') out.push({ k:'grazie', d:firmato, s:FERMO.grazie, x:'Proprietario non ancora ringraziato (incarico firmato il ' + it(firmato) + ')' });
  }
  if(k === 'documenti') ['proprietario','tecnico'].forEach(function(chi){
    if(st[chi] === 'fatto') return;
    var c = contaDocs(a, im, chi), inv = t[chi].inviato, tec = chi === 'tecnico' ? tecDi(a) : null;
    var di = chi === 'tecnico' ? 'dal tecnico' + (tec ? ' ' + bello(tec.nome) : '') : 'dal proprietario';
    if(inv) out.push({ k:chi, d:inv, s:FERMO[chi], x:'Documenti ' + di + ' chiesti il ' + it(inv) + ', ne mancano ' + c.mancanti.length });
    else out.push({ k:chi, d:inizio, s:FERMO[chi], x:'Documenti ' + di + ' non ancora chiesti' + (chi === 'tecnico' && !tec ? ' (tecnico non scelto)' : '') + dopo });
  });
  if(k === 'foto'){
    var tf = t.foto;
    if(tf.data) out.push({ k:'foto', d:tf.data, s:FERMO.fotoFatte, x:'Foto del ' + it(tf.data) + ' non segnate come fatte' });
    else out.push({ k:'foto', d:inizio, s:FERMO.fotoFissa, x:'Foto non ancora fissate' + dopo });
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
    var t = nomeDoc(n);
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
    link_cartella: linkCartella(im),
    link_tecnico: (function(){ var l = chi === 'tecnico' && a ? tecLink(a) : null; return tecAttivo(l) ? tecUrl(l) + ' (codice ' + l.codice + ')' : ''; })(),
    agente: agenteNome(),
    agenzia: agenzia()
  };
}
function testoDi(a, im, chi){
  var mod = modello(MSG[chi].tpl), V = valori(a, im, chi), t = riempi(mod, V);
  /* [14 ott 2026] un testo al fotografo corretto prima che esistesse
     {link_cartella}: il link si aggiunge lo stesso, prima della firma */
  if(chi === 'fotografo' && V.link_cartella && mod.indexOf('{link_cartella}') < 0){
    var riga = 'Le foto può caricarle in questa cartella: ' + V.link_cartella;
    var k = t.lastIndexOf('\n\n');
    t = k > 0 ? t.slice(0, k) + '\n' + riga + t.slice(k) : t + '\n\n' + riga;
  }
  return t;
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
    /* [21 ott 2026] procedura guidata della nuova acquisizione */
    + '#acq-wrap .acq-wz-passi{justify-content:flex-start}'
    + '#acq-wrap .acq-wz-scelta button{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-size:0.84rem}'
    + '#acq-wrap .acq-wz-rie{display:flex;flex-wrap:wrap;align-items:center;gap:8px}'
    + '#acq-wrap .acq-wz-rie .sep{display:inline-flex;color:var(--text4)}'
    + '#acq-wrap .acq-wz-modi{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px;margin:0 0 12px}'
    + '#acq-wrap .acq-wz-modo{display:flex;flex-direction:column;align-items:flex-start;gap:5px;text-align:left;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg2);color:var(--text);font-family:inherit;cursor:pointer}'
    + '#acq-wrap .acq-wz-modo .t{display:inline-flex;align-items:center;gap:7px;font-weight:800;font-size:0.9rem}'
    + '#acq-wrap .acq-wz-modo .s{font-size:0.76rem;color:var(--text3);line-height:1.35}'
    + '#acq-wrap .acq-wz-modo:hover{border-color:var(--brand,#EA580C)}'
    + '#acq-wrap .acq-wz-modo.on{border-color:var(--brand,#EA580C);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand,#EA580C) 22%,transparent)}'
    + '#acq-wrap .acq-wz-modo.on .t{color:var(--brand,#EA580C)}'
    + '#acq-wrap .acq-wz-via{border:1px solid var(--border);border-radius:10px;background:var(--bg2);margin:0 0 14px}'
    + '@media(max-width:700px){#acq-wrap .acq-wz-scelta{display:flex;flex-direction:column;width:100%}#acq-wrap .acq-wz-scelta button{border-right:none;border-bottom:1px solid var(--border)}}'
    /* [20 ott 2026] righe dei contatti e delle valutazioni: sul telefono il nome
       prende tutta la riga, etichetta e pulsante vanno sotto */
    + '#acq-wrap .acq-nv-riga{gap:8px;align-items:center}'
    + '@media(max-width:700px){#acq-wrap .acq-nv-riga{flex-wrap:wrap}#acq-wrap .acq-nv-riga>div:first-child{flex:1 1 100%!important}#acq-wrap .acq-nv-riga .gx-btn{margin-left:auto}}'
    /* [14 ott 2026] tabella di conferma dell'incarico letto con l'AI */
    + '#acq-wrap table.acq-imp{width:100%;border-collapse:collapse;font-size:0.84rem}'
    + '#acq-wrap table.acq-imp th{padding:7px 10px;text-align:left;font-size:0.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3);border-bottom:1px solid var(--border)}'
    + '#acq-wrap table.acq-imp td{padding:6px 10px;border-bottom:1px solid var(--border);vertical-align:middle;color:var(--text)}'
    + '#acq-wrap table.acq-imp td.et{font-weight:600;white-space:nowrap}'
    + '#acq-wrap table.acq-imp td:nth-child(3){min-width:180px}'
    /* [14 ott 2026] registro prestazioni: elenco largo, riepilogo stretto */
    + '#acq-wrap .acq-grid-reg{grid-template-columns:minmax(0,2fr) minmax(300px,1fr)}'
    + '@media(max-width:1100px){#acq-wrap .acq-grid-reg{grid-template-columns:1fr}}'
    /* [20 ott 2026] la fila dei passi */
    + '#acq-wrap .acq-passi{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 14px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg2)}'
    + '#acq-wrap .acq-passo{display:inline-flex;align-items:center;gap:7px;font-size:0.82rem;font-weight:700;padding:4px 12px 4px 4px;border:1.5px solid currentColor;border-radius:20px}'
    + '#acq-wrap .acq-passo.cur{box-shadow:0 0 0 3px color-mix(in srgb,currentColor 22%,transparent)}'
    + '#acq-wrap .acq-passi .fr{color:var(--text4);display:inline-flex}'
    /* [21 ott 2026] passi da trascinare, "x" per togliere, "+" per rimettere */
    + '#acq-wrap .acq-passi-mod .acq-passo[data-k]{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;background:var(--bg);position:relative;transition:box-shadow .15s}'
    + '#acq-wrap .acq-passo.trascina{cursor:grabbing;z-index:5;box-shadow:0 8px 22px rgba(0,0,0,.35);transition:none;opacity:.95}'
    + '#acq-wrap .acq-passo.dove-prima::before,#acq-wrap .acq-passo.dove-dopo::after{content:"";position:absolute;top:-4px;bottom:-4px;width:4px;border-radius:2px;background:var(--brand,#EA580C)}'
    + '#acq-wrap .acq-passo.dove-prima::before{left:-8px}'
    + '#acq-wrap .acq-passo.dove-dopo::after{right:-8px}'
    + '#acq-wrap .acq-passo.trascina{background:var(--bg2)!important}'
    + '#acq-wrap .acq-grip{display:inline-flex;color:var(--text4);margin-left:4px;margin-right:-3px}'
    + '#acq-wrap .acq-px{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin:0 -6px 0 2px;border:none;border-radius:50%;background:transparent;color:var(--text3);cursor:pointer;padding:0}'
    + '#acq-wrap .acq-px:hover{background:var(--acq-ko);color:#fff}'
    + '#acq-wrap .acq-passo-via{border-style:dashed!important;color:var(--text3)!important;background:transparent;font-family:inherit;cursor:pointer;padding:4px 12px!important}'
    + '#acq-wrap .acq-passo-via:hover{color:var(--brand,#EA580C)!important}'
    + '#acq-wrap .acq-modsel{display:inline-flex;align-items:center;gap:6px;font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px}'
    + '@media(max-width:700px){#acq-wrap .acq-px{width:24px;height:24px}#acq-wrap .acq-modsel{width:100%}#acq-wrap .acq-modsel select{flex:1}}'
    + '#acq-wrap .acq-doc.acq-on .acq-spunta{background:var(--brand,#EA580C);border-color:var(--brand,#EA580C);color:#fff}'
    + '#acq-wrap .acq-num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:currentColor;flex-shrink:0}'
    + '#acq-wrap .acq-num b{color:#fff;font-size:0.72rem}'
    + 'body.dark-mode #acq-wrap .acq-num b{color:#0F172A}'
    /* il numero della tappa sostituisce il pallino delle colonne gx */
    + '#acq-wrap .gx-head::before{display:none!important}'
    /* [13 ott 2026] Enzo: troppo spazio ai lati. Tutta la larghezza, margine stretto */
    + 'html body #acq-wrap .gx-dentro{max-width:none!important;margin:0!important}'
    + 'html body #acq-wrap .gx-corpo{padding:14px 18px!important}'
    /* icona della testata: cartella con spunta, nel colore del tema */
    + 'html body #acq-wrap .gx-testa::before{background:color-mix(in srgb,var(--brand,#EA580C) 12%,transparent) url("data:image/svg+xml,%3Csvg%20xmlns=\'http://www.w3.org/2000/svg\'%20width=\'24\'%20height=\'24\'%20viewBox=\'0%200%2024%2024\'%20fill=\'none\'%20stroke=\'%23EA580C\'%20stroke-width=\'2\'%20stroke-linecap=\'round\'%20stroke-linejoin=\'round\'%3E%3Cpath%20d=\'M22%2019a2%202%200%2001-2%202H4a2%202%200%2001-2-2V5a2%202%200%20012-2h5l2%203h9a2%202%200%20012%202z\'/%3E%3Cpolyline%20points=\'9%2014%2011%2016%2015%2012\'/%3E%3C/svg%3E") center/20px no-repeat!important}'
    /* [18 ott 2026] scanner dei documenti, a tutto schermo anche sul telefono */
    /* [19 ott 2026] archivio documenti dentro la scheda immobile (fuori da #acq-wrap) */
    + '.acq-sch{--acq-ok:#15803D;--acq-am:#B45309;--acq-no:#64748B;--acq-ko:#B91C1C;--acq-blu:#1D4ED8}'
    + 'body.dark-mode .acq-sch{--acq-ok:#4ADE80;--acq-am:#FBBF24;--acq-no:#94A3B8;--acq-ko:#F87171;--acq-blu:#93C5FD}'
    + '.acq-sch .acq-sch-conto{padding:9px 16px;font-size:0.68rem;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--text3);border-bottom:1px solid var(--border)}'
    + '.acq-sch .acq-azioni{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border)}'
    + '.acq-sch .acq-azioni .nota{font-size:0.76rem;color:var(--text3)}'
    + '.acq-sch .acq-doc{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:8px 16px;border-bottom:1px solid var(--border)}'
    + '.acq-sch .acq-doc:last-child{border-bottom:none}'
    + '.acq-sch .acq-doc .n{flex:1;min-width:160px;font-size:0.84rem;color:var(--text);word-break:break-word}'
    + '.acq-sch .gx-nota{font-size:0.78rem;color:var(--text3);line-height:1.6}'
    + '.acq-sch .gx-btn{display:inline-flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--border);border-radius:8px;padding:5px 10px;font-family:inherit;font-size:0.78rem;font-weight:600;color:var(--text2);cursor:pointer;white-space:nowrap;text-decoration:none;line-height:1.3}'
    + '.acq-sch .gx-btn:hover{border-color:var(--text3);color:var(--text)}'
    + '.acq-sch .gx-btn.pieno{background:var(--brand,#EA580C);border-color:var(--brand,#EA580C);color:#fff}'
    + '.acq-sch .gx-btn[disabled]{opacity:.45;cursor:not-allowed}'
    + '@media(max-width:700px){.acq-sch .acq-azioni .gx-btn{flex:1 1 auto;justify-content:center;padding:9px 10px;font-size:0.84rem}}'
    + '#acq-sc{position:fixed;inset:0;z-index:100000;background:#0B1220;color:#E2E8F0;display:flex;flex-direction:column;font-family:inherit}'
    + '#acq-sc .sc-testa{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #1E293B;font-size:1rem}'
    + '#acq-sc .sc-corpo{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:14px;max-width:900px;width:100%;box-sizing:border-box;margin:0 auto}'
    + '#acq-sc .sc-lab{display:flex;flex-direction:column;gap:6px;font-size:0.72rem;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.4px}'
    + '#acq-sc .sc-in{padding:10px 12px;border:1px solid #334155;border-radius:10px;background:#111A2E;color:#F1F5F9;font-family:inherit;font-size:0.95rem;text-transform:none;letter-spacing:0;font-weight:500}'
    + '#acq-sc .sc-nota{font-size:0.8rem;color:#94A3B8;line-height:1.5}'
    + '#acq-sc .sc-nota b{color:#E2E8F0;word-break:break-word}'
    + '#acq-sc .sc-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border-radius:10px;border:1px solid #334155;background:#111A2E;color:#E2E8F0;font-family:inherit;font-size:0.88rem;font-weight:600;cursor:pointer}'
    + '#acq-sc .sc-btn.pieno{background:var(--brand,#EA580C);border-color:var(--brand,#EA580C);color:#fff}'
    + '#acq-sc .sc-btn[disabled]{opacity:.45;cursor:not-allowed}'
    + '#acq-sc .sc-azioni{display:flex;flex-wrap:wrap;gap:10px;align-items:center}'
    + '#acq-sc .sc-pagine{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}'
    + '#acq-sc .sc-pag{position:relative;aspect-ratio:0.71;border-radius:10px;overflow:hidden;background:#111A2E;border:1px solid #334155}'
    + '#acq-sc .sc-pag img{width:100%;height:100%;object-fit:contain;background:#fff}'
    + '#acq-sc .sc-num{position:absolute;left:6px;bottom:6px;background:rgba(15,23,42,.85);color:#fff;font-size:0.72rem;font-weight:700;border-radius:20px;padding:2px 8px}'
    + '#acq-sc .sc-via{position:absolute;right:6px;top:6px;width:28px;height:28px;border-radius:50%;border:none;background:rgba(15,23,42,.85);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}'
    + '#acq-sc .sc-agg{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:2px dashed var(--brand,#EA580C);color:#F1F5F9;cursor:pointer;font-family:inherit;font-size:0.84rem;font-weight:600}'
    + '#acq-sc .sc-tela{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:12px;overflow:hidden}'
    + '#acq-sc .sc-tela canvas{touch-action:none;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,.5)}'
    + '#acq-sc .sc-barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #1E293B}'
    + '#acq-sc .sc-scelta{display:inline-flex;border:1px solid #334155;border-radius:10px;overflow:hidden}'
    + '#acq-sc .sc-scelta button{background:#111A2E;color:#CBD5E1;border:none;border-right:1px solid #334155;padding:9px 11px;font-family:inherit;font-size:0.82rem;font-weight:600;cursor:pointer}'
    + '#acq-sc .sc-scelta button:last-child{border-right:none}'
    + '#acq-sc .sc-scelta button.on{background:var(--brand,#EA580C);color:#fff}'
    + '@media(max-width:560px){#acq-sc .sc-barra .sc-btn{padding:9px 10px;font-size:0.82rem}#acq-sc .sc-pagine{grid-template-columns:repeat(2,1fr)}}';
  document.head.appendChild(st);
}

/* ── 7. DISEGNO ─────────────────────────────────────────────────────────── */

function pill(s, testo){
  return '<span class="acq-pill" style="color:' + stCol(s) + '"><i></i>' + esc(testo || ST_ET[s]) + '</span>';
}

function disegnaElenco(){
  var V = vivi(), aperte = V.filter(function(a){ return a.stato !== 'chiusa'; }), chiuse = V.filter(function(a){ return a.stato === 'chiusa'; });
  var c = C();
  var n = { valutazione:0, incarico:0, grazie:0, proprietario:0, tecnico:0, foto:0 }, nFerme = 0, daSalvare = false;
  aperte.forEach(function(a){
    var s = stati(a, immDi(a));
    if(annotaFine(a, immDi(a))) daSalvare = true;
    if(ferme(a, immDi(a)).length) nFerme++;
    /* [20 ott 2026] si contano solo i passi che il percorso ha */
    Object.keys(n).forEach(function(k){ if(haPasso(a, PASSO_DI[k]) && s[k] !== 'fatto') n[k]++; });
  });
  if(daSalvare) setTimeout(salva, 0);
  var ling = window.gxLinguette([['aperte','In corso',aperte.length,'#334155'],['chiuse','Chiuse',chiuse.length,'#334155'],['prest','Prestazioni',prestVive().length,'var(--brand,#EA580C)']], _tab, '_acqTab');
  var h = window.gxTesta('Acquisizioni', '', 'dalla valutazione alla pubblicazione, nell\'ordine che scegli tu');
  h += '<div class="acq-barra">' + ling + '<div style="flex:1"></div>'
    + '<button class="gx-btn" onclick="_acqServizi()">' + ico(I.stella) + ' Presentazione servizi</button>'
    + '<button class="gx-btn" onclick="_acqTesti()">' + ico(I.matita) + ' Testi dei messaggi</button>'
    + '<button class="gx-btn" onclick="_acqImpAvvia()" title="Hai un incarico già firmato su carta: l\'AI legge la scansione e compila cliente, immobile e percorso">' + ico(I.firma) + ' Incarico firmato a mano</button>'
    + '<button class="gx-btn pieno" onclick="_acqNuovo()" title="Avvia un percorso: scegli tu i passi (valutazione, documenti, incarico, foto) e l\'ordine">' + ico(I.piu) + ' Nuova acquisizione</button></div>';
  /* [14 ott 2026] linguetta Prestazioni: il registro dei professionisti */
  if(_tab === 'prest') return h + disegnaRegistro();
  h += '<div class="gx-cards acq-cards">'
    + window.gxCard('In corso', aperte.length, 'percorsi aperti', 'var(--brand,#EA580C)')
    + window.gxCard('Valutazione', n.valutazione, 'da fare', n.valutazione ? c.am : c.ok)
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
      + '<div class="acq-tappe">' + passiDi(a).map(function(k, i){ return pill(statoPasso(a, im, k, s), (i + 1) + ' · ' + PASSI_ET[k]); }).join('') + '</div>'
      + '</div>';
  }).join('');
  if(!righe) righe = '<div class="gx-vuoto">' + (_tab === 'chiuse' ? 'Nessun percorso chiuso.' : 'Nessuna acquisizione in corso. Premi "Nuova acquisizione" per iniziare.') + '</div>';
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

/* ── [21 ott 2026] NUOVA ACQUISIZIONE: PROCEDURA GUIDATA IN 3 PASSI ───────
   Scelte di Enzo: si parte SEMPRE dal cliente.
     1 · Proprietario: nuovo cliente, cliente in archivio o contatto della
         pipeline commerciale (acquisizioni).
     2 · Immobile: uno dei suoi in archivio, uno qualsiasi cercandolo, o
         "non ancora in archivio" (scheda in valutazione, nascosta fino
         all'incarico: vedi nascoste()).
     3 · Come procedi: Prima la valutazione, Prima l'incarico,
         Personalizzato, incarico già firmato su carta (lettura AI), oppure
         una delle SUE valutazioni già fatte.
   Il nuovo cliente va subito in archivio Clienti (venditore) e nella
   pipeline acquisizioni; un cliente in archivio senza contatto nella
   pipeline lo riceve da solo. Niente si scrive finché non si preme "Avvia":
   tornare indietro o chiudere non lascia clienti a metà.
   L'Indietro in alto torna al passo prima (vedi indietro()). */
var _wz = null;
function wzNuovo(){ return { passo:1, chi:'nuovo', cerca:'', cliUuid:'', dealId:'', nc:{ nome:'', tel:'', email:'', fase:'appuntamento-fissato' }, imm:'', cercaImm:'', ni:null }; }
function wz(){ if(!_wz) _wz = wzNuovo(); return _wz; }
var FASI_NV = [['nuovo-contatto','Nuovo contatto','no'],['da-contattare','Da contattare','no'],['contattato','Contattato','blu'],
  ['appuntamento-fissato','Appuntamento fissato','am'],['valutazione-fatta','Valutazione fatta','ok'],['in-attesa','In attesa','am'],
  ['incarico-preso','Incarico preso','ok'],['perso','Perso','ko']];
function faseNv(k){ for(var i = 0; i < FASI_NV.length; i++) if(FASI_NV[i][0] === k) return FASI_NV[i]; return [k, k || 'senza fase', 'no']; }
function eurNv(n){ n = Math.round(Number(n) || 0); return n ? '€ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''; }
function pillNv(k){ var f = faseNv(k), c = C(); return '<span class="acq-pill" style="color:' + c[f[2]] + '"><i></i>' + esc(f[1]) + '</span>'; }
var ORDINE_FASI = ['nuovo-contatto','da-contattare','contattato','appuntamento-fissato','valutazione-fatta','in-attesa','incarico-preso'];
function dealDi(id){ return id ? ((Array.isArray(D.pipelineDeals) ? D.pipelineDeals : []).find(function(d){ return d && d.id === id; }) || null) : null; }
/* sposta il contatto della pipeline SOLO in avanti (mai indietro da solo); "perso" vale sempre */
function faseDeal(dl, fase){
  if(!dl || !fase || dl.fase === fase) return false;
  if(fase !== 'perso' && ORDINE_FASI.indexOf(dl.fase) > ORDINE_FASI.indexOf(fase) && dl.fase !== 'perso') return false;
  dl.fase = fase;
  if(!Array.isArray(dl.fasi)) dl.fasi = [];
  dl.fasi.push({ fase:fase, data:oggi() });
  dl._modificata = Date.now();
  return true;
}
function tipoDaDeal(t){ return t === 'Box / Garage' ? 'Box/Garage' : (t || ''); }
function soloCifre(t){ return String(t || '').replace(/\D/g, '').slice(-9); }
function dealAperto(d){ return d && !d.eliminato && d.fase !== 'incarico-preso' && d.fase !== 'perso'; }
function clientiVivi(){ return (Array.isArray(D.clienti) ? D.clienti : []).filter(function(c){ return c && !c.eliminato && !c.eliminata; }); }
/* lo stesso proprietario: stesso uuid, stesso telefono o stesso nome (in qualsiasi ordine) */
function stessoProprietario(nome, tel, x, xNome, xTel){
  var t = soloCifre(tel), xt = soloCifre(xTel);
  if(t.length >= 6 && xt.length >= 6 && t === xt) return true;
  var k = nomeChiave(nome); return !!(k && nomeChiave(xNome) === k);
}
/* il proprietario scelto, anche se non è ancora salvato: { nome, tel, email, cli, dl } */
function wzProp(){
  var W = wz(), cli = cliPerUuid(W.cliUuid), dl = dealDi(W.dealId);
  if(cli) return { nome:cli.nome || '', tel:cli.tel || cli.telefono || '', email:cli.email || '', cli:cli, dl:dl };
  if(dl) return { nome:dl.titolo || dl.cliente || '', tel:dl.telefono || '', email:dl.email || '', cli:null, dl:dl };
  return { nome:W.nc.nome, tel:W.nc.tel, email:W.nc.email, cli:null, dl:null };
}
function wzCliPerDeal(dl){
  if(!dl) return null;
  if(dl.clienteUuid){ var c0 = cliPerUuid(dl.clienteUuid); if(c0) return c0; }
  return clientiVivi().find(function(c){ return stessoProprietario(dl.titolo || dl.cliente, dl.telefono, c, c.nome, c.tel || c.telefono); }) || null;
}
function wzDealPerCli(cli){
  if(!cli) return null;
  var L = (Array.isArray(D.pipelineDeals) ? D.pipelineDeals : []).filter(dealAperto);
  return L.find(function(d){ return d.clienteUuid === cli.uuid; })
    || L.find(function(d){ return !d.clienteUuid && stessoProprietario(cli.nome, cli.tel || cli.telefono, d, d.titolo || d.cliente, d.telefono); }) || null;
}

/* ── disegno ── */
function wzTesta(){
  var W = wz(), c = C();
  var P = [['Proprietario', 1], ['Immobile', 2], ['Come procedi', 3]];
  return '<div class="acq-passi acq-wz-passi">' + P.map(function(x, i){
    var st = W.passo > x[1] ? 'fatto' : (W.passo === x[1] ? 'corso' : 'fare');
    var col = st === 'fatto' ? c.ok : (st === 'corso' ? 'var(--brand,#EA580C)' : c.no);
    return (i ? '<span class="fr">' + ico('<polyline points="9 18 15 12 9 6"/>', 14) + '</span>' : '')
      + '<span class="acq-passo' + (st === 'corso' ? ' cur' : '') + '" style="color:' + col + '"><span class="acq-num"><b>' + (st === 'fatto' ? '&#10003;' : x[1]) + '</b></span>' + x[0] + '</span>';
  }).join('') + '</div>';
}
function wzRiepilogo(){
  var W = wz(), p = wzProp(), im = W.imm ? immPerUuid(W.imm) : null;
  var pz = [];
  pz.push('<b>' + esc(bello(p.nome) || 'Proprietario') + '</b>' + (p.tel ? ' · ' + esc(p.tel) : '')
    + (p.cli ? ' · cliente in archivio' : (W.chi === 'nuovo' ? ' · nuovo cliente' : ' · dalla pipeline')) + (p.dl ? ' ' + pillNv(p.dl.fase) : ''));
  if(W.passo >= 3) pz.push(im ? esc(etichetta(im)) + (eNascosto(im) ? ' · scheda in valutazione' : ' · in archivio')
    : esc([W.ni && W.ni.indirizzo, W.ni && W.ni.comune].filter(Boolean).join(', ') || 'immobile nuovo') + ' · non ancora in archivio');
  return '<div class="gx-info acq-wz-rie">' + pz.join('<span class="sep">' + ico('<polyline points="9 18 15 12 9 6"/>', 13) + '</span>') + '</div>';
}
function disegnaNuovo(){
  var W = wz();
  var h = window.gxTesta('Nuova acquisizione', '', 'si parte dal proprietario');
  h += wzTesta();
  if(W.passo >= 2) h += wzRiepilogo();
  if(W.passo === 1) h += wzPasso1();
  else if(W.passo === 2) h += wzPasso2();
  else h += wzPasso3();
  return h;
}
/* ── PASSO 1 · PROPRIETARIO ── */
function wzPasso1(){
  var W = wz();
  var S = [['nuovo', 'Nuovo cliente', I.piu], ['archivio', 'Cliente in archivio', I.pers], ['pipeline', 'Contatto nella pipeline', I.lista]];
  var h = '<div class="acq-barra" style="margin-top:0"><div class="acq-scelta acq-wz-scelta">'
    + S.map(function(x){ return '<button class="' + (W.chi === x[0] ? 'on' : '') + '" onclick="_acqWzChi(\'' + x[0] + '\')">' + ico(x[2]) + ' ' + x[1] + '</button>'; }).join('')
    + '</div></div>';
  if(W.chi === 'nuovo') return h + wzNuovoCliente();
  var cerca = '<div class="acq-azioni"><span style="color:var(--text3);display:inline-flex">' + ico(I.cerca) + '</span>'
    + '<input id="acq-wz-cerca" class="acq-in" style="flex:1;min-width:180px" placeholder="Cerca per nome, telefono' + (W.chi === 'pipeline' ? ', indirizzo o comune' : ' o email') + '" value="' + esc(W.cerca) + '" oninput="_acqWzCerca(this.value)"></div>';
  if(W.chi === 'archivio') return h + window.gxCol('Clienti in archivio', 'scegli il proprietario', C().blu, cerca + '<div id="acq-wz-righe">' + wzRigheClienti() + '</div>');
  return h + window.gxCol('Contatti della pipeline acquisizioni', 'ancora aperti (né incarico preso né perso)', C().blu, cerca + '<div id="acq-wz-righe">' + wzRigheDeals() + '</div>');
}
function wzNuovoCliente(){
  var W = wz(), n = W.nc;
  var campo = function(et, k, ph, extra){ return '<label style="flex:1 1 220px">' + et + '<input id="acq-wz-' + k + '" class="acq-in" value="' + esc(n[k] || '') + '" placeholder="' + ph + '"' + (extra || '') + ' oninput="_acqWzNc(\'' + k + '\',this.value)"></label>'; };
  var fasi = FASI_NV.filter(function(f){ return ['da-contattare','contattato','appuntamento-fissato'].indexOf(f[0]) >= 0; });
  var form = '<div class="acq-campi">'
    + campo('Nome e cognome', 'nome', 'es. MARIO ROSSI')
    + campo('Telefono', 'tel', 'es. 333 1234567', ' inputmode="tel"')
    + campo('Email', 'email', 'facoltativa', ' inputmode="email"')
    + '<label style="flex:1 1 220px">Fase nella pipeline<select class="acq-in" onchange="_acqWzNc(\'fase\',this.value)" title="Dove compare il contatto in Agenda &amp; Pipeline">'
    + fasi.map(function(f){ return '<option value="' + f[0] + '"' + (n.fase === f[0] ? ' selected' : '') + '>' + esc(f[1]) + '</option>'; }).join('')
    + '</select></label></div>'
    + '<div class="acq-azioni"><button class="gx-btn pieno" onclick="_acqWzAvanti1()">Avanti ' + ico('<polyline points="9 18 15 12 9 6"/>') + '</button>'
    + '<span class="nota">Quando avvii il percorso diventa cliente in archivio (venditore) e contatto nella pipeline acquisizioni. Se è già in archivio te lo dico io.</span></div>';
  return window.gxCol('Nuovo cliente', 'il proprietario non è ancora nel gestionale', C().am, form);
}
function wzRigheClienti(){
  var W = wz(), q = W.cerca.trim().toLowerCase(), qn = soloCifre(q);
  var L = clientiVivi().filter(function(c){
    if(!q) return true;
    if(qn.length >= 4 && soloCifre(c.tel || c.telefono).indexOf(qn) >= 0) return true;
    return [c.nome, c.tel, c.telefono, c.email, c.citta].join(' ').toLowerCase().indexOf(q) >= 0;
  }).slice().reverse();
  var tot = L.length;
  var r = L.slice(0, 40).map(function(c){
    var nImm = (D.immobili || []).filter(function(x){ return x && x.clienteUuid === c.uuid; }).length;
    var sub = [c.tel || c.telefono, c.email, c.tipo, nImm ? nImm + (nImm === 1 ? ' immobile' : ' immobili') : ''].filter(Boolean).join(' · ');
    var dl = wzDealPerCli(c);
    return '<div class="gx-riga acq-riga acq-nv-riga" onclick="_acqWzCli(\'' + jsq(c.uuid) + '\')">'
      + '<div style="flex:1;min-width:0"><div class="tt">' + esc(bello(c.nome || 'Senza nome')) + '</div><div class="sub">' + esc(sub || 'nessun dato in più') + '</div></div>'
      + (dl ? pillNv(dl.fase) : '<span class="acq-pill" style="color:' + C().no + '" title="Avviando il percorso il contatto nella pipeline si crea da solo"><i></i>non in pipeline</span>')
      + '<span class="gx-btn">Scegli</span></div>';
  }).join('');
  if(!r) r = '<div class="gx-vuoto">' + (q ? 'Nessun cliente corrisponde alla ricerca.' : 'Nessun cliente in archivio.') + '</div>';
  if(tot > 40) r += '<div class="gx-vuoto">Ne mostro 40 su ' + tot + ': usa la ricerca.</div>';
  return r;
}
function wzRigheDeals(){
  var W = wz(), q = W.cerca.trim().toLowerCase(), aperti = {};
  vivi().forEach(function(a){ if(a.dealId && a.stato !== 'chiusa') aperti[a.dealId] = 1; });
  var L = (Array.isArray(D.pipelineDeals) ? D.pipelineDeals : []).filter(function(d){
    if(!dealAperto(d) || aperti[d.id]) return false;
    if(!q) return true;
    return [d.titolo, d.cliente, d.telefono, d.indirizzo, d.comune, d.immobile].join(' ').toLowerCase().indexOf(q) >= 0;
  }).sort(function(x, y){ return String(y.dataContatto || y.data || '').localeCompare(String(x.dataContatto || x.data || '')); });
  var r = L.slice(0, 40).map(function(d){
    var sub = [d.telefono, d.indirizzo, d.comune, d.tipoImm].filter(Boolean).join(' · ');
    return '<div class="gx-riga acq-riga acq-nv-riga" onclick="_acqWzDeal(\'' + jsq(d.id) + '\')">'
      + '<div style="flex:1;min-width:0"><div class="tt">' + esc(bello(d.titolo || d.cliente || 'Senza nome')) + '</div><div class="sub">' + esc(sub || 'nessun dato in più') + '</div></div>'
      + pillNv(d.fase) + '<span class="gx-btn">Scegli</span></div>';
  }).join('');
  return r || '<div class="gx-vuoto">' + (q ? 'Nessun contatto corrisponde alla ricerca.' : 'Nessun contatto aperto nella pipeline acquisizioni.') + '</div>';
}
/* ── PASSO 2 · IMMOBILE ── */
function wzSuoi(){
  var W = wz(), p = wzProp(), occupati = {};
  vivi().forEach(function(a){ if(a.stato !== 'chiusa' && a.immUuid) occupati[a.immUuid] = 1; });
  var arch = immScegliibili().filter(function(im){
    if(p.cli && im.clienteUuid === p.cli.uuid) return true;
    return !im.clienteUuid && stessoProprietario(p.nome, p.tel, im, im.contatto, im.telefono || im.tel);
  });
  var nasc = nascoste().filter(function(im){
    if(!im || im.passatoA || occupati[im.uuid]) return false;
    return (p.cli && im.clienteUuid === p.cli.uuid) || (p.dl && im.dealId === p.dl.id);
  });
  return nasc.concat(arch);
}
function wzRigaImm(im){
  var sub = [im.tipo, im.mq ? im.mq + ' m²' : '', im.prezzo ? eurNv(numero(im.prezzo)) : ''].filter(Boolean).join(' · ');
  return '<div class="gx-riga acq-riga acq-nv-riga" onclick="_acqWzImm(\'' + jsq(im.uuid) + '\')">'
    + '<div style="flex:1;min-width:0"><div class="tt">' + esc(etichetta(im)) + '</div><div class="sub">' + esc(sub || 'nessun dato in più') + '</div></div>'
    + (eNascosto(im) ? '<span class="acq-pill" style="color:' + C().am + '"><i></i>' + (im.archiviata ? 'in valutazione · archiviata' : 'in valutazione') + '</span>' : '')
    + '<span class="gx-btn">Scegli</span></div>';
}
function wzPasso2(){
  var W = wz(), p = wzProp(), c = C();
  if(!W.ni){
    var dl = p.dl;
    W.ni = { indirizzo:(dl && dl.indirizzo) || '', comune:(dl && dl.comune) || '', tipo:tipoDaDeal(dl && dl.tipoImm) || 'Appartamento' };
  }
  var suoi = wzSuoi();
  var h = '<div class="acq-grid">';
  h += window.gxCol('Immobili di ' + (bello(p.nome) || 'questo proprietario'), suoi.length ? 'in archivio o già in valutazione' : 'nessuno collegato a lui', c.blu,
    suoi.map(wzRigaImm).join('') || '<div class="gx-vuoto">Nessun immobile collegato a questo proprietario. Usa "Non ancora in archivio" oppure cercalo qui sotto.</div>');
  var T = ['Appartamento', 'Villa / Indipendente', 'Rustico / Casale', 'Terreno', 'Locale commerciale', 'Box/Garage', 'Altro'];
  if(T.indexOf(W.ni.tipo) < 0) T.unshift(W.ni.tipo);
  var form = '<div class="acq-campi">'
    + '<label style="flex:1 1 220px">Indirizzo<input class="acq-in" value="' + esc(W.ni.indirizzo) + '" placeholder="via e numero" oninput="_acqWzNi(\'indirizzo\',this.value)"></label>'
    + '<label style="flex:1 1 160px">Comune<input class="acq-in" value="' + esc(W.ni.comune) + '" placeholder="es. Agropoli" oninput="_acqWzNi(\'comune\',this.value)"></label>'
    + '<label style="flex:1 1 160px">Tipo<select class="acq-in" onchange="_acqWzNi(\'tipo\',this.value)">'
    + T.map(function(t){ return '<option' + (W.ni.tipo === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label></div>'
    + '<div class="acq-azioni"><button class="gx-btn pieno" onclick="_acqWzImmNuovo()">Avanti ' + ico('<polyline points="9 18 15 12 9 6"/>') + '</button>'
    + '<span class="nota">Nasce una scheda <b>in valutazione</b>, nascosta (niente archivio, sito, statistiche o abbinamenti). Con l\'incarico firmato diventa un immobile normale, già compilato.</span></div>';
  h += window.gxCol('Non ancora in archivio', 'l\'immobile non è nel gestionale', c.am, form);
  h += '</div>';
  var cerca = '<div class="acq-azioni"><span style="color:var(--text3);display:inline-flex">' + ico(I.cerca) + '</span>'
    + '<input id="acq-wz-cimm" class="acq-in" style="flex:1;min-width:180px" placeholder="Ref, indirizzo, comune o proprietario (almeno 2 lettere)" value="' + esc(W.cercaImm) + '" oninput="_acqWzCercaImm(this.value)"></div>';
  h += window.gxCol('Cerca fra tutti gli immobili in archivio', 'se l\'immobile c\'è ma non è collegato a lui', c.no, cerca + '<div id="acq-wz-imm">' + wzRigheTutti() + '</div>');
  return h;
}
function wzRigheTutti(){
  var q = wz().cercaImm.trim().toLowerCase();
  if(q.length < 2) return '';
  var L = immScegliibili().filter(function(im){
    var pp = propDi(im);
    return [im.ref, im.indirizzo, im.comune, im.tipo, im.contatto, pp.nome].join(' ').toLowerCase().indexOf(q) >= 0;
  });
  return L.slice(0, 30).map(wzRigaImm).join('') || '<div class="gx-vuoto">Nessun immobile libero corrisponde alla ricerca.</div>';
}
/* ── PASSO 3 · COME PROCEDI ── */
function wzValutazioni(){
  var W = wz(), p = wzProp(), im = W.imm ? immPerUuid(W.imm) : null;
  return (Array.isArray(D.valutazioni) ? D.valutazioni : []).filter(function(v){
    if(!v || v.eliminata) return false;
    if(im && v.immUuid === im.uuid) return true;
    if(p.dl && v.dealId === p.dl.id) return true;
    return stessoProprietario(p.nome, p.tel, v, v.proprietario, v.telefono);
  }).sort(function(x, y){ return String(y.data || '').localeCompare(String(x.data || '')); });
}
function wzPasso3(){
  var W = wz(), c = C(), p = wzProp();
  var M = [['valutazione', MODELLI.valutazione.nome, I.stella, 'prima si valuta, l\'incarico arriva dopo'],
           ['incarico', MODELLI.incarico.nome, I.firma, 'l\'incarico c\'è o sta per arrivare'],
           ['personalizzato', 'Personalizzato', I.matita, 'scegli tu passi e ordine']];
  var h = '<div class="acq-wz-modi">' + M.map(function(m){
    var on = _modNuovo === m[0];
    var passi = MODELLI[m[0]] ? MODELLI[m[0]].passi.map(function(k){ return PASSI_ET[k]; }).join(' → ') : 'Documenti, Valutazione, Incarico e grazie, Foto: togli e sposta';
    return '<button class="acq-wz-modo' + (on ? ' on' : '') + '" onclick="_acqModNuovo(\'' + m[0] + '\')" title="' + esc(m[3]) + '">'
      + '<span class="t">' + ico(m[2], 16) + ' ' + esc(m[1]) + '</span><span class="s">' + esc(passi) + '</span></button>';
  }).join('')
    + '<button class="acq-wz-modo" onclick="_acqWzFirmato()" title="Carichi la foto o il PDF dell\'incarico firmato: l\'AI legge i dati e tu li confermi">'
    + '<span class="t">' + ico(I.ai, 16) + ' Incarico già firmato su carta</span><span class="s">leggilo con l\'AI: i dati vanno su cliente e immobile</span></button></div>';
  h += '<div class="acq-azioni acq-wz-via"><button class="gx-btn pieno" onclick="_acqWzAvvia(\'\')">' + ico(I.ok) + ' Avvia percorso: ' + esc(MODELLI[_modNuovo] ? MODELLI[_modNuovo].nome : 'Personalizzato') + '</button>'
    + '<span class="nota">' + (p.cli ? '' : 'Avviando, ' + esc(bello(p.nome)) + ' entra fra i Clienti come venditore. ') + (p.dl ? '' : 'Nella pipeline acquisizioni nasce il suo contatto.') + '</span></div>';
  var V = wzValutazioni();
  var r = V.map(function(v){
    var sub = [v.data ? it(v.data) : '', [v.indirizzo, v.comune].filter(Boolean).join(', '), v.tipo].filter(Boolean).join(' · ');
    return '<div class="gx-riga acq-riga acq-nv-riga" onclick="_acqWzAvvia(\'' + jsq(v.id) + '\')" title="Avvia Prima la valutazione con questa valutazione già fatta">'
      + '<div style="flex:1;min-width:0"><div class="tt">' + esc(sub || 'Valutazione') + '</div><div class="sub">' + esc(bello(v.proprietario || p.nome)) + '</div></div>'
      + (v.valFinale ? '<span class="gx-num" style="font-weight:800">' + eurNv(v.valFinale) + '</span>' : '')
      + '<span class="gx-btn">Parti da questa</span></div>';
  }).join('');
  h += window.gxCol('Valutazioni di ' + (bello(p.nome) || 'questo proprietario'), V.length ? 'già fatte: si parte con la valutazione già pronta' : 'nessuna valutazione salvata per lui', c.ok,
    r || '<div class="gx-vuoto">Nessuna valutazione per questo proprietario. Con "Prima la valutazione" la fai dal percorso.</div>');
  return h;
}

/* ── azioni della procedura ── */
function wzVai(n){ var W = wz(); W.passo = n; disegna(); var sc = document.querySelector('#acq-wrap .gx-corpo'); if(sc) sc.scrollTop = 0; }
window._acqWzChi = function(k){ var W = wz(); W.chi = k; W.cerca = ''; disegna(); };
window._acqWzCerca = function(v){
  var W = wz(); W.cerca = String(v || '');
  var el = document.getElementById('acq-wz-righe'); if(el) el.innerHTML = W.chi === 'archivio' ? wzRigheClienti() : wzRigheDeals();
};
window._acqWzNc = function(k, v){ wz().nc[k] = String(v == null ? '' : v); };
window._acqWzAvanti1 = function(){
  var W = wz(), n = W.nc;
  n.nome = String(n.nome || '').trim().toUpperCase(); n.tel = String(n.tel || '').trim(); n.email = String(n.email || '').trim();
  if(!n.nome){ avviso('Scrivi il nome del proprietario'); var e = document.getElementById('acq-wz-nome'); if(e) e.focus(); return; }
  W.cliUuid = ''; W.dealId = ''; W.imm = ''; W.ni = null;
  /* è già in archivio? meglio usare la sua scheda che fare un doppione */
  var gia = clientiVivi().find(function(c){ return stessoProprietario(n.nome, n.tel, c, c.nome, c.tel || c.telefono); });
  if(!gia){ wzVai(2); return; }
  var msg = bello(gia.nome) + (gia.tel || gia.telefono ? ' (' + (gia.tel || gia.telefono) + ')' : '') + ' è già in archivio. Uso la sua scheda?';
  var usa = function(ok){ if(ok){ W.cliUuid = gia.uuid; var dl = wzDealPerCli(gia); W.dealId = dl ? dl.id : ''; } wzVai(2); };
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm(msg, '"Annulla" crea comunque un cliente nuovo', 'Cliente già in archivio').then(usa);
  else usa(confirm(msg));
};
window._acqWzCli = function(u){ var W = wz(), c = cliPerUuid(u); if(!c) return; W.cliUuid = u; var dl = wzDealPerCli(c); W.dealId = dl ? dl.id : ''; W.imm = ''; W.ni = null; wzVai(2); };
window._acqWzDeal = function(id){ var W = wz(), dl = dealDi(id); if(!dl) return; W.dealId = id; var c = wzCliPerDeal(dl); W.cliUuid = c ? c.uuid : ''; W.imm = ''; W.ni = null; wzVai(2); };
window._acqWzNi = function(k, v){ var W = wz(); if(!W.ni) W.ni = {}; W.ni[k] = String(v == null ? '' : v); };
window._acqWzImm = function(u){ var W = wz(); W.imm = u; wzVai(3); };
window._acqWzImmNuovo = function(){
  var W = wz();
  if(!W.ni || !(String(W.ni.indirizzo || '').trim() || String(W.ni.comune || '').trim())){ avviso('Scrivi almeno l\'indirizzo o il comune dell\'immobile'); return; }
  W.imm = ''; wzVai(3);
};
window._acqWzCercaImm = function(v){ var W = wz(); W.cercaImm = String(v || ''); var el = document.getElementById('acq-wz-imm'); if(el) el.innerHTML = wzRigheTutti(); };

/* scrive davvero: cliente, contatto nella pipeline, immobile (o scheda in valutazione) */
function wzScrivi(){
  var W = wz(), p = wzProp();
  if(!Array.isArray(D.clienti)) D.clienti = [];
  if(!Array.isArray(D.pipelineDeals)) D.pipelineDeals = [];
  var cli = p.cli, dl = p.dl;
  if(!cli){
    var nome = String(p.nome || '').trim().toUpperCase();
    cli = { uuid:nuovoUuid(), nome:nome, tel:p.tel || '', email:p.email || '', tipo:'venditore', data:oggi(),
      fonte:(dl && dl.fonte) || 'Acquisizioni', note:'Proprietario da Acquisizioni (nuova acquisizione)', _modificata:Date.now() };
    D.clienti.push(cli);
  } else if(cli.tipo === 'acquirente'){ cli.tipo = 'entrambi'; cli._modificata = Date.now(); }
  if(!dl) dl = wzDealPerCli(cli);
  if(!dl){
    var fase = W.chi === 'nuovo' ? (W.nc.fase || 'appuntamento-fissato') : 'appuntamento-fissato';
    dl = { id:'deal_' + Date.now(), data:oggi(), titolo:cli.nome, cliente:cli.nome, telefono:cli.tel || cli.telefono || '', email:cli.email || '',
      modalita:'', fonte:'Acquisizioni', tipoOp:'Vendita', tipoImm:'', indirizzo:'', comune:'', zona:'', mq:'', valore:'', immobile:'',
      fase:fase, priorita:'media', dataContatto:oggi(), dataFollowup:'', note:'Creato da Acquisizioni (nuova acquisizione)',
      fasi:[{ fase:fase, data:oggi() }], _modificata:Date.now() };
    D.pipelineDeals.push(dl);
  }
  if(dl.clienteUuid !== cli.uuid){ dl.clienteUuid = cli.uuid; dl._modificata = Date.now(); }
  var im = W.imm ? immPerUuid(W.imm) : null;
  if(!im){
    var com = String(W.ni && W.ni.comune || '').trim();
    if(com && typeof window.nomeConMaiuscole === 'function'){ try{ com = window.nomeConMaiuscole(com); }catch(e){} }
    var u = nuovoUuid();
    im = { uuid:u, id:u, inValutazione:true, creato:oggi(), stato:'in valutazione', dealId:dl.id, clienteUuid:cli.uuid,
      contatto:cli.nome || '', telefono:cli.tel || cli.telefono || '', email:cli.email || '',
      indirizzo:String(W.ni && W.ni.indirizzo || '').trim(), comune:com, tipo:(W.ni && W.ni.tipo) || '', _modificata:Date.now() };
    im.tel = im.telefono;
    nascoste().push(im);
    if(!dl.indirizzo && im.indirizzo) dl.indirizzo = im.indirizzo;
    if(!dl.comune && im.comune) dl.comune = im.comune;
    if(!dl.tipoImm && im.tipo) dl.tipoImm = im.tipo === 'Box/Garage' ? 'Box / Garage' : im.tipo;
    dl.immobile = [dl.indirizzo, dl.comune].filter(Boolean).join(' · ');
  } else if(eNascosto(im)){
    if(im.archiviata){ im.archiviata = ''; }
    im.clienteUuid = cli.uuid; im.dealId = im.dealId || dl.id; im._modificata = Date.now();
  } else if(!im.clienteUuid){
    impLega(im, cli); im._modificata = Date.now();
  }
  return { cli:cli, dl:dl, im:im };
}
window._acqWzAvvia = function(vid){
  var v = vid ? (Array.isArray(D.valutazioni) ? D.valutazioni : []).find(function(x){ return x && x.id === vid; }) : null;
  if(v) _modNuovo = 'valutazione';
  var X = wzScrivi(), im = X.im, dl = X.dl;
  var a = vivi().find(function(x){ return x.immUuid === im.uuid && x.stato !== 'chiusa'; });
  if(!a){
    var ag = null; try{ ag = (typeof window._agenteCorrente === 'function') ? window._agenteCorrente() : null; }catch(e){}
    a = norma({ id:nuovoId(), immUuid:im.uuid, immEt:etichetta(im), creato:oggi(), stato:'aperta', agenteUuid:(ag && ag.uuid) || '', ape:'' });
    var M = MODELLI[_modNuovo];
    a.modello = M ? _modNuovo : 'personalizzato';
    a.passi = M ? M.passi.slice() : MODELLI.valutazione.passi.slice();
    a.dealId = dl.id;
    diario(a, 'Percorso avviato: ' + (M ? M.nome : 'personalizzato') + ' (' + a.passi.map(function(k){ return PASSI_ET[k]; }).join(' → ') + ') per ' + bello(X.cli.nome)
      + (eNascosto(im) ? ' · scheda in valutazione, nascosta' : ''));
    lista().push(a);
  } else if(!a.dealId){ a.dealId = dl.id; }
  if(v){
    if(!v.immUuid || !immPerUuid(v.immUuid)) v.immUuid = im.uuid;
    if(!v.dealId) v.dealId = dl.id;
    v._modificata = Date.now();
    diario(a, 'Valutazione del ' + it(v.data) + ' collegata al percorso');
    faseDeal(dl, 'valutazione-fatta');
  }
  salva();
  _wz = null;
  vaiA('dettaglio', a.id);
};
window._acqWzFirmato = function(){
  var X = wzScrivi();
  salva();
  var nascosto = eNascosto(X.im);
  _imp = impNuovo(nascosto ? '' : X.im.uuid, '');
  _imp.cliFisso = X.cli.uuid; _imp.cli = X.cli.uuid; _imp.dealId = X.dl.id;
  if(nascosto){ _imp.imm = 'nuovo'; _imp.nascosto = X.im.uuid; }
  _wz = null;
  vaiA('importa');
};

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

/* [20 ott 2026] "dati del proprietario prima, dati dell'immobile dopo l'incarico" */
function bloccoProprietario(a, im){
  var id = jsq(a.id), dl = dealDi(a.dealId || im.dealId);
  var f = function(et, campo, v, ph, extra){
    return '<label style="flex:1 1 180px">' + et + '<input class="acq-in" value="' + esc(v || '') + '" placeholder="' + ph + '"' + (extra || '')
      + ' onchange="_acqNvProp(\'' + id + '\',\'' + campo + '\',this.value)"></label>';
  };
  var corpo = '<div class="acq-campi">'
    + f('Proprietario', 'nome', im.contatto, 'nome e cognome')
    + f('Telefono', 'tel', im.telefono || im.tel, 'cellulare', ' inputmode="tel"')
    + f('Email', 'email', im.email, 'per i messaggi', ' inputmode="email"')
    + f('Indirizzo dell\'immobile', 'indirizzo', im.indirizzo, 'via e numero')
    + f('Comune', 'comune', im.comune, 'comune') + '</div>';
  var sotto = 'Nel pipeline: ' + (dl ? esc(faseNv(dl.fase)[1]) : 'contatto non trovato') + ' · i dati dell\'immobile si completano nella scheda normale quando segni l\'incarico firmato';
  return window.gxCol('Proprietario', sotto, C().am, corpo);
}
function bloccoDocs(a, im, chi){
  var L = docsDi(a, chi, im);
  return L.map(function(n){
    var ok = raccolto(im, n), no = !serve(a, n);
    var nome = nomeDoc(n) + (n === APE && apeDi(a) === '' ? ' — solo se lo ha già' : '') + (eProv(n) ? ' · per la provenienza' : '');
    return '<div class="acq-doc' + (ok ? ' ok' : '') + (no ? ' no' : '') + '">'
      + '<button class="acq-spunta" title="' + (ok ? 'Togli la spunta' : 'Segna come raccolto') + '" onclick="_acqDoc(\'' + jsq(a.id) + '\',' + argDoc(n) + ')"' + (no ? ' disabled style="opacity:.35;cursor:default"' : '') + '>' + ico(I.ok, 14) + '</button>'
      + '<span class="n">' + esc(nome) + (no ? ' — non serve' : '') + '</span>'
      + (ok ? '' : '<button class="gx-btn" onclick="_acqNonServe(\'' + jsq(a.id) + '\',' + argDoc(n) + ')">' + (no ? 'Serve' : 'Non serve') + '</button>')
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

/* [20 ott 2026] la fila dei passi in cima al percorso, e l'elenco per cambiarli */
/* [21 ott 2026] LA FILA DEI PASSI SI CAMBIA SUL POSTO (scelta di Enzo):
   ogni passo si trascina col mouse o col dito, la "x" lo toglie, i passi
   tolti restano in fondo come "+ Nome" e un tocco li rimette. Niente più
   elenco "Cambia passi" da aprire: a destra resta solo la tendina dei
   modelli pronti. Togliere un passo non cancella niente (a.tappe resta). */
function barraPassi(a, im, st){
  var id = jsq(a.id), P = passiDi(a), aperta = a.stato !== 'chiusa', cur = aperta ? passoCorrente(a, im, st) : '';
  var fuori = Object.keys(PASSI_ET).filter(function(k){ return P.indexOf(k) < 0; });
  var h = '<div class="acq-passi' + (aperta ? ' acq-passi-mod' : '') + '" data-a="' + esc(a.id) + '">' + P.map(function(k, i){
      var sp = statoPasso(a, im, k, st);
      return '<span class="acq-passo' + (k === cur ? ' cur' : '') + '" data-k="' + k + '" style="color:' + stCol(sp) + '" title="'
        + esc(ST_ET[sp] + (k === cur ? ' · è il passo in corso' : '') + (aperta ? ' · trascinalo per cambiare l\'ordine' : '')) + '">'
        + (aperta ? '<span class="acq-grip">' + ico('<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>', 13) + '</span>' : '')
        + '<span class="acq-num"><b>' + (i + 1) + '</b></span>' + esc(PASSI_ET[k])
        + (aperta && P.length > 1 ? '<button class="acq-px" title="Togli questo passo (quello che hai fatto resta e torna se lo rimetti)" onclick="event.stopPropagation();_acqPassoOnOff(\'' + id + '\',\'' + k + '\')">' + ico(I.x, 12) + '</button>' : '')
        + '</span>';
    }).join('')
    + (aperta ? fuori.map(function(k){
        return '<button class="acq-passo acq-passo-via" title="Rimetti questo passo in fondo al percorso" onclick="_acqPassoOnOff(\'' + id + '\',\'' + k + '\')">' + ico(I.piu, 13) + ' ' + esc(PASSI_ET[k]) + '</button>';
      }).join('') : '')
    + '<span style="flex:1"></span>';
  if(aperta){
    var mod = Object.keys(MODELLI).find(function(m){ return MODELLI[m].passi.join() === P.join(); }) || '';
    h += '<label class="acq-modsel" title="Rimette i passi di un modello pronto">Modello <select class="acq-in" onchange="if(this.value)_acqModello(\'' + id + '\',this.value)">'
      + (mod ? '' : '<option value="" selected>Personalizzato</option>')
      + Object.keys(MODELLI).map(function(m){ return '<option value="' + m + '"' + (mod === m ? ' selected' : '') + '>' + esc(MODELLI[m].nome) + '</option>'; }).join('')
      + '</select></label>';
  }
  return h + '</div>';
}
/* trascinamento: Pointer Events, uguali per mouse e dito */
var _trascina = null;
function trascinaPosto(ev){
  var D0 = _trascina, box = D0.el.parentNode;
  var L = [].slice.call(box.querySelectorAll('.acq-passo[data-k]')).filter(function(x){ return x !== D0.el; });
  var dove = L.length;
  for(var i = 0; i < L.length; i++){
    var r = L[i].getBoundingClientRect();
    if(ev.clientY < r.top || (ev.clientY <= r.bottom && ev.clientX < r.left + r.width / 2)){ dove = i; break; }
  }
  L.forEach(function(x, i){ x.classList.toggle('dove-prima', i === dove); x.classList.toggle('dove-dopo', dove === L.length && i === L.length - 1); });
  return { L:L, dove:dove };
}
function trascinaFine(){
  if(!_trascina) return;
  var D0 = _trascina; _trascina = null;
  D0.el.classList.remove('trascina'); D0.el.style.transform = '';
  [].slice.call(document.querySelectorAll('#acq-wrap .acq-passo.dove-prima,#acq-wrap .acq-passo.dove-dopo')).forEach(function(x){ x.classList.remove('dove-prima', 'dove-dopo'); });
  return D0;
}
if(!window._acqTrascinaPronto){
  window._acqTrascinaPronto = true;
  document.addEventListener('pointerdown', function(ev){
    var el = ev.target && ev.target.closest ? ev.target.closest('#acq-wrap .acq-passi-mod .acq-passo[data-k]') : null;
    if(!el || ev.target.closest('.acq-px') || (ev.button && ev.button > 0)) return;
    _trascina = { el:el, k:el.getAttribute('data-k'), id:el.parentNode.getAttribute('data-a'), x0:ev.clientX, y0:ev.clientY, on:false, pid:ev.pointerId, ultimo:null };
  });
  document.addEventListener('pointermove', function(ev){
    var T = _trascina; if(!T) return;
    var dx = ev.clientX - T.x0, dy = ev.clientY - T.y0;
    if(!T.on){
      if(Math.abs(dx) + Math.abs(dy) < 6) return;
      T.on = true; T.el.classList.add('trascina');
      try{ T.el.setPointerCapture(T.pid); }catch(e){}
    }
    ev.preventDefault();
    T.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    T.ultimo = trascinaPosto(ev);
  }, { passive:false });
  var fine = function(ev){
    var T = trascinaFine(); if(!T || !T.on || !T.ultimo || ev.type === 'pointercancel') return;
    var P = T.ultimo.L.map(function(x){ return x.getAttribute('data-k'); });
    P.splice(T.ultimo.dove, 0, T.k);
    window._acqPassiOrdine(T.id, P);
  };
  document.addEventListener('pointerup', fine);
  document.addEventListener('pointercancel', fine);
}
window._acqPassiOrdine = function(id, P){
  var a = trova(id); if(!a) return;
  var prima = passiDi(a);
  P = (P || []).filter(function(k, i){ return PASSI_ET[k] && P.indexOf(k) === i; });
  if(!P.length || P.join() === prima.join()){ disegna(); return; }
  a.modello = 'personalizzato';
  cambiaPassi(a, P, 'Cambiato l\'ordine dei passi: ' + P.map(function(x){ return PASSI_ET[x]; }).join(' → '));
};
/* il passo Valutazione: le valutazioni salvate in Valutazioni per questo immobile */
function bloccoValutazione(a, im){
  var c = C(), id = jsq(a.id), t = norma(a).tappe.valutazione, V = valutazioniDi(im), h = '';
  h += '<div class="acq-azioni">'
    + '<button class="gx-btn' + (V.length ? '' : ' pieno') + '" onclick="_acqValuta(\'' + id + '\')" title="Apre Valutazioni con questo immobile già scelto">' + ico(I.casa) + (V.length ? ' Nuova valutazione' : ' Fai la valutazione') + '</button>'
    + (V.length ? '' : (t.fatta
        ? '<span class="acq-pill" style="color:' + c.ok + '"><i></i>Fatta fuori dal gestionale il ' + esc(it(t.fatta)) + '</span><button class="gx-btn" onclick="_acqValFatta(\'' + id + '\')">Annulla</button>'
        : '<button class="gx-btn" onclick="_acqValFatta(\'' + id + '\')" title="L\'hai fatta su carta o a voce, senza la scheda di Valutazioni">' + ico(I.ok) + ' Fatta fuori dal gestionale</button>'))
    + '</div>';
  h += V.map(function(v){
    return '<div class="acq-doc"><span style="color:' + c.ok + ';display:inline-flex">' + ico(I.doc, 16) + '</span>'
      + '<span class="n">Valutazione del ' + esc(it(v.data)) + (v.valFinale ? ' · <b>€ ' + esc(numIt(v.valFinale)) + '</b>' : '')
      + (v.partenza ? ' <span style="color:var(--text4);font-size:0.76rem">· partenza € ' + esc(numIt(v.partenza)) + '</span>' : '') + '</span>'
      + '<button class="gx-btn" onclick="_acqValApri(\'' + jsq(v.id) + '\')" title="Apre la scheda della valutazione">Apri</button>'
      + (typeof window.vlReport === 'function' ? '<button class="gx-btn" onclick="vlReport(\'' + jsq(v.id) + '\')" title="Il report per il proprietario">Report</button>' : '')
      + '</div>';
  }).join('');
  if(!V.length) h += '<div class="gx-nota" style="margin:0;padding:10px 16px">' + (t.avviata ? 'Valutazione aperta il ' + esc(it(t.avviata)) + ', non ancora salvata. ' : '')
    + 'Il passo si segna fatto da solo quando salvi in Valutazioni una valutazione di questo immobile.</div>';
  return h;
}

function disegnaDettaglio(a){
  norma(a);
  var c = C(), im = immDi(a), p = propDi(im), s = stati(a, im), id = jsq(a.id);
  var h = window.gxTesta(im ? etichetta(im) : (a.immEt || 'Acquisizione'), '', (p.nome ? bello(p.nome) + ' · ' : '') + 'avviato il ' + it(a.creato));
  h += '<div class="acq-barra">'
    + (im && eNascosto(im)
        ? '<span class="acq-pill" style="color:' + c.am + '" title="La scheda di questo immobile è nascosta: non compare in archivio, sul sito, nelle statistiche, negli abbinamenti, sulla mappa e nel connettore. Passa in archivio, già compilata, quando segni l\'incarico firmato."><i></i>' + (im.archiviata ? 'Scheda in valutazione · archiviata' : 'Scheda in valutazione · nascosta') + '</span>'
        : (im ? '<button class="gx-btn" onclick="_acqScheda(\'' + jsq(im.uuid) + '\')">' + ico(I.casa) + ' Apri scheda immobile</button>' : ''))
    + '<div style="flex:1"></div>'
    + (a.stato === 'chiusa'
        ? '<span class="acq-pill" style="color:' + c.no + '"><i></i>Chiuso il ' + esc(it(a.chiusa)) + '</span><button class="gx-btn" onclick="_acqRiapri(\'' + id + '\')">Riapri</button>'
        : (eNascosto(im) ? '<button class="gx-btn" onclick="_acqNonArrivato(\'' + id + '\')" title="Chiude il percorso, archivia la scheda in valutazione con i documenti e sposta il contatto in Perso">Incarico non arrivato</button>' : '')
          + '<button class="gx-btn" onclick="_acqChiudi(\'' + id + '\')">Chiudi percorso</button>')
    + '<button class="gx-btn rosso" onclick="_acqElimina(\'' + id + '\')">Elimina</button></div>';

  if(!im){
    h += '<div class="gx-info" style="border-left:4px solid ' + c.ko + '"><b>Immobile non trovato.</b> Il percorso resta qui, ma senza l\'immobile non posso mostrare documenti e incarico. Probabilmente è stato archiviato o eliminato.</div>';
    return h + cronologia(a);
  }
  if(annotaFine(a, im)) setTimeout(salva, 0);
  var F = ferme(a, im);
  h += barraPassi(a, im, s);   /* [20 ott 2026] i passi scelti, nel loro ordine */
  if(eNascosto(im)) h += bloccoProprietario(a, im);
  if(F.length) h += '<div class="gx-info" style="border-left:4px solid ' + c.ko + '"><b>Percorso fermo.</b> ' + F.map(function(w){ return esc(w.x) + ' — ' + w.gg + ' gg oltre i giorni previsti'; }).join('<br>') + '</div>';
  var tutteFatte = passiDi(a).every(function(k){ return statoPasso(a, im, k, s) === 'fatto'; });
  if(a.stato !== 'chiusa' && tutteFatte){
    h += '<div class="gx-info" style="border-left:4px solid ' + c.ok + ';display:flex;flex-wrap:wrap;gap:10px;align-items:center"><span style="flex:1;min-width:240px"><b>Tutti i passi sono fatti: l\'immobile è pronto per la pubblicazione.</b> Portali, social e video si preparano nel Marketing Hub; poi puoi chiudere il percorso.</span>'
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
  tecS += bloccoTecnicoLink(a, im);   /* [19 ott 2026] pagina per il tecnico (sezione 14) */

  /* 5 · FOTO — scelta A di Enzo: ogni volta fotografo oppure "le faccio io" */
  var tf = a.tappe.foto, fot = fotDi(a);
  var foto = '<div class="acq-azioni"><span class="nota" style="font-weight:700">Chi le fa</span><div class="acq-scelta">'
    + [['fotografo','Il fotografo'],['io','Le faccio io']].map(function(v){
        return '<button class="' + (tf.chi === v[0] ? 'on' : '') + '" onclick="_acqFotoChi(\'' + id + '\',\'' + v[0] + '\')">' + v[1] + '</button>';
      }).join('') + '</div>'
    + (tf.chi === 'fotografo' ? sceltaRubrica(a, '_acqFotografo', fotografi(), fot, 'Nella Rubrica non c\'è ancora nessun fotografo: aggiungilo con la categoria "Fotografo".') : '')
    + '</div>';
  /* [14 ott 2026] cartella delle foto su Google Drive (sezione 11) */
  if(tf.chi) foto += bloccoDrive(a, im);
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

  /* [20 ott 2026] le schede seguono i passi scelti da Enzo, nel suo ordine;
     le schede dello stesso passo hanno lo stesso numero */
  var P = passiDi(a), schede = [];
  var schArch = function(n){ return window.gxCol(testa(n, 'Archivio documenti', statoArchivio(im)), pillArchivio(im), stCol(statoArchivio(im)), bloccoArchivio(a.id, im)); };
  P.forEach(function(k, i){
    var n = i + 1;
    if(k === 'valutazione') schede.push(window.gxCol(testa(n, 'Valutazione', s.valutazione), pill(s.valutazione), stCol(s.valutazione), bloccoValutazione(a, im)));
    if(k === 'incarico'){
      schede.push(window.gxCol(testa(n, 'Incarico', s.incarico), pill(s.incarico), stCol(s.incarico), inc));
      schede.push(window.gxCol(testa(n, 'Ringraziamento', s.grazie), pill(s.grazie), stCol(s.grazie), gra));
    }
    if(k === 'documenti'){
      schede.push(window.gxCol(testa(n, 'Documenti dal proprietario', s.proprietario), pill(s.proprietario, cp.ok + ' di ' + cp.tot + ' raccolti'), stCol(s.proprietario), prop));
      schede.push(window.gxCol(testa(n, 'Documenti dal tecnico', s.tecnico), pill(s.tecnico, ct.ok + ' di ' + ct.tot + ' raccolti'), stCol(s.tecnico), tecS));
      /* l'archivio dei documenti scansionati: si vede, ma non entra nel conto dei passi fatti */
      schede.push(schArch(n));
    }
    if(k === 'foto') schede.push(window.gxCol(testa(n, 'Foto', s.foto), pill(s.foto), stCol(s.foto), foto));
  });
  /* senza il passo Documenti lo scanner resta comunque a portata di mano */
  if(P.indexOf('documenti') < 0) schede.push(schArch('+'));
  var meta = Math.ceil(schede.length / 2);
  h += '<div class="acq-grid">'
    + '<div>' + schede.slice(0, meta).join('') + '</div>'
    + '<div>' + schede.slice(meta).join('') + bloccoPrestPercorso(a) + cronologia(a) + '</div>'
    + '</div>';
  return h;
}

/* "Testi dei messaggi": un riquadro per testo, con i segnaposto spiegati */
function disegnaTesti(){
  var h = window.gxTesta('Testi dei messaggi', '', 'valgono per tutti i percorsi');
  h += '<div class="acq-barra"><div style="flex:1"></div>'
    + '<button class="gx-btn pieno" onclick="_acqSalvaTesti()">' + ico(I.ok) + ' Salva i testi</button></div>';
  h += '<div class="gx-info"><b>Come funzionano i segnaposto.</b> Le parole fra parentesi graffe si riempiono da sole con i dati del percorso. '
    + 'Se un dato manca (per esempio i dati catastali), la riga che lo contiene sparisce dal messaggio.<div style="display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px">'
    + SEGNAPOSTO.map(function(x){ return '<span><code>{' + x[0] + '}</code> ' + esc(x[1]) + '</span>'; }).join('') + '</div></div>';
  var link = '<div class="acq-campi"><label style="flex:1;min-width:260px">Collegamento alla presentazione dei servizi'
    + '<input id="acq-t-' + LINK_ID + '" class="acq-in" placeholder="https://…" value="' + esc(linkServizi()) + '"></label>'
    + '<label style="justify-content:flex-end"><button class="gx-btn" style="padding:6px 12px" onclick="(document.getElementById(\'acq-t-' + LINK_ID + '\')||{}).value=\'' + SV_URL + '\'">Usa la pagina dei servizi</button></label></div>'
    + '<div class="gx-nota" style="margin:0;padding:10px 16px">Va al posto di {link_servizi} nel ringraziamento. Finché è vuoto, quella riga non compare. La pagina dei servizi si prepara da "Presentazione servizi": quando la pubblichi, se qui è vuoto il collegamento si mette da solo.</div>';
  h += window.gxCol('Presentazione dei servizi', '', C().blu, link);
  h += configDrive();
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
/* [18 ott 2026] la Valutazione legge da qui i servizi per l'ultima pagina del
   report: i testi restano scritti in un posto solo (questa presentazione) */
window.acqServiziCfg = function(){ return copia(svCfg()); };
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
  h += '<div class="acq-barra"><div style="flex:1"></div>'
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
  else if(_vista === 'leggidoc') cont = disegnaLettura();   /* [19 ott 2026] lettura dei documenti con l'AI */
  else if(_vista === 'testi') cont = disegnaTesti();
  else if(_vista === 'servizi') cont = disegnaServizi();
  else cont = disegnaElenco();
  var w = document.getElementById('acq-wrap');
  if(w){
    var corpo = w.querySelector('.gx-dentro');
    if(corpo){ var sc = w.querySelector('.gx-corpo'), y = sc ? sc.scrollTop : 0; corpo.innerHTML = cont; if(sc) sc.scrollTop = y; return; }
  }
  var nw = window.gxPagina('acq-wrap', 'Acquisizioni', 'chiudiAcquisizioni()', cont);
  if(nw) nw._indietro = indietro;
}
/* [20 ott 2026] UN SOLO "INDIETRO" (scelta di Enzo): niente più "← Torna
   all'elenco / al percorso / alla scheda" nelle schermate. Il pulsante
   Indietro (in alto sul computer, nella barra della pagina sul telefono)
   chiama questa funzione: un passo indietro per volta, e quando si è già
   sull'elenco risponde false e la pagina si chiude (si torna alla sezione
   di sotto, es. la Dashboard). Le uscite già esistenti (servizi con
   modifiche non salvate, importazione, lettura dei documenti) restano
   quelle di prima, così ognuna torna dove deve. */
function indietro(){
  if(_pf){ _pf = null; disegna(); return true; }    /* un modulo aperto si chiude per primo */
  if(_pp){ _pp = null; disegna(); return true; }
  if(_vista === 'nuovo' && _wz && _wz.passo > 1){ wzVai(_wz.passo - 1); return true; }
  if(_vista === 'servizi'){ window._acqSvEsci(); return true; }
  if(_vista === 'importa'){ window._acqImpEsci(); return true; }
  if(_vista === 'leggidoc'){ window._acqLdEsci(); return true; }
  if(_vista !== 'elenco'){ vaiA('elenco'); return true; }
  return false;
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
window._acqNuovo = function(){ _cerca = ''; _wz = wzNuovo(); vaiA('nuovo'); setTimeout(function(){ var i = document.getElementById('acq-wz-nome'); if(i) i.focus(); }, 50); };
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
  /* [20 ott 2026] percorso flessibile: i passi del modello scelto; "Personalizzato"
     parte con tutti i passi e l'elenco aperto, per togliere e spostare */
  var M = MODELLI[_modNuovo];
  a.modello = M ? _modNuovo : 'personalizzato';
  a.passi = M ? M.passi.slice() : MODELLI.valutazione.passi.slice();
  diario(a, 'Percorso avviato: ' + (M ? M.nome : 'personalizzato') + ' (' + a.passi.map(function(k){ return PASSI_ET[k]; }).join(' → ') + ')');
  lista().push(a);
  salva();
  vaiA('dettaglio', a.id);
};
window._acqModNuovo = function(m){ _modNuovo = (MODELLI[m] || m === 'personalizzato') ? m : 'valutazione'; disegna(); };
function cambiaPassi(a, P, testo){ a.passi = P; diario(a, testo); salva(); disegna(); }
window._acqModello = function(id, m){
  var a = trova(id); if(!a || !MODELLI[m]) return;
  a.modello = m;
  cambiaPassi(a, MODELLI[m].passi.slice(), 'Passi: ' + MODELLI[m].nome);
};
window._acqPassoOnOff = function(id, k){
  var a = trova(id); if(!a || !PASSI_ET[k]) return;
  var P = passiDi(a).slice(), i = P.indexOf(k);
  if(i >= 0){ if(P.length === 1){ avviso('Serve almeno un passo'); return; } P.splice(i, 1); }
  else P.push(k);
  a.modello = 'personalizzato';
  cambiaPassi(a, P, (i >= 0 ? 'Tolto il passo ' : 'Aggiunto il passo ') + PASSI_ET[k]);
};
/* Valutazioni si apre sopra questa pagina: quando la chiudi, il percorso si ridisegna */
function aspettaValutazioni(){
  if(_attesaVl) clearInterval(_attesaVl);
  var visto = false, inizio = Date.now();
  _attesaVl = setInterval(function(){
    if(document.getElementById('vl-pag')){ visto = true; return; }
    if(visto || Date.now() - inizio > 4000){
      clearInterval(_attesaVl); _attesaVl = null;
      if(document.getElementById('acq-wrap')) disegna();
    }
  }, 500);
}
window._acqValuta = function(id){
  var a = trova(id), im = immDi(a); if(!a || !im) return;
  if(typeof window.vlNuova !== 'function'){ avviso('Le Valutazioni non sono ancora caricate: riprova fra un istante'); return; }
  var t = norma(a).tappe.valutazione;
  if(!t.avviata){ t.avviata = oggi(); diario(a, 'Valutazione avviata'); salva(); }
  window.vlNuova({ immUuid:im.uuid, dealId:a.dealId || im.dealId || '' });
  aspettaValutazioni();
};
window._acqValApri = function(vid){
  if(typeof window.vlApri !== 'function'){ avviso('Le Valutazioni non sono ancora caricate'); return; }
  window.vlApri(vid); aspettaValutazioni();
};
window._acqValFatta = function(id){
  var a = trova(id); if(!a) return;
  var t = norma(a).tappe.valutazione;
  if(t.fatta){ t.fatta = ''; diario(a, 'Annullata la valutazione fatta fuori dal gestionale'); }
  else { t.fatta = oggi(); diario(a, 'Valutazione fatta fuori dal gestionale'); }
  salva(); disegna();
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
  if(data && eNascosto(im)){ promuovi(a, im, data); return; }
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
  var ora;
  if(eProv(n)){   /* [17 ott 2026] documento della provenienza: spunta in im.docsProv, come nella scheda */
    if(!im.docsProv || typeof im.docsProv !== 'object') im.docsProv = {};
    ora = !(im.docsProv[n.slice(2)] === true);
    if(ora) im.docsProv[n.slice(2)] = true; else delete im.docsProv[n.slice(2)];
  } else {
    if(!im.docsChecklist || typeof im.docsChecklist !== 'object') im.docsChecklist = {};
    ora = !(im.docsChecklist[n] === true);
    im.docsChecklist[n] = ora;
  }
  diario(a, (ora ? 'Raccolto: ' : 'Tolto dai raccolti: ') + nomeDoc(n));
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
  var du = document.getElementById('acq-t-' + DRIVE_URL);
  if(du) metti(DRIVE_URL, String(du.value || '').trim());
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
  var imN = immDi(a); if(eNascosto(imN) && !imN.archiviata){ imN.archiviata = oggi(); imN._modificata = Date.now(); }
  a.stato = 'chiusa'; a.chiusa = oggi(); diario(a, 'Percorso chiuso');
  salva(); _tab = 'aperte'; vaiA('elenco');
};
/* [20 ott 2026] l'incarico non è arrivato: percorso chiuso, scheda in
   valutazione archiviata (documenti compresi), contatto in "Perso" */
window._acqNonArrivato = function(id){
  var a = trova(id), im = immDi(a); if(!a) return;
  var fai = function(){
    a.stato = 'chiusa'; a.chiusa = oggi(); diario(a, 'Incarico non arrivato: percorso chiuso');
    if(eNascosto(im)){ im.archiviata = oggi(); im._modificata = Date.now(); }
    var dl = dealDi(a.dealId || (im && im.dealId)); if(dl) faseDeal(dl, 'perso');
    salva(); _tab = 'aperte'; vaiA('elenco');
    avviso('Percorso chiuso: la scheda in valutazione resta archiviata con i suoi documenti');
  };
  var msg = 'L\'incarico non è arrivato? Chiudo il percorso, archivio la scheda in valutazione (i documenti restano) e sposto il contatto in "Perso" nel pipeline.';
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm(msg, '', 'Incarico non arrivato').then(function(ok){ if(ok) fai(); });
  else if(confirm(msg)) fai();
};
/* dati del proprietario sulla scheda in valutazione: scritti anche sul contatto del pipeline */
window._acqNvProp = function(id, campo, val){
  var a = trova(id), im = immDi(a); if(!a || !eNascosto(im)) return;
  val = String(val == null ? '' : val).trim();
  var dl = dealDi(a.dealId || im.dealId);
  var cl = cliPerUuid(im.clienteUuid);   /* [21 ott 2026] con il cliente in archivio si scrive anche sulla sua scheda */
  if(campo === 'nome'){ val = val.toUpperCase(); im.contatto = val; if(dl){ dl.titolo = val; dl.cliente = val; } if(cl) cl.nome = val; }
  else if(campo === 'tel'){ im.telefono = val; im.tel = val; if(dl) dl.telefono = val; if(cl) cl.tel = val; }
  else if(campo === 'email'){ im.email = val; if(dl) dl.email = val; if(cl) cl.email = val; }
  else if(campo === 'indirizzo' || campo === 'comune'){
    im[campo] = val; if(dl){ dl[campo] = val; dl.immobile = [im.indirizzo, im.comune].filter(Boolean).join(' · '); }
    a.immEt = etichetta(im);
  } else return;
  im._modificata = Date.now(); if(dl) dl._modificata = Date.now(); if(cl) cl._modificata = Date.now();
  salva(); disegna();
};
window._acqRiapri = function(id){
  var a = trova(id); if(!a) return;
  var altro = vivi().find(function(x){ return x !== a && x.immUuid === a.immUuid && x.stato !== 'chiusa'; });
  if(altro){ avviso('Per questo immobile c\'è già un percorso aperto'); vaiA('dettaglio', altro.id); return; }
  a.stato = 'aperta'; a.chiusa = ''; diario(a, 'Percorso riaperto');
  var imN = immDi(a); if(eNascosto(imN) && imN.archiviata){ imN.archiviata = ''; imN._modificata = Date.now(); }
  salva(); disegna();
};
window._acqElimina = function(id){
  var a = trova(id); if(!a) return;
  var fai = function(){
    a.eliminato = true; diario(a, 'Percorso eliminato');
    var imN = immDi(a); if(eNascosto(imN) && !imN.archiviata){ imN.archiviata = oggi(); imN._modificata = Date.now(); }   /* i documenti restano */
    salva(); vaiA('elenco');
  };
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
function immPerUuid(u){
  if(!u) return null;
  var im = (Array.isArray(D.immobili) ? D.immobili : []).find(function(x){ return x && x.uuid === u; });
  if(im) return im;
  /* una scheda in valutazione già passata in archivio porta al nuovo immobile */
  var n = nascoste().find(function(x){ return x && x.uuid === u; }) || null;
  if(n && n.passatoA){ var v = (D.immobili || []).find(function(x){ return x && x.uuid === n.passatoA; }); if(v) return v; }
  return n;
}
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
  /* [21 ott 2026] dalla procedura guidata il proprietario è già scelto */
  if(_imp.cliFisso && cliPerUuid(_imp.cliFisso)){ cli = cliPerUuid(_imp.cliFisso); _imp.cli = cli.uuid; }
  if(_imp.fisso){ _imp.imm = _imp.fisso; return; }
  if(_imp.nascosto){ _imp.imm = 'nuovo'; return; }
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
    a.modello = 'incarico'; a.passi = MODELLI.incarico.passi.slice();   /* [20 ott 2026] l'incarico c'e' gia' */
    diario(a, 'Percorso avviato: ' + MODELLI.incarico.nome);
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
  /* [21 ott 2026] dalla procedura guidata: contatto in pipeline e scheda in valutazione */
  if(_imp.dealId){ var dlI = dealDi(_imp.dealId); if(dlI){ a.dealId = dlI.id; faseDeal(dlI, 'incarico-preso'); dlI.clienteUuid = cli.uuid; dlI._modificata = Date.now(); } }
  if(_imp.nascosto){
    var vN = nascoste().find(function(x){ return x && x.uuid === _imp.nascosto; });
    if(vN && !vN.passatoA){ vN.passatoA = im.uuid; vN.passatoIl = oggi(); vN._modificata = Date.now(); ripunta(vN.uuid, im); }
  }
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

/* ── [20 ott 2026] LA SCHEDA IN VALUTAZIONE PASSA IN ARCHIVIO ───────────
   Alla firma dell'incarico (scelta di Enzo: diventa un immobile normale già
   compilato). Si apre la scheda normale del nuovo immobile, riempita con i
   dati della scheda in valutazione e dell'ultima valutazione: Enzo controlla
   e salva, il Ref lo dà il gestionale come sempre. Poi:
   - tutto quello che la scheda nuova non ha (documenti, Drive, catasto,
     provenienza…) passa dalla scheda in valutazione;
   - ogni record che puntava alla scheda nascosta (percorso, valutazioni,
     prestazioni, spese) ora punta all'immobile vero;
   - il proprietario diventa cliente (o si usa quello che c'è già);
   - il contatto del pipeline passa a "Incarico preso".
   Se la scheda si chiude senza salvare non cambia niente, firma compresa. */
var PROMUOVI_NO = { uuid:1, id:1, ref:1, tel:1, inValutazione:1, stato:1, creato:1, passatoA:1, passatoIl:1, archiviata:1, dealId:1, _modificata:1 };
var MODALE_DA = { tipo:'im-tipo', comune:'im-comune', zona:'im-zona', indirizzo:'im-indirizzo', piano:'im-piano', mq:'im-mq',
  catSezione:'im-cat-sezione', catFoglio:'im-cat-foglio', catParticella:'im-cat-particella', catSub:'im-cat-sub', catCategoria:'im-cat-categoria',
  catClasse:'im-cat-classe', catConsistenza:'im-cat-consistenza', catRendita:'im-cat-rendita', catComune:'im-cat-comune', catIntestatario:'im-cat-intestatario',
  contatto:'im-contatto', telefono:'im-tel', email:'im-email', provenienza:'im-provenienza', conferimento:'im-conf', incInizio:'im-inc-inizio',
  incFine:'im-inc-fine', incPerc:'im-inc-perc' };
function clienteDaProp(im, dl){
  if(!Array.isArray(D.clienti)) D.clienti = [];
  var gia = cliPerUuid(im.clienteUuid) || (dl && cliPerUuid(dl.clienteUuid));   /* [21 ott 2026] scelto all'avvio */
  if(gia){ if(gia.tipo === 'acquirente'){ gia.tipo = 'entrambi'; gia._modificata = Date.now(); } return gia; }
  var nome = String(im.contatto || (dl && dl.titolo) || '').trim(), tel = String(im.telefono || (dl && dl.telefono) || '').replace(/\D/g, '');
  var k = nomeChiave(nome);
  var c = D.clienti.find(function(x){
    if(!x || x.eliminato) return false;
    var t = String(x.tel || x.telefono || '').replace(/\D/g, '');
    return (tel && t && t.slice(-9) === tel.slice(-9)) || (k && nomeChiave(x.nome) === k);
  }) || null;
  if(c){ if(c.tipo === 'acquirente') { c.tipo = 'entrambi'; c._modificata = Date.now(); } return c; }
  c = { uuid:nuovoUuid(), nome:nome.toUpperCase(), tel:im.telefono || (dl && dl.telefono) || '', email:im.email || (dl && dl.email) || '',
    tipo:'venditore', data:oggi(), fonte:(dl && dl.fonte) || 'Acquisizioni', note:'Dal pipeline acquisizioni: incarico preso dopo la valutazione', _modificata:Date.now() };
  D.clienti.push(c);
  return c;
}
function compilaDaNascosto(im, cli, data){
  var set = function(id, v){
    var el = document.getElementById(id); if(!el || v === '' || v == null) return;
    el.value = v;
    try{ el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true })); }catch(e){}
  };
  var idx = D.clienti.indexOf(cli);
  if(idx >= 0) set('im-cliente-ref', String(idx));
  set('im-inc', 'vendita');
  Object.keys(MODALE_DA).forEach(function(k){ set(MODALE_DA[k], im[k]); });
  if(!im.incInizio) set('im-inc-inizio', data);
  var n = numero(im.prezzo);
  if(n){ set('im-prezzo', Math.round(n).toLocaleString('it-IT')); var el = document.getElementById('im-prezzo'); if(el) el.setAttribute('data-raw', String(n)); }
}
function ripunta(vecchio, nuovo){
  var idx = D.immobili.indexOf(nuovo), n = 0;
  Object.keys(D).forEach(function(k){
    if(k === 'immobili' || k === 'immValutazione' || !Array.isArray(D[k])) return;
    D[k].forEach(function(r){
      if(!r || typeof r !== 'object' || r.immUuid !== vecchio) return;
      r.immUuid = nuovo.uuid; if('immRef' in r) r.immRef = idx >= 0 ? String(idx) : '';
      r._modificata = Date.now(); n++;
    });
  });
  return n;
}
function promuovi(a, im, data){
  var dl = dealDi(a.dealId || im.dealId);
  /* dati dell'immobile dall'ultima valutazione, solo dove la scheda è vuota */
  var v = valutazioniDi(im)[0];
  if(v){
    if(!im.tipo && v.tipo) im.tipo = v.tipo;
    if(!im.mq && v.supComm) im.mq = String(Math.round(v.supComm));
    if(!im.indirizzo && v.indirizzo) im.indirizzo = v.indirizzo;
    if(!im.comune && v.comune) im.comune = v.comune;
    if(im.lat == null && v.lat != null){ im.lat = v.lat; im.lng = v.lng; }
  }
  var cli = clienteDaProp(im, dl);
  salva();
  caricaNuovoImmobile(function(){ compilaDaNascosto(im, cli, data); }, function(nuovo, pagina){
    var torna = function(){ if(pagina) vaiA('dettaglio', a.id); else { window.apriAcquisizioni(); vaiA('dettaglio', a.id); } };
    if(!nuovo){ avviso('Scheda immobile chiusa senza salvare: l\'incarico non è segnato e i dati restano nella scheda in valutazione'); torna(); return; }
    Object.keys(im).forEach(function(k){
      if(PROMUOVI_NO[k]) return;
      var x = nuovo[k];
      var vuoto = x === undefined || x === null || x === '' || (Array.isArray(x) && !x.length) || (x && typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length);
      if(vuoto) nuovo[k] = JSON.parse(JSON.stringify(im[k]));
    });
    impLega(nuovo, cli);
    if(!nuovo.incInizio) nuovo.incInizio = data;
    nuovo._modificata = Date.now();
    var vecchio = im.uuid, quanti = ripunta(vecchio, nuovo);
    im.passatoA = nuovo.uuid; im.passatoIl = oggi(); im._modificata = Date.now();
    a.immUuid = nuovo.uuid; a.immEt = etichetta(nuovo);
    norma(a); a.tappe.incarico.firmato = data;
    diario(a, 'Incarico firmato il ' + it(data) + ': la scheda in valutazione è entrata in archivio' + (nuovo.ref ? ' come Ref.' + nuovo.ref : '') + ' (' + quanti + ' collegamenti aggiornati)');
    if(dl){ faseDeal(dl, 'incarico-preso'); dl.clienteUuid = cli.uuid; dl._modificata = Date.now(); }
    salva();
    torna();
    avviso('Incarico firmato: l\'immobile è in archivio' + (nuovo.ref ? ' con il Ref.' + nuovo.ref : '') + ' e ' + bello(cli.nome) + ' è fra i clienti');
  });
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


/* ── 11. CARTELLA DELLE FOTO SU GOOGLE DRIVE ────────────────────────────────
   [14 ott 2026] Scelte di Enzo: cartella creata in AUTOMATICO da un piccolo
   script Google (Apps Script) pubblicato come "app web" sul suo account
   (B), e collegamento salvato sulla SCHEDA IMMOBILE (im.cartellaFoto), cosi'
   lo si vede anche fuori dal percorso.
   Come parla: POST in text/plain (niente "preflight" del browser, che lo
   script Google non saprebbe gestire) con { chiave, azione, ... }.
   La chiave la genera il gestionale e Enzo la copia nelle Proprieta' dello
   script: non passa mai dalla chat. Indirizzo e chiave stanno in D.acqTesti
   (drive_url, drive_chiave) e quindi valgono su tutti i computer.
   Lo script crea dentro "Foto immobili - Gestionale" una cartella per
   immobile e la condivide in modifica con l'email del fotografo (serve un
   account Google: senza, Drive non lascia caricare). */

var DRIVE_URL = 'drive_url', DRIVE_CHIAVE = 'drive_chiave';
var _drv = {};          /* stato a video: { prova:'', provaOk:bool, lavoro:{immUuid:true} } */

var DRIVE_SCRIPT = [
  '// Gestionale - cartelle Google Drive per le foto degli immobili',
  '// Si incolla in script.google.com e si pubblica come "App web".',
  '// La CHIAVE va in Impostazioni progetto > Proprieta\' dello script.',
  '// [14 ott 2026] Serve anche al Piano Social del Marketing Hub: legge i lavori',
  '// pronti dalla cartella "Social da programmare" e dopo l\'uscita li sposta in "Pubblicati".',
  '// [18 ott 2026] E carica in quella cartella le foto e i video presi dal computer (a pezzi da 4 MB).',
  '// [18 ott 2026, versione 4] Documenti degli immobili scansionati nel percorso Acquisizioni:',
  '// cartella a parte "Documenti immobili - Gestionale", NON condivisa con nessuno; per ogni',
  '// immobile le sottocartelle "Documenti" e "Identità" (i documenti d\'identità stanno solo li\').',
  '// [19 ott 2026, versione 5] Rilegge i documenti per l\'AI (docPezzo) e fa da portinaio alla',
  '// pagina del tecnico (tecnico.html): link + codice di 6 cifre, scadenza, blocco dopo 5 codici',
  '// sbagliati; il tecnico vede solo "Documenti" (mai "Identità") e puo\' caricare i suoi file.',
  'var CARTELLA_PRINCIPALE = \'Foto immobili - Gestionale\';',
  'var CARTELLA_DOCUMENTI = "Documenti immobili - Gestionale";',
  'var CARTELLA_SOCIAL = \'Social da programmare\';',
  'var PEZZO = 6 * 1024 * 1024;   // i file grandi viaggiano a pezzi da 6 MB',
  '',
  '// da eseguire UNA volta dal pulsante "Esegui", per dare il permesso su Drive',
  'function autorizza(){',
  '  principale(); social(); pubblicati(); documenti();',
  '  UrlFetchApp.fetch(\'https://www.googleapis.com/drive/v3/about?fields=user\', { headers:{ Authorization:\'Bearer \' + ScriptApp.getOAuthToken() } });',
  '  Logger.log(\'Autorizzato: \' + principale().getName() + \' e \' + social().getName());',
  '}',
  '',
  'function doGet(){ return out({ ok:true, servizio:\'cartelle foto del gestionale\' }); }',
  '',
  'function doPost(e){',
  '  var r;',
  '  try{',
  '    var q = JSON.parse((e && e.postData && e.postData.contents) || \'{}\');',
  '    if(/^pub/.test(String(q.azione || ""))) return out(pubblico(q));   // pagina del tecnico: link + codice, senza chiave',
  '    var chiave = PropertiesService.getScriptProperties().getProperty(\'CHIAVE\');',
  '    if(!chiave) return out({ ok:false, errore:\'manca la CHIAVE nelle proprieta\\\' dello script\' });',
  '    if(q.chiave !== chiave) return out({ ok:false, errore:\'chiave non valida\' });',
  '    if(q.azione === \'prova\') r = { ok:true, versione:5, principale:principale().getName(), social:social().getName(), documenti:documenti().getName(), account:Session.getEffectiveUser().getEmail() };',
  '    else if(q.azione === \'crea\') r = crea(q);',
  '    else if(q.azione === \'stato\') r = stato(q);',
  '    else if(q.azione === \'socElenco\') r = socElenco(q);',
  '    else if(q.azione === \'socMini\') r = socMini(q);',
  '    else if(q.azione === \'socPezzo\') r = socPezzo(q);',
  '    else if(q.azione === \'socSposta\') r = socSposta(q);',
  '    else if(q.azione === \'socCaricaInizio\') r = socCaricaInizio(q);',
  '    else if(q.azione === \'socCaricaPezzo\') r = socCaricaPezzo(q);',
  '    else if(q.azione === "docCartelle") r = docCartelle(q);',
  '    else if(q.azione === "docCaricaInizio") r = docCaricaInizio(q);',
  '    else if(q.azione === "docPezzo") r = docPezzo(q);',
  '    else if(q.azione === "tecCrea") r = tecCrea(q);',
  '    else if(q.azione === "tecSpegni") r = tecSpegni(q);',
  '    else if(q.azione === "tecStato") r = tecStato(q);',
  '    else r = { ok:false, errore:\'azione sconosciuta\' };',
  '  }catch(err){ r = { ok:false, errore:String((err && err.message) || err) }; }',
  '  return out(r);',
  '}',
  '',
  'function out(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }',
  '',
  'function principale(){',
  '  var P = PropertiesService.getScriptProperties(), id = P.getProperty(\'CARTELLA_ID\');',
  '  if(id){ try{ var f0 = DriveApp.getFolderById(id); if(!f0.isTrashed()) return f0; }catch(e){} }',
  '  var it = DriveApp.getFoldersByName(CARTELLA_PRINCIPALE);',
  '  var f = it.hasNext() ? it.next() : DriveApp.createFolder(CARTELLA_PRINCIPALE);',
  '  P.setProperty(\'CARTELLA_ID\', f.getId());',
  '  return f;',
  '}',
  '',
  'function crea(q){',
  '  var nome = String(q.nome || \'\').replace(/[\\/\\\\]/g, \'-\').trim().slice(0, 120) || \'Immobile\';',
  '  var cart = null;',
  '  if(q.id){ try{ cart = DriveApp.getFolderById(q.id); if(cart.isTrashed()) cart = null; }catch(e){ cart = null; } }',
  '  if(!cart){ var it = principale().getFoldersByName(nome); cart = it.hasNext() ? it.next() : principale().createFolder(nome); }',
  '  var fatte = [], errori = [];',
  '  (q.email ? String(q.email).split(/[,; ]+/) : []).forEach(function(m){',
  '    m = String(m).trim(); if(!m) return;',
  '    try{ cart.addEditor(m); fatte.push(m); }catch(e){ errori.push(m); }',
  '  });',
  '  return { ok:true, id:cart.getId(), url:cart.getUrl(), nome:cart.getName(), condivisa:fatte, nonCondivisa:errori };',
  '}',
  '',
  'function stato(q){',
  '  var cart = DriveApp.getFolderById(q.id), n = 0, ultimo = 0;',
  '  var giro = function(c, liv){',
  '    var fs = c.getFiles();',
  '    while(fs.hasNext()){ var f = fs.next(); n++; var t = f.getLastUpdated().getTime(); if(t > ultimo) ultimo = t; }',
  '    if(liv < 2){ var ss = c.getFolders(); while(ss.hasNext()) giro(ss.next(), liv + 1); }',
  '  };',
  '  giro(cart, 0);',
  '  return { ok:true, file:n, ultimo:(ultimo ? new Date(ultimo).toISOString() : \'\'), url:cart.getUrl(), nome:cart.getName(), cestino:cart.isTrashed() };',
  '}',
  '',
  '// ── Piano Social del Marketing Hub: cartella "Social da programmare" ──',
  'function social(){',
  '  var P = PropertiesService.getScriptProperties(), id = P.getProperty(\'SOCIAL_ID\');',
  '  if(id){ try{ var f0 = DriveApp.getFolderById(id); if(!f0.isTrashed()) return f0; }catch(e){} }',
  '  var it = DriveApp.getFoldersByName(CARTELLA_SOCIAL);',
  '  var f = it.hasNext() ? it.next() : DriveApp.createFolder(CARTELLA_SOCIAL);',
  '  P.setProperty(\'SOCIAL_ID\', f.getId());',
  '  return f;',
  '}',
  'function pubblicati(){',
  '  var s = social(), it = s.getFoldersByName(\'Pubblicati\');',
  '  return it.hasNext() ? it.next() : s.createFolder(\'Pubblicati\');',
  '}',
  '// si leggono solo i file di queste due cartelle, mai il resto del Drive',
  'function dentroSocial(f){',
  '  var ok = {}; ok[social().getId()] = 1; ok[pubblicati().getId()] = 1;',
  '  var it = f.getParents();',
  '  while(it.hasNext()){ if(ok[it.next().getId()]) return true; }',
  '  return false;',
  '}',
  'function mini(f){',
  '  try{ var t = f.getThumbnail(); if(t) return \'data:\' + (t.getContentType() || \'image/png\') + \';base64,\' + Utilities.base64Encode(t.getBytes()); }catch(e){}',
  '  return \'\';',
  '}',
  '// foto e video della cartella (non quelli in "Pubblicati"), dal piu\' recente',
  'function socElenco(q){',
  '  var s = social(), fs = s.getFiles(), L = [], gia = {};',
  '  (q.gia || []).forEach(function(id){ gia[id] = 1; });',
  '  while(fs.hasNext()){',
  '    var f = fs.next(), m = f.getMimeType();',
  '    if(!/^(image|video)\\//.test(m)) continue;',
  '    L.push({ f:f, id:f.getId(), nome:f.getName(), mime:m, peso:f.getSize(), data:f.getLastUpdated().getTime() });',
  '  }',
  '  L.sort(function(a, b){ return b.data - a.data; });',
  '  L = L.slice(0, 60).map(function(x){',
  '    var o = { id:x.id, nome:x.nome, mime:x.mime, peso:x.peso, data:x.data };',
  '    if(!gia[x.id]) o.mini = mini(x.f);',
  '    return o;',
  '  });',
  '  return { ok:true, cartella:s.getName(), url:s.getUrl(), file:L };',
  '}',
  '// le miniature di alcuni file (anche di quelli gia\' in "Pubblicati")',
  'function socMini(q){',
  '  var out = {};',
  '  (q.ids || []).slice(0, 20).forEach(function(id){',
  '    try{ var f = DriveApp.getFileById(id); out[id] = dentroSocial(f) ? { mini:mini(f), nome:f.getName(), mime:f.getMimeType(), peso:f.getSize() } : null; }catch(e){ out[id] = null; }',
  '  });',
  '  return { ok:true, file:out };',
  '}',
  '// un pezzo del file in base64: i video grandi arrivano a pezzi',
  'function socPezzo(q){',
  '  var f = DriveApp.getFileById(q.id);',
  '  if(!dentroSocial(f)) return { ok:false, errore:\'il file non e\\\' nella cartella \' + CARTELLA_SOCIAL };',
  '  var tot = f.getSize(), da = Math.max(0, Math.floor(+q.da || 0));',
  '  if(da >= tot) return { ok:true, tot:tot, da:da, b64:\'\' };',
  '  var a = Math.min(tot, da + PEZZO) - 1;',
  '  var r = UrlFetchApp.fetch(\'https://www.googleapis.com/drive/v3/files/\' + encodeURIComponent(q.id) + \'?alt=media\', {',
  '    headers:{ Authorization:\'Bearer \' + ScriptApp.getOAuthToken(), Range:\'bytes=\' + da + \'-\' + a }, muteHttpExceptions:true });',
  '  var c = r.getResponseCode();',
  '  if(c !== 200 && c !== 206) return { ok:false, errore:\'Drive ha risposto \' + c };',
  '  var b = r.getContent();',
  '  if(c === 200 && b.length > a - da + 1) b = b.slice(da, a + 1);   // se Drive manda tutto, taglio io',
  '  return { ok:true, tot:tot, da:da, b64:Utilities.base64Encode(b), mime:f.getMimeType() };',
  '}',
  '// dopo l\'uscita i file vanno in "Pubblicati"',
  'function socSposta(q){',
  '  var dest = pubblicati(), n = 0;',
  '  (q.ids || []).forEach(function(id){',
  '    try{ var f = DriveApp.getFileById(id); if(dentroSocial(f)){ f.moveTo(dest); n++; } }catch(e){}',
  '  });',
  '  return { ok:true, spostati:n };',
  '}',
  '// [18 ott 2026] foto e video dal computer: si apre un caricamento "riprendibile" di Drive',
  '// dentro "Social da programmare", poi arrivano i pezzi; all\'ultimo Drive da\' il file.',
  'function socCaricaInizio(q){',
  '  var nome = String(q.nome || \'file\').replace(/[\\/\\\\]/g, \'-\').trim().slice(0, 150) || \'file\';',
  '  var mime = String(q.mime || \'\');',
  '  if(!/^(image|video)\\//.test(mime)) return { ok:false, errore:\'si caricano solo foto e video\' };',
  '  var r = UrlFetchApp.fetch(\'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size\', {',
  '    method:\'post\', contentType:\'application/json; charset=UTF-8\', muteHttpExceptions:true,',
  '    headers:{ Authorization:\'Bearer \' + ScriptApp.getOAuthToken(), \'X-Upload-Content-Type\':mime, \'X-Upload-Content-Length\':String(Math.floor(+q.peso || 0)) },',
  '    payload:JSON.stringify({ name:nome, parents:[social().getId()] }) });',
  '  var h = r.getAllHeaders(), loc = h.Location || h.location;',
  '  if(r.getResponseCode() !== 200 || !loc) return { ok:false, errore:\'Drive non ha aperto il caricamento (\' + r.getResponseCode() + \')\' };',
  '  return { ok:true, sessione:String(loc) };',
  '}',
  'function socCaricaPezzo(q){',
  '  var s = String(q.sessione || \'\');',
  '  if(s.indexOf(\'https://www.googleapis.com/upload/drive/v3/files\') !== 0) return { ok:false, errore:\'caricamento non valido\' };',
  '  var b = Utilities.base64Decode(String(q.b64 || \'\')), da = Math.max(0, Math.floor(+q.da || 0)), tot = Math.floor(+q.tot || 0);',
  '  if(!b.length || !tot) return { ok:false, errore:\'pezzo vuoto\' };',
  '  var r = UrlFetchApp.fetch(s, { method:\'put\', contentType:String(q.mime || \'application/octet-stream\'), payload:b, muteHttpExceptions:true,',
  '    headers:{ \'Content-Range\':\'bytes \' + da + \'-\' + (da + b.length - 1) + \'/\' + tot } });',
  '  var c = r.getResponseCode();',
  '  if(c === 308) return { ok:true, fatto:false };',
  '  if(c === 200 || c === 201){ var o = JSON.parse(r.getContentText() || \'{}\'); return { ok:true, fatto:true, id:o.id, nome:o.name, mime:o.mimeType, peso:(+o.size || tot) }; }',
  '  return { ok:false, errore:\'Drive ha risposto \' + c + \' durante il caricamento\' };',
  '}',
  '',
  '// ── [versione 4] Documenti degli immobili: cartella a parte, mai condivisa ──',
  'function documenti(){',
  '  var P = PropertiesService.getScriptProperties(), id = P.getProperty("DOCUMENTI_ID");',
  '  if(id){ try{ var f0 = DriveApp.getFolderById(id); if(!f0.isTrashed()) return f0; }catch(e){} }',
  '  var it = DriveApp.getFoldersByName(CARTELLA_DOCUMENTI);',
  '  var f = it.hasNext() ? it.next() : DriveApp.createFolder(CARTELLA_DOCUMENTI);',
  '  P.setProperty("DOCUMENTI_ID", f.getId());',
  '  return f;',
  '}',
  '// vero se "padre" e\' una delle cartelle che contengono f',
  'function dentro(f, padre){',
  '  var it = f.getParents(), pid = padre.getId();',
  '  while(it.hasNext()){ if(it.next().getId() === pid) return true; }',
  '  return false;',
  '}',
  '// la cartella dell\'immobile con le sottocartelle "Documenti" e "Identità" (le crea se mancano)',
  'function docCartelle(q){',
  '  var radice = documenti();',
  '  var nome = String(q.nome || "").replace(/[\\/\\\\]/g, "-").trim().slice(0, 120) || "Immobile";',
  '  var cart = null;',
  '  if(q.id){ try{ cart = DriveApp.getFolderById(q.id); if(cart.isTrashed() || !dentro(cart, radice)) cart = null; }catch(e){ cart = null; } }',
  '  if(!cart){ var it = radice.getFoldersByName(nome); cart = it.hasNext() ? it.next() : radice.createFolder(nome); }',
  '  var sotto = function(n){ var it2 = cart.getFoldersByName(n); return it2.hasNext() ? it2.next() : cart.createFolder(n); };',
  '  var d = sotto("Documenti"), i = sotto("Identità");',
  '  return { ok:true, id:cart.getId(), url:cart.getUrl(), nome:cart.getName(), docId:d.getId(), docUrl:d.getUrl(), idId:i.getId(), idUrl:i.getUrl() };',
  '}',
  '// apre il caricamento a pezzi di un PDF (o di una foto) dentro "Documenti" o "Identità";',
  '// i pezzi arrivano con socCaricaPezzo, uguale per tutti i caricamenti',
  'function docCaricaInizio(q){',
  '  var c = null;',
  '  try{ c = DriveApp.getFolderById(String(q.cartella || "")); if(c.isTrashed()) c = null; }catch(e){ c = null; }',
  '  if(!c) return { ok:false, errore:"cartella dei documenti non trovata" };',
  '  var radice = documenti(), ok = false, it = c.getParents();',
  '  while(it.hasNext()){ if(dentro(it.next(), radice)) ok = true; }',
  '  if(!ok) return { ok:false, errore:"si caricano documenti solo dentro " + CARTELLA_DOCUMENTI };',
  '  var mime = String(q.mime || "");',
  '  if(mime !== "application/pdf" && !/^image\\//.test(mime)) return { ok:false, errore:"si caricano solo PDF e foto" };',
  '  var nome = String(q.nome || "documento.pdf").replace(/[\\/\\\\]/g, "-").trim().slice(0, 180) || "documento.pdf";',
  '  var r = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size", {',
  '    method:"post", contentType:"application/json; charset=UTF-8", muteHttpExceptions:true,',
  '    headers:{ Authorization:"Bearer " + ScriptApp.getOAuthToken(), "X-Upload-Content-Type":mime, "X-Upload-Content-Length":String(Math.floor(+q.peso || 0)) },',
  '    payload:JSON.stringify({ name:nome, parents:[c.getId()] }) });',
  '  var h = r.getAllHeaders(), loc = h.Location || h.location;',
  '  if(r.getResponseCode() !== 200 || !loc) return { ok:false, errore:"Drive non ha aperto il caricamento (" + r.getResponseCode() + ")" };',
  '  return { ok:true, sessione:String(loc) };',
  '}',
  "// ── [versione 5] lettura dei documenti con l'AI e pagina del tecnico ──",
  "// vero se x sta (fino a 4 livelli) dentro la cartella con quell'id",
  "function sopra(x, id, liv){",
  "  if(liv > 4) return false;",
  "  var it = x.getParents();",
  "  while(it.hasNext()){ var p = it.next(); if(p.getId() === id || sopra(p, id, liv + 1)) return true; }",
  "  return false;",
  "}",
  "function inDocumenti(f){ return sopra(f, documenti().getId(), 0); }",
  "// un pezzo di un file in base64 (i PDF grandi arrivano a pezzi)",
  "function pezzoDi(f, da0){",
  "  var tot = f.getSize(), da = Math.max(0, Math.floor(+da0 || 0));",
  "  if(da >= tot) return { ok:true, tot:tot, da:da, b64:\"\", mime:f.getMimeType(), nome:f.getName() };",
  "  var a = Math.min(tot, da + PEZZO) - 1;",
  "  var r = UrlFetchApp.fetch(\"https://www.googleapis.com/drive/v3/files/\" + encodeURIComponent(f.getId()) + \"?alt=media\", {",
  "    headers:{ Authorization:\"Bearer \" + ScriptApp.getOAuthToken(), Range:\"bytes=\" + da + \"-\" + a }, muteHttpExceptions:true });",
  "  var c = r.getResponseCode();",
  "  if(c !== 200 && c !== 206) return { ok:false, errore:\"Drive ha risposto \" + c };",
  "  var b = r.getContent();",
  "  if(c === 200 && b.length > a - da + 1) b = b.slice(da, a + 1);",
  "  return { ok:true, tot:tot, da:da, b64:Utilities.base64Encode(b), mime:f.getMimeType(), nome:f.getName() };",
  "}",
  "// il gestionale riscarica un documento archiviato per farlo leggere all'AI",
  "function docPezzo(q){",
  "  var f = null;",
  "  try{ f = DriveApp.getFileById(String(q.id || \"\")); }catch(e){ f = null; }",
  "  if(!f || f.isTrashed()) return { ok:false, errore:\"documento non trovato su Drive (cancellato?)\" };",
  "  if(!inDocumenti(f)) return { ok:false, errore:\"il file non e' nei documenti degli immobili\" };",
  "  return pezzoDi(f, q.da);",
  "}",
  "// ── i link per il tecnico: uno per immobile, nelle Proprieta' dello script ──",
  "function tecLeggi(t){ var s = PropertiesService.getScriptProperties().getProperty(\"TEC_\" + t); try{ return s ? JSON.parse(s) : null; }catch(e){ return null; } }",
  "function tecScrivi(t, o){ PropertiesService.getScriptProperties().setProperty(\"TEC_\" + t, JSON.stringify(o)); }",
  "function impronta(t, c){ return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t + \"|\" + c)); }",
  "function tecCrea(q){",
  "  var c = null;",
  "  try{ c = DriveApp.getFolderById(String(q.cartella || \"\")); }catch(e){ c = null; }",
  "  if(!c || c.isTrashed() || !sopra(c, documenti().getId(), 0)) return { ok:false, errore:\"cartella dei documenti non trovata\" };",
  "  if(c.getName() !== \"Documenti\") return { ok:false, errore:\"si condivide solo la cartella Documenti\" };",
  "  var P = PropertiesService.getScriptProperties(), tutte = P.getProperties(), ora = Date.now();",
  "  Object.keys(tutte).forEach(function(k){",
  "    if(k.indexOf(\"TEC_\") !== 0) return;",
  "    var o0 = null; try{ o0 = JSON.parse(tutte[k]); }catch(e){}",
  "    if(!o0 || o0.scad < ora - 30 * 864e5) P.deleteProperty(k);",
  "  });",
  "  if(q.vecchio) P.deleteProperty(\"TEC_\" + String(q.vecchio));",
  "  var t = Utilities.getUuid().replace(/-/g, \"\"), cod = String(Math.floor(100000 + Math.random() * 900000));",
  "  var giorni = Math.max(1, Math.min(90, Math.floor(+q.giorni || 15)));",
  "  var tipi = (Array.isArray(q.tipi) ? q.tipi : []).slice(0, 30).map(function(x){ return { k:String(x.k).slice(0, 40), n:String(x.n).slice(0, 80) }; });",
  "  var o = { cart:c.getId(), imp:impronta(t, cod), scad:ora + giorni * 864e5, et:String(q.etichetta || \"\").slice(0, 160), ref:String(q.ref || \"\").slice(0, 20),",
  "    tec:String(q.tecnico || \"\").slice(0, 80), agente:String(q.agente || \"\").slice(0, 120), tipi:tipi, err:0, visto:0, aperture:0, caricati:[] };",
  "  tecScrivi(t, o);",
  "  return { ok:true, token:t, codice:cod, scad:o.scad };",
  "}",
  "function tecSpegni(q){ PropertiesService.getScriptProperties().deleteProperty(\"TEC_\" + String(q.token || \"\")); return { ok:true }; }",
  "function tecStato(q){",
  "  var o = tecLeggi(String(q.token || \"\"));",
  "  if(!o) return { ok:true, esiste:false };",
  "  return { ok:true, esiste:true, scad:o.scad, visto:o.visto, aperture:o.aperture, err:o.err, bloccato:o.err >= 5, caricati:o.caricati };",
  "}",
  "// ── la pagina pubblica del tecnico: niente chiave, ma link + codice ──",
  "function pubblico(q){",
  "  var t = String(q.token || \"\"), o = /^[a-f0-9]{32}$/.test(t) ? tecLeggi(t) : null;",
  "  if(!o) return { ok:false, fine:true, errore:\"Questo link non è valido o è stato spento: chiedi un link nuovo all'agente.\" };",
  "  if(Date.now() > o.scad) return { ok:false, fine:true, errore:\"Questo link è scaduto: chiedi un link nuovo all'agente.\" };",
  "  if(o.err >= 5) return { ok:false, fine:true, errore:\"Troppi codici sbagliati: il link è bloccato. Chiedi un link nuovo all'agente.\" };",
  "  if(impronta(t, String(q.codice || \"\")) !== o.imp){",
  "    var L = LockService.getScriptLock(); L.waitLock(10000);",
  "    try{ o = tecLeggi(t) || o; o.err = (o.err || 0) + 1; tecScrivi(t, o); }finally{ L.releaseLock(); }",
  "    return { ok:false, codice:true, fine:o.err >= 5, errore:\"Codice sbagliato\" + (o.err < 5 ? \": ancora \" + (5 - o.err) + \" tentativi.\" : \": il link ora è bloccato.\") };",
  "  }",
  "  var cart = DriveApp.getFolderById(o.cart);",
  "  if(q.azione === \"pubApri\"){",
  "    var L2 = LockService.getScriptLock(); L2.waitLock(10000);",
  "    try{ o = tecLeggi(t) || o; o.visto = Date.now(); o.aperture = (o.aperture || 0) + 1; o.err = 0; tecScrivi(t, o); }finally{ L2.releaseLock(); }",
  "    var fs = cart.getFiles(), F = [];",
  "    while(fs.hasNext()){",
  "      var f = fs.next(); if(f.isTrashed()) continue;",
  "      F.push({ id:f.getId(), nome:f.getName(), mime:f.getMimeType(), peso:f.getSize(), data:f.getDateCreated().getTime(), tecnico:/^tecnico/.test(f.getDescription() || \"\") });",
  "    }",
  "    F.sort(function(a, b){ return b.data - a.data; });",
  "    return { ok:true, et:o.et, ref:o.ref, tec:o.tec, agente:o.agente, scad:o.scad, tipi:o.tipi, file:F };",
  "  }",
  "  if(q.azione === \"pubPezzo\"){",
  "    var f2 = null; try{ f2 = DriveApp.getFileById(String(q.id || \"\")); }catch(e){ f2 = null; }",
  "    if(!f2 || f2.isTrashed() || !dentro(f2, cart)) return { ok:false, errore:\"documento non trovato\" };",
  "    return pezzoDi(f2, q.da);",
  "  }",
  "  if(q.azione === \"pubCaricaInizio\"){",
  "    var mime = String(q.mime || \"\");",
  "    if(mime !== \"application/pdf\" && !/^image\\//.test(mime)) return { ok:false, errore:\"si caricano solo PDF e foto\" };",
  "    var peso = Math.floor(+q.peso || 0);",
  "    if(!peso || peso > 50 * 1024 * 1024) return { ok:false, errore:\"il file deve pesare meno di 50 MB\" };",
  "    var tipo = (o.tipi || []).filter(function(x){ return x.k === String(q.k || \"\"); })[0];",
  "    var nomeTipo = String(q.k) === \"altro\" ? (String(q.altro || \"\").trim().slice(0, 80) || \"Documento\") : (tipo ? tipo.n : \"Documento\");",
  "    var d = new Date(), dd = (\"0\" + d.getDate()).slice(-2) + \"-\" + (\"0\" + (d.getMonth() + 1)).slice(-2) + \"-\" + d.getFullYear();",
  "    var est = mime === \"application/pdf\" ? \"pdf\" : (String(q.nome || \"\").split(\".\").pop().toLowerCase().replace(/[^a-z0-9]/g, \"\").slice(0, 5) || \"jpg\");",
  "    var nome = ((o.ref ? \"Ref.\" + o.ref + \" - \" : \"\") + nomeTipo + \" - \" + dd + \" (tecnico).\" + est).replace(/[\\/\\\\:*?\"<>|]+/g, \"-\");",
  "    var r = UrlFetchApp.fetch(\"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size\", {",
  "      method:\"post\", contentType:\"application/json; charset=UTF-8\", muteHttpExceptions:true,",
  "      headers:{ Authorization:\"Bearer \" + ScriptApp.getOAuthToken(), \"X-Upload-Content-Type\":mime, \"X-Upload-Content-Length\":String(peso) },",
  "      payload:JSON.stringify({ name:nome, parents:[o.cart], description:\"tecnico|k=\" + String(q.k || \"\") }) });",
  "    var h = r.getAllHeaders(), loc = h.Location || h.location;",
  "    if(r.getResponseCode() !== 200 || !loc) return { ok:false, errore:\"Drive non ha aperto il caricamento (\" + r.getResponseCode() + \")\" };",
  "    return { ok:true, sessione:String(loc), nome:nome };",
  "  }",
  "  if(q.azione === \"pubCaricaPezzo\"){",
  "    var x = socCaricaPezzo(q);",
  "    if(x.ok && x.fatto){",
  "      var L3 = LockService.getScriptLock(); L3.waitLock(10000);",
  "      try{",
  "        o = tecLeggi(t) || o; if(!Array.isArray(o.caricati)) o.caricati = [];",
  "        o.caricati.push({ id:x.id, nome:x.nome, k:String(q.k || \"\"), data:Date.now(), peso:x.peso, mime:x.mime });",
  "        if(o.caricati.length > 40) o.caricati = o.caricati.slice(-40);",
  "        tecScrivi(t, o);",
  "      }finally{ L3.releaseLock(); }",
  "    }",
  "    return x;",
  "  }",
  "  return { ok:false, errore:\"azione sconosciuta\" };",
  "}"
].join('\n');

function driveCfg(){ return { url:String(testoSalvato(DRIVE_URL) || '').trim(), chiave:String(testoSalvato(DRIVE_CHIAVE) || '').trim() }; }
function drivePronto(){ var c = driveCfg(); return /^https:\/\/script\.google\.com\/.+\/exec$/.test(c.url) && c.chiave.length >= 20; }
function mettiTesto(id, testo){
  var L = testiSalvati(), r = L.find(function(x){ return x && x.id === id; });
  if(r){ r.testo = testo; r._modificata = Date.now(); } else L.push({ id:id, testo:testo });
}
function driveChiama(azione, dati, cfg){
  cfg = cfg || driveCfg();
  var corpo = { chiave:cfg.chiave, azione:azione };
  Object.keys(dati || {}).forEach(function(k){ corpo[k] = dati[k]; });
  return fetch(cfg.url, { method:'POST', redirect:'follow', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body:JSON.stringify(corpo) })
    .then(function(r){ return r.text(); })
    .then(function(t){
      var o = null; try{ o = JSON.parse(t); }catch(e){}
      if(!o) throw new Error('lo script ha risposto in modo strano: controlla che sia pubblicato come "App web" con accesso "Chiunque"');
      if(!o.ok) throw new Error(o.errore || 'errore dello script');
      return o;
    });
}
function nomeCartella(im){
  return [im.ref ? 'Ref.' + im.ref : '', im.indirizzo || '', im.comune || ''].filter(Boolean).join(' - ') || 'Immobile';
}
function quando(iso){ var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + ' alle ' + m[4] + ':' + m[5] : ''; }
function linkCartella(im){ return (im && im.cartellaFoto && im.cartellaFoto.url) ? im.cartellaFoto.url : ''; }

/* il riquadro dentro la tappa Foto */
function bloccoDrive(a, im){
  var c = C(), id = jsq(a.id), cf = im.cartellaFoto, fot = fotDi(a), lav = _drv.lavoro && _drv.lavoro[im.uuid];
  var tf = norma(a).tappe.foto, h = '';
  if(cf && cf.url){
    var cond = Array.isArray(cf.condivisa) ? cf.condivisa : [];
    var emailFot = fot && fot.email ? String(fot.email).trim().toLowerCase() : '';
    var giaFot = emailFot && cond.some(function(m){ return String(m).toLowerCase() === emailFot; });
    var info = [];
    if(cf.file !== undefined && cf.file !== null) info.push(cf.file + (cf.file === 1 ? ' file' : ' file') + ' nella cartella' + (cf.ultimo ? ', ultimo caricato il ' + quando(cf.ultimo) : ''));
    if(cond.length) info.push('condivisa con ' + cond.join(', '));
    h += '<div class="acq-doc ok"><span style="color:' + c.ok + ';display:inline-flex">' + ico(I.cartella, 16) + '</span>'
      + '<span class="n" style="text-decoration:none;color:var(--text)">Cartella foto: ' + esc(cf.nome || 'Google Drive')
      + (info.length ? ' <span style="color:var(--text4);font-size:0.76rem">· ' + esc(info.join(' · ')) + '</span>' : '') + '</span>'
      + '<a class="gx-btn" href="' + esc(cf.url) + '" target="_blank" rel="noopener">Apri</a>'
      + (cf.id && drivePronto() ? '<button class="gx-btn" onclick="_acqDriveStato(\'' + id + '\')"' + (lav ? ' disabled' : '') + ' title="Conta i file caricati">' + ico(I.giro || I.ok) + ' Aggiorna</button>' : '')
      + '<button class="gx-btn" onclick="_acqDriveTogli(\'' + id + '\')" title="Toglie solo il collegamento: la cartella resta su Drive">Scollega</button></div>';
    if(tf.chi === 'fotografo' && fot && cf.id && drivePronto() && !giaFot){
      h += '<div class="acq-azioni">' + (emailFot
        ? '<button class="gx-btn pieno" onclick="_acqDriveCrea(\'' + id + '\')"' + (lav ? ' disabled' : '') + '>' + ico(I.cartella) + ' Condividi con ' + esc(bello(fot.nome || 'il fotografo')) + '</button><span class="nota">' + esc(emailFot) + '</span>'
        : '<span class="nota">Per condividere la cartella serve l\'email (Google) del fotografo nella Rubrica.</span>') + '</div>';
    }
  } else {
    h += '<div class="acq-azioni">'
      + (drivePronto()
          ? '<button class="gx-btn pieno" onclick="_acqDriveCrea(\'' + id + '\')"' + (lav ? ' disabled' : '') + '>' + ico(I.cartella) + (lav ? ' Creo la cartella…' : ' Crea la cartella su Drive') + '</button>'
            + '<span class="nota">' + esc('"' + nomeCartella(im) + '"' + (tf.chi === 'fotografo' && fot && fot.email ? ', condivisa con ' + fot.email : '')) + '</span>'
          : '<button class="gx-btn" onclick="_acqTesti()">' + ico(I.cartella) + ' Collega Google Drive</button><span class="nota">Una volta sola, poi le cartelle si creano da qui</span>')
      + '</div>'
      + '<div class="acq-campi"><label style="flex:1;min-width:240px">Oppure incolla il link di una cartella già fatta<input id="acq-drv-link" class="acq-in" placeholder="https://drive.google.com/drive/folders/…"></label>'
      + '<label style="justify-content:flex-end"><button class="gx-btn" style="padding:6px 12px" onclick="_acqDriveLink(\'' + id + '\',(document.getElementById(\'acq-drv-link\')||{}).value||\'\')">Collega</button></label></div>';
  }
  return h;
}

/* la parte di configurazione, nella pagina "Testi dei messaggi" */
function configDrive(){
  var c = C(), cfg = driveCfg();
  var passi = [
    'Apri <b>script.google.com</b> con il tuo account Google e premi <b>Nuovo progetto</b>.',
    'Cancella quello che c\'è, premi qui <b>Copia lo script</b> e incollalo. Salva (icona del dischetto).',
    'Premi qui <b>Genera chiave</b> e poi <b>Copia la chiave</b>. Nello script: <b>Impostazioni progetto</b> (ingranaggio) → <b>Proprietà dello script</b> → <b>Aggiungi</b>: nome esattamente <code>CHIAVE</code> (maiuscolo, senza spazi), valore incollato. Le proprietà <code>CARTELLA_ID</code>, <code>SOCIAL_ID</code> e <code>DOCUMENTI_ID</code> le crea lo script da solo: non toccarle. Salva.',
    'Torna all\'editor, scegli la funzione <b>autorizza</b> in alto e premi <b>Esegui</b>: Google chiede il permesso su Drive, concedilo.',
    'In alto a destra il pulsante blu <b>Esegui il deployment</b> (nelle versioni inglesi "Deploy") → <b>Nuovo deployment</b> → ingranaggio → <b>App web</b>. "Esegui come": <b>Me</b>. "Chi ha accesso": <b>Chiunque</b>. Premi <b>Esegui il deployment</b> e copia l\'<b>URL dell\'app web</b> (finisce con /exec).',
    'Incollalo qui sotto, premi <b>Prova il collegamento</b> e poi <b>Salva i testi</b>.'
  ];
  var h = '<div class="gx-nota" style="margin:0;padding:10px 16px">Con questo collegamento il gestionale crea da solo, nel tuo Google Drive, la cartella delle foto di ogni immobile e la condivide col fotografo. Lo stesso script serve al <b>Piano Social</b> del Marketing Hub: legge i lavori pronti dalla cartella <b>Social da programmare</b> e, dopo l\'uscita, li sposta in <b>Pubblicati</b>. E archivia i <b>documenti scansionati</b> nel percorso in una cartella a parte, <b>Documenti immobili - Gestionale</b>, che non viene condivisa con nessuno (i documenti d\'identità in una sottocartella <b>Identità</b>). Si fa una volta sola, circa 5 minuti.</div>'
    + '<ol style="margin:0;padding:10px 16px 10px 36px;font-size:0.84rem;line-height:1.6;color:var(--text2)">' + passi.map(function(p){ return '<li>' + p + '</li>'; }).join('') + '</ol>'
    + '<div class="gx-nota" style="margin:0;padding:0 16px 10px">Avevi già pubblicato lo script prima di questo aggiornamento? Incolla lo script nuovo al posto del vecchio, esegui di nuovo <b>autorizza</b> (chiede anche il permesso di "collegarsi a servizi esterni": serve per leggere i video a pezzi), poi <b>Esegui il deployment → Gestisci deployment</b> → matita → Versione <b>Nuova versione</b> → <b>Esegui il deployment</b>. L\'indirizzo resta lo stesso.</div>'
    + '<div class="acq-azioni"><button class="gx-btn" onclick="_acqDriveCopiaScript()">' + ico(I.copia) + ' Copia lo script</button>'
    + '<button class="gx-btn" onclick="_acqDriveChiave()">' + ico(I.chiave) + (cfg.chiave ? ' Genera una chiave nuova' : ' Genera chiave') + '</button>'
    + (cfg.chiave ? '<button class="gx-btn" onclick="_acqDriveCopiaChiave()">' + ico(I.copia) + ' Copia la chiave</button><span class="nota">Chiave pronta (' + cfg.chiave.length + ' caratteri, non viene mostrata)</span>' : '<span class="nota">Nessuna chiave ancora</span>')
    + '</div>'
    + '<div class="acq-campi"><label style="flex:1;min-width:260px">Indirizzo dell\'app web (URL /exec)<input id="acq-t-' + DRIVE_URL + '" class="acq-in" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(cfg.url) + '"></label>'
    + '<label style="justify-content:flex-end"><button class="gx-btn' + (drivePronto() ? '' : ' pieno') + '" style="padding:6px 12px" onclick="_acqDriveProva()">Prova il collegamento</button></label></div>'
    + (_drv.prova ? '<div class="gx-nota" style="margin:0;padding:10px 16px;color:' + (_drv.provaOk ? c.ok : c.ko) + ';font-weight:600">' + esc(_drv.prova) + '</div>' : '');
  return window.gxCol('Cartella delle foto su Google Drive', drivePronto() ? 'collegata' : 'da collegare', drivePronto() ? c.ok : c.am, h);
}

function copiaTesto(t, ok){
  var fatto = function(){ avviso(ok); };
  try{ if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(fatto, function(){ vecchio(); }); return; } }catch(e){}
  vecchio();
  function vecchio(){
    var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); fatto(); }catch(e){ avviso('Non riesco a copiare: seleziona e copia a mano'); }
    ta.remove();
  }
}

window._acqDriveCopiaScript = function(){ copiaTesto(DRIVE_SCRIPT, 'Script copiato: incollalo in script.google.com'); };
window._acqDriveChiave = function(){
  var fai = function(){
    var b = new Uint8Array(24); (window.crypto || window.msCrypto).getRandomValues(b);
    var k = Array.prototype.map.call(b, function(x){ return ('0' + x.toString(16)).slice(-2); }).join('');
    mettiTesto(DRIVE_CHIAVE, k); salva(); _drv.prova = ''; disegna();
    avviso('Chiave generata: copiala nelle Proprietà dello script');
  };
  if(driveCfg().chiave && typeof window.dlgConfirm === 'function')
    window.dlgConfirm('Con una chiave nuova lo script smette di rispondere finché non la incolli anche nelle sue Proprietà. Procedo?', '', 'Chiave nuova').then(function(ok){ if(ok) fai(); });
  else fai();
};
window._acqDriveCopiaChiave = function(){ var k = driveCfg().chiave; if(k) copiaTesto(k, 'Chiave copiata: incollala come valore di CHIAVE'); };
window._acqDriveProva = function(){
  var el = document.getElementById('acq-t-' + DRIVE_URL), url = String((el && el.value) || '').trim();
  var cfg = { url:url, chiave:driveCfg().chiave };
  if(!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)){ _drv.prova = 'L\'indirizzo deve essere quello dell\'app web: comincia con https://script.google.com/ e finisce con /exec.'; _drv.provaOk = false; disegna(); return; }
  if(!cfg.chiave){ _drv.prova = 'Prima premi "Genera chiave" e incollala nelle Proprietà dello script.'; _drv.provaOk = false; disegna(); return; }
  _drv.prova = 'Provo…'; _drv.provaOk = true; disegna();
  driveChiama('prova', {}, cfg).then(function(o){
    mettiTesto(DRIVE_URL, url); salva();
    _drv.prova = 'Collegato: le cartelle andranno in "' + (o.principale || 'Foto immobili - Gestionale') + '"' + (o.account ? ' sul Drive di ' + o.account : '') + '. Indirizzo salvato.'
      + (o.versione >= 5 ? ' Documenti scansionati: cartella "' + (o.documenti || 'Documenti immobili - Gestionale') + '" pronta, non condivisa con nessuno; lettura con l\'AI e pagina del tecnico pronte.'
        : (o.versione >= 4 ? ' Documenti scansionati: cartella pronta. Per la lettura con l\'AI dei documenti già su Drive e per la pagina del tecnico serve lo script nuovo (versione 5): copialo, incollalo e fai "Nuova versione".'
        : ' Per archiviare i documenti scansionati serve lo script nuovo (versione 5): copialo, incollalo, esegui "autorizza" e fai "Nuova versione".'))
      + (o.versione >= 3 ? ' Piano Social: cartella "' + (o.social || 'Social da programmare') + '" pronta, anche per caricare foto e video dal computer.' : (o.versione >= 2 ? ' Piano Social: la cartella va, ma per caricare foto e video dal computer serve lo script nuovo: copialo, incollalo e fai "Nuova versione".' : ' Attenzione: è lo script vecchio, il Piano Social non lo può usare: incolla quello nuovo e fai "Nuova versione".'));
    _drv.provaOk = true; disegna();
  }).catch(function(e){ _drv.prova = 'Non collegato: ' + ((e && e.message) || 'errore') + '.'; _drv.provaOk = false; disegna(); });
};
window._acqDriveCrea = function(acqId){
  var a = trova(acqId), im = immDi(a); if(!a || !im) return;
  if(!drivePronto()){ avviso('Prima collega Google Drive (Testi dei messaggi)'); return; }
  var tf = norma(a).tappe.foto, fot = tf.chi === 'fotografo' ? fotDi(a) : null;
  var email = fot && fot.email ? String(fot.email).trim() : '';
  if(!_drv.lavoro) _drv.lavoro = {};
  _drv.lavoro[im.uuid] = true; disegna();
  var prima = im.cartellaFoto && im.cartellaFoto.id ? im.cartellaFoto : null;
  driveChiama('crea', { nome:nomeCartella(im), id:prima ? prima.id : '', email:email }).then(function(o){
    delete _drv.lavoro[im.uuid];
    var cond = (prima && Array.isArray(prima.condivisa) ? prima.condivisa : []).slice();
    (o.condivisa || []).forEach(function(m){ if(cond.indexOf(m) < 0) cond.push(m); });
    im.cartellaFoto = { id:o.id, url:o.url, nome:o.nome, data:(prima && prima.data) || oggi(), condivisa:cond };
    im._modificata = Date.now();
    diario(a, prima ? 'Cartella delle foto condivisa con ' + (o.condivisa || []).join(', ') : 'Cartella delle foto creata su Google Drive' + ((o.condivisa || []).length ? ' e condivisa con ' + o.condivisa.join(', ') : ''));
    salva(); disegna();
    if((o.nonCondivisa || []).length) avviso('Cartella pronta, ma non ho potuto condividerla con ' + o.nonCondivisa.join(', ') + ': serve un indirizzo Google (Gmail o account Google)');
    else avviso(prima ? 'Cartella condivisa' : 'Cartella creata' + (email ? ' e condivisa col fotografo' : ''));
  }).catch(function(e){
    delete _drv.lavoro[im.uuid]; disegna();
    avviso('Cartella non creata: ' + ((e && e.message) || 'errore'));
  });
};
window._acqDriveStato = function(acqId){
  var a = trova(acqId), im = immDi(a); if(!im || !im.cartellaFoto || !im.cartellaFoto.id) return;
  if(!_drv.lavoro) _drv.lavoro = {};
  _drv.lavoro[im.uuid] = true; disegna();
  driveChiama('stato', { id:im.cartellaFoto.id }).then(function(o){
    delete _drv.lavoro[im.uuid];
    im.cartellaFoto.file = o.file; im.cartellaFoto.ultimo = o.ultimo || ''; im.cartellaFoto.controllata = oggi();
    if(o.nome) im.cartellaFoto.nome = o.nome;
    salva(); disegna();
    avviso(o.cestino ? 'Attenzione: la cartella è nel cestino di Drive' : (o.file + ' file nella cartella'));
  }).catch(function(e){ delete _drv.lavoro[im.uuid]; disegna(); avviso('Non riesco a leggere la cartella: ' + ((e && e.message) || 'errore')); });
};
window._acqDriveLink = function(acqId, link){
  var a = trova(acqId), im = immDi(a); if(!im) return;
  link = String(link || '').trim();
  var m = /drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([a-zA-Z0-9_-]{10,})/.exec(link);
  if(!m){ avviso('Incolla il link di una CARTELLA di Google Drive (drive.google.com/drive/folders/…)'); return; }
  im.cartellaFoto = { id:m[1], url:'https://drive.google.com/drive/folders/' + m[1], nome:nomeCartella(im), data:oggi(), condivisa:[] };
  im._modificata = Date.now();
  diario(a, 'Cartella delle foto collegata (link incollato)');
  salva(); disegna();
};
window._acqDriveTogli = function(acqId){
  var a = trova(acqId), im = immDi(a); if(!im || !im.cartellaFoto) return;
  var fai = function(){ delete im.cartellaFoto; im._modificata = Date.now(); diario(a, 'Cartella delle foto scollegata (su Drive resta)'); salva(); disegna(); };
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm('Tolgo il collegamento alla cartella? Su Google Drive la cartella e le foto restano.', '', 'Cartella foto').then(function(ok){ if(ok) fai(); });
  else fai();
};


/* ── 12. SCANSIONE DEI DOCUMENTI (pezzo 1) ────────────────────────────────
   [18 ott 2026] Scelte di Enzo:
   - archivio su Google Drive in una cartella A PARTE, "Documenti immobili -
     Gestionale", che non si condivide con nessuno (la cartella delle foto e'
     condivisa col fotografo: una sottocartella li' dentro la vedrebbe anche
     lui). Per immobile: "Ref.XXXX - via - comune" con "Documenti" e
     "Identità"; i documenti d'identita' (voce 14 della lista) solo in
     "Identità". Collegamento sulla SCHEDA IMMOBILE: im.cartellaDoc.
   - scanner nell'app: fotocamera del telefono, una foto per pagina; il
     gestionale propone i 4 angoli del foglio, Enzo li sistema col dito,
     poi raddrizza e schiarisce. Un PDF per documento, fatto qui senza
     librerie, nome "Ref.XXXX - Tipo - GG-MM-AAAA.pdf".
   - "Carica PDF" per chi usa lo scanner del telefono.
   - coda nella memoria interna del telefono (IndexedDB) se manca la rete:
     parte appena torna, CON IL GESTIONALE APERTO (a app chiusa i browser
     non mandano niente).
   - il documento si segna "ricevuto" nella stessa lista della scheda
     immobile (im.docsChecklist / im.docsProv), come la spunta a mano.
   I file archiviati stanno su im.docFile: [{ k, nome, id, url, data, pag,
   peso }]. La tappa "Archivio documenti" si vede nel percorso ma NON entra
   nel conto delle tappe fatte ne' nelle acquisizioni ferme: un documento
   ricevuto su carta resta valido anche se non lo scansioni.
   Caricamento: docCartelle + docCaricaInizio (script versione 4) e i pezzi
   con socCaricaPezzo, lo stesso del Piano Social, a pezzi da 4 MB. */

var DOC_IDENT = 14;                 /* la voce che va nella cartella "Identità" */
var SC_PEZZO = 4 * 1024 * 1024;     /* multiplo di 256 KB, come vuole Drive */
var SC_LATO = 1754;                 /* lato lungo della pagina: A4 a 150 dpi */
var SC_MAX_PDF = 40 * 1024 * 1024;
var CODA_DB = 'lecaseAZ_docCoda';

I.camera = '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>';
I.carica = '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>';
I.lucchetto = '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>';
I.allarga = '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>';
I.nuvola = '<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>';
I.galleria = '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>';

var _sc = null;                     /* lo scanner aperto (vedi scApri) */

/* [19 ott 2026] Scelta di Enzo: lo scanner anche nella SCHEDA IMMOBILE, per
   gli immobili che non hanno un percorso. Da dove si parte lo dice la
   "chiave": l'id del percorso, oppure 'u:' + uuid dell'immobile (scheda).
   Dalla scheda, se l'immobile ha un percorso aperto, il diario va su quello;
   alla fine si torna comunque alla scheda. */
function ctxDoc(key){
  key = String(key || '');
  if(key.indexOf('u:') === 0){
    var im = immPerUuid(key.slice(2));
    var a = im ? (vivi().find(function(x){ return x.immUuid === im.uuid && x.stato !== 'chiusa'; }) || null) : null;
    return { key:key, da:'scheda', a:a, im:im };
  }
  var a2 = trova(key);
  return { key:key, da:'percorso', a:a2, im:immDi(a2) };
}
/* ridisegna quello che si vede: la pagina del percorso o la scheda immobile */
function dopoArchivio(key){
  if(ctxDoc(key).da === 'scheda') schedaRidisegna(key, true);
  else disegna();
}
var _coda = { lista:[], mem:[], corre:false, msg:'', pct:0 };

/* ── la coda nella memoria interna del telefono ── */
function codaDb(){
  return new Promise(function(ok, ko){
    if(!window.indexedDB) return ko(new Error('memoria interna non disponibile'));
    var r = indexedDB.open(CODA_DB, 1);
    r.onupgradeneeded = function(){ if(!r.result.objectStoreNames.contains('coda')) r.result.createObjectStore('coda', { keyPath:'id' }); };
    r.onsuccess = function(){ ok(r.result); };
    r.onerror = function(){ ko(r.error || new Error('memoria interna non apribile')); };
  });
}
function codaFai(modo, fn){
  return codaDb().then(function(db){
    return new Promise(function(ok, ko){
      var tx = db.transaction('coda', modo), out, rq = fn(tx.objectStore('coda'));
      if(rq) rq.onsuccess = function(){ out = rq.result; };
      tx.oncomplete = function(){ db.close(); ok(out); };
      tx.onerror = tx.onabort = function(){ db.close(); ko(tx.error || new Error('errore della memoria interna')); };
    });
  });
}
function codaTutti(){
  return codaFai('readonly', function(st){ return st.getAll(); }).catch(function(){ return []; })
    .then(function(L){ return (L || []).concat(_coda.mem).sort(function(x, y){ return x.creato - y.creato; }); });
}
/* se la memoria interna non c'e' (navigazione privata) il documento resta in
   memoria finche' la pagina e' aperta: meglio che perderlo */
function codaMetti(x){
  return codaFai('readwrite', function(st){ return st.put(x); })
    .then(function(){ _coda.mem = _coda.mem.filter(function(y){ return y.id !== x.id; }); })
    .catch(function(){ if(!_coda.mem.some(function(y){ return y.id === x.id; })) _coda.mem.push(x); });
}
function codaTogli(id){
  _coda.mem = _coda.mem.filter(function(y){ return y.id !== id; });
  return codaFai('readwrite', function(st){ return st.delete(id); }).catch(function(){});
}
/* la lista "leggera" per il disegno (senza i dati del file) */
function codaAggiorna(){
  return codaTutti().then(function(L){
    _coda.lista = L.map(function(x){ return { id:x.id, immUuid:x.immUuid, k:x.k, nome:x.nome, peso:x.peso, pag:x.pag, creato:x.creato, errore:x.errore || '' }; });
    archRidisegna();
  });
}
function codaDi(im){ return _coda.lista.filter(function(x){ return im && x.immUuid === im.uuid; }); }

/* ── nomi ── */
function nomeTipo(k, altro){ return k === 'altro' ? (String(altro || '').trim() || 'Altro documento') : nomeDoc(k); }
function dataFile(){ var d = oggi().split('-'); return d[2] + '-' + d[1] + '-' + d[0]; }
function nomeFileDoc(im, k, altro, est){
  var base = ((im && im.ref) ? 'Ref.' + im.ref : 'Immobile') + ' - ' + nomeTipo(k, altro) + ' - ' + dataFile();
  base = base.replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  var usati = {};
  (Array.isArray(im && im.docFile) ? im.docFile : []).forEach(function(f){ usati[String(f.nome).toLowerCase()] = 1; });
  codaDi(im).forEach(function(f){ usati[String(f.nome).toLowerCase()] = 1; });
  var nome = base + '.' + est, n = 2;
  while(usati[nome.toLowerCase()]) nome = base + ' (' + (n++) + ').' + est;
  return nome;
}
/* i tipi fra cui scegliere: la lista del proprietario + quella del tecnico,
   prima quelli che mancano, poi "Altro documento" */
function tipiDoc(a, im){
  var visti = {}, L = [];
  docsDi(a, 'proprietario', im).concat(docsDi(a, 'tecnico', im)).forEach(function(n){
    var key = String(n); if(visti[key]) return; visti[key] = 1;
    if(!serve(a, n)) return;
    L.push({ k:n, nome:nomeDoc(n), ok:raccolto(im, n) });
  });
  L.sort(function(x, y){ return (x.ok ? 1 : 0) - (y.ok ? 1 : 0); });
  L.push({ k:'altro', nome:'Altro documento (scrivi il nome)', ok:false });
  return L;
}
function chiaveDa(v){ return (v === 'altro' || eProv(v)) ? v : parseInt(v, 10); }

/* segna "ricevuto" nella lista della scheda immobile (come la spunta a mano) */
function segnaRicevuto(a, im, k){
  if(k === 'altro') return;
  if(eProv(k)){
    if(!im.docsProv || typeof im.docsProv !== 'object') im.docsProv = {};
    im.docsProv[k.slice(2)] = true;
  } else {
    if(!im.docsChecklist || typeof im.docsChecklist !== 'object') im.docsChecklist = {};
    im.docsChecklist[k] = true;
  }
  im._modificata = Date.now();
}

/* ── il PDF, fatto qui: una pagina per foto, larga come un A4 ── */
function faiPdf(pagine){
  var parti = [], pos = 0, off = [], n = pagine.length;
  function t(s){ var u = new Uint8Array(s.length); for(var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; parti.push(u); pos += u.length; }
  function b(u){ parti.push(u); pos += u.length; }
  t('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  off[1] = pos; t('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  var kids = []; for(var i = 0; i < n; i++) kids.push((3 + 3 * i) + ' 0 R');
  off[2] = pos; t('2 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>\nendobj\n');
  pagine.forEach(function(p, i){
    var W = 595.28, H = W * p.h / p.w;
    if(H > 841.89){ H = 841.89; W = H * p.w / p.h; }
    W = W.toFixed(2); H = H.toFixed(2);
    var np = 3 + 3 * i, ni = np + 1, nc = np + 2, jpg = new Uint8Array(p.jpg);
    off[np] = pos; t(np + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 ' + ni + ' 0 R >> >> /Contents ' + nc + ' 0 R >>\nendobj\n');
    off[ni] = pos; t(ni + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
    b(jpg); t('\nendstream\nendobj\n');
    var cs = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q';
    off[nc] = pos; t(nc + ' 0 obj\n<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream\nendobj\n');
  });
  var tot = 3 + 3 * n, xref = pos, x = 'xref\n0 ' + tot + '\n0000000000 65535 f \n';
  for(var k = 1; k < tot; k++) x += ('0000000000' + off[k]).slice(-10) + ' 00000 n \n';
  t(x + 'trailer\n<< /Size ' + tot + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  var out = new Uint8Array(pos), o = 0;
  parti.forEach(function(u){ out.set(u, o); o += u.length; });
  return out.buffer;
}

/* ── l'immagine: angoli, raddrizzatura, schiarita ── */
function ordinaAngoli(P){
  var s = P.map(function(p){ return p[0] + p[1]; }), d = P.map(function(p){ return p[0] - p[1]; });
  var iMin = function(v){ return v.indexOf(Math.min.apply(null, v)); }, iMax = function(v){ return v.indexOf(Math.max.apply(null, v)); };
  return [P[iMin(s)], P[iMax(d)], P[iMax(s)], P[iMin(d)]].map(function(p){ return [p[0], p[1]]; });   /* alto-sx, alto-dx, basso-dx, basso-sx */
}
function angoliPieni(w, h, m){ m = m || 0; return [[w * m, h * m], [w * (1 - m), h * m], [w * (1 - m), h * (1 - m)], [w * m, h * (1 - m)]]; }
/* proposta degli angoli: il foglio e' la macchia chiara piu' grande */
function trovaAngoli(cv){
  try{
    var k = 256 / Math.max(cv.width, cv.height), w = Math.max(8, Math.round(cv.width * k)), h = Math.max(8, Math.round(cv.height * k));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.drawImage(cv, 0, 0, w, h);
    var d = x.getImageData(0, 0, w, h).data, N = w * h, g = new Uint8Array(N), hist = new Array(256).fill(0);
    for(var i = 0; i < N; i++){ var v = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000 | 0; g[i] = v; hist[v]++; }
    /* soglia di Otsu */
    var sum = 0; for(i = 0; i < 256; i++) sum += i * hist[i];
    var sB = 0, wB = 0, best = 0, soglia = 128;
    for(i = 0; i < 256; i++){
      wB += hist[i]; if(!wB) continue; var wF = N - wB; if(!wF) break;
      sB += i * hist[i]; var mB = sB / wB, mF = (sum - sB) / wF, tra = wB * wF * (mB - mF) * (mB - mF);
      if(tra > best){ best = tra; soglia = i; }
    }
    /* la macchia chiara piu' grande */
    var lab = new Int32Array(N), piu = 0, piuN = 0, coda = new Int32Array(N);
    for(i = 0; i < N; i++){
      if(g[i] <= soglia || lab[i]) continue;
      var id = i + 1, testa = 0, fondo = 0, cnt = 0; coda[fondo++] = i; lab[i] = id;
      while(testa < fondo){
        var p = coda[testa++], px = p % w, py = (p / w) | 0; cnt++;
        if(px > 0 && !lab[p - 1] && g[p - 1] > soglia){ lab[p - 1] = id; coda[fondo++] = p - 1; }
        if(px < w - 1 && !lab[p + 1] && g[p + 1] > soglia){ lab[p + 1] = id; coda[fondo++] = p + 1; }
        if(py > 0 && !lab[p - w] && g[p - w] > soglia){ lab[p - w] = id; coda[fondo++] = p - w; }
        if(py < h - 1 && !lab[p + w] && g[p + w] > soglia){ lab[p + w] = id; coda[fondo++] = p + w; }
      }
      if(cnt > piuN){ piuN = cnt; piu = id; }
    }
    var frazione = piuN / N;
    if(!piu || frazione < 0.12 || frazione > 0.97) return angoliPieni(cv.width, cv.height, 0.04);
    var P = [null, null, null, null], val = [Infinity, -Infinity, -Infinity, Infinity];
    for(i = 0; i < N; i++){
      if(lab[i] !== piu) continue;
      var X = i % w, Y = (i / w) | 0, s = X + Y, df = X - Y;
      if(s < val[0]){ val[0] = s; P[0] = [X, Y]; }
      if(df > val[1]){ val[1] = df; P[1] = [X, Y]; }
      if(s > val[2]){ val[2] = s; P[2] = [X, Y]; }
      if(df < val[3]){ val[3] = df; P[3] = [X, Y]; }
    }
    return P.map(function(p){ return [Math.min(cv.width, (p[0] + 0.5) / k), Math.min(cv.height, (p[1] + 0.5) / k)]; });
  }catch(e){ return angoliPieni(cv.width, cv.height, 0.04); }
}
/* la trasformazione che porta il rettangolo w x h sui 4 angoli della foto */
function omografia(w, h, Q){
  var S = [[0, 0], [w, 0], [w, h], [0, h]], A = [], B = [];
  for(var i = 0; i < 4; i++){
    var x = S[i][0], y = S[i][1], u = Q[i][0], v = Q[i][1];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  for(var c = 0; c < 8; c++){
    var mx = c; for(var r = c + 1; r < 8; r++) if(Math.abs(A[r][c]) > Math.abs(A[mx][c])) mx = r;
    var tA = A[c]; A[c] = A[mx]; A[mx] = tA; var tB = B[c]; B[c] = B[mx]; B[mx] = tB;
    for(r = 0; r < 8; r++){
      if(r === c) continue;
      var f = A[r][c] / (A[c][c] || 1e-12);
      for(var j = c; j < 8; j++) A[r][j] -= f * A[c][j];
      B[r] -= f * B[c];
    }
  }
  return B.map(function(b, i){ return b / (A[i][i] || 1e-12); });
}
function dist(p, q){ return Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1])); }
/* raddrizza e schiarisce: torna { blob, w, h } */
function elaboraPagina(cv, Q, filtro){
  var w = Math.max(dist(Q[0], Q[1]), dist(Q[3], Q[2])), h = Math.max(dist(Q[0], Q[3]), dist(Q[1], Q[2]));
  var k = Math.min(1, SC_LATO / Math.max(w, h)); w = Math.max(50, Math.round(w * k)); h = Math.max(50, Math.round(h * k));
  var H = omografia(w, h, Q);
  var sw = cv.width, sh = cv.height, sd = cv.getContext('2d').getImageData(0, 0, sw, sh).data;
  var out = document.createElement('canvas'); out.width = w; out.height = h;
  var ox = out.getContext('2d'), od = ox.createImageData(w, h), D2 = od.data;
  for(var y = 0; y < h; y++){
    for(var x = 0; x < w; x++){
      var den = H[6] * x + H[7] * y + 1, u = (H[0] * x + H[1] * y + H[2]) / den, v = (H[3] * x + H[4] * y + H[5]) / den;
      var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, o = (y * w + x) * 4;
      if(x0 < 0){ x0 = 0; fx = 0; } if(y0 < 0){ y0 = 0; fy = 0; }
      if(x0 >= sw - 1){ x0 = sw - 2; fx = 1; } if(y0 >= sh - 1){ y0 = sh - 2; fy = 1; }
      var a = (y0 * sw + x0) * 4, b = a + 4, c = a + sw * 4, d = c + 4;
      for(var ch = 0; ch < 3; ch++){
        D2[o + ch] = (sd[a + ch] * (1 - fx) + sd[b + ch] * fx) * (1 - fy) + (sd[c + ch] * (1 - fx) + sd[d + ch] * fx) * fy;
      }
      D2[o + 3] = 255;
    }
  }
  ox.putImageData(od, 0, 0);
  if(filtro !== 'originale') schiarisci(out, filtro);
  return new Promise(function(ok, ko){
    out.toBlob(function(bl){ if(bl) ok({ blob:bl, w:w, h:h }); else ko(new Error('non riesco a fare la pagina')); }, 'image/jpeg', filtro === 'doc' ? 0.7 : 0.8);
  });
}
/* la luce del foglio: si rimpicciolisce la pagina, in ogni zona si prende il
   punto piu' chiaro (la carta, non le scritte), si ammorbidisce e la si
   toglie: il fondo diventa bianco anche con le ombre, senza aloni */
function filtroMax(L, w, h, r){
  var T = new Float32Array(L.length), O = new Float32Array(L.length), x, y, i, m;
  for(y = 0; y < h; y++) for(x = 0; x < w; x++){ m = 0; for(i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) if(L[y * w + i] > m) m = L[y * w + i]; T[y * w + x] = m; }
  for(y = 0; y < h; y++) for(x = 0; x < w; x++){ m = 0; for(i = Math.max(0, y - r); i <= Math.min(h - 1, y + r); i++) if(T[i * w + x] > m) m = T[i * w + x]; O[y * w + x] = m; }
  return O;
}
function filtroMedia(L, w, h, r){
  var T = new Float32Array(L.length), O = new Float32Array(L.length), x, y, i, s, n;
  for(y = 0; y < h; y++) for(x = 0; x < w; x++){ s = 0; n = 0; for(i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++){ s += L[y * w + i]; n++; } T[y * w + x] = s / n; }
  for(y = 0; y < h; y++) for(x = 0; x < w; x++){ s = 0; n = 0; for(i = Math.max(0, y - r); i <= Math.min(h - 1, y + r); i++){ s += T[i * w + x]; n++; } O[y * w + x] = s / n; }
  return O;
}
function schiarisci(cv, filtro){
  var w = cv.width, h = cv.height, x = cv.getContext('2d');
  var k = Math.max(1, Math.max(w, h) / 200), sw = Math.max(4, Math.round(w / k)), sh = Math.max(4, Math.round(h / k));
  var p = cv, pw = w, ph = h;
  while(pw / 2 >= sw && ph / 2 >= sh){
    var n = document.createElement('canvas'); n.width = Math.max(1, pw >> 1); n.height = Math.max(1, ph >> 1);
    n.getContext('2d').drawImage(p, 0, 0, n.width, n.height); p = n; pw = n.width; ph = n.height;
  }
  var pic = document.createElement('canvas'); pic.width = sw; pic.height = sh;
  var px = pic.getContext('2d'); px.drawImage(p, 0, 0, sw, sh);
  var sd = px.getImageData(0, 0, sw, sh), S = sd.data, L = new Float32Array(sw * sh), i;
  for(i = 0; i < L.length; i++) L[i] = (S[i * 4] * 299 + S[i * 4 + 1] * 587 + S[i * 4 + 2] * 114) / 1000;
  L = filtroMedia(filtroMax(L, sw, sh, 3), sw, sh, 4);
  for(i = 0; i < L.length; i++){ S[i * 4] = S[i * 4 + 1] = S[i * 4 + 2] = L[i]; S[i * 4 + 3] = 255; }
  px.putImageData(sd, 0, 0);
  var fondo = document.createElement('canvas'); fondo.width = w; fondo.height = h;
  var fx = fondo.getContext('2d'); fx.imageSmoothingEnabled = true; fx.imageSmoothingQuality = 'high'; fx.drawImage(pic, 0, 0, w, h);
  var F = fx.getImageData(0, 0, w, h).data, im = x.getImageData(0, 0, w, h), D2 = im.data;
  for(i = 0; i < D2.length; i += 4){
    var lf = F[i] + 1;
    if(filtro === 'doc'){
      var l = (D2[i] * 299 + D2[i + 1] * 587 + D2[i + 2] * 114) / 1000;
      var r = l / lf, v = (r - 0.45) / 0.45; v = v < 0 ? 0 : (v > 1 ? 1 : v); v = Math.pow(v, 1.5) * 255;
      D2[i] = D2[i + 1] = D2[i + 2] = v;
    } else {
      var g = Math.min(1.9, 250 / lf);
      for(var ch = 0; ch < 3; ch++){ var c2 = D2[i + ch] * g; D2[i + ch] = c2 > 255 ? 255 : c2; }
    }
  }
  x.putImageData(im, 0, 0);
}
/* la foto nel canvas di lavoro (lato lungo al massimo 2400) */
function caricaFoto(file){
  return new Promise(function(ok, ko){
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function(){
      var k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); ko(new Error('foto non leggibile dal browser (prova in JPG)')); };
    img.src = url;
  });
}
function ruota(cv){
  var r = document.createElement('canvas'); r.width = cv.height; r.height = cv.width;
  var x = r.getContext('2d'); x.translate(r.width, 0); x.rotate(Math.PI / 2); x.drawImage(cv, 0, 0);
  return r;
}

/* ── lo scanner a tutto schermo ── */
function scChiudi(){
  var el = document.getElementById('acq-sc'); if(el) el.remove();
  if(_sc) (_sc.pagine || []).forEach(function(p){ try{ URL.revokeObjectURL(p.url); }catch(e){} });
  _sc = null;
  window.removeEventListener('resize', scDisegnaFoto);
}
function scBox(){
  var el = document.getElementById('acq-sc');
  if(!el){ el = document.createElement('div'); el.id = 'acq-sc'; document.body.appendChild(el); window.addEventListener('resize', scDisegnaFoto); }
  return el;
}
function scTesta(titolo){
  return '<div class="sc-testa"><b>' + esc(titolo) + '</b><span style="flex:1"></span><button class="sc-btn" title="Chiudi senza salvare" onclick="_acqScChiudi()">' + ico(I.x, 18) + '</button></div>';
}
function scSceltaTipo(){
  var x = ctxDoc(_sc.key), a = x.a, im = x.im, T = tipiDoc(a, im);
  return '<label class="sc-lab">Che documento è'
    + '<select class="sc-in" onchange="_acqScTipo(this.value)">' + T.map(function(t){
        return '<option value="' + esc(String(t.k)) + '"' + (String(t.k) === String(_sc.k) ? ' selected' : '') + '>' + esc(t.nome + (t.ok ? ' — già ricevuto' : '')) + '</option>';
      }).join('') + '</select></label>'
    + (_sc.k === 'altro' ? '<label class="sc-lab">Nome del documento<input class="sc-in" value="' + esc(_sc.altro || '') + '" placeholder="es. Permesso di costruire 1985" oninput="_acqScAltro(this.value)"></label>' : '')
    + '<div class="sc-nota" id="acq-sc-nome">' + scNomeTesto() + '</div>';
}
function scNomeTesto(){
  var im = ctxDoc(_sc.key).im;
  var dove = _sc.k === DOC_IDENT ? 'cartella <b>Identità</b> (riservata)' : 'cartella <b>Documenti</b>';
  return 'Nome del file: <b>' + esc(nomeFileDoc(im, _sc.k, _sc.altro, 'pdf')) + '</b> · va nella ' + dove;
}
function scDisegna(){
  if(!_sc) return;
  var el = scBox();
  if(_sc.foto){ scDisegnaModifica(el); return; }
  var P = _sc.pagine, h = scTesta(_sc.modo === 'pdf' ? 'Carica un PDF' : 'Scansiona un documento');
  h += '<div class="sc-corpo">' + scSceltaTipo();
  if(_sc.modo === 'pdf'){
    h += '<div class="sc-azioni"><button class="sc-btn pieno" title="Scegli il PDF fatto con lo scanner del telefono o salvato sul computer" onclick="_acqScScegliPdf()">' + ico(I.carica, 18) + ' Scegli il PDF</button></div>'
      + '<div class="sc-nota">Il PDF viene rinominato e archiviato così com\'è. Massimo 40 MB.</div>';
  } else {
    h += '<div class="sc-pagine">' + P.map(function(p, i){
        return '<div class="sc-pag"><img src="' + p.url + '" alt=""><span class="sc-num">' + (i + 1) + '</span>'
          + '<button class="sc-via" title="Togli questa pagina" onclick="_acqScTogliPag(' + i + ')">' + ico(I.x, 14) + '</button></div>';
      }).join('')
      + '<button class="sc-pag sc-agg" title="Apre la fotocamera: fotografa il foglio intero, anche un po\' storto" onclick="_acqScFoto(true)">' + ico(I.camera, 28) + '<span>' + (P.length ? 'Pagina ' + (P.length + 1) : 'Prima pagina') + '</span></button>'
      + '</div>'
      + '<div class="sc-azioni">'
      + '<button class="sc-btn" title="Una foto già fatta, dalla galleria o dal computer" onclick="_acqScFoto(false)">' + ico(I.galleria, 18) + ' Dalla galleria</button>'
      + '<span style="flex:1"></span>'
      + '<button class="sc-btn pieno" onclick="_acqScSalva()"' + (P.length && !_sc.lavoro ? '' : ' disabled') + ' title="Unisce le pagine in un PDF, lo segna ricevuto e lo manda su Drive">' + ico(I.ok, 18) + (_sc.lavoro ? ' ' + esc(_sc.lavoro) : ' Salva il PDF' + (P.length ? ' (' + P.length + (P.length === 1 ? ' pagina)' : ' pagine)') : '')) + '</button>'
      + '</div>'
      + '<div class="sc-nota">Una foto per pagina, con il foglio su un piano più scuro. Dopo ogni foto sistemi gli angoli col dito.</div>';
  }
  h += '</div>';
  el.innerHTML = h;
}
function scDisegnaModifica(el){
  var F = _sc.foto;
  el.innerHTML = scTesta('Pagina ' + (_sc.pagine.length + 1) + ' — sistema gli angoli')
    + '<div class="sc-tela" id="acq-sc-tela"><canvas id="acq-sc-cv"></canvas></div>'
    + '<div class="sc-barra">'
    + '<button class="sc-btn" title="Gira la foto di un quarto" onclick="_acqScRuota()">' + ico(I.giro, 18) + ' Ruota</button>'
    + '<button class="sc-btn" title="Prende tutta la foto, senza ritagliare" onclick="_acqScTutta()">' + ico(I.allarga, 18) + ' Tutta</button>'
    + '<div class="sc-scelta">' + [['doc','Documento','Bianco e nero, fondo bianco: il più leggibile e leggero'],['colori','Colori','Schiarito ma a colori: per timbri, planimetrie colorate'],['originale','Originale','Solo raddrizzato, senza ritocchi']].map(function(v){
        return '<button class="' + (F.filtro === v[0] ? 'on' : '') + '" title="' + esc(v[2]) + '" onclick="_acqScFiltro(\'' + v[0] + '\')">' + v[1] + '</button>';
      }).join('') + '</div>'
    + '<span style="flex:1"></span>'
    + '<button class="sc-btn" onclick="_acqScScarta()" title="Butta questa foto">Scarta</button>'
    + '<button class="sc-btn pieno" onclick="_acqScUsa()"' + (F.lavoro ? ' disabled' : '') + '>' + ico(I.ok, 18) + (F.lavoro ? ' Raddrizzo…' : ' Usa questa pagina') + '</button>'
    + '</div>';
  scDisegnaFoto();
  var cv = document.getElementById('acq-sc-cv');
  if(cv){
    cv.addEventListener('pointerdown', scGiu);
    cv.addEventListener('pointermove', scMuovi);
    cv.addEventListener('pointerup', scSu);
    cv.addEventListener('pointercancel', scSu);
  }
}
/* disegna foto, foglio e maniglie nel canvas a video */
function scDisegnaFoto(){
  if(!_sc || !_sc.foto) return;
  var tela = document.getElementById('acq-sc-tela'), cv = document.getElementById('acq-sc-cv'); if(!tela || !cv) return;
  var F = _sc.foto, src = F.cv, dpr = window.devicePixelRatio || 1;
  var bw = tela.clientWidth - 24, bh = tela.clientHeight - 24;
  var k = Math.min(bw / src.width, bh / src.height); if(!(k > 0)) k = 0.1;
  var w = Math.round(src.width * k), h = Math.round(src.height * k);
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  F.scala = k;
  var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.drawImage(src, 0, 0, w, h);
  var Q = F.angoli.map(function(p){ return [p[0] * k, p[1] * k]; });
  /* fuori dal foglio un velo scuro */
  x.save(); x.beginPath(); x.rect(0, 0, w, h); x.moveTo(Q[0][0], Q[0][1]); for(var i = 3; i >= 0; i--) x.lineTo(Q[i][0], Q[i][1]); x.closePath();
  x.fillStyle = 'rgba(0,0,0,.45)'; x.fill('evenodd'); x.restore();
  var brand = '#EA580C'; try{ brand = getComputedStyle(document.body).getPropertyValue('--brand').trim() || brand; }catch(e){}
  x.lineWidth = 2.5; x.strokeStyle = brand; x.beginPath(); x.moveTo(Q[0][0], Q[0][1]); for(i = 1; i < 4; i++) x.lineTo(Q[i][0], Q[i][1]); x.closePath(); x.stroke();
  Q.forEach(function(p, j){
    x.beginPath(); x.arc(p[0], p[1], F.presa === j ? 17 : 13, 0, Math.PI * 2);
    x.fillStyle = 'rgba(255,255,255,.88)'; x.fill(); x.lineWidth = 3; x.strokeStyle = brand; x.stroke();
  });
}
function scPunto(e){
  var cv = e.currentTarget, r = cv.getBoundingClientRect(), k = _sc.foto.scala || 1;
  return [(e.clientX - r.left) / k, (e.clientY - r.top) / k];
}
function scGiu(e){
  if(!_sc || !_sc.foto) return;
  var p = scPunto(e), F = _sc.foto, k = F.scala || 1, meglio = -1, dm = 44 / k;
  F.angoli.forEach(function(q, j){ var d = dist(p, q); if(d < dm){ dm = d; meglio = j; } });
  if(meglio < 0) return;
  F.presa = meglio; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); scDisegnaFoto();
}
function scMuovi(e){
  if(!_sc || !_sc.foto || _sc.foto.presa === undefined || _sc.foto.presa < 0) return;
  var F = _sc.foto, p = scPunto(e);
  F.angoli[F.presa] = [Math.max(0, Math.min(F.cv.width, p[0])), Math.max(0, Math.min(F.cv.height, p[1]))];
  e.preventDefault(); scDisegnaFoto();
}
function scSu(){ if(_sc && _sc.foto){ _sc.foto.presa = -1; scDisegnaFoto(); } }

window._acqScChiudi = function(){
  if(_sc && _sc.pagine.length && typeof window.dlgConfirm === 'function'){
    window.dlgConfirm('Chiudo lo scanner? Le ' + _sc.pagine.length + ' pagine fotografate non sono ancora salvate e andranno perse.', '', 'Scansione').then(function(ok){ if(ok) scChiudi(); });
  } else scChiudi();
};
window._acqScTipo = function(v){ _sc.k = chiaveDa(v); scDisegna(); };
window._acqScAltro = function(v){ _sc.altro = v; var el = document.getElementById('acq-sc-nome'); if(el) el.innerHTML = scNomeTesto(); };
window._acqScFoto = function(fotocamera){
  var i = document.createElement('input');
  i.type = 'file'; i.accept = 'image/*';
  if(fotocamera) i.setAttribute('capture', 'environment');
  i.onchange = function(){
    var f = i.files && i.files[0]; if(!f) return;
    caricaFoto(f).then(function(cv){
      _sc.foto = { cv:cv, angoli:trovaAngoli(cv), filtro:_sc.filtro || 'doc', presa:-1 };
      scDisegna();
    }).catch(function(e){ avviso((e && e.message) || 'Foto non leggibile'); });
  };
  i.click();
};
window._acqScRuota = function(){
  var F = _sc.foto, H0 = F.cv.height;
  F.cv = ruota(F.cv);
  F.angoli = ordinaAngoli(F.angoli.map(function(p){ return [H0 - p[1], p[0]]; }));
  scDisegnaFoto();
};
window._acqScTutta = function(){ var F = _sc.foto; F.angoli = angoliPieni(F.cv.width, F.cv.height, 0); scDisegnaFoto(); };
window._acqScFiltro = function(f){ _sc.foto.filtro = f; _sc.filtro = f; scDisegna(); };
window._acqScScarta = function(){ _sc.foto = null; scDisegna(); };
window._acqScUsa = function(){
  var F = _sc.foto; if(!F || F.lavoro) return;
  F.lavoro = true; scDisegna();
  setTimeout(function(){   /* lascia al telefono il tempo di mostrare "Raddrizzo…" */
    elaboraPagina(F.cv, ordinaAngoli(F.angoli), F.filtro).then(function(r){
      return r.blob.arrayBuffer().then(function(buf){
        _sc.pagine.push({ jpg:buf, w:r.w, h:r.h, url:URL.createObjectURL(r.blob) });
        _sc.foto = null; scDisegna();
      });
    }).catch(function(e){ F.lavoro = false; scDisegna(); avviso('Pagina non riuscita: ' + ((e && e.message) || 'errore')); });
  }, 30);
};
window._acqScTogliPag = function(i){
  var p = _sc.pagine[i]; if(p) try{ URL.revokeObjectURL(p.url); }catch(e){}
  _sc.pagine.splice(i, 1); scDisegna();
};
/* un documento pronto: in coda, ricevuto, e via verso Drive */
function scMettiInCoda(dati, mime, pag){
  var cx = ctxDoc(_sc.key), a = cx.a, im = cx.im; if(!im) return Promise.reject(new Error('immobile non trovato'));
  if(_sc.k === 'altro' && !String(_sc.altro || '').trim()) return Promise.reject(new Error('scrivi il nome del documento'));
  var x = { id:nuovoId(), immUuid:im.uuid, acqId:a ? a.id : '', k:_sc.k, nome:nomeFileDoc(im, _sc.k, _sc.altro, 'pdf'), mime:mime, dati:dati, peso:dati.byteLength, pag:pag, creato:Date.now() };
  return codaMetti(x).then(function(){
    segnaRicevuto(a, im, _sc.k);
    if(a) diario(a, (_sc.k === 'altro' ? 'Documento scansionato: ' : 'Ricevuto e scansionato: ') + nomeTipo(_sc.k, _sc.altro) + ' (' + x.nome + ')');
    salva();
    return x;
  });
}
window._acqScSalva = function(){
  if(!_sc || !_sc.pagine.length || _sc.lavoro) return;
  if(_sc.k === 'altro' && !String(_sc.altro || '').trim()){ avviso('Scrivi il nome del documento'); return; }
  _sc.lavoro = 'Preparo il PDF…'; scDisegna();
  setTimeout(function(){
    var pdf;
    try{ pdf = faiPdf(_sc.pagine); }catch(e){ _sc.lavoro = ''; scDisegna(); avviso('PDF non riuscito: ' + e.message); return; }
    var key = _sc.key;
    scMettiInCoda(pdf, 'application/pdf', _sc.pagine.length).then(function(x){
      scChiudi(); dopoArchivio(key); codaAggiorna().then(codaGira);
      avviso(navigator.onLine === false ? 'Salvato sul telefono: parte per Drive appena torna la rete' : 'Documento salvato: lo mando su Drive');
      ldProponiDopo(key, x);
    }).catch(function(e){ _sc.lavoro = ''; scDisegna(); avviso('Non salvato: ' + ((e && e.message) || 'errore')); });
  }, 30);
};
window._acqScScegliPdf = function(){
  if(_sc.k === 'altro' && !String(_sc.altro || '').trim()){ avviso('Scrivi prima il nome del documento'); return; }
  var i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf,.pdf';
  i.onchange = function(){
    var f = i.files && i.files[0]; if(!f) return;
    if(f.size > SC_MAX_PDF){ avviso('Il PDF pesa ' + dimTesto(f.size) + ': il massimo è 40 MB'); return; }
    var key = _sc.key;
    f.arrayBuffer().then(function(buf){
      var t = new Uint8Array(buf.slice(0, 5)), testa = String.fromCharCode.apply(null, t);
      if(testa !== '%PDF-') throw new Error('il file scelto non è un PDF');
      return scMettiInCoda(buf, 'application/pdf', 0);
    }).then(function(x){
      scChiudi(); dopoArchivio(key); codaAggiorna().then(codaGira);
      avviso(navigator.onLine === false ? 'Salvato sul telefono: parte per Drive appena torna la rete' : 'PDF salvato: lo mando su Drive');
      ldProponiDopo(key, x);
    }).catch(function(e){ avviso('Non salvato: ' + ((e && e.message) || 'errore')); });
  };
  i.click();
};
function scApri(key, modo){
  var cx = ctxDoc(key), a = cx.a, im = cx.im; if(!im) return;
  css();
  var T = tipiDoc(a, im);
  _sc = { key:cx.key, modo:modo, k:T[0].k, altro:'', pagine:[], foto:null, filtro:'doc', lavoro:'' };
  scDisegna();
}
window._acqScansiona = function(key){ scApri(key, 'foto'); };
window._acqCaricaPdf = function(key){ scApri(key, 'pdf'); };

/* ── invio a Drive ── */
function errDrive(e){
  var m = (e && e.message) || 'errore';
  if(/azione sconosciuta/.test(m)) return new Error('lo script Google è la versione vecchia: in "Testi dei messaggi" copia lo script nuovo, incollalo, esegui "autorizza" e fai "Nuova versione"');
  if(/Failed to fetch|NetworkError|Load failed/i.test(m)) return new Error('manca la rete');
  return e instanceof Error ? e : new Error(m);
}
function cartelleDoc(im){
  var cd = im.cartellaDoc;
  if(cd && cd.docId && cd.idId) return Promise.resolve(cd);
  return driveChiama('docCartelle', { nome:nomeCartella(im), id:(cd && cd.id) || '' }).then(function(o){
    im.cartellaDoc = { id:o.id, url:o.url, nome:o.nome, docId:o.docId, docUrl:o.docUrl, idId:o.idId, idUrl:o.idUrl, data:(cd && cd.data) || oggi() };
    im._modificata = Date.now(); salva();
    return im.cartellaDoc;
  });
}
function b64Di(buf){
  var u = new Uint8Array(buf), s = '', P = 0x8000;
  for(var i = 0; i < u.length; i += P) s += String.fromCharCode.apply(null, u.subarray(i, i + P));
  return btoa(s);
}
function tenta(fn, n){
  return fn().catch(function(e){
    if(n <= 1 || /chiave|non valido|pezzo vuoto|sconosciuta|non trovata/.test((e && e.message) || '')) throw e;
    return new Promise(function(r){ setTimeout(r, 1500); }).then(function(){ return tenta(fn, n - 1); });
  });
}
function inviaDoc(x, im, avanza){
  return cartelleDoc(im).then(function(cd){
    var cart = x.k === DOC_IDENT ? cd.idId : cd.docId, tot = x.dati.byteLength;
    return driveChiama('docCaricaInizio', { cartella:cart, nome:x.nome, mime:x.mime, peso:tot }).catch(function(e){
      /* la cartella e' stata cancellata su Drive: la rifaccio una volta */
      if(!/cartella dei documenti non trovata/.test((e && e.message) || '')) throw e;
      delete im.cartellaDoc.docId; delete im.cartellaDoc.idId;
      return cartelleDoc(im).then(function(cd2){ cart = x.k === DOC_IDENT ? cd2.idId : cd2.docId; return driveChiama('docCaricaInizio', { cartella:cart, nome:x.nome, mime:x.mime, peso:tot }); });
    }).then(function(ini){
      var da = 0;
      function giro(){
        var pezzo = x.dati.slice(da, Math.min(tot, da + SC_PEZZO)), b64 = b64Di(pezzo);
        return tenta(function(){ return driveChiama('socCaricaPezzo', { sessione:ini.sessione, da:da, tot:tot, mime:x.mime, b64:b64 }); }, 3).then(function(o){
          da += pezzo.byteLength; avanza(Math.round(da * 100 / tot));
          if(o.fatto) return { k:x.k, mime:x.mime, nome:o.nome || x.nome, id:o.id, url:'https://drive.google.com/file/d/' + o.id + '/view', data:oggi(), pag:x.pag || 0, peso:tot };
          if(da >= tot) throw new Error('Drive non ha chiuso il caricamento');
          return giro();
        });
      }
      return giro();
    });
  });
}
function codaGira(){
  if(_coda.corre || !drivePronto() || navigator.onLine === false) return;
  _coda.corre = true;
  codaTutti().then(function(L){
    var i = 0;
    (function prossimo(){
      if(i >= L.length){ _coda.corre = false; _coda.msg = ''; codaAggiorna(); return; }
      var x = L[i++], im = immPerUuid(x.immUuid);
      if(!im){ prossimo(); return; }   /* immobile non (ancora) caricato: resta in coda */
      _coda.msg = 'Invio ' + x.nome; _coda.pct = 0; archStato();
      inviaDoc(x, im, function(p){ _coda.pct = p; archStato(); }).then(function(f){
        if(!Array.isArray(im.docFile)) im.docFile = [];
        im.docFile.push(f); im._modificata = Date.now();
        var a = x.acqId ? trova(x.acqId) : null;
        if(a) diario(a, 'Archiviato su Drive: ' + f.nome);
        salva();
        return codaTogli(x.id).then(function(){ return codaAggiorna(); }).then(prossimo);
      }).catch(function(e){
        e = errDrive(e);
        console.warn('[Acquisizioni] invio documento KO:', e);
        x.errore = e.message; x.tentativo = Date.now();
        codaMetti(x).then(function(){ _coda.corre = false; _coda.msg = ''; codaAggiorna(); });
      });
    })();
  }).catch(function(e){ _coda.corre = false; console.warn('[Acquisizioni] coda KO:', e); });
}
window._acqCodaInvia = function(){
  if(!drivePronto()){ avviso('Prima collega Google Drive (Testi dei messaggi)'); return; }
  if(navigator.onLine === false){ avviso('Il telefono è senza rete: i documenti partono appena torna'); return; }
  codaAggiorna().then(codaGira);
};
window._acqDocScollega = function(key, i){
  var cx = ctxDoc(key), a = cx.a, im = cx.im; if(!im || !Array.isArray(im.docFile) || !im.docFile[i]) return;
  var f = im.docFile[i];
  var fai = function(){ im.docFile.splice(i, 1); im._modificata = Date.now(); if(a) diario(a, 'Tolto dall\'elenco: ' + f.nome + ' (su Drive resta)'); salva(); dopoArchivio(key); };
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm('Tolgo "' + f.nome + '" dall\'elenco? Su Google Drive il file resta.', '', 'Documenti').then(function(ok){ if(ok) fai(); });
  else fai();
};
window._acqCodaTogli = function(id){
  var x = _coda.lista.find(function(y){ return y.id === id; }); if(!x) return;
  var fai = function(){ codaTogli(id).then(codaAggiorna); };
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm('Butto "' + x.nome + '"? Non è ancora su Drive: dovrai scansionarlo di nuovo.', '', 'Documenti').then(function(ok){ if(ok) fai(); });
  else fai();
};

/* ── la tappa nel percorso ── */
function statoArchivio(im){
  var F = Array.isArray(im && im.docFile) ? im.docFile : [], q = codaDi(im);
  return q.length ? 'corso' : (F.length ? 'fatto' : 'fare');
}
function pillArchivio(im){
  var n = (Array.isArray(im && im.docFile) ? im.docFile : []).length, q = codaDi(im).length;
  return pill(statoArchivio(im), n + ' su Drive' + (q ? ' · ' + q + ' in attesa' : ''));
}
function archStatoTesto(){
  if(!_coda.msg) return '';
  return esc(_coda.msg) + '… ' + _coda.pct + '%';
}
function bloccoArchivio(key, im){
  var c = C(), id = jsq(key), cd = im.cartellaDoc, F = Array.isArray(im.docFile) ? im.docFile : [], q = codaDi(im), h = '';
  h += '<div class="acq-azioni">'
    + '<button class="gx-btn pieno" onclick="_acqScansiona(\'' + id + '\')" title="Fotografi le pagine col telefono: il gestionale le raddrizza, le schiarisce e fa un PDF">' + ico(I.camera) + ' Scansiona documento</button>'
    + '<button class="gx-btn" onclick="_acqCaricaPdf(\'' + id + '\')" title="Un PDF già fatto (scanner del telefono, email, computer): viene rinominato e archiviato">' + ico(I.carica) + ' Carica PDF</button>'
    + (drivePronto() ? '' : '<button class="gx-btn" onclick="_acqTesti()" title="Una volta sola: lo stesso collegamento delle cartelle foto">' + ico(I.cartella) + ' Collega Google Drive</button>')
    + '</div>';
  if(!drivePronto()) h += '<div class="gx-nota" style="margin:0;padding:10px 16px">Google Drive non è ancora collegato: puoi già scansionare, i documenti restano sul telefono e partono appena lo colleghi.</div>';
  if(cd && cd.url){
    h += '<div class="acq-doc"><span style="color:' + c.ok + ';display:inline-flex">' + ico(I.cartella, 16) + '</span>'
      + '<span class="n" style="color:var(--text)">Cartella documenti: ' + esc(cd.nome || 'Google Drive') + ' <span style="color:var(--text4);font-size:0.76rem">· non condivisa</span></span>'
      + (cd.docUrl ? '<a class="gx-btn" href="' + esc(cd.docUrl) + '" target="_blank" rel="noopener" title="Apre la cartella Documenti su Google Drive">Documenti</a>' : '')
      + (cd.idUrl ? '<a class="gx-btn" href="' + esc(cd.idUrl) + '" target="_blank" rel="noopener" title="Documenti d\'identità: cartella riservata, non va mai al tecnico">' + ico(I.lucchetto, 13) + ' Identità</a>' : '')
      + '</div>';
  }
  h += '<div class="acq-arch-coda">' + archCoda(key, im) + '</div>';
  F.slice().map(function(f, i){ return { f:f, i:i }; }).reverse().forEach(function(o){
    var f = o.f, ris = f.k === DOC_IDENT;
    h += '<div class="acq-doc"><span style="color:' + (ris ? c.am : c.ok) + ';display:inline-flex" title="' + (ris ? 'Riservato: cartella Identità' : 'Cartella Documenti') + '">' + ico(ris ? I.lucchetto : I.doc, 16) + '</span>'
      + '<span class="n" style="color:var(--text)">' + esc(f.nome) + ' <span style="color:var(--text4);font-size:0.76rem">· ' + (f.pag ? f.pag + (f.pag === 1 ? ' pagina · ' : ' pagine · ') : '') + dimTesto(f.peso || 0) + ' · ' + esc(it(f.data)) + '</span></span>'
      + (leggibile(f.k) ? '<button class="gx-btn" onclick="_acqDocLeggi(\'' + id + '\',' + o.i + ')" title="L\'AI legge il documento e propone i dati per la scheda immobile e i proprietari: scrivi solo quello che confermi">' + ico(I.ai) + ' Leggi con l\'AI</button>' : '')
      + '<a class="gx-btn" href="' + esc(f.url) + '" target="_blank" rel="noopener" title="Apre il PDF su Google Drive">Apri</a>'
      + '<button class="gx-btn" onclick="_acqDocScollega(\'' + id + '\',' + o.i + ')" title="Toglie solo dall\'elenco: su Drive il file resta">Togli</button></div>';
  });
  if(!F.length && !q.length) h += '<div class="gx-nota" style="margin:0;padding:10px 16px">Nessun documento archiviato. Quando scansioni un documento, nella lista qui sopra si segna da solo "ricevuto".</div>';
  return h;
}
function archCoda(key, im){
  var c = C(), q = codaDi(im); if(!q.length) return '';
  var h = '<div class="acq-azioni" style="background:color-mix(in srgb,' + c.am + ' 8%,transparent)"><span style="color:' + c.am + ';display:inline-flex">' + ico(I.nuvola, 16) + '</span>'
    + '<span class="nota" style="flex:1;min-width:200px;color:var(--text2)"><b>' + q.length + (q.length === 1 ? ' documento sul telefono' : ' documenti sul telefono') + '</b>, da mandare su Drive'
    + '<span class="acq-arch-stato" style="display:block;color:var(--text3)">' + (archStatoTesto() || (navigator.onLine === false ? 'Senza rete: partono appena torna, con il gestionale aperto.' : '')) + '</span></span>'
    + '<button class="gx-btn" onclick="_acqCodaInvia()"' + (_coda.corre ? ' disabled' : '') + ' title="Riprova subito l\'invio">' + ico(I.giro) + ' Invia ora</button></div>';
  q.forEach(function(x){
    h += '<div class="acq-doc"><span style="color:' + c.am + ';display:inline-flex">' + ico(x.k === DOC_IDENT ? I.lucchetto : I.doc, 16) + '</span>'
      + '<span class="n" style="color:var(--text)">' + esc(x.nome) + ' <span style="color:var(--text4);font-size:0.76rem">· ' + dimTesto(x.peso || 0) + (x.errore ? '</span> <span style="color:' + c.ko + ';font-size:0.76rem">· non partito: ' + esc(x.errore) : ' · in attesa') + '</span></span>'
      + (leggibile(x.k) ? '<button class="gx-btn" onclick="_acqCodaLeggi(\'' + jsq(key) + '\',\'' + jsq(x.id) + '\')" title="L\'AI legge il documento anche prima che arrivi su Drive">' + ico(I.ai) + ' Leggi con l\'AI</button>' : '')
      + '<button class="gx-btn" onclick="_acqCodaTogli(\'' + jsq(x.id) + '\')" title="Butta il documento non ancora inviato">Butta</button></div>';
  });
  return h;
}
/* aggiornamenti senza ridisegnare la pagina (non si perde un messaggio che
   Enzo sta correggendo) */
function archStato(){ document.querySelectorAll('.acq-arch-stato').forEach(function(el){ el.textContent = archStatoTesto(); }); }
function archRidisegna(){
  schedaRidisegna('', false);   /* la scheda immobile aperta, se c'e' */
  if(_vista !== 'dettaglio') return;
  var a = trova(_apertoId), im = immDi(a), w = document.getElementById('acq-wrap'), el = w && w.querySelector('.acq-arch-coda'); if(!a || !im || !el) return;
  var att = document.activeElement, scrive = att && /^(TEXTAREA|INPUT|SELECT)$/.test(att.tagName) && w.contains(att);
  if(scrive) el.innerHTML = archCoda(a.id, im); else disegna();
}

/* ── [19 ott 2026] l'archivio nella SCHEDA IMMOBILE (computer e telefono) ──
   La scheda lo mette in un contenitore .acq-sch con data-u = uuid; qui lo si
   riempie e lo si aggiorna senza ridisegnare tutta la scheda (la coda che
   avanza non deve far saltare la pagina). Dopo un salvataggio, sul computer
   si ridisegna la scheda sulla linguetta Documenti: la lista "Stato
   Documentazione" segna il documento ricevuto. */
function archSchedaCorpo(im){
  var F = Array.isArray(im.docFile) ? im.docFile : [], q = codaDi(im);
  return '<div class="acq-sch-conto">' + F.length + ' su Drive' + (q.length ? ' · ' + q.length + ' in attesa' : '') + '</div>'
    + bloccoArchivio('u:' + im.uuid, im);
}
window.acqArchivioScheda = function(im){
  if(!im || !im.uuid) return '';
  css();
  return '<div class="acq-sch" data-u="' + esc(im.uuid) + '">' + archSchedaCorpo(im) + '</div>';
};
function schedaRidisegna(key, tutta){
  var u = String(key || '').indexOf('u:') === 0 ? key.slice(2) : '';
  document.querySelectorAll('.acq-sch').forEach(function(el){
    var uu = el.getAttribute('data-u'); if(u && uu !== u) return;
    var im = immPerUuid(uu); if(!im) return;
    var pc = tutta && el.closest('#scheda-imm-body');
    if(pc && typeof window.renderSchedaImmobile === 'function'){
      var i = D.immobili.indexOf(im);
      try{ window.renderSchedaImmobile(i); if(typeof window.simmTab === 'function') window.simmTab('docs'); return; }catch(e){ console.warn('[Acquisizioni] scheda KO:', e); }
    }
    el.innerHTML = archSchedaCorpo(im);
  });
}

/* la coda riparte quando torna la rete, all'apertura e ogni minuto */
window.addEventListener('online', function(){ codaAggiorna().then(codaGira); });
setTimeout(function(){ codaAggiorna().then(codaGira); }, 4000);
setInterval(function(){ if(_coda.lista.length && !_coda.corre) codaGira(); }, 60000);
/* per le prove e per la Console */
window.codaDocumenti = function(){ return codaAggiorna().then(function(){ return _coda.lista; }); };


/* ── 13. LETTURA DEI DOCUMENTI CON L'AI (pezzo 2) ─────────────────────────
   [19 ott 2026] Scelte di Enzo:
   - pulsante "Leggi con l'AI" su ogni visura, planimetria, atto (e documento
     d'identita') archiviato, anche vecchio o caricato come PDF: se il PDF
     non e' piu' sul telefono si riscarica da Drive (docPezzo, script v5);
     dopo una scansione di questi tipi la lettura si propone subito;
   - i dati vanno sulla SCHEDA IMMOBILE (catasto, intestatari catastali,
     piano, provenienza e anno) e sui PROPRIETARI (codice fiscale, nascita:
     solo caselle vuote), sempre con la tabella di conferma: come per
     l'incarico firmato, un dato gia' scritto parte NON spuntato;
   - si legge tutto il documento, anche lungo;
   - controlli incrociati fra visura, atto, planimetria e scheda nel
     riquadro "Da sistemare" della scheda immobile (window.docDaSistemare).
   Quello che i documenti dicono resta su im.docLetti = { visura, atto,
   planimetria, identita }: { data, file, dataDoc, unita, intestatari, atto }.
   Si scrive alla conferma, anche se non si spunta nessun campo, cosi' i
   controlli valgono comunque. */

var LEGGIBILI = [0, 1, 2, 6, DOC_IDENT];
function leggibile(k){ return LEGGIBILI.indexOf(k) >= 0 || eProv(k); }
var SC_MAX_AI = 25 * 1024 * 1024;
var _ld = null;   /* { key (id del percorso o 'u:'+uuid, vedi ctxDoc), fileId, nome, k, mime, bytes, stato, pct, errore, dati, u, ck, val, dest } */

function ldPrompt(){
  return 'Questo è un documento di un immobile in vendita in Italia: una visura catastale, una planimetria catastale, un atto notarile '
    + '(compravendita, successione, donazione, divisione…), un documento d\'identità o altro. Leggilo TUTTO e rispondi ESCLUSIVAMENTE con un oggetto JSON valido: '
    + 'nessun testo prima o dopo, nessun blocco con i backtick. Struttura, con "" per ogni dato che non trovi o non leggi con certezza:\n'
    + '{"tipo":"","dataDocumento":"",'
    + '"unita":[{"comune":"","sezione":"","foglio":"","particella":"","sub":"","categoria":"","classe":"","consistenza":"","superficie":"","rendita":"","indirizzo":"","piano":""}],'
    + '"intestatari":[{"nome":"","cf":"","dataNascita":"","luogoNascita":"","provNascita":"","quota":""}],'
    + '"atto":{"tipo":"","data":"","notaio":"","repertorio":"","prezzo":""},'
    + '"note":""}\n'
    + 'Regole: "tipo" vale "visura", "planimetria", "atto", "identita" oppure "altro". Date nel formato AAAA-MM-GG. '
    + '"unita" sono le unità immobiliari catastali (una per riga della visura o dell\'atto: casa, box, cantina…); "comune" è il comune catastale; '
    + '"foglio", "particella" e "sub" solo il numero; "categoria" come "A/2" o "C/6"; "consistenza" come scritta (es. "5,5 vani"); "superficie" in mq solo il numero; '
    + '"rendita" in euro solo il numero con la virgola (es. "516,46"); "piano" come scritto (es. "1", "T", "S1-T"). '
    + '"intestatari": per la visura gli intestatari attuali con la quota (es. "1/2" o "proprietà 1000/1000"); per l\'atto le persone che DIVENTANO proprietarie '
    + '(acquirenti, eredi, donatari), non chi vende; per il documento d\'identità la persona. "nome" come scritto, cognome e nome. "provNascita" la sigla della provincia. '
    + '"atto" solo se è un atto: "tipo" uno fra Compravendita, Successione, Donazione, Divisione, Permuta, Asta, Usucapione, Costruzione propria, Altro; '
    + '"data" la data dell\'atto; "prezzo" solo cifre. '
    + 'Se qualcosa è illeggibile o incerto lascia "" e spiegalo in "note" in una riga. NON inventare nulla.';
}
/* i campi che la lettura puo' scrivere sulla scheda immobile */
var LD_IMM = [
  { k:'catComune',      l:'Comune catastale',     u:'comune' },
  { k:'catSezione',     l:'Sezione',              u:'sezione' },
  { k:'catFoglio',      l:'Foglio',               u:'foglio' },
  { k:'catParticella',  l:'Particella',           u:'particella' },
  { k:'catSub',         l:'Subalterno',           u:'sub' },
  { k:'catCategoria',   l:'Categoria',            u:'categoria' },
  { k:'catClasse',      l:'Classe',               u:'classe' },
  { k:'catConsistenza', l:'Consistenza',          u:'consistenza' },
  { k:'catRendita',     l:'Rendita (€)',          u:'rendita' },
  { k:'piano',          l:'Piano',                u:'piano' },
  { k:'catIntestatario',l:'Intestati a (catasto)', intest:true },
  { k:'provenienza',    l:'Provenienza',          atto:'tipo' },
  { k:'_annoAcq',       l:'Anno di acquisizione', atto:'anno' }
];
var LD_CLI = [
  { k:'cf',           l:'Codice fiscale',       up:true },
  { k:'nascita',      l:'Data di nascita',      da:'dataNascita', data:true },
  { k:'luogoNascita', l:'Luogo di nascita',     up:true },
  { k:'provNascita',  l:'Provincia di nascita', up:true }
];
function ldTipo(t){ t = String(t || '').toLowerCase(); return /visur/.test(t) ? 'visura' : (/planim/.test(t) ? 'planimetria' : (/atto/.test(t) ? 'atto' : (/ident/.test(t) ? 'identita' : 'altro'))); }
function ldNorma(o){
  o = (o && typeof o === 'object') ? o : {};
  o.tipo = ldTipo(o.tipo);
  if(!Array.isArray(o.unita)) o.unita = [];
  o.unita = o.unita.filter(function(u){ return u && typeof u === 'object'; });
  if(!Array.isArray(o.intestatari)) o.intestatari = [];
  o.intestatari = o.intestatari.filter(function(p){ return p && typeof p === 'object' && String(p.nome || '').trim(); });
  if(!o.atto || typeof o.atto !== 'object') o.atto = {};
  return o;
}
function pulito(v){ return String(v == null ? '' : v).trim(); }
function numCat(v){ return pulito(v).replace(/^0+(?=\d)/, '').toUpperCase(); }
/* l'unita' che corrisponde alla scheda (foglio, particella, sub), altrimenti la prima */
function ldUnitaDi(dati, im){
  var U = dati.unita; if(!U.length) return -1;
  var f = numCat(im.catFoglio), p = numCat(im.catParticella), s = numCat(im.catSub);
  var i = U.findIndex(function(u){ return f && p && numCat(u.foglio) === f && numCat(u.particella) === p && (!s || numCat(u.sub) === s); });
  if(i < 0) i = U.findIndex(function(u){ return /^A/i.test(pulito(u.categoria)); });
  return i < 0 ? 0 : i;
}
function nomiIntestatari(L){
  return (L || []).map(function(p){ return pulito(p.nome).replace(/\s+/g, ' ').toUpperCase() + (pulito(p.quota) ? ' (' + pulito(p.quota) + ')' : ''); }).join('; ');
}
/* il valore letto per un campo della scheda */
function ldLetto(def){
  var d = _ld.dati, u = _ld.u >= 0 ? d.unita[_ld.u] : null;
  if(def.u) return u ? pulito(u[def.u]) : '';
  if(def.intest) return (d.tipo === 'visura' || d.tipo === 'atto') ? nomiIntestatari(d.intestatari) : '';
  if(def.atto === 'tipo') return d.tipo === 'atto' && pulito(d.atto.tipo) ? (typeof window._provNorm === 'function' ? window._provNorm(d.atto.tipo) : pulito(d.atto.tipo)) : '';
  if(def.atto === 'anno'){ var m = /^(\d{4})/.exec(pulito(d.atto.data)); return d.tipo === 'atto' && m ? m[1] : ''; }
  return '';
}
function ldAttuale(im, def){
  if(def.k === '_annoAcq') return pulito(im.schedaSopralluogo && im.schedaSopralluogo['prop-anno-acq']);
  return pulito(im[def.k]);
}
function ugualeCat(a, b){ return String(a || '').toUpperCase().replace(/[\s.]/g, '').replace(/,/g, '.') === String(b || '').toUpperCase().replace(/[\s.]/g, '').replace(/,/g, '.'); }
/* le persone a cui si possono dare i dati letti: proprietario e cointestatari */
function ldPersone(im){
  var out = [], p = propDi(im);
  if(p.uuid) out.push({ id:'c:' + p.uuid, nome:p.nome, tipo:'Proprietario' });
  (Array.isArray(im.coIntestari) ? im.coIntestari : []).forEach(function(c, i){ if(c && c.nome) out.push({ id:'co:' + i, nome:c.nome, tipo:'Cointestatario' }); });
  return out;
}
function ldOggettoPersona(im, id){
  if(!id) return null;
  if(id.indexOf('c:') === 0) return cliPerUuid(id.slice(2));
  if(id.indexOf('co:') === 0){ var c = (im.coIntestari || [])[parseInt(id.slice(3), 10)]; return c || null; }
  return null;
}
function ldProponi(im){
  _ld.u = ldUnitaDi(_ld.dati, im); _ld.ck = {}; _ld.val = {}; _ld.dest = {};
  LD_IMM.forEach(function(def){
    var v = ldLetto(def), att = ldAttuale(im, def);
    _ld.val['i.' + def.k] = v;
    _ld.ck['i.' + def.k] = !!v && (!att || ugualeCat(att, v));
  });
  var P = ldPersone(im);
  _ld.dati.intestatari.forEach(function(x, n){
    var m = P.find(function(p){ return nomeChiave(p.nome) && nomeChiave(p.nome) === nomeChiave(x.nome); });
    _ld.dest[n] = m ? m.id : '';
    LD_CLI.forEach(function(def){ _ld.val['p.' + n + '.' + def.k] = pulito(x[def.da || def.k]); _ld.ck['p.' + n + '.' + def.k] = true; });
  });
}
function ldCampoPersona(id, k){ return (id && id.indexOf('co:') === 0) ? (k === 'nascita') : true; }

/* i byte del documento: dal telefono se c'e' ancora, se no da Drive a pezzi */
function ldScarica(L){
  if(L.bytes) return Promise.resolve();
  return codaTutti().then(function(Q){
    var x = Q.find(function(y){ return y.id === L.codaId; });
    if(x){ L.bytes = x.dati; L.mime = x.mime; return; }
    if(!L.fileId) throw new Error('il documento non è più sul telefono e non è ancora su Drive');
    var parti = [], da = 0, tot = 1;
    function giro(){
      return tenta(function(){ return driveChiama('docPezzo', { id:L.fileId, da:da }); }, 3).then(function(o){
        tot = o.tot; L.mime = o.mime || L.mime;
        if(tot > SC_MAX_AI) throw new Error('il documento pesa ' + dimTesto(tot) + ': per la lettura con l\'AI il massimo è 25 MB');
        var b = atob(o.b64 || ''), u = new Uint8Array(b.length);
        for(var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        parti.push(u); da += u.length; L.pct = tot ? Math.round(da * 100 / tot) : 100; if(_ld === L) disegna();
        if(da < tot && u.length) return giro();
      });
    }
    return giro().then(function(){
      var out = new Uint8Array(da), o2 = 0; parti.forEach(function(u){ out.set(u, o2); o2 += u.length; });
      L.bytes = out.buffer;
    });
  });
}
function ldLeggi(){
  var L = _ld; if(!L) return;
  if(typeof window.callClaude !== 'function'){ L.errore = 'La funzione AI non è disponibile: controlla l\'indirizzo del Worker nelle Impostazioni AI.'; disegna(); return; }
  L.stato = 'scarico'; L.errore = ''; L.pct = 0; disegna();
  ldScarica(L).then(function(){
    if(_ld !== L) return;
    if(L.bytes.byteLength > SC_MAX_AI) throw new Error('il documento pesa ' + dimTesto(L.bytes.byteLength) + ': per la lettura con l\'AI il massimo è 25 MB');
    L.stato = 'leggo'; disegna();
    var mime = L.mime || 'application/pdf', b64 = b64Di(L.bytes);
    var content = [{ type:'text', text:ldPrompt() }];
    if(mime === 'application/pdf') content.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:b64 } });
    else content.push({ type:'image', source:{ type:'base64', media_type:/png/.test(mime) ? 'image/png' : 'image/jpeg', data:b64 } });
    content.push({ type:'text', text:'Rispondi ORA solo con il JSON richiesto.' });
    var modello = 'claude-sonnet-4-6';
    try{ if(typeof window.aiGetConfig === 'function' && window.aiGetConfig().model) modello = window.aiGetConfig().model; }catch(e){}
    return window.callClaude({ model:modello, max_tokens:3000, messages:[{ role:'user', content:content }] });
  }).then(function(data){
    if(_ld !== L || !data) return;
    var txt = ''; try{ txt = (data.content || []).map(function(b){ return b.text || ''; }).join('').trim(); }catch(e){}
    var obj = null;
    try{
      var t = txt.replace(/```json/gi, '').replace(/```/g, '').trim(), i1 = t.indexOf('{'), i2 = t.lastIndexOf('}');
      if(i1 >= 0 && i2 > i1) t = t.slice(i1, i2 + 1);
      obj = JSON.parse(t);
    }catch(e){ obj = null; }
    L.stato = '';
    if(!obj){ L.errore = 'L\'AI non ha restituito i dati in forma leggibile. Riprova.'; disegna(); return; }
    L.dati = ldNorma(obj);
    var im = ctxDoc(L.key).im; if(im) ldProponi(im);
    disegna();
  }).catch(function(e){
    if(_ld !== L) return;
    e = errDrive(e);
    L.stato = ''; L.errore = (e && e.message) || 'errore'; disegna();
  });
}
/* apre la lettura: da un documento archiviato (id di Drive) o dalla coda */
function ldApri(key, info){
  _ld = { key:String(key || ''), fileId:info.fileId || '', codaId:info.codaId || '', nome:info.nome || 'Documento', k:info.k, mime:info.mime || 'application/pdf',
    bytes:info.bytes || null, stato:'', pct:0, errore:'', dati:null, u:-1, ck:{}, val:{}, dest:{} };
  vaiA('leggidoc');
  ldLeggi();
}
window._acqDocLeggi = function(key, i){
  var im = ctxDoc(key).im; if(!im || !Array.isArray(im.docFile) || !im.docFile[i]) return;
  var f = im.docFile[i];
  if(!drivePronto()){ avviso('Prima collega Google Drive (Testi dei messaggi)'); return; }
  ldApri(key, { fileId:f.id, nome:f.nome, k:f.k, mime:f.mime || (/\.pdf$/i.test(f.nome) ? 'application/pdf' : 'image/jpeg') });
};
window._acqCodaLeggi = function(key, codaId){
  var x = _coda.lista.find(function(y){ return y.id === codaId; }); if(!x) return;
  ldApri(key, { codaId:codaId, nome:x.nome, k:x.k });
};
window._acqLdRiprova = function(){ if(_ld){ _ld.dati = null; ldLeggi(); } };
window._acqLdEsci = function(){ var torna = _ld && _ld.key; _ld = null; ldTorna(torna); };
/* [19 ott 2026] alla fine della lettura si torna da dove si era partiti:
   il percorso, oppure la scheda immobile (si chiude la pagina Acquisizioni) */
function ldTorna(key){
  var cx = ctxDoc(key);
  if(cx.da === 'scheda'){ _vista = 'elenco'; window.chiudiAcquisizioni(); schedaRidisegna(key, true); return; }
  if(cx.a) vaiA('dettaglio', cx.a.id); else vaiA('elenco');
}
window._acqLdUnita = function(v){
  var im = ctxDoc(_ld.key).im; if(!im) return;
  _ld.u = parseInt(v, 10);
  LD_IMM.forEach(function(def){ var vv = ldLetto(def), att = ldAttuale(im, def); _ld.val['i.' + def.k] = vv; _ld.ck['i.' + def.k] = !!vv && (!att || ugualeCat(att, vv)); });
  disegna();
};
window._acqLdVal = function(key, v){ if(_ld) _ld.val[key] = v; };
window._acqLdCk = function(key, v){ if(_ld) _ld.ck[key] = !!v; };
window._acqLdDest = function(n, v){ if(_ld){ _ld.dest[n] = v; disegna(); } };

/* ── i controlli: usati dalla tabella e dal "Da sistemare" della scheda ── */
function ldNomiProprietari(im){
  var L = [propDi(im).nome].concat((Array.isArray(im.coIntestari) ? im.coIntestari : []).map(function(c){ return c && c.nome; }));
  return L.filter(Boolean);
}
function stessaPersona(a, b){
  var x = nomeChiave(a), y = nomeChiave(b); if(!x || !y) return false;
  if(x === y) return true;
  var A = x.split(' '), B = y.split(' ');
  var corto = A.length <= B.length ? A : B, lungo = A.length <= B.length ? B : A;
  return corto.length >= 2 && corto.every(function(w){ return lungo.indexOf(w) >= 0; });
}
function chiaveUnita(u){ return u ? [numCat(u.foglio), numCat(u.particella), numCat(u.sub)] : ['', '', '']; }
function unitaPrincipale(rec, im){
  if(!rec || !Array.isArray(rec.unita) || !rec.unita.length) return null;
  var i = typeof rec.u === 'number' && rec.u >= 0 && rec.unita[rec.u] ? rec.u : ldUnitaDi({ unita:rec.unita }, im);
  return rec.unita[i] || null;
}
/* ogni avviso: { liv:'rosso'|'ambra', t, s } */
function controlliDoc(im, letti){
  var out = [], V = letti.visura, A = letti.atto, P = letti.planimetria;
  var prop = ldNomiProprietari(im);
  if(V && Array.isArray(V.intestatari) && V.intestatari.length && prop.length){
    var nessuno = !V.intestatari.some(function(x){ return prop.some(function(n){ return stessaPersona(n, x.nome); }); });
    if(nessuno) out.push({ liv:'rosso', t:'La visura intesta l\'immobile ad altri', s:'visura: ' + nomiIntestatari(V.intestatari).slice(0, 120) + ' · in scheda: ' + prop.join(', ') });
    else {
      var mancano = V.intestatari.filter(function(x){ return !prop.some(function(n){ return stessaPersona(n, x.nome); }); });
      if(mancano.length) out.push({ liv:'ambra', t:'In visura ci sono altri intestatari', s:mancano.map(function(x){ return pulito(x.nome) + (x.quota ? ' (' + x.quota + ')' : ''); }).join(', ') + ': devono firmare anche loro' });
    }
  }
  var uV = unitaPrincipale(V, im), kV = chiaveUnita(uV), kS = [numCat(im.catFoglio), numCat(im.catParticella), numCat(im.catSub)];
  if(uV && kS[0] && kS[1] && kV[0] && kV[1] && (kV[0] !== kS[0] || kV[1] !== kS[1] || (kV[2] && kS[2] && kV[2] !== kS[2])))
    out.push({ liv:'ambra', t:'Catasto della scheda diverso dalla visura', s:'scheda: foglio ' + kS[0] + ' part. ' + kS[1] + (kS[2] ? ' sub ' + kS[2] : '') + ' · visura: foglio ' + kV[0] + ' part. ' + kV[1] + (kV[2] ? ' sub ' + kV[2] : '') });
  var rif = uV ? kV : kS;
  if(A && Array.isArray(A.unita) && A.unita.length && rif[0] && rif[1]){
    var trovata = A.unita.some(function(u){ var k = chiaveUnita(u); return k[0] === rif[0] && k[1] === rif[1] && (!k[2] || !rif[2] || k[2] === rif[2]); });
    if(!trovata) out.push({ liv:'ambra', t:'L\'atto riporta altri dati catastali', s:'può esserci stata una variazione (frazionamento, fusione, nuovo accatastamento): chiedi al tecnico la storia catastale' });
  }
  var uP = unitaPrincipale(P, im), kP = chiaveUnita(uP);
  if(uP && rif[0] && rif[1] && kP[0] && kP[1] && (kP[0] !== rif[0] || kP[1] !== rif[1] || (kP[2] && rif[2] && kP[2] !== rif[2])))
    out.push({ liv:'ambra', t:'La planimetria è di un\'altra unità', s:'planimetria: foglio ' + kP[0] + ' part. ' + kP[1] + (kP[2] ? ' sub ' + kP[2] : '') + ' · ' + (uV ? 'visura' : 'scheda') + ': foglio ' + rif[0] + ' part. ' + rif[1] + (rif[2] ? ' sub ' + rif[2] : '') });
  if(uV && uP && pulito(uV.categoria) && pulito(uP.categoria) && !ugualeCat(uV.categoria, uP.categoria))
    out.push({ liv:'ambra', t:'Categoria diversa fra visura e planimetria', s:'visura ' + uV.categoria + ' · planimetria ' + uP.categoria });
  if(V && dataOk(V.dataDoc) && giorni(V.dataDoc) > 180)
    out.push({ liv:'ambra', t:'Visura di più di 6 mesi fa', s:'del ' + it(V.dataDoc) + ': per incarico e rogito serve aggiornata' });
  return out;
}
function ldRecord(dati, u, info){
  return { data:oggi(), file:info.nome, fileId:info.fileId || '', dataDoc:dataOk(dati.dataDocumento) ? dati.dataDocumento : '',
    unita:dati.unita.slice(0, 8), u:u, intestatari:dati.intestatari.slice(0, 8).map(function(p){ return { nome:pulito(p.nome), quota:pulito(p.quota) }; }),
    atto:dati.tipo === 'atto' ? { tipo:pulito(dati.atto.tipo), data:pulito(dati.atto.data), notaio:pulito(dati.atto.notaio), repertorio:pulito(dati.atto.repertorio) } : null };
}
/* righe per il "Da sistemare" della scheda immobile (chiamata da immobili.view.js) */
window.docDaSistemare = function(im){
  var out = [];
  try{
    if(!im || !im.docLetti || typeof im.docLetti !== 'object') return out;
    controlliDoc(im, im.docLetti).forEach(function(x){
      out.push({ peso:x.liv === 'rosso' ? 2 : 1, num:x.liv === 'rosso' ? 'Rischio' : 'Verifica', col:x.liv === 'rosso' ? '#B91C1C' : '#B45309', t:x.t, s:x.s, bt:'Vedi', fn:"simmTab('docs')" });
    });
  }catch(e){ console.warn('[Acquisizioni] controlli documenti KO:', e); }
  return out;
};

/* ── la pagina della lettura ── */
function ldRiga(im, def){
  var key = 'i.' + def.k, v = _ld.val[key] || '', att = ldAttuale(im, def), ck = _ld.ck[key];
  if(!v && !att) return '';
  var diverso = v && att && !ugualeCat(att, v);
  return '<tr><td class="et">' + esc(def.l) + '</td>'
    + '<td><input class="acq-in" style="width:100%;box-sizing:border-box" value="' + esc(v) + '" oninput="_acqLdVal(\'' + key + '\',this.value)"></td>'
    + '<td style="color:' + (diverso ? 'var(--acq-am)' : 'var(--text3)') + '">' + (att ? esc(att) : '<i>vuoto</i>') + '</td>'
    + '<td style="text-align:center"><input type="checkbox"' + (ck ? ' checked' : '') + (v ? '' : ' disabled') + ' title="' + (diverso ? 'In scheda c\'è un altro valore: spunta per sostituirlo' : 'Scrivi sulla scheda') + '" onchange="_acqLdCk(\'' + key + '\',this.checked)"></td></tr>';
}
function ldBloccoPersone(im){
  var d = _ld.dati; if(!d.intestatari.length) return '';
  var P = ldPersone(im), c = C();
  var h = '<table class="acq-imp"><tr><th>Persona letta</th><th>Dato letto</th><th>In scheda adesso</th><th style="width:70px;text-align:center">Scrivi</th></tr>';
  d.intestatari.forEach(function(x, n){
    var dest = _ld.dest[n] || '', obj = ldOggettoPersona(im, dest);
    h += '<tr><td class="et" colspan="4" style="background:var(--bg2)">' + esc(pulito(x.nome)) + (x.quota ? ' <span style="color:var(--text3);font-weight:500">· ' + esc(x.quota) + '</span>' : '')
      + ' <select class="acq-in" style="margin-left:8px" title="A chi vanno i dati di questa persona" onchange="_acqLdDest(' + n + ',this.value)"><option value="">— non scrivere —</option>'
      + P.map(function(p){ return '<option value="' + esc(p.id) + '"' + (p.id === dest ? ' selected' : '') + '>' + esc(p.tipo + ': ' + bello(p.nome)) + '</option>'; }).join('') + '</select></td></tr>';
    LD_CLI.forEach(function(def){
      var key = 'p.' + n + '.' + def.k, v = _ld.val[key] || ''; if(!v) return;
      var att = obj ? pulito(obj[def.k]) : '', puo = !!obj && ldCampoPersona(dest, def.k) && !att;
      h += '<tr><td style="padding-left:22px">' + esc(def.l) + '</td>'
        + '<td><input class="acq-in" style="width:100%;box-sizing:border-box" value="' + esc(v) + '" oninput="_acqLdVal(\'' + key + '\',this.value)"></td>'
        + '<td style="color:var(--text3)">' + (obj ? (att ? esc(att) : (ldCampoPersona(dest, def.k) ? '<i>vuoto</i>' : '<i>non previsto</i>')) : '—') + '</td>'
        + '<td style="text-align:center">' + (puo ? '<input type="checkbox"' + (_ld.ck[key] ? ' checked' : '') + ' onchange="_acqLdCk(\'' + key + '\',this.checked)">' : '<span title="' + (att ? 'Già scritto: si scrive solo nelle caselle vuote' : 'Scegli prima a chi vanno i dati') + '" style="color:var(--text4)">—</span>') + '</td></tr>';
    });
  });
  return h + '</table><div class="gx-nota" style="margin:0;padding:10px 16px">Sui proprietari si scrive solo nelle caselle vuote: un dato già scritto non si tocca.' + (P.length ? '' : ' <b style="color:' + c.am + '">L\'immobile non ha un proprietario collegato: i dati delle persone non si possono scrivere.</b>') + '</div>';
}
function disegnaLettura(){
  var c = C(), L = _ld, cx = ctxDoc(L ? L.key : ''), im = cx.im;
  var h = window.gxTesta('Leggi con l\'AI', '', L ? L.nome : '');
  if(!L || !im) return h + '<div class="gx-info">Documento o immobile non trovato.</div>';
  if(L.stato){
    return h + '<div class="gx-info" style="border-left:4px solid ' + c.blu + '"><b>' + (L.stato === 'scarico' ? 'Riprendo il documento da Drive… ' + L.pct + '%' : 'L\'AI sta leggendo il documento…') + '</b>'
      + '<br><span style="color:var(--text3)">' + (L.stato === 'leggo' ? 'Per un atto lungo può volerci fino a un minuto. Puoi tornare al percorso: la lettura si ferma.' : '') + '</span></div>';
  }
  if(L.errore) return h + '<div class="gx-info" style="border-left:4px solid ' + c.ko + '"><b>Lettura non riuscita:</b> ' + esc(L.errore) + '</div>'
    + '<div class="acq-azioni" style="border:none"><button class="gx-btn pieno" onclick="_acqLdRiprova()">' + ico(I.giro) + ' Riprova</button></div>';
  if(!L.dati) return h;
  var d = L.dati, TIPI = { visura:'Visura catastale', planimetria:'Planimetria catastale', atto:'Atto notarile', identita:'Documento d\'identità', altro:'Documento' };
  var info = '<b>' + TIPI[d.tipo] + '</b>' + (dataOk(d.dataDocumento) ? ' del ' + it(d.dataDocumento) : '')
    + (d.tipo === 'atto' && pulito(d.atto.tipo) ? ' · ' + esc(d.atto.tipo) + (pulito(d.atto.notaio) ? ', notaio ' + esc(d.atto.notaio) : '') : '');
  h += '<div class="gx-info" style="border-left:4px solid ' + c.ok + '">' + info + '. Controlla i dati letti: si scrivono solo quelli spuntati. Quelli già scritti in modo diverso partono senza spunta.'
    + (pulito(d.note) ? '<br><span style="color:var(--text3)">Nota dell\'AI: ' + esc(d.note) + '</span>' : '') + '</div>';
  /* i controlli, calcolati come se si confermasse adesso */
  var prova = Object.assign({}, im.docLetti || {}); if(d.tipo !== 'altro') prova[d.tipo] = ldRecord(d, L.u, L);
  var CK = controlliDoc(im, prova);
  if(CK.length) h += '<div class="gx-info" style="border-left:4px solid ' + c.am + '"><b>Controlli fra i documenti</b><br>' + CK.map(function(x){ return '<span style="color:' + (x.liv === 'rosso' ? c.ko : c.am) + ';font-weight:700">' + esc(x.t) + '</span> — ' + esc(x.s); }).join('<br>') + '<br><span style="color:var(--text3)">Restano nel riquadro "Da sistemare" della scheda immobile.</span></div>';
  var imm = '';
  if(d.unita.length > 1) imm += '<div class="acq-azioni"><span class="nota" style="font-weight:700">Unità da usare</span><select class="acq-in" onchange="_acqLdUnita(this.value)">'
    + d.unita.map(function(u, i){ return '<option value="' + i + '"' + (i === L.u ? ' selected' : '') + '>' + esc(['foglio ' + (u.foglio || '?'), 'part. ' + (u.particella || '?'), u.sub ? 'sub ' + u.sub : '', u.categoria || ''].filter(Boolean).join(' · ')) + '</option>'; }).join('')
    + '</select><span class="nota">Il documento ha ' + d.unita.length + ' unità (es. casa e box): sulla scheda va quella dell\'immobile in vendita.</span></div>';
  var righe = LD_IMM.map(function(def){ return ldRiga(im, def); }).join('');
  imm += righe ? '<table class="acq-imp"><tr><th>Campo</th><th>Letto dal documento</th><th>In scheda adesso</th><th style="width:70px;text-align:center">Scrivi</th></tr>' + righe + '</table>'
    : '<div class="gx-nota" style="margin:0;padding:10px 16px">Da questo documento non ci sono dati per la scheda immobile.</div>';
  h += '<div class="acq-grid">'
    + '<div>' + window.gxCol('Scheda immobile', etichetta(im), c.blu, imm) + '</div>'
    + '<div>' + window.gxCol('Proprietari', d.intestatari.length ? d.intestatari.length + (d.intestatari.length === 1 ? ' persona letta' : ' persone lette') : 'nessuna persona', c.blu,
        ldBloccoPersone(im) || '<div class="gx-nota" style="margin:0;padding:10px 16px">Nel documento non ci sono persone da riportare.</div>') + '</div>'
    + '</div>';
  h += '<div class="acq-azioni" style="border:none;padding-left:0"><button class="gx-btn pieno" onclick="_acqLdConferma()" title="Scrive i dati spuntati e salva i controlli">' + ico(I.ok) + ' Conferma e scrivi</button>'
    + '<button class="gx-btn" onclick="_acqLdEsci()">Annulla</button></div>';
  return h;
}
window._acqLdConferma = function(){
  var L = _ld; if(!L || !L.dati) return;
  var cx = ctxDoc(L.key), a = cx.a, im = cx.im; if(!im) return;
  var scritti = 0;
  LD_IMM.forEach(function(def){
    var key = 'i.' + def.k, v = pulito(L.val[key]);
    if(!v || !L.ck[key]) return;
    if(def.k === '_annoAcq'){
      if(!/^\d{4}$/.test(v)) return;
      if(!im.schedaSopralluogo || typeof im.schedaSopralluogo !== 'object') im.schedaSopralluogo = {};
      im.schedaSopralluogo['prop-anno-acq'] = v; scritti++; return;
    }
    if(def.k === 'provenienza'){ im.provenienza = typeof window._provNorm === 'function' ? window._provNorm(v) : v; scritti++; return; }
    im[def.k] = (def.k === 'catIntestatario' || def.k === 'catCategoria') ? v.toUpperCase() : v; scritti++;
  });
  var persone = 0;
  L.dati.intestatari.forEach(function(x, n){
    var dest = L.dest[n], obj = ldOggettoPersona(im, dest); if(!obj) return;
    var fatto = false;
    LD_CLI.forEach(function(def){
      var key = 'p.' + n + '.' + def.k, v = pulito(L.val[key]);
      if(!v || !L.ck[key] || !ldCampoPersona(dest, def.k) || pulito(obj[def.k])) return;
      if(def.data && !dataOk(v)) return;
      obj[def.k] = def.up ? v.replace(/\s+/g, ' ').toUpperCase() : v; fatto = true;
    });
    if(fatto){ persone++; obj._modificata = Date.now(); }
  });
  if(L.dati.tipo !== 'altro'){
    if(!im.docLetti || typeof im.docLetti !== 'object') im.docLetti = {};
    im.docLetti[L.dati.tipo] = ldRecord(L.dati, L.u, L);
  }
  im._modificata = Date.now();
  if(a) diario(a, 'Letto con l\'AI: ' + L.nome + ' (' + scritti + (scritti === 1 ? ' dato' : ' dati') + ' sulla scheda' + (persone ? ', ' + persone + (persone === 1 ? ' persona aggiornata' : ' persone aggiornate') : '') + ')');
  salva();
  var CK = controlliDoc(im, im.docLetti || {});
  avviso('Dati scritti' + (CK.length ? ' · ' + CK.length + (CK.length === 1 ? ' cosa da verificare' : ' cose da verificare') + ' nel "Da sistemare" della scheda' : ''));
  _ld = null; ldTorna(cx.key);
};
/* dopo una scansione: propone subito la lettura, con il PDF ancora in memoria */
function ldProponiDopo(key, x){
  if(!leggibile(x.k)) return;
  var fai = function(){ ldApri(key, { codaId:x.id, nome:x.nome, k:x.k, mime:x.mime, bytes:x.dati }); };
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm('Vuoi che l\'AI legga subito i dati di "' + x.nome + '"? Ti mostro una tabella da confermare prima di scrivere qualcosa.', '', 'Leggi con l\'AI').then(function(ok){ if(ok) fai(); });
}


/* ── 14. PAGINA DEL TECNICO (pezzo 3) ─────────────────────────────────────
   [19 ott 2026] Scelte di Enzo: il tecnico apre tecnico.html (sul sito, senza
   account Google), scrive il codice di 6 cifre e vede TUTTI i file della
   cartella "Documenti" dell'immobile (mai "Identità"); puo' scaricarli e
   caricare quelli che prepara lui (APE, conformita'…). Link e codice nello
   stesso messaggio; scadenza di 15 giorni (si cambia ogni volta); si spegne
   quando si vuole. Il portinaio e' lo script Google (versione 5): controlla
   link, codice e scadenza, blocca dopo 5 codici sbagliati, e i file su Drive
   restano privati (nessuna condivisione "chiunque abbia il link").
   Il link sta sul percorso: a.tappe.tecnico.link = { token, codice, scad,
   creato, giorni, visto, aperture, bloccato, spento, visti:[id] }.
   I file caricati dal tecnico entrano in im.docFile (tecnico:true) e si
   segnano ricevuti, come una scansione. */

var TEC_URL = 'https://agenzioimmobiliare.github.io/tecnico.html';
var _tecCtrl = {};   /* ultimo controllo automatico per percorso */
var _tecLav = {};    /* lavori in corso per percorso */

function scriptId(){ var m = /\/macros\/s\/([^\/]+)\/exec/.exec(driveCfg().url); return m ? m[1] : ''; }
function tecLink(a){ var l = norma(a).tappe.tecnico.link; return (l && l.token) ? l : null; }
function tecAttivo(l){ return !!(l && !l.spento && !l.bloccato && l.scad > Date.now()); }
function tecUrl(l){ return TEC_URL + '#s=' + encodeURIComponent(scriptId()) + '&t=' + l.token; }
function dataDa(ms){ var d = new Date(ms), p = function(n){ return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function quandoMs(ms){ var d = new Date(ms), p = function(n){ return (n < 10 ? '0' : '') + n; }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' alle ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
/* i documenti che il tecnico puo' caricare: la sua lista, l'APE sempre, "altro" */
function tecTipi(a, im){
  var L = docsDi(a, 'tecnico', im).slice();
  if(L.indexOf(APE) < 0) L.push(APE);
  return L.map(function(n){ return { k:String(n), n:nomeDoc(n) }; }).concat([{ k:'altro', n:'Altro documento' }]);
}
function tecTesto(a, im, l){
  var tec = tecDi(a);
  return 'Buongiorno' + (tec && tec.nome ? ' ' + bello(tec.nome) : '') + ', per ' + etichetta(im) + ' qui trova i documenti già raccolti e può caricare quelli che prepara lei (APE, conformità…):\n'
    + tecUrl(l) + '\nCodice: ' + l.codice + '\nIl link vale fino al ' + it(dataDa(l.scad)) + '.\n\n' + agenteNome() + '\n' + agenzia();
}
function bloccoTecnicoLink(a, im){
  var c = C(), id = jsq(a.id), l = tecLink(a), lav = _tecLav[a.id], h = '';
  h += '<div class="acq-azioni" style="border-top:1px solid var(--border)"><span class="nota" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">' + ico(I.lucchetto) + ' Pagina per il tecnico</span>';
  if(!drivePronto()){
    return h + '<span class="nota">Serve il collegamento a Google Drive.</span><button class="gx-btn" onclick="_acqTesti()">' + ico(I.cartella) + ' Collega Google Drive</button></div>';
  }
  if(!l || !tecAttivo(l)){
    var stato = !l ? '' : (l.spento ? 'Link spento il ' + it(l.spento) + '.' : (l.bloccato ? 'Link bloccato: troppi codici sbagliati.' : 'Link scaduto il ' + it(dataDa(l.scad)) + '.'));
    h += '<label class="nota" style="display:inline-flex;align-items:center;gap:6px">Vale <select id="acq-tec-gg" class="acq-in">'
      + [7, 15, 30].map(function(g){ return '<option value="' + g + '"' + (g === 15 ? ' selected' : '') + '>' + g + ' giorni</option>'; }).join('') + '</select></label>'
      + '<button class="gx-btn pieno" onclick="_acqTecCrea(\'' + id + '\')"' + (lav ? ' disabled' : '') + ' title="Crea un link con un codice di 6 cifre: il tecnico vede i documenti di questo immobile (mai quelli d\'identità) e carica i suoi">'
      + ico(I.piu) + (lav ? ' Creo il link…' : (l ? ' Crea un link nuovo' : ' Crea il link per il tecnico')) + '</button>'
      + (stato ? '<span class="nota">' + esc(stato) + '</span>' : '') + '</div>';
    if(!l) h += '<div class="gx-nota" style="margin:0;padding:10px 16px">Il tecnico apre una pagina del sito, scrive il codice e scarica i documenti della cartella Documenti; può caricare APE, conformità e gli altri suoi documenti, che qui si segnano ricevuti. Non serve un account Google.</div>';
    return h;
  }
  h += '<span class="acq-pill" style="color:' + c.ok + '"><i></i>Attivo fino al ' + esc(it(dataDa(l.scad))) + '</span>'
    + '<span class="nota">Codice <b style="color:var(--text);letter-spacing:1px">' + esc(l.codice) + '</b></span></div>';
  var info = l.visto ? 'Aperto dal tecnico il ' + quandoMs(l.visto) + (l.aperture > 1 ? ' (' + l.aperture + ' volte)' : '') : 'Il tecnico non l\'ha ancora aperto';
  var tec = tecDi(a), tel = tec && (tec.tel || tec.telefono);
  h += '<div class="acq-azioni">'
    + '<button class="gx-btn pieno" onclick="_acqTecWa(\'' + id + '\')"' + (tel ? '' : ' disabled title="Il tecnico non ha il telefono nella Rubrica"') + '>' + ico(I.wa) + ' Invia su WhatsApp</button>'
    + '<button class="gx-btn" onclick="_acqTecCopia(\'' + id + '\')" title="Copia link e codice per mandarli in un altro modo">' + ico(I.copia) + ' Copia link e codice</button>'
    + '<button class="gx-btn" onclick="_acqTecAggiorna(\'' + id + '\')"' + (lav ? ' disabled' : '') + ' title="Controlla se il tecnico ha aperto la pagina o caricato documenti">' + ico(I.giro) + ' Aggiorna</button>'
    + '<button class="gx-btn" onclick="_acqTecSpegni(\'' + id + '\')"' + (lav ? ' disabled' : '') + ' title="Da subito il link non funziona più">Spegni</button>'
    + '<span class="nota">' + esc(info) + '</span></div>';
  /* controllo automatico all'apertura del percorso, al massimo ogni 5 minuti */
  if(!lav && (!_tecCtrl[a.id] || Date.now() - _tecCtrl[a.id] > 300000)){
    _tecCtrl[a.id] = Date.now();
    setTimeout(function(){ if(_vista === 'dettaglio' && _apertoId === a.id) window._acqTecAggiorna(a.id, true); }, 300);
  }
  return h;
}
window._acqTecCrea = function(acqId){
  var a = trova(acqId), im = immDi(a); if(!a || !im) return;
  if(!scriptId()){ avviso('Indirizzo dello script Google non valido (Testi dei messaggi)'); return; }
  var el = document.getElementById('acq-tec-gg'), gg = parseInt((el && el.value) || '15', 10) || 15;
  var tec = tecDi(a), prima = tecLink(a);
  _tecLav[a.id] = true; disegna();
  cartelleDoc(im).then(function(cd){
    return driveChiama('tecCrea', { cartella:cd.docId, etichetta:etichetta(im), ref:im.ref || '', tecnico:tec ? bello(tec.nome || '') : '',
      agente:[agenteNome(), agenzia()].filter(Boolean).join(' · '), tipi:tecTipi(a, im), giorni:gg, vecchio:prima ? prima.token : '' });
  }).then(function(o){
    delete _tecLav[a.id];
    norma(a).tappe.tecnico.link = { token:o.token, codice:o.codice, scad:o.scad, creato:oggi(), giorni:gg, visto:0, aperture:0, visti:[] };
    _tecCtrl[a.id] = Date.now();
    diario(a, 'Link per il tecnico creato (vale ' + gg + ' giorni)');
    salva(); disegna();
    avviso('Link pronto: mandalo al tecnico con "Invia su WhatsApp"');
  }).catch(function(e){ delete _tecLav[a.id]; disegna(); avviso('Link non creato: ' + errDrive(e).message); });
};
window._acqTecWa = function(acqId){
  var a = trova(acqId), im = immDi(a), l = a && tecLink(a); if(!im || !tecAttivo(l)) return;
  var tec = tecDi(a), tel = tec && (tec.tel || tec.telefono);
  var url = (typeof window._waSendUrl === 'function') ? window._waSendUrl(tel, tecTesto(a, im, l)) : '';
  if(!url){ avviso('Numero di telefono del tecnico mancante o non valido'); return; }
  try{ window.open(url, '_blank'); }catch(e){ window.location.href = url; }
  diario(a, 'Link per il tecnico inviato su WhatsApp a ' + bello(tec.nome || ''));
  salva(); disegna();
};
window._acqTecCopia = function(acqId){
  var a = trova(acqId), im = immDi(a), l = a && tecLink(a); if(!im || !tecAttivo(l)) return;
  copiaTesto(tecTesto(a, im, l), 'Messaggio con link e codice copiato');
};
window._acqTecSpegni = function(acqId){
  var a = trova(acqId), l = a && tecLink(a); if(!l) return;
  var fai = function(){
    _tecLav[a.id] = true; disegna();
    driveChiama('tecSpegni', { token:l.token }).then(function(){
      delete _tecLav[a.id]; l.spento = oggi(); diario(a, 'Link per il tecnico spento'); salva(); disegna(); avviso('Link spento');
    }).catch(function(e){ delete _tecLav[a.id]; disegna(); avviso('Non spento: ' + errDrive(e).message); });
  };
  if(typeof window.dlgConfirm === 'function') window.dlgConfirm('Spengo il link del tecnico? Da subito non potrà più vedere né caricare documenti. I documenti restano su Drive.', '', 'Pagina per il tecnico').then(function(ok){ if(ok) fai(); });
  else fai();
};
/* stato del link e documenti caricati dal tecnico */
window._acqTecAggiorna = function(acqId, zitto){
  var a = trova(acqId), im = immDi(a), l = a && tecLink(a); if(!im || !l || !drivePronto()) return;
  _tecLav[a.id] = true; if(!zitto) disegna();
  driveChiama('tecStato', { token:l.token }).then(function(o){
    delete _tecLav[a.id]; _tecCtrl[a.id] = Date.now();
    var cambiato = false;
    if(!o.esiste){ if(!l.spento && l.scad > Date.now()){ l.spento = oggi(); cambiato = true; } }
    else {
      if(o.visto !== l.visto || o.aperture !== l.aperture || !!o.bloccato !== !!l.bloccato){ l.visto = o.visto || 0; l.aperture = o.aperture || 0; l.bloccato = !!o.bloccato; cambiato = true; }
      if(!Array.isArray(im.docFile)) im.docFile = [];
      if(!Array.isArray(l.visti)) l.visti = [];
      var nuovi = 0;
      (o.caricati || []).forEach(function(x){
        if(!x || !x.id || l.visti.indexOf(x.id) >= 0) return;
        l.visti.push(x.id);
        if(im.docFile.some(function(f){ return f.id === x.id; })) return;
        var k = /^\d+$/.test(String(x.k)) ? parseInt(x.k, 10) : String(x.k || 'altro');
        im.docFile.push({ k:k, mime:x.mime || '', nome:x.nome, id:x.id, url:'https://drive.google.com/file/d/' + x.id + '/view', data:dataDa(x.data || Date.now()), pag:0, peso:x.peso || 0, tecnico:true });
        segnaRicevuto(a, im, k);
        diario(a, 'Caricato dal tecnico: ' + x.nome);
        nuovi++;
      });
      if(nuovi){ im._modificata = Date.now(); cambiato = true; avviso(nuovi === 1 ? 'Il tecnico ha caricato un documento' : 'Il tecnico ha caricato ' + nuovi + ' documenti'); }
    }
    if(cambiato) salva();
    if(cambiato || !zitto) archRidisegna();
  }).catch(function(e){
    delete _tecLav[a.id];
    if(!zitto){ disegna(); avviso('Non riesco a controllare il link: ' + errDrive(e).message); }
  });
};


window.acquisizioniPerClaude = function(){
  try{
    return vivi().filter(function(a){ return a.stato !== 'chiusa'; }).map(function(a){
      var im = immDi(a), p = propDi(im), s = im ? stati(a, im) : null;
      return { id:a.id, n:im ? etichetta(im) : (a.immEt || 'Immobile'), ref:(im && im.ref) || '', avv:a.creato || '',
        prop_n:p.nome || '', prop_t:p.tel || '', st:s, foto:(norma(a).tappe.foto.data || ''),
        sp:im ? passiDi(a).map(function(k){ return { k:k, s:statoPasso(a, im, k, s) }; }) : [],   /* [20 ott 2026] i passi, in ordine */
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
  return { stati:stati(a, im), passi:passiDi(a).map(function(k){ return k + ':' + statoPasso(a, im, k); }), proprietario:contaDocs(a, im, 'proprietario'), tecnico:contaDocs(a, im, 'tecnico'), ferme:ferme(a, im) };
};

})();
