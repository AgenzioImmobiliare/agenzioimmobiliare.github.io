// modules/mappacatastale/mappacatastale.view.js — Mappa catastale
// ----------------------------------------------------------------------------
// Estratta dal monolite il 16 set 2026.
//
// DIPENDENZE dal monolite (via window): D, saveD, dlgAlert, dlgConfirm.
// Tutte e tre protette da un typeof: da dentro un modulo un nome mancante non
// dà un errore visibile, dà una pagina che non si apre.
// ----------------------------------------------------------------------------

(function(){
  var WMS    = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php';
  var LAYERS = 'CP.CadastralParcel,vestizioni,fabbricati,strade,acque';
  var ZOOM_MIN = 16;          // sotto questo ingrandimento le particelle non si leggono
  var _map=null, _ov=null, _cerchio=null, _mkPos=null, _mkTocco=null, _immUuid=null, _timer=null;

  function _el(id){ return document.getElementById(id); }
  function _urlMappa(b, w, h){
    return WMS+'?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap'
      + '&LAYERS='+LAYERS+'&STYLES=default&SRS=EPSG:4258'
      + '&BBOX='+b.getWest()+','+b.getSouth()+','+b.getEast()+','+b.getNorth()
      + '&WIDTH='+w+'&HEIGHT='+h+'&FORMAT=image/png&TRANSPARENT=TRUE';
  }
  function _avviso(testo){
    var a=_el('mcat-avviso'); if(!a) return;
    if(testo){ a.textContent=testo; a.style.display=''; } else a.style.display='none';
  }
  /* Ridisegna lo strato catastale sull'inquadratura corrente. La nuova
     immagine sostituisce la vecchia solo DOPO essere arrivata, così la mappa
     non resta mai nuda mentre il servizio risponde (è lento a tratti). */
  function _aggiornaCatasto(){
    if(!_map) return;
    if(_map.getZoom() < ZOOM_MIN){
      if(_ov){ _map.removeLayer(_ov); _ov=null; }
      _avviso('Ingrandisci per vedere le particelle');
      return;
    }
    var b=_map.getBounds(), s=_map.getSize();
    var w=Math.max(256, Math.min(1600, Math.round(s.x)));
    var h=Math.max(256, Math.min(1600, Math.round(s.y)));
    var url=_urlMappa(b,w,h);
    _avviso('Carico le particelle…');
    var img=new Image();
    img.onload=function(){
      try{
        var nuovo=L.imageOverlay(url, b, {opacity:0.8, interactive:false});
        nuovo.addTo(_map);
        if(_ov) _map.removeLayer(_ov);
        _ov=nuovo; _avviso('');
      }catch(e){ _avviso('Non riesco a sovrapporre la mappa catastale'); }
    };
    img.onerror=function(){ _avviso('Il servizio dell\'Agenzia non risponde in questo momento'); };
    img.src=url;
  }
  function _programmaAggiornamento(){
    clearTimeout(_timer);
    _timer=setTimeout(_aggiornaCatasto, 350);   // evita una richiesta per ogni pixel trascinato
  }

  function _vaiAllaPosizione(){
    if(!navigator.geolocation){ _avviso('Questo dispositivo non sa dire dove sei'); return; }
    _avviso('Cerco la posizione…');
    navigator.geolocation.getCurrentPosition(function(p){
      var lat=p.coords.latitude, lon=p.coords.longitude, prec=p.coords.accuracy||0;
      if(_mkPos){ _map.removeLayer(_mkPos); _mkPos=null; }
      if(_cerchio){ _map.removeLayer(_cerchio); _cerchio=null; }
      _cerchio=L.circle([lat,lon],{radius:Math.max(prec,5),color:'#2563EB',weight:1,fillOpacity:.12}).addTo(_map);
      _mkPos=L.circleMarker([lat,lon],{radius:6,color:'#fff',weight:2,fillColor:'#2563EB',fillOpacity:1}).addTo(_map);
      _map.setView([lat,lon], Math.max(_map.getZoom(), 18));
      _avviso('Precisione del segnale: circa '+Math.round(prec)+' metri — controlla di essere sulla particella giusta');
      setTimeout(function(){ _avviso(''); }, 6000);
    }, function(e){
      _avviso('Posizione non disponibile: '+(e && e.message ? e.message : 'permesso negato'));
    }, {enableHighAccuracy:true, timeout:20000, maximumAge:10000});
  }

  /* Trascrive nella scheda immobile i numeri letti sul disegno. Non sovrascrive
     mai in silenzio: se il dato c'è già e cambia, chiede conferma. */
  async function _salvaNellaScheda(){
    if(!_immUuid){ typeof dlgAlert==='function'&&dlgAlert('Questa mappa non è collegata a un immobile: aprila dalla scheda dell\'immobile.','','Nessun immobile'); return; }
    var im=(Array.isArray(D.immobili)?D.immobili:[]).find(function(x){ return x && x.uuid===_immUuid; });
    if(!im){ typeof dlgAlert==='function'&&dlgAlert('L\'immobile non è più in archivio.','','Non trovato'); return; }
    var f=String((_el('mcat-foglio')||{}).value||'').trim();
    var p=String((_el('mcat-part')||{}).value||'').trim();
    var s=String((_el('mcat-sub')||{}).value||'').trim();
    if(!f && !p && !s){ typeof dlgAlert==='function'&&dlgAlert('Scrivi almeno il foglio e la particella che leggi sulla mappa.','','Campi vuoti'); return; }
    var cambi=[];
    if(f && String(im.catFoglio||'')!==f)     cambi.push(['Foglio', im.catFoglio||'(vuoto)', f]);
    if(p && String(im.catParticella||'')!==p) cambi.push(['Particella', im.catParticella||'(vuoto)', p]);
    if(s && String(im.catSub||'')!==s)        cambi.push(['Subalterno', im.catSub||'(vuoto)', s]);
    if(!cambi.length){ typeof dlgAlert==='function'&&dlgAlert('La scheda ha già questi valori: non c\'è niente da cambiare.','','Già a posto'); return; }
    var sovrascrive=cambi.some(function(c){ return c[1]!=='(vuoto)'; });
    if(sovrascrive){
      var testo=cambi.map(function(c){ return c[0]+': '+c[1]+'  →  '+c[2]; }).join('\n');
      var ok=await typeof dlgConfirm==='function'&&dlgConfirm('Nella scheda ci sono già dei dati catastali.\n\n'+testo+'\n\nLi sostituisco?','','Conferma');
      if(!ok) return;
    }
    if(f) im.catFoglio=f;
    if(p) im.catParticella=p;
    if(s) im.catSub=s;
    im.dataModifica=new Date().toISOString();
    try{ typeof saveD==='function'&&saveD(); }catch(e){ console.warn('[Catasto] saveD KO:', e); }
    if(typeof showToast==='function') showToast('Dati catastali salvati nella scheda');
    if(typeof window.renderSchedaImmobile==='function'){ try{ window.renderSchedaImmobile(D.immobili.indexOf(im)); }catch(e){} }
    chiudiMappaCatastale();
  }

  /* Interrogazione della particella toccata.
     Leggere la risposta col codice è bloccato dal browser (verificato: il
     servizio non manda Access-Control-Allow-Origin). APRIRLA in una scheda
     nuova invece è una normale navigazione e non ha nessun blocco: si apre la
     paginetta ufficiale dell'Agenzia con foglio e particella, nella forma
     A091_004100.533 = comune A091, foglio 41, particella 533.
     È l'unico modo di avere il FOGLIO: lo strato delle particelle stampa sul
     disegno solo il numero della particella, non quello del foglio. */
  /* Indirizzo del punto toccato. Se non risponde non è un guasto: si resta
     con la sola identificazione catastale. */
  function _indirizzoDaPunto(lat, lon){
    var url='https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1'
      + '&lat='+lat+'&lon='+lon+'&accept-language=it';
    fetch(url).then(function(r){ return r.json(); }).then(function(d){
      var a=(d&&d.address)||{};
      var via=a.road||a.pedestrian||a.footway||a.hamlet||a.suburb||'';
      var civ=a.house_number?(' '+a.house_number):'';
      var citta=a.city||a.town||a.village||a.municipality||'';
      var prov=a.county||'';
      var testo=[ (via?via+civ:''), citta, (prov&&prov!==citta?'('+prov+')':'') ].filter(Boolean).join(', ');
      if(!testo){ _avviso('Qui OpenStreetMap non conosce l\'indirizzo. La particella però l\'ho aperta.'); return; }
      _ultimoIndirizzo = testo;
      var el=_el('mcat-avviso');
      if(el){
        el.innerHTML = '<strong>'+testo.replace(/</g,'&lt;')+'</strong>'
          + ' <button onclick="_mcatIndirizzoNegliAppunti()" style="margin-left:8px;background:none;border:1px solid currentColor;color:inherit;border-radius:7px;padding:2px 8px;font-size:0.74rem;font-weight:700;font-family:inherit;cursor:pointer">negli appunti</button>';
        el.style.display='';
      }
    }).catch(function(){
      _avviso('Non sono riuscito a chiedere l\'indirizzo: controlla la connessione.');
    });
  }
  var _ultimoIndirizzo='';
  window._mcatIndirizzoNegliAppunti=function(){
    if(!_ultimoIndirizzo) return;
    if(!_el('mcat-note')) _mcatAppunti();
    var t=_el('mcat-note-testo');
    if(!t) return;
    var v=t.value||'';
    t.value = v + ((v && !/\n$/.test(v)) ? '\n' : '') + _ultimoIndirizzo;
    try{ t.dispatchEvent(new Event('input',{bubbles:true})); }catch(e){}
    try{ t.focus(); t.selectionStart=t.selectionEnd=t.value.length; }catch(e){}
  };
  function _identifica(e){
    if(!_map || !e || !e.latlng) return;
    if(_map.getZoom() < ZOOM_MIN){ _avviso('Ingrandisci prima di toccare una particella'); return; }
    var lat=e.latlng.lat, lon=e.latlng.lng, d=0.00002;
    var url=WMS+'?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo'
      + '&LAYERS=CP.CadastralParcel&QUERY_LAYERS=CP.CadastralParcel&STYLES=&SRS=EPSG:4258'
      + '&BBOX='+(lon-d)+','+(lat-d)+','+(lon+d)+','+(lat+d)
      + '&WIDTH=9&HEIGHT=9&FORMAT=image/png&INFO_FORMAT=text/html&X=5&Y=5';
    if(_mkTocco){ _map.removeLayer(_mkTocco); _mkTocco=null; }
    _mkTocco=L.circleMarker([lat,lon],{radius:7,color:'#B45309',weight:2,fillColor:'#FDE68A',fillOpacity:.9}).addTo(_map);
    _avviso('Apro l\'identificazione della particella. Cerco anche l\'indirizzo…');
    /* [8 set 2026] L'indirizzo del punto toccato, chiesto a OpenStreetMap.
       È il servizio che il gestionale usa già per posizionare gli immobili e
       si lascia interrogare dal browser — a differenza di quello catastale.
       Resta scritto finché non tocchi un altro punto, così finisce anche
       nella fotografia dello schermo. */
    _indirizzoDaPunto(lat, lon);
    try{ window.open(url,'_blank','noopener'); }
    catch(err){ _avviso('Il browser ha impedito di aprire la scheda nuova'); }
  }

  /* Traduce la sigla che l'Agenzia restituisce in foglio e particella.
     Forma: A091_004300.120 → comune A091, foglio 43, allegato/sviluppo, part. 120.
     Accetta anche la versione lunga IT.AGE.PLA.A091_004300.120 e regge il caso
     con l'allegato (G273_0033A0.673 = foglio 33, allegato A). */
  function _decodificaSigla(sigla){
    var s=String(sigla||'').trim().toUpperCase().replace(/\s+/g,'');
    s=s.replace(/^IT\.AGE\.PLA\.?/,'');
    var m=s.match(/^([A-Z]\d{3})_(\d{4})([0-9A-Z])([0-9A-Z])\.(.+)$/);
    if(!m) return null;
    return {
      comune: m[1],
      foglio: String(parseInt(m[2],10)),
      allegato: (m[3]==='0' ? '' : m[3]),
      sviluppo: (m[4]==='0' ? '' : m[4]),
      particella: m[5].trim()
    };
  }
  /* Chiamata mentre si incolla: traduce, scrive nelle caselle e lo dice a parole. */
  window._mcatLeggiSigla=function(){
    var box=_el('mcat-sigla'), esito=_el('mcat-esito');
    if(!box||!esito) return;
    var v=String(box.value||'').trim();
    if(!v){ esito.textContent=''; esito.style.color='var(--text4)'; return; }
    var d=_decodificaSigla(v);
    if(!d){
      esito.textContent='Non riconosco questa sigla: dovrebbe essere tipo A091_004300.120';
      esito.style.color='#B45309';
      return;
    }
    esito.textContent='Foglio '+d.foglio+' · Particella '+d.particella
      + (d.allegato?' · allegato '+d.allegato:'') + (d.sviluppo?' · sviluppo '+d.sviluppo:'')
      + ' · comune '+d.comune;
    esito.style.color='#15803D';
    var f=_el('mcat-foglio'), p=_el('mcat-part');
    if(f) f.value=d.foglio;
    if(p) p.value=d.particella;
  };

  /* [3 set 2026] RICHIESTA VISURA — il percorso più corto possibile.
     Il proprietario NON sta nella cartografia: sta nella visura, e la visura
     si ottiene solo entrando con SPID nell'area riservata dell'Agenzia. Quel
     passaggio non è eliminabile da una pagina web. Quello che si può togliere
     è il resto: cercare la pagina e ribattere i numeri.
     Questo pulsante copia i dati catastali negli appunti e apre la pagina del
     servizio: poi entri con SPID e incolli.
     Dal 1° gennaio 2025 la visura online è gratuita anche per immobili non
     tuoi, quindi questa strada non ha più un costo per richiesta. */
  var URL_VISURA='https://www.agenziaentrate.gov.it/portale/schede/fabbricatiterreni/visura-catastale/visura-catastale-online-professionisti';

  function _copiaTesto(t){
    try{
      if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    }catch(e){}
    /* Ripiego per i browser che non hanno gli appunti moderni. */
    return new Promise(function(ris){
      try{
        var ta=document.createElement('textarea');
        ta.value=t; ta.style.cssText='position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }catch(e){}
      ris();
    });
  }
  window._mcatVisura=function(){
    var f=String((_el('mcat-foglio')||{}).value||'').trim();
    var p=String((_el('mcat-part')||{}).value||'').trim();
    var s=String((_el('mcat-sub')||{}).value||'').trim();
    var com='';
    var im=_immUuid?(Array.isArray(D.immobili)?D.immobili:[]).find(function(x){ return x && x.uuid===_immUuid; }):null;
    if(im) com=String(im.catComune||im.comune||'').trim();
    /* Se i campi sono vuoti provo a ricavarli dalla sigla incollata. */
    if((!f||!p)){
      var d=_decodificaSigla((_el('mcat-sigla')||{}).value||'');
      if(d){ f=f||d.foglio; p=p||d.particella; if(!com) com=d.comune; }
    }
    if(!f || !p){
      _avviso('Mi servono almeno foglio e particella: toccali sulla mappa o incolla la sigla.');
      return;
    }
    var testo=(com?'Comune: '+com+'\n':'')+'Foglio: '+f+'\nParticella: '+p+(s?'\nSubalterno: '+s:'');
    _copiaTesto(testo).then(function(){
      _avviso('Dati copiati: '+(com?com+' · ':'')+'foglio '+f+', particella '+p+'. Entra con SPID e incollali nel modulo.');
      try{ window.open(URL_VISURA,'_blank','noopener'); }
      catch(e){ _avviso('Il browser ha impedito di aprire la pagina dell\'Agenzia.'); }
    });
  };

  /* [3 set 2026] RICERCA SULLA MAPPA.
     Da foglio e particella al punto sulla mappa NON si può fare coi servizi
     pubblici: il servizio vettoriale dell'Agenzia si interroga per geometria,
     non per identificativo (dato un punto dice la particella, non il
     contrario), e il Geoportale che quella ricerca la fa chiede un codice di
     sicurezza da leggere a occhio, quindi non è apribile già compilato.
     Quello che si può fare, e copre i casi veri, è doppio:
     1. cerca nei TUOI immobili — per riferimento, indirizzo, comune, o
        proprio per "foglio/particella": se l'immobile è in archivio la
        posizione ce l'hai già e la mappa ci va sopra all'istante;
     2. altrimenti cerca l'INDIRIZZO su OpenStreetMap, lo stesso servizio che
        il gestionale usa già per posizionare gli immobili. */
  function _cercaInArchivio(q){
    var t=q.toLowerCase().trim();
    var mFP=t.match(/^(?:fo?g?l?i?o?\s*)?(\d{1,4})\s*[\/\-\s]\s*(?:part?i?c?e?l?l?a?\s*)?(\d{1,5})$/);
    var lista=(Array.isArray(D.immobili)?D.immobili:[]);
    var trovato=null;
    if(mFP){
      var f=String(parseInt(mFP[1],10)), p=String(parseInt(mFP[2],10));
      trovato=lista.find(function(im){
        return im && String(parseInt(im.catFoglio,10))===f && String(im.catParticella||'').trim()===p;
      });
      if(trovato) return {im:trovato, come:'foglio '+f+' particella '+p};
    }
    trovato=lista.find(function(im){ return im && String(im.ref||'').toLowerCase()===t; });
    if(trovato) return {im:trovato, come:'riferimento '+trovato.ref};
    trovato=lista.find(function(im){
      if(!im) return false;
      var s=((im.indirizzo||'')+' '+(im.comune||'')+' '+(im.zona||'')+' '+(im.contatto||'')).toLowerCase();
      return s.indexOf(t)>=0;
    });
    if(trovato) return {im:trovato, come:'archivio'};
    return null;
  }
  window._mcatCerca=async function(){
    var box=_el('mcat-cerca');
    var q=box?String(box.value||'').trim():'';
    if(!q){ _avviso('Scrivi un indirizzo, un riferimento, oppure foglio/particella.'); return; }

    var inArch=_cercaInArchivio(q);
    if(inArch){
      var coord=null;
      try{
        coord=(typeof _getCoords==='function') ? _getCoords(inArch.im, D.immobili.indexOf(inArch.im))
             : ((inArch.im.lat&&inArch.im.lng)?[parseFloat(inArch.im.lat),parseFloat(inArch.im.lng)]:null);
      }catch(e){}
      if(coord && !isNaN(coord[0])){
        _map.setView(coord, Math.max(_map.getZoom(), 18));
        L.circleMarker(coord,{radius:8,color:'#15803D',weight:3,fillColor:'#DCFCE7',fillOpacity:.9}).addTo(_map);
        _avviso('Trovato nei tuoi immobili ('+inArch.come+'): '+((inArch.im.ref?'Ref.'+inArch.im.ref+' — ':'')+(inArch.im.indirizzo||inArch.im.comune||'')));
        return;
      }
      _avviso('L\'immobile è in archivio ma non ha una posizione: cerco l\'indirizzo…');
      q=[(inArch.im.indirizzo||''),(inArch.im.comune||'')].filter(Boolean).join(', ');
    }

    /* Se sembrano solo numeri catastali non ha senso chiedere a OpenStreetMap. */
    if(/^[\d\s\/\-]+$/.test(q)){
      _avviso('Quella particella non è nei tuoi immobili. Da foglio e particella la mappa non può trovarla da sola: serve il Geoportale dell\'Agenzia, che chiede un codice di sicurezza a mano.');
      return;
    }

    _avviso('Cerco l\'indirizzo…');
    try{
      var r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='
        + encodeURIComponent(q + (/(agropoli|cilento|italia|salerno)/i.test(q)?'':', Italia')) + '&accept-language=it');
      var d=await r.json();
      if(!d || !d[0]){ _avviso('Indirizzo non trovato. Prova a essere più preciso, con il comune.'); return; }
      var la=parseFloat(d[0].lat), lo=parseFloat(d[0].lon);
      _map.setView([la,lo], Math.max(_map.getZoom(), 18));
      L.circleMarker([la,lo],{radius:8,color:'#2563EB',weight:3,fillColor:'#DBEAFE',fillOpacity:.9}).addTo(_map);
      _avviso('Trovato: '+String(d[0].display_name||q).slice(0,90));
    }catch(e){
      _avviso('La ricerca dell\'indirizzo non ha risposto: controlla la connessione.');
    }
  };

  /* [3 set 2026] APPUNTI SULLA MAPPA.
     Serve per la fotografia dello schermo: quando passi davanti a una casa che
     forse si vende, scrivi qui il nome, il telefono, quello che ti hanno detto,
     e lo scatto porta con sé mappa e appunti insieme.
     Il riquadro si trascina, così non copre la particella che ti interessa.
     Sta FUORI dal contenitore della mappa: se stesse dentro, Leaflet
     intercetterebbe i clic e ogni tocco sul testo aprirebbe l'identificazione
     della particella.
     Il testo resta salvato su questo dispositivo (localStorage), non nella
     scheda: sono appunti volanti, non un dato dell'immobile, e così non
     rischiano di finire nella sincronizzazione o nei backup. */
  function _noteChiave(){ return 'lecase_note_mappa_'+(_immUuid||'libero'); }
  window._mcatAppuntiSvuota=function(){
    var t=_el('mcat-note-testo');
    if(t) t.value='';
    try{ localStorage.removeItem(_noteChiave()); }catch(e){}
    if(t) try{ t.focus(); }catch(e){}
  };
  window._mcatAppunti=function(){
    var n=_el('mcat-note');
    if(n){ n.remove(); return; }
    var im=_immUuid?(Array.isArray(D.immobili)?D.immobili:[]).find(function(x){ return x && x.uuid===_immUuid; }):null;
    var salvato='';
    try{ salvato=localStorage.getItem(_noteChiave())||''; }catch(e){}
    var d=document.createElement('div');
    d.id='mcat-note';
    d.style.cssText='position:fixed;left:16px;top:110px;z-index:9100;width:min(74vw,290px);'
      + 'background:rgba(255,255,255,.96);border:1.5px solid #94A3B8;border-radius:10px;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.22);overflow:hidden';
    d.innerHTML='<div id="mcat-note-testa" style="display:flex;align-items:center;gap:6px;padding:6px 8px;'
      + 'background:#1E293B;color:#fff;cursor:move;touch-action:none;user-select:none">'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>'
      + '<span style="flex:1;font-size:0.74rem;font-weight:700;letter-spacing:.3px">APPUNTI'
      +   '<span style="display:block;font-size:0.62rem;font-weight:500;opacity:.75;letter-spacing:0">'
      +     (im ? 'di '+String(((im.ref?'Ref.'+im.ref:'')||im.indirizzo||im.comune||'questo immobile')).replace(/</g,'&lt;') : 'mappa libera')
      +   '</span></span>'
      /* [8 set 2026] Prima non c'era modo di svuotarli e non era scritto da
         nessuna parte che restassero memorizzati: sembravano rimanere
         appiccicati alle ricerche successive. */
      + '<button onclick="_mcatAppuntiSvuota()" style="background:none;border:1px solid rgba(255,255,255,.45);color:#fff;cursor:pointer;font-size:0.68rem;font-weight:700;padding:2px 7px;border-radius:6px;font-family:inherit" title="Cancella questi appunti">Svuota</button>'
      + '<button onclick="_mcatAppunti()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:1rem;line-height:1;padding:0 2px" aria-label="Chiudi appunti">×</button>'
      + '</div>'
      + '<textarea id="mcat-note-testo" rows="5" placeholder="Proprietario, telefono, cosa ti hanno detto…" '
      + 'style="width:100%;border:none;outline:none;resize:vertical;padding:9px 10px;font-family:inherit;'
      + 'font-size:0.88rem;line-height:1.45;color:#0F172A;background:transparent;box-sizing:border-box"></textarea>'
      + '<div style="padding:0 10px 7px;font-size:0.66rem;color:#64748B;line-height:1.4">Restano salvati su questo dispositivo e li ritrovi riaprendo la mappa. Le ricerche non li cambiano.</div>';
    document.body.appendChild(d);
    var t=_el('mcat-note-testo');
    t.value=salvato;
    t.addEventListener('input', function(){
      try{ localStorage.setItem(_noteChiave(), t.value); }catch(e){}
    });

    /* Trascinamento: pointer, così va uguale col dito e col mouse. */
    var testa=_el('mcat-note-testa'), sx=0, sy=0, ox=0, oy=0, muovo=false;
    function giu(e){
      muovo=true; var r=d.getBoundingClientRect();
      sx=e.clientX; sy=e.clientY; ox=r.left; oy=r.top;
      try{ testa.setPointerCapture(e.pointerId); }catch(_){}
      e.preventDefault();
    }
    function muovi(e){
      if(!muovo) return;
      var nx=ox+(e.clientX-sx), ny=oy+(e.clientY-sy);
      /* Non lo lascio uscire dallo schermo: da fuori non lo riprenderesti più. */
      nx=Math.max(4, Math.min(nx, window.innerWidth - 60));
      ny=Math.max(4, Math.min(ny, window.innerHeight - 40));
      d.style.left=nx+'px'; d.style.top=ny+'px';
    }
    function su(e){ muovo=false; try{ testa.releasePointerCapture(e.pointerId); }catch(_){} }
    testa.addEventListener('pointerdown', giu);
    testa.addEventListener('pointermove', muovi);
    testa.addEventListener('pointerup', su);
    testa.addEventListener('pointercancel', su);
    setTimeout(function(){ try{ t.focus(); }catch(e){} }, 60);
  };

  window.chiudiMappaCatastale=function(){
    clearTimeout(_timer);
    var n=_el('mcat-note'); if(n) n.remove();   /* [3 set 2026] gli appunti stanno fuori dal contenitore della mappa: vanno tolti a parte */
    var w=_el('mcat-wrap');
    if(w) w.remove();
    if(_map){ try{ _map.remove(); }catch(e){} }
    _map=null; _ov=null; _cerchio=null; _mkPos=null; _mkTocco=null; _immUuid=null;
  };

  /* immUuid è facoltativo: senza, la mappa funziona lo stesso ma il pulsante
     di salvataggio avvisa che non sa a quale immobile riferirsi. */
  window.apriMappaCatastale=function(immUuid){
    if(typeof L==='undefined'){ typeof dlgAlert==='function'&&dlgAlert('La libreria delle mappe non è ancora pronta: riprova fra un istante.','','Mappa'); return; }
    chiudiMappaCatastale();
    _immUuid=immUuid||null;
    var im=_immUuid?(Array.isArray(D.immobili)?D.immobili:[]).find(function(x){ return x && x.uuid===_immUuid; }):null;

    var w=document.createElement('div');
    w.id='mcat-wrap';
    w.style.cssText='position:fixed;top:0;right:0;bottom:0;left:0;z-index:9000;background:var(--bg);display:flex;flex-direction:column';
    w.innerHTML=
      '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg2);border-bottom:1px solid var(--border);flex-wrap:wrap">'
      + '<button onclick="chiudiMappaCatastale()" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Chiudi</button>'
      + '<div style="font-weight:800;color:var(--text);font-size:0.95rem">Mappa catastale'
      +   (im?' <span style="font-weight:500;color:var(--text3)">· '+((im.indirizzo||im.comune||'').replace(/</g,'&lt;'))+'</span>':'')
      + '</div>'
      + '<div style="flex:1"></div>'
      + '<div style="display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border2);border-radius:9px;padding:2px 4px 2px 8px">'
      +   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text4)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
      +   '<input id="mcat-cerca" placeholder="indirizzo, Ref. o 43/120" onkeydown="if(event.key===\'Enter\'){event.preventDefault();_mcatCerca();}" style="border:none;background:transparent;outline:none;font-size:0.85rem;color:var(--text);width:190px;font-family:inherit">'
      +   '<button onclick="_mcatCerca()" class="btn btn-outline btn-sm" style="padding:5px 11px">Cerca</button>'
      + '</div>'
      + '<button onclick="_mcatAppunti()" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:6px" title="Scrivi appunti sopra la mappa, per la fotografia dello schermo"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg> Appunti</button>'
      + '<button onclick="_mcatPosizione()" class="btn btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg> Dove sono</button>'
      + '</div>'
      + '<div id="mcat-avviso" style="display:none;padding:7px 14px;background:#FEF3C7;color:#92400E;font-size:0.82rem;font-weight:600;border-bottom:1px solid #FCD34D"></div>'
      + '<div id="mcat-map" style="flex:1;min-height:0"></div>'
      + '<div style="padding:10px 14px;background:var(--bg2);border-top:1px solid var(--border)">'
      /* [3 set 2026] Il riquadro cambia a seconda di come è stata aperta la
         mappa. Senza immobile (voce "Catasto" fra le Altre sezioni, usata per
         controllare i dati prima di prendere un incarico) le caselle non hanno
         dove finire, quindi non compaiono: resta la sola identificazione. */
      +   (im
          ? '<div style="font-size:0.78rem;color:var(--text3);margin-bottom:7px"><strong>Tocca una particella</strong>: si apre la risposta dell\'Agenzia. Copia la sigla, incollala qui sotto e la traduco io in foglio e particella.</div>'
      +   '<div style="margin-bottom:8px"><div style="font-size:0.68rem;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.6px">Sigla dall\'Agenzia</div>'
      +     '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      +       '<input id="mcat-sigla" class="finput" style="flex:1;min-width:190px" placeholder="incolla qui, es. A091_004300.120" oninput="_mcatLeggiSigla()">'
      +       '<span id="mcat-esito" style="font-size:0.82rem;font-weight:700;color:var(--text4)"></span>'
      +     '</div></div>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">'
            +   '<div><div style="font-size:0.68rem;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.6px">Foglio</div><input id="mcat-foglio" class="finput" style="width:90px" value="'+(im.catFoglio||'').replace(/"/g,'&quot;')+'"></div>'
            +   '<div><div style="font-size:0.68rem;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.6px">Particella</div><input id="mcat-part" class="finput" style="width:110px" value="'+(im.catParticella||'').replace(/"/g,'&quot;')+'"></div>'
            +   '<div><div style="font-size:0.68rem;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.6px">Sub</div><input id="mcat-sub" class="finput" style="width:80px" value="'+(im.catSub||'').replace(/"/g,'&quot;')+'"></div>'
            +   '<button onclick="_mcatSalva()" class="btn btn-primary" style="padding:10px 18px">Salva nella scheda</button>'
            +   '<button onclick="_mcatVisura()" class="btn btn-outline" style="padding:10px 16px;display:inline-flex;align-items:center;gap:7px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Chi è il proprietario</button>'
            +   '<div style="flex:1;min-width:120px;text-align:right;font-size:0.68rem;color:var(--text4)">Cartografia © Agenzia delle Entrate — CC BY 4.0</div>'
            + '</div>'
          : '<div style="font-size:0.8rem;color:var(--text2);margin-bottom:7px"><strong>Tocca una particella</strong>: si apre la risposta dell\'Agenzia. Copia la sigla e incollala qui per leggerla in chiaro. Nessun immobile collegato: qui si guarda soltanto.</div>'
            + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
            +   '<input id="mcat-sigla" class="finput" style="flex:1;min-width:190px" placeholder="incolla qui, es. A091_004300.120" oninput="_mcatLeggiSigla()">'
            +   '<span id="mcat-esito" style="font-size:0.86rem;font-weight:700;color:var(--text4)"></span>'
            + '</div>'
            + '<div style="margin-top:8px">' + '<button onclick="_mcatVisura()" class="btn btn-outline" style="padding:10px 16px;display:inline-flex;align-items:center;gap:7px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Chi è il proprietario</button>' + '</div>'
            + '<div style="margin-top:6px;font-size:0.68rem;color:var(--text4)">Cartografia © Agenzia delle Entrate — CC BY 4.0</div>')
      + '</div>';
    document.body.appendChild(w);
    try{ if(typeof window._ceSeguiMenu === 'function') window._ceSeguiMenu(w); }catch(e){}

    /* Coordinate: si usa _getCoords, la stessa funzione della mappa immobili,
       che se il punto esatto manca ripiega sul centro della zona o del comune.
       Così la mappa si apre comunque vicino, e non in mezzo al nulla. */
    var centro=[40.35,14.99], zoom=17, coord=null;
    if(im){
      try{
        coord=(typeof _getCoords==='function') ? _getCoords(im, D.immobili.indexOf(im))
             : ((im.lat&&im.lng)?[parseFloat(im.lat),parseFloat(im.lng)]:null);
      }catch(e){ coord=null; }
    }
    if(coord && !isNaN(coord[0]) && !isNaN(coord[1])){ centro=[coord[0],coord[1]]; zoom=18; }
    _map=L.map('mcat-map',{center:centro,zoom:zoom,zoomControl:true,scrollWheelZoom:true,maxZoom:19});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom:19
    }).addTo(_map);
    if(coord) L.marker(coord).addTo(_map);
    _map.on('moveend zoomend', _programmaAggiornamento);
    _map.on('click', _identifica);
    setTimeout(function(){ try{ _map.invalidateSize(); }catch(e){} _aggiornaCatasto(); }, 150);
    /* Senza coordinate sull'immobile si parte da dove sei: è il caso di quando
       stai davanti al palazzo e la scheda non ha ancora la posizione. */
    if(!coord) setTimeout(_vaiAllaPosizione, 400);
  };
  window._mcatPosizione=_vaiAllaPosizione;
  window._mcatSalva=_salvaNellaScheda;
})();
