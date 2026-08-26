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
  if(v){
    if(!v.id) v.id = (typeof genUUID==='function') ? genUUID() : ('vis_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
    _mobEditingVisitaId = v.id;
  } else {
    _mobEditingVisitaId = null;
  }
  document.getElementById('mob-sheet-visita-title').textContent = v ? 'Modifica visita' : 'Nuova visita';

  var todayStr = new Date().toISOString().slice(0,10);
  var nowH = String(new Date().getHours()).padStart(2,'0') + ':00';

  /* Default values */
  /* [MOB-ID] La posizione salvata sulla visita può essere scivolata: se il
     record porta l'uuid (identità stabile) la posizione viene ricalcolata
     da lì, così il foglio si apre sull'immobile e sul cliente GIUSTI. */
  var dImm = v ? v.immRef : (preImmIdx !== null && preImmIdx !== undefined ? preImmIdx : '');
  if(v && v.immUuid && Array.isArray(D.immobili)){
    var _iU = D.immobili.findIndex(function(z){ return z && z.uuid === v.immUuid; });
    if(_iU >= 0) dImm = _iU;
  }
  var dCli = v ? (v.cliRef === '' || v.cliRef === undefined ? '' : v.cliRef) : (preCliIdx !== null && preCliIdx !== undefined ? preCliIdx : '');
  if(v && v.cliUuid && Array.isArray(D.clienti)){
    var _cU = D.clienti.findIndex(function(z){ return z && z.uuid === v.cliUuid; });
    if(_cU >= 0) dCli = _cU;
  }
  var dData = v ? v.data : todayStr;
  var dOra = v ? v.ora : nowH;
  var dCliente = v ? v.cliente : '';
  var dTel = v ? v.tel : '';
  var dAgenzia = v ? v.agenzia : '';
  var dEsito = v ? (v.esito||'IN ATTESA') : 'IN ATTESA';
  var dFeed = v ? v.feedback : '';
  var dNote = v ? v.note : '';

  /* [26 ago 2026] PROFILO ACQUIRENTE — dati raccolti durante la visita.
     Sono informazioni sul CLIENTE (come paga, a che punto è col mutuo, che
     tempi ha), non sulla singola visita. Vengono però raccolte lì, quindi:
     si salvano sulla visita (fotografia di quel giorno) e aggiornano il
     profilo del cliente come ultima situazione nota.
     All'apertura i pulsanti partono da quello che la visita ha già; se è una
     visita nuova, dall'ultima situazione nota del cliente — così alla seconda
     visita con la stessa persona si conferma con un tocco invece di
     ricompilare tutto. */
  var _profCli = null;
  try{
    var _ci = (dCli!=='' && dCli!==undefined) ? parseInt(dCli) : -1;
    if(_ci>=0 && D.clienti && D.clienti[_ci] && D.clienti[_ci].profiloAcq) _profCli = D.clienti[_ci].profiloAcq;
  }catch(_e){}
  var _pv = (v && v.profiloAcq) ? v.profiloAcq : (_profCli || {});
  var dPag   = _pv.pagamento   || '';
  var dMut   = _pv.mutuo       || '';
  var dBudg  = (_pv.budget!==undefined && _pv.budget!==null) ? _pv.budget : '';
  var dVend  = _pv.vendePrima  || '';
  var dTempi = _pv.tempi       || '';
  var dInter = (v && v.profiloAcq) ? (v.profiloAcq.interesse||'') : '';   /* è di questa visita, non del cliente */
  var dPassoT= (v && v.profiloAcq) ? (v.profiloAcq.prossimo||'') : (_pv.prossimo||'');
  var dPassoD= (v && v.profiloAcq) ? (v.profiloAcq.prossimoData||'') : (_pv.prossimoData||'');
  var dProfNote = (v && v.profiloAcq) ? (v.profiloAcq.note||'') : (_pv.note||'');
  var _daCliente = !(v && v.profiloAcq) && !!_profCli;

  /* Gruppo di pulsanti a scelta singola: si tocca, non si scrive. */
  var _chips = function(campo, valore, voci){
    return '<div class="mob-chips" data-campo="'+campo+'" data-val="'+_mobEsc(valore||'')+'" '
      + 'style="display:flex;flex-wrap:wrap;gap:6px">'
      + voci.map(function(o){
          var att = String(valore||'')===String(o.v);
          return '<button type="button" onclick="_mobProfChip(this,\''+campo+'\',\''+o.v+'\')" '
            + 'data-v="'+_mobEsc(o.v)+'" style="border:1.5px solid '+(att?'#2563EB':'#E2E8F0')+';'
            + 'background:'+(att?'#EFF6FF':'#FFFFFF')+';color:'+(att?'#1D4ED8':'#475569')+';'
            + 'font-weight:'+(att?'800':'600')+';font-size:0.8rem;border-radius:999px;'
            + 'padding:8px 13px;cursor:pointer;-webkit-tap-highlight-color:transparent">'
            + _mobEsc(o.l)+'</button>';
        }).join('')
      + '</div>';
  };

  /* Build immobile options — kept for reference but picker uses inline HTML */
  /* var immOpts = ... */

  /* Build cliente options */
  var cliOpts = '<option value="">— Senza cliente in rubrica —</option>' +
    (D.clienti||[]).map(function(cl,i){ return {cl:cl, i:i}; })
    .filter(function(o){ return !o.cl.archiviato; })
    .sort(function(a,b){ return (a.cl.nome||'').localeCompare(b.cl.nome||'','it'); })
    .map(function(o){
      return '<option value="'+o.i+'" data-uuid="'+_mobEsc(o.cl.uuid||'')+'"'+(parseInt(dCli)===o.i?' selected':'')+'>'+_mobEsc(o.cl.nome||'(senza nome)')+'</option>';
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
    +   '<div id="mob-vis-imm-picker" onclick="_mobImmPickerToggle()" style="display:flex;align-items:center;gap:11px;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;background:white;cursor:pointer;transition:border-color .15s;min-height:64px;" data-val="'+_mobEsc(String(dImm))+'" data-uuid="'+_mobEsc(selectedImm && selectedImm.uuid ? selectedImm.uuid : '')+'">'
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

    /* ── Profilo acquirente: si compila toccando, in trenta secondi ── */
    + '<details id="mob-prof-acq" '+((dPag||dMut||dBudg||dTempi||dInter||dProfNote)?'open':'')+' '
    +   'style="margin-top:14px;border:1.5px solid #E2E8F0;border-radius:12px;overflow:hidden;background:#FAFBFC">'
    +   '<summary style="padding:12px 14px;font-weight:800;font-size:0.88rem;color:#0F172A;cursor:pointer;display:flex;align-items:center;gap:9px;list-style:none">'
    +     '<svg viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:17px;height:17px;flex-shrink:0"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    +     'Profilo acquirente'
    +     '<span style="margin-left:auto;font-size:0.72rem;font-weight:600;color:#94A3B8">tocca per aprire</span>'
    +   '</summary>'
    +   '<div style="padding:4px 14px 14px">'
    +     (_daCliente ? '<div style="font-size:0.74rem;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:7px 10px;margin-bottom:12px">Compilato con l\'ultima situazione nota di questo cliente. Conferma o correggi.</div>' : '')
    +     '<div class="mob-field"><label class="mob-field-lbl">Come paga</label>'
    +       _chips('pagamento', dPag, [{v:'contanti',l:'Contanti'},{v:'mutuo',l:'Mutuo'},{v:'misto',l:'Mutuo parziale'},{v:'dacapire',l:'Da capire'}])
    +     '</div>'
    +     '<div class="mob-field"><label class="mob-field-lbl">Se mutuo, a che punto</label>'
    +       _chips('mutuo', dMut, [{v:'deliberato',l:'Deliberato'},{v:'avviata',l:'Pratica avviata'},{v:'nonchiesto',l:'Non ancora chiesto'}])
    +     '</div>'
    +     '<div class="mob-field"><label class="mob-field-lbl">Budget reale (€)</label>'
    +       '<input class="mob-input" type="number" inputmode="decimal" id="mob-prof-budget" value="'+_mobEsc(String(dBudg))+'" placeholder="Quanto può spendere davvero"></div>'
    +     '<div class="mob-field"><label class="mob-field-lbl">Deve vendere prima</label>'
    +       _chips('vendePrima', dVend, [{v:'si',l:'Sì'},{v:'no',l:'No'}])
    +     '</div>'
    +     '<div class="mob-field"><label class="mob-field-lbl">Tempi</label>'
    +       _chips('tempi', dTempi, [{v:'subito',l:'Subito'},{v:'3mesi',l:'Entro 3 mesi'},{v:'oltre',l:'Oltre'},{v:'guarda',l:'Sta guardando'}])
    +     '</div>'
    +     '<div class="mob-field"><label class="mob-field-lbl">Interesse su questo immobile</label>'
    +       _chips('interesse', dInter, [{v:'alto',l:'Alto'},{v:'medio',l:'Medio'},{v:'basso',l:'Basso'}])
    +     '</div>'
    +     '<div class="mob-field"><label class="mob-field-lbl">Note sul cliente</label>'
    +       '<textarea class="mob-textarea" id="mob-prof-note" placeholder="Detta pure a voce: cosa cerca, vincoli, chi decide...">'+_mobEsc(dProfNote)+'</textarea></div>'
    +     '<div class="mob-field"><label class="mob-field-lbl">Prossimo passo</label>'
    +       '<input class="mob-input" type="text" id="mob-prof-prossimo" value="'+_mobEsc(dPassoT)+'" placeholder="Es. richiamare con proposta"></div>'
    +     '<div class="mob-field"><label class="mob-field-lbl">Entro il</label>'
    +       '<input class="mob-input" type="date" id="mob-prof-prossimo-data" value="'+_mobEsc(dPassoD)+'"></div>'
    +   '</div>'
    + '</details>'
    + (v ? '<button class="mob-sheet-action danger" style="width:100%;margin-top:8px;padding:12px;" onclick="mobDelVisita(\''+_mobEditingVisitaId+'\')">Elimina visita</button>' : '');

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
/* Tocco su un pulsante del profilo: accende quello scelto, spegne gli altri.
   Ritoccando lo stesso si annulla — serve per correggere senza dover
   ricaricare il foglio. */
function _mobProfChip(btn, campo, val){
  var box = btn.parentNode;
  if(!box) return;
  var attuale = box.getAttribute('data-val') || '';
  var nuovo = (String(attuale) === String(val)) ? '' : String(val);
  box.setAttribute('data-val', nuovo);
  Array.prototype.forEach.call(box.querySelectorAll('button'), function(b){
    var att = String(b.getAttribute('data-v')) === nuovo && nuovo !== '';
    b.style.borderColor = att ? '#2563EB' : '#E2E8F0';
    b.style.background  = att ? '#EFF6FF' : '#FFFFFF';
    b.style.color       = att ? '#1D4ED8' : '#475569';
    b.style.fontWeight  = att ? '800' : '600';
  });
}
/* Raccoglie il profilo dal foglio. Restituisce null se non è stato toccato
   niente, così una visita senza profilo non si porta dietro un oggetto vuoto. */
function _mobLeggiProfilo(){
  var chip = function(campo){
    var el = document.querySelector('.mob-chips[data-campo="'+campo+'"]');
    return el ? (el.getAttribute('data-val') || '') : '';
  };
  var val = function(id){ var el=document.getElementById(id); return el ? String(el.value||'').trim() : ''; };
  var p = {
    pagamento:    chip('pagamento'),
    mutuo:        chip('mutuo'),
    budget:       val('mob-prof-budget'),
    vendePrima:   chip('vendePrima'),
    tempi:        chip('tempi'),
    interesse:    chip('interesse'),
    note:         val('mob-prof-note'),
    prossimo:     val('mob-prof-prossimo'),
    prossimoData: val('mob-prof-prossimo-data')
  };
  var pieno = Object.keys(p).some(function(k){ return p[k] !== ''; });
  return pieno ? p : null;
}
/* Riporta sul CLIENTE l'ultima situazione nota. Le voci lasciate vuote non
   cancellano quello che c'era: si aggiorna solo ciò che è stato indicato.
   "interesse" resta fuori: riguarda l'immobile visitato, non il cliente. */
function _mobAggiornaProfiloCliente(cliRef, prof, dataVisita){
  if(!prof || cliRef==='' || cliRef===undefined || cliRef===null) return false;
  var c = D.clienti && D.clienti[parseInt(cliRef)];
  if(!c) return false;
  var vecchio = c.profiloAcq || {};
  var nuovo = {};
  Object.keys(vecchio).forEach(function(k){ nuovo[k] = vecchio[k]; });
  ['pagamento','mutuo','budget','vendePrima','tempi','note','prossimo','prossimoData'].forEach(function(k){
    if(prof[k] !== '' && prof[k] !== undefined) nuovo[k] = prof[k];
  });
  nuovo.aggiornato = dataVisita || new Date().toISOString().slice(0,10);
  c.profiloAcq = nuovo;
  return true;
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
    picker.setAttribute('data-uuid', '');
    picker.innerHTML = '<div style="width:58px;height:44px;background:#F1F5F9;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px dashed #CBD5E1;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;color:#93C5FD;"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>'
      + '<div style="flex:1;color:#94A3B8;font-size:0.88rem;font-style:italic;">Seleziona immobile…</div>'
      + '<span style="font-size:0.8rem;color:#94A3B8;flex-shrink:0;">▾</span>';
    return;
  }
  var im = D.immobili[parseInt(idx)];
  if(!im) return;
  picker.setAttribute('data-val', String(idx));
  picker.setAttribute('data-uuid', im.uuid || '');   /* [MOB-ID] identità stabile */
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
  /* Anti-drift: ri-risolvi l'indice reale della visita in modifica appena
     prima di leggere/scrivere D.visite — se nel frattempo (mentre il
     foglio era aperto) è arrivata una sincronizzazione cloud che ha
     riordinato l'array, l'indice catturato all'apertura non è più
     affidabile. */
  if(_mobEditingVisitaId){
    var _freshVIdx = (D.visite||[]).findIndex(function(x){ return x && x.id === _mobEditingVisitaId; });
    if(_freshVIdx < 0){
      mobToast('Questa visita non esiste più (forse aggiornata da un altro dispositivo)');
      _mobEditingVisitaIdx = null; _mobEditingVisitaId = null;
      if(typeof mobSheetClose==='function') mobSheetClose('mob-sheet-visita');
      if(typeof renderVisite==='function') renderVisite();
      return;
    }
    _mobEditingVisitaIdx = _freshVIdx;
  }
  var g = function(id){ var el=document.getElementById(id); return el?el.value:''; };
  /* Leggi immobile dal picker visuale */
  var pickerEl = document.getElementById('mob-vis-imm-picker');
  var immIdx = pickerEl ? pickerEl.getAttribute('data-val') : '';
  /* [MOB-ID] L'indice memorizzato all'apertura può non valere più: se una
     rilettura dal cloud ha riordinato D.immobili mentre il foglio era
     aperto, quel numero punta a un ALTRO immobile. L'uuid invece non
     scala mai: se c'è, la posizione viene ricalcolata da lui. */
  var immUuidSel = pickerEl ? (pickerEl.getAttribute('data-uuid') || '') : '';
  if(immUuidSel && Array.isArray(D.immobili)){
    var _ri = D.immobili.findIndex(function(z){ return z && z.uuid === immUuidSel; });
    if(_ri >= 0){
      immIdx = String(_ri);
    } else {
      mobToast('L\'immobile scelto non è più in elenco: riselezionalo');
      return;
    }
  }
  if(immIdx === '' || immIdx === null || !D.immobili[parseInt(immIdx)]){
    mobToast('Seleziona un immobile');
    return;
  }
  var im = D.immobili[parseInt(immIdx)];
  var data = g('mob-vis-data');
  if(!data){ mobToast('Inserisci la data'); return; }
  /* [MOB-ID] Stessa cosa per il cliente: l'uuid è appeso all'opzione scelta */
  var cliSel  = document.getElementById('mob-vis-cli');
  var cliRef  = cliSel ? cliSel.value : '';
  var cliUuid = '';
  try{
    if(cliSel && cliSel.selectedIndex >= 0){
      cliUuid = cliSel.options[cliSel.selectedIndex].getAttribute('data-uuid') || '';
    }
  }catch(_e){}
  if(cliUuid && Array.isArray(D.clienti)){
    var _rc = D.clienti.findIndex(function(z){ return z && z.uuid === cliUuid; });
    if(_rc >= 0) cliRef = String(_rc);
  }
  /* [MOB-ID] Firma dell'agente impostato su QUESTO dispositivo: la visita
     creata a mano dal telefono nasceva senza autore, mentre quella generata
     dall'agenda era già firmata. */
  var _agV = null;
  try{ if(typeof _agenteCorrente === 'function') _agV = _agenteCorrente(); }catch(_e){}
  var v = {
    id: 'vis_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8),
    immRef: parseInt(immIdx),
    immUuid: (im&&im.uuid)?im.uuid:(Array.isArray(D.immobili)&&D.immobili[parseInt(immIdx)]?D.immobili[parseInt(immIdx)].uuid:undefined),
    immTitolo: (im.tipo||'')+(im.comune?' — '+im.comune:''),
    ref: im.ref || immIdx,
    data: data,
    ora: g('mob-vis-ora'),
    cliRef: cliRef !== '' ? parseInt(cliRef) : '',
    cliUuid: cliUuid || '',
    cliente: g('mob-vis-cliente'),
    tel: g('mob-vis-tel'),
    agenzia: g('mob-vis-agenzia'),
    esito: g('mob-vis-esito') || 'IN ATTESA',
    feedback: g('mob-vis-feedback'),
    note: g('mob-vis-note'),
    profiloAcq: _mobLeggiProfilo()
  };
  /* Se il profilo non è stato toccato non si scrive un oggetto vuoto, e
     soprattutto non si cancella quello che una visita precedente aveva già. */
  if(v.profiloAcq === null) delete v.profiloAcq;
  if(_mobEditingVisitaIdx !== null){
    /* [MOB-ID] MODIFICA — fusione, non sostituzione.
       Prima qui c'era D.visite[idx] = v: buttava via il record vecchio e
       teneva solo l'id, cancellando tutto ciò che questo form non conosce
       (firma agente, _daEventoId che lega la visita all'appuntamento in
       agenda, _daAgenda, _modificata…). Ora i campi del form si scrivono
       SOPRA il record esistente e il resto resta dov'era. */
    var _old = D.visite[_mobEditingVisitaIdx] || {};
    if(_old.id) v.id = _old.id;
    var _fuso = {};
    Object.keys(_old).forEach(function(k){ _fuso[k] = _old[k]; });
    Object.keys(v).forEach(function(k){ if(v[k] !== undefined) _fuso[k] = v[k]; });
    /* La firma non si ruba: si mette solo se manca del tutto. */
    if(_agV && !_fuso.agenteUuid && !_fuso.agente){
      _fuso.agente = _agV.nome || '';
      _fuso.agenteUuid = _agV.uuid || '';
    }
    D.visite[_mobEditingVisitaIdx] = _fuso;
    v = _fuso;
  } else {
    if(_agV){ v.agente = _agV.nome || ''; v.agenteUuid = _agV.uuid || ''; }
    D.visite.push(v);
  }
  /* [26 ago 2026] Il profilo raccolto durante la visita aggiorna anche il
     cliente, come ultima situazione nota: alla visita successiva i pulsanti
     partono già da qui. */
  var _profAgg = false;
  try{ _profAgg = _mobAggiornaProfiloCliente(v.cliRef, v.profiloAcq, v.data); }catch(_e){}

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
  /* PUSH IMMEDIATO e FORZATO a Firestore (non debounced): garantisce che la
     visita salga al cloud SUBITO. Il push debounced precedente era ritardato e
     spesso non partiva (app chiusa/standby) → visita persa o non sincronizzata. */
  var _pushFatto = false;
  try{
    if(typeof window._visForcePushNow === 'function'){ window._visForcePushNow(); _pushFatto = true; }
  }catch(e){ console.warn('[mobSaveVisita] _visForcePushNow KO:', e); }
  if(!_pushFatto){
    try{ clearTimeout(window._saveTimer); if(typeof _cloudPushDebounced==='function') _cloudPushDebounced(); }catch(e){}
  }
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
  /* [MOB-RETE] "sincronizzata" era una promessa che il codice non poteva
     mantenere: _pushFatto dice solo che il push è stato CHIAMATO, non che
     è arrivato. Senza linea si dice la verità e mobToast aggiunge il resto. */
  var _senzaRete = false;
  try{
    _senzaRete = (typeof window._mobSenzaRete === 'function')
      ? window._mobSenzaRete()
      : (typeof navigator !== 'undefined' && navigator.onLine === false);
  }catch(_e){}
  mobToast(_mobEditingVisitaIdx !== null
    ? 'Visita aggiornata'
    : (_senzaRete ? 'Visita salvata' : (_pushFatto ? '✓ Visita salvata e sincronizzata' : 'Visita salvata (sync in corso…)')));
  _mobEditingVisitaIdx = null; _mobEditingVisitaId = null;
}
function mobDelVisita(idOrIdx){
  if(!confirm('Eliminare questa visita?')) return;
  var i = typeof idOrIdx==='string' ? (D.visite||[]).findIndex(function(x){ return x && x.id===idOrIdx; }) : idOrIdx;
  var _v = (i!==undefined && i>=0) ? D.visite[i] : null;
  if(!_v){
    mobToast('Visita non trovata (forse già cancellata altrove)');
    if(typeof renderVisite==='function') renderVisite();
    return;
  }
  try{ if(_v && typeof window._visAddDeletedId==='function') window._visAddDeletedId(_v); }catch(_e){}
  D.visite.splice(i, 1);
  saveD();
  try{ if(typeof window._visForcePushNow==='function') window._visForcePushNow(); }catch(_e){}
  try{ if(typeof renderVisite==='function') renderVisite(); }catch(e){}
  mobSheetClose('mob-sheet-visita');
  mobToast('Visita eliminata');
  _mobEditingVisitaIdx = null; _mobEditingVisitaId = null;
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

Object.assign(window, { mobOpenVisitaFromCliente, mobOpenVisitaForm, _mobVisCliChange, _mobImmPickerToggle, _mobImmPickerSelect, mobSaveVisita, mobDelVisita,
  _mobProfChip, _mobLeggiProfilo, _mobAggiornaProfiloCliente });
export { mobOpenVisitaForm, mobSaveVisita, mobDelVisita };
