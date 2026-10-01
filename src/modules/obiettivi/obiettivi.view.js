// modules/obiettivi/obiettivi.view.js — Obiettivi & Business Plan
// ----------------------------------------------------------------------------
// Estratto dal monolite il 15 set 2026, stesso motivo del bilancio.
//
// DIPENDENZE (via window): D, saveD, aggiornaRecord, genUUID, fmtEuro,
//   dlgAlert, toast, _paCalcola (pipeline), _ceSeguiMenu (navigazione).
// Le funzioni richiamate dagli onclick sono esposte su window: sono 8.
// ----------------------------------------------------------------------------

/* ════════════════════════════════════════════════════════════════════════
   OBIETTIVI & BUSINESS PLAN                                [13 set 2026]
   ------------------------------------------------------------------------
   Due parti: il WIZARD che fissa gli obiettivi dell'anno, e il CRUSCOTTO
   che confronta obiettivo e realizzato su mese / trimestre / semestre / anno.

   COSA CONTA COME REALIZZATO (scelte di Enzo, 13 set):
   - GCI = totale della provvigione (quotaA + quotaV), non la quota agenzia
   - contano gli statoPag "Incassata" e "Parzialmente Incassata"
   - la data usata è p.data (data dell'affare). Le righe in p.pagamenti NON
     si usano: sono uscite verso l'agente e non hanno una data.

   REGOLA DI COMPORTAMENTO: questa pagina LEGGE e basta. L'unica cosa che
   scrive è D.obiettivi, la sua collezione. Non tocca provvigioni, pratiche
   o immobili, come già fa Provvigioni attese.
   ════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ── 1. MOTORE DI CALCOLO (funzioni pure, provate a tavolino) ──────────── */

function objNum(v){
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  if(v === null || v === undefined) return 0;
  var s = String(v).trim().replace(/[€\s]/g,'');
  if(!s) return 0;
  if(s.indexOf(',') >= 0){ s = s.replace(/\./g,'').replace(',','.'); }
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)){ s = s.replace(/\./g,''); }
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function objData(v){
  if(!v) return null;
  if(v instanceof Date && !isNaN(v)) return {anno:v.getFullYear(), mese:v.getMonth()+1, giorno:v.getDate()};
  var s = String(v).trim(), m;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return {anno:+m[1], mese:+m[2], giorno:+m[3]};
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return {anno:+m[3], mese:+m[2], giorno:+m[1]};
  return null;
}

function objGiorniMese(a,m){ return new Date(a, m, 0).getDate(); }
function objBisestile(a){ return (a%4===0 && a%100!==0) || a%400===0; }
function objGiorniAnno(a){ return objBisestile(a) ? 366 : 365; }
function objArr(n){ return Math.round(n*100)/100; }

// Distribuisce il target sui 12 mesi. Senza pesi: parti uguali.
// Con pesi: in proporzione, normalizzati — non devono sommare a 100.
// In ogni caso l'ultimo mese con peso assorbe il resto dell'arrotondamento,
// così la somma dei dodici fa ESATTAMENTE il target annuo.
function objPesiValidi(pesi){
  if(!Array.isArray(pesi) || pesi.length !== 12) return null;
  var p = pesi.map(function(x){ var n = objNum(x); return n > 0 ? n : 0; });
  var s = p.reduce(function(a,b){ return a+b; }, 0);
  return s > 0 ? p : null;
}
function objTargetMensile(t, pesi){
  var tot = objNum(t), out = [], i;
  var p = objPesiValidi(pesi);
  if(!p){
    var q = objArr(tot/12);
    for(i=0;i<11;i++) out.push(q);
    out.push(objArr(tot - q*11));
    return out;
  }
  var somma = p.reduce(function(a,b){ return a+b; }, 0);
  var ultimo = -1;
  for(i=0;i<12;i++){ out.push(objArr(tot*p[i]/somma)); if(p[i] > 0) ultimo = i; }
  // il resto va sull'ultimo mese che ha davvero un peso, non su dicembre
  var parziale = 0;
  for(i=0;i<12;i++) if(i !== ultimo) parziale += out[i];
  out[ultimo] = objArr(tot - parziale);
  return out;
}

function objConsuntivoMensile(incassi, anno){
  var mesi = [0,0,0,0,0,0,0,0,0,0,0,0], fuoriAnno=0, illeggibili=0, usati=0;
  (incassi||[]).forEach(function(r){
    if(!r){ illeggibili++; return; }
    var d = objData(r.data);
    if(!d){ illeggibili++; return; }
    if(d.anno !== anno){ fuoriAnno++; return; }
    if(d.mese < 1 || d.mese > 12){ illeggibili++; return; }
    mesi[d.mese-1] += objNum(r.importo); usati++;
  });
  for(var i=0;i<12;i++) mesi[i] = objArr(mesi[i]);
  return {mesi:mesi, usati:usati, fuoriAnno:fuoriAnno, illeggibili:illeggibili};
}

// Quanta parte del target è DOVUTA fino a oggi: mesi chiusi per intero,
// mese in corso in proporzione ai giorni. Senza questo, a settembre
// qualunque confronto direbbe "deficit".
function objTargetMaturato(tm, anno, oggi){
  if(!oggi || oggi.anno > anno) return objArr(tm.reduce(function(a,b){return a+b;},0));
  if(oggi.anno < anno) return 0;
  var tot = 0;
  for(var m=1;m<oggi.mese;m++) tot += tm[m-1];
  var gg = objGiorniMese(anno, oggi.mese);
  tot += tm[oggi.mese-1] * (Math.min(oggi.giorno, gg)/gg);
  return objArr(tot);
}

function objValuta(reale, dovuto, sogliaLinea){
  var s = (sogliaLinea === undefined) ? 90 : sogliaLinea;
  var r = objNum(reale), t = objNum(dovuto);
  if(t <= 0) return {gap:objArr(r), gapPerc:null, perc:null, fascia: r>0 ? 'surplus' : 'neutro'};
  var perc = objArr(r/t*100), fascia = 'deficit';
  if(perc >= 100) fascia = 'surplus'; else if(perc >= s) fascia = 'linea';
  return {gap:objArr(r-t), gapPerc:objArr(perc-100), perc:perc, fascia:fascia};
}

// Nei primi 30 giorni il run-rate impazzisce: lo segnalo invece di mostrarlo
// come se fosse una previsione seria.
function objRunRate(reale, anno, oggi){
  if(!oggi || oggi.anno !== anno) return {valore:null, attendibile:false, giorni:0};
  var g = 0;
  for(var m=1;m<oggi.mese;m++) g += objGiorniMese(anno, m);
  g += oggi.giorno;
  if(g <= 0) return {valore:null, attendibile:false, giorni:0};
  return {valore: objArr(objNum(reale)/g*objGiorniAnno(anno)), attendibile: g >= 30, giorni: g};
}

var OBJ_MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function objPeriodi(liv){
  if(liv === 'mensile') return OBJ_MESI.map(function(n,i){ return {etichetta:n, mesi:[i+1]}; });
  if(liv === 'trimestrale') return [
    {etichetta:'Q1 · Gen-Mar', mesi:[1,2,3]},  {etichetta:'Q2 · Apr-Giu', mesi:[4,5,6]},
    {etichetta:'Q3 · Lug-Set', mesi:[7,8,9]},  {etichetta:'Q4 · Ott-Dic', mesi:[10,11,12]}];
  if(liv === 'semestrale') return [
    {etichetta:'H1 · Gen-Giu', mesi:[1,2,3,4,5,6]},
    {etichetta:'H2 · Lug-Dic', mesi:[7,8,9,10,11,12]}];
  return [{etichetta:'Anno intero', mesi:[1,2,3,4,5,6,7,8,9,10,11,12]}];
}

/* [14 set 2026] Somma gli incassi di un anno fino alla STESSA data (stesso
   giorno e mese). Confrontare l'anno intero scorso con nove mesi di questo
   direbbe sempre che andiamo peggio. */
function objFinoAllaData(incassi, anno, oggi){
  var tot = 0, n = 0;
  (incassi||[]).forEach(function(r){
    if(!r) return;
    var d = objData(r.data);
    if(!d || d.anno !== anno) return;
    if(oggi && (d.mese > oggi.mese || (d.mese === oggi.mese && d.giorno > oggi.giorno))) return;
    tot += objNum(r.importo); n++;
  });
  return {totale: objArr(tot), quante: n};
}

function objRiepilogo(o){
  o = o || {};
  var anno = +o.anno || (o.oggi && o.oggi.anno) || new Date().getFullYear();
  var tm = objTargetMensile(o.targetAnno, o.pesi);
  var cons = objConsuntivoMensile(o.incassi, anno);
  var oggi = o.oggi || null;

  function righe(liv){
    return objPeriodi(liv).map(function(p){
      var target = objArr(p.mesi.reduce(function(a,m){ return a+tm[m-1]; },0));
      var reale  = objArr(p.mesi.reduce(function(a,m){ return a+cons.mesi[m-1]; },0));
      var primo = p.mesi[0], ultimo = p.mesi[p.mesi.length-1], dovuto;
      if(!oggi || oggi.anno > anno)    dovuto = target;
      else if(oggi.anno < anno)        dovuto = 0;
      else if(oggi.mese > ultimo)      dovuto = target;
      else if(oggi.mese < primo)       dovuto = 0;
      else {
        var aOggi = objTargetMaturato(tm, anno, oggi);
        var prima = objTargetMaturato(tm, anno, {anno:anno, mese:primo, giorno:0});
        dovuto = objArr(Math.max(0, aOggi - prima));
      }
      var v = objValuta(reale, dovuto, o.sogliaLinea);
      return {etichetta:p.etichetta, mesi:p.mesi, target:target, targetDovuto:dovuto,
              reale:reale, gap:v.gap, gapPerc:v.gapPerc, perc:v.perc, fascia:v.fascia};
    });
  }
  var realeAnno = objArr(cons.mesi.reduce(function(a,b){ return a+b; },0));
  return {
    anno:anno, targetAnno: objArr(tm.reduce(function(a,b){return a+b;},0)),
    targetMensile:tm, consuntivoMensile:cons.mesi,
    scarti:{fuoriAnno:cons.fuoriAnno, illeggibili:cons.illeggibili, usati:cons.usati},
    realeAnno:realeAnno,
    targetMaturato: objTargetMaturato(tm, anno, oggi),
    runRate: objRunRate(realeAnno, anno, oggi),
    livelli:{ mensile:righe('mensile'), trimestrale:righe('trimestrale'),
              semestrale:righe('semestrale'), annuale:righe('annuale') }
  };
}

/* ── 2. ESTRATTORE DAI DATI VERI ───────────────────────────────────────── */

var OBJ_STATI_OK = ['incassata','parzialmente incassata'];

function objEstraiIncassi(provvigioni, stati){
  var ok = (stati || OBJ_STATI_OK).map(function(s){ return String(s).trim().toLowerCase(); });
  var incassi = [], scarti = [];
  (provvigioni||[]).forEach(function(p, i){
    if(!p || typeof p !== 'object'){ scarti.push({i:i, motivo:'record vuoto', etich:''}); return; }
    var etich = p.descr || p.acquirente || p.venditore || ('provvigione ' + (i+1));
    var stato = String(p.statoPag||'').trim().toLowerCase();
    if(ok.indexOf(stato) < 0){ scarti.push({i:i, etich:etich, motivo:'stato "'+(p.statoPag||'vuoto')+'"'}); return; }
    if(!objData(p.data)){ scarti.push({i:i, etich:etich, motivo:'senza data'}); return; }
    var imp = objNum(p.totale), fonte = 'totale';
    if(imp <= 0){ imp = objNum(p.quotaA) + objNum(p.quotaV); fonte = 'quotaA+quotaV'; }
    if(imp <= 0){ scarti.push({i:i, etich:etich, motivo:'importo a zero'}); return; }
    incassi.push({data:p.data, importo:imp, fonte:fonte, etich:etich, uuid:p.uuid});
  });
  return {incassi:incassi, scarti:scarti};
}

/* ── 2b. GLI INDICATORI MESE PER MESE ─────────────────────── [30 set 2026]
   Enzo vuole confrontare ogni mese con lo stesso mese dell'anno prima e
   far nascere da lì l'obiettivo: "se a gennaio 2026 ho preso 2 incarichi,
   a gennaio 2027 ne devo fare almeno 3".
   REGOLA scelta da Enzo: stesso mese dell'anno prima + una crescita (in %
   oppure +N), arrotondata PER ECCESSO, mai sotto un minimo al mese.
   Il passato che il gestionale non conosce (prima di maggio 2026) lo scrive
   lui a mano nella scheda "Storico": un numero scritto a mano VALE PIÙ di
   quello trovato nei dati.
   MISURA del 30 set sui dati veri: 26 dei 46 incarichi risultavano iniziati
   a gennaio 2026 — Enzo ha confermato che è la data del caricamento iniziale
   del portafoglio, non quella vera: si possono escludere con un clic. */

var OBJ_IND = [
  {id:'valutazioni', nome:'Valutazioni', col:'#5B21B6',
   fonte:'pipeline Acquisizioni: fase "Valutazione fatta" o successiva'},
  {id:'incarichi',   nome:'Incarichi',   col:'#1E3A8A',
   fonte:'data di inizio incarico degli immobili, anche archiviati'},
  {id:'visite',      nome:'Visite',      col:'#334155',
   fonte:'registro visite'},
  {id:'proposte',    nome:'Proposte',    col:'#B45309',
   fonte:'data della proposta nelle pratiche'},
  {id:'rogiti',      nome:'Rogiti',      col:'#115E59',
   fonte:'data del rogito nelle pratiche'},
  {id:'gci',         nome:'Provvigioni', col:'#0F5132', euro:true,
   fonte:'provvigioni incassate o parzialmente incassate, importo totale'}
];
var OBJ_FASI_VAL = ['valutazione-fatta','in-attesa','incarico-preso'];
var OBJ_REGOLA_BASE = {modo:'%', val:10, min:0};

function objInd(id){
  for(var i=0;i<OBJ_IND.length;i++) if(OBJ_IND[i].id === id) return OBJ_IND[i];
  return null;
}
function objOggi(){
  var d = new Date();
  return {anno:d.getFullYear(), mese:d.getMonth()+1, giorno:d.getDate()};
}
// vero se la data d è oggi o prima di oggi
function objNonDopo(d, oggi){
  if(d.anno !== oggi.anno) return d.anno < oggi.anno;
  if(d.mese !== oggi.mese) return d.mese < oggi.mese;
  return d.giorno <= oggi.giorno;
}
function objIso(d){
  return d.anno + '-' + String(d.mese).padStart(2,'0') + '-' + String(d.giorno).padStart(2,'0');
}
function objDataIt(s){
  var d = objData(s);
  return d ? String(d.giorno).padStart(2,'0') + '/' + String(d.mese).padStart(2,'0') + '/' + d.anno : '';
}
// arrotonda per eccesso senza farsi ingannare dalla virgola mobile:
// 2 × 1,5 fa 3,0000000000000004 e senza questo diventerebbe 4
function objEccesso(v){ return Math.ceil(Math.round(v*1e6)/1e6); }

/* Impostazioni sparse sui record degli anni (D.obiettivi è un array di anni):
   la data fino a cui gli incarichi sono "caricamento iniziale" e il "sono
   veri" che spegne l'avviso. Si legge il valore più recente. */
function objInizialiFino(){
  var fino = '';
  (window.D && Array.isArray(D.obiettivi) ? D.obiettivi : []).forEach(function(r){
    if(r && r.incarichiInizialiFino && String(r.incarichiInizialiFino) > fino) fino = String(r.incarichiInizialiFino);
  });
  return fino;
}
function objPiccoOk(anno, mese){
  var chiave = anno + '-' + mese;
  return (window.D && Array.isArray(D.obiettivi) ? D.obiettivi : []).some(function(r){
    return r && Array.isArray(r.incarichiPiccoOk) && r.incarichiPiccoOk.indexOf(chiave) >= 0;
  });
}

/* Tutte le "cose fatte" di ogni indicatore, di tutti gli anni, con la data.
   Si calcola una volta per disegno della pagina (contesto). */
function objContesto(){
  var oggi = objOggi(), fino = objInizialiFino();
  var dFino = fino ? objData(fino) : null;
  var ev = {}, esclusi = [], perMese = {};
  OBJ_IND.forEach(function(x){ ev[x.id] = []; });
  var D_ = window.D || {};

  (D_.pipelineDeals || []).forEach(function(dl){
    if(!dl || typeof dl !== 'object') return;
    var trovato = null, stima = false;
    if(Array.isArray(dl.fasi)){
      for(var i=0;i<dl.fasi.length;i++){
        var f = dl.fasi[i];
        if(f && OBJ_FASI_VAL.indexOf(f.fase) >= 0 && objData(f.data)){ trovato = objData(f.data); stima = !!f.stimata; break; }
      }
    }
    /* contatto che il diario non ha ancora visto: vale la data di creazione */
    if(!trovato && !(Array.isArray(dl.fasi) && dl.fasi.length) && OBJ_FASI_VAL.indexOf(dl.fase) >= 0 && objData(dl.data)){
      trovato = objData(dl.data); stima = true;
    }
    if(trovato) ev.valutazioni.push({d:trovato, peso:1, stima:stima, et:dl.titolo || dl.cliente || ''});
  });

  (D_.immobili || []).forEach(function(im){
    if(!im || typeof im !== 'object' || !(im.incarico || im.incInizio)) return;
    var d = objData(im.incInizio) || objData(im.dataAcq) || objData(im.dataIns) || objData(im.data);
    if(!d) return;
    var k = d.anno + '-' + d.mese;
    perMese[k] = (perMese[k] || 0) + 1;
    var et = (im.ref ? 'Ref.' + im.ref + ' ' : '') + (im.indirizzo || im.zona || im.comune || '');
    if(dFino && objNonDopo(d, dFino)){ esclusi.push({d:d, et:et}); return; }
    ev.incarichi.push({d:d, peso:1, et:et});
  });

  (D_.visite || []).forEach(function(v){
    if(!v || typeof v !== 'object') return;
    var d = objData(v.data); if(d) ev.visite.push({d:d, peso:1, et:v.cliente || ''});
  });
  (D_.pratiche || []).forEach(function(p){
    if(!p || typeof p !== 'object') return;
    var dp = objData(p.dprop) || objData(p.dataAcc);
    if(dp) ev.proposte.push({d:dp, peso:1, et:p.acquirente || p.descr || ''});
    var dr = objData(p.drogito);
    if(dr) ev.rogiti.push({d:dr, peso:1, et:p.acquirente || p.descr || ''});
  });
  objEstraiIncassi(D_.provvigioni || [], null).incassi.forEach(function(r){
    var d = objData(r.data); if(d) ev.gci.push({d:d, peso:objNum(r.importo), et:r.etich || ''});
  });

  /* il picco sospetto: un mese con almeno 10 incarichi e almeno il triplo
     del mese "normale" (mediana degli altri mesi con qualcosa) */
  var picco = null;
  var chiavi = Object.keys(perMese);
  chiavi.forEach(function(k){
    var n = perMese[k];
    var altri = chiavi.filter(function(j){ return j !== k; }).map(function(j){ return perMese[j]; }).sort(function(a,b){ return a-b; });
    var med = altri.length ? altri[Math.floor(altri.length/2)] : 1;
    if(n >= 10 && n >= 3*Math.max(1, med) && (!picco || n > picco.n)){
      var p = k.split('-');
      picco = {anno:+p[0], mese:+p[1], n:n};
    }
  });
  if(picco){
    var gg = objGiorniMese(picco.anno, picco.mese);
    picco.fine = objIso({anno:picco.anno, mese:picco.mese, giorno:gg});
    picco.ok = objPiccoOk(picco.anno, picco.mese);
  }
  return {oggi:oggi, ev:ev, fino:fino, esclusi:esclusi, picco:picco};
}

/* La serie di un indicatore in un anno: quanto fatto per mese (solo fino a
   oggi), quanto è già in agenda (date future), e dove vale il numero scritto
   a mano. "coperto" dice se per quell'anno esiste almeno un dato: senza,
   uno zero sarebbe una bugia. */
function objSerie(id, anno, ctx){
  var z = function(){ return [0,0,0,0,0,0,0,0,0,0,0,0]; };
  var fatto = z(), agenda = z(), auto = z(), mano = [], stime = 0, n = 0;
  (ctx.ev[id] || []).forEach(function(x){
    if(x.d.anno !== anno) return;
    if(objNonDopo(x.d, ctx.oggi)){ auto[x.d.mese-1] += x.peso; n++; if(x.stima) stime++; }
    else agenda[x.d.mese-1] += x.peso;
  });
  var rec = objLeggi(anno);
  var st = rec && rec.storico && Array.isArray(rec.storico[id]) ? rec.storico[id] : null;
  for(var m=0;m<12;m++){
    auto[m] = objArr(auto[m]);
    var v = st ? st[m] : null;
    var aMano = (v !== null && v !== undefined && v !== '' && isFinite(objNum(v)) && String(v).trim() !== '');
    mano.push(aMano);
    fatto[m] = aMano ? objNum(v) : auto[m];
  }
  return {anno:anno, fatto:fatto, auto:auto, agenda:agenda, mano:mano, stime:stime,
          coperto: n > 0 || mano.some(function(b){ return b; })};
}

/* Fatto fino alla STESSA data dell'anno (stesso giorno e mese di oggi).
   Nel mese in corso: se il dato è scritto a mano si prende in proporzione ai
   giorni, altrimenti si contano solo le cose fino allo stesso giorno. */
function objPariData(id, anno, ctx){
  var s = objSerie(id, anno, ctx), o = ctx.oggi, tot = 0;
  for(var m=1;m<o.mese;m++) tot += s.fatto[m-1];
  if(s.mano[o.mese-1]){
    tot += s.fatto[o.mese-1] * Math.min(o.giorno, objGiorniMese(anno, o.mese)) / objGiorniMese(anno, o.mese);
  } else {
    (ctx.ev[id] || []).forEach(function(x){
      if(x.d.anno === anno && x.d.mese === o.mese && x.d.giorno <= o.giorno) tot += x.peso;
    });
  }
  return {valore: objArr(tot), coperto: s.coperto};
}

function objRegola(cfg, id){
  var r = cfg && cfg.regole && cfg.regole[id];
  return {modo: (r && r.modo === '+') ? '+' : '%',
          val: r && r.val !== undefined && r.val !== '' ? objNum(r.val) : OBJ_REGOLA_BASE.val,
          min: r && r.min !== undefined && r.min !== '' ? Math.max(0, objNum(r.min)) : OBJ_REGOLA_BASE.min};
}
function objTargetDaBase(base, r, euro){
  var v = (r.modo === '+') ? base + r.val : base * (1 + r.val/100);
  v = euro ? Math.ceil(objArr(v)) : objEccesso(v);
  return Math.max(0, v, r.min);
}

/* L'obiettivo di ogni mese. Per le provvigioni, un obiettivo annuo scritto a
   mano (col suo peso sui mesi) vince sulla regola, com'era prima. */
function objTargetInd(id, anno, ctx){
  var cfg = objLeggi(anno) || objPredefinito(anno);
  var ind = objInd(id) || {};
  if(id === 'gci' && objNum(cfg.targetAnno) > 0){
    return {mesi: objTargetMensile(cfg.targetAnno, cfg.stagionalita), modo:'annuo', regola:null, baseCoperta:true};
  }
  var r = objRegola(cfg, id);
  var base = objSerie(id, anno-1, ctx);
  return {mesi: base.fatto.map(function(b){ return objTargetDaBase(b, r, !!ind.euro); }),
          modo:'regola', regola:r, baseCoperta: base.coperto};
}

function objValutaCella(reale, target, anno, m, oggi, soglia){
  if(anno > oggi.anno || (anno === oggi.anno && m > oggi.mese)) return 'futuro';
  if(anno === oggi.anno && m === oggi.mese) return (target > 0 && reale >= target) ? 'surplus' : 'corso';
  /* senza obiettivo non c'è giudizio: un verde sarebbe un complimento finto */
  if(target <= 0) return 'neutro';
  return objValuta(reale, target, soglia).fascia;
}

/* Tutto quello che serve alla griglia e al dettaglio di un indicatore. */
function objRiga(id, anno, ctx, soglia){
  var s = objSerie(id, anno, ctx), p = objSerie(id, anno-1, ctx), t = objTargetInd(id, anno, ctx);
  var o = ctx.oggi, celle = [], fattoAnno = 0, dovuto = 0, tAnno = 0;
  for(var m=1;m<=12;m++){
    var tg = t.mesi[m-1];
    tAnno += tg;
    var passato = (anno < o.anno) || (anno === o.anno && m <= o.mese);
    if(passato) fattoAnno += s.fatto[m-1];
    if(anno < o.anno || (anno === o.anno && m < o.mese)) dovuto += tg;
    else if(anno === o.anno && m === o.mese) dovuto += tg * Math.min(o.giorno, objGiorniMese(anno, m)) / objGiorniMese(anno, m);
    celle.push({mese:m, fatto:s.fatto[m-1], mano:s.mano[m-1], agenda:s.agenda[m-1],
                prima:p.fatto[m-1], primaMano:p.mano[m-1], target:tg,
                stato: objValutaCella(s.fatto[m-1], tg, anno, m, o, soglia)});
  }
  var pari = (anno === o.anno) ? objPariData(id, anno-1, ctx) : {valore: objArr(p.fatto.reduce(function(a,b){return a+b;},0)), coperto:p.coperto};
  var statoAnno = (anno > o.anno) ? 'futuro' : (dovuto > 0 ? objValuta(fattoAnno, dovuto, soglia).fascia : 'neutro');
  return {id:id, anno:anno, serie:s, prec:p, target:t, celle:celle,
          fattoAnno: objArr(fattoAnno), targetAnno: objArr(tAnno), dovuto: objArr(dovuto), statoAnno: statoAnno,
          pari: pari};
}

/* ── 3. LETTURA E SCRITTURA DEGLI OBIETTIVI ────────────────────────────── */
// D.obiettivi è un ARRAY di record, uno per anno: la sincronizzazione del
// gestionale lavora su array, un oggetto singolo non verrebbe fuso bene.

function objAnnoCorrente(){ return new Date().getFullYear(); }

function objLeggi(anno){
  if(!window.D) return null;
  if(!Array.isArray(D.obiettivi)) D.obiettivi = [];
  for(var i=0;i<D.obiettivi.length;i++){
    if(D.obiettivi[i] && +D.obiettivi[i].anno === +anno) return D.obiettivi[i];
  }
  return null;
}

function objPredefinito(anno){
  return {anno:+anno, targetAnno:0, provvMedia:0, costiAnnui:0,
          valutazioniPerIncarico:3, incarichiPerVendita:4, sogliaLinea:90,
          stagionalita:null};   /* null = dodici parti uguali */
}

function objSalva(rec){
  if(!window.D) return false;
  if(!Array.isArray(D.obiettivi)) D.obiettivi = [];
  var vecchio = objLeggi(rec.anno), idx = -1;
  for(var i=0;i<D.obiettivi.length;i++){
    if(D.obiettivi[i] && +D.obiettivi[i].anno === +rec.anno){ idx = i; break; }
  }
  if(vecchio && idx >= 0){
    /* [15 set 2026] aggiornaRecord RESTITUISCE una copia aggiornata, non
       modifica l'oggetto che riceve: il valore di ritorno va riassegnato,
       altrimenti la modifica si perde in silenzio. Era il difetto per cui
       cambiare gli obiettivi di un anno già salvato non aveva effetto.
       Tutti gli altri punti del gestionale la usano già così. */
    if(typeof aggiornaRecord === 'function') D.obiettivi[idx] = aggiornaRecord(vecchio, rec);
    else Object.keys(rec).forEach(function(k){ D.obiettivi[idx][k] = rec[k]; });
  } else {
    if(!rec.uuid && typeof genUUID === 'function') rec.uuid = genUUID();
    D.obiettivi.push(rec);
  }
  try{ saveD(); }catch(e){ console.warn('[Obiettivi] saveD KO:', e); return false; }
  return true;
}

/* [30 set 2026] aggiorna SOLO i campi indicati del record di un anno; se
   l'anno non ha ancora un record, nasce dai valori predefiniti. */
function objAggiorna(anno, campi){
  var rec = objLeggi(anno);
  var nuovo = {};
  Object.keys(rec || objPredefinito(anno)).forEach(function(k){ nuovo[k] = (rec || objPredefinito(anno))[k]; });
  Object.keys(campi || {}).forEach(function(k){ nuovo[k] = campi[k]; });
  nuovo.anno = +anno;
  return objSalva(nuovo);
}

/* ── 4. CALCOLO COMPLETO PER LA VISTA ──────────────────────────────────── */

function objCalcola(anno, ctx){
  var cfg = objLeggi(anno) || objPredefinito(anno);
  var E = objEstraiIncassi((window.D && D.provvigioni) || [], null);
  var d = new Date();
  var oggi = {anno:d.getFullYear(), mese:d.getMonth()+1, giorno:d.getDate()};
  /* [30 set 2026] l'obiettivo in euro è quello EFFETTIVO: l'annuo scritto a
     mano se c'è, altrimenti la regola di crescita sull'anno prima. I dodici
     obiettivi mensili entrano come pesi, quindi si ritrovano identici. */
  ctx = ctx || objContesto();
  var tg = objTargetInd('gci', anno, ctx);
  var tEff = objArr(tg.mesi.reduce(function(a,b){ return a+b; }, 0));
  var R = objRiepilogo({anno:anno, targetAnno:tEff, incassi:E.incassi,
                        oggi:oggi, sogliaLinea:cfg.sogliaLinea, pesi:tg.mesi});
  R.cfg = cfg; R.incassi = E.incassi; R.scarti = E.scarti; R.modoGci = tg.modo;

  // Funnel: quante vendite/incarichi/valutazioni servono per il target.
  var pm = objNum(cfg.provvMedia);
  var vi = objNum(cfg.valutazioniPerIncarico) || 0;
  var iv = objNum(cfg.incarichiPerVendita) || 0;
  var venditeServ = pm > 0 ? Math.ceil(tEff/pm) : null;
  R.funnel = {
    provvMedia: pm,
    venditeServono:   venditeServ,
    incarichiServono: (venditeServ != null && iv > 0) ? Math.ceil(venditeServ*iv) : null,
    valutazServono:   (venditeServ != null && iv > 0 && vi > 0) ? Math.ceil(venditeServ*iv*vi) : null,
    venditeFatte: E.incassi.length
  };
  /* [14 set 2026] DA QUI A DICEMBRE. Il funnel sopra risponde a "cosa
     serviva per l'anno": a settembre è una domanda archeologica. Quella utile
     è quanto manca ADESSO, tradotto in affari e in ritmo. */
  R.residuo = (function(){
    var manca = objArr(tEff - R.realeAnno);
    var gAnno = objGiorniAnno(anno);
    var trascorsi = (oggi.anno === anno) ? R.runRate.giorni : (oggi.anno > anno ? gAnno : 0);
    var restano = Math.max(0, gAnno - trascorsi);
    var mesiRest = objArr(restano/gAnno*12);
    var vend = (pm > 0 && manca > 0) ? Math.ceil(manca/pm) : (manca > 0 ? null : 0);
    var ritmoTenuto = (trascorsi > 0) ? objArr(R.realeAnno/(trascorsi/gAnno*12)) : null;
    var ritmoServe  = (mesiRest > 0 && manca > 0) ? objArr(manca/mesiRest) : null;
    return {
      manca: manca, raggiunto: (manca <= 0 && tEff > 0),
      oltre: manca < 0 ? objArr(-manca) : 0,
      giorni: restano, mesi: mesiRest, annoInCorso: (oggi.anno === anno),
      vendite: vend,
      incarichi: (vend != null && iv > 0) ? Math.ceil(vend*iv) : null,
      valutazioni: (vend != null && iv > 0 && vi > 0) ? Math.ceil(vend*iv*vi) : null,
      ritmoTenuto: ritmoTenuto, ritmoServe: ritmoServe,
      moltiplicatore: (ritmoServe && ritmoTenuto > 0) ? objArr(ritmoServe/ritmoTenuto) : null
    };
  })();
  /* [14 set 2026] CONFRONTO CON L'ANNO PRECEDENTE. Se quell'anno non ha
     nessuna provvigione registrata, "esiste" resta false: va detto che il
     dato manca, non mostrato uno zero che sembrerebbe un risultato. */
  R.precedente = (function(){
    var ap = anno - 1;
    var cons = objConsuntivoMensile(E.incassi, ap);
    var cum = [], acc = 0;
    for(var i=0;i<12;i++){ acc += cons.mesi[i]; cum.push(objArr(acc)); }
    var totale = objArr(acc);
    var aPari = objFinoAllaData(E.incassi, ap, (oggi.anno === anno) ? oggi : null);
    var cfgPrec = objLeggi(ap);
    var delta = null, deltaPerc = null;
    if(cons.usati > 0 && aPari.totale > 0){
      delta = objArr(R.realeAnno - aPari.totale);
      deltaPerc = objArr((R.realeAnno/aPari.totale - 1)*100);
    }
    return {anno: ap, esiste: cons.usati > 0, quante: cons.usati,
            totale: totale, cumulato: cum,
            aPariData: aPari.totale, quanteAPari: aPari.quante,
            delta: delta, deltaPerc: deltaPerc,
            obiettivo: cfgPrec ? objNum(cfgPrec.targetAnno) : null};
  })();
  /* [14 set 2026] IL PIPELINE. Il run-rate proietta il passato; questo dice
     cosa c'è davvero in mano. Riusa _calcola() di Provvigioni attese.
     DOPPIO CONTEGGIO, il rischio vero: il suo "maturato" contiene il residuo
     delle provvigioni Da Incassare E di quelle Parzialmente Incassate, che io
     però conto già intere nel realizzato. Perciò scarto dal pipeline ogni
     voce il cui immobile ha già una provvigione conteggiata: meglio
     sottostimare il pipeline che gonfiarlo. */
  R.pipeline = (function(){
    if(typeof window._paCalcola !== 'function') return null;
    var G;
    try{ G = window._paCalcola(); }catch(e){ console.warn('[Obiettivi] pipeline KO:', e); return null; }
    if(!G) return null;
    var gia = {};
    (window.D && D.provvigioni || []).forEach(function(pv){
      if(!pv) return;
      var st = String(pv.statoPag||'').trim().toLowerCase();
      if(OBJ_STATI_OK.indexOf(st) >= 0 && pv.immRef !== undefined && pv.immRef !== null){
        gia[String(pv.immRef)] = true;
      }
    });
    var somma = function(arr){
      var t = 0, n = 0, scartate = 0;
      (arr||[]).forEach(function(x){
        if(!x) return;
        if(x.immIdx !== undefined && gia[String(x.immIdx)]){ scartate++; return; }
        t += objNum(x.valore); n++;
      });
      return {tot: objArr(t), quante: n, scartate: scartate};
    };
    var mat = somma(G.maturato), acc = somma(G.accettate), corso = somma(G.inCorso), port = somma(G.portafoglio);
    var certo = objArr(mat.tot + acc.tot);
    var manca = tEff - R.realeAnno;
    return {
      maturato: mat, accettate: acc, inCorso: corso, portafoglio: port,
      quasiCerto: certo,
      conPipeline: objArr(R.realeAnno + certo),
      conTutto: objArr(R.realeAnno + certo + corso.tot),
      copreIlResiduo: (manca <= 0) ? true : (certo >= manca),
      scoperto: objArr(Math.max(0, manca - certo - corso.tot)),
      scartate: mat.scartate + acc.scartate + corso.scartate
    };
  })();
  R.netto = objArr(R.realeAnno - objNum(cfg.costiAnnui));
  R.nettoAtteso = objArr(tEff - objNum(cfg.costiAnnui));
  return R;
}

/* ── 5. INTERFACCIA ─────────────────────────────────────── [30 set 2026]
   Rifatta su richiesta di Enzo ("la grafica non mi piace, voglio capire mese
   per mese il passato e cosa migliorare"). Schema preso dai planner per
   agenti immobiliari: prima i numeri di ATTIVITÀ (valutazioni, incarichi,
   visite, proposte), poi quelli di RISULTATO (rogiti, provvigioni); ogni
   mese sempre accanto allo stesso mese dell'anno prima.
   Tre viste: Panoramica (griglia + dettaglio + "ce la faccio"), Regole
   (crescita e minimi dell'anno), Storico (numeri del passato scritti a mano).
   Tolti, perché la griglia li sostituisce coi numeri veri: il funnel
   "sull'anno intero", la tabella degli scostamenti, la curva cumulata.
   Riquadri e "da qui a fine anno" sono diventati la striscia di sintesi. */

var _objVista = 'panoramica';     // panoramica | regole | storico
var _objScala = 'mesi';           // mesi | trimestri
var _objSel = 'incarichi';        // indicatore aperto nel dettaglio
var _objAnno = objAnnoCorrente();
var _objStAnno = null;            // anno mostrato nello Storico
var _objCtx = null;               // contesto dell'ultimo disegno

function _e(n){
  if(n === null || n === undefined) return '—';
  try{ if(typeof fmtEuro === 'function') return fmtEuro(n); }catch(e){}
  return '€ ' + Number(n).toLocaleString('it-IT', {maximumFractionDigits:0});
}
function _esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

/* [17 set 2026] toni del Bilancio: verde bosco, ambra, rosso scuro */
var OBJ_T = {verde:'#0F5132', blu:'#1E3A8A', bluChiaro:'#4F6FB5', ambra:'#B45309', ardesia:'#334155', rosso:'#7F1D1D'};
/* null = si usa il colore dell'indicatore (mese senza giudizio) */
var OBJ_STATO_COL = {surplus:OBJ_T.verde, linea:OBJ_T.ambra, deficit:OBJ_T.rosso, corso:null, futuro:null, neutro:null};
var OBJ_MESI3 = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function _gxColonna(tit, sot, col, dentro, destra){
  return '<div class="gx-col"><div class="gx-head" style="color:'+col+'"><div class="t">'+tit+'</div>'
    + '<div class="s">'+(sot||'')+'</div>' + (destra || '') + '</div>' + dentro + '</div>';
}

/* numeri: interi per le attività, euro compatti per le provvigioni */
function _objNum(v, euro, lungo){
  v = objNum(v);
  if(euro){
    if(lungo) return _e(v);
    if(Math.abs(v) >= 1000) return (Math.round(v/100)/10).toLocaleString('it-IT') + 'k';
    return Math.round(v).toLocaleString('it-IT');
  }
  return (Math.round(v*10)/10).toLocaleString('it-IT');
}
function _objSegno(v, euro){
  v = objArr(v);
  return (v > 0 ? '+' : (v < 0 ? '−' : '')) + _objNum(Math.abs(v), euro, true);
}
function _objAa(anno){ return '\'' + String(anno).slice(2); }

/* stile proprio della griglia, una volta sola */
function _objCss(){
  if(document.getElementById('obj-css')) return;
  var st = document.createElement('style'); st.id = 'obj-css';
  st.textContent = ''
    + '.obj-scroll{overflow:auto;-webkit-overflow-scrolling:touch}'
    + '#obj-corpo .obj-gr{width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;min-width:900px}'
    + '#obj-corpo .obj-gr.q{min-width:560px}'
    + '#obj-corpo .obj-gr th{font-size:0.66rem;background:transparent;text-transform:uppercase;letter-spacing:.4px;color:var(--text3);font-weight:700;'
    +   'padding:9px 3px 7px!important;text-align:center;border-bottom:1px solid var(--border);white-space:nowrap}'
    + '#obj-corpo .obj-gr th.ora{color:var(--text);box-shadow:inset 0 -2px 0 var(--text)}'
    + '#obj-corpo .obj-gr th.sx{text-align:left;padding-left:14px!important}'
    + '#obj-corpo .obj-gr td{padding:3px!important;border-bottom:1px solid var(--border);vertical-align:middle}'
    + '#obj-corpo .obj-gr tr.riga{cursor:pointer}'
    + '#obj-corpo .obj-gr tr.riga:hover td{background:rgba(127,127,127,.05)}'
    + '#obj-corpo .obj-gr tr.sel td{background:rgba(127,127,127,.08)}'
    + '#obj-corpo .obj-gr td.nome{padding:7px 10px 7px 14px!important;white-space:nowrap;position:sticky;left:0;background:var(--bg2);z-index:1;'
    +   'border-right:1px solid var(--border)}'
    + '#obj-corpo .obj-gr tr.sel td.nome{box-shadow:inset 3px 0 0 currentColor}'
    + '#obj-corpo .obj-gr td.nome .n{font-size:0.86rem;font-weight:800;display:flex;align-items:center;gap:7px;color:var(--text)}'
    + '#obj-corpo .obj-gr td.nome .pall{width:8px;height:8px;border-radius:50%;flex-shrink:0}'
    + '#obj-corpo .obj-gr td.nome .r{font-size:0.66rem;color:var(--text3);margin:1px 0 0 15px;font-weight:600}'
    + '#obj-corpo .obj-gr td.anno{border-left:1px solid var(--border)}'
    + '.obj-c{border-radius:8px;padding:5px 3px 4px;text-align:center;min-width:54px;border:1px solid transparent;line-height:1.25}'
    + '.obj-c .v{font-size:0.98rem;font-weight:800;color:var(--text)}'
    + '.obj-c .o{font-size:0.63rem;color:var(--text2);font-weight:600;white-space:nowrap}'
    + '.obj-c .p{font-size:0.61rem;color:var(--text3);white-space:nowrap}'
    + '.obj-c .mk{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--text3);'
    +   'vertical-align:super;margin-left:2px}'
    + '.obj-c.surplus{background:rgba(15,81,50,.09);border-color:rgba(15,81,50,.28)}'
    + '.obj-c.surplus .v{color:#0F5132}'
    + '.obj-c.linea{background:rgba(180,83,9,.09);border-color:rgba(180,83,9,.30)}'
    + '.obj-c.linea .v{color:#B45309}'
    + '.obj-c.deficit{background:rgba(127,29,29,.08);border-color:rgba(127,29,29,.28)}'
    + '.obj-c.deficit .v{color:#7F1D1D}'
    + '.obj-c.corso{border:1px dashed var(--text3)}'
    + '.obj-c.futuro .v{color:#1E3A8A;opacity:.8;font-weight:700}'
    + '.obj-c.neutro .v{color:var(--text3);font-weight:600}'
    + '.obj-leg{display:flex;gap:14px;flex-wrap:wrap;padding:9px 16px;font-size:0.72rem;color:var(--text2);'
    +   'border-top:1px solid var(--border)}'
    + '.obj-leg span{display:inline-flex;align-items:center;gap:5px}'
    + '.obj-leg i{display:inline-block;width:12px;height:12px;border-radius:4px;border:1px solid transparent}'
    + '.obj-det{display:flex;gap:0;flex-wrap:wrap}'
    + '.obj-det .graf{flex:2 1 420px;min-width:0;padding:12px 16px}'
    + '.obj-det .fatti{flex:1 1 250px;border-left:1px solid var(--border)}'
    + '.obj-det .fatti .gx-riga{align-items:flex-start}'
    + '.obj-det .fatti .num{margin-left:auto;font-weight:800;font-size:0.95rem;font-variant-numeric:tabular-nums;text-align:right}'
    + '.obj-in{width:100%;min-width:48px;padding:5px 4px;text-align:center;font-size:0.84rem;font-family:inherit;'
    +   'border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);'
    +   'font-variant-numeric:tabular-nums}'
    + '.obj-in:disabled{opacity:.35}'
    + '.obj-in.mano{border-color:var(--text);font-weight:800}'
    + '.obj-sel{padding:5px 4px;font-size:0.8rem;font-family:inherit;border:1px solid var(--border);'
    +   'border-radius:7px;background:var(--bg);color:var(--text)}'
    + '.obj-ant{display:grid;grid-template-columns:repeat(12,1fr);gap:3px;min-width:430px}'
    + '.obj-ant div{font-size:0.66rem;text-align:center;color:var(--text2);line-height:1.3}'
    + '.obj-ant b{display:block;font-size:0.8rem;color:var(--text)}'
    + '@media (max-width:700px){.obj-det .fatti{border-left:0;border-top:1px solid var(--border)}}';
  document.head.appendChild(st);
}

/* ── striscia di sintesi: i soldi ─────────────────────────────────────── */
function _objStriscia(R, rg){
  var o = _objCtx.oggi, a = R.anno;
  var card = function(et, val, sot, col){
    return '<div class="gx-card" style="color:'+(col||OBJ_T.ardesia)+'"><div class="et">'+et+'</div>'
      + '<div class="val" style="color:'+(col||'var(--text)')+'">'+val+'</div><div class="sot">'+(sot||'')+'</div></div>';
  };
  var regola = R.modoGci === 'annuo' ? 'obiettivo annuo fissato a mano'
    : 'regola: ' + _objRegolaTesto(rg.target.regola, true) + ' sul ' + (a-1);
  var h = '<div class="gx-cards">';
  var colAnno = OBJ_STATO_COL[rg.statoAnno] || OBJ_T.ardesia;
  h += card('Provvigioni ' + a, _e(R.realeAnno),
            (R.targetAnno > 0 ? 'su ' + _e(R.targetAnno) + ' · ' : '') + regola,
            a > o.anno ? OBJ_T.ardesia : colAnno);
  if(rg.pari.coperto){
    var dl = objArr(rg.fattoAnno - rg.pari.valore);
    var pc = rg.pari.valore > 0 ? Math.round(dl/rg.pari.valore*100) : null;
    h += card('Contro il ' + (a-1), a > o.anno ? '—' : _objSegno(dl, true),
              (a === o.anno ? 'alla stessa data: ' : 'anno intero: ') + _e(rg.pari.valore)
              + (pc !== null && a <= o.anno ? ' (' + (pc >= 0 ? '+' : '') + pc + '%)' : ''),
              a > o.anno ? OBJ_T.ardesia : (dl >= 0 ? OBJ_T.verde : OBJ_T.rosso));
  } else {
    h += card('Contro il ' + (a-1), '—', 'nessun dato del ' + (a-1) + ': puoi scriverlo nello Storico', OBJ_T.ardesia);
  }
  if(a === o.anno){
    var rr = R.runRate;
    h += card('Proiezione dicembre', rr.valore != null ? _e(rr.valore) : '—',
              rr.attendibile ? 'al ritmo tenuto finora' : 'troppo presto per dirlo',
              (rr.attendibile && R.targetAnno > 0) ? (rr.valore >= R.targetAnno ? OBJ_T.verde : OBJ_T.rosso) : OBJ_T.ardesia);
    var r = R.residuo;
    if(r && r.raggiunto){
      h += card('Da qui a dicembre', 'Centrato', 'già ' + _e(r.oltre) + ' sopra l\'obiettivo', OBJ_T.verde);
    } else if(r && r.ritmoServe != null){
      var m = r.moltiplicatore;
      h += card('Ritmo che serve', _e(r.ritmoServe) + '<span style="font-size:0.75rem;font-weight:600"> /mese</span>',
                'mancano ' + _e(r.manca) + ' in ' + r.giorni + ' giorni'
                + (m != null ? ' · ' + (m <= 1 ? 'basta il ritmo attuale' : m.toFixed(1).replace('.', ',') + '× il ritmo attuale') : ''),
                m == null ? OBJ_T.ardesia : (m <= 1 ? OBJ_T.verde : (m <= 1.5 ? OBJ_T.ambra : OBJ_T.rosso)));
    }
  } else if(a < o.anno){
    h += card('Chiuso a', _e(R.realeAnno), R.targetAnno > 0 ? Math.round(R.realeAnno/R.targetAnno*100) + '% dell\'obiettivo' : '', colAnno);
  } else {
    h += card('Al mese', _e(R.targetAnno/12), 'in media, per centrare l\'anno', OBJ_T.ardesia);
  }
  return h + '</div>';
}

function _objRegolaTesto(r, corto){
  if(!r) return 'obiettivo annuo a mano';
  var t = (r.modo === '+') ? '+' + _objNum(r.val) : '+' + _objNum(r.val) + '%';
  if(r.min > 0) t += corto ? ', min ' + _objNum(r.min) : ', minimo ' + _objNum(r.min) + ' al mese';
  return t;
}

/* ── avviso del picco di incarichi (caricamento iniziale) ─────────────── */
function _objAvvisoPicco(){
  var p = _objCtx.picco;
  if(!p || _objCtx.fino || p.ok) return '';
  return '<div class="gx-info" style="border-color:'+OBJ_T.ambra+'">'
    + '<b>' + OBJ_MESI[p.mese-1] + ' ' + p.anno + ': ' + p.n + ' incarichi iniziati nello stesso mese.</b> '
    + 'Se sono gli incarichi che avevi già e che hai caricato all\'inizio, la loro data non è quella vera e '
    + 'gonfierebbe l\'obiettivo di ' + OBJ_MESI[p.mese-1].toLowerCase() + ' ' + (p.anno+1) + '. '
    + 'Esclusi, il numero vero di quel mese lo puoi scrivere nello Storico.'
    + '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
    + '<button class="gx-btn" style="color:'+OBJ_T.ambra+';border-color:'+OBJ_T.ambra+'" onclick="_objEscludiIniziali()">'
    + 'Escludi quelli iniziati entro il ' + objDataIt(p.fine) + '</button>'
    + '<button class="gx-btn" onclick="_objPiccoVeri()">No, sono veri</button></div></div>';
}

/* ── la griglia ───────────────────────────────────────────────────────── */
function _objPeriodiScala(){
  if(_objScala === 'trimestri') return [
    {et:'1° trim.', sot:'Gen-Mar', mesi:[1,2,3]}, {et:'2° trim.', sot:'Apr-Giu', mesi:[4,5,6]},
    {et:'3° trim.', sot:'Lug-Set', mesi:[7,8,9]}, {et:'4° trim.', sot:'Ott-Dic', mesi:[10,11,12]}];
  return OBJ_MESI3.map(function(n, i){ return {et:n, sot:'', mesi:[i+1]}; });
}

function _objCella(fatto, target, prima, stato, euro, extra){
  var tit = (extra && extra.title ? ' title="' + _esc(extra.title) + '"' : '');
  var pr = '<div class="p">' + (prima === null ? '&nbsp;' : _objAa(_objAnno-1) + ' ' + _objNum(prima, euro)) + '</div>';
  /* mese ancora da vivere: il numero grande è l'OBIETTIVO, è quello da guardare */
  if(stato === 'futuro'){
    return '<div class="obj-c futuro"' + tit + '>'
      + '<div class="v">' + (target > 0 ? _objNum(target, euro) : '·') + '</div>'
      + '<div class="o">' + (extra && extra.agenda ? '+' + _objNum(extra.agenda, euro) + ' in agenda' : (target > 0 ? 'obiettivo' : 'nessun obj')) + '</div>'
      + pr + '</div>';
  }
  return '<div class="obj-c ' + stato + '"' + tit + '>'
    + '<div class="v">' + _objNum(fatto, euro) + (extra && extra.mano ? '<span class="mk"></span>' : '') + '</div>'
    + '<div class="o">' + (target > 0 ? 'obj ' + _objNum(target, euro) : 'obj —') + '</div>'
    + pr + '</div>';
}

function _objStatoPeriodo(fatto, target, mesi, anno, oggi, soglia){
  var primo = mesi[0], ultimo = mesi[mesi.length-1];
  if(anno > oggi.anno || (anno === oggi.anno && primo > oggi.mese)) return 'futuro';
  if(anno === oggi.anno && ultimo >= oggi.mese) return (target > 0 && fatto >= target) ? 'surplus' : 'corso';
  if(target <= 0) return 'neutro';
  return objValuta(fatto, target, soglia).fascia;
}

function _objGriglia(righe){
  var o = _objCtx.oggi, per = _objPeriodiScala(), a = _objAnno;
  var soglia = (objLeggi(a) || objPredefinito(a)).sogliaLinea;
  var h = '<div class="obj-scroll"><table class="obj-gr' + (_objScala === 'trimestri' ? ' q' : '') + '"><thead><tr>'
    + '<th class="sx">Indicatore</th>';
  per.forEach(function(p){
    var ora = (a === o.anno && p.mesi.indexOf(o.mese) >= 0);
    h += '<th' + (ora ? ' class="ora"' : '') + '>' + p.et + (p.sot ? '<div style="font-weight:500;font-size:0.6rem">' + p.sot + '</div>' : '') + '</th>';
  });
  h += '<th>Anno</th></tr></thead><tbody>';
  righe.forEach(function(rg){
    var ind = objInd(rg.id), euro = !!ind.euro;
    var sel = (rg.id === _objSel);
    var reg = rg.target.modo === 'annuo' ? 'annuo a mano' : _objRegolaTesto(rg.target.regola, true) + ' sul ' + _objAa(a-1);
    h += '<tr class="riga' + (sel ? ' sel' : '') + '" style="color:' + ind.col + '" onclick="_objApri(\'' + rg.id + '\')">'
      + '<td class="nome"><div class="n"><span class="pall" style="background:' + ind.col + '"></span>' + ind.nome + '</div>'
      + '<div class="r">' + reg + '</div></td>';
    per.forEach(function(p){
      var f = 0, t = 0, pr = 0, ag = 0, mano = false;
      p.mesi.forEach(function(m){
        var c = rg.celle[m-1];
        f += c.fatto; t += c.target; pr += c.prima; ag += c.agenda; if(c.mano) mano = true;
      });
      var stato = (p.mesi.length === 1) ? rg.celle[p.mesi[0]-1].stato : _objStatoPeriodo(f, t, p.mesi, a, o, soglia);
      var title = ind.nome + ' ' + (p.sot || p.et) + ' ' + a + ': fatto ' + _objNum(f, euro, true)
        + ', obiettivo ' + _objNum(t, euro, true) + ', ' + (a-1) + ' ' + _objNum(pr, euro, true)
        + (mano ? ' (scritto a mano nello Storico)' : '') + (ag ? ' · in agenda ' + _objNum(ag, euro, true) : '');
      h += '<td>' + _objCella(f, t, rg.prec.coperto ? pr : null, stato, euro, {mano:mano, agenda:ag, title:title}) + '</td>';
    });
    h += '<td class="anno">' + _objCella(rg.fattoAnno, rg.targetAnno, rg.pari.coperto ? rg.pari.valore : null,
              rg.statoAnno, euro,
              {title: ind.nome + ' ' + a + ': fatto ' + _objNum(rg.fattoAnno, euro, true) + ' su ' + _objNum(rg.targetAnno, euro, true)
                      + (a === o.anno ? ' (dovuto a oggi ' + _objNum(rg.dovuto, euro, true) + '); ' + (a-1) + ' alla stessa data '
                                        : '; ' + (a-1) + ' ') + _objNum(rg.pari.valore, euro, true)})
      + '</td></tr>';
  });
  h += '</tbody></table></div>';
  var leg = function(bg, bd, t, tratt){
    return '<span><i style="background:' + bg + ';border-color:' + bd + (tratt ? ';border-style:dashed' : '') + '"></i>' + t + '</span>';
  };
  h += '<div class="obj-leg">'
    + leg('rgba(15,81,50,.09)', 'rgba(15,81,50,.28)', 'centrato')
    + leg('rgba(180,83,9,.09)', 'rgba(180,83,9,.30)', 'vicino (dal ' + (objNum(soglia) || 90) + '%)')
    + leg('rgba(127,29,29,.08)', 'rgba(127,29,29,.28)', 'sotto')
    + leg('transparent', 'var(--text3)', 'mese in corso', true)
    + '<span>sotto ogni numero: obiettivo e stesso periodo del ' + (a-1) + '</span>'
    + '<span><i style="width:6px;height:6px;border-radius:50%;background:var(--text3)"></i>scritto a mano</span>'
    + '</div>';
  var scala = '<div class="gx-ling" style="margin-left:auto">'
    + [['mesi','Mesi'],['trimestri','Trimestri']].map(function(x){
        var on = _objScala === x[0];
        return '<button class="gx-l' + (on ? ' on' : '') + '" style="padding:4px 10px;font-size:0.74rem;' + (on ? 'background:' + OBJ_T.blu : '') + '" '
          + 'onclick="event.stopPropagation();_objVaiScala(\'' + x[0] + '\')"><span class="pall" style="background:' + OBJ_T.blu + '"></span>' + x[1] + '</button>';
      }).join('') + '</div>';
  return _gxColonna(a + ' contro ' + (a-1), 'tocca una riga per vedere il dettaglio', OBJ_T.blu, h, scala);
}

/* ── il dettaglio di un indicatore ────────────────────────────────────── */
function _objBarre(rg, ind){
  var W = 720, H = 250, pL = 44, pR = 10, pT = 20, pB = 26, i;
  var euro = !!ind.euro, o = _objCtx.oggi, a = _objAnno;
  var max = 1;
  rg.celle.forEach(function(c){ max = Math.max(max, c.fatto, c.prima, c.target, c.agenda); });
  max = max * 1.15;
  /* per i conteggi le tacche dell'asse devono essere numeri interi */
  if(!euro) max = Math.max(4, Math.ceil(max/4)*4);
  var gw = (W - pL - pR) / 12;
  var Y = function(v){ return objArr(H - pB - (objNum(v)/max) * (H - pT - pB)); };
  var g = '';
  for(i=0;i<=4;i++){
    var val = max*i/4, y = Y(val);
    g += '<line x1="'+pL+'" y1="'+y+'" x2="'+(W-pR)+'" y2="'+y+'" stroke="var(--border)" stroke-width="1"'
      + (i ? ' stroke-dasharray="3 4"' : '') + '/>'
      + '<text x="'+(pL-7)+'" y="'+(y+4)+'" text-anchor="end" font-size="10" fill="var(--text3)">'
      + (euro ? _objNum(val, true) : (Math.round(val*10)/10).toLocaleString('it-IT')) + '</text>';
  }
  var bw = Math.min(22, gw*0.32);
  rg.celle.forEach(function(c, k){
    var x0 = pL + k*gw, cx = x0 + gw/2;
    // anno prima
    if(rg.prec.coperto && c.prima > 0){
      g += '<rect x="'+objArr(cx - bw - 1)+'" y="'+Y(c.prima)+'" width="'+objArr(bw)+'" height="'+objArr(H-pB-Y(c.prima))+'" rx="3" fill="#94A3B8" opacity="0.45"><title>'
        + (a-1) + ': ' + _objNum(c.prima, euro, true) + '</title></rect>';
    }
    // quest'anno
    if(c.stato !== 'futuro' && c.fatto > 0){
      var col = OBJ_STATO_COL[c.stato] || ind.col;
      g += '<rect x="'+objArr(cx + 1)+'" y="'+Y(c.fatto)+'" width="'+objArr(bw)+'" height="'+objArr(H-pB-Y(c.fatto))+'" rx="3" fill="'+col+'"><title>'
        + a + ': ' + _objNum(c.fatto, euro, true) + '</title></rect>'
        + '<text x="'+objArr(cx + 1 + bw/2)+'" y="'+(Y(c.fatto)-4)+'" text-anchor="middle" font-size="10" font-weight="700" fill="'+col+'">'
        + _objNum(c.fatto, euro) + '</text>';
    }
    // già in agenda (visite e rogiti con data futura)
    if(c.agenda > 0){
      var base = c.stato === 'futuro' ? 0 : c.fatto;
      g += '<rect x="'+objArr(cx + 1)+'" y="'+Y(base + c.agenda)+'" width="'+objArr(bw)+'" height="'+objArr(Y(base) - Y(base + c.agenda))+'" rx="3" fill="none" stroke="'+ind.col+'" stroke-width="1.5" stroke-dasharray="3 2"><title>in agenda: '
        + _objNum(c.agenda, euro, true) + '</title></rect>';
    }
    // obiettivo: una tacca scura sopra il mese
    if(c.target > 0){
      g += '<line x1="'+objArr(cx - bw - 4)+'" y1="'+Y(c.target)+'" x2="'+objArr(cx + bw + 4)+'" y2="'+Y(c.target)+'" stroke="var(--text)" stroke-width="2.5" stroke-linecap="round"><title>obiettivo: '
        + _objNum(c.target, euro, true) + '</title></line>';
    }
    var ora = (a === o.anno && c.mese === o.mese);
    g += '<text x="'+objArr(cx)+'" y="'+(H-9)+'" text-anchor="middle" font-size="10" '
      + (ora ? 'font-weight="800" fill="var(--text)"' : 'fill="var(--text3)"') + '>' + OBJ_MESI3[k] + '</text>';
  });
  var leg = function(el, t){ return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:0.72rem;color:var(--text2)">' + el + t + '</span>'; };
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px">'
    + leg('<svg width="12" height="12"><rect width="12" height="12" rx="3" fill="#94A3B8" opacity="0.45"/></svg>', String(a-1))
    + leg('<svg width="12" height="12"><rect width="12" height="12" rx="3" fill="' + OBJ_T.verde + '"/></svg>', a + ' (colore = rispetto all\'obiettivo)')
    + leg('<svg width="16" height="12"><line x1="1" y1="6" x2="15" y2="6" stroke="var(--text)" stroke-width="2.5" stroke-linecap="round"/></svg>', 'obiettivo')
    + (rg.celle.some(function(c){ return c.agenda > 0; })
        ? leg('<svg width="12" height="12"><rect x="1" y="1" width="10" height="10" rx="2" fill="none" stroke="' + ind.col + '" stroke-dasharray="3 2"/></svg>', 'già in agenda') : '')
    + '</div><svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet">' + g + '</svg>';
}

function _objFatto(et, sot, num, col){
  return '<div class="gx-riga"><div style="min-width:0"><div class="gr">' + et + '</div>'
    + '<div class="sub">' + (sot || '') + '</div></div>'
    + '<div class="num" style="color:' + (col || 'var(--text)') + '">' + num + '</div></div>';
}

function _objDettaglio(rg){
  var ind = objInd(rg.id), euro = !!ind.euro, o = _objCtx.oggi, a = _objAnno;
  var f = '';
  // 1. contro l'anno prima
  if(rg.pari.coperto && a <= o.anno){
    var dl = objArr(rg.fattoAnno - rg.pari.valore);
    var pc = rg.pari.valore > 0 ? Math.round(dl/rg.pari.valore*100) : null;
    f += _objFatto(a === o.anno ? 'Contro il ' + (a-1) + ', alla stessa data' : 'Contro il ' + (a-1),
                   _objNum(rg.fattoAnno, euro, true) + ' contro ' + _objNum(rg.pari.valore, euro, true)
                   + (pc !== null ? ' (' + (pc >= 0 ? '+' : '') + pc + '%)' : ''),
                   _objSegno(dl, euro), dl >= 0 ? OBJ_T.verde : OBJ_T.rosso);
  } else if(!rg.prec.coperto){
    f += _objFatto('Contro il ' + (a-1), 'il gestionale non ha dati del ' + (a-1)
                   + '. Scrivili nello Storico e il confronto si accende.', '—', 'var(--text3)');
  }
  // 2. obiettivo dell'anno
  var reg = rg.target.modo === 'annuo' ? 'fissato a mano, distribuito sui mesi'
    : 'stesso mese del ' + (a-1) + ' ' + _objRegolaTesto(rg.target.regola, false)
      + (rg.target.baseCoperta ? '' : ' — senza dati del ' + (a-1) + ' vale il minimo');
  f += _objFatto('Obiettivo ' + a, reg, _objNum(rg.targetAnno, euro, true), OBJ_T.blu);
  // 3. il mese in corso, tradotto in settimane
  if(a === o.anno){
    var c = rg.celle[o.mese-1];
    var gg = objGiorniMese(a, o.mese), restano = gg - o.giorno;
    var manca = objArr(c.target - c.fatto);
    var sot;
    if(c.target <= 0) sot = 'nessun obiettivo per questo mese';
    else if(manca <= 0) sot = 'centrato: ' + _objNum(c.fatto, euro, true) + ' su ' + _objNum(c.target, euro, true);
    else if(restano <= 0) sot = 'ultimo giorno del mese: mancano ' + _objNum(manca, euro, true);
    else {
      var sett = restano / 7;
      sot = 'mancano ' + _objNum(manca, euro, true) + ' in ' + restano + (restano === 1 ? ' giorno' : ' giorni')
        + (sett >= 1 ? ' — circa ' + _objNum(Math.ceil(manca/sett*10)/10, euro, true) + ' a settimana' : '');
    }
    f += _objFatto(OBJ_MESI[o.mese-1], sot,
                   _objNum(c.fatto, euro, true) + '<span style="font-size:0.72rem;color:var(--text3);font-weight:600"> / '
                   + _objNum(c.target, euro, true) + '</span>',
                   OBJ_STATO_COL[c.stato] || ind.col);
    if(o.mese < 12){
      var n = rg.celle[o.mese];
      f += _objFatto(OBJ_MESI[o.mese], 'obiettivo del prossimo mese' + (rg.prec.coperto ? ' (nel ' + (a-1) + ': ' + _objNum(n.prima, euro, true) + ')' : '')
                     + (n.agenda ? ' · già in agenda: ' + _objNum(n.agenda, euro, true) : ''),
                     _objNum(n.target, euro, true), OBJ_T.blu);
    }
  } else if(a > o.anno){
    var mig = null;
    rg.celle.forEach(function(c){ if(!mig || c.target > mig.target) mig = c; });
    if(mig && mig.target > 0) f += _objFatto('Il mese più impegnativo', OBJ_MESI[mig.mese-1] + ': nel ' + (a-1) + ' ' + _objNum(mig.prima, euro, true),
                                             _objNum(mig.target, euro, true), OBJ_T.ambra);
  }
  // 4. note sull'origine del dato
  var note = [];
  note.push('Da: ' + ind.fonte + '.');
  if(rg.id === 'valutazioni'){
    note.push('Dal 30 settembre 2026 ogni cambio di fase nel pipeline Acquisizioni ha la sua data. '
      + (rg.serie.stime > 0 ? 'Per ' + rg.serie.stime + ' valutazioni di prima vale la data in cui è nato il contatto (stimata).' : ''));
  }
  if(rg.id === 'incarichi' && _objCtx.fino){
    note.push('Esclusi ' + _objCtx.esclusi.length + ' incarichi iniziati entro il ' + objDataIt(_objCtx.fino)
      + ' (portafoglio caricato all\'inizio). <a href="#" onclick="event.preventDefault();_objRimettiIniziali()">Rimettili nel conteggio</a>');
  }
  if(rg.serie.mano.some(function(b){ return b; })) note.push('I mesi col pallino sono scritti a mano nello Storico.');
  f += '<div class="gx-riga"><div class="sub">' + note.join('<br>') + '</div></div>';

  return _gxColonna(ind.nome + ' · mese per mese', a + ' contro ' + (a-1) + ', con l\'obiettivo di ogni mese', ind.col,
      '<div class="obj-det"><div class="graf">' + _objBarre(rg, ind) + '</div><div class="fatti">' + f + '</div></div>');
}

/* [14 set 2026] "Ce la faccio con quello che ho": una barra sola,
   dall'incassato al portafoglio, con la parte scoperta in fondo. */
function _objPipeline(R){
  var P = R.pipeline, t = objNum(R.targetAnno);
  if(!P || t <= 0) return '';

  var base = Math.max(t, P.conTutto, 1);
  var seg = function(val, col, tit){
    var w = objNum(val)/base*100;
    if(w <= 0) return '';
    return '<div title="'+tit+'" style="width:'+w+'%;background:'+col+';height:100%"></div>';
  };
  var voce = function(col, et, val, sot){
    return '<div style="flex:1;min-width:140px">'
      + '<div style="display:flex;align-items:center;gap:6px">'
      + '<span style="width:10px;height:10px;border-radius:3px;background:'+col+';flex-shrink:0"></span>'
      + '<span style="font-size:0.74rem;font-weight:700;color:var(--text2)">'+et+'</span></div>'
      + '<div style="font-size:1rem;font-weight:800;margin-top:1px">'+_e(val)+'</div>'
      + '<div style="font-size:0.7rem;color:var(--text3)">'+sot+'</div></div>';
  };

  var verdetto;
  if(P.copreIlResiduo){
    verdetto = '<div style="color:'+OBJ_T.verde+';font-weight:800;font-size:0.92rem">'
      + 'Quello che hai già in mano basta a centrare l\'obiettivo</div>'
      + '<div style="font-size:0.82rem;color:var(--text2);margin-top:2px">'
      + 'Incassato più le proposte accettate: ' + _e(P.conPipeline) + ' su ' + _e(t) + '.</div>';
  } else if(P.scoperto <= 0){
    verdetto = '<div style="color:'+OBJ_T.ambra+';font-weight:800;font-size:0.92rem">'
      + 'Ci arrivi solo se tengono anche le trattative aperte</div>'
      + '<div style="font-size:0.82rem;color:var(--text2);margin-top:2px">'
      + 'Con tutto quello che è in corso saresti a ' + _e(P.conTutto)
      + '; senza le proposte ancora da chiudere ti fermi a ' + _e(P.conPipeline) + '.</div>';
  } else {
    verdetto = '<div style="color:'+OBJ_T.rosso+';font-weight:800;font-size:0.92rem">'
      + 'Mancano ' + _e(P.scoperto) + ' che oggi non sono in nessuna trattativa</div>'
      + '<div style="font-size:0.82rem;color:var(--text2);margin-top:2px">'
      + 'Sommando incassato, proposte accettate e trattative aperte arrivi a ' + _e(P.conTutto)
      + '. Il resto sono affari da trovare.</div>';
  }

  var tacca = (P.conTutto > t)
    ? '<div style="position:absolute;left:'+(t/base*100)+'%;top:-3px;bottom:-3px;width:2px;'
      + 'background:var(--text);opacity:.55" title="obiettivo"></div>' : '';

  var colV = P.copreIlResiduo ? OBJ_T.verde : (P.scoperto <= 0 ? OBJ_T.ambra : OBJ_T.rosso);
  return '<div class="gx-col"><div class="gx-head" style="color:'+colV+'"><div class="t">Ce la faccio con quello che ho</div>'
    + '<div class="s">provvigioni: incassato, rogitato, proposte e trattative</div></div><div style="padding:12px 16px">'
    + verdetto
    + '<div style="position:relative;margin:12px 0 8px">'
    +   '<div style="display:flex;height:18px;border-radius:6px;overflow:hidden;background:var(--bg3);'
    +   'border:1px solid var(--border)">'
    +     seg(R.realeAnno, OBJ_T.verde, 'incassato')
    +     seg(P.maturato.tot, OBJ_T.bluChiaro, 'rogitato, da incassare')
    +     seg(P.accettate.tot, OBJ_T.blu, 'proposte accettate')
    +     seg(P.inCorso.tot, OBJ_T.ambra, 'trattative aperte')
    +   '</div>' + tacca + '</div>'
    + '<div style="display:flex;gap:12px;flex-wrap:wrap">'
    +   voce(OBJ_T.verde,'Incassato', R.realeAnno, 'già in cassa')
    +   voce(OBJ_T.bluChiaro,'Da incassare', P.maturato.tot, P.maturato.quante+' rogitate')
    +   voce(OBJ_T.blu,'Accettate', P.accettate.tot, P.accettate.quante+' in attesa di rogito')
    +   voce(OBJ_T.ambra,'In trattativa', P.inCorso.tot, P.inCorso.quante+' proposte aperte')
    + '</div>'
    + '<div style="font-size:0.74rem;color:var(--text3);margin-top:10px;line-height:1.5">'
    + 'In portafoglio ci sono altri ' + _e(P.portafoglio.tot) + ' di incarichi senza proposta ('
    + P.portafoglio.quante + '): non li conto qui perché non si vendono tutti.'
    + (P.scartate > 0 ? ' ' + P.scartate + ' voci escluse perché già conteggiate nell\'incassato.' : '')
    + '</div></div></div>';
}

function _objScarti(R){
  if(!R.scarti.length) return '';
  return '<details style="margin-top:4px;margin-bottom:12px"><summary style="cursor:pointer;font-size:0.8rem;'
    + 'color:var(--text2);font-weight:700">'+R.scarti.length
    + ' provvigioni non conteggiate — vedi perché</summary>'
    + '<div style="margin-top:8px;font-size:0.8rem;color:var(--text2);line-height:1.7">'
    + R.scarti.map(function(s){
        return '· '+_esc(s.etich)+' <span style="opacity:.75">('+_esc(s.motivo)+')</span>';
      }).join('<br>')
    + '</div></details>';
}

/* ── REGOLE dell'anno ─────────────────────────────────────────────────── */

/* [14 set 2026] STAGIONALITÀ delle provvigioni, quando l'obiettivo annuo è
   scritto a mano. I valori sono PESI: contano solo l'uno rispetto all'altro. */
function _objPesiDa(cfg){
  var p = objPesiValidi(cfg && cfg.stagionalita);
  return p ? p : [1,1,1,1,1,1,1,1,1,1,1,1];
}
function _objGrigliaMesi(cfg){
  var pesi = _objPesiDa(cfg);
  var uguali = !objPesiValidi(cfg && cfg.stagionalita);
  var celle = '';
  for(var i=0;i<12;i++){
    celle += '<div style="text-align:center">'
      + '<div style="font-size:0.68rem;font-weight:700;color:var(--text2);text-transform:uppercase">'
      + OBJ_MESI[i].slice(0,3) + '</div>'
      + '<input class="obj-in obj-peso" id="obj-peso-'+i+'" type="number" step="any" min="0" '
      + 'value="'+pesi[i]+'" oninput="_objRicalcolaPesi()">'
      + '<div class="obj-peso-eur" id="obj-eur-'+i+'" style="font-size:0.66rem;color:var(--text3);margin-top:2px">—</div>'
      + '</div>';
  }
  return '<div style="margin-top:14px">'
    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">'
    + '<div style="font-weight:700;font-size:0.84rem">Come si distribuisce sui mesi</div>'
    + '<button class="gx-btn" onclick="_objPesiUguali()">Tutti uguali</button>'
    + '<div id="obj-pesi-nota" style="font-size:0.74rem;color:var(--text2)">'
    + (uguali ? 'ora l\'obiettivo è diviso in dodici parti uguali' : '') + '</div></div>'
    + '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">' + celle + '</div>'
    + '<div style="font-size:0.74rem;color:var(--text2);margin-top:8px;line-height:1.5">'
    + 'Quanto pesa ogni mese, uno rispetto all\'altro. Non devono sommare a cento: '
    + 'metti 0 sui mesi in cui non lavori. Sotto vedi quanto diventa in euro.</div></div>';
}
window._objPesiUguali = function(){
  for(var i=0;i<12;i++){ var el=document.getElementById('obj-peso-'+i); if(el) el.value = 1; }
  _objRicalcolaPesi();
};
window._objRicalcolaPesi = function(){
  var pesi = [], i, el;
  for(i=0;i<12;i++){ el=document.getElementById('obj-peso-'+i); pesi.push(el ? objNum(el.value) : 0); }
  var t = document.getElementById('obj-target');
  var target = t ? objNum(t.value) : 0;
  var tm = objTargetMensile(target, pesi);
  var somma = pesi.reduce(function(a,b){ return a + (b>0?b:0); }, 0);
  for(i=0;i<12;i++){
    el = document.getElementById('obj-eur-'+i);
    if(el) el.textContent = (somma<=0 || target<=0) ? '—' : _e(tm[i]);
  }
  var nota = document.getElementById('obj-pesi-nota');
  if(nota){
    if(somma<=0) nota.innerHTML = '<span style="color:#B91C1C;font-weight:700">tutti i mesi a zero: userei dodici parti uguali</span>';
    else {
      var diversi = pesi.some(function(x){ return objNum(x) !== objNum(pesi[0]); });
      nota.textContent = diversi ? 'somma dei dodici: ' + _e(tm.reduce(function(a,b){return a+b;},0))
                                 : 'ora l\'obiettivo è diviso in dodici parti uguali';
    }
  }
  try{ _objAnteprimaRegole(); }catch(e){}
};

function _objLeggiRegolaForm(id){
  var v = document.getElementById('obj-rg-val-' + id), m = document.getElementById('obj-rg-modo-' + id),
      n = document.getElementById('obj-rg-min-' + id);
  return {modo: (m && m.value === '+') ? '+' : '%', val: v ? objNum(v.value) : OBJ_REGOLA_BASE.val,
          min: n ? Math.max(0, objNum(n.value)) : 0};
}

/* anteprima dal vivo: i dodici obiettivi che nascono dalla regola */
window._objAnteprimaRegole = function(){
  if(!_objCtx) return;
  var a = _objAnno;
  OBJ_IND.forEach(function(ind){
    var box = document.getElementById('obj-rg-ant-' + ind.id);
    if(!box) return;
    var mesi;
    var tEl = document.getElementById('obj-target');
    if(ind.id === 'gci' && tEl && objNum(tEl.value) > 0){
      var pesi = [];
      for(var i=0;i<12;i++){ var el = document.getElementById('obj-peso-'+i); pesi.push(el ? objNum(el.value) : 1); }
      mesi = objTargetMensile(objNum(tEl.value), pesi);
    } else {
      var r = _objLeggiRegolaForm(ind.id);
      var base = objSerie(ind.id, a-1, _objCtx).fatto;
      mesi = base.map(function(b){ return objTargetDaBase(b, r, !!ind.euro); });
    }
    var base2 = objSerie(ind.id, a-1, _objCtx);
    box.innerHTML = mesi.map(function(t, k){
      return '<div>' + OBJ_MESI3[k] + '<b>' + _objNum(t, !!ind.euro) + '</b>'
        + (base2.coperto ? '<span style="color:var(--text3)">' + _objAa(a-1) + ' ' + _objNum(base2.fatto[k], !!ind.euro) + '</span>' : '') + '</div>';
    }).join('');
    var tot = document.getElementById('obj-rg-tot-' + ind.id);
    if(tot) tot.textContent = _objNum(mesi.reduce(function(x,y){ return x+y; }, 0), !!ind.euro, true);
  });
};

function _objRegole(){
  var a = _objAnno, cfg = objLeggi(a) || objPredefinito(a);
  var righe = OBJ_IND.map(function(ind){
    var r = objRegola(cfg, ind.id);
    var base = objSerie(ind.id, a-1, _objCtx);
    return '<div class="gx-riga" style="align-items:flex-start;gap:14px">'
      + '<div style="width:130px;flex-shrink:0"><div class="tt" style="display:flex;align-items:center;gap:7px;font-weight:800">'
      + '<span class="pall" style="background:' + ind.col + ';margin-top:0"></span>' + ind.nome + '</div>'
      + '<div class="sub">' + (base.coperto ? 'base: il ' + (a-1) : 'nel ' + (a-1) + ' nessun dato: vale il minimo') + '</div></div>'
      + '<div style="display:flex;gap:6px;align-items:flex-end;flex-shrink:0">'
      +   '<label style="font-size:0.66rem;color:var(--text3);font-weight:700;text-transform:uppercase">Crescita'
      +   '<div style="display:flex;gap:4px;margin-top:2px"><input class="obj-in" style="width:64px" type="number" step="any" id="obj-rg-val-' + ind.id + '" value="' + r.val + '" oninput="_objAnteprimaRegole()">'
      +   '<select class="obj-sel" id="obj-rg-modo-' + ind.id + '" onchange="_objAnteprimaRegole()">'
      +     '<option value="%"' + (r.modo === '%' ? ' selected' : '') + '>%</option>'
      +     '<option value="+"' + (r.modo === '+' ? ' selected' : '') + '>in più</option></select></div></label>'
      +   '<label style="font-size:0.66rem;color:var(--text3);font-weight:700;text-transform:uppercase">Minimo/mese'
      +   '<div style="margin-top:2px"><input class="obj-in" style="width:84px" type="number" step="any" min="0" id="obj-rg-min-' + ind.id + '" value="' + r.min + '" oninput="_objAnteprimaRegole()"></div></label>'
      + '</div>'
      + '<div style="flex:1;min-width:0;overflow:auto"><div class="obj-ant" id="obj-rg-ant-' + ind.id + '"></div></div>'
      + '<div style="width:74px;text-align:right;flex-shrink:0"><div class="gr">Anno</div><div id="obj-rg-tot-' + ind.id + '" style="font-weight:800;font-variant-numeric:tabular-nums"></div></div>'
      + '</div>';
  }).join('');

  var campo = function(id, et, val, sot){
    return '<div class="frow"><label class="flabel">'+et+'</label>'
      + '<input class="finput" id="'+id+'" type="number" step="any" value="' + _esc(objNum(val) === 0 ? '' : val) + '">'
      + (sot ? '<div style="font-size:0.72rem;color:var(--text2);margin-top:3px">'+sot+'</div>' : '')
      + '</div>';
  };
  var soldi = '<div style="padding:12px 16px">'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px">'
    + campo('obj-target', 'Obiettivo annuo fisso (€)', cfg.targetAnno, 'lascia vuoto per usare la regola di crescita qui sopra')
        .replace('id="obj-target"', 'id="obj-target" oninput="_objRicalcolaPesi()"')
    + campo('obj-costi', 'Costi e spese annue (€)', cfg.costiAnnui, 'per il netto')
    + campo('obj-soglia', 'Soglia "vicino" (%)', cfg.sogliaLinea, 'sotto questa quota il mese è rosso')
    + '</div>' + _objGrigliaMesi(cfg) + '</div>';

  return '<div class="gx-info">Ogni obiettivo nasce dallo <b>stesso mese del ' + (a-1) + '</b> più la crescita, '
    + 'arrotondato per eccesso: 2 incarichi con +10% diventano 3. Il minimo vale per i mesi in cui nel ' + (a-1)
    + ' avevi fatto poco o niente. Sotto ogni riga vedi subito gli obiettivi mese per mese.</div>'
    + _gxColonna('Regole ' + a, 'crescita rispetto al ' + (a-1) + ' e minimo al mese', OBJ_T.blu, righe)
    + _gxColonna('Provvigioni in euro', 'solo se vuoi un obiettivo annuo fisso invece della regola', OBJ_T.verde, soldi)
    + '<div style="display:flex;gap:8px;margin-bottom:14px">'
    + '<button class="btn btn-primary btn-sm" onclick="_objSalvaRegole()">Salva regole ' + a + '</button>'
    + '<button class="btn btn-outline btn-sm" onclick="_objVaiVista(\'panoramica\')">Annulla</button></div>';
}

window._objSalvaRegole = function(){
  var a = _objAnno, cfg = objLeggi(a) || objPredefinito(a);
  var leggi = function(id){ var el = document.getElementById(id); return el ? objNum(el.value) : 0; };
  var regole = {};
  OBJ_IND.forEach(function(ind){ regole[ind.id] = _objLeggiRegolaForm(ind.id); });
  var p = [], i, el, diversi = false;
  for(i=0;i<12;i++){ el = document.getElementById('obj-peso-'+i); p.push(el ? objNum(el.value) : 1); }
  for(i=0;i<12;i++) if(p[i] !== p[0]) diversi = true;
  /* provvMedia, valutazioniPerIncarico e incarichiPerVendita non sono più
     nella pagina ma restano salvati com'erano (aggiornaRecord li conserva) */
  var ok = objAggiorna(a, {
    targetAnno: leggi('obj-target'),
    costiAnnui: leggi('obj-costi'),
    sogliaLinea: leggi('obj-soglia') || 90,
    stagionalita: (diversi && objPesiValidi(p)) ? p : null,
    regole: regole
  });
  if(ok){
    _objVista = 'panoramica'; _objDisegna();
    try{ if(typeof toast === 'function') toast('Regole ' + a + ' salvate'); }catch(e){}
  } else {
    try{ dlgAlert('Non sono riuscito a salvare le regole.',''); }catch(e){}
  }
};

/* ── STORICO scritto a mano ───────────────────────────────────────────── */
function _objStorico(){
  var o = _objCtx.oggi;
  var anni = []; for(var y = o.anno-2; y <= o.anno; y++) anni.push(y);
  if(_objStAnno === null || anni.indexOf(_objStAnno) < 0) _objStAnno = Math.min(o.anno, _objAnno - 1);
  if(anni.indexOf(_objStAnno) < 0) _objStAnno = anni[anni.length-1];
  var sa = _objStAnno;
  var ling = '<div class="gx-ling" style="margin-left:auto">' + anni.map(function(y){
    var on = y === sa;
    return '<button class="gx-l' + (on ? ' on' : '') + '" style="padding:4px 10px;font-size:0.74rem;' + (on ? 'background:' + OBJ_T.ardesia : '') + '" '
      + 'onclick="_objVaiStAnno(' + y + ')"><span class="pall" style="background:' + OBJ_T.ardesia + '"></span>' + y + '</button>';
  }).join('') + '</div>';

  var h = '<div class="obj-scroll"><table class="obj-gr"><thead><tr><th class="sx">Indicatore</th>'
    + OBJ_MESI3.map(function(m){ return '<th>' + m + '</th>'; }).join('') + '<th>Anno</th></tr></thead><tbody>';
  OBJ_IND.forEach(function(ind){
    var s = objSerie(ind.id, sa, _objCtx);
    h += '<tr style="color:' + ind.col + '"><td class="nome"><div class="n"><span class="pall" style="background:' + ind.col + '"></span>' + ind.nome + '</div>'
      + '<div class="r">' + (ind.euro ? 'in euro' : 'quanti') + '</div></td>';
    for(var m=1;m<=12;m++){
      var futuro = sa > o.anno || (sa === o.anno && m >= o.mese);
      var v = s.mano[m-1] ? s.fatto[m-1] : '';
      h += '<td><input class="obj-in' + (s.mano[m-1] ? ' mano' : '') + '" type="number" step="any" min="0" '
        + 'id="obj-st-' + ind.id + '-' + m + '" value="' + v + '" placeholder="' + (s.auto[m-1] ? _objNum(s.auto[m-1], false) : '') + '"'
        + (futuro ? ' disabled title="mese non ancora chiuso"' : ' title="gestionale: ' + _objNum(s.auto[m-1], !!ind.euro, true) + '"') + '></td>';
    }
    var tot = s.fatto.reduce(function(x,y){ return x+y; }, 0);
    h += '<td class="anno gx-num" style="padding-right:12px;font-weight:800;color:var(--text)">' + _objNum(tot, !!ind.euro) + '</td></tr>';
  });
  h += '</tbody></table></div>';

  var iniz = '';
  if(_objCtx.fino){
    iniz = '<div class="gx-info">Incarichi: esclusi <b>' + _objCtx.esclusi.length + '</b> iniziati entro il '
      + objDataIt(_objCtx.fino) + ', perché caricati all\'inizio con una data che non è quella vera. '
      + 'Se ricordi quanti ne hai presi davvero in quei mesi, scrivili qui sotto. '
      + '<button class="gx-btn" style="margin-left:4px" onclick="_objRimettiIniziali()">Rimettili nel conteggio</button></div>';
  }
  return _objAvvisoPicco() + iniz
    + '<div class="gx-info">Scrivi <b>solo dove il gestionale non ha il numero giusto</b>: il numero grigio è quello che '
    + 'trova lui. Se scrivi un numero, vale il tuo (anche uno 0). Lascia vuoto per tornare al numero del gestionale. '
    + 'I mesi non ancora chiusi non si scrivono.</div>'
    + _gxColonna('Storico ' + sa, 'numeri del passato scritti a mano', OBJ_T.ardesia, h, ling)
    + '<div style="display:flex;gap:8px;margin-bottom:14px">'
    + '<button class="btn btn-primary btn-sm" onclick="_objSalvaStorico()">Salva storico ' + sa + '</button>'
    + '<button class="btn btn-outline btn-sm" onclick="_objVaiVista(\'panoramica\')">Annulla</button></div>';
}

window._objSalvaStorico = function(){
  var sa = _objStAnno, st = {}, qualcosa = false;
  OBJ_IND.forEach(function(ind){
    var arr = [], pieno = false;
    for(var m=1;m<=12;m++){
      var el = document.getElementById('obj-st-' + ind.id + '-' + m);
      var t = el && !el.disabled ? String(el.value).trim() : '';
      if(t !== '' && isFinite(objNum(t))){ arr.push(objNum(t)); pieno = true; }
      else arr.push(null);
    }
    if(pieno){ st[ind.id] = arr; qualcosa = true; }
  });
  if(objAggiorna(sa, {storico: qualcosa ? st : null})){
    _objDisegna();
    try{ if(typeof toast === 'function') toast('Storico ' + sa + ' salvato'); }catch(e){}
  } else {
    try{ dlgAlert('Non sono riuscito a salvare lo storico.',''); }catch(e){}
  }
};

/* ── incarichi caricati all'inizio ────────────────────────────────────── */
window._objEscludiIniziali = function(){
  var p = _objCtx && _objCtx.picco; if(!p) return;
  if(objAggiorna(p.anno, {incarichiInizialiFino: p.fine})) _objDisegna();
};
window._objRimettiIniziali = function(){
  (Array.isArray(D.obiettivi) ? D.obiettivi : []).forEach(function(r){
    if(r && r.incarichiInizialiFino) objAggiorna(r.anno, {incarichiInizialiFino: ''});
  });
  /* rimessi dentro, l'avviso non deve tornare: Enzo ha già deciso */
  var p = objContesto().picco;
  if(p) objAggiorna(p.anno, {incarichiPiccoOk: [p.anno + '-' + p.mese]});
  _objDisegna();
};
window._objPiccoVeri = function(){
  var p = _objCtx && _objCtx.picco; if(!p) return;
  var rec = objLeggi(p.anno);
  var arr = (rec && Array.isArray(rec.incarichiPiccoOk)) ? rec.incarichiPiccoOk.slice() : [];
  var k = p.anno + '-' + p.mese;
  if(arr.indexOf(k) < 0) arr.push(k);
  if(objAggiorna(p.anno, {incarichiPiccoOk: arr})) _objDisegna();
};

/* ── STAMPA ED EXCEL ───────────────────────────────────────── [30 set 2026]
   Stesso schema del Bilancio Agenzia: la stampa apre una pagina A4
   orizzontale con "Stampa o salva in PDF"; l'Excel usa la libreria dei
   fogli di calcolo già caricata dal gestionale (XLSX). Tutte e due partono
   dall'anno scelto in alto e dagli stessi calcoli della pagina. */

function _objDatiExport(){
  var a = _objAnno, ctx = objContesto();
  var R = objCalcola(a, ctx);
  var cfg = objLeggi(a) || objPredefinito(a);
  var righe = OBJ_IND.map(function(ind){ return objRiga(ind.id, a, ctx, cfg.sogliaLinea); });
  var nome = '';
  try{ if(typeof getNomeAgenzia === 'function') nome = getNomeAgenzia() || ''; }catch(e){}
  var note = [];
  if(ctx.fino) note.push('Incarichi: esclusi ' + ctx.esclusi.length + ' iniziati entro il ' + objDataIt(ctx.fino)
    + ' (portafoglio caricato all\'inizio).');
  var stime = righe[0].serie.stime + righe[0].prec.stime;
  if(stime > 0) note.push('Valutazioni: ' + stime + ' hanno una data stimata (creazione del contatto), '
    + 'perché prima del 30/09/2026 il pipeline non registrava il giorno del cambio di fase.');
  var mano = righe.filter(function(r){ return r.serie.mano.some(function(b){return b;}) || r.prec.mano.some(function(b){return b;}); })
    .map(function(r){ return objInd(r.id).nome; });
  if(mano.length) note.push('Numeri scritti a mano nello Storico per: ' + mano.join(', ') + '.');
  return {a:a, ctx:ctx, R:R, cfg:cfg, righe:righe, nome:nome, note:note};
}

function _objTestoRegola(rg){
  return rg.target.modo === 'annuo' ? 'obiettivo annuo fissato a mano'
    : 'stesso mese del ' + (rg.anno-1) + ' ' + _objRegolaTesto(rg.target.regola, false)
      + (rg.target.baseCoperta ? '' : ' (senza dati del ' + (rg.anno-1) + ': vale il minimo)');
}

window.objStampa = function(){
  var X;
  try{ X = _objDatiExport(); }catch(e){ console.warn('[Obiettivi] stampa KO:', e); return; }
  var a = X.a, o = X.ctx.oggi, R = X.R;
  var gci = X.righe[X.righe.length-1];

  var box = function(et, val, sot, col){
    return '<td class="box"><div class="et">' + et + '</div><div class="val" style="color:' + (col || '#0F172A') + '">'
      + val + '</div><div class="sot">' + (sot || '') + '</div></td>';
  };
  var dl = objArr(gci.fattoAnno - gci.pari.valore);
  var sint = '<table class="sint"><tr>'
    + box('Provvigioni ' + a, _e(R.realeAnno), R.targetAnno > 0 ? 'su un obiettivo di ' + _e(R.targetAnno) : 'nessun obiettivo in euro')
    + box('Contro il ' + (a-1), gci.pari.coperto && a <= o.anno ? _objSegno(dl, true) : '—',
          gci.pari.coperto ? (a === o.anno ? 'alla stessa data: ' : 'anno intero: ') + _e(gci.pari.valore) : 'nessun dato del ' + (a-1),
          gci.pari.coperto && a <= o.anno ? (dl >= 0 ? '#0F5132' : '#7F1D1D') : '')
    + (a === o.anno
        ? box('Proiezione dicembre', R.runRate.valore != null ? _e(R.runRate.valore) : '—',
              R.runRate.attendibile ? 'al ritmo tenuto finora' : 'troppo presto per dirlo')
          + box(R.residuo && R.residuo.raggiunto ? 'Da qui a dicembre' : 'Ritmo che serve', R.residuo && R.residuo.ritmoServe != null ? _e(R.residuo.ritmoServe) + ' /mese'
                : (R.residuo && R.residuo.raggiunto ? 'Centrato' : '—'),
                R.residuo && R.residuo.ritmoServe != null ? 'mancano ' + _e(R.residuo.manca) + ' in ' + R.residuo.giorni + ' giorni' : '')
        : box('Media al mese', _e(R.targetAnno/12), 'per centrare l\'anno'))
    + '</tr></table>';

  var tab = '<table class="gr"><thead><tr><th class="sx">Indicatore</th>'
    + OBJ_MESI3.map(function(m, i){ return '<th' + (a === o.anno && i+1 === o.mese ? ' class="ora"' : '') + '>' + m + '</th>'; }).join('')
    + '<th>Anno</th></tr></thead><tbody>';
  X.righe.forEach(function(rg){
    var ind = objInd(rg.id), euro = !!ind.euro;
    tab += '<tr><td class="nome"><div class="n"><span class="pall" style="background:' + ind.col + '"></span>' + ind.nome + '</div>'
      + '<div class="r">' + (rg.target.modo === 'annuo' ? 'annuo a mano' : _objRegolaTesto(rg.target.regola, true)) + '</div></td>';
    rg.celle.forEach(function(c){
      tab += '<td>' + _objCella(c.fatto, c.target, rg.prec.coperto ? c.prima : null, c.stato, euro, {mano:c.mano, agenda:c.agenda}) + '</td>';
    });
    tab += '<td class="anno">' + _objCella(rg.fattoAnno, rg.targetAnno, rg.pari.coperto ? rg.pari.valore : null, rg.statoAnno, euro, {}) + '</td></tr>';
  });
  tab += '</tbody></table>';

  var mese = '';
  if(a === o.anno){
    mese = '<h2>' + OBJ_MESI[o.mese-1] + ' ' + a + ': a che punto sono</h2><table class="lista">';
    X.righe.forEach(function(rg){
      var ind = objInd(rg.id), euro = !!ind.euro, c = rg.celle[o.mese-1];
      var gg = objGiorniMese(a, o.mese) - o.giorno, manca = objArr(c.target - c.fatto);
      var stato = c.target <= 0 ? 'nessun obiettivo' : (manca <= 0 ? 'centrato'
        : 'mancano ' + _objNum(manca, euro, true) + (gg > 0 ? ' in ' + gg + (gg === 1 ? ' giorno' : ' giorni') : ''));
      var succ = o.mese < 12 ? rg.celle[o.mese].target : null;
      mese += '<tr><td class="pn"><span class="pall" style="background:' + ind.col + '"></span>' + ind.nome + '</td>'
        + '<td class="num">' + _objNum(c.fatto, euro, true) + ' / ' + _objNum(c.target, euro, true) + '</td>'
        + '<td>' + stato + '</td>'
        + '<td class="num">' + (succ !== null ? OBJ_MESI[o.mese] + ': ' + _objNum(succ, euro, true) : '') + '</td></tr>';
    });
    mese += '</table>';
  }

  var regole = '<h2>Come nascono gli obiettivi ' + a + '</h2><table class="lista">'
    + X.righe.map(function(rg){
        var ind = objInd(rg.id);
        return '<tr><td class="pn"><span class="pall" style="background:' + ind.col + '"></span>' + ind.nome + '</td>'
          + '<td>' + _objTestoRegola(rg) + '</td><td class="num">anno: ' + _objNum(rg.targetAnno, !!ind.euro, true) + '</td>'
          + '<td class="fonte">' + ind.fonte + '</td></tr>';
      }).join('') + '</table>';

  var css = '@page{size:A4 landscape;margin:11mm}'
    + '*{box-sizing:border-box}'
    + 'body{font-family:Arial,Helvetica,sans-serif;color:#0F172A;font-size:10px;margin:0;padding:14px;'
    +   '-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + 'h1{font-size:21px;margin:0;letter-spacing:-.3px;text-transform:uppercase}'
    + '.testa{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0F172A;padding-bottom:6px;margin-bottom:10px}'
    + '.testa .dx{text-align:right;font-size:9.5px;color:#475569;line-height:1.5}'
    + '.testa .dx b{color:#0F172A;font-size:11px}'
    + 'h2{font-size:11.5px;margin:12px 0 5px;padding-bottom:3px;border-bottom:1.5px solid #1E3A8A;color:#1E3A8A}'
    + '.sint{width:100%;border-collapse:separate;border-spacing:6px 0;margin:0 -6px 8px}'
    + '.sint .box{border:1px solid #CBD5E1;border-radius:9px;padding:6px 9px;background:#F8FAFC;vertical-align:top}'
    + '.sint .et{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#475569}'
    + '.sint .val{font-size:15px;font-weight:800;margin-top:1px}'
    + '.sint .sot{font-size:8.5px;color:#475569}'
    + '.gr{width:100%;border-collapse:collapse;table-layout:fixed}'
    + '.gr th{font-size:8px;text-transform:uppercase;letter-spacing:.3px;color:#64748B;padding:4px 1px;border-bottom:1px solid #CBD5E1}'
    + '.gr th.sx{text-align:left;width:92px}'
    + '.gr th.ora{color:#0F172A;border-bottom:2px solid #0F172A}'
    + '.gr td{padding:2px;border-bottom:1px solid #E2E8F0;vertical-align:middle}'
    + '.gr td.anno{border-left:1px solid #CBD5E1}'
    + '.nome .n{font-weight:800;font-size:10px;display:flex;align-items:center;gap:5px}'
    + '.nome .r{font-size:7.5px;color:#64748B;margin-left:12px}'
    + '.pall{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle}'
    + '.nome .n .pall{margin-right:0}'
    + '.obj-c{border-radius:6px;padding:3px 1px;text-align:center;border:1px solid transparent;line-height:1.2}'
    + '.obj-c .v{font-size:11.5px;font-weight:800}'
    + '.obj-c .o{font-size:7.5px;color:#334155;font-weight:600}'
    + '.obj-c .p{font-size:7.2px;color:#64748B}'
    + '.obj-c .mk{display:inline-block;width:4px;height:4px;border-radius:50%;background:#64748B;vertical-align:super;margin-left:1px}'
    + '.obj-c.surplus{background:#E7EFEA;border-color:#A9C4B5}.obj-c.surplus .v{color:#0F5132}'
    + '.obj-c.linea{background:#F6ECE3;border-color:#E2BF9C}.obj-c.linea .v{color:#B45309}'
    + '.obj-c.deficit{background:#F3E6E6;border-color:#D5AFAF}.obj-c.deficit .v{color:#7F1D1D}'
    + '.obj-c.corso{border:1px dashed #64748B}'
    + '.obj-c.futuro .v{color:#1E3A8A}'
    + '.obj-c.neutro .v{color:#94A3B8;font-weight:600}'
    + '.leg{display:flex;gap:12px;flex-wrap:wrap;font-size:8px;color:#475569;margin:5px 0 0}'
    + '.leg i{display:inline-block;width:9px;height:9px;border-radius:3px;border:1px solid;margin-right:3px;vertical-align:middle}'
    + '.lista{width:100%;border-collapse:collapse}'
    + '.lista td{padding:3.5px 6px;border-bottom:1px solid #E2E8F0;font-size:9.5px}'
    + '.lista tr:nth-child(even) td{background:#F8FAFC}'
    + '.lista .pn{font-weight:800;white-space:nowrap;width:110px}'
    + '.lista .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}'
    + '.lista .fonte{color:#64748B;font-size:8.5px}'
    + '.due{display:flex;gap:16px}.due>div{flex:1;min-width:0}'
    + '.note{margin-top:10px;padding-top:5px;border-top:2px solid #0F172A;font-size:8.5px;color:#475569;line-height:1.6}'
    + '.noprint{display:flex;justify-content:flex-end;margin:-4px 0 10px}'
    + '.noprint button{font:600 13px Arial;padding:8px 14px;border-radius:8px;border:0;background:#1E3A8A;color:#fff;cursor:pointer}'
    + '@media print{.noprint{display:none}body{padding:0}}';

  var doc = '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Obiettivi ' + a + '</title>'
    + '<style>' + css + '</style></head><body>'
    + '<div class="noprint"><button onclick="window.print()">Stampa o salva in PDF</button></div>'
    + '<div class="testa"><h1>Obiettivi ' + a + ' <span style="color:#64748B;font-weight:600;font-size:14px;text-transform:none">contro il ' + (a-1) + '</span></h1>'
    + '<div class="dx">' + (X.nome ? '<b>' + _esc(X.nome) + '</b><br>' : '') + 'stampato il ' + new Date().toLocaleDateString('it-IT') + '</div></div>'
    + sint + tab
    + '<div class="leg"><span><i style="background:#E7EFEA;border-color:#A9C4B5"></i>centrato</span>'
    + '<span><i style="background:#F6ECE3;border-color:#E2BF9C"></i>vicino (dal ' + (objNum(X.cfg.sogliaLinea) || 90) + '%)</span>'
    + '<span><i style="background:#F3E6E6;border-color:#D5AFAF"></i>sotto</span>'
    + '<span><i style="border-color:#64748B;border-style:dashed"></i>mese in corso</span>'
    + '<span>in blu: obiettivo dei mesi da fare</span>'
    + '<span>sotto ogni numero: obiettivo e stesso periodo del ' + (a-1) + '</span></div>'
    + '<div class="due">' + (mese ? '<div>' + mese + '</div>' : '') + '<div>' + regole + '</div></div>'
    + (X.note.length ? '<div class="note">' + X.note.join('<br>') + '</div>' : '')
    + '</body></html>';

  var w = window.open('', '_blank');
  if(!w){ try{ dlgAlert('Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito.',''); }catch(e){} return; }
  w.document.write(doc); w.document.close();
};

window.objEsportaExcel = function(){
  if(typeof XLSX === 'undefined'){
    try{ dlgAlert('La libreria per i fogli di calcolo non è disponibile in questo momento.',''); }catch(e){}
    return;
  }
  var X;
  try{ X = _objDatiExport(); }catch(e){ console.warn('[Obiettivi] Excel KO:', e); return; }
  var a = X.a, o = X.ctx.oggi;
  var aoa = [], fmt = {};   // fmt: riga -> formato dei numeri di quella riga
  var EUR = '#,##0\\ "€"', PC = '0%', INT = '0';
  aoa.push(['Obiettivi ' + a + ' contro il ' + (a-1) + (X.nome ? ' — ' + X.nome : '')]);
  aoa.push(['Esportato il ' + new Date().toLocaleDateString('it-IT') + '. I mesi dopo oggi hanno solo l\'obiettivo.']);
  aoa.push([]);
  aoa.push(['Indicatore', 'Voce'].concat(OBJ_MESI3).concat(['Anno']));
  X.righe.forEach(function(rg){
    var ind = objInd(rg.id), euro = !!ind.euro, f = euro ? EUR : INT;
    var passato = function(m){ return a < o.anno || (a === o.anno && m <= o.mese); };
    var chiuso = function(m){ return a < o.anno || (a === o.anno && m < o.mese); };
    fmt[aoa.length] = f;
    aoa.push([ind.nome, 'Fatto ' + a].concat(rg.celle.map(function(c){ return passato(c.mese) ? c.fatto : ''; }))
             .concat([a <= o.anno ? rg.fattoAnno : '']));
    fmt[aoa.length] = f;
    aoa.push(['', 'Obiettivo ' + a].concat(rg.celle.map(function(c){ return c.target; })).concat([rg.targetAnno]));
    fmt[aoa.length] = f;
    aoa.push(['', rg.prec.coperto ? String(a-1) : (a-1) + ' (nessun dato)']
             .concat(rg.celle.map(function(c){ return rg.prec.coperto ? c.prima : ''; }))
             .concat([rg.prec.coperto ? objArr(rg.prec.fatto.reduce(function(x,y){ return x+y; }, 0)) : '']));
    fmt[aoa.length] = f;
    aoa.push(['', 'Scostamento dall\'obiettivo'].concat(rg.celle.map(function(c){
               return (chiuso(c.mese) && c.target > 0) ? objArr(c.fatto - c.target) : ''; }))
             .concat([a <= o.anno && rg.dovuto > 0 ? objArr(rg.fattoAnno - rg.dovuto) : '']));
    fmt[aoa.length] = PC;
    aoa.push(['', '% dell\'obiettivo'].concat(rg.celle.map(function(c){
               return (chiuso(c.mese) && c.target > 0) ? c.fatto / c.target : ''; }))
             .concat([a <= o.anno && rg.dovuto > 0 ? rg.fattoAnno / rg.dovuto : '']));
    aoa.push([]);
  });
  aoa.push(['Nella colonna Anno, scostamento e percentuale sono calcolati sull\'obiettivo dovuto a oggi (mesi chiusi più la parte del mese in corso).']);

  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:14},{wch:26}].concat(OBJ_MESI3.map(function(){ return {wch:9}; })).concat([{wch:11}]);
  Object.keys(ws).forEach(function(k){
    if(k[0] === '!') return;
    var c = XLSX.utils.decode_cell(k);
    if(ws[k] && typeof ws[k].v === 'number' && fmt[c.r]){ ws[k].t = 'n'; ws[k].z = fmt[c.r]; }
  });

  var aoa2 = [['Come nascono gli obiettivi ' + a], [], ['Indicatore', 'Regola', 'Obiettivo anno', 'Da dove arrivano i numeri']];
  X.righe.forEach(function(rg){
    var ind = objInd(rg.id);
    aoa2.push([ind.nome, _objTestoRegola(rg), rg.targetAnno, ind.fonte]);
  });
  if(X.note.length){ aoa2.push([]); aoa2.push(['Note']); X.note.forEach(function(n){ aoa2.push([n]); }); }
  var ws2 = XLSX.utils.aoa_to_sheet(aoa2);
  ws2['!cols'] = [{wch:14},{wch:58},{wch:15},{wch:62}];
  var gciRiga = 3 + OBJ_IND.length - 1;   // l'ultima riga degli indicatori è quella in euro
  var cg = XLSX.utils.encode_cell({r:gciRiga, c:2});
  if(ws2[cg] && typeof ws2[cg].v === 'number') ws2[cg].z = EUR;

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mese per mese');
  XLSX.utils.book_append_sheet(wb, ws2, 'Regole e note');
  try{
    XLSX.writeFile(wb, 'obiettivi-' + a + '.xlsx');
  }catch(e){
    console.warn('[Obiettivi] esportazione KO:', e);
    try{ dlgAlert('Non sono riuscito a creare il file.',''); }catch(e2){}
  }
};

/* ── finestra ──────────────────────────────────────────────────────────── */

window._objVaiVista = function(v){ _objVista = v; _objDisegna(); };
window._objVaiScala = function(s){ _objScala = s; _objDisegna(); };
window._objApri = function(id){ _objSel = id; _objDisegna(); };
window._objVaiStAnno = function(y){ _objStAnno = +y; _objDisegna(); };
window._objCambiaAnno = function(a){ _objAnno = +a; _objStAnno = null; _objDisegna(); };

window.chiudiObiettivi = function(){
  var w = document.getElementById('obj-wrap'); if(w) w.remove();
};

function _objDisegna(){
  var corpo = document.getElementById('obj-corpo');
  if(!corpo) return;
  _objCss();
  var R, righe, a = _objAnno;
  try{
    _objCtx = objContesto();
    R = objCalcola(a, _objCtx);
    var soglia = (objLeggi(a) || objPredefinito(a)).sogliaLinea;
    righe = OBJ_IND.map(function(ind){ return objRiga(ind.id, a, _objCtx, soglia); });
  } catch(e){
    console.warn('[Obiettivi] calcolo KO:', e);
    corpo.innerHTML = '<div style="padding:20px;color:var(--text2)">Non sono riuscito a calcolare i numeri.</div>';
    return;
  }
  var o = _objCtx.oggi;
  var anni = []; for(var y = o.anno-2; y <= o.anno+1; y++) anni.push(y);
  if(anni.indexOf(a) < 0) anni.push(a);

  var _nomeAg = '';
  try{ if(typeof getNomeAgenzia === 'function') _nomeAg = getNomeAgenzia() || ''; }catch(e){}
  var viste = [['panoramica','Panoramica',OBJ_T.blu],['regole','Regole ' + a,OBJ_T.ambra],['storico','Storico a mano',OBJ_T.ardesia]];
  var h = '<div class="gx-testa">'
    + '<span class="gx-tit" style="display:inline-flex;align-items:baseline;gap:10px">Obiettivi'
    +   '<select onchange="_objCambiaAnno(this.value)" style="font:inherit;font-size:1.3rem;font-weight:800;'
    +   'color:'+OBJ_T.blu+';border:0;border-bottom:2px solid '+OBJ_T.blu+';background:transparent;cursor:pointer;padding:0 4px">'
    +   anni.map(function(x){ return '<option value="'+x+'"'+(x===a?' selected':'')+'>'+x+'</option>'; }).join('')
    +   '</select></span>'
    + '<div class="gx-ling">' + viste.map(function(v){
        var on = _objVista === v[0];
        return '<button class="gx-l' + (on ? ' on' : '') + '" style="' + (on ? 'background:' + v[2] : '') + '" onclick="_objVaiVista(\'' + v[0] + '\')">'
          + '<span class="pall" style="background:' + v[2] + '"></span>' + v[1] + '</button>';
      }).join('') + '</div>'
    + '<div class="gx-destra">'
    +   (_nomeAg ? '<div class="a">'+_esc(_nomeAg)+'</div>' : '')
    +   '<div class="b">' + a + ' contro ' + (a-1) + ' · aggiornato al ' + new Date().toLocaleDateString('it-IT') + '</div>'
    +   '<div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px">'
    +     '<button class="gx-btn" onclick="objStampa()" title="Pagina A4 orizzontale da stampare o salvare in PDF">'
    +       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    +       'stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/>'
    +       '<path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>'
    +       '<rect x="6" y="14" width="12" height="8"/></svg>Stampa / PDF</button>'
    +     '<button class="gx-btn" onclick="objEsportaExcel()" title="File Excel con fatto, obiettivo e anno prima mese per mese">'
    +       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    +       'stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>'
    +       '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Excel</button>'
    +     '<button class="gx-btn" onclick="objResoconto()" title="Resoconto del mese appena chiuso">'
    +       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    +       'stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>'
    +       '<polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>'
    +       'Resoconto ' + OBJ_MESI[objMeseChiuso(o).mese-1].toLowerCase() + '</button>'
    +   '</div>'
    + '</div></div>';

  if(_objVista === 'regole'){
    h += _objRegole();
  } else if(_objVista === 'storico'){
    h += _objStorico();
  } else {
    var gci = righe[righe.length-1];
    var sel = righe.filter(function(r){ return r.id === _objSel; })[0] || righe[1];
    h += _objAvvisoPicco()
      + _objStriscia(R, gci)
      + _objGriglia(righe)
      + _objDettaglio(sel)
      + (a === o.anno ? _objPipeline(R) : '')
      + _objScarti(R);
    if(objNum(R.cfg.costiAnnui) > 0){
      h += '<div class="gx-info">'
        + 'Al netto dei costi stimati: <b style="color:var(--text)">'+_e(R.netto)+'</b> realizzato, '
        + 'su <b style="color:var(--text)">'+_e(R.nettoAtteso)+'</b> attesi a fine anno.</div>';
    }
  }
  corpo.innerHTML = h;
  if(_objVista === 'regole'){ try{ _objRicalcolaPesi(); _objAnteprimaRegole(); }catch(e){} }
}
window._objDisegnaPub = function(){ _objDisegna(); };

window.apriObiettivi = function(){
  chiudiObiettivi();
  _objAnno = objAnnoCorrente();
  _objVista = 'panoramica';
  _objStAnno = null;
  /* [17 set 2026] riquadro dello stile comune, se c'è */
  if(typeof window.gxPagina === 'function'){
    window.gxPagina('obj-wrap', 'Obiettivi & Business Plan', 'chiudiObiettivi()',
      '<div id="obj-corpo"></div>');
    _objDisegna();
    return;
  }
  var w = document.createElement('div');
  w.id = 'obj-wrap';
  w.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:9000;background:var(--bg);'
    + 'display:flex;flex-direction:column;overflow:hidden;transition:left .25s cubic-bezier(.4,0,.2,1)';
  w.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;'
    + 'background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0">'
    + '<button onclick="chiudiObiettivi()" class="btn btn-outline btn-sm" '
    + 'style="display:inline-flex;align-items:center;gap:6px">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/>'
    + '<polyline points="12 19 5 12 12 5"/></svg> Chiudi</button>'
    + '<div style="font-weight:800;color:var(--text);font-size:0.95rem">Obiettivi &amp; Business Plan</div></div>'
    + '<div style="flex:1;overflow:auto;padding:14px"><div id="obj-corpo" style="max-width:1400px;margin:0 auto"></div></div>';
  document.body.appendChild(w);
  try{ if(typeof window._ceSeguiMenu === 'function') window._ceSeguiMenu(w); }catch(e){}
  _objDisegna();
};

/* ── 6. DASHBOARD: SETTIMANA, AVVISO DI METÀ MESE, RESOCONTO ── [30 set 2026]
   Scelte di Enzo (30 set): 1) i numeri della settimana in Dashboard,
   3) avviso a metà mese se si è sotto il ritmo, 5) resoconto del mese chiuso.
   La settimana va da lunedì a domenica. L'obiettivo della settimana NON è il
   mese diviso quattro: è quanto manca al mese, diviso per le settimane che
   restano. Così una settimana storta si recupera nelle successive, e una
   buona alleggerisce le prossime.
   Si guardano i numeri di ATTIVITÀ: sono quelli che si governano in una
   settimana. Rogiti e provvigioni arrivano quando arrivano. */

var OBJ_SETT = ['valutazioni','incarichi','visite','proposte'];
var OBJ_GIORNI = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];

// il lunedì della settimana di una data
function objLunedi(dt){
  var d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  var g = d.getDay(); d.setDate(d.getDate() - (g === 0 ? 6 : g - 1));
  return d;
}

/* I conti della settimana per un indicatore. Il pezzo di settimana che cade
   nel mese prima non conta: l'obiettivo è quello del mese in corso. */
function objSettimana(id, ctx){
  var o = ctx.oggi, a = o.anno, m = o.mese, gg = objGiorniMese(a, m);
  var oggiD = new Date(a, m-1, o.giorno), lun = objLunedi(oggiD);
  var dal = (lun.getFullYear() === a && lun.getMonth() === m-1) ? lun.getDate() : 1;
  var cfg = objLeggi(a) || objPredefinito(a);
  var t = objTargetInd(id, a, ctx).mesi[m-1];
  var s = objSerie(id, a, ctx);
  var prima = 0, sett = 0;
  if(s.mano[m-1]){
    /* mese scritto a mano: non ci sono le date, si ripartisce in proporzione */
    prima = s.fatto[m-1] * (dal-1) / Math.max(1, o.giorno);
    sett = s.fatto[m-1] - prima;
  } else {
    (ctx.ev[id] || []).forEach(function(x){
      if(x.d.anno !== a || x.d.mese !== m || x.d.giorno > o.giorno) return;
      if(x.d.giorno < dal) prima += x.peso; else sett += x.peso;
    });
  }
  // settimane che restano da lunedì (o dal primo del mese) a fine mese
  var settimane = 1;
  for(var g = dal + 1; g <= gg; g++) if(new Date(a, m-1, g).getDay() === 1) settimane++;
  var serve = t > 0 ? objEccesso(Math.max(0, t - prima) / settimane) : 0;
  var fineSett = new Date(lun); fineSett.setDate(fineSett.getDate() + 6);
  return {id:id, target:t, fattoMese: objArr(prima + sett), prima: objArr(prima), sett: objArr(sett),
          serve: serve, settimane: settimane, lun: lun, dom: fineSett,
          dovuto: t * o.giorno / gg, soglia: objNum(cfg.sogliaLinea) || 90};
}

/* Metà mese: dal 15 in poi, chi è sotto il ritmo. Il ritmo è l'obiettivo del
   mese in proporzione ai giorni passati, con la stessa soglia della pagina. */
function objSottoRitmo(ctx){
  var o = ctx.oggi;
  if(o.giorno < 15) return [];
  return OBJ_SETT.map(function(id){ return objSettimana(id, ctx); }).filter(function(w){
    return w.target > 0 && w.fattoMese < w.target && (w.fattoMese / w.dovuto * 100) < w.soglia;
  });
}

// il mese da riassumere: quello appena chiuso
function objMeseChiuso(oggi){
  return oggi.mese === 1 ? {anno: oggi.anno - 1, mese: 12} : {anno: oggi.anno, mese: oggi.mese - 1};
}
function objResocontoVisto(anno, mese){
  var k = anno + '-' + String(mese).padStart(2, '0');
  var rec = objLeggi(anno);
  return !!(rec && Array.isArray(rec.resocontiVisti) && rec.resocontiVisti.indexOf(k) >= 0);
}
function objSegnaResoconto(anno, mese){
  var k = anno + '-' + String(mese).padStart(2, '0');
  var rec = objLeggi(anno);
  var arr = (rec && Array.isArray(rec.resocontiVisti)) ? rec.resocontiVisti.slice() : [];
  if(arr.indexOf(k) < 0){ arr.push(k); objAggiorna(anno, {resocontiVisti: arr}); }
}

window.objDashboard = function(){
  var box = document.getElementById('dash-obiettivi');
  if(!box || !window.D) return;
  _objCss();
  var ctx;
  try{ ctx = objContesto(); }catch(e){ console.warn('[Obiettivi] dashboard KO:', e); box.innerHTML = ''; return; }
  var o = ctx.oggi;
  var ws = OBJ_SETT.map(function(id){ return objSettimana(id, ctx); });
  var conObiettivo = ws.some(function(w){ return w.target > 0; });
  var fmtG = function(d){ return d.getDate() + ' ' + OBJ_MESI[d.getMonth()].slice(0,3).toLowerCase(); };

  // 5. resoconto del mese chiuso, finché non l'hai aperto
  var mc = objMeseChiuso(o), avvisoRes = '';
  if(!objResocontoVisto(mc.anno, mc.mese) && D.obiettivi && D.obiettivi.length){
    avvisoRes = '<div class="gx-info" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 16px 12px">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + OBJ_T.blu + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'
      + '<line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>'
      + '<span style="flex:1;min-width:180px"><b>Il resoconto di ' + OBJ_MESI[mc.mese-1].toLowerCase() + ' ' + mc.anno + ' è pronto:</b> '
      + 'fatto, obiettivo e stesso mese dell\'anno prima, da stampare o salvare in PDF.</span>'
      + '<button class="gx-btn" style="color:' + OBJ_T.blu + ';border-color:' + OBJ_T.blu + '" onclick="objResoconto(' + mc.anno + ',' + mc.mese + ')">Apri il resoconto</button>'
      + '<button class="gx-btn" onclick="_objResocontoVisto(' + mc.anno + ',' + mc.mese + ')">Già visto</button></div>';
  }

  // 3. sotto il ritmo a metà mese
  var sotto = conObiettivo ? objSottoRitmo(ctx) : [], avvisoRitmo = '';
  if(sotto.length){
    avvisoRitmo = '<div class="gx-info" style="border-color:' + OBJ_T.ambra + ';margin:0 16px 12px">'
      + '<b style="color:' + OBJ_T.ambra + '">Sei sotto il ritmo del mese</b> su '
      + sotto.map(function(w){
          return '<b>' + objInd(w.id).nome.toLowerCase() + '</b> (' + _objNum(w.fattoMese) + ' su '
            + _objNum(Math.max(1, Math.round(w.dovuto))) + ' previsti a oggi, obiettivo del mese ' + _objNum(w.target) + ')';
        }).join(', ')
      + (function(){ var r = objGiorniMese(o.anno, o.mese) - o.giorno;
          return r <= 0 ? '. Oggi è l\'ultimo giorno di ' + OBJ_MESI[o.mese-1].toLowerCase() + '.'
                        : '. ' + (r === 1 ? 'Manca 1 giorno' : 'Mancano ' + r + ' giorni') + ' alla fine di ' + OBJ_MESI[o.mese-1].toLowerCase() + '.'; })()
      + '</div>';
    /* una notifica al giorno per dispositivo, non a ogni ridisegno */
    try{
      var k = 'lecase_obj_avviso', oggiK = objIso(o);
      if(localStorage.getItem(k) !== oggiK){
        localStorage.setItem(k, oggiK);
        if(typeof showToast === 'function')
          showToast({title: 'Obiettivi: sotto il ritmo su ' + sotto.map(function(w){ return objInd(w.id).nome.toLowerCase(); }).join(', '),
                     body: 'guarda "Questa settimana" in Dashboard', variant: 'warning'},
                    function(){ try{ apriObiettivi(); }catch(e){} }, 'Apri');
      }
    }catch(e){}
  }

  var righe = ws.map(function(w){
    var ind = objInd(w.id), fatto = w.sett, serve = w.serve;
    var ok = serve > 0 && fatto >= serve;
    var perc = serve > 0 ? Math.min(100, fatto / serve * 100) : 0;
    var col = ok ? OBJ_T.verde : ind.col;
    var dx = serve > 0
      ? (ok ? '<span style="color:' + OBJ_T.verde + ';font-weight:800">fatto</span>'
            : 'mancano <b>' + _objNum(serve - fatto) + '</b>')
      : '<span style="color:var(--text3)">nessun obiettivo</span>';
    return '<div class="gx-riga" style="gap:10px">'
      + '<span class="pall" style="background:' + ind.col + ';align-self:center;margin:0"></span>'
      + '<div style="width:92px;flex-shrink:0" class="tt"><b>' + ind.nome + '</b></div>'
      + '<div style="flex:1;min-width:90px;height:8px;border-radius:5px;background:var(--bg3);border:1px solid var(--border);overflow:hidden">'
      +   '<div style="height:100%;width:' + perc + '%;background:' + col + '"></div></div>'
      + '<div class="gx-num" style="width:58px;font-weight:800;color:var(--text)">' + _objNum(fatto)
      +   (serve > 0 ? '<span style="color:var(--text3);font-weight:600"> / ' + _objNum(serve) + '</span>' : '') + '</div>'
      + '<div class="sub" style="width:118px;text-align:right">' + dx + '</div>'
      + '<div class="sub" style="width:120px;text-align:right" title="obiettivo del mese">mese: ' + _objNum(w.fattoMese)
      +   (w.target > 0 ? ' / ' + _objNum(w.target) : '') + '</div>'
      + '</div>';
  }).join('');

  var w0 = ws[0];
  var testa = '<div class="gx-head" style="color:' + OBJ_T.blu + '"><div class="t">Questa settimana</div>'
    + '<div class="s">da ' + OBJ_GIORNI[1] + ' ' + fmtG(w0.lun) + ' a domenica ' + fmtG(w0.dom)
    + ' · quanto manca al mese diviso per le ' + w0.settimane + (w0.settimane === 1 ? ' settimana che resta' : ' settimane che restano') + '</div>'
    + '<button class="gx-btn" onclick="apriObiettivi()">Obiettivi</button></div>';
  var vuoto = conObiettivo ? '' : '<div class="gx-riga"><div class="sub">Per ' + OBJ_MESI[o.mese-1].toLowerCase()
    + ' non c\'è ancora nessun obiettivo: si fissa in Obiettivi, linguetta "Regole ' + o.anno + '". '
    + 'Intanto vedi quanto hai fatto.</div></div>';

  box.innerHTML = '<div class="gx-col" style="margin-bottom:22px">' + testa
    + '<div style="padding-top:12px">' + avvisoRes + avvisoRitmo + '</div>' + vuoto + righe + '</div>';
};

window._objResocontoVisto = function(anno, mese){
  objSegnaResoconto(anno, mese);
  try{ objDashboard(); }catch(e){}
};

/* Il resoconto di un mese chiuso: pagina A4 verticale da stampare o salvare
   in PDF. Aprirlo lo segna come visto, così l'avviso in Dashboard sparisce. */
window.objResoconto = function(anno, mese){
  var ctx = objContesto(), o = ctx.oggi;
  if(!anno || !mese){ var mc = objMeseChiuso(o); anno = mc.anno; mese = mc.mese; }
  anno = +anno; mese = +mese;
  var cfg = objLeggi(anno) || objPredefinito(anno);
  var soglia = objNum(cfg.sogliaLinea) || 90;
  var righe = OBJ_IND.map(function(ind){ return objRiga(ind.id, anno, ctx, soglia); });
  var nome = '';
  try{ if(typeof getNomeAgenzia === 'function') nome = getNomeAgenzia() || ''; }catch(e){}
  var nomeMese = OBJ_MESI[mese-1];

  var bene = [], male = [], tab = '';
  righe.forEach(function(rg){
    var ind = objInd(rg.id), euro = !!ind.euro, c = rg.celle[mese-1];
    var pc = c.target > 0 ? Math.round(c.fatto / c.target * 100) : null;
    var st = c.target > 0 ? objValuta(c.fatto, c.target, soglia).fascia : 'neutro';
    var yF = 0, yT = 0, yP = 0;
    for(var m = 1; m <= mese; m++){ yF += rg.celle[m-1].fatto; yT += rg.celle[m-1].target; yP += rg.celle[m-1].prima; }
    var dPrima = rg.prec.coperto ? objArr(c.fatto - c.prima) : null;
    if(c.target > 0){ if(st === 'surplus') bene.push(ind.nome.toLowerCase()); else if(st === 'deficit') male.push(ind.nome.toLowerCase()); }
    var col = {surplus:'#0F5132', linea:'#B45309', deficit:'#7F1D1D'}[st] || '#0F172A';
    var succ = mese < 12 ? rg.celle[mese].target : objTargetInd(rg.id, anno + 1, ctx).mesi[0];
    tab += '<tr><td class="pn"><span class="pall" style="background:' + ind.col + '"></span>' + ind.nome + '</td>'
      + '<td class="num" style="color:' + col + ';font-weight:800">' + _objNum(c.fatto, euro, true) + '</td>'
      + '<td class="num">' + (c.target > 0 ? _objNum(c.target, euro, true) : '—') + '</td>'
      + '<td class="num" style="color:' + col + '">' + (pc !== null ? pc + '%' : '—') + '</td>'
      + '<td class="num">' + (rg.prec.coperto ? _objNum(c.prima, euro, true) : '—') + '</td>'
      + '<td class="num" style="color:' + (dPrima === null ? '#64748B' : (dPrima >= 0 ? '#0F5132' : '#7F1D1D')) + '">'
      +   (dPrima === null ? '—' : _objSegno(dPrima, euro)) + '</td>'
      + '<td class="num">' + _objNum(yF, euro, true) + (yT > 0 ? ' / ' + _objNum(yT, euro, true) : '') + '</td>'
      + '<td class="num">' + (rg.prec.coperto ? _objNum(yP, euro, true) : '—') + '</td>'
      + '<td class="num" style="color:#1E3A8A;font-weight:700">' + (succ > 0 ? _objNum(succ, euro, true) : '—') + '</td></tr>';
  });
  var frasi = [];
  if(bene.length) frasi.push('<b style="color:#0F5132">Centrati:</b> ' + bene.join(', ') + '.');
  if(male.length) frasi.push('<b style="color:#7F1D1D">Sotto l\'obiettivo:</b> ' + male.join(', ') + '.');
  if(!bene.length && !male.length) frasi.push('Per questo mese non c\'erano obiettivi fissati: il resoconto confronta solo con l\'anno prima.');
  var prossimo = mese < 12 ? OBJ_MESI[mese] : 'Gennaio ' + (anno + 1);

  var css = '@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}'
    + 'body{font-family:Arial,Helvetica,sans-serif;color:#0F172A;font-size:10.5px;margin:0;padding:16px;'
    +   '-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + '.testa{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0F172A;padding-bottom:7px;margin-bottom:12px}'
    + 'h1{font-size:21px;margin:0;text-transform:uppercase;letter-spacing:-.3px}'
    + '.dx{text-align:right;font-size:9.5px;color:#475569;line-height:1.5}.dx b{color:#0F172A;font-size:11px}'
    + '.sint{background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:9px 12px;margin-bottom:12px;line-height:1.7}'
    + 'table{width:100%;border-collapse:collapse}'
    + 'th{font-size:8px;text-transform:uppercase;letter-spacing:.3px;color:#64748B;text-align:right;padding:5px 5px;border-bottom:1.5px solid #1E3A8A}'
    + 'th.sx{text-align:left}'
    + 'td{padding:6px 5px;border-bottom:1px solid #E2E8F0}'
    + 'tr:nth-child(even) td{background:#F8FAFC}'
    + '.pn{font-weight:800;white-space:nowrap}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}'
    + '.pall{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:middle}'
    + '.grp th{border-bottom:0;color:#1E3A8A;text-align:center;padding-bottom:0}'
    + '.note{margin-top:12px;padding-top:6px;border-top:2px solid #0F172A;font-size:8.5px;color:#475569;line-height:1.6}'
    + '.noprint{display:flex;justify-content:flex-end;margin:-6px 0 10px}'
    + '.noprint button{font:600 13px Arial;padding:8px 14px;border-radius:8px;border:0;background:#1E3A8A;color:#fff;cursor:pointer}'
    + '@media print{.noprint{display:none}body{padding:0}}';
  var doc = '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Resoconto ' + nomeMese + ' ' + anno + '</title>'
    + '<style>' + css + '</style></head><body>'
    + '<div class="noprint"><button onclick="window.print()">Stampa o salva in PDF</button></div>'
    + '<div class="testa"><h1>Resoconto di ' + nomeMese + ' ' + anno + '</h1>'
    + '<div class="dx">' + (nome ? '<b>' + _esc(nome) + '</b><br>' : '') + 'preparato il ' + new Date().toLocaleDateString('it-IT') + '</div></div>'
    + '<div class="sint">' + frasi.join('<br>') + '</div>'
    + '<table><thead>'
    + '<tr class="grp"><th></th><th colspan="5">' + nomeMese + '</th><th colspan="2">Da gennaio a ' + nomeMese.toLowerCase() + '</th><th></th></tr>'
    + '<tr><th class="sx">Indicatore</th><th>Fatto</th><th>Obiettivo</th><th>%</th><th>' + nomeMese.slice(0,3) + ' ' + (anno-1) + '</th><th>Differenza</th>'
    + '<th>Fatto / obiettivo</th><th>' + (anno-1) + '</th><th>Obiettivo ' + prossimo.toLowerCase() + '</th></tr></thead><tbody>'
    + tab + '</tbody></table>'
    + '<div class="note">Differenza: ' + nomeMese.toLowerCase() + ' ' + anno + ' meno ' + nomeMese.toLowerCase() + ' ' + (anno-1)
    + '. Colori: verde centrato, ambra vicino (dal ' + soglia + '%), rosso sotto. Un trattino vuol dire che il dato non c\'è.'
    + (ctx.fino ? '<br>Incarichi: esclusi ' + ctx.esclusi.length + ' iniziati entro il ' + objDataIt(ctx.fino) + ' (portafoglio caricato all\'inizio).' : '')
    + '</div></body></html>';

  var w = window.open('', '_blank');
  if(!w){ try{ dlgAlert('Il browser ha bloccato la finestra del resoconto. Consenti i popup per questo sito.',''); }catch(e){} return; }
  w.document.write(doc); w.document.close();
  objSegnaResoconto(anno, mese);
  try{ objDashboard(); }catch(e){}
};

/* il modulo può arrivare dopo il primo disegno della Dashboard */
try{ setTimeout(function(){ try{ objDashboard(); }catch(e){} }, 0); }catch(e){}

/* esposte per la Console, utili per controllare i conti senza aprire la pagina */
window.objCalcolaObiettivi = objCalcola;
window.objEstraiIncassi = objEstraiIncassi;
/* [30 set 2026] la griglia di un anno in Console: objGrigliaConsole(2027) */
window.objGrigliaConsole = function(anno){
  var ctx = objContesto(), a = +anno || objAnnoCorrente();
  var soglia = (objLeggi(a) || objPredefinito(a)).sogliaLinea;
  var t = {};
  OBJ_IND.forEach(function(ind){
    var rg = objRiga(ind.id, a, ctx, soglia), r = {};
    rg.celle.forEach(function(c){ r[OBJ_MESI3[c.mese-1]] = _objNum(c.fatto, ind.euro, false) + ' / ' + _objNum(c.target, ind.euro, false); });
    r.Anno = _objNum(rg.fattoAnno, ind.euro, false) + ' / ' + _objNum(rg.targetAnno, ind.euro, false);
    t[ind.nome] = r;
  });
  console.log('[Obiettivi] ' + a + ' — ogni casella: fatto / obiettivo');
  console.table(t);
  return t;
};

})();
