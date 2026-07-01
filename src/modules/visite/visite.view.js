// modules/visite/visite.view.js — vista DESKTOP del modulo Visite.
// Estratto (25463-26086): openVisita, flusso a step (visShowStep1, visGoStep2,
// visBackToStep1), filterVisitaImm, renderVisitaImmGrid, openVisitaForImm,
// fillVisitaImm, fillVisitaCli, editVisita, saveVisita, _saveVisitaContinua,
// _visFinalCloseAndRefresh, _visStartNewForSameClient, _visEndMultiSession,
// _visApplyKeptData, delVisita, visImmBuild/Toggle/Outside/Select, renderVisite.
//
// Usa D.editIdx/D.editType (pattern editing condiviso, dentro D → via Proxy) e
// window._visIsNewSave. Nessuna variabile let globale problematica.
//
// FUNZIONI-PONTE che restano nel monolite (usate da più domini): _evtFromVisita
// (crea eventi calendario), _richiestaDaVisita (crea richieste), report visite,
// giri-visita. Raggiunte via window.
//
// Dipendenze esterne (monolite via window): _richiestaDaVisita, _safeInsertBefore,
//   _tlLog, openSchedaImmobile, renderSchedaCliente, renderSchedaImmobile,
//   crmLogAuto, refreshCurrentView, bEsito, openModal, closeModal, clearModal,
//   saveD, showToast, go, updateBadges, fmtD, today, hasPermission, dlgConfirm.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function openVisita(idx){
  D.editIdx=null; D.editType=null;
  clearModal('modal-visita');
  const hasImm=D.immobili.length>0;
  document.getElementById('vis-alert').style.display=hasImm?'none':'block';
  document.getElementById('mt-vis').textContent=idx!==undefined?'Modifica Visita':'Nuova Visita';
  // Populate clienti dropdown
  const visCliSel=document.getElementById('vis-cli-ref');
  if(visCliSel){
    visCliSel.innerHTML='<option value="">-- Seleziona --</option>'+
      D.clienti.map((cl,ci)=>(cl.tipo==='acquirente'||cl.tipo==='entrambi')?
        `<option value="${ci}">${cl.nome||'Cliente '+(ci+1)}</option>`:'').join('');
  }
  // Popola la select Agenti (esclude agenti non attivi)
  const visAgSel=document.getElementById('vis-agente-ref');
  if(visAgSel){
    const _ags=(D.agenti||[]).map((a,i)=>({a,i})).filter(({a})=>a&&a.stato!=='non attivo');
    visAgSel.innerHTML='<option value="">-- Seleziona agente --</option>'+
      _ags.map(({a,i})=>`<option value="${i}">${a.nome||'Agente '+(i+1)}</option>`).join('');
  }
  if(idx!==undefined){
    // Modifica: vai direttamente allo step 2 con dati precaricati
    D.editIdx=idx; D.editType='visita';
    const v=D.visite[idx];
    visGoStep2(parseInt(v.immRef)||0);
    const map={'data':'data','ora':'ora','cli-ref':'cliRef','cliente':'cliente','tel':'tel','agenzia':'agenzia','esito':'esito','feedback':'feedback','note':'note'};
    Object.entries(map).forEach(([hk,dk])=>{const el=document.getElementById('vis-'+hk);if(el&&v[dk]!==undefined)el.value=v[dk];});
    // Precarica l'agente: prima per indice (agenteRef), poi per nome (agente)
    const _vAgEl=document.getElementById('vis-agente-ref');
    if(_vAgEl){
      if(v.agenteRef!==undefined && v.agenteRef!==null && v.agenteRef!==''){
        _vAgEl.value=String(v.agenteRef);
      } else if(v.agente){
        const _ai=(D.agenti||[]).findIndex(a=>a&&(a.nome||'')===v.agente);
        if(_ai>=0) _vAgEl.value=String(_ai);
      }
    }
  } else {
    // Nuova: step 1 — picker immobili
    document.getElementById('vis-data').value=today();
    // Pre-fill dal contesto cliente
    let preselImm=-1;
    if(curSection==='scheda-cliente' && D.schedaCliIdx!==null){
      const cliImm=D.immobili.map((im,ii)=>({im,ii})).filter(({im})=>parseInt(im.clienteRef)===D.schedaCliIdx);
      if(cliImm.length>0) preselImm=cliImm[0].ii;
    }
    if(preselImm>=0){
      visGoStep2(preselImm);
      // Pre-fill cliente se acquirente
      if(D.schedaCliIdx!==null && D.clienti[D.schedaCliIdx]){
        const cl=D.clienti[D.schedaCliIdx];
        if(cl.tipo==='acquirente'||cl.tipo==='entrambi'){
          const csel=document.getElementById('vis-cli-ref');
          if(csel){csel.value=D.schedaCliIdx;fillVisitaCli();}
        }
      }
    } else {
      visShowStep1();
    }
  }
  openModal('modal-visita');
}

function visShowStep1(){
  document.getElementById('vis-step1').style.display='block';
  document.getElementById('vis-step2').style.display='none';
  document.getElementById('vis-save-btn').style.display='none';
  document.getElementById('vis-imm-search').value='';
  renderVisitaImmGrid(D.immobili.map((_,i)=>i));
}

function filterVisitaImm(){
  const q=(document.getElementById('vis-imm-search').value||'').toLowerCase();
  if(!q){renderVisitaImmGrid(D.immobili.map((_,i)=>i));return;}
  const idx=D.immobili.map((im,i)=>({im,i})).filter(({im})=>{
    return [im.tipo,im.comune,im.zona,im.ref,im.indirizzo,im.contatto].join(' ').toLowerCase().includes(q);
  }).map(({i})=>i);
  renderVisitaImmGrid(idx);
}

function renderVisitaImmGrid(indices){
  const grid=document.getElementById('vis-imm-grid');
  if(!grid) return;
  // Filtra immobili venduti — non si possono visitare
  const filtered=indices.filter(i=>{
    const im=D.immobili[i];
    if(!im) return false;
    return (im.stato||'').toLowerCase()!=='venduto';
  });
  if(filtered.length===0){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text3);font-size:0.85rem">Nessun immobile disponibile per una visita</div>';return;}
  grid.innerHTML=filtered.map(i=>{
    const im=D.immobili[i];
    if(!im) return '';
    const foto=im.foto||'';
    const prezzo=im.prezzoRich?'€'+parseFloat(im.prezzoRich).toLocaleString('it-IT'):'—';
    const stato=im.stato||'attivo';
    const statoColor=stato==='attivo'?'#10B981':stato==='proposta'?'#F59E0B':stato==='venduto'?'#6366F1':'#94A3B8';
    const statoLabel=stato==='attivo'?'Attivo':stato==='proposta'?'Proposta':stato==='venduto'?'Venduto':stato;
    const mq=im.mqTot?im.mqTot+'m²':'';
    const local=im.locali?im.locali+' loc.':'';
    return `<div onclick="visGoStep2(${i})" style="border:2px solid #E2E8F0;border-radius:12px;overflow:hidden;cursor:pointer;transition:all .18s;background:white" onmouseover="this.style.borderColor='#2563EB';this.style.boxShadow='0 4px 14px rgba(37,99,235,.18)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#E2E8F0';this.style.boxShadow='none';this.style.transform='none'">
      <div style="height:140px;background:${foto?'url('+foto+') center/cover no-repeat':'linear-gradient(135deg,#CBD5E1,#94A3B8)'};position:relative;border-bottom:1px solid #E2E8F0">
        ${!foto?'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:white;opacity:.7"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>':''}
        <div style="position:absolute;top:8px;left:8px;background:${statoColor};color:white;font-size:0.62rem;font-weight:800;padding:3px 8px;border-radius:10px;letter-spacing:.5px;box-shadow:0 1px 3px rgba(0,0,0,.2)">${statoLabel.toUpperCase()}</div>
        ${im.ref?`<div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.7);color:white;font-size:0.68rem;font-weight:700;padding:3px 7px;border-radius:6px">#${im.ref}</div>`:''}
      </div>
      <div style="padding:10px 12px">
        <div style="font-weight:800;font-size:0.88rem;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${im.tipo||'Immobile'}</div>
        <div style="font-size:0.78rem;color:#3B82F6;font-weight:600;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${im.comune||'—'}${im.zona?' · '+im.zona:''}</div>
        ${im.indirizzo?`<div style="font-size:0.72rem;color:var(--text3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${im.indirizzo}</div>`:''}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:7px;padding-top:7px;border-top:1px solid #F1F5F9">
          <div style="font-size:0.85rem;font-weight:800;color:#0F172A">${prezzo}</div>
          <div style="font-size:0.7rem;color:var(--text3);font-weight:600">${[mq,local].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function visGoStep2(immIdx){
  const im=D.immobili[immIdx];
  if(!im) return;
  document.getElementById('vis-step1').style.display='none';
  document.getElementById('vis-step2').style.display='block';
  document.getElementById('vis-save-btn').style.display='';
  document.getElementById('vis-imm-ref').value=immIdx;
  document.getElementById('vis-ref').value=im.ref||immIdx;
  // Recap banner
  const foto=im.foto||'';
  const fotoEl=document.getElementById('vis-recap-foto');
  if(fotoEl){fotoEl.style.background=foto?`url(${foto}) center/cover no-repeat`:'linear-gradient(135deg,#CBD5E1,#94A3B8)';}
  const t=document.getElementById('vis-recap-titolo');
  if(t)t.textContent=(im.tipo||'Immobile')+(im.comune?' — '+im.comune:'');
  const s=document.getElementById('vis-recap-sub');
  if(s)s.textContent=[im.ref?'#'+im.ref:'',im.indirizzo,im.prezzoRich?'€'+parseFloat(im.prezzoRich).toLocaleString('it-IT'):''].filter(Boolean).join(' · ');
  // Default intelligente Agente: solo per NUOVA visita e se non già impostato.
  // 1) agente dell'immobile (agenteRef)  2) utente loggato (_currentUser.nome)
  try{
    const _agEl=document.getElementById('vis-agente-ref');
    const _isNew=!(D.editIdx!==null && D.editType==='visita');
    if(_agEl && _isNew && !_agEl.value){
      let _set=false;
      if(im.agenteRef!==undefined && im.agenteRef!==null && im.agenteRef!==''){
        const _ix=parseInt(im.agenteRef);
        if(!isNaN(_ix) && D.agenti && D.agenti[_ix]){ _agEl.value=String(_ix); _set=true; }
      }
      if(!_set && typeof _currentUser!=='undefined' && _currentUser && _currentUser.nome){
        const _ui=(D.agenti||[]).findIndex(a=>a&&(a.nome||'')===_currentUser.nome);
        if(_ui>=0){ _agEl.value=String(_ui); _set=true; }
      }
    }
  }catch(e){}

  /* ── MULTI-VISITA: se sessione attiva, riapplica cliente/data/ora/agente ── */
  try{
    if(window._multiVisSession && window._multiVisSession.active){
      _visApplyKeptData();
    }
  }catch(e){}
}

function visBackToStep1(){
  document.getElementById('vis-step1').style.display='block';
  document.getElementById('vis-step2').style.display='none';
  document.getElementById('vis-save-btn').style.display='none';
  renderVisitaImmGrid(D.immobili.map((_,i)=>i));
}

function openVisitaForImm(immIdx){
  openVisita();
  // Dopo openModal, vai direttamente allo step 2
  setTimeout(()=>visGoStep2(immIdx),50);
  if(D.schedaCliIdx!==null && D.clienti[D.schedaCliIdx]){
    const cl=D.clienti[D.schedaCliIdx];
    if(cl.tipo==='acquirente'||cl.tipo==='entrambi'){
      const csel=document.getElementById('vis-cli-ref');
      if(csel){setTimeout(()=>{csel.value=D.schedaCliIdx;fillVisitaCli();},60);}
    }
  }
}
function fillVisitaImm(){/* legacy - ora gestito da visGoStep2 */}
function fillVisitaCli(){const idx=document.getElementById('vis-cli-ref').value;if(idx!==''&&D.clienti[parseInt(idx)]){document.getElementById('vis-cliente').value=D.clienti[parseInt(idx)].nome||'';document.getElementById('vis-tel').value=D.clienti[parseInt(idx)].tel||'';}}
function editVisita(i){openVisita(i);}
function saveVisita(){
  try{
    if(D.immobili.length===0){alert('Nessun immobile presente. Carica prima un immobile.');return;}
    /* Flag per il flusso multi-immobile: true se è una nuova visita */
    window._visIsNewSave = !(D.editIdx!==null && D.editType==='visita');
    const g=id=>{const el=document.getElementById(id);return el?el.value:'';};
    const immIdx=g('vis-imm-ref');
    if(immIdx===''||immIdx===null){alert('Seleziona un immobile dalla lista prima di salvare.');return;}
    const im=D.immobili[parseInt(immIdx)];
    // Agente obbligatorio: senza di esso le statistiche per agente restano a zero
    const _agChk=g('vis-agente-ref');
    if(_agChk===''||_agChk===null){
      const _ae=document.getElementById('vis-agente-ref');
      if(_ae){ _ae.style.borderColor='#EF4444'; _ae.focus(); setTimeout(()=>{_ae.style.borderColor='';},3000); }
      alert("Seleziona l'agente che ha effettuato la visita.\n\nÈ un dato obbligatorio: serve per le statistiche per agente.");
      return;
    }
    const cliRef=g('vis-cli-ref');
    // Auto-fill cliente from rubrica if selected
    let cliente=g('vis-cliente');
    let tel=g('vis-tel');
    if(cliRef!==''&&D.clienti[parseInt(cliRef)]){
      const c=D.clienti[parseInt(cliRef)];
      cliente=cliente||c.nome||'';
      tel=tel||c.tel||'';
    }
    const v={
      immRef:parseInt(immIdx),
      immTitolo:im?(im.tipo||'')+(im.comune?' — '+im.comune:''):'',
      ref:g('vis-ref')||(im&&im.ref?im.ref:immIdx),
      data:g('vis-data')||today(),
      ora:g('vis-ora'),
      cliRef:cliRef!==''?parseInt(cliRef):'',
      cliente,
      tel,
      agenzia:g('vis-agenzia'),
      esito:g('vis-esito')||'IN ATTESA',
      feedback:g('vis-feedback'),
      note:g('vis-note')
    };
    // ── Agente che ha effettuato la visita ──
    const _agRefRaw=g('vis-agente-ref');
    if(_agRefRaw!==''&&_agRefRaw!==null&&!isNaN(parseInt(_agRefRaw))){
      const _agIx=parseInt(_agRefRaw);
      v.agenteRef=_agIx;
      v.agente=(D.agenti&&D.agenti[_agIx]&&D.agenti[_agIx].nome)?D.agenti[_agIx].nome:'';
    } else {
      v.agenteRef='';
      v.agente='';
    }
    if(D.editIdx!==null&&D.editType==='visita'){
      /* ─── TIMELINE: cambio esito visita ─── */
      try{
        var _oldV = D.visite[D.editIdx] || {};
        var _oldEs = (_oldV.esito||'').trim();
        var _newEs = (v.esito||'').trim();
        if(_oldEs && _newEs && _oldEs !== _newEs){
          var _relV = [];
          if(v.immRef===0 || v.immRef) _relV.push({t:'immobile', id: parseInt(v.immRef)});
          if(v.cliRef===0 || v.cliRef) _relV.push({t:'cliente', id: parseInt(v.cliRef)});
          /* Logghiamo sull'immobile (refType principale) con relIds al cliente */
          _tlLog('visita_esito', 'immobile', parseInt(v.immRef),
            'Esito visita aggiornato: '+_oldEs+' → '+_newEs,
            { esito: _newEs, esitoPrec: _oldEs, cliente: v.cliente, data: v.data },
            { relIds: (v.cliRef===0||v.cliRef) ? [{t:'cliente', id: parseInt(v.cliRef)}] : [] });
        }
      }catch(_e){ }
      D.visite[D.editIdx]=v;
    } else {
      D.visite.push(v);
      /* ─── TIMELINE: nuova visita ─── */
      try{
        var _relCreate = (v.cliRef===0||v.cliRef) ? [{t:'cliente', id: parseInt(v.cliRef)}] : [];
        _tlLog('visita_creata', 'immobile', parseInt(v.immRef),
          'Visita programmata'+(v.data?' per il '+v.data.split('-').reverse().join('/'):'')+(v.cliente?' con '+v.cliente:''),
          { cliente: v.cliente, data: v.data, ora: v.ora, esito: v.esito, agente: v.agente },
          { relIds: _relCreate });
      }catch(_e){ }
    }
    // Log CRM automatico per il cliente collegato
    if(v.cliRef!==''&&v.cliRef!==undefined){
      var _crmTxt='Visita immobile: '+(v.immTitolo||v.ref||'')
        +(v.data?' del '+v.data.split('-').reverse().join('/'):'')
        +(v.esito?' — Esito: '+v.esito:'')
        +(v.note?' — Note: '+v.note:'');
      crmLogAuto(parseInt(v.cliRef),'Visita',_crmTxt);
    }
    saveD();

    /* Determina se era una nuova visita (flag impostato a inizio save) */
    var isNewVisita = !!window._visIsNewSave;
    window._visIsNewSave = false;

    /* ════════════════════════════════════════════════════════════════
       ESITO NEGATIVO → proponi di caricare il cliente in RICHIESTE.
       Logica commerciale: un cliente che rifiuta un immobile resta un
       potenziale acquirente per immobili futuri in linea con le sue
       esigenze. Si attiva solo su NUOVA visita con esito RIFIUTATO o
       SCONOSCIUTO e quando c'è un nominativo (cliente in rubrica o nome).*/
    var _esitoUp = (v.esito||'').trim().toUpperCase();
    var _esitoNegativo = (_esitoUp==='RIFIUTATO' || _esitoUp==='SCONOSCIUTO');
    if(isNewVisita && _esitoNegativo && (v.cliente||'').trim()){
      var _vCopy = v;
      var _msg = '<div style="text-align:left">'
        + '<div style="margin-bottom:10px">Visita registrata con esito <strong>'+v.esito+'</strong> per <strong>'+(v.cliente||'cliente')+'</strong>.</div>'
        + '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 12px;font-size:0.84rem;color:#92400E">'
        + 'Un cliente che ha rifiutato un immobile resta un <strong>potenziale acquirente</strong> per immobili futuri.<br>'
        + '<span style="font-size:0.78rem;color:#78350F">Vuoi caricarlo in <strong>Richieste</strong> con le preferenze pre-compilate da questa visita?</span>'
        + '</div></div>';
      if(typeof dlgConfirm==='function'){
        dlgConfirm(_msg, 'No, grazie', 'Sì, crea richiesta').then(function(vai){
          if(vai){
            // chiudi il modale visita e apri quello richiesta precompilato
            try{ closeModal('modal-visita'); }catch(_){}
            window._multiVisSession = null;
            renderVisite(); updateBadges();
            _richiestaDaVisita(_vCopy);
          } else {
            // prosegui col normale flusso (eventuale multi-immobile)
            _saveVisitaContinua(_vCopy, isNewVisita);
          }
        });
        return; // sospendi: la scelta arriva dal dialog
      } else {
        if(confirm('Caricare '+(v.cliente||'il cliente')+' in Richieste? Un cliente che ha rifiutato resta attivo per immobili futuri.')){
          try{ closeModal('modal-visita'); }catch(_){}
          window._multiVisSession = null; renderVisite(); updateBadges();
          _richiestaDaVisita(_vCopy);
          return;
        }
      }
    }
    _saveVisitaContinua(v, isNewVisita);
    return;
  }catch(err){alert('Errore salvataggio visita: '+err.message);console.error(err);}
}

/* Prosegue il salvataggio visita col flusso multi-immobile (estratto da
   saveVisita per poter essere richiamato dopo il dialog "carica in Richieste"). */
function _saveVisitaContinua(v, isNewVisita){
  try{
    // Inizializza/aggiorna sessione multi-visita
    if(!window._multiVisSession) window._multiVisSession = { active: false, immVisitati: [] };
    const sess = window._multiVisSession;

    if(isNewVisita){
      // Segna immobile come "già visitato in questa sessione"
      if(sess.immVisitati.indexOf(v.immRef) < 0) sess.immVisitati.push(v.immRef);

      // Conta immobili ancora disponibili (non venduti, non già visitati in questa sessione)
      const immDisponibili = D.immobili.map((im,ii)=>({im,ii})).filter(({im,ii})=>{
        if(!im) return false;
        if((im.stato||'').toLowerCase()==='venduto') return false;
        if(sess.immVisitati.indexOf(ii) >= 0) return false;
        return true;
      });

      if(immDisponibili.length > 0 && typeof dlgConfirm === 'function'){
        // Dati che vogliamo mantenere per il prossimo immobile
        const datiMantenuti = {
          data: v.data, ora: v.ora,
          cliRef: v.cliRef, cliente: v.cliente, tel: v.tel,
          agenzia: v.agenzia,
          agenteRef: v.agenteRef, agente: v.agente
        };
        const cliNome = v.cliente || 'cliente';
        const altriPossibili = immDisponibili.length;
        const visCount = sess.immVisitati.length;
        const msg = `<div style="text-align:left">
          <div style="margin-bottom:10px"><strong>${visCount} visit${visCount===1?'a salvata':'e salvate'}</strong> per <strong>${cliNome}</strong> il ${v.data?v.data.split('-').reverse().join('/'):''}.</div>
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:10px 12px;font-size:0.84rem;color:#1E3A8A">
            Vuoi aggiungere un'<strong>altra visita</strong> per lo stesso cliente nella stessa giornata?<br>
            <span style="font-size:0.76rem;color:#475569">Cliente, agente, data e ora saranno mantenuti. Sceglierai solo l'immobile successivo. (${altriPossibili} immobil${altriPossibili===1?'e disponibile':'i disponibili'})</span>
          </div>
        </div>`;
        dlgConfirm(msg, 'No, ho finito', 'Sì, aggiungi un altro immobile').then(addAnother=>{
          if(addAnother){
            sess.active = true;
            sess.datiMantenuti = datiMantenuti;
            _visStartNewForSameClient();
          } else {
            // Fine sessione multi-visita: reset e chiusura normale
            window._multiVisSession = null;
            _visFinalCloseAndRefresh(v);
          }
        });
        return; // Importante: NON chiudere il modal subito
      }
    }

    // Default: chiudi e refresh (modifica o nessun altro immobile disponibile)
    window._multiVisSession = null;
    _visFinalCloseAndRefresh(v);
  }catch(err){alert('Errore salvataggio visita: '+err.message);console.error(err);}
}

/* Chiusura standard del modal visita + refresh viste */
function _visFinalCloseAndRefresh(v){
    closeModal('modal-visita');
    // Always update schedaCliIdx to the client in this visita
    if(v.cliRef!=='' && v.cliRef!==undefined){
      D.schedaCliIdx = parseInt(v.cliRef);
    }
    // Refresh view and keep scheda-cliente in sync
    if(curSection==='scheda-cliente'){
      if(D.schedaCliIdx!==null) renderSchedaCliente(D.schedaCliIdx);
    } else if(curSection==='scheda-immobile' && D.reportImmIdx!==null){
      renderSchedaImmobile(D.reportImmIdx);
      // Also flag scheda-cliente for re-render on next visit
    } else {
      // From 'visite' or anywhere else: render visite AND navigate to scheda-cliente if we have one
      renderVisite();
      if(v.cliRef!=='' && v.cliRef!==undefined){
        const cliNome=D.clienti[parseInt(v.cliRef)]?.nome||'cliente';
        // Show a toast notification with link to scheda cliente
        showToast(` Visita salvata per <strong>${cliNome}</strong>`,
          ()=>{ D.schedaCliIdx=parseInt(v.cliRef); go('scheda-cliente'); },
          'Vai alla scheda');
      }
    }
    updateBadges();
}

/* Prepara il modal per un'altra visita dello STESSO cliente nella stessa giornata.
   Mantiene cliente/agente/data/ora, resetta i dati specifici dell'immobile,
   torna allo step 1 escludendo gli immobili già visitati in questa sessione. */
function _visStartNewForSameClient(){
  try{
    const sess = window._multiVisSession;
    if(!sess || !sess.datiMantenuti){ return; }
    const d = sess.datiMantenuti;

    // Torna allo step 1 (picker)
    document.getElementById('vis-step1').style.display='block';
    document.getElementById('vis-step2').style.display='none';
    document.getElementById('vis-save-btn').style.display='none';
    document.getElementById('mt-vis').textContent='Nuova Visita (stesso cliente)';

    // Pulisci campi specifici dell'immobile
    var clearIds = ['vis-imm-ref','vis-imm-search','vis-esito','vis-feedback','vis-note','vis-ref'];
    clearIds.forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
    // Reset esito al default
    var esEl = document.getElementById('vis-esito'); if(esEl) esEl.value='IN ATTESA';

    // Renderizza la grid escludendo immobili già visitati in questa sessione
    const tuttiIdx = D.immobili.map((_,i)=>i);
    const disponibili = tuttiIdx.filter(function(i){
      return sess.immVisitati.indexOf(i) < 0;
    });
    renderVisitaImmGrid(disponibili);

    // Banner informativo in cima allo step 1
    var step1 = document.getElementById('vis-step1');
    var existingBanner = document.getElementById('vis-multi-banner');
    if(existingBanner) existingBanner.remove();
    if(step1){
      var banner = document.createElement('div');
      banner.id = 'vis-multi-banner';
      banner.style.cssText = 'margin:12px 16px 0;padding:10px 14px;background:linear-gradient(135deg,#F0FDF4,#DCFCE7);border:1.5px solid #86EFAC;border-radius:10px;font-size:0.82rem;color:#15803D;display:flex;align-items:center;gap:10px';
      banner.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        + '<div style="flex:1"><strong>'+sess.immVisitati.length+' visit'+(sess.immVisitati.length===1?'a registrata':'e registrate')+'</strong> per <strong>'+(d.cliente||'cliente')+'</strong>'
        + (d.data?' il '+d.data.split('-').reverse().join('/'):'')
        + '. Scegli il prossimo immobile da visitare.</div>'
        + '<button onclick="_visEndMultiSession()" style="background:white;border:1.5px solid #86EFAC;color:#15803D;padding:6px 12px;border-radius:7px;font-size:0.76rem;font-weight:700;cursor:pointer;white-space:nowrap">Termina</button>';
      _safeInsertBefore(step1, banner, step1.firstChild);
    }

    // Quando l'utente sceglierà un immobile (visGoStep2), i dati cliente/data/ora/agente
    // verranno ri-applicati da _visApplyKeptData (chiamata da visGoStep2 se sessione attiva)
  }catch(e){ console.warn('[MultiVis] startNew KO:', e); }
}
try{ window._visStartNewForSameClient = _visStartNewForSameClient; }catch(e){}

/* Termina la sessione multi-visita senza aggiungere altre visite */
function _visEndMultiSession(){
  window._multiVisSession = null;
  closeModal('modal-visita');
  if(typeof renderVisite==='function') renderVisite();
  if(D.schedaCliIdx!==null && typeof renderSchedaCliente==='function' && curSection==='scheda-cliente'){
    renderSchedaCliente(D.schedaCliIdx);
  }
  updateBadges();
}
try{ window._visEndMultiSession = _visEndMultiSession; }catch(e){}

/* Riapplica i dati mantenuti (cliente/data/ora/agente) dopo che l'utente
   ha scelto il prossimo immobile in modalità multi-visita. */
function _visApplyKeptData(){
  try{
    const sess = window._multiVisSession;
    if(!sess || !sess.active || !sess.datiMantenuti) return;
    const d = sess.datiMantenuti;
    const set = function(id, val){ var el = document.getElementById(id); if(el && val!==undefined && val!==null) el.value = val; };
    set('vis-data',     d.data || today());
    set('vis-ora',      d.ora || '');
    set('vis-cli-ref',  (d.cliRef!==''&&d.cliRef!==undefined)?String(d.cliRef):'');
    set('vis-cliente',  d.cliente || '');
    set('vis-tel',      d.tel || '');
    set('vis-agenzia',  d.agenzia || '');
    set('vis-agente-ref', (d.agenteRef!==''&&d.agenteRef!==undefined&&d.agenteRef!==null)?String(d.agenteRef):'');
  }catch(e){ console.warn('[MultiVis] applyKept KO:', e); }
}
try{ window._visApplyKeptData = _visApplyKeptData; }catch(e){}
function delVisita(i){
  if(!hasPermission('visite.delete')&&!hasPermission('immobili.delete')){ if(typeof showToast==='function') showToast('Eliminazione non consentita per il tuo ruolo','','#DC2626'); return; }
  if(confirm('Eliminare questa visita?')){
    D.visite.splice(i,1);
    saveD();
    refreshCurrentView();
  }
}
// ── Dropdown custom "Tutti gli immobili" in sezione Visite ──────────────────
function visImmBuild(){
  var dd = document.getElementById('vis-imm-dropdown');
  if(!dd) return;
  // Riga "Tutti"
  var html = '<div onclick="visImmSelect(\'\',\'\',\'Tutti gli immobili\')" style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid #F1F5F9;font-size:0.83rem;font-weight:700;color:var(--text3)" onmouseover="this.style.background=\'#F8FAFC\'" onmouseout="this.style.background=\'white\'">'
    + '<div style="width:42px;height:32px;background:#F1F5F9;border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#CBD5E1">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>'
    + '</div>'
    + '<span>Tutti gli immobili</span>'
    + '</div>';
  // Una riga per ogni immobile — escludi venduti e archiviati
  D.immobili.forEach(function(im, i){
    var st = (im.stato||'').toLowerCase();
    if(st==='venduto'||st==='affittato'||st==='archiviato'||st==='non attivo') return;
    // Escludi anche se ha una pratica con stato vendita/revoca
    var pratVenduta = (D.pratiche||[]).some(function(p){
      return String(p.immRef)===String(i) && (p.stato==='vendita'||p.stato==='revoca');
    });
    if(pratVenduta) return;
    var label = '(' + (im.ref||i) + ') ' + (im.tipo||'') + ' — ' + (im.comune||'');
    var fotoHtml = im.foto
      ? '<img src="'+im.foto+'" style="width:42px;height:32px;object-fit:cover;border-radius:5px;flex-shrink:0;display:block" loading="lazy">'
      : '<div style="width:42px;height:32px;background:#F1F5F9;border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#CBD5E1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div>';
    var prezzo = im.prezzo ? ' · €'+Number(im.prezzo).toLocaleString('it-IT') : '';
    var safeLabel = label.replace(/'/g, "\\'");
    var safeFoto  = (im.foto||'').replace(/'/g, "\\'");
    html += '<div onclick="visImmSelect(\''+i+'\',\''+safeFoto+'\',\''+safeLabel+'\')" '
      + 'style="display:flex;align-items:center;gap:10px;padding:7px 12px;cursor:pointer;border-bottom:1px solid #F8FAFC" '
      + 'onmouseover="this.style.background=\'#EFF6FF\'" onmouseout="this.style.background=\'white\'">'
      + fotoHtml
      + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:0.8rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + label + '</div>'
        + '<div style="font-size:0.68rem;color:var(--text3);margin-top:1px">' + (im.mq?im.mq+'m²':'') + (im.camere?' · '+im.camere+' cam':'') + prezzo + '</div>'
      + '</div>'
      + '</div>';
  });
  dd.innerHTML = html;
}

function visImmToggle(){
  var dd = document.getElementById('vis-imm-dropdown');
  if(!dd) return;
  if(dd.style.display === 'none'){
    visImmBuild();
    dd.style.display = 'block';
    // Chiudi cliccando fuori
    setTimeout(function(){
      document.addEventListener('click', visImmOutside, {once:true});
    }, 10);
  } else {
    dd.style.display = 'none';
  }
}

function visImmOutside(e){
  var picker = document.getElementById('vis-imm-picker');
  if(picker && !picker.contains(e.target)){
    var dd = document.getElementById('vis-imm-dropdown');
    if(dd) dd.style.display = 'none';
  } else {
    // Riattacca listener se il click era dentro il picker ma non su un'opzione
    setTimeout(function(){
      document.addEventListener('click', visImmOutside, {once:true});
    }, 10);
  }
}

function visImmSelect(val, foto, label){
  // Aggiorna campo hidden
  var hidden = document.getElementById('f-vis-imm');
  if(hidden) hidden.value = val;
  // Aggiorna pulsante
  var btnLabel = document.getElementById('vis-imm-btn-label');
  var btnFoto  = document.getElementById('vis-imm-btn-foto');
  if(btnLabel) { btnLabel.textContent = label; btnLabel.style.color = val ? 'var(--text)' : 'var(--text3)'; }
  if(btnFoto){
    if(foto){
      btnFoto.innerHTML = '<img src="'+foto+'" style="width:28px;height:22px;object-fit:cover;border-radius:4px;display:block">';
    } else {
      btnFoto.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>';
    }
  }
  // Chiudi dropdown e filtra
  var dd = document.getElementById('vis-imm-dropdown');
  if(dd) dd.style.display = 'none';
  renderVisite();
}
// ─────────────────────────────────────────────────────────────────────────────


/* Recupera il telefono della visita: se non è salvato sulla visita, lo cerca
   nel cliente collegato (per cliRef, poi per nome). Così il numero presente
   in anagrafica appare nel registro anche per le visite vecchie. */
function _visTelefono(v){
  if(!v) return '';
  if(v.tel && String(v.tel).trim()) return String(v.tel).trim();
  try{
    /* per riferimento cliente */
    if(v.cliRef!=='' && v.cliRef!=null && D.clienti && D.clienti[parseInt(v.cliRef)]){
      var c=D.clienti[parseInt(v.cliRef)];
      if(c && c.tel) return String(c.tel).trim();
    }
    /* per nome cliente (match esatto, case-insensitive) */
    if(v.cliente && D.clienti){
      var nrm=function(s){return String(s||'').trim().toLowerCase().replace(/\s+/g,' ');};
      var found=D.clienti.find(function(c){ return c && nrm(c.nome)===nrm(v.cliente); });
      if(found && found.tel) return String(found.tel).trim();
    }
    /* ULTIMO fallback: cerca il numero in un'ALTRA visita dello stesso cliente
       (stesso nome). Risolve i clienti non in archivio che hanno fatto più
       visite: se il numero è su una, appare su tutte. */
    if(v.cliente && Array.isArray(D.visite)){
      var nrm2=function(s){return String(s||'').trim().toLowerCase().replace(/\s+/g,' ');};
      var alt=D.visite.find(function(x){ return x && x!==v && x.tel && String(x.tel).trim() && nrm2(x.cliente)===nrm2(v.cliente); });
      if(alt) return String(alt.tel).trim();
    }
  }catch(e){}
  return '';
}

/* Deduce il sesso (M/F) dal nome di battesimo, con una lista di nomi italiani
   comuni. Prende l'ULTIMA parola del nome completo come nome proprio (perché
   in archivio i nomi sono spesso "COGNOME Nome"). Se il nome non è in lista o
   è ambiguo, restituisce '' (nessun titolo → messaggio col nome completo).
   Regola pratica per ambigui italiani: "Andrea", "Simone", "Nicola", "Luca"
   sono trattati come maschili (uso italiano prevalente). */
var _NOMI_F = ['anna','maria','giovanna','rosa','angela','giuseppina','teresa','lucia','carmela','caterina','francesca','antonietta','anna maria','carla','elena','concetta','rita','margherita','franca','paola','laura','giulia','sara','valentina','federica','martina','chiara','alessia','ilaria','silvia','claudia','daniela','patrizia','simona','stefania','cristina','barbara','monica','roberta','alessandra','manuela','raffaella','viviana','vincenza','filomena','assunta','immacolata','carmen','veronica','deborah','debora','erika','jessica','vanessa','sabrina','tiziana','loredana','antonella','marianna','emanuela','gabriella','gaetana','grazia','ida','luigia','nunzia','pasqualina','rosaria','serena','sonia','ester','esther','gemma','giada','noemi','aurora','ginevra','beatrice','eleonora','arianna','michela','nicoletta','fabiola','flora','fortuna','luisa','lidia','wanda','iolanda','rachele','miriam','elisa','elisabetta','isabella','matilde','rebecca','vittoria','alice','emma','sofia','greta','ludovica','bianca','diana','irene','nadia','morena','carlotta','asia','melissa','denise','samantha','katia','cinzia','rossella','pina','mena'];
var _NOMI_M = ['giuseppe','antonio','giovanni','mario','luigi','francesco','angelo','vincenzo','pietro','salvatore','carmine','carlo','franco','domenico','bruno','paolo','michele','giorgio','aldo','sergio','luciano','marco','roberto','maurizio','massimo','stefano','alessandro','andrea','luca','matteo','lorenzo','davide','simone','fabio','emanuele','gabriele','riccardo','federico','nicola','pasquale','raffaele','gennaro','ciro','alfonso','biagio','cosimo','donato','elia','ernesto','fedele','gaetano','gerardo','giacomo','gianluca','gianni','ivan','leonardo','manuel','mattia','maurizio','nunzio','oreste','osvaldo','pierpaolo','pierluigi','rocco','sabato','samuele','saverio','tommaso','umberto','valerio','walter','christian','cristian','daniele','dario','diego','edoardo','enrico','fabrizio','filippo','giovanbattista','giovambattista','ignazio','alberto','alessio','claudio','cesare','cristiano','emilio','ettore','giulio','guido','marcello','renato','rosario','vito','armando','arturo','attilio','benito','corrado','egidio','fortunato','geremia','girolamo','graziano','ilario','italo','lino','marino','massimiliano','patrizio','remo','silvano','vittorio'];
function _visSessoDaNome(nomeCompleto){
  try{
    var parti = String(nomeCompleto||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if(!parti.length) return '';
    /* provo sia l'ultima sia la prima parola come nome proprio */
    var candidati = [];
    if(parti.length>=2){ candidati.push(parti[parti.length-1]); candidati.push(parti[0]); }
    else candidati.push(parti[0]);
    for(var i=0;i<candidati.length;i++){
      var nm = candidati[i];
      if(_NOMI_F.indexOf(nm)>-1) return 'F';
      if(_NOMI_M.indexOf(nm)>-1) return 'M';
    }
    /* euristica finale: nomi che finiscono in 'a' spesso femminili, ma con
       eccezioni note maschili → applico solo se non è tra le eccezioni */
    var eccezioniM = ['andrea','luca','nicola','elia','mattia','battista','enea','geronima'];
    var ultimo = parti[parti.length-1];
    if(ultimo && ultimo.length>2){
      if(eccezioniM.indexOf(ultimo)>-1) return 'M';
      if(ultimo.charAt(ultimo.length-1)==='a') return 'F';
      if(ultimo.charAt(ultimo.length-1)==='o') return 'M';
    }
  }catch(e){}
  return '';
}

/* Pulsante WhatsApp per chiedere l'esito quando la visita è IN ATTESA */
function _visWaAttesa(v){
  try{
    var tel = _visTelefono(v);
    if(!tel) return '';
    if(String(v.esito||'').toUpperCase().indexOf('ATTESA') < 0) return '';
    var n = String(tel).replace(/\D/g,'');
    if(n.indexOf('39')===0){} else if(n.length===10||n.length===9){ n='39'+n; }
    if(!n) return '';

    /* ── Costruzione messaggio personalizzato ──
       "Salve Sig.ra ACAMPORA, sono Vincenzo Carnicelli della FRIMM CAPITAL
        CASA PAESTUM. Volevo sapere come è andata la visita dell'immobile di
        Via Madonna del Carmine di Agropoli? Mi faccia sapere se è di suo
        interesse. Grazie!" */
    var nomeCompleto = String(v.cliente||'').trim();

    /* Sesso: 1) dalla scheda cliente (certo); 2) se manca, provo a dedurlo dal
       nome di battesimo con una lista di nomi italiani comuni; 3) se resta
       incerto, niente titolo (uso il nome completo, così non sbaglio). */
    var sesso = '';
    try{
      if(nomeCompleto && Array.isArray(D.clienti)){
        var nrm = function(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); };
        var cl = D.clienti.find(function(c){ return c && nrm(c.nome)===nrm(nomeCompleto); });
        if(cl && cl.sesso) sesso = cl.sesso;
      }
    }catch(e){}
    if(!sesso){ sesso = _visSessoDaNome(nomeCompleto); }

    var titolo = sesso==='F' ? 'Sig.ra ' : sesso==='M' ? 'Sig. ' : '';
    var appellativo;
    if(titolo){
      var cognome = nomeCompleto.split(' ')[0] || nomeCompleto;
      appellativo = titolo + cognome;
    } else {
      appellativo = nomeCompleto;
    }

    var agente  = (typeof getNomeAgente==='function')  ? (getNomeAgente()||'')  : '';
    var agenzia = (typeof getNomeAgenzia==='function') ? (getNomeAgenzia()||'') : '';

    /* Immobile come indirizzo: recupero l'immobile dall'anagrafica via immRef
       e costruisco "di <indirizzo> di <comune>". Se manca l'indirizzo,
       ripiego su zona o sul titolo ripulito dalla tipologia. */
    var immFrase = '';
    try{
      var im = null;
      if((v.immRef===0 || v.immRef) && Array.isArray(D.immobili)) im = D.immobili[parseInt(v.immRef)];
      if(im){
        var via = (im.indirizzo||'').trim() || (im.zona||'').trim();
        var com = (im.comune||'').trim();
        if(via && com) immFrase = 'di ' + via + ' di ' + com;
        else if(via)   immFrase = 'di ' + via;
        else if(com)   immFrase = 'di ' + com;
      }
      if(!immFrase){
        /* fallback: dal titolo "Appartamento — Agropoli" tolgo la tipologia */
        var t = String(v.immTitolo || v.immobile || '').trim();
        var parti = t.split('—');
        var coda = (parti.length>1 ? parti[parti.length-1] : t).trim();
        if(coda) immFrase = 'di ' + coda;
      }
    }catch(e){}

    var msg = 'Salve';
    if(appellativo) msg += ' ' + appellativo;
    msg += ',';
    if(agente)  msg += ' sono ' + agente;
    if(agenzia) msg += ' della ' + agenzia;
    msg += '. Volevo sapere come è andata la visita';
    if(immFrase) msg += " dell'immobile " + immFrase;
    msg += '? Mi faccia sapere se è di suo interesse. Grazie!';

    var url = 'https://wa.me/'+n+'?text='+encodeURIComponent(msg);
    return '<a href="'+url+'" target="_blank" title="Chiedi l\'esito via WhatsApp" '
      + 'style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;background:#1A7A4A;color:#fff;padding:2px 8px;border-radius:7px;font-size:0.66rem;font-weight:700;text-decoration:none;vertical-align:middle">'
      + '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.5 15.3L2 22l4.8-1.4A10 10 0 1012 2z"/></svg>WhatsApp</a>';
  }catch(e){ return ''; }
}

function renderVisite(){
  const q=(document.getElementById('f-vis-q').value||'').toLowerCase();
  const esito=document.getElementById('f-vis-esito').value;
  const immF=document.getElementById('f-vis-imm').value;
  const ord=document.getElementById('f-vis-ord')?.value||'data-desc';
  // Costruisce il dropdown custom immobili (sempre aggiornato)
  visImmBuild();
  // Filtra
  let sorted=[...D.visite].map((v,origIdx)=>({v,origIdx}));
  sorted=sorted.filter(({v})=>{
    const t=[v.cliente,v.immTitolo,v.ref,v.agenzia,v.agente,v.note].join(' ').toLowerCase();
    return(!q||t.includes(q))&&(!esito||(v.esito||'').toUpperCase()===esito)&&(immF===''||String(v.immRef)===String(immF));
  });
  // Ordina
  sorted.sort(({v:a},{v:b})=>{
    if(ord==='data-asc')  return (a.data||'').localeCompare(b.data||'');
    if(ord==='data-desc') return (b.data||'').localeCompare(a.data||'');
    if(ord==='imm-asc')   return (a.immTitolo||a.ref||'').localeCompare(b.immTitolo||b.ref||'','it');
    if(ord==='imm-desc')  return (b.immTitolo||b.ref||'').localeCompare(a.immTitolo||a.ref||'','it');
    if(ord==='cliente-asc') return (a.cliente||'').localeCompare(b.cliente||'','it');
    if(ord==='esito-asc') return (a.esito||'').localeCompare(b.esito||'');
    return 0;
  });
  const f=sorted;
  const tbody=document.getElementById('vis-tbody');
  tbody.innerHTML=f.length?f.map(({v,origIdx},i)=>{
    const ri=origIdx;
    const immIdx=parseInt(v.immRef);
    const im=!isNaN(immIdx)?D.immobili[immIdx]:null;
    const foto=im?.foto||'';
    const fotoCell=foto
      ?`<td style="padding:4px 6px"><img src="${foto}" style="width:54px;height:42px;object-fit:cover;border-radius:7px;border:1px solid var(--border);display:block;cursor:pointer" onclick="openSchedaImmobile(${immIdx})" loading="lazy" title="${im?.tipo||''} — ${im?.comune||''}"></td>`
      :`<td style="padding:4px 6px"><div style="width:54px;height:42px;background:#F1F5F9;border-radius:7px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:#CBD5E1"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div></td>`;
    return`<tr>${fotoCell}<td style="color:var(--text3)">${i+1}</td><td style="font-weight:600;white-space:nowrap">${fmtD(v.data)}</td><td>${v.ora||'—'}</td><td style="cursor:pointer;color:var(--brand)" onclick="${im?`openSchedaImmobile(${immIdx})`:'void(0)'}">${v.immTitolo||v.ref||'—'}</td><td style="font-weight:600">${v.cliente||'—'}</td><td>${(function(){var _t=_visTelefono(v);return _t?`<a href="tel:${_t}" style="color:var(--brand)">${_t}</a>`:'—';})()}</td><td style="font-size:0.8rem;font-weight:600;color:var(--text2)">${v.agente||(v.agenteRef!==undefined&&v.agenteRef!==''&&D.agenti&&D.agenti[v.agenteRef]?D.agenti[v.agenteRef].nome:'')||'<span style=\'color:var(--red-l)\'>— da assegnare</span>'}</td><td style="font-size:0.8rem;color:var(--text3)">${v.agenzia||'—'}</td><td>${bEsito(v.esito)}${_visWaAttesa(v)}</td><td><span class="badge badge-gray" style="font-size:0.68rem">${v.feedback||'—'}</span></td><td class="note-cell">${v.note||'—'}</td><td><div class="actions-col"><button class="icon-btn" onclick="editVisita(${ri})" title="Modifica"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="icon-btn" onclick="delVisita(${ri})" style="color:var(--red-l)" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button></div></td></tr>`;
  }).join(''):'<tr><td colspan="13"><div class="empty-state"><div class="empty-icon"></div><p>Nessuna visita</p></div></td></tr>';
}


// ===== GESTIONE PRATICHE =====

// --- BRIDGE window ---
Object.assign(window, {
  openVisita, visShowStep1, filterVisitaImm, renderVisitaImmGrid, visGoStep2,
  visBackToStep1, openVisitaForImm, fillVisitaImm, fillVisitaCli, editVisita,
  saveVisita, _saveVisitaContinua, _visFinalCloseAndRefresh, _visStartNewForSameClient,
  _visEndMultiSession, _visApplyKeptData, delVisita, visImmBuild, visImmToggle,
  visImmOutside, visImmSelect, renderVisite,
});
export { renderVisite, openVisita, saveVisita, delVisita, openVisitaForImm };
