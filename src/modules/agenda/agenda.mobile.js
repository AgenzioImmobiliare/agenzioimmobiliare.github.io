// modules/agenda/agenda.mobile.js — vista MOBILE Agenda (mobRenderAgenda 49265-49399).
// Dipendenze esterne (monolite via window): _mob*, mobSheet*, helper calendario.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function mobRenderAgenda(){
  var c = document.getElementById('mob-content');
  if(!c || typeof D === 'undefined') return;

  /* Assicura che gli eventi del calendario esterno siano in D.eventi.
     Se loadD() non li ha ancora caricati, li leggiamo direttamente ora. */
  try{
    var _extKey = '_extCalEvents_' + ((typeof _lsKey==='function') ? _lsKey() : 'lecaseAZ2');
    var _extRaw = localStorage.getItem(_extKey);
    if(_extRaw){
      var _extEvs = JSON.parse(_extRaw);
      if(Array.isArray(_extEvs) && _extEvs.length > 0){
        /* Rimuovi quelli già presenti per evitare duplicati, poi ri-aggiungi */
        D.eventi = (D.eventi||[]).filter(function(ev){ return !ev._extCalId; });
        _extEvs.forEach(function(ev){ D.eventi.push(ev); });
      }
    }
  }catch(_ee){}

  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var limite = new Date(oggi); limite.setDate(limite.getDate() + 60);

  /* Registro globale eventi per lookup stabile al click */
  window._mobAgendaEventi = [];
  
  var items = [];
  (D.visite||[]).forEach(function(v){
    if(!v.data) return;
    var d = _safeDate(v.data);
    if(!d || d < oggi || d > limite) return;
    if(_mobSearchQ){
      var hay = ((v.cliente||'') + ' ' + (v.note||'')).toLowerCase();
      if(hay.indexOf(_mobSearchQ.toLowerCase()) < 0) return;
    }
    var im = D.immobili[parseInt(v.immRef)];
    var cl = D.clienti[parseInt(v.cliRef)];
    items.push({
      data: d, ora: v.ora||'',
      titolo: 'Visita · ' + (cl ? cl.nome : (v.cliente||'cliente')) + (im ? ' — ' + (im.tipo||'') + ' ' + (im.comune||'') : ''),
      col: '#2563EB', bg: '#EFF6FF',
      isApp: false, isExt: false, extCal: '', agendaKey: null
    });
  });
  (D.eventi||[]).forEach(function(e, ei){
    if(!e.data) return;
    var d = new Date(e.data);
    if(isNaN(d) || d < oggi || d > limite) return;
    var titolo = e.titolo || e.descrizione || 'Evento';
    if(_mobSearchQ && titolo.toLowerCase().indexOf(_mobSearchQ.toLowerCase()) < 0) return;
    var isExt = !!e._extCalId;
    var tipoEv = (e.tipo||'').toLowerCase();
    /* Per eventi interni: controlla il titolo; per esterni: controlla il localStorage */
    var stableKey = isExt ? (e._extEventUid||e._extCalId+'_'+e.data) : ('int_'+ei+'_'+e.data);
    var isConverted = isExt
      ? (typeof _mobIsExtConverted==='function' && _mobIsExtConverted(stableKey))
      : (titolo.indexOf('[-> Visita]') >= 0 || titolo.indexOf('[→ Visita]') >= 0);
    var isApp = (tipoEv === 'appuntamento' || isExt) && !isConverted;
    var col = isConverted ? '#16A34A' : isExt ? (e._extColor||'#3B82F6') : '#D97706';
    var bg  = isConverted ? '#F0FDF4' : isExt ? '#EFF6FF' : '#FFFBEB';
    /* Registra nel lookup globale */
    window._mobAgendaEventi.push({ key: stableKey, evIdx: ei, ev: e });
    var regIdx = window._mobAgendaEventi.length - 1;
    items.push({
      data: d, ora: e.ora||'', titolo: titolo,
      col: col, bg: bg,
      isApp: isApp, isExt: isExt,
      isConverted: isConverted,
      extCal: e._extCal||'',
      agendaKey: regIdx
    });
  });

  items.sort(function(a,b){
    var x = a.data - b.data;
    if(x !== 0) return x;
    return (a.ora||'99:99').localeCompare(b.ora||'99:99');
  });

  var html = '<div class="mob-section-title">Prossimi 60 giorni <span class="mob-section-title-cnt">'+items.length+' impegni</span></div>';

  if(!items.length){
    html += '<div class="mob-empty"><div class="mob-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>'+(_mobSearchQ?'Nessun impegno trovato.':'Nessun impegno nei prossimi 30 giorni.')+'</div>';
  } else {
    var lastDay = '';
    items.forEach(function(it){
      var dKey = it.data.toISOString().slice(0,10);
      if(dKey !== lastDay){
        var diffDay = Math.round((it.data - oggi)/86400000);
        var label, cls = '';
        if(diffDay === 0){ label = 'OGGI · ' + _MOB_GIORNI[it.data.getDay()] + ' ' + it.data.getDate() + ' ' + _MOB_MESI[it.data.getMonth()]; cls = 'today'; }
        else if(diffDay === 1){ label = 'DOMANI · ' + _MOB_GIORNI[it.data.getDay()] + ' ' + it.data.getDate() + ' ' + _MOB_MESI[it.data.getMonth()]; cls = 'tomorrow'; }
        else label = _MOB_GIORNI[it.data.getDay()] + ' ' + it.data.getDate() + ' ' + _MOB_MESI[it.data.getMonth()];
        html += '<div class="mob-day-header '+cls+'">'+label+'</div>';
        lastDay = dKey;
      }
      var _calBadge = it.isExt
        ? '<span style="font-size:0.62rem;background:#DBEAFE;color:#1E40AF;padding:2px 6px;border-radius:6px;font-weight:700;margin-left:5px;">'+_mobEsc(it.extCal||'Cal.')+'</span>'
        : '';
      /* Pulsante conversione:
         - isApp=true  → evento non ancora convertito → mostra "Trasforma in visita"
         - isExt+isConverted → già convertito via LS → mostra badge "✓ già nel registro"
         - altrimenti → niente (visita interna già marcata nel titolo) */
      var _convBtn = it.isApp
        ? '<button onclick="mobApriConversioneByKey('+it.agendaKey+')" style="margin-top:8px;width:100%;padding:8px;background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0;border-radius:9px;font-size:0.76rem;font-weight:700;cursor:pointer;text-align:center;">&#x1F3E0; Trasforma in Visita</button>'
        : (it.isExt && it.isConverted)
          ? '<div style="margin-top:7px;padding:6px 10px;background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0;border-radius:8px;font-size:0.72rem;font-weight:700;text-align:center;">&#x2714;&#xFE0F; Già nel Registro Visite</div>'
          : '';
      html += '<div class="mob-event" style="border-left-color:'+it.col+';">'
        + '<div class="mob-event-date" style="background:'+it.bg+';color:'+it.col+';">'
        +   '<div class="mob-event-day">'+it.data.getDate()+'</div>'
        +   '<div class="mob-event-mon">'+_MOB_MESI[it.data.getMonth()]+'</div>'
        + '</div>'
        + '<div class="mob-event-body">'
        +   '<div class="mob-event-time">'+(it.ora || 'Tutto il giorno')+'</div>'
        +   '<div class="mob-event-title">'+_mobEsc(it.titolo)+_calBadge+'</div>'
        +   _convBtn
        + '</div>'
        + '</div>';
    });
  }
  c.innerHTML = html;
}

/* ── Converti appuntamento agenda in Visita ──────────────────────────────────── */
var _mobConvEvIdx = null;

/*
 * ── TRACCIAMENTO CONVERSIONI EVENTI ESTERNI ──────────────────────────────────
 * Gli eventi di calendari esterni (_extCalId) sono READ-ONLY: la sync li
 * riscrive ad ogni aggiornamento, quindi modificare D.eventi[i] non è
 * persistente. Per questo usiamo localStorage per ricordare quali eventi
 * esterni sono già stati convertiti in visita, così il pulsante non riappare.
 */
var _MOB_EXT_CONVERTED_LS_KEY = '_mobExtConverted_v1';


Object.assign(window, { mobRenderAgenda });
export { mobRenderAgenda };
