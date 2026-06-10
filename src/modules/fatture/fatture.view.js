// modules/fatture/fatture.view.js — modulo Fatture (contabilità).
//
// Estratto dal monolite (26382-27202): _fattEditIdx, EMITTENTE, getTotaleVoci,
// calcFattura, archivio clienti-fattura (_cliFatt*), openFatturaModal, saveFattura,
// accorpamento (openAccorpamento/eseguiAccorpamento/...), delFattura, renderFatture,
// renderRiepilogoForfettario, exportFattureXls, stampaFattura.
//
// SYNC PRIMA NOTA: saveFattura/delFattura chiamano pnSyncFattura/pnRemoveBySource,
// che restano nel monolite (sistema prima nota ancora accoppiato). Raggiunte via
// window — il sync continua a funzionare attraverso il bridge.
//
// _fattEditIdx ed EMITTENTE sono stato/costanti locali del modulo (usati solo qui).
// Dipendenze esterne (monolite via window): openModal, closeModal, saveD, showToast,
//   go, updateBadges, fmtD, fmtE, getNum, setNum, parseCurrStr, fmtCurrInput,
//   rawCurrInput, hasPermission, getImpFatturabile, dlgAlert, dlgConfirm, clearModal,
//   today, addFattPagamento, initPayWidget, getPayRows, recalcPay, renderProvvigioni,
//   pnSyncFattura, pnRemoveBySource. Per export/stampa: XLSX (writeFile), window.open.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

let _fattEditIdx = null;
const EMITTENTE = {
  nome: 'CARNICELLI VINCENZO',
  piva: '06383230650',
  cf: 'CRNVCN77H22A091J',
  indirizzo: "Via Salvo D'Acquisto, 15",
  cap: '84043',
  comune: 'Agropoli',
  prov: 'SA',
  codiceAttivita: '749999',
  regime: 'Forfetario'
};

function nextFattNumero(){
  const anno = new Date().getFullYear();
  // Usa il massimo progressivo esistente + 1 (robusto anche dopo eliminazioni)
  const existing = (D.fatture||[]).filter(f=>f.anno===anno);
  const maxN = existing.reduce((mx,f)=>{
    const n=parseInt((f.numero||'').split('/')[0])||0;
    return Math.max(mx,n);
  },0);
  return String(maxN+1).padStart(3,'0') + '/' + anno;
}

function addFattVoce(descr,imp){
  const list=document.getElementById('fatt-voci-list');
  if(!list)return;
  const row=document.createElement('div');
  row.className='fatt-voce-row';
  const d=document.createElement('input');
  d.className='fatt-voce-descr fatt-v-d';
  d.placeholder='Descrizione prestazione...';
  d.value=descr||'';
  d.addEventListener('input',calcFattura);
  const i=document.createElement('input');
  i.className='fatt-voce-imp fatt-v-i';
  i.placeholder='€ 0,00';
  i.value=imp||'';
  i.inputMode='decimal';
  i.addEventListener('focus',function(){rawCurrInput(this);});
  i.addEventListener('blur',function(){fmtCurrInput(this);calcFattura();});
  const del=document.createElement('button');
  del.type='button'; del.className='fatt-voce-del'; del.title='Rimuovi'; del.innerHTML='';
  del.addEventListener('click',function(){row.remove();calcFattura();});
  row.appendChild(d); row.appendChild(i); row.appendChild(del);
  list.appendChild(row);
}
function getFattVoci(){
  const list=document.getElementById('fatt-voci-list');
  if(!list)return[];
  const rows=list.querySelectorAll('.fatt-voce-row');
  const voci=[];
  rows.forEach(r=>{
    const d=r.querySelector('.fatt-v-d')?.value||'';
    const iRaw=r.querySelector('.fatt-v-i')?.value||'';
    const imp=parseCurrStr(iRaw.replace(/[€\s]/g,''));
    voci.push({descr:d,imp});
  });
  return voci;
}
function setFattVoci(voci){
  const list=document.getElementById('fatt-voci-list');
  if(!list)return;
  list.innerHTML='';
  (voci||[]).forEach(v=>addFattVoce(v.descr,v.imp?fmtE(v.imp).replace('€','').trim():''));
}
function getTotaleVoci(){
  return getFattVoci().reduce((s,v)=>s+(v.imp||0),0);
}
function calcFattura(){
  const imponibile = getTotaleVoci() || 0;
  // aggiorna hidden (per compatibilità saveFattura)
  const hidImp=document.getElementById('fatt-imponibile');
  if(hidImp){hidImp.setAttribute('data-raw',imponibile);hidImp.value=imponibile;}
  const hasBollo = document.getElementById('fatt-bollo')?.checked;
  const hasRitenuta = document.getElementById('fatt-ritenuta')?.checked;
  const bollo = hasBollo ? 2.00 : 0;
  const totLordo = imponibile + bollo;
  const ritenuta = hasRitenuta ? imponibile * 0.20 : 0;
  const netto = totLordo - ritenuta;
  setNum('fatt-tot-imponibile', imponibile);
  const bolloEl = document.getElementById('fatt-tot-bollo');
  if(bolloEl) bolloEl.value = hasBollo ? '€2,00' : '—';
  setNum('fatt-tot-lordo', totLordo);
  setNum('fatt-tot-netto', netto);
  const rRow = document.getElementById('fatt-ritenuta-row');
  const rImp = document.getElementById('fatt-ritenuta-imp');
  if(rRow) rRow.style.display = hasRitenuta ? 'block' : 'none';
  if(rImp) rImp.textContent = fmtE(ritenuta);
  /* Suggerisci bollo visivamente (badge informativo) senza forzare il checkbox */
  const bolloHint = document.getElementById('fatt-bollo-hint');
  if(bolloHint){
    if(imponibile > 77.47 && !hasBollo){
      bolloHint.textContent='⚠ Imponibile > €77,47: verificare bollo €2,00';
      bolloHint.style.display='block';
    } else {
      bolloHint.style.display='none';
    }
  }
  recalcPay('fatt');
}

// ══════════════════════════════════════════════════════════════════
// ARCHIVIO CLIENTI FATTURA
// ══════════════════════════════════════════════════════════════════

function _cliFattEnsure(){
  if(!Array.isArray(D.clientiFattura)) D.clientiFattura = [];
}

/* Apre il pannello archivio e lo popola */
function apriArchivioCliFatt(){
  _cliFattEnsure();
  // Arricchisce con clienti già usati nelle fatture (senza duplicati per nome)
  _cliFattImportaDaFatture();
  var panel = document.getElementById('fatt-archivio-panel');
  if(panel){
    panel.style.display = 'block';
    var searchEl = document.getElementById('fatt-archivio-search');
    if(searchEl){ searchEl.value = ''; searchEl.focus(); }
    renderArchivioCliFatt();
  }
}

function chiudiArchivioCliFatt(){
  var panel = document.getElementById('fatt-archivio-panel');
  if(panel) panel.style.display = 'none';
}

/* Importa automaticamente i destinatari delle fatture passate come base archivio */
function _cliFattImportaDaFatture(){
  _cliFattEnsure();
  (D.fatture || []).forEach(function(f){
    if(!f.destNome || !f.destNome.trim()) return;
    var nome = f.destNome.trim().toLowerCase();
    var esiste = D.clientiFattura.some(function(c){ return c.nome.trim().toLowerCase() === nome; });
    if(!esiste){
      D.clientiFattura.push({
        id: 'cf_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
        nome: f.destNome.trim(),
        piva: f.destPiva || '',
        indirizzo: f.destIndirizzo || '',
        citta: f.destCitta || '',
        sdi: f.destSdi || '',
        pec: f.destPec || ''
      });
    }
  });
}

/* Renderizza la lista dell'archivio con filtro ricerca */
function renderArchivioCliFatt(){
  _cliFattEnsure();
  var searchEl = document.getElementById('fatt-archivio-search');
  var q = (searchEl ? searchEl.value : '').toLowerCase().trim();
  var lista = D.clientiFattura.filter(function(c){
    return !q || c.nome.toLowerCase().indexOf(q)>=0 || (c.piva||'').toLowerCase().indexOf(q)>=0 || (c.citta||'').toLowerCase().indexOf(q)>=0;
  });
  var container = document.getElementById('fatt-archivio-list');
  if(!container) return;
  if(lista.length === 0){
    var msg = D.clientiFattura.length === 0
      ? 'Nessun cliente in archivio. Salva un destinatario con il pulsante verde.'
      : 'Nessun risultato per la ricerca.';
    container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:0.82rem">' + msg + '</div>';
    return;
  }
  var html = '';
  lista.forEach(function(c){
    var idx = D.clientiFattura.indexOf(c);
    var dettagli = [];
    if(c.piva) dettagli.push('CF/P.IVA: ' + _escFatt(c.piva));
    if(c.citta) dettagli.push(_escFatt(c.citta));
    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:white;border:1.5px solid #E2E8F0;border-radius:8px;margin-bottom:4px">';
    html += '<div style="flex:1;min-width:0;cursor:pointer" onclick="selezionaClienteFatt(' + idx + ')">';
    html += '<div style="font-weight:700;font-size:0.85rem;color:var(--text)">' + _escFatt(c.nome) + '</div>';
    if(dettagli.length) html += '<div style="font-size:0.72rem;color:var(--text3);margin-top:2px">' + dettagli.join(' · ') + '</div>';
    html += '</div>';
    html += '<button type="button" onclick="eliminaClienteFatt(' + idx + ')" title="Elimina da archivio" style="background:none;border:none;cursor:pointer;color:#94A3B8;padding:4px 6px;font-size:0.9rem;border-radius:4px">&#128465;</button>';
    html += '</div>';
  });
  container.innerHTML = html;
}

/* Seleziona un cliente dall'archivio e compila il form */
function selezionaClienteFatt(idx){
  _cliFattEnsure();
  var c = D.clientiFattura[idx];
  if(!c) return;
  var s = function(id, val){ var el = document.getElementById(id); if(el) el.value = val || ''; };
  s('fatt-dest-nome', c.nome);
  s('fatt-dest-piva', c.piva);
  s('fatt-dest-indirizzo', c.indirizzo);
  s('fatt-dest-citta', c.citta);
  s('fatt-dest-sdi', c.sdi);
  s('fatt-dest-pec', c.pec);
  chiudiArchivioCliFatt();
  if(typeof showToast === 'function') showToast('Cliente "' + c.nome + '" caricato', null, '#15803D');
}

/* Salva il cliente attualmente nel form nell'archivio */
function salvaClienteInArchivioFatt(){
  _cliFattEnsure();
  var g = function(id){ return (document.getElementById(id)?.value || '').trim(); };
  var nome = g('fatt-dest-nome');
  if(!nome){ if(typeof showToast === 'function') showToast('Inserisci prima il nome del destinatario', null, '#DC2626'); return; }
  var esistente = D.clientiFattura.find(function(c){ return c.nome.trim().toLowerCase() === nome.toLowerCase(); });
  if(esistente){
    // Aggiorna i dati del cliente esistente
    esistente.piva = g('fatt-dest-piva');
    esistente.indirizzo = g('fatt-dest-indirizzo');
    esistente.citta = g('fatt-dest-citta');
    esistente.sdi = g('fatt-dest-sdi');
    esistente.pec = g('fatt-dest-pec');
    if(typeof saveD === 'function') saveD();
    renderArchivioCliFatt();
    if(typeof showToast === 'function') showToast('Cliente "' + nome + '" aggiornato in archivio', null, '#2563EB');
  } else {
    D.clientiFattura.push({
      id: 'cf_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      nome: nome,
      piva: g('fatt-dest-piva'),
      indirizzo: g('fatt-dest-indirizzo'),
      citta: g('fatt-dest-citta'),
      sdi: g('fatt-dest-sdi'),
      pec: g('fatt-dest-pec')
    });
    if(typeof saveD === 'function') saveD();
    renderArchivioCliFatt();
    if(typeof showToast === 'function') showToast('Cliente "' + nome + '" salvato in archivio', null, '#15803D');
  }
}

/* Elimina cliente dall'archivio */
function eliminaClienteFatt(idx){
  _cliFattEnsure();
  var c = D.clientiFattura[idx];
  if(!c) return;
  if(!confirm('Eliminare ' + c.nome + " dall'archivio?")) return;
  D.clientiFattura.splice(idx, 1);
  if(typeof saveD === 'function') saveD();
  renderArchivioCliFatt();
  if(typeof showToast === 'function') showToast("Cliente eliminato dall'archivio", null, null);
}

/* Utility escape HTML */
// _esc: rinominata in _escFatt per evitare conflitti
function _escFatt(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ══════════════════════════════════════════════════════════════════

function openFatturaModal(idx){
  _fattEditIdx = idx !== undefined ? idx : null;
  clearModal('modal-fattura');
  // Reset checkboxes
  const bolloChk = document.getElementById('fatt-bollo');
  const ritChk = document.getElementById('fatt-ritenuta');
  if(bolloChk) bolloChk.checked = false;
  if(ritChk) ritChk.checked = false;
  document.getElementById('fatt-ritenuta-row').style.display = 'none';
  // Populate immobili select
  const immSel = document.getElementById('fatt-imm-ref');
  if(immSel) immSel.innerHTML = '<option value="">-- Nessuno --</option>' +
    D.immobili.map((im,i) => `<option value="${i}">(${im.ref||i}) ${im.tipo||''} — ${im.comune||''}</option>`).join('');
  const printBtn = document.getElementById('fatt-print-btn');
  if(printBtn) printBtn.style.display = idx !== undefined ? 'inline-flex' : 'none';
  document.getElementById('mt-fatt').textContent = idx !== undefined ? 'Modifica Fattura' : 'Nuova Fattura';
  if(idx !== undefined){
    const f = D.fatture[idx];
    document.getElementById('fatt-numero').value = f.numero || '';
    document.getElementById('fatt-numero').removeAttribute('readonly');
    document.getElementById('fatt-numero').style.background='white';
    document.getElementById('fatt-numero').title='Puoi modificare il numero (la prossima fattura sarà progressiva a partire dall\'ultima)';
    document.getElementById('fatt-data').value = f.data || '';
    document.getElementById('fatt-scadenza').value = f.scadenza || '';
    document.getElementById('fatt-oggetto').value = f.oggetto || '';
    document.getElementById('fatt-dest-nome').value = f.destNome || '';
    document.getElementById('fatt-dest-piva').value = f.destPiva || '';
    document.getElementById('fatt-dest-indirizzo').value = f.destIndirizzo || '';
    document.getElementById('fatt-dest-citta').value = f.destCitta || '';
    document.getElementById('fatt-dest-sdi').value = f.destSdi || '';
    document.getElementById('fatt-dest-pec').value = f.destPec || '';
    // fatt-descr rimosso (sostituito da voci): descr gestita dalle voci
    document.getElementById('fatt-stato').value = f.stato || 'Da Pagare';
    document.getElementById('fatt-note').value = f.note || '';
    if(f.immRef!==undefined){
      const immRefSel=document.getElementById('fatt-imm-ref');
      immRefSel.value=f.immRef;
      // Se fattura da provvigione → immobile bloccato (non modificabile)
      const isAutoProv=f.note&&f.note.includes('Auto da Provvigioni');
      if(isAutoProv){
        immRefSel.setAttribute('disabled','');
        immRefSel.title='Immobile impostato automaticamente dalla provvigione';
        immRefSel.style.background='var(--bg3)';
        immRefSel.style.color='var(--brand)';
        immRefSel.style.fontWeight='700';
      } else {
        immRefSel.removeAttribute('disabled');
        immRefSel.title='';
        immRefSel.style.background='';
        immRefSel.style.color='';
        immRefSel.style.fontWeight='';
      }
    }
    if(bolloChk) bolloChk.checked = !!f.hasBollo;
    if(ritChk) ritChk.checked = !!f.hasRitenuta;
    // Ripristina voci (nuovo) o crea voce unica da imponibile salvato (retrocompat)
    if(f.voci&&f.voci.length>0){ setFattVoci(f.voci); }
    else{ const vl=document.getElementById('fatt-voci-list'); if(vl) vl.innerHTML=''; addFattVoce(f.descr||'Prestazione',f.imponibile?parseFloat(f.imponibile).toFixed(2):''); }
    // Carica prima i pagamenti, poi calcola (così recalcPay vede i pagamenti reali)
    initPayWidget('fatt', f.pagamenti||[]);
    /* Ripristina abbuono fattura */
    const abbEl = document.getElementById('fatt-abbuono');
    if(abbEl){
      const legacyAbb = (f.pagamenti||[]).reduce((s,r)=>s+(parseFloat(r.abbuono)||0),0);
      abbEl.value = f.abbuono || (legacyAbb > 0 ? legacyAbb : '') || '';
    }
    calcFattura();   /* setta fatt-tot-netto con data-raw corretto */
    /* Ricalcola stato definitivo dai pagamenti reali + abbuono
       (non ripristiniamo ciecamente f.stato che potrebbe essere obsoleto) */
    const _rNetto    = getNum('fatt-tot-netto')||0;
    const _rAbbuono  = parseFloat(document.getElementById('fatt-abbuono')?.value||0)||0;
    const _rNettoEff = Math.max(0, _rNetto - _rAbbuono);
    const _rPagato   = (f.pagamenti||[]).reduce((s,r)=>s+(parseFloat(r.importo)||0),0);
    const statoEl    = document.getElementById('fatt-stato');
    if(statoEl){
      if(f.stato==='Annullata')            statoEl.value='Annullata';
      else if(_rPagato<=0)                 statoEl.value='Da Pagare';
      else if(_rPagato >= _rNettoEff-0.01) statoEl.value='Pagata';
      else                                  statoEl.value='Parzialmente Pagata';
    }
    recalcPay('fatt');
  } else {
    const numEl=document.getElementById('fatt-numero');
    numEl.value=nextFattNumero();
    numEl.setAttribute('readonly','');
    numEl.style.background='var(--bg3)';
    numEl.title='Numero automatico progressivo';
    document.getElementById('fatt-data').value = today();
    document.getElementById('fatt-imm-ref').removeAttribute('disabled');
    document.getElementById('fatt-imm-ref').style.background='';
    document.getElementById('fatt-imm-ref').style.color='';
    document.getElementById('fatt-voci-list').innerHTML='';
    addFattVoce('','');
    const abbElNew = document.getElementById('fatt-abbuono');
    if(abbElNew) abbElNew.value='';
    calcFattura();
    initPayWidget('fatt',[]);
    addFattPagamento();
  }
  openModal('modal-fattura');
}

function saveFattura(){
  const g = id => document.getElementById(id)?.value || '';
  if(!g('fatt-dest-nome').trim()){ alert('Il nome del destinatario è obbligatorio.'); return; }
  const voci=getFattVoci();
  const imponibile=voci.reduce((s,v)=>s+(v.imp||0),0);
  if(!imponibile){ dlgAlert('Inserisci almeno una voce con importo.','','Imponibile mancante'); return; }
  calcFattura();
  const hasBollo = document.getElementById('fatt-bollo')?.checked;
  const hasRitenuta = document.getElementById('fatt-ritenuta')?.checked;
  const bollo = hasBollo ? 2.00 : 0;
  const totale = imponibile + bollo;
  const ritenuta = hasRitenuta ? imponibile * 0.20 : 0;
  const netto = totale - ritenuta;
  /* Validazione: importo registrato non può superare il netto dovuto */
  const _abbSave = parseFloat(document.getElementById('fatt-abbuono')?.value||0)||0;
  const _nettoEffSave = Math.max(0, netto - _abbSave);
  const _totPagatoSave = getPayRows('fatt').reduce((s,r)=>s+(r.importo||0),0);
  if(_totPagatoSave > _nettoEffSave + 0.01){
    const eccesso = _totPagatoSave - _nettoEffSave;
    dlgAlert('L\'importo registrato (' + fmtE(_totPagatoSave) + ') supera il netto dovuto (' + fmtE(_nettoEffSave) + ') di ' + fmtE(eccesso) + '.\n\nCorreggi i pagamenti prima di salvare.','','⚠ Importo Eccedente');
    return;
  }
  const anno = new Date(g('fatt-data') || today()).getFullYear();
  // Netto agente = voce netta esplicita oppure imponibile − ritenuta
  const vocNettaSave=voci.find(v=>v.descr&&/nett/i.test(v.descr));
  const nettoAgente=vocNettaSave?(vocNettaSave.imp||0):(imponibile-ritenuta);
  const f = {
    numero: g('fatt-numero'), anno, data: g('fatt-data'),
    scadenza: g('fatt-scadenza'), oggetto: g('fatt-oggetto'),
    destNome: g('fatt-dest-nome'), destPiva: g('fatt-dest-piva'),
    destIndirizzo: g('fatt-dest-indirizzo'), destCitta: g('fatt-dest-citta'),
    destSdi: g('fatt-dest-sdi'), destPec: g('fatt-dest-pec'),
    descr: voci.map(v=>v.descr).filter(Boolean).join(' / '), voci,
    immRef: (()=>{ const s=document.getElementById('fatt-imm-ref'); return s?.disabled?(s.value||(_fattEditIdx!==null?D.fatture[_fattEditIdx]?.immRef:'') || ''):s?.value||''; })(),
    _nettoAgente: nettoAgente,
    imponibile, hasBollo, hasRitenuta, bollo, totale, ritenuta, netto,
    abbuono: parseFloat(document.getElementById('fatt-abbuono')?.value||0)||0,
    pagamenti: getPayRows('fatt'),
    pagato: getPayRows('fatt').reduce((s,r)=>s+(r.importo||0),0),
    modPag: (getPayRows('fatt')[0]||{}).modalita||'',
    dataPag: (getPayRows('fatt').slice(-1)[0]||{}).data||'',
    note: g('fatt-note')
  };
  /* Stato sempre ricalcolato dai pagamenti reali al momento del salvataggio */
  const _pagamenti  = getPayRows('fatt');
  const _totPagato  = _pagamenti.reduce((s,r)=>s+(r.importo||0),0);
  const _nettoEff   = Math.max(0, netto - (f.abbuono||0));
  if(g('fatt-stato')==='Annullata'){
    f.stato='Annullata';
  } else if(_totPagato<=0){
    f.stato='Da Pagare';
  } else if(_totPagato >= _nettoEff - 0.01){
    f.stato='Pagata';
  } else {
    f.stato='Parzialmente Pagata';
  }
  if(_fattEditIdx !== null) D.fatture[_fattEditIdx] = f;
  else D.fatture.push(f);
  var _pnFattIdx=(_fattEditIdx!==null)?_fattEditIdx:D.fatture.length-1; pnSyncFattura(_pnFattIdx);
  
  saveD(); closeModal('modal-fattura'); renderFatture(); updateBadges();
  showToast(' Fattura ' + f.numero + ' salvata', () => stampaFattura(_fattEditIdx !== null ? _fattEditIdx : D.fatture.length - 1), '️ Stampa');
}

function openAccorpamento(){
  const list=document.getElementById('accorp-list');
  if(!list) return;
  const fatt=D.fatture||[];
  if(fatt.length<2){ dlgAlert('Servono almeno 2 fatture per effettuare un accorpamento.','ℹ️','Accorpamento'); return; }
  list.innerHTML = fatt.map((ft,i)=>{
    const imp = getImpFatturabile(ft);
    return `<div class="accorp-row" id="accorp-row-${i}" onclick="toggleAccorpRow(${i})">
      <input type="checkbox" id="accorp-chk-${i}" onclick="event.stopPropagation();toggleAccorpRow(${i})">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:0.88rem">${ft.numero||'—'} · ${ft.destNome||'—'}</div>
        <div style="font-size:0.75rem;color:var(--text3)">${fmtD(ft.data)} · ${ft.descr||ft.oggetto||'—'}</div>
      </div>
      <div style="font-weight:800;color:var(--brand);white-space:nowrap">${fmtE(imp)}</div>
      <div style="font-size:0.72rem;white-space:nowrap;color:var(--text3)">+bollo ${ft.hasBollo?'€2':'—'}</div>
    </div>`;
  }).join('');
  aggiornaAccorpTot();
  openModal('modal-accorp');
}
function toggleAccorpRow(i){
  const chk=document.getElementById('accorp-chk-'+i);
  const row=document.getElementById('accorp-row-'+i);
  if(!chk) return;
  chk.checked=!chk.checked;
  row.classList.toggle('selected',chk.checked);
  aggiornaAccorpTot();
}
function aggiornaAccorpTot(){
  const fatt=D.fatture||[];
  let tot=0, count=0;
  fatt.forEach((_,i)=>{
    const chk=document.getElementById('accorp-chk-'+i);
    if(chk&&chk.checked){ tot+=getImpFatturabile(fatt[i]); count++; }
  });
  const cEl=document.getElementById('accorp-count');
  const tEl=document.getElementById('accorp-totale');
  if(cEl) cEl.textContent=count;
  if(tEl) tEl.textContent=fmtE(tot);
}
function eseguiAccorpamento(){
  const fatt=D.fatture||[];
  const selIdx=[];
  fatt.forEach((_,i)=>{ const chk=document.getElementById('accorp-chk-'+i); if(chk&&chk.checked) selIdx.push(i); });
  if(selIdx.length<2){ dlgAlert('Seleziona almeno 2 fatture da accorpare.','','Attenzione'); return; }
  const selFatt=selIdx.map(i=>fatt[i]);
  // Costruisci voci accorpate
  const vociAccorp=[];
  selFatt.forEach(ft=>{
    if(ft.voci&&ft.voci.length>0){
      ft.voci.forEach(v=>vociAccorp.push({descr:(ft.numero?ft.numero+' — ':'')+v.descr, imp:v.imp||0}));
    } else {
      vociAccorp.push({descr:(ft.numero?ft.numero+' — ':'')+( ft.descr||ft.oggetto||'Prestazione'), imp:getImpFatturabile(ft)});
    }
  });
  const totImp=vociAccorp.reduce((s,v)=>s+(v.imp||0),0);
  const hasBollo=totImp>77.47;
  const bollo=hasBollo?2:0;
  const totale=totImp+bollo;
  // Crea nuova fattura accorpata
  const num=nextFattNumero();
  const anno=new Date().getFullYear();
  const nuovaFatt={
    numero:num, anno, data:today(),
    destNome:selFatt[0].destNome||'',
    destPiva:selFatt[0].destPiva||'',
    destIndirizzo:selFatt[0].destIndirizzo||'',
    destCitta:selFatt[0].destCitta||'',
    destSdi:selFatt[0].destSdi||'',
    destPec:selFatt[0].destPec||'',
    oggetto:'Accorpamento fatture '+(selFatt.map(f=>f.numero).filter(Boolean).join(' + ')),
    descr:vociAccorp.map(v=>v.descr).join(' / '),
    voci:vociAccorp,
    imponibile:totImp, hasBollo, hasRitenuta:false,
    bollo, totale, ritenuta:0, netto:totale,
    stato:'Da Pagare', pagamenti:[], pagato:0,
    note:'Accorpamento di: '+(selFatt.map(f=>f.numero||'—').join(', '))
  };
  // Rimuovi le fatture originali (in ordine decrescente per non spostare indici)
  selIdx.sort((a,b)=>b-a).forEach(i=>D.fatture.splice(i,1));
  D.fatture.push(nuovaFatt);
  saveD(); closeModal('modal-accorp'); renderFatture(); updateBadges();
  showToast(' Fattura accorpata n.'+num+' creata ('+selIdx.length+' fatture unite)','','');
}
function delFattura(i){
  if(!hasPermission('fatture.delete')&&!hasPermission('provvigioni.delete')){ if(typeof showToast==='function') showToast('Eliminazione non consentita per il tuo ruolo','','#DC2626'); return; }
  const ft=D.fatture[i];
  dlgConfirm('Eliminare la fattura '+(ft?.numero||'')+'?','','Elimina Fattura').then(ok=>{
    if(!ok) return;
    if(ft){
      const isAutoAg  = ft.note==='Auto da Provvigioni — Contabilità Agenzia';
      const isAutoAgt = ft.note==='Auto da Provvigioni — Contabilità Agente';
      if(isAutoAg||isAutoAgt){
        D.provvigioni.forEach(pv=>{
          const ref='Prov#'+(D.provvigioni.indexOf(pv)+1);
          if((ft.descr||ft.descrizione||'').includes(ref)){
            if(isAutoAg)  pv._agFattDone=false;
            if(isAutoAgt) pv._agtFattDone=false;
          }
        });
      }
    }
    pnRemoveBySource('fattura',i);  
    D.fatture.splice(i,1);
    saveD(); renderFatture(); renderProvvigioni(); updateBadges();
    showToast(' Fattura eliminata — provvigione ripristinata','','');
  });
}

function renderFatture(){
  const pd = document.getElementById('pd-fatt'); if(pd) pd.textContent = new Date().toLocaleDateString('it-IT');
  // Populate anno filter
  const annoSel = document.getElementById('f-fatt-anno');
  if(annoSel){
    const anni = [...new Set((D.fatture||[]).map(f=>f.anno))].sort((a,b)=>b-a);
    const curAnno = annoSel.value;
    annoSel.innerHTML = '<option value="">Tutti gli anni</option>' + anni.map(a=>`<option value="${a}">${a}</option>`).join('');
    if(curAnno) annoSel.value = curAnno;
  }
  const q = (document.getElementById('f-fatt-q')?.value||'').toLowerCase();
  const stato = document.getElementById('f-fatt-stato')?.value||'';
  const anno = document.getElementById('f-fatt-anno')?.value||'';
  const dal = document.getElementById('f-fatt-dal')?.value||'';
  const al  = document.getElementById('f-fatt-al')?.value||'';
  const f = (D.fatture||[]).filter(ft=>{
    const t = [ft.numero, ft.destNome, ft.destPiva, ft.descr, ft.oggetto].join(' ').toLowerCase();
    const dtOk = (!dal||ft.data>=dal) && (!al||ft.data<=al);
    return (!q||t.includes(q)) && (!stato||ft.stato===stato) && (!anno||String(ft.anno)===anno) && dtOk;
  });
  // Stats
  const totTutte = (D.fatture||[]).reduce((s,ft)=>s+(ft.totale||0),0);
  const totPagate = (D.fatture||[]).filter(ft=>ft.stato==='Pagata').reduce((s,ft)=>s+(ft.netto||0),0);
  const totDaPagare = (D.fatture||[]).filter(ft=>ft.stato==='Da Pagare'||ft.stato==='Scaduta').reduce((s,ft)=>s+(ft.netto||0),0);
  const nScadute = (D.fatture||[]).filter(ft=>{
    return ft.stato==='Da Pagare' && ft.scadenza && ft.scadenza < today();
  }).length;
  const statsEl = document.getElementById('fatt-stats');
  if(statsEl) statsEl.innerHTML = `
    <div class="stat-card" onclick="go('fatture')" style="background:linear-gradient(145deg,#1E3A8A,#1D4ED8);box-shadow:0 8px 24px rgba(29,78,216,.4);cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <span class="stat-card-icon"></span>
        <span style="background:rgba(255,255,255,.15);color:white;font-size:0.62rem;font-weight:800;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.2)">${(D.fatture||[]).length} FTT</span>
      </div>
      <div class="stat-label" style="color:rgba(255,255,255,.75)">Totale Emesso</div>
      <div class="stat-val">${fmtE(totTutte)}</div></div>
    <div class="stat-card" style="background:linear-gradient(145deg,#065F46,#059669);box-shadow:0 8px 24px rgba(5,150,105,.4);cursor:default">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <span class="stat-card-icon"></span>
        <span style="background:rgba(255,255,255,.15);color:white;font-size:0.62rem;font-weight:800;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.2)">PAGATO</span>
      </div>
      <div class="stat-label" style="color:rgba(255,255,255,.75)">Incassato</div>
      <div class="stat-val">${fmtE(totPagate)}</div></div>
    <div class="stat-card" style="background:${nScadute?'linear-gradient(145deg,#7F1D1D,#DC2626)':'linear-gradient(145deg,#B91C1C,#EF4444)'};box-shadow:0 8px 24px rgba(220,38,38,.4);cursor:default">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <span class="stat-card-icon">⏳</span>
        ${nScadute?`<span style="background:rgba(255,255,255,.2);color:white;font-size:0.62rem;font-weight:800;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.3)">${nScadute} SCAD.</span>`:''}
      </div>
      <div class="stat-label" style="color:rgba(255,255,255,.75)">Da Incassare</div>
      <div class="stat-val">${fmtE(totDaPagare)}</div></div>
    <div class="stat-card" style="background:linear-gradient(145deg,#78350F,#B45309);box-shadow:0 8px 24px rgba(180,83,9,.4);cursor:default">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <span class="stat-card-icon"></span>
        <span style="background:rgba(255,255,255,.15);color:white;font-size:0.62rem;font-weight:800;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.2)">20%</span>
      </div>
      <div class="stat-label" style="color:rgba(255,255,255,.75)">Ritenute Versate</div>
      <div class="stat-val">${fmtE((D.fatture||[]).filter(ft=>ft.stato==='Pagata'&&ft.hasRitenuta).reduce((s,ft)=>s+(ft.ritenuta||0),0))}</div></div>`;
  // Badge
  const nbFatt = document.getElementById('nb-fatt');
  if(nbFatt){nbFatt.textContent=nScadute+(D.fatture||[]).filter(ft=>ft.stato==='Da Pagare').length;nbFatt.style.display=nbFatt.textContent>0?'':'none';}
  const stColors = {'Da Pagare':'badge-orange','Parzialmente Pagata':'badge-gold','Pagata':'badge-green','Scaduta':'badge-red','Annullata':'badge-gray'};
  const today_ = today();
  const tbody = document.getElementById('fatt-tbody');
  tbody.innerHTML = f.length ? f.map((ft,i)=>{
    const ri = D.fatture.indexOf(ft);
    /* Ricalcola displayStato dai pagamenti reali (ignora ft.stato che potrebbe essere obsoleto) */
    const totPagato  = (ft.pagamenti||[]).reduce((s,r)=>s+(parseFloat(r.importo)||0),0);
    const abbuono    = parseFloat(ft.abbuono||0)||0;
    const nettoEff   = Math.max(0,(ft.netto||0) - abbuono);
    const residuo    = Math.max(0, nettoEff - totPagato);
    let computedStato;
    if(ft.stato==='Annullata')                computedStato='Annullata';
    else if(totPagato>=nettoEff-0.01&&nettoEff>0) computedStato='Pagata';
    else if(totPagato>0)                      computedStato='Parzialmente Pagata';
    else {
      const isScad = ft.scadenza && ft.scadenza < today_;
      computedStato = isScad ? 'Scaduta' : 'Da Pagare';
    }
    /* Aggiorna ft.stato se diverge (evita deriva silenziosa) */
    if(ft.stato !== computedStato && ft.stato!=='Annullata'){ ft.stato=computedStato; saveD(); }
    const isScad = computedStato==='Scaduta';
    const rowBg = computedStato==='Pagata'?'':'background:'+(isScad?'#FEF2F2':computedStato==='Parzialmente Pagata'?'#FFFBEB':'');
    return `<tr style="${rowBg};cursor:pointer;font-size:0.78rem" ondblclick="openFatturaModal(${ri})" title="Doppio click per modificare">
      <td style="font-weight:800;color:var(--brand);white-space:nowrap;padding:6px 8px">${ft.numero}</td>
      <td style="white-space:nowrap;padding:6px 8px">${fmtD(ft.data)}</td>
      <td style="padding:6px 8px"><div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${ft.destNome||''}">${ft.destNome||'—'}</div></td>
      <td style="font-size:0.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 8px" title="${ft.destPiva||''}">${ft.destPiva||'—'}</td>
      <td style="padding:6px 8px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.74rem;color:var(--text2)" title="${ft.descr||ft.oggetto||''}">${ft.descr||ft.oggetto||'—'}</div></td>
      <td style="font-weight:700;white-space:nowrap;padding:6px 8px">${fmtE(ft.netto||0)}</td>
      <td style="color:var(--orange);white-space:nowrap;padding:6px 8px">${ft.hasBollo?'€2':'—'}</td>
      <td style="font-weight:800;color:var(--green-l);white-space:nowrap;padding:6px 8px">${totPagato>0?fmtE(totPagato):'—'}</td>
      <td style="font-weight:800;color:${residuo>0?'var(--red-l)':'var(--text4)'};white-space:nowrap;padding:6px 8px">${residuo>0?fmtE(residuo):'—'}</td>
      <td style="padding:6px 8px"><span class="badge ${stColors[computedStato]||'badge-gray'}" style="font-size:0.65rem;white-space:nowrap">${computedStato}</span></td>
      <td style="font-size:0.75rem;white-space:nowrap;padding:6px 8px">${ft.dataPag?fmtD(ft.dataPag):totPagato>0?(ft.pagamenti||[]).slice(-1)[0]?.data?fmtD((ft.pagamenti||[]).slice(-1)[0].data):'—':'—'}</td>
      <td style="padding:6px 8px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(ft.pagamenti&&ft.pagamenti.length?ft.pagamenti.map(r=>`<span class="badge badge-blue" style="font-size:0.62rem">${r.modalita||'?'}${r.riferimento?' #'+r.riferimento:''}</span>`).join(''):'—')}</div></td>
      <td style="padding:4px 6px"><div class="actions-col" style="gap:2px">
        <button class="icon-btn" onclick="stampaFattura(${ri})" title="Stampa / Anteprima" style="padding:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
        <button class="icon-btn" onclick="openFatturaModal(${ri})" title="Modifica" style="padding:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn" onclick="delFattura(${ri})" style="color:var(--red-l);padding:4px" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="14"><div class="empty-state"><div class="empty-icon"></div><p>Nessuna fattura emessa.<br><small>Clicca <strong>+ Nuova Fattura</strong> per iniziare.</small></p></div></td></tr>';
  // Riepilogo annuale forfettario
  renderRiepilogoForfettario();
}

function renderRiepilogoForfettario(){
  const anno = new Date().getFullYear();
  const fattAnno = (D.fatture||[]).filter(f=>f.anno===anno);
  const totImponibile = fattAnno.reduce((s,f)=>s+getImpFatturabile(f),0);
  const totIncassato = fattAnno.filter(f=>f.stato==='Pagata').reduce((s,f)=>s+getImpFatturabile(f),0);
  const totRitenute = fattAnno.filter(f=>f.stato==='Pagata'&&f.hasRitenuta).reduce((s,f)=>s+(f.ritenuta||0),0);
  // Forfettario: coefficiente redditività 78% per codice 749999 (prestazioni di servizi)
  const coeff = 0.78;
  const redditoPrev = totImponibile * coeff;
  const impostaSostitutiva = redditoPrev * 0.05; // 5% primi 5 anni, poi 15%
  const impostaSostitutiva15 = redditoPrev * 0.15;
  const el = document.getElementById('fatt-riepilogo');
  if(!el) return;
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px">
      <div style="padding:14px;background:var(--bg2);border-radius:8px;text-align:center">
        <div style="font-size:0.72rem;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:4px">Totale Fatturato ${anno}</div>
        <div style="font-size:1.5rem;font-weight:800;color:var(--brand)">${fmtE(totImponibile)}</div>
        <div style="font-size:0.75rem;color:var(--text3)">${fattAnno.length} fatture emesse</div>
      </div>
      <div style="padding:14px;background:#F0FDF4;border-radius:8px;text-align:center">
        <div style="font-size:0.72rem;color:var(--green-l);font-weight:700;text-transform:uppercase;margin-bottom:4px">Già Incassato ${anno}</div>
        <div style="font-size:1.5rem;font-weight:800;color:var(--green-l)">${fmtE(totIncassato)}</div>
        <div style="font-size:0.75rem;color:var(--text3)">Ritenute: ${fmtE(totRitenute)}</div>
      </div>
      <div style="padding:14px;background:#FFF7ED;border-radius:8px;text-align:center">
        <div style="font-size:0.72rem;color:var(--orange);font-weight:700;text-transform:uppercase;margin-bottom:4px">Limite Forfettario</div>
        <div style="font-size:1.5rem;font-weight:800;color:var(--orange)">${fmtE(85000)}</div>
        <div style="font-size:0.75rem;color:${totImponibile>72000?'var(--red-l)':'var(--text3)'}">Usato: ${Math.round(totImponibile/85000*100)}% ${totImponibile>72000?' Attenzione soglia':''}</div>
      </div>
    </div>
    <div style="padding:14px;background:linear-gradient(135deg,#F5F3FF,#EDE9FE);border-radius:8px;border:1px solid #DDD6FE">
      <div style="font-weight:700;color:var(--purple);margin-bottom:10px;font-size:0.9rem"> Stima Imposta Sostitutiva ${anno} — Codice Attività 749999 (coeff. 78%)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:0.83rem">
        <div><span style="color:var(--text3)">Reddito imponibile stimato:</span><br><strong>${fmtE(redditoPrev)}</strong> <span style="color:var(--text3)">(${fmtE(totImponibile)} × 78%)</span></div>
        <div><span style="color:var(--text3)">Imposta 5% (start-up):</span><br><strong style="color:var(--purple)">${fmtE(impostaSostitutiva)}</strong></div>
        <div><span style="color:var(--text3)">Imposta 15% (ordinaria):</span><br><strong style="color:var(--brand)">${fmtE(impostaSostitutiva15)}</strong></div>
      </div>
      <div style="margin-top:8px;font-size:0.72rem;color:var(--text4)"> Stima indicativa. Consulta il tuo commercialista per il calcolo definitivo.</div>
    </div>`;
}

function exportFattureXls(){
  if(typeof XLSX === 'undefined'){alert('Libreria XLSX non disponibile.');return;}
  const rows = [['N° Fattura','Anno','Data','Scadenza','Cliente','P.IVA/CF','Descrizione','Imponibile','Bollo','Totale','Ritenuta','Netto','Stato','Data Pag.','Modalità']];
  (D.fatture||[]).forEach(f=>{
    rows.push([f.numero,f.anno,f.data,f.scadenza,f.destNome,f.destPiva,f.descr||f.oggetto,
      f.imponibile,f.hasBollo?2:0,f.totale,f.ritenuta||0,f.netto,f.stato,f.dataPag,f.modPag]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fatture');
  XLSX.writeFile(wb, 'fatture_'+new Date().getFullYear()+'.xlsx');
}

function stampaFattura(idx){
  const f = idx !== null ? D.fatture[idx] : null;
  if(!f){ alert('Salva prima la fattura per poterla stampare.'); return; }
  const im = f.immRef !== undefined && f.immRef !== '' ? D.immobili[parseInt(f.immRef)] : null;
  const popup = window.open('','_blank','width=800,height=1100');
  popup.document.write(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<title>Fattura ${f.numero}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11pt;color:#1a1a1a;background:#fff;padding:0}
  .page{max-width:210mm;margin:0 auto;padding:18mm 20mm;min-height:297mm;position:relative}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #1D4ED8}
  .agency-name{font-size:18pt;font-weight:800;color:#1D4ED8;letter-spacing:-0.5px}
  .agency-sub{font-size:8.5pt;color:#64748B;margin-top:3px}
  .fattura-title{text-align:right}
  .fattura-title h1{font-size:22pt;font-weight:900;color:#1D4ED8;letter-spacing:1px}
  .fattura-title .num{font-size:13pt;color:#374151;font-weight:600;margin-top:4px}
  .fattura-title .date{font-size:9pt;color:#64748B}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:20px 0;padding:16px;background:#F8FAFC;border-radius:8px}
  .party-label{font-size:7.5pt;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;margin-bottom:6px}
  .party-name{font-size:11.5pt;font-weight:800;color:#1a1a1a}
  .party-detail{font-size:9pt;color:#374151;margin-top:2px}
  .regime-badge{display:inline-block;padding:4px 10px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:4px;font-size:8pt;color:#92400E;font-weight:600;margin-top:6px}
  .services{width:100%;border-collapse:collapse;margin:20px 0}
  .services th{background:#1D4ED8;color:white;padding:8px 12px;text-align:left;font-size:9pt;font-weight:700}
  .services td{padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:10pt;vertical-align:top}
  .services tr:last-child td{border-bottom:none}
  .totals{margin:0 0 20px auto;width:300px}
  .totals table{width:100%;border-collapse:collapse}
  .totals td{padding:7px 12px;font-size:10pt}
  .totals tr:last-child td{background:#1D4ED8;color:white;font-weight:800;font-size:12pt;border-radius:0 0 6px 6px}
  .totals tr:nth-last-child(2) td{background:#EFF6FF;color:#1D4ED8;font-weight:700}
  .legal{margin-top:20px;padding:12px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:6px;font-size:8.5pt;color:#92400E;line-height:1.5}
  .ritenuta-note{margin-top:8px;padding:10px 12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;font-size:8.5pt;color:#B91C1C}
  .payment{margin-top:16px;padding:12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;font-size:9pt}
  .footer{position:absolute;bottom:12mm;left:20mm;right:20mm;text-align:center;font-size:7.5pt;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px}
  .bollo-note{margin-top:8px;padding:8px 12px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;font-size:8.5pt;color:#92400E}
  @media print{.page{padding:10mm 14mm}}
</style></head><body>
<div class="page">
  <!-- HEADER -->
  <div class="header">
    <div>
      <div class="agency-name">Le case dalla A allo Z.io</div>
      <div class="agency-sub">Agenzia Immobiliare — Consulenza e Mediazione</div>
    </div>
    <div class="fattura-title">
      <h1>FATTURA</h1>
      <div class="num">N° ${f.numero}</div>
      <div class="date">Data: ${new Date(f.data+'T00:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'})}</div>
    </div>
  </div>

  <!-- PARTIES -->
  <div class="parties">
    <div>
      <div class="party-label">Emittente</div>
      <div class="party-name">${EMITTENTE.nome}</div>
      <div class="party-detail">P.IVA: ${EMITTENTE.piva}</div>
      <div class="party-detail">C.F.: ${EMITTENTE.cf}</div>
      <div class="party-detail">${EMITTENTE.indirizzo} — ${EMITTENTE.cap} ${EMITTENTE.comune} (${EMITTENTE.prov})</div>
      <div class="party-detail">Codice Attività: ${EMITTENTE.codiceAttivita}</div>
      <div class="regime-badge"> Regime Forfetario</div>
    </div>
    <div>
      <div class="party-label">Destinatario</div>
      <div class="party-name">${f.destNome}</div>
      ${f.destPiva?`<div class="party-detail">P.IVA/CF: ${f.destPiva}</div>`:''}
      ${f.destIndirizzo?`<div class="party-detail">${f.destIndirizzo}</div>`:''}
      ${f.destCitta?`<div class="party-detail">${f.destCitta}</div>`:''}
      ${f.destSdi?`<div class="party-detail">Codice SDI: ${f.destSdi}</div>`:''}
      ${f.destPec?`<div class="party-detail">PEC: ${f.destPec}</div>`:''}
    </div>
  </div>

  ${f.oggetto?`<div style="margin-bottom:12px;padding:8px 14px;background:#EFF6FF;border-radius:6px;font-weight:700;color:#1D4ED8;font-size:10.5pt">Oggetto: ${f.oggetto}</div>`:''}

  <!-- SERVICES TABLE -->
  <table class="services">
    <thead><tr>
      <th style="width:60%">Descrizione Prestazione</th>
      <th style="width:15%;text-align:center">Rif. Immobile</th>
      <th style="width:25%;text-align:right">Importo</th>
    </tr></thead>
    <tbody>
      <tr>
        <td>${f.descr||f.oggetto||'Prestazione professionale'}</td>
        <td style="text-align:center;font-size:9pt;color:#64748B">${im?`(${im.ref||''}) ${im.comune||''}`:''}</td>
        <td style="text-align:right;font-weight:700">${fmtE(f.imponibile)}</td>
      </tr>
      ${f.hasBollo?`<tr><td style="font-size:9pt;color:#92400E">Marca da Bollo (importo &gt; €77,47)</td><td></td><td style="text-align:right;color:#92400E">€2,00</td></tr>`:''}
    </tbody>
  </table>

  <!-- TOTALS -->
  <div class="totals">
    <table>
      <tr><td>Imponibile</td><td style="text-align:right;font-weight:700">${fmtE(f.imponibile)}</td></tr>
      <tr><td>IVA</td><td style="text-align:right">Esente (Regime Forfetario)</td></tr>
      ${f.hasBollo?`<tr><td>Marca da Bollo</td><td style="text-align:right">€2,00</td></tr>`:''}
      <tr><td><strong>TOTALE FATTURA</strong></td><td style="text-align:right"><strong>${fmtE(f.totale)}</strong></td></tr>
      ${f.hasRitenuta?`<tr style="background:#FEF2F2"><td style="color:#B91C1C">- Ritenuta d'Acconto (20%)</td><td style="text-align:right;color:#B91C1C">- ${fmtE(f.ritenuta)}</td></tr>`:''}
      <tr><td>NETTO A PAGARE</td><td style="text-align:right">${fmtE(f.netto)}</td></tr>
    </table>
  </div>

  ${f.hasRitenuta?`<div class="ritenuta-note">️ <strong>Ritenuta d'Acconto:</strong> ${fmtE(f.ritenuta)} da versare all'Erario entro il 16 del mese successivo al pagamento (mod. F24 cod. 1040).</div>`:''}
  ${f.hasBollo?`<div class="bollo-note"> <strong>Marca da Bollo:</strong> Assolta in modo virtuale ai sensi del D.P.R. 642/72 - €2,00 a carico del committente.</div>`:''}

  <!-- LEGAL DISCLAIMER -->
  <div class="legal">
    Operazione effettuata ai sensi dell'art. 1, commi 54-89, della Legge 190/2014 (Regime Forfetario). <strong>L'operazione non è soggetta ad IVA.</strong> Ai sensi dell'art. 1, co. 58, L. 190/2014 non si applica la ritenuta d'acconto di cui all'art. 25 del D.P.R. 600/1973.
  </div>

  <!-- PAYMENT -->
  ${f.modPag||f.scadenza?`<div class="payment">
     <strong>Pagamenti:</strong> ${(f.pagamenti&&f.pagamenti.length?f.pagamenti.map(r=>r.modalita+(r.importo?' '+fmtE(r.importo):'')).join(' · '):f.modPag||'—')}&nbsp;&nbsp;
    ${f.scadenza?`⏰ <strong>Scadenza:</strong> ${new Date(f.scadenza+'T00:00:00').toLocaleDateString('it-IT')}`:''}&nbsp;&nbsp;
    ${f.note?` ${f.note}`:''}
  </div>`:''}

  <div class="footer">
    ${EMITTENTE.nome} · P.IVA ${EMITTENTE.piva} · C.F. ${EMITTENTE.cf} · ${EMITTENTE.indirizzo}, ${EMITTENTE.cap} ${EMITTENTE.comune} (${EMITTENTE.prov}) · Regime Forfetario
  </div>
</div>
<script>setTimeout(()=>window.print(),400);<\/script>
</body></html>`);
  popup.document.close();
}

// ===== PAGAMENTI MULTI-MODALITÀ HELPERS =====
const MOD_PAG_OPTIONS = ['Contanti','Bonifico Bancario','Assegno Bancario','Assegno Circolare','POS / Carta','Vaglia Postale'];

// Riga pagamento NF — solo Contanti (valore fisso, non modificabile)

// --- BRIDGE window ---
Object.assign(window, {
  getTotaleVoci, calcFattura, _cliFattEnsure, apriArchivioCliFatt, chiudiArchivioCliFatt,
  _cliFattImportaDaFatture, renderArchivioCliFatt, selezionaClienteFatt,
  salvaClienteInArchivioFatt, eliminaClienteFatt, _escFatt, openFatturaModal, saveFattura,
  openAccorpamento, toggleAccorpRow, aggiornaAccorpTot, eseguiAccorpamento, delFattura,
  renderFatture, renderRiepilogoForfettario, exportFattureXls, stampaFattura,
});
export { renderFatture, openFatturaModal, saveFattura, delFattura, stampaFattura };
