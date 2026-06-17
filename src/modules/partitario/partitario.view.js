// modules/partitario/partitario.view.js — modulo Partitario (contabilità, SOLA LETTURA).
//
// Estratto dal monolite (42015-42825): _partBuildMastro, renderPartitario,
// partStampa, partSwitchTab, _partBuildMastroAgenti, renderPartitarioAgenti,
// partStampaAgenti.
//
// IMPORTANTE: il Partitario è una VISTA DI SOLA LETTURA — aggrega e mostra le
// partite contabili (dare/avere per soggetto) senza MAI mutare D. Zero saveD(),
// zero push/splice. Per questo è il primo blocco contabile estratto: non può
// corrompere dati. Il cuore finanziario accoppiato (provvigioni/fatture/prima
// nota con i loro sync pnSync*) resta nel monolite, da estrarre piu' avanti.
//
// DIPENDENZE ESTERNE (monolite via window): fmtEuro.
// `D` e' un Proxy LIVE su window.D (lettura dello stato reale).
import { state } from '../../core/state.js';

const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

// Stato locale: tab attivo del partitario (clienti | agenti).
// Nel monolite era `var _partTab` (riga 42388), usato solo qui.
let _partTab = 'clienti';

function _partBuildMastro(){
  /* Aggrega tutte le partite per soggetto (cliente / venditore / acquirente)
     da: fatture, provvigioni, incassiNonFatt */
  var mastro = {}; /* {nome: {partite:[], totCredi:0, totPagato:0}} */

  function addPartita(soggetto, partita){
    if(!soggetto||soggetto.trim()==='—') return;
    var k = soggetto.trim();
    if(!mastro[k]) mastro[k]={partite:[], totCredito:0, totPagato:0, totResiduo:0};
    mastro[k].partite.push(partita);
    if(partita.tipo==='credito')    mastro[k].totCredito +=(partita.importo||0);
    if(partita.tipo==='incasso')    mastro[k].totPagato  +=(partita.importo||0);
    if(partita.tipo==='uscita_ag')  mastro[k].totPagato  +=(partita.importo||0);
  }

  /* ── DA FATTURE ── */
  (D.fatture||[]).forEach(function(ft,fi){
    if(!ft.destNome) return;
    var nettoEff = Math.max(0,(ft.netto||0)-(parseFloat(ft.abbuono)||0));
    var totPag   = (ft.pagamenti||[]).reduce(function(s,r){return s+(parseFloat(r.importo)||0);},0);
    var residuo  = Math.max(0, nettoEff - totPag);
    /* Partita credito apertura */
    addPartita(ft.destNome, {
      id:'fatt_'+fi, tipo:'credito', fonte:'fattura', fonteIdx:fi,
      data:ft.data||'', ndoc:'Fatt. '+ft.numero, descrizione:ft.descr||ft.oggetto||'—',
      importo:nettoEff, stato: residuo<0.01 ? 'chiusa' : totPag>0 ? 'parziale' : 'aperta',
      residuo:residuo
    });
    /* Righe pagamento (storno partita) */
    (ft.pagamenti||[]).forEach(function(pag, pi){
      if((pag.importo||0)<=0) return;
      addPartita(ft.destNome, {
        id:'fatt_pag_'+fi+'_'+pi, tipo:'incasso', fonte:'fattura', fonteIdx:fi,
        data:pag.data||ft.dataPag||'', ndoc:'Pag. Fatt. '+ft.numero, descrizione:'Incasso '+(pag.modalita||'')+(pag.riferimento?' #'+pag.riferimento:''),
        importo:parseFloat(pag.importo), stato:'chiusa', residuo:0, modalita:pag.modalita||''
      });
    });
  });

  /* ── DA PROVVIGIONI ── */
  (D.provvigioni||[]).forEach(function(pv,pi){
    var totale = parseFloat(pv.totale)||0;
    var qAg    = parseFloat(pv.quotaAgenzia)||0;
    var descBase=(pv.descr||'');
    /* Credito (maturata) verso venditore */
    if(pv.venditore&&(parseFloat(pv.quotaV)||0)>0){
      var qV=parseFloat(pv.quotaV)||0;
      var hasPagV=(pv.modV||'').trim().length>0;
      addPartita(pv.venditore, {
        id:'prov_v_'+pi, tipo:'credito', fonte:'provvigione', fonteIdx:pi,
        data:pv.data||'', ndoc:'PRV-'+(pi+1), descrizione:'Provv. Vendita — '+descBase,
        importo:qV, stato:hasPagV?'chiusa':'aperta', residuo:hasPagV?0:qV
      });
      /* Storno automatico per pagamento intero (modV compilato) — sempre attivo */
      if(hasPagV) addPartita(pv.venditore, {
        id:'prov_v_pag_'+pi, tipo:'incasso', fonte:'provvigione', fonteIdx:pi,
        data:pv.dataPagV||'', ndoc:'Storno PRV-'+(pi+1), descrizione:'Incasso Vendita '+(pv.modV||''),
        importo:qV, stato:'chiusa', residuo:0, modalita:pv.modV||''
      });
    }
    /* Credito verso acquirente */
    if(pv.acquirente&&(parseFloat(pv.quotaA)||0)>0){
      var qA=parseFloat(pv.quotaA)||0;
      var hasPagA=(pv.modA||'').trim().length>0;
      addPartita(pv.acquirente, {
        id:'prov_a_'+pi, tipo:'credito', fonte:'provvigione', fonteIdx:pi,
        data:pv.data||'', ndoc:'PRV-'+(pi+1), descrizione:'Provv. Acquisto — '+descBase,
        importo:qA, stato:hasPagA?'chiusa':'aperta', residuo:hasPagA?0:qA
      });
      if(hasPagA) addPartita(pv.acquirente, {
        id:'prov_a_pag_'+pi, tipo:'incasso', fonte:'provvigione', fonteIdx:pi,
        data:pv.dataPagA||'', ndoc:'Storno PRV-'+(pi+1), descrizione:'Incasso Acquisto '+(pv.modA||''),
        importo:qA, stato:'chiusa', residuo:0, modalita:pv.modA||''
      });
    }
  });

  /* ── DA CONTANTI TRACCIATI (dest:'cont' nelle righe quota agente) ──
     A differenza degli Incassi NF, questi pagamenti in contanti sono
     dichiarati e SEMPRE visibili nel Partitario (non dipendono da Ctrl+X).
     Rappresentano la quota agente incassata cash che si vuole tracciare. */
  (D.provvigioni||[]).forEach(function(pv,pi){
    var righe=(pv.modAgenteRighe||[]).filter(function(r){return r.dest==='cont' && (parseFloat(r.imp)||0)>0;});
    if(!righe.length) return;
    var cliente = pv.venditore || pv.acquirente || (pv.agente||'Agente');
    var descBase=(pv.descr||'');
    righe.forEach(function(r,ri){
      addPartita(cliente, {
        id:'prov_cont_'+pi+'_'+ri, tipo:'incasso', fonte:'provvigione', fonteIdx:pi,
        data:pv.dataPagAgente||pv.data||'', ndoc:'Cont. PRV-'+(pi+1),
        descrizione:'Incasso Contanti (tracciato) — '+descBase,
        importo:parseFloat(r.imp)||0, stato:'chiusa', residuo:0,
        modalita:r.mod||'Contanti'
      });
    });
  });

  /* ── DA INCASSI NF ── visibili nel Partitario SOLO quando Ctrl+X è attivo (_nfVisible=true)
     Quando NF è nascosto, le voci NF vengono escluse completamente dal mastro. */
  if(typeof _nfVisible !== 'undefined' && _nfVisible){
    (D.incassiNonFatt||[]).forEach(function(nf,ni){
      if(!nf.cliente) return;
      /* Riconosci NF "Quota Agente" auto-generati dalla provvigione */
      var isQuotaAgente = nf.note==='Auto da Provvigioni — Contabilità Agente'
        || (nf._agente && nf.descr && /quota agente/i.test(nf.descr));
      /* FIX PARTITARIO: gli NF "Quota Agente" possono rappresentare:
         (a) Un movimento interno agenzia→agente quando il cliente ha già
             saldato la provvigione (modV/modA compilato): in questo caso
             l'NF NON va mostrato nel partitario cliente (sarebbe doppio
             conteggio con lo Storno automatico).
         (b) Un acconto parziale del cliente che ancora non ha saldato
             (modV/modA vuoto): in questo caso l'NF rappresenta l'unico
             pagamento reale e VA mostrato come AVERE nel partitario cliente
             per ridurre il residuo aperto.
         Distinguiamo i due casi guardando se la provvigione corrispondente
         (identificata da "Prov#N" nella descrizione NF) ha modV/modA. */
      var skipNelPartitarioCliente = false;
      if(isQuotaAgente){
        var m = (nf.descr||'').match(/Prov#(\d+)/);
        if(m){
          var pvIdx = parseInt(m[1])-1;
          var pv = (D.provvigioni||[])[pvIdx];
          if(pv){
            /* Determina se la provvigione associata risulta già saldata */
            var modVok = (pv.modV||'').trim().length>0;
            var modAok = (pv.modA||'').trim().length>0;
            /* Skip se almeno una delle quote (V o A) è "saldata" via modV/modA
               → in tal caso lo Storno automatico già rappresenta il pagamento */
            if(modVok || modAok) skipNelPartitarioCliente = true;
          }
        }
      }
      if(skipNelPartitarioCliente){
        /* Skip totalmente: nessuna riga nel partitario cliente per questo NF
           (è una scrittura interna agenzia↔agente già rappresentata altrove) */
        return;
      }
      var totAtteso=parseFloat(nf.totale)||0;
      var totPagato=(nf.pagamenti||[]).reduce(function(s,r){return s+(parseFloat(r.importo)||0);},0);
      var residuo=Math.max(0,totAtteso-totPagato);
      var stato=residuo<0.01?'chiusa':totPagato>0?'parziale':'aperta';
      if(!isQuotaAgente){
        /* NF "normale" (es. acconto verbale, caparra) → apertura partita credito */
        addPartita(nf.cliente, {
          id:'nf_'+ni, tipo:'credito', fonte:'nf', fonteIdx:ni,
          data:nf.data||'', ndoc:'NF-'+(ni+1),
          descrizione:'Incasso NF — '+(nf.descr||nf.tipo||''),
          importo:totAtteso, stato:stato, residuo:residuo
        });
      }
      /* Righe pagamento come AVERE nel partitario del cliente.
         Per NF Quota Agente (in questo ramo: modV/modA vuoti) → acconto
         parziale del cliente alla provvigione (riduce il residuo aperto). */
      (nf.pagamenti||[]).forEach(function(pag,pi){
        var imp=parseFloat(pag.importo)||0;
        if(imp<=0) return;
        var descr = isQuotaAgente
          ? 'Acconto Provv. via Agente ('+(pag.modalita||'Contanti')+')'+(nf._agente?' — '+nf._agente:'')
          : 'Ricevuto '+(pag.modalita||'Contanti')+(nf.pagamenti.length>1?' (rata '+(pi+1)+'/'+nf.pagamenti.length+')':'');
        addPartita(nf.cliente, {
          id:'nf_pag_'+ni+'_'+pi, tipo:'incasso', fonte:'nf', fonteIdx:ni,
          data:pag.data||nf.data||'', ndoc:'Pag. NF-'+(ni+1),
          descrizione:descr,
          importo:imp, stato:'chiusa', residuo:0, modalita:pag.modalita||'',
          _quotaAgente:isQuotaAgente
        });
      });
    });
  }

  /* Calcola residui per cliente */
  Object.keys(mastro).forEach(function(k){
    var m=mastro[k];
    m.totResiduo = Math.max(0, m.totCredito - m.totPagato);
    m.partite.sort(function(a,b){return (b.data||'').localeCompare(a.data||'');});
  });
  return mastro;
}

function renderPartitario(){
  var pd=document.getElementById('pd-part');
  if(pd) pd.textContent=new Date().toLocaleDateString('it-IT');
  if(_partTab==='agenti'){ renderPartitarioAgenti(); return; }

  var mastro = _partBuildMastro();
  var nomi   = Object.keys(mastro).sort(function(a,b){return a.localeCompare(b);});

  /* Popola select cliente */
  var sel=document.getElementById('part-sel-cliente');
  var curCli=sel?sel.value:'';
  if(sel){
    sel.innerHTML='<option value="">Tutti i clienti</option>';
    nomi.forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n+(mastro[n].totResiduo>0?' (€'+fmtEuro(mastro[n].totResiduo)+' aperto)':'');if(n===curCli)o.selected=true;sel.appendChild(o);});
  }

  /* Popola anni */
  var annoEl=document.getElementById('part-anno');
  var curAnno=annoEl?annoEl.value:'';
  if(annoEl){
    var anni=[];
    nomi.forEach(function(n){mastro[n].partite.forEach(function(p){var a=(p.data||'').slice(0,4);if(a&&!anni.includes(a))anni.push(a);});});
    anni.sort(function(a,b){return b-a;});
    annoEl.innerHTML='<option value="">Tutti</option>';
    anni.forEach(function(a){var o=document.createElement('option');o.value=a;o.textContent=a;if(a===curAnno)o.selected=true;annoEl.appendChild(o);});
  }

  var filtroCliente = sel?sel.value:'';
  var filtroStato   = (document.getElementById('part-stato')||{}).value||'';
  var filtroAnno    = (document.getElementById('part-anno')||{}).value||'';

  var nomiFiltrati = filtroCliente ? [filtroCliente] : nomi;

  /* KPI hero */
  var totCred=0, totPag=0;
  nomiFiltrati.forEach(function(n){totCred+=mastro[n].totCredito;totPag+=mastro[n].totPagato;});
  var totRes=Math.max(0,totCred-totPag);
  var nAperti=nomiFiltrati.filter(function(n){return mastro[n].totResiduo>0.01;}).length;
  var heroEl=document.getElementById('part-hero-stats');
  if(heroEl) heroEl.innerHTML=
    '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:900;color:white">'+fmtEuro(totCred)+'</div><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Crediti totali</div></div>'+
    '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:900;color:#4ADE80">'+fmtEuro(totPag)+'</div><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Incassato</div></div>'+
    '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:900;color:'+(totRes>0?'#FCA5A5':'#4ADE80')+'">'+fmtEuro(totRes)+'</div><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Residuo aperto</div></div>'+
    '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:900;color:'+(nAperti>0?'#FCA5A5':'#4ADE80')+'">'+nAperti+'</div><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Clienti aperti</div></div>';

  var body=document.getElementById('part-body');
  if(!body) return;

  var html='';
  var htmlAperti='', htmlSaldati='';
  var nClientiAperti=0, nClientiSaldati=0, resTotAperti=0;
  nomiFiltrati.forEach(function(nome){
    var m=mastro[nome];
    var __c0=html.length; /* marcatore inizio card di questo cliente */
    /* Il filtro Stato è applicato per singolo documento più sotto (un cliente può
       avere sia documenti aperti che saldati). A livello cliente non si filtra:
       se nessun documento passa il filtro, il cliente viene saltato. */

    var partite = m.partite.filter(function(p){
      if(filtroAnno&&(p.data||'').slice(0,4)!==filtroAnno) return false;
      return true;
    });
    if(!partite.length) return;

    /* Filtro per STATO a livello di singolo documento (fattura/provvigione/nf):
       un documento è "chiuso" se la riga credito ha stato 'chiusa'.
       Con filtro "saldo aperto" mostriamo solo le partite dei documenti ancora
       aperti (credito aperto + suoi pagamenti parziali); con "saldati" solo i
       documenti chiusi. Le voci di pagamento seguono il documento di origine. */
    if(filtroStato==='aperta' || filtroStato==='chiusa' || filtroStato==='parziale'){
      /* mappa stato di ciascun documento dalla sua riga credito */
      var statoDoc={};
      partite.forEach(function(p){
        if(p.tipo==='credito'){
          var key=p.fonte+'_'+p.fonteIdx;
          statoDoc[key]=p.stato||'aperta';
        }
      });
      partite=partite.filter(function(p){
        var key=p.fonte+'_'+p.fonteIdx;
        var st=statoDoc[key];
        if(st===undefined) return true; /* voce senza credito collegato: mostra */
        if(filtroStato==='aperta')   return st==='aperta'||st==='parziale';
        if(filtroStato==='chiusa')   return st==='chiusa';
        if(filtroStato==='parziale') return st==='parziale';
        return true;
      });
      if(!partite.length) return; /* nessuna voce per questo filtro → salta cliente */
    }

    /* Totali calcolati sulle partite EFFETTIVAMENTE mostrate (coerenti col filtro) */
    var vCredito=0, vPagato=0;
    partite.forEach(function(p){
      if(p.tipo==='credito') vCredito+=(p.importo||0);
      else if(p.tipo==='incasso'||p.tipo==='uscita_ag') vPagato+=(p.importo||0);
    });
    var vResiduo=Math.max(0, vCredito - vPagato);

    /* Quando un filtro stato è attivo, mostra i totali delle voci visibili */
    var filtroAttivo = (filtroStato==='aperta'||filtroStato==='chiusa'||filtroStato==='parziale');
    var dCredito = filtroAttivo ? vCredito : m.totCredito;
    var dPagato  = filtroAttivo ? vPagato  : m.totPagato;
    var dResiduo = filtroAttivo ? vResiduo : m.totResiduo;

    var isAperto=dResiduo>0.01;
    var borderColor=isAperto?'#FCA5A5':'#BBF7D0';
    var headerBg=isAperto?'linear-gradient(135deg,#7F1D1D,#B91C1C)':'linear-gradient(135deg,#064E3B,#059669)';
    var statoLabel=isAperto?'APERTO':'SALDATO';
    var statoColor=isAperto?'#FCA5A5':'#4ADE80';

    html+='<div class="card" data-cli="'+nome.replace(/"/g,'&quot;')+'" style="margin-bottom:16px;border:1.5px solid '+borderColor+';overflow:hidden">';

    /* Header cliente */
    html+='<div style="background:'+headerBg+';padding:13px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">';
    html+='<div style="display:flex;align-items:center;gap:10px">';
    html+='<div style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:white;flex-shrink:0">'+nome.charAt(0).toUpperCase()+'</div>';
    html+='<div><div style="font-size:1rem;font-weight:800;color:white">'+nome+'</div>';
    html+='<div style="font-size:0.72rem;color:rgba(255,255,255,.6)">'+partite.filter(function(p){return p.tipo==='credito';}).length+' partite'+(filtroAttivo?' ('+(filtroStato==='chiusa'?'saldate':filtroStato==='parziale'?'parziali':'aperte')+')':'')+'</div></div></div>';
    html+='<div style="display:flex;gap:16px;align-items:center">';
    html+='<div style="text-align:right"><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Crediti</div><div style="font-size:1rem;font-weight:800;color:white">'+fmtEuro(dCredito)+'</div></div>';
    html+='<div style="text-align:right"><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Incassato</div><div style="font-size:1rem;font-weight:800;color:#4ADE80">'+fmtEuro(dPagato)+'</div></div>';
    html+='<div style="text-align:right"><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Residuo</div><div style="font-size:1rem;font-weight:800;color:'+statoColor+'">'+fmtEuro(dResiduo)+'</div></div>';
    html+='<span style="background:rgba(0,0,0,.25);color:'+statoColor+';border:1.5px solid '+statoColor+'44;padding:4px 12px;border-radius:8px;font-size:0.72rem;font-weight:800">'+statoLabel+'</span>';
    html+='</div></div>';

    /* Tabella partite */
    html+='<div class="table-wrap"><table style="font-size:0.79rem;width:100%">';
    html+='<thead><tr style="font-size:0.68rem;background:#F8FAFC"><th style="padding:7px 10px;width:85px">Data</th><th style="padding:7px 10px;width:80px">N° Doc</th><th style="padding:7px 10px">Descrizione</th><th style="padding:7px 10px;width:70px">Fonte</th><th style="padding:7px 10px;text-align:right;width:110px">Dare (€)</th><th style="padding:7px 10px;text-align:right;width:110px">Avere (€)</th><th style="padding:7px 10px;width:80px">Modalità</th><th style="padding:7px 10px;width:80px">Stato</th></tr></thead>';
    html+='<tbody>';

    var saldoCorr=0;
    /* Ordina per data crescente per il saldo progressivo */
    var partiteOrd=partite.slice().sort(function(a,b){return (a.data||'').localeCompare(b.data||'');});
    partiteOrd.forEach(function(p){
      var isDare=p.tipo==='credito';
      var isAvere=p.tipo==='incasso'||p.tipo==='uscita_ag';
      if(isDare)  saldoCorr+=p.importo;
      if(isAvere) saldoCorr-=p.importo;
      var saldoColor=saldoCorr>0.01?'#DC2626':saldoCorr<-0.01?'#7C3AED':'#15803D';
      var statoP=p.stato||'aperta';
      var statoPColor=statoP==='chiusa'?'#15803D':statoP==='parziale'?'#B45309':'#DC2626';
      var statoPBg=statoP==='chiusa'?'#F0FDF4':statoP==='parziale'?'#FFFBEB':'#FEF2F2';
      var fonteBadge={fattura:'<span style="background:#EFF6FF;color:#1D4ED8;font-size:0.64rem;font-weight:700;padding:1px 5px;border-radius:4px;border:1px solid #BFDBFE">Fattura</span>',
                      provvigione:'<span style="background:#F5F3FF;color:#7C3AED;font-size:0.64rem;font-weight:700;padding:1px 5px;border-radius:4px;border:1px solid #DDD6FE">Provv.</span>',
                      nf:'<span style="background:#FFFBEB;color:#B45309;font-size:0.64rem;font-weight:700;padding:1px 5px;border-radius:4px;border:1px solid #FDE68A">NF</span>'}[p.fonte]||'';
      var bgRow=isDare?'':'background:#FAFBFF;';
      var ddf=(p.data||'').split('-').reverse().join('/');
      html+='<tr style="'+bgRow+'border-bottom:1px solid #F1F5F9">';
      html+='<td style="padding:7px 10px;color:var(--text3);white-space:nowrap">'+ddf+'</td>';
      html+='<td style="padding:7px 10px;font-size:0.75rem;color:var(--brand);font-weight:700">'+p.ndoc+'</td>';
      html+='<td style="padding:7px 10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+p.descrizione+'">'+p.descrizione+'</td>';
      html+='<td style="padding:7px 10px">'+fonteBadge+'</td>';
      html+='<td style="padding:7px 10px;text-align:right;font-weight:700;color:#DC2626">'+(isDare?'€ '+fmtEuro(p.importo)+'':'')+'</td>';
      html+='<td style="padding:7px 10px;text-align:right;font-weight:700;color:#15803D">'+(isAvere?'€ '+fmtEuro(p.importo)+'':'')+'</td>';
      html+='<td style="padding:7px 10px;font-size:0.74rem;color:var(--text3)">'+(p.modalita||'—')+'</td>';
      html+='<td style="padding:7px 10px"><span style="font-size:0.68rem;font-weight:700;background:'+statoPBg+';color:'+statoPColor+';padding:2px 7px;border-radius:5px">'+statoP.charAt(0).toUpperCase()+statoP.slice(1)+'</span></td>';
      html+='</tr>';
    });

    /* Riga saldo finale */
    html+='<tr style="background:#F8FAFC;font-weight:800;border-top:2px solid var(--border)">';
    html+='<td colspan="4" style="padding:8px 10px;text-align:right;font-size:0.8rem;color:var(--text2)">Saldo partitario:</td>';
    html+='<td style="padding:8px 10px;text-align:right;font-size:0.88rem;color:#DC2626">€ '+fmtEuro(dCredito)+'</td>';
    html+='<td style="padding:8px 10px;text-align:right;font-size:0.88rem;color:#15803D">€ '+fmtEuro(dPagato)+'</td>';
    html+='<td colspan="2" style="padding:8px 10px;text-align:center;font-size:0.88rem;color:'+(dResiduo>0.01?'#DC2626':'#15803D')+'">Saldo: € '+fmtEuro(dResiduo)+'</td>';
    html+='</tr>';

    html+='</tbody></table></div>';
    html+='</div>';

    /* Estraggo la card appena costruita e la smisto nel gruppo giusto.
       'isAperto' è già calcolato sopra (dResiduo>0.01). */
    var __card=html.slice(__c0);
    html=html.slice(0,__c0); /* svuoto: l'assemblaggio finale usa i due gruppi */
    if(isAperto){
      htmlAperti+=__card;
      nClientiAperti++;
      resTotAperti+=dResiduo;
    }else{
      nClientiSaldati++;
      /* Per i saldati: card COMPATTA. Avvolgo header+tabella in un blocco
         con la tabella nascosta di default, espandibile al click sull'header. */
      var __id='pp-cli-'+nClientiSaldati;
      /* inietto cursor+onclick sull'header e nascondo la table-wrap */
      var __compact=__card
        .replace('<div style="background:'+headerBg, '<div onclick="ppToggleCard(\''+__id+'\')" style="cursor:pointer;background:'+headerBg)
        .replace('<div class="table-wrap">', '<div class="table-wrap" id="'+__id+'" style="display:none">');
      htmlSaldati+=__compact;
    }
  });

  /* ── Assemblaggio finale: ricerca + aperti in cima + saldati collassabili ── */
  var out='';

  /* Barra di ricerca rapida (filtra le card per nome) */
  out+='<div style="position:relative;margin-bottom:16px">'
     + '<input id="pp-search" type="text" placeholder="Cerca cliente per nome…" oninput="ppFilterPartitario()" '
     + 'style="width:100%;height:40px;padding:0 14px 0 38px;border:1.5px solid var(--border);border-radius:9px;font-size:0.88rem;font-family:inherit;outline:none">'
     + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:13px;top:50%;transform:translateY(-50%)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
     + '</div>';

  if(!htmlAperti && !htmlSaldati){
    out+='<div style="text-align:center;padding:44px;color:var(--text4);font-style:italic">Nessuna partita trovata con i filtri selezionati</div>';
    body.innerHTML=out;
    return;
  }

  /* Gruppo APERTI — sempre in cima, espansi */
  if(htmlAperti){
    out+='<div style="display:flex;align-items:center;gap:9px;margin:4px 0 12px">'
       + '<span style="width:9px;height:9px;border-radius:50%;background:#DC2626;display:inline-block"></span>'
       + '<span style="font-size:0.9rem;font-weight:800;color:#DC2626">Saldi aperti</span>'
       + '<span style="font-size:0.72rem;font-weight:700;color:#B91C1C;background:#FEF2F2;border:1px solid #FECACA;padding:3px 11px;border-radius:7px">'+nClientiAperti+(nClientiAperti===1?' cliente':' clienti')+' · € '+fmtEuro(resTotAperti)+' da incassare</span>'
       + '</div>';
    out+='<div id="pp-group-aperti">'+htmlAperti+'</div>';
  }else{
    out+='<div style="display:flex;align-items:center;gap:9px;margin:4px 0 16px;padding:12px 16px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:9px">'
       + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
       + '<span style="font-size:0.86rem;font-weight:700;color:#047857">Nessun saldo aperto — tutti i clienti sono in regola.</span>'
       + '</div>';
  }

  /* Gruppo SALDATI — pannello collassabile, chiuso di default */
  if(htmlSaldati){
    out+='<button id="pp-toggle-saldati" onclick="ppToggleSaldati()" '
       + 'style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:13px 16px;margin:18px 0 0;background:#F8FAFC;border:1.5px solid var(--border);border-radius:9px;cursor:pointer;font-family:inherit">'
       + '<span style="display:flex;align-items:center;gap:9px">'
       +   '<span style="width:9px;height:9px;border-radius:50%;background:#059669;display:inline-block"></span>'
       +   '<span style="font-size:0.9rem;font-weight:800;color:#047857">Clienti saldati</span>'
       +   '<span style="font-size:0.74rem;color:var(--text3)">('+nClientiSaldati+')</span>'
       + '</span>'
       + '<span style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--text3)"><span id="pp-toggle-lbl">Mostra</span>'
       +   '<svg id="pp-toggle-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
       + '</span></button>';
    out+='<div id="pp-group-saldati" style="display:none;margin-top:14px">'+htmlSaldati+'</div>';
  }

  body.innerHTML=out;
}

function partStampa(){
  renderPartitario();
  var body=document.getElementById('part-body');
  var cli=(document.getElementById('part-sel-cliente')||{}).value||'Tutti i clienti';
  var w=window.open('','_blank','width=1050,height=850');
  w.document.write('<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Partitario Clienti</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">'
    +'<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,sans-serif;font-size:12px;color:#0F172A}'
    +'.cover{background:linear-gradient(135deg,#0F172A,#1E3A5F);padding:28px 36px;color:white;margin-bottom:20px}'
    +'table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border:1px solid #E2E8F0;font-size:11px}'
    +'th{background:#F8FAFC;font-weight:700}@media print{.cover{-webkit-print-color-adjust:exact}}</style>'
    +'</head><body>'
    +'<div class="cover"><div style="font-size:10px;opacity:.5;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">Le case dalla A allo Z.io — Vincenzo Carnicelli</div>'
    +'<div style="font-size:20px;font-weight:900">Partitario Clienti — '+cli+'</div>'
    +'<div style="font-size:12px;opacity:.65;margin-top:4px">Generato il '+new Date().toLocaleDateString('it-IT')+'</div></div>'
    +body.innerHTML
    +'<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>'
    +'</body></html>');
  w.document.close();
}

/* ── Tab switch ── */
function partSwitchTab(tab){
  _partTab = tab;
  var tabCli = document.getElementById('part-tab-cli');
  var tabAgt = document.getElementById('part-tab-agt');
  var panCli = document.getElementById('part-panel-clienti');
  var panAgt = document.getElementById('part-panel-agenti');
  if(tab==='clienti'){
    if(tabCli){tabCli.style.borderBottomColor='#1D4ED8';tabCli.style.color='#1D4ED8';tabCli.style.fontWeight='700';}
    if(tabAgt){tabAgt.style.borderBottomColor='transparent';tabAgt.style.color='var(--text3)';tabAgt.style.fontWeight='600';}
    if(panCli) panCli.style.display='';
    if(panAgt) panAgt.style.display='none';
    renderPartitario();
  } else {
    if(tabAgt){tabAgt.style.borderBottomColor='#7C3AED';tabAgt.style.color='#7C3AED';tabAgt.style.fontWeight='700';}
    if(tabCli){tabCli.style.borderBottomColor='transparent';tabCli.style.color='var(--text3)';tabCli.style.fontWeight='600';}
    if(panCli) panCli.style.display='none';
    if(panAgt) panAgt.style.display='';
    renderPartitarioAgenti();
  }
}

/* ════════════════════════════════════
   PARTITARIO AGENTI
════════════════════════════════════ */
function _partBuildMastroAgenti(){
  /* Per ogni agente costruisce:
     - Righe DARE: provvigioni maturate (quota agente lordo)
     - Righe AVERE: pagamenti effettuati all'agente
     - Trattenute ufficio
     
     LOGICA COMPORTAMENTO ctrl+X:
     - Senza ctrl+X (NF nascosti): mostra DARE = totale provvigione spettante,
       NESSUN AVERE per pagamenti (= il saldo evidenzia il "lordo spettante"
       dell'agente per la provvigione, ignorando gli acconti già ricevuti).
     - Con ctrl+X (NF visibili): mostra anche gli AVERE come acconti reali
       ricevuti (NF Quota Agente), così il saldo = residuo reale da percepire.
     
     ANTI-DUPLICAZIONE: se la stessa provvigione ha sia `modAgenteRighe` (PAG-PRV)
     sia un NF "Quota Agente" auto-generato, rappresentano lo STESSO pagamento
     in due forme. Usiamo SEMPRE solo gli NF quando esistono (sono più dettagliati
     e con data del pagamento). Le modAgenteRighe vengono usate solo per
     provvigioni senza NF Quota Agente (pagamenti diretti senza NF). */
  var mastro = {};
  var nfShown = (typeof _nfVisible !== 'undefined') && _nfVisible;

  /* Indicizza NF Quota Agente per provvigione (Prov#N nel descr) */
  var nfPerProv = {};
  (D.incassiNonFatt||[]).forEach(function(nf, ni){
    if(!nf) return;
    var isQuotaAgente = nf.note==='Auto da Provvigioni — Contabilità Agente'
      || (nf._agente && nf.descr && /quota agente/i.test(nf.descr));
    if(!isQuotaAgente) return;
    var m = (nf.descr||'').match(/Prov#(\d+)/);
    if(!m) return;
    var provIdx = parseInt(m[1])-1;
    if(!nfPerProv[provIdx]) nfPerProv[provIdx] = [];
    nfPerProv[provIdx].push({nf:nf, idx:ni});
  });

  (D.provvigioni||[]).forEach(function(pv, pi){
    var agIdx = pv.agenteIdx;
    if(agIdx===undefined||agIdx===null) return;
    var ag = (D.agenti||[])[agIdx];
    if(!ag) return;
    var agNome = ag.nome||('Agente #'+agIdx);

    if(!mastro[agNome]) mastro[agNome]={agIdx:agIdx, agente:ag, partite:[], totDare:0, totAvere:0, totResiduo:0};

    var qAgt  = parseFloat(pv.quotaAgenteLordo||pv.quotaAgente)||0;
    var qAgtN = parseFloat(pv.quotaAgenteNetto)||0;
    var tratt = qAgt - qAgtN;
    var ndoc  = 'PRV-'+(pi+1);
    var descBase = (pv.descr||'')+(pv.venditore?' — V:'+pv.venditore:'')+(pv.acquirente?' / A:'+pv.acquirente:'');
    var dataProv = pv.data||'';
    var hasNFAgente = !!(nfPerProv[pi] && nfPerProv[pi].length>0);

    /* DARE — quota maturata (sempre) */
    if(qAgt>0){
      mastro[agNome].partite.push({
        id:'prov_dare_'+pi, tipo:'dare', ndoc:ndoc,
        data:dataProv, descrizione:'Quota Maturata — '+descBase,
        importo:qAgt, fonte:'provvigione', fonteIdx:pi,
        stato: 'aperta'
      });
      mastro[agNome].totDare += qAgt;
    }

    /* AVERE — trattenute ufficio (sempre, sono detrazioni fisse non acconti) */
    if(tratt>0){
      mastro[agNome].partite.push({
        id:'prov_tratt_'+pi, tipo:'avere', ndoc:ndoc,
        data:dataProv, descrizione:'Trattenuta ufficio ('+((ag.quotaUfficio||0))+'%) — '+descBase,
        importo:tratt, fonte:'provvigione', fonteIdx:pi,
        stato:'chiusa', modalita:'Trattenuta'
      });
      mastro[agNome].totAvere += tratt;
    }

    /* AVERE — pagamenti agente.
       DISTINZIONE IMPORTANTE per il calcolo del saldo:
       - Pagamenti TRACCIATI (modAgenteRighe con dest 'fatt' o 'cont', oppure
         senza dest = pagamenti diretti storici): riducono SEMPRE il residuo,
         anche senza ctrl+X. Sono pagamenti contabilmente validi.
       - Acconti NF "in nero" (NF Quota Agente, o dest 'nf'): contano SOLO
         con ctrl+X attivo, perché fuori contabilità.
       Anti-duplicazione: se la provvigione ha NF Quota Agente, gli acconti
       "in nero" vengono dagli NF; le righe modAgenteRighe con dest 'nf' non
       vengono ricontate. */
    var avereDellaProv = 0; // somma AVERE tracciati+nf per questa provvigione
    var righe = pv.modAgenteRighe||[];

    /* 1) PAGAMENTI TRACCIATI — sempre conteggiati */
    righe.forEach(function(r, ri){
      var imp = parseFloat(r.imp)||0;
      if(imp<=0) return;
      var dest = r.dest||'';
      // tracciati = fatt, cont, oppure righe legacy senza dest esplicito
      var tracciato = (dest==='fatt' || dest==='cont' || dest==='');
      if(!tracciato) return; // gli 'nf' li gestiamo dopo
      var etich = dest==='cont' ? 'Contanti tracciato' : (dest==='fatt' ? 'Fatturato' : (r.mod||'—'));
      mastro[agNome].partite.push({
        id:'prov_pag_'+pi+'_'+ri, tipo:'avere', ndoc:'PAG-'+ndoc,
        data:dataProv, descrizione:'Pagamento ('+etich+') — '+descBase,
        importo:imp, fonte:'provvigione', fonteIdx:pi,
        stato:'chiusa', modalita:r.mod||etich
      });
      mastro[agNome].totAvere += imp;
      avereDellaProv += imp;
    });

    /* 2) ACCONTI NF "in nero" — solo con ctrl+X */
    if(nfShown){
      if(hasNFAgente){
        nfPerProv[pi].forEach(function(o){
          var nf = o.nf;
          (nf.pagamenti||[]).forEach(function(pag, ppi){
            var imp = parseFloat(pag.importo)||0;
            if(imp<=0) return;
            mastro[agNome].partite.push({
              id:'nf_acconto_'+o.idx+'_'+ppi, tipo:'avere', ndoc:'NF-'+(o.idx+1),
              data:pag.data||nf.data||'',
              descrizione:'Acconto NF ('+(pag.modalita||'Contanti')+') — '+descBase,
              importo:imp, fonte:'nf', fonteIdx:o.idx,
              stato:'chiusa', modalita:pag.modalita||''
            });
            mastro[agNome].totAvere += imp;
            avereDellaProv += imp;
          });
        });
      } else {
        /* righe con dest 'nf' (acconti in nero senza NF auto-generato) */
        righe.forEach(function(r, ri){
          var imp = parseFloat(r.imp)||0;
          if(imp<=0 || (r.dest||'')!=='nf') return;
          mastro[agNome].partite.push({
            id:'prov_pagnf_'+pi+'_'+ri, tipo:'avere', ndoc:'PAG-'+ndoc,
            data:dataProv, descrizione:'Acconto NF ('+(r.mod||'Contanti')+') — '+descBase,
            importo:imp, fonte:'provvigione', fonteIdx:pi,
            stato:'chiusa', modalita:r.mod||''
          });
          mastro[agNome].totAvere += imp;
          avereDellaProv += imp;
        });
      }
    }

    /* FIX ECCEDENZA: se l'AVERE totale supera la quota agente netta, l'eccesso
       sono soldi che l'agente deve rendere all'agenzia → riga DARE di bilancio. */
    {
      var qAgtNetto = qAgtN || qAgt;
      var eccedenza = avereDellaProv - qAgtNetto;
      if(eccedenza > 0.01){
        mastro[agNome].partite.push({
          id:'prov_eccedenza_'+pi, tipo:'dare', ndoc:ndoc,
          data:dataProv,
          descrizione:'Eccedenza incasso (da rendere all\'agenzia) — '+descBase,
          importo:eccedenza, fonte:'provvigione', fonteIdx:pi,
          stato:'aperta'
        });
        mastro[agNome].totDare += eccedenza;
      }
    }
  });

  /* Calcola residui */
  Object.keys(mastro).forEach(function(k){
    var m=mastro[k];
    m.totResiduo = Math.max(0, m.totDare - m.totAvere);
    m.partite.sort(function(a,b){return (a.data||'').localeCompare(b.data||'');});
  });
  return mastro;
}

function renderPartitarioAgenti(){
  var pd=document.getElementById('pd-part');
  if(pd) pd.textContent=new Date().toLocaleDateString('it-IT');

  var mastro = _partBuildMastroAgenti();
  var nomi = Object.keys(mastro).sort(function(a,b){return a.localeCompare(b);});

  /* Popola select agente */
  var sel=document.getElementById('part-sel-agente');
  var curAg=sel?sel.value:'';
  if(sel){
    sel.innerHTML='<option value="">Tutti</option>';
    nomi.forEach(function(n){
      var o=document.createElement('option');
      o.value=n;
      o.textContent=n+(mastro[n].totResiduo>0?' (€'+fmtEuro(mastro[n].totResiduo)+' da pagare)':'');
      if(n===curAg)o.selected=true;
      sel.appendChild(o);
    });
  }

  /* Popola anni */
  var annoEl=document.getElementById('part-anno-agt');
  var curAnno=annoEl?annoEl.value:'';
  if(annoEl){
    var anni=[];
    nomi.forEach(function(n){mastro[n].partite.forEach(function(p){var a=(p.data||'').slice(0,4);if(a&&!anni.includes(a))anni.push(a);});});
    anni.sort(function(a,b){return b-a;});
    annoEl.innerHTML='<option value="">Tutti</option>';
    anni.forEach(function(a){var o=document.createElement('option');o.value=a;o.textContent=a;if(a===curAnno)o.selected=true;annoEl.appendChild(o);});
  }

  var filtroAgente = sel?sel.value:'';
  var filtroStato  = (document.getElementById('part-stato-agt')||{}).value||'';
  var filtroAnno   = (document.getElementById('part-anno-agt')||{}).value||'';
  var nomiFiltrati = filtroAgente ? [filtroAgente] : nomi;

  /* KPI hero */
  var totD=0, totA=0;
  nomiFiltrati.forEach(function(n){totD+=mastro[n].totDare;totA+=mastro[n].totAvere;});
  var totR=Math.max(0,totD-totA);
  var nAperti=nomiFiltrati.filter(function(n){return mastro[n].totResiduo>0.01;}).length;
  var heroEl=document.getElementById('part-hero-stats');
  if(heroEl) heroEl.innerHTML=
    '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:900;color:white">'+fmtEuro(totD)+'</div><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Maturato agenti</div></div>'+
    '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:900;color:#4ADE80">'+fmtEuro(totA)+'</div><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Pagato + trattenute</div></div>'+
    '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:900;color:'+(totR>0?'#FCA5A5':'#4ADE80')+'">'+fmtEuro(totR)+'</div><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Da liquidare</div></div>'+
    '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:900;color:'+(nAperti>0?'#FCA5A5':'#4ADE80')+'">'+nAperti+'</div><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Agenti con residuo</div></div>';

  var body=document.getElementById('part-body-agenti');
  if(!body) return;

  if(!nomi.length){
    body.innerHTML='<div style="text-align:center;padding:44px;color:var(--text4);font-style:italic">Nessuna provvigione con agente assegnato. Vai in Provvigioni e collega un agente.</div>';
    return;
  }

  var html='';
  var htmlAperti='', htmlSaldati='';
  var nAgentiAperti=0, nAgentiSaldati=0, resTotAperti=0;
  nomiFiltrati.forEach(function(nome){
    var m=mastro[nome];
    var isAperto=m.totResiduo>0.01;
    /* Il filtro Stato NON si applica più all'intero agente: un agente può avere
       schede sia aperte che saldate. Il filtro è applicato per singola scheda nel
       loop gruppi; se nessuna scheda passa, l'agente viene saltato (gruppiVisibili). */

    var partite=m.partite.filter(function(p){
      if(filtroAnno&&(p.data||'').slice(0,4)!==filtroAnno) return false;
      return true;
    });
    if(!partite.length) return;

    var ag = m.agente||{};
    var borderColor=isAperto?'#FCA5A5':'#BBF7D0';
    var headerBg=isAperto?'linear-gradient(135deg,#7F1D1D,#B91C1C)':'linear-gradient(135deg,#064E3B,#059669)';
    var statoLabel=isAperto?'DA LIQUIDARE':'LIQUIDATO';
    var statoColor=isAperto?'#FCA5A5':'#4ADE80';

    var htmlAgente='';
    htmlAgente+='<div class="card" data-cli="'+nome.replace(/"/g,'&quot;')+'" style="margin-bottom:16px;border:1.5px solid '+borderColor+';overflow:hidden">';

    /* Header agente */
    htmlAgente+='<div style="background:'+headerBg+';padding:13px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">';
    htmlAgente+='<div style="display:flex;align-items:center;gap:12px">';
    htmlAgente+='<div style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:800;color:white;flex-shrink:0">'+nome.charAt(0).toUpperCase()+'</div>';
    htmlAgente+='<div>';
    htmlAgente+='<div style="font-size:1rem;font-weight:800;color:white">'+nome+'</div>';
    if(ag.codice) htmlAgente+='<div style="font-size:0.7rem;color:rgba(255,255,255,.55)">'+ag.codice+'</div>';
    if(ag.tel)    htmlAgente+='<div style="font-size:0.72rem;color:rgba(255,255,255,.7)">📞 '+ag.tel+'</div>';
    htmlAgente+='</div></div>';

    htmlAgente+='<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">';
    htmlAgente+='<div style="text-align:right"><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Maturato</div><div style="font-size:1rem;font-weight:800;color:white">'+fmtEuro(m.totDare)+'</div></div>';
    htmlAgente+='<div style="text-align:right"><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Pagato+tratt.</div><div style="font-size:1rem;font-weight:800;color:#4ADE80">'+fmtEuro(m.totAvere)+'</div></div>';
    htmlAgente+='<div style="text-align:right"><div style="font-size:0.6rem;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.8px">Residuo</div><div style="font-size:1rem;font-weight:800;color:'+statoColor+'">'+fmtEuro(m.totResiduo)+'</div></div>';
    htmlAgente+='<span style="background:rgba(0,0,0,.25);color:'+statoColor+';border:1.5px solid '+statoColor+'44;padding:4px 12px;border-radius:8px;font-size:0.72rem;font-weight:800">'+statoLabel+'</span>';
    htmlAgente+='</div></div>';

    /* ── SCRITTURE RAGGRUPPATE PER IMMOBILE ──
       Ogni provvigione (fonteIdx) = un immobile/operazione. Raggruppo le partite
       per immobile così l'utente legge a colpo d'occhio, per ciascun immobile:
       quanto è maturato, quanto è stato pagato e quanto resta. */
    htmlAgente+='<div style="padding:6px 14px 14px">';

    /* Raggruppa le partite per IMMOBILE.
       Chiave = Ref. immobile estratto dalla descrizione (presente sia nelle righe
       DARE che AVERE, quindi quota maturata e acconti NF dello stesso immobile
       finiscono insieme). Fallback su fonteIdx solo se manca il Ref. */
    var gruppi={}; var ordineGruppi=[];
    partite.forEach(function(p){
      var mref=(p.descrizione||'').match(/Ref\.(\w+)/);
      var key = mref ? ('ref'+mref[1])
                     : ((p.fonteIdx!==undefined&&p.fonteIdx!==null)?('f'+p.fonte+p.fonteIdx):'altro');
      if(!gruppi[key]){
        // trovo la provvigione di questo immobile (per titolo + venditore/acquirente)
        var pv=null;
        if(mref){
          for(var qi=0; qi<(D.provvigioni||[]).length; qi++){
            if(((D.provvigioni[qi]||{}).descr||'').indexOf('Ref.'+mref[1])>=0){ pv=D.provvigioni[qi]; break; }
          }
        }
        if(!pv && typeof p.fonteIdx==='number' && p.fonte==='provvigione') pv=D.provvigioni[p.fonteIdx];
        var titoloImm = pv && pv.descr ? pv.descr : (p.descrizione||'Immobile').replace(/^.*?—\s*/,'');
        var vend = pv && pv.venditore ? pv.venditore : '';
        var acq  = pv && pv.acquirente ? pv.acquirente : '';
        gruppi[key]={titolo:titoloImm, vend:vend, acq:acq, righe:[], matur:0, pagato:0};
        ordineGruppi.push(key);
      }
      gruppi[key].righe.push(p);
      if(p.tipo==='dare') gruppi[key].matur += p.importo;
      else                gruppi[key].pagato += p.importo;
    });

    /* Renderizza un blocchetto per ogni immobile (in buffer separato per
       poter saltare l'agente se nessun immobile passa il filtro stato) */
    var gruppiHtml=''; var gruppiVisibili=0;
    var gruppiApertiHtml='', gruppiChiusiHtml='';
    var nImmAperti=0, nImmChiusi=0;
    ordineGruppi.forEach(function(key){
      var g=gruppi[key];
      var residuoImm=Math.max(0, g.matur - g.pagato);
      var chiusoImm = residuoImm<=0.01;
      var __g0=gruppiHtml.length; /* marcatore inizio blocchetto immobile */
      /* Coerenza col filtro Stato: se filtro "saldo aperto" nascondi gli immobili
         già saldati; se filtro "saldati" nascondi quelli ancora aperti. */
      if(filtroStato==='aperta' && chiusoImm) return;
      if(filtroStato==='chiusa' && !chiusoImm) return;
      gruppiVisibili++;
      var accent = chiusoImm ? '#15803D' : '#DC2626';
      var accentBg= chiusoImm ? '#F0FDF4' : '#FEF2F2';

      gruppiHtml+='<div style="border:1px solid var(--border);border-radius:10px;margin-bottom:12px;overflow:hidden">';

      /* Intestazione immobile */
      gruppiHtml+='<div style="background:'+accentBg+';border-left:4px solid '+accent+';padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
      gruppiHtml+='<div style="min-width:0">';
      gruppiHtml+='<div style="font-weight:800;font-size:0.9rem;color:var(--text1)">'+g.titolo+'</div>';
      if(g.vend||g.acq){
        gruppiHtml+='<div style="font-size:0.74rem;color:var(--text3);margin-top:2px">'
          +(g.vend?'<strong>Venditore:</strong> '+g.vend:'')
          +(g.vend&&g.acq?' &nbsp;·&nbsp; ':'')
          +(g.acq?'<strong>Acquirente:</strong> '+g.acq:'')
          +'</div>';
      }
      gruppiHtml+='</div>';
      /* mini-riepilogo immobile */
      gruppiHtml+='<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">';
      gruppiHtml+='<div style="text-align:right"><div style="font-size:0.58rem;color:var(--text4);text-transform:uppercase;letter-spacing:.5px">Maturato</div><div style="font-weight:800;font-size:0.85rem;color:var(--text2)">€ '+fmtEuro(g.matur)+'</div></div>';
      gruppiHtml+='<div style="text-align:right"><div style="font-size:0.58rem;color:var(--text4);text-transform:uppercase;letter-spacing:.5px">Pagato/Tratt.</div><div style="font-weight:800;font-size:0.85rem;color:#15803D">€ '+fmtEuro(g.pagato)+'</div></div>';
      gruppiHtml+='<div style="text-align:right"><div style="font-size:0.58rem;color:var(--text4);text-transform:uppercase;letter-spacing:.5px">Residuo</div><div style="font-weight:900;font-size:0.95rem;color:'+accent+'">€ '+fmtEuro(residuoImm)+'</div></div>';
      gruppiHtml+='</div>';
      gruppiHtml+='</div>';

      /* Scritture dell'immobile */
      gruppiHtml+='<div class="table-wrap"><table style="font-size:0.78rem;width:100%">';
      gruppiHtml+='<thead><tr style="font-size:0.66rem;background:#F8FAFC;color:var(--text3)">'
        +'<th style="padding:6px 10px;width:80px;text-align:left">Data</th>'
        +'<th style="padding:6px 10px;text-align:left">Scrittura</th>'
        +'<th style="padding:6px 10px;text-align:right;width:120px">Maturato (€)</th>'
        +'<th style="padding:6px 10px;text-align:right;width:120px">Pagato (€)</th>'
        +'<th style="padding:6px 10px;width:90px;text-align:left">Modalità</th>'
        +'</tr></thead><tbody>';

      g.righe.forEach(function(p){
        var isDare=p.tipo==='dare';
        var ddf=(p.data||'').split('-').reverse().join('/')||'—';
        // etichetta scrittura semplificata (tolgo la parte immobile, già nell'intestazione)
        var etich=p.descrizione.split('—')[0].trim();
        gruppiHtml+='<tr style="'+(isDare?'':'background:#FAFBFF;')+'border-bottom:1px solid #F1F5F9">';
        gruppiHtml+='<td style="padding:6px 10px;color:var(--text3);white-space:nowrap">'+ddf+'</td>';
        gruppiHtml+='<td style="padding:6px 10px;color:var(--text2)">'+etich+'</td>';
        gruppiHtml+='<td style="padding:6px 10px;text-align:right;font-weight:700;color:#DC2626">'+(isDare?'€ '+fmtEuro(p.importo):'')+'</td>';
        gruppiHtml+='<td style="padding:6px 10px;text-align:right;font-weight:700;color:#15803D">'+(!isDare?'€ '+fmtEuro(p.importo):'')+'</td>';
        gruppiHtml+='<td style="padding:6px 10px;font-size:0.72rem;color:var(--text3)">'+(p.modalita||'—')+'</td>';
        gruppiHtml+='</tr>';
      });

      gruppiHtml+='</tbody></table></div>';
      gruppiHtml+='</div>'; /* fine blocchetto immobile */

      /* Estraggo il blocchetto appena costruito e lo smisto */
      var __block=gruppiHtml.slice(__g0);
      gruppiHtml=gruppiHtml.slice(0,__g0);
      if(chiusoImm){ gruppiChiusiHtml+=__block; nImmChiusi++; }
      else         { gruppiApertiHtml+=__block; nImmAperti++; }
    });

    /* Se nessun immobile passa il filtro stato, salta l'intero agente */
    if(gruppiVisibili===0) return;

    /* Immobili APERTI sempre visibili; immobili SALDATI in un pannello
       mostra/nascondi locale a questo agente (stessa logica del livello agente,
       un grado più in profondità). */
    htmlAgente += gruppiApertiHtml;
    if(nImmChiusi>0){
      var __aid='pp-immcl-'+(isAperto?'a':'s')+'-'+(nAgentiAperti+nAgentiSaldati+1);
      htmlAgente+='<div onclick="ppToggleImmChiusi(\''+__aid+'\',this)" '
        +'style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;margin-bottom:12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:9px;cursor:pointer">'
        +'<span style="display:flex;align-items:center;gap:8px;font-size:0.8rem;font-weight:700;color:#047857">'
        +  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        +  nImmChiusi+(nImmChiusi===1?' immobile saldato':' immobili saldati')
        +'</span>'
        +'<span style="display:flex;align-items:center;gap:5px;font-size:0.74rem;color:var(--text3)"><span class="pp-immcl-lbl">Mostra</span>'
        +  '<svg class="pp-immcl-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
        +'</span></div>';
      htmlAgente+='<div id="'+__aid+'" style="display:none">'+gruppiChiusiHtml+'</div>';
    }

    /* Riepilogo totale agente */
    htmlAgente+='<div style="background:#F8FAFC;border:1.5px solid var(--border);border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:4px">';
    htmlAgente+='<div style="font-weight:800;font-size:0.85rem;color:var(--text2)">Totale agente ('+gruppiVisibili+' immobil'+(gruppiVisibili===1?'e':'i')+(filtroStato==='aperta'?' con saldo aperto':(filtroStato==='chiusa'?' saldati':''))+')</div>';
    htmlAgente+='<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">';
    htmlAgente+='<div style="text-align:right"><div style="font-size:0.58rem;color:var(--text4);text-transform:uppercase">Maturato</div><div style="font-weight:800;color:var(--text2)">€ '+fmtEuro(m.totDare)+'</div></div>';
    htmlAgente+='<div style="text-align:right"><div style="font-size:0.58rem;color:var(--text4);text-transform:uppercase">Pagato/Tratt.</div><div style="font-weight:800;color:#15803D">€ '+fmtEuro(m.totAvere)+'</div></div>';
    htmlAgente+='<div style="text-align:right"><div style="font-size:0.58rem;color:var(--text4);text-transform:uppercase">Residuo</div><div style="font-weight:900;font-size:1rem;color:'+(isAperto?'#DC2626':'#15803D')+'">€ '+fmtEuro(m.totResiduo)+'</div></div>';
    htmlAgente+='</div></div>';

    htmlAgente+='</div></div>'; /* fine padding + fine card agente */

    /* Smisto nel gruppo giusto (stesso schema dei clienti) */
    if(isAperto){
      htmlAperti+=htmlAgente;
      nAgentiAperti++;
      resTotAperti+=m.totResiduo;
    }else{
      nAgentiSaldati++;
      var __id='pp-agt-'+nAgentiSaldati;
      var __compact=htmlAgente
        .replace('<div style="background:'+headerBg, '<div onclick="ppToggleCard(\''+__id+'\')" style="cursor:pointer;background:'+headerBg)
        .replace('<div class="table-wrap">', '<div class="table-wrap" id="'+__id+'" style="display:none">');
      htmlSaldati+=__compact;
    }
  });

  /* ── Assemblaggio finale: ricerca + da-liquidare in cima + liquidati collassabili ── */
  var out='';

  out+='<div style="position:relative;margin-bottom:16px">'
     + '<input id="pp-search-agt" type="text" placeholder="Cerca agente per nome…" oninput="ppFilterPartitarioAgenti()" '
     + 'style="width:100%;height:40px;padding:0 14px 0 38px;border:1.5px solid var(--border);border-radius:9px;font-size:0.88rem;font-family:inherit;outline:none">'
     + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:13px;top:50%;transform:translateY(-50%)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
     + '</div>';

  if(!htmlAperti && !htmlSaldati){
    out+='<div style="text-align:center;padding:44px;color:var(--text4);font-style:italic">Nessun agente corrisponde ai filtri selezionati</div>';
    body.innerHTML=out;
    return;
  }

  /* Gruppo DA LIQUIDARE — in cima, espansi */
  if(htmlAperti){
    out+='<div style="display:flex;align-items:center;gap:9px;margin:4px 0 12px">'
       + '<span style="width:9px;height:9px;border-radius:50%;background:#DC2626;display:inline-block"></span>'
       + '<span style="font-size:0.9rem;font-weight:800;color:#DC2626">Da liquidare</span>'
       + '<span style="font-size:0.72rem;font-weight:700;color:#B91C1C;background:#FEF2F2;border:1px solid #FECACA;padding:3px 11px;border-radius:7px">'+nAgentiAperti+(nAgentiAperti===1?' agente':' agenti')+' · € '+fmtEuro(resTotAperti)+' da pagare</span>'
       + '</div>';
    out+='<div id="pp-group-aperti-agt">'+htmlAperti+'</div>';
  }else{
    out+='<div style="display:flex;align-items:center;gap:9px;margin:4px 0 16px;padding:12px 16px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:9px">'
       + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
       + '<span style="font-size:0.86rem;font-weight:700;color:#047857">Nessuna provvigione da liquidare — tutti gli agenti sono in regola.</span>'
       + '</div>';
  }

  /* Gruppo LIQUIDATI — pannello collassabile, chiuso di default */
  if(htmlSaldati){
    out+='<button id="pp-toggle-liquidati" onclick="ppToggleLiquidati()" '
       + 'style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:13px 16px;margin:18px 0 0;background:#F8FAFC;border:1.5px solid var(--border);border-radius:9px;cursor:pointer;font-family:inherit">'
       + '<span style="display:flex;align-items:center;gap:9px">'
       +   '<span style="width:9px;height:9px;border-radius:50%;background:#059669;display:inline-block"></span>'
       +   '<span style="font-size:0.9rem;font-weight:800;color:#047857">Agenti liquidati</span>'
       +   '<span style="font-size:0.74rem;color:var(--text3)">('+nAgentiSaldati+')</span>'
       + '</span>'
       + '<span style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--text3)"><span id="pp-toggle-lbl-agt">Mostra</span>'
       +   '<svg id="pp-toggle-ic-agt" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
       + '</span></button>';
    out+='<div id="pp-group-liquidati" style="display:none;margin-top:14px">'+htmlSaldati+'</div>';
  }

  body.innerHTML=out;
}

function partStampaAgenti(){
  renderPartitarioAgenti();
  var body=document.getElementById('part-body-agenti');
  var ag=(document.getElementById('part-sel-agente')||{}).value||'Tutti gli agenti';
  var w=window.open('','_blank','width=1050,height=850');
  w.document.write('<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Partitario Agenti</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">'
    +'<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,sans-serif;font-size:12px;color:#0F172A}'
    +'.cover{background:linear-gradient(135deg,#0F172A,#1E3A5F);padding:28px 36px;color:white;margin-bottom:20px}'
    +'table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border:1px solid #E2E8F0;font-size:11px}'
    +'th{background:#F8FAFC;font-weight:700}@media print{.cover{-webkit-print-color-adjust:exact}}</style>'
    +'</head><body>'
    +'<div class="cover"><div style="font-size:10px;opacity:.5;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">Le case dalla A allo Z.io — Vincenzo Carnicelli</div>'
    +'<div style="font-size:20px;font-weight:900">Partitario Agenti — '+ag+'</div>'
    +'<div style="font-size:12px;opacity:.65;margin-top:4px">Generato il '+new Date().toLocaleDateString('it-IT')+'</div></div>'
    +body.innerHTML
    +'<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>'
    +'</body></html>');
  w.document.close();
}


/* ═══════════════════════════════════════════════════════════
   REPORT CAPO AGENZIA
═══════════════════════════════════════════════════════════ */


// --- BRIDGE window ---
/* ── UX Partitario: toggle pannello saldati, espansione card, ricerca ──────── */
var _ppSaldatiShown=false;
function ppToggleSaldati(){
  _ppSaldatiShown=!_ppSaldatiShown;
  var g=document.getElementById('pp-group-saldati');
  var lbl=document.getElementById('pp-toggle-lbl');
  var ic=document.getElementById('pp-toggle-ic');
  if(g) g.style.display=_ppSaldatiShown?'block':'none';
  if(lbl) lbl.textContent=_ppSaldatiShown?'Nascondi':'Mostra';
  if(ic) ic.innerHTML=_ppSaldatiShown?'<polyline points="18 15 12 9 6 15"/>':'<polyline points="6 9 12 15 18 9"/>';
}
/* Espande/chiude la tabella partite di una singola card saldata */
function ppToggleCard(id){
  var t=document.getElementById(id);
  if(t) t.style.display=(t.style.display==='none')?'block':'none';
}
/* Ricerca rapida: filtra le card (aperti+saldati) per nome cliente.
   Se si cerca qualcosa, apre automaticamente il pannello saldati. */
function ppFilterPartitario(){
  var inp=document.getElementById('pp-search');
  var q=inp?inp.value.toLowerCase().trim():'';
  if(q && !_ppSaldatiShown){ ppToggleSaldati(); }
  ['pp-group-aperti','pp-group-saldati'].forEach(function(gid){
    var g=document.getElementById(gid);
    if(!g) return;
    /* Ogni card cliente è un figlio diretto con classe "card" */
    Array.prototype.forEach.call(g.querySelectorAll(':scope > .card'), function(card){
      var nm=(card.getAttribute('data-cli')||'').toLowerCase();
      card.style.display=(!q || nm.indexOf(q)>=0)?'':'none';
    });
  });
}
try{ window.ppToggleSaldati=ppToggleSaldati; window.ppToggleCard=ppToggleCard; window.ppFilterPartitario=ppFilterPartitario; }catch(e){}

/* ── UX Partitario AGENTI: toggle pannello liquidati + ricerca ───────────── */
var _ppLiquidatiShown=false;
function ppToggleLiquidati(){
  _ppLiquidatiShown=!_ppLiquidatiShown;
  var g=document.getElementById('pp-group-liquidati');
  var lbl=document.getElementById('pp-toggle-lbl-agt');
  var ic=document.getElementById('pp-toggle-ic-agt');
  if(g) g.style.display=_ppLiquidatiShown?'block':'none';
  if(lbl) lbl.textContent=_ppLiquidatiShown?'Nascondi':'Mostra';
  if(ic) ic.innerHTML=_ppLiquidatiShown?'<polyline points="18 15 12 9 6 15"/>':'<polyline points="6 9 12 15 18 9"/>';
}
function ppFilterPartitarioAgenti(){
  var inp=document.getElementById('pp-search-agt');
  var q=inp?inp.value.toLowerCase().trim():'';
  if(q && !_ppLiquidatiShown){ ppToggleLiquidati(); }
  ['pp-group-aperti-agt','pp-group-liquidati'].forEach(function(gid){
    var g=document.getElementById(gid);
    if(!g) return;
    Array.prototype.forEach.call(g.querySelectorAll(':scope > .card'), function(card){
      var nm=(card.getAttribute('data-cli')||'').toLowerCase();
      card.style.display=(!q || nm.indexOf(q)>=0)?'':'none';
    });
  });
}
try{ window.ppToggleLiquidati=ppToggleLiquidati; window.ppFilterPartitarioAgenti=ppFilterPartitarioAgenti; }catch(e){}

/* Toggle del pannello "immobili saldati" interno a una card agente.
   id = id del contenitore; btn = la barra cliccata (per aggiornare label/icona). */
function ppToggleImmChiusi(id, btn){
  var g=document.getElementById(id);
  if(!g) return;
  var shown=(g.style.display!=='none');
  g.style.display=shown?'none':'block';
  if(btn){
    var lbl=btn.querySelector('.pp-immcl-lbl');
    var ic=btn.querySelector('.pp-immcl-ic');
    if(lbl) lbl.textContent=shown?'Mostra':'Nascondi';
    if(ic) ic.innerHTML=shown?'<polyline points="6 9 12 15 18 9"/>':'<polyline points="18 15 12 9 6 15"/>';
  }
}
try{ window.ppToggleImmChiusi=ppToggleImmChiusi; }catch(e){}

Object.assign(window, {
  _partBuildMastro, renderPartitario, partStampa, partSwitchTab,
  _partBuildMastroAgenti, renderPartitarioAgenti, partStampaAgenti,
});

export { renderPartitario, renderPartitarioAgenti, partSwitchTab };
