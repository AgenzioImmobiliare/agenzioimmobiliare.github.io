// modules/agenda/agenda.view.js — modulo Agenda & Pipeline (sistema "ap*").
// Estratto (41240-42014): AP_SVG, apSvgColored, apGetDeals, apFmt,
// renderAgendaPipeline, apRenderKpi, apGetWeekDays, apWeekMove, apWeekToday,
// apRenderAgenda, apRenderPipeline, apEditDeal, apSaveDeal, apNuovoEvento,
// apModificaEvento, apNuovoDeal, apMoveDeal, apDelDeal.
//
// apWeekOffset: stato globale condiviso (anche il monolite la scrive a riga ~44982
// per "vai a settimana"). Gestita via window.apWeekOffset per compatibilità.
// Dipendenze esterne (monolite via window): openModal, closeModal, openVisita,
//   saveD, showToast.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});
// Inizializza lo stato globale settimana se non già presente
if (typeof window.apWeekOffset === 'undefined') window.apWeekOffset = 0;

/* window.apWeekOffset gestita via window (vedi header modulo) */

/* ══ SVG LIBRARY — tutte le icone in formato vettoriale puro ══ */
var AP_SVG = {
  /* Pipeline stages */
  userPlus:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
  phone:      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 9.81 19.79 19.79 0 0 1 .19 1.2 2 2 0 0 1 2.18 0h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.09 7.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 14z"/></svg>',
  phoneCheck: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 2 16 8 22 8"/><polyline points="16 2 22 8"/><path d="M17 14.5A11 11 0 0 1 2 2h10"/><polyline points="9 11 11 13 15 9"/></svg>',
  calendar:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/></svg>',
  clipCheck:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1" ry="1"/><path d="M9 12l2 2 4-4"/></svg>',
  clock:      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  award:      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
  xCircle:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  /* KPI strip */
  calDay:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  calWeek:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>',
  refresh:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  euro:       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M4 14h12"/><path d="M19.5 5a9 9 0 1 0 0 14"/></svg>',
  trophy:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
  /* Card icons */
  user:       '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  home:       '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  trash:      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  arrowRight: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  /* Agenda event types */
  evAppoint:  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  evVisit:    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  evDeadline: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  evIncarico: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>',
  evBirthday: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><line x1="2" y1="21" x2="22" y2="21"/><path d="M7 8v1"/><path d="M12 8v1"/><path d="M17 8v1"/><path d="M7 4l1 4"/><path d="M12 2l1 6"/><path d="M17 4l1 4"/></svg>',
  evOther:    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  /* Priority */
  prioAlta:   '<svg width="9" height="9" viewBox="0 0 24 24" fill="#DC2626" stroke="none"><circle cx="12" cy="12" r="8"/></svg>',
  prioMedia:  '<svg width="9" height="9" viewBox="0 0 24 24" fill="#D97706" stroke="none"><circle cx="12" cy="12" r="8"/></svg>',
  prioBassa:  '<svg width="9" height="9" viewBox="0 0 24 24" fill="#15803D" stroke="none"><circle cx="12" cy="12" r="8"/></svg>',
  /* Agenda nav */
  chevLeft:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  chevRight:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  plus:       '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
};

/* Helper: SVG con colore stroke custom */
function apSvgColored(key, color, size){
  var s=size||14;
  return AP_SVG[key]
    ? AP_SVG[key].replace('width="14"','width="'+s+'"').replace('height="14"','height="'+s+'"')
        .replace('stroke="currentColor"','stroke="'+color+'"')
        .replace('stroke="white"','stroke="'+color+'"')
    : '';
}

/* ══ PIPELINE STAGES — 8 fasi del processo commerciale ══ */
const AP_PIPELINE_STAGES = [
  {
    id:'nuovo-contatto',
    label:'Nuovo Contatto',
    svgKey:'userPlus',
    color:'#475569', bg:'#F8FAFC', border:'#CBD5E1',
    grad:'linear-gradient(135deg,#94A3B8,#64748B)'
  },
  {
    id:'da-contattare',
    label:'Da Contattare',
    svgKey:'phone',
    color:'#0369A1', bg:'#F0F9FF', border:'#BAE6FD',
    grad:'linear-gradient(135deg,#38BDF8,#0284C7)'
  },
  {
    id:'contattato',
    label:'Contattato',
    svgKey:'phoneCheck',
    color:'#1D4ED8', bg:'#EFF6FF', border:'#BFDBFE',
    grad:'linear-gradient(135deg,#60A5FA,#2563EB)'
  },
  {
    id:'appuntamento-fissato',
    label:'Appuntamento Fissato',
    svgKey:'calendar',
    color:'#6D28D9', bg:'#F5F3FF', border:'#C4B5FD',
    grad:'linear-gradient(135deg,#A78BFA,#7C3AED)'
  },
  {
    id:'valutazione-fatta',
    label:'Valutazione Fatta',
    svgKey:'clipCheck',
    color:'#B45309', bg:'#FFFBEB', border:'#FDE68A',
    grad:'linear-gradient(135deg,#FCD34D,#D97706)'
  },
  {
    id:'in-attesa',
    label:'In Attesa',
    svgKey:'clock',
    color:'#C2410C', bg:'#FFF7ED', border:'#FED7AA',
    grad:'linear-gradient(135deg,#FB923C,#EA580C)'
  },
  {
    id:'incarico-preso',
    label:'Incarico Preso',
    svgKey:'award',
    color:'#065F46', bg:'#ECFDF5', border:'#6EE7B7',
    grad:'linear-gradient(135deg,#34D399,#059669)'
  },
  {
    id:'perso',
    label:'Perso',
    svgKey:'xCircle',
    color:'#9F1239', bg:'#FFF1F2', border:'#FECDD3',
    grad:'linear-gradient(135deg,#FB7185,#E11D48)'
  }
];

/* ══ COLORI TIPI EVENTO AGENDA ══ */
const AP_EV_COLORS = {
  appuntamento:{bg:'#EFF6FF',color:'#1D4ED8',dot:'#3B82F6',svgKey:'evAppoint',label:'Appuntamento'},
  visita:       {bg:'#F0FDF4',color:'#15803D',dot:'#22C55E',svgKey:'evVisit',  label:'Visita'},
  scadenza:     {bg:'#FEF2F2',color:'#DC2626',dot:'#EF4444',svgKey:'evDeadline',label:'Scadenza'},
  incarico:     {bg:'#FFF7ED',color:'#C2410C',dot:'#FB923C',svgKey:'evIncarico',label:'Incarico'},
  compleanno:   {bg:'#FDF4FF',color:'#7C3AED',dot:'#A855F7',svgKey:'evBirthday',label:'Compleanno'},
  altro:        {bg:'#F8FAFC',color:'#475569',dot:'#94A3B8',svgKey:'evOther',  label:'Altro'}
};

function apGetDeals(){
  if(!Array.isArray(D.pipelineDeals)) D.pipelineDeals = [];
  return D.pipelineDeals;
}
function apFmt(v){var n=parseFloat(v)||0;if(!n)return '';if(n>=1000000)return '€'+(n/1000000).toFixed(2).replace('.',',')+' M';if(n>=1000)return '€'+(n/1000).toFixed(0)+' K';return '€'+n.toLocaleString('it-IT');}

function renderAgendaPipeline(){
  apRenderKpi();
  apRenderAgenda();
  apRenderPipeline();
}

/* ══ KPI strip — strip di riepilogo rapido nell'hero ══ */
function apRenderKpi(){
  var strip=document.getElementById('ap-kpi-strip');
  if(!strip)return;
  var evts=D.eventi||[];
  var today=new Date(); today.setHours(0,0,0,0);
  var todayS=today.toISOString().slice(0,10);
  var end7=new Date(today); end7.setDate(today.getDate()+7);
  var todayEvts=evts.filter(function(e){return (e.data||'').slice(0,10)===todayS;}).length;
  var week7=evts.filter(function(e){var d=new Date((e.data||'').slice(0,10));return d>=today&&d<end7;}).length;
  var deals=apGetDeals();
  var dealTot=deals.filter(function(d){return d.fase!=='perso';}).length;
  var dealVal=deals.filter(function(d){return d.fase!=='perso';}).reduce(function(s,d){return s+(parseFloat(d.valore)||0);},0);
  var incarichiPresi=deals.filter(function(d){return d.fase==='incarico-preso';}).length;
  var kpis=[
    {val:todayEvts,                         lbl:'Oggi',              svgKey:'calDay'},
    {val:week7,                             lbl:'Prossimi 7 giorni', svgKey:'calWeek'},
    {val:dealTot,                           lbl:'Trattative attive', svgKey:'refresh'},
    {val:dealVal>0?apFmt(dealVal):'—',      lbl:'Valore pipeline',   svgKey:'euro',  gold:true},
    {val:incarichiPresi,                    lbl:'Incarichi presi',   svgKey:'trophy', green:true}
  ];
  strip.innerHTML=kpis.map(function(k){
    var valClr=k.gold?'#FDE68A':k.green?'#86EFAC':'rgba(255,255,255,.95)';
    return '<div style="display:flex;align-items:center;gap:9px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);border-radius:11px;padding:9px 15px;backdrop-filter:blur(6px)">'
      +'<div style="width:28px;height:28px;background:rgba(255,255,255,.12);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
      +AP_SVG[k.svgKey]
      +'</div>'
      +'<div>'
      +'<div style="font-size:1.05rem;font-weight:800;color:'+valClr+';line-height:1;letter-spacing:-.5px">'+k.val+'</div>'
      +'<div style="font-size:0.6rem;color:rgba(255,255,255,.5);font-weight:600;margin-top:2px;text-transform:uppercase;letter-spacing:.5px">'+k.lbl+'</div>'
      +'</div>'
      +'</div>';
  }).join('');
}

/* ══ AGENDA SETTIMANALE ══ */
function apGetWeekDays(){
  var today=new Date();
  var dow=today.getDay();
  var mondayOff=dow===0?-6:1-dow;
  var monday=new Date(today);
  monday.setDate(today.getDate()+mondayOff+(window.apWeekOffset*7));
  monday.setHours(0,0,0,0);
  var days=[];
  for(var i=0;i<7;i++){var d=new Date(monday);d.setDate(monday.getDate()+i);days.push(d);}
  return days;
}
function apWeekMove(dir){window.apWeekOffset+=dir;apRenderAgenda();}
function apWeekToday(){window.apWeekOffset=0;apRenderAgenda();}

function apRenderAgenda(){
  var days=apGetWeekDays();
  var today=new Date(); today.setHours(0,0,0,0);
  var lbl=document.getElementById('ap-week-label');
  if(lbl){
    var opts={day:'numeric',month:'short'};
    var suffix=window.apWeekOffset===0?' (questa settimana)':window.apWeekOffset>0?' (+'+window.apWeekOffset+' sett.)'  :' ('+window.apWeekOffset+' sett.)';
    lbl.textContent=days[0].toLocaleDateString('it-IT',opts)+' — '+days[6].toLocaleDateString('it-IT',opts)+suffix;
  }
  /* Aggiorna icone bottoni navigazione */
  var prevBtn=document.querySelector('[onclick="apWeekMove(-1)"]');
  var nextBtn=document.querySelector('[onclick="apWeekMove(1)"]');
  if(prevBtn)prevBtn.innerHTML=AP_SVG.chevLeft;
  if(nextBtn)nextBtn.innerHTML=AP_SVG.chevRight;

  var grid=document.getElementById('ap-agenda-grid');
  if(!grid)return;
  // Combina eventi + visite (come fa lo scadenzario)
  var evts = (D.eventi||[]).slice();
  (D.visite||[]).forEach(function(v){
    if(!v.data) return;
    var im = D.immobili[parseInt(v.immRef)];
    var cl = D.clienti[parseInt(v.cliRef)];
    var cliNome = cl ? cl.nome : (v.cliente || 'cliente');
    var immDesc = im ? ((im.tipo||'') + (im.comune?' — '+im.comune:'')) : (v.immobile||'');
    evts.push({
      tipo: 'visita',
      titolo: 'Visita · ' + cliNome + (immDesc ? ' — ' + immDesc : ''),
      data: v.data,
      ora: v.ora || '',
      cliente: cliNome,
      _type: 'visita',
      _readOnly: true,
      _visIdx: D.visite.indexOf(v)
    });
  });
  var GIORNI=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
  grid.innerHTML='';

  days.forEach(function(d,idx){
    var isToday=d.getTime()===today.getTime();
    var isWeekend=d.getDay()===0||d.getDay()===6;
    /* Usa data locale (non toISOString che converte in UTC) per evitare sfasamento di +1 giorno */
    var ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    var dayEvts=evts.filter(function(e){return (e.data||'').slice(0,10)===ds;})
                    .sort(function(a,b){return (a.ora||'').localeCompare(b.ora||'');});

    var col=document.createElement('div');
    col.style.cssText='flex:1;min-width:115px;border-right:1px solid var(--border);display:flex;flex-direction:column;'
      +(isToday?'background:linear-gradient(180deg,#EFF6FF 0%,#F8FAFC 100%);':isWeekend?'background:#FAFBFC;':'');
    if(idx===days.length-1)col.style.borderRight='none';

    /* Day header */
    var hdr=document.createElement('div');
    hdr.style.cssText='padding:10px 8px 9px;text-align:center;border-bottom:2px solid '+(isToday?'#3B82F6':isWeekend?'#E2E8F0':'var(--border)')+';position:relative;';
    hdr.innerHTML='<div style="font-size:0.63rem;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:'+(isToday?'#1D4ED8':isWeekend?'#94A3B8':'var(--text3)')+'">'+GIORNI[d.getDay()]+'</div>'
      +'<div style="font-size:1.5rem;font-weight:800;line-height:1.1;margin:4px 0;'+(isToday?'width:36px;height:36px;border-radius:50%;background:#2563EB;color:white;display:flex;align-items:center;justify-content:center;margin:4px auto;':'color:var(--text);')+'">'+d.getDate()+'</div>'
      +'<div style="font-size:0.61rem;color:var(--text4);font-weight:500">'+d.toLocaleDateString('it-IT',{month:'short'})+'</div>';
    if(dayEvts.length>0){
      var badge=document.createElement('div');
      badge.style.cssText='position:absolute;top:5px;right:5px;background:'+(isToday?'rgba(255,255,255,.3)':'var(--brand-pale)')+';color:'+(isToday?'white':'var(--brand)')+';font-size:0.6rem;font-weight:800;border-radius:7px;padding:1px 5px;';
      badge.textContent=dayEvts.length;
      hdr.appendChild(badge);
    }
    col.appendChild(hdr);

    /* Events body */
    var body=document.createElement('div');
    body.style.cssText='flex:1;padding:6px 5px;display:flex;flex-direction:column;gap:4px;min-height:130px;';

    if(dayEvts.length===0){
      var empty=document.createElement('div');
      empty.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:14px 0;';
      empty.innerHTML='<div style="opacity:.3">'+apSvgColored('evOther','#94A3B8',16)+'</div>'
        +'<span style="font-size:0.63rem;color:var(--text4);font-style:italic">nessun evento</span>';
      body.appendChild(empty);
    } else {
      dayEvts.forEach(function(ev){
        var tc=AP_EV_COLORS[ev.tipo]||AP_EV_COLORS.altro;
        var card=document.createElement('div');
        card.style.cssText='padding:5px 7px;border-radius:7px;background:'+tc.bg+';border-left:3px solid '+tc.dot+';cursor:pointer;transition:all .12s;';
        card.onmouseenter=function(){this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)';this.style.transform='translateX(1px)';};
        card.onmouseleave=function(){this.style.boxShadow='';this.style.transform='';};
        /* Doppio click → modifica */
        if(ev._type === 'visita' && typeof ev._visIdx === 'number'){
          (function(visIdx){card.ondblclick=function(e){e.stopPropagation();if(typeof openVisita==='function')openVisita(visIdx);};})(ev._visIdx);
        } else {
          (function(evId){card.ondblclick=function(e){e.stopPropagation();apModificaEvento(evId);};})(ev.id);
        }
        card.title=(ev.titolo||'')+(ev.ora?' · '+ev.ora:'')+(ev.cliente?' · '+ev.cliente:'')+'\nDoppio click per modificare';
        var oraHtml=ev.ora?'<span style="font-size:0.58rem;font-weight:800;color:'+tc.color+';background:'+tc.dot+'22;border-radius:3px;padding:1px 5px;margin-bottom:3px;display:inline-flex;align-items:center;gap:3px">'
          +apSvgColored('evDeadline',tc.color,8)+' '+ev.ora.slice(0,5)+'</span><br>':'';
        card.innerHTML=oraHtml
          +'<div style="display:flex;align-items:flex-start;gap:4px;margin-top:'+(ev.ora?'2px':'0')+'"><span style="flex-shrink:0;margin-top:1px">'+apSvgColored(tc.svgKey,tc.color,10)+'</span>'
          +'<span style="font-size:0.71rem;font-weight:700;color:'+tc.color+';line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(ev.titolo||'Evento')+'</span></div>'
          +(ev.cliente?'<div style="font-size:0.61rem;color:var(--text4);margin-top:3px;display:flex;align-items:center;gap:3px">'+apSvgColored('user','#94A3B8',9)+'<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+ev.cliente+'</span></div>':'');
        card.title=(ev.titolo||'')+(ev.ora?' · '+ev.ora:'')+(ev.cliente?' · '+ev.cliente:'')+(ev.note?'\n'+ev.note:'');
        body.appendChild(card);
      });
    }

    /* Add btn */
    var addBtn=document.createElement('button');
    addBtn.style.cssText='margin:5px 5px 7px;padding:5px 4px;border-radius:7px;border:1.5px dashed var(--border);background:transparent;cursor:pointer;color:var(--text4);font-size:0.7rem;font-family:\'Inter\',sans-serif;font-weight:600;width:calc(100% - 10px);transition:all .12s;display:flex;align-items:center;justify-content:center;gap:4px;';
    addBtn.innerHTML=AP_SVG.plus+'<span>Aggiungi</span>';
    addBtn.onmouseenter=function(){this.style.borderColor='#2563EB';this.style.color='#2563EB';this.style.background='#EFF6FF';};
    addBtn.onmouseleave=function(){this.style.borderColor='var(--border)';this.style.color='var(--text4)';this.style.background='transparent';};
    (function(date){addBtn.onclick=function(){apNuovoEvento(date);};})(ds);
    body.appendChild(addBtn);
    col.appendChild(body);
    grid.appendChild(col);
  });
}

/* ══ PIPELINE COMMERCIALE ══ */
/* ══ PIPELINE COMMERCIALE — griglia unica allineata ══ */

var AP_COL_W = 88; /* larghezza fissa per ogni colonna-fase (px) */
var _apFiltroFase = '';   /* stato filtro fase — non dipende dal DOM */

function apRenderPipeline(){
  var deals = apGetDeals();
  var board = document.getElementById('ap-pipeline-board');
  var emptyEl = document.getElementById('ap-pipeline-empty');
  if(!board) return;

  /* Ricostruisce sempre le opzioni del select (idempotente) */
  var filterEl = document.getElementById('ap-filter-fase');
  if(filterEl){
    /* Leggi il valore corrente prima di ricostruire */
    var prevVal = filterEl.value || _apFiltroFase;
    filterEl.innerHTML = '<option value="">Tutte le fasi</option>'
      + AP_PIPELINE_STAGES.map(function(s){
          return '<option value="'+s.id+'"'+(s.id===prevVal?' selected':'')+'>'+s.label+'</option>';
        }).join('');
    _apFiltroFase = filterEl.value;
  }
  var filterPrio = (document.getElementById('ap-filter-prio')||{}).value || '';
  var sortBy     = (document.getElementById('ap-sort')||{}).value || 'fase';
  var searchQ    = ((document.getElementById('ap-search')||{}).value || '').toLowerCase().trim();

  /* KPI */
  var statsEl = document.getElementById('ap-pipeline-stats');
  if(statsEl){
    var tot  = deals.filter(function(d){ return d.fase !== 'perso'; }).length;
    var persi= deals.filter(function(d){ return d.fase === 'perso'; }).length;
    var val  = deals.filter(function(d){ return d.fase !== 'perso'; })
                    .reduce(function(s,d){ return s + (parseFloat(d.valore)||0); }, 0);
    statsEl.textContent = tot + ' attivi' +
      (persi ? ' · ' + persi + ' persi' : '') +
      (val > 0 ? '  ·  ' + apFmt(val) : '');
  }

  /* Filtra */
  var filtered = deals.filter(function(d){
    if(_apFiltroFase && d.fase !== _apFiltroFase) return false;
    if(filterPrio && d.priorita !== filterPrio) return false;
    if(searchQ && !(d.titolo||'').toLowerCase().includes(searchQ) &&
       !(d.cliente||'').toLowerCase().includes(searchQ) &&
       !(d.telefono||'').includes(searchQ)) return false;
    return true;
  });

  /* Ordina */
  filtered.sort(function(a,b){
    if(sortBy === 'az')    return (a.titolo||'').localeCompare(b.titolo||'');
    if(sortBy === 'valore')return (parseFloat(b.valore)||0) - (parseFloat(a.valore)||0);
    if(sortBy === 'fase'){
      var ai = AP_PIPELINE_STAGES.findIndex(function(s){ return s.id === a.fase; });
      var bi = AP_PIPELINE_STAGES.findIndex(function(s){ return s.id === b.fase; });
      return ai - bi;
    }
    return (b.data||'').localeCompare(a.data||'');
  });

  /* Empty state */
  if(emptyEl) emptyEl.style.display = filtered.length === 0 ? 'block' : 'none';
  board.innerHTML = '';
  if(filtered.length === 0) return;

  /* ── Calcola larghezza totale griglia ──
     28 (avatar) + 180 (cliente) + 100 (tel) + 80 (valore) + 8×COL_W (fasi) + 70 (azioni) */
  var stagesTotal = AP_PIPELINE_STAGES.length * AP_COL_W;
  var gridCols = '28px 180px 100px 80px ' + AP_PIPELINE_STAGES.map(function(){ return AP_COL_W + 'px'; }).join(' ') + ' 70px';

  /* ────────────────────────────────
     RIGA INTESTAZIONE
  ──────────────────────────────── */
  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:grid;grid-template-columns:' + gridCols + ';'
    + 'position:sticky;top:0;z-index:10;'
    + 'background:#F5F3FF;border-bottom:2px solid #DDD6FE;';

  /* Celle fisse */
  ['', 'Cliente', 'Telefono', 'Valore'].forEach(function(lbl, i){
    var cell = document.createElement('div');
    cell.style.cssText = 'padding:8px ' + (i===1?'8px 8px 8px 10px':'8px') + ';'
      + 'font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;'
      + 'color:' + (i===1?'#7C3AED':'#64748B') + ';white-space:nowrap;'
      + (i === 0 ? 'display:flex;align-items:center;justify-content:center;' : 'display:flex;align-items:center;');
    cell.textContent = lbl;
    hdr.appendChild(cell);
  });

  /* Una cella per fase */
  AP_PIPELINE_STAGES.forEach(function(stage){
    var cell = document.createElement('div');
    cell.style.cssText = 'width:' + AP_COL_W + 'px;display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:flex-end;padding:6px 4px 4px;'
      + 'cursor:pointer;transition:background .12s;border-left:1px solid #EDE9FE;';
    /* Icona */
    var ico = document.createElement('div');
    ico.style.cssText = 'width:20px;height:20px;border-radius:5px;' + stage.grad
      + ';display:flex;align-items:center;justify-content:center;margin-bottom:3px;flex-shrink:0;';
    ico.innerHTML = AP_SVG[stage.svgKey]
      .replace('width="14"','width="10"').replace('height="14"','height="10"')
      .replace('stroke="currentColor"','stroke="white"');
    cell.appendChild(ico);
    /* Label abbreviata */
    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:0.58rem;font-weight:800;color:' + stage.color
      + ';text-align:center;line-height:1.25;word-break:break-word;max-width:' + (AP_COL_W-8) + 'px;';
    lbl.textContent = stage.label;
    cell.appendChild(lbl);
    /* Filtro cliccabile */
    var fe = document.getElementById('ap-filter-fase');
    (function(sid){
      cell.onclick = function(){
        if(fe){ fe.value = (fe.value === sid ? '' : sid); _apFiltroFase = fe.value; }
        apRenderPipeline();
      };
      cell.onmouseenter = function(){ this.style.background = stage.bg; };
      cell.onmouseleave = function(){ this.style.background = ''; };
      if(fe && fe.value === sid) cell.style.background = stage.bg;
    })(stage.id);
    hdr.appendChild(cell);
  });

  /* Cella azioni header vuota */
  var actHdr = document.createElement('div');
  actHdr.style.cssText = 'padding:8px;';
  hdr.appendChild(actHdr);
  board.appendChild(hdr);

  /* ────────────────────────────────
     RIGHE DATI
  ──────────────────────────────── */
  var prioMap = {
    alta : { color:'#DC2626', bg:'#FEF2F2', lbl:'Alta'  },
    media: { color:'#B45309', bg:'#FFFBEB', lbl:'Media' },
    bassa: { color:'#15803D', bg:'#F0FDF4', lbl:'Bassa' }
  };

  filtered.forEach(function(deal, idx){
    var currentStageIdx = AP_PIPELINE_STAGES.findIndex(function(s){ return s.id === deal.fase; });
    if(currentStageIdx < 0) currentStageIdx = 0;
    var currentStage = AP_PIPELINE_STAGES[currentStageIdx] || AP_PIPELINE_STAGES[0];
    var isLost = deal.fase === 'perso';
    var isWon  = deal.fase === 'incarico-preso';
    var pm = prioMap[deal.priorita] || { color:'#64748B', bg:'#F8FAFC', lbl:'' };

    /* ── Colore di riga basato sullo stato ── */
    /* Sfondo tenue della fase corrente + bordo sinistro colorato */
    var rowBg   = isLost ? '#FFF1F2' : isWon ? '#ECFDF5' : currentStage.bg;
    var rowBorder = isLost ? '#FECDD3' : isWon ? '#6EE7B7' : currentStage.border;
    var rowAccent = isLost ? '#E11D48' : isWon ? '#059669' : currentStage.color;

    var row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:' + gridCols + ';'
      + 'border-bottom:1px solid ' + rowBorder + ';'
      + 'background:' + rowBg + ';'
      + 'border-left:4px solid ' + rowAccent + ';'
      + 'transition:filter .1s;'
      + (isLost ? 'opacity:.7;' : '');
    row.onmouseenter = function(){ this.style.filter = 'brightness(.96)'; };
    row.onmouseleave = function(){ this.style.filter = ''; };

    /* ── Avatar ── */
    var avatarCell = document.createElement('div');
    avatarCell.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:10px 0 10px 10px;';
    var initials = (deal.titolo||'?').charAt(0).toUpperCase();
    avatarCell.innerHTML = '<div style="width:26px;height:26px;border-radius:50%;' + currentStage.grad
      + ';display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;color:white;flex-shrink:0">'
      + initials + '</div>';
    row.appendChild(avatarCell);

    /* ── Cliente info ── */
    var infoCell = document.createElement('div');
    infoCell.style.cssText = 'padding:9px 8px;display:flex;flex-direction:column;justify-content:center;min-width:0;';
    /* Icona vettoriale fase corrente, da inserire nel badge */
    var stageIco = AP_SVG[currentStage.svgKey]
      .replace('width="14"','width="9"').replace('height="14"','height="9"')
      .replace('stroke="currentColor"','stroke="'+currentStage.color+'"');
    var lostIco  = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#E11D48" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    var wonIco   = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var stateBadgeIco = isLost ? lostIco : (isWon ? wonIco : stageIco);
    var stateBadgeColor = isLost ? '#E11D48' : (isWon ? '#059669' : currentStage.color);
    var stateBadgeBg    = isLost ? '#FEE2E2' : (isWon ? '#D1FAE5' : (currentStage.bg || '#F8FAFC'));
    var stateBadgeBorder= isLost ? '#FECACA' : (isWon ? '#A7F3D0' : (currentStage.border || '#E2E8F0'));
    infoCell.innerHTML = '<div style="font-size:0.82rem;font-weight:700;color:' + (isWon?'#065F46':'var(--text)') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
      + (deal.titolo||'—')
      + '</div>'
      + ((deal.comune||deal.zona) ? '<div style="font-size:0.66rem;color:' + currentStage.color + ';opacity:.8;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
          + [deal.comune, deal.zona].filter(Boolean).join(' · ') + '</div>' : '')
      + '<div style="margin-top:4px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">'
      +   '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.62rem;font-weight:700;background:'+stateBadgeBg+';color:'+stateBadgeColor+';padding:2px 7px;border-radius:10px;border:1px solid '+stateBadgeBorder+';white-space:nowrap">'
      +     stateBadgeIco
      +     '<span>'+(isLost?'Perso':(isWon?'Vinto':currentStage.label))+'</span>'
      +   '</span>'
      +   (deal.priorita ? '<span style="font-size:0.59rem;font-weight:700;background:' + pm.bg + ';color:' + pm.color + ';padding:1px 6px;border-radius:4px">' + pm.lbl + '</span>' : '')
      + '</div>';
    row.appendChild(infoCell);

    /* ── Telefono ── */
    var telCell = document.createElement('div');
    telCell.style.cssText = 'padding:9px 8px;display:flex;align-items:center;';
    telCell.innerHTML = deal.telefono
      ? '<a href="tel:' + deal.telefono + '" onclick="event.stopPropagation()" style="font-size:0.72rem;color:#1D4ED8;text-decoration:none;font-weight:600">' + deal.telefono + '</a>'
      : '<span style="color:var(--text4);font-size:0.72rem">—</span>';
    row.appendChild(telCell);

    /* ── Valore ── */
    var valCell = document.createElement('div');
    valCell.style.cssText = 'padding:9px 8px;display:flex;align-items:center;';
    valCell.innerHTML = deal.valore
      ? '<span style="font-size:0.76rem;font-weight:800;color:' + rowAccent + '">' + apFmt(parseFloat(deal.valore)) + '</span>'
      : '<span style="color:var(--text4);font-size:0.72rem">—</span>';
    row.appendChild(valCell);

    /* ── Celle per ogni fase ── */
    AP_PIPELINE_STAGES.forEach(function(stage, si){
      var isCurrent  = stage.id === deal.fase;
      var isPast     = si < currentStageIdx && !isLost;
      var isLostStage= stage.id === 'perso';

      var cell = document.createElement('div');
      cell.style.cssText = 'width:' + AP_COL_W + 'px;display:flex;align-items:center;justify-content:center;'
        + 'border-left:1px solid ' + rowBorder + ';cursor:pointer;transition:background .1s;position:relative;';
      cell.title = stage.label + (isCurrent ? ' (attuale)' : ' — imposta questa fase');
      cell.onmouseenter = function(){ this.style.background = 'rgba(0,0,0,.04)'; };
      cell.onmouseleave = function(){ this.style.background = ''; };

      var dotHtml;
      if(isCurrent && isLostStage){
        /* Perso: X rossa grande */
        dotHtml = '<div style="width:30px;height:30px;border-radius:50%;background:#E11D48;'
          + 'display:flex;align-items:center;justify-content:center;'
          + 'box-shadow:0 2px 8px rgba(225,29,72,.45);border:2px solid white;">'
          + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
          + '</div>';
      } else if(isCurrent){
        /* ── FASE ATTUALE: anello esterno + cerchio grande con gradiente ── */
        dotHtml = '<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
          + '<div style="position:absolute;inset:0;border-radius:50%;border:2.5px solid '+stage.color+';opacity:.4;"></div>'
          + '<div style="width:32px;height:32px;border-radius:50%;'+stage.grad
          + ';display:flex;align-items:center;justify-content:center;'
          + 'box-shadow:0 3px 12px '+stage.color+'77,0 1px 3px rgba(0,0,0,.18);'
          + 'border:2.5px solid white;flex-shrink:0;z-index:1;">'
          + AP_SVG[stage.svgKey]
              .replace('width="14"','width="14"').replace('height="14"','height="14"')
              .replace('stroke="currentColor"','stroke="white"')
          + '</div>'
          + '</div>';
      } else if(isPast){
        /* Completato: check ✓ colorato */
        dotHtml = '<div style="width:24px;height:24px;border-radius:50%;background:'+currentStage.color
          + ';display:flex;align-items:center;justify-content:center;'
          + 'opacity:.9;box-shadow:0 1px 4px rgba(0,0,0,.12)">'
          + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          + '</div>';
      } else {
        /* Futuro: cerchio tratteggiato */
        dotHtml = '<div style="width:18px;height:18px;border-radius:50%;border:2px dashed #CBD5E1;background:white;transition:border-color .12s,background .12s" '
          + 'onmouseenter="this.style.borderColor=\''+stage.color+'\';this.style.background=\''+stage.bg+'\'" '
          + 'onmouseleave="this.style.borderColor=\'#CBD5E1\';this.style.background=\'white\'"></div>';
      }
      cell.innerHTML = dotHtml;

      /* Click → cambia fase */
      (function(sid){ cell.onclick = function(e){ e.stopPropagation(); apMoveDeal(deal.id, sid); }; })(stage.id);
      row.appendChild(cell);
    });

    /* ── Azioni ── */
    var actCell = document.createElement('div');
    actCell.style.cssText = 'padding:9px 8px 9px 4px;display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-shrink:0;';
    actCell.innerHTML =
      '<button onclick="event.stopPropagation();apEditDeal(\'' + deal.id + '\')" title="Apri scheda" '
      + 'style="width:28px;height:28px;border-radius:7px;border:1.5px solid ' + rowBorder + ';background:white;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text3);transition:all .12s" '
      + 'onmouseover="this.style.borderColor=\'' + rowAccent + '\';this.style.background=\'' + currentStage.bg + '\';this.style.color=\'' + rowAccent + '\'" '
      + 'onmouseout="this.style.borderColor=\'' + rowBorder + '\';this.style.background=\'white\';this.style.color=\'var(--text3)\'">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>'
      + '</button>'
      + '<button onclick="event.stopPropagation();apDelDeal(\'' + deal.id + '\')" title="Elimina" '
      + 'style="width:28px;height:28px;border-radius:7px;border:1.5px solid ' + rowBorder + ';background:white;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text3);transition:all .12s" '
      + 'onmouseover="this.style.borderColor=\'#DC2626\';this.style.background=\'#FEF2F2\';this.style.color=\'#DC2626\'" '
      + 'onmouseout="this.style.borderColor=\'' + rowBorder + '\';this.style.background=\'white\';this.style.color=\'var(--text3)\'">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>'
      + '</button>';
    row.appendChild(actCell);

    board.appendChild(row);
  });
}


/* ══ SCHEDA CONTATTO — apri modal con tutti i campi ══ */
function apEditDeal(dealId){
  var deals=apGetDeals();
  var deal=deals.find(function(d){return d.id===dealId;});
  if(!deal)return;
  var stage=AP_PIPELINE_STAGES.find(function(s){return s.id===deal.fase;})||AP_PIPELINE_STAGES[0];

  /* Popola select fase */
  var faseEl=document.getElementById('ap-d-fase');
  if(faseEl){
    faseEl.innerHTML=AP_PIPELINE_STAGES.map(function(s){
      return '<option value="'+s.id+'"'+(s.id===deal.fase?' selected':'')+'>'+s.label+'</option>';
    }).join('');
  }

  /* Colora header modal con il gradiente della fase corrente */
  var head=document.getElementById('ap-deal-mhead');
  if(head)head.style.background=stage.grad;
  var stageLbl=document.getElementById('ap-deal-stage-label');
  if(stageLbl)stageLbl.textContent=stage.label;
  var titleEl=document.getElementById('ap-deal-mhead-title');
  if(titleEl)titleEl.textContent=deal.titolo||'Scheda Contatto';

  /* Valori campi */
  var sv=function(id,v){var e=document.getElementById(id);if(e)e.value=v||'';};
  sv('ap-d-id',     deal.id);
  sv('ap-d-titolo', deal.titolo);
  sv('ap-d-telefono',deal.telefono);
  sv('ap-d-email',  deal.email);
  sv('ap-d-modalita',deal.modalita);
  sv('ap-d-fonte',  deal.fonte);
  sv('ap-d-tipo-op',deal.tipoOp);
  sv('ap-d-tipo-imm',deal.tipoImm);
  sv('ap-d-comune', deal.comune);
  sv('ap-d-zona',   deal.zona);
  sv('ap-d-mq',     deal.mq);
  sv('ap-d-valore', deal.valore);
  sv('ap-d-fase',   deal.fase);
  sv('ap-d-priorita',deal.priorita||'media');
  sv('ap-d-data',   deal.dataContatto||deal.data||'');
  sv('ap-d-followup',deal.dataFollowup||'');
  sv('ap-d-note',   deal.note);

  openModal('modal-ap-deal');
  setTimeout(function(){var f=document.getElementById('ap-d-titolo');if(f){f.focus();f.select();}},80);
}

function apSaveDeal(){
  var dealId=document.getElementById('ap-d-id')?document.getElementById('ap-d-id').value:'';
  var deals=apGetDeals();
  var gv=function(id){var e=document.getElementById(id);return e?e.value.trim():'';};
  var titolo=gv('ap-d-titolo');
  if(!titolo){showToast('Inserisci il nome del contatto','','#DC2626');return;}

  var isNew=!dealId;
  var deal=dealId?deals.find(function(d){return d.id===dealId;}):null;
  if(!deal){
    deal={id:'deal_'+Date.now(),data:new Date().toISOString().slice(0,10)};
    deals.push(deal);
  }
  deal.titolo=titolo;
  deal.telefono=gv('ap-d-telefono');
  deal.email=gv('ap-d-email');
  deal.modalita=gv('ap-d-modalita');
  deal.fonte=gv('ap-d-fonte');
  deal.tipoOp=gv('ap-d-tipo-op');
  deal.tipoImm=gv('ap-d-tipo-imm');
  deal.cliente=titolo; /* compat con render card */
  deal.immobile=[gv('ap-d-tipo-imm'),gv('ap-d-comune'),gv('ap-d-zona')].filter(Boolean).join(' · ');
  deal.comune=gv('ap-d-comune');
  deal.zona=gv('ap-d-zona');
  deal.mq=gv('ap-d-mq');
  deal.valore=gv('ap-d-valore');
  deal.fase=gv('ap-d-fase')||AP_PIPELINE_STAGES[0].id;
  deal.priorita=gv('ap-d-priorita')||'media';
  deal.dataContatto=gv('ap-d-data');
  deal.dataFollowup=gv('ap-d-followup');
  deal.note=gv('ap-d-note');

  saveD();
  closeModal('modal-ap-deal');
  apRenderPipeline();
  apRenderKpi();
  showToast(isNew?'Contatto aggiunto':'Contatto aggiornato','','#059669');
}

/* ══ AZIONI ══ */
function apNuovoEvento(preDate){
  var dataDefault=preDate||new Date().toISOString().slice(0,10);
  var titolo=prompt('Titolo evento:','');
  if(!titolo||!titolo.trim())return;
  var ora=prompt('Ora (es. 10:30) — lascia vuoto per tutto il giorno:','09:00');
  var tipo=prompt('Tipo:\n1 = Appuntamento\n2 = Visita\n3 = Scadenza\n4 = Incarico\n5 = Compleanno\n6 = Altro\n\nInserisci numero:','1');
  var tipoMap={'1':'appuntamento','2':'visita','3':'scadenza','4':'incarico','5':'compleanno','6':'altro'};
  var tipoFinal=tipoMap[tipo]||tipo||'appuntamento';
  var cliente=prompt('Cliente collegato (opzionale):','');
  var note=prompt('Note (opzionale):','');
  if(!D.eventi)D.eventi=[];
  D.eventi.push({id:'ev_ap_'+Date.now(),data:dataDefault,ora:ora||'',titolo:titolo.trim(),tipo:tipoFinal,cliente:cliente||'',note:note||''});
  saveD();
  renderAgendaPipeline();
  showToast('Evento aggiunto','','#15803D');
}

function apModificaEvento(evId){
  if(!D.eventi)return;
  var ev=D.eventi.find(function(e){return e.id===evId;});
  if(!ev)return;
  var tipoNumMap={appuntamento:'1',visita:'2',scadenza:'3',incarico:'4',compleanno:'5',altro:'6'};
  var titolo=prompt('Titolo evento:',ev.titolo||'');
  if(titolo===null)return;
  if(!titolo.trim()){if(confirm('Eliminare questo evento?')){D.eventi=D.eventi.filter(function(e){return e.id!==evId;});saveD();renderAgendaPipeline();showToast('Evento eliminato','','#D97706');}return;}
  var ora=prompt('Ora (es. 10:30) — vuoto = tutto il giorno:',ev.ora||'');
  if(ora===null)return;
  var tipo=prompt('Tipo:\n1 = Appuntamento\n2 = Visita\n3 = Scadenza\n4 = Incarico\n5 = Compleanno\n6 = Altro\n\nInserisci numero:',tipoNumMap[ev.tipo]||'1');
  if(tipo===null)return;
  var tipoMap={'1':'appuntamento','2':'visita','3':'scadenza','4':'incarico','5':'compleanno','6':'altro'};
  var data=prompt('Data (YYYY-MM-DD):',ev.data||'');
  if(data===null)return;
  var cliente=prompt('Cliente collegato:',ev.cliente||'');
  if(cliente===null)return;
  var note=prompt('Note:',ev.note||'');
  if(note===null)return;
  ev.titolo=titolo.trim();
  ev.ora=ora||'';
  ev.tipo=tipoMap[tipo]||tipo||ev.tipo;
  if(data.trim())ev.data=data.trim();
  ev.cliente=cliente;
  ev.note=note;
  /* ── Sync inverso verso la pratica per evento Rogito ── */
  if(ev._type==='pratica' && typeof ev._pratIdx==='number' && ev.titolo && ev.titolo.indexOf('Rogito')>=0){
    var pratAp = D.pratiche && D.pratiche[ev._pratIdx];
    if(pratAp){
      pratAp.drogito = ev.data;
      pratAp.oraRogito = ev.ora||'';
    }
  }
  saveD();
  renderAgendaPipeline();
  showToast('Evento aggiornato','','#15803D');
}

function apNuovoDeal(fasePreset){
  /* Resetta tutti i campi del modal */
  var faseEl=document.getElementById('ap-d-fase');
  if(faseEl){
    faseEl.innerHTML=AP_PIPELINE_STAGES.map(function(s){
      return '<option value="'+s.id+'"'+(s.id===(fasePreset||AP_PIPELINE_STAGES[0].id)?' selected':'')+'>'+s.label+'</option>';
    }).join('');
  }
  var clearIds=['ap-d-id','ap-d-titolo','ap-d-telefono','ap-d-email','ap-d-fonte','ap-d-tipo-op','ap-d-tipo-imm','ap-d-comune','ap-d-zona','ap-d-mq','ap-d-valore','ap-d-data','ap-d-followup','ap-d-note'];
  clearIds.forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
  var modalita=document.getElementById('ap-d-modalita');if(modalita)modalita.value='';
  var prio=document.getElementById('ap-d-priorita');if(prio)prio.value='media';
  var dataEl=document.getElementById('ap-d-data');if(dataEl)dataEl.value=new Date().toISOString().slice(0,10);

  var stage=(fasePreset?AP_PIPELINE_STAGES.find(function(s){return s.id===fasePreset;}):null)||AP_PIPELINE_STAGES[0];
  var head=document.getElementById('ap-deal-mhead');if(head)head.style.background=stage.grad;
  var stageLbl=document.getElementById('ap-deal-stage-label');if(stageLbl)stageLbl.textContent=stage.label;
  var titleEl=document.getElementById('ap-deal-mhead-title');if(titleEl)titleEl.textContent='Nuovo Contatto';

  openModal('modal-ap-deal');
  setTimeout(function(){var f=document.getElementById('ap-d-titolo');if(f)f.focus();},80);
}

function apMoveDeal(dealId,nuovaFase){
  var deals=apGetDeals();
  var deal=deals.find(function(d){return d.id===dealId;});
  if(!deal||!nuovaFase)return;
  deal.fase=nuovaFase;
  saveD();
  apRenderPipeline();
  apRenderKpi();
  var stage=AP_PIPELINE_STAGES.find(function(s){return s.id===nuovaFase;});
  var msg=nuovaFase==='incarico-preso'?'Incarico acquisito: ':nuovaFase==='perso'?'Spostato in Perso: ':'Spostato in ';
  showToast(msg+(nuovaFase==='incarico-preso'||nuovaFase==='perso'?deal.titolo:stage?stage.label:nuovaFase),'',nuovaFase==='perso'?'#9F1239':nuovaFase==='incarico-preso'?'#059669':'#7C3AED');
}

function apDelDeal(dealId){
  if(!confirm('Eliminare questo contatto dalla pipeline?'))return;
  D.pipelineDeals=(D.pipelineDeals||[]).filter(function(d){return d.id!==dealId;});
  saveD();
  apRenderPipeline();
  apRenderKpi();
}


Object.assign(window, { apSvgColored, apGetDeals, apFmt, renderAgendaPipeline, apRenderKpi, apGetWeekDays, apWeekMove, apWeekToday, apRenderAgenda, apRenderPipeline, apEditDeal, apSaveDeal, apNuovoEvento, apModificaEvento, apNuovoDeal, apMoveDeal, apDelDeal });
export { renderAgendaPipeline, apRenderAgenda, apRenderPipeline };
