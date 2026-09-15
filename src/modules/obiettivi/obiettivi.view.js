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

/* ── 4. CALCOLO COMPLETO PER LA VISTA ──────────────────────────────────── */

function objCalcola(anno){
  var cfg = objLeggi(anno) || objPredefinito(anno);
  var E = objEstraiIncassi((window.D && D.provvigioni) || [], null);
  var d = new Date();
  var oggi = {anno:d.getFullYear(), mese:d.getMonth()+1, giorno:d.getDate()};
  var R = objRiepilogo({anno:anno, targetAnno:cfg.targetAnno, incassi:E.incassi,
                        oggi:oggi, sogliaLinea:cfg.sogliaLinea, pesi:cfg.stagionalita});
  R.cfg = cfg; R.incassi = E.incassi; R.scarti = E.scarti;

  // Funnel: quante vendite/incarichi/valutazioni servono per il target.
  var pm = objNum(cfg.provvMedia);
  var vi = objNum(cfg.valutazioniPerIncarico) || 0;
  var iv = objNum(cfg.incarichiPerVendita) || 0;
  var venditeServ = pm > 0 ? Math.ceil(objNum(cfg.targetAnno)/pm) : null;
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
    var manca = objArr(objNum(cfg.targetAnno) - R.realeAnno);
    var gAnno = objGiorniAnno(anno);
    var trascorsi = (oggi.anno === anno) ? R.runRate.giorni : (oggi.anno > anno ? gAnno : 0);
    var restano = Math.max(0, gAnno - trascorsi);
    var mesiRest = objArr(restano/gAnno*12);
    var vend = (pm > 0 && manca > 0) ? Math.ceil(manca/pm) : (manca > 0 ? null : 0);
    var ritmoTenuto = (trascorsi > 0) ? objArr(R.realeAnno/(trascorsi/gAnno*12)) : null;
    var ritmoServe  = (mesiRest > 0 && manca > 0) ? objArr(manca/mesiRest) : null;
    return {
      manca: manca, raggiunto: (manca <= 0 && objNum(cfg.targetAnno) > 0),
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
    var manca = objNum(cfg.targetAnno) - R.realeAnno;
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
  R.nettoAtteso = objArr(objNum(cfg.targetAnno) - objNum(cfg.costiAnnui));
  return R;
}

/* ── 5. INTERFACCIA ────────────────────────────────────────────────────── */

var _objTab = 'trimestrale';
var _objAnno = objAnnoCorrente();

function _e(n){
  if(n === null || n === undefined) return '—';
  try{ if(typeof fmtEuro === 'function') return fmtEuro(n); }catch(e){}
  return '€ ' + Number(n).toLocaleString('it-IT', {maximumFractionDigits:0});
}
function _esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

var OBJ_COLORI = {
  surplus:{bg:'#DCFCE7', bd:'#86EFAC', tx:'#15803D', et:'Surplus'},
  linea:  {bg:'#FEF9C3', bd:'#FDE68A', tx:'#A16207', et:'In linea'},
  deficit:{bg:'#FEE2E2', bd:'#FECACA', tx:'#B91C1C', et:'Deficit'},
  neutro: {bg:'var(--bg2)', bd:'var(--border)', tx:'var(--text2)', et:'Non iniziato'}
};

function _objPillola(f){
  var c = OBJ_COLORI[f] || OBJ_COLORI.neutro;
  return '<span style="display:inline-block;padding:2px 9px;border-radius:99px;font-size:0.72rem;'
    + 'font-weight:800;background:'+c.bg+';color:'+c.tx+';border:1px solid '+c.bd+'">'+c.et+'</span>';
}


/* [14 set 2026] LA CURVA CUMULATA, in SVG scritto a mano.
   Niente libreria: Chart.js non è caricato nell'index (_anEnsureChart non
   esiste) e per due linee non vale la pena dipendere dalla rete — sul
   telefono offline non arriverebbe.
   Tre tracce: obiettivo che sale dritto, realizzato a gradini fino a oggi,
   e da lì la proiezione tratteggiata al ritmo tenuto finora. */
function _objGrafico(R){
  var W=720, H=290, pL=64, pR=16, pT=14, pB=30;
  var tm=R.targetMensile, cm=R.consuntivoMensile, i;
  var cumT=[], cumR=[], a=0, b=0;
  for(i=0;i<12;i++){ a+=tm[i]; cumT.push(objArr(a)); b+=cm[i]; cumR.push(objArr(b)); }

  // fin dove ha senso disegnare il realizzato: oltre il mese in corso non
  // c'è ancora nulla, e una linea piatta farebbe sembrare l'anno finito
  var d=new Date(), fino=11, proietta=false;
  if(d.getFullYear()===R.anno){ fino=d.getMonth(); proietta=(R.runRate.valore!=null); }
  else if(d.getFullYear()<R.anno){ fino=-1; }

  var pre=(R.precedente && R.precedente.esiste) ? R.precedente : null;
  var maxY=Math.max(cumT[11], cumR[fino>=0?fino:0], proietta?R.runRate.valore:0,
                    pre?pre.totale:0, 1);
  maxY=maxY*1.06;
  var X=function(k){ return pL + k*(W-pL-pR)/11; };
  var Y=function(v){ var y=H-pB-(objNum(v)/maxY)*(H-pT-pB); return isFinite(y)?objArr(y):(H-pB); };

  var g='';
  // griglia orizzontale e valori sull'asse
  for(i=0;i<=4;i++){
    var val=maxY*i/4, y=Y(val);
    g+='<line x1="'+pL+'" y1="'+y+'" x2="'+(W-pR)+'" y2="'+y+'" stroke="var(--border)" stroke-width="1"'
      +(i?' stroke-dasharray="3 4"':'')+'/>'
      +'<text x="'+(pL-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="10" fill="var(--text3)">'
      + (val>=1000 ? Math.round(val/1000)+'k' : Math.round(val)) + '</text>';
  }
  // mesi
  for(i=0;i<12;i++){
    g+='<text x="'+X(i)+'" y="'+(H-10)+'" text-anchor="middle" font-size="9" fill="var(--text3)">'
      + OBJ_MESI[i].slice(0,1) + '</text>';
  }
  // anno precedente, sotto a tutto: è un riferimento, non un protagonista
  if(pre){
    var pp=[]; for(i=0;i<12;i++) pp.push(X(i)+','+Y(pre.cumulato[i]));
    g+='<polyline points="'+pp.join(' ')+'" fill="none" stroke="#94A3B8" stroke-width="2" opacity="0.55"/>';
  }
  // obiettivo
  var pt=[]; for(i=0;i<12;i++) pt.push(X(i)+','+Y(cumT[i]));
  g+='<polyline points="'+pt.join(' ')+'" fill="none" stroke="var(--text3)" stroke-width="2" stroke-dasharray="5 4"/>';

  // realizzato
  if(fino>=0){
    var pr=[]; for(i=0;i<=fino;i++) pr.push(X(i)+','+Y(cumR[i]));
    var col=(OBJ_COLORI[R.livelli.annuale[0].fascia]||OBJ_COLORI.neutro).tx;
    // area sotto la curva, leggera
    g+='<polygon points="'+X(0)+','+Y(0)+' '+pr.join(' ')+' '+X(fino)+','+Y(0)+'" fill="'+col+'" opacity="0.08"/>';
    g+='<polyline points="'+pr.join(' ')+'" fill="none" stroke="'+col+'" stroke-width="2.5" stroke-linejoin="round"/>';
    g+='<circle cx="'+X(fino)+'" cy="'+Y(cumR[fino])+'" r="4" fill="'+col+'"/>';
    if(proietta){
      g+='<polyline points="'+X(fino)+','+Y(cumR[fino])+' '+X(11)+','+Y(R.runRate.valore)+'" '
        +'fill="none" stroke="'+col+'" stroke-width="2" stroke-dasharray="4 5" opacity="0.65"/>'
        +'<circle cx="'+X(11)+'" cy="'+Y(R.runRate.valore)+'" r="3.5" fill="none" stroke="'+col+'" stroke-width="2"/>';
    }
  }

  var leg=function(c,t,tratto){
    return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:0.74rem;color:var(--text2)">'
      + '<svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="'+c+'" stroke-width="2.5"'
      + (tratto?' stroke-dasharray="4 3"':'') + '/></svg>' + t + '</span>';
  };
  var colR=(OBJ_COLORI[R.livelli.annuale[0].fascia]||OBJ_COLORI.neutro).tx;
  return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;'
    + 'padding:12px 14px;margin-bottom:14px">'
    + '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px">'
    +   leg('var(--text3)','Obiettivo',true) + leg(colR,'Realizzato',false)
    +   (proietta ? leg(colR,'Proiezione',true) : '')
    +   (pre ? leg('#94A3B8', String(pre.anno), false) : '')
    + '</div>'
    + '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block" '
    + 'preserveAspectRatio="xMidYMid meet">' + g + '</svg></div>';
}

function _objKpi(R){
  var rr = R.runRate;
  var card = function(tit, val, sot, col){
    return '<div style="flex:1;min-width:150px;background:var(--bg2);border:1px solid var(--border);'
      + 'border-radius:12px;padding:12px 14px">'
      + '<div style="font-size:0.72rem;font-weight:700;color:var(--text2);text-transform:uppercase;'
      + 'letter-spacing:.4px">'+tit+'</div>'
      + '<div style="font-size:1.35rem;font-weight:800;color:'+(col||'var(--text)')+';margin-top:3px">'+val+'</div>'
      + '<div style="font-size:0.74rem;color:var(--text2);margin-top:2px">'+sot+'</div></div>';
  };
  var a = R.livelli.annuale[0];
  var colRR = (rr.valore != null && rr.valore >= R.targetAnno) ? '#15803D' : '#B91C1C';
  return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
    + card('Obiettivo '+R.anno, _e(R.targetAnno), 'GCI lordo')
    + card('Realizzato', _e(R.realeAnno), a.perc!=null ? a.perc+'% del dovuto a oggi' : 'nessun obiettivo fissato',
           OBJ_COLORI[a.fascia].tx)
    + card('Dovuto a oggi', _e(R.targetMaturato), 'quota di obiettivo maturata')
    + card('Proiezione dicembre', rr.valore!=null ? _e(rr.valore) : '—',
           rr.attendibile ? 'al ritmo tenuto finora' : 'troppo presto per essere attendibile',
           rr.attendibile ? colRR : 'var(--text2)')
    + '</div>';
}

function _objLinguette(){
  var v = [['mensile','Mensile'],['trimestrale','Trimestrale'],
           ['semestrale','Semestrale'],['annuale','Annuale']];
  return '<div class="simm-tabs" style="margin-bottom:12px">'
    + v.map(function(x){
        return '<button class="simm-tab'+(_objTab===x[0]?' attivo':'')+'" '
          + 'onclick="_objVaiTab(\''+x[0]+'\')">'+x[1]+'</button>';
      }).join('') + '</div>';
}

function _objTabella(R){
  var righe = R.livelli[_objTab] || [];
  var h = '<div style="overflow:auto;border:1px solid var(--border);border-radius:12px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:0.86rem">'
    + '<thead><tr style="background:var(--bg2)">'
    + ['Periodo','Obiettivo','Dovuto a oggi','Realizzato','Scostamento','']
        .map(function(t,i){
          return '<th style="padding:9px 12px;text-align:'+(i===0?'left':(i===5?'center':'right'))
            + ';font-size:0.72rem;text-transform:uppercase;letter-spacing:.4px;color:var(--text2);'
            + 'border-bottom:1px solid var(--border);white-space:nowrap">'+t+'</th>';
        }).join('') + '</tr></thead><tbody>';
  righe.forEach(function(r){
    var c = OBJ_COLORI[r.fascia] || OBJ_COLORI.neutro;
    var gapTxt = r.fascia === 'neutro' ? '—'
      : (r.gap >= 0 ? '+' : '') + _e(r.gap) + (r.perc != null ? ' <span style="opacity:.7">('+r.perc+'%)</span>' : '');
    h += '<tr style="border-bottom:1px solid var(--border)">'
      + '<td style="padding:9px 12px;font-weight:700;white-space:nowrap">'+_esc(r.etichetta)+'</td>'
      + '<td style="padding:9px 12px;text-align:right;color:var(--text2)">'+_e(r.target)+'</td>'
      + '<td style="padding:9px 12px;text-align:right;color:var(--text2)">'+_e(r.targetDovuto)+'</td>'
      + '<td style="padding:9px 12px;text-align:right;font-weight:800">'+_e(r.reale)+'</td>'
      + '<td style="padding:9px 12px;text-align:right;color:'+c.tx+';font-weight:700">'+gapTxt+'</td>'
      + '<td style="padding:9px 12px;text-align:center">'+_objPillola(r.fascia)+'</td></tr>';
  });
  h += '</tbody></table></div>';
  if(_objTab === 'mensile'){
    var _conPesi = !!objPesiValidi(R.cfg && R.cfg.stagionalita);
    h += '<div style="font-size:0.76rem;color:var(--text2);margin-top:8px;line-height:1.5">'
      + (_conPesi
          ? 'I mesi sono pesati secondo la distribuzione che hai impostato.'
          : 'L\'obiettivo è diviso in dodici parti uguali. Se il tuo lavoro è a ondate, '
            + 'imposta la distribuzione sui mesi: qui trovi il pulsante "Modifica obiettivi".')
      + '</div>';
  }
  return h;
}

/* [14 set 2026] "Ce la faccio con quello che ho in mano": una barra sola,
   dall'incassato al portafoglio, con la parte scoperta in fondo. */
function _objPipeline(R){
  var P = R.pipeline, t = objNum(R.cfg.targetAnno);
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
    verdetto = '<div style="color:#15803D;font-weight:800;font-size:0.92rem">'
      + 'Quello che hai già in mano basta a centrare l\'obiettivo</div>'
      + '<div style="font-size:0.82rem;color:var(--text2);margin-top:2px">'
      + 'Incassato più le proposte accettate: ' + _e(P.conPipeline) + ' su ' + _e(t) + '.</div>';
  } else if(P.scoperto <= 0){
    verdetto = '<div style="color:#A16207;font-weight:800;font-size:0.92rem">'
      + 'Ci arrivi solo se tengono anche le trattative aperte</div>'
      + '<div style="font-size:0.82rem;color:var(--text2);margin-top:2px">'
      + 'Con tutto quello che è in corso saresti a ' + _e(P.conTutto)
      + '; senza le proposte ancora da chiudere ti fermi a ' + _e(P.conPipeline) + '.</div>';
  } else {
    verdetto = '<div style="color:#B91C1C;font-weight:800;font-size:0.92rem">'
      + 'Mancano ' + _e(P.scoperto) + ' che oggi non sono in nessuna trattativa</div>'
      + '<div style="font-size:0.82rem;color:var(--text2);margin-top:2px">'
      + 'Sommando incassato, proposte accettate e trattative aperte arrivi a ' + _e(P.conTutto)
      + '. Il resto sono affari da trovare.</div>';
  }

  var tacca = (P.conTutto > t)
    ? '<div style="position:absolute;left:'+(t/base*100)+'%;top:-3px;bottom:-3px;width:2px;'
      + 'background:var(--text);opacity:.55" title="obiettivo"></div>' : '';

  return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;'
    + 'padding:14px 16px;margin-bottom:14px">'
    + '<div style="font-size:0.72rem;font-weight:700;color:var(--text2);text-transform:uppercase;'
    + 'letter-spacing:.4px;margin-bottom:6px">Ce la faccio con quello che ho</div>'
    + verdetto
    + '<div style="position:relative;margin:12px 0 8px">'
    +   '<div style="display:flex;height:18px;border-radius:6px;overflow:hidden;background:var(--bg3);'
    +   'border:1px solid var(--border)">'
    +     seg(R.realeAnno, '#15803D', 'incassato')
    +     seg(P.maturato.tot, '#3B82F6', 'rogitato, da incassare')
    +     seg(P.accettate.tot, '#1D4ED8', 'proposte accettate')
    +     seg(P.inCorso.tot, '#D97706', 'trattative aperte')
    +   '</div>' + tacca + '</div>'
    + '<div style="display:flex;gap:12px;flex-wrap:wrap">'
    +   voce('#15803D','Incassato', R.realeAnno, 'già in cassa')
    +   voce('#3B82F6','Da incassare', P.maturato.tot, P.maturato.quante+' rogitate')
    +   voce('#1D4ED8','Accettate', P.accettate.tot, P.accettate.quante+' in attesa di rogito')
    +   voce('#D97706','In trattativa', P.inCorso.tot, P.inCorso.quante+' proposte aperte')
    + '</div>'
    + '<div style="font-size:0.74rem;color:var(--text3);margin-top:10px;line-height:1.5">'
    + 'In portafoglio ci sono altri ' + _e(P.portafoglio.tot) + ' di incarichi senza proposta ('
    + P.portafoglio.quante + '): non li conto qui perché non si vendono tutti.'
    + (P.scartate > 0 ? ' ' + P.scartate + ' voci escluse perché già conteggiate nell\'incassato.' : '')
    + '</div></div>';
}

/* [14 set 2026] Il confronto con l'anno prima, sempre a PARI DATA. */
function _objConfronto(R){
  var p = R.precedente;
  if(!p) return '';
  if(!p.esiste){
    return '<div style="font-size:0.78rem;color:var(--text3);margin-bottom:14px;line-height:1.5">'
      + 'Nessuna provvigione registrata nel ' + p.anno + ': non c\'è ancora un anno da confrontare.</div>';
  }
  var segno = '', col = 'var(--text2)', testo;
  if(p.deltaPerc === null){
    testo = 'Nel ' + p.anno + ' a quest\'altezza non risultava ancora nulla; l\'anno si chiuse a ' + _e(p.totale) + '.';
  } else {
    segno = p.delta >= 0 ? '+' : '';
    col = p.delta >= 0 ? '#15803D' : '#B91C1C';
    testo = 'Alla stessa data del ' + p.anno + ' eri a ' + _e(p.aPariData)
      + ' — <b style="color:' + col + '">' + segno + _e(p.delta) + ' (' + segno
      + String(p.deltaPerc).replace('.', ',') + '%)</b>. Quell\'anno si chiuse a ' + _e(p.totale)
      + (p.obiettivo ? ', su un obiettivo di ' + _e(p.obiettivo) : '') + '.';
  }
  return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;'
    + 'padding:10px 14px;margin-bottom:14px;font-size:0.84rem;color:var(--text2);line-height:1.6">'
    + testo + '</div>';
}

function _objPasso(n, tit, sot, col){
  return '<div style="flex:1;min-width:130px;text-align:center;padding:12px 8px;'
    + 'background:var(--bg2);border:1px solid var(--border);border-radius:12px">'
    + '<div style="font-size:1.5rem;font-weight:800;color:'+(col||'var(--brand)')+'">'+n+'</div>'
    + '<div style="font-size:0.78rem;font-weight:700;margin-top:2px">'+tit+'</div>'
    + '<div style="font-size:0.72rem;color:var(--text2)">'+sot+'</div></div>';
}

/* [14 set 2026] Quanto manca, tradotto in affari e in ritmo. È la domanda
   che ci si fa davvero a metà anno; il funnel sull'anno intero resta sotto,
   come riferimento. */
function _objResiduo(R){
  var r = R.residuo, f = R.funnel;
  if(!r || objNum(R.cfg.targetAnno) <= 0) return '';

  if(r.raggiunto){
    return '<div style="background:#DCFCE7;border:1px solid #86EFAC;border-radius:12px;padding:16px">'
      + '<div style="font-weight:800;color:#15803D;font-size:1rem">Obiettivo raggiunto</div>'
      + '<div style="font-size:0.88rem;color:#15803D;margin-top:4px">Hai superato l\'obiettivo di '
      + _e(r.oltre) + (r.giorni > 0 ? ', con ' + r.giorni + ' giorni ancora davanti' : '') + '.</div></div>';
  }
  if(!r.annoInCorso){
    return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;'
      + 'padding:14px;font-size:0.86rem;color:var(--text2)">Mancavano ' + _e(r.manca)
      + ' all\'obiettivo di quell\'anno.</div>';
  }

  var testaRitmo = '';
  if(r.ritmoServe != null){
    var m = r.moltiplicatore;
    var colM = (m == null) ? 'var(--text2)' : (m <= 1 ? '#15803D' : (m <= 1.5 ? '#A16207' : '#B91C1C'));
    testaRitmo = '<div style="margin-top:10px;font-size:0.86rem;color:var(--text2);line-height:1.6">'
      + 'Servono <b style="color:var(--text)">' + _e(r.ritmoServe) + ' al mese</b>'
      + (r.ritmoTenuto != null ? ', contro i ' + _e(r.ritmoTenuto) + ' tenuti finora' : '')
      + (m != null
          ? ' — <b style="color:' + colM + '">'
            + (m <= 1 ? 'basta il ritmo attuale' : m.toFixed(1).replace('.', ',') + ' volte il ritmo attuale')
            + '</b>'
          : '')
      + '.</div>';
  }

  var riquadri = (r.vendite == null)
    ? '<div style="font-size:0.86rem;color:var(--text2);margin-top:10px">Indica la provvigione media '
      + 'per vedere quante vendite servono.</div>'
    : '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">'
      + _objPasso(r.valutazioni != null ? r.valutazioni : '—', 'Valutazioni', 'da fare')
      + _objPasso(r.incarichi != null ? r.incarichi : '—', 'Incarichi', 'da acquisire')
      + _objPasso(r.vendite, 'Vendite', 'da chiudere')
      + '</div>';

  return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px">'
    + '<div style="font-size:0.72rem;font-weight:700;color:var(--text2);text-transform:uppercase;'
    + 'letter-spacing:.4px">Da qui a fine anno</div>'
    + '<div style="font-size:1.5rem;font-weight:800;margin-top:3px">' + _e(r.manca)
    + ' <span style="font-size:0.86rem;font-weight:600;color:var(--text2)">in ' + r.giorni
    + ' giorni</span></div>'
    + testaRitmo + riquadri + '</div>';
}

function _objFunnel(R){
  var f = R.funnel;
  if(f.venditeServono == null){
    return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;'
      + 'padding:14px;font-size:0.86rem;color:var(--text2)">Indica la provvigione media prevista '
      + 'nella configurazione per vedere quante vendite, incarichi e valutazioni servono.</div>';
  }
  return '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:stretch">'
    + _objPasso(f.valutazServono != null ? f.valutazServono : '—', 'Valutazioni', 'nell\'anno')
    + _objPasso(f.incarichiServono != null ? f.incarichiServono : '—', 'Incarichi', 'nell\'anno')
    + _objPasso(f.venditeServono, 'Vendite', 'nell\'anno')
    + _objPasso(f.venditeFatte, 'Fatte finora', 'provvigioni conteggiate', '#15803D')
    + '</div>'
    + '<div style="font-size:0.76rem;color:var(--text2);margin-top:8px;line-height:1.5">'
    + 'Valutazioni e incarichi sono per ora solo obiettivi calcolati: il confronto con i numeri '
    + 'veri non è ancora collegato.</div>';
}

function _objScarti(R){
  if(!R.scarti.length) return '';
  return '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:0.8rem;'
    + 'color:var(--text2);font-weight:700">'+R.scarti.length
    + ' provvigioni non conteggiate — vedi perché</summary>'
    + '<div style="margin-top:8px;font-size:0.8rem;color:var(--text2);line-height:1.7">'
    + R.scarti.map(function(s){
        return '· '+_esc(s.etich)+' <span style="opacity:.75">('+_esc(s.motivo)+')</span>';
      }).join('<br>')
    + '</div></details>';
}

/* ── wizard di configurazione ──────────────────────────────────────────── */

/* [14 set 2026] STAGIONALITÀ. Dodici parti uguali dicono il falso su un
   lavoro a ondate: mesi vuoti segnati "deficit" e un marzo al 441%.
   I valori sono PESI, non percentuali da far quadrare: contano solo l'uno
   rispetto all'altro, e la somma dei dodici target resta esatta comunque. */
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
      + '<input class="finput obj-peso" id="obj-peso-'+i+'" type="number" step="any" min="0" '
      + 'value="'+pesi[i]+'" oninput="_objRicalcolaPesi()" '
      + 'style="padding:5px;text-align:center;font-size:0.84rem">'
      + '<div class="obj-peso-eur" id="obj-eur-'+i+'" style="font-size:0.66rem;color:var(--text3);margin-top:2px">—</div>'
      + '</div>';
  }
  return '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">'
    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">'
    + '<div style="font-weight:700;font-size:0.88rem">Distribuzione sui mesi</div>'
    + '<button class="btn btn-outline btn-sm" onclick="_objPesiUguali()" style="padding:3px 10px;font-size:0.76rem">Tutti uguali</button>'
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
};

function _objWizard(cfg){
  var campo = function(id, et, val, sot, tipo){
    return '<div class="frow"><label class="flabel">'+et+'</label>'
      + '<input class="finput" id="'+id+'" type="'+(tipo||'number')+'" step="any" value="'
      + _esc(val===0?'':val) + '">'
      + (sot ? '<div style="font-size:0.72rem;color:var(--text2);margin-top:3px">'+sot+'</div>' : '')
      + '</div>';
  };
  return '<div id="obj-wizard" style="background:var(--bg2);border:1px solid var(--border);'
    + 'border-radius:12px;padding:16px;margin-bottom:14px">'
    + '<div style="font-weight:800;margin-bottom:12px">Obiettivi '+cfg.anno+'</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px">'
    + campo('obj-target', 'Obiettivo GCI lordo (€)', cfg.targetAnno, 'totale provvigioni, quota agente inclusa')
        .replace('id="obj-target"', 'id="obj-target" oninput="_objRicalcolaPesi()"')
    + campo('obj-provv',  'Provvigione media per affare (€)', cfg.provvMedia, 'serve per il funnel')
    + campo('obj-costi',  'Costi e spese annue stimate (€)', cfg.costiAnnui, 'per calcolare il netto')
    + campo('obj-vi',     'Valutazioni per un incarico', cfg.valutazioniPerIncarico, 'es. 3 = tre valutazioni, un incarico')
    + campo('obj-iv',     'Incarichi per una vendita', cfg.incarichiPerVendita, 'es. 4 = quattro incarichi, una vendita')
    + campo('obj-soglia', 'Soglia "in linea" (%)', cfg.sogliaLinea, 'sotto questa quota diventa deficit')
    + '</div>'
    + _objGrigliaMesi(cfg)
    + '<div style="display:flex;gap:8px;margin-top:14px">'
    + '<button class="btn btn-primary btn-sm" onclick="_objSalvaWizard()">Salva obiettivi</button>'
    + '<button class="btn btn-outline btn-sm" onclick="_objMostraWizard(false)">Annulla</button>'
    + '</div></div>';
}

/* ── finestra ──────────────────────────────────────────────────────────── */

var _objWizardAperto = false;

window._objVaiTab = function(t){ _objTab = t; _objDisegna(); };
window._objCambiaAnno = function(a){ _objAnno = +a; _objWizardAperto = false; _objDisegna(); };
window._objMostraWizard = function(v){ _objWizardAperto = !!v; _objDisegna(); };

window._objSalvaWizard = function(){
  var leggi = function(id){ var el = document.getElementById(id); return el ? objNum(el.value) : 0; };
  var cfg = objLeggi(_objAnno) || objPredefinito(_objAnno);
  var nuovo = {
    anno: _objAnno,
    uuid: cfg.uuid,
    targetAnno: leggi('obj-target'),
    provvMedia: leggi('obj-provv'),
    costiAnnui: leggi('obj-costi'),
    valutazioniPerIncarico: leggi('obj-vi'),
    incarichiPerVendita: leggi('obj-iv'),
    sogliaLinea: leggi('obj-soglia') || 90,
    stagionalita: (function(){
      var p = [], i, el, diversi = false;
      for(i=0;i<12;i++){ el = document.getElementById('obj-peso-'+i); p.push(el ? objNum(el.value) : 1); }
      for(i=0;i<12;i++) if(p[i] !== p[0]) diversi = true;
      /* tutti uguali o tutti a zero: salvo null, che vuol dire parti uguali.
         Così un domani non mi ritrovo dodici "1" da interpretare. */
      return (diversi && objPesiValidi(p)) ? p : null;
    })()
  };
  if(objSalva(nuovo)){
    _objWizardAperto = false;
    _objDisegna();
    try{ if(typeof toast === 'function') toast('Obiettivi salvati'); }catch(e){}
  } else {
    try{ dlgAlert('Non sono riuscito a salvare gli obiettivi.',''); }catch(e){}
  }
};

window.chiudiObiettivi = function(){
  var w = document.getElementById('obj-wrap'); if(w) w.remove();
};

function _objDisegna(){
  var corpo = document.getElementById('obj-corpo');
  if(!corpo) return;
  var R;
  try{ R = objCalcola(_objAnno); }
  catch(e){
    console.warn('[Obiettivi] calcolo KO:', e);
    corpo.innerHTML = '<div style="padding:20px;color:var(--text2)">Non sono riuscito a calcolare i numeri.</div>';
    return;
  }
  var cfg = R.cfg;
  var senzaObiettivo = objNum(cfg.targetAnno) <= 0;

  var anni = [], ac = objAnnoCorrente();
  for(var a = ac-2; a <= ac+1; a++) anni.push(a);

  var h = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
    + '<select class="fselect" style="width:auto" onchange="_objCambiaAnno(this.value)">'
    + anni.map(function(x){ return '<option value="'+x+'"'+(x===_objAnno?' selected':'')+'>'+x+'</option>'; }).join('')
    + '</select>'
    + '<button class="btn btn-outline btn-sm" onclick="_objMostraWizard(true)">'
    + (senzaObiettivo ? 'Fissa gli obiettivi' : 'Modifica obiettivi') + '</button>'
    + '<button class="btn btn-outline btn-sm" onclick="_objDisegnaPub()">Ricalcola</button>'
    + '</div>';

  if(_objWizardAperto) h += _objWizard(cfg);

  if(senzaObiettivo && !_objWizardAperto){
    h += '<div style="background:var(--bg2);border:1px dashed var(--border);border-radius:12px;'
      + 'padding:22px;text-align:center">'
      + '<div style="font-weight:800;margin-bottom:6px">Nessun obiettivo fissato per il '+_objAnno+'</div>'
      + '<div style="font-size:0.86rem;color:var(--text2);margin-bottom:14px">'
      + 'Hai realizzato '+_e(R.realeAnno)+' finora. Fissa l\'obiettivo per vedere gli scostamenti.</div>'
      + '<button class="btn btn-primary btn-sm" onclick="_objMostraWizard(true)">Fissa gli obiettivi</button>'
      + '</div>';
  } else {
    h += _objKpi(R) + _objPipeline(R) + _objGrafico(R) + _objConfronto(R) + _objLinguette() + _objTabella(R) + _objScarti(R)
      + '<div style="margin-top:18px">' + _objResiduo(R) + '</div>'
      + '<div style="margin-top:18px"><div style="font-weight:800;margin-bottom:8px;font-size:0.9rem">'
      + 'Sull\'anno intero</div>' + _objFunnel(R) + '</div>';
    if(objNum(cfg.costiAnnui) > 0){
      h += '<div style="margin-top:14px;font-size:0.84rem;color:var(--text2)">'
        + 'Al netto dei costi stimati: <b style="color:var(--text)">'+_e(R.netto)+'</b> realizzato, '
        + 'su <b style="color:var(--text)">'+_e(R.nettoAtteso)+'</b> attesi a fine anno.</div>';
    }
  }
  corpo.innerHTML = h;
  /* la griglia dei mesi nasce con gli euro da calcolare: li riempio subito,
     altrimenti restano dei trattini finché non tocchi una casella */
  if(_objWizardAperto){ try{ _objRicalcolaPesi(); }catch(e){} }
}
window._objDisegnaPub = function(){ _objDisegna(); };

window.apriObiettivi = function(){
  chiudiObiettivi();
  _objAnno = objAnnoCorrente();
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
    + '<div style="flex:1;overflow:auto;padding:14px"><div id="obj-corpo" style="max-width:960px;margin:0 auto"></div></div>';
  document.body.appendChild(w);
  try{ if(typeof window._ceSeguiMenu === 'function') window._ceSeguiMenu(w); }catch(e){}
  _objDisegna();
};

/* esposte per la Console, utili per controllare i conti senza aprire la pagina */
window.objCalcolaObiettivi = objCalcola;
window.objEstraiIncassi = objEstraiIncassi;

})();
