// modules/immobili/immobili.mobile.js — vista MOBILE del modulo Immobili.
// Estratto: mobRenderImmobili (48832-48882), mobOpenImmobile (48883-48892),
// mobOpenSchedaImmobile (52037-52426), mobShareImmobile (52441-52462).
// Dipendenze esterne (monolite via window): helper _mob*, mobSheet*, mobToast,
// renderSchedaImmobile, immSalute, immSaluteBadge.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function mobRenderImmobili(){
  try{ _injectFotoCache(); }catch(e){}
  var c = document.getElementById('mob-content');
  if(!c || typeof D === 'undefined') return;

  var lista = (D.immobili||[]).map(function(im, i){ return {im:im, idx:i}; })
    .filter(function(o){
      var stato = (o.im.stato||'').toLowerCase();
      if(stato === 'venduto' || stato === 'archiviato') return false;
      return _mobMatch(o.im, _mobSearchQ, ['ref','tipo','comune','zona','contatto','note']);
    })
    .sort(function(a,b){ return (b.im.data||'').localeCompare(a.im.data||'','it'); });

  var html = '<div class="mob-section-title">Immobili attivi <span class="mob-section-title-cnt">'+lista.length+'</span></div>';
  if(!lista.length){
    html += '<div class="mob-empty"><div class="mob-empty-icon">'+_MSVG.home+'</div>'+(_mobSearchQ?'Nessun immobile trovato.':'Nessun immobile ancora.')+'</div>';
  } else {
    lista.forEach(function(o){
      var im = o.im;
      var sub = [];
      if(im.comune) sub.push(im.comune);
      if(im.zona)   sub.push(im.zona);
      if(im.mq)     sub.push(im.mq + ' m²');
      var prezzoTag = im.prezzo ? '<span class="mob-tag mob-tag-blue">€ '+_mobFmtCur(im.prezzo)+'</span>' : '';
      var incaricoTag = '';
      if(im.incarico === 'vendita') incaricoTag = '<span class="mob-tag mob-tag-blue">Vendita</span>';
      else if(im.incarico === 'affitto') incaricoTag = '<span class="mob-tag mob-tag-gold">Affitto</span>';
      var statoTag = im.stato ? '<span class="mob-tag mob-tag-gray">'+_mobEsc(im.stato)+'</span>' : '';
      var thumbHtml = im.foto
        ? '<img class="mob-imm-thumb" src="'+_mobEsc(im.foto)+'" loading="lazy" alt="">'
        : '<div class="mob-imm-thumb-ph"><svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style="width:44px;height:44px"><polygon points="24,6 3,24 9,24 9,42 19,42 19,30 29,30 29,42 39,42 39,24 45,24" fill="#3B82F6" opacity="0.18"/><polygon points="24,6 3,24 9,24 9,42 19,42 19,30 29,30 29,42 39,42 39,24 45,24" fill="none" stroke="#3B82F6" stroke-width="2.2" stroke-linejoin="round"/><rect x="19" y="30" width="10" height="12" rx="1.5" fill="#2563EB" opacity="0.55"/></svg></div>';
      var telContatto1 = im.contatto ? String(im.contatto).replace(/[^0-9+]/g,'') : '';
      var waBtn = telContatto1
        ? '<a class="mob-imm-wa-btn" href="https://wa.me/'+telContatto1+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">'
          + '<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px"><path d="M17.6 6.32A7.85 7.85 0 0012.05 4a7.94 7.94 0 00-6.88 11.9L4 20l4.2-1.1a7.93 7.93 0 003.84.98h.01a7.95 7.95 0 007.93-7.94 7.91 7.91 0 00-2.38-5.62zM12.05 18.5a6.6 6.6 0 01-3.36-.92l-.24-.14-2.5.65.67-2.43-.16-.25a6.6 6.6 0 0110.21-8.13 6.55 6.55 0 011.93 4.66 6.6 6.6 0 01-6.55 6.56zm3.62-4.94c-.2-.1-1.18-.58-1.36-.65-.18-.07-.31-.1-.45.1-.13.2-.51.65-.62.78-.12.13-.23.15-.42.05-.2-.1-.85-.3-1.62-.99-.6-.53-1-1.18-1.13-1.38-.12-.2 0-.31.09-.41.09-.09.2-.23.3-.34.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.34-.05-.1-.45-1.08-.62-1.48-.16-.4-.32-.34-.45-.34h-.39c-.13 0-.34.05-.52.25-.18.2-.69.67-.69 1.64 0 .96.7 1.9.8 2.03.1.13 1.39 2.13 3.38 2.99.47.2.84.32 1.13.42.47.15.9.13 1.24.08.38-.06 1.18-.48 1.34-.94.16-.47.16-.87.12-.95-.05-.08-.18-.13-.38-.23z"/></svg>WhatsApp</a>'
        : '';
      html += '<div class="mob-card mob-imm-card" onclick="mobOpenImmobile('+o.idx+')">'
        + '<div class="mob-card-row">'
        +   thumbHtml
        +   '<div class="mob-card-body">'
        +     '<div class="mob-card-title">'+_mobEsc((im.tipo||'Immobile') + (im.ref ? ' · ' + im.ref : ''))+'</div>'
        +     (sub.length ? '<div class="mob-card-sub">'+_mobEsc(sub.join(' · '))+'</div>' : '')
        +     '<div class="mob-card-tags">'+incaricoTag+prezzoTag+statoTag+'</div>'
        +   '</div>'
        + '</div>'
        + (waBtn ? '<div class="mob-imm-footer">'+waBtn+'</div>' : '')
        + '</div>';
    });
  }
  c.innerHTML = html;
}
function mobOpenImmobile(idx){
  mobOpenSchedaImmobile(idx);
}

/* ── AGENDA ──────────────────────────────────────────────────────────────── */
/* ── ATTIVITÀ (mobile) ───────────────────────────────────────────────────── */
/* ── Risolvi nome cliente per attività mobile ──────────────────────────────
   Usa cliRef come indice in D.clienti (fonte primaria).
   Fallback: cerca per nome esatto in D.clienti se cliRef non funziona.
   Questo gestisce anche attività salvate con vecchie versioni del codice.  */

function mobOpenSchedaImmobile(idx){
  var im = D.immobili[idx];
  if(!im) return;
  var body = document.getElementById('mob-sheet-immobile-body');
  document.querySelector('#mob-sheet-immobile .mob-sheet-title').textContent =
    (im.tipo||'Immobile') + (im.ref?' · '+im.ref:'');

  /* ─── Helpers locali ─────────────────────────────────────────────────── */
  var E = _mobEsc;
  function has(v){ return v !== undefined && v !== null && v !== '' && v !== 'no' && v !== 'No' && v !== 'NO' && v !== 0 && v !== '0'; }
  function num(v){ var n = parseFloat(String(v).replace(',','.')); return isNaN(n) ? 0 : n; }
  function row(lbl, val, opts){
    if(!has(val)) return '';
    opts = opts || {};
    var ico = opts.ico || '';
    var cls = opts.accent ? 'mi-info-val accent' : 'mi-info-val';
    return '<div class="mi-info-row">'
      + '<span class="mi-info-lbl">'+ico+' '+E(lbl)+'</span>'
      + '<span class="'+cls+'">'+E(val)+'</span>'
      + '</div>';
  }
  function feat(lbl, ico, present){
    return '<div class="mi-feat'+(present?'':' absent')+'">'+ico+' '+E(lbl)+'</div>';
  }
  function distItem(lbl, val, ico){
    if(!has(val)) return '';
    var n = num(val);
    var disp = n >= 1000 ? (n/1000).toFixed(1).replace('.0','') + '<span class="unit">km</span>'
                         : Math.round(n) + '<span class="unit">m</span>';
    return '<div class="mi-dist">'
      + '<div class="mi-dist-icon">'+ico+'</div>'
      + '<div class="mi-dist-name">'+E(lbl)+'</div>'
      + '<div class="mi-dist-val">'+disp+'</div>'
      + '</div>';
  }
  function fmtCurr(v){ try{ return Number(v).toLocaleString('it-IT'); }catch(e){ return v; } }
  function fmtData(d){
    if(!d) return '';
    try{
      var dd = new Date(d);
      if(isNaN(dd)) return d;
      return dd.toLocaleDateString('it-IT', {day:'2-digit', month:'short', year:'numeric'});
    }catch(e){ return d; }
  }
  function initials(s){
    if(!s) return '?';
    return s.split(/\s+/).filter(Boolean).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase();
  }

  /* ─── Visite collegate a questo immobile ─────────────────────────────── */
  var visite = (D.visite||[]).map(function(v,i){ return {v:v, i:i}; })
    .filter(function(o){ return parseInt(o.v.immRef) === idx; })
    .sort(function(a,b){ return (b.v.data||'').localeCompare(a.v.data||''); });

  /* ─── ICONE SVG riusabili ────────────────────────────────────────────── */
  var SVG = {
    pin:    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    home:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    sqm:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9h18M9 3v18"/></svg>',
    bed:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16h20V4"/><path d="M6 8v8M10 8v8M14 8v8M18 8v8"/></svg>',
    bath:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/><path d="M3 10h18v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M7 14v4M17 14v4"/></svg>',
    rooms:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16M22 4v16M2 8h20M2 14h20M2 20h20"/></svg>',
    floor:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>',
    cal:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    sun:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/></svg>',
    star:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    money:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    phone:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>',
    msg:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    mail:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    map:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    plus:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    share:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    check:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    /* feature icons */
    sea:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5s2.5 2 5 2 2.5-2 5-2"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2"/></svg>',
    pool:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 16s2-2 5-2 5 2 8 2 5-2 5-2M2 12s2-2 5-2 5 2 8 2 5-2 5-2"/><path d="M9 5h6v9M9 5v9"/></svg>',
    garden: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V12M12 12c0-3 2-5 4-5s4 1 4 4c0 2-2 4-4 4M12 12c0-3-2-5-4-5s-4 1-4 4c0 2 2 4 4 4"/></svg>',
    terrace:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
    garage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V9l9-6 9 6v12"/><path d="M7 21V13h10v8"/></svg>',
    fire:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5 0 8-3 8-8 0-3-2-5-3-7-1-2-2-4-5-5 1 4-2 5-3 8-1 2-2 3-2 5 0 4 3 7 5 7z"/></svg>',
    lift:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="18" rx="1"/><path d="M10 9l2-3 2 3M10 15l2 3 2-3"/></svg>',
    chair:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8V5a2 2 0 012-2h10a2 2 0 012 2v3M3 8h18v7a2 2 0 01-2 2H5a2 2 0 01-2-2zM7 17v4M17 17v4"/></svg>',
    ac:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M5 5l14 14M19 5L5 19M2 12h20"/></svg>',
    cooking:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18l-2 9H5z"/><path d="M7 7v5M12 7v5M17 7v5"/></svg>',
    /* distance icons */
    school: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18M9 12h6M12 9v6"/></svg>',
    hosp:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12h6M12 9v6"/></svg>',
    cart:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>',
    pharm:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.5 20.5l10-10a4.95 4.95 0 00-7.07-7.07l-10 10a4.95 4.95 0 007.07 7.07z"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/></svg>',
    train:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="14" rx="2"/><path d="M9 17v2M15 17v2M9 10h6"/></svg>',
    bank:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>',
    church: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M4 10h16M4 10L2 22h20L18 10"/><path d="M9 22V16h6v6"/></svg>',
    post:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 13V6H2v13a2 2 0 002 2h16a2 2 0 002-2z"/><path d="M22 6l-10 7L2 6"/></svg>',
    hwy:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2v20"/></svg>',
    stadium:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="6"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  /* ─── Calcoli derivati ───────────────────────────────────────────────── */
  var prezzoNum = num(im.prezzo);
  var mqNum = num(im.mq);
  var pricePerMq = (prezzoNum && mqNum) ? Math.round(prezzoNum/mqNum) : 0;

  var statoLower = (im.stato||'').toLowerCase();
  var statoCls = 'mi-stato', statoLbl = im.stato || 'Disponibile';
  if(statoLower === 'venduto' || statoLower === 'archiviato' || statoLower === 'non attivo'){ statoCls += ' gray'; }
  else if(statoLower === 'in proposta' || statoLower === 'riservato'){ statoCls += ' warn'; }

  var heroTagLbl = (im.incarico === 'affitto' ? 'In affitto' : 'In vendita');
  if(statoLower === 'venduto') heroTagLbl = 'Venduto';
  if(statoLower === 'archiviato') heroTagLbl = 'Archiviato';
  var heroTagCls = (im.incarico === 'affitto' ? 'affitto' : '') + (statoLower === 'venduto' || statoLower === 'archiviato' ? ' venduto' : '');

  var html = '';

  /* ─── 1. HERO ─────────────────────────────────────────────────────────── */
  html += '<div class="mobi-scheda">';
  if(im.foto){
    html += '<div class="mi-hero" style="background-image:url(\''+E(im.foto)+'\');">';
  } else {
    html += '<div class="mi-hero">';
    html += '<div class="mi-hero-ph">'+SVG.home+'</div>';
  }
  html += '<div class="mi-hero-tag '+heroTagCls+'">'+E(heroTagLbl)+'</div>';
  if(im.foto){
    html += '<div class="mi-hero-counter">'+SVG.home+' Foto</div>';
  }
  html += '</div>';

  /* ─── 2. TITLE BLOCK ─────────────────────────────────────────────────── */
  html += '<div class="mi-title-block">';
  html += '<div class="mi-ref-row">';
  html +=   '<div class="mi-ref">'+(im.ref ? 'RIF · '+E(im.ref) : 'NUOVO')+(im.rifAgenzia ? ' · '+E(im.rifAgenzia) : '')+'</div>';
  html +=   '<div class="'+statoCls+'">'+E(statoLbl)+'</div>';
  html += '</div>';
  html += '<div class="mi-title">'+E(im.tipo || 'Immobile')+'</div>';
  var locParts = [];
  if(im.comune) locParts.push(im.comune);
  if(im.zona)   locParts.push(im.zona);
  if(locParts.length){
    html += '<div class="mi-loc">'+SVG.pin+' '+E(locParts.join(' · '))+'</div>';
  }
  if(im.indirizzo){
    html += '<div class="mi-loc" style="margin-top:4px;">'+E(im.indirizzo)+'</div>';
  }
  if(prezzoNum > 0){
    html += '<div class="mi-price">';
    html += '<div class="mi-price-val">€ '+fmtCurr(prezzoNum)+'</div>';
    var meta = [];
    if(pricePerMq) meta.push('<strong>€ '+fmtCurr(pricePerMq)+'/m²</strong>');
    if(im.conferimento) meta.push(E(im.conferimento));
    if(meta.length){
      html += '<div class="mi-price-meta">'+meta.join('<br>')+'</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  /* ─── 3. STATS GRID 4× ───────────────────────────────────────────────── */
  html += '<div class="mi-stats">';
  html += '<div class="mi-stat"><div class="mi-stat-icon">'+SVG.sqm+'</div><div class="mi-stat-val">'+(im.mq||'–')+'</div><div class="mi-stat-lbl">m²</div></div>';
  html += '<div class="mi-stat"><div class="mi-stat-icon">'+SVG.rooms+'</div><div class="mi-stat-val">'+(im.locali||'–')+'</div><div class="mi-stat-lbl">Locali</div></div>';
  html += '<div class="mi-stat"><div class="mi-stat-icon">'+SVG.bed+'</div><div class="mi-stat-val">'+(im.camere||'–')+'</div><div class="mi-stat-lbl">Camere</div></div>';
  html += '<div class="mi-stat"><div class="mi-stat-icon">'+SVG.bath+'</div><div class="mi-stat-val">'+(im.bagni||'–')+'</div><div class="mi-stat-lbl">Bagni</div></div>';
  html += '</div>';

  /* ─── 4. QUICK ACTIONS ───────────────────────────────────────────────── */
  var telClean = im.telefono ? String(im.telefono).replace(/[^0-9+]/g,'') : '';
  html += '<div class="mi-qa-row">';
  html += '<a class="mi-qa'+(im.telefono?'':' disabled')+'" '+(im.telefono?'href="tel:'+E(im.telefono)+'"':'')+'>'+SVG.phone+'Chiama</a>';
  html += '<button class="mi-qa amber" onclick="mobOpenVisitaForm(null,null,'+idx+',true)">'+SVG.plus+'Visita</button>';
  html += '<a class="mi-qa light" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent((im.indirizzo||'')+' '+(im.comune||''))+'" target="_blank" rel="noopener">'+SVG.map+'Mappa</a>';
  html += '<button class="mi-qa light" onclick="mobShareImmobile('+idx+')">'+SVG.share+'Condividi</button>';
  html += '</div>';

  /* ─── LINK PORTALE (se presente) ─────────────────────────────────────── */
  if(has(im.linkPortale)){
    var linkUrl = im.linkPortale.match(/^https?:\/\//) ? im.linkPortale : 'https://'+im.linkPortale;
    var linkDomain = '';
    try { linkDomain = new URL(linkUrl).hostname.replace(/^www\./,''); } catch(e){ linkDomain = linkUrl.substring(0,30); }
    html += '<a class="mi-portale-link" href="'+E(linkUrl)+'" target="_blank" rel="noopener">'
      + '<span class="mi-portale-link-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg></span>'
      + '<span class="mi-portale-link-text"><span class="mi-portale-link-lbl">Annuncio sul portale</span><span class="mi-portale-link-url">'+E(linkDomain)+'</span></span>'
      + '<span class="mi-portale-link-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span>'
      + '</a>';
  }

  /* ── Helper: sezione collassabile ──────────────────────────────────────
     id       : stringa univoca (es. 'tech', 'eco', …)
     title    : etichetta header
     content  : HTML interno
     defaultOpen: true = aperta di default
  ─────────────────────────────────────────────────────────────────────── */
  var _secId = 0;
  function miSec(title, content, defaultOpen){
    if(!content) return '';
    var uid = 'mis-'+(++_secId);
    var chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    return '<div class="mi-section collapsible">'
      + '<div class="mi-sec-header" onclick="_miSecToggle(\''+uid+'\')">'
      +   '<span class="mi-sec-htitle">'+title+'</span>'
      +   '<span class="mi-sec-chevron'+(defaultOpen?' open':'')+'" id="chv-'+uid+'">'+chevron+'</span>'
      + '</div>'
      + '<div class="mi-sec-body'+(defaultOpen?' open':'')+'" id="'+uid+'">'
      +   content
      + '</div>'
      + '</div>';
  }

  /* ─── 5. SCHEDA TECNICA ──────────────────────────────────────────────── */
  var techRows = ''
    + row('Tipologia', im.tipo, {ico: SVG.home})
    + row('Superficie commerciale', im.mq ? im.mq+' m²' : '', {ico: SVG.sqm})
    + (has(im.giardino) ? row('Giardino', im.giardino+' m²', {ico: SVG.garden}) : '')
    + (has(im.terrazza) ? row('Terrazza', im.terrazza !== 'sì' && im.terrazza !== 'si' ? im.terrazza+' m²' : 'Sì', {ico: SVG.terrace}) : '')
    + row('Locali totali', im.locali, {ico: SVG.rooms})
    + row('Camere da letto', im.camere, {ico: SVG.bed})
    + row('Bagni', im.bagni, {ico: SVG.bath})
    + row('Anno costruzione', im.anno, {ico: SVG.cal})
    + row('Stato conservativo', im.condizioni, {ico: SVG.star})
    + row('Esposizione', im.esposizione, {ico: SVG.sun})
    + row('Piano', has(im.piano) ? im.piano + (im.pianiTot ? ' di ' + im.pianiTot : '') : '', {ico: SVG.floor})
    + row('Cucina', im.cucina, {ico: SVG.cooking})
    + row('Arredato', im.arredato, {ico: SVG.chair})
    + (has(im.condominio) ? row('Condominio', im.condominio, {ico: SVG.home}) : '')
    + (has(im['cond-unita']) ? row('Unità cond.', im['cond-unita'], {ico: SVG.home}) : '')
    + (has(im['cond-scale']) ? row('Scale', im['cond-scale'], {ico: SVG.floor}) : '')
    + (has(im['cond-amm']) ? row('Amministratore', im['cond-amm'] + (has(im['cond-amm-tel']) ? ' — ' + im['cond-amm-tel'] : ''), {ico: SVG.phone}) : '')
    + row('Inserimento', fmtData(im.dataIns), {ico: SVG.cal})
    + row('Provenienza', im.provenienza, {ico: SVG.star})
    + (has(im.linkPortale) ? '<div class="mi-info-row"><span class="mi-info-lbl">'+SVG.share+' Link portale</span><a href="'+E(im.linkPortale.match(/^https?:\/\//)?im.linkPortale:'https://'+im.linkPortale)+'" target="_blank" rel="noopener" style="font-size:12.5px;font-weight:600;color:#2563EB;text-decoration:underline;text-underline-offset:2px;word-break:break-all;text-align:right;max-width:65%;">Apri annuncio ↗</a></div>' : '')
    + (has(im.vincNote) ? row('Vincoli / Note tecniche', im.vincNote, {ico: SVG.star}) : '');
  html += miSec('Scheda tecnica', techRows ? '<div class="mi-info-grid">'+techRows+'</div>' : '', true);

  /* ─── 6. ASPETTI ECONOMICI ──────────────────────────────────────────── */
  var ecoRows = '';
  if(prezzoNum > 0){
    ecoRows += '<div class="mi-info-row">'
      + '<span class="mi-info-lbl">'+SVG.money+' Prezzo richiesto</span>'
      + '<span class="mi-info-val accent">€ '+fmtCurr(prezzoNum)+'</span>'
      + '</div>';
  }
  if(pricePerMq){
    ecoRows += '<div class="mi-info-row">'
      + '<span class="mi-info-lbl">'+SVG.sqm+' Prezzo/m²</span>'
      + '<span class="mi-info-val">€ '+fmtCurr(pricePerMq)+' /m²</span>'
      + '</div>';
  }
  ecoRows += row('Spese condominio', has(im.speseCondominio) ? '€ '+fmtCurr(im.speseCondominio)+' / mese' : '', {ico: SVG.home});
  ecoRows += row('Tipo incarico', im.incarico, {ico: SVG.star});
  ecoRows += row('Conferimento', im.conferimento, {ico: SVG.star});
  ecoRows += row('Provvigione', has(im.incPerc) ? im.incPerc+'%' : '', {ico: SVG.money});
  if(has(im.incImp)) ecoRows += row('Importo provvigione', '€ '+fmtCurr(im.incImp), {ico: SVG.money});
  ecoRows += row('Inizio incarico', fmtData(im.incInizio), {ico: SVG.cal});
  ecoRows += row('Scadenza incarico', fmtData(im.incFine), {ico: SVG.cal});
  if(has(im.valutazione)) ecoRows += row('Valutazione', im.valutazione+'/10', {ico: SVG.star});
  if(im.prezzoStorico && im.prezzoStorico.length > 1){
    ecoRows += '<div class="mi-info-row" style="flex-direction:column;align-items:flex-start;gap:5px;">'
      + '<span class="mi-info-lbl">'+SVG.money+' Storico prezzi</span>';
    im.prezzoStorico.forEach(function(p){
      ecoRows += '<div style="width:100%;display:flex;justify-content:space-between;font-size:11.5px;color:var(--mi-ink-70);padding:2px 0;">'
        + '<span>'+E(fmtData(p.data))+(p.motivo?' · '+E(p.motivo):'')+'</span>'
        + '<span style="font-weight:600;color:var(--mi-ink)">€ '+fmtCurr(p.prezzo)+'</span>'
        + '</div>';
    });
    ecoRows += '</div>';
  }
  html += miSec('Aspetti economici', ecoRows ? '<div class="mi-info-grid">'+ecoRows+'</div>' : '', false);

  /* ─── 7. DOTAZIONI & COMFORT ─────────────────────────────────────────── */
  var feats = [
    {lbl:'Vista mare',     ico:SVG.sea,     present: has(im.mare) && String(im.mare).toLowerCase() !== 'no'},
    {lbl:'Piscina',        ico:SVG.pool,    present: has(im.piscina)},
    {lbl:'Giardino' + (has(im.giardino) ? ' '+im.giardino+'m²' : ''), ico:SVG.garden, present: has(im.giardino)},
    {lbl:'Terrazza',       ico:SVG.terrace, present: has(im.terrazza)},
    {lbl:'Garage' + (has(im.garage) && im.garage !== 'sì' && im.garage !== 'si' ? ' '+im.garage : ''), ico:SVG.garage, present: has(im.garage)},
    {lbl:'Ascensore',      ico:SVG.lift,    present: has(im.ascensore)},
    {lbl:'Riscaldamento'+(has(im.riscaldamento) && im.riscaldamento !== 'sì' ? ' '+im.riscaldamento : ''), ico:SVG.fire, present: has(im.riscaldamento)},
    {lbl:'Arredato'+(has(im.arredato) && im.arredato !== 'sì' && im.arredato !== 'si' ? ' '+im.arredato : ''), ico:SVG.chair, present: has(im.arredato)}
  ];
  var featsHtml = '<div class="mi-feats">';
  feats.forEach(function(f){ featsHtml += feat(f.lbl, f.ico, f.present); });
  featsHtml += '</div>';
  html += miSec('Dotazioni & comfort', featsHtml, false);

  /* ─── 8. ENERGIA & IMPIANTI ──────────────────────────────────────────── */
  if(has(im.energia) || has(im.riscaldamento)){
    var enHtml = '';
    if(has(im.energia)){
      var enClass = String(im.energia).toLowerCase().charAt(0);
      enHtml += '<div class="mi-energy" style="margin-bottom:8px;">';
      enHtml += '<div class="mi-energy-class '+(enClass.match(/^[a-g]$/)?enClass:'unset')+'">'+E(im.energia)+'<span class="lbl">CLASSE</span></div>';
      enHtml += '<div class="mi-energy-info"><div class="v">Classe energetica '+E(im.energia)+'</div><div class="l">Attestato di prestazione energetica</div></div>';
      enHtml += '</div>';
    }
    var impRows = row('Riscaldamento', im.riscaldamento, {ico: SVG.fire}) + row('Cucina', im.cucina, {ico: SVG.cooking});
    if(impRows) enHtml += '<div class="mi-info-grid">'+impRows+'</div>';
    html += miSec('Energia & impianti', enHtml, false);
  }

  /* ─── 9. DISTANZE ────────────────────────────────────────────────────── */
  var _d = im.distanze || {};
  var dists = ''
    + distItem('Mare',          im.distMare         || _d.mare,         SVG.sea)
    + distItem('Centro',        im.distCentro       || _d.centro,       SVG.home)
    + distItem('Supermercato',  im.distSupermercato || _d.supermercato, SVG.cart)
    + distItem('Scuole',        im.distScuole       || _d.scuole,       SVG.school)
    + distItem('Ospedale',      im.distOspedale     || _d.ospedale,     SVG.hosp)
    + distItem('Farmacia',      im.distFarmacia     || _d.farmacia,     SVG.pharm)
    + distItem('Stazione',      im.distStazione     || _d.stazione,     SVG.train)
    + distItem('Banca',         im.distBanca        || _d.banca,        SVG.bank)
    + distItem('Posta',         im.distPosta        || _d.posta,        SVG.post)
    + distItem('Chiesa',        im.distChiesa       || _d.chiesa,       SVG.church)
    + distItem('Stadio',        im.distStadio       || _d.stadio,       SVG.stadium);
  html += miSec('Distanze chiave', dists ? '<div class="mi-dist-list">'+dists+'</div>' : '', false);

  /* ─── 10. DESCRIZIONE ────────────────────────────────────────────────── */
  if(has(im.descrizione)){
    html += miSec('Descrizione', '<div class="mi-desc">'+E(im.descrizione)+'</div>', false);
  }

  /* ─── 11. PROPRIETARIO ───────────────────────────────────────────────── */
  if(has(im.contatto) || has(im.telefono) || has(im.email)){
    var ownerHtml = '<div class="mi-owner">';
    ownerHtml += '<div class="mi-owner-avatar">'+E(initials(im.contatto||'?'))+'</div>';
    ownerHtml += '<div class="mi-owner-info">';
    ownerHtml += '<div class="mi-owner-name">'+E(im.contatto || 'Contatto')+'</div>';
    ownerHtml += '<div class="mi-owner-role">Proprietario'+(im.conferimento?' · '+E(im.conferimento):'')+'</div>';
    ownerHtml += '</div>';
    ownerHtml += '<div class="mi-owner-actions">';
    if(im.email) ownerHtml += '<a class="mi-owner-btn" href="mailto:'+E(im.email)+'" aria-label="Email">'+SVG.mail+'</a>';
    if(im.telefono){
      ownerHtml += '<a class="mi-owner-btn" href="https://wa.me/'+E(telClean)+'" target="_blank" rel="noopener" aria-label="WhatsApp">'+SVG.msg+'</a>';
      ownerHtml += '<a class="mi-owner-btn amber" href="tel:'+E(im.telefono)+'" aria-label="Chiama">'+SVG.phone+'</a>';
    }
    ownerHtml += '</div></div>';
    html += miSec('Proprietario', ownerHtml, false);
  }

  /* ─── 12. STORICO VISITE ─────────────────────────────────────────────── */
  var visHtml = '';
  if(!visite.length){
    visHtml = '<div class="mi-vis-empty">Nessuna visita registrata.<br><span style="font-size:11px;">Premi <strong>+ Visita</strong> sopra per programmarne una.</span></div>';
  } else {
    var MESI = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];
    var _oggi2 = new Date(); _oggi2.setHours(0,0,0,0);
    visHtml = '<div class="mi-visite">';
    visite.forEach(function(o){
      var v = o.v;
      var d = v.data ? new Date(v.data+'T00:00:00') : null;
      var isFuture = d && d >= _oggi2;
      var dStr = d && !isNaN(d) ? d.getDate() : '?';
      var mStr = d && !isNaN(d) ? MESI[d.getMonth()] : '';
      var esitoCls = 'att', esitoLbl = 'In attesa';
      if((v.esito||'').toUpperCase() === 'POSITIVO'){ esitoCls = 'pos'; esitoLbl = 'Positivo'; }
      else if((v.esito||'').toUpperCase() === 'NEGATIVO'){ esitoCls = 'neg'; esitoLbl = 'Negativo'; }
      var nomeCli = v.cliente || (D.clienti[parseInt(v.cliRef)] ? D.clienti[parseInt(v.cliRef)].nome : 'Cliente');
      var meta = [];
      if(v.ora) meta.push(v.ora);
      if(v.feedback) meta.push(v.feedback.substring(0,40)+(v.feedback.length>40?'…':''));
      else if(v.note) meta.push(v.note.substring(0,40)+(v.note.length>40?'…':''));
      visHtml += '<div class="mi-vis" onclick="mobOpenVisitaForm('+o.i+',null,null)">';
      visHtml +=   '<div class="mi-vis-date'+(isFuture?' future':'')+'"><span class="d">'+dStr+'</span><span class="m">'+mStr+'</span></div>';
      visHtml +=   '<div class="mi-vis-info"><div class="mi-vis-name">'+E(nomeCli)+'</div>';
      if(meta.length) visHtml += '<div class="mi-vis-meta">'+E(meta.join(' · '))+'</div>';
      visHtml +=   '</div>';
      visHtml +=   '<span class="mi-vis-esito '+esitoCls+'">'+esitoLbl+'</span>';
      visHtml += '</div>';
    });
    visHtml += '</div>';
  }
  html += miSec('Visite ('+visite.length+')', visHtml, true);

  /* ─── 13. NOTE RISERVATE ─────────────────────────────────────────────── */
  if(has(im.note)){
    html += miSec('Note interne', '<div class="mi-notes"><div class="mi-notes-text">'+E(im.note)+'</div></div>', false);
  }

  /* ─── 14. CTA FISSA ──────────────────────────────────────────────────── */
  html += '<div class="mi-cta-bar">';
  html += '<button class="mi-cta secondary" onclick="mobShareImmobile('+idx+')" aria-label="Condividi">'+SVG.share+'</button>';
  html += '<button class="mi-cta" onclick="mobOpenVisitaForm(null,null,'+idx+',true)">'+SVG.plus+'Programma visita</button>';
  html += '</div>';

  html += '</div>';  /* /.mobi-scheda */

  body.innerHTML = html;
  mobSheetOpen('mob-sheet-immobile');
}


function mobShareImmobile(idx){
  var im = D.immobili[idx];
  if(!im) return;
  var txt = (im.tipo||'Immobile') + (im.ref?' · '+im.ref:'') + '\n';
  if(im.comune) txt += im.comune + (im.zona?' ('+im.zona+')':'') + '\n';
  if(im.prezzo) txt += '€ ' + Number(im.prezzo).toLocaleString('it-IT') + '\n';
  if(im.mq)     txt += im.mq + ' m²\n';
  if(im.camere) txt += im.camere + ' camere\n';
  if(im.note)   txt += '\n' + im.note;

  if(navigator.share){
    navigator.share({title: im.tipo||'Immobile', text: txt}).catch(function(){});
  } else {
    /* Fallback: copia negli appunti */
    if(navigator.clipboard) navigator.clipboard.writeText(txt);
    mobToast('Dettagli copiati');
  }
}

/* ════════════════════════════════════════════════════════════════════════
   FORM VISITA
/* ── Apri visita da scheda cliente — auto-seleziona immobile abbinato ─── */

Object.assign(window, { mobRenderImmobili, mobOpenImmobile, mobOpenSchedaImmobile, mobShareImmobile });
export { mobRenderImmobili, mobOpenImmobile, mobOpenSchedaImmobile, mobShareImmobile };
