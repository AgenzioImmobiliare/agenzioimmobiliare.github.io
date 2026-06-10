// modules/attivita/attivita.mobile.js — vista MOBILE del modulo Attività.
// Estratto: mobRenderAttivita + delete-keys + completa (48912-49264),
// mobAttivitaModifica + mobAttivitaSalva (49838-50095).
// Dipendenze esterne (monolite via window): _mob*, mobSheet*, mobToast, saveD,
//   _userColl, _cloudReady, _db (sync cloud), renderAttivita.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function mobRenderAttivita(){
  var c = document.getElementById('mob-content');
  if(!c || typeof D === 'undefined') return;
  if(!Array.isArray(D.attivita)) D.attivita = [];

  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var todayStr = oggi.toISOString().slice(0,10);

  var lista = [];
  D.attivita.forEach(function(a, idx){
    if(_mobSearchQ){
      var nomeCli = _resolveCliente(a);
      var hay = ((a.oggetto||'') + ' ' + nomeCli + ' ' + (a.tipo||'')).toLowerCase();
      if(hay.indexOf(_mobSearchQ.toLowerCase()) < 0) return;
    }
    /* Memorizzo l'indice originale in una proprietà non-enumerabile sul wrapper.
       Evito di mutare l'oggetto originale e di affidarmi a indexOf (che può
       restituire NaN o indici sbagliati se l'array contiene proxy o duplicati). */
    lista.push({ a:a, originalIdx:idx });
  });

  lista = lista.slice().sort(function(x,y){
    var a = x.a, b = y.a;
    var ord = {'Da fare':0,'In corso':1,'Inviato':2,'Completata':3,'Annullata':4};
    var oa = ord[a.stato]||9, ob = ord[b.stato]||9;
    if(oa !== ob) return oa - ob;
    var da = a.scadenza||'9999', db = b.scadenza||'9999';
    return da.localeCompare(db);
  });

  var nDaFare  = D.attivita.filter(function(a){ return a.stato==='Da fare'; }).length;
  var nScadute = D.attivita.filter(function(a){
    return a.stato!=='Completata' && a.stato!=='Annullata' && a.scadenza && a.scadenza < todayStr;
  }).length;

  var tipoIcon = {
    'Telefonata':'📞','Appuntamento':'📅','Email':'📧','Visita':'🏠',
    'Sopralluogo':'🔍','Proposta':'📝','Documento':'📄',
    'Richiesta documenti':'📋','Marketing':'📣','Valutazione immobile':'💰',
    'Invio scheda immobile':'📤','Altro':'⚡'
  };
  var statoColor = {'Da fare':'#EF4444','In corso':'#F59E0B','Inviato':'#3B82F6','Completata':'#22C55E','Annullata':'#94A3B8'};
  var statoBg   = {'Da fare':'#FEF2F2','In corso':'#FFFBEB','Inviato':'#EFF6FF','Completata':'#F0FDF4','Annullata':'#F8FAFC'};

  /* ── Sezione "Attività" — header con contatori ─────────────────────────── */
  var html = '<div class="mob-section-title">Attività <span class="mob-section-title-cnt">'+lista.length+'</span>'
    + (nDaFare > 0 ? '<span style="margin-left:8px;background:#FEF2F2;color:#DC2626;font-size:0.7rem;font-weight:700;padding:2px 7px;border-radius:20px;">'+nDaFare+' da fare</span>' : '')
    + (nScadute > 0 ? '<span style="margin-left:4px;background:#7F1D1D;color:#FCA5A5;font-size:0.7rem;font-weight:700;padding:2px 7px;border-radius:20px;">'+nScadute+' scadute</span>' : '')
    + '</div>';

  if(!lista.length){
    html += '<div class="mob-empty"><div class="mob-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div>'
      + (_mobSearchQ ? 'Nessuna attività trovata.' : 'Nessuna attività registrata.') + '</div>';
  } else {
    /* CSS swipe-to-delete (sempre safe come stringa) */
    html += '<style>'
      + '.mob-att-swipe-wrap{position:relative;overflow:hidden;border-radius:14px;margin-bottom:10px;}'
      + '.mob-att-delete-bg{position:absolute;right:0;top:0;bottom:0;width:80px;background:#DC2626;'
      + '  display:flex;align-items:center;justify-content:center;border-radius:0 14px 14px 0;cursor:pointer;}'
      + '.mob-att-card-inner{position:relative;z-index:1;transform:translateX(0);transition:transform .22s ease;'
      + '  touch-action:pan-y;background:#fff;border-radius:14px;}'
      + '.mob-att-card-inner.swiped{transform:translateX(-80px);}'
      + '</style>';
    /* Placeholder: le card vere vengono inserite dopo, tramite DOM API */
    html += '<div id="mob-att-list-container"></div>';
  }

  /* Pulsante "Nuova Attività" */
  html += '<button onclick="mobAttivitaModifica(undefined)" style="width:100%;padding:12px;background:linear-gradient(135deg,#059669,#047857);color:white;border:none;border-radius:12px;font-weight:700;font-size:0.88rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px;">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    + 'Nuova Attività</button>';

  c.innerHTML = html;

  /* ── Inserisco le card una a una usando DOM API ─────────────────────────
     NIENTE string concatenation di HTML per le card. Usiamo createElement
     + textContent (che gestisce automaticamente l'escape di tutti i caratteri
     speciali). Questo elimina il bug "NaN<...>" che appariva quando il
     contenuto di nomeCli/tel conteneva caratteri HTML problematici. */
  var listContainer = document.getElementById('mob-att-list-container');
  if(listContainer && lista.length){
    lista.forEach(function(item, listIdx){
      var a = item.a;
      var ri = item.originalIdx;
      if(typeof ri !== 'number' || isNaN(ri)) ri = parseInt(ri);
      if(isNaN(ri)) ri = listIdx;

      var nomeCli   = String(_resolveCliente(a) || '—');
      var scad      = a.scadenza || '';
      var isScaduta = scad && scad < todayStr && a.stato !== 'Completata' && a.stato !== 'Annullata';
      var icon      = tipoIcon[a.tipo] || '⚡';
      var sc        = statoColor[a.stato] || '#64748B';
      var sb        = statoBg[a.stato]   || '#F8FAFC';
      var telRaw    = String(a.tel || '');
      var telDigits = telRaw.replace(/\D/g, '');
      var stato     = String(a.stato || '—');
      var tipoA     = String(a.tipo || '—');

      /* WRAPPER swipe */
      var wrap = document.createElement('div');
      wrap.className = 'mob-att-swipe-wrap';
      wrap.id = 'mob-att-wrap-' + ri;

      /* SFONDO ROSSO ELIMINAZIONE */
      var delBg = document.createElement('div');
      delBg.className = 'mob-att-delete-bg';
      delBg.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
      delBg.addEventListener('click', (function(idx){ return function(){ mobAttivitaElimina(idx); }; })(ri));
      wrap.appendChild(delBg);

      /* CARD SCORREVOLE */
      var card = document.createElement('div');
      card.className = 'mob-att-card-inner mob-card';
      card.id = 'mob-att-card-' + ri;
      card.style.borderLeft = '3px solid ' + sc;
      card.style.marginBottom = '0';
      card.style.borderRadius = '14px';
      card.style.padding = '10px 12px';
      card.style.cursor = 'pointer';
      card.setAttribute('data-ri', String(ri));

      /* CONTENITORE COLONNE */
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:stretch;justify-content:space-between;gap:8px;';

      /* COLONNA SINISTRA */
      var colL = document.createElement('div');
      colL.style.cssText = 'min-width:0;flex:1;display:flex;flex-direction:column;justify-content:center;';

      var nameEl = document.createElement('div');
      nameEl.style.cssText = 'font-size:0.85rem;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      nameEl.textContent = nomeCli;  /* ← textContent: SEMPRE safe */
      colL.appendChild(nameEl);

      if(telRaw){
        var telEl = document.createElement('a');
        telEl.href = 'tel:' + telDigits;
        telEl.style.cssText = 'font-size:0.75rem;color:#2563EB;font-weight:600;text-decoration:none;margin-top:2px;display:block;';
        telEl.textContent = '📞 ' + telRaw;
        telEl.addEventListener('click', function(e){ e.stopPropagation(); });
        colL.appendChild(telEl);
      } else {
        var noTel = document.createElement('div');
        noTel.style.cssText = 'font-size:0.72rem;color:#CBD5E1;margin-top:2px;';
        noTel.textContent = '—';
        colL.appendChild(noTel);
      }
      row.appendChild(colL);

      /* COLONNA DESTRA */
      var colR = document.createElement('div');
      colR.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:4px;flex-shrink:0;';

      /* Stato pill */
      var statoPill = document.createElement('span');
      statoPill.style.cssText = 'font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:20px;background:'+sb+';color:'+sc+';white-space:nowrap;';
      statoPill.textContent = stato;
      colR.appendChild(statoPill);

      /* Tipo + icona */
      var tipoEl = document.createElement('span');
      tipoEl.style.cssText = 'font-size:0.7rem;color:#64748B;font-weight:600;white-space:nowrap;';
      tipoEl.textContent = icon + ' ' + tipoA;
      colR.appendChild(tipoEl);

      /* Scadenza */
      if(scad){
        var scadEl = document.createElement('span');
        scadEl.style.cssText = 'font-size:0.65rem;color:'+(isScaduta?'#DC2626':'#94A3B8')+';font-weight:'+(isScaduta?'700':'400')+';';
        scadEl.textContent = (isScaduta?'⚠ ':'') + scad;
        colR.appendChild(scadEl);
      }

      /* Pulsante elimina visibile */
      var delBtn = document.createElement('button');
      delBtn.style.cssText = 'background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:7px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;margin-top:2px;';
      delBtn.title = 'Elimina attività';
      delBtn.setAttribute('aria-label', 'Elimina attività');
      delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      delBtn.addEventListener('click', (function(idx){
        return function(e){ e.stopPropagation(); mobAttivitaElimina(idx); };
      })(ri));
      colR.appendChild(delBtn);

      row.appendChild(colR);
      card.appendChild(row);

      /* Double-click → modifica */
      card.addEventListener('dblclick', (function(idx){
        return function(){ mobAttivitaModifica(idx); };
      })(ri));

      wrap.appendChild(card);
      listContainer.appendChild(wrap);
    });
  }

  /* ── Inizializza swipe-to-delete su ogni card ─────────────────── */
  lista.forEach(function(item){
    var ri = item.originalIdx;
    if(typeof ri !== 'number' || isNaN(ri)) ri = parseInt(ri);
    if(isNaN(ri)) return;
    var cardEl = document.getElementById('mob-att-card-'+ri);
    if(!cardEl) return;
    var startX = 0, startY = 0, isDragging = false, isSwiped = false;

    /* Doppio tap → modifica attività */
    var _attLastTap = 0;

    cardEl.addEventListener('touchstart', function(e){
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = false;
    }, {passive:true});

    cardEl.addEventListener('touchmove', function(e){
      var dx = e.touches[0].clientX - startX;
      var dy = e.touches[0].clientY - startY;
      if(Math.abs(dx) > Math.abs(dy) + 5){ isDragging = true; }
    }, {passive:true});

    cardEl.addEventListener('touchend', function(e){
      if(isDragging){
        var dx = e.changedTouches[0].clientX - startX;
        if(dx < -40){
          cardEl.classList.add('swiped');
          isSwiped = true;
          setTimeout(function(){
            if(isSwiped){ cardEl.classList.remove('swiped'); isSwiped = false; }
          }, 3000);
        } else if(dx > 20 && isSwiped){
          cardEl.classList.remove('swiped');
          isSwiped = false;
        }
        return;
      }
      /* Doppio tap: due tap entro 320ms sullo stesso card */
      var now = Date.now();
      if(now - _attLastTap < 320){
        e.preventDefault();
        mobAttivitaModifica(ri);
        _attLastTap = 0;
      } else {
        _attLastTap = now;
      }
    }, {passive:false});
  });
}

function mobAttivitaElimina(idx){
  if(!Array.isArray(D.attivita) || !D.attivita[idx]) return;
  var a = D.attivita[idx];
  var label = a.oggetto || a.tipo || 'Attività';
  /* Ripristina visivamente la card prima della conferma */
  var cardEl = document.getElementById('mob-att-card-'+idx);
  if(cardEl) cardEl.classList.remove('swiped');

  /* Sheet di conferma a tutta larghezza (non usa alert nativo) */
  var sheet = document.getElementById('mob-sheet-att-del');
  if(!sheet){ sheet = document.createElement('div'); sheet.id='mob-sheet-att-del'; document.body.appendChild(sheet); }
  sheet.style.cssText = 'position:fixed;inset:0;z-index:300;display:flex;flex-direction:column;justify-content:flex-end;background:rgba(0,0,0,.5);';
  sheet.innerHTML = '<div style="background:#fff;border-radius:20px 20px 0 0;padding:22px 18px 32px;padding-bottom:max(32px,env(safe-area-inset-bottom));">'
    + '<div style="text-align:center;font-size:2rem;margin-bottom:10px;">🗑️</div>'
    + '<div style="font-weight:800;font-size:1rem;color:#0F172A;text-align:center;margin-bottom:8px;">Elimina attività?</div>'
    + '<div style="font-size:0.84rem;color:#64748B;text-align:center;line-height:1.55;margin-bottom:22px;">'
    +   '"<strong>'+_mobEsc(label)+'</strong>" verrà rimossa definitivamente.<br>L\'operazione non è reversibile.'
    + '</div>'
    + '<button onclick="mobAttivitaConfermaElimina('+idx+')" style="width:100%;padding:13px;background:#DC2626;color:#fff;border:none;border-radius:12px;font-weight:800;font-size:0.9rem;font-family:inherit;cursor:pointer;margin-bottom:10px;">Elimina definitivamente</button>'
    + '<button onclick="document.getElementById(\'mob-sheet-att-del\').style.display=\'none\'" style="width:100%;padding:13px;background:#F1F5F9;color:#475569;border:none;border-radius:12px;font-weight:700;font-size:0.9rem;font-family:inherit;cursor:pointer;">Annulla</button>'
    + '</div>';
  sheet.onclick = function(e){ if(e.target===sheet) sheet.style.display='none'; };
}

/* ════════════════════════════════════════════════════════════════════
   ATTIVITÀ BLOCKLIST — chiavi eliminate persistite nel localStorage.
   Impedisce al listener onSnapshot di reinserire attività già cancellate.
   ════════════════════════════════════════════════════════════════════ */
var _ATT_DEL_KEY = '_attDeletedKeys';

function _attGetDeletedKeys(){
  try{ return JSON.parse(localStorage.getItem(_ATT_DEL_KEY)||'[]'); }catch(e){ return []; }
}
function _attAddDeletedKey(key){
  if(!key) return;
  var keys = _attGetDeletedKeys();
  if(keys.indexOf(key) < 0){
    keys.push(key);
    if(keys.length > 300) keys = keys.slice(-300);
    try{ localStorage.setItem(_ATT_DEL_KEY, JSON.stringify(keys)); }catch(e){}
  }
}
function _attIsDeleted(att){
  if(!att) return false;
  var keys = _attGetDeletedKeys();
  if(att.id && keys.indexOf(att.id) >= 0) return true;
  var compositeKey = att.oggetto + '|' + (att.dataIns||'');
  return keys.indexOf(compositeKey) >= 0;
}

/* Push immediato di D.attivita a Firestore senza debounce */
function _attForcePushNow(){
  try{
    if(!window._cloudReady || typeof _userColl !== 'function') return;
    var coll = _userColl(); if(!coll) return;
    coll.doc('lecaseAZ2_attivita').set({
      valore: D.attivita || [],
      chunks: 1,
      _ts: Date.now()
    }).then(function(){
      console.log('[Attività] Push eliminazione immediato OK');
    }).catch(function(e){ console.warn('[Attività] Push eliminazione KO:', e); });
  }catch(e){ console.warn('[Attività] _attForcePushNow KO:', e); }
}

function mobAttivitaConfermaElimina(idx){
  var sheet = document.getElementById('mob-sheet-att-del');
  if(sheet) sheet.style.display='none';
  /* Chiude anche lo sheet di modifica se l'eliminazione è partita da lì */
  var editSheet = document.getElementById('mob-sheet-att-edit');
  if(editSheet) editSheet.style.display='none';
  if(!Array.isArray(D.attivita) || !D.attivita[idx]) return;

  var att = D.attivita[idx];

  /* Aggiungi alla blocklist usando id (se presente) o chiave composita */
  var attKey = att.id || (att.oggetto + '|' + (att.dataIns||''));
  _attAddDeletedKey(attKey);

  D.attivita.splice(idx, 1);
  if(typeof saveD === 'function') saveD();
  else if(typeof saveCloud === 'function') saveCloud();

  /* Push immediato per non perdere la cancellazione */
  _attForcePushNow();

  /* Toast conferma */
  var t = document.createElement('div');
  t.textContent = 'Attività eliminata';
  t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;padding:9px 18px;border-radius:10px;font-weight:700;font-size:0.83rem;font-family:Inter,sans-serif;z-index:99999;opacity:0;transition:opacity .15s;white-space:nowrap;';
  document.body.appendChild(t);
  requestAnimationFrame(function(){ t.style.opacity='1'; });
  setTimeout(function(){ t.style.opacity='0'; setTimeout(function(){ t.remove(); },200); }, 2200);
  mobRenderAttivita();
}


function mobAttivitaCompleta(idx){
  if(!Array.isArray(D.attivita) || !D.attivita[idx]) return;
  D.attivita[idx].stato = 'Completata';
  if(typeof saveCloud === 'function') saveCloud();
  mobRenderAttivita();
}


function mobAttivitaModifica(idx){
  var isNew = (idx === undefined || idx === null || idx === 'undefined');
  var a = isNew ? {tipo:'',stato:'Da fare',oggetto:'',cliente:'',tel:'',immRef:'',scadenza:''} : (D.attivita && D.attivita[idx]);
  if(!isNew && !a) return;

  var sheet = document.getElementById('mob-sheet-att-edit');
  if(!sheet){ sheet = document.createElement('div'); sheet.id='mob-sheet-att-edit'; document.body.appendChild(sheet); }

  /* Opzioni stati */
  var stati = ['Da fare','In corso','Inviato','Completata','Annullata'];
  var statiOpts = stati.map(function(s){ return '<option value="'+s+'"'+(a.stato===s?' selected':'')+'>'+s+'</option>'; }).join('');

  /* Opzioni tipi */
  var tipi = ['Telefonata','Appuntamento','Email','Visita','Sopralluogo','Proposta','Documento','Richiesta documenti','Marketing','Valutazione immobile','Invio scheda immobile','Altro'];
  var tipiOpts = tipi.map(function(t){ return '<option value="'+t+'"'+(a.tipo===t?' selected':'')+'>'+t+'</option>'; }).join('');

  /* ── Clienti non archiviati ── */
  var cliOpts = '<option value="">-- Seleziona dalla rubrica --</option>';
  var preCliRef = (a.cliRef !== undefined && a.cliRef !== '') ? String(a.cliRef) : '';
  (D.clienti||[]).filter(function(cl){ return !cl.archiviato; })
    .map(function(cl,i){ return {cl:cl,i:i}; })
    .sort(function(a2,b){ return (a2.cl.nome||'').localeCompare(b.cl.nome||'','it'); })
    .forEach(function(o){
      cliOpts += '<option value="'+o.i+'"'+(preCliRef===String(o.i)?' selected':'')+'>'+_mobEsc(o.cl.nome||'')+'</option>';
    });
  var preCliNome = (preCliRef === '' && a.cliente) ? (a.cliente||'') : '';

  /* ── Immobile collegato: mostra solo quello selezionato (compatto) ── */
  var preImmRef = (a.immRef !== undefined && a.immRef !== '') ? String(a.immRef) : '';
  var immSelCard = '';
  if(preImmRef !== '' && D.immobili && D.immobili[parseInt(preImmRef)]){
    var imSel = D.immobili[parseInt(preImmRef)];
    var iLbl  = (imSel.tipo||'Immobile')+(imSel.ref?' · Rif.'+imSel.ref:'')+(imSel.comune?' — '+imSel.comune:'');
    var iThumb = imSel.foto
      ? '<img src="'+_mobEsc(imSel.foto)+'" loading="lazy" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0;">'
      : '<div style="width:44px;height:44px;border-radius:8px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.2rem;">🏠</div>';
    immSelCard = '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:11px;border:2px solid #2563EB;background:#EFF6FF;margin-bottom:8px;">'
      + iThumb
      + '<div style="min-width:0;flex:1;">'
      +   '<div style="font-size:0.82rem;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_mobEsc(iLbl)+'</div>'
      +   (imSel.stato ? '<div style="font-size:0.67rem;color:#15803D;font-weight:700;margin-top:2px;">'+_mobEsc(imSel.stato)+'</div>' : '')
      + '</div>'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.5" style="width:16px;height:16px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>'
      + '</div>';
  }
  /* Link per cambiare selezione — apre picker completo su richiesta */
  var immPickerTrigger = '<div id="mob-att-imm-picker-wrap">'
    + (immSelCard || '<div style="padding:10px 12px;border-radius:11px;border:1.5px dashed #CBD5E1;color:#94A3B8;font-size:0.82rem;text-align:center;margin-bottom:8px;">Nessun immobile selezionato</div>')
    + '<button type="button" onclick="_mobAttImmOpenPicker()" style="width:100%;padding:8px;background:#F8FAFC;color:#475569;border:1.5px solid #E2E8F0;border-radius:9px;font-size:0.78rem;font-weight:600;font-family:inherit;cursor:pointer;margin-bottom:4px;">'
    + (preImmRef !== '' ? '🔄 Cambia immobile' : '🏠 Seleziona immobile')
    + '</button>'
    + '</div>'
    + '<input type="hidden" id="mob-att-imm" value="'+_mobEsc(preImmRef)+'">';

  /* Picker completo immobili (inizialmente nascosto) */
  var immPickerFull = '<div id="mob-att-imm-picker-full" style="display:none;">';
  immPickerFull += '<div onclick="_mobAttImmSel(this,\'\')" data-imm-val="" class="mob-att-imm-card" '
    + 'style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:11px;border:2px solid #E2E8F0;background:#fff;cursor:pointer;margin-bottom:6px;">'
    + '<div style="width:40px;height:40px;border-radius:8px;background:#F1F5F9;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1rem;">✕</div>'
    + '<div style="font-size:0.8rem;font-weight:600;color:#64748B;">Nessun immobile</div>'
    + '</div>';
  var immobiliAttivi2 = (D.immobili||[]).map(function(im,i){ return {im:im,i:i}; })
    .filter(function(o){ var s=(o.im.stato||'').toLowerCase(); return s!=='venduto'&&s!=='archiviato'; });
  immobiliAttivi2.forEach(function(o){
    var im = o.im;
    var isSel2 = (preImmRef === String(o.i));
    var lbl2 = (im.tipo||'Immobile')+(im.ref?' · Rif.'+im.ref:'')+(im.comune?' — '+im.comune:'');
    var t2 = im.foto
      ? '<img src="'+_mobEsc(im.foto)+'" loading="lazy" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px;flex-shrink:0;">'
      : '<div style="width:40px;height:40px;border-radius:8px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1rem;">🏠</div>';
    immPickerFull += '<div onclick="_mobAttImmSel(this,\''+o.i+'\')" data-imm-val="'+o.i+'" class="mob-att-imm-card'+(isSel2?' selected':'')+'" '
      + 'style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:11px;border:2px solid '+(isSel2?'#2563EB':'#E2E8F0')+';background:'+(isSel2?'#EFF6FF':'#fff')+';cursor:pointer;margin-bottom:6px;">'
      + t2
      + '<div style="min-width:0;flex:1;font-size:0.8rem;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_mobEsc(lbl2)+'</div>'
      + (isSel2 ? '<svg viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.5" style="width:15px;height:15px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>' : '')
      + '</div>';
  });
  immPickerFull += '<button type="button" onclick="document.getElementById(\'mob-att-imm-picker-full\').style.display=\'none\'" style="width:100%;padding:8px;background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:9px;color:#475569;font-size:0.78rem;font-weight:600;font-family:inherit;cursor:pointer;margin-top:4px;">Chiudi</button>';
  immPickerFull += '</div>'; /* fine picker-full */

  /* Funzione per aprire il picker */
  window._mobAttImmOpenPicker = function(){
    var w = document.getElementById('mob-att-imm-picker-full');
    if(w) w.style.display = (w.style.display==='none' ? 'block' : 'none');
  };

  var fld = function(label, html){ return '<div style="margin-bottom:14px;"><label style="font-size:0.7rem;font-weight:700;color:#64748B;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px;">'+label+'</label>'+html+'</div>'; };
  var sel = function(id, opts){ return '<select id="'+id+'" style="width:100%;padding:9px 12px;border:2px solid #E2E8F0;border-radius:9px;font-size:0.85rem;font-family:inherit;outline:none;background:#fff;">'+opts+'</select>'; };
  var inp = function(id, val, type, ph){ return '<input id="'+id+'" type="'+(type||'text')+'" value="'+_mobEsc(val||'')+'" placeholder="'+(ph||'')+'" style="width:100%;padding:9px 12px;border:2px solid #E2E8F0;border-radius:9px;font-size:0.85rem;font-family:inherit;outline:none;box-sizing:border-box;">'; };

  /* Telefono: prendi dal cliente in rubrica se disponibile */
  var preTel = a.tel || '';
  if(!preTel && preCliRef !== '' && D.clienti && D.clienti[parseInt(preCliRef)]){
    preTel = D.clienti[parseInt(preCliRef)].tel || D.clienti[parseInt(preCliRef)].telefono || '';
  }

  sheet.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;justify-content:flex-end;background:rgba(0,0,0,.45);';
  sheet.innerHTML = '<div style="background:#fff;border-radius:20px 20px 0 0;max-height:92vh;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom);">'
    + '<div style="position:sticky;top:0;background:#fff;padding:14px 18px 10px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;z-index:1;">'
    +   '<div style="font-weight:800;font-size:0.95rem;color:#0F172A;">'+(isNew?'Nuova Attività':'Modifica Attività')+'</div>'
    +   '<button onclick="mobChiudiAttEdit()" style="background:#F1F5F9;border:none;border-radius:8px;width:30px;height:30px;cursor:pointer;color:#475569;font-size:1.1rem;display:flex;align-items:center;justify-content:center;">&times;</button>'
    + '</div>'
    + '<div style="padding:16px 18px;">'
    +   fld('Tipo', sel('mob-att-tipo', tipiOpts))
    +   fld('Stato', sel('mob-att-stato', statiOpts))
    +   fld('Oggetto / Descrizione', '<textarea id="mob-att-oggetto" rows="3" style="width:100%;padding:9px 12px;border:2px solid #E2E8F0;border-radius:9px;font-size:0.85rem;font-family:inherit;outline:none;resize:vertical;min-height:80px;box-sizing:border-box;">'+_mobEsc(a.oggetto||'')+'</textarea>')
    +   fld('Cliente (rubrica)', sel('mob-att-cli-ref', cliOpts))
    +   fld('Oppure &mdash; nome non in rubrica', inp('mob-att-cliente-nome', preCliNome, 'text','Nome e cognome'))
    +   fld('Telefono', inp('mob-att-tel', preTel, 'tel', 'Es. 333 000 0000'))
    +   fld('Scadenza', inp('mob-att-scadenza', a.scadenza, 'date'))
    +   '<div style="margin-bottom:14px;">'
    +     '<label style="font-size:0.7rem;font-weight:700;color:#64748B;display:block;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">Immobile collegato</label>'
    +     immPickerTrigger
    +     immPickerFull
    +   '</div>'
    +   '<input type="hidden" id="mob-att-edit-idx" value="'+(isNew?'':idx)+'">'
    +   '<button onclick="mobAttivitaSalva()" style="width:100%;padding:13px;background:linear-gradient(135deg,#2563EB,#1D4ED8);color:#fff;border:none;border-radius:12px;font-weight:800;font-size:0.9rem;font-family:inherit;cursor:pointer;margin-top:4px;">Salva</button>'
    +   (!isNew ? '<button onclick="mobAttivitaElimina('+idx+')" style="width:100%;padding:11px;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:12px;font-weight:700;font-size:0.85rem;font-family:inherit;cursor:pointer;margin-top:8px;">Elimina attività</button>' : '')
    + '</div></div>';

  /* Aggiorna automaticamente telefono quando si sceglie un cliente dalla rubrica */
  setTimeout(function(){
    var cliSel = document.getElementById('mob-att-cli-ref');
    if(cliSel){
      cliSel.addEventListener('change', function(){
        var ci = parseInt(this.value);
        var telEl = document.getElementById('mob-att-tel');
        if(telEl && !isNaN(ci) && D.clienti && D.clienti[ci]){
          var t = D.clienti[ci].tel || D.clienti[ci].telefono || '';
          if(t && !telEl.value) telEl.value = t;
        }
      });
    }
  }, 50);

  sheet.onclick = function(e){ if(e.target===sheet) sheet.style.display='none'; };
}

/* Selezione visiva immobile nel form attività */
window._mobAttImmSel = function(card, val){
  /* Deseleziona tutte le card nel picker completo */
  var pickerFull = document.getElementById('mob-att-imm-picker-full');
  if(pickerFull){
    pickerFull.querySelectorAll('.mob-att-imm-card').forEach(function(c){
      c.style.border = '2px solid #E2E8F0';
      c.style.background = '#fff';
      var ck = c.querySelector('svg[data-ck]');
      if(ck) c.removeChild(ck);
    });
  }
  /* Seleziona la card cliccata */
  card.style.border = '2px solid #2563EB';
  card.style.background = '#EFF6FF';
  if(!card.querySelector('svg[data-ck]')){
    var ck2 = document.createElementNS('http://www.w3.org/2000/svg','svg');
    ck2.setAttribute('viewBox','0 0 24 24'); ck2.setAttribute('fill','none');
    ck2.setAttribute('stroke','#2563EB'); ck2.setAttribute('stroke-width','2.5');
    ck2.setAttribute('data-ck','1');
    ck2.style.cssText = 'width:15px;height:15px;flex-shrink:0;';
    var pl = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    pl.setAttribute('points','20 6 9 17 4 12');
    ck2.appendChild(pl); card.appendChild(ck2);
  }
  /* Aggiorna campo hidden */
  var hid = document.getElementById('mob-att-imm');
  if(hid) hid.value = val;
  /* Aggiorna la preview compatta */
  var wrap = document.getElementById('mob-att-imm-picker-wrap');
  if(wrap && val !== '' && D.immobili && D.immobili[parseInt(val)]){
    var im = D.immobili[parseInt(val)];
    var lbl = (im.tipo||'Immobile')+(im.ref?' · Rif.'+im.ref:'')+(im.comune?' — '+im.comune:'');
    var t = im.foto
      ? '<img src="'+_mobEsc(im.foto)+'" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0;">'
      : '<div style="width:44px;height:44px;border-radius:8px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.2rem;">🏠</div>';
    var previewDiv = wrap.querySelector('.mob-att-imm-preview');
    if(!previewDiv){
      previewDiv = document.createElement('div');
      previewDiv.className = 'mob-att-imm-preview';
      _safeInsertBefore(wrap, previewDiv, wrap.firstChild);
    }
    previewDiv.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:11px;border:2px solid #2563EB;background:#EFF6FF;margin-bottom:8px;">'
      + t
      + '<div style="min-width:0;flex:1;font-size:0.82rem;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_mobEsc(lbl)+'</div>'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.5" style="width:16px;height:16px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>'
      + '</div>';
    var btn = wrap.querySelector('button');
    if(btn) btn.textContent = '🔄 Cambia immobile';
  } else if(wrap && val === ''){
    var prev = wrap.querySelector('.mob-att-imm-preview');
    if(prev) prev.remove();
  }
  /* Chiudi il picker completo */
  if(pickerFull) pickerFull.style.display = 'none';
};

function mobAttivitaSalva(){
  var idxEl = document.getElementById('mob-att-edit-idx');
  if(!idxEl) return;
  var idxVal = idxEl.value;
  var isNew = (idxVal === '' || idxVal === 'undefined' || idxVal === 'null');
  var g = function(id){ var el=document.getElementById(id); return el?el.value.trim():''; };
  var tipo = g('mob-att-tipo');
  var oggetto = g('mob-att-oggetto');
  if(!tipo){ alert('Seleziona il tipo di attività'); return; }
  if(!oggetto){ alert("Inserisci l'oggetto dell'attività"); return; }
  /* Risolvi cliente: rubrica ha priorità, altrimenti usa nome libero */
  var cliRefVal = g('mob-att-cli-ref');
  var cliRef    = (cliRefVal !== '') ? parseInt(cliRefVal) : '';
  var cl2       = (cliRef !== '' && D.clienti[cliRef]) ? D.clienti[cliRef] : null;
  var clienteNome = cl2 ? (cl2.nome||'') : g('mob-att-cliente-nome');
  var nuova = { 
    id: 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    tipo:tipo, stato:g('mob-att-stato')||'Da fare', oggetto:oggetto,
    cliente:clienteNome, tel:g('mob-att-tel'), cliRef:cliRef, immRef:g('mob-att-imm'), scadenza:g('mob-att-scadenza'),
    dataIns: new Date().toISOString().slice(0,10) };
  if(!Array.isArray(D.attivita)) D.attivita = [];
  if(isNew){
    D.attivita.push(nuova);
  } else {
    var idx = parseInt(idxVal);
    if(!D.attivita[idx]) return;
    /* Mantieni l'id originale in modifica */
    var origId = D.attivita[idx].id;
    nuova = Object.assign({}, D.attivita[idx], nuova);
    if(origId) nuova.id = origId;
    D.attivita[idx] = nuova;
  }
  saveD();
  /* Push immediato a Firebase — allunga quiet period per evitare race condition */
  if(!window._mobSyncQuiet) window._mobSyncQuiet = {};
  var _qt2 = Date.now() + 20000;
  ['attivita'].forEach(function(k){ window._mobSyncQuiet[k] = _qt2; });
  window._lastLocalSaveTs = Date.now();
  try{ clearTimeout(window._saveTimer); if(typeof _cloudPushDebounced==='function') _cloudPushDebounced(); }catch(e){}
  var sheet = document.getElementById('mob-sheet-att-edit');
  if(sheet) sheet.style.display='none';
  mobRenderAttivita();
}

/* mobAttivitaElimina(): versione confirm() nativo rimossa — si usa la v1 con sheet di conferma elegante (più sopra, ~riga 44263) + mobAttivitaConfermaElimina */

/* ── Sezione Sopralluogo mobile ────────────────────────────────────── */

/* ════════════════════════════════════════════════════════════════════════════
   LEAD WEB — Sezione mobile "Richieste dal Sito"
   Legge D.leadsWeb (stessa struttura del desktop), NON duplica dati.
   ════════════════════════════════════════════════════════════════════════════ */

/* Colori stato */
var _MOB_LW_STATO_CFG = {
  nuovo:        { label:'Nuovo',        bg:'#FEE2E2', col:'#DC2626', dot:'#DC2626' },
  contattato:   { label:'Contattato',   bg:'#DBEAFE', col:'#1D4ED8', dot:'#2563EB' },
  appuntamento: { label:'Appuntamento', bg:'#FEF3C7', col:'#B45309', dot:'#D97706' },
  convertito:   { label:'Convertito',   bg:'#D1FAE5', col:'#065F46', dot:'#059669' },
  chiuso:       { label:'Chiuso',       bg:'#F1F5F9', col:'#475569', dot:'#94A3B8' },
  scartato:     { label:'Scartato',     bg:'#F1F5F9', col:'#9CA3AF', dot:'#D1D5DB' }
};


Object.assign(window, { mobRenderAttivita, mobAttivitaElimina, _attGetDeletedKeys, _attAddDeletedKey, _attIsDeleted, _attForcePushNow, mobAttivitaConfermaElimina, mobAttivitaCompleta, mobAttivitaModifica, mobAttivitaSalva });
export { mobRenderAttivita };
