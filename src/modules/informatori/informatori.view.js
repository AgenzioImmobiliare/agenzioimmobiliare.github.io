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

/* Risolve un identificativo informatore in un indice ATTUALE dell'array.
   Accetta sia un id stabile (stringa) sia un indice numerico. */
function _infResolveIdx(idOrIdx){
  if(typeof idOrIdx==='string') return D.informatori.findIndex(function(x){return x&&x.id===idOrIdx;});
  return idOrIdx;
}

function openInformatoreModal(idxOrId){
  const idx=idxOrId!==undefined?_infResolveIdx(idxOrId):undefined;
  if(idxOrId!==undefined && (idx===undefined || idx<0)){
    if(typeof showToast==='function') showToast('Informatore non trovato (forse aggiornato altrove). Aggiorno la lista...','','#DC2626');
    try{ renderInformatori(); }catch(e){}
    return;
  }
  D.editIdx=null; D.editType=null; D.editInformatoreId=null;
  clearModal('modal-informatore');
  if(idx!==undefined){
    if(!D.informatori[idx].id) D.informatori[idx].id=(typeof genUUID==='function')?genUUID():('inf_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
    D.editIdx=idx; D.editType='informatore'; D.editInformatoreId=D.informatori[idx].id;
    const inf=D.informatori[idx];
    ['nome','categoria','tel','email','mod','zona','stato','ultima','note'].forEach(k=>{const el=document.getElementById('inf-'+k);if(el)el.value=inf[k]||'';});
  }
  openModal('modal-informatore');
}


function saveInformatore(){
  /* Anti-drift: ri-risolvi l'indice reale dell'informatore in modifica
     appena prima di leggere/scrivere D.informatori. */
  if(D.editType==='informatore' && D.editInformatoreId){
    const _freshIdx=D.informatori.findIndex(x=>x&&x.id===D.editInformatoreId);
    if(_freshIdx<0){
      alert('Questo informatore non esiste più (probabilmente cancellato o aggiornato da un altro dispositivo). La lista viene aggiornata.');
      D.editIdx=null; D.editType=null; D.editInformatoreId=null;
      try{ closeModal('modal-informatore'); }catch(_e){}
      renderInformatori();
      return;
    }
    D.editIdx=_freshIdx;
  }
  const g=id=>{const el=document.getElementById(id);return el?el.value:'';};
  const inf={nome:g('inf-nome'),categoria:g('inf-categoria')||'Informatore',tel:g('inf-tel'),email:g('inf-email'),mod:g('inf-mod'),zona:g('inf-zona'),stato:g('inf-stato'),ultima:g('inf-ultima'),note:g('inf-note')};
  if(D.editIdx!==null&&D.editType==='informatore'){
    inf.id=D.editInformatoreId||D.informatori[D.editIdx].id||((typeof genUUID==='function')?genUUID():('inf_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)));
    D.informatori[D.editIdx]=inf;
  } else {
    inf.id=(typeof genUUID==='function')?genUUID():('inf_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
    D.informatori.push(inf);
  }
  saveD();closeModal('modal-informatore');renderInformatori();
}
function editInformatore(idxOrId){openInformatoreModal(idxOrId);}
function delInformatore(idxOrId){
  const i=_infResolveIdx(idxOrId);
  if(i<0){
    if(typeof showToast==='function') showToast('Informatore non trovato (forse già cancellato altrove). Aggiorno la lista...','','#DC2626');
    try{ renderInformatori(); }catch(e){}
    return;
  }
  if(confirm('Eliminare?')){
    const iNow=_infResolveIdx(idxOrId);
    if(iNow<0) return;
    D.informatori.splice(iNow,1);saveD();renderInformatori();
  }
}
// ── REGISTRO NOTIZIE INFORMATORE ──
let _rnInfIdx=null;
function openRegistroNotizie(idxOrId){
  const infIdx=_infResolveIdx(idxOrId);
  if(infIdx<0){
    if(typeof showToast==='function') showToast('Informatore non trovato (forse aggiornato altrove). Aggiorno la lista...','','#DC2626');
    try{ renderInformatori(); }catch(e){}
    return;
  }
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
  const notizie=(D.notizie||[]).map((n,i)=>({n,i})).filter(({n})=>n&&n.fase!=='annuncio'&&(
    (n.infRef!==undefined&&n.infRef!==null&&String(n.infRef)===String(infIdx)) ||
    ((n.fonte||'').toLowerCase().trim()===(inf?.nome||'').toLowerCase().trim()))
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



/* [17 ott 2026] Scelte di Enzo: in Rubrica anche i PROPRIETARI degli
   immobili, attuali ed ex ("Anche ex proprietari"), più i filtri Tipo, Zona,
   Stato, il menù "Ordina per" e il clic sui titoli delle colonne.
   Proprietari e colleghi NON si copiano: si leggono ogni volta da
   Immobili/Clienti e da Agenti & Agenzie, e la scheda si apre da lì
   (una sola verità). Gli informatori restano disegnati come prima. */
let _infOrd={k:'tipo',dir:1};
try{ const s=JSON.parse(localStorage.getItem('lecase_infOrd')||'null'); if(s&&s.k) _infOrd={k:String(s.k),dir:s.dir<0?-1:1}; }catch(e){}
const _INF_GR={collab:'Collaboratori',colleghi:'Colleghi',prop:'Proprietari',ex:'Ex proprietari'};
const _INF_GR_ORD={collab:0,colleghi:1,prop:2,ex:3};
const _infEsc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _infZona=z=>String(z||'').trim().toUpperCase();
const _INF_SVG_APRI='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

/* I proprietari, raggruppati per persona: cliente collegato (uuid, poi
   posizione) oppure, se l'immobile non ha un cliente, il nome scritto nel
   campo contatto. Proprietario = almeno un immobile ancora attivo o in
   proposta; Ex proprietario = tutti venduti, affittati o non attivi. */
function _infProprietari(){
  const IM=Array.isArray(D.immobili)?D.immobili:[], CL=Array.isArray(D.clienti)?D.clienti:[];
  const perUuid={}; CL.forEach((c,i)=>{ if(c&&c.uuid) perUuid[c.uuid]=i; });
  const ult={};
  try{ (typeof window.ctTutti==='function'?window.ctTutti():[]).forEach(v=>{ if(v&&v.uuid&&v.ultimo&&v.ultimo.cosa!=='Scheda creata') ult[v.uuid]=v.ultimo; }); }catch(e){}
  const G={};
  IM.forEach((im,i)=>{
    if(!im || im.eliminato || im.eliminata) return;
    let ci=-1;
    if(im.clienteUuid && perUuid[im.clienteUuid]!==undefined) ci=perUuid[im.clienteUuid];
    else { const r=parseInt(im.clienteRef); if(!isNaN(r) && CL[r] && (!im.clienteUuid || !CL[r].uuid)) ci=r; }
    const c=ci>=0?CL[ci]:null;
    if(c && c.eliminata) return;
    const nome=String((c&&c.nome)||im.contatto||'').trim();
    if(!nome) return;
    const key=(c&&c.uuid)?'u:'+c.uuid:'n:'+nome.toUpperCase();
    let st=String(im.stato||'attivo').toLowerCase();
    try{ if(typeof window.calcolaStatoImmobile==='function') st=window.calcolaStatoImmobile(i); }catch(e){}
    const attivo=!(st==='venduto'||st==='non attivo'||st==='affittato'||st==='archiviato');
    const g=G[key]||(G[key]={ key, nome, uuid:(c&&c.uuid)||'', tel:(c&&(c.tel||c.telefono))||'', zona:(c&&c.citta)||'', note:(c&&c.note)||'', imm:[], attivi:0 });
    if(!g.tel) g.tel=im.tel||im.telefono||'';
    if(!g.zona) g.zona=im.comune||'';
    g.imm.push({ ref:im.ref||'', uuid:im.uuid||'', i, attivo, desc:[im.tipo,im.comune,im.indirizzo].filter(Boolean).join(' · ') });
    if(attivo) g.attivi++;
  });
  return Object.keys(G).map(k=>{ const g=G[k], u=g.uuid?ult[g.uuid]:null; g.ultima=u?String(u.data||''):''; return g; });
}
/* doppio clic su un proprietario: scheda cliente (ritrovata dall'uuid al
   momento del clic), altrimenti la scheda del suo primo immobile */
function infApriProprietario(keyEnc){
  const key=decodeURIComponent(keyEnc||'');
  const g=_infProprietari().find(x=>x.key===key);
  if(!g){ if(typeof showToast==='function') showToast('Proprietario non trovato: aggiorno la Rubrica','','#DC2626'); renderInformatori(); return; }
  if(g.uuid){
    const ci=(D.clienti||[]).findIndex(c=>c&&c.uuid===g.uuid);
    if(ci>=0 && typeof window.openSchedaCliente==='function'){ window.openSchedaCliente(ci); return; }
  }
  const im=g.imm[0]; if(im) infApriImmobile(im.uuid, im.i);
}
function infApriImmobile(uuid, pos){
  let i=-1;
  if(uuid) i=(D.immobili||[]).findIndex(x=>x&&x.uuid===uuid);
  if(i<0 && !uuid) i=parseInt(pos);
  if(isNaN(i) || i<0 || !(D.immobili||[])[i]){ if(typeof showToast==='function') showToast('Immobile non trovato: aggiorno la Rubrica','','#DC2626'); renderInformatori(); return; }
  if(typeof window.openSchedaImmobile==='function') window.openSchedaImmobile(i);
}
/* ordinamento: dal menù (daMenu=true, valore tipo 'nome-') o dal titolo
   di una colonna (stesso titolo = verso opposto) */
function infOrdina(k, daMenu){
  k=String(k||'tipo');
  if(daMenu){ _infOrd={ k:k.replace(/-$/,''), dir:/-$/.test(k)?-1:1 }; }
  else if(_infOrd.k===k) _infOrd.dir=-_infOrd.dir;
  else _infOrd={ k, dir:1 };
  try{ localStorage.setItem('lecase_infOrd', JSON.stringify(_infOrd)); }catch(e){}
  renderInformatori();
}

function renderInformatori(){
  const q=(document.getElementById('f-inf-q').value||'').toLowerCase();
  const stato=document.getElementById('f-inf-stato').value;
  const catSel=(document.getElementById('f-inf-categoria')||{}).value||'';
  const zonaSel=(document.getElementById('f-inf-zona')||{}).value||'';
  const R=[];   /* tutte le righe, prima dei filtri */

  /* 1 · informatori e tecnici della Rubrica (riga identica a prima) */
  (D.informatori||[]).forEach(inf=>{
    if(!inf) return;
    const ri=D.informatori.indexOf(inf);
    if(!inf.id) inf.id=(typeof genUUID==='function')?genUUID():('inf_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
    const infId=inf.id.replace(/'/g,"\\'");
    const cat=inf.categoria||'Informatore';
    // Notizie collegate: per infRef diretto o nome informatore in fonte
    const notizie=(D.notizie||[]).filter(n=>n&&n.fase!=='annuncio'&&(
      (n.infRef!==undefined&&n.infRef!==null&&String(n.infRef)===String(ri)) ||
      ((n.fonte||'').toLowerCase().trim()===(inf.nome||'').toLowerCase().trim()))
    );
    const nTot=notizie.length;
    const nAttive=notizie.filter(n=>n.stato==='Da Contattare'||n.stato==='In Attesa').length;
    // Indicatore attività: verde se ha almeno 1 notizia, rosso se nessuna
    const dotColor=nTot>0?'#22C55E':'#EF4444';
    const dotTitle=nTot>0?`Attivo — ${nTot} notizia${nTot!==1?'e':''} comunicata${nTot!==1?'e':''}`:'Nessuna notizia comunicata';
    const notBadge=nTot>0
      ?`<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;font-weight:700;background:#EFF6FF;color:#1D4ED8;padding:2px 8px;border-radius:8px;border:1px solid #BFDBFE">${nTot} ${nAttive>0?` <span style="background:#EF4444;color:white;border-radius:6px;padding:0 5px;font-size:0.65rem">${nAttive}</span>`:''}</span>`
      :`<span style="font-size:0.72rem;color:var(--text4);font-style:italic">Nessuna</span>`;
    R.push({ gr:cat==='Collega'?'colleghi':'collab', cat, nome:inf.nome||'', zona:_infZona(inf.zona), st:(inf.stato||'').toUpperCase()==='ATTIVO'?'ATTIVO':'PASSIVO', nN:nTot, ultima:inf.ultima||'',
      cerca:[inf.nome,inf.zona,inf.note,cat,inf.email,inf.tel].join(' '),
      html:n=>`<tr ondblclick="editInformatore('${infId}')" style="cursor:pointer" title="Doppio click per modificare">
      <td style="color:var(--text3)">${n}</td>
      <td title="${dotTitle}"><div style="width:12px;height:12px;border-radius:50%;background:${dotColor};box-shadow:0 0 0 3px ${dotColor}22;margin:auto"></div></td>
      <td style="font-weight:700">${inf.nome||'—'}</td>
      <td><span class="badge" style="background:#EEF2FF;color:#4338CA;border:1px solid #C7D2FE">${cat}</span></td>
      <td><span class="badge badge-gray">${inf.mod||'—'}</span></td>
      <td>${inf.tel?`<a href="tel:${inf.tel}" style="color:var(--brand)">${inf.tel}</a>`:'—'}</td>
      <td>${inf.zona||'—'}</td>
      <td>${inf.stato==='ATTIVO'?'<span class="badge badge-green">ATTIVO</span>':'<span class="badge badge-gray">PASSIVO</span>'}</td>
      <td>${notBadge}</td>
      <td>${fmtD(inf.ultima)}</td>
      <td class="note-cell">${inf.note||'—'}</td>
      <td><div class="actions-col">
        <button class="icon-btn" onclick="openRegistroNotizie('${infId}')" title="Registro notizie" style="color:var(--brand)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></button>
        <button class="icon-btn" onclick="editInformatore('${infId}')" title="Modifica"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn" onclick="delInformatore('${infId}')" style="color:var(--red-l)" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </div></td>
    </tr>` });
  });

  /* 2 · colleghi: letti da Agenti & Agenzie [14 ott 2026] */
  (Array.isArray(D.agenti)?D.agenti:[]).forEach((a,ai)=>{
    if(!a || !String(a.nome||'').trim()) return;
    const att=!a.stato || /^attiv/i.test(String(a.stato));
    R.push({ gr:'colleghi', cat:'Collega', nome:a.nome, zona:_infZona(a.citta), st:att?'ATTIVO':'PASSIVO', nN:0, ultima:'',
      cerca:[a.nome,a.citta,a.note,'collega',a.email,a.tel].join(' '),
      html:n=>`<tr ondblclick="openAgenteSchedaPopup(${ai})" style="cursor:pointer" title="Collega: la scheda sta in Agenti &amp; Agenzie (doppio click per aprirla)">
      <td style="color:var(--text3)">${n}</td>
      <td></td>
      <td style="font-weight:700">${_infEsc(a.nome)}</td>
      <td><span class="badge" style="background:#ECFDF5;color:#047857;border:1px solid #A7F3D0">Collega</span></td>
      <td><span class="badge badge-gray">—</span></td>
      <td>${a.tel?`<a href="tel:${_infEsc(a.tel)}" style="color:var(--brand)">${_infEsc(a.tel)}</a>`:'—'}</td>
      <td>${_infEsc(a.citta||'—')}</td>
      <td><span class="badge badge-gray">${_infEsc(a.stato||'—')}</span></td>
      <td><span style="font-size:0.72rem;color:var(--text4);font-style:italic">da Agenti &amp; Agenzie</span></td>
      <td>—</td>
      <td class="note-cell">${_infEsc(a.note||'—')}</td>
      <td><div class="actions-col"><button class="icon-btn" onclick="openAgenteSchedaPopup(${ai})" title="Apri la scheda in Agenti &amp; Agenzie">${_INF_SVG_APRI}</button></div></td>
    </tr>` });
  });

  /* 3 · proprietari ed ex proprietari: letti da Immobili e Clienti [17 ott 2026] */
  _infProprietari().forEach(g=>{
    const ex=!g.attivi, k=encodeURIComponent(g.key).replace(/'/g,'%27');
    const imm=g.imm.slice().sort((x,y)=>(y.attivo-x.attivo)||String(x.ref).localeCompare(String(y.ref)));
    const chips=imm.slice(0,4).map(m=>`<span class="inf-ref${m.attivo?'':' ex'}" style="cursor:pointer" title="${_infEsc((m.attivo?'':'Non più attivo · ')+(m.desc||'Immobile'))} (clic per aprirlo)" onclick="event.stopPropagation();infApriImmobile('${_infEsc(m.uuid)}',${m.i})">${m.ref?'Ref.'+_infEsc(m.ref):'senza ref'}</span>`).join('')+(imm.length>4?`<span style="font-size:.7rem;color:var(--text3)">+${imm.length-4}</span>`:'');
    R.push({ gr:ex?'ex':'prop', cat:ex?'Ex proprietario':'Proprietario', nome:g.nome, zona:_infZona(g.zona), st:ex?'PASSIVO':'ATTIVO', nN:g.imm.length, ultima:g.ultima,
      cerca:[g.nome,g.zona,g.note,ex?'ex proprietario':'proprietario',g.tel].concat(g.imm.map(m=>m.ref+' '+m.desc)).join(' '),
      html:n=>`<tr ondblclick="infApriProprietario('${k}')" style="cursor:pointer" title="${ex?'Ex proprietario':'Proprietario'}: la scheda sta in ${g.uuid?'Clienti':'Immobili'} (doppio click per aprirla)">
      <td style="color:var(--text3)">${n}</td>
      <td></td>
      <td style="font-weight:700">${_infEsc(g.nome)}</td>
      <td><span class="badge" style="${ex?'background:#F1F5F9;color:#475569;border:1px solid #CBD5E1':'background:#FFF7ED;color:#C2410C;border:1px solid #FED7AA'}">${ex?'Ex proprietario':'Proprietario'}</span></td>
      <td><span class="badge badge-gray">—</span></td>
      <td>${g.tel?`<a href="tel:${_infEsc(g.tel)}" style="color:var(--brand)">${_infEsc(g.tel)}</a>`:'—'}</td>
      <td>${_infEsc(g.zona||'—')}</td>
      <td>${ex?'<span class="badge badge-gray">EX</span>':'<span class="badge badge-green">ATTIVO</span>'}</td>
      <td>${chips}</td>
      <td>${g.ultima?fmtD(g.ultima):'—'}</td>
      <td class="note-cell">${_infEsc(g.note||'—')}</td>
      <td><div class="actions-col"><button class="icon-btn" onclick="infApriProprietario('${k}')" title="Apri la scheda ${g.uuid?'del cliente':'dell\'immobile'}">${_INF_SVG_APRI}</button></div></td>
    </tr>` });
  });

  /* menù Tipo: gruppi con i numeri + categorie presenti */
  const selCat=document.getElementById('f-inf-categoria');
  if(selCat){
    const nG={}; R.forEach(r=>{ nG[r.gr]=(nG[r.gr]||0)+1; });
    const cats=[...new Set(R.filter(r=>r.gr==='collab'||r.gr==='colleghi').map(r=>r.cat))].sort((a,b)=>a.localeCompare(b,'it'));
    selCat.innerHTML='<option value="">Tutti i tipi ('+R.length+')</option><optgroup label="Gruppi">'+Object.keys(_INF_GR).map(g=>`<option value="g:${g}">${_INF_GR[g]} (${nG[g]||0})</option>`).join('')+'</optgroup>'+
      '<optgroup label="Categorie">'+cats.map(c=>`<option value="${_infEsc(c)}">${_infEsc(c)}</option>`).join('')+'</optgroup>';
    selCat.value=catSel; if(selCat.value!==catSel) selCat.value='';
  }
  const selZona=document.getElementById('f-inf-zona');
  if(selZona){
    const zone=[...new Set(R.map(r=>r.zona).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
    selZona.innerHTML='<option value="">Tutte le zone</option>'+zone.map(z=>`<option value="${_infEsc(z)}">${_infEsc(z)}</option>`).join('');
    selZona.value=zonaSel; if(selZona.value!==zonaSel) selZona.value='';
  }
  const catOk=(catSel && selCat && selCat.value===catSel)?catSel:'';
  const zonaOk=(zonaSel && selZona && selZona.value===zonaSel)?zonaSel:'';

  /* filtri */
  const F=R.filter(r=>{
    if(q && r.cerca.toLowerCase().indexOf(q)<0) return false;
    if(stato && r.st!==stato) return false;
    if(catOk){ if(catOk.indexOf('g:')===0){ if(r.gr!==catOk.slice(2)) return false; } else if(r.cat!==catOk) return false; }
    if(zonaOk && r.zona!==zonaOk) return false;
    return true;
  });

  /* ordinamento */
  const d=_infOrd.dir, nomeCmp=(a,b)=>String(a.nome).localeCompare(String(b.nome),'it');
  const vuotoInFondo=(x,y)=>(!x&&y)?1:((x&&!y)?-1:0);
  F.sort((a,b)=>{
    switch(_infOrd.k){
      case 'nome':    return d*nomeCmp(a,b);
      case 'zona':    return vuotoInFondo(a.zona,b.zona) || d*String(a.zona).localeCompare(String(b.zona),'it') || nomeCmp(a,b);
      case 'stato':   return d*((a.st==='ATTIVO'?0:1)-(b.st==='ATTIVO'?0:1)) || nomeCmp(a,b);
      case 'notizie': return d*(b.nN-a.nN) || nomeCmp(a,b);
      case 'ultima':  return vuotoInFondo(a.ultima,b.ultima) || d*String(b.ultima).localeCompare(String(a.ultima)) || nomeCmp(a,b);
      default:        return d*(_INF_GR_ORD[a.gr]-_INF_GR_ORD[b.gr]) || String(a.cat).localeCompare(String(b.cat),'it') || nomeCmp(a,b);
    }
  });
  const selOrd=document.getElementById('f-inf-ord');
  if(selOrd){ const v=(_infOrd.k==='nome'&&d<0)?'nome-':_infOrd.k; selOrd.value=v; if(selOrd.value!==v) selOrd.value=''; }
  document.querySelectorAll('#inf-thead .inf-th').forEach(th=>{
    const on=th.getAttribute('data-k')===_infOrd.k; th.classList.toggle('on',on);
    const i=th.querySelector('i'); if(i) i.innerHTML=on?'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'+(d>0?'<polyline points="6 9 12 15 18 9"/>':'<polyline points="6 15 12 9 18 15"/>')+'</svg>':'';
  });
  const conta=document.getElementById('inf-conta');
  if(conta) conta.textContent=F.length===R.length?R.length+' contatti':F.length+' di '+R.length+' contatti';

  document.getElementById('inf-tbody').innerHTML=F.length?F.map((r,i)=>r.html(i+1)).join('')
    :'<tr><td colspan="12"><div class="empty-state"><div class="empty-icon"></div><p>'+(R.length?'Nessun contatto con questi filtri':'Nessun contatto in rubrica')+'</p></div></td></tr>';
}

// ===== PRINT =====

// --- BRIDGE window ---
Object.assign(window, { openInformatoreModal, saveInformatore, editInformatore, delInformatore, openRegistroNotizie, rnRenderLista, renderInformatori, infOrdina, infApriProprietario, infApriImmobile });
export { renderInformatori, openInformatoreModal, saveInformatore, delInformatore };
