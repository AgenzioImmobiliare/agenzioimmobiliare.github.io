// modules/planimetrie/planimetrie.view.js — Misura da Planimetria
// ----------------------------------------------------------------------------
// Estratto dal monolite il 16 set 2026 (prima: index.html, blocco principale,
// sezione "PLANIMETRIA: Calibra e Traccia", ~77 KB). Contiene il tool di misura
// (calibrazione, tracciamento stanze, zoom, quote), la valutazione AI, il
// report CMA, le stampe e l'Archivio Planimetrie (D.planimetrieArchivio).
//
// DIPENDENZE (dal monolite, via globali): D, saveD, dlgConfirm, statoImmobileEff,
//   callClaude, aiGetConfig, aiConfigurato, aiSalvaConfig, _currentUser,
//   showToast, escH, openModal, closeModal. Le prime sono gia' chiamate con
//   typeof; le ultime quattro passano dai ripari qui sotto.
//
// NB: in un modulo ES le funzioni NON sono globali. I pulsanti del modale
// (index.html, #modal-planimetria), il menu laterale e gli altri moduli le
// chiamano per nome: per questo in fondo TUTTE vengono messe su window.
// ----------------------------------------------------------------------------

/* ── Ripari verso il monolite ─────────────────────────────────────────────
   Nel codice originale queste quattro erano chiamate per nome nudo senza
   controllo. Da un modulo un nome mancante non da' un errore visibile: da'
   una finestra che non si apre. Qui delegano alla funzione vera e, se non
   c'e', fanno il minimo indispensabile invece di rompersi. */
function showToast(){
  try{ if(typeof window.showToast === 'function') return window.showToast.apply(window, arguments); }catch(e){}
  try{ console.warn('[Planimetrie]', arguments[0]); }catch(e){}
}
function escH(str){
  if(typeof window.escH === 'function') return window.escH(str);
  if(str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function openModal(id){
  if(typeof window.openModal === 'function') return window.openModal(id);
  var el = document.getElementById(id); if(el) el.classList.add('open');
}
function closeModal(id){
  if(typeof window.closeModal === 'function') return window.closeModal(id);
  var el = document.getElementById(id); if(el) el.classList.remove('open');
}

// ===== PLANIMETRIA: Calibra e Traccia =====
var _pln = { pages: [], activeIdx: -1, mode: null, calibPts: [], tracePts: [], zoom: 1 };
/* Coefficienti di ponderazione per il calcolo della superficie commerciale
   (valori di prassi estimativa; l'utente può cambiare il tipo per stanza). */
var _PLN_COEFF = { interno: 1, balcone: 0.30, terrazzo: 0.35, giardino: 0.15, box: 0.50, cantina: 0.25, sottotetto: 0.50 };
var _PLN_TIPI = ['interno','balcone','terrazzo','giardino','box','cantina','sottotetto'];
var _pdfJsLoadPromise = null;

function openPlanimetriaTool(presetImmIdx){
  /* Reset completo dello stato: senza questo, rientrando nel tool si
     ritroverebbe caricato il progetto della sessione precedente. */
  _pln.pages = [];
  _pln.activeIdx = -1;
  _pln.mode = null;
  _pln.calibPts = [];
  _pln.tracePts = [];
  _pln.editDrag = null;
  _pln.zoomAreaStart = null;
  _pln._progettoCaricato = null;
  _pln._ultimoCMA = null;
  _pln.zoom = 1;
  /* Reset UI: mostra empty-state, nascondi workspace */
  var _ws=document.getElementById('pln-workspace'); if(_ws) _ws.style.display='none';
  var _es=document.getElementById('pln-empty-state'); if(_es) _es.style.display='';
  var _tw=document.getElementById('pln-page-tabs-wrap'); if(_tw) _tw.style.display='none';
  var _cs=document.getElementById('pln-calib-status'); if(_cs){ _cs.textContent='Non calibrato'; _cs.style.color='var(--text3)'; }
  if(_pln.snap90===undefined) _pln.snap90 = true;
  var _snb=document.getElementById('pln-snap-btn');
  if(_snb && _pln.snap90){ _snb.style.background='#DBEAFE'; _snb.style.borderColor='#2563EB'; _snb.style.color='#1D4ED8'; }
  var _qb=document.getElementById('pln-quote-btn');
  if(_qb){ if(_pln.showQuote){ _qb.style.background='#DBEAFE'; _qb.style.borderColor='#2563EB'; _qb.style.color='#1D4ED8'; } else { _qb.style.background=''; _qb.style.borderColor=''; _qb.style.color=''; } }
  var _sp=document.getElementById('pln-setup-panel'); if(_sp) _sp.style.display='none';
  var _st=document.getElementById('pln-setup-toggle'); if(_st) _st.innerHTML='⚙ Dettagli progetto ▾';
  var _pn=document.getElementById('pln-prop-nome'); if(_pn) _pn.value='';
  var _pt=document.getElementById('pln-prop-tel'); if(_pt) _pt.value='';
  var _ar=document.getElementById('pln-ai-result'); if(_ar){ _ar.style.display='none'; _ar.innerHTML=''; }
  var sel = document.getElementById('pln-imm-ref');
  var opts = '<option value="">— Nessuno —</option>';
  (D.immobili||[]).forEach(function(im,i){
    /* [8 set 2026] Allineato a statoImmobileEff: prima l'elenco scritto a mano
       lasciava passare i "non attivo" e gli immobili con pratica revocata. */
    var s=(typeof statoImmobileEff==='function') ? statoImmobileEff(im,i) : (im.stato||'').toLowerCase();
    if(s==='venduto'||s==='archiviato'||s==='affittato') return;
    opts += '<option value="'+i+'">'+escH((im.tipo||'Immobile')+(im.ref?' · '+im.ref:'')+(im.comune?' — '+im.comune:''))+'</option>';
  });
  sel.innerHTML = opts;
  if(presetImmIdx!==undefined && presetImmIdx!==null && presetImmIdx!=='') sel.value = String(presetImmIdx);
  openModal('modal-planimetria');
  pln_aggiornaBadgeAI();
}
function pln_aggiornaBadgeAI(){
  var badge=document.getElementById('pln-ai-status-badge');
  if(!badge) return;
  var ok = (typeof aiConfigurato==='function') ? aiConfigurato() : !!(localStorage.getItem('aiProxyUrl')||'').trim();
  if(ok){ badge.textContent='✓ AI attiva'; badge.style.background='#DCFCE7'; badge.style.color='#15803D'; }
  else  { badge.textContent='⚠ AI non configurata'; badge.style.background='#FEE2E2'; badge.style.color='#991B1B'; }
}
function pln_configuraAI(){
  var attuale=(localStorage.getItem('aiProxyUrl')||'').trim();
  var v=prompt('Indirizzo del tuo Cloudflare Worker per l\'AI (lo trovi nella dashboard Cloudflare, es. https://apiagenzio.immobiliare-agropoli.workers.dev).\n\nQuesto va impostato una volta per ogni computer che usi.', attuale);
  if(v===null) return;
  v=v.trim();
  if(v && !/^https:\/\//i.test(v)){ showToast('L\'indirizzo deve iniziare con https://','','#DC2626'); return; }
  if(typeof aiSalvaConfig==='function') aiSalvaConfig(v, (localStorage.getItem('aiProxyAccesso')||''));
  else localStorage.setItem('aiProxyUrl', v);
  pln_aggiornaBadgeAI();
  showToast(v?'AI configurata su questo computer':'Configurazione AI rimossa','','#15803D');
}

/* Riapre un progetto salvato (da cliente/immobile/archivio) nel tool in
   modalità CONSULTAZIONE: ricostruisce _pln.pages dai dati salvati per poter
   usare "Report Valutazione PRO", ristampare o rivedere le misure. Le stanze
   non sono ri-tracciabili (le coordinate grezze non sono salvate), ma i numeri
   e le immagini delle piante sì. */
function pln_apriProgettoSalvato(progetto, intestazione){
  if(!progetto || !Array.isArray(progetto.dettaglio)){ showToast('Progetto non valido o incompleto','','#DC2626'); return; }
  openPlanimetriaTool();
  /* Ricostruisci _pln.pages: ogni piano diventa una "pagina" con rooms
     compatibili con le funzioni di calcolo/valutazione. */
  _pln.pages = progetto.dettaglio.map(function(p){
    var img = null;
    if(p.immagine){
      /* Usa l'immagine salvata (con poligoni già disegnati) come sorgente,
         così redraw e report la mostrano. */
      img = new Image();
      img.onload = function(){
        /* Aggiorna le dimensioni reali e ridisegna la pagina attiva. */
        _pln.pages.forEach(function(pg){ if(pg.source===img){ pg.naturalW=img.naturalWidth||1400; pg.naturalH=img.naturalHeight||1000; } });
        if(_pln.pages[_pln.activeIdx] && _pln.pages[_pln.activeIdx].source===img){ pln_setupCanvas(); pln_redraw(); }
      };
      img.src = p.immagine;
    }
    return {
      name: p.piano || 'Piano',
      source: img,
      naturalW: 1400, naturalH: 1000, /* placeholder: le misure sono già calcolate */
      calib: { p1:null, p2:null, pxPerMeter: 1, readonly:true },
      readonly: true,
      rooms: (p.stanze||[]).map(function(r){
        return {
          nome: r.nome || 'Ambiente',
          tipo: r.tipo || 'interno',
          area_m2: Number(r.mq)||0,
          perimetro_m: Number(r.perimetro)||0,
          points: [] /* non ricostruibili */
        };
      })
    };
  });
  _pln.activeIdx = _pln.pages.length ? 0 : -1;
  _pln._progettoCaricato = { titolo: intestazione || progetto.titolo || '', data: progetto.data, origine: progetto };

  /* Mostra il workspace e nascondi l'empty state */
  var empty=document.getElementById('pln-empty-state'); if(empty) empty.style.display='none';
  var ws=document.getElementById('pln-workspace'); if(ws) ws.style.display='flex';
  pln_renderTabs();
  if(_pln.activeIdx>=0){ pln_setupCanvas(); pln_redraw(); pln_renderRoomList(); pln_updateTotals(); }

  /* Banner di sola consultazione + hint per la valutazione */
  var box=document.getElementById('pln-ai-result');
  if(box){
    box.style.display='';
    box.innerHTML='<div style="font-weight:700;color:#0369A1;font-size:0.88rem;margin-bottom:4px;">📂 Progetto caricato: '+escH(intestazione||progetto.titolo||'')+'</div>'
      + '<div style="font-size:0.84rem;color:#0F172A;">'+Number(progetto.totale).toFixed(1)+' m² calpestabili · '+Number(progetto.commerciale).toFixed(1)+' m² commerciali. '
      + 'Puoi generare il <b>Report Valutazione PRO</b>, ristampare, o modificare <b>nomi e tipi delle stanze</b> nella tabella qui sotto e poi salvare. Il tracciamento non è modificabile (per quello ricarica le planimetrie originali).</div>'
      + '<div style="margin-top:10px;"><button class="btn btn-primary btn-sm" onclick="pln_salvaModificheProgetto()">💾 Salva modifiche a nomi/tipi</button></div>';
  }
  showToast('Progetto caricato. Puoi modificare nomi/tipi stanza, valutare o ristampare.','','#15803D');
}
function pln_salvaModificheProgetto(){
  var pc=_pln._progettoCaricato;
  if(!pc || !pc.origine){ showToast('Nessun progetto salvato da aggiornare','','#D97706'); return; }
  var orig=pc.origine;
  if(!Array.isArray(orig.dettaglio)){ showToast('Struttura progetto non aggiornabile','','#DC2626'); return; }
  /* Riporta nomi/tipi correnti dalle pagine del tool al dettaglio salvato,
     ricalcolando la superficie commerciale (i mq calpestabili restano quelli
     rilevati, non ri-tracciabili qui). */
  _pln.pages.forEach(function(pg, pi){
    var det=orig.dettaglio[pi];
    if(!det || !Array.isArray(det.stanze)) return;
    pg.rooms.forEach(function(room, ri){
      if(det.stanze[ri]){
        det.stanze[ri].nome=room.nome;
        det.stanze[ri].tipo=room.tipo||'interno';
      }
    });
  });
  /* Ricalcola totale commerciale ponderato */
  var comm=0;
  orig.dettaglio.forEach(function(d){ (d.stanze||[]).forEach(function(s){ var c=_PLN_COEFF[s.tipo||'interno']; if(c===undefined)c=1; comm+=(Number(s.mq)||0)*c; }); });
  orig.commerciale=Math.round(comm*100)/100;
  if(typeof saveD==='function') saveD();
  showToast('Modifiche salvate: '+orig.commerciale.toFixed(1)+' m² commerciali','','#15803D');
}

function pln_ensurePdfJs(cb){
  if(window.pdfjsLib){ cb(); return; }
  if(_pdfJsLoadPromise){ _pdfJsLoadPromise.then(cb); return; }
  _pdfJsLoadPromise = new Promise(function(resolve){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = function(){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    s.onerror = function(){ showToast('Impossibile caricare il motore PDF (verifica la connessione)','','#DC2626'); };
    document.head.appendChild(s);
  });
  _pdfJsLoadPromise.then(cb);
}

function pln_handleFiles(fileList){
  Array.from(fileList).forEach(function(file){
    if(file.type === 'application/pdf' || /\.pdf$/i.test(file.name)){
      pln_ensurePdfJs(function(){ pln_loadPdf(file); });
    } else {
      pln_loadImage(file);
    }
  });
  document.getElementById('pln-file-input').value = '';
}
function pln_loadImage(file){
  var reader = new FileReader();
  reader.onload = function(e){
    var img = new Image();
    img.onload = function(){
      pln_addPage(file.name.replace(/\.[^.]+$/,''), img, img.naturalWidth, img.naturalHeight);
    };
    img.onerror = function(){ showToast('Immagine non leggibile: '+file.name,'','#DC2626'); };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function pln_loadPdf(file){
  var reader = new FileReader();
  reader.onload = function(e){
    var typedarray = new Uint8Array(e.target.result);
    window.pdfjsLib.getDocument({data: typedarray}).promise.then(function(pdf){
      return pdf.getPage(1);
    }).then(function(page){
      var baseViewport = page.getViewport({scale:1});
      var targetW = 1400;
      var scale = targetW / baseViewport.width;
      var viewport = page.getViewport({scale: scale});
      var off = document.createElement('canvas');
      off.width = Math.round(viewport.width); off.height = Math.round(viewport.height);
      var ctx = off.getContext('2d');
      page.render({canvasContext: ctx, viewport: viewport}).promise.then(function(){
        pln_addPage(file.name.replace(/\.[^.]+$/,''), off, off.width, off.height);
      });
    }).catch(function(err){
      showToast('Impossibile leggere il PDF: '+(err&&err.message||''),'','#DC2626');
    });
  };
  reader.readAsArrayBuffer(file);
}
function pln_addPage(name, source, naturalW, naturalH){
  _pln.pages.push({ name: name||('Piano '+(_pln.pages.length+1)), source: source, naturalW: naturalW, naturalH: naturalH, calib: null, rooms: [] });
  _pln.activeIdx = _pln.pages.length - 1;
  document.getElementById('pln-empty-state').style.display = 'none';
  document.getElementById('pln-workspace').style.display = '';
  pln_renderTabs();
  pln_switchPage(_pln.activeIdx);
}
function pln_renderTabs(){
  var wrap = document.getElementById('pln-page-tabs');
  var wrapOuter = document.getElementById('pln-page-tabs-wrap');
  if(wrapOuter) wrapOuter.style.display = _pln.pages.length ? '' : 'none';
  wrap.innerHTML = _pln.pages.map(function(p,i){
    var nStanze = (p.rooms||[]).length;
    return '<span class="pln-tab'+(i===_pln.activeIdx?' active':'')+'" onclick="pln_switchPage('+i+')" title="Clicca per aprire questo piano">'
      + '<span class="pln-tab-num">'+(i+1)+'</span>'
      + '<span class="pln-tab-name">'+escH(p.name)+(nStanze?' · '+nStanze+'📐':'')+'</span>'
      + '<span class="pln-tab-edit" onclick="event.stopPropagation();pln_renamePagePrompt('+i+')" title="Rinomina">✎</span>'
      + '<span class="pln-tab-del" onclick="event.stopPropagation();pln_deletePage('+i+')" title="Elimina pagina">✕</span>'
      + '</span>';
  }).join('');
}
function pln_renamePagePrompt(i){
  if(!_pln.pages[i]) return;
  var v = prompt('Nome del piano/pagina:', _pln.pages[i].name||('Piano '+(i+1)));
  if(v===null) return;
  _pln.pages[i].name = v || ('Piano '+(i+1));
  pln_renderTabs();
}
function pln_renamePage(i,val){ if(_pln.pages[i]){ _pln.pages[i].name = val || ('Piano '+(i+1)); pln_renderTabs(); } }
function pln_deletePage(i){
  if(!confirm('Eliminare questa pagina/piano e tutte le stanze tracciate su di essa?')) return;
  _pln.pages.splice(i,1);
  if(_pln.activeIdx >= _pln.pages.length) _pln.activeIdx = _pln.pages.length - 1;
  if(_pln.pages.length === 0){
    document.getElementById('pln-empty-state').style.display = '';
    document.getElementById('pln-workspace').style.display = 'none';
    _pln.activeIdx = -1;
  } else {
    pln_switchPage(_pln.activeIdx);
  }
  pln_renderTabs();
  pln_updateTotals();
}
function pln_switchPage(i){
  _pln.activeIdx = i;
  _pln.mode = null;
  _pln.calibPts = [];
  _pln.tracePts = [];
  pln_renderTabs();
  pln_setupCanvas();
  pln_redraw();
  pln_renderRoomList();
  pln_updateModeHint();
  pln_updateTotals();
  var page = _pln.pages[i];
  var st = document.getElementById('pln-calib-status');
  if(page && page.calib){ st.textContent='Calibrato: 1m ≈ '+page.calib.pxPerMeter.toFixed(1)+'px'; st.style.color='#15803D'; }
  else { st.textContent='Non calibrato'; st.style.color='var(--text3)'; }
}
function pln_setupCanvas(){
  var page = _pln.pages[_pln.activeIdx];
  if(!page) return;
  var canvas = document.getElementById('pln-canvas');
  var baseW = Math.min(1600, (canvas.parentElement.clientWidth || 1600) - 4);
  var maxW = Math.round(baseW * (_pln.zoom||1));
  var ratio = page.naturalH / page.naturalW;
  canvas.width = maxW;
  canvas.height = Math.round(maxW * ratio);
  canvas.style.width = canvas.width+'px';
  canvas.style.height = canvas.height+'px';
}
function pln_zoom(dir){
  var z = _pln.zoom || 1;
  z = dir>0 ? Math.min(3, z+0.25) : Math.max(0.4, z-0.25);
  z = Math.round(z*100)/100;
  _pln.zoom = z;
  var lbl = document.getElementById('pln-zoom-label');
  if(lbl) lbl.textContent = Math.round(z*100)+'%';
  pln_setupCanvas(); pln_redraw();
}
function pln_toggleSetup(){
  var panel = document.getElementById('pln-setup-panel');
  var btn = document.getElementById('pln-setup-toggle');
  if(!panel) return;
  var show = panel.style.display === 'none';
  panel.style.display = show ? '' : 'none';
  if(btn) btn.innerHTML = '⚙ Dettagli progetto ' + (show ? '▴' : '▾');
}
function pln_startZoomArea(){
  var page = _pln.pages[_pln.activeIdx]; if(!page) return;
  _pln.mode = 'zoomarea';
  _pln.calibPts=[]; _pln.tracePts=[];
  _pln.zoomAreaStart = null;
  var hint = document.getElementById('pln-mode-hint');
  if(hint){ hint.style.display=''; hint.textContent='Trascina un rettangolo sull\'area da ingrandire.'; }
  var canvas=document.getElementById('pln-canvas'); if(canvas) canvas.style.cursor='zoom-in';
}
function pln_canvasMouseDown(evt){
  if(_pln.mode==='editpts'){
    var page=_pln.pages[_pln.activeIdx]; if(!page) return;
    var canvas=document.getElementById('pln-canvas'); var s=canvas.width/page.naturalW;
    var pt=pln_getPoint(evt);
    /* trova il vertice più vicino entro ~12px sullo schermo */
    var best=null, bestDist=13/s;
    (page.rooms||[]).forEach(function(room,ri){
      (room.points||[]).forEach(function(p,pi){
        var d=Math.hypot(p.x-pt.x, p.y-pt.y);
        if(d<bestDist){ bestDist=d; best={roomIdx:ri, ptIdx:pi}; }
      });
    });
    _pln.editDrag = best;
    return;
  }
  if(_pln.mode!=='zoomarea') return;
  _pln.zoomAreaStart = pln_getPoint(evt);
  _pln.zoomAreaEnd = null;
}
function pln_canvasMouseMove(evt){
  /* Modalità correggi punti: trascina il vertice selezionato. */
  if(_pln.mode==='editpts'){
    var pageE=_pln.pages[_pln.activeIdx]; if(!pageE) return;
    if(_pln.editDrag){
      var cur=pln_getPoint(evt);
      var room=pageE.rooms[_pln.editDrag.roomIdx];
      if(room && room.points[_pln.editDrag.ptIdx]){
        room.points[_pln.editDrag.ptIdx].x=cur.x;
        room.points[_pln.editDrag.ptIdx].y=cur.y;
        pln_recalcRoom(room, pageE);
        pln_redraw();
        pln_drawEditHandles();
        pln_renderRoomList(); pln_updateTotals();
      }
    }
    return;
  }
  /* Modalità tracciamento: linea guida dall'ultimo punto al cursore. */
  if(_pln.mode==='trace' && _pln.tracePts.length){
    var page0=_pln.pages[_pln.activeIdx]; if(!page0) return;
    var cur=pln_snapPoint(pln_getPoint(evt));
    pln_redraw();
    var canvas0=document.getElementById('pln-canvas'); var ctx0=canvas0.getContext('2d');
    var s0=canvas0.width/page0.naturalW;
    var last=_pln.tracePts[_pln.tracePts.length-1];
    ctx0.save();
    /* linea guida tratteggiata dall'ultimo punto al cursore */
    ctx0.beginPath();
    ctx0.moveTo(last.x*s0, last.y*s0);
    ctx0.lineTo(cur.x*s0, cur.y*s0);
    ctx0.strokeStyle='#16A34A'; ctx0.lineWidth=1.5; ctx0.setLineDash([6,4]); ctx0.stroke();
    /* se ci sono già ≥2 punti, mostra anche la chiusura verso il primo punto */
    if(_pln.tracePts.length>=2){
      var first=_pln.tracePts[0];
      ctx0.beginPath();
      ctx0.moveTo(cur.x*s0, cur.y*s0);
      ctx0.lineTo(first.x*s0, first.y*s0);
      ctx0.strokeStyle='rgba(22,163,74,0.35)'; ctx0.lineWidth=1; ctx0.setLineDash([3,4]); ctx0.stroke();
      /* Se il cursore è vicino al primo punto (≥3 punti), evidenzialo:
         segnala che cliccando lì la forma si chiude. */
      if(_pln.tracePts.length>=3){
        var distClose=Math.hypot((cur.x-first.x)*s0, (cur.y-first.y)*s0);
        if(distClose<=14){
          ctx0.setLineDash([]);
          ctx0.beginPath(); ctx0.arc(first.x*s0, first.y*s0, 9, 0, Math.PI*2);
          ctx0.fillStyle='rgba(22,163,74,0.25)'; ctx0.fill();
          ctx0.strokeStyle='#16A34A'; ctx0.lineWidth=2.5; ctx0.stroke();
        }
      }
    }
    ctx0.setLineDash([]);
    /* pallino sul cursore */
    ctx0.beginPath(); ctx0.arc(cur.x*s0, cur.y*s0, 4, 0, Math.PI*2); ctx0.fillStyle='#16A34A'; ctx0.fill();
    /* etichetta lunghezza in metri del segmento corrente, se calibrato */
    var pageCal=page0.calib;
    if(pageCal && pageCal.pxPerMeter){
      var dPx=Math.hypot(cur.x-last.x, cur.y-last.y);
      var metri=(dPx/pageCal.pxPerMeter);
      var lbl=metri.toFixed(2)+' m';
      var mx=((last.x+cur.x)/2)*s0, my=((last.y+cur.y)/2)*s0;
      ctx0.font='bold 12px Inter,sans-serif';
      var tw=ctx0.measureText(lbl).width;
      ctx0.fillStyle='rgba(255,255,255,0.9)'; ctx0.fillRect(mx-tw/2-4, my-9, tw+8, 18);
      ctx0.fillStyle='#15803D'; ctx0.textAlign='center'; ctx0.textBaseline='middle'; ctx0.fillText(lbl, mx, my);
    }
    ctx0.restore();
    return;
  }
  if(_pln.mode!=='zoomarea' || !_pln.zoomAreaStart) return;
  _pln.zoomAreaEnd = pln_getPoint(evt);
  pln_redraw();
  /* disegna il rettangolo di selezione */
  var canvas=document.getElementById('pln-canvas'); var ctx=canvas.getContext('2d');
  var page=_pln.pages[_pln.activeIdx]; var s=canvas.width/page.naturalW;
  var a=_pln.zoomAreaStart, b=_pln.zoomAreaEnd;
  ctx.save();
  ctx.strokeStyle='#2563EB'; ctx.lineWidth=2; ctx.setLineDash([5,4]);
  ctx.strokeRect(a.x*s, a.y*s, (b.x-a.x)*s, (b.y-a.y)*s);
  ctx.fillStyle='rgba(37,99,235,0.10)';
  ctx.fillRect(a.x*s, a.y*s, (b.x-a.x)*s, (b.y-a.y)*s);
  ctx.restore();
}
function pln_canvasMouseUp(evt){
  if(_pln.mode==='editpts'){ _pln.editDrag=null; return; }
  if(_pln.mode!=='zoomarea' || !_pln.zoomAreaStart) return;
  var end = pln_getPoint(evt);
  var a=_pln.zoomAreaStart, b=end;
  var wNat=Math.abs(b.x-a.x), hNat=Math.abs(b.y-a.y);
  _pln.zoomAreaStart=null; _pln.zoomAreaEnd=null; _pln.mode=null;
  var canvas=document.getElementById('pln-canvas'); if(canvas) canvas.style.cursor='crosshair';
  var hint=document.getElementById('pln-mode-hint'); if(hint) hint.style.display='none';
  if(wNat<20 || hNat<20){ pln_redraw(); return; } /* selezione troppo piccola, ignora */
  var page=_pln.pages[_pln.activeIdx];
  var wrap=canvas.parentElement;
  var availW=(wrap.clientWidth||880)-8;
  var baseW=Math.min(1600, availW);
  /* zoom tale che l'area selezionata riempia la larghezza disponibile */
  var z = availW / (wNat * (baseW/page.naturalW));
  z = Math.max(0.4, Math.min(4, Math.round(z*100)/100));
  _pln.zoom=z;
  var lbl=document.getElementById('pln-zoom-label'); if(lbl) lbl.textContent=Math.round(z*100)+'%';
  pln_setupCanvas(); pln_redraw();
  /* scrolla il contenitore sul centro dell'area selezionata */
  var s2=canvas.width/page.naturalW;
  var cx=((a.x+b.x)/2)*s2, cy=((a.y+b.y)/2)*s2;
  wrap.scrollLeft = cx - wrap.clientWidth/2;
  wrap.scrollTop  = cy - wrap.clientHeight/2;
}
function pln_zoomFit(){
  var page = _pln.pages[_pln.activeIdx]; if(!page) return;
  var canvas = document.getElementById('pln-canvas');
  var wrap = canvas.parentElement;
  if(!wrap) return;
  /* Zoom che fa entrare la planimetria intera nell'area visibile (larghezza e altezza). */
  var availW = (wrap.clientWidth||880) - 8;
  var availH = (wrap.clientHeight||500) - 8;
  var baseW = Math.min(1600, availW);
  var ratio = page.naturalH / page.naturalW;
  /* larghezza a zoom 1 = baseW; altezza corrispondente = baseW*ratio.
     Trova il fattore che rispetta sia availW sia availH. */
  var zByW = availW / baseW;
  var zByH = availH / (baseW * ratio);
  var z = Math.min(zByW, zByH);
  z = Math.max(0.4, Math.min(3, Math.round(z*100)/100));
  _pln.zoom = z;
  var lbl = document.getElementById('pln-zoom-label');
  if(lbl) lbl.textContent = Math.round(z*100)+'%';
  pln_setupCanvas(); pln_redraw();
}
function pln_quickCalibrate(){
  var page = _pln.pages[_pln.activeIdx]; if(!page) return;
  var scala = prompt('Scala del disegno (es. 200 per una planimetria catastale 1:200):','200');
  var sc = parseFloat((scala||'').replace(',','.'));
  if(!sc || sc<=0){ showToast('Calibrazione annullata: scala non valida','','#DC2626'); return; }
  var dpiIn = prompt('Risoluzione con cui è stata caricata la pagina, in DPI.\nLascia 150 se non sai (valore tipico di scansione/PDF).','150');
  var dpi = parseFloat((dpiIn||'').replace(',','.'));
  if(!dpi || dpi<=0){ showToast('Calibrazione annullata: DPI non valido','','#DC2626'); return; }
  /* A scala 1:sc, 1 metro reale = (1/sc) metri sul foglio = (100/sc) cm carta.
     A 'dpi' punti/pollice: 1 pollice = 2.54 cm → px per cm carta = dpi/2.54.
     px per metro reale (nel PNG a risoluzione naturale) = (100/sc) * (dpi/2.54). */
  var pxPerMeterNatural = (100/sc) * (dpi/2.54);
  /* Il PDF è stato rasterizzato a targetW=1400 px di larghezza: riscaliamo il
     rapporto dalla risoluzione DPI teorica a quella effettiva del bitmap. */
  var a4wIn = 210/25.4; // larghezza A4 in pollici
  var expectedNaturalW = a4wIn * dpi;
  var factor = page.naturalW / expectedNaturalW;
  var pxPerMeter = pxPerMeterNatural * factor;
  page.calib = { p1:null, p2:null, realMeters:null, pxPerMeter: pxPerMeter, quick:true };
  var st=document.getElementById('pln-calib-status');
  if(st){ st.textContent = 'Calibrato (scala 1:'+sc+'): 1m ≈ '+pxPerMeter.toFixed(1)+'px'; st.style.color='#15803D'; }
  showToast('Scala impostata da 1:'+sc+'. Verifica tracciando un muro di misura nota.','','#15803D');
  pln_updateModeHint();
}
function pln_redraw(){
  var page = _pln.pages[_pln.activeIdx];
  if(!page) return;
  var canvas = document.getElementById('pln-canvas');
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(page.source && (page.source.complete===undefined || page.source.complete)){
    try{ ctx.drawImage(page.source, 0,0, page.naturalW, page.naturalH, 0,0, canvas.width, canvas.height); }
    catch(_e){ ctx.fillStyle='#F8FAFC'; ctx.fillRect(0,0,canvas.width,canvas.height); }
  } else {
    ctx.fillStyle='#F8FAFC'; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(page.readonly){
      ctx.fillStyle='#94A3B8'; ctx.font='16px Inter,sans-serif'; ctx.textAlign='center';
      ctx.fillText('Anteprima non disponibile — misure caricate in consultazione', canvas.width/2, canvas.height/2);
    }
  }
  var s = canvas.width / page.naturalW;

  (page.rooms||[]).forEach(function(room){
    ctx.beginPath();
    room.points.forEach(function(pt,pi){
      var dx=pt.x*s, dy=pt.y*s;
      if(pi===0) ctx.moveTo(dx,dy); else ctx.lineTo(dx,dy);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(37,99,235,0.18)'; ctx.fill();
    ctx.strokeStyle = '#2563EB'; ctx.lineWidth = 2; ctx.stroke();
    /* Quote sui lati: lunghezza in metri di ogni segmento, se attivo e calibrato. */
    if(_pln.showQuote && page.calib && page.calib.pxPerMeter && room.points.length>=2){
      var ppm=page.calib.pxPerMeter;
      for(var qi=0; qi<room.points.length; qi++){
        var pa=room.points[qi], pb=room.points[(qi+1)%room.points.length];
        var lenM=Math.hypot(pb.x-pa.x, pb.y-pa.y)/ppm;
        if(lenM<0.15) continue; /* salta lati minuscoli */
        var mx=((pa.x+pb.x)/2)*s, my=((pa.y+pb.y)/2)*s;
        /* offset perpendicolare per non sovrapporre l'etichetta al muro */
        var ang=Math.atan2(pb.y-pa.y, pb.x-pa.x);
        var ox=Math.sin(ang)*9, oy=-Math.cos(ang)*9;
        var qLbl=lenM.toFixed(2)+'m';
        ctx.font='600 10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        var qtw=ctx.measureText(qLbl).width;
        ctx.fillStyle='rgba(255,255,255,0.88)'; ctx.fillRect(mx+ox-qtw/2-3, my+oy-7, qtw+6, 14);
        ctx.fillStyle='#1D4ED8'; ctx.fillText(qLbl, mx+ox, my+oy);
      }
    }
    var cx=0,cy=0; room.points.forEach(function(pt){cx+=pt.x;cy+=pt.y;}); cx/=room.points.length; cy/=room.points.length;
    ctx.fillStyle = '#1E293B'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillText(room.nome+' · '+room.area_m2.toFixed(1)+'m²', cx*s, cy*s);
  });

  if(page.calib && page.calib.p1 && page.calib.p2){
    var p1=page.calib.p1, p2=page.calib.p2;
    ctx.beginPath(); ctx.moveTo(p1.x*s,p1.y*s); ctx.lineTo(p2.x*s,p2.y*s);
    ctx.strokeStyle = '#DC2626'; ctx.lineWidth=2; ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]);
  } else if(_pln.mode==='calib' && _pln.calibPts.length===1){
    var p=_pln.calibPts[0];
    ctx.beginPath(); ctx.arc(p.x*s,p.y*s,4,0,Math.PI*2); ctx.fillStyle='#DC2626'; ctx.fill();
  }

  if(_pln.mode==='trace' && _pln.tracePts.length){
    ctx.beginPath();
    _pln.tracePts.forEach(function(pt,pi){
      var dx=pt.x*s, dy=pt.y*s;
      if(pi===0) ctx.moveTo(dx,dy); else ctx.lineTo(dx,dy);
    });
    ctx.strokeStyle = '#16A34A'; ctx.lineWidth=2; ctx.stroke();
    _pln.tracePts.forEach(function(pt){
      ctx.beginPath(); ctx.arc(pt.x*s,pt.y*s,4,0,Math.PI*2); ctx.fillStyle='#16A34A'; ctx.fill();
    });
  }
  if(_pln.mode==='editpts'){ pln_drawEditHandles(); }
}
function pln_getPoint(evt){
  var canvas = document.getElementById('pln-canvas');
  var rect = canvas.getBoundingClientRect();
  var clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  var clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  var page = _pln.pages[_pln.activeIdx];
  var scale = page.naturalW / canvas.width;
  return { x: (clientX-rect.left)*scale, y: (clientY-rect.top)*scale };
}
/* Snap ortogonale: se il segmento dall'ultimo punto al cursore è quasi
   orizzontale o verticale (entro una tolleranza), lo raddrizza a 90°.
   Attivo solo se _pln.snap90 è true e c'è almeno un punto già messo. */
function pln_snapPoint(pt){
  if(!_pln.snap90 || !_pln.tracePts || !_pln.tracePts.length) return pt;
  var last=_pln.tracePts[_pln.tracePts.length-1];
  var dx=pt.x-last.x, dy=pt.y-last.y;
  var adx=Math.abs(dx), ady=Math.abs(dy);
  /* tolleranza: se l'angolo rispetto all'asse è entro ~12°, aggancia */
  var tol=Math.tan(12*Math.PI/180);
  if(adx>ady){
    /* quasi orizzontale */
    if(ady <= adx*tol) return { x: pt.x, y: last.y };
  } else {
    /* quasi verticale */
    if(adx <= ady*tol) return { x: last.x, y: pt.y };
  }
  return pt;
}
function pln_toggleSnap(){
  _pln.snap90 = !_pln.snap90;
  var btn=document.getElementById('pln-snap-btn');
  if(btn){
    btn.style.background=_pln.snap90?'#DBEAFE':'';
    btn.style.borderColor=_pln.snap90?'#2563EB':'';
    btn.style.color=_pln.snap90?'#1D4ED8':'';
  }
  showToast(_pln.snap90?'Snap 90° attivo: i lati si agganciano agli angoli retti':'Snap 90° disattivato','', _pln.snap90?'#15803D':'#64748B');
}
function pln_toggleQuote(){
  _pln.showQuote = !_pln.showQuote;
  var btn=document.getElementById('pln-quote-btn');
  if(btn){
    btn.style.background=_pln.showQuote?'#DBEAFE':'';
    btn.style.borderColor=_pln.showQuote?'#2563EB':'';
    btn.style.color=_pln.showQuote?'#1D4ED8':'';
  }
  pln_redraw();
}
function pln_startCalibrate(){
  if(!_pln.pages[_pln.activeIdx]) return;
  _pln.mode='calib'; _pln.calibPts=[]; _pln.tracePts=[];
  pln_updateModeHint();
}
function pln_startTrace(){
  var page = _pln.pages[_pln.activeIdx]; if(!page) return;
  if(!page.calib){ showToast('Calibra prima la scala di questa pagina','','#D97706'); return; }
  _pln.mode='trace'; _pln.tracePts=[]; _pln.calibPts=[];
  pln_updateModeHint();
}
function pln_updateModeHint(){
  var hint = document.getElementById('pln-mode-hint');
  if(!hint) return;
  if(_pln.mode==='calib'){ hint.style.display=''; hint.textContent='Clicca i due estremi di un tratto di lunghezza nota (es. la barra della scala grafica "10 metri").'; }
  else if(_pln.mode==='trace'){ hint.style.display=''; hint.textContent='Clicca i vertici della stanza in ordine, poi premi "✓ Chiudi stanza" (o doppio click) per confermare.'; }
  else hint.style.display='none';
}
function pln_canvasClick(evt){
  var page = _pln.pages[_pln.activeIdx]; if(!page) return;
  if(_pln.mode==='zoomarea' || _pln.mode==='editpts') return;
  var pt = pln_getPoint(evt);
  if(_pln.mode==='calib'){
    _pln.calibPts.push(pt);
    if(_pln.calibPts.length===2){
      var d = Math.hypot(_pln.calibPts[1].x-_pln.calibPts[0].x, _pln.calibPts[1].y-_pln.calibPts[0].y);
      var metriReali = prompt('Distanza reale in metri tra i due punti selezionati (es. 10 per la barra scala "10 metri"):','10');
      var mr = parseFloat((metriReali||'').replace(',','.'));
      if(!mr || mr<=0){ showToast('Calibrazione annullata: valore non valido','','#DC2626'); _pln.calibPts=[]; _pln.mode=null; pln_redraw(); pln_updateModeHint(); return; }
      page.calib = { p1:_pln.calibPts[0], p2:_pln.calibPts[1], realMeters: mr, pxPerMeter: d/mr };
      _pln.calibPts=[]; _pln.mode=null;
      var st=document.getElementById('pln-calib-status');
      st.textContent = 'Calibrato: 1m ≈ '+page.calib.pxPerMeter.toFixed(1)+'px'; st.style.color='#15803D';
      pln_updateModeHint();
      showToast('Scala calibrata correttamente','','#15803D');
    }
    pln_redraw();
    return;
  }
  if(_pln.mode==='trace'){
    var snapPt = pln_snapPoint(pt);
    /* Chiusura automatica: se ci sono già ≥3 punti e clicco vicino al primo
       (entro ~12px sullo schermo), la forma si chiude da sola. */
    if(_pln.tracePts.length>=3){
      var canvasC=document.getElementById('pln-canvas');
      var sC=canvasC.width/page.naturalW;
      var first=_pln.tracePts[0];
      var distPx=Math.hypot((pt.x-first.x)*sC, (pt.y-first.y)*sC);
      if(distPx<=14){ pln_closeRoom(); return; }
    }
    _pln.tracePts.push(snapPt); pln_redraw(); return;
  }
}
function pln_canvasDblClick(evt){ if(_pln.mode==='trace') pln_closeRoom(); }
function pln_undoPoint(){
  if(_pln.mode==='trace' && _pln.tracePts.length){ _pln.tracePts.pop(); pln_redraw(); }
  else if(_pln.mode==='calib' && _pln.calibPts.length){ _pln.calibPts.pop(); pln_redraw(); }
}
function pln_closeRoom(){
  var page = _pln.pages[_pln.activeIdx]; if(!page) return;
  if(_pln.mode!=='trace' || _pln.tracePts.length < 3){ showToast('Servono almeno 3 punti per chiudere una stanza','','#D97706'); return; }
  var pts = _pln.tracePts;
  var areaPx=0, perimPx=0;
  for(var i=0;i<pts.length;i++){
    var a=pts[i], b=pts[(i+1)%pts.length];
    areaPx += (a.x*b.y - b.x*a.y);
    perimPx += Math.hypot(b.x-a.x, b.y-a.y);
  }
  areaPx = Math.abs(areaPx/2);
  var ppm = page.calib.pxPerMeter;
  var area_m2 = areaPx/(ppm*ppm);
  var perimetro_m = perimPx/ppm;
  var nome = prompt('Nome della stanza:', 'Stanza '+(page.rooms.length+1));
  if(nome===null){ _pln.tracePts=[]; _pln.mode=null; pln_redraw(); pln_updateModeHint(); return; }
  var _nomeL = (nome||'').toLowerCase();
  var _tipo = 'interno';
  if(_nomeL.indexOf('balcon')>=0) _tipo='balcone';
  else if(_nomeL.indexOf('terrazz')>=0) _tipo='terrazzo';
  else if(_nomeL.indexOf('giardin')>=0) _tipo='giardino';
  else if(_nomeL.indexOf('box')>=0||_nomeL.indexOf('garage')>=0||_nomeL.indexOf('posto auto')>=0) _tipo='box';
  else if(_nomeL.indexOf('cantina')>=0||_nomeL.indexOf('deposito')>=0) _tipo='cantina';
  else if(_nomeL.indexOf('sottotetto')>=0||_nomeL.indexOf('mansard')>=0) _tipo='sottotetto';
  page.rooms.push({ nome: nome||('Stanza '+(page.rooms.length+1)), tipo:_tipo, points: pts, area_m2: area_m2, perimetro_m: perimetro_m });
  _pln.tracePts=[]; _pln.mode=null;
  pln_redraw(); pln_updateModeHint(); pln_renderRoomList(); pln_updateTotals();
}
function pln_deleteRoom(pageIdx, roomIdx){
  if(!_pln.pages[pageIdx]) return;
  _pln.pages[pageIdx].rooms.splice(roomIdx,1);
  pln_redraw(); pln_renderRoomList(); pln_updateTotals();
}
function pln_duplicaRoom(pageIdx, roomIdx){
  var page=_pln.pages[pageIdx]; if(!page) return;
  if(page.readonly){ showToast('Progetto in sola consultazione: ricarica le planimetrie per modificare','','#D97706'); return; }
  var orig=page.rooms[roomIdx]; if(!orig) return;
  /* Offset in pixel-immagine ≈ 40px sullo schermo, così la copia è visibile
     e spostabile con "Correggi punti". */
  var canvas=document.getElementById('pln-canvas');
  var s=canvas?canvas.width/page.naturalW:1;
  var off=40/(s||1);
  var copia={
    nome: (orig.nome||'Stanza')+' (copia)',
    tipo: orig.tipo||'interno',
    points: (orig.points||[]).map(function(p){ return { x:p.x+off, y:p.y+off }; }),
    area_m2: orig.area_m2,
    perimetro_m: orig.perimetro_m
  };
  page.rooms.push(copia);
  pln_redraw(); pln_renderRoomList(); pln_updateTotals();
  showToast('Stanza duplicata: usa "Correggi punti" per riposizionarla','','#15803D');
}
function pln_startEditPoints(){
  var page=_pln.pages[_pln.activeIdx]; if(!page) return;
  if(page.readonly){ showToast('Progetto in sola consultazione: ricarica le planimetrie per modificare','','#D97706'); return; }
  if(!page.rooms || !page.rooms.length){ showToast('Non ci sono stanze da correggere su questa pagina','','#D97706'); return; }
  _pln.mode = _pln.mode==='editpts' ? null : 'editpts';
  _pln.editDrag = null;
  _pln.calibPts=[]; _pln.tracePts=[];
  var btn=document.getElementById('pln-editpts-btn');
  if(btn){ btn.style.background=_pln.mode==='editpts'?'#DBEAFE':''; btn.style.borderColor=_pln.mode==='editpts'?'#2563EB':''; }
  var hint=document.getElementById('pln-mode-hint');
  if(hint){
    if(_pln.mode==='editpts'){ hint.style.display=''; hint.textContent='Trascina i pallini blu per correggere i vertici. Ripremi "Correggi punti" per uscire.'; }
    else hint.style.display='none';
  }
  pln_redraw();
}
function pln_recalcRoom(room, page){
  var pts=room.points; if(!pts||pts.length<3) return;
  var areaPx=0, perimPx=0;
  for(var i=0;i<pts.length;i++){
    var a=pts[i], b=pts[(i+1)%pts.length];
    areaPx += (a.x*b.y - b.x*a.y);
    perimPx += Math.hypot(b.x-a.x, b.y-a.y);
  }
  areaPx=Math.abs(areaPx/2);
  var ppm=page.calib&&page.calib.pxPerMeter?page.calib.pxPerMeter:1;
  room.area_m2=areaPx/(ppm*ppm);
  room.perimetro_m=perimPx/ppm;
}
function pln_drawEditHandles(){
  var page=_pln.pages[_pln.activeIdx]; if(!page) return;
  var canvas=document.getElementById('pln-canvas'); if(!canvas) return;
  var ctx=canvas.getContext('2d'); var s=canvas.width/page.naturalW;
  (page.rooms||[]).forEach(function(room){
    (room.points||[]).forEach(function(p){
      ctx.beginPath(); ctx.arc(p.x*s, p.y*s, 6, 0, Math.PI*2);
      ctx.fillStyle='#fff'; ctx.fill();
      ctx.strokeStyle='#2563EB'; ctx.lineWidth=2.5; ctx.stroke();
    });
  });
}
function pln_renameRoom(pageIdx, roomIdx, val){
  if(_pln.pages[pageIdx] && _pln.pages[pageIdx].rooms[roomIdx]){
    _pln.pages[pageIdx].rooms[roomIdx].nome = val || ('Stanza '+(roomIdx+1));
    pln_redraw();
  }
}
function pln_setRoomType(pageIdx, roomIdx, val){
  if(_pln.pages[pageIdx] && _pln.pages[pageIdx].rooms[roomIdx]){
    _pln.pages[pageIdx].rooms[roomIdx].tipo = val;
    pln_updateTotals();
  }
}
function pln_renderRoomList(){
  var page = _pln.pages[_pln.activeIdx];
  var tbody = document.getElementById('pln-room-list');
  if(!page || !page.rooms.length){ tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text3);padding:10px 6px;">Nessuna stanza tracciata su questa pagina</td></tr>'; return; }
  tbody.innerHTML = page.rooms.map(function(r,i){
    var tipoOpts = _PLN_TIPI.map(function(t){
      return '<option value="'+t+'"'+((r.tipo||'interno')===t?' selected':'')+'>'+t.charAt(0).toUpperCase()+t.slice(1)+(_PLN_COEFF[t]<1?' ('+Math.round(_PLN_COEFF[t]*100)+'%)':'')+'</option>';
    }).join('');
    return '<tr>'
      + '<td><input class="pln-room-name" value="'+escH(r.nome)+'" onchange="pln_renameRoom('+_pln.activeIdx+','+i+',this.value)"></td>'
      + '<td><select class="fselect" style="padding:3px 6px;font-size:0.78rem;" onchange="pln_setRoomType('+_pln.activeIdx+','+i+',this.value)">'+tipoOpts+'</select></td>'
      + '<td>'+r.area_m2.toFixed(2)+' m²</td>'
      + '<td>'+r.perimetro_m.toFixed(2)+' m</td>'
      + '<td><button class="icon-btn" onclick="pln_duplicaRoom('+_pln.activeIdx+','+i+')" title="Duplica stanza" style="margin-right:4px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>'
      + '<button class="icon-btn" onclick="pln_deleteRoom('+_pln.activeIdx+','+i+')" style="color:var(--red-l)" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button></td>'
      + '</tr>';
  }).join('');
}
function pln_updateTotals(){
  var page = _pln.pages[_pln.activeIdx];
  var pageTotal = page ? page.rooms.reduce(function(s,r){return s+r.area_m2;},0) : 0;
  document.getElementById('pln-page-total').textContent = pageTotal.toFixed(2)+' m²';
  var grand = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){return ss+r.area_m2;},0); },0);
  document.getElementById('pln-grand-total').textContent = grand.toFixed(2)+' m²';
  var comm = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){ var c=_PLN_COEFF[r.tipo||'interno']; if(c===undefined)c=1; return ss+r.area_m2*c; },0); },0);
  var commEl = document.getElementById('pln-comm-total');
  if(commEl) commEl.textContent = comm.toFixed(2)+' m²';
  /* Somme per destinazione d'uso, sull'intero progetto. */
  var _DEST = { interno:'interni', balcone:'esterni', terrazzo:'esterni', giardino:'esterni', box:'accessori', cantina:'accessori', sottotetto:'accessori' };
  var dest = { interni:0, esterni:0, accessori:0 };
  _pln.pages.forEach(function(p){ p.rooms.forEach(function(r){ var d=_DEST[r.tipo||'interno']||'interni'; dest[d]+=r.area_m2; }); });
  var destEl = document.getElementById('pln-dest-totals');
  if(destEl){
    var parts=[];
    if(dest.interni>0)   parts.push('<span style="color:#1E293B;"><b>Interni:</b> '+dest.interni.toFixed(1)+' m²</span>');
    if(dest.esterni>0)   parts.push('<span style="color:#0369A1;"><b>Esterni:</b> '+dest.esterni.toFixed(1)+' m²</span>');
    if(dest.accessori>0) parts.push('<span style="color:#854D0E;"><b>Accessori:</b> '+dest.accessori.toFixed(1)+' m²</span>');
    destEl.innerHTML = parts.length ? parts.join('<span style="color:#CBD5E1;margin:0 4px;">·</span>') : '';
    destEl.style.display = parts.length ? '' : 'none';
  }
}
function pln_saveToImmobile(){
  /* Unificato con pln_archiviaGestionale: qualunque pulsante di salvataggio
     porta allo stesso comportamento robusto (immobile → cliente → archivio),
     sempre con storico completo. Evita il vecchio bug in cui questo pulsante
     si limitava a chiedere un immobile e non salvava nulla altrove. */
  return pln_archiviaGestionale();
}
function pln_valutazioneAI(){
  var totale = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){return ss+r.area_m2;},0); },0);
  if(totale<=0){ showToast('Traccia almeno una stanza prima di chiedere la valutazione','','#D97706'); return; }
  var commerciale = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){ var c=_PLN_COEFF[r.tipo||'interno']; if(c===undefined)c=1; return ss+r.area_m2*c; },0); },0);
  if(typeof callClaude!=='function'){ showToast('Funzione AI non configurata (imposta il Worker in Impostazioni AI)','','#DC2626'); return; }

  var immIdx = document.getElementById('pln-imm-ref').value;
  var im = immIdx!=='' ? D.immobili[parseInt(immIdx)] : null;

  /* Riepilogo stanze per piano da passare al modello */
  var dettTxt = _pln.pages.map(function(p){
    var righe = p.rooms.map(function(r){ return '  - '+r.nome+' ('+(r.tipo||'interno')+'): '+r.area_m2.toFixed(1)+' m²'; }).join('\n');
    return 'PIANO "'+p.name+'":\n'+righe;
  }).join('\n');

  var datiImm = im
    ? ('Tipologia: '+(im.tipo||'n.d.')+'\nComune: '+(im.comune||'n.d.')+'\nIndirizzo: '+(im.indirizzo||'n.d.')
       +'\nStato/condizioni: '+(im.stato||'n.d.')+(im.prezzoRich?'\nPrezzo attualmente richiesto: € '+parseFloat(im.prezzoRich).toLocaleString('it-IT'):''))
    : 'Nessun immobile collegato: valuta genericamente per la zona del Cilento (provincia di Salerno).';

  var prompt = 'Sei un esperto valutatore immobiliare che opera nel Cilento (Agropoli e comuni limitrofi, provincia di Salerno). '
    + 'Devi fornire una STIMA ORIENTATIVA di valore, NON una perizia. '
    + 'Basati sui dati forniti e sulla tua conoscenza generale del mercato dell\'area; '
    + 'sii esplicito sul fatto che i valori €/m² locali reali (es. banca dati OMI) vanno verificati dall\'agente.\n\n'
    + 'DATI IMMOBILE:\n'+datiImm+'\n\n'
    + 'SUPERFICI MISURATE DA PLANIMETRIA:\n'+dettTxt+'\n'
    + 'Totale calpestabile: '+totale.toFixed(1)+' m²\n'
    + 'Superficie commerciale (ponderata): '+commerciale.toFixed(1)+' m²\n\n'
    + 'Rispondi in italiano, in modo conciso e professionale, con questa struttura:\n'
    + '1) Range di valore stimato (minimo–massimo in €), con il €/m² implicito usato\n'
    + '2) 2-3 fattori che alzano il valore e 2-3 che lo abbassano, specifici per questo immobile\n'
    + '3) Una riga di caveat sul fatto che è una stima da validare con i dati OMI locali e un sopralluogo\n'
    + 'Non usare tabelle. Massimo 200 parole.';

  var box = document.getElementById('pln-ai-result');
  var btn = document.getElementById('pln-ai-btn');
  if(box){ box.style.display=''; box.innerHTML='<div style="color:#0369A1;font-weight:600;font-size:0.85rem;">✨ Sto elaborando la stima orientativa…</div>'; }
  if(btn){ btn.disabled=true; btn.style.opacity='0.6'; }

  var payload = {
    model:(typeof aiGetConfig==='function'&&aiGetConfig().model)||'claude-sonnet-4-6',
    max_tokens:700,
    messages:[{role:'user',content:prompt}]
  };
  callClaude(payload).then(function(data){
    var txt=''; try{ txt=(data.content||[]).map(function(b){return b.text||'';}).join('').trim(); }catch(_e){}
    if(!txt){ if(box) box.innerHTML='<div style="color:#DC2626;font-size:0.85rem;">Nessuna risposta dall\'AI. Riprova.</div>'; if(btn){btn.disabled=false;btn.style.opacity='1';} return; }
    var htmlTxt = escH(txt).replace(/\n/g,'<br>');
    if(box){
      box.innerHTML = '<div style="font-weight:800;color:#0369A1;font-size:0.9rem;margin-bottom:8px;">✨ Stima orientativa AI</div>'
        + '<div style="font-size:0.86rem;line-height:1.5;color:#0F172A;">'+htmlTxt+'</div>'
        + '<div style="margin-top:10px;font-size:0.72rem;color:#64748B;font-style:italic;">Stima generata dall\'AI su base statistica: NON è una perizia. Verifica sempre con i valori OMI locali e la tua conoscenza del mercato prima di comunicarla al cliente.</div>';
    }
    if(btn){btn.disabled=false;btn.style.opacity='1';}
  }).catch(function(err){
    if(box) box.innerHTML='<div style="color:#DC2626;font-size:0.85rem;">Errore AI: '+escH(err&&err.message?err.message:'riprova')+'</div>';
    if(btn){btn.disabled=false;btn.style.opacity='1';}
  });
}
/* ── REPORT VALUTAZIONE PROFESSIONALE (CMA) ────────────────────────────────
   L'utente inserisce comparabili REALI (da OMI/portali/sua conoscenza);
   l'AI redige l'analisi professionale su quei dati veri, non inventati. */
function pln_reportValutazionePRO(){
  var totale = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){return ss+r.area_m2;},0); },0);
  if(totale<=0){ showToast('Traccia almeno una stanza prima di generare il report','','#D97706'); return; }
  if(typeof callClaude!=='function' || (typeof aiConfigurato==='function' && !aiConfigurato())){
    showToast('Configura prima il Worker in Impostazioni AI','','#DC2626'); return;
  }
  var immIdx = document.getElementById('pln-imm-ref').value;
  var im = immIdx!=='' ? D.immobili[parseInt(immIdx)] : null;

  /* Form comparabili + parametri, in un overlay dedicato */
  var ov = document.getElementById('modal-cma-form');
  if(!ov){ ov=document.createElement('div'); ov.id='modal-cma-form'; ov.className='overlay'; document.body.appendChild(ov); }
  var rigaComp = function(n){
    return '<div style="display:flex;gap:6px;margin-bottom:6px;">'
      + '<input class="finput cma-c-desc" placeholder="Comparabile '+n+' (es. Trilocale via X)" style="flex:2;">'
      + '<input class="finput cma-c-mq" type="number" placeholder="m²" style="flex:0 0 70px;">'
      + '<input class="finput cma-c-prezzo" type="number" placeholder="€ prezzo" style="flex:0 0 110px;">'
      + '</div>';
  };
  ov.innerHTML = '<div class="modal modal-xl" style="max-width:640px;">'
    + '<div class="mhead"><h2>✨ Report Valutazione — dati di mercato</h2><button class="mclose" onclick="closeModal(\'modal-cma-form\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
    + '<div class="mbody">'
    +   '<div style="background:#FEFCE8;border:1px solid #FDE68A;border-radius:8px;padding:10px 12px;font-size:0.82rem;color:#854D0E;margin-bottom:14px;">Inserisci <b>dati reali</b> di 2-3 immobili simili venduti o in vendita nella zona (da OMI, portali o tua conoscenza). L\'AI userà <b>questi numeri veri</b> per redigere l\'analisi — non inventa quotazioni.</div>'
    +   '<div class="frow fcol"><label class="flabel">Zona di riferimento</label><input class="finput" id="cma-zona" value="'+escH(im?(im.comune||''):'')+'" placeholder="Es. Agropoli centro, Marina, Cilento"></div>'
    +   '<div class="frow fcol" style="margin-top:8px;"><label class="flabel">Stato dell\'immobile</label><input class="finput" id="cma-stato" value="'+escH(im?(im.stato||''):'')+'" placeholder="Es. buono / da ristrutturare / nuovo"></div>'
    +   '<div class="frow fcol" style="margin-top:8px;"><label class="flabel">Note su pregi/difetti (vista, piano, box, terrazzo…)</label><input class="finput" id="cma-note" placeholder="Es. ultimo piano, vista mare, box auto"></div>'
    +   '<label class="flabel" style="margin-top:14px;display:block;">Comparabili di zona (dati reali)</label>'
    +   '<div id="cma-comp-rows">'+rigaComp(1)+rigaComp(2)+rigaComp(3)+'</div>'
    + '</div>'
    + '<div class="mfoot"><button class="btn btn-outline" onclick="closeModal(\'modal-cma-form\')">Annulla</button><button class="btn btn-primary" onclick="pln_generaCMA()">✨ Genera report</button></div>'
    + '</div>';
  openModal('modal-cma-form');
}
function pln_generaCMA(){
  var totale = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){return ss+r.area_m2;},0); },0);
  var commerciale = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){ var c=_PLN_COEFF[r.tipo||'interno']; if(c===undefined)c=1; return ss+r.area_m2*c; },0); },0);
  totale=Math.round(totale*100)/100; commerciale=Math.round(commerciale*100)/100;
  var immIdx=document.getElementById('pln-imm-ref').value;
  var im=immIdx!==''?D.immobili[parseInt(immIdx)]:null;

  var zona=(document.getElementById('cma-zona').value||'').trim();
  var stato=(document.getElementById('cma-stato').value||'').trim();
  var noteC=(document.getElementById('cma-note').value||'').trim();
  var comps=[];
  document.querySelectorAll('#cma-comp-rows > div').forEach(function(row){
    var d=(row.querySelector('.cma-c-desc')||{}).value||'';
    var mq=parseFloat((row.querySelector('.cma-c-mq')||{}).value||'');
    var pr=parseFloat((row.querySelector('.cma-c-prezzo')||{}).value||'');
    if(d.trim() && mq>0 && pr>0) comps.push({desc:d.trim(), mq:mq, prezzo:pr, eurMq:Math.round(pr/mq)});
  });
  if(!comps.length){ showToast('Inserisci almeno un comparabile con m² e prezzo','','#D97706'); return; }

  var stanzeTxt=_pln.pages.map(function(p){
    return p.name+': '+p.rooms.map(function(r){return r.nome+' '+r.area_m2.toFixed(1)+'m²';}).join(', ');
  }).join(' | ');
  var compTxt=comps.map(function(c,i){ return (i+1)+') '+c.desc+' — '+c.mq+' m², € '+c.prezzo.toLocaleString('it-IT')+' ('+c.eurMq.toLocaleString('it-IT')+' €/m²)'; }).join('\n');
  var mediaEurMq=Math.round(comps.reduce(function(s,c){return s+c.eurMq;},0)/comps.length);

  var prompt='Sei un valutatore immobiliare professionista. Redigi un\'ANALISI COMPARATIVA DI MERCATO (CMA) da consegnare a un cliente proprietario. '
    + 'Usa ESCLUSIVAMENTE i dati reali che ti fornisco: non inventare quotazioni di zona diverse da quelle nei comparabili.\n\n'
    + 'IMMOBILE OGGETTO:\n'
    + '- Tipologia: '+(im?(im.tipo||'n.d.'):'n.d.')+'\n- Zona: '+(zona||'n.d.')+'\n- Stato: '+(stato||'n.d.')+'\n'
    + '- Superficie calpestabile (rilievo): '+totale.toFixed(1)+' m²\n- Superficie commerciale ponderata: '+commerciale.toFixed(1)+' m²\n'
    + '- Composizione: '+stanzeTxt+'\n'
    + (noteC?'- Pregi/difetti: '+noteC+'\n':'')+'\n'
    + 'COMPARABILI REALI DI ZONA (forniti dall\'agente):\n'+compTxt+'\n'
    + 'Media comparabili: '+mediaEurMq.toLocaleString('it-IT')+' €/m²\n\n'
    + 'Struttura il report in italiano, professionale, con queste sezioni (usa titoli in maiuscolo, niente tabelle markdown):\n'
    + '1. SINTESI DELLA VALUTAZIONE — valore di mercato stimato (range min-max in €), ottenuto applicando alla superficie commerciale un €/m² coerente coi comparabili, aggiustato per stato e pregi/difetti. Indica il €/m² usato.\n'
    + '2. METODOLOGIA — spiega che è il metodo comparativo (MCA) sui comparabili forniti.\n'
    + '3. ANALISI DEI COMPARABILI — commenta i comparabili e come si posiziona l\'immobile rispetto a essi.\n'
    + '4. FATTORI DI AGGIUSTAMENTO — cosa alza/abbassa il valore rispetto alla media di zona.\n'
    + '5. STRATEGIA DI PREZZO — prezzo di richiesta consigliato e prezzo minimo di trattativa.\n'
    + '6. NOTE E LIMITI — che è una stima basata sui comparabili forniti, non una perizia giurata.\n'
    + 'Massimo 450 parole, tono da professionista che parla al proprietario.';

  /* [16 set 2026 — estrazione] Qui callClaude era chiamata senza controllo:
     se mancasse, l'errore lascerebbe il pulsante AI disabilitato. */
  if(typeof callClaude!=='function'){ showToast('Funzione AI non configurata (imposta il Worker in Impostazioni AI)','','#DC2626'); return; }
  closeModal('modal-cma-form');
  var box=document.getElementById('pln-ai-result'); var btn=document.getElementById('pln-ai-btn');
  if(box){ box.style.display=''; box.innerHTML='<div style="color:#0369A1;font-weight:600;font-size:0.85rem;">✨ Sto redigendo il report professionale sui dati reali…</div>'; }
  if(btn){ btn.disabled=true; btn.style.opacity='0.6'; }

  callClaude({ model:(typeof aiGetConfig==='function'&&aiGetConfig().model)||'claude-sonnet-4-6', max_tokens:1500, messages:[{role:'user',content:prompt}] })
  .then(function(data){
    var txt=''; try{ txt=(data.content||[]).map(function(b){return b.text||'';}).join('').trim(); }catch(_e){}
    if(!txt){ if(box) box.innerHTML='<div style="color:#DC2626;">Nessuna risposta dall\'AI.</div>'; if(btn){btn.disabled=false;btn.style.opacity='1';} return; }
    _pln._ultimoCMA = { testo:txt, totale:totale, commerciale:commerciale, comps:comps, zona:zona, im:im };
    var htmlTxt=escH(txt).replace(/\n/g,'<br>');
    if(box){
      box.innerHTML='<div style="font-weight:800;color:#0369A1;font-size:0.95rem;margin-bottom:8px;">✨ Report Valutazione Professionale</div>'
        + '<div style="font-size:0.86rem;line-height:1.55;color:#0F172A;">'+htmlTxt+'</div>'
        + '<div style="margin-top:12px;display:flex;gap:8px;"><button class="btn btn-primary btn-sm" onclick="pln_stampaCMA()">🖨️ Stampa report cliente</button></div>'
        + '<div style="margin-top:8px;font-size:0.72rem;color:#64748B;font-style:italic;">Analisi elaborata sui comparabili reali forniti. Non è una perizia giurata.</div>';
    }
    if(btn){btn.disabled=false;btn.style.opacity='1';}
  }).catch(function(err){
    if(box) box.innerHTML='<div style="color:#DC2626;">Errore AI: '+escH(err&&err.message?err.message:'riprova')+'</div>';
    if(btn){btn.disabled=false;btn.style.opacity='1';}
  });
}
function pln_stampaCMA(){
  var c=_pln._ultimoCMA; if(!c){ showToast('Genera prima il report','','#D97706'); return; }
  var im=c.im;
  var oggi=new Date().toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
  var compRows=c.comps.map(function(x){ return '<tr><td>'+escH(x.desc)+'</td><td style="text-align:right">'+x.mq+'</td><td style="text-align:right">€ '+x.prezzo.toLocaleString('it-IT')+'</td><td style="text-align:right">'+x.eurMq.toLocaleString('it-IT')+'</td></tr>'; }).join('');
  var html='<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Analisi Comparativa di Mercato</title>'
    + '<style>body{font-family:Inter,Arial,sans-serif;color:#0F172A;margin:0;padding:32px;line-height:1.55;}'
    + '.hd{display:flex;justify-content:space-between;border-bottom:3px solid #0F2A5C;padding-bottom:14px;margin-bottom:20px;}'
    + '.hd h1{font-size:19px;margin:0 0 4px;color:#0F2A5C;}.sub{font-size:12px;color:#64748B;}'
    + '.brand{text-align:right;font-size:12px;color:#64748B;}.brand b{color:#0F2A5C;font-size:14px;}'
    + 'table{width:100%;border-collapse:collapse;font-size:12.5px;margin:12px 0;}th,td{border:1px solid #E2E8F0;padding:6px 9px;}th{background:#F1F5F9;text-align:left;font-size:11px;text-transform:uppercase;}'
    + '.report{font-size:13.5px;white-space:pre-wrap;}'
    + '.foot{margin-top:28px;font-size:10.5px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:10px;}'
    + '@media print{body{padding:16px;}button{display:none;}}</style></head><body>'
    + '<div class="hd"><div><h1>Analisi Comparativa di Mercato</h1><div class="sub">'+(im?escH((im.tipo||'Immobile')+' — '+(im.comune||'')):'Immobile')+' · Superficie commerciale: '+c.commerciale.toFixed(1)+' m²</div><div class="sub">Data: '+oggi+'</div></div>'
    + '<div class="brand"><b>FRIMM Capital Casa Paestum</b><br>Vincenzo Carnicelli<br>Agropoli (SA) · Cilento</div></div>'
    + '<h3 style="color:#0F2A5C;border-left:4px solid #C9A24B;padding-left:8px;">Comparabili di riferimento</h3>'
    + '<table><thead><tr><th>Immobile comparabile</th><th>m²</th><th>Prezzo</th><th>€/m²</th></tr></thead><tbody>'+compRows+'</tbody></table>'
    + '<h3 style="color:#0F2A5C;border-left:4px solid #C9A24B;padding-left:8px;">Relazione di valutazione</h3>'
    + '<div class="report">'+escH(c.testo)+'</div>'
    + '<div class="foot">Documento redatto a titolo orientativo sulla base dei dati comparativi forniti e delle superfici rilevate da planimetria. Non costituisce perizia giurata né stima ufficiale. FRIMM Capital Casa Paestum.</div>'
    + '<div style="text-align:center;margin-top:22px;"><button onclick="window.print()" style="padding:10px 26px;background:#0F2A5C;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">🖨️ Stampa / Salva PDF</button></div>'
    + '</body></html>';
  var w=window.open('','_blank'); if(!w){ showToast('Consenti i popup','','#DC2626'); return; }
  w.document.write(html); w.document.close();
}
/* Genera un dataURL PNG della pagina con i poligoni delle stanze sovrapposti,
   per includerla nel report di stampa. */
function pln_pageToImage(page){
  try{
    var W = Math.min(1400, page.naturalW);
    var c = document.createElement('canvas');
    var ratio = page.naturalH / page.naturalW;
    c.width = W; c.height = Math.round(W*ratio);
    var ctx = c.getContext('2d');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
    ctx.drawImage(page.source, 0,0, page.naturalW, page.naturalH, 0,0, c.width, c.height);
    var s = c.width / page.naturalW;
    (page.rooms||[]).forEach(function(r){
      if(!r.points||r.points.length<3) return;
      ctx.beginPath();
      r.points.forEach(function(pt,i){ var x=pt.x*s,y=pt.y*s; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); });
      ctx.closePath();
      ctx.fillStyle='rgba(37,99,235,0.14)'; ctx.fill();
      ctx.strokeStyle='#2563EB'; ctx.lineWidth=2; ctx.stroke();
      /* etichetta al centroide */
      var cx=0,cy=0; r.points.forEach(function(pt){cx+=pt.x*s;cy+=pt.y*s;}); cx/=r.points.length; cy/=r.points.length;
      var lbl=r.nome+' · '+r.area_m2.toFixed(1)+'m²';
      ctx.font='bold 13px Inter,sans-serif';
      var tw=ctx.measureText(lbl).width;
      ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fillRect(cx-tw/2-4,cy-9,tw+8,18);
      ctx.fillStyle='#1E3A8A'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(lbl,cx,cy);
    });
    return c.toDataURL('image/png');
  }catch(e){ return null; }
}
function pln_stampaReport(){
  var totale = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){return ss+r.area_m2;},0); },0);
  if(totale<=0){ showToast('Traccia almeno una stanza prima di stampare','','#D97706'); return; }
  var commerciale = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){ var c=_PLN_COEFF[r.tipo||'interno']; if(c===undefined)c=1; return ss+r.area_m2*c; },0); },0);
  var _DESTR = { interno:'interni', balcone:'esterni', terrazzo:'esterni', giardino:'esterni', box:'accessori', cantina:'accessori', sottotetto:'accessori' };
  var destR = { interni:0, esterni:0, accessori:0 };
  _pln.pages.forEach(function(p){ p.rooms.forEach(function(r){ destR[_DESTR[r.tipo||'interno']||'interni']+=r.area_m2; }); });

  var immIdx = document.getElementById('pln-imm-ref').value;
  var im = immIdx!=='' ? D.immobili[parseInt(immIdx)] : null;
  var oggi = new Date().toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
  var agente = (typeof _currentUser!=='undefined' && _currentUser) ? (_currentUser.nome||_currentUser.user||'') : '';

  var intestImm = im
    ? escH((im.tipo||'Immobile')+(im.ref?' · Rif. '+im.ref:''))+' — '+escH((im.indirizzo?im.indirizzo+', ':'')+(im.comune||''))
    : 'Immobile non collegato';

  var pagineHtml = _pln.pages.map(function(p){
    var img = pln_pageToImage(p);
    var righe = (p.rooms||[]).map(function(r){
      var coeff=_PLN_COEFF[r.tipo||'interno']; if(coeff===undefined)coeff=1;
      return '<tr><td>'+escH(r.nome)+'</td><td>'+escH(r.tipo||'interno')+'</td><td style="text-align:right">'+r.area_m2.toFixed(2)+'</td><td style="text-align:right">'+r.perimetro_m.toFixed(2)+'</td><td style="text-align:right">'+(coeff*100).toFixed(0)+'%</td><td style="text-align:right">'+(r.area_m2*coeff).toFixed(2)+'</td></tr>';
    }).join('');
    var totPiano=p.rooms.reduce(function(s,r){return s+r.area_m2;},0);
    return '<div class="piano">'
      + '<h3>'+escH(p.name)+'</h3>'
      + (img?'<img src="'+img+'" style="max-width:100%;border:1px solid #ccc;border-radius:6px;margin-bottom:10px;">':'')
      + '<table><thead><tr><th>Ambiente</th><th>Tipo</th><th>Superficie (m²)</th><th>Perimetro (m)</th><th>Coeff.</th><th>Commerciale (m²)</th></tr></thead>'
      + '<tbody>'+righe+'</tbody>'
      + '<tfoot><tr><td colspan="2"><b>Totale piano</b></td><td style="text-align:right"><b>'+totPiano.toFixed(2)+'</b></td><td colspan="3"></td></tr></tfoot>'
      + '</table></div>';
  }).join('');

  var html = '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Report Misure — '+escH(im?(im.tipo||'Immobile'):'Planimetria')+'</title>'
    + '<style>body{font-family:Inter,Arial,sans-serif;color:#0F172A;margin:0;padding:28px;}'
    + '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0F2A5C;padding-bottom:12px;margin-bottom:18px;}'
    + '.hd h1{font-size:18px;margin:0 0 4px;color:#0F2A5C;}.hd .sub{font-size:12px;color:#64748B;}'
    + '.brand{text-align:right;font-size:12px;color:#64748B;}.brand b{color:#0F2A5C;font-size:13px;}'
    + '.piano{margin-bottom:22px;page-break-inside:avoid;}.piano h3{font-size:14px;color:#0F2A5C;border-left:4px solid #C9A24B;padding-left:8px;margin:14px 0 8px;}'
    + 'table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px;}th,td{border:1px solid #E2E8F0;padding:5px 8px;}th{background:#F1F5F9;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px;}'
    + 'tfoot td{background:#F8FAFC;}'
    + '.totali{margin-top:16px;padding:14px 18px;background:#F0F9FF;border:1.5px solid #BAE6FD;border-radius:8px;}'
    + '.totali .r{display:flex;justify-content:space-between;font-size:14px;margin:3px 0;}.totali .big{font-size:16px;font-weight:800;color:#0F2A5C;}'
    + '.foot{margin-top:26px;font-size:10.5px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:10px;}'
    + '@media print{body{padding:12px;}button{display:none;}}</style></head><body>'
    + '<div class="hd"><div><h1>Report Misure da Planimetria</h1><div class="sub">'+intestImm+'</div><div class="sub">Data: '+oggi+(agente?' · Rilievo: '+escH(agente):'')+'</div></div>'
    + '<div class="brand"><b>FRIMM Capital Casa Paestum</b><br>Agropoli (SA) · Cilento</div></div>'
    + pagineHtml
    + '<div class="totali">'
    + '<div class="r"><span>Superficie totale calpestabile</span><span class="big">'+totale.toFixed(2)+' m²</span></div>'
    + '<div class="r"><span>Superficie commerciale (ponderata)</span><span class="big" style="color:#15803D">'+commerciale.toFixed(2)+' m²</span></div>'
    + (destR.interni>0||destR.esterni>0||destR.accessori>0
        ? '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #CBD5E1;font-size:12px;color:#475569;">'
          + (destR.interni>0?'Interni: <b>'+destR.interni.toFixed(1)+' m²</b>&nbsp;&nbsp;':'')
          + (destR.esterni>0?'Esterni: <b>'+destR.esterni.toFixed(1)+' m²</b>&nbsp;&nbsp;':'')
          + (destR.accessori>0?'Accessori: <b>'+destR.accessori.toFixed(1)+' m²</b>':'')
          + '</div>'
        : '')
    + '</div>'
    + '<div class="foot">Misure ottenute per rilievo grafico su planimetria in scala, tramite calibrazione manuale. Valori indicativi soggetti alla precisione del disegno di origine e del tracciamento; non sostituiscono un rilievo metrico strumentale o una perizia tecnica. Documento a uso interno dell\'agenzia.</div>'
    + '<div style="text-align:center;margin-top:20px;"><button onclick="window.print()" style="padding:10px 24px;background:#0F2A5C;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">🖨️ Stampa / Salva PDF</button></div>'
    + '</body></html>';

  var w = window.open('','_blank');
  if(!w){ showToast('Consenti i popup per aprire il report','','#DC2626'); return; }
  w.document.write(html); w.document.close();
}
function pln_archiviaGestionale(){
  var totale = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){return ss+r.area_m2;},0); },0);
  if(totale<=0){ showToast('Traccia almeno una stanza prima di archiviare','','#D97706'); return; }
  var commerciale = _pln.pages.reduce(function(s,p){ return s + p.rooms.reduce(function(ss,r){ var c=_PLN_COEFF[r.tipo||'interno']; if(c===undefined)c=1; return ss+r.area_m2*c; },0); },0);
  totale=Math.round(totale*100)/100; commerciale=Math.round(commerciale*100)/100;

  var nomeProp = (document.getElementById('pln-prop-nome').value||'').trim();
  var telProp  = (document.getElementById('pln-prop-tel').value||'').trim();
  var immIdx = document.getElementById('pln-imm-ref').value;
  var im = immIdx!=='' ? D.immobili[parseInt(immIdx)] : null;

  var dettaglio = _pln.pages.map(function(p){
    return { piano: p.name, immagine: pln_pageToImage(p), stanze: p.rooms.map(function(r){ return {nome:r.nome, tipo:(r.tipo||'interno'), mq:Math.round(r.area_m2*100)/100, perimetro:Math.round(r.perimetro_m*100)/100}; }), totalePiano: Math.round(p.rooms.reduce(function(s,r){return s+r.area_m2;},0)*100)/100 };
  });
  var oggiISO = new Date().toISOString().slice(0,10);
  var progetto = { data:oggiISO, totale:totale, commerciale:commerciale, dettaglio:dettaglio };

  /* CASO A — immobile esistente collegato: le misure vanno nella scheda immobile. */
  if(im){
    im.superficieCalcolataPlanimetria = totale;
    im.superficieCommercialePlanimetria = commerciale;
    im.planimetrieDettaglio = dettaglio;
    if(!Array.isArray(im.planimetrieStorico)) im.planimetrieStorico = [];
    im.planimetrieStorico.push(progetto);
    /* Se è indicato anche un proprietario, crea/collega il cliente venditore. */
    if(nomeProp){
      if(!Array.isArray(D.clienti)) D.clienti=[];
      var ex=-1;
      D.clienti.forEach(function(c,i){ if(ex<0 && ((c.nome||'').trim().toLowerCase()===nomeProp.toLowerCase() || (telProp && (c.tel||'').replace(/\D/g,'')===telProp.replace(/\D/g,'')))) ex=i; });
      if(ex<0){
        var nc={ nome:nomeProp, tel:telProp, email:'', tipo:'venditore', data:oggiISO, fonte:'Misura Planimetria', uuid:('cli-pln-'+Date.now()+'-'+Math.random().toString(36).slice(2,9)) };
        D.clienti.push(nc); ex=D.clienti.length-1;
      }
      if(D.clienti[ex].uuid && !im.proprietarioUuid) im.proprietarioUuid = D.clienti[ex].uuid;
    }
    if(typeof saveD==='function') saveD();
    showToast('Misure salvate nella scheda immobile ('+totale.toFixed(0)+' m²)'+(nomeProp?' e proprietario collegato':''),'','#15803D');
    return;
  }

  /* CASO B — nessun immobile ma proprietario indicato: crea/aggiorna il cliente. */
  if(nomeProp){
    if(!Array.isArray(D.clienti)) D.clienti=[];
    var esistente=-1;
    D.clienti.forEach(function(c,i){ if(esistente<0 && ((c.nome||'').trim().toLowerCase()===nomeProp.toLowerCase() || (telProp && (c.tel||'').replace(/\D/g,'')===telProp.replace(/\D/g,'')))) esistente=i; });
    var noteProg='Progetto planimetria ('+new Date().toLocaleDateString('it-IT')+'): '+totale.toFixed(2)+' m² calpestabili, '+commerciale.toFixed(2)+' m² commerciali';
    if(esistente>=0){
      var c=D.clienti[esistente];
      if(telProp && !c.tel) c.tel=telProp;
      c.note=(c.note?c.note+'\n':'')+noteProg;
      if(!Array.isArray(c.planimetrie)) c.planimetrie=[];
      c.planimetrie.push(progetto);
    } else {
      D.clienti.push({ nome:nomeProp, tel:telProp, email:'', tipo:'venditore', data:oggiISO, fonte:'Misura Planimetria', note:noteProg, planimetrie:[progetto], uuid:('cli-pln-'+Date.now()+'-'+Math.random().toString(36).slice(2,9)) });
    }
    if(typeof saveD==='function') saveD();
    showToast('Progetto archiviato sul cliente "'+nomeProp+'" ('+totale.toFixed(0)+' m²)','','#15803D');
    return;
  }

  /* CASO C — né immobile né proprietario: archivio Planimetrie autonomo,
     sincronizzato via cloud e consultabile da tutti i computer. */
  if(!Array.isArray(D.planimetrieArchivio)) D.planimetrieArchivio=[];
  var titolo = prompt('Nessun immobile o proprietario collegato.\nIl progetto verrà salvato nell\'Archivio Planimetrie (consultabile da tutti i computer).\n\nDai un nome a questo progetto:', 'Planimetria '+new Date().toLocaleDateString('it-IT'));
  if(titolo===null){ showToast('Archiviazione annullata','','#D97706'); return; }
  progetto.titolo = titolo || ('Planimetria '+oggiISO);
  progetto.id = 'pln-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
  D.planimetrieArchivio.push(progetto);
  if(typeof saveD==='function') saveD();
  showToast('Progetto salvato nell\'Archivio Planimetrie ('+totale.toFixed(0)+' m²)','','#15803D');
}
/* Ristampa il report a partire da un progetto archiviato (con immagini salvate). */
function pln_stampaReportSalvato(progetto, intestazione){
  if(!progetto || !Array.isArray(progetto.dettaglio)){ showToast('Progetto non valido','','#DC2626'); return; }
  var oggi = progetto.data ? new Date(progetto.data).toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'}) : '';
  var pagineHtml = progetto.dettaglio.map(function(p){
    var righe = (p.stanze||[]).map(function(r){
      var coeff=_PLN_COEFF[r.tipo||'interno']; if(coeff===undefined)coeff=1;
      return '<tr><td>'+escH(r.nome)+'</td><td>'+escH(r.tipo||'interno')+'</td><td style="text-align:right">'+Number(r.mq).toFixed(2)+'</td><td style="text-align:right">'+(coeff*100).toFixed(0)+'%</td><td style="text-align:right">'+(Number(r.mq)*coeff).toFixed(2)+'</td></tr>';
    }).join('');
    return '<div class="piano"><h3>'+escH(p.piano)+'</h3>'
      + (p.immagine?'<img src="'+p.immagine+'" style="max-width:100%;border:1px solid #ccc;border-radius:6px;margin-bottom:10px;">':'')
      + '<table><thead><tr><th>Ambiente</th><th>Tipo</th><th>m²</th><th>Coeff.</th><th>Commerciale m²</th></tr></thead><tbody>'+righe+'</tbody>'
      + '<tfoot><tr><td colspan="2"><b>Totale piano</b></td><td style="text-align:right"><b>'+Number(p.totalePiano).toFixed(2)+'</b></td><td colspan="2"></td></tr></tfoot></table></div>';
  }).join('');
  var html='<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Report Misure</title>'
    + '<style>body{font-family:Inter,Arial,sans-serif;color:#0F172A;margin:0;padding:28px;}.hd{display:flex;justify-content:space-between;border-bottom:3px solid #0F2A5C;padding-bottom:12px;margin-bottom:18px;}.hd h1{font-size:18px;margin:0 0 4px;color:#0F2A5C;}.sub{font-size:12px;color:#64748B;}.brand{text-align:right;font-size:12px;color:#64748B;}.brand b{color:#0F2A5C;}.piano{margin-bottom:22px;page-break-inside:avoid;}.piano h3{font-size:14px;color:#0F2A5C;border-left:4px solid #C9A24B;padding-left:8px;margin:14px 0 8px;}table{width:100%;border-collapse:collapse;font-size:12px;}th,td{border:1px solid #E2E8F0;padding:5px 8px;}th{background:#F1F5F9;text-align:left;font-size:11px;text-transform:uppercase;}tfoot td{background:#F8FAFC;}.totali{margin-top:16px;padding:14px 18px;background:#F0F9FF;border:1.5px solid #BAE6FD;border-radius:8px;}.totali .r{display:flex;justify-content:space-between;font-size:14px;margin:3px 0;}.big{font-weight:800;color:#0F2A5C;}@media print{body{padding:12px;}button{display:none;}}</style></head><body>'
    + '<div class="hd"><div><h1>Report Misure da Planimetria</h1><div class="sub">'+escH(intestazione||progetto.titolo||'')+'</div><div class="sub">Data: '+oggi+'</div></div><div class="brand"><b>FRIMM Capital Casa Paestum</b><br>Agropoli (SA) · Cilento</div></div>'
    + pagineHtml
    + '<div class="totali"><div class="r"><span>Superficie totale calpestabile</span><span class="big">'+Number(progetto.totale).toFixed(2)+' m²</span></div><div class="r"><span>Superficie commerciale (ponderata)</span><span class="big" style="color:#15803D">'+Number(progetto.commerciale).toFixed(2)+' m²</span></div></div>'
    + '<div style="text-align:center;margin-top:20px;"><button onclick="window.print()" style="padding:10px 24px;background:#0F2A5C;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">🖨️ Stampa / Salva PDF</button></div></body></html>';
  var w=window.open('','_blank');
  if(!w){ showToast('Consenti i popup','','#DC2626'); return; }
  w.document.write(html); w.document.close();
}
function openArchivioPlanimetrie(){
  var arch = Array.isArray(D.planimetrieArchivio) ? D.planimetrieArchivio : [];
  var body;
  if(!arch.length){
    body = '<div style="text-align:center;padding:40px 20px;color:var(--text3);">'
      + '<div style="font-size:2rem;margin-bottom:8px;">🗂️</div>'
      + 'Nessun progetto in archivio.<br><span style="font-size:0.85rem;">I progetti misurati senza immobile o cliente collegato finiscono qui, sincronizzati su tutti i computer.</span></div>';
  } else {
    body = arch.slice().reverse().map(function(p){
      var realIdx = arch.indexOf(p);
      var dataFmt = p.data ? new Date(p.data).toLocaleDateString('it-IT') : '';
      var nPiani = (p.dettaglio||[]).length;
      return '<div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;">'
        + '<div style="flex:1;min-width:0;">'
        +   '<div style="font-weight:700;font-size:0.95rem;color:var(--text1);">'+escH(p.titolo||'Planimetria')+'</div>'
        +   '<div style="font-size:0.8rem;color:var(--text3);margin-top:2px;">'+dataFmt+' · '+nPiani+' '+(nPiani===1?'piano':'piani')+' · <b style="color:var(--brand)">'+Number(p.totale).toFixed(1)+' m²</b> calpestabili · <b style="color:#15803D">'+Number(p.commerciale).toFixed(1)+' m²</b> commerciali</div>'
        + '</div>'
        + '<button class="btn btn-outline btn-sm" onclick="pln_stampaReportSalvato(D.planimetrieArchivio['+realIdx+'], D.planimetrieArchivio['+realIdx+'].titolo)">🖨️ Report</button>'
        + '<button class="btn btn-outline btn-sm" onclick="archivioPlnRinomina('+realIdx+')" title="Modifica il nome del progetto">✎ Rinomina</button>'
        + '<button class="btn btn-outline btn-sm" onclick="closeModal(\'modal-archivio-pln\');pln_apriProgettoSalvato(D.planimetrieArchivio['+realIdx+'], D.planimetrieArchivio['+realIdx+'].titolo)" title="Apri per rivedere le misure o generare la Valutazione PRO">✨ Apri</button>'
        + '<button class="icon-btn" style="color:var(--red-l)" title="Elimina" onclick="archivioPlnDelete('+realIdx+')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>'
        + '</div>';
    }).join('');
  }
  var ov = document.getElementById('modal-archivio-pln');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-archivio-pln';
    ov.className = 'overlay';
    document.body.appendChild(ov);
  }
  ov.innerHTML = '<div class="modal modal-xl" style="max-width:720px;">'
    + '<div class="mhead"><h2>🗂️ Archivio Planimetrie</h2><button class="mclose" onclick="closeModal(\'modal-archivio-pln\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
    + '<div class="mbody">'+body+'</div>'
    + '<div class="mfoot"><button class="btn btn-outline" onclick="closeModal(\'modal-archivio-pln\')">Chiudi</button><button class="btn btn-primary" onclick="closeModal(\'modal-archivio-pln\');openPlanimetriaTool();">+ Nuova misura</button></div>'
    + '</div>';
  openModal('modal-archivio-pln');
}
function archivioPlnDelete(idx){
  if(!Array.isArray(D.planimetrieArchivio) || !D.planimetrieArchivio[idx]) return;
  var nome = D.planimetrieArchivio[idx].titolo || 'questo progetto';
  var doDel = function(){
    D.planimetrieArchivio.splice(idx,1);
    if(typeof saveD==='function') saveD();
    openArchivioPlanimetrie();
    showToast('Progetto eliminato','','#15803D');
  };
  if(typeof dlgConfirm==='function'){
    dlgConfirm('Eliminare "'+nome+'" dall\'archivio?','','Elimina progetto').then(function(ok){ if(ok) doDel(); });
  } else if(confirm('Eliminare "'+nome+'" dall\'archivio?')){ doDel(); }
}
function archivioPlnRinomina(idx){
  if(!Array.isArray(D.planimetrieArchivio) || !D.planimetrieArchivio[idx]) return;
  var p=D.planimetrieArchivio[idx];
  var nuovo=prompt('Nuovo nome del progetto:', p.titolo||'Planimetria');
  if(nuovo===null) return;
  p.titolo=(nuovo||'').trim()||p.titolo||'Planimetria';
  if(typeof saveD==='function') saveD();
  openArchivioPlanimetrie();
  showToast('Progetto rinominato','','#15803D');
}

/* ── Esposizione su window ────────────────────────────────────────────────
   Tutte le funzioni della sezione, non solo quelle che oggi so chiamate da
   fuori: gli altri moduli (schede cliente e immobile) possono usarle in
   pulsanti generati, e prima erano globali. I quattro ripari qui sopra NON
   vanno esposti: sovrascriverebbero le funzioni vere del monolite. */
Object.assign(window, {
  openPlanimetriaTool,
  pln_aggiornaBadgeAI,
  pln_configuraAI,
  pln_apriProgettoSalvato,
  pln_salvaModificheProgetto,
  pln_ensurePdfJs,
  pln_handleFiles,
  pln_loadImage,
  pln_loadPdf,
  pln_addPage,
  pln_renderTabs,
  pln_renamePagePrompt,
  pln_renamePage,
  pln_deletePage,
  pln_switchPage,
  pln_setupCanvas,
  pln_zoom,
  pln_toggleSetup,
  pln_startZoomArea,
  pln_canvasMouseDown,
  pln_canvasMouseMove,
  pln_canvasMouseUp,
  pln_zoomFit,
  pln_quickCalibrate,
  pln_redraw,
  pln_getPoint,
  pln_snapPoint,
  pln_toggleSnap,
  pln_toggleQuote,
  pln_startCalibrate,
  pln_startTrace,
  pln_updateModeHint,
  pln_canvasClick,
  pln_canvasDblClick,
  pln_undoPoint,
  pln_closeRoom,
  pln_deleteRoom,
  pln_duplicaRoom,
  pln_startEditPoints,
  pln_recalcRoom,
  pln_drawEditHandles,
  pln_renameRoom,
  pln_setRoomType,
  pln_renderRoomList,
  pln_updateTotals,
  pln_saveToImmobile,
  pln_valutazioneAI,
  pln_reportValutazionePRO,
  pln_generaCMA,
  pln_stampaCMA,
  pln_pageToImage,
  pln_stampaReport,
  pln_archiviaGestionale,
  pln_stampaReportSalvato,
  openArchivioPlanimetrie,
  archivioPlnDelete,
  archivioPlnRinomina
});
/* Stato condiviso: prima era globale. _pln non viene mai riassegnato, solo
   modificato nelle sue proprieta', quindi window._pln resta lo stesso oggetto. */
window._pln = _pln;
window._PLN_COEFF = _PLN_COEFF;
window._PLN_TIPI = _PLN_TIPI;
