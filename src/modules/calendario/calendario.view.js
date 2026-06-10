// modules/calendario/calendario.view.js — modulo Calendario & Eventi.
// Estratto: helper ICS/export (16576-16750: _calIcs*, _calBuildICS, _calDownloadICS,
// _calGoogleQuickAddUrl, _calOutlookQuickAddUrl) + core (19544-20099: calGoToday,
// calSetView, tooltip, renderCal, calGetEventi, le 4 viste giorno/settimana/mese/anno,
// calClick, renderEvTbody, openEvento, openEventoPre, editEvento, saveEvento, delEvento).
//
// Stato vista calendario (calY/calM/calD/calView) vive DENTRO D → accessibile via Proxy.
//
// FUNZIONI-PONTE che restano nel monolite (cross-dominio): _evtFromEvento,
// _deduplicaEventi, _calAutoSyncAll. (_calNormEvent è interno al modulo) Raggiunte via window.
//
// Dipendenze esterne (monolite via window): openSchedaImmobile, openVisita,
//   renderPratiche, clearModal, openModal, closeModal, saveD, showToast,
//   updateBadges, fmtD, today, dlgAlert, dlgConfirm, _evtFromEvento. (_calNormEvent è interno al modulo)
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function _calIcsPad(n){ return String(n).padStart(2,'0'); }
function _calIcsDateTime(date, allDay){
  /* Ritorna stringa formato YYYYMMDD per all-day o YYYYMMDDTHHMMSS per timed.
     Usa orario LOCALE (no TZID): semplifica massimo, importer riconoscono.    */
  if(allDay){
    return date.getFullYear()+_calIcsPad(date.getMonth()+1)+_calIcsPad(date.getDate());
  }
  return date.getFullYear()+_calIcsPad(date.getMonth()+1)+_calIcsPad(date.getDate())
       + 'T'+_calIcsPad(date.getHours())+_calIcsPad(date.getMinutes())+_calIcsPad(date.getSeconds());
}
function _calIcsEscape(s){
  /* Escape testo per ICS: backslash, virgole, punto e virgola, newline */
  return (s==null?'':String(s)).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
}

/* Costruisce un evento "normalizzato" da diversi tipi sorgente:
   - { titolo, data, ora, durataMin?, note, cliente?, tel?, immobile?, indirizzo? }
   La sorgente può essere D.eventi[i], una visita D.visite[i], o altro. */
function _calNormEvent(src){
  if(!src) return null;
  var titolo = src.titolo || src._titolo || ('Appuntamento'+(src.cliente?' con '+src.cliente:''));
  var dataStr = src.data;
  if(!dataStr) return null;
  var ora = (src.ora||'').trim();
  var durataMin = parseInt(src.durataMin)||60;
  var d = _safeDate(dataStr);
  if(!d) return null;
  var allDay = !ora || !/^\d{1,2}:\d{2}/.test(ora);
  if(!allDay){
    var parts = ora.split(':');
    d.setHours(parseInt(parts[0])||0, parseInt(parts[1])||0, 0, 0);
  }
  var end = new Date(d.getTime() + (allDay ? 86400000 : durataMin*60000));
  /* Descrizione completa con metadati */
  var descrParts = [];
  if(src.cliente) descrParts.push('Cliente: '+src.cliente);
  if(src.tel)     descrParts.push('Tel: '+src.tel);
  if(src.immobile)descrParts.push('Immobile: '+src.immobile);
  if(src.agente)  descrParts.push('Agente: '+src.agente);
  if(src.note)    descrParts.push('Note: '+src.note);
  var descr = descrParts.join('\n');
  return {
    titolo: titolo,
    inizio: d,
    fine: end,
    allDay: allDay,
    descrizione: descr,
    location: src.indirizzo || src.immobile || '',
    uid: (src.uuid || src._uid || ('evt-'+d.getTime()+'-'+Math.random().toString(36).slice(2,8))) + '@lecaseAZ',
    raw: src
  };
}

/* Genera contenuto ICS standard. Include un VALARM 1h prima (sarà il
   calendario di destinazione a farlo scattare, non il nostro app). */
function _calBuildICS(src){
  var ev = _calNormEvent(src);
  if(!ev) return null;
  var now = new Date();
  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LeCase AZ Gestionale//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:'+ev.uid,
    'DTSTAMP:'+_calIcsDateTime(now)+'Z',
    (ev.allDay ? 'DTSTART;VALUE=DATE:' : 'DTSTART:') + _calIcsDateTime(ev.inizio, ev.allDay),
    (ev.allDay ? 'DTEND;VALUE=DATE:'   : 'DTEND:')   + _calIcsDateTime(ev.fine,   ev.allDay),
    'SUMMARY:'+_calIcsEscape(ev.titolo),
    'DESCRIPTION:'+_calIcsEscape(ev.descrizione),
    'LOCATION:'+_calIcsEscape(ev.location)
  ];
  /* Alarm 1h prima (solo per timed events) */
  if(!ev.allDay){
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:'+_calIcsEscape('Promemoria: '+ev.titolo));
    lines.push('TRIGGER:-PT1H');
    lines.push('END:VALARM');
    /* Alarm 1 giorno prima */
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:'+_calIcsEscape('Promemoria: '+ev.titolo+' (domani)'));
    lines.push('TRIGGER:-P1D');
    lines.push('END:VALARM');
  }
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
try{ window._calBuildICS = _calBuildICS; }catch(e){}

/* Scarica il file .ics — apribile da Apple Calendar, Outlook desktop,
   importabile in Google Calendar via "Impostazioni → Importa".          */
function _calDownloadICS(src){
  var content = _calBuildICS(src);
  if(!content){
    if(typeof showToast==='function') showToast('Dati evento non validi per export','','#DC2626');
    return false;
  }
  try{
    var blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var safeName = (src.titolo||'evento').replace(/[^a-zA-Z0-9\-_ ]/g,'').slice(0,40).trim() || 'evento';
    a.download = safeName + '.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    return true;
  }catch(e){
    console.warn('[CalExport] ICS download KO:', e);
    return false;
  }
}
try{ window._calDownloadICS = _calDownloadICS; }catch(e){}

/* Google Calendar quick-add: apre URL con dati precompilati. */
function _calGoogleQuickAddUrl(src){
  var ev = _calNormEvent(src);
  if(!ev) return null;
  /* Google vuole il formato YYYYMMDDTHHMMSSZ (UTC) o YYYYMMDD per all-day.
     Per semplicità usiamo l'orario locale come se fosse UTC (il calendar
     dell'utente lo interpreta nel suo timezone, di solito coincide).      */
  function _g(d){
    return d.getFullYear()
      + _calIcsPad(d.getMonth()+1)
      + _calIcsPad(d.getDate())
      + 'T'
      + _calIcsPad(d.getHours())
      + _calIcsPad(d.getMinutes())
      + '00';
  }
  function _gDate(d){
    return d.getFullYear() + _calIcsPad(d.getMonth()+1) + _calIcsPad(d.getDate());
  }
  var dates = ev.allDay
    ? (_gDate(ev.inizio) + '/' + _gDate(ev.fine))
    : (_g(ev.inizio) + '/' + _g(ev.fine));
  var params = [
    'action=TEMPLATE',
    'text=' + encodeURIComponent(ev.titolo),
    'dates=' + dates,
    'details=' + encodeURIComponent(ev.descrizione||''),
    'location=' + encodeURIComponent(ev.location||'')
  ];
  return 'https://calendar.google.com/calendar/render?' + params.join('&');
}
try{ window._calGoogleQuickAddUrl = _calGoogleQuickAddUrl; }catch(e){}

/* Outlook Web quick-add. Pattern URL ufficiale outlook.live.com.       */
function _calOutlookQuickAddUrl(src){
  var ev = _calNormEvent(src);
  if(!ev) return null;
  /* Outlook vuole ISO 8601: 2026-05-21T15:30:00 */
  function _o(d){
    return d.getFullYear()+'-'+_calIcsPad(d.getMonth()+1)+'-'+_calIcsPad(d.getDate())
      + (ev.allDay ? '' : 'T'+_calIcsPad(d.getHours())+':'+_calIcsPad(d.getMinutes())+':00');
  }
  var params = [
    'path=/calendar/action/compose',
    'rru=addevent',
    'subject=' + encodeURIComponent(ev.titolo),
    'startdt=' + encodeURIComponent(_o(ev.inizio)),
    'enddt='   + encodeURIComponent(_o(ev.fine)),
    'body='    + encodeURIComponent(ev.descrizione||''),
    'location='+ encodeURIComponent(ev.location||'')
  ];
  if(ev.allDay) params.push('allday=true');
  return 'https://outlook.live.com/calendar/0/deeplink/compose?' + params.join('&');
}
try{ window._calOutlookQuickAddUrl = _calOutlookQuickAddUrl; }catch(e){}

function calGoToday(){
  const n=new Date();D.calY=n.getFullYear();D.calM=n.getMonth();D.calD=n.getDate();
  renderCal();
}
function calSetView(v){
  D.calView=v;
  ['giorno','settimana','mese','anno'].forEach(k=>{
    const btn=document.getElementById('calv-'+k);
    if(!btn) return;
    const active=k===v;
    btn.style.background=active?'rgba(255,255,255,.2)':'transparent';
    btn.style.color=active?'white':'rgba(255,255,255,.6)';
  });
  renderCal();
}
// ── CALENDAR TOOLTIP ──
let _ttTimeout=null;
let _ttTimer=null;
function calTooltipShow(e,ds){
  if(_ttTimer){clearTimeout(_ttTimer);_ttTimer=null;}
  const evs=[
    ...D.eventi.filter(ev=>ev.data===ds && !isEvVendutoOrArchiviato(ev)),
    ...D.pratiche.filter(p=>p.scad===ds).map(p=>({tipo:'scadenza',titolo:'⏰ '+(p.venditore||p.descr||'Pratica')})),
    ...D.immobili.filter(im=>im.incFine===ds).map(im=>({tipo:'scadenza',titolo:' Scad. Incarico: '+(im.tipo||'')+(im.comune?' — '+im.comune:'')}))
  ];
  if(!evs.length)return;
  const tt=document.getElementById('cal-tooltip');
  if(!tt)return;
  const ttTitle=document.getElementById('cal-tt-title');
  const ttBody=document.getElementById('cal-tt-body');
  ttTitle.textContent=fmtD(ds)+' — '+evs.length+' event'+(evs.length===1?'o':'i');
  const colors={appuntamento:'#2563EB',visita:'#16A34A',scadenza:'#EF4444',altro:'#7C3AED',incarico:'#F97316'};
  const icons={appuntamento:'',visita:'',scadenza:'⏰',altro:'',incarico:''};
  ttBody.innerHTML=evs.slice(0,8).map(ev=>{
    const col=colors[ev.tipo||'appuntamento']||'#2563EB';
    const icon=icons[ev.tipo||'appuntamento']||'';
    const subParts=[];
    if(ev.ora) subParts.push('⏰ '+ev.ora);
    if(ev.cliente) subParts.push(' '+ev.cliente);
    if(ev.tel) subParts.push(' '+ev.tel);
    return`<div class="cal-tooltip-ev">
      <div class="cal-tooltip-dot" style="background:${col}"></div>
      <div style="flex:1">
        <div class="cal-tooltip-ev-title">${icon} ${ev.titolo||''}</div>
        ${subParts.length?`<div class="cal-tooltip-ev-sub">${subParts.join(' &nbsp;·&nbsp; ')}</div>`:''}
        ${ev.note?`<div class="cal-tooltip-ev-note"> ${ev.note}</div>`:''}
      </div>
    </div>`;
  }).join('')+(evs.length>8?`<div style="font-size:0.75rem;color:#6B7280;margin-top:6px;text-align:center">+${evs.length-8} altri eventi...</div>`:'');
  // Show first (display:block), then position, then fade in
  tt.style.opacity='0';
  tt.style.display='block';
  tt.classList.remove('show');
  // Position after display:block so getBoundingClientRect is accurate
  requestAnimationFrame(()=>{
    const vw=window.innerWidth, vh=window.innerHeight;
    let x=e.clientX+16, y=e.clientY+16;
    tt.style.left=x+'px'; tt.style.top=y+'px';
    // Clamp to viewport
    const r=tt.getBoundingClientRect();
    if(r.right>vw-12) tt.style.left=(e.clientX-r.width-12)+'px';
    if(r.bottom>vh-12) tt.style.top=(e.clientY-r.height-12)+'px';
    // Fade in
    requestAnimationFrame(()=>tt.classList.add('show'));
  });
}
function calTooltipHide(){
  _ttTimer=setTimeout(()=>{
    const tt=document.getElementById('cal-tooltip');
    if(tt){tt.classList.remove('show');tt.style.display='none';}
    _ttTimer=null;
  },80);
}
function renderCal(){
  const mesi=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const og=today();
  const v=D.calView||'mese';
  // Aggiorna pulsanti vista
  ['giorno','settimana','mese','anno'].forEach(k=>{
    const btn=document.getElementById('calv-'+k);
    if(!btn) return;
    const active=k===v;
    btn.style.background=active?'rgba(255,255,255,.2)':'transparent';
    btn.style.color=active?'white':'rgba(255,255,255,.6)';
  });
  if(v==='giorno') calRenderGiorno(og,mesi);
  else if(v==='settimana') calRenderSettimana(og,mesi);
  else if(v==='mese') calRenderMese(og,mesi);
  else if(v==='anno') calRenderAnno(og,mesi);
  renderEvTbody();
}

// ── Colori eventi ─────────────────────────────────────────────────────────────
function calEvColor(tipo){
  return{visita:'#10B981',scadenza:'#EF4444',altro:'#7C3AED',incarico:'#F97316',compleanno:'#F59E0B'}[tipo]||'#3B82F6';
}
function calGetEventi(ds){
  return [
    ...D.eventi.filter(e=>e.data===ds&&!isEvVendutoOrArchiviato(e)),
    ...D.visite.filter(v=>v.data===ds).map((v,i)=>{
      const im = D.immobili[parseInt(v.immRef)];
      const cl = D.clienti[parseInt(v.cliRef)];
      const cliNome = cl ? cl.nome : (v.cliente || 'cliente');
      const immDesc = im ? ((im.tipo||'') + (im.comune?' — '+im.comune:'')) : (v.immobile||'');
      return {
        tipo:'visita',
        titolo:'Visita · ' + cliNome + (immDesc?' — '+immDesc:''),
        ora:v.ora||'',
        cliente:cliNome,
        _type:'visita',
        _visIdx:D.visite.indexOf(v),
        _readOnly:true
      };
    }),
    ...D.pratiche.filter(p=>p.scad===ds&&p.stato!=='revoca'&&p.stato!=='vendita').map(p=>({tipo:'scadenza',titolo:(p.venditore||p.descr||'Pratica'),ora:'',cliente:''})),
    ...D.immobili.filter(im=>im.incFine===ds).map(im=>({tipo:'incarico',titolo:'Scad. '+(im.tipo||'')+(im.comune?' — '+im.comune:''),ora:'',cliente:im.contatto||''}))
  ];
}

// ── VISTA GIORNO ─────────────────────────────────────────────────────────────
function calRenderGiorno(og,mesi){
  if(!D.calD) D.calD=new Date().getDate();
  const ds=`${D.calY}-${String(D.calM+1).padStart(2,'0')}-${String(D.calD).padStart(2,'0')}`;
  const nomeGiorni=['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  const dow=new Date(D.calY,D.calM,D.calD).getDay();
  document.getElementById('cal-title').textContent=`${nomeGiorni[dow]} ${D.calD} ${mesi[D.calM]} ${D.calY}`;
  const sub=document.getElementById('cal-title-sub');
  const evs=calGetEventi(ds);
  if(sub) sub.textContent=ds===og?'Oggi':(evs.length?evs.length+' event'+(evs.length===1?'o':'i'):'Nessun evento');
  // Genera slots orari 07:00-22:00
  const slots=[];for(let h=7;h<=22;h++) slots.push(String(h).padStart(2,'0')+':00');
  const area=document.getElementById('cal-view-area');
  if(!area) return;
  area.innerHTML=`<div style="display:flex;gap:0;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);border:1px solid var(--border)">
    <div style="width:60px;flex-shrink:0;background:#F8FAFC;border-right:1px solid var(--border)">
      <div style="height:40px;border-bottom:1px solid var(--border)"></div>
      ${slots.map(h=>`<div style="height:60px;border-bottom:1px solid #F1F5F9;display:flex;align-items:flex-start;justify-content:center;padding-top:4px;font-size:0.68rem;color:#94A3B8;font-weight:600">${h}</div>`).join('')}
    </div>
    <div style="flex:1;position:relative">
      <div style="height:40px;background:${ds===og?'linear-gradient(135deg,#EFF6FF,#DBEAFE)':'#F8FAFC'};border-bottom:2px solid ${ds===og?'#BFDBFE':'var(--border)'};display:flex;align-items:center;justify-content:space-between;padding:0 16px">
        <span style="font-weight:700;font-size:0.85rem;color:${ds===og?'#1D4ED8':'var(--text)'}">${ds===og?'Oggi — ':''}${D.calD} ${mesi[D.calM]}</span>
        <button onclick="openEventoPre('${ds}')" style="padding:4px 12px;background:#2563EB;color:white;border:none;border-radius:7px;cursor:pointer;font-size:0.75rem;font-weight:700">+ Evento</button>
      </div>
      ${slots.map((h,hi)=>{
        const hEvs=evs.filter(e=>(e.ora||'').startsWith(String(7+hi).padStart(2,'0')));
        return`<div style="height:60px;border-bottom:1px solid #F1F5F9;position:relative;padding:2px 8px" ondblclick="openEventoPre('${ds}')">
          ${hEvs.map(e=>{
          const svgT = e.tipo==='visita'
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;vertical-align:middle"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
            : e.tipo==='scadenza'
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;vertical-align:middle"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
            : e.tipo==='incarico'
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;vertical-align:middle"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>`
            : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;vertical-align:middle"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
          return `<div style="display:flex;align-items:center;gap:4px;background:${calEvColor(e.tipo)}15;border-left:3px solid ${calEvColor(e.tipo)};border-radius:5px;padding:3px 8px;margin-bottom:2px;cursor:pointer;font-size:0.75rem;font-weight:600;color:${calEvColor(e.tipo)};overflow:hidden;max-width:100%;box-sizing:border-box" onclick="calClick('${ds}',true)" title="${e.titolo}">${svgT}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${e.ora?e.ora+' ':''}${e.titolo||''}</span></div>`;
        }).join('')}
        </div>`;
      }).join('')}
    </div>
  </div>`;
  if(!window.calSel||window.calSel!==ds) calClick(ds);
}

// ── Helper: HTML singolo evento nella vista settimana ──────────────────────────
function _calWeekEvHTML(e, ds){
  var color = calEvColor(e.tipo);
  var svgTipo = '';
  if(e.tipo === 'visita'){
    svgTipo = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  } else if(e.tipo === 'scadenza'){
    svgTipo = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  } else if(e.tipo === 'incarico'){
    svgTipo = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>';
  } else {
    svgTipo = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  }
  var label = (e.ora ? e.ora + ' ' : '') + (e.titolo || '');
  var safeTitle = (e.titolo || '').replace(/"/g, '&quot;');
  var divStyle = 'display:flex;align-items:center;gap:2px;background:' + color + '18;border-left:2px solid ' + color + ';border-radius:3px;padding:1px 3px;font-size:0.63rem;font-weight:600;color:' + color + ';overflow:hidden;max-width:100%;box-sizing:border-box;cursor:pointer;margin-bottom:1px';
  return '<div style="' + divStyle + '" onclick="calClick(\'' + ds + '\',true)" title="' + safeTitle + '">' + svgTipo + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">' + label + '</span></div>';
}

// ── VISTA SETTIMANA ───────────────────────────────────────────────────────────
function calRenderSettimana(og,mesi){
  if(!D.calD) D.calD=new Date().getDate();
  const base=new Date(D.calY,D.calM,D.calD);
  let dow=base.getDay();if(dow===0)dow=7;
  const lunedi=new Date(base);lunedi.setDate(base.getDate()-(dow-1));
  const giorni=[];
  for(let i=0;i<7;i++){const d=new Date(lunedi);d.setDate(lunedi.getDate()+i);giorni.push(d);}
  const gNames=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  // Helper: local YYYY-MM-DD (no UTC shift)
  const toDs=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const firstM=giorni[0],lastM=giorni[6];
  const titleStr=firstM.getMonth()===lastM.getMonth()?
    `${firstM.getDate()} — ${lastM.getDate()} ${mesi[firstM.getMonth()]} ${firstM.getFullYear()}`:
    `${firstM.getDate()} ${mesi[firstM.getMonth()]} — ${lastM.getDate()} ${mesi[lastM.getMonth()]} ${firstM.getFullYear()}`;
  document.getElementById('cal-title').textContent=titleStr;
  const sub=document.getElementById('cal-title-sub');
  const totEvSett=giorni.reduce((s,d)=>{const ds=toDs(d);return s+calGetEventi(ds).length;},0);
  if(sub) sub.textContent=totEvSett?totEvSett+' event'+(totEvSett===1?'o':'i')+' questa settimana':'Settimana libera';
  const slots=[];for(let h=7;h<=22;h++) slots.push(String(h).padStart(2,'0')+':00');
  const area=document.getElementById('cal-view-area');
  if(!area) return;
  area.innerHTML=`<div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);border:1px solid var(--border)">
    <div style="display:flex">
      <div style="width:52px;flex-shrink:0;background:#F8FAFC;border-right:1px solid var(--border);border-bottom:1px solid var(--border);height:44px"></div>
      ${giorni.map((d,i)=>{const ds=toDs(d);const isOg=ds===og;const isDom=i===6;return`<div style="flex:1;text-align:center;padding:10px 4px;background:${isOg?'linear-gradient(135deg,#EFF6FF,#DBEAFE)':'#F8FAFC'};border-bottom:2px solid ${isOg?'#BFDBFE':'var(--border)'};border-left:1px solid var(--border);cursor:pointer" onclick="calSetView('giorno');D.calY=${d.getFullYear()};D.calM=${d.getMonth()};D.calD=${d.getDate()};renderCal()">
          <div style="font-size:0.7rem;font-weight:700;color:${isOg?'#1D4ED8':isDom?'#EF4444':'#94A3B8'};text-transform:uppercase;letter-spacing:.5px">${gNames[i]}</div>
          <div style="font-size:1rem;font-weight:${isOg?'900':'700'};color:${isOg?'#1D4ED8':isDom?'#EF4444':'var(--text)'};margin-top:1px">${d.getDate()}</div>
        </div>`;}).join('')}
    </div>
    <div style="display:flex;overflow-y:auto;max-height:520px">
      <div style="width:52px;flex-shrink:0;background:#F8FAFC;border-right:1px solid var(--border)">
        ${slots.map(h=>`<div style="height:56px;border-bottom:1px solid #F1F5F9;display:flex;align-items:flex-start;justify-content:center;padding-top:3px;font-size:0.65rem;color:#94A3B8;font-weight:600">${h}</div>`).join('')}
      </div>
      ${giorni.map((d,gi)=>{const ds=toDs(d);const evs=calGetEventi(ds);const isDom=gi===6;return`<div style="flex:1;min-width:0;overflow:hidden;border-left:1px solid ${gi===0?'transparent':'var(--border)'};background:${isDom?'#FAFAFA':'white'}">
          ${slots.map((h,hi)=>{const hEvs=evs.filter(e=>(e.ora||'').startsWith(String(7+hi).padStart(2,'0')));return`<div style="height:56px;border-bottom:1px solid #F1F5F9;padding:2px 2px;overflow:hidden;box-sizing:border-box" ondblclick="openEventoPre('${ds}')">
            ${hEvs.map(e=>_calWeekEvHTML(e,ds)).join('')}
          </div>`;}).join('')}
        </div>`;}).join('')}
    </div>
  </div>`;
  calClick(og);
}

// ── VISTA MESE ────────────────────────────────────────────────────────────────
function calRenderMese(og,mesi){
  document.getElementById('cal-title').textContent=mesi[D.calM]+' '+D.calY;
  const totEvMese=D.eventi.filter(e=>e.data&&e.data.startsWith(D.calY+'-'+String(D.calM+1).padStart(2,'0'))).length;
  const sub=document.getElementById('cal-title-sub');
  if(sub) sub.textContent=totEvMese?totEvMese+' appuntament'+(totEvMese===1?'o':'i')+' questo mese':'Nessun appuntamento';
  const first=new Date(D.calY,D.calM,1),last=new Date(D.calY,D.calM+1,0);
  let dow=first.getDay();if(dow===0)dow=7;
  // Stile base cella — overflow:hidden impedisce sconfinamento visivo nelle celle adiacenti
  const cellBase='min-height:96px;padding:0;border-right:1px solid #D1D5DB;border-bottom:1px solid #D1D5DB;cursor:pointer;overflow:hidden;position:relative;transition:background .1s;';
  let html=`<div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);border:1px solid #D1D5DB">
    <div style="display:grid;grid-template-columns:repeat(7,1fr);background:#F8FAFC;border-bottom:2px solid #E5E7EB">
      ${['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((d,i)=>`<div style="text-align:center;padding:10px 4px;font-size:0.72rem;font-weight:700;color:${i===6?'#EF4444':'#64748B'};text-transform:uppercase;letter-spacing:.5px">${d}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr)">`;
  // Celle padding (mese precedente)
  for(let i=1;i<dow;i++){
    const d=new Date(D.calY,D.calM,i-dow+1);
    html+=`<div style="${cellBase}background:#F9FAFB;cursor:default">
      <div style="height:3px;background:transparent"></div>
      <div style="padding:5px 7px">
        <div style="font-size:0.78rem;color:#CBD5E1;font-weight:500">${d.getDate()}</div>
      </div>
    </div>`;
  }
  // Celle mese corrente
  for(let day=1;day<=last.getDate();day++){
    const ds=`${D.calY}-${String(D.calM+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const evs=calGetEventi(ds);
    const shown=evs.slice(0,3);const more=evs.length-3;
    const dow2=new Date(D.calY,D.calM,day).getDay();
    const isDom=dow2===0;
    const isOg=ds===og;
    const isSel=window.calSel===ds;
    const accentColor=evs.length>0?calEvColor(evs[0].tipo):null;
    const bg=isOg?'#EFF6FF':isDom?'#FAFAFA':'white';
    const selOutline=isSel?';outline:2px solid #2563EB;outline-offset:-2px':'';
    html+=`<div style="${cellBase}background:${bg}${selOutline}" onclick="calClick('${ds}',true)" ondblclick="openEventoPre('${ds}')" onmouseenter="calTooltipShow(event,'${ds}')" onmouseleave="calTooltipHide()">
      <!-- Striscia colorata in cima: appartiene VISIVAMENTE a questo giorno -->
      <div style="height:3px;background:${accentColor||'transparent'};width:100%"></div>
      <!-- Numero giorno + indicatore contatore eventi -->
      <div style="display:flex;align-items:center;gap:4px;padding:4px 6px 3px">
        <div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:${isOg?'900':'600'};background:${isOg?'#2563EB':'transparent'};color:${isOg?'white':isDom?'#EF4444':'var(--text)'}">${day}</div>
        ${evs.length>0?`<span style="font-size:0.58rem;font-weight:800;color:${accentColor}">${evs.length>1?evs.length+'\u25CF':'\u25CF'}</span>`:''}
      </div>
      <!-- Pillole eventi SOTTO il numero: nessun dubbio sul giorno di appartenenza -->
      <div style="padding:0 5px 4px">
        ${shown.map(e=>`<div style="background:${calEvColor(e.tipo)}18;border-left:2.5px solid ${calEvColor(e.tipo)};border-radius:4px;padding:2px 5px;font-size:0.64rem;font-weight:600;color:${calEvColor(e.tipo)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px">${e.ora?e.ora.slice(0,5)+' ':''} ${e.titolo||''}</div>`).join('')}
        ${more>0?`<div style="font-size:0.61rem;color:#94A3B8;font-weight:700;padding:1px 4px">+${more} altri</div>`:''}
      </div>
    </div>`;
  }
  // Celle padding finali (mese successivo)
  const cells=dow-1+last.getDate();const tot=Math.ceil(cells/7)*7;
  for(let i=1;i<=tot-cells;i++){
    html+=`<div style="${cellBase}background:#F9FAFB;cursor:default">
      <div style="height:3px;background:transparent"></div>
      <div style="padding:5px 7px">
        <div style="font-size:0.78rem;color:#CBD5E1;font-weight:500">${i}</div>
      </div>
    </div>`;
  }
  html+=`</div></div>`;
  const area=document.getElementById('cal-view-area');
  if(area) area.innerHTML=html;
  if(!window.calSel) calClick(og);
  const selDs=window.calSel||og;
  document.querySelectorAll('#cal-view-area [onclick^="calClick"]').forEach(el=>{
    const m=el.getAttribute('onclick').match(/calClick\('(\d{4}-\d{2}-\d{2})'/);
    if(m&&m[1]===selDs) el.style.outline='2px solid #2563EB';
    else el.style.outline='none';
  });
}
// ── VISTA ANNO ────────────────────────────────────────────────────────────────
function calRenderAnno(og,mesi){
  document.getElementById('cal-title').textContent=String(D.calY);
  const totEvAnno=D.eventi.filter(e=>e.data&&e.data.startsWith(String(D.calY))).length;
  const sub=document.getElementById('cal-title-sub');
  if(sub) sub.textContent=totEvAnno?totEvAnno+' event'+(totEvAnno===1?'o':'i')+' in questo anno':'Anno senza eventi';
  let html=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">`;
  for(let m=0;m<12;m++){
    const first=new Date(D.calY,m,1),last=new Date(D.calY,m+1,0);
    let dow=first.getDay();if(dow===0)dow=7;
    const meseMm=String(m+1).padStart(2,'0');
    const totMese=D.eventi.filter(e=>e.data&&e.data.startsWith(D.calY+'-'+meseMm)).length;
    let miniGrid='';
    for(let i=1;i<dow;i++) miniGrid+=`<div></div>`;
    for(let day=1;day<=last.getDate();day++){
      const ds=`${D.calY}-${meseMm}-${String(day).padStart(2,'0')}`;
      const evs=calGetEventi(ds);const isOg=ds===og;
      const dow2=new Date(D.calY,m,day).getDay();const isDom=dow2===0;
      miniGrid+=`<div onclick="calSetView('giorno');D.calM=${m};D.calD=${day};renderCal()" style="width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:${isOg?'900':evs.length?'700':'500'};background:${isOg?'#2563EB':evs.length>0?calEvColor(evs[0].tipo)+'20':'transparent'};color:${isOg?'white':evs.length?calEvColor(evs[0].tipo):isDom?'#F87171':'var(--text)'};cursor:pointer;position:relative;transition:background .1s" onmouseover="this.style.background=this.style.background||'#F1F5F9'" title="${evs.length?evs.length+' eventi':''}">${day}${evs.length>0&&!isOg?`<span style="position:absolute;bottom:2px;right:3px;width:4px;height:4px;border-radius:50%;background:${calEvColor(evs[0].tipo)}"></span>`:''}</div>`;
    }
    html+=`<div style="background:white;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);border:1px solid var(--border);cursor:pointer" onclick="calSetView('mese');D.calM=${m};renderCal()">
      <div style="background:${D.calM===m?'linear-gradient(135deg,#2563EB,#7C3AED)':'linear-gradient(135deg,#F8FAFC,#EFF6FF)'};padding:10px 14px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:800;font-size:0.88rem;color:${D.calM===m?'white':'var(--text)'}">${mesi[m]}</span>
        ${totMese?`<span style="font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:10px;background:${D.calM===m?'rgba(255,255,255,.2)':'#DBEAFE'};color:${D.calM===m?'white':'#2563EB'}">${totMese}</span>`:''}
      </div>
      <div style="padding:8px 10px">
        <div style="display:grid;grid-template-columns:repeat(7,28px);gap:1px;justify-content:center">
          ${['L','M','M','G','V','S','D'].map((d,i)=>`<div style="text-align:center;font-size:0.6rem;font-weight:700;color:${i===6?'#F87171':'#94A3B8'};height:20px;display:flex;align-items:center;justify-content:center">${d}</div>`).join('')}
          ${miniGrid}
        </div>
      </div>
    </div>`;
  }
  html+=`</div>`;
  const area=document.getElementById('cal-view-area');
  if(area) area.innerHTML=html;
}
function calClick(ds, userClick){
  window.calSel=ds;
  // Update day title if element still present (legacy)
  const dayTitle=document.getElementById('cal-day-title');
  if(dayTitle) dayTitle.textContent='Appuntamenti — '+fmtD(ds);
  const evs=D.eventi.filter(e=>e.data===ds && !isEvVendutoOrArchiviato(e));
  // Add incarico scadenze for this day (read-only)
  const incEvs=[];  // Incarichi managed in dedicated section
  const allEvs=[...evs];
  const el=document.getElementById('cal-day-list');
  if(!el){renderEvTbody();return;}
  el.innerHTML=allEvs.length?allEvs.map(ev=>{
    const ri=D.eventi.indexOf(ev);
    const isInc=ev._readOnly===true && ev._type==='incarico';
    const isPratEv=ev._readOnly===true && ev._type==='pratica';
    const dot=isInc?'var(--red-l)':isPratEv?'var(--purple)':'var(--brand-l)';
    const actions=isInc
      ?`<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
          <button class="icon-btn" onclick="openSchedaImmobile(${ev._immIdx})" title="Vai alla scheda immobile"> Scheda</button>
          <span style="font-size:0.65rem;color:var(--text4)">Modifica dalla scheda cliente</span>
        </div>`
      :isPratEv
      ?`<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
          <span style="font-size:0.68rem;color:var(--purple);font-weight:700"> Pratica</span>
          <span style="font-size:0.63rem;color:var(--text4)">Modifica dalla scheda immobile</span>
        </div>`
      :`<div class="actions-col"><button class="icon-btn" onclick="editEvento(${ri})" title="Modifica"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="icon-btn" onclick="delEvento(${ri})" style="color:var(--red-l)" title="Elimina"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button></div>`;
    const evType=isInc?'incarico':isPratEv?'altro':ev.tipo||'appuntamento';
    const evIcons={appuntamento:'',visita:'',scadenza:'⏰',altro:'',incarico:''};
    const evBg={appuntamento:'#2563EB',visita:'#16A34A',scadenza:'#EF4444',altro:'#7C3AED',incarico:'#F97316'};
    return`<div class="cal-ev-row type-${evType}">
      <div class="cal-ev-icon" style="background:${evBg[evType]}22">${evIcons[evType]||''}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:0.9rem;color:#111827">${escH(ev.titolo)}</div>
        <div style="font-size:0.76rem;color:#6B7280;margin-top:2px;display:flex;gap:6px;flex-wrap:wrap">
          ${ev.ora?`<span style="display:flex;align-items:center;gap:3px">⏰ ${escH(ev.ora)}</span>`:''}
          <span style="background:${evBg[evType]+'22'};color:${evBg[evType]};padding:1px 6px;border-radius:4px;font-weight:600;font-size:0.68rem">${evType}</span>
          ${ev.cliente?`<span> ${escH(ev.cliente)}</span>`:''}
        </div>
        ${ev.note?`<div style="font-size:0.75rem;color:#6B7280;margin-top:4px;font-style:italic"> ${escH(ev.note)}</div>`:''}
        ${isInc?`<div style="font-size:0.72rem;color:#9CA3AF;margin-top:4px">${escH(ev.note||'')}</div>`:''}
      </div>
      ${actions}
    </div>`;
  }).join(''):`<div class="empty-state" style="padding:18px"><div class="empty-icon" style="font-size:1.8rem"></div><p style="font-size:0.83rem">Nessun appuntamento — <span style="color:var(--text3);font-size:0.8rem">doppio click sul giorno per aggiungere</span></p></div>`;
  // Apri modale SOLO se giorno vuoto (nessun evento reale)
  // Nuovo appuntamento solo con doppio click (vedi ondblclick sulla cella)
}
function isEvVendutoOrArchiviato(ev){
  // Filter out events linked to sold/archived/revoked properties
  if(ev._immIdx!==undefined){
    const im=D.immobili[ev._immIdx];
    if(!im)return true;
    const st=(im.stato||'').toLowerCase();
    const pratIm=D.pratiche.find(p=>parseInt(p.immRef)===ev._immIdx);
    if(st==='venduto'||st==='affittato'||st==='archiviato'||pratIm?.stato==='revoca')return true;
  }
  if(ev._pratIdx!==undefined){
    const pr=D.pratiche[ev._pratIdx];
    if(pr){
      // Il rogito deve sempre restare visibile nello scadenzario anche se l'immobile è venduto
      if(ev.titolo&&ev.titolo.startsWith(' Rogito'))return false;
      const im=D.immobili[parseInt(pr.immRef)];
      const st=(im?.stato||'').toLowerCase();
      if(st==='venduto'||st==='affittato'||st==='archiviato'||pr.stato==='revoca')return true;
    }
  }
  return false;
}
function renderEvTbody(){
  const og=today();
  const mostraTutti=document.getElementById('ev-mostra-tutti')?.checked||false;
  const statiArchiviatiImm=['venduto','affittato','archiviato'];
  // Eventi normali — escludi passati se checkbox non spuntato (anche eventi esterni)
  const eventiList = [...D.eventi]
    .filter(ev=>!isEvVendutoOrArchiviato(ev)&&(mostraTutti||(ev.data&&ev.data>=og)));
  // Visite trasformate in oggetti compatibili con la tabella
  const visiteList = (D.visite||[])
    .filter(v=>v.data && (mostraTutti || v.data>=og))
    .map(v=>{
      const im = D.immobili[parseInt(v.immRef)];
      const cl = D.clienti[parseInt(v.cliRef)];
      const cliNome = cl ? cl.nome : (v.cliente || '');
      const immDesc = im ? ((im.tipo||'') + (im.comune?' — '+im.comune:'')) : (v.immobile||'');
      return {
        titolo: 'Visita' + (immDesc ? ' · '+immDesc : ''),
        tipo: 'visita',
        data: v.data,
        ora: v.ora || '',
        cliente: cliNome,
        note: v.note || v.feedback || '',
        _type: 'visita',
        _readOnly: true,
        _visIdx: D.visite.indexOf(v)
      };
    });
  const sorted = [...eventiList, ...visiteList]
    .sort((a,b)=>(a.data||'').localeCompare(b.data||'') || (a.ora||'').localeCompare(b.ora||''));
  // FIX RICHIESTA: raggruppa visivamente per giorno. Conta quanti eventi cadono
  // nello stesso giorno per mostrare un'intestazione di gruppo con il totale.
  const _countPerData={};
  sorted.forEach(ev=>{ const d=ev.data||''; _countPerData[d]=(_countPerData[d]||0)+1; });
  let _lastData=null;
  document.getElementById('ev-tbody').innerHTML=sorted.length?sorted.map(ev=>{
    const ri=D.eventi.indexOf(ev);
    const past=ev.data&&ev.data<og;
    const isInc=ev._readOnly===true && ev._type==='incarico';
    const isPratEv=ev._readOnly===true && ev._type==='pratica';
    const isVisita=ev._readOnly===true && ev._type==='visita';
    const isExtCal=!!ev._extCalId;
    const isScadPast=ev.data&&ev.data<og;
    // ── Intestazione di gruppo quando cambia la data ──
    let _groupHeader='';
    if(ev.data!==_lastData){
      _lastData=ev.data;
      const _n=_countPerData[ev.data]||1;
      const _isOggi=ev.data===og;
      const _badge=_n>1
        ? `<span style="font-size:0.66rem;font-weight:700;padding:1px 8px;border-radius:10px;background:#DBEAFE;color:#1D4ED8;margin-left:8px">${_n} appuntamenti</span>`
        : '';
      const _oggiBadge=_isOggi
        ? `<span style="font-size:0.66rem;font-weight:700;padding:1px 8px;border-radius:10px;background:#DCFCE7;color:#15803D;margin-left:8px">oggi</span>`
        : '';
      _groupHeader=`<tr><td colspan="7" style="background:linear-gradient(90deg,#F1F5F9,#F8FAFC);border-top:2px solid #CBD5E1;border-bottom:1px solid #E2E8F0;padding:6px 12px;font-weight:800;font-size:0.78rem;color:#334155">${fmtD(ev.data)}${_oggiBadge}${_badge}</td></tr>`;
    }
    // bordo sinistro per eventi appartenenti a un giorno con più appuntamenti
    const _multiDay=(_countPerData[ev.data]||1)>1;
    const rowStyle=isInc?`background:${isScadPast?'#FEF2F2':'#FFF7ED'};`:isPratEv?`background:${isScadPast?'#F5F3FF':'#FAF5FF'};`:isVisita?`background:${isScadPast?'#F0FDF4':'#ECFDF5'};`:isExtCal?`background:#EFF6FF;border-left:3px solid ${ev._extColor||'#3B82F6'};`:(past?'opacity:0.55;':'');
    const colors={appuntamento:'badge-blue',visita:'badge-green',scadenza:'badge-red',altro:'badge-purple'};
    const dateStyle=isInc&&isScadPast?'color:var(--red-l);font-weight:700;':'';
    // SVG condivisi per le azioni
    const svgModifica = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const svgElimina = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`;
    const svgScheda  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M8 10h.01M16 10h.01M12 14h.01M8 14h.01M16 14h.01"/></svg>`;
    const svgVisita  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const svgPratica = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    const btnStyle   = `display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;border:1.5px solid;cursor:pointer;transition:all .15s;background:transparent;`;
    const actions=isInc
      ?`<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
          <button title="Vai alla scheda immobile" onclick="openSchedaImmobile(${ev._immIdx})"
            style="${btnStyle}color:#1D4ED8;border-color:#BFDBFE;background:#EFF6FF"
            onmouseover="this.style.background='#DBEAFE'" onmouseout="this.style.background='#EFF6FF'">
            ${svgScheda}
          </button>
          <div style="font-size:0.62rem;color:var(--text4);line-height:1.3;text-align:left">Modifica dalla<br>scheda cliente</div>
        </div>`
      :isPratEv
      ?`<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
          <button title="Vai alla pratica" style="${btnStyle}color:#7C3AED;border-color:#DDD6FE;background:#F5F3FF"
            onmouseover="this.style.background='#EDE9FE'" onmouseout="this.style.background='#F5F3FF'">
            ${svgPratica}
          </button>
          <div style="font-size:0.62rem;color:var(--text4);line-height:1.3;text-align:left">Modifica dalla<br>scheda immobile</div>
        </div>`
      :isVisita
      ?`<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
          <button onclick="openVisita(${ev._visIdx})" title="Modifica visita"
            style="${btnStyle}color:#15803D;border-color:#86EFAC;background:#F0FDF4"
            onmouseover="this.style.background='#DCFCE7'" onmouseout="this.style.background='#F0FDF4'">
            ${svgVisita}
          </button>
        </div>`
      :`<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
          <button onclick="editEvento(${ri})" title="Modifica appuntamento"
            style="${btnStyle}color:#1D4ED8;border-color:#BFDBFE;background:#EFF6FF"
            onmouseover="this.style.background='#DBEAFE'" onmouseout="this.style.background='#EFF6FF'">
            ${svgModifica}
          </button>
          <button onclick="delEvento(${ri})" title="Elimina appuntamento"
            style="${btnStyle}color:#DC2626;border-color:#FECACA;background:#FEF2F2"
            onmouseover="this.style.background='#FEE2E2'" onmouseout="this.style.background='#FEF2F2'">
            ${svgElimina}
          </button>
        </div>`;
    // SVG piccolo per indicatore scadenza passata
    const svgScaduta = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-left:4px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    return`${_groupHeader}<tr style="${rowStyle}${_multiDay&&!isExtCal&&!isInc&&!isPratEv&&!isVisita?'border-left:3px solid #93C5FD;':''}">
      <td style="${dateStyle}">${fmtD(ev.data)}${isInc&&isScadPast?svgScaduta:''}</td>
      <td>${ev.ora||'—'}</td>
      <td><span class="badge ${isInc?'badge-red':isPratEv?'badge-purple':isVisita?'badge-green':colors[ev.tipo]||'badge-gray'}">${isInc?'incarico':isPratEv?'pratica':isVisita?'visita':ev.tipo||'—'}</span></td>
      <td style="font-weight:600;${isInc?'color:var(--red-l)':isPratEv?'color:var(--purple)':isVisita?'color:#15803D':isExtCal?'color:'+(ev._extColor||'#1D4ED8'):''}"}>${escH(ev.titolo)}${isExtCal?' <span style="font-size:0.65rem;font-weight:700;padding:1px 7px;border-radius:10px;background:'+(ev._extColor||'#3B82F6')+'22;color:'+(ev._extColor||'#2563EB')+'">'+escH(ev._extCal||'Calendario')+'</span>':''}</td>
      <td>${escH(ev.cliente||'—')}</td>
      <td class="note-cell">${escH(ev.note||'—')}</td>
      <td><div class="actions-col">${actions}</div></td>
    </tr>`;
  }).join(''):`<tr><td colspan="7"><div class="empty-state"><p>Nessun appuntamento registrato</p></div></td></tr>`;
}
function openEvento(){clearModal('modal-evento');document.getElementById('mt-ev').textContent='Nuovo Appuntamento';document.getElementById('ev-data').value=today();openModal('modal-evento');}
function openEventoPre(d){clearModal('modal-evento');document.getElementById('ev-data').value=d;openModal('modal-evento');}
function editEvento(i){clearModal('modal-evento');D.editIdx=i;D.editType='evento';const ev=D.eventi[i];['titolo','tipo','data','ora','cliente','tel','note'].forEach(k=>{const el=document.getElementById('ev-'+k);if(el)el.value=ev[k]||'';});openModal('modal-evento');}
function saveEvento(){const g=id=>document.getElementById(id).value;const ev={titolo:g('ev-titolo'),tipo:g('ev-tipo'),data:g('ev-data'),ora:g('ev-ora'),cliente:g('ev-cliente'),tel:g('ev-tel'),note:g('ev-note')};if(!ev.titolo||!ev.data){dlgAlert('Inserisci titolo e data obbligatori.','','Campi mancanti');return;}if(D.editIdx!==null&&D.editType==='evento'){
  // ── Sync inverso verso la pratica: se sto modificando un evento Rogito proveniente da una pratica,
  //    riporto data e ora aggiornate nella pratica corrispondente.
  const old=D.eventi[D.editIdx];
  if(old && old._type==='pratica' && typeof old._pratIdx==='number' && old.titolo && old.titolo.includes('Rogito')){
    const prat=D.pratiche[old._pratIdx];
    if(prat){
      // Preserva i metadati di collegamento (non modificabili dall'utente nello scadenzario)
      ev._type='pratica'; ev._pratIdx=old._pratIdx; ev._readOnly=old._readOnly;
      // Aggiorna data e ora del rogito nella pratica
      const cambioData=prat.drogito!==ev.data;
      const cambioOra=(prat.oraRogito||'')!==(ev.ora||'');
      prat.drogito=ev.data;
      prat.oraRogito=ev.ora||'';
      if((cambioData||cambioOra) && typeof showToast==='function'){
        showToast(' Pratica aggiornata: data/ora rogito sincronizzata','','#15803D');
      }
    }
  }
  D.eventi[D.editIdx]=ev;
} else D.eventi.push(ev);saveD();closeModal('modal-evento');renderCal();updateBadges();if(typeof renderPratiche==='function')renderPratiche();}
function delEvento(i){
  dlgConfirm('Eliminare questo appuntamento?','','Elimina Appuntamento').then(ok=>{
    if(!ok) return;
    D.eventi.splice(i,1);
    saveD(); renderCal(); updateBadges();
    showToast('Appuntamento eliminato','','#DC2626');
  });
}


// --- BRIDGE window ---
Object.assign(window, {
  _calIcsPad, _calIcsDateTime, _calIcsEscape, _calBuildICS, _calDownloadICS,
  _calGoogleQuickAddUrl, _calOutlookQuickAddUrl,
  calGoToday, calSetView, calTooltipShow, calTooltipHide, renderCal, calEvColor,
  calGetEventi, calRenderGiorno, _calWeekEvHTML, calRenderSettimana, calRenderMese,
  calRenderAnno, calClick, isEvVendutoOrArchiviato, renderEvTbody, openEvento,
  openEventoPre, editEvento, saveEvento, delEvento,
});
export { renderCal, openEvento, saveEvento, delEvento, calSetView, calGetEventi };
