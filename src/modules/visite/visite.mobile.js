// modules/visite/visite.mobile.js — vista MOBILE del modulo Visite.
// Estratto (52463-52855): mobOpenVisitaFromCliente, mobOpenVisitaForm,
// _mobVisCliChange, _mobImmPickerToggle, _mobImmPickerSelect, mobSaveVisita, mobDelVisita.
// Dipendenze esterne (monolite via window): _mob*, mobSheet*, mobToast, renderVisite.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function mobOpenVisitaFromCliente(cliIdx){
  var cl = D.clienti[cliIdx];
  if(!cl){ mobOpenVisitaForm(null, cliIdx, null); return; }

  /* Cerca immobile abbinato al cliente:
     1) im.clienteRef === cliIdx
     2) im.cliRef === cliIdx
     3) im.contatto === cl.nome (fallback per match per nome) */
  var immAbbinato = null;
  var immAbbIdx   = null;
  var attivi = (D.immobili||[]).map(function(im,i){ return {im:im, i:i}; })
    .filter(function(o){
      var s = (o.im.stato||'').toLowerCase();
      return s !== 'venduto' && s !== 'archiviato' && s !== 'non attivo';
    });

  // Match per clienteRef (campo principale usato dalla scheda immobile)
  for(var k=0; k<attivi.length; k++){
    var o = attivi[k];
    if(o.im.clienteRef !== undefined && o.im.clienteRef !== null && o.im.clienteRef !== ''){
      if(String(o.im.clienteRef) === String(cliIdx)){
        immAbbinato = o.im; immAbbIdx = o.i; break;
      }
    }
  }
  // Fallback: match per cliRef
  if(immAbbIdx === null){
    for(var k=0; k<attivi.length; k++){
      var o = attivi[k];
      if(o.im.cliRef !== undefined && o.im.cliRef !== null && o.im.cliRef !== ''){
        if(String(o.im.cliRef) === String(cliIdx)){
          immAbbinato = o.im; immAbbIdx = o.i; break;
        }
      }
    }
  }
  // Fallback: match per nome contatto
  if(immAbbIdx === null && cl.nome){
    for(var k=0; k<attivi.length; k++){
      var o = attivi[k];
      if(o.im.contatto && o.im.contatto.trim().toLowerCase() === cl.nome.trim().toLowerCase()){
        immAbbinato = o.im; immAbbIdx = o.i; break;
      }
    }
  }

  mobOpenVisitaForm(null, cliIdx, immAbbIdx, true);

  /* ── Se l'immobile è stato trovato: blocca il picker immobile (non modificabile) ── */
  if(immAbbIdx !== null){
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        var picker = document.getElementById('mob-vis-imm-picker');
        var portal = document.getElementById('mob-vis-imm-dropdown-portal');
        if(picker){
          picker.style.pointerEvents = 'none';
          picker.style.opacity       = '0.75';
          picker.style.cursor        = 'default';
          picker.title = 'Immobile bloccato: visita abbinata automaticamente all\'immobile del cliente';
          /* Badge "bloccato" */
          var badge = document.createElement('span');
          badge.textContent = '🔒';
          badge.style.cssText = 'position:absolute;top:4px;right:8px;font-size:0.8rem;';
          picker.style.position = 'relative';
          picker.appendChild(badge);
        }
        if(portal) portal.style.display = 'none';
      });
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════
   firma: mobOpenVisitaForm(visIdx, cliIdx, immIdx, lockImm)
   - visIdx valorizzato → modifica visita esistente
   - cliIdx valorizzato → preseleziona cliente
   - immIdx valorizzato → preseleziona immobile
   - lockImm=true → blocca il picker immobile
   ════════════════════════════════════════════════════════════════════════ */
function mobOpenVisitaForm(visIdx, preCliIdx, preImmIdx, lockImm){
  if(!D.immobili || !D.immobili.length){
    mobToast('Carica prima un immobile dal PC');
    return;
  }
  _mobEditingVisitaIdx = (visIdx !== null && visIdx !== undefined) ? visIdx : null;
  var v = (_mobEditingVisitaIdx !== null) ? D.visite[_mobEditingVisitaIdx] : null;
  document.getElementById('mob-sheet-visita-title').textContent = v ? 'Modifica visita' : 'Nuova visita';

  var todayStr = new Date().toISOString().slice(0,10);
  var nowH = String(new Date().getHours()).padStart(2,'0') + ':00';

  /* Default values */
  var dImm = v ? v.immRef : (preImmIdx !== null && preImmIdx !== undefined ? preImmIdx : '');
  var dCli = v ? (v.cliRef === '' || v.cliRef === undefined ? '' : v.cliRef) : (preCliIdx !== null && preCliIdx !== undefined ? preCliIdx : '');
  var dData = v ? v.data : todayStr;
  var dOra = v ? v.ora : nowH;
  var dCliente = v ? v.cliente : '';
  var dTel = v ? v.tel : '';
  var dAgenzia = v ? v.agenzia : '';
  var dEsito = v ? (v.esito||'IN ATTESA') : 'IN ATTESA';
  var dFeed = v ? v.feedback : '';
  var dNote = v ? v.note : '';

  /* Build immobile options — kept for reference but picker uses inline HTML */
  /* var immOpts = ... */

  /* Build cliente options */
  var cliOpts = '<option value="">— Senza cliente in rubrica —</option>' +
    (D.clienti||[]).map(function(cl,i){ return {cl:cl, i:i}; })
    .filter(function(o){ return !o.cl.archiviato; })
    .sort(function(a,b){ return (a.cl.nome||'').localeCompare(b.cl.nome||'','it'); })
    .map(function(o){
      return '<option value="'+o.i+'"'+(parseInt(dCli)===o.i?' selected':'')+'>'+_mobEsc(o.cl.nome||'(senza nome)')+'</option>';
    }).join('');

  /* Build immobile visual picker HTML */
  var selectedImm = D.immobili[parseInt(dImm)];
  var immPickerSelected = '';
  if(selectedImm){
    var selThumb = selectedImm.foto
      ? '<img src="'+_mobEsc(selectedImm.foto)+'" style="width:58px;height:44px;object-fit:cover;border-radius:7px;flex-shrink:0;border:1px solid #E2E8F0;" loading="lazy" alt="">'
      : '<div style="width:58px;height:44px;background:#F1F5F9;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px dashed #CBD5E1;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;color:#93C5FD;"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>';
    var selLbl = (selectedImm.tipo||'Immobile')+(selectedImm.ref?' · '+selectedImm.ref:'')+(selectedImm.comune?' — '+selectedImm.comune:'');
    var selSub = (selectedImm.incarico ? selectedImm.incarico.charAt(0).toUpperCase()+selectedImm.incarico.slice(1)+' · ' : '')+(selectedImm.prezzo ? '€ '+Number(selectedImm.prezzo).toLocaleString('it-IT') : '');
    immPickerSelected = selThumb
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="font-weight:700;font-size:0.88rem;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_mobEsc(selLbl)+'</div>'
      +   (selSub ? '<div style="font-size:0.75rem;color:#64748B;margin-top:2px;">'+_mobEsc(selSub)+'</div>' : '')
      + '</div>'
      + '<span style="font-size:0.8rem;color:#94A3B8;flex-shrink:0;">▾</span>';
  } else {
    immPickerSelected = '<div style="width:58px;height:44px;background:#F1F5F9;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px dashed #CBD5E1;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;color:#93C5FD;"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>'
      + '<div style="flex:1;color:#94A3B8;font-size:0.88rem;font-style:italic;">Seleziona immobile…</div>'
      + '<span style="font-size:0.8rem;color:#94A3B8;flex-shrink:0;">▾</span>';
  }

  /* Build dropdown items for picker — solo immobili attivi (esclusi venduti/archiviati) */
  var _immAttivi = (D.immobili||[]).map(function(im,i){ return {im:im, i:i}; })
    .filter(function(o){
      var s = (o.im.stato||'').toLowerCase();
      return s !== 'venduto' && s !== 'archiviato' && s !== 'non attivo';
    })
    .sort(function(a,b){ return (a.im.ref||'').localeCompare(b.im.ref||'','it'); });

  var immDropdownItems = '';
  if(!_immAttivi.length){
    immDropdownItems = '<div style="padding:14px 16px;font-size:0.85rem;color:#94A3B8;font-style:italic;text-align:center;">Nessun immobile attivo disponibile</div>';
  } else {
    immDropdownItems = '<div id="mob-vis-imm-item-none" onclick="_mobImmPickerSelect(\'\')" style="padding:11px 14px;font-size:0.85rem;color:#94A3B8;font-style:italic;cursor:pointer;border-bottom:1px solid #F3F4F6;">— Nessun immobile —</div>';
    _immAttivi.forEach(function(o){
      var im = o.im;
      var th = im.foto
        ? '<img src="'+_mobEsc(im.foto)+'" style="width:52px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid #E2E8F0;" loading="lazy" alt="">'
        : '<div style="width:52px;height:40px;background:#F1F5F9;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;color:#93C5FD;"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>';
      var lbl = (im.tipo||'Immobile')+(im.ref?' · '+im.ref:'')+(im.comune?' — '+im.comune:'');
      var sub = (im.incarico ? im.incarico+' · ' : '')+(im.prezzo ? '€ '+Number(im.prezzo).toLocaleString('it-IT') : '');
      var sel = String(parseInt(dImm)) === String(o.i);
      immDropdownItems += '<div onclick="_mobImmPickerSelect('+o.i+')" '
        + 'style="display:flex;align-items:center;gap:11px;padding:9px 14px;cursor:pointer;border-bottom:1px solid #F8FAFC;'+(sel?'background:#EFF6FF;':'')+'" '
        + 'onmouseenter="this.style.background=\'#F8FAFC\'" onmouseleave="this.style.background=\''+(sel?'#EFF6FF':'transparent')+'\'">'
        + th
        + '<div style="flex:1;min-width:0;">'
        +   '<div style="font-weight:600;font-size:0.85rem;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_mobEsc(lbl)+'</div>'
        +   (sub ? '<div style="font-size:0.72rem;color:#64748B;margin-top:2px;">'+_mobEsc(sub)+'</div>' : '')
        + '</div>'
        + (sel ? '<svg style="color:#2563EB;width:16px;height:16px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '')
        + '</div>';
    });
  }

  var body = document.getElementById('mob-sheet-visita-body');
  body.innerHTML = ''
    + '<div class="mob-field" style="position:static;">'
    +   '<label class="mob-field-lbl">Immobile <span class="req">*</span></label>'
    +   '<div id="mob-vis-imm-picker" onclick="_mobImmPickerToggle()" style="display:flex;align-items:center;gap:11px;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;background:white;cursor:pointer;transition:border-color .15s;min-height:64px;" data-val="'+_mobEsc(String(dImm))+'">'
    +     immPickerSelected
    +   '</div>'
    + '</div>'
    + '<div class="mob-row-2">'
    +   '<div class="mob-field"><label class="mob-field-lbl">Data <span class="req">*</span></label><input class="mob-input" type="date" id="mob-vis-data" value="'+_mobEsc(dData)+'"></div>'
    +   '<div class="mob-field"><label class="mob-field-lbl">Ora</label><input class="mob-input" type="time" id="mob-vis-ora" value="'+_mobEsc(dOra)+'"></div>'
    + '</div>'
    + '<div class="mob-field">'
    +   '<label class="mob-field-lbl">Cliente (rubrica)</label>'
    +   '<select class="mob-select" id="mob-vis-cli" onchange="_mobVisCliChange()">'+cliOpts+'</select>'
    + '</div>'
    + '<div class="mob-field"><label class="mob-field-lbl">Nome cliente</label><input class="mob-input" type="text" id="mob-vis-cliente" value="'+_mobEsc(dCliente)+'" placeholder="Anche se non in rubrica"></div>'
    + '<div class="mob-row-2">'
    +   '<div class="mob-field"><label class="mob-field-lbl">Telefono</label><input class="mob-input" type="tel" id="mob-vis-tel" value="'+_mobEsc(dTel)+'"></div>'
    +   '<div class="mob-field"><label class="mob-field-lbl">Agenzia</label><input class="mob-input" type="text" id="mob-vis-agenzia" value="'+_mobEsc(dAgenzia)+'" placeholder="Se non tua"></div>'
    + '</div>'
    + '<div class="mob-field">'
    +   '<label class="mob-field-lbl">Esito</label>'
    +   '<select class="mob-select" id="mob-vis-esito">'
    +     '<option value="IN ATTESA"'+(dEsito==='IN ATTESA'?' selected':'')+'>In attesa</option>'
    +     '<option value="POSITIVO"'+(dEsito==='POSITIVO'?' selected':'')+'>Positivo</option>'
    +     '<option value="NEGATIVO"'+(dEsito==='NEGATIVO'?' selected':'')+'>Negativo</option>'
    +   '</select>'
    + '</div>'
    + '<div class="mob-field"><label class="mob-field-lbl">Feedback</label><textarea class="mob-textarea" id="mob-vis-feedback" placeholder="Reazione, interesse, prezzo...">'+_mobEsc(dFeed)+'</textarea></div>'
    + '<div class="mob-field"><label class="mob-field-lbl">Note</label><textarea class="mob-textarea" id="mob-vis-note">'+_mobEsc(dNote)+'</textarea></div>'
    + (v ? '<button class="mob-sheet-action danger" style="width:100%;margin-top:8px;padding:12px;" onclick="mobDelVisita('+_mobEditingVisitaIdx+')">Elimina visita</button>' : '');

  mobSheetOpen('mob-sheet-visita');

  /* ── Blocca picker immobile se richiesto (da scheda cliente/immobile) ── */
  var _lockImmobile = lockImm === true || (preImmIdx !== null && preImmIdx !== undefined && preCliIdx === null && visIdx === null);

  /* ── Dropdown immobile come portal (fuori dal body scrollabile) ─────────
     Il dropdown è agganciato al document.body così non viene clippato
     dall'overflow:hidden del mob-sheet-body.                               */
  var _immPortal = document.getElementById('mob-vis-imm-dropdown-portal');
  if(!_immPortal){
    _immPortal = document.createElement('div');
    _immPortal.id = 'mob-vis-imm-dropdown-portal';
    _immPortal.style.cssText = 'display:none;position:fixed;background:white;'
      + 'border:1.5px solid #CBD5E1;border-radius:12px;'
      + 'box-shadow:0 8px 30px rgba(0,0,0,.15);z-index:99990;'
      + 'max-height:50vh;overflow-y:auto;';
    document.body.appendChild(_immPortal);
  }
  _immPortal.innerHTML = immDropdownItems;
  _immPortal.style.display = 'none';
  /* Salva riferimento globale al dropdown portal */
  window._mobImmPortal = _immPortal;

  /* Applica lock visivo al picker se richiesto */
  if(_lockImmobile && preImmIdx !== null && preImmIdx !== undefined){
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        var p = document.getElementById('mob-vis-imm-picker');
        if(p){
          p.style.pointerEvents = 'none';
          p.style.opacity       = '0.75';
          p.style.cursor        = 'default';
          p.title = 'Immobile bloccato: visita abbinata a questo immobile';
          var b = document.createElement('span');
          b.textContent = '\uD83D\uDD12';
          b.style.cssText = 'margin-left:8px;font-size:0.8rem;flex-shrink:0;';
          p.appendChild(b);
        }
        if(_immPortal) _immPortal.style.display = 'none';
      });
    });
  }
}
function _mobVisCliChange(){
  var sel = document.getElementById('mob-vis-cli');
  var idx = sel.value;
  if(idx === '' || !D.clienti[parseInt(idx)]) return;
  var cl = D.clienti[parseInt(idx)];
  var nm = document.getElementById('mob-vis-cliente');
  var tl = document.getElementById('mob-vis-tel');
  if(nm && !nm.value) nm.value = cl.nome || '';
  if(tl && !tl.value) tl.value = cl.tel || '';
}

/* ─── Picker visuale immobile nel form visita ───────────────────────────── */
function _mobImmPickerToggle(){
  var portal = document.getElementById('mob-vis-imm-dropdown-portal');
  if(!portal) return;
  var picker = document.getElementById('mob-vis-imm-picker');
  var isOpen = portal.style.display !== 'none';
  if(isOpen){
    portal.style.display = 'none';
    if(picker) picker.style.borderColor = 'var(--border)';
  } else {
    /* Posiziona il portal sotto il picker usando le coordinate assolute */
    if(picker){
      var rect = picker.getBoundingClientRect();
      var portalW = Math.min(rect.width, window.innerWidth - 28);
      portal.style.left   = Math.max(14, rect.left) + 'px';
      portal.style.top    = (rect.bottom + 6) + 'px';
      portal.style.width  = portalW + 'px';
      picker.style.borderColor = 'var(--brand)';
    }
    portal.style.display = 'block';
    /* Scorri all'elemento selezionato */
    setTimeout(function(){
      var sel = portal.querySelector('[style*="#EFF6FF"]');
      if(sel) sel.scrollIntoView({block:'nearest'});
    }, 50);
  }
}

function _mobImmPickerSelect(idx){
  var picker = document.getElementById('mob-vis-imm-picker');
  var portal = document.getElementById('mob-vis-imm-dropdown-portal');
  if(!picker) return;
  /* Chiudi portal */
  if(portal) portal.style.display = 'none';
  picker.style.borderColor = 'var(--border)';

  if(idx === '' || idx === null || idx === undefined){
    picker.setAttribute('data-val', '');
    picker.innerHTML = '<div style="width:58px;height:44px;background:#F1F5F9;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px dashed #CBD5E1;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;color:#93C5FD;"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>'
      + '<div style="flex:1;color:#94A3B8;font-size:0.88rem;font-style:italic;">Seleziona immobile…</div>'
      + '<span style="font-size:0.8rem;color:#94A3B8;flex-shrink:0;">▾</span>';
    return;
  }
  var im = D.immobili[parseInt(idx)];
  if(!im) return;
  picker.setAttribute('data-val', String(idx));
  var th = im.foto
    ? '<img src="'+_mobEsc(im.foto)+'" style="width:58px;height:44px;object-fit:cover;border-radius:7px;flex-shrink:0;border:1px solid #E2E8F0;" loading="lazy" alt="">'
    : '<div style="width:58px;height:44px;background:#F1F5F9;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px dashed #CBD5E1;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;color:#93C5FD;"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>';
  var lbl = (im.tipo||'Immobile')+(im.ref?' · '+im.ref:'')+(im.comune?' — '+im.comune:'');
  var sub = (im.incarico ? im.incarico.charAt(0).toUpperCase()+im.incarico.slice(1)+' · ' : '')+(im.prezzo ? '€ '+Number(im.prezzo).toLocaleString('it-IT') : '');
  picker.innerHTML = th
    + '<div style="flex:1;min-width:0;">'
    +   '<div style="font-weight:700;font-size:0.88rem;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_mobEsc(lbl)+'</div>'
    +   (sub ? '<div style="font-size:0.75rem;color:#64748B;margin-top:2px;">'+_mobEsc(sub)+'</div>' : '')
    + '</div>'
    + '<span style="font-size:0.8rem;color:#94A3B8;flex-shrink:0;">▾</span>';
}
function mobSaveVisita(){
  var g = function(id){ var el=document.getElementById(id); return el?el.value:''; };
  /* Leggi immobile dal picker visuale */
  var pickerEl = document.getElementById('mob-vis-imm-picker');
  var immIdx = pickerEl ? pickerEl.getAttribute('data-val') : '';
  if(immIdx === '' || immIdx === null || !D.immobili[parseInt(immIdx)]){
    mobToast('Seleziona un immobile');
    return;
  }
  var im = D.immobili[parseInt(immIdx)];
  var data = g('mob-vis-data');
  if(!data){ mobToast('Inserisci la data'); return; }
  var cliRef = g('mob-vis-cli');
  var v = {
    immRef: parseInt(immIdx),
    immTitolo: (im.tipo||'')+(im.comune?' — '+im.comune:''),
    ref: im.ref || immIdx,
    data: data,
    ora: g('mob-vis-ora'),
    cliRef: cliRef !== '' ? parseInt(cliRef) : '',
    cliente: g('mob-vis-cliente'),
    tel: g('mob-vis-tel'),
    agenzia: g('mob-vis-agenzia'),
    esito: g('mob-vis-esito') || 'IN ATTESA',
    feedback: g('mob-vis-feedback'),
    note: g('mob-vis-note')
  };
  if(_mobEditingVisitaIdx !== null){
    D.visite[_mobEditingVisitaIdx] = v;
  } else {
    D.visite.push(v);
  }
  // Log CRM automatico per il cliente collegato
  if(v.cliRef!==''&&v.cliRef!==undefined){
    var _crmTxtM='Visita immobile: '+(v.immTitolo||v.ref||'')
      +(v.data?' del '+v.data.split('-').reverse().join('/'):'')
      +(v.esito?' — Esito: '+v.esito:'')
      +(v.note?' — Note: '+v.note:'')
      +' (da app mobile)';
    crmLogAuto(parseInt(v.cliRef),'Visita',_crmTxtM);
  }
  saveD();
  /* Push immediato a Firebase */
  try{ clearTimeout(window._saveTimer); if(typeof _cloudPushDebounced==='function') _cloudPushDebounced(); }catch(e){}
  /* Aggiorna i renderer desktop se attivi */
  try{ if(typeof renderVisite==='function') renderVisite(); }catch(e){}
  try{ if(typeof updateBadges==='function') updateBadges(); }catch(e){}
  mobSheetClose('mob-sheet-visita');
  /* Se siamo dentro una scheda, ricaricala per vedere la nuova visita */
  if(document.getElementById('mob-sheet-cliente').classList.contains('open')){
    if(v.cliRef !== '') mobOpenSchedaCliente(v.cliRef);
  } else if(document.getElementById('mob-sheet-immobile').classList.contains('open')){
    mobOpenSchedaImmobile(v.immRef);
  }
  mobToast(_mobEditingVisitaIdx !== null ? 'Visita aggiornata' : 'Visita salvata');
  _mobEditingVisitaIdx = null;
}
function mobDelVisita(i){
  if(!confirm('Eliminare questa visita?')) return;
  D.visite.splice(i, 1);
  saveD();
  try{ if(typeof renderVisite==='function') renderVisite(); }catch(e){}
  mobSheetClose('mob-sheet-visita');
  mobToast('Visita eliminata');
  _mobEditingVisitaIdx = null;
  /* Ricarica scheda se aperta */
  var clSheet = document.getElementById('mob-sheet-cliente');
  if(clSheet.classList.contains('open')){
    /* Devo rileggere idx cliente dal title… più semplice: chiudo */
    mobSheetClose('mob-sheet-cliente');
  }
  var imSheet = document.getElementById('mob-sheet-immobile');
  if(imSheet.classList.contains('open')) mobSheetClose('mob-sheet-immobile');
}

/* ════════════════════════════════════════════════════════════════════════
   FORM EVENTO (calendario)
   ════════════════════════════════════════════════════════════════════════ */

Object.assign(window, { mobOpenVisitaFromCliente, mobOpenVisitaForm, _mobVisCliChange, _mobImmPickerToggle, _mobImmPickerSelect, mobSaveVisita, mobDelVisita });
export { mobOpenVisitaForm, mobSaveVisita, mobDelVisita };
