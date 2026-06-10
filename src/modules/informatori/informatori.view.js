// modules/informatori/informatori.view.js — modulo Informatori + Registro Notizie.
// Estratto: openInformatoreModal (19088-19098), saveInformatore, editInformatore,
// delInformatore, openRegistroNotizie, rnRenderLista, renderInformatori (29869-29971).
// _rnInfIdx è stato locale (usato solo qui).
// Dipendenze esterne (monolite via window): openModal, closeModal, clearModal,
//   saveD, fmtD.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function openInformatoreModal(idx){
  D.editIdx=null; D.editType=null;
  clearModal('modal-informatore');
  if(idx!==undefined){
    D.editIdx=idx; D.editType='informatore';
    const inf=D.informatori[idx];
    ['nome','tel','mod','zona','stato','ultima','note'].forEach(k=>{const el=document.getElementById('inf-'+k);if(el)el.value=inf[k]||'';});
  }
  openModal('modal-informatore');
}


function saveInformatore(){const g=id=>document.getElementById(id).value;const inf={nome:g('inf-nome'),tel:g('inf-tel'),mod:g('inf-mod'),zona:g('inf-zona'),stato:g('inf-stato'),ultima:g('inf-ultima'),note:g('inf-note')};if(D.editIdx!==null&&D.editType==='informatore')D.informatori[D.editIdx]=inf;else D.informatori.push(inf);saveD();closeModal('modal-informatore');renderInformatori();}
function editInformatore(i){openInformatoreModal(i);}
function delInformatore(i){if(confirm('Eliminare?')){D.informatori.splice(i,1);saveD();renderInformatori();}}
// ── REGISTRO NOTIZIE INFORMATORE ──
let _rnInfIdx=null;
function openRegistroNotizie(infIdx){
  _rnInfIdx=infIdx;
  const inf=D.informatori[infIdx];
  if(!inf) return;
  document.getElementById('rn-titolo').textContent='Registro Notizie — '+inf.nome;
  document.getElementById('rn-sottotitolo').textContent=(inf.zona?inf.zona+' · ':'')+(inf.tel||'')+(inf.mod?' · '+inf.mod:'');
  rnRenderLista(infIdx);
  openModal('modal-registro-notizie');
}
function rnRenderLista(infIdx){
  const inf=D.informatori[infIdx];
  const notizie=(D.notizie||[]).map((n,i)=>({n,i})).filter(({n})=>
    (n.infRef!==undefined&&n.infRef!==null&&String(n.infRef)===String(infIdx)) ||
    ((n.fonte||'').toLowerCase().trim()===(inf?.nome||'').toLowerCase().trim())
  ).sort((a,b)=>(b.n.data||'').localeCompare(a.n.data||''));
  const el=document.getElementById('rn-lista');
  if(!notizie.length){
    el.innerHTML=`<div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:1.5rem"></span>
      <div>
        <div style="font-weight:700;color:#991B1B;font-size:0.88rem">Nessuna notizia comunicata</div>
        <div style="font-size:0.75rem;color:#B91C1C;margin-top:2px">Usa il form sopra per aggiungere la prima notizia.</div>
      </div>
    </div>`;
    return;
  }
  const statoColors={'Da Contattare':'#EF4444','In Attesa':'#F59E0B','Contattato':'#3B82F6','Chiuso':'#6B7280'};
  const statoBg={'Da Contattare':'#FEF2F2','In Attesa':'#FFFBEB','Contattato':'#EFF6FF','Chiuso':'#F1F5F9'};
  el.innerHTML=`<div style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text4);margin-bottom:8px">
     ${notizie.length} notizia${notizie.length!==1?'e':''} comunicata${notizie.length!==1?'e':''} <span style="color:#22C55E">●</span>
  </div>
  <div style="display:flex;flex-direction:column;gap:6px">
  ${notizie.map(({n,i})=>`
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:white;border:1.5px solid ${statoColors[n.stato]||'var(--border)'}33;border-left:4px solid ${statoColors[n.stato]||'#CBD5E1'};border-radius:8px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
          <span style="font-weight:700;font-size:0.88rem">${n.nome||'—'}</span>
          ${n.comune?`<span style="font-size:0.72rem;color:var(--text3)"> ${n.comune}</span>`:''}
          ${n.tipo?`<span style="font-size:0.65rem;font-weight:700;background:#F1F5F9;color:#475569;padding:1px 6px;border-radius:5px">${n.tipo}</span>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:0.68rem;font-weight:700;background:${statoBg[n.stato]||'#F1F5F9'};color:${statoColors[n.stato]||'#64748B'};padding:2px 7px;border-radius:7px">${n.stato||'—'}</span>
          ${n.data?`<span style="font-size:0.72rem;color:var(--text4)">${fmtD(n.data)}</span>`:''}
          ${n.tel?`<a href="tel:${n.tel}" style="font-size:0.72rem;color:var(--brand)"> ${n.tel}</a>`:''}
        </div>
        ${n.clienteSegnalato?`<div style="font-size:0.75rem;color:var(--text2);margin-top:4px"> <strong>${n.clienteSegnalato}</strong>${n.telClienteSegnalato?' · <a href="tel:'+n.telClienteSegnalato+'" style="color:var(--brand)">'+n.telClienteSegnalato+'</a>':''}</div>`:''}
        ${n.note?`<div style="font-size:0.75rem;color:var(--text3);margin-top:4px;font-style:italic">${n.note}</div>`:''}
      </div>
    </div>`).join('')}
  </div>`;
}



function renderInformatori(){
  const q=(document.getElementById('f-inf-q').value||'').toLowerCase();
  const stato=document.getElementById('f-inf-stato').value;
  const f=D.informatori.filter(inf=>{
    const t=[inf.nome,inf.zona,inf.note].join(' ').toLowerCase();
    return(!q||t.includes(q))&&(!stato||(inf.stato||'').toUpperCase()===stato);
  });
  document.getElementById('inf-tbody').innerHTML=f.length?f.map((inf,i)=>{
    const ri=D.informatori.indexOf(inf);
    // Notizie collegate: per infRef diretto o nome informatore in fonte
    const notizie=(D.notizie||[]).filter(n=>
      (n.infRef!==undefined&&n.infRef!==null&&String(n.infRef)===String(ri)) ||
      ((n.fonte||'').toLowerCase().trim()===(inf.nome||'').toLowerCase().trim())
    );
    const nTot=notizie.length;
    const nAttive=notizie.filter(n=>n.stato==='Da Contattare'||n.stato==='In Attesa').length;
    // Indicatore attività: verde se ha almeno 1 notizia, rosso se nessuna
    const dotColor=nTot>0?'#22C55E':'#EF4444';
    const dotTitle=nTot>0?`Attivo — ${nTot} notizia${nTot!==1?'e':''} comunicata${nTot!==1?'e':''}`:'Nessuna notizia comunicata';
    // Badge notizie
    const notBadge=nTot>0
      ?`<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;font-weight:700;background:#EFF6FF;color:#1D4ED8;padding:2px 8px;border-radius:8px;border:1px solid #BFDBFE">${nTot} ${nAttive>0?` <span style="background:#EF4444;color:white;border-radius:6px;padding:0 5px;font-size:0.65rem">${nAttive}</span>`:''}</span>`
      :`<span style="font-size:0.72rem;color:var(--text4);font-style:italic">Nessuna</span>`;
      return`<tr ondblclick="editInformatore(${ri})" style="cursor:pointer" title="Doppio click per modificare">
      <td style="color:var(--text3)">${i+1}</td>
      <td title="${dotTitle}"><div style="width:12px;height:12px;border-radius:50%;background:${dotColor};box-shadow:0 0 0 3px ${dotColor}22;margin:auto"></div></td>
      <td style="font-weight:700">${inf.nome||'—'}</td>
      <td><span class="badge badge-gray">${inf.mod||'—'}</span></td>
      <td>${inf.tel?`<a href="tel:${inf.tel}" style="color:var(--brand)">${inf.tel}</a>`:'—'}</td>
      <td>${inf.zona||'—'}</td>
      <td>${inf.stato==='ATTIVO'?'<span class="badge badge-green">ATTIVO</span>':'<span class="badge badge-gray">PASSIVO</span>'}</td>
      <td>${notBadge}</td>
      <td>${fmtD(inf.ultima)}</td>
      <td class="note-cell">${inf.note||'—'}</td>
      <td><div class="actions-col">
        <button class="icon-btn" onclick="openRegistroNotizie(${ri})" title="Registro notizie" style="color:var(--brand)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></button>
        <button class="icon-btn" onclick="editInformatore(${ri})" title="Modifica"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn" onclick="delInformatore(${ri})" style="color:var(--red-l)" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </div></td>
    </tr>`;
  }).join(''):'<tr><td colspan="11"><div class="empty-state"><div class="empty-icon"></div><p>Nessun informatore</p></div></td></tr>';
}

// ===== PRINT =====

// --- BRIDGE window ---
Object.assign(window, { openInformatoreModal, saveInformatore, editInformatore, delInformatore, openRegistroNotizie, rnRenderLista, renderInformatori });
export { renderInformatori, openInformatoreModal, saveInformatore, delInformatore };
