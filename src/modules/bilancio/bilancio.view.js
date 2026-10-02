// modules/bilancio/bilancio.view.js — Bilancio Agenzia
// ----------------------------------------------------------------------------
// Estratto dal monolite il 15 set 2026. Prima era uno <script> inline; muoverlo
// qui serve a non far viaggiare 4 MB di index a ogni modifica del bilancio.
//
// DIPENDENZE (dal monolite, via window): D, saveD, aggiornaRecord, fmtEuro,
//   getNomeAgenzia, dlgAlert, dlgConfirm, XLSX, _paCalcola (Provvigioni attese),
//   _f24CatTributo e _f24CatLabel (Tasse e F24), _ceSeguiMenu (navigazione).
//
// NB: in un modulo ES le funzioni NON sono globali. Tutto ciò che viene
// richiamato da un onclick generato in HTML deve stare su window: verificato,
// sono 15 funzioni e sono tutte esposte in fondo alle rispettive sezioni.
// ----------------------------------------------------------------------------

/* ════════════════════════════════════════════════════════════════════════
   CONTO ECONOMICO                                   [14 set 2026 · v2]
   ------------------------------------------------------------------------
   Forma pro-forma adattata a un agente: niente magazzino, quindi al posto
   del "costo della merce venduta" ci sono le SPESE DIRETTE sull'immobile.

     RICAVI  −  COSTI DIRETTI  =  MARGINE LORDO
     MARGINE −  SPESE DI STRUTTURA  =  REDDITO ANTE IMPOSTE
     REDDITO −  IMPOSTE E CONTRIBUTI  =  UTILE NETTO

   TRE VISTE (scelta di Enzo, 14 set): Effettivo / Provvisorio / Confronto.
     EFFETTIVO    solo ciò che è registrato
     PROVVISORIO  effettivo + pipeline (proposte accettate e in corso)
                  + le voci manuali marcate "previsto"

   CHI È ENZO: collaboratore. Il ricavo è la QUOTA AGENTE, non il totale
   della provvigione (quello è il volume generato per l'agenzia).

   DOPPIO CONTEGGIO: fatture e incassi NF sono generati dalle provvigioni
   (_provUuid, "Auto da Provvigioni"): sono lo stesso euro, qui mai sommati.

   Scrive SOLO D.ceVoci, la collezione delle voci manuali.
   ════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

function _ceN(v){
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  if(v === null || v === undefined) return 0;
  var s = String(v).trim().replace(/[€\s]/g,'');
  if(!s) return 0;
  if(s.indexOf(',') >= 0){ s = s.replace(/\./g,'').replace(',','.'); }
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)){ s = s.replace(/\./g,''); }
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function _ceAnno(v){
  var m = String(v||'').match(/^(\d{4})-/);
  if(m) return +m[1];
  m = String(v||'').match(/\/(\d{4})/);
  return m ? +m[1] : null;
}
function _ceArr(n){ return Math.round(n*100)/100; }
/* come _ceAnno ma restituisce anche mese e giorno, per i conti sui giorni */
function objCeData(v){
  var m = String(v||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return {anno:+m[1], mese:+m[2], giorno:+m[3]};
  m = String(v||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return {anno:+m[3], mese:+m[2], giorno:+m[1]};
  return null;
}
function _ceE(n){
  try{ if(typeof fmtEuro === 'function') return fmtEuro(n); }catch(e){}
  return '€ ' + Number(n||0).toLocaleString('it-IT', {maximumFractionDigits:0});
}
function _ceEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

/* Le spese legate a un singolo immobile stanno nei costi diretti; il resto
   è struttura. Chi non rientra in questo elenco finisce in struttura. */
var CE_DIRETTI = /ape|perizia|documenti comune|visura|catastal|ipocatastal|fotografi|planimetri|rilievo|sanatoria|pratica edilizia|consulenza tecnica|rimborso spese/i;
function _ceSezioneDi(tipo){ return CE_DIRETTI.test(String(tipo||'')) ? 'diretti' : 'struttura'; }

/* [15 set 2026] RISTRUTTURAZIONE. Il conto economico dice quanto hai
   guadagnato e speso per categoria, per COMPETENZA. Niente saldi, niente
   movimenti: quelli stanno nel documento di cassa, che è un'altra cosa.
   Gli anticipi per il cliente (APE, visure) sono PARTITE DI GIRO — scelta
   di Enzo, 15 set: escono dal conto economico perché non sono né suo
   guadagno né sua spesa; restano visibili nella cassa e fra le partite
   aperte, dove contano davvero. */
/* [15 set 2026] SEZIONI. Le quattro di sistema non si tolgono: sono i
   contenitori dei dati che il bilancio legge da solo (provvigioni, anticipi,
   spese, F24). Enzo può aggiungerne altre, che ospitano solo voci inserite a
   mano e vivono in D.ceSezioni. Ogni sezione dichiara il LATO — entrate o
   uscite — perché da quello dipende come entra nei totali. */
var CE_SEZIONI_FISSE = [
  {id:'ricavi',    nome:'Entrate',              lato:'entrate', fissa:true},
  /* [17 set 2026] esiste solo nella vista del titolare: per l'agenzia le
     quote degli agenti sono il costo principale */
  {id:'agenti',    nome:'Compensi agenti',      lato:'uscite',  fissa:true, soloTitolare:true},
  {id:'diretti',   nome:'Anticipi da recuperare', lato:'uscite', fissa:true},
  {id:'struttura', nome:'Spese di struttura',   lato:'uscite',  fissa:true},
  {id:'imposte',   nome:'Imposte e contributi', lato:'uscite',  fissa:true, dopoRisultato:true}
];
function _ceSezioniUtente(){
  if(!window.D) return [];
  if(!Array.isArray(D.ceSezioni)) D.ceSezioni = [];
  return D.ceSezioni.filter(function(x){ return x && x.id && x.nome; })
    .map(function(x){
      return {id:x.id, nome:x.nome, lato:(x.lato === 'entrate' ? 'entrate' : 'uscite'), fissa:false};
    });
}
/* le nuove entrate vanno dopo le Entrate, le nuove uscite prima delle imposte:
   così il risultato ante imposte resta in fondo dove ci si aspetta */
function _ceSezioni(){
  var u = _ceSezioniUtente(), out = [];
  var tit = (_ceProsEff() === 'titolare');
  CE_SEZIONI_FISSE.forEach(function(f){
    if(f.soloTitolare && !tit) return;
    if(f.id === 'imposte'){
      u.forEach(function(x){ if(x.lato === 'uscite') out.push(x); });
    }
    out.push(f);
    if(f.id === 'ricavi'){
      u.forEach(function(x){ if(x.lato === 'entrate') out.push(x); });
    }
  });
  return out;
}
function _ceSezioniDi(lato){
  return _ceSezioni().filter(function(x){ return x.lato === lato; });
}
function _ceSezioneObj(id){
  var t = _ceSezioni();
  for(var i=0;i<t.length;i++) if(t[i].id === id) return t[i];
  return null;
}
/* compatibilità con il codice che iterava la lista vecchia */
var CE_SEZIONI = CE_SEZIONI_FISSE.map(function(x){ return [x.id, x.nome]; });
function _ceNomeSez(k){
  var o = _ceSezioneObj(k);
  return o ? o.nome : k;
}

/* ── voci manuali: D.ceVoci ────────────────────────────────────────────── */

function _ceVoci(){
  if(!window.D) return [];
  if(!Array.isArray(D.ceVoci)) D.ceVoci = [];
  return D.ceVoci;
}
function _ceVociAnno(anno){
  return _ceVoci().filter(function(v){ return v && +v.anno === +anno; });
}

/* ── COSTI FISSI: D.costiFissi ───────────────────────────── [2 ott 2026]
   Scelta di Enzo: REGOLE, non movimenti. Una voce dice "500 al mese dal
   gennaio 2026, il giorno 5" e ogni mese si ricava da lì: il dato sta in un
   posto solo e non ci sono copie da allineare fra PC e telefono. Un mese può
   avere la sua eccezione in c.mesi['AAAA-MM'] = {importo, stato, dataPag}:
     stato ''        automatico: pagato quando la scadenza è passata
     stato 'si'      pagato (dataPag se indicata, altrimenti la scadenza)
     stato 'no'      non ancora pagato anche se la scadenza è passata
     stato 'saltato' quel mese non c'è
   Categorie: agenzia e business entrano nelle spese di struttura; personali
   restano FUORI dall'utile (scelta di Enzo) e si mostrano a parte.
   Cancellare = eliminata:true + _modificata, come per le altre collezioni. */
var CE_CF_FREQ = {mensile:1, bimestrale:2, trimestrale:3, semestrale:6, annuale:12, unica:0};
var CE_CF_FREQ_NOME = {mensile:'ogni mese', bimestrale:'ogni 2 mesi', trimestrale:'ogni 3 mesi',
                       semestrale:'ogni 6 mesi', annuale:'ogni anno', unica:'una volta sola'};
var CE_CF_CAT = [{id:'agenzia', nome:'Agenzia', col:'#2563EB'}, {id:'business', nome:'Business', col:'#0E7490'},
                 {id:'personali', nome:'Personali', col:'#7C3AED'}];
function _ceCFTutti(){
  if(!window.D) return [];
  if(!Array.isArray(D.costiFissi)) D.costiFissi = [];
  return D.costiFissi;
}
function _ceCF(){ return _ceCFTutti().filter(function(c){ return c && !c.eliminata; }); }
function _ceOggiISO(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function _ceYM(a, m){ return a + '-' + String(m).padStart(2, '0'); }
/* le scadenze di una voce in un anno: [{ym, m (0-11), data, imp, pagato, dataPag, stato, eccezione}] */
function _ceCFOccorrenze(c, anno){
  var out = [];
  if(!c) return out;
  var dal = String(c.dal || '').match(/^(\d{4})-(\d{2})/);
  if(!dal) return out;
  var a0 = +dal[1], m0 = +dal[2];
  var al = String(c.al || '').match(/^(\d{4})-(\d{2})/);
  var fine = al ? (+al[1]) * 12 + (+al[2]) : Infinity;
  var passo = CE_CF_FREQ.hasOwnProperty(c.freq) ? CE_CF_FREQ[c.freq] : 1;
  var oggi = _ceOggiISO();
  var gg = Math.min(Math.max(parseInt(c.giorno, 10) || 1, 1), 31);
  var mesi = c.mesi || {};
  for(var m = 1; m <= 12; m++){
    var k = anno * 12 + m, k0 = a0 * 12 + m0;
    if(k < k0 || k > fine) continue;
    if(passo === 0 ? (k !== k0) : ((k - k0) % passo !== 0)) continue;
    var ym = _ceYM(anno, m), ecc = mesi[ym] || null;
    var st = ecc ? String(ecc.stato || '') : '';
    if(st === 'saltato'){ out.push({ym:ym, m:m-1, saltato:true, eccezione:true, imp:0}); continue; }
    var ultimo = new Date(anno, m, 0).getDate();
    var data = ym + '-' + String(Math.min(gg, ultimo)).padStart(2, '0');
    var imp = (ecc && ecc.importo !== undefined && ecc.importo !== '') ? _ceN(ecc.importo) : _ceN(c.importo);
    var pagato = (st === 'si') ? true : (st === 'no' ? false : data <= oggi);
    out.push({ym:ym, m:m-1, data:data, imp:_ceArr(imp), pagato:pagato,
              dataPag:pagato ? ((st === 'si' && ecc.dataPag) ? ecc.dataPag : data) : '',
              stato:st, eccezione:!!ecc});
  }
  return out;
}

/* ── il calcolo ────────────────────────────────────────────────────────── */

function ceCalcola(anno){
  var D = window.D || {};
  var vuota = function(){ return {tot:0, righe:[]}; };
  var _sezTutte = _ceSezioni();
  var _contenitori = function(){
    var o = {};
    _sezTutte.forEach(function(x){ o[x.id] = vuota(); });
    return o;
  };
  var R = {
    anno: anno,
    sezioni: _sezTutte,
    eff: _contenitori(),
    prev: _contenitori(),
    gci: 0, quoteAgente: 0, quoteAgenteCassa: 0, quanteProv: 0,
    percAgente: null, percDaStorico: false,
    daIncassare: 0, daPagare: 0, avvisi: [], controlli: []
  };
  var PRO = _ceProsEff(), AG = (PRO === 'agente') ? _ceAgenteEff() : '';
  R.prospettiva = PRO;
  R.agenteUuid = AG;
  R.agenteNome = '';
  _ceAgentiTutti().forEach(function(a){ if(a.uuid === AG) R.agenteNome = a.nome || ''; });
  R.titPagatoAgenti = 0; R.titDaPagareAgenti = 0;
  /* [17 set 2026] IL DETTAGLIO DI OGNI RIGA DELLA CASSA: serve al segno + nel
     documento Incassi e pagamenti e alla sua stampa analitica. Ogni elenco
     somma esattamente la riga a cui appartiene. */
  var CD = R.cassaDet = {quote:[], clienti:[], altreEntrate:[], trattenute:[],
                         agenti:[], struttura:[], imposte:[]};
  var agg = function(dove, sez, et, imp, nota, det, forza){
    /* forza serve agli anticipi interamente recuperati: a carico restano
       zero, ma la riga deve restare visibile — altrimenti spariscono dal
       prospetto centinaia di euro movimentati e non si capisce più nulla */
    if(!imp && !forza) return;
    R[dove][sez].tot = _ceArr(R[dove][sez].tot + imp);
    R[dove][sez].righe.push({et:et, imp:_ceArr(imp), nota:nota||'', det:det||null, voceId:null});
  };

  /* RICAVI EFFETTIVI — quota agente sulle provvigioni datate nell'anno */
  var prov = Array.isArray(D.provvigioni) ? D.provvigioni : [];
  var quote = 0, quoteCassa = 0, quoteCassaNetta = 0, totali = 0, tratt = 0, trattCassa = 0, n = 0;
  var detQuote = [], detTratt = [], restiTot = 0;
  (PRO === 'titolare' ? [] : prov).forEach(function(p){
    if(!p || _ceAnno(p.data) !== anno) return;
    if(!_ceProvDiAgente(p, AG)) return;
    var tot = _ceN(p.totale) || (_ceN(p.quotaA) + _ceN(p.quotaV));
    var lordo = _ceN(p.quotaAgenteLordo) || _ceN(p.quotaAgente);
    var netto = _ceN(p.quotaAgenteNetto);
    quote += lordo; totali += tot; n++;
    /* [15 set 2026] Il riferimento da solo non basta a riconoscere l'affare:
       ci vuole il nome. Acquirente e venditore quando ci sono entrambi. */
    var nomi = [p.acquirente, p.venditore].filter(function(x){ return x && String(x).trim(); }).join(' / ');
    var etich = p.descr || 'provvigione';
    if(nomi) etich = (p.descr ? p.descr + ' · ' : '') + nomi;
    /* [15 set 2026] QUANTO TI È DAVVERO ARRIVATO. Prima usavo agtIncassato
       come interruttore: o tutta la quota o niente. Un acconto di 1.000 su
       2.100 spariva del tutto. Il gestionale tiene le righe di pagamento
       all'agente in modAgenteRighe (vedi riga ~30128, _agtRicevuto): uso la
       stessa fonte, così le due schermate non si contraddicono.
       L'abbuono chiude il conto ma NON è denaro ricevuto: resta fuori dalla
       cassa e si segnala a parte. */
    /* [24 set 2026] QUANTO È ARRIVATO SI LEGGE DAI DOCUMENTI.
       Le righe della scheda con destinazione "fattura" dicono solo "questa
       parte la fatturo", non "l'ho incassata": prima il bilancio le contava
       come soldi arrivati (Cardonia e Frigenti: 6.000 contati in più).
       Ora: righe NF = incassate (la scrittura NF nasce già pagata); righe
       fattura = quanto risulta PAGATO sulle fatture agganciate a questa
       provvigione. Se la fattura non si trova, la riga si conta come prima
       ma finisce nei "Dati da controllare". */
    var _INC = _ceIncassoAgente(p);
    var ricevuto = _INC.ricevuto, movimenti = _INC.movimenti, spetta = _INC.spetta;
    var abbuono = _INC.abbuono, resta = _INC.resta;
    _INC.avvisi.forEach(function(m){ R.controlli.push({et:etich, msg:m}); });

    if(lordo > 0){
      /* [15 set 2026] FORMATO A MOVIMENTI, chiesto da Enzo: prima la quota
         maturata, poi ogni acconto ricevuto col segno meno, infine quanto
         resta. NB: le righe in modAgenteRighe sono {mod, imp, dest} e NON
         hanno una data, quindi si può indicare solo la modalità. */
      detQuote.push({et:etich, imp:_ceArr(lordo), data:p.data,
        nota:'provvigione ' + _ceE(tot) + ' · tua quota',
        notaCassa:(resta > 0.009
                ? 'quota maturata, restano ' + _ceE(resta)
                : (abbuono > 0 ? 'saldata, con abbuono di ' + _ceE(abbuono) : 'saldata'))
             + ' · provvigione ' + _ceE(tot)});
      if(lordo > netto && netto > 0){
        detQuote.push({et:'Trattenuta ufficio', imp:_ceArr(netto - lordo), liv:1});
      }
      if(movimenti.length){
        /* le righe si mostrano per quanto valgono davvero: una riga che supera
           il dovuto, mostrata intera, metterebbe due cifre in contrasto nella
           stessa schermata */
        var resi = ricevuto;
        movimenti.forEach(function(r){
          var q = _ceN(r && r.imp);
          if(q <= 0) return;
          var mostra = Math.min(q, resi);
          resi = _ceArr(resi - mostra);
          if(mostra <= 0) return;
          detQuote.push({et:r.et + (mostra < q ? ' (registrato ' + _ceE(q) + ')' : ''),
            imp:_ceArr(-mostra), liv:1});
        });
      } else if(ricevuto > 0){
        detQuote.push({et:'Quota incassata', imp:_ceArr(-ricevuto), liv:1});
      }
      if(abbuono > 0) detQuote.push({et:'Abbuono', imp:_ceArr(-abbuono), liv:1});
      if(resta > 0.009) detQuote.push({et:'Restano da incassare', imp:resta, liv:1, saldo:true});
    }
    /* [24 set 2026] CASSA AL LORDO, scelta di Enzo. Prima in Entrato c'era
       il NETTO ricevuto (quello che l'ufficio bonifica, trattenuta già tolta)
       e in Uscito ANCHE la trattenuta: la stessa somma tolta due volte. Sul
       2026 il saldo risultava 505,48 più basso del vero.
       Ora in Entrato va il LORDO corrispondente a quanto incassato e in
       Uscito la trattenuta su quella parte: Entrato − Uscito = netto
       ricevuto, cioè i soldi davvero arrivati. La trattenuta si ricava come
       differenza (lordo in cassa − netto ricevuto) e non con un secondo
       arrotondamento: così le due righe non possono scostarsi di centesimi. */
    var ricevutoLordo = ricevuto;
    if(netto > 0 && lordo > 0){
      var t1 = lordo - netto;
      tratt += t1;
      detTratt.push({et:etich, imp:_ceArr(t1), data:p.data, nota:''});
      ricevutoLordo = (spetta > 0) ? _ceArr(ricevuto * lordo / spetta) : ricevuto;
      var _tc = _ceArr(ricevutoLordo - ricevuto);
      trattCassa += _tc;
      if(_tc > 0) CD.trattenute.push({et:etich, imp:_tc, data:p.data,
        nota:'trattenuta dall\'ufficio sulla quota incassata'});
    }
    quoteCassa += ricevutoLordo;
    quoteCassaNetta += ricevuto;
    if(ricevuto > 0){
      var _mods = movimenti.map(function(r){ return r && r.mod; })
        .filter(function(x, i, a){ return x && a.indexOf(x) === i; });
      var _notaQ = (_mods.length ? _mods.join(', ') : '') + (ricevuto < spetta ? (_mods.length ? ' · ' : '') + 'acconto' : '');
      if(ricevutoLordo > ricevuto + 0.009)
        _notaQ += (_notaQ ? ' · ' : '') + 'lordo · ricevuti ' + _ceE(ricevuto);
      CD.quote.push({et:etich, imp:ricevutoLordo, data:p.data, nota:_notaQ});
    }
    restiTot += resta;
    if(lordo <= 0) R.avvisi.push('Provvigione senza quota agente: ' + (p.descr || p.acquirente || '?'));
  });
  if(PRO !== 'titolare'){
  R.gci = _ceArr(totali); R.quoteAgente = _ceArr(quote);
  R.quoteAgenteCassa = _ceArr(quoteCassa); R.quanteProv = n;
  /* il netto davvero arrivato, per chi ne avesse bisogno altrove */
  R.quoteAgenteCassaNetta = _ceArr(quoteCassaNetta);
  /* il residuo vero, non lordo meno incassato: fra i due c'è la trattenuta
     ufficio, che non è un credito verso l'agenzia */
  R.daIncassare = _ceArr(restiTot);
  agg('eff', 'ricavi', 'Quote agente su provvigioni', _ceArr(quote), n + ' provvigioni', detQuote);
  agg('eff', 'struttura', 'Trattenute ufficio', _ceArr(tratt), 'sul tuo compenso', detTratt);

  /* la percentuale che ti spetta, ricavata dai TUOI affari */
  if(totali > 0 && quote > 0){ R.percAgente = _ceArr(quote/totali*100); R.percDaStorico = true; }
  else { R.percAgente = 50; }
  } else {
    /* [17 set 2026] VISTA DEL TITOLARE — scelte di Enzo:
       ricavo = provvigione intera; costo = quota NETTA dell'agente (la
       trattenuta resta all'agenzia, quindi riduce il costo e non compare
       come voce a sé). In cassa: quanto hanno pagato venditore e acquirente,
       e quanto è stato girato agli agenti.
       Limite dei dati: per venditore e acquirente il gestionale sa solo SE
       hanno pagato (modalità compilata), non quando né se in parte. */
    var tTot = 0, tCosto = 0, tN = 0, tInc = 0, tDaInc = 0, tPagAg = 0, tDaPagAg = 0;
    var detRic = [], detCosto = [];
    prov.forEach(function(p){
      if(!p || _ceAnno(p.data) !== anno) return;
      var tot = _ceN(p.totale) || (_ceN(p.quotaA) + _ceN(p.quotaV));
      var lordo = _ceN(p.quotaAgenteLordo) || _ceN(p.quotaAgente);
      var netto = _ceN(p.quotaAgenteNetto);
      var costo = (netto > 0) ? netto : lordo;
      var nomi = [p.acquirente, p.venditore].filter(function(x){ return x && String(x).trim(); }).join(' / ');
      var etich = p.descr || 'provvigione';
      if(nomi) etich = (p.descr ? p.descr + ' · ' : '') + nomi;
      var ag = null;
      try{ if(typeof window._agenteDi === 'function') ag = window._agenteDi(p); }catch(e){}
      var agNome = (ag && ag.nome) ? ag.nome : '';
      /* incassato dai clienti */
      var qV = _ceN(p.quotaV), qA = _ceN(p.quotaA);
      var dovCli = (qV + qA > 0) ? (qV + qA) : tot;
      var incCli = (String(p.modV||'').trim() ? qV : 0) + (String(p.modA||'').trim() ? qA : 0);
      if(qV + qA <= 0 && p.agIncassato === true) incCli = tot;
      incCli = _ceArr(Math.min(incCli, dovCli));
      var restaCli = _ceArr(Math.max(0, dovCli - incCli));
      /* girato agli agenti: le stesse righe che la vista agente chiama ricevute */
      var pagato = 0;
      (Array.isArray(p.modAgenteRighe) ? p.modAgenteRighe : []).forEach(function(r){ pagato += _ceN(r && r.imp); });
      if(pagato <= 0 && p.agtIncassato === true) pagato = costo;
      pagato = _ceArr(Math.min(pagato, costo));
      var restaAg = _ceArr(Math.max(0, costo - pagato - _ceN(p.abbuono)));
      tTot += tot; tCosto += costo; tN++;
      if(incCli > 0) CD.clienti.push({et:etich, imp:incCli, data:p.data,
        nota:(restaCli > 0.009 ? 'parziale' : '')});
      if(pagato > 0) CD.agenti.push({et:etich, imp:pagato, data:p.data,
        nota:(agNome || '') + (pagato < costo ? (agNome ? ' · ' : '') + 'acconto' : '')});
      tInc += incCli; tDaInc += restaCli; tPagAg += pagato; tDaPagAg += restaAg;
      if(tot > 0){
        detRic.push({et:etich, imp:_ceArr(tot), data:p.data,
          nota:(agNome ? 'agente ' + agNome : 'nessun agente indicato'),
          notaCassa:(restaCli > 0.009
            ? 'incassati ' + _ceE(incCli) + ', restano ' + _ceE(restaCli)
            : 'incassata dai clienti')});
        if(incCli > 0) detRic.push({et:'Incassato dai clienti', imp:_ceArr(-incCli), liv:1});
        if(restaCli > 0.009) detRic.push({et:'Restano da incassare', imp:restaCli, liv:1, saldo:true});
      }
      if(costo > 0){
        detCosto.push({et:etich, imp:_ceArr(costo), data:p.data,
          nota:(agNome || 'agente') + ((lordo > netto && netto > 0)
            ? ' · netto, la trattenuta di ' + _ceE(_ceArr(lordo - netto)) + ' resta all\'agenzia' : '')});
      }
      if(tot > 0 && lordo <= 0) R.avvisi.push('Provvigione senza quota agente: ' + etich);
    });
    R.gci = _ceArr(tTot); R.quoteAgente = _ceArr(tCosto);
    R.quoteAgenteCassa = _ceArr(tInc); R.quanteProv = tN;
    R.daIncassare = _ceArr(tDaInc);
    R.titPagatoAgenti = _ceArr(tPagAg);
    R.titDaPagareAgenti = _ceArr(tDaPagAg);
    agg('eff', 'ricavi', 'Provvigioni', R.gci, tN + ' provvigioni · importo intero', detRic);
    agg('eff', 'agenti', 'Quote nette degli agenti', R.quoteAgente,
        'quello che spetta agli agenti, trattenute escluse', detCosto);
    /* la parte del volume che va agli agenti: serve a stimare il costo delle
       trattative in corso */
    if(tTot > 0 && tCosto > 0){ R.percAgente = _ceArr(tCosto/tTot*100); R.percDaStorico = true; }
    else { R.percAgente = 50; }
  }

  /* ALTRE ENTRATE E SPESE. Lo stato è etichettato "Incassata" anche sulle
     uscite: lì significa pagata. */
  var ai = Array.isArray(D.altriIncassi) ? D.altriIncassi : [];
  var perTipo = {}, apertePagare = 0, daRecuperare = 0;
  var pagatoSez = {ricavi:0, struttura:0, imposte:0, diretti:0};
  var maturatoSez = {ricavi:0, struttura:0, imposte:0, diretti:0};
  ai.forEach(function(a){
    if(!a || _ceAnno(a.data) !== anno) return;
    /* [14 set 2026] pnSyncF24 copia ogni F24 dentro Altre Entrate/Spese con
       tipo "Tasse / F24" e il marcatore _fonteF24, per mostrarlo in Prima
       Nota. Non è una spesa in più: lo stesso importo arriva già da D.f24.
       Senza questo salto le tasse risultavano contate DUE volte. */
    if(a._fonteF24) return;
    if(!_ceContaPerMe(a, PRO, AG)) return;
    var imp = _ceN(a.importo);
    if(!imp) return;
    var fatta = String(a.stato||'').trim().toLowerCase() === 'incassata';
    if(String(a.direzione||'') === 'uscita'){
      var sez = _ceSezioneDi(a.tipo);
      var k = sez + '|' + (a.tipo || 'Senza tipo');
      if(!perTipo[k]) perTipo[k] = {sez:sez, tipo:(a.tipo||'Senza tipo'), tot:0, q:0, det:[],
                                    pagato:0, qPag:0};
      perTipo[k].tot += imp; perTipo[k].q++;
      /* [15 set 2026] Il campo descr è quasi sempre vuoto, quindi il dettaglio
         mostrava lo stesso tipo ripetuto e non si capiva QUALE voce fosse
         pagata. Il cliente è la cosa che le distingue: viene per primo. */
      perTipo[k].det.push({
        et: (a.cliente || a.descr || a.tipo || 'voce'),
        imp:_ceArr(imp), data:a.data,
        nota:(sez === 'diretti'
                ? (fatta ? 'anticipata' : 'anticipata, da recuperare')
                : (fatta ? 'pagata' : 'da pagare'))
             + (a.cliente && a.descr ? ' · ' + a.descr : '')});
      /* la riga del rimborso sotto l'anticipo, col segno meno: così si vede
         che quell'uscita è rientrata invece di doverlo dedurre dal totale */
      if(sez === 'diretti' && fatta){
        perTipo[k].det.push({et:'Rimborsata dal cliente'
          + (a.modPag ? ' — ' + a.modPag : ''), imp:_ceArr(-imp), liv:1});
      }
      maturatoSez[sez] += imp;
      if(fatta){ perTipo[k].pagato += imp; perTipo[k].qPag++; pagatoSez[sez] += imp; }
      if(fatta && sez === 'struttura'){
        CD.struttura.push({et:(a.tipo || 'Spesa') + (a.cliente || a.descr ? ' — ' + (a.cliente || a.descr) : ''),
          imp:_ceArr(imp), data:a.data, nota:a.modPag || ''});
      }
      /* [15 set 2026] Le spese DIRETTE sono anticipi che riaddebiti al
         cliente (scelta di Enzo): quelle ancora aperte non sono soldi da
         pagare, sono soldi da farsi restituire. Le spese di struttura
         invece restano un debito tuo. */
      else if(sez === 'diretti') daRecuperare += imp;
      else apertePagare += imp;
    } else {
      /* [2 ott 2026] il dettaglio con la data serve alla linguetta Mese per mese */
      agg('eff', 'ricavi', a.tipo || 'Altra entrata', imp, a.descr || '',
          [{et:(a.cliente || a.descr || a.tipo || 'entrata'), imp:_ceArr(imp), data:a.data, nota:(a.cliente && a.descr ? a.descr : '')}]);
      maturatoSez.ricavi += imp;
      if(fatta) pagatoSez.ricavi += imp;
      if(fatta) CD.altreEntrate.push({et:(a.tipo || 'Entrata') + (a.cliente || a.descr ? ' — ' + (a.cliente || a.descr) : ''),
        imp:_ceArr(imp), data:a.data, nota:a.modPag || ''});
    }
  });
  Object.keys(perTipo).forEach(function(k){
    var t = perTipo[k];
    /* quante sono già pagate va detto sulla riga: prima il totale mescolava
       pagato e da pagare senza che si vedesse */
    var nota = t.q + (t.q === 1 ? ' voce' : ' voci');
    var importo = _ceArr(t.tot);
    if(t.sez === 'diretti'){
      /* fuori dal conto economico: qui l'importo è quanto hai anticipato in
         tutto, e la nota dice quanto è già rientrato */
      /* anticipo riaddebitato: quello che il cliente ha restituito non è
         più un costo, quindi si sottrae. Resta a carico solo il non
         ancora recuperato. */
      if(t.pagato > 0){
        nota += ' — recuperati ' + _ceE(t.pagato)
          + (t.tot - t.pagato > 0.009 ? ', da recuperare ' + _ceE(_ceArr(t.tot - t.pagato)) : ', tutti rientrati');
      } else {
        nota += ', ancora da recuperare per intero';
      }
    } else {
      if(t.qPag === t.q) nota += (t.q === 1 ? ', pagata' : ', tutte pagate');
      else if(t.qPag > 0) nota += ' — pagate ' + _ceE(t.pagato) + ', da pagare ' + _ceE(_ceArr(t.tot - t.pagato));
      else nota += (t.q === 1 ? ', da pagare' : ', ancora da pagare');
    }
    agg('eff', t.sez, t.tipo, importo, nota, t.det, (t.sez === 'diretti' && t.tot > 0));
    if(t.sez === 'diretti'){
      /* [15 set 2026] Scelta di Enzo: nel conto economico gli anticipi pesano
         SOLO finché non rientrano — sono soldi usciti davvero dalle sue tasche.
         Quando il cliente rimborsa, la riga si azzera e sparisce. Qui si tiene
         da parte la quota ancora aperta e le sole voci non rimborsate; il
         totale pieno resta per il documento di cassa. */
      var ap = _ceArr(t.tot - t.pagato);
      var righeA = R.eff.diretti.righe;
      var ultima = righeA[righeA.length-1];
      if(ultima){
        ultima.impAperto = ap;
        ultima.detAperto = (t.det || []).filter(function(d){
          return d.imp > 0 && String(d.nota||'').indexOf('da recuperare') >= 0;
        });
        ultima.notaAperto = (ap > 0.009)
          ? righeA.length && (t.q - t.qPag) + ((t.q - t.qPag) === 1 ? ' voce ancora aperta' : ' voci ancora aperte')
            + (t.qPag > 0 ? ' su ' + t.q : '')
          : 'tutti rimborsati dai clienti';
      }
    }
  });

  /* IMPOSTE — F24 con scadenza nell'anno */
  var f24 = Array.isArray(D.f24) ? D.f24 : [];
  var tasse = 0, qT = 0, tasseAperte = 0;
  /* [15 set 2026] GLI F24 SCOMPOSTI PER TRIBUTO. Una riga sola "F24" non
     dice dove stanno i soldi: contributi, IRPEF e IVA sono voci diverse su
     cui si decidono cose diverse. Uso la classificazione già presente nel
     modulo Tasse (_catTributo), così le due schermate non possono divergere.
     Un F24 senza righe di dettaglio resta una voce unica sotto "Altro":
     meglio dichiararlo che spalmarlo a caso. */
  var perCat = {};
  var catNome = function(c){
    try{ if(typeof window._f24CatLabel === 'function') return window._f24CatLabel(c); }catch(e){}
    return ({inps:'Contributi INPS', ritenute:'Ritenute', irpef:'IRPEF / Imposte dirette',
             addizionali:'Addizionali', iva:'IVA', imu:'IMU / Tributi locali'})[c] || 'Altro';
  };
  var catDi = function(cod, sez){
    try{ if(typeof window._f24CatTributo === 'function') return window._f24CatTributo(cod, sez); }catch(e){}
    return 'altro';
  };
  f24.forEach(function(f){
    if(!f) return;
    if(!_ceContaPerMe(f, PRO, AG)) return;
    var tot = _ceN(f.totale);
    var righe = Array.isArray(f.righe) ? f.righe : [];
    var sommaRighe = 0;
    righe.forEach(function(r){ sommaRighe += _ceN(r && r.importo); });
    if(tot <= 0) tot = sommaRighe;
    if(_ceAnno(f.scadenza) !== anno && _ceAnno(f.dataPagamento) !== anno) return;
    var pag = String(f.stato||'') === 'pagato';
    tasse += tot; qT++;
    maturatoSez.imposte += tot;
    if(pag) pagatoSez.imposte += tot;
    if(pag) CD.imposte.push({et:(f.descrizione || 'F24'), imp:_ceArr(tot),
      data:(f.dataPagamento || f.scadenza), nota:''});
    if(!pag) tasseAperte += tot;
    var quando = (f.dataPagamento || f.scadenza);
    var eti = (f.descrizione || 'F24');
    var stato = pag ? 'versato' : 'da versare';

    if(righe.length && sommaRighe > 0){
      righe.forEach(function(r){
        var imp = _ceN(r && r.importo);
        if(imp <= 0) return;
        var c = (r && r.cat) || catDi(r && r.codice, r && r.sezione);
        if(!perCat[c]) perCat[c] = {tot:0, q:0, det:[]};
        perCat[c].tot += imp; perCat[c].q++;
        perCat[c].det.push({et:(r.descrizione || r.codice || eti), imp:_ceArr(imp), data:quando,
          nota: stato + (r.codice ? ' · cod. ' + r.codice : '') + (r.periodo ? ' · ' + r.periodo : '')});
      });
      /* se il saldo dell'F24 non coincide con la somma delle sue righe, la
         differenza va detta invece che persa o spalmata */
      var scarto = _ceArr(tot - sommaRighe);
      if(Math.abs(scarto) > 0.009){
        if(!perCat.altro) perCat.altro = {tot:0, q:0, det:[]};
        perCat.altro.tot += scarto; perCat.altro.q++;
        perCat.altro.det.push({et:eti + ' — differenza fra saldo e righe', imp:scarto,
          data:quando, nota:stato});
        R.controlli.push({et:eti, msg:'il saldo dell\'F24 (' + _ceE(tot)
          + ') non corrisponde alla somma delle sue righe (' + _ceE(sommaRighe) + ')'});
      }
    } else {
      if(!perCat.altro) perCat.altro = {tot:0, q:0, det:[]};
      perCat.altro.tot += tot; perCat.altro.q++;
      perCat.altro.det.push({et:eti, imp:_ceArr(tot), data:quando,
        nota: stato + ' · nessun dettaglio dei tributi'});
    }
  });
  ['inps','ritenute','irpef','addizionali','iva','imu','altro'].forEach(function(c){
    var x = perCat[c];
    if(!x || Math.abs(x.tot) < 0.009) return;
    agg('eff', 'imposte', catNome(c), _ceArr(x.tot),
        x.q + (x.q === 1 ? ' riga' : ' righe'), x.det);
  });
  /* COSTI FISSI [2 ott 2026] — scadenza passata = effettivo, scadenza futura =
     previsto (vista Provvisorio). In cassa contano quelli pagati. I personali
     non toccano l'utile: si raccolgono in R.personali. */
  var _oggiCF = _ceOggiISO();
  R.cfPrevMesi = [0,0,0,0,0,0,0,0,0,0,0,0];
  R.personali = {eff:0, prev:0, pagato:0, mesi:[0,0,0,0,0,0,0,0,0,0,0,0],
                 mesiPrev:[0,0,0,0,0,0,0,0,0,0,0,0], mesiCassa:[0,0,0,0,0,0,0,0,0,0,0,0], voci:0};
  var cfCat = {agenzia:{eff:0, prev:0, det:[], detPrev:[], q:{}}, business:{eff:0, prev:0, det:[], detPrev:[], q:{}}};
  _ceCF().forEach(function(c){
    if(!_ceContaPerMe(c, PRO, AG)) return;
    var occ = _ceCFOccorrenze(c, anno);
    if(!occ.length) return;
    var pers = (c.categoria === 'personali');
    if(pers) R.personali.voci++;
    occ.forEach(function(o){
      if(o.saltato || o.imp <= 0) return;
      var futuro = o.data > _oggiCF;
      if(pers){
        if(futuro){ R.personali.prev += o.imp; R.personali.mesiPrev[o.m] += o.imp; }
        else { R.personali.eff += o.imp; R.personali.mesi[o.m] += o.imp; }
        if(o.pagato){
          var dp = objCeData(o.dataPag);
          R.personali.pagato += o.imp;
          if(dp && dp.anno === anno) R.personali.mesiCassa[dp.mese - 1] += o.imp;
        }
        return;
      }
      var X = cfCat[c.categoria === 'business' ? 'business' : 'agenzia'];
      var nota = (o.pagato ? 'pagato' : 'da pagare') + (o.eccezione ? ' · importo o stato cambiato per questo mese' : '');
      if(futuro){
        X.prev += o.imp; X.detPrev.push({et:c.nome || 'costo fisso', imp:o.imp, data:o.data, nota:'previsto'});
        R.cfPrevMesi[o.m] = _ceArr(R.cfPrevMesi[o.m] + o.imp);
      } else {
        X.eff += o.imp; X.q[c.id || c.nome] = 1;
        X.det.push({et:c.nome || 'costo fisso', imp:o.imp, data:o.data, nota:nota});
        maturatoSez.struttura += o.imp;
        if(!o.pagato) apertePagare += o.imp;
      }
      if(o.pagato){
        pagatoSez.struttura += o.imp;
        CD.struttura.push({et:'Costo fisso — ' + (c.nome || ''), imp:o.imp, data:o.dataPag, nota:(futuro ? 'pagato in anticipo' : '')});
      }
    });
  });
  ['agenzia', 'business'].forEach(function(k){
    var X = cfCat[k], nome = (k === 'business') ? 'Costi fissi Business' : 'Costi fissi Agenzia';
    var nV = Object.keys(X.q).length;
    X.det.sort(function(a, b){ return String(a.data).localeCompare(String(b.data)); });
    if(X.eff > 0) agg('eff', 'struttura', nome, _ceArr(X.eff), nV + (nV === 1 ? ' voce' : ' voci') + ' · scadenze fino a oggi', X.det);
    if(X.prev > 0) agg('prev', 'struttura', nome + ' (prossimi mesi)', _ceArr(X.prev), 'scadenze già note da qui a fine anno', X.detPrev);
  });
  ['eff', 'prev', 'pagato'].forEach(function(k){ R.personali[k] = _ceArr(R.personali[k]); });

  R.daPagare = _ceArr(apertePagare + tasseAperte + R.titDaPagareAgenti);
  R.daRecuperare = _ceArr(daRecuperare);
  /* [15 set 2026] IL DOCUMENTO DI CASSA: quanto è entrato e uscito davvero
     nel periodo. Sta qui e non nel conto economico, che ragiona per
     competenza. Gli anticipi compaiono solo qui: sono partite di giro. */
  R.cassa = {
    quoteRicevute: R.quoteAgenteCassa,
    entrateIncassate: _ceArr(pagatoSez.ricavi),
    incassato: _ceArr(R.quoteAgenteCassa + pagatoSez.ricavi),
    trattenute: _ceArr(trattCassa),
    pagatoStruttura: _ceArr(pagatoSez.struttura),
    pagatoImposte: _ceArr(pagatoSez.imposte),
    anticipati: _ceArr(maturatoSez.diretti),
    recuperati: _ceArr(pagatoSez.diretti),
    pagatoAgenti: R.titPagatoAgenti
  };
  R.cassa.uscito = _ceArr(R.cassa.pagatoStruttura + R.cassa.pagatoImposte + R.cassa.trattenute
                          + R.cassa.pagatoAgenti);
  R.cassa.saldo = _ceArr(R.cassa.incassato - R.cassa.uscito);

  /* VOCI MANUALI — quelle "effettive" entrano in entrambe le viste,
     quelle "previste" solo nel provvisorio */
  _ceVociAnno(anno).forEach(function(v){
    if(!_ceContaPerMe(v, PRO, AG)) return;
    var imp = _ceN(v.importo);
    if(!imp) return;
    var sez = v.sezione || 'struttura';
    /* [16 set 2026] una voce la cui sezione non esiste più (eliminata su un
       altro dispositivo) faceva fallire tutto il calcolo: va dove la
       metterebbe l'eliminazione della sezione, fra le spese di struttura */
    if(!R.eff[sez]) sez = 'struttura';
    var dove = (v.natura === 'previsto') ? 'prev' : 'eff';
    agg(dove, sez, v.etichetta || '(senza nome)', imp,
        (v.natura === 'previsto' ? 'voce prevista' : 'voce inserita a mano'));
    /* l'id resta attaccato alla riga: serve a poterla modificare o eliminare
       direttamente dal prospetto, senza andarla a cercare nel form */
    var arr = R[dove][sez].righe;
    if(arr.length) arr[arr.length-1].voceId = v.id;
    /* [16 set 2026] Negli anticipi il conto economico mostra solo la parte
       ANCORA APERTA (impAperto). Le righe inserite a mano non l'avevano, e
       sparivano dal prospetto come se valessero zero. Una voce a mano non
       sa se il cliente ha rimborsato: resta aperta per intero. */
    if(dove === 'eff' && sez === 'diretti' && arr.length){
      arr[arr.length-1].impAperto = _ceArr(imp);
      arr[arr.length-1].notaAperto = 'voce inserita a mano · da recuperare';
    }
  });

  /* [16 set 2026] VOCI A MANO NEL DOCUMENTO DI CASSA. Scelta di Enzo: una
     voce "già registrata" vale come PAGATA (o incassata) ed entra fra i
     movimenti; le "previste" restano fuori. Le entrate si sommano
     all'entrato, le uscite all'uscito; quelle negli anticipi seguono la
     regola degli anticipi: fuori dall'uscito, dentro gli anticipati e fra
     le partite da recuperare. */
  R.cassa.aMano = {};
  _ceVociAnno(anno).forEach(function(v){
    if(!_ceContaPerMe(v, PRO, AG)) return;
    if(v.natura === 'previsto') return;
    var imp = _ceN(v.importo);
    if(!imp) return;
    var sez = v.sezione || 'struttura';
    if(!R.eff[sez]) sez = 'struttura';
    if(!R.cassa.aMano[sez]) R.cassa.aMano[sez] = {tot:0, voci:[], det:[]};
    R.cassa.aMano[sez].tot = _ceArr(R.cassa.aMano[sez].tot + imp);
    R.cassa.aMano[sez].voci.push(v.etichetta || '(senza nome)');
    R.cassa.aMano[sez].det.push({et:(v.etichetta || '(senza nome)'), imp:_ceArr(imp), nota:'voce inserita a mano'});
  });
  Object.keys(R.cassa.aMano).forEach(function(sez){
    var t = R.cassa.aMano[sez].tot;
    var o = null;
    _sezTutte.forEach(function(x){ if(x.id === sez) o = x; });
    if(sez === 'diretti'){
      R.cassa.anticipati = _ceArr(R.cassa.anticipati + t);
      R.daRecuperare = _ceArr(R.daRecuperare + t);
    } else if(o && o.lato === 'entrate'){
      R.cassa.incassato = _ceArr(R.cassa.incassato + t);
    } else {
      R.cassa.uscito = _ceArr(R.cassa.uscito + t);
    }
  });
  R.cassa.saldo = _ceArr(R.cassa.incassato - R.cassa.uscito);

  /* PIPELINE — proposte accettate e trattative in corso, convertite nella
     tua quota con la percentuale ricavata sopra. Il pipeline dà la
     provvigione INTERA: senza conversione conterei anche la parte
     dell'agenzia come mia. */
  R.pipeline = null;
  /* [15 set 2026] Il pipeline è una fotografia di OGGI: proposte accettate e
     trattative aperte adesso. Sommarlo al conto del 2025 o del 2024 faceva
     comparire un utile provvisorio venuto dal nulla, senza nessuna riga che
     lo spiegasse. Vale solo per l'anno in corso. */
  var _annoOggi = new Date().getFullYear();
  /* [17 set 2026] le trattative non dicono di quale agente sono: con più
     agenti, nella vista del singolo agente non si possono attribuire */
  var _pipeAgentiMisti = (PRO === 'agente' && _ceAgentiTutti().length > 1);
  if(_pipeAgentiMisti && anno === _annoOggi){
    R.avvisi.push('Con più agenti le proposte e le trattative non sono ancora divise per agente: '
      + 'nel provvisorio di questa vista non compaiono (le trovi in quella del titolare)');
  }
  if(anno === _annoOggi && !_pipeAgentiMisti && typeof window._paCalcola === 'function'){
    try{
      var G = window._paCalcola();
      if(G){
        var gia = {};
        prov.forEach(function(p){
          if(!p) return;
          var st = String(p.statoPag||'').trim().toLowerCase();
          if((st === 'incassata' || st === 'parzialmente incassata')
             && p.immRef !== undefined && p.immRef !== null) gia[String(p.immRef)] = true;
        });
        var f = R.percAgente/100;
        /* nella vista del titolare il ricavo è la provvigione intera */
        var fRic = (PRO === 'titolare') ? 1 : f;
        /* [16 set 2026] Le due righe del pipeline non avevano il dettaglio,
           quindi niente segno + e nessun modo di sapere QUALI affari le
           compongono. Ora ogni trattativa diventa una riga del dettaglio,
           già convertita nella tua quota come il totale. */
        var somma = function(arr){
          var t = 0, q = 0, det = [];
          (arr||[]).forEach(function(x){
            if(!x) return;
            if(x.immIdx !== undefined && gia[String(x.immIdx)]) return;
            var val = _ceN(x.valore);
            t += val; q++;
            var pezzi = String(x.nota || '').split(' · ').slice(0, 2).join(' · ');
            det.push({
              et: (x.titolo || 'trattativa') + (x.prop ? ' · ' + x.prop : ''),
              imp: _ceArr(val * fRic),
              nota: (pezzi ? pezzi + ' · ' : '') + 'provvigione intera ' + _ceE(_ceArr(val))
            });
          });
          return {t:_ceArr(t), q:q, det:det};
        };
        var acc = somma(G.accettate), cor = somma(G.inCorso);
        R.pipeline = {accettate:{t:acc.t, q:acc.q}, inCorso:{t:cor.t, q:cor.q}, perc:R.percAgente};
        if(PRO === 'titolare'){
          agg('prev', 'ricavi', 'Proposte accettate', acc.t,
              acc.q + ' in attesa di rogito · provvigione intera', acc.det);
          agg('prev', 'ricavi', 'Trattative in corso', cor.t,
              cor.q + ' proposte aperte · provvigione intera', cor.det);
          agg('prev', 'agenti', 'Quote agenti stimate', _ceArr((acc.t + cor.t)*f),
              'sulle proposte e trattative · ' + R.percAgente + '% del volume, come quest\'anno');
        } else {
        agg('prev', 'ricavi', 'Proposte accettate', _ceArr(acc.t*f),
            acc.q + ' in attesa di rogito · tua quota al ' + R.percAgente + '%', acc.det);
        agg('prev', 'ricavi', 'Trattative in corso', _ceArr(cor.t*f),
            cor.q + ' proposte aperte · tua quota al ' + R.percAgente + '%', cor.det);
        }
      }
    }catch(e){ console.warn('[Bilancio agenzia] pipeline KO:', e); }
  }

  /* totali delle due viste */
  var tot = function(vista){
    var r = {};
    _sezTutte.forEach(function(x){
      var e = R.eff[x.id] ? R.eff[x.id].tot : 0;
      var p = (vista === 'prev' && R.prev[x.id]) ? R.prev[x.id].tot : 0;
      r[x.id] = _ceArr(e + p);
    });
    /* nel conto economico gli anticipi valgono solo per la parte NON ancora
       rimborsata: quella rientrata non è né guadagno né spesa */
    var apertiEff = 0;
    R.eff.diretti.righe.forEach(function(x){ apertiEff += _ceN(x.impAperto); });
    r.diretti = _ceArr(apertiEff + (vista === 'prev' ? R.prev.diretti.tot : 0));

    /* somme per LATO: così una sezione nuova entra nei totali senza che
       nessun conto vada riscritto a mano */
    var entrate = 0, uscite = 0;
    _sezTutte.forEach(function(x){
      if(x.lato === 'entrate') entrate += r[x.id];
      else uscite += r[x.id];
    });
    r.ricavi = _ceArr(entrate);
    r.costi  = _ceArr(uscite);
    /* il risultato ante imposte esclude le sole imposte, che chiudono in fondo */
    r.anteImposte = _ceArr(r.ricavi - (r.costi - r.imposte));
    r.utile = _ceArr(r.anteImposte - r.imposte);
    r.margine = r.anteImposte;
    return r;
  };
  R.totEff  = tot('eff');
  R.totPrev = tot('prev');

  if(!R.quanteProv) R.avvisi.push('Nessuna provvigione datata ' + anno);
  if(!Object.keys(perTipo).length) R.avvisi.push('Nessuna spesa registrata nel ' + anno);
  if(!qT) R.avvisi.push('Nessun F24 con scadenza nel ' + anno);

  /* [15 set 2026] CONTROLLI SUI DATI. Gli avvisi sopra dicono cosa MANCA;
     questi dicono cosa NON TORNA. Sono le anomalie che finora ho trovato per
     caso guardando i numeri: meglio che le veda il gestionale ogni volta. */
  prov.forEach(function(p){
    if(!p || _ceAnno(p.data) !== anno) return;
    if(PRO === 'agente' && !_ceProvDiAgente(p, AG)) return;
    var et = p.descr || p.acquirente || p.venditore || 'provvigione senza descrizione';
    var lo = _ceN(p.quotaAgenteLordo) || _ceN(p.quotaAgente);
    var ne = _ceN(p.quotaAgenteNetto);
    var to = _ceN(p.totale) || (_ceN(p.quotaA) + _ceN(p.quotaV));
    if(to > 0 && lo > to){
      R.controlli.push({et:et, msg:'la tua quota (' + _ceE(lo)
        + ') supera il totale della provvigione (' + _ceE(to) + ')'});
    }
    if(ne > 0 && lo > 0 && ne > lo){
      R.controlli.push({et:et, msg:'la quota netta è maggiore della lorda — trattenuta negativa'});
    }
    if(to > 0 && lo <= 0){
      R.controlli.push({et:et, msg:'provvigione senza quota agente: non entra nel tuo bilancio'});
    }
  });
  (Array.isArray(D.provvigioni) ? D.provvigioni : []).forEach(function(p){
    if(p && !objCeData(p.data)){
      R.controlli.push({et:(p.descr || p.acquirente || 'provvigione'),
        msg:'senza data: non rientra in nessun anno e resta fuori da ogni bilancio'});
    }
  });
  ai.forEach(function(a){
    if(!a || a._fonteF24 || _ceAnno(a.data) !== anno) return;
    if(!_ceContaPerMe(a, PRO, AG)) return;
    if(!a.tipo) R.controlli.push({et:(a.descr || a.cliente || 'voce senza nome'),
      msg:'spesa senza tipo: finisce fra le spese di struttura per esclusione'});
  });
  /* anticipi fermi da troppo: soldi tuoi in mano ad altri */
  var oggiMs = new Date().getTime();
  ai.forEach(function(a){
    if(!a || a._fonteF24 || _ceAnno(a.data) !== anno) return;
    if(!_ceContaPerMe(a, PRO, AG)) return;
    if(String(a.direzione||'') !== 'uscita') return;
    if(_ceSezioneDi(a.tipo) !== 'diretti') return;
    if(String(a.stato||'').trim().toLowerCase() === 'incassata') return;
    var d = objCeData(a.data);
    if(!d) return;
    var giorni = Math.floor((oggiMs - new Date(d.anno, d.mese-1, d.giorno).getTime()) / 86400000);
    if(giorni >= 90){
      R.controlli.push({et:(a.cliente || a.descr || a.tipo),
        msg:'anticipo di ' + _ceE(_ceN(a.importo)) + ' non rimborsato da ' + giorni + ' giorni'});
    }
  });
  return R;
}

/* ── pagina ────────────────────────────────────────────────────────────── */

var _ceAnnoSel = new Date().getFullYear();
/* [17 set 2026] PROSPETTIVA. 'agente' è il bilancio di chi lavora a quota
   (ricavo = quota agente); 'titolare' è quello dell'agenzia (ricavo = intera
   provvigione, costo = quota netta degli agenti). Solo admin e manager
   vedono il titolare. */
var _cePros = 'agente';
var _ceAgenteSel = '';      /* uuid dell'agente guardato; vuoto = predefinito */
function _cePuoTitolare(){
  var u = null;
  try{ u = window._currentUser || null; }catch(e){}
  var r = String((u && (u.ruolo || u.role)) || '').toLowerCase();
  return r === 'admin' || r === 'manager';
}
function _ceProsEff(){
  return (_cePros === 'titolare' && _cePuoTitolare()) ? 'titolare' : 'agente';
}
function _ceAgentiTutti(){
  return (window.D && Array.isArray(window.D.agenti))
    ? window.D.agenti.filter(function(a){ return a && a.uuid; }) : [];
}
function _ceAgenteDefault(){
  try{ if(typeof window._spesaAgenteDefault === 'function') return window._spesaAgenteDefault() || ''; }catch(e){}
  return '';
}
function _ceAgenteEff(){
  if(_ceAgenteSel && _cePuoTitolare() && _ceAgentiTutti().some(function(a){ return a.uuid === _ceAgenteSel; })) return _ceAgenteSel;
  return _ceAgenteDefault();
}
/* una spesa, un F24 o una voce a mano entra nel conto guardato? */
function _ceContaPerMe(rec, pro, ag){
  var c = null;
  try{ if(typeof window._spesaDiChi === 'function') c = window._spesaDiChi(rec); }catch(e){}
  if(!c) return pro !== 'titolare';          /* gestionale senza il campo: tutto dell'agente */
  if(pro === 'titolare') return c.tipo === 'agenzia';
  return c.tipo === 'agente' && (!ag || !c.agenteUuid || c.agenteUuid === ag);
}
/* una provvigione appartiene all'agente guardato? Senza agente indicato vale
   la stessa regola delle spese: è dell'agente predefinito */
/* [24 set 2026] QUANTO DI UNA PROVVIGIONE TI È ARRIVATO E QUANTO RESTA.
   Una funzione sola, usata dal Bilancio E da Provvigioni attese
   (window._provIncassoAgente): così le due pagine non possono raccontare
   due storie diverse sullo stesso affare. */
function _ceIncassoAgente(p){
  var avvisi = [];
  var lordo = _ceN(p.quotaAgenteLordo) || _ceN(p.quotaAgente);
  var netto = _ceN(p.quotaAgenteNetto);
    var ricevuto = 0, movimenti = [];
    if(Array.isArray(p.modAgenteRighe) && p.modAgenteRighe.length){
      var _nfTot = 0, _fattTot = 0;
      p.modAgenteRighe.forEach(function(r){
        var q = _ceN(r && r.imp); if(q <= 0) return;
        if(r.dest === 'fatt'){ _fattTot += q; return; }
        _nfTot += q;
        movimenti.push({et:'Incassato' + (r.mod ? ' — ' + r.mod : '') + ' (NF)', imp:q, mod:r.mod||''});
      });
      ricevuto = _nfTot;
      if(_fattTot > 0){
        var FP = _ceFatturePerProv(p.uuid);
        if(FP.trovate){
          /* mai più di quanto la scheda destina alla fattura: se sulla stessa
             provvigione sono agganciate più fatture (lato agenzia e lato
             agente) non si somma due volte lo stesso denaro */
          var _daFatt = Math.min(FP.pagato, _fattTot);
          ricevuto += _daFatt;
          FP.righe.forEach(function(x){ if(x.imp > 0) movimenti.push(x); });
          if(FP.nonAttribuito > 0.009) avvisi.push('sulla fattura ' + FP.numeriNonAttr.join(', ') + ' ci sono pagamenti per ' + _ceE(FP.nonAttribuito)
              + ' non attribuiti a nessuna voce: apri la fattura e indica "va su"');
        } else {
          ricevuto += _fattTot;
          movimenti.push({et:'Fattura non trovata — contata come incassata', imp:_fattTot, mod:''});
          avvisi.push('la scheda destina ' + _ceE(_fattTot) + ' a una fattura che non risulta agganciata: '
              + 'contati come incassati finché non la ritrovi o non registri il pagamento');
        }
      }
    }
    /* [15 set 2026] QUELLO CHE TI SPETTA È IL NETTO, non il lordo.
       Sul lordo comparivano "restano 52,50" su provvigioni saldate: erano le
       trattenute ufficio, già contate fra le spese di struttura. Contarle
       anche come credito le faceva pesare due volte. Stessa scelta del
       gestionale, che alla riga ~30127 usa quotaAgenteNetto come _agtSpetta. */
    var spetta = (netto > 0) ? netto : lordo;
    if(ricevuto <= 0 && p.agtIncassato === true) ricevuto = spetta;
    if(ricevuto > spetta){
      /* [15 set 2026] È il caso del Ref.0007: quota agente 600 e un pagamento
         registrato da 1.500, cioè l'intera provvigione finita nel campo
         sbagliato. Il calcolo si protegge limitando, ma il dato resta storto
         e va corretto nella scheda: meglio dirlo che nasconderlo. */
      avvisi.push('pagamento agente registrato di ' + _ceE(ricevuto) + ' a fronte di una quota di '
             + _ceE(spetta) + ' — controlla il campo pagamenti nella scheda provvigione');
      ricevuto = spetta;
    }
    ricevuto = _ceArr(ricevuto);
    var abbuono = _ceN(p.abbuono);
    var resta = _ceArr(Math.max(0, spetta - ricevuto - abbuono));
  return {spetta:spetta, ricevuto:ricevuto, movimenti:movimenti, abbuono:abbuono,
          resta:resta, avvisi:avvisi,
          /* le righe della scheda ci sono: il conto viene dai documenti */
          daDocumenti:(Array.isArray(p.modAgenteRighe) && p.modAgenteRighe.length > 0)};
}
window._provIncassoAgente = _ceIncassoAgente;
/* [24 set 2026] Quanto è stato PAGATO, sulle fatture, per questa provvigione.
   Una fattura appartiene a una provvigione in due modi:
   - intera, con la targa sulla fattura (_provUuid): le fatture automatiche e
     quelle con una sola provvigione;
   - per voce, con la targa sulla voce: le fatture che ne coprono più d'una
     (accorpate). Se è pagata per intero, ogni voce è pagata per intero; se
     è pagata in parte, conta solo il pagamento con "va su" = questa
     provvigione, e quelli senza indicazione si segnalano. */
function _ceFatturePerProv(uuid){
  var out = {trovate:false, pagato:0, righe:[], nonAttribuito:0, numeriNonAttr:[]};
  if(!uuid) return out;
  var F = Array.isArray(D.fatture) ? D.fatture : [];
  F.forEach(function(f){
    if(!f) return;
    var voci = Array.isArray(f.voci) ? f.voci : [];
    var targheVoci = voci.map(function(v){ return v && v._provUuid; }).filter(Boolean);
    var mieVoci = voci.filter(function(v){ return v && v._provUuid === uuid; });
    var intera = (f._provUuid === uuid) && !targheVoci.some(function(t){ return t !== uuid; });
    if(!intera && !mieVoci.length) return;
    out.trovate = true;
    var sommaVoci = voci.reduce(function(t, v){ return t + _ceN(v && v.imp); }, 0);
    var quota = intera ? (sommaVoci || _ceN(f.imponibile) || _ceN(f.totale))
                       : mieVoci.reduce(function(t, v){ return t + _ceN(v.imp); }, 0);
    var pag = Array.isArray(f.pagamenti) ? f.pagamenti : [];
    var pagTot = pag.reduce(function(t, x){ return t + _ceN(x && x.importo); }, 0);
    var mio;
    var distinte = {}; targheVoci.forEach(function(t){ distinte[t] = 1; });
    if(f._provUuid) distinte[f._provUuid] = 1;
    if(intera || Object.keys(distinte).length <= 1){
      mio = Math.min(pagTot, quota);
    } else if(pagTot >= (_ceN(f.totale) || sommaVoci) - 0.01){
      mio = quota;
    } else {
      mio = 0; var senza = 0;
      pag.forEach(function(x){
        if(!x) return;
        if(x.provUuid === uuid) mio += _ceN(x.importo);
        else if(!x.provUuid) senza += _ceN(x.importo);
      });
      mio = Math.min(mio, quota);
      if(senza > 0.009){ out.nonAttribuito += senza; out.numeriNonAttr.push(f.numero || '?'); }
    }
    mio = _ceArr(mio);
    out.pagato = _ceArr(out.pagato + mio);
    out.righe.push({et:'Fattura ' + (f.numero || '?') + (mio < quota - 0.009
                      ? ' — pagati ' + _ceE(mio) + ' su ' + _ceE(quota) : ''),
                    imp:mio, mod:'fattura ' + (f.numero || '')});
  });
  return out;
}
function _ceProvDiAgente(p, ag){
  if(!ag) return true;
  var a = null;
  try{ if(typeof window._agenteDi === 'function') a = window._agenteDi(p); }catch(e){}
  if(a && a.uuid) return a.uuid === ag;
  var def = _ceAgenteDefault();
  return !def || ag === def;
}
var _ceVista = 'effettivo';        /* effettivo | provvisorio | confronto */
var _ceDoc = 'economico';          /* economico | cassa | mensile | costi | ai */
var _ceFormSez = null;             /* sezione con il form aperto */
var _ceAperte = {};                /* righe espanse: chiave -> true */
function _ceData(v){
  var m = String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1].slice(2)) : String(v||'');
}
var _ceEditId = null;

/* ── PROSPETTO A SEZIONI CONTRAPPOSTE ──────────────────────────────────
   [14 set 2026] Costi a sinistra, ricavi a destra, come chiesto da Enzo.
   È la forma classica a sezioni divise: i due lati DEVONO quadrare, e a
   pareggiare è il risultato — l'utile si iscrive fra i costi, la perdita
   fra i ricavi. Senza quella riga il prospetto non tornerebbe mai.
   I calcoli restano quelli di ceCalcola, qui si disegna soltanto. */

/* ── PROSPETTO A SEZIONI AFFIANCATE ────────────────────────────────────
   [14 set 2026 · rifatto] Ricavi a sinistra, costi a destra, come chiesto.

   PERCHÉ RIFATTO: il primo tentativo usava flex-wrap con min-width, quindi
   appena la finestra si stringeva i due lati andavano a capo e si
   impilavano. Non era affiancato davvero. Ora è una griglia a due colonne
   che resta tale fino a 760px, e i due lati chiudono alla STESSA altezza
   perché il totale è ancorato in fondo (margin-top:auto).

   Le cifre usano tabular-nums: in un prospetto le colonne di numeri devono
   incolonnarsi, altrimenti non si legge.

   La quadratura resta la regola: utile fra i costi, perdita fra i ricavi. */

var CE_CSS = ''
/* [2 ott 2026] la pagina usa tutta la larghezza (prima 1040px fissi lasciavano
   due bande vuote) e le due colonne sono schede separate alte quanto il loro
   contenuto, invece di una griglia unica dove la colonna corta restava vuota */
+ '#ce-wrap .ce-doc{max-width:1560px;margin:0 auto}'
+ 'html body #ce-wrap .ce-testa{margin-bottom:14px!important;flex-wrap:wrap}'
+ '#ce-wrap .ce-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:14px}'
+ 'html body #ce-wrap .ce-card{padding:14px 16px!important;cursor:default}'
+ 'html body #ce-wrap .ce-card:hover{transform:none}'
+ '#ce-wrap .ce-kico{order:0;width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;'
+   'background:color-mix(in srgb,currentColor 12%,transparent);margin-bottom:8px}'
+ 'html body #ce-wrap .ce-card .val{font-size:1.45rem!important}'
+ '#ce-wrap .ce-info{display:flex;align-items:flex-start;gap:9px;background:var(--bg2);border:1px solid var(--border);'
+   'border-radius:12px;padding:9px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--text2);line-height:1.5}'
+ 'html body #ce-wrap .ce-doc .ce-grid{background:transparent!important;border:none!important;border-radius:0!important;'
+   'overflow:visible!important;gap:14px;align-items:start}'
+ 'html body #ce-wrap .ce-doc .ce-grid > .ce-col{background:var(--bg2);border:1px solid var(--border)!important;'
+   'border-radius:14px!important;overflow:hidden}'
+ '#ce-wrap .ce-col .ce-fine{margin-top:0}'
+ 'html body #ce-wrap .ce-doc .ce-riga{padding-top:7px!important;padding-bottom:7px!important}'
+ 'html body:not(.dark-mode) #ce-wrap{background:#F8FAFC!important}'
+ '#ce-wrap .ce-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;'
+   'border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg)}'
+ '#ce-wrap .ce-col{display:flex;flex-direction:column;min-width:0}'
+ '#ce-wrap .ce-col + .ce-col{border-left:1px solid var(--border)}'
+ '#ce-wrap .ce-head{padding:11px 16px;font-weight:700;font-size:0.95rem;letter-spacing:-.2px;'
+   'border-bottom:2px solid currentColor}'
+ '#ce-wrap .ce-sez{display:flex;justify-content:space-between;gap:12px;padding:9px 16px;'
+   'background:var(--bg2);border-bottom:1px solid var(--border);font-weight:700;font-size:0.84rem}'
+ '#ce-wrap .ce-riga{display:flex;justify-content:space-between;gap:12px;padding:6px 16px 6px 30px;'
+   'border-bottom:1px solid var(--border);font-size:0.86rem;align-items:baseline}'
+ '#ce-wrap .ce-riga:nth-of-type(even){background:rgba(127,127,127,.04)}'
+ '#ce-wrap .ce-num{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}'
+ '#ce-wrap .ce-vuoto{padding:8px 16px 8px 30px;color:var(--text3);font-size:0.82rem;'
+   'border-bottom:1px solid var(--border)}'
+ '#ce-wrap .ce-prev{color:#8A6A18;font-style:italic}'
+ '#ce-wrap .ce-vuoto-prev{color:#8A6A18;font-style:italic;cursor:pointer}'
+ '#ce-wrap .ce-vuoto-prev:hover{text-decoration:underline}'
+ '#ce-wrap .ce-ris{display:flex;justify-content:space-between;gap:12px;padding:10px 16px;'
+   'font-weight:700;font-size:0.9rem;border-top:1px solid var(--border)}'
+ '#ce-wrap .ce-fine{margin-top:auto;display:flex;justify-content:space-between;gap:12px;'
+   'padding:11px 16px;border-top:2px solid var(--text);font-weight:800;font-size:0.9rem}'
+ '#ce-wrap .ce-add{padding:4px 16px 10px 30px}'
+ '#ce-wrap .ce-ling{display:flex;gap:8px;flex-wrap:wrap}'
+ '#ce-wrap .ce-anno{width:auto;font-size:1.5rem;font-weight:800;letter-spacing:-.4px;'
+   'padding:0 26px 0 6px;height:auto;line-height:1;border:0;border-bottom:2px solid var(--brand);'
+   'border-radius:0;background:transparent;color:var(--brand);cursor:pointer;'
+   'appearance:none;-webkit-appearance:none;'
+   'background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%232563EB\' stroke-width=\'3\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E");'
+   'background-repeat:no-repeat;background-position:right 4px center}'
+ '#ce-wrap .ce-anno:hover{background-color:rgba(37,99,235,.07)}'
+ '#ce-wrap .ce-det.liv2{padding-left:68px;font-size:0.77rem;'
+   'background:rgba(127,127,127,.03);border-bottom:1px dotted var(--border)}'
+ '#ce-wrap .ce-det.saldo{font-style:italic;font-weight:600}'
+ '#ce-wrap .ce-cmd{display:inline-flex;gap:3px;margin-right:9px;vertical-align:middle;'
+   'opacity:.45;transition:opacity .13s}'
+ '#ce-wrap .ce-riga.mano:hover .ce-cmd, #ce-wrap .ce-sez.mano:hover .ce-cmd{opacity:1}'
/* [15 set 2026] I comandi delle sezioni create da Enzo restano sempre visibili:
   nascosti finché non ci passavi sopra col mouse, non si trovavano. */
+ '#ce-wrap .ce-sez.mano .ce-cmd{opacity:.75;margin-right:0;margin-left:8px}'
+ '#ce-wrap .ce-cmd button{background:var(--bg2);border:1px solid var(--border);border-radius:6px;'
+   'padding:3px 5px;cursor:pointer;color:var(--text2);line-height:0;font-family:inherit}'
+ '#ce-wrap .ce-cmd button:hover{background:var(--bg3);color:var(--text)}'
+ '#ce-wrap .ce-riga.mano{border-left:3px solid var(--brand)}'
+ '@media (hover:none){#ce-wrap .ce-cmd{opacity:1}}'
+ '#ce-wrap .ce-l{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;'
+   'border-radius:10px;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;'
+   'font-family:inherit;font-size:0.81rem;font-weight:700;color:var(--text2);'
+   'transition:all .15s;line-height:1}'
+ '#ce-wrap .ce-l:hover{border-color:var(--text3);color:var(--text)}'
+ '#ce-wrap .ce-l .pall{width:7px;height:7px;border-radius:50%;background:currentColor;'
+   'opacity:.35;flex-shrink:0}'
+ '#ce-wrap .ce-l.on .pall{opacity:1}'
+ '#ce-wrap .ce-l.on{color:#fff;border-color:transparent;box-shadow:0 2px 8px rgba(0,0,0,.14)}'
+ '#ce-wrap .ce-l.on .pall{background:rgba(255,255,255,.95)}'
+ '#ce-wrap .ce-l.eff.on{background:#0F5132}'
+ '#ce-wrap .ce-l.prv.on{background:#B45309}'
+ '#ce-wrap .ce-l.cnf.on{background:#1E3A8A}'
+ '#ce-wrap .ce-l.eff{border-radius:10px 10px 10px 10px}'
+ '#ce-wrap .ce-l.prv{border-radius:10px 20px 20px 10px}'
+ '#ce-wrap .ce-l.cnf{border-radius:20px}'
+ '#ce-wrap .ce-riga.apri{cursor:pointer}'
+ '#ce-wrap .ce-riga.apri:hover{background:rgba(127,127,127,.09)}'
+ '#ce-wrap .ce-sp{display:inline-flex;align-items:center;justify-content:center;width:15px;'
+   'height:15px;border:1px solid var(--border);border-radius:4px;margin-right:7px;'
+   'font-size:11px;line-height:1;color:var(--text2);flex-shrink:0}'
+ '#ce-wrap .ce-det{display:flex;justify-content:space-between;gap:12px;'
+   'padding:4px 16px 4px 52px;font-size:0.8rem;color:var(--text2);'
+   'border-bottom:1px solid var(--border);background:rgba(127,127,127,.05)}'
+ '@media (max-width:760px){#ce-wrap .ce-grid{grid-template-columns:1fr}'
+   '#ce-wrap .ce-col + .ce-col{border-left:0;border-top:2px solid var(--border)}'
+   '#ce-wrap .ce-fine{margin-top:0}}';

var CE_TINTA = {ricavi:'#0F5132', costi:'#7F1D1D'};

/* [14 set 2026] Un'etichetta colorata sotto il titolo: la linguetta da sola
   non bastava a far capire quale conto si sta guardando, soprattutto dopo
   aver scorso la pagina. */
function _ceVal(R, sez, vista){
  var base;
  if(sez === 'diretti' && _ceDoc === 'economico'){
    base = 0;
    R.eff.diretti.righe.forEach(function(x){ base += _ceN(x.impAperto); });
    base = _ceArr(base);
  } else base = R.eff[sez].tot;
  return (vista === 'prev') ? _ceArr(base + R.prev[sez].tot) : base;
}
function _ceRigheDi(R, sez, conPrev){
  /* il campo det va riportato: senza, il dettaglio calcolato si perde qui
     e le righe non si aprirebbero mai */
  /* nel conto economico una riga di anticipo vale per la parte ancora aperta,
     e sparisce quando è tutta rientrata */
  var aperti = (sez === 'diretti' && _ceDoc === 'economico');
  var out = R.eff[sez].righe.map(function(r){
    if(aperti){
      return {et:r.et, imp:_ceN(r.impAperto), nota:r.notaAperto || r.nota,
              det:r.detAperto, voceId:r.voceId, prev:false, saltaSeZero:true};
    }
    return {et:r.et, imp:r.imp, nota:r.nota, det:r.det, voceId:r.voceId, prev:false}; })
    .filter(function(r){ return !(r.saltaSeZero && r.imp <= 0.009); });
  if(conPrev) out = out.concat(R.prev[sez].righe.map(function(r){
    return {et:r.et, imp:r.imp, nota:r.nota, det:r.det, voceId:r.voceId, prev:true}; }));
  return out;
}

function _ceColonna(R, titolo, sezioni, vista, conPrev, tinta){
  var lato = (titolo === 'Entrate') ? 'entrate' : 'uscite';
  var h = '<div class="ce-col">'
    + '<div class="ce-head" style="color:' + tinta + '">' + titolo + '</div>';
  sezioni.forEach(function(sez){
    var righe = _ceRigheDi(R, sez, conPrev);
    if(sez === 'diretti' && _ceDoc === 'economico' && !righe.length) return;
    if(sezioni.length > 1 || righe.length){
      var oSez = _ceSezioneObj(sez);
      var mieiCmd = (oSez && !oSez.fissa)
        ? '<span class="ce-cmd" style="margin-left:8px">'
          + '<button title="Rinomina la sezione" onclick="_ceRinominaSezione(\'' + sez + '\')">'
          + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
          + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
          + '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>'
          + '<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
          + '<button title="Elimina la sezione" onclick="_ceEliminaSezione(\'' + sez + '\')" '
          + 'style="color:#B91C1C"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" '
          + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
          + '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>'
          + '</svg></button></span>'
        : '';
      h += '<div class="ce-sez' + (mieiCmd ? ' mano' : '') + '"><span>' + _ceNomeSez(sez)
        + mieiCmd + '</span>'
        + '<span class="ce-num">' + _ceE(_ceVal(R, sez, vista)) + '</span></div>';
    }
    /* [16 set 2026] Nella vista Effettivo le voci previste sono escluse di
       proposito, ma la sezione diceva solo "Nessuna voce registrata": una
       voce appena salvata come prevista sembrava persa. Ora lo si dice, con
       il totale, e un tocco porta al Provvisorio dove la voce si vede. */
    var nascoste = (!conPrev && _ceDoc === 'economico' && R.prev[sez])
      ? R.prev[sez].righe.filter(function(x){ return _ceN(x.imp) !== 0; }) : [];
    var avvisoPrev = '';
    if(nascoste.length){
      var totN = 0;
      nascoste.forEach(function(x){ totN += _ceN(x.imp); });
      avvisoPrev = '<div class="ce-vuoto ce-vuoto-prev" onclick="_ceVaiVista(\'provvisorio\')" '
        + 'title="Apri il conto provvisorio">'
        + (nascoste.length === 1 ? '1 voce prevista' : nascoste.length + ' voci previste')
        + ' (' + _ceE(_ceArr(totN)) + ') — '
        + (nascoste.length === 1 ? 'visibile' : 'visibili') + ' nel Provvisorio</div>';
    }
    if(!righe.length){
      h += avvisoPrev || '<div class="ce-vuoto">Nessuna voce registrata</div>';
      avvisoPrev = '';
    }
    righe.forEach(function(r, idx){
      var chiave = sez + ':' + idx + (r.prev ? ':p' : '');
      var apribile = !!(r.det && r.det.length);
      var aperta = apribile && _ceAperte[chiave];
      var cmd = '';
      if(r.voceId){
        cmd = '<span class="ce-cmd">'
          + '<button title="Modifica questa voce" onclick="event.stopPropagation();_ceModificaVoce(\''
          + r.voceId + '\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" '
          + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
          + '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>'
          + '<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
          + '<button title="Elimina questa voce" onclick="event.stopPropagation();_ceEliminaVoce(\''
          + r.voceId + '\')" style="color:#B91C1C"><svg width="13" height="13" viewBox="0 0 24 24" '
          + 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
          + 'stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/>'
          + '<path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>'
          + '<path d="M10 11v6M14 11v6"/></svg></button></span>';
      }
      h += '<div class="ce-riga' + (apribile ? ' apri' : '') + (r.voceId ? ' mano' : '') + '"'
        + (apribile ? ' onclick="_ceApriDettaglio(\'' + chiave + '\')"'
            + ' title="Mostra le voci che compongono questo importo"' : '')
        + '>'
        + '<span' + (r.prev ? ' class="ce-prev"' : '') + '>'
        + (apribile ? '<span class="ce-sp">' + (aperta ? '−' : '+') + '</span>' : '')
        + _ceEsc(r.et)
        + (r.nota ? '<span style="display:block;font-size:0.71rem;color:var(--text3);font-style:normal">'
            + _ceEsc(r.nota) + '</span>' : '') + '</span>'
        + '<span class="ce-num' + (r.prev ? ' ce-prev' : '') + '">' + cmd + _ceE(r.imp) + '</span></div>';
      if(aperta){
        /* [15 set 2026] Nel conto economico il dettaglio dice QUALI AFFARI
           compongono la categoria. I movimenti (acconti, rimborsi, residui)
           appartengono al documento di cassa: mostrarli qui era ciò che
           rendeva il prospetto un estratto conto. */
        var righeDet = (_ceDoc === 'cassa') ? r.det : r.det.filter(function(x){ return !x.liv; });
        righeDet.forEach(function(d){
          var neg = d.imp < 0;
          var cls = 'ce-det' + (d.liv ? ' liv2' : '') + (d.saldo ? ' saldo' : '');
          var col = neg ? 'color:#B91C1C' : (d.saldo ? 'color:var(--text2)' : '');
          var notaD = (_ceDoc === 'cassa' && d.notaCassa) ? d.notaCassa : d.nota;
          h += '<div class="' + cls + '"><span style="' + col + '">'
            + (d.data ? _ceData(d.data) + ' · ' : '')
            + _ceEsc(d.et)
            + (notaD ? ' <span style="color:var(--text3)">(' + _ceEsc(notaD) + ')</span>' : '')
            + '</span><span class="ce-num" style="' + col + '">'
            + (neg ? '− ' + _ceE(-d.imp) : _ceE(d.imp)) + '</span></div>';
        });
      }
    });
    h += avvisoPrev;
    h += '<div class="ce-add"><button class="btn btn-outline btn-sm" '
      + 'onclick="_ceApriForm(\'' + sez + '\')" style="padding:2px 10px;font-size:0.73rem">'
      + 'Aggiungi voce</button></div>';
    if(_ceFormSez === sez) h += '<div style="padding:0 16px 12px 30px">' + _ceFormDiv(sez) + '</div>';
  });
  /* [15 set 2026] Creare una sezione propria. Ospita solo voci inserite a
     mano: le quattro di sistema restano perché sono i contenitori dei dati
     che il bilancio legge da solo. */
  h += '<div style="padding:6px 16px 12px;border-top:1px dashed var(--border)">'
    + '<button class="btn btn-outline btn-sm" onclick="_ceNuovaSezione(\'' + lato + '\')" '
    + 'style="padding:3px 11px;font-size:0.74rem">+ Nuova sezione fra le '
    + (lato === 'entrate' ? 'entrate' : 'uscite') + '</button></div>';
  return h;
}


/* [16 set 2026] Le righe delle voci a mano per un lato del documento di
   cassa, nell'ordine delle sezioni. Gli anticipi non stanno qui: hanno il
   loro blocco. Formato: [etichetta, importo, sottotitolo]. */
function _ceDetCassa(R, chiave){
  if(!chiave) return [];
  if(chiave.indexOf('mano:') === 0){
    var am = (R.cassa && R.cassa.aMano) || {};
    var x = am[chiave.slice(5)];
    return (x && x.det) ? x.det : [];
  }
  return (R.cassaDet && R.cassaDet[chiave]) ? R.cassaDet[chiave] : [];
}
function _ceRigheAMano(R, lato){
  var out = [];
  var am = (R.cassa && R.cassa.aMano) || {};
  var NOMI = {ricavi:'Entrate inserite a mano', struttura:'Spese di struttura inserite a mano',
              imposte:'Imposte inserite a mano'};
  _ceSezioni().forEach(function(x){
    if(x.id === 'diretti' || x.lato !== lato || !am[x.id]) return;
    out.push([NOMI[x.id] || x.nome, am[x.id].tot, am[x.id].voci.join(', '), 'mano:' + x.id]);
  });
  return out;
}

/* ── DOCUMENTO DI CASSA ────────────────────────────────────────────────
   [15 set 2026] Quanto è entrato e uscito davvero. Qui i movimenti, gli
   acconti e le partite aperte sono il contenuto, non un'intrusione. */
function _ceDocCassa(R){
  var C = R.cassa;
  var box = function(tit, righe, tot, tinta){
    var h = '<div class="ce-col" style="border:1px solid var(--border);border-radius:10px;overflow:hidden">'
      + '<div class="ce-head" style="color:' + tinta + '">' + tit + '</div>';
    righe.forEach(function(r){
      if(r[1] === null) return;
      /* [17 set 2026] il segno + come nel conto economico: apre l'elenco dei
         movimenti che compongono la riga */
      var det = _ceDetCassa(R, r[3]);
      var chiave = 'cassa:' + (r[3] || '');
      var apribile = det.length > 0;
      var aperta = apribile && _ceAperte[chiave];
      h += '<div class="ce-riga' + (apribile ? ' apri' : '') + '"'
        + (apribile ? ' onclick="_ceApriDettaglio(\'' + chiave + '\')" title="Mostra i movimenti"' : '') + '>'
        + '<span>' + (apribile ? '<span class="ce-sp">' + (aperta ? '−' : '+') + '</span>' : '') + r[0]
        + (r[2] ? '<span style="display:block;font-size:0.71rem;color:var(--text3)">' + r[2] + '</span>' : '')
        + '</span><span class="ce-num">' + _ceE(r[1]) + '</span></div>';
      if(aperta){
        det.forEach(function(d){
          h += '<div class="ce-det"><span>' + (d.data ? _ceData(d.data) + ' · ' : '') + _ceEsc(d.et)
            + (d.nota ? ' <span style="color:var(--text3)">(' + _ceEsc(d.nota) + ')</span>' : '')
            + '</span><span class="ce-num">' + _ceE(d.imp) + '</span></div>';
        });
      }
    });
    return h + '<div class="ce-fine"><span>Totale</span><span class="ce-num">'
      + _ceE(tot) + '</span></div></div>';
  };

  var tit = (R.prospettiva === 'titolare');
  var righeE = tit
    ? [['Provvigioni incassate dai clienti', C.quoteRicevute, 'quote di venditori e acquirenti segnate come pagate', 'clienti'],
       ['Altre entrate incassate', C.entrateIncassate, '', 'altreEntrate']]
    : [['Quote agente incassate (lorde)', C.quoteRicevute, R.quanteProv + ' provvigioni maturate nel ' + R.anno, 'quote'],
       ['Altre entrate incassate', C.entrateIncassate, '', 'altreEntrate']];
  var righeU = tit
    ? [['Compensi pagati agli agenti', C.pagatoAgenti, 'quote nette girate', 'agenti'],
       ['Spese di struttura pagate', C.pagatoStruttura, '', 'struttura'],
       ['F24 versati', C.pagatoImposte, '', 'imposte']]
    : [['Trattenute ufficio', C.trattenute, 'trattenute dall\'ufficio prima di pagarti', 'trattenute'],
       ['Spese di struttura pagate', C.pagatoStruttura, '', 'struttura'],
       ['F24 versati', C.pagatoImposte, '', 'imposte']];
  var h = '<div class="ce-grid">'
    + box('Entrato', righeE.concat(_ceRigheAMano(R, 'entrate')), C.incassato, CE_TINTA.ricavi)
    + box('Uscito', righeU.concat(_ceRigheAMano(R, 'uscite')), C.uscito, CE_TINTA.costi)
    + '</div>';
  if(C.aMano && Object.keys(C.aMano).length){
    h += '<div style="font-size:0.74rem;color:var(--text3);margin-top:6px">'
      + 'Le voci inserite a mano come "già registrata" sono contate come pagate o incassate; '
      + 'quelle "previste" restano fuori da questo documento.</div>';
  }

  var colS = C.saldo >= 0 ? CE_TINTA.ricavi : CE_TINTA.costi;
  h += '<div style="margin-top:12px;border:1px solid var(--border);border-radius:10px;padding:12px 16px;'
    + 'display:flex;justify-content:space-between;align-items:center;background:var(--bg2)">'
    + '<span style="font-weight:800">Saldo dei movimenti</span>'
    + '<span class="ce-num" style="font-size:1.3rem;font-weight:800;color:' + colS + '">'
    + _ceE(C.saldo) + '</span></div>';

  /* partite aperte */
  h += '<div style="margin-top:16px"><div style="font-weight:800;font-size:0.9rem;margin-bottom:8px">'
    + 'Partite aperte</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">'
    + [['Da incassare', R.daIncassare, tit ? 'provvigioni non ancora pagate dai clienti'
                                          : 'quote agente maturate e non ancora ricevute'],
       ['Da pagare', R.daPagare, tit ? 'compensi agenti, spese e F24 non ancora pagati'
                                    : 'spese di struttura e F24 non ancora versati'],
       ['Da recuperare', R.daRecuperare, 'anticipi per il cliente non rimborsati']]
      .map(function(x){
        return '<div style="border:1px solid var(--border);border-radius:10px;padding:11px 14px">'
          + '<div style="font-size:0.78rem;color:var(--text2);font-weight:600">' + x[0] + '</div>'
          + '<div class="ce-num" style="font-size:1.25rem;font-weight:800;margin-top:2px;text-align:left">'
          + _ceE(x[1]) + '</div>'
          + '<div style="font-size:0.72rem;color:var(--text3)">' + x[2] + '</div></div>';
      }).join('') + '</div></div>';

  /* gli affari uno per uno, coi loro movimenti: è il contenuto proprio di
     questo documento, non un'aggiunta */
  h += _ceBloccoMovimenti(R, 'ricavi', 'mov-q', 'Entrate e loro incassi',
        'Incassato nel ' + R.anno, R.cassa.incassato, 'maturato nel ' + R.anno);
  if(C.anticipati > 0){
    h += _ceBloccoMovimenti(R, 'diretti', 'mov-a', 'Anticipi per il cliente',
          'Anticipati ' + _ceE(C.anticipati) + ', recuperati ' + _ceE(C.recuperati),
          _ceArr(C.anticipati - C.recuperati), 'ancora da recuperare', true)
      + '<div style="font-size:0.76rem;color:var(--text3);margin-top:8px;line-height:1.6">'
      + 'Gli anticipi non entrano nel conto economico: non sono un tuo guadagno né una tua spesa, '
      + 'sono soldi che anticipi e che il cliente ti restituisce.</div>';
  }
  return h;
}

/* [15 set 2026] etTestata dice COSA È il numero in cima, e netto chiede di
   mostrare il saldo invece del lordo. Senza, in una colonna con movimenti
   negativi il totale in testa sembrava una somma sbagliata: sugli anticipi
   si leggeva 650 sopra righe che facevano 500. */
function _ceBloccoMovimenti(R, sez, pref, titolo, etTot, valTot, etTestata, netto){
  var righe = R.eff[sez].righe;
  if(!righe.length) return '';
  var valTestata = R.eff[sez].tot;
  if(netto){
    valTestata = 0;
    righe.forEach(function(r){
      valTestata += _ceN(r.imp);
      (r.det || []).forEach(function(d){ if(d.imp < 0) valTestata += _ceN(d.imp); });
    });
    valTestata = _ceArr(valTestata);
  }
  var h = '<div style="margin-top:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden">'
    + '<div class="ce-sez"><span>' + titolo
    + (etTestata ? '<span style="display:block;font-size:0.71rem;color:var(--text3);'
        + 'font-weight:600">' + etTestata + '</span>' : '')
    + '</span><span class="ce-num">' + _ceE(valTestata) + '</span></div>';
  righe.forEach(function(r, idx){
    var chiave = pref + ':' + idx;
    var ha = !!(r.det && r.det.length);
    var aperta = ha && _ceAperte[chiave];
    var nota = r.notaCassa || r.nota;
    var impRiga = _ceN(r.imp);
    if(netto){
      (r.det || []).forEach(function(d){ if(d.imp < 0) impRiga += _ceN(d.imp); });
      impRiga = _ceArr(impRiga);
    }
    h += '<div class="ce-riga' + (ha ? ' apri' : '') + '"'
      + (ha ? ' onclick="_ceApriDettaglio(\'' + chiave + '\')"' : '') + '>'
      + '<span>' + (ha ? '<span class="ce-sp">' + (aperta ? '−' : '+') + '</span>' : '')
      + _ceEsc(r.et)
      + (nota ? '<span style="display:block;font-size:0.71rem;color:var(--text3)">'
          + _ceEsc(nota) + '</span>' : '')
      + '</span><span class="ce-num">' + _ceE(impRiga) + '</span></div>';
    if(aperta){
      r.det.forEach(function(d){
        var neg = d.imp < 0;
        var nd = d.notaCassa || d.nota;
        h += '<div class="ce-det' + (d.liv ? ' liv2' : '') + (d.saldo ? ' saldo' : '') + '">'
          + '<span style="' + (neg ? 'color:#B91C1C' : '') + '">'
          + (d.data ? _ceData(d.data) + ' · ' : '') + _ceEsc(d.et)
          + (nd ? ' <span style="color:var(--text3)">(' + _ceEsc(nd) + ')</span>' : '')
          + '</span><span class="ce-num" style="' + (neg ? 'color:#B91C1C' : '') + '">'
          + (neg ? '− ' + _ceE(-d.imp) : _ceE(d.imp)) + '</span></div>';
      });
    }
  });
  return h + '<div class="ce-fine"><span>' + etTot + '</span><span class="ce-num">'
    + _ceE(valTot) + '</span></div></div>';
}

function _ceProspetto(R){
  var conPrev = (_ceVista !== 'effettivo');
  var vista = conPrev ? 'prev' : 'eff';
  var T = conPrev ? R.totPrev : R.totEff;
  /* [17 set 2026] tutte le sezioni del lato uscite, comprese quelle create a
     mano e i compensi agenti: prima si sommavano solo le tre fisse, e il
     totale a pareggio non tornava appena esisteva una sezione nuova */
  var costi = _ceArr(T.costi);
  var utile = T.utile;
  var pareggio = _ceArr(utile >= 0 ? costi + utile : T.ricavi - utile);

  var idDi = function(lato){ return _ceSezioniDi(lato).map(function(x){ return x.id; }); };
  var sx = _ceColonna(R, 'Entrate', idDi('entrate'), vista, conPrev, CE_TINTA.ricavi);
  var dx = _ceColonna(R, 'Uscite',  idDi('uscite'),  vista, conPrev, CE_TINTA.costi);

  var ris = function(et, val, col){
    return '<div class="ce-ris" style="color:' + col + '"><span>' + et + '</span>'
      + '<span class="ce-num">' + _ceE(val) + '</span></div>';
  };
  if(utile >= 0) dx += ris('Utile d\'esercizio', utile, CE_TINTA.ricavi);
  else           sx += ris('Perdita d\'esercizio', -utile, CE_TINTA.costi);

  var fine = '<div class="ce-fine"><span>Totale a pareggio</span>'
    + '<span class="ce-num">' + _ceE(pareggio) + '</span></div></div>';

  return '<div class="ce-grid">' + sx + fine + dx + fine + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));'
    + 'gap:10px;margin-top:12px">'
    + [['Margine lordo', T.margine, 'entrate meno uscite dirette', 'var(--text)'],
       ['Reddito ante imposte', T.anteImposte, 'meno le spese di struttura', 'var(--text)'],
       [utile >= 0 ? 'Utile netto' : 'Perdita netta', Math.abs(utile), 'dopo imposte e contributi',
        utile >= 0 ? CE_TINTA.ricavi : CE_TINTA.costi]]
      .map(function(x){
        return '<div style="border:1px solid var(--border);border-radius:10px;padding:11px 14px">'
          + '<div style="font-size:0.78rem;color:var(--text2);font-weight:600">' + x[0] + '</div>'
          + '<div class="ce-num" style="font-size:1.3rem;font-weight:800;color:' + x[3]
          + ';margin-top:2px;text-align:left">' + _ceE(x[1]) + '</div>'
          + '<div style="font-size:0.72rem;color:var(--text3)">' + x[2] + '</div></div>';
      }).join('') + '</div>';
}

/* ── stampa ────────────────────────────────────────────────────────────── */

/* [15 set 2026] Il documento di cassa in stampa: entrato contro uscito,
   partite aperte, e con l'analitico anche i movimenti affare per affare. */
function _ceStampaCassa(R, conDettaglio){
  var C = R.cassa;
  var col = function(tit, righe, etTot, tot, tinta){
    var h = '<td class="lato"><div class="tit" style="color:' + tinta + '">' + tit + '</div>'
      + '<table class="int">';
    righe.forEach(function(r){
      h += '<tr><td class="v">' + _ceEsc(r[0]) + '</td><td class="n">' + _ceE(r[1]) + '</td></tr>';
      /* [17 set 2026] nell'analitico, i movimenti di ogni riga — comprese le
         voci inserite a mano, che prima comparivano solo come totale */
      if(conDettaglio){
        _ceDetCassa(R, r[2]).forEach(function(d){
          h += '<tr class="det"><td class="d">' + (d.data ? _ceData(d.data) + ' &nbsp;' : '')
            + _ceEsc(d.et) + (d.nota ? ' (' + _ceEsc(d.nota) + ')' : '')
            + '</td><td class="n">' + _ceE(d.imp) + '</td></tr>';
        });
      }
    });
    return h + '<tr class="fine"><td>' + etTot + '</td><td class="n">' + _ceE(tot)
      + '</td></tr></table></td>';
  };
  var h = '<table class="out"><tr>'
    + col('Entrato', (R.prospettiva === 'titolare'
                      ? [['Provvigioni incassate dai clienti', C.quoteRicevute, 'clienti']]
                      : [['Quote agente incassate (lorde)', C.quoteRicevute, 'quote']])
                      .concat([['Altre entrate incassate', C.entrateIncassate, 'altreEntrate']])
                      .concat(_ceRigheAMano(R, 'entrate').map(function(x){ return [x[0], x[1], x[3]]; })),
          'Totale entrato', C.incassato, CE_TINTA.ricavi)
    + col('Uscito', (R.prospettiva === 'titolare'
                     ? [['Compensi pagati agli agenti', C.pagatoAgenti, 'agenti']]
                     : [['Trattenute ufficio', C.trattenute, 'trattenute']])
                     .concat([['Spese di struttura pagate', C.pagatoStruttura, 'struttura'],
                              ['F24 versati', C.pagatoImposte, 'imposte']])
                     .concat(_ceRigheAMano(R, 'uscite').map(function(x){ return [x[0], x[1], x[3]]; })),
          'Totale uscito', C.uscito, CE_TINTA.costi)
    + '</tr></table>';

  h += '<table class="int" style="margin-top:12px"><tr class="sez">'
    + '<td colspan="2">Partite aperte</td></tr>'
    + '<tr><td class="v">Da incassare — quote agente non ancora ricevute</td>'
    + '<td class="n">' + _ceE(R.daIncassare) + '</td></tr>'
    + '<tr><td class="v">Da pagare — spese di struttura e F24</td>'
    + '<td class="n">' + _ceE(R.daPagare) + '</td></tr>'
    + '<tr><td class="v">Da recuperare — anticipi per il cliente</td>'
    + '<td class="n">' + _ceE(R.daRecuperare) + '</td></tr></table>';

  if(conDettaglio){
    [['ricavi', 'Entrate e loro incassi'], ['diretti', 'Anticipi per il cliente']].forEach(function(x){
      var righe = R.eff[x[0]].righe;
      if(!righe.length) return;
      h += '<table class="int" style="margin-top:12px"><tr class="sez"><td colspan="2">'
        + x[1] + '</td></tr>';
      righe.forEach(function(r){
        h += '<tr><td class="v">' + _ceEsc(r.et) + '</td><td class="n">' + _ceE(r.imp) + '</td></tr>';
        (r.det || []).forEach(function(d){
          var neg = d.imp < 0;
          h += '<tr class="det"><td class="d">' + (d.data ? _ceData(d.data) + ' ' : '')
            + _ceEsc(d.et) + ((d.notaCassa || d.nota) ? ' (' + _ceEsc(d.notaCassa || d.nota) + ')' : '')
            + '</td><td class="n">' + (neg ? '&minus; ' + _ceE(-d.imp) : _ceE(d.imp)) + '</td></tr>';
        });
      });
      h += '</table>';
    });
  }
  return h;
}

window.ceStampa = function(){
  /* [14 set 2026] Prima di stampare si sceglie: solo i totali per voce
     (sintetico) oppure ogni riga che li compone (analitico). */
  var chiedi = (typeof dlgConfirm === 'function')
    ? dlgConfirm('Vuoi includere il dettaglio di ogni voce?\n\nSì stampa l\'analitico, con tutte le righe che compongono ogni importo. No stampa solo i totali.', '', 'Stampa bilancio agenzia')
    : Promise.resolve(window.confirm('Includere il dettaglio di ogni voce?'));
  Promise.resolve(chiedi).then(function(conDettaglio){ _ceStampaOra(!!conDettaglio); });
};
/* [2 ott 2026] con la linguetta Mese per mese aperta, stampa ed Excel
   riguardano la tabella dei mesi */
var _ceStampaBase = window.ceStampa;
window.ceStampa = function(){ if(_ceDoc === 'mensile') return _ceMeseStampa(); return _ceStampaBase(); };

function _ceStampaOra(conDettaglio){
  var R;
  try{ R = ceCalcola(_ceAnnoSel); }catch(e){ return; }
  var conPrev = (_ceVista !== 'effettivo');
  var T = conPrev ? R.totPrev : R.totEff;
  /* [17 set 2026] tutte le sezioni del lato uscite, comprese quelle create a
     mano e i compensi agenti: prima si sommavano solo le tre fisse, e il
     totale a pareggio non tornava appena esisteva una sezione nuova */
  var costi = _ceArr(T.costi);
  var utile = T.utile;
  var pareggio = _ceArr(utile >= 0 ? costi + utile : T.ricavi - utile);
  var nome = '';
  try{ if(typeof getNomeAgenzia === 'function') nome = getNomeAgenzia() || ''; }catch(e){}

  /* [15 set 2026] La stampa segue il documento scelto: il conto economico
     senza anticipi (partite di giro), la cassa con movimenti e partite
     aperte. Prima esportava sempre la struttura vecchia. */
  var lato = function(tit, sezioni, tinta, extra){
    var h = '<td class="lato"><div class="tit" style="color:' + tinta + '">' + tit + '</div><table class="int">';
    sezioni.forEach(function(sez){
      var righe = _ceRigheDi(R, sez, conPrev);
      /* niente anticipi se sono tutti rientrati: la sezione non esiste */
      if(sez === 'diretti' && _ceDoc === 'economico' && !righe.length) return;
      h += '<tr class="sez"><td>' + _ceNomeSez(sez) + '</td><td class="n">'
        + _ceE(_ceVal(R, sez, conPrev ? 'prev' : 'eff')) + '</td></tr>';
      if(!righe.length) h += '<tr><td colspan="2" class="vuoto">Nessuna voce</td></tr>';
      righe.forEach(function(r){
        h += '<tr><td class="v">' + _ceEsc(r.et) + (r.prev ? ' (prevista)' : '')
          + '</td><td class="n">' + _ceE(r.imp) + '</td></tr>';
        if(conDettaglio && r.det && r.det.length){
          r.det.forEach(function(d){
            h += '<tr class="det"><td class="d">' + (d.data ? _ceData(d.data) + ' &nbsp;' : '')
              + _ceEsc(d.et) + (d.nota ? ' (' + _ceEsc(d.nota) + ')' : '')
              + '</td><td class="n">' + _ceE(d.imp) + '</td></tr>';
          });
        }
      });
    });
    if(extra) h += '<tr class="ris"><td>' + extra[0] + '</td><td class="n">' + _ceE(extra[1]) + '</td></tr>';
    h += '<tr class="fine"><td>Totale a pareggio</td><td class="n">' + _ceE(pareggio) + '</td></tr>';
    return h + '</table></td>';
  };

  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8">'
    + '<title>Bilancio agenzia ' + R.anno
    + ' — ' + (_ceDoc === 'cassa' ? 'incassi e pagamenti' : 'conto economico') + '</title><style>'
    + '@page{size:A4 landscape;margin:14mm}'
    + 'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1A1D21;margin:0}'
    + 'h1{font-size:20pt;margin:0 0 2px;letter-spacing:-.4px}'
    + '.sub{font-size:10pt;color:#555;margin-bottom:2px}'
    + '.meta{font-size:8.5pt;color:#777;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #1A1D21}'
    + 'table.out{width:100%;border-collapse:collapse;table-layout:fixed}'
    + 'td.lato{vertical-align:top;width:50%;padding:0 10px;border-left:1px solid #ccc}'
    + 'td.lato:first-child{border-left:0;padding-left:0}'
    + '.tit{font-size:12pt;font-weight:700;padding-bottom:5px;border-bottom:1.5pt solid currentColor;margin-bottom:5px}'
    + 'table.int{width:100%;border-collapse:collapse;font-size:9.5pt}'
    + 'table.int td{padding:3.5px 4px;border-bottom:.5pt solid #ddd}'
    + '.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;width:33%}'
    + 'tr.sez td{font-weight:700;background:#F2F2F2}'
    + 'td.v{padding-left:14px}'
    + '.vuoto{color:#999;font-style:italic;padding-left:14px}'
    + 'tr.det td{font-size:8pt;color:#555;border-bottom:.3pt dotted #ddd}'
    + 'td.d{padding-left:26px}'
    + 'tr.ris td{font-weight:700;border-top:1pt solid #1A1D21}'
    + 'tr.fine td{font-weight:800;border-top:1.5pt solid #1A1D21;border-bottom:none}'
    + '.piede{margin-top:16px;font-size:8pt;color:#777;line-height:1.5}'
    + '@media print{.noprint{display:none}}'
    + '.noprint{text-align:center;margin:18px 0}'
    + '.noprint button{padding:9px 22px;background:#1A1D21;color:#fff;border:0;border-radius:7px;'
    + 'font-weight:600;cursor:pointer;font-size:11pt}'
    + '</style></head><body>'
    + '<h1>Bilancio agenzia ' + R.anno + '</h1>'
    + (nome ? '<div class="sub">' + _ceEsc(nome) + '</div>' : '')
    + '<div class="meta">'
    + (_ceDoc === 'cassa' ? 'Incassi e pagamenti: solo il denaro che si è mosso'
       : (_ceVista === 'effettivo' ? 'Conto economico per competenza, solo voci registrate'
          : 'Conto economico per competenza, comprese proposte e voci previste'))
    + ' &nbsp;—&nbsp; ' + (conDettaglio ? 'analitico, con il dettaglio delle voci' : 'sintetico')
    + ' &nbsp;—&nbsp; stampato il ' + new Date().toLocaleDateString('it-IT') + '</div>'
    + (_ceDoc === 'cassa' ? _ceStampaCassa(R, conDettaglio)
       : '<table class="out"><tr>'
         + lato('Entrate', _ceSezioniDi('entrate').map(function(x){ return x.id; }), CE_TINTA.ricavi,
                utile < 0 ? ['Perdita d\'esercizio', -utile] : null)
         + lato('Uscite', _ceSezioniDi('uscite').map(function(x){ return x.id; }), CE_TINTA.costi,
                utile >= 0 ? ['Utile d\'esercizio', utile] : null)
         + '</tr></table>')
    + '<div class="piede">'
    + (_ceDoc === 'cassa'
        ? 'Entrato ' + _ceE(R.cassa.incassato) + ' &nbsp;·&nbsp; Uscito ' + _ceE(R.cassa.uscito)
          + ' &nbsp;·&nbsp; Saldo ' + _ceE(R.cassa.saldo)
        : 'Risultato ante imposte ' + _ceE(T.anteImposte)
          + ' &nbsp;·&nbsp; ' + (utile >= 0 ? 'Utile netto ' : 'Perdita netta ') + _ceE(Math.abs(utile)))
    + '<br>' + (R.prospettiva === 'titolare'
        ? 'Vista del titolare: le entrate sono le provvigioni intere, il costo degli agenti è la loro quota netta. '
        : 'Le entrate sono le quote agente sulle provvigioni. ')
    + 'Fatture e incassi non fatturati non '
    + 'compaiono: documentano le stesse provvigioni e sommarli conterebbe due volte gli stessi importi.'
    + (_ceDoc === 'cassa' ? ''
       : '<br>Conto economico per competenza. Gli anticipi per il cliente non vi compaiono: sono '
         + 'partite di giro, si trovano nel documento Incassi e pagamenti.')
    + '</div>'
    + '<div class="noprint"><button onclick="window.print()">Stampa o salva in PDF</button></div>'
    + '</body></html>';

  var w = window.open('', '_blank');
  if(!w){ try{ dlgAlert('Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito.',''); }catch(e){} return; }
  w.document.write(doc); w.document.close();
}

/* ── esportazione in Excel ─────────────────────────────────────────────── */

window.ceEsportaExcel = function(){
  if(typeof XLSX === 'undefined'){
    try{ dlgAlert('La libreria per i fogli di calcolo non è disponibile in questo momento.',''); }catch(e){}
    return;
  }
  var chiedi = (typeof dlgConfirm === 'function')
    ? dlgConfirm('Vuoi includere il dettaglio di ogni voce?\n\nSì esporta l\'analitico, No solo i totali.', '', 'Esporta in Excel')
    : Promise.resolve(window.confirm('Includere il dettaglio di ogni voce?'));
  Promise.resolve(chiedi).then(function(conDettaglio){ _ceExcelOra(!!conDettaglio); });
};
var _ceExcelBase = window.ceEsportaExcel;
window.ceEsportaExcel = function(){ if(_ceDoc === 'mensile' && typeof XLSX !== 'undefined') return _ceMeseExcel(); return _ceExcelBase(); };

function _ceExcelOra(conDettaglio){
  var R;
  try{ R = ceCalcola(_ceAnnoSel); }catch(e){ return; }
  var conPrev = (_ceVista !== 'effettivo');
  var T = conPrev ? R.totPrev : R.totEff;
  /* [17 set 2026] tutte le sezioni del lato uscite, comprese quelle create a
     mano e i compensi agenti: prima si sommavano solo le tre fisse, e il
     totale a pareggio non tornava appena esisteva una sezione nuova */
  var costi = _ceArr(T.costi);
  var utile = T.utile;
  var pareggio = _ceArr(utile >= 0 ? costi + utile : T.ricavi - utile);
  var nome = '';
  try{ if(typeof getNomeAgenzia === 'function') nome = getNomeAgenzia() || ''; }catch(e){}

  /* i due lati affiancati anche nel foglio: colonne A-B e D-E */
  var sx = [], dx = [];
  var riempi = function(arr, sezioni){
    sezioni.forEach(function(sez){
      var righe = _ceRigheDi(R, sez, conPrev);
      if(sez === 'diretti' && _ceDoc === 'economico' && !righe.length) return;
      arr.push([_ceNomeSez(sez), _ceVal(R, sez, conPrev ? 'prev' : 'eff')]);
      if(!righe.length) arr.push(['   nessuna voce', null]);
      righe.forEach(function(r){
        arr.push(['   ' + r.et + (r.prev ? ' (prevista)' : ''), r.imp]);
        if(conDettaglio && r.det && r.det.length){
          r.det.forEach(function(d){
            arr.push(['      ' + (d.data ? _ceData(d.data) + ' ' : '') + d.et
              + (d.nota ? ' (' + d.nota + ')' : ''), d.imp]);
          });
        }
      });
    });
  };
  /* [15 set 2026] Anche il foglio segue il documento: nel conto economico gli
     anticipi restano fuori, sono partite di giro. */
  riempi(sx, _ceSezioniDi('entrate').map(function(x){ return x.id; }));
  riempi(dx, _ceSezioniDi('uscite').map(function(x){ return x.id; }));
  if(utile >= 0) dx.push(['Utile d\'esercizio', utile]);
  else           sx.push(['Perdita d\'esercizio', -utile]);
  while(sx.length < dx.length) sx.push(['', null]);
  while(dx.length < sx.length) dx.push(['', null]);
  sx.push(['Totale a pareggio', pareggio]);
  dx.push(['Totale a pareggio', pareggio]);

  var aoa = [
    [(_ceDoc === 'cassa' ? 'Incassi e pagamenti ' : 'Conto economico ') + R.anno],
    [nome],
    [(_ceDoc === 'cassa'
        ? 'Solo il denaro che si è mosso nel periodo'
        : (conPrev ? 'Per competenza, comprese proposte in corso e voci previste'
                   : 'Per competenza, solo voci registrate'))
      + (conDettaglio ? ' — analitico' : ' — sintetico')],
    ['Esportato il ' + new Date().toLocaleDateString('it-IT')],
    [],
    ['ENTRATE', null, null, 'USCITE', null]
  ];
  for(var i=0;i<sx.length;i++) aoa.push([sx[i][0], sx[i][1], null, dx[i][0], dx[i][1]]);
  aoa.push([]);
  aoa.push(['Risultato ante imposte', T.anteImposte]);
  aoa.push([utile >= 0 ? 'Utile netto' : 'Perdita netta', Math.abs(utile)]);
  aoa.push([]);
  aoa.push(['Volume generato per l\'agenzia', R.gci]);
  aoa.push([R.prospettiva === 'titolare' ? 'Di cui quote nette agli agenti' : 'Di cui quota agente',
            R.quoteAgente]);
  aoa.push([]);
  aoa.push(['CASSA E PARTITE APERTE']);
  aoa.push(['Entrato nel periodo', R.cassa.incassato]);
  aoa.push(['Uscito nel periodo', R.cassa.uscito]);
  aoa.push(['Saldo dei movimenti', R.cassa.saldo]);
  aoa.push(['Da incassare', R.daIncassare]);
  aoa.push(['Da pagare', R.daPagare]);
  aoa.push(['Da recuperare (anticipi)', R.daRecuperare]);
  if(R.cassa.anticipati > 0){
    aoa.push([]);
    aoa.push(['ANTICIPI PER IL CLIENTE — fuori dal conto economico']);
    aoa.push(['Anticipati', R.cassa.anticipati]);
    aoa.push(['Recuperati', R.cassa.recuperati]);
    R.eff.diretti.righe.forEach(function(r){
      aoa.push(['   ' + r.et, r.imp]);
      if(conDettaglio){
        (r.det || []).forEach(function(d){
          aoa.push(['      ' + (d.data ? _ceData(d.data) + ' ' : '') + d.et
            + ((d.notaCassa || d.nota) ? ' (' + (d.notaCassa || d.nota) + ')' : ''), d.imp]);
        });
      }
    });
  }

  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:38},{wch:15},{wch:3},{wch:38},{wch:15}];
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:4}}, {s:{r:1,c:0},e:{r:1,c:4}},
                   {s:{r:2,c:0},e:{r:2,c:4}}, {s:{r:3,c:0},e:{r:3,c:4}}];
  /* formato contabile sulle celle numeriche, altrimenti Excel mostra numeri nudi */
  Object.keys(ws).forEach(function(k){
    if(k[0] === '!') return;
    if(ws[k] && typeof ws[k].v === 'number'){ ws[k].t = 'n'; ws[k].z = '#,##0.00\\ "€"'; }
  });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, _ceDoc === 'cassa' ? 'Incassi e pagamenti' : 'Conto economico');
  try{
    XLSX.writeFile(wb, (_ceDoc === 'cassa' ? 'cassa-' : 'conto-economico-') + R.anno
      + (conDettaglio ? '-analitico' : '') + '.xlsx');
  }catch(e){
    console.warn('[Bilancio agenzia] esportazione KO:', e);
    try{ dlgAlert('Non sono riuscito a creare il file.',''); }catch(e2){}
  }
}

function _ceConfronto(R){
  /* nel confronto i due prospetti non stanno affiancati due volte: una sola
     tabella con le due colonne di importi, altrimenti diventa illeggibile */
  var riga = function(et, e, p, opt){
    opt = opt || {};
    var peso = opt.forte ? '800' : '600';
    var col = opt.colore || 'var(--text)';
    var d = _ceArr(p - e);
    return '<tr style="' + (opt.sfondo ? 'background:' + opt.sfondo + ';' : '')
      + (opt.sopra ? 'border-top:2px solid var(--border);' : 'border-bottom:1px solid var(--border);') + '">'
      + '<td style="padding:8px 14px;' + (opt.rientro ? 'padding-left:30px;' : '')
      + 'font-weight:' + peso + ';color:' + col + '">' + et + '</td>'
      + '<td style="padding:8px 14px;text-align:right;font-weight:' + peso + ';color:' + col + '">'
      + _ceE(e) + '</td>'
      + '<td style="padding:8px 14px;text-align:right;font-weight:' + peso + ';color:' + col + '">'
      + _ceE(p) + '</td>'
      + '<td style="padding:8px 14px;text-align:right;font-weight:' + peso + ';color:'
      + (d > 0 ? '#15803D' : (d < 0 ? '#B91C1C' : 'var(--text3)')) + '">'
      + (d > 0 ? '+' : '') + _ceE(d) + '</td></tr>';
  };
  var h = '<div style="overflow:auto;border:1px solid var(--border);border-radius:12px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:0.87rem"><thead>'
    + '<tr style="background:var(--bg2)">'
    + ['Voce','Effettivo','Provvisorio','Differenza'].map(function(t, i){
        return '<th style="padding:9px 14px;text-align:' + (i ? 'right' : 'left')
          + ';font-size:0.72rem;text-transform:uppercase;letter-spacing:.4px;color:var(--text2);'
          + 'border-bottom:1px solid var(--border)">' + t + '</th>'; }).join('')
    + '</tr></thead><tbody>';
  h += riga('ENTRATE', R.totEff.ricavi, R.totPrev.ricavi, {forte:true, sfondo:'var(--bg2)'});
  ['diretti','struttura','imposte'].forEach(function(s){
    h += riga(_ceNomeSez(s), R.totEff[s], R.totPrev[s], {rientro:true});
  });
  h += riga('Totale uscite',
        _ceArr(R.totEff.diretti + R.totEff.struttura + R.totEff.imposte),
        _ceArr(R.totPrev.diretti + R.totPrev.struttura + R.totPrev.imposte), {forte:true});
  h += riga('Margine lordo', R.totEff.margine, R.totPrev.margine, {rientro:true});
  h += riga('Reddito ante imposte', R.totEff.anteImposte, R.totPrev.anteImposte, {rientro:true});
  var c = R.totEff.utile >= 0 ? '#15803D' : '#B91C1C';
  h += riga('RISULTATO', R.totEff.utile, R.totPrev.utile, {forte:true, sopra:true, colore:c});
  return h + '</tbody></table></div>';
}

function _ceFormDiv(sez){
  var v = null;
  if(_ceEditId){
    var tutte = _ceVoci();
    for(var i=0;i<tutte.length;i++) if(tutte[i] && tutte[i].id === _ceEditId) v = tutte[i];
  }
  return '<div style="padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px">'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">'
    + '<div style="flex:2;min-width:170px"><label class="flabel">Descrizione</label>'
    + '<input class="finput" id="ce-f-et" value="' + _ceEsc(v ? v.etichetta : '') + '" placeholder="Es. Assicurazione auto"></div>'
    + '<div style="flex:1;min-width:110px"><label class="flabel">Importo (€)</label>'
    + '<input class="finput" id="ce-f-imp" type="number" step="any" value="' + (v ? v.importo : '') + '"></div>'
    + '<div style="flex:1;min-width:140px"><label class="flabel">Natura</label>'
    + '<select class="fselect" id="ce-f-nat">'
    + '<option value="effettivo"' + (v && v.natura === 'effettivo' ? ' selected' : '') + '>Già registrata</option>'
    + '<option value="previsto"' + (!v || v.natura === 'previsto' ? ' selected' : '') + '>Prevista</option>'
    + '</select></div>'
    /* [15 set 2026] La sezione si sceglie qui: prima la decideva il pulsante
       premuto, e una voce finita nel posto sbagliato non si poteva spostare
       se non cancellandola. */
    + '<div style="flex:1;min-width:160px"><label class="flabel">Sezione</label>'
    + '<select class="fselect" id="ce-f-sez">'
    + _ceSezioni().map(function(x){
        var scelta = v ? (v.sezione || 'struttura') : sez;
        return '<option value="' + x.id + '"' + (scelta === x.id ? ' selected' : '') + '>'
          + _ceEsc(x.nome) + (x.lato === 'entrate' ? ' (entrate)' : '') + '</option>';
      }).join('')
    + '</select></div>'
    /* [17 set 2026] di chi è la voce: una nuova nasce di chi si sta guardando */
    + (typeof window._spesaDiOpzioni === 'function'
        ? '<div style="flex:1;min-width:170px"><label class="flabel">Di chi è</label>'
          + '<select class="fselect" id="ce-f-chi">'
          + window._spesaDiOpzioni(v || {spesaDi: (_ceProsEff() === 'titolare'
                                     ? 'agenzia' : 'agente:' + _ceAgenteEff())})
          + '</select></div>'
        : '')
    + '<button class="btn btn-primary btn-sm" onclick="_ceSalvaVoce(\'' + sez + '\')">Salva</button>'
    + '<button class="btn btn-outline btn-sm" onclick="_ceChiudiForm()">Annulla</button>'
    + '</div>'
    + '<div style="font-size:0.73rem;color:var(--text3);margin-top:6px">'
    + '"Prevista" compare solo nel conto provvisorio; "già registrata" in tutti e due e, '
    + 'come pagata o incassata, anche in Incassi e pagamenti.</div>'
    + _ceElencoVoci(sez)
    + '</div>';
}

function _ceChiEtichetta(rec){
  var c = null;
  try{ if(typeof window._spesaDiChi === 'function') c = window._spesaDiChi(rec); }catch(e){}
  if(!c) return 'agente';
  if(c.tipo === 'agenzia') return 'agenzia';
  var nome = '';
  _ceAgentiTutti().forEach(function(a){ if(a.uuid === c.agenteUuid) nome = a.nome || ''; });
  return 'agente' + (nome ? ' ' + nome : '');
}
function _ceElencoVoci(sez){
  var mie = _ceVociAnno(_ceAnnoSel);
  if(!mie.length) return '';
  return '<div style="margin-top:10px;font-size:0.8rem">'
    + '<div style="font-weight:700;color:var(--text2);margin-bottom:4px">'
    + 'Tutte le voci inserite a mano nel ' + _ceAnnoSel + '</div>'
    + mie.map(function(v){
        return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0">'
          + '<span style="flex:1">' + _ceEsc(v.etichetta) + ' — ' + _ceE(_ceN(v.importo))
          + ' <span style="color:var(--text3)">in ' + _ceEsc(_ceNomeSez(v.sezione||'struttura')) + '</span>'
          + (v.natura === 'previsto' ? ' <span style="color:#A16207">(prevista)</span>' : '')
          + ' <span style="color:var(--text3)">· ' + _ceEsc(_ceChiEtichetta(v)) + '</span>' + '</span>'
          + '<button class="btn btn-outline btn-sm" style="padding:1px 8px;font-size:0.72rem" '
          + 'onclick="_ceModificaVoce(\'' + v.id + '\')">Modifica</button>'
          + '<button class="btn btn-outline btn-sm" style="padding:1px 8px;font-size:0.72rem;color:#B91C1C" '
          + 'onclick="_ceEliminaVoce(\'' + v.id + '\')">Elimina</button></div>';
      }).join('')
    + '</div>';
}

window._ceApriForm = function(s){ _ceFormSez = s; _ceEditId = null; ceDisegna(); };
window._ceApriDettaglio = function(k){
  if(_ceAperte[k]) delete _ceAperte[k]; else _ceAperte[k] = true;
  ceDisegna();
};
window._ceChiudiForm = function(){ _ceFormSez = null; _ceEditId = null; ceDisegna(); };
window._ceModificaVoce = function(id){
  var tutte = _ceVoci();
  for(var i=0;i<tutte.length;i++) if(tutte[i] && tutte[i].id === id){
    _ceEditId = id; _ceFormSez = tutte[i].sezione || 'struttura'; break;
  }
  ceDisegna();
};
window._ceSalvaVoce = function(sez){
  var et = (document.getElementById('ce-f-et')||{}).value || '';
  var imp = _ceN((document.getElementById('ce-f-imp')||{}).value);
  var nat = (document.getElementById('ce-f-nat')||{}).value || 'previsto';
  var selSez = (document.getElementById('ce-f-sez')||{}).value;
  var chi = (document.getElementById('ce-f-chi')||{}).value || '';
  if(selSez) sez = selSez;
  if(!et.trim()){ try{ dlgAlert('Serve una descrizione per la voce.',''); }catch(e){} return; }
  if(!imp){ try{ dlgAlert('Serve un importo diverso da zero.',''); }catch(e){} return; }
  var arr = _ceVoci(), fatto = false;
  if(_ceEditId){
    for(var i=0;i<arr.length;i++) if(arr[i] && arr[i].id === _ceEditId){
      var nuovo = {etichetta:et.trim(), importo:imp, natura:nat, sezione:sez, anno:_ceAnnoSel};
      if(chi) nuovo.spesaDi = chi;
      /* [15 set 2026] aggiornaRecord restituisce una COPIA aggiornata e non
         tocca l'originale: senza riassegnare, la modifica spariva — compreso
         il cambio di sezione. */
      if(typeof aggiornaRecord === 'function') arr[i] = aggiornaRecord(arr[i], nuovo);
      else Object.keys(nuovo).forEach(function(k){ arr[i][k] = nuovo[k]; });
      fatto = true; break;
    }
  }
  if(!fatto){
    var nv = {id:'ce_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7),
      anno:_ceAnnoSel, sezione:sez, etichetta:et.trim(), importo:imp, natura:nat,
      _creato:new Date().toISOString()};
    if(chi) nv.spesaDi = chi;
    arr.push(nv);
  }
  try{ saveD(); }catch(e){ console.warn('[Bilancio agenzia] saveD KO:', e); }
  _ceFormSez = null; _ceEditId = null;
  ceDisegna();
};
window._ceEliminaVoce = function(id){
  if(!window.confirm('Eliminare questa voce?')) return;
  D.ceVoci = _ceVoci().filter(function(v){ return !v || v.id !== id; });
  try{ saveD(); }catch(e){}
  _ceEditId = null;
  ceDisegna();
};
window._ceCambiaAnno = function(a){ _ceAnnoSel = +a; _ceFormSez = null; _ceEditId = null; ceDisegna(); };
window._ceVaiVista = function(v){ _ceVista = v; ceDisegna(); };
window._ceVaiPros = function(v){
  _cePros = (v === 'titolare') ? 'titolare' : 'agente';
  _ceFormSez = null; _ceEditId = null; _ceAperte = {};
  ceDisegna();
};
window._ceScegliAgente = function(u){
  _ceAgenteSel = u || '';
  _ceFormSez = null; _ceEditId = null; _ceAperte = {};
  ceDisegna();
};
/* ── sezioni create da Enzo ────────────────────────────────────────────── */

window._ceNuovaSezione = function(lato){
  var nome = window.prompt('Nome della nuova sezione fra le '
    + (lato === 'entrate' ? 'entrate' : 'uscite') + ':', '');
  if(nome === null) return;
  nome = String(nome).trim();
  if(!nome){ try{ dlgAlert('Serve un nome per la sezione.',''); }catch(e){} return; }
  if(!Array.isArray(D.ceSezioni)) D.ceSezioni = [];
  var esiste = _ceSezioni().some(function(x){
    return x.nome.toLowerCase() === nome.toLowerCase(); });
  if(esiste){ try{ dlgAlert('Esiste già una sezione con questo nome.',''); }catch(e){} return; }
  D.ceSezioni.push({
    id: 'sez_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    nome: nome, lato: (lato === 'entrate' ? 'entrate' : 'uscite'),
    _creato: new Date().toISOString()
  });
  try{ saveD(); }catch(e){ console.warn('[Bilancio agenzia] saveD KO:', e); }
  ceDisegna();
};

window._ceRinominaSezione = function(id){
  var o = _ceSezioneObj(id);
  if(!o || o.fissa) return;
  var nome = window.prompt('Nuovo nome della sezione:', o.nome);
  if(nome === null) return;
  nome = String(nome).trim();
  if(!nome) return;
  var arr = Array.isArray(D.ceSezioni) ? D.ceSezioni : [];
  for(var i=0;i<arr.length;i++){
    if(arr[i] && arr[i].id === id){
      /* aggiornaRecord restituisce una copia: il ritorno va riassegnato */
      if(typeof aggiornaRecord === 'function') arr[i] = aggiornaRecord(arr[i], {nome:nome});
      else arr[i].nome = nome;
      break;
    }
  }
  try{ saveD(); }catch(e){}
  ceDisegna();
};

window._ceEliminaSezione = function(id){
  var o = _ceSezioneObj(id);
  if(!o || o.fissa) return;
  var dentro = _ceVoci().filter(function(v){ return v && v.sezione === id; });
  /* una sezione con voci dentro non si cancella in silenzio: o le sposti o
     non se ne fa nulla. Cancellarle insieme farebbe sparire importi veri. */
  if(dentro.length){
    var ok = window.confirm('La sezione "' + o.nome + '" contiene ' + dentro.length
      + (dentro.length === 1 ? ' voce.' : ' voci.')
      + '\n\nPremendo OK le voci vengono spostate in "Spese di struttura" e la sezione '
      + 'viene eliminata. Le voci NON vengono cancellate.');
    if(!ok) return;
    var arrV = _ceVoci();
    for(var j=0;j<arrV.length;j++){
      if(arrV[j] && arrV[j].sezione === id){
        if(typeof aggiornaRecord === 'function') arrV[j] = aggiornaRecord(arrV[j], {sezione:'struttura'});
        else arrV[j].sezione = 'struttura';
      }
    }
  } else {
    if(!window.confirm('Eliminare la sezione "' + o.nome + '"?')) return;
  }
  D.ceSezioni = (Array.isArray(D.ceSezioni) ? D.ceSezioni : [])
    .filter(function(x){ return !x || x.id !== id; });
  try{ saveD(); }catch(e){}
  _ceFormSez = null; _ceEditId = null;
  ceDisegna();
};

window._ceVaiDoc = function(d){ _ceDoc = d; _ceFormSez = null; _ceEditId = null; ceDisegna(); };
window.ceDisegnaPub = function(){ ceDisegna(); };
window.chiudiContoEconomico = function(){
  var w = document.getElementById('ce-wrap'); if(w) w.remove();
};

function ceDisegna(){
  var corpo = document.getElementById('ce-corpo');
  if(!corpo) return;
  var R;
  try{ R = ceCalcola(_ceAnnoSel); }
  catch(e){
    console.warn('[Bilancio agenzia] KO:', e);
    corpo.innerHTML = '<div style="padding:20px;color:var(--text2)">Non sono riuscito a calcolare i numeri.</div>';
    return;
  }
  var ac = new Date().getFullYear(), anni = [];
  for(var a = ac-3; a <= ac+1; a++) anni.push(a);

  var _nomeAg = '';
  try{ if(typeof getNomeAgenzia === 'function') _nomeAg = getNomeAgenzia() || ''; }catch(e){}

  /* [15 set 2026] TESTATA IN UNA RIGA. Prima il titolo, il selettore
     dell'anno, le linguette e il badge stavano su quattro righe diverse e
     metà larghezza restava vuota. Ora l'anno è dentro al titolo — è lì che
     lo si cerca — e tutti i comandi gli stanno a fianco. Questa pagina non
     è pensata per il telefono, quindi la riga può usare tutto lo spazio. */
  var _sottoDoc = (_ceDoc === 'costi') ? 'costi che si ripetono e scadenze già note'
    : (_ceDoc === 'ai') ? 'analisi dei numeri con l\'intelligenza artificiale'
    : (_ceDoc === 'mensile')
    ? (_ceMeseBase === 'cassa' ? 'mese per mese, denaro che si è mosso' : 'mese per mese, per competenza')
    : (_ceDoc === 'cassa')
    ? 'solo il denaro che si è mosso'
    : (_ceVista === 'effettivo' ? 'per competenza, solo voci registrate'
       : (_ceVista === 'provvisorio' ? 'per competenza, con proposte e previsioni'
          : 'effettivo e provvisorio a confronto'));

  /* [17 set 2026] PROSPETTIVA: agente o titolare (solo admin e manager),
     e con più agenti la scelta dell'agente da guardare */
  var _tit = (R.prospettiva === 'titolare');
  var _agenti = _ceAgentiTutti();
  var _barraPros = '';
  /* la scelta dell'agente è anch'essa riservata ad admin e manager: finché un
     utente dell'app non è legato alla sua scheda agente, un agente semplice
     potrebbe altrimenti aprire i numeri di un collega */
  if(false){   /* [2 ott 2026] i comandi sono passati nella testata */
    _barraPros = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:-4px 0 12px">';
    if(_cePuoTitolare()){
      _barraPros += '<span style="font-size:0.74rem;font-weight:700;color:var(--text3);text-transform:uppercase;'
        + 'letter-spacing:.4px">Punto di vista</span>'
        + '<div class="ce-ling" style="flex-wrap:nowrap">'
        + [['agente','Agente'],['titolare','Titolare']].map(function(v){
            return '<button class="ce-l cnf' + (R.prospettiva === v[0] ? ' on' : '') + '" '
              + 'style="padding:5px 12px;font-size:0.78rem" onclick="_ceVaiPros(\'' + v[0] + '\')">'
              + v[1] + '</button>';
          }).join('') + '</div>';
    }
    if(!_tit && _agenti.length > 1){
      _barraPros += '<select class="fselect" style="width:auto;padding:5px 10px;font-size:0.8rem" '
        + 'onchange="_ceScegliAgente(this.value)">'
        + _agenti.map(function(a){
            return '<option value="' + _ceEsc(a.uuid) + '"' + (a.uuid === R.agenteUuid ? ' selected' : '') + '>'
              + _ceEsc(a.nome || 'agente senza nome') + '</option>';
          }).join('') + '</select>';
    }
    _barraPros += '<span style="font-size:0.76rem;color:var(--text3)">'
      + (_tit ? 'l\'agenzia: provvigioni intere come ricavo, quote nette degli agenti come costo'
              : 'l\'agente' + (R.agenteNome ? ' ' + _ceEsc(R.agenteNome) : '') + ': la sua quota come ricavo')
      + '</span></div>';
  }

  /* [2 ott 2026] TESTATA IN STILE "STATISTICHE & ANALYTICS", richiesta di
     Enzo: troppo spazio vuoto e scritte grandi. Ora: riquadro-icona e titolo
     normale (le classi ce-testa / ce-tit / ce-ling le colora il tema comune
     GX_TEMA_STAT), una riga di comandi e una riga sola di riepilogo. */
  var _segm = function(voci, attiva, fn, piccolo){
    return '<div class="ce-ling" style="flex-wrap:nowrap">' + voci.map(function(v){
      return '<button class="ce-l cnf' + (attiva === v[0] ? ' on' : '') + '"'
        + (piccolo ? ' style="padding:6px 12px!important;font-size:0.78rem!important"' : '')
        + ' onclick="' + fn + '(\'' + v[0] + '\')">' + v[1] + '</button>';
    }).join('') + '</div>';
  };
  var h = '<div class="ce-testa">'
    + '<div style="min-width:0"><div class="ce-tit">Bilancio Agenzia</div>'
    + '<div style="font-size:0.8rem;color:var(--text3);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
    + (_nomeAg ? _ceEsc(_nomeAg) + ' · ' : '') + _sottoDoc + ' · aggiornato al ' + new Date().toLocaleDateString('it-IT') + '</div></div>'
    + '<div style="margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">'
    + (_cePuoTitolare() ? _segm([['agente','Agente'],['titolare','Titolare']], R.prospettiva, '_ceVaiPros', true) : '')
    + ((_cePuoTitolare() && !_tit && _agenti.length > 1)
        ? '<select class="fselect" style="width:auto;padding:7px 10px;font-size:0.82rem" onchange="_ceScegliAgente(this.value)">'
          + _agenti.map(function(a){ return '<option value="' + _ceEsc(a.uuid) + '"' + (a.uuid === R.agenteUuid ? ' selected' : '') + '>' + _ceEsc(a.nome || 'agente senza nome') + '</option>'; }).join('')
          + '</select>' : '')
    + '<select class="fselect" title="Anno" style="width:auto;padding:7px 30px 7px 12px;font-size:0.9rem;font-weight:700" onchange="_ceCambiaAnno(this.value)">'
    + anni.map(function(x){ return '<option value="'+x+'"'+(x===_ceAnnoSel?' selected':'')+'>'+x+'</option>'; }).join('')
    + '</select></div></div>'
    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
    + _segm([['economico','Conto economico'],['cassa','Incassi e pagamenti'],['mensile','Mese per mese'],['costi','Costi fissi'],['ai','Assistente AI']], _ceDoc, '_ceVaiDoc')
    + (_ceDoc === 'economico' ? '<div style="margin-left:auto">' + _segm([['effettivo','Effettivo'],['provvisorio','Provvisorio'],['confronto','Confronto']], _ceVista, '_ceVaiVista', true) + '</div>' : '')
    + '</div>';
  h += '<div class="ce-info">'
    + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--brand)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span>'
    + (_tit
      ? 'Volume dell\'agenzia nel ' + R.anno + ': <b style="color:var(--text)">' + _ceE(R.gci)
        + '</b> su ' + R.quanteProv + ' provvigioni — agli agenti <b style="color:var(--text)">'
        + _ceE(R.quoteAgente) + '</b> netti'
        + (R.percDaStorico ? ', il ' + R.percAgente + '% del volume' : '')
        + ', all\'agenzia <b style="color:var(--text)">' + _ceE(_ceArr(R.gci - R.quoteAgente)) + '</b> prima delle spese.'
      : 'Volume generato per l\'agenzia nel ' + R.anno + ': <b style="color:var(--text)">' + _ceE(R.gci)
        + '</b> su ' + R.quanteProv + ' provvigioni — di cui a te <b style="color:var(--text)">'
        + _ceE(R.quoteAgente) + '</b>'
        + (R.percDaStorico ? ', il ' + R.percAgente + '% (calcolato sui tuoi affari di quest\'anno)' : '')
        + '.')
    + '</span></div>';

  /* [2 ott 2026] riquadri come Statistiche & Analytics: striscia colorata in
     alto, icona, numero grande e etichetta sotto. col = colore della
     striscia; il numero resta scuro, tranne utile e saldo (verde o rosso). */
  var CE_ICO_K = {
    su:'<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    giu:'<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    bil:'<line x1="12" y1="3" x2="12" y2="21"/><path d="M5 7h14M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z"/>',
    eur:'<path d="M18 7a7 7 0 100 10"/><line x1="4" y1="10" x2="13" y2="10"/><line x1="4" y1="14" x2="13" y2="14"/>'
  };
  var card = function(tit, val, sot, col, ico, colVal){
    return '<div class="ce-card" style="color:' + col + '">'
      + '<div class="ce-kico">' + _ceIco(CE_ICO_K[ico || 'eur'], 18) + '</div>'
      + '<div class="val" style="color:' + (colVal || 'var(--text)') + '">€ ' + _ceE(val) + '</div>'
      + '<div class="et">' + tit + '</div>'
      + '<div class="sot">' + sot + '</div></div>';
  };
  var cE = R.totEff.utile >= 0 ? '#15803D' : '#B91C1C';
  var cP = R.totPrev.utile >= 0 ? '#15803D' : '#B91C1C';
  /* [15 set 2026] Nel conto economico i riquadri parlano di RISULTATO, non
     di saldi: "da incassare" è una partita aperta e sta nella cassa. */
  if(_ceDoc === 'mensile' || _ceDoc === 'costi' || _ceDoc === 'ai'){
    /* [2 ott 2026] queste linguette disegnano i loro riquadri */
  } else if(_ceDoc === 'economico'){
    /* [15 set 2026] I riquadri devono seguire la linguetta: prima mostravano
       sempre i totali dell'effettivo, quindi cambiando vista non si muoveva
       nulla e sembrava che il provvisorio non funzionasse. */
    var Tv = (_ceVista === 'provvisorio') ? R.totPrev : R.totEff;
    var sotto = (_ceVista === 'provvisorio')
      ? 'comprese proposte e previsioni' : 'solo voci registrate';
    if(_ceVista === 'confronto'){
      h += '<div class="ce-kpi">'
        + card('Entrate effettive', R.totEff.ricavi, 'solo voci registrate', '#16A34A', 'su')
        + card('Entrate provvisorie', R.totPrev.ricavi, 'con proposte e previsioni', '#D97706', 'su')
        + card('Utile effettivo', R.totEff.utile, 'solo voci registrate', '#2563EB', 'eur', cE)
        + card('Utile provvisorio', R.totPrev.utile, 'con proposte e previsioni', '#7C3AED', 'eur', cP)
        + '</div>';
    } else {
      h += '<div class="ce-kpi">'
        + card('Entrate', Tv.ricavi, (_tit ? 'provvigioni e altre entrate' : 'quote agente e altre entrate') + ' · ' + sotto, '#16A34A', 'su')
        + card('Uscite', Tv.costi, 'spese di struttura e imposte · ' + sotto, '#DC2626', 'giu')
        + card('Risultato ante imposte', Tv.anteImposte, 'entrate meno spese di struttura', '#D97706', 'bil')
        + card(_ceVista === 'provvisorio' ? 'Utile provvisorio' : 'Utile effettivo',
               Tv.utile, sotto, '#2563EB', 'eur', Tv.utile >= 0 ? '#15803D' : '#B91C1C')
        + '</div>';
    }
  } else {
    h += '<div class="ce-kpi">'
      + card('Entrato', R.cassa.incassato, 'incassato davvero nel ' + R.anno, '#16A34A', 'su')
      + card('Uscito', R.cassa.uscito, 'pagato davvero nel ' + R.anno, '#DC2626', 'giu')
      + card('Saldo', R.cassa.saldo, 'differenza fra i due', '#2563EB', 'eur',
             R.cassa.saldo >= 0 ? '#15803D' : '#B91C1C')
      + card('Da incassare', R.daIncassare, 'partite ancora aperte', '#D97706', 'bil')
      + '</div>';
  }

  h += (_ceDoc === 'costi') ? _ceCostiFissi(R)
       : (_ceDoc === 'ai') ? _ceAssistente(R)
       : (_ceDoc === 'mensile') ? _ceMensile(R)
       : (_ceDoc === 'cassa') ? _ceDocCassa(R)
       : ((_ceVista === 'confronto') ? _ceConfronto(R) : _ceProspetto(R));

  if(R.pipeline && (_ceDoc === 'economico' || _ceDoc === 'cassa')){
    h += '<div style="font-size:0.77rem;color:var(--text3);margin-top:10px;line-height:1.6">'
      + (R.prospettiva === 'titolare'
          ? 'Nel provvisorio, proposte e trattative entrano per la provvigione intera, e il costo degli '
            + 'agenti è stimato al ' + R.percAgente + '% del volume, come nelle provvigioni di quest\'anno'
          : 'Nel provvisorio, proposte e trattative sono convertite nella tua quota al '
            + R.percAgente + '%' + (R.percDaStorico ? ', percentuale ricavata dalle provvigioni di quest\'anno' : ''))
      + '. Il portafoglio senza proposte resta fuori: non si vende tutto.</div>';
  }
  if(R.avvisi.length){
    h += '<div style="margin-top:12px;background:#FEF9C3;border:1px solid #FDE68A;border-radius:12px;'
      + 'padding:11px 14px;font-size:0.81rem;color:#A16207;line-height:1.6">'
      + '<b>Cosa manca perché questo conto sia attendibile</b><br>'
      + R.avvisi.slice(0,6).map(function(x){ return '· ' + _ceEsc(x); }).join('<br>') + '</div>';
  }
  /* [15 set 2026] I controlli sono un'altra cosa dagli avvisi: non dicono che
     manca un dato, dicono che un dato NON TORNA. Riquadro rosso, apribile,
     assente quando è tutto in ordine. */
  if(R.controlli.length){
    h += '<details style="margin-top:12px;background:#FEE2E2;border:1px solid #FECACA;'
      + 'border-radius:12px;padding:11px 14px">'
      + '<summary style="cursor:pointer;font-size:0.84rem;font-weight:800;color:#B91C1C">'
      + R.controlli.length + (R.controlli.length === 1 ? ' dato da controllare' : ' dati da controllare')
      + '</summary>'
      + '<div style="margin-top:8px;font-size:0.81rem;color:#B91C1C;line-height:1.7">'
      + R.controlli.slice(0,20).map(function(c){
          return '· <b>' + _ceEsc(c.et) + '</b> — ' + _ceEsc(c.msg);
        }).join('<br>')
      + (R.controlli.length > 20 ? '<br><i>e altri ' + (R.controlli.length-20) + '</i>' : '')
      + '<div style="margin-top:8px;font-size:0.77rem;opacity:.85">'
      + 'Il bilancio si protegge da solo da queste anomalie, ma i dati restano storti '
      + 'nelle schede: conviene correggerli lì.</div></div></details>';
  }
  h += '<div style="font-size:0.76rem;color:var(--text3);margin-top:12px;line-height:1.6">'
    + (_ceDoc === 'costi'
        ? 'Costi fissi: ogni voce è una regola, i mesi si calcolano da lì. Agenzia e Business entrano nelle spese di struttura '
          + '(scadenze passate nell\'Effettivo, quelle future nel Provvisorio); i Personali restano fuori dall\'utile. '
        : _ceDoc === 'ai'
        ? 'L\'assistente riceve i totali del Bilancio, i mesi, i costi fissi e i dati da controllare: non riceve telefoni né indirizzi. '
        : _ceDoc === 'mensile'
        ? 'Mese per mese: gli stessi conti di "' + (_ceMeseBase === 'cassa' ? 'Incassi e pagamenti' : 'Conto economico (effettivo)')
          + '" divisi per la data di ogni voce; il totale dell\'anno è lo stesso. '
        : _ceDoc === 'economico'
        ? 'Conto economico per competenza: un affare conta nell\'anno in cui matura, anche se i '
          + 'soldi si muovono dopo. Gli incassi e i pagamenti stanno in "Incassi e pagamenti". '
          + 'Gli anticipi per il cliente pesano solo finché non vengono rimborsati: quando il '
          + 'cliente restituisce, la voce si azzera e sparisce da qui. '
        : 'Documento di cassa: conta solo il denaro che si è mosso davvero nel periodo. ')
    + 'Fatture e Incassi NF non compaiono: sono la forma documentale delle stesse provvigioni, '
    + 'contarle sarebbe contare due volte gli stessi soldi.</div>';

  corpo.innerHTML = h;
}

window.apriContoEconomico = function(){
  chiudiContoEconomico();
  _ceAnnoSel = new Date().getFullYear();
  _ceFormSez = null; _ceEditId = null;
  var w = document.createElement('div');
  w.id = 'ce-wrap';
  w.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:9000;background:var(--bg);'
    + 'display:flex;flex-direction:column;overflow:hidden;transition:left .25s cubic-bezier(.4,0,.2,1)';
  w.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;'
    + 'background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0">'
    + '<button onclick="chiudiContoEconomico()" class="btn btn-outline btn-sm" '
    + 'style="display:inline-flex;align-items:center;gap:6px">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/>'
    + '<polyline points="12 19 5 12 12 5"/></svg> Chiudi</button>'
    + '<div style="font-weight:800;color:var(--text);font-size:0.95rem">Bilancio Agenzia</div>'
    + '<div style="margin-left:auto;display:flex;gap:8px">'
    + '<button class="btn btn-outline btn-sm" onclick="ceStampa()" '
    + 'style="display:inline-flex;align-items:center;gap:6px">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/>'
    + '<path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>'
    + '<rect x="6" y="14" width="12" height="8"/></svg> Stampa</button>'
    + '<button class="btn btn-outline btn-sm" onclick="ceEsportaExcel()" '
    + 'style="display:inline-flex;align-items:center;gap:6px">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>'
    + '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Excel</button>'
    + '</div></div>'
    + '<style>' + CE_CSS + '</style>'
    + '<div style="flex:1;overflow:auto;padding:18px 22px"><div id="ce-corpo" class="ce-doc"></div></div>';
  document.body.appendChild(w);
  /* [15 set 2026] _ceSeguiMenu vive nel monolite, non qui. Chiamarla per nome
     nudo funziona finché esiste come globale, ma se mancasse sarebbe un
     ReferenceError e la finestra non si aprirebbe proprio. Meglio il controllo,
     come fa già il modulo Obiettivi: al massimo il riquadro copre il menu. */
  try{ if(typeof window._ceSeguiMenu === 'function') window._ceSeguiMenu(w); }catch(e){}
  ceDisegna();
};


/* ════════════════════════════════════════════════════════════════════════
   MESE PER MESE                                               [2 ott 2026]
   ------------------------------------------------------------------------
   Richiesta di Enzo: ricavi e costi di ogni mese, come nel programma
   concorrente, col confronto con l'anno prima.
   Scelte di Enzo: interruttore Competenza / Cassa, terza linguetta, clic su
   un mese = le voci di quel mese.
   NESSUN CONTO NUOVO: si parte dal risultato di ceCalcola (lo stesso delle
   altre due linguette) e si divide ogni voce per la sua data. Così il totale
   dell'anno qui è per costruzione quello del Conto economico o di Incassi e
   pagamenti. Ciò che non ha un mese (le voci a mano hanno solo l'anno) va
   nella riga "Senza mese" invece di essere spalmato a caso; se qualcosa non
   quadrasse, la differenza finisce lì con la sua etichetta, mai nascosta.
   ════════════════════════════════════════════════════════════════════════ */
var _ceMeseBase = 'competenza';     /* competenza | cassa */
var _ceMeseAperto = -1;             /* mese con le voci aperte (0-11, 12 = senza mese) */
var CE_MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
var CE_COL_RIC = '#16A34A', CE_COL_COS = '#DC2626', CE_COL_UT = '#2563EB';

function _ceMeseDati(R, base){
  var M = [];
  for(var i = 0; i < 13; i++) M.push({ric:0, cos:0, voci:[]});
  var metti = function(lato, data, imp, voce){
    imp = _ceN(imp);
    if(Math.abs(imp) < 0.005) return;
    var d = objCeData(data);
    var k = (d && d.anno === R.anno && d.mese >= 1 && d.mese <= 12) ? d.mese - 1 : 12;
    if(k === 12 && d && d.anno !== R.anno && !voce.nota) voce.nota = 'data del ' + d.anno;
    M[k][lato] = _ceArr(M[k][lato] + imp);
    voce.lato = lato; voce.imp = _ceArr(imp); voce.data = data || '';
    M[k].voci.push(voce);
  };
  var attesi = {ric:0, cos:0};
  if(base === 'cassa'){
    var C = R.cassaDet || {}, tit = (R.prospettiva === 'titolare');
    var lista = function(arr, lato, sezNome){
      (arr || []).forEach(function(x){ if(x) metti(lato, x.data, x.imp, {et:x.et, sez:sezNome, nota:x.nota || ''}); });
    };
    if(tit) lista(C.clienti, 'ric', 'Provvigioni incassate dai clienti');
    else lista(C.quote, 'ric', 'Quote agente incassate');
    lista(C.altreEntrate, 'ric', 'Altre entrate');
    lista(C.trattenute, 'cos', 'Trattenute ufficio');
    lista(C.agenti, 'cos', 'Compensi agli agenti');
    lista(C.struttura, 'cos', 'Spese di struttura');
    lista(C.imposte, 'cos', 'F24 versati');
    var aM = (R.cassa && R.cassa.aMano) || {};
    Object.keys(aM).forEach(function(sez){
      if(sez === 'diretti') return;            /* anticipi: fuori da entrato e uscito */
      var o = null; (R.sezioni || []).forEach(function(x){ if(x.id === sez) o = x; });
      var lato = (o && o.lato === 'entrate') ? 'ric' : 'cos';
      (aM[sez].det || []).forEach(function(d){
        metti(lato, '', d.imp, {et:d.et, sez:(o ? o.nome || o.titolo || sez : sez), nota:'voce a mano: ha solo l\'anno'});
      });
    });
    attesi.ric = _ceN(R.cassa && R.cassa.incassato);
    attesi.cos = _ceN(R.cassa && R.cassa.uscito);
  } else {
    (R.sezioni || []).forEach(function(x){
      var lato = (x.lato === 'entrate') ? 'ric' : 'cos';
      var sezNome = (typeof _ceNomeSez === 'function') ? _ceNomeSez(x.id) : (x.nome || x.id);
      ((R.eff[x.id] || {}).righe || []).forEach(function(r){
        var dir = (x.id === 'diretti');
        var val = dir ? _ceN(r.impAperto) : _ceN(r.imp);
        if(Math.abs(val) < 0.005) return;
        var det = (dir ? r.detAperto : r.det) || [];
        var top = det.filter(function(d){ return d && !d.liv && !d.saldo; });
        var somma = 0; top.forEach(function(d){ somma += _ceN(d.imp); });
        if(top.length && Math.abs(somma - val) < 0.02){
          top.forEach(function(d){
            metti(lato, d.data, d.imp, {et:d.et, sez:sezNome, voce:r.et, nota:d.nota || ''});
          });
        } else {
          metti(lato, '', val, {et:r.et, sez:sezNome, nota:(r.voceId ? 'voce a mano: ha solo l\'anno' : 'senza data')});
        }
      });
    });
    attesi.ric = _ceN(R.totEff && R.totEff.ricavi);
    attesi.cos = _ceN(R.totEff && R.totEff.costi);
  }
  var tot = {ric:0, cos:0};
  M.forEach(function(m){ tot.ric += m.ric; tot.cos += m.cos; });
  ['ric', 'cos'].forEach(function(l){
    var diff = _ceArr(attesi[l] - tot[l]);
    if(Math.abs(diff) > 0.009){
      M[12][l] = _ceArr(M[12][l] + diff);
      M[12].voci.push({lato:l, imp:diff, data:'', et:'Differenza non attribuibile a un mese', sez:'', nota:'controllo dei totali'});
      tot[l] += diff;
    }
  });
  M.forEach(function(m){ m.ut = _ceArr(m.ric - m.cos); });
  return {mesi:M, ric:_ceArr(tot.ric), cos:_ceArr(tot.cos), ut:_ceArr(tot.ric - tot.cos)};
}

function _ceMesePerc(a, b){        /* variazione % di a rispetto a b */
  if(!b || Math.abs(b) < 0.005) return null;
  return Math.round((a - b) / Math.abs(b) * 1000) / 10;
}
function _ceMeseVar(a, b, inverti){
  var p = _ceMesePerc(a, b);
  if(p === null) return '<span style="color:var(--text3)">—</span>';
  var buono = inverti ? p <= 0 : p >= 0;
  var col = (p === 0) ? 'var(--text3)' : (buono ? '#15803D' : '#B91C1C');
  return '<span style="color:' + col + ';font-weight:700">' + (p > 0 ? '+' : '') + String(p).replace('.', ',') + '%</span>';
}

var CE_MESE_CSS = ''
  + '#ce-wrap .cm-kpi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}'
  + '#ce-wrap .cm-k{background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px 16px;position:relative;overflow:hidden}'
  + '#ce-wrap .cm-k::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--c)}'
  + '#ce-wrap .cm-k .v{font-size:1.5rem;font-weight:800;letter-spacing:-.04em;line-height:1.1;color:var(--text);font-variant-numeric:tabular-nums}'
  + '#ce-wrap .cm-k .e{font-size:0.78rem;font-weight:600;color:var(--text2);margin-top:4px}'
  + '#ce-wrap .cm-k .s{font-size:0.72rem;color:var(--text3);margin-top:2px}'
  + '#ce-wrap .cm-box{background:#fff;border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:14px}'
  + '#ce-wrap .cm-hd{display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid var(--border);font-size:0.95rem;font-weight:700;color:var(--text);flex-wrap:wrap}'
  + '#ce-wrap .cm-hd .pt{width:9px;height:9px;border-radius:50%;background:var(--c,#2563EB)}'
  + '#ce-wrap .cm-leg{margin-left:auto;display:flex;gap:14px;font-size:0.76rem;font-weight:600;color:var(--text2)}'
  + '#ce-wrap .cm-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}'
  + '#ce-wrap .cm-tab{width:100%;border-collapse:collapse;font-size:0.86rem}'
  + '#ce-wrap .cm-tab th{font-size:0.74rem;font-weight:600;color:var(--text2);text-align:right;padding:10px 14px;border-bottom:1px solid var(--border);background:#F8FAFC;white-space:nowrap}'
  + '#ce-wrap .cm-tab th:first-child,#ce-wrap .cm-tab td:first-child{text-align:left}'
  + '#ce-wrap .cm-tab td{padding:10px 14px;border-bottom:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}'
  + '#ce-wrap .cm-tab tr.m{cursor:pointer}'
  + '#ce-wrap .cm-tab tr.m:hover td{background:#FAFBFF}'
  + '#ce-wrap .cm-tab tr.m.on td{background:#EFF6FF}'
  + '#ce-wrap .cm-tab tr.fut td{color:var(--text3)}'
  + '#ce-wrap .cm-tab tr.tot td{font-weight:800;background:#F8FAFC;border-bottom:none}'
  + '#ce-wrap .cm-tab .zero{color:var(--text4,#CBD5E1)}'
  + '#ce-wrap .cm-tab .fr{display:inline-block;width:14px;color:var(--text3);font-size:0.7rem}'
  + '#ce-wrap .cm-voci td{background:#FBFCFE;padding:0 14px 12px}'
  + '#ce-wrap .cm-v{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:10px}'
  + '#ce-wrap .cm-v h5{margin:0 0 6px;font-size:0.78rem;font-weight:700}'
  + '#ce-wrap .cm-vr{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dotted var(--border);font-size:0.8rem;white-space:normal;text-align:left}'
  + '#ce-wrap .cm-vr small{display:block;color:var(--text3);font-size:0.72rem}'
  + '#ce-wrap .cm-vr b{white-space:nowrap;font-variant-numeric:tabular-nums}'
  + '#ce-wrap .cm-sw{display:inline-flex;background:#F1F5F9;border-radius:10px;padding:4px;gap:2px}'
  + '#ce-wrap .cm-sw button{border:none;background:transparent;border-radius:7px;padding:7px 14px;font-size:0.82rem;font-weight:600;color:var(--text3);cursor:pointer;font-family:inherit}'
  + '#ce-wrap .cm-sw button.on{background:#fff;color:var(--brand-dark,#1D4ED8);box-shadow:0 1px 3px rgba(15,23,42,.10)}'
  + '#ce-wrap .cm-scroll{overflow-x:auto}'
  + 'body.dark-mode #ce-wrap .cm-k,body.dark-mode #ce-wrap .cm-box{background:var(--bg2)}'
  + 'body.dark-mode #ce-wrap .cm-tab th,body.dark-mode #ce-wrap .cm-tab tr.tot td,body.dark-mode #ce-wrap .cm-voci td{background:rgba(255,255,255,.04)}'
  + 'body.dark-mode #ce-wrap .cm-sw{background:rgba(255,255,255,.06)}'
  + 'body.dark-mode #ce-wrap .cm-sw button.on{background:rgba(255,255,255,.12);color:#93C5FD}'
  + '@media(max-width:820px){#ce-wrap .cm-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}#ce-wrap .cm-v{grid-template-columns:1fr}}';

/* grafico a barre: ricavi e costi affiancati, utile come punto */
function _ceMeseGrafico(A, P, anno, prevCos){
  var W = 960, H = 260, sx = 64, dx = 12, top = 16, bot = 30;
  var max = 0, min = 0;
  for(var i = 0; i < 12; i++){
    var m = A.mesi[i];
    max = Math.max(max, m.ric, m.cos, m.ut, (prevCos ? prevCos[i] : 0)); min = Math.min(min, m.ut);
  }
  if(max <= 0 && min >= 0) return '<div style="padding:38px 18px;text-align:center;color:var(--text3);font-size:0.86rem">Nessun movimento con una data nel ' + anno + '.</div>';
  var passo = function(v){ var p = Math.pow(10, Math.floor(Math.log10(v || 1))); var n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
  var tick = passo((max - min) / 4);
  max = Math.ceil(max / tick) * tick; min = Math.floor(min / tick) * tick;
  if(max === min) max = min + tick;
  var y = function(v){ return top + (H - top - bot) * (max - v) / (max - min); };
  var gw = (W - sx - dx) / 12, bw = Math.min(22, gw * 0.3);
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;max-height:300px" font-family="inherit">';
  for(var t = min; t <= max + 0.001; t += tick){
    var yy = y(t);
    s += '<line x1="' + sx + '" x2="' + (W - dx) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + (t === 0 ? '#94A3B8' : '#E2E8F0') + '" stroke-width="1"/>'
      + '<text x="' + (sx - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#64748B">'
      + (Math.abs(t) >= 1000 ? (t / 1000).toLocaleString('it-IT', {maximumFractionDigits:1}) + 'k' : Math.round(t)) + '</text>';
  }
  var pts = [];
  for(var k = 0; k < 12; k++){
    var M = A.mesi[k], cx = sx + gw * k + gw / 2, y0 = y(0);
    var bar = function(x, v, col, et){
      if(v <= 0) return '';
      return '<rect x="' + x + '" y="' + y(v) + '" width="' + bw + '" height="' + Math.max(1, y0 - y(v)) + '" rx="3" fill="' + col + '"><title>' + et + ' ' + CE_MESI[k] + ': ' + _ceE(v) + '</title></rect>';
    };
    s += bar(cx - bw - 1, M.ric, CE_COL_RIC, 'Ricavi') + bar(cx + 1, M.cos, CE_COL_COS, 'Costi');
    /* [2 ott 2026] costi fissi già previsti nei mesi che verranno: barra chiara */
    if(prevCos && prevCos[k] > 0 && !M.cos){
      s += '<rect x="' + (cx + 1) + '" y="' + y(prevCos[k]) + '" width="' + bw + '" height="' + Math.max(1, y0 - y(prevCos[k])) + '" rx="3" fill="' + CE_COL_COS + '" opacity=".22" stroke="' + CE_COL_COS + '" stroke-dasharray="3 2"><title>Costi fissi previsti ' + CE_MESI[k] + ': ' + _ceE(prevCos[k]) + '</title></rect>';
    }
    if(P){
      var pu = P.mesi[k].ut;
      if(Math.abs(pu) > 0.005) s += '<line x1="' + (cx - bw - 4) + '" x2="' + (cx + bw + 4) + '" y1="' + y(pu) + '" y2="' + y(pu) + '" stroke="#94A3B8" stroke-width="2" stroke-dasharray="3 2"><title>Utile ' + CE_MESI[k] + ' ' + (anno - 1) + ': ' + _ceE(pu) + '</title></line>';
    }
    if(M.ric || M.cos) pts.push([cx, y(M.ut), M.ut, k]);
    s += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#64748B">' + CE_MESI[k].slice(0, 3) + '</text>';
  }
  if(pts.length > 1) s += '<polyline points="' + pts.map(function(p){ return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="' + CE_COL_UT + '" stroke-width="1.5" opacity=".5"/>';
  pts.forEach(function(p){
    s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="#fff" stroke="' + CE_COL_UT + '" stroke-width="2"><title>Utile ' + CE_MESI[p[3]] + ': ' + _ceE(p[2]) + '</title></circle>';
  });
  return s + '</svg>';
}

function _ceMensile(R){
  var A = _ceMeseDati(R, _ceMeseBase);
  var P = null;
  try{ P = _ceMeseDati(ceCalcola(R.anno - 1), _ceMeseBase); }catch(e){ console.warn('[Bilancio] anno prima KO:', e); }
  var cassa = (_ceMeseBase === 'cassa'), ap = R.anno - 1;
  var etR = cassa ? 'Entrato' : 'Ricavi', etC = cassa ? 'Uscito' : 'Costi', etU = cassa ? 'Saldo' : 'Utile';
  var oggi = new Date(), meseOggi = (oggi.getFullYear() === R.anno) ? oggi.getMonth() : (oggi.getFullYear() > R.anno ? 11 : -1);

  var h = '<style>' + CE_MESE_CSS + '</style>';
  h += '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">'
    + '<div class="cm-sw">'
    + [['competenza', 'Competenza'], ['cassa', 'Cassa']].map(function(v){
        return '<button class="' + (_ceMeseBase === v[0] ? 'on' : '') + '" onclick="_ceMeseVaiBase(\'' + v[0] + '\')">' + v[1] + '</button>';
      }).join('') + '</div>'
    + '<span style="font-size:0.78rem;color:var(--text3)">'
    + (cassa ? 'il denaro entrato e uscito, mese per mese' : 'ogni affare e ogni spesa nel mese della sua data, anche se non ancora pagati')
    + '</span></div>';

  var prevTot = 0; (R.cfPrevMesi || []).forEach(function(v){ prevTot += v; }); prevTot = _ceArr(prevTot);
  var PE = R.personali || {voci:0}, conPers = PE.voci > 0;
  var persMesi = conPers ? (cassa ? PE.mesiCassa : PE.mesi) : null;
  var persTot = 0; (persMesi || []).forEach(function(v){ persTot += v; }); persTot = _ceArr(persTot);
  var marg = (A.ric > 0.005) ? Math.round(A.ut / A.ric * 1000) / 10 : null;
  var margP = (P && P.ric > 0.005) ? Math.round(P.ut / P.ric * 1000) / 10 : null;
  var k = function(et, val, col, sotto){
    return '<div class="cm-k" style="--c:' + col + '"><div class="v"' + (col === '#B91C1C' ? ' style="color:#B91C1C"' : '') + '>' + val + '</div><div class="e">' + et + '</div><div class="s">' + sotto + '</div></div>';
  };
  var vs = function(a, b, inv){ return P ? 'vs ' + ap + ': ' + _ceMeseVar(a, b, inv) + ' <span style="color:var(--text3)">(' + _ceE(b) + ')</span>' : '&nbsp;'; };
  h += '<div class="cm-kpi">'
    + k(etR, '€ ' + _ceE(A.ric), CE_COL_RIC, vs(A.ric, P && P.ric))
    + k(etC, '€ ' + _ceE(A.cos), CE_COL_COS, vs(A.cos, P && P.cos, true)
        + (prevTot > 0 ? '<br>+ € ' + _ceE(prevTot) + ' di costi fissi già previsti' : ''))
    + k(etU, '€ ' + _ceE(A.ut), A.ut >= 0 ? CE_COL_UT : '#B91C1C', vs(A.ut, P && P.ut))
    + k('Margine %', marg === null ? '—' : String(marg).replace('.', ',') + '%', '#7C3AED',
        margP === null ? (cassa ? 'saldo su entrato' : 'utile sui ricavi') : ap + ': ' + String(margP).replace('.', ',') + '%')
    + '</div>';
  /* [2 ott 2026] spese personali: fuori dall'utile, ma accanto */
  if(conPers){
    var resta = _ceArr(A.ut - persTot), mesiPass = Math.max(1, Math.min(12, (meseOggi < 0 ? 12 : meseOggi + 1)));
    var persAnno = _ceArr(PE.eff + PE.prev);
    h += '<div class="cm-box" style="padding:12px 18px;display:flex;flex-wrap:wrap;gap:8px 26px;font-size:0.84rem;color:var(--text2)">'
      + '<span><b style="color:#7C3AED">Spese personali</b> ' + (cassa ? 'pagate' : 'fino a oggi') + ': <b style="color:var(--text)">€ ' + _ceE(persTot) + '</b></span>'
      + '<span>Ti resta dopo le spese personali: <b style="color:' + (resta >= 0 ? '#15803D' : '#B91C1C') + '">€ ' + _ceE(resta) + '</b></span>'
      + '<span>Per coprirle ti servono in media <b style="color:var(--text)">€ ' + _ceE(_ceArr(persAnno / 12)) + '</b> di ' + etU.toLowerCase() + ' al mese</span>'
      + '</div>';
  }

  h += '<div class="cm-box"><div class="cm-hd"><span class="pt" style="--c:' + CE_COL_UT + '"></span>' + etR + ' e ' + etC.toLowerCase() + ' per mese'
    + '<div class="cm-leg"><span><i style="background:' + CE_COL_RIC + '"></i>' + etR + '</span><span><i style="background:' + CE_COL_COS + '"></i>' + etC + '</span>'
    + '<span><i style="background:#fff;border:2px solid ' + CE_COL_UT + ';border-radius:50%;width:8px;height:8px"></i>' + etU + '</span>'
    + (P ? '<span><i style="background:repeating-linear-gradient(90deg,#94A3B8 0 3px,transparent 3px 5px);height:3px;vertical-align:2px"></i>' + etU + ' ' + ap + '</span>' : '')
    + (prevTot > 0 ? '<span><i style="background:' + CE_COL_COS + ';opacity:.25"></i>Costi previsti</span>' : '')
    + '</div></div><div style="padding:12px 14px 6px">' + _ceMeseGrafico(A, P, R.anno, prevTot > 0 ? R.cfPrevMesi : null) + '</div></div>';

  var cella = function(v, col){ return Math.abs(v) < 0.005 ? '<span class="zero">—</span>' : '<span' + (col ? ' style="color:' + col + '"' : '') + '>' + _ceE(v) + '</span>'; };
  var righe = '';
  var cumU = 0;
  for(var i = 0; i < 13; i++){
    var M = A.mesi[i];
    if(i === 12 && !M.voci.length) continue;
    var Pm = P ? P.mesi[i] : null;
    var fut = (i < 12 && i > meseOggi && !M.ric && !M.cos);
    var aperto = (_ceMeseAperto === i);
    var mm = (M.ric > 0.005) ? String(Math.round(M.ut / M.ric * 1000) / 10).replace('.', ',') + '%' : '<span class="zero">—</span>';
    if(i < 12) cumU = _ceArr(cumU + M.ut);
    righe += '<tr class="m' + (aperto ? ' on' : '') + (fut ? ' fut' : '') + '" onclick="_ceMeseApri(' + i + ')">'
      + '<td><span class="fr">' + (M.voci.length ? (aperto ? '▾' : '▸') : '') + '</span>' + (i === 12 ? 'Senza mese' : CE_MESI[i]) + '</td>'
      + '<td>' + cella(M.ric, CE_COL_RIC) + '</td>'
      + '<td>' + ((i < 12 && !M.cos && R.cfPrevMesi && R.cfPrevMesi[i] > 0)
            ? '<span style="color:var(--text3);font-style:italic" title="costi fissi previsti">prev. ' + _ceE(R.cfPrevMesi[i]) + '</span>'
            : cella(M.cos, CE_COL_COS)) + '</td>'
      + '<td style="font-weight:700">' + cella(M.ut, M.ut < 0 ? '#B91C1C' : '') + '</td>'
      + '<td>' + mm + '</td>'
      + '<td>' + (i < 12 && !fut ? cella(cumU) : '') + '</td>'
      /* un mese che deve ancora venire non si confronta: sarebbe un -100% finto */
      + (conPers ? (i < 12
            ? '<td>' + ((!persMesi[i] && PE.mesiPrev[i] > 0) ? '<span style="color:var(--text3);font-style:italic">prev. ' + _ceE(PE.mesiPrev[i]) + '</span>' : cella(persMesi[i], '#7C3AED')) + '</td>'
              + '<td>' + (fut ? '' : cella(_ceArr(M.ut - persMesi[i]), (M.ut - persMesi[i]) < 0 ? '#B91C1C' : '')) + '</td>'
            : '<td></td><td></td>') : '')
      + (P ? '<td>' + cella(Pm.ut) + '</td><td>' + (fut || (Math.abs(M.ut) < 0.005 && Math.abs(Pm.ut) < 0.005) ? '<span class="zero">—</span>' : _ceMeseVar(M.ut, Pm.ut)) + '</td>' : '')
      + '</tr>';
    if(aperto) righe += '<tr class="cm-voci"><td colspan="' + ((P ? 8 : 6) + (conPers ? 2 : 0)) + '">' + _ceMeseVoci(M, etR, etC) + '</td></tr>';
  }
  righe += '<tr class="tot"><td>Totale ' + R.anno + '</td><td>' + _ceE(A.ric) + '</td><td>' + _ceE(A.cos) + '</td><td>' + _ceE(A.ut) + '</td>'
    + '<td>' + (marg === null ? '—' : String(marg).replace('.', ',') + '%') + '</td><td></td>'
    + (conPers ? '<td>' + _ceE(persTot) + '</td><td>' + _ceE(_ceArr(A.ut - persTot)) + '</td>' : '')
    + (P ? '<td>' + _ceE(P.ut) + '</td><td>' + _ceMeseVar(A.ut, P.ut) + '</td>' : '') + '</tr>';
  h += '<div class="cm-box"><div class="cm-hd"><span class="pt" style="--c:#0F172A"></span>Il ' + R.anno + ' mese per mese'
    + '<span style="margin-left:auto;font-size:0.76rem;font-weight:500;color:var(--text3)">clicca un mese per vedere le voci</span></div>'
    + '<div class="cm-scroll"><table class="cm-tab"><thead><tr><th>Mese</th><th>' + etR + '</th><th>' + etC + '</th><th>' + etU + '</th><th>Margine</th><th>' + etU + ' progressivo</th>'
    + (conPers ? '<th>Personali</th><th>Ti resta</th>' : '')
    + (P ? '<th>' + etU + ' ' + ap + '</th><th>vs ' + ap + '</th>' : '') + '</tr></thead><tbody>' + righe + '</tbody></table></div></div>';

  var nota = [];
  if(A.mesi[12].voci.length) nota.push('"Senza mese" raccoglie le voci che hanno solo l\'anno (quelle inserite a mano nel Bilancio) o una data fuori dal ' + R.anno + ': contano nel totale ma non in un mese.');
  if(cassa) nota.push(R.prospettiva === 'titolare'
    ? 'In cassa le provvigioni pagate dai clienti stanno nel mese della data della provvigione: è la data che usa anche "Incassi e pagamenti".'
    : 'In cassa le tue quote stanno nel mese della data della provvigione (rogito o proposta): il gestionale non registra il giorno in cui l\'agenzia ti paga.');
  else nota.push('Competenza, solo voci registrate (come "Effettivo"): proposte e trattative in corso non hanno un mese e restano nel Provvisorio del Conto economico.');
  h += '<div style="font-size:0.76rem;color:var(--text3);line-height:1.6">' + nota.join(' ') + '</div>';
  return h;
}

function _ceMeseVoci(M, etR, etC){
  var col = function(lato, tit, colr){
    var V = M.voci.filter(function(v){ return v.lato === lato; })
      .sort(function(a, b){ return String(a.data || '').localeCompare(String(b.data || '')) || (b.imp - a.imp); });
    if(!V.length) return '<div><h5 style="color:' + colr + '">' + tit + '</h5><div style="font-size:0.8rem;color:var(--text3)">nessuna voce</div></div>';
    return '<div><h5 style="color:' + colr + '">' + tit + '</h5>' + V.map(function(v){
      var sotto = [v.data ? _ceData(v.data) : '', v.sez, v.voce && v.voce !== v.et && v.voce !== v.sez ? v.voce : '', v.nota].filter(Boolean).join(' · ');
      return '<div class="cm-vr"><span>' + _ceEsc(v.et) + (sotto ? '<small>' + _ceEsc(sotto) + '</small>' : '') + '</span><b>' + _ceE(v.imp) + '</b></div>';
    }).join('') + '</div>';
  };
  return '<div class="cm-v">' + col('ric', etR, CE_COL_RIC) + col('cos', etC, CE_COL_COS) + '</div>';
}

window._ceMeseVaiBase = function(b){ _ceMeseBase = b; _ceMeseAperto = -1; ceDisegna(); };
window._ceMeseApri = function(i){ _ceMeseAperto = (_ceMeseAperto === i) ? -1 : i; ceDisegna(); };

/* righe per Excel e stampa: le stesse cifre della tabella */
function _ceMeseRighe(){
  var R = ceCalcola(_ceAnnoSel), A = _ceMeseDati(R, _ceMeseBase), P = null;
  try{ P = _ceMeseDati(ceCalcola(_ceAnnoSel - 1), _ceMeseBase); }catch(e){}
  var out = [];
  for(var i = 0; i < 13; i++){
    var M = A.mesi[i]; if(i === 12 && !M.voci.length) continue;
    out.push({mese:(i === 12 ? 'Senza mese' : CE_MESI[i]), ric:M.ric, cos:M.cos, ut:M.ut, utP:(P ? P.mesi[i].ut : null)});
  }
  return {R:R, A:A, P:P, righe:out};
}
function _ceMeseExcel(){
  var X = _ceMeseRighe(), cassa = (_ceMeseBase === 'cassa'), ap = _ceAnnoSel - 1;
  var head = ['Mese', cassa ? 'Entrato' : 'Ricavi', cassa ? 'Uscito' : 'Costi', cassa ? 'Saldo' : 'Utile'].concat(X.P ? [(cassa ? 'Saldo ' : 'Utile ') + ap] : []);
  var aoa = [['Bilancio ' + _ceAnnoSel + ' — mese per mese (' + (cassa ? 'cassa' : 'competenza') + ')'], [], head];
  X.righe.forEach(function(r){ aoa.push([r.mese, r.ric, r.cos, r.ut].concat(X.P ? [r.utP] : [])); });
  aoa.push(['Totale', X.A.ric, X.A.cos, X.A.ut].concat(X.P ? [X.P.ut] : []));
  var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:14}, {wch:14}, {wch:14}, {wch:14}, {wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'Mese per mese');
  try{ XLSX.writeFile(wb, 'bilancio-mensile-' + _ceAnnoSel + '.xlsx'); }catch(e){ console.warn('[Bilancio] Excel KO:', e); }
}
function _ceMeseStampa(){
  var X = _ceMeseRighe(), cassa = (_ceMeseBase === 'cassa'), ap = _ceAnnoSel - 1;
  var e = function(v){ return v === null ? '' : _ceE(v); };
  var th = '<th>Mese</th><th>' + (cassa ? 'Entrato' : 'Ricavi') + '</th><th>' + (cassa ? 'Uscito' : 'Costi') + '</th><th>' + (cassa ? 'Saldo' : 'Utile') + '</th>' + (X.P ? '<th>' + ap + '</th>' : '');
  var tb = X.righe.map(function(r){ return '<tr><td>' + r.mese + '</td><td>' + e(r.ric) + '</td><td>' + e(r.cos) + '</td><td>' + e(r.ut) + '</td>' + (X.P ? '<td>' + e(r.utP) + '</td>' : '') + '</tr>'; }).join('')
    + '<tr class="t"><td>Totale</td><td>' + e(X.A.ric) + '</td><td>' + e(X.A.cos) + '</td><td>' + e(X.A.ut) + '</td>' + (X.P ? '<td>' + e(X.P.ut) + '</td>' : '') + '</tr>';
  var w = window.open('', '_blank');
  if(!w){ try{ dlgAlert('Il browser ha bloccato la finestra di stampa.', ''); }catch(err){} return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Bilancio ' + _ceAnnoSel + ' mese per mese</title><style>'
    + 'body{font-family:system-ui,sans-serif;margin:28px;color:#0F172A}h1{font-size:18px;margin:0 0 4px}p{color:#64748B;font-size:12px;margin:0 0 14px}'
    + 'table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:7px 10px;border-bottom:1px solid #E2E8F0;text-align:right}th:first-child,td:first-child{text-align:left}'
    + 'th{background:#F1F5F9}tr.t td{font-weight:800;border-top:2px solid #0F172A}</style></head><body>'
    + '<h1>Bilancio ' + _ceAnnoSel + ' — mese per mese</h1><p>' + (cassa ? 'Cassa: denaro entrato e uscito' : 'Competenza: voci registrate') + ' · stampato il ' + new Date().toLocaleDateString('it-IT') + '</p>'
    + '<table><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table></body></html>');
  w.document.close();
  setTimeout(function(){ try{ w.print(); }catch(err){} }, 300);
}

/* ════════════════════════════════════════════════════════════════════════
   COSTI FISSI — la linguetta                                  [2 ott 2026]
   Come il programma concorrente (Agenzia / Business / Personali, mese
   scelto in alto, riquadri per categoria), ma ogni voce è una regola:
   niente "copia dal mese precedente", i mesi si calcolano da soli.
   ════════════════════════════════════════════════════════════════════════ */
var _ceCFMese = new Date().getMonth();      /* mese guardato (0-11) dell'anno scelto */
var _ceCFCat = 'tutti';
var _ceCFForm = null;                       /* null | 'nuovo' | id della voce in modifica */
var _ceCFEcc = null;                        /* id della voce con l'eccezione del mese aperta */
var _ceCFPreset = null;
var CE_CF_COMUNI = {
  agenzia:['Canone locazione ufficio', 'Energia elettrica', 'Acqua', 'Gas / riscaldamento', 'Internet e telefono fisso',
           'Commercialista', 'Consulente del lavoro', 'Assistente / segreteria', 'Pulizie ufficio', 'Cartoleria e stampe',
           'Software gestionale', 'Assicurazione RC professionale', 'Royalty franchising', 'Spese condominiali ufficio'],
  business:['Portali immobiliari', 'Pubblicità social', 'Servizi fotografici', 'Telefono cellulare', 'Carburante',
            'Rata auto / noleggio', 'Assicurazione auto', 'Formazione', 'Abbonamenti e software', 'Iscrizione CCIAA / ruolo'],
  personali:['Affitto o mutuo casa', 'Bollette casa', 'Spesa alimentare', 'Auto privata', 'Assicurazioni personali',
             'Scuola e figli', 'Abbonamenti personali']
};
function _ceCFCatObj(id){ for(var i = 0; i < CE_CF_CAT.length; i++) if(CE_CF_CAT[i].id === id) return CE_CF_CAT[i]; return CE_CF_CAT[0]; }
function _ceCFTrova(id){ var a = _ceCFTutti(); for(var i = 0; i < a.length; i++) if(a[i] && a[i].id === id) return i; return -1; }
function _ceCFSalvaD(){ try{ if(typeof saveD === 'function') saveD(); }catch(e){ console.warn('[Costi fissi] saveD KO:', e); } }
function _ceCFMeseNome(ym){ var m = String(ym || '').match(/^(\d{4})-(\d{2})/); return m ? CE_MESI[+m[2] - 1].slice(0, 3).toLowerCase() + ' ' + m[1] : ''; }
function _ceCFRicorrenza(c){
  var f = CE_CF_FREQ_NOME[c.freq] || 'ogni mese';
  if(c.freq === 'unica') return 'una volta, ' + _ceCFMeseNome(c.dal) + (c.giorno ? ' (giorno ' + c.giorno + ')' : '');
  return f + ' dal ' + _ceCFMeseNome(c.dal) + (c.al ? ' al ' + _ceCFMeseNome(c.al) : '') + (c.giorno ? ' · giorno ' + c.giorno : '');
}

var CE_CF_CSS = ''
  + '#ce-wrap .cf-bar{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px}'
  + '#ce-wrap .cf-bar label{display:block;font-size:0.74rem;font-weight:600;color:var(--text2);margin-bottom:4px}'
  + '#ce-wrap .cf-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:10px;border:1.5px solid var(--border);background:#fff;cursor:pointer;font:600 0.82rem inherit;font-family:inherit;color:var(--text2)}'
  + '#ce-wrap .cf-pill .pt{width:8px;height:8px;border-radius:50%}'
  + '#ce-wrap .cf-pill.on{border-color:var(--c);color:var(--c);background:color-mix(in srgb,var(--c) 8%,#fff)}'
  + '#ce-wrap .cf-pill .n{background:rgba(15,23,42,.07);border-radius:20px;padding:0 7px;font-size:0.74rem}'
  + '#ce-wrap .cf-tab td.v{white-space:normal;text-align:left}'
  + '#ce-wrap .cf-tab td .r{display:block;font-size:0.74rem;color:var(--text3);margin-top:2px}'
  + '#ce-wrap .cf-bdg{display:inline-block;font-size:0.72rem;font-weight:700;border-radius:20px;padding:2px 9px;border:1px solid}'
  + '#ce-wrap .cf-az{display:inline-flex;gap:4px;justify-content:flex-end}'
  + '#ce-wrap .cf-az button{border:1px solid var(--border);background:#fff;border-radius:7px;padding:5px 7px;cursor:pointer;color:var(--text2);line-height:0}'
  + '#ce-wrap .cf-az button:hover{border-color:var(--brand);color:var(--brand)}'
  + '#ce-wrap .cf-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 14px;padding:14px 18px;background:#F8FAFC;border-bottom:1px solid var(--border)}'
  + '#ce-wrap .cf-form .l2{grid-column:span 2}'
  + '#ce-wrap .cf-form label{display:block;font-size:0.74rem;font-weight:600;color:var(--text2);margin-bottom:4px}'
  + '#ce-wrap .cf-form .fine{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap}'
  + '#ce-wrap .cf-chip{border:1px dashed var(--border);background:#fff;border-radius:20px;padding:4px 10px;font-size:0.76rem;cursor:pointer;font-family:inherit;color:var(--text2)}'
  + '#ce-wrap .cf-chip:hover{border-color:var(--brand);color:var(--brand)}'
  + 'body.dark-mode #ce-wrap .cf-pill,body.dark-mode #ce-wrap .cf-az button,body.dark-mode #ce-wrap .cf-chip{background:var(--bg2)}'
  + 'body.dark-mode #ce-wrap .cf-form{background:rgba(255,255,255,.04)}'
  + '@media(max-width:820px){#ce-wrap .cf-form{grid-template-columns:1fr 1fr}}';

function _ceIco(p, sz){ return '<svg width="' + (sz || 14) + '" height="' + (sz || 14) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }
var CE_ICO_MOD = '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>';
var CE_ICO_DEL = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/>';
var CE_ICO_CAL = '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>';

function _ceCostiFissi(R){
  var anno = R.anno, ym = _ceYM(anno, _ceCFMese + 1), oggi = _ceOggiISO();
  var tutte = _ceCF().filter(function(c){ return _ceContaPerMe(c, R.prospettiva, R.agenteUuid); });
  /* le voci attive nel mese guardato, con la loro scadenza */
  var righe = tutte.map(function(c){
    var occ = _ceCFOccorrenze(c, anno), mio = null, annuo = 0;
    occ.forEach(function(o){ if(!o.saltato) annuo += o.imp; if(o.ym === ym) mio = o; });
    return {c:c, o:mio, annuo:_ceArr(annuo)};
  });
  var tot = {agenzia:0, business:0, personali:0}, n = {agenzia:0, business:0, personali:0, tutti:0};
  righe.forEach(function(r){
    var k = r.c.categoria || 'agenzia'; n[k] = (n[k] || 0) + 1; n.tutti++;
    if(r.o && !r.o.saltato) tot[k] = _ceArr((tot[k] || 0) + r.o.imp);
  });
  var h = '<style>' + CE_MESE_CSS + CE_CF_CSS + '</style>';
  h += '<div class="cf-bar"><div><label>Mese</label><select class="fselect" style="width:auto;min-width:170px" onchange="_ceCFVaiMese(this.value)">'
    + CE_MESI.map(function(m, i){ return '<option value="' + i + '"' + (i === _ceCFMese ? ' selected' : '') + '>' + m + ' ' + anno + '</option>'; }).join('')
    + '</select></div>'
    + '<div style="flex:1"></div>'
    + '<button class="btn btn-primary" onclick="_ceCFApri(\'nuovo\')" style="display:inline-flex;align-items:center;gap:7px">' + _ceIco('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 15) + ' Nuovo costo</button></div>';
  var kk = function(et, val, col, sotto){ return '<div class="cm-k" style="--c:' + col + '"><div class="v">€ ' + _ceE(val) + '</div><div class="e">' + et + '</div><div class="s">' + sotto + '</div></div>'; };
  h += '<div class="cm-kpi">'
    + kk('Costi Agenzia', tot.agenzia, '#2563EB', n.agenzia + ' voci')
    + kk('Costi Business', tot.business, '#0E7490', n.business + ' voci')
    + kk('Costi Personali', tot.personali, '#7C3AED', 'fuori dall\'utile')
    + kk('Totale ' + CE_MESI[_ceCFMese].toLowerCase(), _ceArr(tot.agenzia + tot.business + tot.personali), '#0F172A', 'di cui lavoro € ' + _ceE(_ceArr(tot.agenzia + tot.business)))
    + '</div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
    + [{id:'tutti', nome:'Tutti', col:'#334155'}].concat(CE_CF_CAT).map(function(c){
        return '<button class="cf-pill' + (_ceCFCat === c.id ? ' on' : '') + '" style="--c:' + c.col + '" onclick="_ceCFVaiCat(\'' + c.id + '\')"><span class="pt" style="background:' + c.col + '"></span>' + c.nome + ' <span class="n">' + (n[c.id] || 0) + '</span></button>';
      }).join('') + '</div>';

  var V = righe.filter(function(r){ return _ceCFCat === 'tutti' || (r.c.categoria || 'agenzia') === _ceCFCat; })
    .sort(function(a, b){ return (a.o ? 0 : 1) - (b.o ? 0 : 1) || String(a.c.nome || '').localeCompare(String(b.c.nome || ''), 'it'); });
  var titCat = _ceCFCat === 'tutti' ? 'Tutti i costi fissi' : 'Costi ' + _ceCFCatObj(_ceCFCat).nome;
  var totVis = 0; V.forEach(function(r){ if(r.o && !r.o.saltato) totVis += r.o.imp; });
  h += '<div class="cm-box"><div class="cm-hd"><span class="pt" style="--c:' + (_ceCFCat === 'tutti' ? '#334155' : _ceCFCatObj(_ceCFCat).col) + '"></span>' + titCat + ' (' + V.length + ' voci)'
    + '<span style="margin-left:auto;color:#DC2626">€ ' + _ceE(_ceArr(totVis)) + '</span></div>';
  if(_ceCFForm) h += _ceCFFormHTML();
  if(!V.length){
    h += '<div style="padding:26px 18px;text-align:center;color:var(--text3);font-size:0.86rem">Nessun costo fisso' + (_ceCFCat !== 'tutti' ? ' in questa categoria' : '') + '. '
      + 'Usa <b>Nuovo costo</b>: lo scrivi una volta e vale per tutti i mesi.</div></div>';
    return h;
  }
  var tr = V.map(function(r){
    var c = r.c, o = r.o, cat = _ceCFCatObj(c.categoria || 'agenzia');
    var stato, imp;
    if(!o){ stato = '<span style="color:var(--text3);font-size:0.78rem">non previsto questo mese</span>'; imp = '<span class="zero">—</span>'; }
    else if(o.saltato){ stato = '<span class="cf-bdg" style="color:#64748B;border-color:#CBD5E1;background:#F8FAFC">Saltato</span>'; imp = '<span class="zero">—</span>'; }
    else {
      var futuro = o.data > oggi;
      stato = o.pagato
        ? '<span class="cf-bdg" style="color:#15803D;border-color:#BBF7D0;background:#F0FDF4">Pagato ' + _ceData(o.dataPag) + '</span>'
        : (futuro ? '<span class="cf-bdg" style="color:#1D4ED8;border-color:#BFDBFE;background:#EFF6FF">Scade ' + _ceData(o.data) + '</span>'
                  : '<span class="cf-bdg" style="color:#B91C1C;border-color:#FECACA;background:#FEF2F2">Da pagare dal ' + _ceData(o.data) + '</span>');
      imp = '€ ' + _ceE(o.imp) + (o.eccezione && o.stato !== 'si' && o.stato !== 'no' ? ' <span title="importo cambiato solo per questo mese" style="color:#B45309">*</span>' : (o.eccezione ? ' <span title="stato cambiato a mano per questo mese" style="color:#B45309">*</span>' : ''));
    }
    var riga = '<tr><td class="v"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + cat.col + ';margin-right:8px"></span><b>' + _ceEsc(c.nome || '(senza nome)') + '</b>'
      + '<span class="r">' + cat.nome + ' · ' + _ceEsc(_ceCFRicorrenza(c)) + ' · € ' + _ceE(_ceN(c.importo)) + (c.note ? ' · ' + _ceEsc(c.note) : '') + '</span></td>'
      + '<td>' + imp + '</td><td style="text-align:left">' + stato + '</td><td>€ ' + _ceE(r.annuo) + '</td>'
      + '<td><div class="cf-az">'
      + (o ? '<button title="Solo questo mese: importo, pagato, saltato" onclick="_ceCFApriEcc(\'' + _ceEsc(c.id) + '\')">' + _ceIco(CE_ICO_CAL) + '</button>' : '')
      + '<button title="Modifica la voce" onclick="_ceCFApri(\'' + _ceEsc(c.id) + '\')">' + _ceIco(CE_ICO_MOD) + '</button>'
      + '<button title="Elimina la voce" onclick="_ceCFElimina(\'' + _ceEsc(c.id) + '\')" style="color:#B91C1C">' + _ceIco(CE_ICO_DEL) + '</button>'
      + '</div></td></tr>';
    if(_ceCFEcc === c.id && o) riga += '<tr class="cm-voci"><td colspan="5">' + _ceCFEccHTML(c, o) + '</td></tr>';
    return riga;
  }).join('');
  h += '<div class="cm-scroll"><table class="cm-tab cf-tab"><thead><tr><th>Voce di costo</th><th>' + CE_MESI[_ceCFMese] + '</th><th style="text-align:left">Stato</th><th>Nel ' + anno + '</th><th></th></tr></thead><tbody>' + tr + '</tbody></table></div></div>';
  return h;
}

function _ceCFFormHTML(){
  var c = (_ceCFForm !== 'nuovo') ? (_ceCFTutti()[_ceCFTrova(_ceCFForm)] || {}) : (_ceCFPreset || {});
  var nuovo = (_ceCFForm === 'nuovo');
  var cat = c.categoria || (_ceCFCat !== 'tutti' ? _ceCFCat : 'agenzia');
  var opt = function(lista, val){ return lista.map(function(x){ return '<option value="' + x[0] + '"' + (String(val) === String(x[0]) ? ' selected' : '') + '>' + x[1] + '</option>'; }).join(''); };
  var diChi = '';
  try{ if(typeof window._spesaDiOpzioni === 'function' && Array.isArray(D.agenti) && D.agenti.length > 1) diChi = '<div><label>Di chi è</label><select class="fselect" id="cf-chi">' + window._spesaDiOpzioni(c) + '</select></div>'; }catch(e){}
  var h = '<div class="cf-form">'
    + '<div class="l2"><label>Voce di costo *</label><input class="finput" id="cf-nome" value="' + _ceEsc(c.nome || '') + '" placeholder="es. Canone locazione ufficio"></div>'
    + '<div><label>Categoria</label><select class="fselect" id="cf-cat">' + opt(CE_CF_CAT.map(function(x){ return [x.id, x.nome]; }), cat) + '</select></div>'
    + '<div><label>Importo (€) *</label><input class="finput" id="cf-imp" inputmode="decimal" value="' + (c.importo ? String(c.importo).replace('.', ',') : '') + '" placeholder="0"></div>'
    + '<div><label>Si ripete</label><select class="fselect" id="cf-freq">' + opt(Object.keys(CE_CF_FREQ_NOME).map(function(k){ return [k, CE_CF_FREQ_NOME[k].charAt(0).toUpperCase() + CE_CF_FREQ_NOME[k].slice(1)]; }), c.freq || 'mensile') + '</select></div>'
    + '<div><label>Dal mese *</label><input class="finput" type="month" id="cf-dal" value="' + _ceEsc(c.dal || _ceYM(_ceAnnoSel, _ceCFMese + 1)) + '"></div>'
    + '<div><label>Fino al mese</label><input class="finput" type="month" id="cf-al" value="' + _ceEsc(c.al || '') + '"></div>'
    + '<div><label>Giorno di pagamento</label><input class="finput" type="number" min="1" max="31" id="cf-giorno" value="' + _ceEsc(c.giorno || 1) + '"></div>'
    + diChi
    + '<div class="l2"><label>Note</label><input class="finput" id="cf-note" value="' + _ceEsc(c.note || '') + '" placeholder="facoltativo"></div>';
  if(nuovo){
    var comuni = CE_CF_COMUNI[cat] || [];
    var gia = {}; _ceCF().forEach(function(x){ gia[String(x.nome || '').toLowerCase()] = 1; });
    var liberi = comuni.filter(function(x){ return !gia[x.toLowerCase()]; });
    if(liberi.length) h += '<div style="grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span style="font-size:0.74rem;color:var(--text3)">Voci comuni:</span>'
      + liberi.map(function(x){ return '<button type="button" class="cf-chip" onclick="_ceCFUsaComune(this.textContent)">' + _ceEsc(x) + '</button>'; }).join('') + '</div>';
  }
  h += '<div class="fine"><span id="cf-err" style="color:#B91C1C;font-size:0.8rem;margin-right:auto"></span>'
    + '<button class="btn btn-secondary" onclick="_ceCFChiudi()">Annulla</button>'
    + '<button class="btn btn-primary" onclick="_ceCFSalva()">' + (nuovo ? 'Aggiungi costo' : 'Salva modifiche') + '</button></div></div>';
  return h;
}

function _ceCFEccHTML(c, o){
  var e = (c.mesi || {})[o.ym] || {};
  var st = e.stato || '';
  return '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;padding-top:10px">'
    + '<div style="font-size:0.8rem;color:var(--text2);flex-basis:100%">Solo per <b>' + CE_MESI[o.m] + ' ' + o.ym.slice(0, 4) + '</b>: gli altri mesi non cambiano.</div>'
    + '<div><label style="display:block;font-size:0.74rem;font-weight:600;color:var(--text2);margin-bottom:4px">Importo questo mese</label><input class="finput" id="cfe-imp" inputmode="decimal" style="width:130px" value="' + String(o.imp).replace('.', ',') + '"></div>'
    + '<div><label style="display:block;font-size:0.74rem;font-weight:600;color:var(--text2);margin-bottom:4px">Stato</label><select class="fselect" id="cfe-st" onchange="document.getElementById(\'cfe-dp-w\').style.display=this.value===\'si\'?\'\':\'none\'">'
    + [['', 'Automatico (pagato alla scadenza)'], ['si', 'Pagato il…'], ['no', 'Non ancora pagato'], ['saltato', 'Salta questo mese']].map(function(x){ return '<option value="' + x[0] + '"' + (st === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('')
    + '</select></div>'
    + '<div id="cfe-dp-w" style="' + (st === 'si' ? '' : 'display:none') + '"><label style="display:block;font-size:0.74rem;font-weight:600;color:var(--text2);margin-bottom:4px">Data pagamento</label><input class="finput" type="date" id="cfe-dp" value="' + _ceEsc(e.dataPag || o.data || '') + '"></div>'
    + '<div style="display:flex;gap:8px;margin-left:auto">'
    + (c.mesi && c.mesi[o.ym] ? '<button class="btn btn-secondary" onclick="_ceCFEccSalva(\'' + _ceEsc(c.id) + '\',\'' + o.ym + '\',true)">Ripristina regola</button>' : '')
    + '<button class="btn btn-secondary" onclick="_ceCFApriEcc(null)">Chiudi</button>'
    + '<button class="btn btn-primary" onclick="_ceCFEccSalva(\'' + _ceEsc(c.id) + '\',\'' + o.ym + '\')">Salva questo mese</button></div></div>';
}

window._ceCFVaiMese = function(m){ _ceCFMese = +m; _ceCFEcc = null; ceDisegna(); };
window._ceCFVaiCat = function(c){ _ceCFCat = c; ceDisegna(); };
window._ceCFApri = function(id){ _ceCFForm = id; _ceCFEcc = null; _ceCFPreset = null; ceDisegna(); setTimeout(function(){ var el = document.getElementById('cf-nome'); if(el) el.focus(); }, 30); };
window._ceCFChiudi = function(){ _ceCFForm = null; _ceCFPreset = null; ceDisegna(); };
window._ceCFApriEcc = function(id){ _ceCFEcc = id; _ceCFForm = null; ceDisegna(); };
window._ceCFUsaComune = function(nome){ var el = document.getElementById('cf-nome'); if(el){ el.value = nome; el.focus(); } var i = document.getElementById('cf-imp'); if(i) i.focus(); };

window._ceCFSalva = function(){
  var g = function(id){ var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
  var err = function(m){ var e = document.getElementById('cf-err'); if(e) e.textContent = m; };
  var nome = g('cf-nome'), imp = _ceN(g('cf-imp')), dal = g('cf-dal'), al = g('cf-al');
  if(!nome) return err('Scrivi il nome della voce.');
  if(!(imp > 0)) return err('Serve un importo maggiore di zero.');
  if(!/^\d{4}-\d{2}$/.test(dal)) return err('Indica il mese da cui parte.');
  if(al && al < dal) return err('Il mese di fine viene prima di quello di inizio.');
  var giorno = Math.min(Math.max(parseInt(g('cf-giorno'), 10) || 1, 1), 31);
  var nuovo = {nome:nome, categoria:g('cf-cat') || 'agenzia', importo:_ceArr(imp), freq:g('cf-freq') || 'mensile',
               dal:dal, al:al || '', giorno:giorno, note:g('cf-note'), _modificata:Date.now()};
  var chi = g('cf-chi'); if(chi) nuovo.spesaDi = chi;
  var arr = _ceCFTutti();
  if(_ceCFForm && _ceCFForm !== 'nuovo'){
    var i = _ceCFTrova(_ceCFForm);
    if(i < 0) return err('Questa voce non esiste più (forse cancellata su un altro dispositivo).');
    arr[i] = aggiornaRecord(arr[i], nuovo);        /* restituisce la copia */
  } else {
    nuovo.id = 'cf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    nuovo.mesi = {}; nuovo._creato = new Date().toISOString();
    arr.push(nuovo);
  }
  _ceCFSalvaD();
  _ceCFForm = null; _ceCFPreset = null;
  ceDisegna();
};
window._ceCFEccSalva = function(id, ym, ripristina){
  var arr = _ceCFTutti(), i = _ceCFTrova(id);
  if(i < 0) return;
  var mesi = {}; Object.keys(arr[i].mesi || {}).forEach(function(k){ mesi[k] = arr[i].mesi[k]; });
  if(ripristina) delete mesi[ym];
  else {
    var imp = _ceN((document.getElementById('cfe-imp') || {}).value);
    var st = (document.getElementById('cfe-st') || {}).value || '';
    var dp = (document.getElementById('cfe-dp') || {}).value || '';
    var e = {stato:st, dataPag:(st === 'si' ? dp : '')};
    if(Math.abs(imp - _ceN(arr[i].importo)) > 0.004) e.importo = _ceArr(imp); else e.importo = '';
    if(!st && e.importo === '') delete mesi[ym]; else mesi[ym] = e;
  }
  arr[i] = aggiornaRecord(arr[i], {mesi:mesi, _modificata:Date.now()});
  _ceCFSalvaD();
  _ceCFEcc = null;
  ceDisegna();
};
window._ceCFElimina = function(id){
  var arr = _ceCFTutti(), i = _ceCFTrova(id);
  if(i < 0) return;
  var c = arr[i];
  var fai = function(){
    var j = _ceCFTrova(id); if(j < 0) return;
    arr[j] = aggiornaRecord(arr[j], {eliminata:true, _modificata:Date.now()});
    _ceCFSalvaD(); ceDisegna();
  };
  if(typeof dlgConfirm === 'function'){
    dlgConfirm('Eliminare il costo fisso <b>' + _ceEsc(c.nome || '') + '</b>?<br><br>Sparisce da tutti i mesi, anche da quelli passati. '
      + 'Se il costo è solo finito, è meglio modificarlo e indicare "Fino al mese": così i mesi passati restano nel bilancio.', '', 'Elimina costo fisso')
      .then(function(ok){ if(ok) fai(); });
  } else if(window.confirm('Eliminare il costo fisso?')) fai();
};

/* ════════════════════════════════════════════════════════════════════════
   ASSISTENTE AI                                               [2 ott 2026]
   Richiesta di Enzo: un assistente che legge i numeri del Bilancio e dice
   quali problemi ci sono. Usa il ponte che il gestionale ha già (callClaude
   → il Worker di Enzo, la chiave non sta nel browser).
   COSA RICEVE: solo numeri aggregati, etichette delle voci e i "dati da
   controllare". Niente telefoni, email, indirizzi. I nomi dei clienti
   compaiono solo dentro le etichette delle provvigioni da incassare.
   Le istruzioni stanno nel primo messaggio e non nel campo "system", perché
   non so se il Worker lo inoltra.
   ════════════════════════════════════════════════════════════════════════ */
var _ceAiChat = [];          /* [{role, content}] della conversazione in corso */
var _ceAiAnnoChat = null;    /* anno e punto di vista a cui si riferisce */
var _ceAiAttesa = false;
var _ceAiErrore = '';

function _ceAiDati(R){
  var mesi = function(M){ return M ? M.mesi.slice(0, 12).map(function(m, i){ return {mese:CE_MESI[i], entrate:m.ric, uscite:m.cos, risultato:m.ut}; }) : null; };
  var comp = _ceMeseDati(R, 'competenza'), cas = _ceMeseDati(R, 'cassa');
  var Rp = null, compP = null;
  try{ Rp = ceCalcola(R.anno - 1); compP = _ceMeseDati(Rp, 'competenza'); }catch(e){}
  var righeSez = function(vista){
    var out = [];
    (R.sezioni || []).forEach(function(x){
      ((R[vista][x.id] || {}).righe || []).forEach(function(r){
        var v = (x.id === 'diretti' && vista === 'eff') ? _ceN(r.impAperto) : _ceN(r.imp);
        if(Math.abs(v) > 0.005) out.push({sezione:_ceNomeSez(x.id), lato:x.lato, voce:r.et, importo:v, nota:r.nota || ''});
      });
    });
    return out;
  };
  var oggi = new Date(), daInc = [];
  (Array.isArray(D.provvigioni) ? D.provvigioni : []).forEach(function(p){
    if(!p || p.eliminata) return;
    if(R.prospettiva !== 'titolare' && !_ceProvDiAgente(p, R.agenteUuid)) return;
    var st = String(p.statoPag || '').toLowerCase();
    if(st === 'incassata') return;
    var d = objCeData(p.data); if(!d) return;
    var gg = Math.floor((oggi - new Date(d.anno, d.mese - 1, d.giorno)) / 86400000);
    daInc.push({voce:p.descr || 'provvigione', data:p.data, giorni:gg, totale:_ceN(p.totale), stato:p.statoPag || 'Da Incassare'});
  });
  daInc.sort(function(a, b){ return b.giorni - a.giorni; });
  return {
    oggi:_ceOggiISO(), anno:R.anno,
    puntoDiVista:(R.prospettiva === 'titolare' ? 'titolare dell\'agenzia (ricavo = provvigione intera, costo = quota agenti)' : 'agente collaboratore (ricavo = sua quota agente)'),
    volumeGeneratoPerAgenzia:R.gci, quanteProvvigioni:R.quanteProv, percentualeAgente:R.percAgente,
    contoEconomicoEffettivo:{entrate:R.totEff.ricavi, uscite:R.totEff.costi, risultatoAnteImposte:R.totEff.anteImposte, utile:R.totEff.utile},
    contoEconomicoProvvisorio:{entrate:R.totPrev.ricavi, uscite:R.totPrev.costi, utile:R.totPrev.utile},
    cassa:R.cassa ? {entrato:R.cassa.incassato, uscito:R.cassa.uscito, saldo:R.cassa.saldo} : null,
    partiteAperte:{daIncassare:R.daIncassare, daPagare:R.daPagare, anticipiDaRecuperare:R.daRecuperare},
    mesiCompetenza:mesi(comp), mesiCassa:mesi(cas),
    annoPrima:Rp ? {anno:Rp.anno, entrate:Rp.totEff.ricavi, uscite:Rp.totEff.costi, utile:Rp.totEff.utile, mesi:mesi(compP)} : null,
    vociEffettive:righeSez('eff'), vociPreviste:righeSez('prev'),
    costiFissi:_ceCF().map(function(c){ return {voce:c.nome, categoria:c.categoria, importo:_ceN(c.importo), ricorrenza:_ceCFRicorrenza(c)}; }),
    costiFissiPrevistiDaQuiAFineAnno:R.cfPrevMesi,
    spesePersonali:R.personali ? {finoAOggi:R.personali.eff, previsteDaQuiAFineAnno:R.personali.prev, voci:R.personali.voci} : null,
    provvigioniNonIncassate:daInc.slice(0, 15),
    trattativeInPipeline:R.pipeline,
    avvisi:R.avvisi.slice(0, 10), datiDaControllare:R.controlli.slice(0, 20)
  };
}

function _ceAiIstruzioni(R){
  return 'Sei il consulente finanziario di Enzo, agente immobiliare a Agropoli (Cilento) con FRIMM Capital Casa Paestum. '
    + 'Enzo non è un contabile: scrivi in italiano semplice, frasi brevi, niente gergo; quando usi un termine tecnico spiegalo in tre parole. '
    + 'Lavora come collaboratore: la sua quota agente sono i suoi soldi, il totale della provvigione è il volume che genera per l\'agenzia. '
    + 'Ragiona SOLO sui dati qui sotto (JSON estratto dal suo gestionale). Non inventare numeri: se un dato manca, dillo. '
    + 'Per ogni problema spiega prima la causa (da quale numero lo vedi), poi cosa fare. Importi in euro all\'italiana (1.234,56). '
    + 'Tieni conto che il mese in corso e quelli futuri sono incompleti. '
    + 'Formato: usa titoli che iniziano con "## " e punti elenco che iniziano con "- ", grassetto con **. Niente tabelle.\n\n'
    + 'DATI DEL BILANCIO ' + R.anno + ':\n' + JSON.stringify(_ceAiDati(R));
}

window._ceAiAnalizza = function(){
  var R; try{ R = ceCalcola(_ceAnnoSel); }catch(e){ return; }
  _ceAiChat = [{role:'user', content:_ceAiIstruzioni(R) + '\n\nFai il CHECK-UP del ' + R.anno + ' con queste sezioni:\n'
    + '## In sintesi (3 righe: come sta andando, con i numeri chiave)\n'
    + '## I problemi (dal più grave; per ognuno causa, numero, conseguenza)\n'
    + '## Cosa fare nei prossimi 30 giorni (azioni concrete, in ordine)\n'
    + '## Dati da sistemare nel gestionale (solo se ce ne sono)\n'
    + 'Massimo 450 parole.', nascosto:true}];
  _ceAiAnnoChat = _ceAnnoSel + '|' + R.prospettiva;
  _ceAiInvia();
};
window._ceAiChiedi = function(){
  var el = document.getElementById('ce-ai-dom'); var q = el ? String(el.value || '').trim() : '';
  if(!q || _ceAiAttesa) return;
  if(!_ceAiChat.length){
    var R; try{ R = ceCalcola(_ceAnnoSel); }catch(e){ return; }
    _ceAiChat = [{role:'user', content:_ceAiIstruzioni(R) + '\n\nDOMANDA DI ENZO: ' + q + '\nRispondi in modo breve e concreto (massimo 250 parole).', mostra:q}];
    _ceAiAnnoChat = _ceAnnoSel + '|' + R.prospettiva;
  } else {
    _ceAiChat.push({role:'user', content:q + '\n(Rispondi in modo breve e concreto, sugli stessi dati.)', mostra:q});
  }
  _ceAiInvia();
};
window._ceAiNuova = function(){ _ceAiChat = []; _ceAiErrore = ''; ceDisegna(); };
function _ceAiInvia(){
  if(typeof callClaude !== 'function'){ _ceAiErrore = 'Il collegamento AI del gestionale non è disponibile.'; ceDisegna(); return; }
  _ceAiAttesa = true; _ceAiErrore = ''; ceDisegna();
  var modello = 'claude-sonnet-4-6';
  try{ if(typeof aiGetConfig === 'function' && aiGetConfig().model) modello = aiGetConfig().model; }catch(e){}
  callClaude({model:modello, max_tokens:2000,
              messages:_ceAiChat.map(function(m){ return {role:m.role, content:m.content}; })})
  .then(function(data){
    var txt = ''; try{ txt = (data.content || []).map(function(b){ return b.text || ''; }).join('').trim(); }catch(e){}
    if(!txt) throw new Error('risposta vuota');
    _ceAiChat.push({role:'assistant', content:txt});
  }).catch(function(err){
    _ceAiErrore = (err && err.message) || 'riprova';
    /* la domanda senza risposta si toglie, così si può rifare */
    if(_ceAiChat.length && _ceAiChat[_ceAiChat.length - 1].role === 'user') _ceAiChat.pop();
  }).then(function(){ _ceAiAttesa = false; if(_ceDoc === 'ai') ceDisegna(); });
}

/* il testo dell'AI: titoli ##, elenchi -, grassetto ** (tutto il resto escapato) */
function _ceAiTesto(t){
  var righe = String(t || '').split('\n'), h = '', inList = false;
  var inl = function(s){ return _ceEsc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'); };
  righe.forEach(function(r){
    var x = r.trim();
    if(/^[-•*]\s+/.test(x)){ if(!inList){ h += '<ul style="margin:4px 0 8px;padding-left:20px">'; inList = true; } h += '<li style="margin:3px 0">' + inl(x.replace(/^[-•*]\s+/, '')) + '</li>'; return; }
    if(inList){ h += '</ul>'; inList = false; }
    if(/^#{1,4}\s+/.test(x)) h += '<div style="font-weight:800;font-size:0.95rem;margin:14px 0 4px;color:var(--text)">' + inl(x.replace(/^#{1,4}\s+/, '')) + '</div>';
    else if(x) h += '<p style="margin:4px 0">' + inl(x) + '</p>';
  });
  if(inList) h += '</ul>';
  return h;
}

function _ceAssistente(R){
  var h = '<style>' + CE_MESE_CSS + '</style>';
  var conf = (typeof aiConfigurato === 'function') ? aiConfigurato() : true;
  /* conversazione nata su un altro anno o punto di vista: si ricomincia */
  if(_ceAiChat.length && _ceAiAnnoChat !== (_ceAnnoSel + '|' + R.prospettiva) && !_ceAiAttesa){ _ceAiChat = []; }
  var ico = _ceIco('<path d="M12 2a4 4 0 014 4v1h1a3 3 0 013 3v3a3 3 0 01-3 3h-1v1a4 4 0 01-8 0v-1H7a3 3 0 01-3-3v-3a3 3 0 013-3h1V6a4 4 0 014-4z"/><circle cx="9.5" cy="11.5" r="1"/><circle cx="14.5" cy="11.5" r="1"/>', 20);
  h += '<div class="cm-box"><div class="cm-hd"><span style="width:36px;height:36px;border-radius:10px;background:#EEF2FF;color:#4F46E5;display:flex;align-items:center;justify-content:center">' + ico + '</span>'
    + '<div><div>Assistente del Bilancio ' + R.anno + '</div><div style="font-size:0.76rem;font-weight:500;color:var(--text3)">legge i numeri di questa pagina e ti dice cosa non va e cosa fare</div></div>'
    + '<div style="margin-left:auto;display:flex;gap:8px">'
    + (_ceAiChat.length ? '<button class="btn btn-secondary" onclick="_ceAiNuova()"' + (_ceAiAttesa ? ' disabled' : '') + '>Ricomincia</button>' : '')
    + '<button class="btn btn-primary" onclick="_ceAiAnalizza()"' + (_ceAiAttesa || !conf ? ' disabled' : '') + ' style="display:inline-flex;align-items:center;gap:7px">'
    + _ceIco('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', 15) + ' ' + (_ceAiChat.length ? 'Rifai il check-up' : 'Fai il check-up') + '</button></div></div>';
  h += '<div style="padding:16px 20px;font-size:0.88rem;line-height:1.6;color:var(--text2)">';
  if(!conf){
    h += '<div style="background:#FEF9C3;border:1px solid #FDE68A;border-radius:10px;padding:12px 14px;color:#854D0E">'
      + 'L\'intelligenza artificiale non è configurata su questo dispositivo: apri <b>Impostazioni AI</b> e incolla l\'indirizzo del tuo Worker, come per Analisi atti.</div>';
  } else if(!_ceAiChat.length && !_ceAiAttesa){
    h += '<div style="color:var(--text3)">Premi <b>Fai il check-up</b> per un\'analisi completa del ' + R.anno + ', oppure fai subito una domanda qui sotto. Esempi:</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      + ['Perché quest\'anno guadagno meno del ' + (R.anno - 1) + '?', 'Quali costi posso tagliare?', 'Quanto devo vendere per arrivare a fine anno tranquillo?', 'Quali incassi devo sollecitare?']
          .map(function(q){ return '<button class="cf-chip" style="border:1px dashed var(--border);background:#fff;border-radius:20px;padding:5px 11px;font-size:0.8rem;cursor:pointer;font-family:inherit;color:var(--text2)" onclick="var e=document.getElementById(\'ce-ai-dom\');e.value=this.textContent;e.focus()">' + _ceEsc(q) + '</button>'; }).join('')
      + '</div>';
  }
  _ceAiChat.forEach(function(m){
    if(m.role === 'user'){
      if(m.nascosto) h += '<div style="font-size:0.78rem;color:var(--text3);margin:4px 0 8px">Check-up richiesto</div>';
      else h += '<div style="display:flex;justify-content:flex-end;margin:12px 0"><div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px 12px 2px 12px;padding:8px 12px;max-width:80%;color:var(--text)">' + _ceEsc(m.mostra || m.content) + '</div></div>';
    } else {
      h += '<div style="border-left:3px solid #4F46E5;padding:2px 0 2px 14px;margin:8px 0 14px;color:var(--text)">' + _ceAiTesto(m.content) + '</div>';
    }
  });
  if(_ceAiAttesa) h += '<div style="color:#4F46E5;font-weight:600;margin:10px 0">Sto leggendo i tuoi numeri…</div>';
  if(_ceAiErrore) h += '<div style="color:#B91C1C;margin:10px 0">Errore AI: ' + _ceEsc(_ceAiErrore) + '</div>';
  h += '</div>';
  if(conf){
    h += '<div style="display:flex;gap:8px;padding:12px 20px 16px;border-top:1px solid var(--border)">'
      + '<input class="finput" id="ce-ai-dom" placeholder="Fai una domanda sui tuoi numeri…" style="flex:1" onkeydown="if(event.key===\'Enter\'){_ceAiChiedi();}"' + (_ceAiAttesa ? ' disabled' : '') + '>'
      + '<button class="btn btn-primary" onclick="_ceAiChiedi()"' + (_ceAiAttesa ? ' disabled' : '') + '>Chiedi</button></div>';
  }
  h += '</div>';
  return h;
}

window.ceCalcolaContoEconomico = ceCalcola;

})();
