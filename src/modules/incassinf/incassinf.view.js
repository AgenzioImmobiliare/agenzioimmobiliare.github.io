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

function openNFModal(idx){
  _nfEditIdx = idx!==undefined ? idx : null;
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
  if(_nfEditIdx!==null) D.incassiNonFatt[_nfEditIdx]=n;
  else D.incassiNonFatt.push(n);
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

function delNF(i){
  dlgConfirm('Eliminare questo incasso non fatturabile?','','Elimina Incasso NF').then(ok=>{
    if(!ok) return;
    const n=D.incassiNonFatt[i];
    if(n){
      const isAutoAg  = n.note==='Auto da Provvigioni — Contabilità Agenzia';
      const isAutoAgt = n.note==='Auto da Provvigioni — Contabilità Agente';
      if(isAutoAg||isAutoAgt){
        D.provvigioni.forEach((pv,pvIdx)=>{
          const ref='Prov#'+(pvIdx+1);
          if(n.descr&&n.descr.includes(ref)){
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
  const totTutti=list.reduce((s,n)=>s+(n.totale||0),0);
  const totDF=list.filter(n=>n.stato==='Da Fatturare').reduce((s,n)=>s+(n.totale||0),0);
  const totFatt=list.filter(n=>n.stato==='Fatturata').reduce((s,n)=>s+(n.totale||0),0);
  const nDF=list.filter(n=>n.stato==='Da Fatturare').length;
  const nbNF=document.getElementById('nb-nf');
  if(nbNF){nbNF.textContent=nDF;nbNF.style.display=nDF?'':'none';}
  const statsEl=document.getElementById('nf-stats');
  if(statsEl) statsEl.innerHTML=`
    <div class="stat-card" style="background:linear-gradient(145deg,#064E3B,#065F46);box-shadow:0 8px 24px rgba(6,78,57,.45);cursor:default">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <span class="stat-card-icon"></span>
        <span style="background:rgba(255,255,255,.15);color:white;font-size:0.62rem;font-weight:800;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.2)">${list.length} NF</span>
      </div>
      <div class="stat-label" style="color:rgba(255,255,255,.75)">Totale Incassi NF</div>
      <div class="stat-val">${fmtE(totTutti)}</div></div>
    <div class="stat-card" style="background:linear-gradient(145deg,#92400E,#B45309);box-shadow:0 8px 24px rgba(180,83,9,.4);cursor:default">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <span class="stat-card-icon"></span>
        ${nDF>0?`<span style="background:rgba(255,255,255,.22);color:white;font-size:0.62rem;font-weight:800;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.3)">${nDF} </span>`:''}
      </div>
      <div class="stat-label" style="color:rgba(255,255,255,.75)">Da Fatturare</div>
      <div class="stat-val">${fmtE(totDF)}</div></div>
    <div class="stat-card" style="background:linear-gradient(145deg,#065F46,#059669);box-shadow:0 8px 24px rgba(5,150,105,.4);cursor:default">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <span class="stat-card-icon"></span>
        <span style="background:rgba(255,255,255,.15);color:white;font-size:0.62rem;font-weight:800;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.2)">FATT.</span>
      </div>
      <div class="stat-label" style="color:rgba(255,255,255,.75)">Già Fatturati</div>
      <div class="stat-val">${fmtE(totFatt)}</div></div>
    <div class="stat-card" style="background:linear-gradient(145deg,#374151,#4B5563);box-shadow:0 8px 24px rgba(55,65,81,.4);cursor:default">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <span class="stat-card-icon"></span>
        <span style="background:rgba(255,255,255,.12);color:white;font-size:0.62rem;font-weight:800;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.15)">N/F</span>
      </div>
      <div class="stat-label" style="color:rgba(255,255,255,.75)">Non Fatturabili</div>
      <div class="stat-val">${fmtE(list.filter(n=>n.stato==='Non Fatturabile').reduce((s,n)=>s+(n.totale||0),0))}</div></div>`;
  const stC={'Da Fatturare':'badge-orange','Fatturata':'badge-green','Non Fatturabile':'badge-gray'};
  // render both tbodies (standalone section and provvigioni tab)
  ['nf-tbody','prov-nf-tbody'].forEach(tbId=>{
    const tbody=document.getElementById(tbId);
    if(!tbody) return;
    tbody.innerHTML=f.length?f.map((n,i)=>{
      const ri=list.indexOf(n);
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
        residuoProvImm = Math.max(0, quotaAgente - pagAgente);
      }
      const residuoCell=residuoProvImm!==null&&residuoProvImm>0
        ? `<div style="margin-top:3px;font-size:0.68rem;font-weight:700;color:#B45309;background:#FEF3C7;border:1px solid #FDE68A;border-radius:5px;padding:1px 5px;display:inline-block"> Residuo prov: ${fmtE(residuoProvImm)}</div>`
        : '';
      const modsStr=(n.pagamenti||[]).filter(p=>p.modalita).map(p=>`<span class="badge badge-blue" style="font-size:0.68rem;margin:1px">${p.modalita}<span style="color:var(--text3);margin-left:3px">${fmtE(p.importo)}</span></span>`).join('');
      return`<tr ondblclick="${(n.note||'').includes('Auto da Provvigioni')?'':(`openNFModal(${ri})`)}" style="cursor:pointer" title="${(n.note||'').includes('Auto da Provvigioni')?'Modificabile dalla provvigione collegata':'Doppio click per modificare'}">
        <td style="color:var(--text3)">${i+1}</td>
        <td style="white-space:nowrap;font-size:0.85rem">${fmtD(n.data)}</td>
        <td><div style="font-weight:700">${n.cliente||'—'}</div><div style="font-size:0.72rem;color:var(--text3)">${n.tipo||''}</div></td>
        <td style="font-size:0.8rem">${im?(im.tipo||'')+(im.comune?' · '+im.comune:''):'—'}${residuoCell}</td>
        <td style="font-weight:800;color:var(--green-l)">${fmtE(n.totale)}</td>
        <td>${modsStr||'—'}</td>
        <td><span class="badge ${stC[n.stato]||'badge-gray'}" style="font-size:0.7rem">${n.stato}</span></td>
        <td style="text-align:center">${n.stato==='Da Fatturare'?'<span style="color:var(--orange);font-weight:700"> Sì</span>':'—'}</td>
        <td style="font-size:0.8rem;font-weight:600;color:var(--brand)">${n.fattRif||'—'}</td>
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
            : `<button class="icon-btn" onclick="openNFModal(${ri})" title="Modifica"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`
          }
          <button class="icon-btn" onclick="delNF(${ri})" style="color:var(--red-l)" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
        </div></td>
      </tr>`;
    }).join(''):'<tr><td colspan="11"><div class="empty-state"><div class="empty-icon"></div><p>Nessun incasso non fatturabile registrato.</p></div></td></tr>';
  });
  if(window._curProvTab==='nf') _updateProvStats('nf');
}

// ===== NOTIZIE =====

// --- BRIDGE window ---
Object.assign(window, { addNFPagamento, openNFModal, saveNF, delNF, renderIncassiNF });
export { renderIncassiNF, openNFModal, saveNF, delNF };
