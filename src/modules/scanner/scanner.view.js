// modules/scanner/scanner.view.js — Scansione documenti (camscanner) abbinata al gestionale.
// ----------------------------------------------------------------------------
// [25 ott 2026] Scelte di Enzo: ogni documento va sulla scheda dell'immobile
// O su quella del cliente (a seconda della categoria); più foto dello stesso
// documento diventano UN SOLO PDF (libreria jsPDF da cdnjs, caricata al volo
// solo quando serve, non appesantisce il resto); l'AI prova a leggere i
// documenti dove ha più senso (visura/atto → dati catastali, APE → classe
// energetica, documenti d'identità → anagrafica), gli altri restano solo
// archiviati ed etichettati.
//
// Riusa l'archivio online e l'AI già usati per "Incarico firmato a mano" in
// Acquisizioni (Firebase Storage sotto users/{uid}/…, Worker Claude configurato
// in "Impostazioni AI" dentro Caccia Annunci): non introduce un secondo modo
// di fare le stesse cose, né una seconda chiave da configurare.
//
// [25 ott 2026, continua] Spesso si va dal cliente a prendere i documenti
// PRIMA che ci sia un incarico (niente scheda immobile possibile) e altre
// volte solo per una valutazione (la scheda immobile si crea apposta): le
// categorie sono le STESSE su immobile e cliente, così qualsiasi documento
// si scansiona sul cliente quando l'immobile non c'è ancora, e si sposta lì
// con un tocco ("Sposta qui") quando l'immobile nasce ed è collegato a
// quel cliente.
//
// DATI, UN POSTO SOLO:
//   im.documenti = [{ id, cat (0-14 indice di DOCS_LABELS, o 'altro'), nome,
//                      url, percorso, pagine, data }] — e im.docsChecklist[cat]
//                      viene spuntato da solo (cat numerica): stessa lista, non due.
//   c.documenti  = [{ id, cat (stessa lista), nome, url, percorso, pagine, data }]
//
// DIPENDENZE dal monolite (via window, sempre con typeof — un nome mancante
// non deve rompere il resto): D, saveD, genUUID, showToast, dlgConfirm,
// DOCS_LABELS, updateDocCheck, callClaude, aiGetConfig, aiModel,
// faiParseJSON, cliCfControlla, _storage, _storageReady, _currentUserId,
// openImmobileModal, openClienteModal.
// ----------------------------------------------------------------------------
(function(){
'use strict';

/* ── 1. CATEGORIE ──────────────────────────────────────────────────────── */
/* [25 ott 2026] Scelta di Enzo: spesso va dal cliente a prendere i documenti
   PRIMA che ci sia un incarico (niente scheda immobile ancora possibile), e
   altre volte ci va solo per una valutazione (la scheda immobile la crea
   apposta). Per questo le categorie sono LE STESSE sul cliente e
   sull'immobile: qualsiasi documento si può scansionare sulla scheda del
   cliente quando quella dell'immobile ancora non c'è, e spostarlo dopo
   (scanSpostaSuImmobile) quando nasce. */
function immCatNomi(){
  return (typeof window.DOCS_LABELS !== 'undefined' && Array.isArray(window.DOCS_LABELS)) ? window.DOCS_LABELS : [];
}
var CAT_ALTRO = 'altro';
/* famiglia di lettura AI per categoria (uguale su immobile e cliente: cambia
   solo se i dati letti si POSSONO scrivere in automatico, non cosa si legge) */
var AI_FAM = { 0:'atto', 1:'atto', 4:'ape', 14:'identita' };

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function oggi(){ return new Date().toISOString().slice(0,10); }
function toast(msg, tipo){ try{ if(typeof showToast==='function') showToast(msg,'',tipo==='error'?'#DC2626':(tipo==='warn'?'#D97706':'#15803D')); else alert(msg); }catch(e){} }
function nuovoId(){ return (typeof genUUID==='function') ? genUUID() : ('scan_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)); }

/* ── 2. STATO ──────────────────────────────────────────────────────────── */
var S = null;
function statoNuovo(){ return { tipo:null, idx:null, cat:null, pagine:[], inCorso:false, letti:null, applica:{} }; }

/* ── 3. APERTURA ───────────────────────────────────────────────────────── */
/* dalla scheda immobile: cat facoltativa (viene già scelta dal pulsante della riga) */
window.scanApriImm = function(immIdx, cat){
  var im = (window.D && D.immobili || [])[immIdx];
  if(!im){ toast('Salva prima l\'immobile: la scansione si aggancia a una scheda già esistente', 'warn'); return; }
  S = statoNuovo(); S.tipo = 'immobile'; S.idx = immIdx; S.cat = (cat===undefined ? null : cat);
  apri();
};
window.scanApriCli = function(cliIdx){
  var c = (window.D && D.clienti || [])[cliIdx];
  if(!c){ toast('Salva prima il cliente: la scansione si aggancia a una scheda già esistente', 'warn'); return; }
  S = statoNuovo(); S.tipo = 'cliente'; S.idx = cliIdx; S.cat = null;
  apri();
};
/* dalla riga del checklist: legge D.editIdx al clic (la riga è sempre la stessa, l'immobile aperto cambia) */
window.scanApriImmCorrente = function(cat){
  var idx = (typeof D!=='undefined') ? D.editIdx : null;
  if(idx===null || idx===undefined || D.editType!=='immobile'){ toast('Salva prima l\'immobile: la scansione si aggancia a una scheda già esistente', 'warn'); return; }
  window.scanApriImm(idx, cat);
};
window.scanApriCliCorrente = function(){
  var idx = (typeof D!=='undefined') ? D.editIdx : null;
  if(idx===null || idx===undefined || D.editType!=='cliente'){ toast('Salva prima il cliente: la scansione si aggancia a una scheda già esistente', 'warn'); return; }
  window.scanApriCli(idx);
};

/* ── 4. STILE (una volta sola) ─────────────────────────────────────────── */
function stile(){
  if(document.getElementById('scan-css')) return;
  var s = document.createElement('style'); s.id = 'scan-css';
  s.textContent =
    '#scan-dlg{position:fixed;inset:0;z-index:9800;display:flex;align-items:center;justify-content:center;padding:14px}' +
    '.scan-sf{position:absolute;inset:0;background:rgba(13,27,42,.58)}' +
    '.scan-fin{position:relative;width:min(640px,100%);max-height:92vh;overflow:auto;background:#fff;color:#0F172A;border-radius:16px;box-shadow:0 24px 70px rgba(13,27,42,.45);display:flex;flex-direction:column}' +
    '.scan-testa{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 12px;border-bottom:1px solid rgba(13,27,42,.1)}' +
    '.scan-testa>div{flex:1;min-width:0}.scan-t{font-size:1.1rem;font-weight:800}.scan-s{font-size:.8rem;color:#475569;margin-top:3px;line-height:1.4}' +
    '.scan-x{width:32px;height:32px;border:1px solid rgba(13,27,42,.15);border-radius:8px;background:#fff;color:#334155;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0}' +
    '.scan-corpo{padding:16px 20px 20px;display:flex;flex-direction:column;gap:14px}' +
    '.scan-cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}' +
    '.scan-cat-btn{text-align:left;padding:11px 13px;border:1.5px solid rgba(13,27,42,.14);border-radius:10px;background:#F8FAFC;cursor:pointer;font:inherit;font-size:.83rem;font-weight:600;color:#0F172A}' +
    '.scan-cat-btn:hover{border-color:#EA580C}' +
    '.scan-az{display:flex;gap:9px;flex-wrap:wrap}' +
    '.scan-b{display:inline-flex;align-items:center;gap:7px;border:1.5px solid rgba(13,27,42,.2);border-radius:9px;background:#fff;color:#334155;font:inherit;font-size:.86rem;font-weight:700;padding:10px 15px;cursor:pointer}' +
    '.scan-b.p{background:#EA580C;border-color:#EA580C;color:#fff}.scan-b:disabled{opacity:.5;cursor:default}' +
    '.scan-pagine{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}' +
    '.scan-pag{position:relative;border:1.5px solid rgba(13,27,42,.14);border-radius:9px;overflow:hidden;aspect-ratio:3/4;background:#0F172A}' +
    '.scan-pag img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.scan-pag button{position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;border:none;background:rgba(15,23,42,.75);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}' +
    '.scan-pag .n{position:absolute;bottom:3px;left:5px;color:#fff;font-size:.68rem;font-weight:800;text-shadow:0 1px 2px rgba(0,0,0,.6)}' +
    '.scan-nota{font-size:.78rem;color:#64748B;line-height:1.5}' +
    '.scan-tab{width:100%;border-collapse:collapse;font-size:.82rem}' +
    '.scan-tab th{text-align:left;color:#64748B;font-weight:700;font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;padding:5px 7px;border-bottom:1px solid rgba(13,27,42,.1)}' +
    '.scan-tab td{padding:6px 7px;border-bottom:1px solid rgba(13,27,42,.06);vertical-align:middle}' +
    '.scan-tab input[type=text],.scan-tab input:not([type]){width:100%;border:1.5px solid rgba(13,27,42,.18);border-radius:7px;padding:6px 8px;font:inherit;font-size:.82rem}' +
    '.scan-list{display:flex;flex-direction:column;gap:6px}' +
    '.scan-list .r{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#F8FAFC;border:1px solid rgba(13,27,42,.1);border-radius:9px;font-size:.82rem}' +
    '.scan-list .r .nm{flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.scan-badge{display:inline-flex;align-items:center;gap:5px;font-size:.7rem;font-weight:800;color:#0F5132;background:#DCFCE7;border-radius:999px;padding:3px 9px;cursor:pointer;border:none}' +
    '.scan-cam{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:1.5px solid rgba(13,27,42,.16);background:#fff;color:#334155;cursor:pointer;flex-shrink:0;margin-left:6px}' +
    '.scan-cam:hover{border-color:#EA580C;color:#EA580C}' +
    'body.hub-buio .scan-fin,body.dark-mode .scan-fin{background:#1E293B;color:#E2E8F0}' +
    'body.hub-buio .scan-cat-btn,body.dark-mode .scan-cat-btn{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14);color:#E2E8F0}' +
    'body.hub-buio .scan-b,body.dark-mode .scan-b{background:rgba(255,255,255,.06);color:#E2E8F0;border-color:rgba(255,255,255,.2)}' +
    'body.hub-buio .scan-b.p,body.dark-mode .scan-b.p{background:#EA580C;border-color:#EA580C;color:#fff}' +
    'body.hub-buio .scan-list .r,body.dark-mode .scan-list .r{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12)}' +
    'body.hub-buio .scan-testa,body.dark-mode .scan-testa{border-color:rgba(255,255,255,.12)}';
  document.head.appendChild(s);
}
function ic(p, w){ return '<svg width="'+(w||16)+'" height="'+(w||16)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>'; }
var IC_CAM = '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>';
var IC_X = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
var IC_GAL = '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>';
var IC_TRASH = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>';
var IC_DOC = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';

/* ── 5. LETTURA/RIDUZIONE FOTO (come in Acquisizioni, stessa taglia) ─────── */
function leggiFoto(file){
  return new Promise(function(ok, ko){
    var fr = new FileReader();
    fr.onerror = function(){ ko(new Error(file.name+': non riesco a leggerla')); };
    fr.onload = function(){
      var img = new Image();
      img.onerror = function(){ ko(new Error(file.name+': formato non leggibile')); };
      img.onload = function(){
        var lato = 2000, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, lato/Math.max(w,h));
        var cv = document.createElement('canvas'); cv.width = Math.round(w*k); cv.height = Math.round(h*k);
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0,0,cv.width,cv.height); cx.drawImage(img,0,0,cv.width,cv.height);
        var dataUrl = cv.toDataURL('image/jpeg', 0.85);
        ok({ dataUrl:dataUrl, b64:dataUrl.split(',')[1]||'', w:cv.width, h:cv.height });
      };
      img.src = String(fr.result||'');
    };
    fr.readAsDataURL(file);
  });
}
function scegliFoto(capture){
  var i = document.createElement('input');
  i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
  if(capture) i.setAttribute('capture', 'environment');
  i.onchange = function(){
    var files = Array.prototype.slice.call(i.files||[]);
    if(!files.length) return;
    Promise.all(files.map(leggiFoto)).then(function(L){
      L.forEach(function(p){ S.pagine.push(p); });
      disegna();
    }).catch(function(e){ toast(e.message||'Foto non letta', 'error'); });
  };
  i.click();
}

/* ── 6. PDF (jsPDF da cdnjs, caricata solo alla prima scansione) ─────────── */
function jsPdfPronto(){
  if(window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if(window._scanJsPdfCarico) return window._scanJsPdfCarico;
  window._scanJsPdfCarico = new Promise(function(ok, ko){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = function(){ (window.jspdf && window.jspdf.jsPDF) ? ok(window.jspdf.jsPDF) : ko(new Error('la libreria PDF non si è installata')); };
    s.onerror = function(){ window._scanJsPdfCarico = null; ko(new Error('non riesco a scaricare la libreria PDF: controlla la connessione')); };
    document.head.appendChild(s);
  });
  return window._scanJsPdfCarico;
}
function costruisciPdf(pagine){
  return jsPdfPronto().then(function(jsPDF){
    var p0 = pagine[0], or0 = p0.w >= p0.h ? 'l' : 'p';
    var doc = new jsPDF({ orientation:or0, unit:'px', format:[p0.w, p0.h], compress:true });
    doc.addImage(p0.dataUrl, 'JPEG', 0, 0, p0.w, p0.h);
    for(var i=1;i<pagine.length;i++){
      var p = pagine[i], or = p.w >= p.h ? 'l' : 'p';
      doc.addPage([p.w, p.h], or);
      doc.addImage(p.dataUrl, 'JPEG', 0, 0, p.w, p.h);
    }
    return doc.output('blob');
  });
}

/* ── 7. ARCHIVIO ONLINE (stesso Firebase Storage di Acquisizioni) ───────── */
function carica(blob, cartella, nomeFile){
  return new Promise(function(ok, ko){
    if(!window._storageReady || !window._storage) return ko(new Error('l\'archivio online non è disponibile in questo momento'));
    var uid = ''; try{ uid = (typeof window._currentUserId==='function') ? window._currentUserId() : ''; }catch(e){}
    if(!uid) return ko(new Error('utente non riconosciuto'));
    var percorso = 'users/'+uid+'/'+cartella+'/'+nomeFile;
    var ref = window._storage.ref().child(percorso);
    ref.put(blob, { contentType:'application/pdf' }).then(function(s){ return s.ref.getDownloadURL(); })
      .then(function(url){ ok({ url:url, percorso:percorso }); }).catch(ko);
  });
}

/* ── 8. LETTURA CON L'AI ──────────────────────────────────────────────── */
function aiPronta(){ try{ return !!((typeof aiGetConfig==='function') && aiGetConfig().url); }catch(e){ return false; } }
function aiLeggi(prompt, pagine){
  var contenuti = pagine.slice(0,3).map(function(p){ return { type:'image', source:{ type:'base64', media_type:'image/jpeg', data:p.b64 } }; });
  contenuti.push({ type:'text', text:prompt });
  return callClaude({ model:(typeof aiModel==='function'?aiModel():'claude-sonnet-4-6'), max_tokens:800, messages:[{ role:'user', content:contenuti }] })
    .then(function(data){
      var txt = ''; try{ txt = (data.content||[]).map(function(b){ return b.text||''; }).join('').trim(); }catch(e){}
      var j = (typeof faiParseJSON==='function') ? faiParseJSON(txt) : JSON.parse(txt);
      if(!j || typeof j !== 'object') throw new Error('l\'AI non ha risposto in un formato leggibile, riprova');
      return j;
    });
}
function promptAtto(){
  return 'Questo è un documento catastale (visura o atto di proprietà) di un immobile italiano. '
    + 'Leggi i dati e rispondi ESCLUSIVAMENTE con un JSON valido, niente testo prima o dopo, niente backtick:\n'
    + '{"catasto":{"sezione":"","foglio":"","particella":"","sub":"","categoria":"","classe":"","rendita":"","comune":""},'
    + '"intestatari":["nome e cognome di ogni intestatario"],"note":""}\n'
    + 'Lascia "" dove non leggi con certezza. "rendita" solo la cifra, senza simbolo euro. Non inventare nulla.';
}
function promptApe(){
  return 'Questo è un APE (Attestato di Prestazione Energetica) di un immobile italiano. '
    + 'Rispondi ESCLUSIVAMENTE con un JSON valido: {"classe":"","epgl":"","numero":"","scadenza":""}\n'
    + '"classe" una di A4,A3,A2,A1,B,C,D,E,F,G. "epgl" solo la cifra dell\'indice EPgl,nren (kWh/m² anno). '
    + '"scadenza" in AAAA-MM-GG se c\'è. Lascia "" dove non sei sicuro.';
}
function promptIdentita(){
  return 'Questo è un documento d\'identità italiano (carta d\'identità o tessera sanitaria/codice fiscale). '
    + 'Rispondi ESCLUSIVAMENTE con un JSON valido: '
    + '{"nome":"","cognome":"","dataNascita":"","luogoNascita":"","provNascita":"","cf":"","indirizzo":"","civico":"","comune":"","prov":"","cap":""}\n'
    + '"dataNascita" in AAAA-MM-GG. "provNascita"/"prov" la sigla di due lettere. Lascia "" dove non leggi con certezza. Non inventare nulla.';
}

/* ── 9. CAMPI DA PROPORRE (per famiglia di lettura) ──────────────────────
   Ogni riga: { l:etichetta, leggi:funzione(dati)->valore letto,
                applica:funzione(valore) -> scrive su D e, se il campo è a
                schermo, anche nel modulo aperto } */
function righeAtto(dati, tipo){
  /* [25 ott 2026] Se il documento è sul CLIENTE (niente scheda immobile
     ancora: nessun incarico, o solo una valutazione fatta altrove) i dati
     catastali restano solo da leggere — non c'è una scheda immobile dove
     scriverli. Tornano scrivibili da soli quando il documento viene
     spostato sull'immobile (vedi scanSpostaSuImmobile). */
  var scrivibile = (tipo==='immobile');
  var c = dati.catasto || {}, R = [];
  function riga(k, l, campo){
    return { l:l, v:c[k]||'', campo:scrivibile?campo:null };
  }
  R.push(riga('sezione','Sezione','catSezione'));
  R.push(riga('foglio','Foglio','catFoglio'));
  R.push(riga('particella','Particella','catParticella'));
  R.push(riga('sub','Subalterno','catSub'));
  R.push(riga('categoria','Categoria','catCategoria'));
  R.push(riga('classe','Classe','catClasse'));
  R.push(riga('rendita','Rendita (€)','catRendita'));
  R.push(riga('comune','Comune catastale','catComune'));
  if(Array.isArray(dati.intestatari) && dati.intestatari.filter(Boolean).length){
    R.push({ l:'Intestatari (solo da leggere: non si scrivono da soli)', v:dati.intestatari.filter(Boolean).join(', '), campo:null });
  }
  return R.filter(function(r){ return r.v; });
}
function righeApe(dati, tipo){
  var scrivibile = (tipo==='immobile');
  var R = [];
  if(dati.classe) R.push({ l:'Classe energetica', v:dati.classe, campo:scrivibile?'energia':null });
  if(dati.epgl) R.push({ l:'Indice EPgl,nren', v:dati.epgl, campo:scrivibile?'epgl':null });
  return R;
}
function righeIdentita(dati, tipo){
  var R = [];
  var nomeCompleto = [dati.nome, dati.cognome].filter(Boolean).join(' ');
  if(tipo==='cliente'){
    if(nomeCompleto) R.push({ l:'Nome e cognome', v:nomeCompleto, campo:'nome' });
    if(dati.cf) R.push({ l:'Codice fiscale', v:String(dati.cf).toUpperCase(), campo:'cf' });
    if(dati.dataNascita) R.push({ l:'Data di nascita', v:dati.dataNascita, campo:'nascita' });
    if(dati.luogoNascita) R.push({ l:'Luogo di nascita', v:dati.luogoNascita, campo:'luogoNascita' });
    if(dati.provNascita) R.push({ l:'Prov. di nascita', v:dati.provNascita, campo:'provNascita' });
    if(dati.indirizzo) R.push({ l:'Indirizzo', v:dati.indirizzo, campo:'indirizzo' });
    if(dati.civico) R.push({ l:'Civico', v:dati.civico, campo:'civico' });
    if(dati.comune) R.push({ l:'Comune di residenza', v:dati.comune, campo:'citta' });
    if(dati.prov) R.push({ l:'Prov. di residenza', v:dati.prov, campo:'prov' });
    if(dati.cap) R.push({ l:'CAP', v:dati.cap, campo:'cap' });
  } else {
    /* sull'immobile: solo da leggere, propone di aprire/aggiornare il cliente collegato */
    if(nomeCompleto) R.push({ l:'Nome e cognome', v:nomeCompleto, campo:null });
    if(dati.cf) R.push({ l:'Codice fiscale', v:String(dati.cf).toUpperCase(), campo:null });
    if(dati.dataNascita) R.push({ l:'Data di nascita', v:dati.dataNascita, campo:null });
  }
  return R;
}

/* ── 10. APPLICA I DATI LETTI ──────────────────────────────────────────────
   [25 ott 2026 — corretto] "dati" qui è SEMPRE un dizionario piatto { campo
   del gestionale: valore (eventualmente corretto a mano da Enzo nella
   tabella) }, perché il campo di ogni riga (r.campo in corpoConferma) è già
   il nome vero del campo su D.immobili/D.clienti — non il nome che usa l'AI
   nella sua risposta. Un'unica funzione, senza più ricostruire a mano una
   forma diversa: elimina la classe di bug "il nome non torna". Le caselle
   catastali sono le uniche con un id HTML diverso dal nome del campo
   (im-cat-foglio, non im-catFoglio): ID_SPECIALE copre quel caso. */
var ID_SPECIALE = {
  catSezione:'cat-sezione', catFoglio:'cat-foglio', catParticella:'cat-particella', catSub:'cat-sub',
  catCategoria:'cat-categoria', catClasse:'cat-classe', catRendita:'cat-rendita', catComune:'cat-comune'
};
function setCampo(prefix, campo, val){
  var id = ID_SPECIALE[campo] || campo;
  var el = document.getElementById(prefix+'-'+id);
  if(el) el.value = val;
}
function applicaDati(prefix, target, dati){
  Object.keys(dati).forEach(function(campo){
    var v = dati[campo];
    if(v===undefined || v===null || v==='') return;
    target[campo] = v;
    setCampo(prefix, campo, v);
  });
  if(prefix==='cli' && dati.cf){
    try{ if(typeof cliCfControlla==='function') cliCfControlla(true); }catch(e){}
  }
  saveD();
}

/* ── 11. DISEGNO ───────────────────────────────────────────────────────── */
function catLista(){
  var L = immCatNomi().map(function(nome,i){ return { id:i, nome:nome }; });
  L.push({ id:CAT_ALTRO, nome:'Altro documento' });
  return L;
}
function catNome(cat){
  if(cat===CAT_ALTRO) return 'Altro documento';
  return (immCatNomi()[cat]) || ('Categoria '+cat);
}
function chiude(){ var d = document.getElementById('scan-dlg'); if(d) d.remove(); S = null; }
window.scanChiudi = chiude;

function corpoScelta(){
  var L = catLista();
  return '<div class="scan-corpo">'
    + '<div class="scan-nota">Scegli che documento stai per scansionare.</div>'
    + '<div class="scan-cat-grid">' + L.map(function(x){
        return '<button type="button" class="scan-cat-btn" onclick="scanSceltaCategoria('+JSON.stringify(String(x.id)).replace(/"/g,'&quot;')+')">'+esc(x.nome)+'</button>';
      }).join('') + '</div></div>';
}
window.scanSceltaCategoria = function(cat){
  /* [25 ott 2026] le categorie sono le stesse su immobile e cliente: 0-14
     numeriche (DOCS_LABELS) oppure 'altro' */
  var n = parseInt(cat,10);
  S.cat = isNaN(n) ? cat : n;
  disegna();
};

function corpoCattura(){
  var h = '<div class="scan-corpo">'
    + '<div class="scan-nota">Documento: <b>'+esc(catNome(S.cat))+'</b>'+(S.pagine.length?' — '+S.pagine.length+(S.pagine.length===1?' pagina':' pagine'):'')+'. Fotografa ogni pagina: alla fine le unisco in un unico PDF.</div>'
    + '<div class="scan-az">'
    +   '<button type="button" class="scan-b p" onclick="scanFoto(true)">'+ic(IC_CAM,16)+' Fotografa</button>'
    +   '<button type="button" class="scan-b" onclick="scanFoto(false)">'+ic(IC_GAL,16)+' Dalla galleria</button>'
    + '</div>';
  if(S.pagine.length){
    h += '<div class="scan-pagine">' + S.pagine.map(function(p,i){
      return '<div class="scan-pag"><img src="'+p.dataUrl+'" alt="Pagina '+(i+1)+'"><span class="n">'+(i+1)+'</span><button type="button" onclick="scanTogliPagina('+i+')" title="Togli questa pagina">'+ic(IC_X,13)+'</button></div>';
    }).join('') + '</div>';
  }
  h += '<div class="scan-az">'
    + (S.pagine.length ? '<button type="button" class="scan-b p" id="scan-fine-btn" onclick="scanFinisci()">'+ic(IC_DOC,16)+' Fine: unisci e carica</button>' : '')
    + '<button type="button" class="scan-b" onclick="scanIndietroCategoria()">← Cambia documento</button>'
    + '</div></div>';
  return h;
}
window.scanFoto = function(capture){ scegliFoto(capture); };
window.scanTogliPagina = function(i){ S.pagine.splice(i,1); disegna(); };
window.scanIndietroCategoria = function(){ S.pagine = []; S.cat = null; disegna(); };

function corpoCarico(msg){
  return '<div class="scan-corpo"><div class="scan-nota" style="text-align:center;padding:20px 0">'+esc(msg)+'…</div></div>';
}

function corpoConferma(){
  var fam = AI_FAM[S.cat];
  var righe = [];
  if(fam==='atto') righe = righeAtto(S.letti, S.tipo);
  else if(fam==='ape') righe = righeApe(S.letti, S.tipo);
  else if(fam==='identita') righe = righeIdentita(S.letti, S.tipo);
  var h = '<div class="scan-corpo">'
    + '<div class="scan-nota">L\'AI ha letto questi dati: scegli quali riportare in scheda. Il documento è già archiviato, questo passo è facoltativo.</div>';
  if(!righe.length){
    h += '<div class="scan-nota">Non ho letto dati utili da riportare in automatico.</div>';
  } else {
    h += '<table class="scan-tab"><thead><tr><th style="width:30px"></th><th>Campo</th><th>Letto dall\'AI</th></tr></thead><tbody>'
      + righe.map(function(r, i){
          var puoApplicare = !!r.campo;
          return '<tr><td>'+(puoApplicare ? '<input type="checkbox" id="scan-ck-'+i+'" checked>' : '')+'</td>'
            + '<td>'+esc(r.l)+'</td>'
            + '<td>'+(puoApplicare ? '<input type="text" id="scan-v-'+i+'" value="'+esc(r.v)+'">' : esc(r.v))+'</td></tr>';
        }).join('') + '</tbody></table>';
  }
  h += '<div class="scan-az">'
    + (righe.some(function(r){return r.campo;}) ? '<button type="button" class="scan-b p" onclick="scanApplica()">Applica e chiudi</button>' : '')
    + '<button type="button" class="scan-b" onclick="scanChiudi()">Chiudi</button>'
    + '</div></div>';
  window._scanRigheConferma = righe;
  return h;
}
window.scanApplica = function(){
  var righe = window._scanRigheConferma || [];
  var dati = {};
  righe.forEach(function(r, i){
    if(!r.campo) return;
    var ck = document.getElementById('scan-ck-'+i), v = document.getElementById('scan-v-'+i);
    if(ck && ck.checked && v) dati[r.campo] = v.value;
  });
  if(!Object.keys(dati).length){ chiude(); return; }
  if(S.tipo==='immobile'){
    var im = D.immobili[S.idx]; if(!im){ chiude(); return; }
    applicaDati('im', im, dati);
    toast('Dati applicati alla scheda immobile');
  } else {
    var c = D.clienti[S.idx]; if(!c){ chiude(); return; }
    applicaDati('cli', c, dati);
    toast('Dati applicati alla scheda cliente');
  }
  chiude();
};

function disegna(){
  stile();
  var d = document.getElementById('scan-dlg');
  if(!d){ d = document.createElement('div'); d.id = 'scan-dlg'; document.body.appendChild(d); }
  var corpo;
  if(S.inCorso) corpo = corpoCarico(S.inCorso);
  else if(S.letti) corpo = corpoConferma();
  else if(S.cat===null) corpo = corpoScelta();
  else corpo = corpoCattura();
  var sotto = (S.tipo==='immobile') ? 'Scheda immobile' : 'Scheda cliente';
  d.innerHTML =
    '<div class="scan-sf" onclick="scanChiudi()"></div>'
    + '<div class="scan-fin" role="dialog" aria-modal="true" aria-label="Scansiona documento">'
    +   '<div class="scan-testa"><div><div class="scan-t">Scansiona documento</div><div class="scan-s">'+sotto+'</div></div>'
    +   '<button class="scan-x" type="button" onclick="scanChiudi()" aria-label="Chiudi">'+ic(IC_X,16)+'</button></div>'
    +   corpo
    + '</div>';
}
function apri(){ stile(); disegna(); }

/* ── 12. FINE: UNISCE, CARICA, (SE HA SENSO) LEGGE CON L'AI ──────────────── */
window.scanFinisci = function(){
  if(!S.pagine.length) return;
  var pagine = S.pagine.slice();
  S.inCorso = 'Unisco le pagine in un PDF'; disegna();
  costruisciPdf(pagine).then(function(blob){
    S.inCorso = 'Carico sull\'archivio online'; disegna();
    var im = (S.tipo==='immobile') ? D.immobili[S.idx] : null;
    var c  = (S.tipo==='cliente')  ? D.clienti[S.idx]  : null;
    var riferimento = im ? (im.ref || ('imm'+S.idx)) : (c ? (c.nome||'cliente').replace(/[^a-zA-Z0-9]/g,'').slice(0,24) || ('cli'+S.idx) : 'doc');
    var catEtichetta = String(catNome(S.cat)).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
    var nomeFile = catEtichetta+'_'+Date.now()+'.pdf';
    var cartella = (S.tipo==='immobile') ? ('immobili/'+String(riferimento).replace(/[^a-zA-Z0-9]/g,'')+'/documenti') : ('clienti/'+String(riferimento)+'/documenti');
    return carica(blob, cartella, nomeFile).then(function(res){
      var rec = { id:nuovoId(), cat:S.cat, nome:catNome(S.cat), url:res.url, percorso:res.percorso, pagine:pagine.length, data:oggi() };
      if(im){
        if(!Array.isArray(im.documenti)) im.documenti = [];
        im.documenti.push(rec);
        if(S.cat!==CAT_ALTRO){
          if(!im.docsChecklist || typeof im.docsChecklist!=='object') im.docsChecklist = {};
          im.docsChecklist[S.cat] = true;
          try{
            var _dc = document.getElementById('dc-'+S.cat);
            if(_dc) _dc.checked = true;
            if(typeof updateDocCheck==='function') updateDocCheck(S.cat);
          }catch(e){}
        }
      } else if(c){
        if(!Array.isArray(c.documenti)) c.documenti = [];
        c.documenti.push(rec);
      }
      saveD();
      try{ if(typeof scanRinfrescaListe==='function') scanRinfrescaListe(); }catch(e){}
      var fam = AI_FAM[S.cat];
      if(fam && aiPronta()){
        S.inCorso = 'Provo a leggerlo con l\'AI'; disegna();
        var prompt = fam==='atto' ? promptAtto() : (fam==='ape' ? promptApe() : promptIdentita());
        return aiLeggi(prompt, pagine).then(function(j){
          S.inCorso = false; S.letti = j; disegna();
        }).catch(function(e){
          console.warn('[Scanner] lettura AI KO:', e);
          toast('Documento archiviato. Lettura AI non riuscita: '+(e.message||'errore'), 'warn');
          chiude();
        });
      }
      toast((S.tipo==='immobile' ? 'Documento archiviato nella scheda immobile' : 'Documento archiviato nella scheda cliente'));
      chiude();
    });
  }).catch(function(e){
    console.error('[Scanner] KO:', e);
    toast('Non sono riuscito a salvare il documento: '+(e.message||'errore'), 'error');
    S.inCorso = false; disegna();
  });
};

/* ── 13. ELENCO DOCUMENTI GIÀ CARICATI + PULSANTI NELLE SCHEDE ───────────── */
function listaDocumenti(doc, puoTogliere){
  if(!doc || !doc.length) return '<div class="scan-nota">Nessun documento ancora caricato.</div>';
  return '<div class="scan-list">' + doc.slice().reverse().map(function(d){
    var i = doc.indexOf(d);
    return '<div class="r"><span class="nm" title="'+esc(d.nome)+'">'+esc(d.nome)+'</span>'
      + '<span style="color:#64748B;font-size:.72rem;flex-shrink:0">'+esc(d.pagine||1)+'pag · '+esc((d.data||'').split('-').reverse().join('/'))+'</span>'
      + '<a href="'+esc(d.url)+'" target="_blank" rel="noopener" class="scan-b" style="padding:5px 10px;font-size:.74rem;text-decoration:none">Apri</a>'
      + (puoTogliere ? '<button type="button" class="scan-b" style="padding:5px 8px" onclick="scanRimuoviDoc(\''+esc(d.id)+'\')" title="Togli dall\'elenco (il file resta online)">'+ic(IC_TRASH,13)+'</button>' : '')
      + '</div>';
  }).join('') + '</div>';
}
window.scanRimuoviDoc = function(id){
  if(typeof dlgConfirm!=='function'){ if(!confirm('Togliere questo documento dall\'elenco?')) return; fai(); return; }
  dlgConfirm('Tolgo questo documento dall\'elenco? Il file resta comunque archiviato online.','','Documenti').then(function(ok){ if(ok) fai(); });
  function fai(){
    ['documenti'].forEach(function(campo){
      (D.immobili||[]).forEach(function(im){ if(im && Array.isArray(im[campo])) im[campo] = im[campo].filter(function(x){ return x.id!==id; }); });
      (D.clienti||[]).forEach(function(c){ if(c && Array.isArray(c[campo])) c[campo] = c[campo].filter(function(x){ return x.id!==id; }); });
    });
    saveD();
    try{ if(typeof scanRinfrescaListe==='function') scanRinfrescaListe(); }catch(e){}
    toast('Tolto dall\'elenco');
  }
};

/* ── 14. SPOSTA SULL'IMMOBILE ──────────────────────────────────────────────
   [25 ott 2026] Spesso si va dal cliente PRIMA che ci sia un incarico (niente
   scheda immobile ancora) e si scansiona tutto sulla sua scheda. Quando poi
   l'immobile nasce ed è collegato a quel cliente, questi documenti si
   portano sull'immobile con un tocco — si COPIANO (restano anche sul
   cliente, come traccia di dove sono arrivati): non si cancella mai niente
   da soli. */
function trovaClienteDi(im){
  if(!im) return null;
  var L = Array.isArray(D.clienti) ? D.clienti : [];
  if(im.clienteUuid){ var c = L.find(function(x){ return x && x.uuid===im.clienteUuid; }); if(c) return c; }
  if(im.clienteRef!==undefined && im.clienteRef!==null && im.clienteRef!==''){
    var i = parseInt(im.clienteRef); if(!isNaN(i) && L[i]) return L[i];
  }
  return null;
}
function docPendenti(im){
  var c = trovaClienteDi(im);
  if(!c || !Array.isArray(c.documenti) || !c.documenti.length) return { cliente:null, lista:[] };
  var gia = {}; (Array.isArray(im.documenti)?im.documenti:[]).forEach(function(d){ gia[d.id] = true; });
  return { cliente:c, lista:c.documenti.filter(function(d){ return !gia[d.id]; }) };
}
window.scanContaPendenti = function(immIdx){
  var im = (D.immobili||[])[immIdx]; if(!im) return 0;
  return docPendenti(im).lista.length;
};
window.scanSpostaSuImmobile = function(immIdx){
  var im = (D.immobili||[])[immIdx]; if(!im) return;
  var p = docPendenti(im);
  if(!p.lista.length){ toast('Niente da spostare'); return; }
  if(!Array.isArray(im.documenti)) im.documenti = [];
  if(!im.docsChecklist || typeof im.docsChecklist!=='object') im.docsChecklist = {};
  p.lista.forEach(function(d){
    im.documenti.push(d);
    if(d.cat!==CAT_ALTRO) im.docsChecklist[d.cat] = true;
  });
  saveD();
  toast(p.lista.length + (p.lista.length===1 ? ' documento spostato sull\'immobile' : ' documenti spostati sull\'immobile'));
  try{
    p.lista.forEach(function(d){
      if(d.cat===CAT_ALTRO) return;
      var _dc = document.getElementById('dc-'+d.cat); if(_dc) _dc.checked = true;
      if(typeof updateDocCheck==='function') updateDocCheck(d.cat);
    });
  }catch(e){}
  try{ if(typeof scanRinfrescaListe==='function') scanRinfrescaListe(); }catch(e){}
  try{ if(typeof mobOpenSchedaImmobile==='function') mobOpenSchedaImmobile(immIdx); }catch(e){}
};
/* banner da mettere sopra l'elenco documenti della scheda immobile (telefono
   e computer): avvisa se ci sono documenti del proprietario pronti */
function bannerPendenti(immIdx){
  var im = (D.immobili||[])[immIdx]; if(!im) return '';
  var p = docPendenti(im);
  if(!p.lista.length) return '';
  var nome = (p.cliente && p.cliente.nome) || 'il cliente';
  return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 13px;background:#FFF7ED;border:1.5px solid #FDBA74;border-radius:10px;margin-bottom:10px">'
    + '<span style="flex:1;min-width:180px;font-size:.84rem;color:#7C2D12"><b>'+p.lista.length+(p.lista.length===1?' documento':' documenti')+'</b> già scansionati per '+esc(nome)+', pronti da collegare qui.</span>'
    + '<button type="button" class="scan-b p" style="padding:7px 13px;font-size:.8rem" onclick="scanSpostaSuImmobile('+immIdx+')">Sposta qui</button>'
    + '</div>';
}
window.scanBannerPendenti = bannerPendenti;

/* ── 15. INIEZIONE NELLE SCHEDE ───────────────────────────────────────────
   Niente riscritture dell'HTML esistente: si aggiungono solo un pulsante
   macchina fotografica per riga del checklist immobile (apre direttamente su
   quella categoria) e un riquadro "Documenti" nella scheda cliente. */
function iniettaImmobile(){
  var righe = document.querySelectorAll('.doc-check-item[id^="dc-wrap-"]');
  righe.forEach(function(row){
    if(row.querySelector('.scan-cam')) return;
    var i = parseInt(String(row.id).replace('dc-wrap-',''), 10);
    if(isNaN(i)) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'scan-cam'; btn.title = 'Scansiona questo documento';
    btn.innerHTML = ic(IC_CAM, 15);
    btn.onclick = function(e){ e.stopPropagation(); window.scanApriImmCorrente(i); };
    row.appendChild(btn);
  });
  var tab = document.getElementById('dc-prov-box');
  if(tab && tab.parentNode && !document.getElementById('scan-imm-doclist')){
    var box = document.createElement('div');
    box.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px dashed var(--border,#E2E8F0)';
    box.innerHTML = '<div style="font-size:.78rem;font-weight:800;color:var(--text2,#334155);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Scansioni caricate</div><div id="scan-imm-doclist"></div>';
    tab.parentNode.insertBefore(box, tab.nextSibling);
  }
  scanRinfrescaListe();
}
function iniettaCliente(){
  var ancora = document.getElementById('cli-fonte');
  var sez = ancora ? ancora.closest('.frow') : null;
  if(sez && sez.parentNode && !document.getElementById('scan-cli-box')){
    var box = document.createElement('div');
    box.id = 'scan-cli-box'; box.className = 'fsection';
    box.style.cssText = 'grid-column:1/-1';
    box.innerHTML = ic(IC_DOC,14) + ' Documenti del cliente'
      + ' <button type="button" class="scan-b" style="padding:5px 10px;font-size:.76rem;margin-left:10px;vertical-align:middle" onclick="scanApriCliCorrente()">'+ic(IC_CAM,13)+' Scansiona</button>'
      + '<div id="scan-cli-doclist" style="margin-top:8px;font-weight:400;text-transform:none;letter-spacing:0"></div>';
    sez.parentNode.insertBefore(box, sez.nextSibling);
  }
  scanRinfrescaListe();
}
window.scanRinfrescaListe = function(){
  var li = document.getElementById('scan-imm-doclist');
  if(li){
    var idx = (typeof D!=='undefined' && D.editType==='immobile' && D.editIdx!=null) ? D.editIdx : null;
    var im = idx!=null ? D.immobili[idx] : null;
    li.innerHTML = im ? (bannerPendenti(idx) + listaDocumenti(im.documenti, true)) : '<div class="scan-nota">Salva l\'immobile per vedere qui le scansioni.</div>';
  }
  var lc = document.getElementById('scan-cli-doclist');
  if(lc){
    var c = (typeof D!=='undefined' && D.editType==='cliente' && D.editIdx!=null) ? D.clienti[D.editIdx] : null;
    lc.innerHTML = c ? listaDocumenti(c.documenti, true) : '<div class="scan-nota">Salva il cliente per vedere qui le scansioni.</div>';
  }
};

/* Riprova l'iniezione a intervalli finché le schede non sono nel DOM (sono
   dentro modali già presenti dal caricamento della pagina: bastano pochi
   tentativi), poi resta agganciata ai pulsanti che aprono quei modali. */
function prova(){
  try{ iniettaImmobile(); }catch(e){}
  try{ iniettaCliente(); }catch(e){}
}
var tentativi = 0;
var timer = setInterval(function(){
  tentativi++;
  prova();
  if(tentativi > 20) clearInterval(timer);
}, 300);
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', prova);

console.log('[Scanner] Modulo scansione documenti installato');
})();
