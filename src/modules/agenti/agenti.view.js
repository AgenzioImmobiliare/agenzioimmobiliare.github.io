// modules/agenti/agenti.view.js — modulo Agenti & Agenzie.
// Estratto: renderAgenti (28212-28263), agAddAgenzia, agAggiornaSelectPrincipale,
// agGetAgenzie, agSetAgenzie, openAgenteModal, saveAgente, openAgenteSchedaPopup,
// delAgente (29424-29804).
// _agEditIdx: era nella dichiarazione condivisa provvigioni del monolite, ma è
// usata SOLO dagli Agenti → spostata qui come stato locale del modulo.
// Dipendenze esterne (monolite via window): renderProvvigioni, openSchedaImmobile,
//   openGiriVisitaModal, openModal, closeModal, saveD, fmtE, getNum, setNum,
//   parseCurrStr, dlgAlert.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

// Stato locale: indice agente in modifica (era in dichiarazione condivisa, usato solo qui).
let _agEditIdx = null;

function renderAgenti(){
  const tbody=document.getElementById('agenti-tbody');
  tbody.innerHTML=D.agenti.length?D.agenti.map((a,i)=>{
    const agProv=D.provvigioni.filter(p=>String(p.agenteIdx)===String(i));
    const totGen=agProv.reduce((s,p)=>s+(parseFloat(p.totale)||0),0);
    const totAgenteLordo=agProv.reduce((s,p)=>s+(parseFloat(p.quotaAgente)||0),0);
    const totAgenzia=agProv.reduce((s,p)=>s+(parseFloat(p.quotaAgenzia)||0),0);
    // Quota ufficio: perc on agente share
    const percUff=parseFloat(a.quotaUfficio)||2.5;
    const quotaUff=totAgenteLordo*percUff/100;
    const totAgenteNetto=totAgenteLordo-quotaUff;
    /* totLiquidatoAgente: somma pagamenti effettivi all'agente (modAgenteRighe), mai p.pagato */
    const totLiquidatoAgente=agProv.reduce((s,p)=>{
      return s+(p.modAgenteRighe||[]).reduce((ss,r)=>ss+(r.imp||0),0);
    },0);
    /* totTrattenuteUfficio: somma trattenute registrate */
    const totTrattenuteUfficio=agProv.reduce((s,p)=>s+(parseFloat(p.trattenuteUfficio)||0),0);
    /* daIncassare: quota netta maturata meno quanto già liquidato */
    const daIncassare=Math.max(0,totAgenteNetto-totLiquidatoAgente);
    const immAgente=D.immobili.filter(im=>String(im.agenteRef)===String(i));
    const nImm=immAgente.length;
    const nImmAttivi=immAgente.filter(im=>im.stato==='attivo').length;
    return`<tr>
      <td>
        <div style="font-weight:800">${a.nome}</div>
        <div style="font-size:0.72rem;color:var(--brand);font-weight:700">${a.codice||('AG'+String(i+1).padStart(3,'0'))}</div>
      </td>
      <td style="max-width:160px">
        ${a.agenziaPrincipale?`<div style="font-weight:700;font-size:0.78rem;color:var(--brand)">${a.agenziaPrincipale}</div>`:''}
        ${Array.isArray(a.agenzie)?a.agenzie.filter(ag2=>ag2.nome!==a.agenziaPrincipale).map(ag2=>`<div style="font-size:0.7rem;color:var(--text3)">${ag2.nome||ag2}${ag2.perc?' ('+ag2.perc+'%)':''}</div>`).join(''):(typeof a.agenzie==='string'?a.agenzie.split('\n').filter(Boolean).slice(a.agenziaPrincipale?1:0).map(ag2=>`<div style="font-size:0.7rem;color:var(--text3)">${ag2}</div>`).join(''):'')}
        ${!a.agenziaPrincipale&&(!a.agenzie||a.agenzie.length===0)?'<span style="color:var(--text4)">—</span>':''}
      </td>
      <td>${a.tel?`<a href="tel:${a.tel}" style="color:var(--brand)">${a.tel}</a>`:'—'}<br><span style="font-size:0.72rem;color:var(--text3)">${a.email||''}</span></td>
      <td style="font-size:0.8rem">${a.modPag||'—'}<br><span style="font-family:monospace;font-size:0.7rem;color:var(--text3)">${a.iban?a.iban.substring(0,12)+'...':''}</span></td>
      <td style="color:var(--gold);font-weight:700">${a.percAgenzia||0}%</td>
      <td style="color:var(--green-l);font-weight:700">${a.percAgente||0}%</td>
      <td style="color:var(--orange);font-weight:700">${percUff}% <span style="font-size:0.7rem;color:var(--text3)">(${fmtE(quotaUff)})</span></td>
      <td style="font-weight:800">${fmtE(totGen)}</td>
      <td style="color:var(--green-l);font-weight:700">${fmtE(totAgenteLordo)}<br><span style="font-size:0.72rem;color:var(--text3)">netto: ${fmtE(totAgenteNetto)}</span></td>
      <td style="color:var(--brand);font-weight:700">${fmtE(daIncassare>0?daIncassare:0)}</td>
      <td><span class="badge badge-blue" style="font-size:0.7rem">${nImm} imm. (${nImmAttivi} att.)</span></td>
      <td><span class="badge ${a.stato==='attivo'?'badge-green':'badge-gray'}">${a.stato||'attivo'}</span></td>
      <td style="white-space:nowrap"><div class="actions-col" style="gap:3px">
        <button class="icon-btn" onclick="openAgenteSchedaPopup(${i})" title="Scheda Agente"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></button>
        <button class="icon-btn" onclick="openGiriVisitaModal(${i})" title="Giri Visita" style="color:#7C3AED"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
        <button class="icon-btn" onclick="openAgenteModal(${i})" title="Modifica"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn" onclick="delAgente(${i})" title="Elimina" style="color:var(--red-l)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </div></td>
    </tr>`;
  }).join(''):'<tr><td colspan="12"><div class="empty-state"><div class="empty-icon"></div><p>Nessun agente.<br><small>Aggiungi agenti per tracciare provvigioni e immobili per persona.</small></p></div></td></tr>';
}


function agAddAgenzia(nome, perc){
  const list = document.getElementById('ag-agenzie-list');
  const empty = document.getElementById('ag-agenzie-empty');
  if(!list) return;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px';
  row.innerHTML = `
    <input type="text" placeholder="Nome agenzia" value="${nome||''}"
      style="flex:1;padding:7px 10px;border:1.5px solid #BFDBFE;border-radius:8px;font-family:inherit;font-size:0.85rem;outline:none"
      oninput="agAggiornaSelectPrincipale()"
      onfocus="this.style.borderColor='#2563EB'" onblur="this.style.borderColor='#BFDBFE'">
    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
      <input type="number" placeholder="%" value="${perc||''}" min="0" max="100" step="0.5"
        style="width:70px;padding:7px 8px;border:1.5px solid #BFDBFE;border-radius:8px;font-family:inherit;font-size:0.85rem;outline:none;text-align:center"
        onfocus="this.style.borderColor='#2563EB'" onblur="this.style.borderColor='#BFDBFE'">
      <span style="font-size:0.78rem;color:var(--text3);flex-shrink:0">%</span>
    </div>
    <button type="button" onclick="this.closest('div[style]').remove();agAggiornaSelectPrincipale();"
      style="padding:5px 9px;background:#FEE2E2;color:#DC2626;border:1.5px solid #FCA5A5;border-radius:7px;cursor:pointer;font-size:0.85rem;font-weight:700;flex-shrink:0"></button>`;
  list.appendChild(row);
  if(empty) empty.style.display = 'none';
  agAggiornaSelectPrincipale();
}

function agAggiornaSelectPrincipale(){
  const list = document.getElementById('ag-agenzie-list');
  const sel = document.getElementById('ag-agenzia-principale');
  if(!list || !sel) return;
  const curVal = sel.value;
  const nomi = Array.from(list.children).map(row => {
    const inp = row.querySelector('input[type="text"]');
    return (inp?.value||'').trim();
  }).filter(Boolean);
  sel.innerHTML = '<option value="">-- Seleziona principale --</option>' +
    nomi.map(n => `<option value="${n}"${n===curVal?' selected':''}>${n}</option>`).join('');
}

function agGetAgenzie(){
  const list = document.getElementById('ag-agenzie-list');
  if(!list) return [];
  return Array.from(list.children).map(row => {
    const inputs = row.querySelectorAll('input');
    const nome = (inputs[0]?.value||'').trim();
    const perc = (inputs[1]?.value||'').trim();
    return nome ? {nome, perc} : null;
  }).filter(Boolean);
}

function agSetAgenzie(arr){
  const list = document.getElementById('ag-agenzie-list');
  const empty = document.getElementById('ag-agenzie-empty');
  if(!list) return;
  list.innerHTML = '';
  // Supporta sia array di oggetti {nome,perc} che stringa legacy
  if(Array.isArray(arr)){
    arr.forEach(x => agAddAgenzia(x.nome||x, x.perc||''));
  } else if(typeof arr === 'string' && arr.trim()){
    // Migrazione da vecchio formato stringa "Nome — perc%\n..."
    arr.split('\n').filter(Boolean).forEach(line => {
      const parts = line.split(/—|-/).map(s=>s.trim());
      agAddAgenzia(parts[0]||line, parts[1]?parts[1].replace('%','').trim():'');
    });
  }
  if(empty) empty.style.display = (list.children.length === 0) ? '' : 'none';
  agAggiornaSelectPrincipale();
}

function openAgenteModal(idx){
  _agEditIdx=idx!==undefined?idx:null;
  ['ag-nome','ag-codice','ag-tel','ag-email','ag-cf','ag-piva','ag-indirizzo','ag-citta',
   'ag-iban','ag-banca','ag-intestatario','ag-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('ag-perc-agenzia').value=50;
  document.getElementById('ag-perc-agente').value=50;
  document.getElementById('ag-quota-ufficio').value=2.5;
  setTimeout(_agUpdateQuotaUffVisibility, 30);
  document.getElementById('ag-stato').value='attivo';
  document.getElementById('ag-mod-pag').value='';
  agSetAgenzie([]);
  document.getElementById('ag-perc-warn').style.display='none';
  const quotaUffMens=document.getElementById('ag-quota-ufficio-mensile');
  if(quotaUffMens){quotaUffMens.removeAttribute('data-raw');quotaUffMens.value='';}
  document.getElementById('mt-agente').textContent=idx!==undefined?'Modifica Agente':'Nuovo Agente';
  if(idx!==undefined){
    const a=D.agenti[idx];
    const map={nome:'ag-nome',codice:'ag-codice',tel:'ag-tel',email:'ag-email',cf:'ag-cf',
               piva:'ag-piva',indirizzo:'ag-indirizzo',citta:'ag-citta',
               /*agenzie e agenziaPrincipale gestite separatamente*/
               quotaUfficio:'ag-quota-ufficio',modPag:'ag-mod-pag',
               iban:'ag-iban',banca:'ag-banca',intestatario:'ag-intestatario',
               stato:'ag-stato',note:'ag-note'};
    Object.entries(map).forEach(([k,id])=>{const el=document.getElementById(id);if(el)el.value=a[k]||'';});
    // Percentuali: usare il valore salvato o default 50 (non usare ||'' che azzera)
    document.getElementById('ag-perc-agenzia').value=a.percAgenzia!==undefined?a.percAgenzia:50;
    document.getElementById('ag-perc-agente').value=a.percAgente!==undefined?a.percAgente:50;
    setNum('ag-quota-ufficio-mensile', parseCurrStr(String(a.quotaUfficioMensile||'')));
    setTimeout(_agUpdateQuotaUffVisibility, 30);
    // Carica agenzie dinamiche
    agSetAgenzie(a.agenzie||[]);
    // Imposta agenzia principale nel select
    setTimeout(()=>{const sel=document.getElementById('ag-agenzia-principale');if(sel)sel.value=a.agenziaPrincipale||'';},50);
  } else {
    // Auto-generate codice
    const maxCode=D.agenti.reduce((m,a)=>{const n=parseInt((a.codice||'').replace(/[^0-9]/g,''));return(!isNaN(n)&&n>m)?n:m;},0);
    document.getElementById('ag-codice').value='AG'+String(maxCode+1).padStart(3,'0');
  }
  openModal('modal-agente');
}
function saveAgente(){
  const nome=document.getElementById('ag-nome').value.trim();
  if(!nome){dlgAlert('Il nome agente è obbligatorio.','','Campo obbligatorio');return;}
  // agenzia principale: opzionale, viene selezionata dalla lista
  const g=id=>document.getElementById(id)?.value||'';
  const a={nome,codice:g('ag-codice'),tel:g('ag-tel'),email:g('ag-email'),
            cf:g('ag-cf'),piva:g('ag-piva'),indirizzo:g('ag-indirizzo'),citta:g('ag-citta'),
            percAgenzia:parseFloat(g('ag-perc-agenzia'))||50,
            percAgente:parseFloat(g('ag-perc-agente'))||0,
            quotaUfficio:(parseFloat(g('ag-perc-agenzia'))>=99.9)?0:(parseFloat(g('ag-quota-ufficio'))||2.5),
            quotaUfficioMensile:getNum('ag-quota-ufficio-mensile')||0,
            modPag:g('ag-mod-pag'),iban:g('ag-iban'),banca:g('ag-banca'),
            intestatario:g('ag-intestatario'),
            agenzie:agGetAgenzie(),agenziaPrincipale:g('ag-agenzia-principale'),
            stato:g('ag-stato'),note:g('ag-note')};
  if(_agEditIdx!==null) D.agenti[_agEditIdx]=a;
  else D.agenti.push(a);
  saveD(); closeModal('modal-agente'); renderProvvigioni();
  // Aggiorna anche la lista agenti
  renderAgenti();
  // Refresh immobile selects if open
  const immAgSel=document.getElementById('im-agente-ref');
  if(immAgSel) immAgSel.innerHTML='<option value="">-- Seleziona agente --</option>'+D.agenti.filter(ag=>ag.stato!=='non attivo').map((ag,i)=>`<option value="${i}">${ag.nome}</option>`).join('');
}
function openAgenteSchedaPopup(i){
  const a=D.agenti[i];
  if(!a) return;
  // ── Dati provvigioni ──
  const agProv=D.provvigioni.filter(p=>String(p.agenteIdx)===String(i));
  const totGen=agProv.reduce((s,p)=>s+(parseFloat(p.totale)||0),0);
  const totAgenteLordo=agProv.reduce((s,p)=>s+(parseFloat(p.quotaAgente)||0),0);
  const totAgenteNetto=agProv.reduce((s,p)=>s+(parseFloat(p.quotaAgenteNetto)||0),0);
  const totAgenzia=agProv.reduce((s,p)=>s+(parseFloat(p.quotaAgenzia)||0),0);
  const percUff=parseFloat(a.quotaUfficio)||2.5;
  const quotaUff=totAgenteLordo*percUff/100;
  const quotaAgIncassata=agProv.filter(p=>p.statoPag==='Incassata').reduce((s,p)=>s+(parseFloat(p.quotaAgente)||0),0);
  const daIncassare=Math.max(0,totAgenteLordo-quotaAgIncassata);
  const mediaProv=agProv.length>0?Math.round(totAgenteLordo/agProv.length):0;
  // ── Immobili ──
  const immAg=D.immobili.map((im,idx)=>({im,idx})).filter(({im})=>String(im.agenteRef)===String(i));
  const immAttivi=immAg.filter(({im})=>im.stato==='attivo'||im.stato==='proposta');
  const immVenduti=immAg.filter(({im})=>im.stato==='venduto');
  const immArchiviati=immAg.filter(({im})=>im.stato==='archiviato'||im.stato==='non attivo');
  // ── Potenziale di incasso ──
  const percAgt=parseFloat(a.percAgente)||50;
  let potProv=0,potAgente=0;
  immAttivi.forEach(({im})=>{
    const prezzo=parseFloat(im.prezzo)||0;
    const impFisso=parseFloat(im.incImp)||0;
    const provvTot=impFisso>0?impFisso:(prezzo*(parseFloat(im.incPerc)||0)/100);
    potProv+=provvTot;
    potAgente+=provvTot*percAgt/100;
  });
  const potAgenteNetto=potAgente-(potAgente*percUff/100);
  const valPortafoglio=immAttivi.reduce((s,{im})=>s+(parseFloat(im.prezzo)||0),0);
  // ── Andamento mensile ──
  const mesi=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const provPerMese=new Array(12).fill(0);
  agProv.forEach(p=>{if(p.data){const m=parseInt((p.data||'').split('-')[1])-1;if(m>=0&&m<12)provPerMese[m]+=(parseFloat(p.quotaAgente)||0);}});
  const maxVal=Math.max(...provPerMese,1);
  const meseMax=provPerMese.indexOf(Math.max(...provPerMese));
  const barChart=provPerMese.map((v,m)=>`
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1">
      <div style="font-size:0.55rem;color:${m===meseMax?'#10B981':'var(--text3)'};font-weight:700">${v>0?Math.round(v/1000)+'k':''}</div>
      <div style="width:100%;border-radius:3px 3px 0 0;background:${m===meseMax?'#10B981':'#3B82F6'};opacity:${v>0?0.9:0.15};height:${Math.round(v/maxVal*56)+4}px;min-height:4px"></div>
      <div style="font-size:0.55rem;color:var(--text3)">${mesi[m]}</div>
    </div>`).join('');
  // ── Storico per anno ──
  const anni=[...new Set(agProv.map(p=>(p.data||'').substring(0,4)).filter(Boolean))].sort().reverse();
  const statPerAnno=anni.slice(0,3).map(anno=>{
    const pp=agProv.filter(p=>(p.data||'').startsWith(anno));
    return{anno,n:pp.length,tot:pp.reduce((s,p)=>s+(parseFloat(p.quotaAgente)||0),0)};
  });
  const agenzie=Array.isArray(a.agenzie)&&a.agenzie.length?a.agenzie.map(x=>x.nome||x):(typeof a.agenzie==='string'&&a.agenzie?a.agenzie.split('\n').filter(Boolean):[a.agenziaPrincipale||'—']);

  const ov=document.createElement('div');
  ov.className='overlay open';
  ov.innerHTML=`<div class="modal" style="max-width:900px;width:96%">
    <!-- HEADER -->
    <div class="mhead" style="background:linear-gradient(135deg,#0F172A,#1E3A5F,#1D4ED8);border-bottom:none;padding:20px 24px">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:52px;height:52px;background:rgba(255,255,255,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0"></div>
        <div>
          <div style="font-size:1.2rem;font-weight:800;color:white">${a.nome} <span style="font-size:0.75rem;background:rgba(255,255,255,.15);color:rgba(255,255,255,.8);padding:2px 8px;border-radius:8px;font-weight:700">${a.codice||('AG'+String(i+1).padStart(3,'0'))}</span></div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,.55);margin-top:3px">${agenzie[0]||'—'} · Split ${a.percAgenzia||50}% agenzia / ${a.percAgente||50}% agente · <span style="${a.stato&&a.stato!=='attivo'?'color:#FCA5A5':'color:#6EE7B7'}">${a.stato==='attivo'||!a.stato?'● Attivo':'● Non attivo'}</span></div>
        </div>
      </div>
      <button class="mclose" onclick="this.closest('.overlay').remove()" style="color:rgba(255,255,255,.8);background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:8px;width:34px;height:34px;display:flex;align-items:center;justify-content:center"></button>
    </div>
    <div class="mbody" style="max-height:82vh;overflow-y:auto;padding:18px 20px">
      <!-- ROW 1: Contatti + 6 KPI card -->
      <div style="display:grid;grid-template-columns:230px 1fr;gap:14px;margin-bottom:16px">
        <div style="background:var(--bg2);border-radius:12px;padding:14px 16px;border:1px solid var(--border)">
          <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text4);margin-bottom:10px"> Contatti & Dati</div>
          <div style="display:flex;flex-direction:column;gap:7px;font-size:0.82rem">
            ${a.tel?`<a href="tel:${a.tel}" style="display:flex;align-items:center;gap:7px;color:var(--brand);font-weight:600;text-decoration:none"><span style="width:20px;text-align:center"></span>${a.tel}</a>`:''}
            ${a.email?`<a href="mailto:${a.email}" style="display:flex;align-items:center;gap:7px;color:var(--brand);font-weight:600;text-decoration:none;font-size:0.78rem"><span style="width:20px;text-align:center">️</span><span style="overflow:hidden;text-overflow:ellipsis">${a.email}</span></a>`:''}
            ${a.cf?`<div style="display:flex;align-items:center;gap:7px;color:var(--text3)"><span style="width:20px;text-align:center;font-size:0.7rem">CF</span><span style="font-family:monospace;font-size:0.75rem">${a.cf}</span></div>`:''}
            ${a.piva?`<div style="display:flex;align-items:center;gap:7px;color:var(--text3)"><span style="width:20px;text-align:center;font-size:0.7rem">IVA</span><span style="font-family:monospace;font-size:0.75rem">${a.piva}</span></div>`:''}
            ${a.modPag?`<div style="display:flex;align-items:center;gap:7px"><span style="width:20px;text-align:center"></span><span>${a.modPag}</span></div>`:''}
            ${a.iban?`<div style="display:flex;align-items:center;gap:7px"><span style="width:20px;text-align:center"></span><span style="font-family:monospace;font-size:0.7rem;color:var(--text3)">${a.iban.substring(0,18)}…</span></div>`:''}
            ${a.banca?`<div style="display:flex;align-items:center;gap:7px;font-size:0.78rem"><span style="width:20px;text-align:center">️</span><span>${a.banca}</span></div>`:''}
            ${!a.tel&&!a.email?'<div style="color:var(--text4);font-size:0.78rem">Nessun contatto inserito</div>':''}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:8px">
          <div style="background:linear-gradient(135deg,#1E3A8A,#2563EB);border-radius:10px;padding:12px;color:white">
            <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.8;margin-bottom:4px">Provvigioni Generate</div>
            <div style="font-size:1.1rem;font-weight:800">${fmtE(totGen)}</div>
            <div style="font-size:0.65rem;opacity:.7;margin-top:2px">${agProv.length} operazioni</div>
          </div>
          <div style="background:linear-gradient(135deg,#065F46,#059669);border-radius:10px;padding:12px;color:white">
            <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.8;margin-bottom:4px">Quota Agente Netta</div>
            <div style="font-size:1.1rem;font-weight:800">${fmtE(totAgenteNetto>0?totAgenteNetto:totAgenteLordo-quotaUff)}</div>
            <div style="font-size:0.65rem;opacity:.7;margin-top:2px">lordo: ${fmtE(totAgenteLordo)}</div>
          </div>
          <div style="background:${daIncassare>0?'linear-gradient(135deg,#7F1D1D,#DC2626)':'linear-gradient(135deg,#065F46,#059669)'};border-radius:10px;padding:12px;color:white">
            <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.8;margin-bottom:4px">Da Incassare</div>
            <div style="font-size:1.1rem;font-weight:800">${fmtE(daIncassare)}</div>
            <div style="font-size:0.65rem;opacity:.7;margin-top:2px">${daIncassare>0?' Residuo':' Tutto incassato'}</div>
          </div>
          <div style="background:linear-gradient(135deg,#78350F,#B45309);border-radius:10px;padding:12px;color:white">
            <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.8;margin-bottom:4px">Quota Ufficio (${percUff}%)</div>
            <div style="font-size:1.1rem;font-weight:800">${fmtE(quotaUff)}</div>
            <div style="font-size:0.65rem;opacity:.7;margin-top:2px">su quota lordo agente</div>
          </div>
          <div style="background:linear-gradient(135deg,#3730A3,#6366F1);border-radius:10px;padding:12px;color:white">
            <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.8;margin-bottom:4px">Media per Operazione</div>
            <div style="font-size:1.1rem;font-weight:800">${fmtE(mediaProv)}</div>
            <div style="font-size:0.65rem;opacity:.7;margin-top:2px">quota agente media</div>
          </div>
          <div style="background:linear-gradient(135deg,#064E3B,#065F46);border-radius:10px;padding:12px;color:white">
            <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.8;margin-bottom:4px">Quota Agenzia Totale</div>
            <div style="font-size:1.1rem;font-weight:800">${fmtE(totAgenzia)}</div>
            <div style="font-size:0.65rem;opacity:.7;margin-top:2px">generata da questo agente</div>
          </div>
        </div>
      </div>
      <!-- ROW 2: Portafoglio + Andamento mensile -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
        <div style="background:var(--bg2);border-radius:12px;padding:14px 16px;border:1px solid var(--border)">
          <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text4);margin-bottom:10px"> Portafoglio Immobili</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
            <div style="text-align:center;padding:8px 4px;background:white;border-radius:8px;border:1px solid var(--border)">
              <div style="font-size:1.3rem;font-weight:800;color:var(--brand)">${immAg.length}</div>
              <div style="font-size:0.62rem;color:var(--text3)">Totali</div>
            </div>
            <div style="text-align:center;padding:8px 4px;background:#F0FDF4;border-radius:8px">
              <div style="font-size:1.3rem;font-weight:800;color:#15803D">${immAttivi.length}</div>
              <div style="font-size:0.62rem;color:#15803D">Attivi</div>
            </div>
            <div style="text-align:center;padding:8px 4px;background:#EFF6FF;border-radius:8px">
              <div style="font-size:1.3rem;font-weight:800;color:#1D4ED8">${immVenduti.length}</div>
              <div style="font-size:0.62rem;color:#1D4ED8">Venduti</div>
            </div>
            <div style="text-align:center;padding:8px 4px;background:#F1F5F9;border-radius:8px">
              <div style="font-size:1.3rem;font-weight:800;color:#64748B">${immArchiviati.length}</div>
              <div style="font-size:0.62rem;color:#64748B">Archiv.</div>
            </div>
          </div>
          <div style="font-size:0.75rem;color:var(--text3);display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border)">
            <span>Valore portafoglio attivi:</span>
            <strong style="color:var(--brand)">${fmtE(valPortafoglio)}</strong>
          </div>
          ${statPerAnno.length?`<div style="margin-top:8px">
            <div style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text4);margin-bottom:6px">Storico per anno</div>
            ${statPerAnno.map(({anno,n,tot})=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:white;border-radius:6px;border:1px solid var(--border);margin-bottom:3px;font-size:0.78rem">
              <span style="font-weight:700">${anno}</span><span style="color:var(--text3)">${n} op.</span><span style="color:var(--green-l);font-weight:700">${fmtE(tot)}</span>
            </div>`).join('')}
          </div>`:''}
        </div>
        <div style="background:var(--bg2);border-radius:12px;padding:14px 16px;border:1px solid var(--border)">
          <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text4);margin-bottom:10px"> Andamento Quota Agente ${new Date().getFullYear()}</div>
          ${agProv.length>0?`
          <div style="display:flex;align-items:flex-end;gap:2px;height:70px;overflow:hidden;background:white;border-radius:8px;padding:6px 8px 4px;border:1px solid var(--border)">
            ${barChart}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:0.75rem;color:var(--text3)">
            <span>Mese migliore: <strong style="color:#10B981">${mesi[meseMax]}</strong></span>
            <strong style="color:#10B981">${fmtE(provPerMese[meseMax])}</strong>
          </div>
          <div style="margin-top:10px">
            <div style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text4);margin-bottom:6px">Ultime 4 operazioni</div>
            ${agProv.slice(-4).reverse().map(p=>{const im=p.immRef!==undefined?D.immobili[parseInt(p.immRef)]:null;return`<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:white;border-radius:6px;border:1px solid var(--border);margin-bottom:3px;font-size:0.76rem">
              <div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">${im?im.tipo+' · '+im.comune:p.descr||'—'}</div>
              <div style="color:#15803D;font-weight:700;white-space:nowrap">${fmtE(p.quotaAgente||0)}</div>
              <span style="padding:1px 6px;border-radius:8px;font-size:0.62rem;background:${p.statoPag==='Incassata'?'#DCFCE7':'#FEF2F2'};color:${p.statoPag==='Incassata'?'#15803D':'#DC2626'};white-space:nowrap">${p.statoPag==='Incassata'?'':'⏳'}</span>
            </div>`;}).join('')}
          </div>`:'<div class="empty-state" style="padding:20px"><p style="font-size:0.8rem">Nessuna provvigione registrata</p></div>'}
        </div>
      </div>
      <!-- ROW 3: Banner potenziale incasso -->
      ${immAttivi.length>0&&potProv>0?`
      <div style="background:linear-gradient(135deg,#FFFBEB,#FEF3C7);border:2px solid #FDE68A;border-radius:14px;padding:16px 20px;margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:0.85rem;font-weight:800;color:#92400E;margin-bottom:2px"> Potenziale di Incasso — se vendesse tutti i ${immAttivi.length} immobili attivi</div>
            <div style="font-size:0.75rem;color:#B45309">Calcolato su provvigioni pattuite × split agente (${percAgt}%)</div>
          </div>
          <div style="display:flex;gap:20px;flex-wrap:wrap">
            <div style="text-align:center">
              <div style="font-size:1.05rem;font-weight:800;color:#78350F">${fmtE(potProv)}</div>
              <div style="font-size:0.65rem;color:#92400E;font-weight:700">Totale Provvigioni</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:1.25rem;font-weight:900;color:#B45309">${fmtE(potAgente)}</div>
              <div style="font-size:0.65rem;color:#92400E;font-weight:700">Quota Agente (${percAgt}%)</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:1.25rem;font-weight:900;color:#059669">${fmtE(potAgenteNetto)}</div>
              <div style="font-size:0.65rem;color:#065F46;font-weight:700">Netto (−${percUff}% ufficio)</div>
            </div>
          </div>
        </div>
      </div>`:''}
      <!-- ROW 4: Tabella immobili -->
      ${immAg.length?`
      <div style="background:white;border-radius:12px;border:1px solid var(--border);overflow:hidden">
        <div style="padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:0.78rem;font-weight:800;color:var(--text2)"> Tutti gli Immobili in Gestione (${immAg.length})</span>
          <span style="font-size:0.72rem;color:var(--text3)">Valore totale: <strong style="color:var(--brand)">${fmtE(immAg.reduce((s,{im})=>s+(parseFloat(im.prezzo)||0),0))}</strong></span>
        </div>
        <div style="overflow-x:auto"><table style="width:100%;font-size:0.78rem;border-collapse:collapse">
          <thead><tr style="background:var(--bg3)">
            <th style="padding:7px 10px;text-align:left;font-weight:700;color:var(--text3);font-size:0.63rem;text-transform:uppercase;letter-spacing:.5px">Immobile</th>
            <th style="padding:7px 10px;text-align:left;font-weight:700;color:var(--text3);font-size:0.63rem;text-transform:uppercase;letter-spacing:.5px">Ref.</th>
            <th style="padding:7px 10px;text-align:left;font-weight:700;color:var(--text3);font-size:0.63rem;text-transform:uppercase;letter-spacing:.5px">Proprietario</th>
            <th style="padding:7px 10px;text-align:right;font-weight:700;color:var(--text3);font-size:0.63rem;text-transform:uppercase;letter-spacing:.5px">Prezzo</th>
            <th style="padding:7px 10px;text-align:center;font-weight:700;color:var(--text3);font-size:0.63rem;text-transform:uppercase;letter-spacing:.5px">Provv.</th>
            <th style="padding:7px 10px;text-align:right;font-weight:700;color:var(--text3);font-size:0.63rem;text-transform:uppercase;letter-spacing:.5px">Pot. Agente</th>
            <th style="padding:7px 10px;text-align:center;font-weight:700;color:var(--text3);font-size:0.63rem;text-transform:uppercase;letter-spacing:.5px">Stato</th>
            <th style="padding:7px 10px;text-align:center"></th>
          </tr></thead>
          <tbody>${immAg.map(({im,idx},rowI)=>{
            const prezzo=parseFloat(im.prezzo)||0;
            const impFisso=parseFloat(im.incImp)||0;
            const percProv=parseFloat(im.incPerc)||0;
            const provvTot=impFisso>0?impFisso:(prezzo*percProv/100);
            const potAgt=provvTot*percAgt/100;
            const isAttivo=im.stato==='attivo'||im.stato==='proposta';
            const statoCol=im.stato==='attivo'?'#15803D':im.stato==='proposta'?'#C2410C':im.stato==='venduto'?'#1D4ED8':'#64748B';
            const statoBg=im.stato==='attivo'?'#DCFCE7':im.stato==='proposta'?'#FFEDD5':im.stato==='venduto'?'#DBEAFE':'#F1F5F9';
            return`<tr style="border-bottom:1px solid var(--border);background:${rowI%2===0?'white':'#FAFBFC'}">
              <td style="padding:7px 10px"><div style="font-weight:700">${im.tipo||'—'}${im.comune?` <span style="font-weight:400;color:var(--text3)">· ${im.comune}</span>`:''}</div>${im.zona?`<div style="font-size:0.7rem;color:var(--text4)">${im.zona}</div>`:''}</td>
              <td style="padding:7px 10px;font-family:monospace;color:var(--text3);font-size:0.72rem">${im.ref||idx}</td>
              <td style="padding:7px 10px;font-size:0.78rem;color:var(--text3)">${im.contatto||'—'}</td>
              <td style="padding:7px 10px;text-align:right;font-weight:800;color:var(--brand)">${prezzo>0?fmtE(prezzo):'—'}</td>
              <td style="padding:7px 10px;text-align:center;font-size:0.72rem;color:var(--text3)">${percProv>0?percProv+'%':impFisso>0?fmtE(impFisso):'—'}</td>
              <td style="padding:7px 10px;text-align:right;font-weight:700;color:${isAttivo&&potAgt>0?'#059669':'var(--text4)'}">${isAttivo&&potAgt>0?fmtE(potAgt):'—'}</td>
              <td style="padding:7px 10px;text-align:center"><span style="padding:2px 8px;border-radius:8px;font-size:0.65rem;font-weight:700;background:${statoBg};color:${statoCol}">${im.stato||'attivo'}</span></td>
              <td style="padding:7px 10px;text-align:center"><button onclick="this.closest('.overlay').remove();openSchedaImmobile(${idx})" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:0.7rem;color:var(--brand)"></button></td>
            </tr>`;}).join('')}
          </tbody>
        </table></div>
      </div>`:'<div class="empty-state" style="padding:20px"><p>Nessun immobile assegnato a questo agente</p></div>'}
    </div>
    <div class="mfoot">
      <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Chiudi</button>
      <button class="btn btn-primary" onclick="this.closest('.overlay').remove();openAgenteModal(${i})"> Modifica Agente</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

function delAgente(i){
  const inUse=D.provvigioni.some(p=>String(p.agenteIdx)===String(i));
  if(inUse&&!confirm('Questo agente ha provvigioni collegate. Eliminare comunque? Le provvigioni rimarranno ma perderanno il riferimento agente.')) return;
  if(!inUse&&!confirm('Eliminare agente?')) return;
  D.agenti.splice(i,1);
  D.provvigioni.forEach(p=>{if(String(p.agenteIdx)===String(i)) p.agenteIdx=undefined;});
  saveD(); renderProvvigioni();
}

// ---- CRUD Altri Incassi ----

// --- BRIDGE window ---
Object.assign(window, { renderAgenti, agAddAgenzia, agAggiornaSelectPrincipale, agGetAgenzie, agSetAgenzie, openAgenteModal, saveAgente, openAgenteSchedaPopup, delAgente });
export { renderAgenti, openAgenteModal, saveAgente, delAgente };
