// modules/clienti/clienti.mobile.js — vista MOBILE del modulo Clienti.
// Estratto dal monolite: mobRenderClienti (47840-47970), mobOpenCliente
// (48827-48831), mobOpenSchedaCliente (51858-51992).
// Dipendenze esterne (monolite via window): _mobEsc, _mobFmtCur, _mobIni,
// _mobInfoRow, _mobMatch, _mobVisChip, mobSheetOpen, mobToast, renderSchedaCliente.
import { state } from '../../core/state.js';

const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function mobRenderClienti(){
  var c = document.getElementById('mob-content');
  if(!c || typeof D === 'undefined') return;

  var lista = (D.clienti||[]).map(function(cl, i){ return {cl:cl, idx:i}; })
    .filter(function(o){
      if(o.cl.archiviato) return false;
      if(!_mobSearchQ) return true;
      /* Cerca anche negli immobili collegati (comune, ref, zona, tipo) */
      if(_mobMatch(o.cl, _mobSearchQ, ['nome','tel','email','citta'])) return true;
      var ql = _mobSearchQ.toLowerCase();
      return (D.immobili||[]).some(function(im){
        var nomeMatch = o.cl.nome && im.contatto &&
          im.contatto.trim().toLowerCase() === o.cl.nome.trim().toLowerCase();
        var refMatch = String(im.cliRef||'') === String(o.idx) ||
                       String(im.clienteRef||'') === String(o.idx);
        if(!nomeMatch && !refMatch) return false;
        var hay = [im.ref||'', im.comune||'', im.zona||'', im.tipo||'', im.indirizzo||''].join(' ').toLowerCase();
        return hay.indexOf(ql) >= 0;
      });
    })
    .sort(function(a,b){ return (a.cl.nome||'').localeCompare(b.cl.nome||'','it'); });

  var html = '<div class="mob-section-title">Clienti attivi <span class="mob-section-title-cnt">'+lista.length+'</span></div>';
  if(!lista.length){
    html += '<div class="mob-empty"><div class="mob-empty-icon">'+_MSVG.users+'</div>'+(_mobSearchQ?'Nessun cliente trovato.':'Nessun cliente ancora.')+'</div>';
  } else {
    var tcol = {acquirente:'#2563EB',venditore:'#D97706',entrambi:'#15803D'};
    var tlbl = {acquirente:'Acquirente',venditore:'Venditore',entrambi:'Entrambi'};
    lista.forEach(function(o){
      var cl = o.cl;
      var bg = tcol[cl.tipo] || '#64748B';
      var sub = [];
      if(cl.tel) sub.push(cl.tel);
      else if(cl.email) sub.push(cl.email);
      if(cl.citta) sub.push(cl.citta);

      /* Immobili di cui è proprietario — match per nome contatto, cliRef O clienteRef */
      var immProp = (D.immobili||[]).filter(function(im, imIdx){
        var nomeMatch = cl.nome && im.contatto &&
          im.contatto.trim().toLowerCase() === cl.nome.trim().toLowerCase();
        var refMatch = im.cliRef !== undefined && im.cliRef !== null &&
          String(im.cliRef) === String(o.idx);
        var clienteRefMatch = im.clienteRef !== undefined && im.clienteRef !== null &&
          String(im.clienteRef) === String(o.idx);
        return nomeMatch || refMatch || clienteRefMatch;
      });

      var immHtml = '';
      if(immProp.length){
        immHtml = '<div style="margin-top:8px;display:flex;flex-direction:column;gap:5px;">';
        immProp.forEach(function(im){
          var statoCol = (function(s){
            s = (s||'').toLowerCase();
            if(s==='venduto') return '#16A34A';
            if(s==='archiviato'||s==='non attivo') return '#94A3B8';
            if(s==='trattativa') return '#D97706';
            return '#2563EB';
          })(im.stato);
          var lbl = (im.tipo||'Immobile')+(im.ref?' · '+im.ref:'')+(im.comune?' — '+im.comune:'');
          var prz  = im.prezzo ? ' · € '+_mobFmtCur(im.prezzo) : '';
          immHtml += '<div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:8px;background:#F8FAFC;border:1px solid #E8EFF8;border-radius:9px;padding:6px 9px;overflow:hidden;pointer-events:none;">';
          if(im.foto){
            immHtml += '<img src="'+_mobEsc(im.foto)+'" style="width:38px;height:30px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid #E2E8F0;" loading="lazy" alt="">';
          } else {
            immHtml += '<div style="width:38px;height:30px;background:#EFF6FF;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#93C5FD;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>';
          }
          immHtml += '<div style="flex:1;min-width:0;">';
          immHtml +=   '<div style="font-size:0.78rem;font-weight:600;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_mobEsc(lbl)+'</div>';
          immHtml +=   '<div style="font-size:0.68rem;color:#64748B;margin-top:1px;">'+_mobEsc((im.incarico||'')+prz)+'</div>';
          immHtml += '</div>';
          immHtml += '<span style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:'+statoCol+';flex-shrink:0;">'+_mobEsc(im.stato||'Attivo')+'</span>';
          immHtml += '</div>';
        });
        immHtml += '</div>';
      }

            var telClean1 = cl.tel ? String(cl.tel).replace(/[^0-9+]/g,'') : '';
      /* WhatsApp number normalisation */
      var waNum1 = telClean1;
      if(waNum1 && !waNum1.startsWith('+') && waNum1.length<=10) waNum1='39'+waNum1;
      else if(waNum1.startsWith('+')) waNum1=waNum1.slice(1);

      var nameIcons = '';
      if(cl.tel){
        nameIcons = '<span class="mob-name-icons" onclick="event.stopPropagation()">'
          +'<a class="mob-name-ico mob-name-ico-call" href="tel:'+_mobEsc(cl.tel)+'" onclick="mobLogChiamata('+o.idx+')" title="Chiama" aria-label="Chiama">'
          +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>'
          +'</a>'
          +'<a class="mob-name-ico mob-name-ico-wa" href="https://wa.me/'+waNum1+'" target="_blank" rel="noopener" onclick="crmLogAuto('+o.idx+',\'WhatsApp\',\'WA da lista clienti\')" title="WhatsApp" aria-label="WhatsApp">'
          +'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 6.32A7.85 7.85 0 0012.05 4a7.94 7.94 0 00-6.88 11.9L4 20l4.2-1.1a7.93 7.93 0 003.84.98h.01a7.95 7.95 0 007.93-7.94 7.91 7.91 0 00-2.38-5.62zM12.05 18.5a6.6 6.6 0 01-3.36-.92l-.24-.14-2.5.65.67-2.43-.16-.25a6.6 6.6 0 0110.21-8.13 6.55 6.55 0 011.93 4.66 6.6 6.6 0 01-6.55 6.56zm3.62-4.94c-.2-.1-1.18-.58-1.36-.65-.18-.07-.31-.1-.45.1-.13.2-.51.65-.62.78-.12.13-.23.15-.42.05-.2-.1-.85-.3-1.62-.99-.6-.53-1-1.18-1.13-1.38-.12-.2 0-.31.09-.41.09-.09.2-.23.3-.34.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.34-.05-.1-.45-1.08-.62-1.48-.16-.4-.32-.34-.45-.34h-.39c-.13 0-.34.05-.52.25-.18.2-.69.67-.69 1.64 0 .96.7 1.9.8 2.03.1.13 1.39 2.13 3.38 2.99.47.2.84.32 1.13.42.47.15.9.13 1.24.08.38-.06 1.18-.48 1.34-.94.16-.47.16-.87.12-.95-.05-.08-.18-.13-.38-.23z"/></svg>'
          +'</a>'
          +'</span>';
      }
      html += '<div class="mob-card" onclick="mobOpenCliente('+o.idx+')">'
        + '<div class="mob-card-row">'
        +   '<div class="mob-avatar" style="background:'+bg+';">'+_mobEsc(_mobIni(cl.nome))+'</div>'
        +   '<div class="mob-card-body">'
        +     '<div class="mob-card-title" style="display:flex;align-items:center;flex-wrap:wrap;">'+_mobEsc(cl.nome||'(senza nome)')+nameIcons+'</div>'
        +     (sub.length ? '<div class="mob-card-sub">'+_mobEsc(sub.join(' · '))+'</div>' : '')
        +     (cl.tipo ? '<div class="mob-card-tags"><span class="mob-tag" style="background:'+bg+'15;color:'+bg+';">'+(tlbl[cl.tipo]||cl.tipo)+'</span></div>' : '')
        +   '</div>'
        + '</div>'
        + immHtml
        + '</div>';
    });
  }
  c.innerHTML = html;
}
/* ════════════════════════════════════════════════════════════════════════
   SOPRALLUOGO MOBILE — Scheda completa identica al desktop
   Apre un bottom-sheet con tutti i blocchi A-G + selettore cliente.
   IL CLIENTE È OBBLIGATORIO: il salvataggio fallisce se non è selezionato.
   ════════════════════════════════════════════════════════════════════════ */
var _msoprCliIdx = -1;
var _msoprImmIdx = null;

window._msoprAccToggle = function(id){
  var body=document.getElementById('msopr-body-'+id);
  var chev=document.getElementById('msopr-chev-'+id);
  if(!body) return;
  var open=body.classList.toggle('open');
  if(chev) chev.classList.toggle('open', open);
};
window._msoprRadioSel = function(name,val){
  var grp=document.getElementById('msopr-grp-'+name);
  if(!grp) return;
  grp.querySelectorAll('.msopr-radio').forEach(function(el){
    el.classList.toggle('sel', el.dataset.val===val);
  });
};

function mobOpenCliente(idx){
  mobOpenSchedaCliente(idx);
}

/* ── IMMOBILI ────────────────────────────────────────────────────────────── */

function mobOpenSchedaCliente(idx){
  var cl = D.clienti[idx];
  if(!cl) return;
  var body = document.getElementById('mob-sheet-cliente-body');
  document.querySelector('#mob-sheet-cliente .mob-sheet-title').textContent = cl.nome || 'Cliente';

  var tcol = {acquirente:'#2563EB',venditore:'#D97706',entrambi:'#15803D'};
  var tlbl = {acquirente:'Acquirente',venditore:'Venditore',entrambi:'Entrambi'};
  var heroClass = cl.tipo === 'venditore' ? 'gold' : (cl.tipo === 'entrambi' ? 'green' : '');

  /* Visite di questo cliente */
  var visite = (D.visite||[]).map(function(v,i){ return {v:v, i:i}; })
    .filter(function(o){ return parseInt(o.v.cliRef) === idx; })
    .sort(function(a,b){ return (b.v.data||'').localeCompare(a.v.data||''); });

  var html = '';
  html += '<div class="mob-detail-hero '+heroClass+'">';
  html +=   '<div class="mob-detail-hero-tipo">'+(tlbl[cl.tipo]||cl.tipo||'Cliente')+'</div>';
  html +=   '<div class="mob-detail-hero-name">'+_mobEsc(cl.nome||'(senza nome)')+'</div>';
  if(cl.citta) html += '<div class="mob-detail-hero-sub"><svg style="width:12px;height:12px;display:inline;vertical-align:-1px;margin-right:3px;opacity:.8;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>'+_mobEsc(cl.citta)+'</div>';
  html += '</div>';

  /* Azioni rapide */
  html += '<div class="mob-quick-actions">';
  /* CHIAMA — icona grande */
  var telClean0 = cl.tel ? String(cl.tel).replace(/[^0-9+]/g,'') : '';
  html += '<a class="mob-qa is-call mob-qa-big'+(cl.tel?'':' disabled')+'" '+(cl.tel?'href="tel:'+_mobEsc(cl.tel)+'" onclick="mobLogChiamata('+idx+')"':'')+'><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg><span class="mob-qa-lbl">Chiama</span></a>';
  /* WHATSAPP — icona grande */
  html += '<a class="mob-qa is-wa mob-qa-big'+(cl.tel?'':' disabled')+'" '+(cl.tel?'href="https://wa.me/'+telClean0+'" target="_blank" rel="noopener" onclick="crmLogAuto('+idx+',\'WhatsApp\',\'Contattato via WhatsApp da scheda cliente\')"':'')+'><svg viewBox="0 0 24 24" fill="currentColor" style="width:28px;height:28px"><path d="M17.6 6.32A7.85 7.85 0 0012.05 4a7.94 7.94 0 00-6.88 11.9L4 20l4.2-1.1a7.93 7.93 0 003.84.98h.01a7.95 7.95 0 007.93-7.94 7.91 7.91 0 00-2.38-5.62zM12.05 18.5a6.6 6.6 0 01-3.36-.92l-.24-.14-2.5.65.67-2.43-.16-.25a6.6 6.6 0 0110.21-8.13 6.55 6.55 0 011.93 4.66 6.6 6.6 0 01-6.55 6.56zm3.62-4.94c-.2-.1-1.18-.58-1.36-.65-.18-.07-.31-.1-.45.1-.13.2-.51.65-.62.78-.12.13-.23.15-.42.05-.2-.1-.85-.3-1.62-.99-.6-.53-1-1.18-1.13-1.38-.12-.2 0-.31.09-.41.09-.09.2-.23.3-.34.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.34-.05-.1-.45-1.08-.62-1.48-.16-.4-.32-.34-.45-.34h-.39c-.13 0-.34.05-.52.25-.18.2-.69.67-.69 1.64 0 .96.7 1.9.8 2.03.1.13 1.39 2.13 3.38 2.99.47.2.84.32 1.13.42.47.15.9.13 1.24.08.38-.06 1.18-.48 1.34-.94.16-.47.16-.87.12-.95-.05-.08-.18-.13-.38-.23z"/></svg><span class="mob-qa-lbl">WhatsApp</span></a>';
  html += '<a class="mob-qa is-mail'+(cl.email?'':' disabled')+'" '+(cl.email?'href="mailto:'+_mobEsc(cl.email)+'"':'')+'><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><span class="mob-qa-lbl">Email</span></a>';
  html += '<button class="mob-qa is-add" onclick="mobOpenVisitaFromCliente('+idx+')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span class="mob-qa-lbl">Visita</span></button>';
  html += '</div>';

  /* Info contatto */
  html += '<div class="mob-info-section">';
  /* Telefono — senza icone inline ridondanti (già presenti nei quick-actions sopra) */
  html += _mobInfoRow('Telefono', cl.tel);
  html += _mobInfoRow('Email', cl.email);
  html += _mobInfoRow('Città', cl.citta);
  html += _mobInfoRow('Indirizzo', cl.indirizzo);
  if(cl.cf) html += _mobInfoRow('CF', cl.cf, 'mono');
  if(cl.nascita) html += _mobInfoRow('Nato il', cl.nascita);
  html += '</div>';

  /* Note */
  if(cl.note){
    html += '<div class="mob-info-section" style="padding:12px 14px;">';
    html += '<div style="font-size:0.75rem;font-weight:600;color:#64748B;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.4px;">Note</div>';
    html += '<div style="font-size:0.9rem;color:#0F172A;line-height:1.5;white-space:pre-wrap;">'+_mobEsc(cl.note)+'</div>';
    html += '</div>';
  }

  /* Visite di questo cliente */
  html += '<div class="mob-sub-section">';
  html += '<div class="mob-sub-title">Visite ('+visite.length+')'
       +  '<button class="mob-sub-add" onclick="mobOpenVisitaFromCliente('+idx+')">'
       +    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Aggiungi'
       +  '</button>'
       +  '</div>';
  if(!visite.length){
    html += '<div class="mob-empty" style="padding:20px;font-size:0.82rem;">Nessuna visita registrata.</div>';
  } else {
    visite.forEach(function(o){ html += _mobVisChip(o.v, o.i); });
  }
  html += '</div>';

  /* Sezione Richieste rimossa dalla scheda cliente mobile */

  /* ── APPUNTAMENTI del cliente (con bottone Converti) ── */
  var oggi2 = new Date(); oggi2.setHours(0,0,0,0);
  var appuntamenti = (D.eventi||[]).map(function(e,ei){ return {e:e,ei:ei}; }).filter(function(o){
    var e = o.e;
    var tipoEv = (e.tipo||'').toLowerCase();
    var isApp = tipoEv === 'appuntamento' || !!e._extCalId;
    if(!isApp) return false;
    var isConverted = (e.titolo||'').indexOf('[-> Visita]')>=0 || (e.titolo||'').indexOf('[→ Visita]')>=0;
    if(isConverted) return false;
    /* Match per cliente */
    var matchCli = (String(e.cliRef)===String(idx)) ||
      (e.cliente && cl.nome && e.cliente.toLowerCase()===cl.nome.toLowerCase());
    return matchCli;
  }).sort(function(a,b){ return (b.e.data||'').localeCompare(a.e.data||''); });

  if(appuntamenti.length > 0){
    html += '<div class="mob-sub-section">';
    html += '<div class="mob-sub-title" style="color:#2563EB;">Appuntamenti ('+appuntamenti.length+')</div>';
    appuntamenti.forEach(function(o){
      var e = o.e; var ei = o.ei;
      var d = e.data ? new Date(e.data) : null;
      var dateStr = d && !isNaN(d) ? d.getDate()+' '+_MOB_MESI[d.getMonth()] : (e.data||'—');
      var isExt = !!e._extCalId;
      var badge = isExt ? ' <span style="font-size:0.62rem;background:#DBEAFE;color:#1E40AF;padding:1px 5px;border-radius:5px;font-weight:700;">'+_mobEsc(e._extCal||'Cal.')+'</span>' : '';
      html += '<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:10px 12px;margin-bottom:8px;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">'
        +   '<div>'
        +     '<div style="font-size:0.83rem;font-weight:700;color:#1E40AF;">'+_mobEsc(e.titolo||'Appuntamento')+badge+'</div>'
        +     '<div style="font-size:0.76rem;color:#3B82F6;margin-top:2px;">'+dateStr+(e.ora?' · '+_mobEsc(e.ora):'')+'</div>'
        +   '</div>'
        +   '<button onclick="mobApriConversione('+ei+')" style="padding:6px 10px;background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0;border-radius:8px;font-size:0.74rem;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">Converti Visita</button>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
  }

  /* ── STORICO CHIAMATE ── */
  var chiamate = (D.eventi||[]).filter(function(e){
    return e._cliIdx !== undefined ? String(e._cliIdx) === String(idx) : (e.cliente && cl.nome && e.cliente === cl.nome && (e.tipo==='Chiamata' || (e.titolo||'').toLowerCase().indexOf('chiamat')!==-1));
  }).sort(function(a,b){ return (b.data||'').localeCompare(a.data||''); });
  html += '<div class="mob-sub-section">';
  html += '<div class="mob-sub-title">Storico Chiamate ('+chiamate.length+')</div>';
  if(!chiamate.length){
    html += '<div class="mob-empty" style="padding:20px;font-size:0.82rem;">Nessuna chiamata registrata.</div>';
  } else {
    chiamate.forEach(function(e){
      var d = e.data ? new Date(e.data) : null;
      var dateStr = d && !isNaN(d) ? d.getDate()+' '+_MOB_MESI[d.getMonth()]+' '+(d.getFullYear()) : (e.data||'—');
      var oraStr = e.ora ? ' • '+e.ora : '';
      html += '<div class="mob-vis" style="border-left:3px solid #15803D;margin-bottom:6px">'
        + '<div class="mob-vis-date" style="background:#DCFCE7;color:#15803D;min-width:44px">'
        +   '<div class="mob-vis-date-d"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg></div>'
        + '</div>'
        + '<div class="mob-vis-body">'
        +   '<div class="mob-vis-title">'+dateStr+oraStr+'</div>'
        +   (e.note ? '<div class="mob-vis-sub">'+_mobEsc(e.note)+'</div>' : '')
        + '</div>'
        + '</div>';
    });
  }
  html += '</div>';

  body.innerHTML = html;
  mobSheetOpen('mob-sheet-cliente');
}


// --- BRIDGE window ---
Object.assign(window, { mobRenderClienti, mobOpenCliente, mobOpenSchedaCliente });
export { mobRenderClienti, mobOpenCliente, mobOpenSchedaCliente };
