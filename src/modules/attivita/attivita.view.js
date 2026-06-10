// modules/attivita/attivita.view.js — vista DESKTOP del modulo Attività.
// Estratto (23347-23656): _attEnsure, _attStatoBadge, _attTipoBadge, renderAttivita,
// attImmBuild, _attImmRow, attImmToggle, attImmOutside, attImmSelect, openAttivita,
// saveAttivita, delAttivita, attSegnaCompletata.
// NOTA: renderAttivita è chiamata anche dal modulo Richieste (via window) e dal
// monolite (router, sync) — il bridge window la mantiene accessibile a tutti.
// Dipendenze esterne (monolite via window): saveD, showToast, updateBadges, go,
//   fmtD, today, openModal, closeModal, genUUID, _tlLog.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function _attEnsure(){ if(!Array.isArray(D.attivita)) D.attivita=[]; }

// Badge colore per stato
function _attStatoBadge(stato){
  var map={
    'Da fare':    ['#FFFBEB','#D97706','#FDE68A'],
    'In corso':   ['#EFF6FF','#1D4ED8','#BFDBFE'],
    'Inviato':    ['#F0FDF4','#15803D','#BBF7D0'],
    'Completata': ['#F5F3FF','#7C3AED','#DDD6FE'],
    'Annullata':  ['#F8FAFC','#94A3B8','#E2E8F0']
  };
  var c=map[stato]||['#F8FAFC','#64748B','#E2E8F0'];
  return '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:0.68rem;font-weight:700;background:'+c[0]+';color:'+c[1]+';border:1px solid '+c[2]+'">'+stato+'</span>';
}

// Badge colore per tipo
function _attTipoBadge(tipo){
  var icons={
    'Telefonata': '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.06 6.06l1.27-.27a2 2 0 012.11.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>',
    'Appuntamento': '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    'Email': '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    'Visita': '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    'Sopralluogo': '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>',
    'Proposta': '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    'Documento': '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  };
  var ico = icons[tipo]||'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
  return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:8px;font-size:0.72rem;font-weight:600;background:#F1F5F9;color:#374151;border:1px solid #E2E8F0">'+ico+' '+(tipo||'—')+'</span>';
}

function renderAttivita(){
  _attEnsure();
  var q   = (document.getElementById('f-att-q')?.value||'').toLowerCase();
  var fTipo  = document.getElementById('f-att-tipo')?.value||'';
  var fStato = document.getElementById('f-att-stato')?.value||'';
  var fOrd   = document.getElementById('f-att-ord')?.value||'scadenza-asc';
  var oggi = today();

  // Stat cards
  var tot = D.attivita.length;
  var daFare = D.attivita.filter(function(a){ return a.stato==='Da fare'; }).length;
  var inCorso = D.attivita.filter(function(a){ return a.stato==='In corso'; }).length;
  var scadute = D.attivita.filter(function(a){ return a.stato!=='Completata'&&a.stato!=='Annullata'&&a.scadenza&&a.scadenza<oggi; }).length;
  var statCards = document.getElementById('att-stat-cards');
  if(statCards){
    function statCard(label,val,col,bg,svgP){
      return '<div class="card" style="margin:0;border-top:3px solid '+col+'">'
        +'<div class="card-body" style="padding:14px 16px;display:flex;align-items:center;gap:12px">'
        +'<div style="width:38px;height:38px;background:'+bg+';border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:'+col+'">'+svgP+'</div>'
        +'<div><div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:'+col+'">'+label+'</div>'
        +'<div style="font-size:1.7rem;font-weight:900;color:'+col+';line-height:1">'+val+'</div></div>'
        +'</div></div>';
    }
    statCards.innerHTML =
      statCard('Totale',''+tot,'#2563EB','#EFF6FF','<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>')+
      statCard('Da Fare',''+daFare,'#D97706','#FFFBEB','<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>')+
      statCard('In Corso',''+inCorso,'#1D4ED8','#EFF6FF','<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 11 16 11"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 11"/></svg>')+
      statCard('Scadute',''+scadute,'#DC2626','#FEF2F2','<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>');
  }

  // Aggiorna badge sidebar
  var nbAtt = document.getElementById('nb-att');
  if(nbAtt){ nbAtt.textContent=daFare+inCorso; nbAtt.className='sb-badge is-warn'+(daFare+inCorso===0?' empty':''); }

  // Filtra e ordina
  var lista = D.attivita.filter(function(a,i){
    var t=[a.tipo,a.oggetto,a.cliente,a.agente,a.immRef||''].join(' ').toLowerCase();
    return (!q||t.includes(q))&&(!fTipo||a.tipo===fTipo)&&(!fStato||a.stato===fStato);
  });
  lista.sort(function(a,b){
    if(fOrd==='scadenza-asc')  return (a.scadenza||'9999').localeCompare(b.scadenza||'9999');
    if(fOrd==='scadenza-desc') return (b.scadenza||'').localeCompare(a.scadenza||'');
    if(fOrd==='ins-desc')      return (b.dataIns||'').localeCompare(a.dataIns||'');
    if(fOrd==='stato'){
      var ord={'Da fare':0,'In corso':1,'Completata':2,'Annullata':3};
      return (ord[a.stato]||9)-(ord[b.stato]||9);
    }
    return 0;
  });

  // Icone azioni
  var svgEdit = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  var svgDel  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
  var svgDone = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  var tbody = document.getElementById('att-tbody');
  if(!tbody) return;
  if(!lista.length){
    tbody.innerHTML='<tr><td colspan="8"><div class="empty-state"><div class="empty-icon"></div><p>Nessuna attività</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(function(a){
    var ri = D.attivita.indexOf(a);
    var scad = a.scadenza;
    var isScaduta = scad && scad<oggi && a.stato!=='Completata' && a.stato!=='Annullata';
    var isOggi    = scad && scad===oggi;
    var rowBg = isScaduta?'background:#FEF2F2':isOggi?'background:#FFFBEB':'';
    var scadLabel = scad
      ? '<span style="font-size:0.78rem;font-weight:700;color:'+(isScaduta?'#DC2626':isOggi?'#D97706':'var(--text)')+'">'+fmtD(scad)+'</span>'
        +(isScaduta?'<div style="font-size:0.65rem;color:#DC2626">Scaduta</div>':isOggi?'<div style="font-size:0.65rem;color:#D97706">Oggi</div>':'')
      : '—';
    // Immobile label
    var immLabel = '—';
    if(a.immRef!==undefined && a.immRef!=='' && D.immobili[parseInt(a.immRef)]){
      var im = D.immobili[parseInt(a.immRef)];
      immLabel = '<span style="font-size:0.77rem">'+(im.tipo||'')+(im.comune?' — '+im.comune:'')+'</span>';
    }
    return '<tr style="'+rowBg+'">'
      +'<td>'+_attTipoBadge(a.tipo)+'</td>'
      +'<td style="font-weight:600;max-width:200px"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px" title="'+(a.oggetto||'')+'">'+( a.oggetto||'—')+'</div></td>'
      +'<td style="font-size:0.82rem">'+( a.cliente||'—')+'</td>'
      +'<td>'+immLabel+'</td>'
      +'<td style="font-size:0.78rem;color:var(--text2)">'+( a.agente||'—')+'</td>'
      +'<td>'+scadLabel+'</td>'
      +'<td>'+_attStatoBadge(a.stato)+'</td>'
      +'<td><div class="actions-col" style="gap:4px">'
        +(a.stato!=='Completata'?'<button class="icon-btn" onclick="attSegnaCompletata('+ri+')" title="Segna completata" style="color:#15803D">'+svgDone+'</button>':'')
        +'<button class="icon-btn" onclick="openAttivita('+ri+')" title="Modifica">'+svgEdit+'</button>'
        +'<button class="icon-btn" onclick="delAttivita('+ri+')" style="color:var(--red-l)" title="Elimina">'+svgDel+'</button>'
      +'</div></td>'
    +'</tr>';
  }).join('');
}

// ── Dropdown custom immobile in modal Attività ──────────────────────────────
function attImmBuild(){
  var dd=document.getElementById('att-imm-dropdown');
  if(!dd) return;
  var rows=[];
  // Riga "Nessun immobile"
  rows.push(_attImmRow('','','— Nessun immobile —',''));
  // Immobili attivi
  D.immobili.forEach(function(im,i){
    var st=(im.stato||'').toLowerCase();
    if(st==='venduto'||st==='archiviato'||st==='non attivo'||st==='affittato') return;
    var venduto=(D.pratiche||[]).some(function(p){ return String(p.immRef)===String(i)&&p.stato==='vendita'; });
    if(venduto) return;
    var label='('+(im.ref||i)+') '+(im.tipo||'')+(im.comune?' — '+im.comune:'');
    var prezzo=im.prezzo?'€'+Number(im.prezzo).toLocaleString('it-IT'):'';
    var det=(im.mq?im.mq+'m² · ':'')+(im.camere?im.camere+' cam · ':'')+prezzo;
    rows.push(_attImmRow(String(i),im.foto||'',label,det));
  });
  dd.innerHTML=rows.join('');
}
function _attImmRow(val,foto,label,det){
  var fotoHtml=foto
    ?('<img src="'+foto+'" style="width:46px;height:34px;object-fit:cover;border-radius:5px;flex-shrink:0;display:block" loading="lazy">')
    :'<div style="width:46px;height:34px;background:#F1F5F9;border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#CBD5E1"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div>';
  var enc=function(s){ return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); };
  return '<div onmousedown="attImmSelect(&quot;'+enc(val)+'&quot;,&quot;'+enc(foto)+'&quot;,&quot;'+enc(label)+'&quot;)" '
    +'style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #F8FAFC" '
    +'onmouseover="this.style.background=&quot;#EFF6FF&quot;" onmouseout="this.style.background=&quot;white&quot;">'+fotoHtml
    +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:0.81rem;font-weight:'+(val?'700':'500')+';color:'+(val?'var(--text)':'var(--text3)')+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+label+'</div>'
      +(det?'<div style="font-size:0.68rem;color:var(--text3);margin-top:1px">'+det+'</div>':'')
    +'</div></div>';
}
function attImmToggle(){
  var dd=document.getElementById('att-imm-dropdown');
  if(!dd) return;
  if(dd.style.display==='none'){
    attImmBuild();
    dd.style.display='block';
    setTimeout(function(){ document.addEventListener('click',attImmOutside,{once:true}); },10);
  } else { dd.style.display='none'; }
}
function attImmOutside(e){
  var picker=document.getElementById('att-imm-picker');
  if(picker&&!picker.contains(e.target)){
    var dd=document.getElementById('att-imm-dropdown'); if(dd) dd.style.display='none';
  } else {
    setTimeout(function(){ document.addEventListener('click',attImmOutside,{once:true}); },10);
  }
}
function attImmSelect(val,foto,label){
  var hidden=document.getElementById('att-immobile'); if(hidden) hidden.value=val;
  var btnLabel=document.getElementById('att-imm-btn-label');
  var btnFoto=document.getElementById('att-imm-btn-foto');
  if(btnLabel){ btnLabel.textContent=label; btnLabel.style.color=val?'var(--text)':'var(--text3)'; }
  if(btnFoto){
    btnFoto.innerHTML=foto
      ?'<img src="'+foto+'" style="width:32px;height:24px;object-fit:cover;border-radius:4px;display:block">'
      :'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>';
  }
  var dd=document.getElementById('att-imm-dropdown'); if(dd) dd.style.display='none';
}
// ─────────────────────────────────────────────────────────────────────────────

function openAttivita(idx){
  _attEnsure();
  D.editIdx=null; D.editType=null;

  // Reset campi
  ['att-tipo','att-stato','att-agente','att-immobile'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.selectedIndex=0;
  });
  ['att-oggetto'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var clienteEl=document.getElementById('att-cliente'); if(clienteEl) clienteEl.value='';
  var scadEl=document.getElementById('att-scadenza'); if(scadEl) scadEl.value='';
  var dataInsEl=document.getElementById('att-data-ins'); if(dataInsEl) dataInsEl.value=today();

  // Titolo
  var mt=document.getElementById('mt-att');
  if(mt) mt.textContent = idx!==undefined ? 'Modifica Attività' : 'Nuova Attività';

  // Reset dropdown immobile custom
  attImmSelect('','','— Nessun immobile —');

  // Popola select agenti
  var selAg=document.getElementById('att-agente');
  if(selAg){
    selAg.innerHTML='<option value="">— Seleziona agente —</option>';
    (D.agenti||[]).forEach(function(ag){
      if(!ag||!ag.nome) return;
      var o=document.createElement('option');
      o.value=ag.nome;
      o.textContent=ag.nome+(ag.ruolo?' ('+ag.ruolo+')':'');
      selAg.appendChild(o);
    });
    // Aggiunge anche i clienti-agenti
    (D.clienti||[]).filter(function(c){ return c.tipo==='Agente'||c.tipo==='agente'; }).forEach(function(c){
      var o=document.createElement('option');
      o.value=c.nome; o.textContent=c.nome;
      selAg.appendChild(o);
    });
  }

  // Popola datalist clienti — ordine alfabetico
  var dl=document.getElementById('att-clienti-dl');
  if(dl){
    var cliSorted=(D.clienti||[]).slice().sort(function(a,b){
      return (a.nome||'').localeCompare(b.nome||'','it');
    });
    dl.innerHTML=cliSorted.map(function(c){ return '<option value="'+(c.nome||'')+'">'; }).join('');
  }

  // Se modifica: riempi campi
  if(idx!==undefined){
    D.editIdx=idx; D.editType='attivita';
    var a=D.attivita[idx];
    var g=function(id,val){ var el=document.getElementById(id); if(el) el.value=val||''; };
    g('att-tipo',a.tipo); g('att-stato',a.stato); g('att-agente',a.agente);
    g('att-oggetto',a.oggetto); g('att-cliente',a.cliente);
    g('att-scadenza',a.scadenza); g('att-data-ins',a.dataIns);
    if(a.immRef!==undefined && a.immRef!==''){
      var imIdx=parseInt(a.immRef);
      var imEdit=D.immobili[imIdx];
      if(imEdit) attImmSelect(String(imIdx), imEdit.foto||'', '('+( imEdit.ref||imIdx)+') '+(imEdit.tipo||'')+(imEdit.comune?' — '+imEdit.comune:''));
    }
  }

  openModal('modal-attivita');
}

function saveAttivita(){
  _attEnsure();
  var g=function(id){ var el=document.getElementById(id); return el?el.value.trim():''; };
  var tipo=g('att-tipo');
  var oggetto=g('att-oggetto');
  if(!tipo){ showToast('Seleziona il tipo di attività','','#DC2626'); return; }
  if(!oggetto){ showToast("Inserisci l'oggetto dell'attività",'','#DC2626'); return; }

  var a={
    tipo:     tipo,
    stato:    g('att-stato')||'Da fare',
    scadenza: g('att-scadenza'),
    agente:   g('att-agente'),
    oggetto:  oggetto,
    immRef:   g('att-immobile'),
    cliente:  g('att-cliente'),
    dataIns:  g('att-data-ins')||today()
  };

  if(D.editIdx!==null && D.editType==='attivita'){
    D.attivita[D.editIdx]=a;
  } else {
    D.attivita.push(a);
  }
  saveD();
  closeModal('modal-attivita');
  renderAttivita();
  showToast('Attività salvata','','#15803D');
}

function delAttivita(idx){
  _attEnsure();
  var a=D.attivita[idx];
  if(!a) return;
  dlgConfirm("Eliminare l'attività <strong>"+(a.oggetto||'')+"</strong>?",'','Elimina').then(function(ok){
    if(!ok) return;
    D.attivita.splice(idx,1);
    saveD(); renderAttivita();
    showToast('Attività eliminata','','#DC2626');
  });
}

function attSegnaCompletata(idx){
  _attEnsure();
  var a=D.attivita[idx];
  if(!a) return;
  a.stato='Completata';
  saveD(); renderAttivita();
  showToast('Attività segnata come completata','','#15803D');
}

// ══════════════════════════════════════════════════════════════════



Object.assign(window, { _attEnsure, _attStatoBadge, _attTipoBadge, renderAttivita, attImmBuild, _attImmRow, attImmToggle, attImmOutside, attImmSelect, openAttivita, saveAttivita, delAttivita, attSegnaCompletata });
export { renderAttivita, openAttivita, saveAttivita, delAttivita, attSegnaCompletata, _attEnsure };
