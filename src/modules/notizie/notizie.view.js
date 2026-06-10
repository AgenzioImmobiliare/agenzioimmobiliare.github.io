// modules/notizie/notizie.view.js — vista DESKTOP del modulo Notizie.
// Estratto (27741-27986): openNotizia, notInfSelChange, saveNotizia, delNotizia,
// renderNotizie, convNotizia.
// Dipendenze esterne (monolite via window): openModal, closeModal, openClienteModal,
//   saveD, showToast, updateBadges, go, fmtD, fmtE, getNum, setNum, parseCurrStr,
//   dlgConfirm, today.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function openNotizia(idx){
  D.editIdx=null; D.editType=null;
  const g=id=>document.getElementById(id);
  ['not-nome','not-tel','not-email','not-fonte','not-comune','not-zona','not-note'].forEach(id=>{const el=g(id);if(el)el.value='';});
  ['not-modalita','not-tipo','not-tipo-imm','not-stato','not-prio'].forEach(id=>{const el=g(id);if(el)el.value=el.options[0]?.value||'';});
  g('not-tipo').value='Vendita'; g('not-stato').value='Da Contattare'; g('not-prio').value='Media';
  g('not-data').value=today(); g('not-followup').value=''; g('not-mq').value='';
  const el=g('not-valore'); if(el){el.removeAttribute('data-raw');el.value='';}
  // Reset infRef
  const infRefEl=g('not-inf-ref'); if(infRefEl) infRefEl.value='';
  // Popola select informatori
  const infSel=g('not-inf-sel');
  if(infSel){
    infSel.innerHTML='<option value="">-- Nessun informatore --</option>'+
      (D.informatori||[]).map((inf,i)=>`<option value="${i}">${inf.nome}${inf.zona?' ('+inf.zona+')':''}</option>`).join('');
    infSel.value='';
  }
  document.getElementById('mt-not').textContent=idx!==undefined?'Modifica Notizia':'Nuova Notizia';
  if(idx!==undefined){
    D.editIdx=idx; D.editType='notizia';
    const n=D.notizie[idx];
    const map={nome:'not-nome',tel:'not-tel',email:'not-email',modalita:'not-modalita',fonte:'not-fonte',
               tipo:'not-tipo',tipoImm:'not-tipo-imm',comune:'not-comune',zona:'not-zona',
               mq:'not-mq',stato:'not-stato',prio:'not-prio',data:'not-data',followup:'not-followup',note:'not-note'};
    Object.entries(map).forEach(([k,id])=>{const el=g(id);if(el&&n[k]!==undefined)el.value=n[k]||'';});
    setNum('not-valore', parseCurrStr(String(n.valore||'')));
    // Ripristina infRef e select informatore
    if(infRefEl&&n.infRef!==undefined&&n.infRef!==null){
      infRefEl.value=String(n.infRef);
      if(infSel) infSel.value=String(n.infRef);
    }
  }
  openModal('modal-notizia');
}
// Quando si seleziona un informatore dal select, aggiorna hidden infRef
function notInfSelChange(){
  const sel=document.getElementById('not-inf-sel');
  const infRefEl=document.getElementById('not-inf-ref');
  if(!sel||!infRefEl) return;
  infRefEl.value=sel.value;
  // Compila automaticamente la fonte con il nome dell'informatore
  if(sel.value!==''){
    const inf=D.informatori[parseInt(sel.value)];
    const fonteEl=document.getElementById('not-fonte');
    if(inf&&fonteEl&&!fonteEl.value) fonteEl.value=inf.nome;
  }
}
function saveNotizia(){
  const g=id=>{const el=document.getElementById(id);return el?el.value.trim():'';};
  if(!g('not-nome')){alert(' Il nome del contatto è obbligatorio.');return;}
  const n={
    nome:g('not-nome'),tel:g('not-tel'),email:g('not-email'),
    modalita:g('not-modalita'),fonte:g('not-fonte'),
    tipo:g('not-tipo'),tipoImm:g('not-tipo-imm'),
    comune:g('not-comune'),zona:g('not-zona'),mq:g('not-mq'),
    valore:getNum('not-valore'),
    stato:g('not-stato'),prio:g('not-prio'),
    data:g('not-data'),followup:g('not-followup'),note:g('not-note')
  };
  // Leggi infRef dal select informatori (priorità) o dal hidden field
  const infSelEl=document.getElementById('not-inf-sel');
  const infRefEl=document.getElementById('not-inf-ref');
  const infSelVal=infSelEl?.value;
  if(infSelVal!==''&&infSelVal!==undefined) n.infRef=parseInt(infSelVal);
  else if(infRefEl&&infRefEl.value!=='') n.infRef=parseInt(infRefEl.value);
  if(D.editIdx!==null&&D.editType==='notizia') D.notizie[D.editIdx]=n;
  else D.notizie.push(n);
  saveD(); closeModal('modal-notizia'); renderNotizie(); updateBadges();
}
function delNotizia(i){
  if(confirm('Eliminare questa notizia?')){D.notizie.splice(i,1);saveD();renderNotizie();updateBadges();}
}
function renderNotizie(){
  const pd=document.getElementById('pd-not');if(pd)pd.textContent=new Date().toLocaleDateString('it-IT');
  const q=(document.getElementById('f-not-q')?.value||'').toLowerCase();
  const stato=document.getElementById('f-not-stato')?.value||'';
  const tipo=document.getElementById('f-not-tipo')?.value||'';
  const prioOrder={'Alta':0,'Media':1,'Bassa':2,'':3,undefined:3};
  const f=D.notizie.filter(n=>{
    const t=[n.nome,n.comune,n.zona,n.fonte,n.note,n.tel].join(' ').toLowerCase();
    return(!q||t.includes(q))&&(!stato||n.stato===stato)&&(!tipo||n.tipo===tipo);
  }).sort((a,b)=>(prioOrder[a.priorita]??3)-(prioOrder[b.priorita]??3));
  // ── Stat cards colorate ──
  const tot=D.notizie.length;
  const daCont=D.notizie.filter(n=>n.stato==='Da Contattare').length;
  const inAtt=D.notizie.filter(n=>n.stato==='In Attesa').length;
  const inTrat=D.notizie.filter(n=>n.stato==='In Trattativa').length;
  const acq=D.notizie.filter(n=>n.stato==='Acquisito').length;
  const niEl=D.notizie.filter(n=>n.stato==='Non Interessato').length;
  const statsEl=document.getElementById('not-stats');
  if(statsEl) statsEl.innerHTML=`
    <div class="stat-card" style="background:linear-gradient(145deg,#1E3A8A,#2563EB);cursor:default">
      <div class="stat-label" style="color:rgba(255,255,255,.75);display:flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> Totale</div>
      <div class="stat-val">${tot}</div></div>
    <div class="stat-card" style="background:linear-gradient(145deg,#7C2D12,#EA580C);cursor:default">
      <div class="stat-label" style="color:rgba(255,255,255,.75);display:flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Da Contattare</div>
      <div class="stat-val">${daCont}</div></div>
    <div class="stat-card" style="background:linear-gradient(145deg,#78350F,#D97706);cursor:default">
      <div class="stat-label" style="color:rgba(255,255,255,.75);display:flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> In Attesa</div>
      <div class="stat-val">${inAtt}</div></div>
    <div class="stat-card" style="background:linear-gradient(145deg,#1E40AF,#3B82F6);cursor:default">
      <div class="stat-label" style="color:rgba(255,255,255,.75);display:flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> In Trattativa</div>
      <div class="stat-val">${inTrat}</div></div>
    <div class="stat-card" style="background:linear-gradient(145deg,#065F46,#059669);cursor:default">
      <div class="stat-label" style="color:rgba(255,255,255,.75);display:flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Acquisiti</div>
      <div class="stat-val">${acq}</div></div>`;

  // ── Config per stato ──
  const statoCfg={
    'Da Contattare':{bg:'#FEF2F2',border:'#FCA5A5',accent:'#EF4444',badge:'#FEE2E2',badgeTxt:'#B91C1C',
      icon:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'},
    'In Attesa':    {bg:'#FFFBEB',border:'#FDE68A',accent:'#F59E0B',badge:'#FEF3C7',badgeTxt:'#92400E',
      icon:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'},
    'Contattato':   {bg:'#EFF6FF',border:'#93C5FD',accent:'#2563EB',badge:'#DBEAFE',badgeTxt:'#1E40AF',
      icon:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.06 6.06l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>'},
    'In Trattativa':{bg:'#FEFCE8',border:'#FDE047',accent:'#CA8A04',badge:'#FEF9C3',badgeTxt:'#854D0E',
      icon:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'},
    'Acquisito':    {bg:'#F0FDF4',border:'#86EFAC',accent:'#16A34A',badge:'#DCFCE7',badgeTxt:'#14532D',
      icon:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'},
    'Non Interessato':{bg:'#F8FAFC',border:'#CBD5E1',accent:'#64748B',badge:'#F1F5F9',badgeTxt:'#475569',
      icon:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'},
  };
  const prioCfg={Alta:'#DC2626',Media:'#D97706',Bassa:'#64748B'};
  const prioIcon={
    Alta:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>',
    Media:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    Bassa:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 6 12 11 7 6"/><polyline points="17 13 12 18 7 13"/></svg>',
  };
  // SVG azioni
  const icoEdit='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const icoConv='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  const icoDel='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
  const icoPhone='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.06 6.06l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>';
  const icoPin='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  const icoCalendar='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  const icoEuro='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>';
  const icoHome='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  const today_=today();
  const cnt=document.getElementById('not-container');
  if(!f.length){
    cnt.innerHTML='<div class="empty-state"><div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a4 4 0 01-4-4V6"/></svg></div><p>Nessuna notizia.<br><small>Clicca <strong>+ Nuova Notizia</strong> per iniziare a registrare i lead.</small></p></div>';
    return;
  }
  cnt.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">
  ${f.map(n=>{
    const ri=D.notizie.indexOf(n);
    const cfg=statoCfg[n.stato]||statoCfg['Da Contattare'];
    const fuScad=n.followup&&n.followup<today_&&n.stato!=='Acquisito'&&n.stato!=='Non Interessato';
    const infNome=(n.infRef!==undefined&&n.infRef!==null&&D.informatori[n.infRef])
      ?D.informatori[n.infRef].nome:(n.fonte||null);
    // Iniziali avatar
    const ini=(n.nome||'?').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
    return`<div class="imm-card" style="cursor:pointer;border-color:${cfg.border};display:flex;flex-direction:column;overflow:hidden"
      ondblclick="openNotizia(${ri})" onclick="openNotizia(${ri})">
      <!-- Accent bar -->
      <div style="height:4px;background:${cfg.accent};flex-shrink:0"></div>
      <!-- Header: avatar + nome + stato -->
      <div style="padding:12px 13px 9px;display:flex;gap:10px;align-items:center">
        <div style="width:38px;height:38px;border-radius:10px;background:${cfg.badge};border:2px solid ${cfg.accent}33;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.82rem;color:${cfg.accent};flex-shrink:0;letter-spacing:-.5px">${ini}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:0.95rem;color:var(--text);line-height:1.25;word-break:break-word;margin-bottom:3px">${n.nome||'—'}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
            <span style="font-size:0.68rem;font-weight:800;background:${cfg.badge};color:${cfg.badgeTxt};padding:2px 8px;border-radius:20px;display:inline-flex;align-items:center;gap:3px">${cfg.icon} ${n.stato||'—'}</span>
            ${n.priorita?`<span style="font-size:0.65rem;font-weight:700;color:${prioCfg[n.priorita]||'#64748B'};display:inline-flex;align-items:center;gap:2px">${prioIcon[n.priorita]||''}${n.priorita}</span>`:''}
            ${n.tipo?`<span style="font-size:0.64rem;font-weight:700;background:#F1F5F9;color:#475569;padding:2px 7px;border-radius:6px">${n.tipo}</span>`:''}
          </div>
        </div>
      </div>
      <!-- Corpo: dati immobile + contatti -->
      <div style="padding:0 13px 10px;display:flex;flex-direction:column;gap:5px;border-bottom:1px solid var(--border)">
        ${(n.comune||n.zona)?`<div style="display:flex;align-items:center;gap:5px;font-size:0.78rem;color:var(--text3)"><span style="display:inline-flex;align-items:center;gap:4px;width:18px;height:18px;background:#F1F5F9;border-radius:5px;justify-content:center;flex-shrink:0">${icoPin}</span>${n.comune||''}${n.zona?' · '+n.zona:''}</div>`:''}
        ${n.tipoImm?`<div style="display:flex;align-items:center;gap:5px;font-size:0.78rem;color:var(--text3)"><span style="display:inline-flex;align-items:center;gap:4px;width:18px;height:18px;background:#F1F5F9;border-radius:5px;justify-content:center;flex-shrink:0">${icoHome}</span>${n.tipoImm}</div>`:''}
        ${n.valore?`<div style="display:flex;align-items:center;gap:5px;font-size:0.82rem;color:${cfg.accent};font-weight:800"><span style="display:inline-flex;align-items:center;gap:4px;width:18px;height:18px;background:#F1F5F9;border-radius:5px;justify-content:center;flex-shrink:0">${icoEuro}</span>${fmtE(n.valore)}</div>`:''}
        ${n.tel?`<a href="tel:${n.tel}" onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:5px;font-size:0.79rem;color:var(--brand);font-weight:600;text-decoration:none"><span style="display:inline-flex;align-items:center;gap:4px;width:18px;height:18px;background:#F1F5F9;border-radius:5px;justify-content:center;flex-shrink:0">${icoPhone}</span>${n.tel}</a>`:''}
      </div>
      <!-- Footer: source + date + azioni -->
      <div style="padding:8px 13px;display:flex;align-items:center;justify-content:space-between;margin-top:auto">
        <div style="display:flex;flex-direction:column;gap:2px">
          ${infNome?`<div style="font-size:0.68rem;color:${cfg.accent};font-weight:700">via ${infNome}</div>`:''}
          <div style="display:flex;gap:8px">
            ${n.data?`<span style="font-size:0.68rem;color:var(--text4);display:inline-flex;align-items:center;gap:3px">${icoCalendar}${fmtD(n.data)}</span>`:''}
            ${n.followup?`<span style="font-size:0.68rem;${fuScad?'color:#EF4444;font-weight:700':'color:var(--text4)'};display:inline-flex;align-items:center;gap:3px">${icoCalendar}${fmtD(n.followup)}${fuScad?' ⚑':''}</span>`:''}
          </div>
        </div>
        <div style="display:flex;gap:3px">
          <button class="icon-btn" onclick="event.stopPropagation();openNotizia(${ri})" title="Modifica">${icoEdit}</button>
          <button class="icon-btn" onclick="event.stopPropagation();convNotizia(${ri})" title="Trasferisci in Clienti" style="color:var(--green)">${icoConv}</button>
          <button class="icon-btn" onclick="event.stopPropagation();delNotizia(${ri})" title="Elimina" style="color:var(--red-l)">${icoDel}</button>
        </div>
      </div>
      ${n.note?`<div style="padding:0 13px 10px;font-size:0.74rem;color:var(--text3);font-style:italic;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${n.note}</div>`:''}
    </div>`;
  }).join('')}
  </div>`;
}
// Convert notizia to cliente
function convNotizia(i){
  const n=D.notizie[i];
  if(!n) return;
  const nome=n.nome||'—';
  dlgConfirm(
    `Trasferire <strong>"${nome}"</strong> in Anagrafica Clienti?<br><br>` +
    `Il contatto verrà aggiunto come nuovo cliente con i dati della notizia ` +
    `e <strong>rimosso dalla sezione Notizie</strong>.<br><br>` +
    `La scheda cliente si aprirà in modalità modifica.`,
    '', 'Trasferisci in Clienti'
  ).then(ok=>{
    if(!ok) return;
    // Crea il cliente con tutti i dati disponibili
    const cl={
      nome:n.nome||'',
      tel:n.tel||'',
      email:n.email||'',
      tipo:n.tipo==='Acquisto'?'acquirente':'venditore',
      fonte:n.modalita||n.fonte||'',
      citta:n.comune||'',
      zona:n.zona||'',
      op:n.tipo||'',
      note:(n.note||'')+(n.clienteSegnalato?'\nCliente segnalato: '+n.clienteSegnalato:'')+(n.telClienteSegnalato?' ('+n.telClienteSegnalato+')':''),
      data:today(),
      cf:'',budget:'',
      _daNotiziaIdx: i  // riferimento origine (solo per tracciabilità)
    };
    D.clienti.push(cl);
    const nuovoCliIdx=D.clienti.length-1;
    // Rimuove la notizia (non solo segna come Acquisito)
    D.notizie.splice(i,1);
    saveD();
    renderNotizie();
    updateBadges();
    showToast(` ${nome} aggiunto come Cliente — apertura scheda in corso...`,'','');
    // Apre subito la scheda in modifica
    setTimeout(()=>{
      go('clienti');
      setTimeout(()=>openClienteModal(nuovoCliIdx),300);
    },400);
  });
}

// [REFACTOR-FIX] Dichiarazioni provvigioni rimosse: appartengono al monolite, non a Notizie

// ══ _updateProvStats: aggiorna le card in base al tab attivo ══════════

Object.assign(window, { openNotizia, notInfSelChange, saveNotizia, delNotizia, renderNotizie, convNotizia });
export { renderNotizie, openNotizia, saveNotizia, delNotizia, convNotizia };
