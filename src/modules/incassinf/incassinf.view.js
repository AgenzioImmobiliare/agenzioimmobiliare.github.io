// modules/incassinf/incassinf.view.js — modulo Incassi NF (Non Fatturabili).
//
// Estratto dal monolite (27409-27740): addNFPagamento, _nfEditIdx, openNFModal,
// saveNF, delNF, renderIncassiNF.
//
// SYNC PRIMA NOTA: saveNF chiama pnSyncNF, delNF chiama pnRemoveBySource('nf',i).
// Questi restano nel monolite (sistema prima nota accoppiato) e sono raggiunti
// via window — il sync resta funzionante attraverso il bridge (stesso pattern
// del modulo Fatture, già verificato).
//
// _nfEditIdx è stato locale del modulo (usato solo qui).
// onProvIncassoChange NON è inclusa: riguarda le provvigioni, resta nel monolite.
//
// DIPENDENZE ESTERNE (monolite via window): payRowNFHTML, initPayWidget,
//   getPayRows, recalcPay (widget pagamenti condiviso), pnSyncNF, pnRemoveBySource
//   (sync prima nota), renderProvvigioni, openProvModal, _updateProvStats,
//   openModal, closeModal, saveD, showToast, go, updateBadges, fmtD, fmtE,
//   dlgAlert, dlgConfirm, today.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function addNFPagamento(){
  const container=document.getElementById('nf-pagamenti-list');
  if(!container) return;
  const idx=(_payCounters['nf']||0);
  _payCounters['nf']=idx+1;
  _payActive['nf']=(_payActive['nf']||[]).concat([idx]);
  const div=document.createElement('div');
  div.innerHTML=payRowNFHTML(idx,{data:today()});
  container.appendChild(div.firstElementChild);
  recalcPay('nf');
}

// ===== INCASSI NON FATTURABILI =====
let _nfEditIdx = null;
let _nfEditUuid = null;

function openNFModal(idxOrUuid){
  const idx=idxOrUuid!==undefined?(typeof idxOrUuid==='string'?D.incassiNonFatt.findIndex(x=>x&&x.uuid===idxOrUuid):idxOrUuid):undefined;
  if(idxOrUuid!==undefined && (idx===undefined || idx<0)){
    if(typeof showToast==='function') showToast('Incasso non trovato (forse aggiornato altrove). Aggiorno la lista...','','#DC2626');
    try{ renderIncassiNF(); }catch(e){}
    return;
  }
  _nfEditIdx = idx!==undefined ? idx : null;
  if(idx!==undefined){
    if(!D.incassiNonFatt[idx].uuid) D.incassiNonFatt[idx].uuid=(typeof genUUID==='function')?genUUID():('nf_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
    _nfEditUuid=D.incassiNonFatt[idx].uuid;
  } else {
    _nfEditUuid=null;
  }
  // Reset completo prima di qualsiasi caricamento
  ['nf-cliente','nf-descr','nf-note','nf-fatt-rif'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.value='';el.removeAttribute('data-raw');}
  });
  document.getElementById('nf-data').value = today();
  document.getElementById('nf-tipo').value = '';
  document.getElementById('nf-stato').value = 'Da Fatturare';
  // Popola select immobili
  const immSel = document.getElementById('nf-imm-ref');
  if(immSel){
    immSel.innerHTML = '<option value="">-- Nessuno --</option>'+
      D.immobili.map((im,i)=>`<option value="${i}">(${im.ref||i}) ${im.tipo||''} — ${im.comune||''}</option>`).join('');
    immSel.value = '';
  }
  document.getElementById('mt-nf').textContent = idx!==undefined ? 'Modifica Incasso NF' : 'Nuovo Incasso Non Fatturabile';
  if(idx!==undefined){
    const n=D.incassiNonFatt[idx];
    if(!n){ openModal('modal-nf'); return; }
    // Carica ogni campo esplicitamente
    const setV=(id,val)=>{const el=document.getElementById(id);if(el){el.value=val||'';el.removeAttribute('data-raw');}};
    setV('nf-data', n.data||today());
    setV('nf-cliente', n.cliente||'');
    setV('nf-tipo', n.tipo||'');
    setV('nf-descr', n.descr||'');
    setV('nf-stato', n.stato||'Da Fatturare');
    setV('nf-fatt-rif', n.fattRif||'');
    setV('nf-note', n.note||'');
    if(immSel && n.immRef!==undefined && n.immRef!=='') immSel.value = n.immRef;
    // Blocca immobile se NF da provvigione
    const isAutoNFImm=(n.note||'').includes('Auto da Provvigioni');
    if(immSel){
      if(isAutoNFImm){
        immSel.setAttribute('disabled','');
        immSel.style.background='var(--bg3)';
        immSel.style.color='var(--brand)';
        immSel.style.fontWeight='700';
        immSel.title='Immobile impostato automaticamente dalla provvigione';
      } else {
        immSel.removeAttribute('disabled');
        immSel.style.background='';
        immSel.style.color='';
        immSel.style.fontWeight='';
        immSel.title='';
      }
    }
    initPayWidget('nf', n.pagamenti||[]);
    recalcPay('nf');
    // Se NF auto da provvigione: mostra dati agente nel banner
    const isAutoNF=(n.note||'').includes('Auto da Provvigioni');
    const banner=document.getElementById('nf-prov-banner');
    const infoEl=document.getElementById('nf-prov-info');
    const gotoBtn=document.getElementById('nf-prov-goto');
    if(isAutoNF && banner && infoEl){
      const m=(n.descr||'').match(/Prov#(\d+)/);
      const pvIdx=m?parseInt(m[1])-1:-1;
      const pv=pvIdx>=0?D.provvigioni[pvIdx]:null;
      if(pv){
        const agNome=pv.agenteIdx!==undefined&&D.agenti[pv.agenteIdx]?D.agenti[pv.agenteIdx].nome:'—';
        const righe=(pv.modAgenteRighe||[]);
        const rigNF=righe.filter(r=>r.dest==='nf'||r.dest==='entrambi');
        const rigFatt=righe.filter(r=>r.dest==='fatt'||r.dest==='entrambi');
        const modsNF=rigNF.map(r=>`${r.mod||'—'}: ${fmtE(r.imp)}`).join(', ')||'—';
        infoEl.innerHTML=`
          <div><span style="color:var(--text3);font-size:0.72rem">Agente</span><br><strong>${agNome}</strong></div>
          <div><span style="color:var(--text3);font-size:0.72rem">Prov. Riferimento</span><br><strong style="color:var(--brand)">Prov#${pvIdx+1}</strong></div>
          <div><span style="color:var(--text3);font-size:0.72rem">Quota Lordo</span><br><strong>${fmtE(pv.quotaAgenteLordo||pv.quotaAgente||0)}</strong></div>
          <div><span style="color:var(--text3);font-size:0.72rem">Quota Netta</span><br><strong style="color:var(--green-l)">${fmtE(pv.quotaAgenteNetto||0)}</strong></div>
          <div><span style="color:var(--text3);font-size:0.72rem">Trattenuta Ufficio</span><br><strong style="color:var(--orange)">${fmtE(pv.trattenuteUfficio||0)}</strong></div>
          <div><span style="color:var(--text3);font-size:0.72rem">Modalità NF</span><br><strong>${modsNF}</strong></div>
          ${rigFatt.length?`<div style="grid-column:1/-1"><span style="color:var(--text3);font-size:0.72rem">Quota Fattura (separata)</span><br><strong style="color:#1D4ED8">${rigFatt.map(r=>r.mod+': '+fmtE(r.imp)).join(', ')}</strong></div>`:''}`
        ;
        banner.style.display='block';
        if(gotoBtn){
          gotoBtn.onclick=()=>{closeModal('modal-nf');setTimeout(()=>{go('provvigioni');setTimeout(()=>openProvModal(pvIdx),300);},200);};
        }
      } else {
        banner.style.display='none';
      }
    } else if(banner){
      banner.style.display='none';
    }
  } else {
    initPayWidget('nf', []);
    addNFPagamento();
    const banner=document.getElementById('nf-prov-banner');
    if(banner) banner.style.display='none';
    if(immSel){ immSel.removeAttribute('disabled'); immSel.style.background=''; immSel.style.color=''; immSel.style.fontWeight=''; immSel.title=''; }
  }
  openModal('modal-nf');
}

function saveNF(){
  /* Anti-drift: ri-risolvi l'indice reale dell'incasso in modifica appena
     prima di leggere/scrivere D.incassiNonFatt. */
  if(_nfEditUuid){
    const _freshIdx=D.incassiNonFatt.findIndex(x=>x&&x.uuid===_nfEditUuid);
    if(_freshIdx<0){
      alert('Questo incasso non esiste più (probabilmente cancellato o aggiornato da un altro dispositivo). La lista viene aggiornata.');
      _nfEditIdx=null; _nfEditUuid=null;
      try{ closeModal('modal-nf'); }catch(_e){}
      renderIncassiNF();
      return;
    }
    _nfEditIdx=_freshIdx;
  }
  const g=id=>document.getElementById(id)?.value||'';
  if(!g('nf-cliente').trim()){alert('Il campo Provenienza/Cliente è obbligatorio.');return;}
  const pagamenti=getPayRows('nf');
  // Valida: gli incassi NF sono solo in Contanti
  if(pagamenti.length===0){
    dlgAlert('Aggiungi almeno un pagamento in contanti per registrare l\'incasso.','','Pagamento obbligatorio');
    return;
  }
  const nonContanti=pagamenti.filter(r=>r.modalita&&r.modalita!=='Contanti');
  if(nonContanti.length>0){
    dlgAlert('Gli Incassi Non Fatturabili possono essere registrati <strong>solo in Contanti</strong>.<br>Rimuovi le voci con modalità diversa.','','Solo Contanti');
    return;
  }
  // Forza modalita=Contanti su tutte le righe
  pagamenti.forEach(r=>r.modalita='Contanti');
  const totale=pagamenti.reduce((s,r)=>s+(r.importo||0),0);
  const wasEdit=_nfEditIdx!==null;
  const existingNF=wasEdit?D.incassiNonFatt[_nfEditIdx]:null;
  const isAutoNFSave=(existingNF?.note||'').includes('Auto da Provvigioni');
  // Per NF auto: leggi immRef dal record originale se il select è disabilitato
  const immRefSel=document.getElementById('nf-imm-ref');
  const immRefVal=immRefSel?.disabled
    ?(existingNF?.immRef??immRefSel.value)
    :(immRefSel?.value||'');
  const n={
    data:g('nf-data'),cliente:g('nf-cliente'),tipo:g('nf-tipo'),
    descr:g('nf-descr'),
    immRef:immRefVal,
    pagamenti, totale,
    stato:g('nf-stato'),fattRif:g('nf-fatt-rif'),
    // Preserva la nota originale per NF auto (non sovrascrivere con il campo textarea)
    note:isAutoNFSave?(existingNF.note):g('nf-note')
  };
  const oldNote=existingNF?.note||'';
  if(_nfEditIdx!==null){
    n.uuid=_nfEditUuid||D.incassiNonFatt[_nfEditIdx].uuid||((typeof genUUID==='function')?genUUID():('nf_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)));
    D.incassiNonFatt[_nfEditIdx]=n;
  } else {
    n.uuid=(typeof genUUID==='function')?genUUID():('nf_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
    D.incassiNonFatt.push(n);
  }
  var _pnNFIdx=(_nfEditIdx!==null)?_nfEditIdx:D.incassiNonFatt.length-1; pnSyncNF(_pnNFIdx);
  
  saveD(); closeModal('modal-nf'); renderIncassiNF(); updateBadges();
  // Se era modifica di NF creato da provvigione → aggiorna provvigione e naviga
  if(wasEdit){
    const isAuto=(oldNote||n.note||'').includes('Auto da Provvigioni');
    if(isAuto){
      const descrTxt=n.descr||oldNote||'';
      const m=descrTxt.match(/Prov#(\d+)/);
      if(m){
        const pvIdx=parseInt(m[1])-1;
        const pv=D.provvigioni[pvIdx];
        if(pv){
          // ── Aggiorna modAgenteRighe: sostituisce le righe dest:nf con i nuovi pagamenti ──
          const nuovePag=n.pagamenti||[];
          // Rimuovi vecchie righe NF e inserisci le nuove dal record aggiornato
          const righeOld=(pv.modAgenteRighe||[]).filter(r=>r.dest!=='nf'&&r.dest!=='entrambi');
          const righeNuove=nuovePag.map(p=>({
            mod:p.modalita||'—',
            imp:p.importo||0,
            dest:'nf'
          }));
          pv.modAgenteRighe=[...righeOld,...righeNuove];
          // Aggiorna totale NF nella provvigione
          pv._agtNFDone=true; // rimane fatto
          // Ricalcola totale pagato agente se necessario
          const nuovoTotNF=nuovePag.reduce((s,p)=>s+(p.importo||0),0);
          saveD(); renderProvvigioni();
          showToast(' Incasso NF e provvigione aggiornati','','');
          setTimeout(()=>{go('provvigioni');setTimeout(()=>openProvModal(pvIdx),300);},200);
          return;
        }
      }
    }
  }
}

function delNF(idxOrUuid){
  const i0=typeof idxOrUuid==='string'?D.incassiNonFatt.findIndex(x=>x&&x.uuid===idxOrUuid):idxOrUuid;
  const n0=D.incassiNonFatt[i0];
  if(!n0){
    if(typeof showToast==='function') showToast('Incasso non trovato (forse già cancellato altrove). Aggiorno la lista...','','#DC2626');
    try{ renderIncassiNF(); }catch(e){}
    return;
  }
  if(!n0.uuid) n0.uuid=(typeof genUUID==='function')?genUUID():('nf_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
  const nUuid=n0.uuid; /* catturato ORA: la cancellazione avviene dopo la conferma, che richiede tempo */
  dlgConfirm('Eliminare questo incasso non fatturabile?','','Elimina Incasso NF').then(ok=>{
    if(!ok) return;
    /* Anti-drift: ri-risolvi l'indice fresco dall'uuid proprio ora che
       l'utente ha confermato. */
    const i=D.incassiNonFatt.findIndex(x=>x&&x.uuid===nUuid);
    if(i<0){
      if(typeof showToast==='function') showToast('Incasso già cancellato o aggiornato altrove. Aggiorno la lista...','','#DC2626');
      renderIncassiNF();
      return;
    }
    const n=D.incassiNonFatt[i];
    if(n){
      const isAutoAg  = n.note==='Auto da Provvigioni — Contabilità Agenzia';
      const isAutoAgt = n.note==='Auto da Provvigioni — Contabilità Agente';
      if(isAutoAg||isAutoAgt){
        D.provvigioni.forEach((pv,pvIdx)=>{
          const ref='Prov#'+(pvIdx+1);
          const match = pv.uuid && n._provUuid ? n._provUuid===pv.uuid : (n.descr&&n.descr.includes(ref));
          if(match){
            if(isAutoAg){ pv._agNFDone=false; }
            if(isAutoAgt){
              pv._agtNFDone=false;
              // Rimuovi anche le righe NF da modAgenteRighe così la provvigione mostra stato corretto
              if(pv.modAgenteRighe){
                pv.modAgenteRighe=pv.modAgenteRighe.filter(r=>r.dest!=='nf'&&r.dest!=='entrambi');
              }
            }
          }
        });
      }
    }
    pnRemoveBySource('nf',i);  
    D.incassiNonFatt.splice(i,1);
    // Ricalcola statoPag per le provvigioni che avevano questo NF collegato
    (D.provvigioni||[]).forEach(pv=>{
      if(!pv._agNFDone && !pv._agtNFDone){
        const hasPagV=(pv.modV||'').trim().length>0 && (pv.quotaV||0)>0;
        const hasPagA=(pv.modA||'').trim().length>0 && (pv.quotaA||0)>0;
        const righe=pv.modAgenteRighe||[];
        const hasPagAgt=righe.some(r=>(r.imp||0)>0);
        if(!hasPagV&&!hasPagA&&!hasPagAgt) pv.statoPag='Da Incassare';
      }
    });
    saveD(); renderIncassiNF(); renderProvvigioni(); updateBadges();
    showToast(' Incasso NF eliminato — registrazione agente azzerata','','');
  });
}

/* ════════════════════════════════════════════════════════════════════
   [25 ago 2026] COLLEGAMENTI VISIBILI FRA PROVVIGIONI, FATTURE E INCASSI NF
   Una provvigione si divide in tre destinazioni: una parte va in fattura, una
   in Incassi NF, e l'eventuale abbuono è quota rinunciata. Tutti i pezzi
   nati dalla stessa provvigione portano lo stesso _provUuid: è quello il
   collegamento, finora mai mostrato a schermo.
   ════════════════════════════════════════════════════════════════════ */

/* Trova la fattura nata dalla stessa provvigione di questa scrittura NF. */
function _nfFatturaCollegata(n){
  if(!n) return null;
  const fatture=D.fatture||[];
  let idx=-1;
  if(n._provUuid) idx=fatture.findIndex(f=>f&&f._provUuid===n._provUuid);
  if(idx<0){
    /* Ripiego per le scritture non ancora agganciate: stesso riferimento
       Prov#N nell'oggetto della fattura. Solo su fatture senza targa, così
       non si ruba la fattura di un'altra provvigione. */
    const m=String(n.descr||'').match(/Prov#\d+/);
    if(m) idx=fatture.findIndex(f=>f&&!f._provUuid&&String(f.oggetto||'').includes(m[0]));
  }
  if(idx<0) return null;
  const f=fatture[idx];
  const num=f.numero||f.num||'?';
  return { idx, etichetta:String(num)+(f.anno?('/'+f.anno):''), oggetto:f.oggetto||'',
           totale:f.totale||0, stato:f.stato||'' };
}

/* Quota agente destinata a Incassi NF, secondo la provvigione. */
function _provTotNF(p){
  const r=Array.isArray(p.modAgenteRighe)?p.modAgenteRighe:[];
  return r.filter(x=>x&&(x.dest==='nf'||x.dest==='entrambi'))
          .reduce((s,x)=>s+(parseFloat(x.imp)||0),0);
}
/* Quota agente destinata a fattura. */
function _provTotFatt(p){
  const r=Array.isArray(p.modAgenteRighe)?p.modAgenteRighe:[];
  return r.filter(x=>x&&(x.dest==='fatt'||x.dest==='entrambi'))
          .reduce((s,x)=>s+(parseFloat(x.imp)||0),0);
}

function _renderQuadraturaNF(){
  const box=document.getElementById('nf-quadratura');
  if(!box) return;
  const PR=D.provvigioni||[], NF=D.incassiNonFatt||[];
  const righe=[];
  PR.forEach((p,pi)=>{
    if(!p) return;
    const dovutoNF=_provTotNF(p), dovutoFatt=_provTotFatt(p);
    if(dovutoNF===0 && dovutoFatt===0) return;      /* provvigione senza acconti */
    const netto=parseFloat(p.quotaAgenteNetto||p.quotaAgente||0)||0;
    const abbuono=parseFloat(p.abbuono)||0;
    /* Quanto risulta DAVVERO registrato in Incassi NF per questa provvigione */
    const mie=NF.filter(n=>{
      if(!n || !/Auto da Provvigioni/.test(n.note||'')) return false;
      if(/Agenzia/.test(n.note||'')) return false;
      if(p.uuid && n._provUuid===p.uuid) return true;
      return !n._provUuid && String(n.descr||'').includes('Prov#'+(pi+1));
    });
    const inNF=mie.reduce((s,n)=>s+(parseFloat(n.totale)||0),0);
    const fatt=_nfFatturaCollegata({_provUuid:p.uuid, descr:'Prov#'+(pi+1)});
    const scartoNF=inNF-dovutoNF;
    const scartoTot=netto ? (dovutoNF+dovutoFatt+abbuono-netto) : 0;
    righe.push({pi,p,netto,dovutoNF,dovutoFatt,abbuono,inNF,mie,fatt,scartoNF,scartoTot});
  });

  if(!righe.length){ box.innerHTML=''; return; }
  const guasti=righe.filter(r=>Math.abs(r.scartoNF)>=0.01||Math.abs(r.scartoTot)>=0.01);
  /* [25 ago 2026] Il prospetto parte SEMPRE CHIUSO. Prima si apriva da solo
     ogni volta che c'era uno sbilancio, e siccome la tabella si ridisegna a
     ogni filtro, a ogni salvataggio e a ogni sincronizzazione, si riapriva di
     continuo spingendo l'elenco in basso. Ora lo apri tu, e se lo apri resta
     aperto per il resto della sessione. Il contatore rosso nell'intestazione
     dice comunque quanti casi ci sono, quindi non si perde l'avviso. */
  const apri=(typeof window!=='undefined' && window._nfQuadraturaAperta===true)?' open':'';
  const cel=v=>`<td style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap">${fmtE(v)}</td>`;

  box.innerHTML=`
  <details${apri} style="border:1px solid var(--border);border-radius:12px;background:var(--bg2);overflow:hidden">
    <summary style="cursor:pointer;padding:12px 16px;font-weight:700;display:flex;align-items:center;gap:10px;list-style:none">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h12"/></svg>
      Quadratura provvigioni → fattura + Incassi NF
      ${guasti.length
        ? `<span style="margin-left:auto;font-size:0.7rem;font-weight:800;color:#B91C1C;background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);border-radius:10px;padding:2px 9px">${guasti.length} da controllare</span>`
        : `<span style="margin-left:auto;font-size:0.7rem;font-weight:800;color:#15803D;background:rgba(21,128,61,.1);border:1px solid rgba(21,128,61,.3);border-radius:10px;padding:2px 9px">tutto quadra</span>`}
    </summary>
    <div class="table-wrap" style="border-top:1px solid var(--border)">
    <table><thead><tr>
      <th>Provvigione</th><th>Fattura</th>
      <th style="text-align:right">Netto agente</th>
      <th style="text-align:right">In fattura</th>
      <th style="text-align:right">Verso NF</th>
      <th style="text-align:right">Registrato NF</th>
      <th style="text-align:right">Abbuono</th>
      <th style="text-align:right">Differenza</th>
    </tr></thead><tbody>
    ${righe.map(r=>{
      const ko=Math.abs(r.scartoNF)>=0.01||Math.abs(r.scartoTot)>=0.01;
      const nota=[];
      if(Math.abs(r.scartoNF)>=0.01)
        nota.push(r.scartoNF>0
          ? `in Incassi NF ci sono ${fmtE(r.scartoNF)} di troppo (${r.mie.length} scritture)`
          : `mancano ${fmtE(-r.scartoNF)} in Incassi NF`);
      if(Math.abs(r.scartoTot)>=0.01)
        nota.push(`gli acconti non coprono il netto all'agente: ${fmtE(r.scartoTot)}`);
      return `<tr style="${ko?'background:rgba(220,38,38,.06)':''}">
        <td><div style="font-weight:700;cursor:pointer;text-decoration:underline dotted" onclick="go('provvigioni');setTimeout(()=>openProvModal(${r.pi}),300)" title="Apri la provvigione">Prov#${r.pi+1}</div>
            <div style="font-size:0.72rem;color:var(--text3)">${(r.p.descr||r.p.immobile||'')}</div>
            ${nota.length?`<div style="margin-top:3px;font-size:0.7rem;font-weight:700;color:#B91C1C">${nota.join(' · ')}</div>`:''}</td>
        <td style="font-size:0.8rem">${r.fatt
          ? `<span style="cursor:pointer;color:var(--brand);font-weight:700;text-decoration:underline dotted" onclick="go('fatture');setTimeout(()=>openFatturaModal(${r.fatt.idx}),250)">${r.fatt.etichetta}</span>
             <div style="font-size:0.66rem;color:var(--text3)">${r.fatt.stato||''}</div>`
          : '<span style="color:var(--text3)">nessuna</span>'}</td>
        ${cel(r.netto)}${cel(r.dovutoFatt)}${cel(r.dovutoNF)}
        <td style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;${Math.abs(r.scartoNF)>=0.01?'color:#B91C1C;font-weight:800':''}">${fmtE(r.inNF)}</td>
        ${cel(r.abbuono)}
        <td style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:800;${ko?'color:#B91C1C':'color:var(--text3)'}">${ko?fmtE(r.scartoNF||r.scartoTot):'0,00'}</td>
      </tr>`;
    }).join('')}
    </tbody></table></div>
  </details>`;
  /* Memorizza la scelta dell'utente, così i ridisegni non la annullano. */
  try{
    const det=box.querySelector && box.querySelector('details');
    if(det && det.addEventListener) det.addEventListener('toggle',function(){ window._nfQuadraturaAperta=det.open; });
  }catch(e){}
}

function renderIncassiNF(){
  const pd=document.getElementById('pd-nf');if(pd)pd.textContent=new Date().toLocaleDateString('it-IT');
  const q=(document.getElementById('f-nf-q')?.value||'').toLowerCase();
  const stato=document.getElementById('f-nf-stato')?.value||'';
  const nfDal=document.getElementById('f-nf-dal')?.value||'';
  const nfAl =document.getElementById('f-nf-al')?.value||'';
  const list=D.incassiNonFatt||[];
  const f=list.filter(n=>{
    const t=[n.cliente,n.descr,n.tipo].join(' ').toLowerCase();
    const dtOk=(!nfDal||n.data>=nfDal)&&(!nfAl||n.data<=nfAl);
    return(!q||t.includes(q))&&(!stato||n.stato===stato)&&dtOk;
  });
  /* [25 ago 2026] I RIQUADRI SEGUONO IL FILTRO.
     Prima erano calcolati su tutto l'archivio (list): filtrando per "Fatturati"
     o per data i totali restavano quelli generali e non dicevano niente su
     quello che si stava guardando. Ora si calcolano sull'elenco filtrato (f) e,
     quando un filtro è attivo, i riquadri lo dichiarano. */
  const filtroAttivo = !!(q||stato||nfDal||nfAl);
  const somma=(arr,st)=>arr.filter(n=>!st||n.stato===st).reduce((s,n)=>s+(n.totale||0),0);
  const totTutti=somma(f);
  const totDF=somma(f,'Da Fatturare');
  const totFatt=somma(f,'Fatturata');
  const totNonF=somma(f,'Non Fatturabile');
  const nDF=f.filter(n=>n.stato==='Da Fatturare').length;
  /* Il pallino nel menù conta SEMPRE su tutto l'archivio: è una notifica, non
     deve cambiare perché stai filtrando la tabella. */
  const nDFtot=list.filter(n=>n.stato==='Da Fatturare').length;
  const nbNF=document.getElementById('nb-nf');
  if(nbNF){nbNF.textContent=nDFtot;nbNF.style.display=nDFtot?'':'none';}
  const _ico={
    totale:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
    daFatt:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>',
    fatturati:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg>',
    nonFatt:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>'
  };
  const _tag=t=>`<span class="kpi-tag">${t}</span>`;
  const _card=(grad,ombra,ico,tag,etichetta,valore)=>`
    <div class="stat-card kpi-prov" style="background:${grad};box-shadow:${ombra};cursor:default">
      <div class="kpi-top"><span class="stat-card-icon">${ico}</span>${tag}</div>
      <div class="stat-label kpi-label">${etichetta}</div>
      <div class="stat-val kpi-val">${fmtE(valore)}</div>
      <div class="kpi-note">${filtroAttivo?'in base al filtro':''}</div>
    </div>`;
  const statsEl=document.getElementById('nf-stats');
  if(statsEl) statsEl.innerHTML=
      _card('linear-gradient(145deg,#064E3B,#065F46)','0 8px 24px rgba(6,78,57,.45)',_ico.totale,_tag(f.length+' NF'),filtroAttivo?'Totale (filtrati)':'Totale Incassi NF',totTutti)
    + _card('linear-gradient(145deg,#92400E,#B45309)','0 8px 24px rgba(180,83,9,.4)',_ico.daFatt,nDF>0?_tag(nDF):'<span class="kpi-tag" style="visibility:hidden">0</span>','Da Fatturare',totDF)
    + _card('linear-gradient(145deg,#065F46,#059669)','0 8px 24px rgba(5,150,105,.4)',_ico.fatturati,_tag('FATT.'),'Già Fatturati',totFatt)
    + _card('linear-gradient(145deg,#374151,#4B5563)','0 8px 24px rgba(55,65,81,.4)',_ico.nonFatt,_tag('N/F'),'Non Fatturabili',totNonF);
  const stC={'Da Fatturare':'badge-orange','Fatturata':'badge-green','Non Fatturabile':'badge-gray'};
  /* [28 ago 2026] Le due tabelle non hanno più lo stesso contenuto: quella
     dentro Provvigioni ha il proprio filtro per anno, quella della sezione
     Incassi NF ha i suoi filtri. Ognuna riceve il suo elenco. */
  const _fBase = f;
  let _fPnf = f;
  try{
    if(typeof window._pnfSelezione === 'function'){
      const _sel = window._pnfSelezione();
      if(_sel && _sel.filtroAttivo) _fPnf = f.filter(n => _sel.lista.indexOf(n) >= 0);
    }
  }catch(e){}
  /* Anche i riquadri del tab Provvigioni vanno ricalcolati: leggono dallo
     stesso filtro e senza questo resterebbero fermi al giro precedente. */
  try{
    if(window._curProvTab === 'nf' && typeof _updateProvStats === 'function') _updateProvStats('nf');
  }catch(e){}
  // render both tbodies (standalone section and provvigioni tab)
  ['nf-tbody','prov-nf-tbody'].forEach(tbId=>{
    const tbody=document.getElementById(tbId);
    if(!tbody) return;
    const f = (tbId==='prov-nf-tbody') ? _fPnf : _fBase;
    tbody.innerHTML=f.length?f.map((n,i)=>{
      const ri=list.indexOf(n);
      if(!n.uuid) n.uuid=(typeof genUUID==='function')?genUUID():('nf_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
      const nUuid=n.uuid.replace(/'/g,"\\'");
      const im=n.immRef!==''&&n.immRef!==undefined&&D.immobili[parseInt(n.immRef)]?D.immobili[parseInt(n.immRef)]:null;
      // Residuo provvigione collegata a questo immobile
      const provCollegata=n.immRef!==''&&n.immRef!==undefined
        ? (D.provvigioni||[]).find(p=>String(p.immRef)===String(n.immRef))
        : null;
      // FIX BUG RESIDUO: prima si usava provCollegata.incassato (campo quasi
      // sempre vuoto) → il residuo mostrava sempre l'intera quota. Ora calcoliamo
      // l'incassato REALE dell'agente sommando le righe di pagamento effettive
      // in modAgenteRighe (i pagamenti ricevuti dall'agente). Così se l'agente
      // deve ricevere 5000 e ne ha già ricevuti 1000, il residuo è 4000.
      let residuoProvImm=null;
      if(provCollegata){
        const quotaAgente = provCollegata.quotaAgenteNetto
          || provCollegata.quotaAgente || provCollegata.quotaAgenteLordo || provCollegata.totale || 0;
        const pagAgente = Array.isArray(provCollegata.modAgenteRighe)
          ? provCollegata.modAgenteRighe.reduce((s,r)=>s+(parseFloat(r.imp)||0),0)
          : (parseFloat(provCollegata.incassato)||0);
        // L'abbuono è quota rinunciata (non più incassabile): concorre a chiudere
        // il residuo esattamente come un pagamento, altrimenti resterebbe un
        // falso residuo (es. €0,12) che non verrà mai incassato.
        const abbuonoProv = parseFloat(provCollegata.abbuono)||0;
        residuoProvImm = Math.max(0, quotaAgente - pagAgente - abbuonoProv);
        // Azzera i residui trascurabili da arrotondamento (< 1 centesimo).
        if(residuoProvImm < 0.01) residuoProvImm = 0;
      }
      const residuoCell=residuoProvImm!==null&&residuoProvImm>0
        ? `<div style="margin-top:3px;font-size:0.68rem;font-weight:700;color:#B45309;background:#FEF3C7;border:1px solid #FDE68A;border-radius:5px;padding:1px 5px;display:inline-block"> Residuo prov: ${fmtE(residuoProvImm)}</div>`
        : '';
      const modsStr=(n.pagamenti||[]).filter(p=>p.modalita).map(p=>`<span class="badge badge-blue" style="font-size:0.68rem;margin:1px">${p.modalita}<span style="color:var(--text3);margin-left:3px">${fmtE(p.importo)}</span></span>`).join('');
      /* [25 ago 2026] COLONNA "Fattura Coll." — prima mostrava solo fattRif, un
         campo che si compila SOLO a mano: sulle scritture generate da
         Provvigioni era sempre vuota. Il collegamento però esisteva già nei
         dati: la scrittura e la fattura nate dalla stessa provvigione portano
         lo stesso _provUuid. Qui lo si mostra e lo si rende cliccabile. */
      const fattColl=_nfFatturaCollegata(n);
      const fattCell = n.fattRif
        ? `<span title="Numero scritto a mano nella scheda">${n.fattRif}</span>`
        : (fattColl
            ? `<span onclick="event.stopPropagation();go('fatture');setTimeout(()=>openFatturaModal(${fattColl.idx}),250)" style="cursor:pointer;text-decoration:underline dotted" title="${fattColl.oggetto||''} — clicca per aprire la fattura">${fattColl.etichetta}</span>
               <div style="font-size:0.66rem;font-weight:600;color:var(--text3)">${fmtE(fattColl.totale)} · ${fattColl.stato||''}</div>`
            : (/Auto da Provvigioni/.test(n.note||'')
                ? '<span style="color:var(--text3);font-weight:500" title="Questa quota non passa da fattura">nessuna</span>'
                : '—'));
      return`<tr ondblclick="${(n.note||'').includes('Auto da Provvigioni')?'':(`openNFModal('${nUuid}')`)}" style="cursor:pointer" title="${(n.note||'').includes('Auto da Provvigioni')?'Modificabile dalla provvigione collegata':'Doppio click per modificare'}">
        <td style="color:var(--text3)">${i+1}</td>
        <td style="white-space:nowrap;font-size:0.85rem">${fmtD(n.data)}</td>
        <td><div style="font-weight:700">${n.cliente||'—'}</div><div style="font-size:0.72rem;color:var(--text3)">${n.tipo||''}</div></td>
        <td style="font-size:0.8rem">${im?(im.tipo||'')+(im.comune?' · '+im.comune:''):'—'}${residuoCell}</td>
        <td style="font-weight:800;color:var(--green-l)">${fmtE(n.totale)}</td>
        <td>${modsStr||'—'}</td>
        <td><span class="badge ${stC[n.stato]||'badge-gray'}" style="font-size:0.7rem">${n.stato}</span></td>
        <td style="text-align:center">${n.stato==='Da Fatturare'?'<span style="color:var(--orange);font-weight:700"> Sì</span>':'—'}</td>
        <td style="font-size:0.8rem;font-weight:600;color:var(--brand)">${fattCell}</td>
        <td class="note-cell">${n.note||'—'}</td>
        <td><div class="actions-col">
          ${(n.note||'').includes('Auto da Provvigioni')
            ? (() => {
                const m=(n.descr||'').match(/Prov#(\d+)/);
                const pvIdx=m?parseInt(m[1])-1:-1;
                return pvIdx>=0
                  ? `<button class="icon-btn" style="color:var(--brand);font-size:0.72rem;white-space:nowrap" onclick="closeModal('modal-nf');setTimeout(()=>{go('provvigioni');setTimeout(()=>openProvModal(${pvIdx}),300);},200)" title="Modifica dalla provvigione collegata">↩️ Prov.</button>`
                  : '';
              })()
            : `<button class="icon-btn" onclick="openNFModal('${nUuid}')" title="Modifica"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`
          }
          <button class="icon-btn" onclick="delNF('${nUuid}')" style="color:var(--red-l)" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
        </div></td>
      </tr>`;
    }).join(''):'<tr><td colspan="11"><div class="empty-state"><div class="empty-icon"></div><p>Nessun incasso non fatturabile registrato.</p></div></td></tr>';
  });
  try{ _renderQuadraturaNF(); }catch(e){ console.warn('[NF] prospetto di quadratura non disegnato:', e); }
  if(window._curProvTab==='nf') _updateProvStats('nf');
}

// ===== NOTIZIE =====

// --- BRIDGE window ---
Object.assign(window, { addNFPagamento, openNFModal, saveNF, delNF, renderIncassiNF,
  _nfFatturaCollegata, _renderQuadraturaNF });
export { renderIncassiNF, openNFModal, saveNF, delNF, _nfFatturaCollegata, _renderQuadraturaNF };
