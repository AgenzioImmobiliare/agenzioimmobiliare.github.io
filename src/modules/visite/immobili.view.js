// modules/immobili/immobili.view.js — vista DESKTOP del modulo Immobili.
//
// Estratto dal monolite, due segmenti:
//   Seg 1 (21172-21718): openImmobileModal, openImmobileModalWithClient,
//     co-intestatari (immAddCoInt/immUpdateCoIntEmpty/immGetCoInt/immSetCoInt),
//     saveImmobile, showIncaricoDetail, archiviaImmobile, salvaArchiviazione,
//     riattiviaImmobile, archiviaImmobileFromScheda.
//   Seg 2 (22196-23026): delImmobile, delImmobileFromScheda, setImView,
//     resetImmFiltri, toggleImmFiltriPanel, setImmFilter, _initImmDefaults,
//     setImmStatoPill, updatePillCounts, immSearchDropdown/Select/Hide,
//     renderImmobili, openSchedaImmobile, renderDistanze, renderSchedaImmobile.
//
// NON estratte (restano nel monolite, dominio diverso): renderIncarichi e
// satelliti, renderStatistiche, reindexAfterImmSplice/reindexAfterCliSplice
// (utility condivise da piu' moduli).
//
// DIPENDENZE ESTERNE (monolite, via window): today, fmtE, fmtD, _norm, saveD,
//   showToast, dlgAlert, updateBadges, go, _tlLog, parseCurrStr, setNum, genUUID,
//   immSalute, immSaluteBadge, toggleCondominioFields, showImmQR, renderIncarichi,
//   renderClienti, reindexAfterImmSplice, openModal, openPraticaImm,
//   openVisitaForImm, openReportVisite, openSchedaCliente, openRichiestaForClient,
//   hasPermission.
//   VARIABILE: curSection (resa `var` nel monolite).
//
// `D` e' un Proxy LIVE su window.D (stato reale del monolite).
import { state } from '../../core/state.js';

const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

// Stato locale del modulo: indice immobile in archiviazione.
// Nel monolite era `let _archiviaIdx` (riga 21583), usato SOLO dalle funzioni
// Immobili archivia/salvaArchiviazione -> stato locale del modulo.
let _archiviaIdx = null;

function openImmobileModal(idx){
  D.editIdx=null; D.editType=null;
  clearModal('modal-immobile'); tempFoto=null;
  immSetCoInt([]);
  const _prov=document.getElementById('im-provenienza');if(_prov)_prov.value='';
  // Reset condominio
  const _cond=document.getElementById('im-condominio');if(_cond)_cond.value='';
  toggleCondominioFields();
  ['im-cond-unita','im-cond-scale','im-cond-amm','im-cond-amm-tel'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  // Reset distanze
  ['mare','centro','stazione','scuole','banca','supermercato','chiesa','farmacia','posta','ospedale','stadio'].forEach(k=>{const el=document.getElementById('im-dist-'+k);if(el)el.value='';});
  // Reset marketing
  ['cartello-imm','cartello-ag','cartella','open-house','immobiliare','idealista','casait','subito','trovacasa','tecnocasa','facebook','instagram','whatsapp','newsletter','giornalino','volantini','passaparola','vetrina'].forEach(k=>{const el=document.getElementById('im-mkt-'+k);if(el)el.checked=false;});
  const mktNoteEl=document.getElementById('im-mkt-note');if(mktNoteEl)mktNoteEl.value='';
  const vincNoteEl=document.getElementById('im-vincoli-note');if(vincNoteEl)vincNoteEl.value='';
  const vincRes=document.getElementById('vincoli-result');if(vincRes){vincRes.style.display='none';vincRes.innerHTML='';}
  const rifAgEl=document.getElementById('im-rif-agenzia');if(rifAgEl)rifAgEl.value='';;
  document.getElementById('im-foto-prev').style.display='none';
  document.getElementById('im-foto-ph').style.display='block';
  document.getElementById('im-foto-inp').value='';
  // Populate only venditori/entrambi for immobile (not acquirenti)
  const immCliSel=document.getElementById('im-cliente-ref');
  if(immCliSel){
    immCliSel.innerHTML='<option value="">-- Seleziona proprietario --</option>'+
      D.clienti.map((cl,idx)=>(cl.tipo==='venditore'||cl.tipo==='entrambi')?
        `<option value="${idx}">${cl.nome||'Cliente '+(idx+1)}</option>`:'').join('');
  }
  // Populate agenti select
  const immAgSel=document.getElementById('im-agente-ref');
  if(immAgSel){
    immAgSel.innerHTML='<option value="">-- Seleziona agente --</option>'+
      D.agenti.filter(a=>a.stato!=='non attivo').map((a,i)=>`<option value="${i}">${a.nome}</option>`).join('');
  }
  document.getElementById('mt-imm').textContent=idx!==undefined?'Modifica Immobile':'Nuovo Immobile';
  if(idx===undefined){
    // Auto-assign next progressive REF
    const maxRef=D.immobili.reduce((m,im)=>{const n=parseInt((im.ref||'').toString().replace(/[^0-9]/g,''));return(!isNaN(n)&&n>m)?n:m;},0);
    document.getElementById('im-ref').value=String(maxRef+1).padStart(4,'0');
    document.getElementById('im-data-ins').value=today();
    aggiornaStatoBadgeImmobile(undefined); // nuovo → sempre attivo
  }
  if(idx!==undefined){
    D.editIdx=idx; D.editType='immobile';
    try{ _injectFotoCache(); }catch(e){} /* ensure foto is in D before opening modal */
    const im=D.immobili[idx];
    const fs={ref:'im-ref',rifAgenzia:'im-rif-agenzia',/*stato gestito da aggiornaStatoBadgeImmobile*/tipo:'im-tipo',incarico:'im-inc',conferimento:'im-conf',incInizio:'im-inc-inizio',incFine:'im-inc-fine',incPerc:'im-inc-perc',clienteRef:'im-cliente-ref',agenteRef:'im-agente-ref',praticaRef:'im-pratica-ref',mq:'im-mq',camere:'im-camere',locali:'im-locali',cucina:'im-cucina',bagni:'im-bagni',piano:'im-piano',anno:'im-anno',condizioni:'im-condizioni',energia:'im-energia',garage:'im-garage',terrazza:'im-terrazza',giardino:'im-giardino',ascensore:'im-asc',riscaldamento:'im-risc',mare:'im-mare',comune:'im-comune',zona:'im-zona',indirizzo:'im-indirizzo',contatto:'im-contatto',telefono:'im-tel',email:'im-email',data:'im-data',note:'im-note',descrizione:'im-descr',valutazione:'im-valutazione',dataIns:'im-data-ins',esposizione:'im-esposizione',pianiTot:'im-piani-tot',piscina:'im-piscina',arredato:'im-arredato',speseCondominio:'im-spese-cond',linkPortale:'im-link-portale',codImmobiliare:'im-cod-immobiliare',agenziaAgente:'im-agente-agenzia'};
    Object.entries(fs).forEach(([k,id])=>{const el=document.getElementById(id);if(el&&im[k]!==undefined)el.value=im[k]||'';});
    updateValBadge(im.valutazione||5);
    aggiornaStatoBadgeImmobile(idx); // stato calcolato dalla pratica
    onAgenteImmChange(); // popola select agenzie
    // Ripristina agenzia selezionata per questo immobile
    if(im.agenziaAgente){
      const agSel=document.getElementById('im-agente-agenzia');
      if(agSel) setTimeout(()=>{agSel.value=im.agenziaAgente;},50);
    }
    // Ripristina checklist documenti
    setDocsChecklist(im.docsChecklist||{});
    // Currency fields need setNum to properly set data-raw
    setNum('im-prezzo', parseCurrStr(String(im.prezzo||'')));
    setNum('im-inc-imp', parseCurrStr(String(im.incImp||'')));
    if(im.foto){tempFoto=im.foto;document.getElementById('im-foto-prev').src=im.foto;document.getElementById('im-foto-prev').style.display='block';document.getElementById('im-foto-ph').style.display='none';}
    // Carica provenienza
    const imProv=document.getElementById('im-provenienza');
    if(imProv) imProv.value=im.provenienza||'';
    // Carica co-intestatari
    immSetCoInt(im.coIntestari||[]);
    // Carica condominio
    const condEl=document.getElementById('im-condominio');
    if(condEl){condEl.value=im.condominio||'';toggleCondominioFields();}
    ['cond-unita','cond-scale','cond-amm','cond-amm-tel'].forEach(k=>{
      const el=document.getElementById('im-'+k);if(el)el.value=im[k.replace('-','_')]||im[k]||'';
    });
    // Carica distanze (i dati sono in metri; mostra km se ≥1000m)
    ['mare','centro','stazione','scuole','banca','supermercato','chiesa','farmacia','posta','ospedale','stadio'].forEach(k=>{
      const el=document.getElementById('im-dist-'+k);
      if(!el) return;
      const m=(im.distanze||{})[k];
      const unitSpan=el.closest('div')?.querySelector('.dist-unit');
      if(m==null||m===''){ el.value=''; if(unitSpan)unitSpan.textContent='m'; return; }
      const km = m>=1000;
      el.step = km ? 'any' : '1';
      el.value = km ? +(m/1000).toFixed(1) : m;
      if(unitSpan) unitSpan.textContent = km ? 'km' : 'm';
      // Editing manuale: il valore digitato è sempre in metri → unità torna 'm'
      if(!el.dataset.distHook){
        el.dataset.distHook='1';
        el.addEventListener('input',function(){
          const u=this.closest('div')?.querySelector('.dist-unit');
          if(u) u.textContent='m';
          this.step='1';
        });
      }
    });
    // Carica marketing
    const mkt=im.mkt||{};
    const mktKeys=['cartello-imm','cartello-ag','cartella','open-house','immobiliare','idealista','casait','subito','trovacasa','tecnocasa','facebook','instagram','whatsapp','newsletter','giornalino','volantini','passaparola','vetrina'];
    mktKeys.forEach(k=>{
      const el=document.getElementById('im-mkt-'+k);
      if(el) el.checked=!!(mkt[k.replace('-','').replace('-','')]||mkt[k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]||false);
    });
    const mktNote=document.getElementById('im-mkt-note');if(mktNote)mktNote.value=mkt.note||'';
    // Carica note vincoli
    const vincNote=document.getElementById('im-vincoli-note');if(vincNote)vincNote.value=im.vincNote||'';
  }
  openModal('modal-immobile');
}
function openImmobileModalWithClient(cliIdx){
  const cl=D.clienti[cliIdx];
  if(cl && cl.tipo==='acquirente'){
    alert(' '+cl.nome+' è un Acquirente.\n\nGli acquirenti non possono avere immobili collegati.\nVerrai reindirizzato alla scheda richieste.');
    openSchedaCliente(cliIdx);
    setTimeout(()=>openRichiestaForClient(cliIdx), 300);
    return;
  }
  openImmobileModal();
  if(cl){
    document.getElementById('im-cliente-ref').value=cliIdx;
    document.getElementById('im-contatto').value=cl.nome||'';
    document.getElementById('im-tel').value=cl.tel||'';
    document.getElementById('im-email').value=cl.email||'';
    document.getElementById('mt-imm').textContent='Nuovo Immobile — Proprietario: '+(cl.nome||'Cliente');
  }
}

// ── CO-INTESTATARI IMMOBILE ───────────────────────────────────────────────────
function immAddCoInt(nome, tel, nascita){
  const list=document.getElementById('im-coint-list');
  const empty=document.getElementById('im-coint-empty');
  if(!list) return;
  const idx=list.children.length;
  const row=document.createElement('div');
  row.style.cssText='display:flex;align-items:center;gap:6px;flex-wrap:wrap';
  row.innerHTML=`
    <input type="text" placeholder="Nome e cognome" value="${nome||''}"
      style="flex:1;min-width:140px;padding:7px 10px;border:1.5px solid #DDD6FE;border-radius:8px;font-family:inherit;font-size:0.85rem;outline:none;color:var(--text)"
      onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#DDD6FE'">
    <input type="tel" placeholder="Telefono (opz.)" value="${tel||''}"
      style="width:140px;padding:7px 10px;border:1.5px solid #DDD6FE;border-radius:8px;font-family:inherit;font-size:0.85rem;outline:none;color:var(--text)"
      onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#DDD6FE'">
    <input type="date" title="Data di nascita (per il compleanno)" value="${nascita||''}"
      style="width:150px;padding:7px 10px;border:1.5px solid #DDD6FE;border-radius:8px;font-family:inherit;font-size:0.85rem;outline:none;color:var(--text)"
      onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#DDD6FE'">
    <button type="button" onclick="this.closest('div').remove();immUpdateCoIntEmpty()"
      style="padding:5px 9px;background:#FEE2E2;color:#DC2626;border:1.5px solid #FCA5A5;border-radius:7px;cursor:pointer;font-size:0.85rem;font-weight:700;flex-shrink:0"></button>`;
  list.appendChild(row);
  if(empty) empty.style.display='none';
}
function immUpdateCoIntEmpty(){
  const list=document.getElementById('im-coint-list');
  const empty=document.getElementById('im-coint-empty');
  if(list&&empty) empty.style.display=list.children.length===0?'':'none';
}
function immGetCoInt(){
  const list=document.getElementById('im-coint-list');
  if(!list) return [];
  return Array.from(list.children).map(row=>{
    const inputs=row.querySelectorAll('input');
    return {nome:(inputs[0]?.value||'').trim(), tel:(inputs[1]?.value||'').trim(), nascita:(inputs[2]?.value||'').trim()};
  }).filter(x=>x.nome);
}
function immSetCoInt(arr){
  const list=document.getElementById('im-coint-list');
  const empty=document.getElementById('im-coint-empty');
  if(!list) return;
  list.innerHTML='';
  (arr||[]).forEach(x=>immAddCoInt(x.nome,x.tel,x.nascita));
  if(empty) empty.style.display=(arr&&arr.length)>0?'none':'';
}
/* Genera/aggiorna gli eventi compleanno per i co-intestatari con data di nascita,
   stesso formato usato per i clienti. Rimuove prima i vecchi eventi compleanno
   dei co-intestatari di questo immobile per evitare duplicati. */
function _syncCompleannoCoInt(coIntestari){
  if(typeof D==='undefined' || !Array.isArray(D.eventi)) return;
  (coIntestari||[]).forEach(function(co){
    if(!co || !co.nome) return;
    /* rimuovi eventuale compleanno precedente di questo co-intestatario */
    D.eventi = D.eventi.filter(function(e){ return !(e._type==='compleanno' && e._coint===true && e.cliente===co.nome); });
    if(co.nascita && co.nascita.length===10){
      var _oggi=new Date(); _oggi.setHours(0,0,0,0);
      var _mm=co.nascita.slice(5,7), _dd=co.nascita.slice(8,10);
      var _anno=_oggi.getFullYear();
      var _bq=new Date(_anno+'-'+_mm+'-'+_dd+'T00:00:00');
      if(_bq<_oggi) _anno++;
      var _bdData=_anno+'-'+_mm+'-'+_dd;
      D.eventi.push({titolo:' Compleanno di '+co.nome,tipo:'Compleanno',data:_bdData,ora:'',cliente:co.nome,tel:co.tel||'',note:'Data di nascita: '+co.nascita+' (co-intestatario)',_type:'compleanno',_coint:true});
    }
  });
}
function saveImmobile(){
  try{
    const g=id=>{const el=document.getElementById(id);return el?el.value:'';};
    const gn=id=>{const el=document.getElementById(id);if(!el)return 0;const raw=el.getAttribute('data-raw')||el.value.replace(/\./g,'').replace(',','.');return parseFloat(raw)||0;};
    const clienteRef=g('im-cliente-ref');
    // Mandatory: cliente collegato
    if(clienteRef===''||clienteRef===null){
      alert(' Il Cliente/Proprietario è obbligatorio.\nSeleziona un cliente dalla lista prima di salvare l\'immobile.');
      document.getElementById('im-cliente-ref').focus();
      return;
    }
    // Block if client is acquirente
    const cliForImm=D.clienti[parseInt(clienteRef)];
    if(cliForImm && cliForImm.tipo==='acquirente'){
      alert(' Il cliente "'+cliForImm.nome+'" è registrato come Acquirente.\n\nGli immobili possono essere collegati solo a clienti di tipo Venditore o Entrambi.\n\nModifica il tipo del cliente oppure seleziona un venditore diverso.');
      document.getElementById('im-cliente-ref').focus();
      return;
    }
    // Agente: warn se mancante ma non blocca (per retrocompatibilità)
    const agenteRef=g('im-agente-ref');
    if((agenteRef===''||agenteRef===null)&&D.agenti.length>0){
      if(!confirm(' Nessun Agente assegnato.\nVuoi salvare comunque senza agente?')) return;
    }
    // Mandatory: tipo + comune
    if(!g('im-tipo')){dlgAlert('Il Tipo immobile è obbligatorio.','','Campo obbligatorio');document.getElementById('im-tipo').focus();return;}
    if(!g('im-comune').trim()){dlgAlert('Il Comune è obbligatorio.','','Campo obbligatorio');document.getElementById('im-comune').focus();return;}
    // Auto-fill contatto from cliente if blank
    let contatto=g('im-contatto');
    let telefono=g('im-tel');
    let email=g('im-email');
    const cli=D.clienti[parseInt(clienteRef)];
    if(cli){
      contatto=contatto||cli.nome||'';
      telefono=telefono||cli.tel||'';
      email=email||cli.email||'';
    }
    const prezzoRaw=gn('im-prezzo');
    // Leggi il prezzo in modo sicuro: priorità data-raw, poi parsing diretto del valore
    const prezzoEl=document.getElementById('im-prezzo');
    const prezzoDataRaw=prezzoEl?parseFloat(prezzoEl.getAttribute('data-raw')||'0')||0:0;
    const prezzoValRaw=prezzoEl?parseCurrStr(prezzoEl.value)||0:0;
    const nuovoPrezzo=prezzoDataRaw>0?prezzoDataRaw:prezzoValRaw>0?prezzoValRaw:prezzoRaw;
    // Preserva prezzoStorico dall'oggetto esistente e aggiorna se prezzo cambiato
    const oldIm=D.editIdx!==null?D.immobili[D.editIdx]:null;
    const oldStorico=oldIm?.prezzoStorico?[...oldIm.prezzoStorico]:[];
    if(nuovoPrezzo>0){
      if(!oldStorico.length){
        // Prima volta: registra il prezzo ATTUALE come iniziale
        const prezzoOriginale=parseFloat(oldIm?.prezzo)||0;
        if(prezzoOriginale>0){
          // L'immobile aveva già un prezzo — salva prima quello come "Prezzo iniziale"
          oldStorico.push({prezzo:prezzoOriginale,data:oldIm?.dataIns||today(),motivo:'Prezzo iniziale'});
          // Se diverso dal nuovo, aggiungi anche la variazione
          if(Math.abs(prezzoOriginale-nuovoPrezzo)>0.01){
            oldStorico.push({prezzo:nuovoPrezzo,data:today(),motivo:'Aggiornamento prezzo'});
          }
        } else {
          // Nuovo immobile senza prezzo precedente
          oldStorico.push({prezzo:nuovoPrezzo,data:g('im-data-ins')||today(),motivo:'Prezzo iniziale'});
        }
      } else {
        const ultimoPrezzo=parseFloat(oldStorico[oldStorico.length-1].prezzo)||0;
        if(Math.abs(ultimoPrezzo-nuovoPrezzo)>0.01){
          oldStorico.push({prezzo:nuovoPrezzo,data:today(),motivo:'Aggiornamento prezzo'});
        }
      }
    }
    /* FIX BUG ORFANI: deriva clienteUuid stabile dal clienteRef.
       In questo modo, anche modifiche dal desktop preservano il riferimento
       stabile usato dal sync mobile↔desktop. */
    let _cliUuid = null;
    if(clienteRef!=='' && clienteRef!==null){
      const _r = parseInt(clienteRef);
      if(!isNaN(_r) && D.clienti[_r]){
        if(!D.clienti[_r].uuid){
          D.clienti[_r].uuid = (typeof genUUID==='function') ? genUUID()
            : ('cli-bf-'+Date.now()+'-'+Math.random().toString(36).slice(2,9));
        }
        _cliUuid = D.clienti[_r].uuid;
      }
    }
    const im={
      ref:g('im-ref'),rifAgenzia:g('im-rif-agenzia').trim().toUpperCase()||'',stato:g('im-stato')||'attivo',tipo:g('im-tipo'),
      incarico:g('im-inc'),conferimento:g('im-conf'),
      incInizio:g('im-inc-inizio'),incFine:g('im-inc-fine'),
      incPerc:g('im-inc-perc'),incImp:getNum('im-inc-imp')||g('im-inc-imp'),
      prezzo:nuovoPrezzo||0,
      locali:g('im-locali'),cucina:g('im-cucina'),
      clienteRef,clienteUuid:_cliUuid,praticaRef:g('im-pratica-ref'),
      mq:g('im-mq'),camere:g('im-camere'),bagni:g('im-bagni'),piano:g('im-piano'),
      anno:g('im-anno'),condizioni:g('im-condizioni'),energia:g('im-energia'),
      garage:g('im-garage'),terrazza:g('im-terrazza'),giardino:g('im-giardino'),
      ascensore:g('im-asc'),riscaldamento:g('im-risc'),mare:g('im-mare'),
      comune:g('im-comune'),zona:g('im-zona'),indirizzo:g('im-indirizzo'),
      contatto,telefono,email,
      agenteRef,
      valutazione:parseInt(g('im-valutazione'))||5,
      dataIns:g('im-data-ins'),data:g('im-data'),note:g('im-note'),descrizione:g('im-descr'),
      linkPortale:g('im-link-portale'),
      codImmobiliare:(g('im-cod-immobiliare')||'').trim(),
      agenziaAgente:g('im-agente-agenzia'),
      docsChecklist:getDocsChecklist(),
      esposizione:g('im-esposizione'),pianiTot:g('im-piani-tot'),piscina:g('im-piscina'),arredato:g('im-arredato'),speseCondominio:g('im-spese-cond'),
      provenienza:g('im-provenienza'),
      coIntestari:immGetCoInt(),
      condominio:g('im-condominio'),
      'cond-unita':g('im-cond-unita'),'cond-scale':g('im-cond-scale'),
      'cond-amm':g('im-cond-amm'),'cond-amm-tel':g('im-cond-amm-tel'),
      distanze:(()=>{const d={};['mare','centro','stazione','scuole','banca','supermercato','chiesa','farmacia','posta','ospedale','stadio'].forEach(k=>{const el=document.getElementById('im-dist-'+k);if(!el)return;const raw=String(el.value||'').trim();if(raw==='')return;const unit=el.closest('div')?.querySelector('.dist-unit')?.textContent||'m';const num=parseFloat(raw.replace(',','.'));if(isNaN(num))return;const metri=(unit==='km')?Math.round(num*1000):Math.round(num);if(metri>0)d[k]=metri;});return d;})(),
      foto:tempFoto||(D.editIdx!==null&&D.immobili[D.editIdx]?D.immobili[D.editIdx].foto:null),
      prezzoStorico:oldStorico,
      vincNote:g('im-vincoli-note'),
      mkt:{
        cartelloImm:document.getElementById('im-mkt-cartello-imm')?.checked||false,
        cartelloAg:document.getElementById('im-mkt-cartello-ag')?.checked||false,
        cartella:document.getElementById('im-mkt-cartella')?.checked||false,
        openHouse:document.getElementById('im-mkt-open-house')?.checked||false,
        immobiliare:document.getElementById('im-mkt-immobiliare')?.checked||false,
        idealista:document.getElementById('im-mkt-idealista')?.checked||false,
        casait:document.getElementById('im-mkt-casait')?.checked||false,
        subito:document.getElementById('im-mkt-subito')?.checked||false,
        trovacasa:document.getElementById('im-mkt-trovacasa')?.checked||false,
        tecnocasa:document.getElementById('im-mkt-tecnocasa')?.checked||false,
        facebook:document.getElementById('im-mkt-facebook')?.checked||false,
        instagram:document.getElementById('im-mkt-instagram')?.checked||false,
        whatsapp:document.getElementById('im-mkt-whatsapp')?.checked||false,
        newsletter:document.getElementById('im-mkt-newsletter')?.checked||false,
        giornalino:document.getElementById('im-mkt-giornalino')?.checked||false,
        volantini:document.getElementById('im-mkt-volantini')?.checked||false,
        passaparola:document.getElementById('im-mkt-passaparola')?.checked||false,
        vetrina:document.getElementById('im-mkt-vetrina')?.checked||false,
        note:g('im-mkt-note'),
      }
    };
    if(D.editIdx!==null&&D.editType==='immobile'){
      im.uuid = D.immobili[D.editIdx].uuid || genUUID(); // mantieni UUID esistente
      /* ─── TIMELINE: confronta oldIm vs im per loggare cambi rilevanti ─── */
      try{
        var _oldIm = D.immobili[D.editIdx] || {};
        var _idxLog = D.editIdx;
        var _relCli = [];
        if(im.clienteRef !== '' && im.clienteRef != null) _relCli.push({t:'cliente', id: parseInt(im.clienteRef)});
        /* Prezzo */
        var _oldP = parseFloat(_oldIm.prezzo)||0;
        var _newP = parseFloat(im.prezzo)||0;
        if(_oldP>0 && _newP>0 && Math.abs(_oldP - _newP) > 0.01){
          _tlLog('imm_prezzo', 'immobile', _idxLog,
            'Prezzo variato: € '+_oldP.toLocaleString('it-IT')+' → € '+_newP.toLocaleString('it-IT'),
            { da: _oldP, a: _newP },
            { relIds: _relCli });
        }
        /* Stato */
        var _oldS = (_oldIm.stato||'').toLowerCase();
        var _newS = (im.stato||'').toLowerCase();
        if(_oldS && _newS && _oldS !== _newS){
          _tlLog('imm_stato', 'immobile', _idxLog,
            'Stato: '+_oldIm.stato+' → '+im.stato,
            { da: _oldIm.stato, a: im.stato },
            { relIds: _relCli });
        }
        /* Agente */
        var _oldAg = String(_oldIm.agenteRef||'');
        var _newAg = String(im.agenteRef||'');
        if(_oldAg !== _newAg){
          var _agNomeOld = (D.agenti[parseInt(_oldAg)]||{}).nome || '—';
          var _agNomeNew = (D.agenti[parseInt(_newAg)]||{}).nome || '—';
          _tlLog('imm_agente', 'immobile', _idxLog,
            'Agente: '+_agNomeOld+' → '+_agNomeNew,
            { da: _agNomeOld, a: _agNomeNew },
            { relIds: _relCli });
        }
      }catch(_tlErr){ console.warn('[Timeline] hook saveImmobile (update) KO:', _tlErr); }
      D.immobili[D.editIdx]=im;
    } else {
      im.uuid = genUUID(); // UUID stabile assegnato una sola volta alla creazione
      D.immobili.push(im);
      /* ─── TIMELINE: creazione immobile ─── */
      try{
        var _newIdx = D.immobili.length - 1;
        var _relCliNew = [];
        if(im.clienteRef !== '' && im.clienteRef != null) _relCliNew.push({t:'cliente', id: parseInt(im.clienteRef)});
        _tlLog('imm_creato', 'immobile', _newIdx,
          'Immobile creato: '+(im.tipo||'—')+(im.comune?' — '+im.comune:''),
          { tipo: im.tipo, comune: im.comune, prezzo: parseFloat(im.prezzo)||0, stato: im.stato },
          { relIds: _relCliNew });
      }catch(_tlErr2){ console.warn('[Timeline] hook saveImmobile (create) KO:', _tlErr2); }
    }
    /* Genera gli eventi compleanno per i co-intestatari (come per i clienti) */
    try{ _syncCompleannoCoInt(im.coIntestari); }catch(_ce){ console.warn('[CompleannoCoInt] KO:', _ce); }
    saveD();
    var _immEraNuovo = (D.editIdx === null); /* per il match proattivo */
    // Auto-create scadenzario event for incarico fine if set
    syncIncaricoScadenza(im, D.editIdx!==null ? D.editIdx : D.immobili.length-1);
    const immSavedIdx = D.editIdx!==null ? D.editIdx : D.immobili.length-1;
    closeModal('modal-immobile');
    // Torna alla sezione da cui si è aperto il modal
    if(curSection==='scheda-immobile'){
      D.reportImmIdx=immSavedIdx;
      renderSchedaImmobile(immSavedIdx);
      // rimane in scheda-immobile
    } else if(curSection==='scheda-cliente' && D.schedaCliIdx!==null){
      renderSchedaCliente(D.schedaCliIdx);
      go('scheda-cliente');
    } else {
      // immobili o qualsiasi altra sezione → rimane in immobili
      renderImmobili();
    }
    updateBadges();
    /* ─── MATCH PROATTIVO: solo su immobile NUOVO, mostra i clienti compatibili ─── */
    try{
      if(_immEraNuovo && typeof window.mostraMatchProattivo === 'function'){
        setTimeout(function(){ window.mostraMatchProattivo(immSavedIdx, true); }, 500);
      }
    }catch(_mp){ console.warn('[MatchProattivo] KO:', _mp); }
  }catch(err){alert('Errore salvataggio immobile: '+err.message);console.error(err);}
}
// ---- Incarico detail modal in calendar ----
function showIncaricoDetail(immIdx){
  const im=D.immobili[immIdx];
  if(!im) return;
  // Build a mini popup inside the day-list area
  const el=document.getElementById('cal-day-list');
  if(!el) return;
  const scadColor=im.incFine&&im.incFine<today()?'var(--red-l)':'var(--orange)';
  el.innerHTML=`
    <div style="border-radius:10px;overflow:hidden;border:1.5px solid ${scadColor};background:white">
      ${im.foto?`<img src="${im.foto}" style="width:100%;height:140px;object-fit:cover;display:block">`
        :`<div style="width:100%;height:80px;background:linear-gradient(135deg,#EFF6FF,#DBEAFE);display:flex;align-items:center;justify-content:center;font-size:2.5rem"></div>`}
      <div style="padding:14px 16px">
        <div style="font-size:0.7rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${scadColor};margin-bottom:4px">
           SCADENZA INCARICO — ${fmtD(im.incFine)}
        </div>
        <div style="font-weight:800;font-size:1rem;margin-bottom:6px">${im.tipo||'Immobile'} — ${im.comune||''}</div>
        <div style="font-size:0.82rem;color:var(--text3);margin-bottom:10px">
          ${im.zona?' '+im.zona+'<br>':''}
          ${im.indirizzo?' '+im.indirizzo+'<br>':''}
          ${im.contatto?' Proprietario: '+im.contatto+(im.telefono?' ·  '+im.telefono:'')+'<br>':''}
          ${im.mq?' '+im.mq+'m²':''} ${im.camere?'· '+im.camere+' cam':''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          ${im.prezzo?`<span style="background:#EFF6FF;color:var(--brand);font-weight:700;border-radius:6px;padding:4px 10px;font-size:0.88rem">${fmtE(im.prezzo)}</span>`:''}
          ${im.conferimento?`<span style="background:#FFFBEB;color:var(--gold);border-radius:6px;padding:4px 10px;font-size:0.8rem">${im.conferimento}</span>`:''}
          ${im.incPerc?`<span style="background:#F0FDF4;color:var(--green);border-radius:6px;padding:4px 10px;font-size:0.8rem">Prov. ${im.incPerc}%</span>`:''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" style="flex:1" onclick="openSchedaImmobile(${immIdx})"> Apri Scheda</button>
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="openImmobileModal(${immIdx})"> Modifica</button>
        </div>
      </div>
    </div>`;
}

// =========================================================
// SCADENZARIO INCARICHI
// =========================================================
// ---- ARCHIVIAZIONE IMMOBILE ----
/* _archiviaIdx dichiarata in cima al modulo (stato locale) */
function archiviaImmobile(i){
  const im=D.immobili[i];
  if(!im){dlgAlert('Immobile non trovato.','','Errore');return;}
  if((im.stato||'')==='archiviato'||(im.stato||'')==='non attivo'){
    dlgAlert('Questo immobile è già archiviato.','ℹ️','Già archiviato');return;
  }
  if((im.stato||'')==='venduto'){
    dlgAlert('Un immobile venduto non può essere archiviato manualmente.','ℹ️','Stato venduto');return;
  }
  _archiviaIdx=i;
  // Popola info immobile nel modal
  const info=document.getElementById('archivia-imm-info');
  if(info) info.innerHTML=`
    <div style="display:flex;align-items:center;gap:12px">
      ${im.foto?`<img src="${im.foto}" style="width:64px;height:48px;object-fit:cover;border-radius:7px;flex-shrink:0">`:'<div style="width:64px;height:48px;background:#F1F5F9;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0"></div>'}
      <div>
        <div style="font-weight:800;font-size:0.95rem">${im.tipo||'Immobile'}${im.comune?' — '+im.comune:''}</div>
        <div style="font-size:0.78rem;color:var(--text3);margin-top:2px">Ref. ${im.ref||i} · ${im.contatto||'—'}</div>
        <div style="font-size:0.78rem;color:var(--brand);font-weight:700;margin-top:2px">${im.prezzo?fmtE(im.prezzo):''}</div>
      </div>
    </div>
    ${im.incFine?`<div style="margin-top:10px;font-size:0.78rem;padding:6px 10px;background:${im.incFine<today()?'#FEF2F2':'#FFFBEB'};border-radius:6px;color:${im.incFine<today()?'var(--red-l)':'var(--orange)'}">
       Scadenza incarico: <strong>${fmtD(im.incFine)}</strong>${im.incFine<today()?' —  già scaduto':''}</div>`:''}`;
  // Pre-seleziona motivo in base alla scadenza
  const motivoSel=document.getElementById('archivia-motivo');
  if(motivoSel) motivoSel.value=im.incFine&&im.incFine<today()?'scadenza':'';
  document.getElementById('archivia-data').value=today();
  document.getElementById('archivia-note').value='';
  openModal('modal-archivia');
}
function salvaArchiviazione(){
  if(_archiviaIdx===null) return;
  const motivo=document.getElementById('archivia-motivo').value;
  if(!motivo){dlgAlert('Seleziona un motivo per l\'archiviazione.','','Motivo obbligatorio');return;}
  const im=D.immobili[_archiviaIdx];
  if(!im) return;
  const data=document.getElementById('archivia-data').value||today();
  const note=document.getElementById('archivia-note').value||'';
  const motivoLabel={
    scadenza:'Scadenza incarico non rinnovato',disdetta:'Disdetta contratto cliente',
    revoca:'Revoca incarico',ritiro:'Ritiro dal mercato',altro:'Altro'
  }[motivo]||motivo;
  // Archivia: imposta stato e salva storico
  im.stato='archiviato';
  im._archiviaData=data;
  im._archiviaMotivo=motivoLabel;
  im._archiviaNota=note;
  // Rimuovi eventuali pratiche attive collegate
  D.pratiche=D.pratiche.filter(p=>{
    if(String(p.immRef)===String(_archiviaIdx)&&p.stato==='proposta'){
      return false; // rimuovi proposta collegata
    }
    return true;
  });
  // Rimuovi scadenza incarico dallo scadenzario
  D.eventi=D.eventi.filter(e=>!(e._immIdx===_archiviaIdx&&e._type==='incarico'));

  // ── Archivia automatico cliente se non gli restano più immobili attivi ──
  let cliArchiviato=null;
  let cliRefIdx=null;
  if(im.clienteRef!==undefined&&im.clienteRef!==null&&im.clienteRef!==''){
    cliRefIdx=parseInt(im.clienteRef);
  } else if(im.contatto){
    const found=D.clienti.findIndex(c=>c.nome===im.contatto);
    if(found>=0) cliRefIdx=found;
  }
  if(cliRefIdx!==null && cliRefIdx>=0){
    const cli=D.clienti[cliRefIdx];
    if(cli && !cli.archiviato){
      const statiChiusi=['venduto','archiviata','revoca','vendita','archiviato','affittato'];
      const altriAttivi=D.immobili.filter((other,oi)=>{
        if(oi===_archiviaIdx) return false;
        if(statiChiusi.includes((other.stato||'').toLowerCase())) return false;
        if(other.clienteRef!==undefined&&other.clienteRef!==null&&other.clienteRef!=='') return parseInt(other.clienteRef)===cliRefIdx;
        return other.contatto && other.contatto===cli.nome;
      });
      if(altriAttivi.length===0){
        cli.archiviato=true;
        cli._archiviatoMotivo='Ultimo immobile attivo archiviato';
        cliArchiviato=cli.nome;
      }
    }
  }

  saveD();
  closeModal('modal-archivia');

  /* Controlli periodici scadenzario (ogni 4 mesi per 1 anno) per
     ricordarsi di verificare se l'immobile è ancora sul mercato o
     è stato venduto nel frattempo. */
  try{
    if(typeof _aggiungiControlliArchiviazione==='function'){
      _aggiungiControlliArchiviazione(im, _archiviaIdx);
    }
  }catch(_e){}

  renderImmobili();
  renderIncarichi();
  renderPratiche();
  if(cliArchiviato && typeof renderClienti==='function') renderClienti();
  updateBadges();
  if(cliArchiviato)
    showToast(` Immobile archiviato + cliente "${cliArchiviato}" archiviato (nessun immobile attivo)`,'','');
  else
    showToast(` Immobile "${im.tipo||''}${im.comune?' — '+im.comune:''}" archiviato — ora in Non Attivi`,'','');
  _archiviaIdx=null;
}
function riattiviaImmobile(i){
  const im=D.immobili[i];
  if(!im) return;
  dlgConfirm(
    `Riattivare "${im.tipo||'Immobile'}${im.comune?' — '+im.comune:''}"?\nTornerà in stato Attivo e riapparirà nel portafoglio.`,
    '','Riattiva Immobile'
  ).then(ok=>{
    if(!ok) return;
    im.stato='attivo';
    delete im._archiviaData; delete im._archiviaMotivo; delete im._archiviaNota;

    /* Rimuovi eventuali controlli scadenzario ancora da fare per questo
       immobile (creati alla precedente archiviazione) — non ha senso
       ricontrollare "è ancora sul mercato?" un immobile appena riattivato. */
    try{
      if(D.eventi){
        D.eventi = D.eventi.filter(function(e){
          return !(e && e._archImmIdx===i && String(e._tag||'').indexOf('_controlloArchiviazione_i'+i+'_')===0);
        });
      }
    }catch(_e){}

    // Riattiva cliente collegato se era stato archiviato automaticamente
    let cliRiattivato=null;
    let cliRefIdx=null;
    if(im.clienteRef!==undefined&&im.clienteRef!==null&&im.clienteRef!==''){
      cliRefIdx=parseInt(im.clienteRef);
    } else if(im.contatto){
      cliRefIdx=D.clienti.findIndex(c=>c.nome===im.contatto);
    }
    if(cliRefIdx!==null&&cliRefIdx>=0){
      const cli=D.clienti[cliRefIdx];
      if(cli && cli.archiviato && cli._archiviatoMotivo==='Ultimo immobile attivo archiviato'){
        cli.archiviato=false;
        delete cli._archiviatoMotivo;
        cliRiattivato=cli.nome;
      }
    }
    saveD();
    renderImmobili();
    renderIncarichi();
    if(cliRiattivato && typeof renderClienti==='function') renderClienti();
    updateBadges();
    if(cliRiattivato)
      showToast(` Immobile riattivato + cliente "${cliRiattivato}" ripristinato`,'','');
    else
      showToast(` Immobile riattivato — ora visibile nel portafoglio`,'','');
  });
}
function archiviaImmobileFromScheda(i){archiviaImmobile(i);}

function delImmobile(i){
  if(!hasPermission('immobili.delete')){ if(typeof showToast==='function') showToast('Eliminazione non consentita per il tuo ruolo','','#DC2626'); return; }
  const im=D.immobili[i];
  if(!im) return;
  const nVis=D.visite.filter(v=>parseInt(v.immRef)===i).length;
  const nEv=D.eventi.filter(e=>e._immIdx===i && e._type==='incarico').length;
  let msg=`Eliminare l'immobile "${im.tipo||'Immobile'} — ${im.comune||''}"?`;
  const parts=[];
  if(nVis>0) parts.push(`${nVis} visita/e registrate`);
  if(nEv>0) parts.push(`${nEv} scadenza/e nello scadenzario`);
  if(parts.length) msg+=`\n\nVerranno eliminate automaticamente: ${parts.join(', ')}.`;
  if(!confirm(msg)) return;
  // FIX STRUTTURALE: rimuovi scritture contabili collegate (provv/NF/fatture)
  // PRIMA dello splice, e aggiungi alla blocklist anti-resurrezione cloud.
  _purgeScrittureDiImmobile(i, im);
  _blocklistImmobile(im);
  D.visite=D.visite.filter(v=>parseInt(v.immRef)!==i);
  D.eventi=D.eventi.filter(e=>!(e._immIdx===i && e._type==='incarico'));
  D.pratiche=D.pratiche.filter(p=>String(p.immRef)!==String(i));
  D.immobili.splice(i,1);
  reindexAfterImmSplice(i);
  saveD();
  if(typeof _msoprForcePushImmobili==='function') _msoprForcePushImmobili();
  renderImmobili();
}
function delImmobileFromScheda(i){
  if(!hasPermission('immobili.delete')){ if(typeof showToast==='function') showToast('Eliminazione non consentita per il tuo ruolo','','#DC2626'); return; }
  const im=D.immobili[i];
  if(!im) return;
  const nVis=D.visite.filter(v=>parseInt(v.immRef)===i).length;
  const nEv=D.eventi.filter(e=>e._immIdx===i && e._type==='incarico').length;
  const nPrat=D.pratiche.filter(p=>String(p.immRef)===String(i)).length;
  let msg=`Eliminare definitivamente l'immobile <strong>"${im.tipo||'Immobile'} — ${im.comune||''}"</strong>?`;
  const parts=[];
  if(nVis>0) parts.push(`${nVis} visita/e registrate`);
  if(nEv>0) parts.push(`${nEv} scadenza/e nello scadenzario`);
  if(nPrat>0) parts.push(`${nPrat} pratica/e collegate`);
  if(parts.length) msg+=`<br><br> Verranno eliminate automaticamente: ${parts.join(', ')}.`;
  msg+='<br><br>Questa operazione non è reversibile.';
  dlgConfirm(msg,'','Elimina Immobile').then(ok=>{
    if(!ok) return;
    // FIX STRUTTURALE: rimuovi scritture contabili collegate + blocklist
    _purgeScrittureDiImmobile(i, im);
    _blocklistImmobile(im);
    D.visite=D.visite.filter(v=>parseInt(v.immRef)!==i);
    D.eventi=D.eventi.filter(e=>!(e._immIdx===i && e._type==='incarico'));
    D.pratiche=D.pratiche.filter(p=>String(p.immRef)!==String(i));
    D.immobili.splice(i,1);
    reindexAfterImmSplice(i);
    saveD();
    if(typeof _msoprForcePushImmobili==='function') _msoprForcePushImmobili();
    updateBadges();
    // Torna sempre alla lista immobili — schedaCliIdx può essere impostato
    // da una visita precedente alla scheda cliente ma non deve condizionare la nav
    renderImmobili();
    go('immobili');
  });
}
function setImView(v){D.imView=v;renderImmobili();}
function resetImmFiltri(){
  var ids=['f-imm-q','f-imm-tipo','f-imm-inc','f-imm-prezzo-min','f-imm-prezzo-max','f-imm-mq-min','f-imm-camere','f-imm-energia','f-imm-citta','f-imm-zona','f-imm-agente','f-imm-val-min','f-imm-salute'];
  ids.forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  /* Reset con default: attivo + prezzo desc */
  var stato=document.getElementById('f-imm-stato');if(stato)stato.value='attivo';
  var sortEl=document.getElementById('f-imm-sort');if(sortEl)sortEl.value='prezzo_desc';
  var pills=document.querySelectorAll('#imm-stato-pills .stato-pill');
  pills.forEach(function(p){
    p.classList.remove('active');
    if(p.dataset.stato==='attivo') p.classList.add('active');
  });
  renderImmobili();
}
function toggleImmFiltriPanel(){
  var panel=document.getElementById('imm-filtri-panel');
  var btn=document.getElementById('imm-panel-btn');
  if(!panel)return;
  var open=panel.style.display==='none'||panel.style.display==='';
  panel.style.display=open?'block':'none';
  if(btn){
    btn.style.borderColor=open?'#2563EB':'';
    btn.style.color=open?'#2563EB':'';
    btn.style.background=open?'#EFF6FF':'';
  }
}

function setImmFilter(which){ renderImmobili(); }
var _immDefaultsSet=false;
function _initImmDefaults(){
  /* Imposta i valori di default al primo caricamento della sezione:
     stato = "attivo", ordinamento = "prezzo dal più alto" */
  if(_immDefaultsSet) return;
  _immDefaultsSet=true;
  const hid=document.getElementById('f-imm-stato');
  const sortEl=document.getElementById('f-imm-sort');
  if(hid){
    hid.value='attivo';
    const pills=document.querySelectorAll('#imm-stato-pills .stato-pill');
    pills.forEach(function(p){
      p.classList.remove('active');
      if(p.dataset.stato==='attivo') p.classList.add('active');
    });
  }
  if(sortEl){
    sortEl.value='prezzo_desc';
  }
}
function setImmStatoPill(btn){
  document.querySelectorAll('.stato-pill').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  const hid=document.getElementById('f-imm-stato');
  if(hid) hid.value=btn.dataset.stato==='all'?'':btn.dataset.stato;
  renderImmobili();
}
function updatePillCounts(){
  const counts={all:0,attivo:0,proposta:0,venduto:0,'non-attivo':0};
  D.immobili.forEach((im,ri)=>{
    const st=(im.stato||'').toLowerCase();
    const pratIm=D.pratiche.find(p=>parseInt(p.immRef)===ri);
    const hasProp=D.pratiche.some(p=>String(p.immRef)===String(ri)&&p.stato==='proposta');
    const isArchiviato=st==='archiviato'||st==='non attivo'||pratIm?.stato==='revoca';
    const isVenduto=(st==='venduto'||st==='affittato')&&!isArchiviato;
    const isProposta=hasProp&&!isVenduto&&!isArchiviato;
    const isAttivo=!isVenduto&&!isArchiviato&&!isProposta;
    counts.all++;
    if(isAttivo) counts.attivo++;
    else if(isProposta) counts.proposta++;
    else if(isVenduto) counts.venduto++;
    else counts['non-attivo']++;
  });
  Object.entries(counts).forEach(([k,n])=>{
    const el=document.getElementById('pc-'+k);
    if(el) el.textContent=n>0?'('+n+')':'';
  });
}
// ── Dropdown anteprima foto nella ricerca immobili ──────────────────────────
function immSearchDropdown(q){
  var dd = document.getElementById('imm-search-dropdown');
  if(!dd) return;
  q = (q||'').toLowerCase().trim();
  if(!q){ dd.style.display='none'; return; }
  var matches = D.immobili.map(function(im,i){ return {im:im,i:i}; }).filter(function(x){
    var t = [x.im.contatto,x.im.comune,x.im.zona,x.im.tipo,String(x.im.ref||''),x.im.indirizzo||''].join(' ').toLowerCase();
    return t.includes(q);
  }).slice(0,8);
  if(!matches.length){ dd.style.display='none'; return; }
  dd.innerHTML = matches.map(function(x){
    var im=x.im, i=x.i;
    var foto = im.foto
      ? '<img src="'+im.foto+'" style="width:52px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0" loading="lazy">'
      : '<div style="width:52px;height:40px;background:#F1F5F9;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#CBD5E1"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div>';
    var stato = (im.stato||'').toLowerCase();
    var statoColor = stato==='venduto'?'#7C3AED':stato==='archiviato'?'#94A3B8':'#16A34A';
    var statoLabel = stato==='venduto'?'Venduto':stato==='archiviato'?'Archiviato':'Attivo';
    var hoverIn="this.style.background='#EFF6FF'", hoverOut="this.style.background='white'";
    return '<div onmousedown="immSearchSelect('+i+')" style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;transition:background .1s;border-bottom:1px solid #F1F5F9" onmouseover="'+hoverIn+'" onmouseout="'+hoverOut+'">'
      + foto
      + '<div style="flex:1;min-width:0">'
        + '<div style="font-weight:700;font-size:0.85rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(im.tipo||'Immobile')+' — '+(im.comune||'')+(im.zona?' · '+im.zona:'')+'</div>'
        + '<div style="font-size:0.72rem;color:var(--text3);margin-top:2px;display:flex;align-items:center;gap:8px">'
          + '<span style="color:var(--brand);font-weight:700">'+(im.prezzo?'€'+Number(im.prezzo).toLocaleString('it-IT'):'Prezzo n.d.')+'</span>'
          + '<span style="color:'+statoColor+';font-weight:600;font-size:0.65rem">'+statoLabel+'</span>'
          + (im.mq?'<span>'+im.mq+'m²</span>':'')
          + (im.camere?'<span>'+im.camere+' cam</span>':'')
        + '</div>'
      + '</div>'
      + '<div style="font-size:0.68rem;color:var(--text4);flex-shrink:0">Ref. '+(im.ref||i)+'</div>'
    +'</div>';
  }).join('');
  dd.style.display='block';
}
function immSearchSelect(idx){
  var im = D.immobili[idx];
  if(!im) return;
  var inp = document.getElementById('f-imm-q');
  if(inp) inp.value = (im.tipo||'')+(im.comune?' — '+im.comune:'');
  immSearchHide();
  renderImmobili();
  // Apri subito la scheda
  setTimeout(function(){ openSchedaImmobile(idx); }, 100);
}
function immSearchHide(){
  var dd = document.getElementById('imm-search-dropdown');
  if(dd) dd.style.display='none';
}
// ─────────────────────────────────────────────────────────────────────────────


function renderImmobili(){
  try{ _injectFotoCache(); }catch(e){}
  window._immSaluteCache = {}; /* var globale del monolite: in un ES module (strict) va scritta via window. Ricalcola la salute a ogni render */
  if(typeof _initImmDefaults==='function') _initImmDefaults();
  updatePillCounts();
  const q=_norm(document.getElementById('f-imm-q').value||'');
  const tipo=document.getElementById('f-imm-tipo').value;
  const statoFiltro=(document.getElementById('f-imm-stato')?.value||'').toLowerCase();
  const inc=document.getElementById('f-imm-inc').value;
  const agenteFiltro=document.getElementById('f-imm-agente')?.value||'';
  const prezzoMin=parseFloat(document.getElementById('f-imm-prezzo-min')?.value||'')||null;
  const prezzoMax=parseFloat(document.getElementById('f-imm-prezzo-max')?.value||'')||null;
  const mqMin=parseFloat(document.getElementById('f-imm-mq-min')?.value||'')||null;
  const camereFiltro=document.getElementById('f-imm-camere')?.value||'';
  const energiaFiltro=(document.getElementById('f-imm-energia')?.value||'').toLowerCase();
  const saluteFiltro=(document.getElementById('f-imm-salute')?.value||'');
  const cittaFiltro=_norm(document.getElementById('f-imm-citta')?.value||'').trim();
  const zonaFiltro=_norm(document.getElementById('f-imm-zona')?.value||'').trim();
  const valMinFiltro=parseInt(document.getElementById('f-imm-val-min')?.value||'')||null;
  const sortFiltro=document.getElementById('f-imm-sort')?.value||'comune';
  // Populate agente select
  (function(){
    const sel=document.getElementById('f-imm-agente');if(!sel)return;
    const cur=sel.value;
    sel.innerHTML='<option value="">Tutti gli agenti</option>';
    (D.agenti||[]).forEach(function(a,i){
      if(a.nome){var o=document.createElement('option');o.value=String(i);o.textContent=a.nome;sel.appendChild(o);}
    });
    sel.value=cur;
  })();
  const f=D.immobili.filter(im=>{
    const t=_norm([im.contatto,im.comune,im.zona,im.tipo,String(im.ref||'')].join(' '));
    const st=(im.stato||'').toLowerCase();
    const ri=D.immobili.indexOf(im);
    const pratIm=D.pratiche.find(p=>parseInt(p.immRef)===ri);
    const hasProp=D.pratiche.some(p=>String(p.immRef)===String(ri)&&(p.stato==='proposta'));
    const isArchiviato=st==='archiviato'||st==='non attivo'||pratIm?.stato==='revoca';
    const isVenduto=(st==='venduto'||st==='affittato')&&!isArchiviato;
    const isAttivo=!isVenduto&&!isArchiviato&&!hasProp;
    const isProposta=hasProp&&!isVenduto&&!isArchiviato;
    let statoOk=true;
    if(statoFiltro==='attivo') statoOk=isAttivo;
    else if(statoFiltro==='proposta') statoOk=isProposta;
    else if(statoFiltro==='venduto') statoOk=isVenduto;
    else if(statoFiltro==='archiviato'||statoFiltro==='non-attivo') statoOk=isArchiviato;
    const agenteOk=!agenteFiltro||String(im.agenteRef)===agenteFiltro;
    const prezzoIm=parseFloat(im.prezzo)||null;
    const prezzoOk=(!prezzoMin||prezzoIm===null||prezzoIm>=prezzoMin)&&(!prezzoMax||prezzoIm===null||prezzoIm<=prezzoMax);
    const mqOk=!mqMin||(parseFloat(im.mq)||0)>=mqMin;
    const camereVal=parseInt(im.camere)||0;
    const camereOk=!camereFiltro||(camereFiltro==='5'?camereVal>=5:camereVal===parseInt(camereFiltro));
    const energiaOk=!energiaFiltro||(im.energia||'').toLowerCase()===energiaFiltro;
    const cittaOk=!cittaFiltro||_norm(im.comune||'').includes(cittaFiltro);
    const zonaOk=!zonaFiltro||_norm(im.zona||'').includes(zonaFiltro);
    const valIm=parseFloat(im.valutazione)||0;
    const valOk=!valMinFiltro||(valMinFiltro===1?valIm>0:valIm>=valMinFiltro);
    let saluteOk=true;
    if(saluteFiltro){
      const sk=(immSalute(ri)||{}).key||'';
      if(saluteFiltro==='attenzione_critica') saluteOk=(sk==='critico'||sk==='riposizionare'||sk==='attenzione');
      else saluteOk=(sk===saluteFiltro);
    }
    return(!q||t.includes(q))&&(!tipo||(im.tipo||'').includes(tipo))&&statoOk&&(!inc||(im.incarico||'').toLowerCase()===inc)&&agenteOk&&prezzoOk&&mqOk&&camereOk&&energiaOk&&cittaOk&&zonaOk&&valOk&&saluteOk;
  }).sort((a,b)=>{
    if(sortFiltro==='comune') return (a.comune||'').localeCompare(b.comune||'','it',{sensitivity:'base'});
    if(sortFiltro==='comune_desc') return (b.comune||'').localeCompare(a.comune||'','it',{sensitivity:'base'});
    if(sortFiltro==='prezzo_asc') return (parseFloat(a.prezzo)||0)-(parseFloat(b.prezzo)||0);
    if(sortFiltro==='prezzo_desc') return (parseFloat(b.prezzo)||0)-(parseFloat(a.prezzo)||0);
    if(sortFiltro==='val_desc') return (parseFloat(b.valutazione)||0)-(parseFloat(a.valutazione)||0);
    if(sortFiltro==='val_asc') return (parseFloat(a.valutazione)||0)-(parseFloat(b.valutazione)||0);
    if(sortFiltro==='mq_desc') return (parseFloat(b.mq)||0)-(parseFloat(a.mq)||0);
    if(sortFiltro==='mq_asc') return (parseFloat(a.mq)||0)-(parseFloat(b.mq)||0);
    if(sortFiltro==='salute_critica'||sortFiltro==='salute_forte'){
      // gravità: critico(0) → riposizionare(1) → attenzione(2) → normale(3) → forte(4) → trattativa(5) → venduto(6)
      const rank={critico:0,riposizionare:1,attenzione:2,normale:3,forte:4,trattativa:5,venduto:6};
      const ra=rank[(immSalute(D.immobili.indexOf(a))||{}).key]; const rb=rank[(immSalute(D.immobili.indexOf(b))||{}).key];
      const va=(ra===undefined?99:ra), vb=(rb===undefined?99:rb);
      return sortFiltro==='salute_critica' ? va-vb : vb-va;
    }
    return (a.comune||'').localeCompare(b.comune||'','it',{sensitivity:'base'});
  });
  /* Aggiorna badge e contatore filtri attivi */
  (function(){
    const ids=['f-imm-q','f-imm-tipo','f-imm-inc','f-imm-citta','f-imm-zona','f-imm-agente','f-imm-prezzo-min','f-imm-prezzo-max','f-imm-mq-min','f-imm-camere','f-imm-energia','f-imm-val-min','f-imm-salute'];
    const statoEl=document.getElementById('f-imm-stato');
    let n=0;
    ids.forEach(function(id){var el=document.getElementById(id);if(el&&el.value&&el.value!=='')n++;});
    if(statoEl&&statoEl.value)n++;
    const badge=document.getElementById('imm-filtri-badge');
    if(badge){badge.textContent=n;badge.style.display=n>0?'inline-block':'none';}
    const panBtn=document.getElementById('imm-panel-btn');
    if(panBtn){panBtn.style.borderColor=n>0?'#2563EB':'';panBtn.style.color=n>0?'#2563EB':'';panBtn.style.background=n>0?'#EFF6FF':'';}
    const cnt2=document.getElementById('imm-filtri-count');
    if(cnt2){const tot=D.immobili.length;cnt2.textContent=f.length+' immobili trovati su '+tot+' totali'+(n>0?' · '+n+' filtro/i attiv'+(n===1?'o':'i'):'');}
  })();

  const cnt=document.getElementById('imm-container');
  if(!f.length){cnt.innerHTML='<div class="card"><div class="card-body"><div class="empty-state"><div class="empty-icon">🏠</div><p>Nessun immobile. Clicca <strong>+ Aggiungi</strong>!</p></div></div></div>';return;}

  /* SVG icons */
  const icoEye='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const icoEdit='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const icoLink='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>';
  const icoWa='<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.866 9.866 0 001.51 5.26l.602.961-.999 3.648 3.736-.964zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>';
  const icoVis='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

  if(D.imView==='grid'){
    cnt.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px">'+f.map(im=>{
      const ri=D.immobili.indexOf(im);
      const nVisite=D.visite.filter(v=>v.immRef==ri).length;
      const waText=encodeURIComponent((im.tipo||'Immobile')+' — '+(im.comune||'')+(im.prezzo?' — '+im.prezzo.toLocaleString('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}):'')+'\n'+(im.linkPortale||''));
      return`<div class="imm-card">
        <div style="position:relative;cursor:pointer" onclick="openSchedaImmobile(${ri})">
          ${immPhotoWithStato(im,ri,null)}
          ${valutazioneMini(im.valutazione)}
        </div>
        <div class="imm-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            ${bStato(im.stato)}
            <span class="badge badge-blue" style="font-size:0.68rem">${im.incarico||''}</span>
          </div>
          ${(function(){var b=immSaluteBadge(ri);return b?('<div style="margin-bottom:6px">'+b+'</div>'):'';})()}
          <div class="imm-price" style="cursor:pointer" onclick="openSchedaImmobile(${ri})">${im.prezzo?fmtE(im.prezzo):'—'}</div>
          <div style="font-size:0.78rem;color:var(--text3);margin-top:3px;line-height:1.5">
            ${im.tipo||''}<br>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${im.comune||''}${im.zona?' · '+im.zona:''}<br>
            ${im.mq?`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> ${im.mq}m² `:''}${im.camere?`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg> ${im.camere} cam`:''}
          </div>
          ${im.energia?`<span class="badge badge-gold" style="font-size:0.65rem;margin-top:5px">Classe ${im.energia}</span>`:''}
          <div style="display:flex;gap:6px;margin-top:8px;font-size:0.75rem;color:var(--text3);padding-top:6px;border-top:1px solid var(--border);align-items:center">
            ${icoVis} <span>${nVisite} visite</span>
          </div>
          <div class="actions-col" style="margin-top:8px">
            <button class="icon-btn btn-sm" onclick="openSchedaImmobile(${ri})" title="Scheda">${icoEye} Scheda</button>
            <button class="icon-btn btn-sm" onclick="openImmobileModal(${ri})" title="Modifica">${icoEdit}</button>
            ${im.linkPortale
              ?`<a href="${im.linkPortale}" target="_blank" rel="noopener" class="icon-btn btn-sm" title="Apri portale" style="color:var(--brand);text-decoration:none">${icoLink}</a>`
              :`<span class="icon-btn btn-sm" style="color:var(--text4);opacity:0.35;cursor:default" title="Nessun link portale">${icoLink}</span>`}
            ${im.linkPortale
              ?`<a href="https://wa.me/?text=${waText}" target="_blank" rel="noopener" class="icon-btn btn-sm" title="Condividi WhatsApp" style="color:#25D366;text-decoration:none">${icoWa}</a>`
              :`<span class="icon-btn btn-sm" style="color:var(--text4);opacity:0.35;cursor:default" title="Inserisci link portale per condividere">${icoWa}</span>`}
          </div>
        </div>
      </div>`;
    }).join('')+'</div>';
  }else{
    cnt.innerHTML='<div class="card"><div class="table-wrap"><table><thead><tr><th>Foto</th><th>Ref.</th><th>Tipo</th><th>Stato</th><th>Salute</th><th>Inc.</th><th>Prezzo</th><th>Mq</th><th>Cam.</th><th>Classe E.</th><th>Comune</th><th>Visite</th><th>Proprietario</th><th>Tel.</th><th></th></tr></thead><tbody>'+f.map(im=>{
      const ri=D.immobili.indexOf(im);
      const nVisite=D.visite.filter(v=>v.immRef==ri).length;
      const waText=encodeURIComponent((im.tipo||'Immobile')+' — '+(im.comune||'')+(im.prezzo?' — '+im.prezzo.toLocaleString('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}):'')+'\n'+(im.linkPortale||''));
      return`<tr>
        <td>${im.foto?`<img src="${im.foto}" class="photo-thumb" loading="lazy">`:`<div style="width:40px;height:30px;background:#F1F5F9;border-radius:5px;display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div>`}</td>
        <td style="color:var(--text3);font-size:0.78rem">${im.ref||'—'}</td>
        <td style="font-weight:600">${im.tipo||'—'}</td>
        <td>${bStato(im.stato)}</td>
        <td>${(function(){var b=immSaluteBadge(ri,{dotOnly:true});return b||'—';})()}</td>
        <td><span class="badge badge-blue">${im.incarico||'—'}</span></td>
        <td style="font-weight:700">${im.prezzo?fmtE(im.prezzo):'—'}</td>
        <td>${im.mq?im.mq+'m²':'—'}</td>
        <td>${im.camere||'—'}</td>
        <td>${im.energia?`<span class="badge badge-gold">${im.energia}</span>`:'—'}</td>
        <td>${im.comune||'—'}</td>
        <td><span class="badge badge-blue">${nVisite}</span></td>
        <td>${im.contatto||'—'}</td>
        <td>${im.telefono?`<a href="tel:${im.telefono}" style="color:var(--brand)">${im.telefono}</a>`:'—'}</td>
        <td><div class="actions-col">
          <button class="icon-btn" onclick="openSchedaImmobile(${ri})" title="Scheda">${icoEye}</button>
          <button class="icon-btn" onclick="openImmobileModal(${ri})" title="Modifica">${icoEdit}</button>
          <button class="icon-btn" style="color:var(--text4);opacity:0.35;cursor:default" title="Elimina dalla scheda">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
          ${im.linkPortale?`<a href="${im.linkPortale}" target="_blank" rel="noopener" class="icon-btn" title="Apri portale" style="color:var(--brand);text-decoration:none">${icoLink}</a>`:`<span class="icon-btn" style="color:var(--text4);opacity:0.35;cursor:default">${icoLink}</span>`}
          ${im.linkPortale?`<a href="https://wa.me/?text=${waText}" target="_blank" rel="noopener" class="icon-btn" title="Condividi WhatsApp" style="color:#25D366;text-decoration:none">${icoWa}</a>`:`<span class="icon-btn" style="color:var(--text4);opacity:0.35;cursor:default">${icoWa}</span>`}
        </div></td>
      </tr>`;
    }).join('')+'</tbody></table></div></div>';
  }
}

function openSchedaImmobile(i){
  D.reportImmIdx=i;
  D.editIdx=null; D.editType=null;  // reset: scheda è vista, non edit
  renderSchedaImmobile(i);
  go('scheda-immobile');
}
function renderDistanze(im){
  const dist=im.distanze||{};
  const items=Object.entries(dist).filter(function(e){return e[1]>0;});
  if(!items.length) return '';
  const icons={mare:'',centro:'',stazione:'',scuole:'',banca:'',supermercato:'',chiesa:'',farmacia:'',posta:'',ospedale:'',stadio:''};
  const labels={mare:'Mare',centro:'Centro',stazione:'Stazione',scuole:'Scuole',banca:'Banca',supermercato:'Supermercato',chiesa:'Chiesa',farmacia:'Farmacia',posta:'Posta',ospedale:'Ospedale',stadio:'Stadio'};
  var pills='';
  items.sort(function(a,b){return a[1]-b[1];}).forEach(function(entry){
    var k=entry[0],v=entry[1];
    var km=v>=1000;
    var vFmt=km?(v/1000).toFixed(1)+' km':v+' m';
    var col=km||v>800?'#64748B':v>200?'#B45309':'#15803D';
    var bg=km||v>800?'#F8FAFC':v>200?'#FFFBEB':'#F0FDF4';
    var border=km||v>800?'#E2E8F0':v>200?'#FDE68A':'#BBF7D0';
    pills+='<div style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:'+bg+';border:1px solid '+border+';border-radius:20px"><span style="font-size:12px">'+(icons[k]||'')+'</span><span style="font-size:0.78rem;font-weight:700;color:var(--text)">'+(labels[k]||k)+'</span><span style="font-size:0.72rem;color:'+col+';font-weight:600">'+vFmt+'</span></div>';
  });
  return '<div style="grid-column:1/-1"><div class="flabel"> Distanze dai Servizi</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">'+pills+'</div></div>';
}

function renderSchedaImmobile(i){
  const im=D.immobili[i];if(!im){go('immobili');return;}
  /* Migrazione lazy: se questa foto è ancora base64, accodala per l'upload
     in background. Non blocca il rendering: la foto base64 resta visibile
     finché Storage non ha completato l'upload e saveD non ha persistito l'URL. */
  try{
    if(window._storageReady && window._fotoStorage){
      var _key = im.ref || im.uuid;
      var _hasB64 = window._fotoStorage.isBase64Foto(im.foto) ||
                    (Array.isArray(im.foto) && im.foto.some(window._fotoStorage.isBase64Foto));
      if(_key && _hasB64) window._fotoStorage.enqueue(_key);
    }
  }catch(_){}
  document.getElementById('ph-simm-title').textContent='Scheda: '+(im.tipo||'Immobile')+' '+im.comune;
  const visite=D.visite.filter(v=>parseInt(v.immRef)===i).sort((a,b)=>(a.data||'').localeCompare(b.data||''));
  const esiti={POSITIVO:0,RIFIUTATO:0,'IN ATTESA':0,SCONOSCIUTO:0};
  visite.forEach(v=>{ const e=(v.esito||'').toUpperCase();if(esiti[e]!==undefined)esiti[e]++;});
  const pIdx=D.pratiche.findIndex(p=>parseInt(p.immRef)===i);
  const prat=pIdx>=0?D.pratiche[pIdx]:null;
  const stato=calcolaStatoImmobile(i);
  const bc=badgeStatoImmobile(stato);
  // Giorni sul mercato
  const ggMercato=im.dataIns?Math.floor((new Date()-new Date(im.dataIns+'T00:00:00'))/86400000):null;
  const ggCol=ggMercato>180?'#DC2626':ggMercato>90?'#D97706':'#15803D';
  // Docs
  const docs=im.docsChecklist||{};
  const docsOk=DOCS_LABELS.filter((_,ix)=>docs[ix]===true).length;
  const docsPct=Math.round(docsOk/DOCS_LABELS.length*100);

  // SVG icons
  const icoEdit='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const icoMap='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>';
  const icoPdf='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  const icoArchive='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
  const icoDel='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
  const icoPlus='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  const icoEye='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

  // Helper: render a row label+value
  const row=(label,val,full)=>val?`<div${full?' style="grid-column:1/-1"':''}><div class="flabel">${label}</div><div style="font-size:0.88rem;margin-top:2px">${val}</div></div>`:'';
  const chip=(val,color='var(--text2)',bg='var(--bg3)')=>val?`<span style="display:inline-flex;align-items:center;padding:3px 9px;border-radius:6px;background:${bg};color:${color};font-size:0.79rem;font-weight:600">${val}</span>`:'—';

  document.getElementById('scheda-imm-body').innerHTML=`

    ${(im.stato||'')==='archiviato'?`
    <div style="background:linear-gradient(135deg,#FFF7ED,#FFEDD5);border:2px solid #FED7AA;border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:10px">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
        <div>
          <div style="font-weight:800;color:#92400E;font-size:0.92rem">Immobile Archiviato — Non Attivo</div>
          ${im._archiviaMotivo?`<div style="font-size:0.8rem;color:#B45309">Motivo: ${im._archiviaMotivo}${im._archiviaData?' · '+fmtD(im._archiviaData):''}</div>`:''}
        </div>
      </div>
      <button class="btn btn-sm" style="background:linear-gradient(135deg,#059669,#10B981);color:white;border:none;font-weight:700;flex-shrink:0" onclick="riattiviaImmobile(${i})">${icoPlus} Riattiva</button>
    </div>`:''}

    <!-- ═══ HERO HEADER ═══ -->
    <div style="display:flex;gap:16px;margin-bottom:18px;align-items:flex-start;flex-wrap:wrap">
      <!-- Foto -->
      <div style="width:200px;flex-shrink:0;border-radius:12px;overflow:hidden;box-shadow:var(--shadow-lg);border:1.5px solid var(--border);background:#F1F5F9;height:140px;display:flex;align-items:center;justify-content:center">
        ${im.foto?`<img src="${im.foto}" style="width:100%;height:140px;object-fit:cover;display:block">`
          :`<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`}
      </div>
      <!-- Info principale -->
      <div style="flex:1;min-width:220px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">
          <div>
            <div style="font-size:1.3rem;font-weight:900;color:var(--text);line-height:1.2;margin-bottom:4px">${im.tipo||'Immobile'} — ${im.comune||''}${im.zona?' <span style="font-weight:500;font-size:1rem;color:var(--text3)">· '+im.zona+'</span>':''}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:0.71rem;font-weight:800;text-transform:uppercase;letter-spacing:0.4px;background:${bc.bg};color:${bc.color};border:1px solid ${bc.border}">${bc.icon} ${bc.label}</span>
              ${immSaluteBadge(i)}
              <span class="badge badge-blue">${im.incarico||'—'}</span>
              ${im.conferimento==='in esclusiva'?'<span class="badge badge-gold">Esclusiva</span>':''}
              ${im.ref?`<span class="badge badge-gray">Ref. ${im.ref}</span>`:''}
            </div>
          </div>
          <!-- Pulsanti azione -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px">
            <button class="btn btn-outline" style="font-size:0.92rem;padding:9px 18px;font-weight:700;display:inline-flex;align-items:center;gap:7px;border-radius:10px" onclick="openImmobileModal(${i})">${icoEdit} Modifica</button>
            <button class="btn btn-outline" style="font-size:0.92rem;padding:9px 18px;font-weight:700;display:inline-flex;align-items:center;gap:7px;border-radius:10px" onclick="apriMappa(${i})">${icoMap} Mappa</button>
            <button class="btn" style="background:linear-gradient(135deg,#1A7A4A,#22C55E);color:white;border:none;font-weight:700;font-size:0.92rem;padding:9px 18px;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 4px 14px rgba(34,197,94,.35)" onclick="if(typeof mostraMatchProattivo==='function')mostraMatchProattivo(${i},false)" title="Trova i clienti in archivio che cercano un immobile come questo"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> Cerca clienti</button>
            <button class="btn" style="background:linear-gradient(135deg,#2563EB,#3B82F6);color:white;border:none;font-weight:700;font-size:0.92rem;padding:9px 18px;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 4px 14px rgba(37,99,235,.35)" onclick="if(typeof reportProprietario==='function')reportProprietario(${i})" title="Genera un report di visite e feedback da inviare al proprietario"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Report</button>
            <button class="btn" style="background:linear-gradient(135deg,#7C3AED,#8B5CF6);color:white;border:none;font-weight:700;font-size:0.92rem;padding:9px 18px;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 4px 14px rgba(124,58,237,.35)" onclick="brochureImmobile(${i})" title="Genera una brochure professionale stampabile di questo immobile">${icoPdf} Brochure</button>
            <button class="btn" style="background:#F5F3FF;color:#7C3AED;border:2px solid #C4B5FD;font-size:0.92rem;padding:9px 18px;font-weight:700;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:7px" onclick="showImmQR(${i})" title="Genera QR code del link al portale"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/><rect x="14" y="18" width="3" height="3" style="display:none"/></svg> QR Code</button>
            ${(im.stato||'')==='archiviato'
              ?`<button class="btn" style="background:linear-gradient(135deg,#059669,#10B981);color:white;border:none;font-size:0.92rem;padding:9px 18px;font-weight:700;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:7px" onclick="riattiviaImmobile(${i})">${icoPlus} Riattiva</button>`
              :`<button class="btn" style="background:#FFF7ED;color:#C2410C;border:2px solid #FED7AA;font-size:0.92rem;padding:9px 18px;font-weight:700;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:7px" onclick="archiviaImmobile(${i})">${icoArchive} Archivia</button>`}
            <button class="btn" style="background:#FEE2E2;color:#DC2626;border:2px solid #FECACA;font-size:0.92rem;padding:9px 18px;font-weight:700;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:7px" onclick="delImmobileFromScheda(${i})" title="Elimina immobile">${icoDel} Elimina</button>
          </div>
        </div>
        <!-- KPI row -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:8px 14px;min-width:80px">
            <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text4)">Prezzo</div>
            <div style="font-size:1.1rem;font-weight:900;color:var(--brand);margin-top:1px">${im.prezzo?fmtE(im.prezzo):'—'}</div>
          </div>
          ${im.mq?`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:8px 14px">
            <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text4)">Superficie</div>
            <div style="font-size:1.05rem;font-weight:800;color:var(--text);margin-top:1px">${im.mq} m²</div>
          </div>`:''}
          ${im.camere?`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:8px 14px">
            <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text4)">Camere</div>
            <div style="font-size:1.05rem;font-weight:800;color:var(--text);margin-top:1px">${im.camere}</div>
          </div>`:''}
          ${ggMercato!==null?`<div style="background:var(--bg2);border:1px solid var(--border);border-top:3px solid ${ggCol};border-radius:10px;padding:8px 14px">
            <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text4)">Sul mercato</div>
            <div style="font-size:1.05rem;font-weight:800;color:${ggCol};margin-top:1px">${ggMercato} gg</div>
          </div>`:''}
          <div style="background:var(--bg2);border:1px solid var(--border);border-top:3px solid ${docsPct===100?'#15803D':docsPct>50?'#D97706':'#DC2626'};border-radius:10px;padding:8px 14px">
            <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text4)">Documenti</div>
            <div style="font-size:1.05rem;font-weight:800;color:${docsPct===100?'#15803D':docsPct>50?'#D97706':'#DC2626'};margin-top:1px">${docsPct}%</div>
          </div>
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:8px 14px">
            <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text4)">Visite</div>
            <div style="font-size:1.05rem;font-weight:800;color:var(--text);margin-top:1px">${visite.length}</div>
          </div>
          ${im.valutazione?`<div style="background:var(--bg2);border:1px solid var(--border);border-top:3px solid ${getValColor(im.valutazione>10?im.valutazione:im.valutazione*10).bg};border-radius:10px;padding:8px 14px">
            <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text4)">Vendibilità</div>
            <div style="font-size:1.05rem;font-weight:800;color:${getValColor(im.valutazione>10?im.valutazione:im.valutazione*10).bg};margin-top:1px">${im.valutazione>10?im.valutazione:im.valutazione*10}%</div>
          </div>`:''}
        </div>
      </div>
    </div>

    <!-- ═══ TABS ═══ -->
    <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:18px;overflow-x:auto" id="simm-tabs">
      ${[['info','Immobile'],['proprietario','Proprietario'],['incarico','Incarico'],['docs','Documenti'],['pratica','Pratica'],['visite','Visite ('+visite.length+')']].map(([k,l],ti)=>`
        <div onclick="simmTab('${k}')" id="simm-tab-${k}" style="padding:9px 16px;cursor:pointer;font-size:0.86rem;font-weight:600;color:${ti===0?'var(--brand)':'var(--text3)'};border-bottom:${ti===0?'2':'0'}px solid var(--brand);margin-bottom:-2px;white-space:nowrap;transition:all .15s"
          onmouseover="if(document.getElementById('simm-tab-${k}').style.borderBottomWidth!='2px')this.style.color='var(--text)'"
          onmouseout="if(document.getElementById('simm-tab-${k}').style.borderBottomWidth!='2px')this.style.color='var(--text3)'">${l}</div>
      `).join('')}
    </div>

    <!-- ── TAB: IMMOBILE ── -->
    <div id="simm-panel-info">
      <div class="grid-2" style="gap:14px">
        <div class="card" style="margin:0">
          <div class="card-header"><span class="card-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> Caratteristiche</span></div>
          <div class="card-body">
            <div class="grid-2" style="gap:8px">
              ${row('Tipo',im.tipo)}
              ${row('Stato condizioni',im.condizioni)}
              ${row('Anno costruzione',im.anno)}
              ${row('Classe energetica',im.energia?`<span class="badge badge-gold">${im.energia}</span>`:'')}
              ${row('Superficie totale',im.mq?im.mq+' m²':'')}
              ${row('Locali / Camere',[im.locali,im.camere].filter(Boolean).join(' / '))}
              ${row('Bagni',im.bagni)}
              ${row('Cucina',im.cucina)}
              ${row('Piano',im.piano)}
              ${row('N° piani edificio',im.pianiTot)}
              ${row('Esposizione',im.esposizione)}
              ${row('Riscaldamento',im.riscaldamento)}
              ${row('Ascensore',im.ascensore)}
            </div>
          </div>
        </div>
        <div class="card" style="margin:0">
          <div class="card-header"><span class="card-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Extra & Dotazioni</span></div>
          <div class="card-body">
            <div class="grid-2" style="gap:8px">
              ${row('Vista / Mare',im.mare)}
              ${row('Garage / Box',im.garage)}
              ${row('Terrazza / Balcone',im.terrazza)}
              ${row('Giardino',im.giardino?im.giardino+' m²':'')}
              ${row('Piscina',im.piscina)}
              ${row('Arredato',im.arredato)}
              ${row('Spese condominio',im.speseCondominio?'€ '+im.speseCondominio+'/mese':'')}
              ${im.condominio==='si'&&(im['cond-unita']||im['cond-amm'])?`
              <div style="grid-column:1/-1;background:#EFF6FF;border-radius:8px;padding:10px 12px;border:1px solid #BFDBFE">
                <div style="font-size:0.68rem;font-weight:800;color:#1D4ED8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Condominio</div>
                <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.82rem">
                  ${im['cond-unita']?`<span><span style="color:#64748B">Unità:</span> <strong>${im['cond-unita']}</strong></span>`:''}
                  ${im['cond-scale']?`<span><span style="color:#64748B">Scale:</span> <strong>${im['cond-scale']}</strong></span>`:''}
                  ${im['cond-amm']?`<span><span style="color:#64748B">Amm.:</span> <strong>${im['cond-amm']}</strong>${im['cond-amm-tel']?` <a href="tel:${im['cond-amm-tel']}" style="color:var(--brand)">${im['cond-amm-tel']}</a>`:''}</span>`:''}
                </div>
              </div>`:''}
            </div>
            ${renderDistanze(im)}
          </div>
        </div>
      </div>
      ${im.indirizzo||im.zona?`<div class="card" style="margin-top:14px"><div class="card-body" style="padding:12px 16px">
        <div style="display:flex;align-items:center;gap:8px;font-size:0.88rem">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <strong>${im.comune||''}${im.zona?' — '+im.zona:''}${im.indirizzo?' · '+im.indirizzo:''}</strong>
          <button class="btn btn-outline btn-sm" onclick="apriMappa(${i})" style="margin-left:auto">${icoMap} Vedi mappa</button>
        </div>
      </div></div>`:''}
      ${im.descrizione?`<div class="card" style="margin-top:14px"><div class="card-header"><span class="card-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Descrizione Pubblicitaria</span></div><div class="card-body"><div style="font-size:0.88rem;line-height:1.7;color:var(--text2);white-space:pre-wrap">${im.descrizione}</div></div></div>`:''}
      ${im.note?`<div class="card" style="margin-top:14px;border-left:4px solid var(--orange)"><div class="card-body" style="padding:12px 16px"><div style="font-size:0.7rem;font-weight:800;color:var(--orange);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26A7 7 0 0112 2z"/></svg> Note private</div><div style="font-size:0.88rem;color:var(--text2)">${im.note}</div></div></div>`:''}
    </div>

    <!-- ── TAB: PROPRIETARIO ── -->
    <div id="simm-panel-proprietario" style="display:none">
      <div class="card">
        <div class="card-header"><span class="card-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Dati Proprietario</span>
          ${im.telefono?`<a href="https://wa.me/39${(im.telefono||'').replace(/[^0-9]/g,'')}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#25D366;color:white;border:none;font-size:0.78rem;display:inline-flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.866 9.866 0 001.51 5.26l.602.961-.999 3.648 3.736-.964zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg> WhatsApp</a>`:''}
        </div>
        <div class="card-body">
          <div class="grid-2" style="gap:12px">
            ${row('Intestatario principale',`<span style="font-weight:700;font-size:0.95rem">${im.contatto||'—'}</span>${im.provenienza?` <span style="padding:2px 8px;border-radius:8px;background:#EDE9FE;color:#6D28D9;font-size:0.7rem;font-weight:700">${im.provenienza}</span>`:''}`)}
            ${row('Telefono',im.telefono?`<a href="tel:${im.telefono}" style="color:var(--brand);font-weight:600">${im.telefono}</a>`:'')}
            ${row('Email',im.email?`<a href="mailto:${im.email}" style="color:var(--brand)">${im.email}</a>`:'')}
          </div>
          ${(im.coIntestari&&im.coIntestari.length)?`
          <div style="margin-top:14px">
            <div class="flabel" style="margin-bottom:8px">Co-intestatari / Eredi</div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${im.coIntestari.map(x=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:#F5F3FF;border-radius:8px;border:1px solid #DDD6FE">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span style="font-size:0.85rem;font-weight:600;color:#4C1D95">${x.nome}</span>
                ${x.tel?`<a href="tel:${x.tel}" style="font-size:0.78rem;color:#6D28D9;margin-left:4px">${x.tel}</a>`:''}
                ${x.nascita?`<span style="font-size:0.74rem;color:#7C3AED;margin-left:4px;display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/></svg>${fmtD(x.nascita)}</span>`:''}
              </div>`).join('')}
            </div>
          </div>`:''}
        </div>
      </div>
    </div>

    <!-- ── TAB: INCARICO ── -->
    <div id="simm-panel-incarico" style="display:none">
      <div class="grid-2" style="gap:14px">
        <div class="card" style="margin:0">
          <div class="card-header"><span class="card-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> Dati Incarico</span></div>
          <div class="card-body">
            <div class="grid-2" style="gap:8px">
              ${row('Tipo incarico',`<span class="badge badge-blue">${im.incarico||'—'}</span>`)}
              ${row('Conferimento',`<span class="badge ${im.conferimento==='in esclusiva'?'badge-gold':'badge-gray'}">${im.conferimento||'—'}</span>`)}
              ${row('Data inizio',im.incInizio?fmtD(im.incInizio):'')}
              ${row('Data scadenza',im.incFine?`<span style="font-weight:700;color:${im.incFine<today()?'var(--red-l)':'var(--green-l)'}">${fmtD(im.incFine)}${im.incFine<today()?' — SCADUTO':''}</span>`:'')}
              ${row('Inserimento scheda',im.dataIns?fmtD(im.dataIns):'')}
              ${im.prezzoStorico&&im.prezzoStorico.length?`<div style="grid-column:1/-1">
                <div class="flabel">Storico prezzi</div>
                <div style="margin-top:5px;display:flex;flex-direction:column;gap:3px">
                  ${im.prezzoStorico.map((s,si)=>`<div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:4px 0;border-bottom:1px solid var(--border)">
                    <span style="color:var(--text3)">${fmtD(s.data)} — ${s.motivo||'Variazione'}</span>
                    <strong style="color:var(--brand)">${fmtE(s.prezzo)}</strong>
                  </div>`).join('')}
                </div>
              </div>`:''}
            </div>
          </div>
        </div>
        <div class="card" style="margin:0">
          <div class="card-header"><span class="card-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> Provvigione & Marketing</span></div>
          <div class="card-body">
            <div class="grid-2" style="gap:8px">
              ${row('Provvigione %',im.incPerc?im.incPerc+'%':'')}
              ${row('Provvigione importo',im.incImp?fmtE(im.incImp):'')}
              ${im.linkPortale?`<div style="grid-column:1/-1">
                <div class="flabel">Link annuncio</div>
                <div style="margin-top:5px;display:flex;gap:8px;flex-wrap:wrap">
                  <a href="${im.linkPortale}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#EFF6FF;border:1.5px solid #93C5FD;border-radius:8px;color:#1D4ED8;font-size:0.82rem;font-weight:700;text-decoration:none">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Apri annuncio
                  </a>
                  <button onclick="showImmQR(${i})" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#F5F3FF;border:1.5px solid #C4B5FD;border-radius:8px;color:#7C3AED;font-size:0.82rem;font-weight:700;cursor:pointer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg> QR Code</button>
                  <a href="https://wa.me/?text=${encodeURIComponent((im.tipo||'Immobile')+' — '+(im.comune||'')+(im.prezzo?' — '+im.prezzo.toLocaleString('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}):'')+'\n'+im.linkPortale)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#F0FDF4;border:1.5px solid #86EFAC;border-radius:8px;color:#15803D;font-size:0.82rem;font-weight:700;text-decoration:none">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> WhatsApp
                  </a>
                </div>
              </div>`:''}
            </div>
            ${im.mkt&&Object.values(im.mkt).some(v=>v===true)?`
            <div style="margin-top:14px">
              <div class="flabel" style="margin-bottom:8px">Piano marketing attivo</div>
              <div style="display:flex;flex-wrap:wrap;gap:5px">
                ${[['cartelloImm','Cartello immobile'],['cartelloAg','Bacheca agenzia'],['cartella','Cartella docs'],['openHouse','Open House'],['immobiliare','Immobiliare.it'],['idealista','Idealista'],['casait','Casa.it'],['subito','Subito.it'],['trovacasa','TrovaCasa'],['tecnocasa','Sito agenzia'],['facebook','Facebook'],['instagram','Instagram'],['whatsapp','WhatsApp'],['newsletter','Newsletter'],['giornalino','Giornalino'],['volantini','Volantini'],['passaparola','Passaparola'],['vetrina','Vetrina']].filter(([k])=>im.mkt[k]).map(([k,l])=>`<span style="padding:3px 9px;border-radius:8px;background:#EFF6FF;color:#1D4ED8;font-size:0.75rem;font-weight:700;border:1px solid #BFDBFE">✓ ${l}</span>`).join('')}
              </div>
              ${im.mkt.note?`<div style="margin-top:8px;font-size:0.82rem;color:var(--text3);font-style:italic">${im.mkt.note}</div>`:''}
            </div>`:''}
          </div>
        </div>
      </div>
    </div>

    <!-- ── TAB: DOCUMENTI ── -->
    <div id="simm-panel-docs" style="display:none">
      ${(()=>{
        const docs2=im.docsChecklist||{};
        const mancanti2=DOCS_LABELS.map((l,ix)=>({label:l,ok:docs2[ix]===true})).filter(d=>!d.ok);
        const raccolti2=DOCS_LABELS.length-mancanti2.length;
        const pct2=Math.round(raccolti2/DOCS_LABELS.length*100);
        const CATS=['Catasto','Catasto','Catasto','Urbanistica','Energia','Urbanistica','Catasto','Civile','Condominio','Condominio','Ipoteche','Urbanistica','Urbanistica','Ipoteche'];
        const CAT_COLORS={Catasto:'#BFDBFE',Urbanistica:'#99F6E4',Energia:'#FDE68A',Civile:'#DDD6FE',Condominio:'#FEF08A',Ipoteche:'#FBCFE8'};
        const CAT_TEXT={Catasto:'#1D4ED8',Urbanistica:'#065F46',Energia:'#92400E',Civile:'#5B21B6',Condominio:'#713F12',Ipoteche:'#831843'};
        if(mancanti2.length===0) return `<div class="card"><div class="card-body" style="padding:20px 16px;display:flex;align-items:center;gap:14px">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <div><div style="font-weight:800;color:#15803D;font-size:1rem">Tutti i documenti raccolti!</div>
          <div style="font-size:0.82rem;color:var(--text3)">Documentazione completa per la vendita.</div></div>
        </div></div>`;
        const urgenti=mancanti2.filter(d=>{const oi=DOCS_LABELS.indexOf(d.label);return[0,1,2,4,13].includes(oi);});
        const altri=mancanti2.filter(d=>!urgenti.includes(d));
        return `<div class="card">
          <div class="card-header">
            <span class="card-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/></svg> Stato Documentazione</span>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="background:${pct2===100?'#DCFCE7':pct2>=60?'#FEF3C7':'#FEE2E2'};color:${pct2===100?'#15803D':pct2>=60?'#D97706':'#DC2626'};padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:800">${pct2}% — ${raccolti2}/${DOCS_LABELS.length}</div>
              <button class="btn btn-primary btn-sm" onclick="openImmobileModal(${i})">${icoEdit} Aggiorna</button>
            </div>
          </div>
          <div class="card-body">
            <div style="height:6px;background:#E2E8F0;border-radius:3px;overflow:hidden;margin-bottom:16px">
              <div style="height:100%;width:${pct2}%;background:linear-gradient(90deg,${pct2===100?'#10B981':'#EF4444'},${pct2===100?'#34D399':'#F97316'});border-radius:3px;transition:width .4s"></div>
            </div>
            ${urgenti.length>0?`
            <div style="font-size:0.68rem;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#DC2626;margin-bottom:6px;display:flex;align-items:center;gap:5px">
              <span style="width:6px;height:6px;background:#DC2626;border-radius:50%;display:inline-block"></span> Priorità alta (${urgenti.length})
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:14px">
              ${urgenti.map(d=>{const oi=DOCS_LABELS.indexOf(d.label);const cat=CATS[oi]||'—';const cc=CAT_COLORS[cat]||'#E2E8F0';const ct=CAT_TEXT[cat]||'#374151';return`<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:white;border:1.5px solid #FECACA;border-left:3px solid #EF4444;border-radius:7px">
                <span style="flex:1;font-size:0.77rem;font-weight:600;color:#1E293B">${d.label}</span>
                <span style="font-size:0.6rem;font-weight:700;padding:2px 6px;border-radius:8px;background:${cc};color:${ct};white-space:nowrap">${cat}</span>
              </div>`;}).join('')}
            </div>`:''}
            ${altri.length>0?`
            <div style="font-size:0.68rem;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#64748B;margin-bottom:6px;display:flex;align-items:center;gap:5px">
              <span style="width:6px;height:6px;background:#94A3B8;border-radius:50%;display:inline-block"></span> Altri documenti (${altri.length})
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
              ${altri.map(d=>{const oi=DOCS_LABELS.indexOf(d.label);const cat=CATS[oi]||'—';const cc=CAT_COLORS[cat]||'#E2E8F0';const ct=CAT_TEXT[cat]||'#374151';return`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:white;border:1px solid #E2E8F0;border-radius:7px">
                <span style="flex:1;font-size:0.76rem;font-weight:500;color:#475569">${d.label}</span>
                <span style="font-size:0.6rem;font-weight:700;padding:2px 6px;border-radius:8px;background:${cc};color:${ct};white-space:nowrap;opacity:.85">${cat}</span>
              </div>`;}).join('')}
            </div>`:''}
          </div>
        </div>`;
      })()}
    </div>

    <!-- ── TAB: PRATICA ── -->
    <div id="simm-panel-pratica" style="display:none">
      ${(()=>{
        const stateColors={acquisizione:'var(--brand)',proposta:'var(--orange)',vendita:'var(--green-l)',revoca:'var(--red-l)'};
        const stateLabels={acquisizione:'Acquisizione',proposta:'Proposta in corso',vendita:'Vendita / Rogito',revoca:'Revoca Mandato'};
        return `<div class="card">
          <div class="card-header">
            <span class="card-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Gestione Pratica</span>
            <button class="btn btn-primary btn-sm" onclick="openPraticaImm(${i})">${prat?icoEdit+' Modifica':icoPlus+' Nuova Pratica'}</button>
          </div>
          <div class="card-body">
          ${prat?`
            <div style="display:inline-flex;align-items:center;gap:8px;background:${stateColors[prat.stato]||'var(--brand)'}18;border:1.5px solid ${stateColors[prat.stato]||'var(--brand)'};border-radius:20px;padding:6px 14px;margin-bottom:16px">
              <div style="width:8px;height:8px;border-radius:50%;background:${stateColors[prat.stato]||'var(--brand)'}"></div>
              <span style="font-size:0.86rem;font-weight:700;color:${stateColors[prat.stato]||'var(--brand)'}">${stateLabels[prat.stato]||prat.stato}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:0.82rem;margin-bottom:14px">
              <div style="background:var(--bg3);border-radius:8px;padding:10px 12px">
                <div style="color:var(--text4);font-size:0.68rem;text-transform:uppercase;font-weight:700;margin-bottom:3px">Venditore</div>
                <div style="font-weight:600">${prat.venditore||'—'}</div>
                ${prat.telV?`<a href="tel:${prat.telV}" style="font-size:0.78rem;color:var(--brand)">${prat.telV}</a>`:''}
              </div>
              <div style="background:var(--bg3);border-radius:8px;padding:10px 12px">
                <div style="color:var(--text4);font-size:0.68rem;text-transform:uppercase;font-weight:700;margin-bottom:3px">Acquirente</div>
                <div style="font-weight:600">${prat.acquirente||'—'}</div>
                ${prat.telA?`<a href="tel:${prat.telA}" style="font-size:0.78rem;color:var(--brand)">${prat.telA}</a>`:''}
              </div>
              <div style="background:var(--bg3);border-radius:8px;padding:10px 12px">
                <div style="color:var(--text4);font-size:0.68rem;text-transform:uppercase;font-weight:700;margin-bottom:3px">Prezzo richiesto</div>
                <div style="font-weight:700;color:var(--brand)">${prat.prezzoRich?fmtE(prat.prezzoRich):'—'}</div>
              </div>
              <div style="background:var(--bg3);border-radius:8px;padding:10px 12px">
                <div style="color:var(--text4);font-size:0.68rem;text-transform:uppercase;font-weight:700;margin-bottom:3px">Provvigione</div>
                <div style="font-weight:700;color:var(--gold-l)">${(prat.qv||prat.qa)?fmtE((parseFloat(prat.qv)||0)+(parseFloat(prat.qa)||0)):'—'}</div>
              </div>
            </div>
            ${prat.stato==='proposta'?`<div style="padding:10px 14px;background:#FFF7ED;border:1px solid #FDE68A;border-radius:8px;font-size:0.84rem">
              <strong>Proposta del ${prat.dprop?fmtD(prat.dprop):'—'}</strong> · Importo: ${prat.importoProp?fmtE(prat.importoProp):'—'} · Caparra: ${prat.caparra?fmtE(prat.caparra):'—'}
              ${prat.clausole?`<div style="margin-top:4px;color:var(--text3);font-style:italic">${prat.clausole}</div>`:''}
            </div>`:''}
            ${prat.stato==='vendita'?`<div style="padding:10px 14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;font-size:0.84rem">
              <strong>Rogito: ${prat.drogito?fmtD(prat.drogito):'—'}</strong> · Notaio: ${prat.notaio||'—'} ${prat.sedeRogito?'· '+prat.sedeRogito:''}<br>
              Incassato: ${prat.inc?fmtE(prat.inc):'—'} / Da incassare: ${prat.residuo?fmtE(prat.residuo):'—'}
            </div>`:''}
          `:`<div class="empty-state" style="padding:20px">
            <div class="empty-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
            <p>Nessuna pratica aperta.<br><small>Clicca <strong>+ Nuova Pratica</strong> per iniziare.</small></p>
          </div>`}
          </div>
        </div>`;
      })()}
    </div>

    <!-- ── TAB: VISITE ── -->
    <div id="simm-panel-visite" style="display:none">
      <div class="card">
        <div class="card-header">
          <span class="card-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Storico Visite</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="openReportVisite(${i})">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Report
            </button>
            <button class="btn btn-primary btn-sm" onclick="openVisitaForImm(${i})">${icoPlus} Aggiungi Visita</button>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          <!-- Mini stats -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-bottom:1px solid var(--border)">
            ${[['Totali',visite.length,'var(--brand)'],['Positive',esiti.POSITIVO,'var(--green-l)'],['Rifiutate',esiti.RIFIUTATO,'var(--red-l)'],['In Attesa',esiti['IN ATTESA'],'var(--orange)']].map(([l,n,c])=>`
            <div style="padding:12px 14px;text-align:center;border-right:1px solid var(--border)">
              <div style="font-size:1.5rem;font-weight:900;color:${c};line-height:1">${n}</div>
              <div style="font-size:0.68rem;font-weight:700;color:var(--text4);text-transform:uppercase;margin-top:3px">${l}</div>
            </div>`).join('')}
          </div>
          <div class="table-wrap">
            <table><thead><tr><th>#</th><th>Data</th><th>Ora</th><th>Cliente</th><th>Telefono</th><th>Esito</th><th>Feedback</th><th>Note</th><th></th></tr></thead>
            <tbody>${visite.length?visite.map((v,idx)=>{const ri=D.visite.indexOf(v);return`<tr>
              <td style="color:var(--text3)">${idx+1}</td>
              <td>${fmtD(v.data)}</td>
              <td>${v.ora||'—'}</td>
              <td style="font-weight:600">${v.cliente||'—'}</td>
              <td>${v.tel?`<a href="tel:${v.tel}" style="color:var(--brand)">${v.tel}</a>`:'—'}</td>
              <td>${bEsito(v.esito)}</td>
              <td><span class="badge badge-gray" style="font-size:0.68rem">${v.feedback||'—'}</span></td>
              <td class="note-cell">${v.note||'—'}</td>
              <td><div class="actions-col">
                <button class="icon-btn" onclick="editVisita(${ri})" title="Modifica">${icoEdit}</button>
                <button class="icon-btn" onclick="delVisita(${ri})" style="color:var(--red-l)" title="Elimina">${icoDel}</button>
              </div></td>
            </tr>`;}).join(''):'<tr><td colspan="9"><div class="empty-state" style="padding:16px"><p>Nessuna visita registrata</p></div></td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    <div id="tl-host-immobile-${i}" style="margin-top:14px"></div>
  `;
  /* Monto la timeline audit dopo l'iniezione */
  try{ _tlMount('immobile', i); }catch(_e){ }

  // Attiva funzione tab
  window.simmTab=function(k){
    ['info','proprietario','incarico','docs','pratica','visite'].forEach(id=>{
      const panel=document.getElementById('simm-panel-'+id);
      const tab=document.getElementById('simm-tab-'+id);
      if(panel) panel.style.display=id===k?'block':'none';
      if(tab){tab.style.color=id===k?'var(--brand)':'var(--text3)';tab.style.borderBottom=id===k?'2px solid var(--brand)':'0';}
    });
  };
}

// ===== REPORT VISITE =====

// ════════════════════════════════════════════════════════════════════
//  BROCHURE IMMOBILE — generazione brochure professionale stampabile/PDF
//  Ricostruita nel modulo dopo che il refactoring aveva lasciato orfano il
//  riferimento brochureImmobile() (chiamato dal pulsante "Brochure" della
//  scheda immobile ma non più definito → "Cannot read properties of null").
//  Legge l'immobile da D.immobili[i] e apre una finestra stampabile.
//  Layout fedele al modello: header agenzia + badge contratto, foto,
//  titolo/comune/rif/descrizione, box superficie/locali/bagni, classe
//  energetica, prezzo, QR code, footer.
// ════════════════════════════════════════════════════════════════════
function brochureImmobile(i){
  try{
    if(!window.D || !Array.isArray(D.immobili)){
      (window.dlgAlert||window.alert)('Dati immobili non disponibili. Riprova tra un istante.');
      return;
    }
    var im = D.immobili[i];
    if(!im || typeof im !== 'object'){
      (window.dlgAlert||window.alert)('Immobile non trovato.');
      return;
    }

    var esc = (window._escHtml) ? window._escHtml : function(s){
      return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    };
    var euro = (window.fmtE) ? window.fmtE : function(n){ return n!=null ? '€'+n : '—'; };

    /* Contratto: badge VENDITA/AFFITTO derivato dai campi disponibili */
    var contrRaw = String(im.contratto || im.tipoContratto || '').toLowerCase();
    var isAffitto = /affitt|locaz/.test(contrRaw) || /affitt|locaz/.test(String(im.stato||'').toLowerCase());
    var badgeContratto = isAffitto ? 'AFFITTO' : 'VENDITA';

    /* Foto: il modello ha im.foto (stringa singola). Se in futuro esiste una
       galleria (array), uso le prime per le miniature. */
    var fotoMain = im.foto || '';
    var gallery = [];
    if(Array.isArray(im.fotos)) gallery = im.fotos.filter(Boolean);
    else if(Array.isArray(im.gallery)) gallery = im.gallery.filter(Boolean);
    if(!fotoMain && gallery.length) fotoMain = gallery[0];
    var minis = gallery.filter(function(f){ return f !== fotoMain; }).slice(0,3);

    /* QR code dal link portale, se presente */
    var qrImg = '';
    try{
      if(im.linkPortale && window.qrDataUrl){
        var qd = window.qrDataUrl(im.linkPortale, 180);
        if(qd) qrImg = qd;
      }
    }catch(_e){}

    var titolo = esc(im.titolo || im.tipo || 'Immobile');
    var sottotitolo = esc([im.comune, 'Italia'].filter(Boolean).join(' '));
    var rif = im.ref ? ('Rif. ' + esc(im.ref)) : '';
    var descr = esc(im.descrizione || '');
    var prezzo = im.prezzo ? euro(im.prezzo) : 'Prezzo su richiesta';
    var locali = [im.locali, im.camere].filter(Boolean).join(' / ') || (im.locali||im.camere||'—');
    var bagni = (im.bagni!=null && im.bagni!=='') ? im.bagni : '—';
    var mq = im.mq ? (im.mq + ' m²') : '—';
    var energia = im.energia ? esc(im.energia) : '';
    var epgl = (im.epgl || im.epglnren || im.epglNren || '');

    var agenziaNome = (window.getNomeAgenzia ? window.getNomeAgenzia() : '') || 'La tua Agenzia';
    var agenziaSub  = (window.getTaglineAg ? window.getTaglineAg() : '') || '';
    var agenziaLogo = (window.getLogoAgenzia ? window.getLogoAgenzia() : '') || '';

    var html = ''
+ '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">'
+ '<title>Brochure ' + titolo + (im.ref?(' - '+esc(im.ref)):'') + '</title>'
+ '<style>'
+ '@page{size:A4;margin:0}'
+ '*{box-sizing:border-box;margin:0;padding:0}'
+ 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#1a1a2e;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
+ '.sheet{width:210mm;min-height:297mm;margin:0 auto;padding:14mm 14mm 10mm;position:relative}'
+ '.toolbar{position:fixed;top:0;left:0;right:0;background:#1e293b;padding:10px;text-align:center;z-index:99}'
+ '.toolbar button{background:#2563EB;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:0.9rem;font-weight:700;cursor:pointer;margin:0 4px}'
+ '.toolbar button.sec{background:#475569}'
+ '@media print{.toolbar{display:none}.sheet{padding:14mm}}'
+ '.brk-head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0B3C8C;padding-bottom:10px;margin-bottom:14px}'
+ '.logo{display:flex;align-items:center;gap:12px}'
+ '.logo-img{max-height:54px;max-width:150px;object-fit:contain;display:block}'
+ '.logo-box{background:#0B3C8C;color:#fff;border-radius:8px;padding:8px 16px;font-weight:900;font-size:1.6rem;letter-spacing:1px;line-height:1}'
+ '.logo-sub{font-size:0.58rem;letter-spacing:2px;color:#0B3C8C;font-weight:700;margin-top:3px;text-align:center}'
+ '.badge-contr{background:#0B3C8C;color:#fff;font-size:1.5rem;font-weight:800;letter-spacing:2px;padding:10px 38px;border-radius:4px}'
+ '.brk-body{display:grid;grid-template-columns:1fr 1fr;gap:18px}'
+ '.photo-main{width:100%;height:240px;object-fit:cover;border-radius:8px;display:block;background:#E2E8F0}'
+ '.photo-ph{width:100%;height:240px;border-radius:8px;background:#E2E8F0;display:flex;align-items:center;justify-content:center;color:#94A3B8;font-size:0.9rem}'
+ '.minis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}'
+ '.minis img{width:100%;height:72px;object-fit:cover;border-radius:6px;display:block}'
+ '.price-box{background:#0B3C8C;color:#fff;text-align:center;font-size:2.4rem;font-weight:800;padding:18px;border-radius:8px;margin-top:14px}'
+ '.brk-title{font-size:1.9rem;font-weight:800;color:#1a1a2e;line-height:1.1}'
+ '.brk-sub{font-size:1.05rem;font-weight:700;color:#334155;margin-top:4px}'
+ '.hr{border:none;border-top:1px solid #E2E8F0;margin:12px 0}'
+ '.brk-rif{font-weight:800;color:#1a1a2e;font-size:0.92rem;margin-bottom:6px}'
+ '.brk-descr{font-size:0.92rem;line-height:1.5;color:#334155}'
+ '.specs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}'
+ '.spec{border:1px solid #E2E8F0;border-radius:8px;padding:12px;text-align:center}'
+ '.spec .lab{font-size:0.62rem;letter-spacing:1px;color:#94A3B8;font-weight:700;text-transform:uppercase}'
+ '.spec .val{font-size:1.25rem;font-weight:800;color:#0B3C8C;margin-top:4px}'
+ '.bottom{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}'
+ '.energy{background:#F8FAFC;border-radius:8px;padding:14px;text-align:center}'
+ '.energy .lab{font-size:0.62rem;letter-spacing:1px;color:#64748B;font-weight:700;text-transform:uppercase}'
+ '.energy .cls{display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:#EAB308;color:#fff;font-size:1.9rem;font-weight:900;border-radius:8px;margin:8px 0 4px;clip-path:polygon(0 0,100% 0,100% 75%,50% 100%,0 75%)}'
+ '.energy .epgl{font-size:0.78rem;color:#CA8A04;font-weight:700}'
+ '.qr-box{text-align:center;padding:10px}'
+ '.qr-box .lab{font-size:0.66rem;color:#64748B;font-weight:600;margin-bottom:8px}'
+ '.qr-box img{width:130px;height:130px;display:block;margin:0 auto}'
+ '.brk-foot{position:absolute;bottom:8mm;left:14mm;right:14mm;text-align:center;font-size:0.66rem;color:#CBD5E1;border-top:1px solid #F1F5F9;padding-top:8px}'
+ '</style></head><body>'
+ '<div class="toolbar"><button onclick="window.print()">🖨 Stampa / Salva PDF</button><button class="sec" onclick="window.close()">Chiudi</button></div>'
+ '<div class="sheet">'
+ '  <div class="brk-head">'
+ '    <div class="logo">'
+      (agenziaLogo ? '<img class="logo-img" src="'+esc(agenziaLogo)+'" alt="logo">' : '')
+      '<div><div class="logo-box">' + esc(agenziaNome) + '</div>' + (agenziaSub ? '<div class="logo-sub">' + esc(agenziaSub) + '</div>' : '') + '</div>'
+    '</div>'
+ '    <div class="badge-contr">' + badgeContratto + '</div>'
+ '  </div>'
+ '  <div class="brk-body">'
+ '    <div>'
+        (fotoMain ? '<img class="photo-main" src="'+esc(fotoMain)+'">' : '<div class="photo-ph">Nessuna foto disponibile</div>')
+        (minis.length ? '<div class="minis">'+minis.map(function(f){return '<img src="'+esc(f)+'">';}).join('')+'</div>' : '')
+ '      <div class="price-box">' + prezzo + '</div>'
+ '    </div>'
+ '    <div>'
+ '      <div class="brk-title">' + titolo + '</div>'
+ '      <div class="brk-sub">' + sottotitolo + '</div>'
+ '      <hr class="hr">'
+        (rif ? '<div class="brk-rif">'+rif+'</div>' : '')
+ '      <div class="brk-descr">' + descr + '</div>'
+ '      <div class="specs">'
+ '        <div class="spec"><div class="lab">Superficie</div><div class="val">' + mq + '</div></div>'
+ '        <div class="spec"><div class="lab">Locali</div><div class="val">' + esc(locali) + '</div></div>'
+ '        <div class="spec"><div class="lab">Bagni</div><div class="val">' + esc(bagni) + '</div></div>'
+ '      </div>'
+ '      <div class="bottom">'
+          (energia
            ? '<div class="energy"><div class="lab">Classe Energetica</div><div class="cls">'+energia+'</div>'+(epgl?'<div class="epgl">EPgl,nren: '+esc(epgl)+'</div><div style="font-size:0.66rem;color:#94A3B8">kWh/m² anno</div>':'')+'</div>'
            : '<div class="energy"><div class="lab">Classe Energetica</div><div style="margin-top:14px;color:#94A3B8;font-size:0.85rem">Non specificata</div></div>')
+          (qrImg
            ? '<div class="qr-box"><div class="lab">Scopri di più sull\'immobile,<br>scansiona il QR Code</div><img src="'+qrImg+'"></div>'
            : '<div class="qr-box"><div class="lab" style="color:#CBD5E1">Aggiungi il link al portale<br>per generare il QR Code</div></div>')
+ '      </div>'
+ '    </div>'
+ '  </div>'
+ '  <div class="brk-foot">Ogni agenzia è giuridicamente e finanziariamente indipendente.</div>'
+ '</div>'
+ '</body></html>';

    var w = window.open('', '_blank');
    if(!w){
      (window.dlgAlert||window.alert)('Il browser ha bloccato la finestra. Consenti i popup per questo sito e riprova.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }catch(e){
    console.warn('[brochureImmobile] KO:', e);
    (window.dlgAlert||window.alert)('Errore nella generazione della brochure: ' + (e && e.message ? e.message : e));
  }
}

// --- BRIDGE window ---
Object.assign(window, {
  brochureImmobile,
  openImmobileModal, openImmobileModalWithClient, immAddCoInt,
  immUpdateCoIntEmpty, immGetCoInt, immSetCoInt, saveImmobile, showIncaricoDetail,
  archiviaImmobile, salvaArchiviazione, riattiviaImmobile, archiviaImmobileFromScheda,
  delImmobile, delImmobileFromScheda, setImView, resetImmFiltri, toggleImmFiltriPanel,
  setImmFilter, _initImmDefaults, setImmStatoPill, updatePillCounts, immSearchDropdown,
  immSearchSelect, immSearchHide, renderImmobili, openSchedaImmobile, renderDistanze,
  renderSchedaImmobile,
});

export { renderImmobili, openSchedaImmobile, renderSchedaImmobile, saveImmobile, delImmobile, openImmobileModal };
