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
      nascosti: (c.nascosti && typeof c.nascosti === 'object') ? c.nascosti : {},
      promo: Array.isArray(c.promo) ? c.promo : []
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
  function oggiISO(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dataIT(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) : ''; }
  /* [4 ott 2026] EVENTI: gli Open House del gestionale (ancora da fare, da
     oggi in poi) e le promo scritte nell'Hub (D.libCfg.promo), finché non
     scadono. Dell'Open House va online zona e comune, MAI l'indirizzo:
     quello Enzo lo dà a chi prenota su WhatsApp. */
  function eventi(immobili, C, openHouse, waTesto){
    var oggi = oggiISO(), out = [], I = Array.isArray(immobili) ? immobili : [];
    var trova = function(u){ if(!u) return null; for(var i = 0; i < I.length; i++) if(I[i] && I[i].uuid === u) return I[i]; return null; };
    var ore = function(o){ var f = function(a, b){ return a ? a + (b ? '–' + b : '') : ''; }; var x = f(o.oraDa, o.oraA), y = f(o.oraDa2, o.oraA2); return (x && y) ? x + ' e ' + y : (x || y); };
    (Array.isArray(openHouse) ? openHouse : []).forEach(function(o){
      if(!o || o.stato === 'fatto' || !/^\d{4}-\d{2}-\d{2}$/.test(o.data || '') || o.data < oggi) return;
      var im = trova(o.immUuid); if(!im) return;
      var cosa = [im.tipo || 'Immobile', im.comune ? 'a ' + im.comune : ''].filter(Boolean).join(' ');
      out.push({ id:o.id || '', k:'oh', et:'Open House', t:cosa, s:[im.zona, im.mq ? im.mq + ' m²' : '', im.prezzo ? euro(im.prezzo) : ''].filter(Boolean).join(' · '),
        data:o.data, dataA:'', ore:ore(o), luogo:[im.zona, im.comune].filter(Boolean).join(', '),
        foto:assoluto(im.foto) || assoluto((im.fotoList || [])[0]), url:im.linkPortale || '',
        wa:waTesto('Buongiorno Enzo, vorrei prenotare un orario per l\'Open House del ' + dataIT(o.data) + ' (' + cosa + (im.ref ? ', Ref. ' + im.ref : '') + ').') });
    });
    C.promo.forEach(function(x){
      if(!x || !String(x.t || '').trim()) return;
      var fine = x.a || x.da || '';
      if(fine && fine < oggi) return;
      var im = trova(x.imm);
      out.push({ id:x.id || '', k:'promo', et:String(x.et || 'Promo').slice(0, 24), t:String(x.t).slice(0, 80), s:String(x.s || '').slice(0, 160),
        data:x.da || '', dataA:x.a || '', ore:String(x.ora || '').slice(0, 30), luogo:String(x.luogo || '').slice(0, 60),
        foto:im ? (assoluto(im.foto) || assoluto((im.fotoList || [])[0])) : '', url:/^https?:\/\//.test(x.url || '') ? x.url : (im && im.linkPortale) || '',
        wa:waTesto('Buongiorno Enzo, ho visto "' + String(x.t).slice(0, 80) + '"' + (x.da ? ' del ' + dataIT(x.da) : '') + ' e vorrei maggiori informazioni.') });
    });
    return out.sort(function(a, b){ return String(a.data || '9').localeCompare(String(b.data || '9')); }).slice(0, 6);
  }
  /* immobili: quelli del ponte (gestionale → Hub), già senza dati privati */
  function costruisci(immobili, cfg, agenzia, openHouse){
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
    if(C.quiz) fissi.push({ k:'quiz', t:'I quiz di Enzo', s:'Indovina il prezzo o il paese, vero o falso, che casa sei', url:SITO + 'valuta-casa.html#quiz' });
    if(C.sito) fissi.push({ k:'sito', t:'Tutti gli immobili', s:C.sito.replace(/^https?:\/\//, '').replace(/\/$/, ''), url:C.sito });
    C.extra.forEach(function(x){ if(x && x.t && x.url) fissi.push({ k:'extra', t:x.t, s:x.s || '', url:x.url }); });
    if(C.wa) fissi.push({ k:'wa', t:'Scrivimi su WhatsApp', s:'rispondo di persona', url:waTesto('Buongiorno Enzo, la contatto dal suo profilo Instagram.') });
    return {
      v:1, agente:(agenzia && agenzia.agente) || 'Enzo Carnicelli', agenzia:(agenzia && agenzia.nome) || 'Le case dalla A allo Z.io',
      intro:C.intro, fissi:fissi, immobili:lista,
      eventi:eventi(immobili, C, openHouse, function(t){ return waTesto(t) || ''; })
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
  /* [4 ott 2026] stesso meccanismo per altri documenti pubblici
     (pubblico/valutacasa: impostazioni della landing Valuta casa) */
  function scriviDoc(db, nome, payload){
    var p = Object.assign({}, payload, { ts:Date.now() });
    return db.collection('pubblico').doc(nome).set({ json:JSON.stringify(p), ts:p.ts });
  }
  /* legge senza login (come fa la pagina pubblica) */
  function leggi(){ return leggiDoc('linkinbio'); }
  function leggiDoc(nome){
    var url = 'https://firestore.googleapis.com/v1/projects/' + PROGETTO + '/databases/(default)/documents/pubblico/' + nome + '?key=' + CHIAVE;
    return fetch(url, { cache:'no-store' }).then(function(r){
      if(!r.ok) throw new Error(r.status === 403 ? 'regola mancante' : (r.status === 404 ? 'mai pubblicata' : 'errore ' + r.status));
      return r.json();
    }).then(function(d){ return JSON.parse(d.fields.json.stringValue); });
  }
  /* eventi ancora validi oggi (il documento può essere stato scritto giorni fa) */
  function eventiValidi(p){
    var oggi = oggiISO();
    return ((p && p.eventi) || []).filter(function(e){ var f = e.dataA || e.data || ''; return !f || f >= oggi; });
  }
  /* [5 ott 2026] STATISTICHE della landing Valuta casa (scelta di Enzo):
     ogni evento è un documento a sé in statLanding, scritto SENZA login.
     Niente nomi, niente IP, niente codici salvati nel browser: la "sessione"
     vive solo finché la pagina resta aperta. Le legge solo Enzo (Hub).
     Regola Firestore che serve (da aggiungere una volta):
       match /statLanding/{id} {
         allow create: if request.resource.data.keys().hasOnly(['e','s','c','ts','g','o','f','x','d'])
           && request.resource.data.e is string && request.resource.data.e.size() <= 20
           && request.resource.data.s is string && request.resource.data.s.size() <= 16
           && request.resource.data.ts is int
           && (!('d' in request.resource.data) || (request.resource.data.d is map && request.resource.data.d.size() <= 25));
         allow read, delete: if request.auth != null && request.auth.uid == '<uid di Enzo>';
       }                                                                      */
  function valoreFS(v){
    if(v === null || v === undefined) return { nullValue:null };
    if(typeof v === 'boolean') return { booleanValue:v };
    if(typeof v === 'number') return Number.isInteger(v) ? { integerValue:String(v) } : { doubleValue:v };
    if(Array.isArray(v)) return { arrayValue:{ values:v.slice(0, 30).map(valoreFS) } };
    if(typeof v === 'object'){ var f = {}; Object.keys(v).slice(0, 25).forEach(function(k){ if(v[k] !== undefined) f[k] = valoreFS(v[k]); }); return { mapValue:{ fields:f } }; }
    return { stringValue:String(v).slice(0, 300) };
  }
  function evento(dati){
    var f = {}; Object.keys(dati).forEach(function(k){ if(dati[k] !== undefined) f[k] = valoreFS(dati[k]); });
    var url = 'https://firestore.googleapis.com/v1/projects/' + PROGETTO + '/databases/(default)/documents/statLanding?key=' + CHIAVE;
    try {
      return fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ fields:f }), keepalive:true })
        .then(function(r){ return r.ok; }).catch(function(){ return false; });
    } catch(e){ return Promise.resolve(false); }
  }
  window.LIB = { costruisci:costruisci, evento:evento, impronta:impronta, scrivi:scrivi, leggi:leggi, scriviDoc:scriviDoc, leggiDoc:leggiDoc, cfgBase:cfgBase, eventiValidi:eventiValidi, dataIT:dataIT, url:SITO + 'linkinbio.html', urlValuta:SITO + 'valuta-casa.html' };
})();
