/* ═══════════════════════════════════════════════════════════════════════
   LINK IN BIO — la vetrina pubblica                         [4 ott 2026]
   Un solo file usato da gestionale (index.html) e Marketing Hub
   (indexplus.html), così la vetrina si prepara in UN modo solo.
   Scelta di Enzo (strada A + 3): pagina linkinbio.html sul sito GitHub,
   dati in un documento del cloud leggibile da tutti, con TUTTI gli
   immobili con incarico attivo (stato "attivo"), tranne quelli nascosti.
   Documento: pubblico/linkinbio  →  { json:"<testo>", ts }
   Ci va SOLO la vetrina: niente clienti, proprietari, indirizzi esatti.
   Regola Firestore che serve (da aggiungere una volta):
     match /pubblico/{doc} {
       allow read: if true;
       allow write: if request.auth != null && request.auth.uid == '<uid di Enzo>';
     }
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  var PROGETTO = 'agenzioimmobiliare';
  var CHIAVE = 'AIzaSyAgljCpsbFVlpbJ1SCSEjPcfxrjBoP5dvM';   /* la stessa chiave pubblica di index.html */
  var SITO = 'https://agenzioimmobiliare.github.io/';

  function cfgBase(c){
    c = c || {};
    return {
      wa: String(c.wa || '').replace(/\D/g, ''),
      sito: c.sito || 'https://www.agenziocilento.it',
      intro: c.intro || 'Agente immobiliare ad Agropoli e nel Cilento',
      valuta: c.valuta !== false,
      quiz: c.quiz !== false,
      extra: Array.isArray(c.extra) ? c.extra : [],
      nascosti: (c.nascosti && typeof c.nascosti === 'object') ? c.nascosti : {}
    };
  }
  function euro(p){
    if(p === null || p === undefined || p === '') return '';
    if(typeof p === 'number') return '€ ' + p.toLocaleString('it-IT');
    var t = String(p).trim();
    if(/€/.test(t)) return t;
    var n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? t : '€ ' + n.toLocaleString('it-IT');
  }
  function assoluto(u){
    if(!u) return '';
    if(/^https?:\/\//.test(u)) return u;
    if(/^(\.\/)?foto\//.test(u)) return SITO + u.replace(/^\.\//, '');
    return '';
  }
  /* immobili: quelli del ponte (gestionale → Hub), già senza dati privati */
  function costruisci(immobili, cfg, agenzia){
    var C = cfgBase(cfg);
    var waTesto = function(t){ return C.wa ? 'https://wa.me/' + (C.wa.length <= 10 ? '39' + C.wa : C.wa) + '?text=' + encodeURIComponent(t) : ''; };
    var lista = (Array.isArray(immobili) ? immobili : []).filter(function(im){
      return im && String(im.stato || '').toLowerCase() === 'attivo' && !(im.uuid && C.nascosti[im.uuid]);
    }).map(function(im){
      var titolo = [im.tipo || 'Immobile', im.comune ? 'a ' + im.comune : ''].filter(Boolean).join(' ');
      var dett = [im.zona, im.mq ? im.mq + ' m²' : '', im.locali ? im.locali + ' locali' : (im.camere ? im.camere + ' camere' : ''), im.energia ? 'classe ' + im.energia : ''].filter(Boolean).join(' · ');
      var foto = assoluto(im.foto) || assoluto((im.fotoList || [])[0]);
      var testo = 'Buongiorno, ho visto su Instagram ' + titolo + (im.ref ? ' (Ref. ' + im.ref + ')' : '') + '. Vorrei maggiori informazioni.';
      return { id:im.uuid || im.ref || '', ref:im.ref || '', titolo:titolo, dett:dett, prezzo:euro(im.prezzo), foto:foto,
        url:im.linkPortale || waTesto(testo) || C.sito, wa:waTesto(testo), dal:im.dataIncarico || '' };
    }).sort(function(a, b){ return String(b.dal).localeCompare(String(a.dal)); });
    var fissi = [];
    if(C.valuta) fissi.push({ k:'valuta', t:'Quanto vale la tua casa?', s:'Test gratuito in 2 minuti', url:SITO + 'valuta-casa.html' });
    if(C.quiz) fissi.push({ k:'quiz', t:'I quiz di Enzo', s:'Indovina il prezzo, vero o falso, che casa sei', url:SITO + 'valuta-casa.html#quiz' });
    if(C.sito) fissi.push({ k:'sito', t:'Tutti gli immobili', s:C.sito.replace(/^https?:\/\//, '').replace(/\/$/, ''), url:C.sito });
    C.extra.forEach(function(x){ if(x && x.t && x.url) fissi.push({ k:'extra', t:x.t, s:x.s || '', url:x.url }); });
    if(C.wa) fissi.push({ k:'wa', t:'Scrivimi su WhatsApp', s:'rispondo di persona', url:waTesto('Buongiorno Enzo, la contatto dal suo profilo Instagram.') });
    return {
      v:1, agente:(agenzia && agenzia.agente) || 'Enzo Carnicelli', agenzia:(agenzia && agenzia.nome) || 'Le case dalla A allo Z.io',
      intro:C.intro, fissi:fissi, immobili:lista
    };
  }
  function impronta(p){
    var s = JSON.stringify(p), h = 5381, i = s.length;
    while(i) h = (h * 33) ^ s.charCodeAt(--i);
    return String(h >>> 0);
  }
  /* scrive con il login di Firebase già fatto dalla pagina che chiama */
  function scrivi(db, payload){
    var p = Object.assign({}, payload, { ts:Date.now() });
    return db.collection('pubblico').doc('linkinbio').set({ json:JSON.stringify(p), ts:p.ts, n:(payload.immobili || []).length });
  }
  /* legge senza login (come fa la pagina pubblica) */
  function leggi(){
    var url = 'https://firestore.googleapis.com/v1/projects/' + PROGETTO + '/databases/(default)/documents/pubblico/linkinbio?key=' + CHIAVE;
    return fetch(url, { cache:'no-store' }).then(function(r){
      if(!r.ok) throw new Error(r.status === 403 ? 'regola mancante' : (r.status === 404 ? 'mai pubblicata' : 'errore ' + r.status));
      return r.json();
    }).then(function(d){ return JSON.parse(d.fields.json.stringValue); });
  }
  window.LIB = { costruisci:costruisci, impronta:impronta, scrivi:scrivi, leggi:leggi, cfgBase:cfgBase, url:SITO + 'linkinbio.html' };
})();
