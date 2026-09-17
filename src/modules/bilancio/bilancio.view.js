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
  CE_SEZIONI_FISSE.forEach(function(f){
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
  var quote = 0, quoteCassa = 0, totali = 0, tratt = 0, trattCassa = 0, n = 0;
  var detQuote = [], detTratt = [], restiTot = 0;
  prov.forEach(function(p){
    if(!p || _ceAnno(p.data) !== anno) return;
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
    var ricevuto = 0;
    if(Array.isArray(p.modAgenteRighe)){
      p.modAgenteRighe.forEach(function(r){ ricevuto += _ceN(r && r.imp); });
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
      R.controlli.push({
        et: etich,
        msg: 'pagamento agente registrato di ' + _ceE(ricevuto) + ' a fronte di una quota di '
             + _ceE(spetta) + ' — controlla il campo pagamenti nella scheda provvigione'
      });
      ricevuto = spetta;
    }
    ricevuto = _ceArr(ricevuto);
    var abbuono = _ceN(p.abbuono);
    var resta = _ceArr(Math.max(0, spetta - ricevuto - abbuono));

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
      if(Array.isArray(p.modAgenteRighe) && p.modAgenteRighe.length){
        /* le righe si mostrano per quanto valgono davvero: una riga che supera
           il dovuto, mostrata intera, metterebbe due cifre in contrasto nella
           stessa schermata */
        var resi = ricevuto;
        p.modAgenteRighe.forEach(function(r){
          var q = _ceN(r && r.imp);
          if(q <= 0) return;
          var mostra = Math.min(q, resi);
          resi = _ceArr(resi - mostra);
          if(mostra <= 0) return;
          detQuote.push({et:'Acconto incassato' + (r.mod ? ' — ' + r.mod : '')
            + (mostra < q ? ' (registrato ' + _ceE(q) + ')' : ''),
            imp:_ceArr(-mostra), liv:1});
        });
      } else if(ricevuto > 0){
        detQuote.push({et:'Quota incassata', imp:_ceArr(-ricevuto), liv:1});
      }
      if(abbuono > 0) detQuote.push({et:'Abbuono', imp:_ceArr(-abbuono), liv:1});
      if(resta > 0.009) detQuote.push({et:'Restano da incassare', imp:resta, liv:1, saldo:true});
    }
    if(netto > 0 && lordo > 0){
      var t1 = lordo - netto;
      tratt += t1;
      detTratt.push({et:etich, imp:_ceArr(t1), data:p.data, nota:''});
      /* le trattenute seguono la quota INCASSATA rispetto a quella DOVUTA:
         rapportarle al lordo dava 51,19 su 52,50 anche a provvigione saldata,
         perché il lordo comprende la trattenuta stessa */
      trattCassa += (spetta > 0) ? _ceArr(t1 * ricevuto / spetta) : 0;
    }
    quoteCassa += ricevuto;
    restiTot += resta;
    if(lordo <= 0) R.avvisi.push('Provvigione senza quota agente: ' + (p.descr || p.acquirente || '?'));
  });
  R.gci = _ceArr(totali); R.quoteAgente = _ceArr(quote);
  R.quoteAgenteCassa = _ceArr(quoteCassa); R.quanteProv = n;
  /* il residuo vero, non lordo meno incassato: fra i due c'è la trattenuta
     ufficio, che non è un credito verso l'agenzia */
  R.daIncassare = _ceArr(restiTot);
  agg('eff', 'ricavi', 'Quote agente su provvigioni', _ceArr(quote), n + ' provvigioni', detQuote);
  agg('eff', 'struttura', 'Trattenute ufficio', _ceArr(tratt), 'sul tuo compenso', detTratt);

  /* la percentuale che ti spetta, ricavata dai TUOI affari */
  if(totali > 0 && quote > 0){ R.percAgente = _ceArr(quote/totali*100); R.percDaStorico = true; }
  else { R.percAgente = 50; }

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
      /* [15 set 2026] Le spese DIRETTE sono anticipi che riaddebiti al
         cliente (scelta di Enzo): quelle ancora aperte non sono soldi da
         pagare, sono soldi da farsi restituire. Le spese di struttura
         invece restano un debito tuo. */
      else if(sez === 'diretti') daRecuperare += imp;
      else apertePagare += imp;
    } else {
      agg('eff', 'ricavi', a.tipo || 'Altra entrata', imp, a.descr || '');
      maturatoSez.ricavi += imp;
      if(fatta) pagatoSez.ricavi += imp;
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
  R.daPagare = _ceArr(apertePagare + tasseAperte);
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
    recuperati: _ceArr(pagatoSez.diretti)
  };
  R.cassa.uscito = _ceArr(R.cassa.pagatoStruttura + R.cassa.pagatoImposte + R.cassa.trattenute);
  R.cassa.saldo = _ceArr(R.cassa.incassato - R.cassa.uscito);

  /* VOCI MANUALI — quelle "effettive" entrano in entrambe le viste,
     quelle "previste" solo nel provvisorio */
  _ceVociAnno(anno).forEach(function(v){
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
    if(v.natura === 'previsto') return;
    var imp = _ceN(v.importo);
    if(!imp) return;
    var sez = v.sezione || 'struttura';
    if(!R.eff[sez]) sez = 'struttura';
    if(!R.cassa.aMano[sez]) R.cassa.aMano[sez] = {tot:0, voci:[]};
    R.cassa.aMano[sez].tot = _ceArr(R.cassa.aMano[sez].tot + imp);
    R.cassa.aMano[sez].voci.push(v.etichetta || '(senza nome)');
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
  if(anno === _annoOggi && typeof window._paCalcola === 'function'){
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
              imp: _ceArr(val * f),
              nota: (pezzi ? pezzi + ' · ' : '') + 'provvigione intera ' + _ceE(_ceArr(val))
            });
          });
          return {t:_ceArr(t), q:q, det:det};
        };
        var acc = somma(G.accettate), cor = somma(G.inCorso);
        R.pipeline = {accettate:{t:acc.t, q:acc.q}, inCorso:{t:cor.t, q:cor.q}, perc:R.percAgente};
        agg('prev', 'ricavi', 'Proposte accettate', _ceArr(acc.t*f),
            acc.q + ' in attesa di rogito · tua quota al ' + R.percAgente + '%', acc.det);
        agg('prev', 'ricavi', 'Trattative in corso', _ceArr(cor.t*f),
            cor.q + ' proposte aperte · tua quota al ' + R.percAgente + '%', cor.det);
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
    if(!a.tipo) R.controlli.push({et:(a.descr || a.cliente || 'voce senza nome'),
      msg:'spesa senza tipo: finisce fra le spese di struttura per esclusione'});
  });
  /* anticipi fermi da troppo: soldi tuoi in mano ad altri */
  var oggiMs = new Date().getTime();
  ai.forEach(function(a){
    if(!a || a._fonteF24 || _ceAnno(a.data) !== anno) return;
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
var _ceVista = 'effettivo';        /* effettivo | provvisorio | confronto */
var _ceDoc = 'economico';          /* economico | cassa */
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
+ '#ce-wrap .ce-doc{max-width:1040px;margin:0 auto}'
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
function _ceRigheAMano(R, lato){
  var out = [];
  var am = (R.cassa && R.cassa.aMano) || {};
  var NOMI = {ricavi:'Entrate inserite a mano', struttura:'Spese di struttura inserite a mano',
              imposte:'Imposte inserite a mano'};
  _ceSezioni().forEach(function(x){
    if(x.id === 'diretti' || x.lato !== lato || !am[x.id]) return;
    out.push([NOMI[x.id] || x.nome, am[x.id].tot, am[x.id].voci.join(', ')]);
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
      h += '<div class="ce-riga"><span>' + r[0]
        + (r[2] ? '<span style="display:block;font-size:0.71rem;color:var(--text3)">' + r[2] + '</span>' : '')
        + '</span><span class="ce-num">' + _ceE(r[1]) + '</span></div>';
    });
    return h + '<div class="ce-fine"><span>Totale</span><span class="ce-num">'
      + _ceE(tot) + '</span></div></div>';
  };

  var h = '<div class="ce-grid">'
    + box('Entrato', [
        ['Quote agente incassate', C.quoteRicevute, R.quanteProv + ' provvigioni maturate nel ' + R.anno],
        ['Altre entrate incassate', C.entrateIncassate, '']
      ].concat(_ceRigheAMano(R, 'entrate')), C.incassato, CE_TINTA.ricavi)
    + box('Uscito', [
        ['Trattenute ufficio', C.trattenute, 'scalate dalle quote incassate'],
        ['Spese di struttura pagate', C.pagatoStruttura, ''],
        ['F24 versati', C.pagatoImposte, '']
      ].concat(_ceRigheAMano(R, 'uscite')), C.uscito, CE_TINTA.costi)
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
    + [['Da incassare', R.daIncassare, 'quote agente maturate e non ancora ricevute'],
       ['Da pagare', R.daPagare, 'spese di struttura e F24 non ancora versati'],
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
  var costi = _ceArr(T.diretti + T.struttura + T.imposte);
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
    });
    return h + '<tr class="fine"><td>' + etTot + '</td><td class="n">' + _ceE(tot)
      + '</td></tr></table></td>';
  };
  var h = '<table class="out"><tr>'
    + col('Entrato', [['Quote agente incassate', C.quoteRicevute],
                      ['Altre entrate incassate', C.entrateIncassate]]
                      .concat(_ceRigheAMano(R, 'entrate')),
          'Totale entrato', C.incassato, CE_TINTA.ricavi)
    + col('Uscito', [['Trattenute ufficio', C.trattenute],
                     ['Spese di struttura pagate', C.pagatoStruttura],
                     ['F24 versati', C.pagatoImposte]]
                     .concat(_ceRigheAMano(R, 'uscite')),
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

function _ceStampaOra(conDettaglio){
  var R;
  try{ R = ceCalcola(_ceAnnoSel); }catch(e){ return; }
  var conPrev = (_ceVista !== 'effettivo');
  var T = conPrev ? R.totPrev : R.totEff;
  var costi = _ceArr(T.diretti + T.struttura + T.imposte);
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
         + lato('Entrate', ['ricavi'], CE_TINTA.ricavi, utile < 0 ? ['Perdita d\'esercizio', -utile] : null)
         + lato('Uscite', ['diretti','struttura','imposte'], CE_TINTA.costi,
                utile >= 0 ? ['Utile d\'esercizio', utile] : null)
         + '</tr></table>')
    + '<div class="piede">'
    + (_ceDoc === 'cassa'
        ? 'Entrato ' + _ceE(R.cassa.incassato) + ' &nbsp;·&nbsp; Uscito ' + _ceE(R.cassa.uscito)
          + ' &nbsp;·&nbsp; Saldo ' + _ceE(R.cassa.saldo)
        : 'Risultato ante imposte ' + _ceE(T.anteImposte)
          + ' &nbsp;·&nbsp; ' + (utile >= 0 ? 'Utile netto ' : 'Perdita netta ') + _ceE(Math.abs(utile)))
    + '<br>Le entrate sono le quote agente sulle provvigioni. Fatture e incassi non fatturati non '
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

function _ceExcelOra(conDettaglio){
  var R;
  try{ R = ceCalcola(_ceAnnoSel); }catch(e){ return; }
  var conPrev = (_ceVista !== 'effettivo');
  var T = conPrev ? R.totPrev : R.totEff;
  var costi = _ceArr(T.diretti + T.struttura + T.imposte);
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
  riempi(sx, ['ricavi']);
  riempi(dx, ['diretti','struttura','imposte']);
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
  aoa.push(['Di cui quota agente', R.quoteAgente]);
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
    + '<button class="btn btn-primary btn-sm" onclick="_ceSalvaVoce(\'' + sez + '\')">Salva</button>'
    + '<button class="btn btn-outline btn-sm" onclick="_ceChiudiForm()">Annulla</button>'
    + '</div>'
    + '<div style="font-size:0.73rem;color:var(--text3);margin-top:6px">'
    + '"Prevista" compare solo nel conto provvisorio; "già registrata" in tutti e due e, '
    + 'come pagata o incassata, anche in Incassi e pagamenti.</div>'
    + _ceElencoVoci(sez)
    + '</div>';
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
          + (v.natura === 'previsto' ? ' <span style="color:#A16207">(prevista)</span>' : '') + '</span>'
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
  if(selSez) sez = selSez;
  if(!et.trim()){ try{ dlgAlert('Serve una descrizione per la voce.',''); }catch(e){} return; }
  if(!imp){ try{ dlgAlert('Serve un importo diverso da zero.',''); }catch(e){} return; }
  var arr = _ceVoci(), fatto = false;
  if(_ceEditId){
    for(var i=0;i<arr.length;i++) if(arr[i] && arr[i].id === _ceEditId){
      var nuovo = {etichetta:et.trim(), importo:imp, natura:nat, sezione:sez, anno:_ceAnnoSel};
      /* [15 set 2026] aggiornaRecord restituisce una COPIA aggiornata e non
         tocca l'originale: senza riassegnare, la modifica spariva — compreso
         il cambio di sezione. */
      if(typeof aggiornaRecord === 'function') arr[i] = aggiornaRecord(arr[i], nuovo);
      else Object.keys(nuovo).forEach(function(k){ arr[i][k] = nuovo[k]; });
      fatto = true; break;
    }
  }
  if(!fatto){
    arr.push({id:'ce_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7),
      anno:_ceAnnoSel, sezione:sez, etichetta:et.trim(), importo:imp, natura:nat,
      _creato:new Date().toISOString()});
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
  var _sottoDoc = (_ceDoc === 'cassa')
    ? 'solo il denaro che si è mosso'
    : (_ceVista === 'effettivo' ? 'per competenza, solo voci registrate'
       : (_ceVista === 'provvisorio' ? 'per competenza, con proposte e previsioni'
          : 'effettivo e provvisorio a confronto'));

  var h = '<div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;'
    + 'border-bottom:2px solid var(--text);padding-bottom:12px;margin-bottom:14px">'

    + '<div style="display:flex;align-items:baseline;gap:10px;flex-shrink:0">'
    +   '<span style="font-size:1.5rem;font-weight:800;letter-spacing:-.4px;line-height:1">'
    +   'BILANCIO AGENZIA</span>'
    +   '<select class="fselect ce-anno" onchange="_ceCambiaAnno(this.value)">'
    +   anni.map(function(x){ return '<option value="'+x+'"'+(x===_ceAnnoSel?' selected':'')+'>'+x+'</option>'; }).join('')
    +   '</select></div>'

    + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;flex:0 0 auto">'
    +   '<div class="ce-ling" style="flex-wrap:nowrap">'
    +   [['economico','Conto economico','eff'],['cassa','Incassi e pagamenti','prv']].map(function(v){
          return '<button class="ce-l ' + v[2] + (_ceDoc===v[0]?' on':'') + '" '
            + 'style="white-space:nowrap" '
            + 'onclick="_ceVaiDoc(\'' + v[0] + '\')"><span class="pall"></span>'
            + v[1] + '</button>';
        }).join('') + '</div>'
    +   (_ceDoc === 'economico'
          ? '<div class="ce-ling" style="padding-left:8px;border-left:1px solid var(--border);'
            + 'flex-wrap:nowrap">'
            + [['effettivo','Effettivo'],['provvisorio','Provvisorio'],['confronto','Confronto']]
              .map(function(v){
                return '<button class="ce-l cnf' + (_ceVista===v[0]?' on':'') + '" '
                  + 'style="padding:5px 11px;font-size:0.76rem;white-space:nowrap" '
                  + 'onclick="_ceVaiVista(\'' + v[0] + '\')">' + v[1] + '</button>';
              }).join('') + '</div>'
          : '')
    + '</div>'

    + '<div style="text-align:right;line-height:1.4;flex:1 1 180px;min-width:0;'
    + 'margin-left:auto;overflow:hidden">'
    +   (_nomeAg ? '<div style="font-size:0.82rem;font-weight:700;color:var(--text2);'
          + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
          + _ceEsc(_nomeAg) + '</div>' : '')
    +   '<div style="font-size:0.74rem;color:var(--text3);white-space:nowrap;overflow:hidden;'
    +   'text-overflow:ellipsis">'
    +   _sottoDoc + ' &nbsp;·&nbsp; aggiornato al ' + new Date().toLocaleDateString('it-IT')
    +   '</div></div>'
    + '</div>';

  h += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;'
    + 'padding:10px 14px;margin-bottom:12px;font-size:0.83rem;color:var(--text2);line-height:1.6">'
    + 'Volume generato per l\'agenzia nel ' + R.anno + ': <b style="color:var(--text)">' + _ceE(R.gci)
    + '</b> su ' + R.quanteProv + ' provvigioni — di cui a te <b style="color:var(--text)">'
    + _ceE(R.quoteAgente) + '</b>'
    + (R.percDaStorico ? ', il ' + R.percAgente + '% (calcolato sui tuoi affari di quest\'anno)' : '')
    + '. Il cruscotto Obiettivi misura il primo numero, questa pagina il secondo.</div>';

  var card = function(tit, val, sot, col){
    return '<div style="flex:1;min-width:155px;background:var(--bg2);border:1px solid var(--border);'
      + 'border-radius:12px;padding:11px 14px">'
      + '<div style="font-size:0.71rem;font-weight:700;color:var(--text2);text-transform:uppercase;'
      + 'letter-spacing:.4px">' + tit + '</div>'
      + '<div style="font-size:1.3rem;font-weight:800;color:' + col + ';margin-top:2px">' + _ceE(val) + '</div>'
      + '<div style="font-size:0.73rem;color:var(--text2)">' + sot + '</div></div>';
  };
  var cE = R.totEff.utile >= 0 ? '#15803D' : '#B91C1C';
  var cP = R.totPrev.utile >= 0 ? '#15803D' : '#B91C1C';
  /* [15 set 2026] Nel conto economico i riquadri parlano di RISULTATO, non
     di saldi: "da incassare" è una partita aperta e sta nella cassa. */
  if(_ceDoc === 'economico'){
    /* [15 set 2026] I riquadri devono seguire la linguetta: prima mostravano
       sempre i totali dell'effettivo, quindi cambiando vista non si muoveva
       nulla e sembrava che il provvisorio non funzionasse. */
    var Tv = (_ceVista === 'provvisorio') ? R.totPrev : R.totEff;
    var sotto = (_ceVista === 'provvisorio')
      ? 'comprese proposte e previsioni' : 'solo voci registrate';
    if(_ceVista === 'confronto'){
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
        + card('Entrate effettive', R.totEff.ricavi, 'solo voci registrate', 'var(--text)')
        + card('Entrate provvisorie', R.totPrev.ricavi, 'con proposte e previsioni', '#8A6A18')
        + card('Utile effettivo', R.totEff.utile, 'solo voci registrate', cE)
        + card('Utile provvisorio', R.totPrev.utile, 'con proposte e previsioni', cP)
        + '</div>';
    } else {
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
        + card('Entrate', Tv.ricavi, 'quote agente e altre entrate · ' + sotto, 'var(--text)')
        + card('Uscite', Tv.costi, 'spese di struttura e imposte · ' + sotto, 'var(--text)')
        + card('Risultato ante imposte', Tv.anteImposte, 'entrate meno spese di struttura', 'var(--text)')
        + card(_ceVista === 'provvisorio' ? 'Utile provvisorio' : 'Utile effettivo',
               Tv.utile, sotto, Tv.utile >= 0 ? '#15803D' : '#B91C1C')
        + '</div>';
    }
  } else {
    h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
      + card('Entrato', R.cassa.incassato, 'incassato davvero nel ' + R.anno, '#15803D')
      + card('Uscito', R.cassa.uscito, 'pagato davvero nel ' + R.anno, '#B91C1C')
      + card('Saldo', R.cassa.saldo, 'differenza fra i due',
             R.cassa.saldo >= 0 ? '#15803D' : '#B91C1C')
      + '</div>';
  }

  h += (_ceDoc === 'cassa') ? _ceDocCassa(R)
       : ((_ceVista === 'confronto') ? _ceConfronto(R) : _ceProspetto(R));

  if(R.pipeline){
    h += '<div style="font-size:0.77rem;color:var(--text3);margin-top:10px;line-height:1.6">'
      + 'Nel provvisorio, proposte e trattative sono convertite nella tua quota al '
      + R.percAgente + '%' + (R.percDaStorico ? ', percentuale ricavata dalle provvigioni di quest\'anno' : '')
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
    + (_ceDoc === 'economico'
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
    + '<div style="flex:1;overflow:auto;padding:14px"><div id="ce-corpo" class="ce-doc"></div></div>';
  document.body.appendChild(w);
  /* [15 set 2026] _ceSeguiMenu vive nel monolite, non qui. Chiamarla per nome
     nudo funziona finché esiste come globale, ma se mancasse sarebbe un
     ReferenceError e la finestra non si aprirebbe proprio. Meglio il controllo,
     come fa già il modulo Obiettivi: al massimo il riquadro copre il menu. */
  try{ if(typeof window._ceSeguiMenu === 'function') window._ceSeguiMenu(w); }catch(e){}
  ceDisegna();
};

window.ceCalcolaContoEconomico = ceCalcola;

})();
