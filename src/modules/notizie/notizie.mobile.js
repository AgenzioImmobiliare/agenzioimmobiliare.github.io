// modules/notizie/notizie.mobile.js — vista MOBILE del modulo Notizie.
// Estratto: mobRenderNotizie (53756-53902).
// Dipendenze esterne (monolite via window): helper _mob*, mobSheet*, mobToast.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function mobRenderNotizie(){
  var c = document.getElementById('mob-content');
  if(!c || typeof D === 'undefined') return;

  var lista = (D.notizie||[]).map(function(n,i){ return {n:n,i:i}; })
    .filter(function(o){
      if(!_mobSearchQ) return true;
      var hay = [o.n.nome,o.n.comune,o.n.zona,o.n.tel,o.n.note,o.n.stato].join(' ').toLowerCase();
      return hay.indexOf(_mobSearchQ.toLowerCase()) >= 0;
    })
    .sort(function(a,b){
      var po={'Alta':0,'Media':1,'Bassa':2};
      return (po[a.n.prio]||2)-(po[b.n.prio]||2);
    });

  var statoCfg = {
    'Da Contattare': {bg:'#FEE2E2',txt:'#B91C1C'},
    'Contattato':    {bg:'#DBEAFE',txt:'#1E40AF'},
    'In Attesa':     {bg:'#FEF3C7',txt:'#92400E'},
    'In Trattativa': {bg:'#FEF9C3',txt:'#854D0E'},
    'Acquisito':     {bg:'#DCFCE7',txt:'#14532D'},
    'Non Interessato':{bg:'#F1F5F9',txt:'#475569'}
  };

  /* KPI */
  var tot = (D.notizie||[]).length;
  var daCont = (D.notizie||[]).filter(function(n){ return n.stato==='Da Contattare'; }).length;
  var acq = (D.notizie||[]).filter(function(n){ return n.stato==='Acquisito'; }).length;

  var html = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:10px;">';
  html += '<div style="background:#EFF6FF;border-radius:11px;padding:8px 6px;text-align:center;">'
    +'<div style="font-size:1.2rem;font-weight:800;color:#1D4ED8;line-height:1;">'+tot+'</div>'
    +'<div style="font-size:0.58rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.4px;margin-top:2px;">Totale</div>'
    +'</div>';
  html += '<div style="background:#FEF2F2;border-radius:11px;padding:8px 6px;text-align:center;">'
    +'<div style="font-size:1.2rem;font-weight:800;color:#DC2626;line-height:1;">'+daCont+'</div>'
    +'<div style="font-size:0.58rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.4px;margin-top:2px;">Da cont.</div>'
    +'</div>';
  html += '<div style="background:#F0FDF4;border-radius:11px;padding:8px 6px;text-align:center;">'
    +'<div style="font-size:1.2rem;font-weight:800;color:#16A34A;line-height:1;">'+acq+'</div>'
    +'<div style="font-size:0.58rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.4px;margin-top:2px;">Acquisiti</div>'
    +'</div>';
  html += '</div>';

  /* Bottone nuova notizia */
  html += '<button onclick="mobOpenCacciaNotizia()" style="width:100%;padding:10px;border:none;border-radius:11px;'
    +'background:linear-gradient(135deg,#059669,#10B981);color:#fff;font-size:0.84rem;font-weight:800;'
    +'font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;'
    +'box-shadow:0 3px 10px rgba(5,150,105,0.3);margin-bottom:12px;">'
    +'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    +'Nuova notizia'
    +'</button>';

  if(!lista.length){
    html += '<div class="mob-empty"><div class="mob-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>'
      +(_mobSearchQ?'Nessuna notizia trovata.':'Nessuna notizia ancora.<br><small>Usa il pulsante sopra per registrarne una.</small>')
      +'</div>';
  } else {
    /* CSS swipe notizie */
    html += '<style>'
      + '.mob-cn-swipe-wrap{position:relative;overflow:hidden;border-radius:14px;margin-bottom:12px;}'
      + '.mob-cn-del-bg{position:absolute;right:0;top:0;bottom:0;width:80px;background:#DC2626;'
      + '  display:flex;align-items:center;justify-content:center;border-radius:0 14px 14px 0;cursor:pointer;}'
      + '.mob-cn-card-inner{position:relative;z-index:1;transform:translateX(0);'
      + '  transition:transform .22s ease;touch-action:pan-y;}'
      + '.mob-cn-card-inner.swiped{transform:translateX(-80px);}'
      + '</style>';

    html += '<div class="mob-notizie-wrap">';
    lista.forEach(function(o){
      var n = o.n;
      var sc = statoCfg[n.stato] || {bg:'#F1F5F9',txt:'#475569'};
      var fotoHtml = '';
      var primaFoto = Array.isArray(n.foto) ? n.foto[0] : n.foto;
      if(primaFoto){
        fotoHtml = '<img class="mob-notizia-foto" src="'+_cnEsc(primaFoto)+'" alt="" loading="lazy">';
      } else {
        fotoHtml = '<div class="mob-notizia-foto-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>';
      }
      var sub = [];
      if(n.tipoImm) sub.push(n.tipoImm);
      if(n.comune) sub.push(n.comune+(n.zona?', '+n.zona:''));
      if(n.mq) sub.push(n.mq+' m²');
      if(n.valore) sub.push('€ '+Number(n.valore).toLocaleString('it-IT'));
      var telHref = n.tel ? 'tel:'+n.tel.replace(/\s/g,'') : '';
      var swipeId = 'mob-cn-card-'+o.i;

      html += '<div class="mob-cn-swipe-wrap">'
        /* Sfondo rosso */
        + '<div class="mob-cn-del-bg" onclick="_cnDeleteConferma('+o.i+')">'
        + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>'
        + '</div>'
        /* Card scorrevole */
        + '<div class="mob-cn-card-inner mob-notizia-card" id="'+swipeId+'"'
        + ' ondblclick="mobOpenCacciaNotizia('+o.i+')" style="cursor:pointer;">';

      /* Layout due colonne: sinistra (nome+tel) | destra (stato+info) */
      html += '<div style="display:flex;align-items:stretch;justify-content:space-between;gap:8px;padding:10px 12px;">';

      /* Colonna sinistra: foto + testi */
      html += '<div style="display:flex;align-items:center;gap:9px;min-width:0;flex:1;">';
      html +=   fotoHtml;
      html +=   '<div style="min-width:0;flex:1;">';
      html +=     '<div style="font-size:0.84rem;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_mobEsc(n.nome||'Senza nome')+'</div>';
      if(telHref){
        html += '<a href="'+telHref+'" onclick="event.stopPropagation()" style="font-size:0.74rem;color:#2563EB;font-weight:600;text-decoration:none;display:block;margin-top:2px;">📞 '+_mobEsc(n.tel)+'</a>';
      } else {
        html += '<div style="font-size:0.72rem;color:#CBD5E1;margin-top:2px;">—</div>';
      }
      html +=   '</div>';
      html += '</div>';

      /* Colonna destra: stato + info immobile */
      html += '<div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:3px;flex-shrink:0;">';
      html +=   '<span class="mob-notizia-stato" style="background:'+sc.bg+';color:'+sc.txt+';">'+_mobEsc(n.stato||'—')+'</span>';
      if(n.prio && n.prio !== 'Bassa') html += '<span class="mob-notizia-prio">'+_mobEsc(n.prio)+'</span>';
      if(sub.length) html += '<span style="font-size:0.65rem;color:#64748B;text-align:right;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;">'+_mobEsc(sub.slice(0,2).join(' · '))+'</span>';
      if(n.followup) html += '<span style="font-size:0.63rem;color:#2563EB;font-weight:600;">📅 '+_mobEsc(n.followup.slice(5).replace('-','/'))+'</span>';
      html += '</div>';

      html += '</div>'; /* fine layout colonne */

      html += '</div>'; /* fine card-inner */
      html += '</div>'; /* fine swipe-wrap */
    });
    html += '</div>';
  }

  c.innerHTML = html;

  /* ── Inizializza swipe su ogni card notizia ── */
  lista.forEach(function(o){
    var cardEl = document.getElementById('mob-cn-card-'+o.i);
    if(!cardEl) return;
    var startX=0, startY=0, isDragging=false, isSwiped=false;
    cardEl.addEventListener('touchstart', function(e){ startX=e.touches[0].clientX; startY=e.touches[0].clientY; isDragging=false; },{passive:true});
    cardEl.addEventListener('touchmove',  function(e){ var dx=e.touches[0].clientX-startX,dy=e.touches[0].clientY-startY; if(Math.abs(dx)>Math.abs(dy)+5) isDragging=true; },{passive:true});
    cardEl.addEventListener('touchend',   function(e){
      if(!isDragging) return;
      var dx=e.changedTouches[0].clientX-startX;
      if(dx < -40){ cardEl.classList.add('swiped'); isSwiped=true; setTimeout(function(){ if(isSwiped){ cardEl.classList.remove('swiped'); isSwiped=false; } },3000); }
      else if(dx > 20 && isSwiped){ cardEl.classList.remove('swiped'); isSwiped=false; }
    },{passive:true});
  });
}

/* ── Elimina notizia con sheet di conferma (event delegation) ──────── */

Object.assign(window, { mobRenderNotizie });
export { mobRenderNotizie };
