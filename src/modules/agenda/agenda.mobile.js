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
    /* [10 ott 2026] immobile e cliente per uuid (le funzioni sicure del telefono),
       la posizione nella lista solo come ripiego: la posizione scivola */
    var im = (typeof window._mobImmDiVisita === 'function') ? window._mobImmDiVisita(v) : D.immobili[parseInt(v.immRef)];
    var cl = null;
    if(v.cliUuid && Array.isArray(D.clienti)) cl = D.clienti.find(function(z){ return z && z.uuid === v.cliUuid; }) || null;
    if(!cl && !isNaN(parseInt(v.cliRef))) cl = D.clienti[parseInt(v.cliRef)] || null;
    var _nomeVis = (typeof window._mobCliDiVisita === 'function') ? window._mobCliDiVisita(v) : (v.cliente || (cl && cl.nome) || 'Cliente');
    var _indirizzoVis = im ? [im.indirizzo, im.zona].filter(Boolean).join(', ') + (im.comune ? (im.indirizzo||im.zona ? ', di ' : '') + im.comune : '') : '';
    items.push({
      data: d, ora: v.ora||'',
      titolo: _nomeVis, tipoLbl: 'Visita', isVisita: true,
      sub: im ? [im.ref ? 'Ref.' + im.ref : '', im.tipo || 'Immobile', im.comune || ''].filter(Boolean).join(' · ') : '',
      col: '#2563EB', bg: '#EFF6FF',
      isApp: false, isExt: false, extCal: '', agendaKey: null,
      cliente: _nomeVis, tel: (v.tel || (cl && cl.tel) || ''),
      indirizzo: _indirizzoVis,
      /* [26 ago 2026] Serve per il pulsante "Profilo acquirente": si porta
         dietro l'identificativo della visita (non la posizione, che scivola)
         e se il profilo è già stato raccolto, così l'icona può dirlo. */
      visId: v.id || '',
      haProfilo: !!(v.profiloAcq && typeof v.profiloAcq==='object')
    });
  });
  (D.eventi||[]).forEach(function(e, ei){
    if(!e.data) return;
    var d = new Date(e.data);
    if(isNaN(d)) return;
    /* [3 set 2026] Il controllo guardava solo la data d'inizio: un evento
       lungo già cominciato veniva scartato del tutto, così dal secondo
       giorno le ferie sparivano dall'agenda proprio mentre erano in corso.
       Ora un evento resta se comincia nella finestra OPPURE se il suo
       intervallo tocca ancora la finestra. */
    var _spPre = (typeof window._evIntervallo==='function') ? window._evIntervallo(e) : null;
    /* [1 ott 2026] appuntamento che si ripete: le sue volte dentro la finestra */
    var _fmtD = function(x){ return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
    var _occ = (!_spPre && e.ripeti && e.ripeti.f && typeof window._evOccorrenze==='function')
      ? window._evOccorrenze(e, _fmtD(oggi), _fmtD(limite), 120) : null;
    if(_occ){ if(!_occ.length) return; }
    else if(_spPre){
      var _fPre = new Date(_spPre.fine+'T00:00:00');
      if(_fPre < oggi || d > limite) return;
    } else if(d < oggi || d > limite) return;
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
    /* una voce del registro per ogni volta: toccandola, la finestra sa quale giorno è */
    var _regOcc = {};
    if(_occ) _occ.forEach(function(oc){ window._mobAgendaEventi.push({ key: stableKey+'@'+oc, evIdx: ei, ev: e, occ: oc }); _regOcc[oc] = window._mobAgendaEventi.length - 1; });
    var _evImmIdx = Array.isArray(e.immRefs) ? parseInt(e.immRefs[0]) : parseInt(e.immRef);
    var _evIm = !isNaN(_evImmIdx) ? D.immobili[_evImmIdx] : null;
    var _indirizzoEv = _evIm ? [_evIm.indirizzo, _evIm.zona].filter(Boolean).join(', ') + (_evIm.comune ? (_evIm.indirizzo||_evIm.zona ? ', di ' : '') + _evIm.comune : '') : '';
    /* Risolvi tutte le tappe (per gli eventi "Visita Immobile" con più
       immobili abbinati), ognuna con indirizzo e orario propri. */
    var _tappeEv = [];
    if(Array.isArray(e.tappe) && e.tappe.length){
      e.tappe.forEach(function(t){
        var _tIm = D.immobili[parseInt(t.immRef)];
        if(!_tIm) return;
        var _tInd = [_tIm.indirizzo, _tIm.zona].filter(Boolean).join(', ') + (_tIm.comune ? (_tIm.indirizzo||_tIm.zona ? ', di ' : '') + _tIm.comune : '');
        _tappeEv.push({ ora: t.ora||'', label: (_tIm.tipo||'Immobile')+(_tIm.comune?' — '+_tIm.comune:''), indirizzo: _tInd });
      });
    }
    /* [3 set 2026] EVENTI SU PIÙ GIORNI. Prima si creava una sola voce, sul
       giorno d'inizio: le ferie dal 12 al 16 comparivano solo il 12. Ora si
       genera una voce per ogni giorno coperto che cade nella finestra dei 60
       giorni, tutte agganciate allo STESSO record (stesso agendaKey), così
       toccandone una qualsiasi si apre e si modifica l'unico appuntamento.
       La regola su quali giorni sono coperti sta nell'index. */
    var _sp = (typeof window._evIntervallo==='function') ? window._evIntervallo(e) : null;
    var _periodo = (_sp && typeof window._evPeriodoTesto==='function') ? window._evPeriodoTesto(e) : '';
    var _giorni = [];
    if(_occ){
      _occ.forEach(function(oc){ _giorni.push(new Date(oc+'T00:00:00')); });
    } else if(_sp){
      var _cur = new Date(_sp.inizio+'T00:00:00');
      var _fin = new Date(_sp.fine+'T00:00:00');
      var _guardia = 0;
      while(_cur <= _fin && _guardia++ < 370){
        if(_cur >= oggi && _cur <= limite) _giorni.push(new Date(_cur));
        _cur.setDate(_cur.getDate()+1);
      }
    } else {
      _giorni.push(d);
    }
    _giorni.forEach(function(_gd, _gi){
      var _ds = _gd.getFullYear()+'-'+String(_gd.getMonth()+1).padStart(2,'0')+'-'+String(_gd.getDate()).padStart(2,'0');
      var _eti = (_sp && typeof window._evEtichettaGiorno==='function') ? window._evEtichettaGiorno(e,_ds) : '';
      var _primoGiorno = !_sp || _ds === _sp.inizio;
      items.push({
        /* Dal secondo giorno l'ora sparisce: l'orario del primo giorno non
           vale per i successivi, e il pulsante "Trasforma in Visita" resta
           solo sul primo per non generare cinque visite uguali. */
        data: _gd, ora: _primoGiorno ? (e.ora||'') : '', titolo: titolo + _eti,
        tipoLbl: isConverted ? 'Trasformato in visita' : isExt ? (e._extCal || 'Calendario') : (e.tipo ? String(e.tipo).charAt(0).toUpperCase() + String(e.tipo).slice(1) : 'Appuntamento'),
        isVisita: false,
        sub: [e.cliente || '', _evIm ? [_evIm.tipo || 'Immobile', _evIm.comune || ''].filter(Boolean).join(' · ') : ''].filter(Boolean).join(' — '),
        col: col, bg: bg,
        isApp: isApp && _primoGiorno, isExt: isExt,
        isConverted: isConverted,
        extCal: e._extCal||'',
        agendaKey: (_occ && _regOcc[_ds] !== undefined) ? _regOcc[_ds] : regIdx,
        periodo: _periodo,
        modificabile: !isExt,
        cliente: e.cliente||'', tel: e.tel||'',
        indirizzo: _indirizzoEv,
        tappe: _tappeEv
      });
    });
  });

  items.sort(function(a,b){
    var x = a.data - b.data;
    if(x !== 0) return x;
    return (a.ora||'99:99').localeCompare(b.ora||'99:99');
  });

  /* [10 ott 2026] GRAFICA NUOVA, come la Home del telefono: intestazione
     di sezione con pallino e conteggio, un gruppo per giorno, schede con la
     striscia colorata a sinistra (blu visita, ambra appuntamento, verde già
     trasformato, colore del calendario esterno), ora e tipo in alto, nome in
     grassetto, immobile sotto, icona a destra. Il giorno non si ripete più
     dentro ogni scheda (c'è già nell'intestazione) e i titoli vanno a capo
     invece di essere tagliati. Icone SVG al posto delle emoji. Lo stile sta
     qui (mag-css). */
  _magCss();
  var ICO_CASA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  var ICO_FOGLIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>';
  var ICO_SPUNTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  var html = '<div class="mag-wrap"><div class="mh-sh"><div class="mh-sh-title"><span class="dot" style="background:var(--brand,#2563EB)"></span>Prossimi 60 giorni</div>'
    + '<span class="mh-sh-badge">' + items.length + (items.length === 1 ? ' impegno' : ' impegni') + '</span></div>';

  if(!items.length){
    html += '<div class="mh-today-empty"><svg class="mh-today-empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
      + '<div class="mh-today-empty-txt">' + (_mobSearchQ ? 'Nessun impegno trovato.' : 'Nessun impegno nei prossimi 60 giorni.') + '</div></div>';
  } else {
    /* quanti impegni per giorno, per il conteggio nell'intestazione */
    var _perGiorno = {};
    items.forEach(function(it){ var k = it.data.toISOString().slice(0,10); _perGiorno[k] = (_perGiorno[k] || 0) + 1; });
    var lastDay = '';
    items.forEach(function(it){
      var dKey = it.data.toISOString().slice(0,10);
      if(dKey !== lastDay){
        var diffDay = Math.round((it.data - oggi)/86400000);
        var gTxt = _MOB_GIORNI[it.data.getDay()] + ' ' + it.data.getDate() + ' ' + _MOB_MESI[it.data.getMonth()];
        var label = diffDay === 0 ? 'Oggi · ' + gTxt : diffDay === 1 ? 'Domani · ' + gTxt : gTxt;
        var dot = diffDay === 0 ? 'var(--brand,#2563EB)' : diffDay === 1 ? '#D97706' : '#94A3B8';
        html += '<div class="mh-sh mag-giorno' + (diffDay === 0 ? ' oggi' : '') + '"><div class="mh-sh-title"><span class="dot" style="background:' + dot + '"></span>' + _mobEsc(label) + '</div>'
          + '<span class="mh-sh-badge">' + _perGiorno[dKey] + '</span></div>';
        lastDay = dKey;
      }
      /* Pulsante conversione:
         - isApp=true  → evento non ancora convertito → "Trasforma in visita"
         - isExt+isConverted → già convertito → "Già nel Registro Visite"
         - altrimenti → niente (visita interna già marcata nel titolo) */
      var _convBtn = it.isApp
        ? '<button class="mag-conv" onclick="event.stopPropagation();mobApriConversioneByKey('+it.agendaKey+')">' + ICO_CASA + 'Trasforma in visita</button>'
        : (it.isExt && it.isConverted)
          ? '<div class="mag-fatto">' + ICO_SPUNTA + 'Già nel Registro Visite</div>'
          : '';
      /* Pulsanti azione: Chiama/WhatsApp/Promemoria (se c'è un telefono) e
         Maps (se l'appuntamento/visita è collegato a un immobile con indirizzo). */
      var _btnsEv = [];
      var _telClean = String(it.tel||'').replace(/\D/g,'');
      if(_telClean){
        var _telFull = _telClean.length===10 ? '39'+_telClean : _telClean;
        var _dataIt = it.data && !isNaN(it.data) ? it.data.toLocaleDateString('it-IT',{day:'numeric',month:'long'}) : '';
        var _promMsg;
        if(it.tappe && it.tappe.length > 1){
          var _elenco = it.tappe.map(function(t){
            return '- ' + (t.ora?t.ora+' ':'') + t.label + (t.indirizzo?', '+t.indirizzo:'');
          }).join('\n');
          _promMsg = 'Gentile '+(it.cliente||'')+' , Le confermo gli immobili in programma per la visita'
            + (_dataIt?' del '+_dataIt:'') + ':\n' + _elenco + '\n\nA presto!'
            + '\nVincenzo Carnicelli - FRIMM Capital Casa Paestum';
        } else {
          _promMsg = 'Gentile '+(it.cliente||'')+' , Le ricordo l\'appuntamento'
            + (it.indirizzo?' per l\'immobile in '+it.indirizzo:'')
            + (_dataIt?' del '+_dataIt:'') + (it.ora?' alle ore '+it.ora:'') + '. A presto!'
            + '\nVincenzo Carnicelli - FRIMM Capital Casa Paestum';
        }
        _btnsEv.push('<a href="tel:'+_telFull+'" class="mag-btn call" title="Chiama"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></a>');
        _btnsEv.push('<a href="https://wa.me/'+_telFull+'" target="_blank" rel="noopener" class="mag-btn wa" title="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.5 15.3L2 22l4.8-1.4A10 10 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-2.8.8.8-2.7-.2-.3A8 8 0 1112 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5.1a6.5 6.5 0 01-1.9-1.2 7.3 7.3 0 01-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a1 1 0 00-.7.3A2.8 2.8 0 006 8.9c0 1.7 1.2 3.3 1.4 3.5s2.4 3.7 5.8 5.1c2.9 1.1 2.9.8 3.4.7s1.6-.6 1.8-1.3.2-1.2.2-1.3-.2-.2-.4-.3z"/></svg></a>');
        _btnsEv.push('<a href="https://wa.me/'+_telFull+'?text='+encodeURIComponent(_promMsg)+'" target="_blank" rel="noopener" class="mag-btn rem" title="Promemoria"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg></a>');
      }
      /* [26 ago 2026] Profilo acquirente: solo sulle visite vere. Icona piena
         se il profilo c'è già, vuota se manca. */
      if(it.visId){
        _btnsEv.push('<a href="javascript:void(0)" onclick="event.preventDefault();event.stopPropagation();mobApriProfiloVisita(\''+it.visId+'\')" class="mag-btn prof' + (it.haProfilo ? ' on' : '') + '" '
          + 'title="'+(it.haProfilo?'Profilo acquirente raccolto — tocca per rivederlo':'Profilo acquirente non ancora raccolto')+'">'
          + '<svg viewBox="0 0 24 24" fill="'+(it.haProfilo?'currentColor':'none')+'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></a>');
      }
      if(it.indirizzo){
        _btnsEv.push('<a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(it.indirizzo)+'" target="_blank" rel="noopener" class="mag-btn maps" title="Apri in Maps"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></a>');
      }
      var _actionsHtml = _btnsEv.length ? '<div class="mag-azioni" onclick="event.stopPropagation()">'+_btnsEv.join('')+'</div>' : '';
      /* [3 set 2026] La scheda si apre al tocco. Gli eventi dei calendari
         esterni restano non toccabili: la sincronizzazione li riscrive. */
      var _apri = (it.modificabile && it.agendaKey !== null && it.agendaKey !== undefined)
        ? ' onclick="mobApriEventoDaAgenda('+it.agendaKey+')" style="cursor:pointer"' : '';
      var _testa = (it.ora || 'Tutto il giorno') + (it.tipoLbl ? ' · ' + it.tipoLbl : '');
      html += '<div class="mh-ev mag-ev"' + _apri + '>'
        + '<div class="mh-ev-stripe" style="background:' + it.col + '"></div>'
        + '<div class="mh-ev-body">'
        +   '<div class="mh-ev-ora" style="color:' + it.col + '">' + _mobEsc(_testa) + '</div>'
        +   '<div class="mh-ev-titolo mag-tit">' + _mobEsc(it.titolo) + '</div>'
        +   (it.sub ? '<div class="mag-sub">' + _mobEsc(it.sub) + '</div>' : '')
        +   (it.periodo ? '<div class="mag-sub" style="font-weight:600">' + _mobEsc(it.periodo) + '</div>' : '')
        +   _convBtn
        +   _actionsHtml
        + '</div>'
        + '<span class="mh-ev-badge mag-ico">' + (it.isVisita ? ICO_CASA : ICO_FOGLIO) + '</span>'
        + '</div>';
    });
  }
  c.innerHTML = html + '</div>';
}

/* stile dell'agenda (una volta sola): riusa le classi della Home (mh-*) e
   aggiunge pulsanti e sottotitolo. Niente regole per la modalità scura: sul
   telefono lo sfondo resta chiaro (come la Home), e schede scure su fondo
   chiaro rendevano le intestazioni illeggibili. */
function _magCss(){
  if(document.getElementById('mag-css')) return;
  var st = document.createElement('style'); st.id = 'mag-css';
  st.textContent = ''
    + '.mag-wrap{padding:2px 0 16px}'
    + '.mag-wrap .mag-giorno{margin-top:16px}'
    + '.mag-wrap .mag-giorno.oggi .mh-sh-title{color:var(--brand,#2563EB)}'
    + '.mag-ev .mag-tit{white-space:normal;overflow:visible;line-height:1.3;font-weight:700}'
    + '.mag-ev .mag-sub{font-size:0.74rem;color:#64748B;margin-top:2px;line-height:1.35}'
    + '.mag-ev .mag-ico{align-self:flex-start;margin-top:12px}.mag-ev .mag-ico svg{width:22px;height:22px}'
    + '.mag-azioni{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}'
    + '.mag-btn{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:10px;'
    +   'border:1px solid #E2E8F0;background:#fff;text-decoration:none;-webkit-tap-highlight-color:transparent}'
    + '.mag-btn svg{width:15px;height:15px}'
    + '.mag-btn.call{color:#1D4ED8}.mag-btn.wa{color:#15803D}.mag-btn.rem{color:#C2410C}.mag-btn.maps{color:#B91C1C}'
    + '.mag-btn.prof{color:#94A3B8}.mag-btn.prof.on{color:#1D4ED8;border-color:#BFDBFE;background:#EFF6FF}'
    + '.mag-conv{display:inline-flex;align-items:center;gap:6px;margin-top:9px;padding:6px 11px;border-radius:20px;'
    +   'border:1px solid #BBF7D0;background:#F0FDF4;color:#15803D;font-family:inherit;font-size:0.72rem;font-weight:800;cursor:pointer;'
    +   '-webkit-tap-highlight-color:transparent;touch-action:manipulation}'
    + '.mag-conv svg,.mag-fatto svg{width:13px;height:13px}'
    + '.mag-fatto{display:inline-flex;align-items:center;gap:5px;margin-top:9px;padding:4px 10px;border-radius:20px;'
    +   'background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0;font-size:0.68rem;font-weight:800}';

  document.head.appendChild(st);
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
