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
  /* [25 set sera] Con lo sfondo Satellite si chiedono le particelle SENZA
     "vestizioni": è (con ogni probabilità) il fondo color crema che l'Agenzia
     stende sui terreni, e sopra la foto la copriva tutta. Con la cartina
     resta tutto com'era. */
  var LAYERS_FOTO = 'CP.CadastralParcel,fabbricati,strade,acque';
  var _ovTok = 0;             // scarta le risposte arrivate in ritardo
  var ZOOM_MIN = 16;          // sotto questo ingrandimento le particelle non si leggono
  var _map=null, _ov=null, _cerchio=null, _mkPos=null, _mkTocco=null, _immUuid=null, _timer=null;

  function _el(id){ return document.getElementById(id); }
  function _urlMappa(b, w, h){
    return WMS+'?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap'
      + '&LAYERS='+(_baseId!=='mappa'?LAYERS_FOTO:LAYERS)+'&STYLES=default&SRS=EPSG:4258'
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
    var tok=++_ovTok;
    img.onload=function(){
      /* una risposta vecchia (es. prima del cambio di sfondo) non deve
         coprire quella nuova arrivata prima di lei */
      if(tok!==_ovTok || !_map) return;
      try{
        var nuovo=L.imageOverlay(url, b, {opacity:0.8, interactive:false, className:'mcat-ov', pane:'mcatCatasto'});
        nuovo.addTo(_map);
        if(_ov) _map.removeLayer(_ov);
        _ov=nuovo; _avviso('');
      }catch(e){ _avviso('Non riesco a sovrapporre la mappa catastale'); }
    };
    img.onerror=function(){ if(tok!==_ovTok) return; _avviso('Il servizio dell\'Agenzia non risponde in questo momento'); };
    img.src=url;
  }
  function _programmaAggiornamento(){
    clearTimeout(_timer);
    /* [17 set 2026] con il catasto si riallineano anche gli strati accesi */
    _timer=setTimeout(function(){ _aggiornaCatasto(); _aggiornaStrati(); }, 350);
  }

  /* [17 set 2026] "Dove sono" non prende più la posizione una volta sola:
     la segue mentre cammini e accende il cono della direzione. */
  function _vaiAllaPosizione(daTocco){
    _avviaPosizione();
    /* su iPhone il permesso alla bussola si può chiedere solo dentro un tocco;
       su Android no, e il cono parte anche all'apertura automatica */
    var serveTocco = (typeof DeviceOrientationEvent !== 'undefined'
                      && typeof DeviceOrientationEvent.requestPermission === 'function');
    if(daTocco === true || !serveTocco) _avviaDirezione();
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

  /* ════════════════════════════════════════════════════════════════════════
     DIREZIONE E BUSSOLA SULLA MAPPA                          [17 set 2026]
     ------------------------------------------------------------------------
     Chiesto da Enzo: nelle strade strette non si capisce da che parte guarda
     la cartina. Due strumenti, scelti con lui:
     · il CONO sul punto blu: dice verso dove punta il telefono, e si allarga
       quando la bussola è incerta (ringhiere, portoni, auto). La posizione
       ora segue il cammino invece di essere presa una volta sola;
     · il pulsante BUSSOLA: la cartina gira e ciò che hai davanti va in alto.
       All'apertura la mappa parte sempre col nord in alto.
     COME GIRA. Leaflet da sola non ruota. L'estensione che lo fa riscrive
     parti di Leaflet per tutto il gestionale ed è in licenza GPL: scartata.
     Qui ruota il riquadro della mappa, reso quadrato e grande quanto la
     diagonale dello schermo (così negli angoli non resta il vuoto). Il prezzo
     è che i tocchi e i trascinamenti arrivano "storti" a Leaflet: finché la
     bussola è accesa li converte questo codice, girandoli al contrario. Lo
     zoom con due dita resta di Leaflet, centrato sullo schermo.
     DIREZIONE DEL TELEFONO. Android: 'deviceorientationabsolute' (alpha dal
     nord). Si combinano l'asse alto del telefono e quello della fotocamera,
     così il valore regge sia col telefono appoggiato sia tenuto dritto.
     iPhone: webkitCompassHeading, dopo il permesso chiesto al tocco. In
     orizzontale si aggiunge l'angolo dello schermo.
     ════════════════════════════════════════════════════════════════════════ */
  var _dir = null;            // direzione filtrata, in gradi dal nord
  var _dirVett = null;        // media vettoriale per il filtro
  var _dirLetture = [];       // ultime letture grezze, per l'incertezza
  var _dirIncertezzaIOS = null;
  var _dirAttiva = false, _dirTimeout = null, _dirVista = false;
  var _watchId = null, _mkCono = null, _ultimaPos = null;
  var _bussola = false, _segui = false, _giro = 0, _raf = null;
  var _trascina = null, _mosso = false, _puntatori = {}, _fineTrascina = 0;

  function _rad(g){ return g * Math.PI / 180; }
  function _norm(g){ return ((g % 360) + 360) % 360; }
  function _angoloSchermo(){
    try{
      if(screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
      if(typeof window.orientation === 'number') return window.orientation;
    }catch(e){}
    return 0;
  }
  /* direzione in cui guarda l'utente, dagli angoli del telefono */
  function _dirDaAngoli(a, b, g){
    var cA = Math.cos(_rad(a)), sA = Math.sin(_rad(a));
    var cB = Math.cos(_rad(b)), sB = Math.sin(_rad(b));
    var cG = Math.cos(_rad(g||0)), sG = Math.sin(_rad(g||0));
    /* asse alto del telefono proiettato sul piano: vale col telefono steso */
    var altoE = -sA * cB, altoN = cA * cB;
    /* asse della fotocamera posteriore: vale col telefono dritto */
    var retroE = -cA * sG - sA * sB * cG, retroN = -sA * sG + cA * sB * cG;
    var e = altoE + retroE, n = altoN + retroN;
    if(Math.abs(e) + Math.abs(n) < 1e-6) return null;
    return _norm(Math.atan2(e, n) * 180 / Math.PI);
  }
  function _suOrientamento(ev){
    var g = null;
    if(typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading) && ev.webkitCompassHeading >= 0){
      g = ev.webkitCompassHeading;
      _dirIncertezzaIOS = (typeof ev.webkitCompassAccuracy === 'number' && ev.webkitCompassAccuracy >= 0)
        ? ev.webkitCompassAccuracy : null;
    } else if(typeof ev.alpha === 'number' && ev.alpha !== null){
      if(ev.absolute === false && ev.type === 'deviceorientation') return;   // relativo: non è il nord
      g = _dirDaAngoli(ev.alpha, ev.beta || 0, ev.gamma || 0);
    }
    if(g === null) return;
    g = _norm(g + _angoloSchermo());
    clearTimeout(_dirTimeout);
    _dirLetture.push(g); if(_dirLetture.length > 15) _dirLetture.shift();
    /* filtro morbido: media dei vettori, così 359° e 1° non fanno media 180° */
    var k = 0.22, x = Math.sin(_rad(g)), y = Math.cos(_rad(g));
    if(!_dirVett) _dirVett = {x:x, y:y};
    else { _dirVett.x += (x - _dirVett.x) * k; _dirVett.y += (y - _dirVett.y) * k; }
    _dir = _norm(Math.atan2(_dirVett.x, _dirVett.y) * 180 / Math.PI);
    _dirVista = true;
    if(!_raf) _raf = requestAnimationFrame(_disegnaDirezione);
  }
  /* quanto fidarsi: 0 = bussola ferma, 1 = a caso */
  function _incertezza(){
    if(_dirIncertezzaIOS !== null) return Math.min(1, _dirIncertezzaIOS / 60);
    if(_dirLetture.length < 5) return 0.3;
    var sx = 0, sy = 0;
    _dirLetture.forEach(function(g){ sx += Math.sin(_rad(g)); sy += Math.cos(_rad(g)); });
    var r = Math.sqrt(sx*sx + sy*sy) / _dirLetture.length;
    return Math.max(0, Math.min(1, (1 - r) * 8));
  }
  function _avviaDirezione(){
    if(_dirAttiva) return;
    if(typeof DeviceOrientationEvent === 'undefined') return;
    var parti = function(){
      if(_dirAttiva) return;
      _dirAttiva = true;
      if('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', _suOrientamento, true);
      else window.addEventListener('deviceorientation', _suOrientamento, true);
      _dirTimeout = setTimeout(function(){
        if(!_dirVista && _bussola){ _avviso('Questo dispositivo non ha la bussola, o non la rende disponibile al browser'); _spegniBussola(); }
      }, 3500);
    };
    try{
      if(typeof DeviceOrientationEvent.requestPermission === 'function'){
        DeviceOrientationEvent.requestPermission().then(function(esito){
          if(esito === 'granted') parti();
          else _avviso('Senza il permesso alla bussola non posso sapere verso dove guardi');
        }).catch(function(){ _avviso('Il permesso alla bussola va chiesto con un tocco: premi di nuovo'); });
      } else parti();
    }catch(e){}
  }
  function _fermaDirezione(){
    window.removeEventListener('deviceorientationabsolute', _suOrientamento, true);
    window.removeEventListener('deviceorientation', _suOrientamento, true);
    clearTimeout(_dirTimeout);
    if(_raf){ cancelAnimationFrame(_raf); _raf = null; }
    _dirAttiva = false; _dir = null; _dirVett = null; _dirLetture = []; _dirIncertezzaIOS = null; _dirVista = false;
  }

  /* ── il cono sul punto blu ── */
  function _svgCono(){
    return '<svg width="120" height="120" viewBox="-60 -60 120 120" style="overflow:visible;display:block">'
      + '<defs><radialGradient id="mcat-grad" cx="0" cy="0" r="56" gradientUnits="userSpaceOnUse">'
      +   '<stop offset="0" stop-color="#2563EB" stop-opacity=".55"/><stop offset="1" stop-color="#2563EB" stop-opacity="0"/>'
      + '</radialGradient></defs>'
      + '<g class="mcat-cono-giro"><path class="mcat-cono-ventaglio" fill="url(#mcat-grad)" d=""/></g>'
      + '<circle r="8" fill="#2563EB" stroke="#fff" stroke-width="3"/>'
      + '</svg>';
  }
  function _ventaglio(ampiezza){
    var r = 56, m = _rad(ampiezza / 2);
    var x = Math.sin(m) * r, y = -Math.cos(m) * r;
    return 'M0,0 L' + (-x).toFixed(1) + ',' + y.toFixed(1)
      + ' A' + r + ',' + r + ' 0 0,1 ' + x.toFixed(1) + ',' + y.toFixed(1) + ' Z';
  }
  function _disegnaDirezione(){
    _raf = null;
    if(!_map) return;
    var inc = _incertezza();
    if(_mkCono && _dir !== null){
      var el = _mkCono.getElement && _mkCono.getElement();
      if(el){
        var giro = el.querySelector('.mcat-cono-giro'), vent = el.querySelector('.mcat-cono-ventaglio');
        if(giro) giro.setAttribute('transform', 'rotate(' + _dir.toFixed(1) + ')');
        if(vent) vent.setAttribute('d', _ventaglio(30 + inc * 70));
      }
    }
    if(_bussola && _dir !== null) _ruota(_dir);
    var ago = _el('mcat-rosa-ago');
    if(ago) ago.setAttribute('transform', 'rotate(' + (-_giro).toFixed(1) + ')');
    var av = _el('mcat-rosa-av');
    if(av) av.style.display = (_dir !== null && inc > 0.55) ? '' : 'none';
  }

  /* ── posizione continua ── */
  function _suPosizione(p){
    var lat = p.coords.latitude, lon = p.coords.longitude, prec = p.coords.accuracy || 0;
    var prima = !_ultimaPos;
    _ultimaPos = [lat, lon];
    if(!_map) return;
    if(!_cerchio) _cerchio = L.circle([lat,lon], {radius:Math.max(prec,5), color:'#2563EB', weight:1, fillOpacity:.10, interactive:false}).addTo(_map);
    else { _cerchio.setLatLng([lat,lon]); _cerchio.setRadius(Math.max(prec,5)); }
    if(!_mkCono){
      _mkCono = L.marker([lat,lon], {interactive:false, keyboard:false, zIndexOffset:1000,
        icon:L.divIcon({className:'', html:_svgCono(), iconSize:[120,120], iconAnchor:[60,60]})}).addTo(_map);
    } else _mkCono.setLatLng([lat,lon]);
    if(prima){
      _map.setView([lat,lon], Math.max(_map.getZoom(), 18), {animate:false});
      _avviso('Precisione del segnale: circa ' + Math.round(prec) + ' metri' + (prec > 25 ? ' — fra palazzi alti il punto può sbagliare via' : ''));
      setTimeout(function(){ _avviso(''); }, 6000);
    } else if(_segui){
      _map.setView([lat,lon], _map.getZoom(), {animate:false});
    }
    if(!_raf) _raf = requestAnimationFrame(_disegnaDirezione);
  }
  function _avviaPosizione(){
    if(!navigator.geolocation){ _avviso('Questo dispositivo non sa dire dove sei'); return; }
    if(_watchId !== null){
      if(_ultimaPos && _map) _map.setView(_ultimaPos, Math.max(_map.getZoom(), 18), {animate:false});
      return;
    }
    _avviso('Cerco la posizione…');
    _watchId = navigator.geolocation.watchPosition(_suPosizione, function(e){
      _avviso('Posizione non disponibile: ' + (e && e.message ? e.message : 'permesso negato'));
    }, {enableHighAccuracy:true, timeout:20000, maximumAge:5000});
  }
  function _fermaPosizione(){
    if(_watchId !== null && navigator.geolocation){ try{ navigator.geolocation.clearWatch(_watchId); }catch(e){} }
    _watchId = null; _ultimaPos = null; _mkCono = null;
  }

  /* ── la cartina che gira ── */
  function _ruota(g){
    _giro = g;
    var m = _el('mcat-map');
    if(m) m.style.transform = 'rotate(' + (-g).toFixed(2) + 'deg)';
  }
  function _geometria(accesa){
    var vista = _el('mcat-vista'), m = _el('mcat-map');
    if(!vista || !m || !_map) return;
    var centro = _map.getCenter(), zoom = _map.getZoom();
    if(accesa){
      var W = vista.clientWidth, H = vista.clientHeight;
      var Dg = Math.ceil(Math.sqrt(W*W + H*H)) + 4;
      m.style.cssText = 'position:absolute;width:' + Dg + 'px;height:' + Dg + 'px;'
        + 'left:' + Math.round((W - Dg) / 2) + 'px;top:' + Math.round((H - Dg) / 2) + 'px;'
        + 'transform-origin:50% 50%;will-change:transform';
    } else {
      m.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0';
    }
    _map.invalidateSize({pan:false});
    _map.setView(centro, zoom, {animate:false});
  }
  function _schermoAMappa(cx, cy){
    /* punto toccato sullo schermo → punto nel riquadro ruotato */
    var vista = _el('mcat-vista'), m = _el('mcat-map');
    var r = vista.getBoundingClientRect();
    var sx = cx - r.left - r.width / 2, sy = cy - r.top - r.height / 2;
    var a = _rad(_giro);
    var x = sx * Math.cos(a) - sy * Math.sin(a);
    var y = sx * Math.sin(a) + sy * Math.cos(a);
    return L.point(x + m.offsetWidth / 2, y + m.offsetHeight / 2);
  }
  function _giuDito(e){
    if(!_bussola) return;
    _puntatori[e.pointerId] = true;
    if(Object.keys(_puntatori).length > 1){ _trascina = null; return; }   // due dita: zoom di Leaflet
    _trascina = {x:e.clientX, y:e.clientY};
    _mosso = false;
  }
  function _muoviDito(e){
    if(!_bussola || !_trascina || !_map) return;
    var dx = e.clientX - _trascina.x, dy = e.clientY - _trascina.y;
    if(!_mosso && Math.abs(dx) + Math.abs(dy) < 6) return;
    if(!_mosso){ _mosso = true; _segui = false; _aggiornaPulsanti(); }
    _trascina = {x:e.clientX, y:e.clientY};
    var a = _rad(_giro);
    var x = dx * Math.cos(a) - dy * Math.sin(a);
    var y = dx * Math.sin(a) + dy * Math.cos(a);
    _map.panBy([-x, -y], {animate:false});
  }
  function _suDito(e){
    delete _puntatori[e.pointerId];
    if(_mosso) _fineTrascina = Date.now();
    _mosso = false;
    if(!Object.keys(_puntatori).length) _trascina = null;
  }
  function _toccoRuotato(e){
    if(!_bussola || !_map) return;
    /* il "clic" che alcuni telefoni mandano alla fine di un trascinamento non
       è un tocco sulla particella */
    if(Date.now() - _fineTrascina < 350) return;
    var lat = _map.containerPointToLatLng(_schermoAMappa(e.clientX, e.clientY));
    _clicMappa({latlng:lat});
  }
  function _accendiBussola(){
    if(!_map) return;
    _bussola = true; _segui = true;
    _avviaDirezione();
    _avviaPosizione();
    _map.off('click', _clicMappa);
    if(_map.dragging) _map.dragging.disable();
    if(_map.doubleClickZoom) _map.doubleClickZoom.disable();
    _map.options.touchZoom = 'center';
    var w = _el('mcat-wrap'); if(w) w.classList.add('mcat-ruota');
    _geometria(true);
    if(_ultimaPos) _map.setView(_ultimaPos, Math.max(_map.getZoom(), 18), {animate:false});
    if(_dir !== null) _ruota(_dir);
    _aggiornaPulsanti();
    _disegnaDirezione();
    _programmaAggiornamento();
  }
  function _spegniBussola(){
    _bussola = false; _segui = false;
    _ruota(0); _giro = 0;
    if(_map){
      _map.on('click', _clicMappa);
      if(_map.dragging) _map.dragging.enable();
      if(_map.doubleClickZoom) _map.doubleClickZoom.enable();
      _map.options.touchZoom = true;
      var w = _el('mcat-wrap'); if(w) w.classList.remove('mcat-ruota');
      _geometria(false);
      _programmaAggiornamento();
    }
    _aggiornaPulsanti();
    _disegnaDirezione();
  }
  function _aggiornaPulsanti(){
    var b = _el('mcat-btn-bussola');
    if(b){
      b.className = _bussola ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
      b.lastChild.nodeValue = _bussola ? ' Bussola accesa' : ' Bussola';
    }
    var s = _el('mcat-segui');
    if(s) s.style.display = (_bussola && !_segui) ? '' : 'none';
    var bs = _el('mcat-btn-strati');
    if(bs){
      var quanti = STRATI.filter(function(x){ return _strOn[x.id]; }).length;
      bs.className = (quanti || _strPan) ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
      bs.textContent = quanti ? ('Strati (' + quanti + ')') : 'Strati';
    }
    var bd = _el('mcat-btn-domanda');
    if(bd) bd.className = _domanda ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  }
  window._mcatBussola = function(){ if(_bussola) _spegniBussola(); else _accendiBussola(); };
  window._mcatNord = function(){ if(_bussola) _spegniBussola(); };
  window._mcatSegui = function(){
    _segui = true;
    if(_ultimaPos && _map) _map.setView(_ultimaPos, _map.getZoom(), {animate:false});
    _aggiornaPulsanti();
  };
  window._mcatZoom = function(d){ if(_map) _map.setZoom(_map.getZoom() + d); };
  /* il telefono girato in orizzontale cambia la forma del riquadro */
  function _suRidimensiona(){ if(_bussola) setTimeout(function(){ _geometria(true); if(_dir !== null) _ruota(_dir); }, 250); }

  function _telefono(){
    try{ return window.matchMedia && window.matchMedia('(pointer:coarse)').matches; }catch(e){ return false; }
  }

  /* ════════════════════════════════════════════════════════════════════════
     STRATI DI RISCHIO E VINCOLO                              [17 set 2026]
     ------------------------------------------------------------------------
     Chiesto da Enzo: vedere sulla cartina dove stanno gli immobili rispetto
     a frane, alluvioni, aree tutelate. Funzionano come il catasto: il server
     pubblico manda un'immagine del riquadro inquadrato e la mappa la
     sovrappone.
     COSA C'È E COSA NO, provato servizio per servizio dal browser:
     · ISPRA (sinacloud) e Agenzia Europea dell'Ambiente rispondono e si
       lasciano anche INTERROGARE, quindi il tocco può dire in che classe
       cade un punto;
     · la Regione Campania non risponde (vincolo idrogeologico, parchi
       regionali, carta tematica): niente da fare per ora;
     · il vincolo paesaggistico del Ministero (SITAP) è pubblicato solo in
       http e da una pagina https il browser lo blocca;
     · la cartella Geologia dell'ISPRA su quel server è vuota.
     NON È UNA CERTIFICAZIONE: sono mosaicature nazionali, utili a capire e a
     sapere cosa chiedere. Il vincolo vero sta nel PAI vigente dell'Autorità
     di Bacino e nel certificato di destinazione urbanistica.
     ════════════════════════════════════════════════════════════════════════ */
  var SINA = 'https://sinacloud.isprambiente.it/arcgisina/rest/services/';
  var EEA  = 'https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/';
  /* [17 set 2026] il catalogo vive nel monolite, perché lo usa anche la Mappa
     Immobili: così un indirizzo che cambia si corregge in un posto solo. La
     copia qui sotto serve solo se il monolite fosse più vecchio del modulo. */
  var STRATI = (window.GEO_STRATI && window.GEO_STRATI.length) ? window.GEO_STRATI : [
    {id:'frane', nome:'Frane — pericolosità PAI', fonte:'ISPRA, mosaicatura nazionale dei PAI',
     base:SINA + 'PAI_Frane/Aree_pericolosita_frana_PAI/MapServer', interroga:true,
     nota:'cinque classi: P4 molto elevata, P3 elevata, P2 media, P1 moderata, AA attenzione'},
    {id:'alluvioni', nome:'Alluvioni — pericolosità idraulica', fonte:'ISPRA, direttiva alluvioni',
     base:SINA + 'Alluvioni/Aree_pericolosita_idraulica_/MapServer', interroga:true,
     nota:'tre scenari: P3 frequenti, P2 poco frequenti, P1 rare'},
    {id:'iffi', nome:'Frane censite (IFFI)', fonte:'ISPRA, inventario dei fenomeni franosi',
     base:SINA + 'iffi/Progetto_IFFI_WMS_public/MapServer', interroga:true,
     nota:'le frane realmente rilevate, non le zone di piano'},
    {id:'natura', nome:'Natura 2000', fonte:'Agenzia Europea dell\'Ambiente',
     base:EEA + 'Natura2000_Dyna_WM/MapServer', interroga:true,
     nota:'siti di importanza comunitaria e zone di protezione speciale'},
    {id:'protette', nome:'Aree protette nazionali', fonte:'Agenzia Europea dell\'Ambiente',
     base:EEA + 'CDDAv18_Dyna_WM/MapServer', interroga:false,
     nota:'parchi e riserve: carta a griglia, dice se sì o no ma non il nome'},
    {id:'coste', nome:'Coste', fonte:'ISPRA',
     base:SINA + 'coste/coste/MapServer', interroga:true,
     nota:'linea di costa ed erosione'},
    {id:'habitat', nome:'Habitat naturali', fonte:'ISPRA, carta degli habitat',
     base:SINA + 'Natura/Carta_degli_Habitat_scala_1_50_000_e_1_25_000/MapServer', interroga:false,
     nota:'copre tutto a tinte piene: tienilo trasparente'}
  ];

  /* ════════════════════════════════════════════════════════════════════════
     [25 set 2026] PAESTUM — FASCIA DELLA LEGGE 220/1957        (INDICATIVA)
     La legge (art. 1) crea una zona di rispetto profonda 1.000 metri
     all'ESTERNO DELLA CINTA MURARIA dell'antica Paestum (non dai templi);
     art. 2: lì, come dentro le mura, è vietato ogni fabbricato in muratura.
     Nessun servizio pubblico la pubblica (il SITAP del Ministero è solo in
     http e il browser lo blocca), quindi è DISEGNATA QUI:
     · mura: OpenStreetMap, 11 tratti barrier=city_wall scaricati da Enzo il
       25 set 2026. Ogni tratto è una striscia chiusa (faccia interna ed
       esterna del muro): per questo la somma fa 9.108 m e il circuito ~4,5 km;
     · fascia: calcolata una volta per tutte (720 direzioni dal centro, punto
       a 1.000 m esatti dal muro più vicino, poi uno su due = 360 punti).
       Verificato: scarto 0,00 m sui punti, 13 cm al massimo a metà lato,
       0 errori su 3.000 punti a caso.
     È uno strato DISEGNATO (vettore:true), non un'immagine: vive solo in
     questo modulo e NON va messo in GEO_STRATI del monolite, che usa anche
     la Mappa Immobili e sa trattare solo immagini.
     NON È UNA CERTIFICAZIONE: fa fede il certificato di destinazione
     urbanistica del Comune di Capaccio Paestum.
     ════════════════════════════════════════════════════════════════════════ */
  var L220_FASCIA = [[40.422303,15.025377],[40.422583,15.025347],[40.422862,15.025305],[40.423141,15.025278],[40.423421,15.025257],[40.4237,15.025236],[40.42398,15.025216],[40.42426,15.025197],[40.424541,15.025178],[40.424823,15.025158],[40.425106,15.025136],[40.425391,15.025122],[40.425677,15.025107],[40.425963,15.025079],[40.426248,15.025042],[40.426533,15.024994],[40.426817,15.024934],[40.427099,15.024863],[40.427379,15.024779],[40.427657,15.024684],[40.427933,15.024578],[40.428206,15.02446],[40.428478,15.024336],[40.428748,15.024204],[40.429015,15.024063],[40.429278,15.023911],[40.429538,15.023749],[40.429795,15.02358],[40.430048,15.023401],[40.430297,15.023211],[40.430541,15.023011],[40.43078,15.022802],[40.431014,15.022582],[40.431245,15.022361],[40.431476,15.022139],[40.431706,15.021915],[40.431934,15.02169],[40.432161,15.021463],[40.432383,15.021229],[40.432604,15.020991],[40.432822,15.020751],[40.433037,15.020506],[40.433246,15.020252],[40.433449,15.01999],[40.433646,15.019719],[40.433835,15.019441],[40.434018,15.019155],[40.434194,15.018862],[40.434362,15.018561],[40.434524,15.018254],[40.434677,15.017941],[40.434823,15.017622],[40.434961,15.017297],[40.435091,15.016967],[40.435213,15.016632],[40.435327,15.016292],[40.435432,15.015948],[40.435529,15.0156],[40.435618,15.015249],[40.435698,15.014895],[40.435769,15.014537],[40.435832,15.014178],[40.435886,15.013816],[40.435931,15.013453],[40.435967,15.013089],[40.435995,15.012724],[40.436014,15.012358],[40.436026,15.011993],[40.43603,15.011629],[40.436025,15.011266],[40.436012,15.010904],[40.435991,15.010543],[40.435976,15.01019],[40.435964,15.009843],[40.435954,15.0095],[40.435943,15.009162],[40.435932,15.008827],[40.435921,15.008495],[40.435911,15.008167],[40.435899,15.007841],[40.435887,15.007518],[40.435872,15.007197],[40.435863,15.00688],[40.435851,15.006564],[40.435838,15.006249],[40.435822,15.005936],[40.435811,15.005625],[40.435795,15.005316],[40.435796,15.005008],[40.435793,15.0047],[40.435786,15.004393],[40.435773,15.004086],[40.435754,15.00378],[40.435729,15.003475],[40.435703,15.00317],[40.43569,15.002865],[40.435678,15.002559],[40.435665,15.002252],[40.435654,15.001945],[40.435643,15.001636],[40.435629,15.001327],[40.43561,15.001018],[40.435584,15.00071],[40.435551,15.000402],[40.435513,15.000095],[40.435468,14.99979],[40.435418,14.999486],[40.435361,14.999184],[40.435302,14.998882],[40.435247,14.998577],[40.435186,14.998275],[40.435119,14.997974],[40.435045,14.997676],[40.434965,14.99738],[40.434879,14.997087],[40.434788,14.996797],[40.434691,14.996509],[40.434588,14.996226],[40.434479,14.995945],[40.434365,14.995669],[40.434245,14.995397],[40.43412,14.995128],[40.43399,14.994864],[40.433854,14.994605],[40.433713,14.994351],[40.433568,14.994101],[40.433418,14.993856],[40.433264,14.993616],[40.433105,14.993381],[40.432942,14.993152],[40.432774,14.992928],[40.432603,14.99271],[40.432427,14.992498],[40.432247,14.992293],[40.432064,14.992094],[40.431876,14.991901],[40.431685,14.991716],[40.431491,14.991536],[40.431294,14.991363],[40.431094,14.991197],[40.430891,14.991039],[40.430686,14.990886],[40.43048,14.990737],[40.430275,14.990588],[40.430072,14.990441],[40.429868,14.990295],[40.429667,14.990147],[40.429466,14.990001],[40.429265,14.989854],[40.429066,14.989706],[40.428866,14.989561],[40.428669,14.989408],[40.428477,14.989242],[40.428338,14.988937],[40.428192,14.988637],[40.428039,14.988341],[40.427879,14.988052],[40.427711,14.987767],[40.427537,14.987489],[40.427355,14.987218],[40.427167,14.986953],[40.426973,14.986695],[40.426772,14.986445],[40.426565,14.986203],[40.426352,14.985968],[40.426133,14.985742],[40.425908,14.985524],[40.425678,14.985315],[40.425443,14.985115],[40.425203,14.984925],[40.424958,14.984744],[40.424708,14.984573],[40.424455,14.984412],[40.424197,14.984262],[40.423935,14.984121],[40.42367,14.983992],[40.423402,14.983873],[40.423131,14.983765],[40.422857,14.983668],[40.422581,14.983582],[40.422303,14.983508],[40.422022,14.983445],[40.42174,14.983394],[40.421457,14.983354],[40.421173,14.983326],[40.420889,14.983309],[40.420604,14.983304],[40.420319,14.983311],[40.420034,14.98333],[40.419749,14.98336],[40.419466,14.983402],[40.419183,14.983456],[40.418902,14.983521],[40.418623,14.983595],[40.418345,14.983681],[40.418069,14.983779],[40.417796,14.983888],[40.417524,14.984001],[40.417244,14.984078],[40.416965,14.984166],[40.416688,14.984265],[40.416411,14.984369],[40.416129,14.984457],[40.415844,14.984539],[40.415559,14.984631],[40.415277,14.984734],[40.414997,14.984849],[40.41472,14.984976],[40.414446,14.985114],[40.414176,14.985264],[40.41391,14.985426],[40.413647,14.985599],[40.41339,14.985782],[40.413136,14.985977],[40.412888,14.986182],[40.412645,14.986398],[40.412408,14.986624],[40.412176,14.986859],[40.41195,14.987105],[40.411731,14.98736],[40.411518,14.987624],[40.411312,14.987896],[40.411113,14.988178],[40.41092,14.988467],[40.410736,14.988765],[40.410558,14.98907],[40.410389,14.989382],[40.410227,14.989701],[40.410074,14.990027],[40.409929,14.990358],[40.409792,14.990696],[40.409664,14.991039],[40.409544,14.991387],[40.409433,14.991739],[40.409331,14.992096],[40.409238,14.992457],[40.409153,14.992821],[40.409078,14.993188],[40.409013,14.993558],[40.408956,14.993929],[40.408908,14.994303],[40.40887,14.994678],[40.408841,14.995054],[40.408822,14.995431],[40.408811,14.995807],[40.40881,14.996184],[40.408801,14.99655],[40.408788,14.996908],[40.408774,14.997261],[40.40876,14.99761],[40.408739,14.997952],[40.408701,14.998282],[40.408669,14.998613],[40.408644,14.998945],[40.408627,14.999277],[40.408617,14.999608],[40.408614,14.99994],[40.408619,15.000271],[40.40863,15.000601],[40.408626,15.000924],[40.408609,15.001243],[40.408592,15.00156],[40.40858,15.001877],[40.408575,15.002194],[40.408577,15.002511],[40.408585,15.002827],[40.4086,15.003143],[40.408621,15.003457],[40.408649,15.003771],[40.408682,15.004083],[40.408717,15.004393],[40.408752,15.004702],[40.408785,15.005009],[40.408814,15.005315],[40.40885,15.00562],[40.408891,15.005924],[40.408938,15.006226],[40.408992,15.006525],[40.409051,15.006823],[40.409116,15.007118],[40.409187,15.00741],[40.409255,15.007702],[40.409325,15.007992],[40.4094,15.00828],[40.409481,15.008564],[40.409567,15.008845],[40.409657,15.009124],[40.409721,15.009412],[40.409736,15.00972],[40.409758,15.010029],[40.409786,15.010337],[40.409821,15.010645],[40.409845,15.01096],[40.409857,15.011286],[40.409869,15.011616],[40.409882,15.01195],[40.409894,15.012289],[40.409907,15.012634],[40.409918,15.012985],[40.40993,15.013341],[40.409943,15.013703],[40.409965,15.014065],[40.409996,15.014427],[40.410031,15.014791],[40.410072,15.015157],[40.410118,15.015525],[40.41017,15.015894],[40.410232,15.016261],[40.410302,15.016626],[40.410382,15.016988],[40.41047,15.017348],[40.410567,15.017703],[40.410673,15.018055],[40.410788,15.018403],[40.410912,15.018745],[40.411044,15.019083],[40.411184,15.019416],[40.411332,15.019742],[40.411489,15.020063],[40.411654,15.020377],[40.411826,15.020684],[40.412006,15.020984],[40.412193,15.021276],[40.412388,15.02156],[40.412589,15.021836],[40.412798,15.022104],[40.413012,15.022365],[40.413232,15.022618],[40.413458,15.022861],[40.41369,15.023095],[40.413928,15.023319],[40.414171,15.023533],[40.41442,15.023736],[40.414674,15.023929],[40.414932,15.024111],[40.415195,15.024282],[40.415461,15.024441],[40.415732,15.02459],[40.416006,15.024726],[40.416284,15.024852],[40.416564,15.024965],[40.416847,15.025066],[40.417132,15.025156],[40.417419,15.025233],[40.417708,15.025299],[40.417997,15.025357],[40.418288,15.025403],[40.418579,15.025438],[40.41887,15.02546],[40.419162,15.025472],[40.419453,15.02548],[40.419743,15.025482],[40.420032,15.025476],[40.42032,15.025459],[40.420607,15.025439],[40.420893,15.025419],[40.421177,15.025399],[40.421458,15.025409],[40.42174,15.025408],[40.422022,15.025397]];
  var L220_MURA = [[[40.421488,14.997101],[40.421569,14.997266],[40.421768,14.997665],[40.42193,14.997808],[40.421911,14.997839],[40.422026,14.997938],[40.422042,14.997906],[40.422707,14.99849],[40.423145,14.998879],[40.423362,14.99907],[40.423354,14.999093],[40.423415,14.999134],[40.423483,14.999185],[40.423751,14.999414],[40.423751,14.99942],[40.423753,14.999439],[40.423761,14.999456],[40.423772,14.999468],[40.423785,14.999476],[40.423799,14.999477],[40.423814,14.999473],[40.423818,14.999469],[40.42383,14.999477],[40.424249,14.99978],[40.424602,15.000044],[40.42485,15.000224],[40.424987,15.000324],[40.424973,15.000359],[40.425108,15.000456],[40.425121,15.000424],[40.425188,15.000473],[40.425498,15.0007],[40.425556,15.000743],[40.425668,15.00082],[40.42569,15.000766],[40.42515,15.000371],[40.424902,15.000192],[40.424665,15.000014],[40.424247,14.999712],[40.423841,14.999414],[40.423841,14.999409],[40.423836,14.99939],[40.423826,14.999374],[40.423813,14.999363],[40.423798,14.999359],[40.423783,14.999361],[40.423778,14.999365],[40.423411,14.999043],[40.423259,14.998903],[40.423041,14.998711],[40.422245,14.99801],[40.421796,14.997621],[40.421526,14.997068],[40.421488,14.997101]],[[40.426781,15.01186],[40.426701,15.011952],[40.426661,15.011997],[40.426519,15.012141],[40.426279,15.012375],[40.42602,15.012635],[40.425866,15.012774],[40.425581,15.013043],[40.425585,15.013053],[40.425469,15.01313],[40.425464,15.01312],[40.425384,15.013166],[40.425385,15.013174],[40.425291,15.013209],[40.425156,15.013229],[40.424996,15.013244],[40.424823,15.013253],[40.424603,15.013267],[40.424482,15.01328],[40.424371,15.013292],[40.424154,15.013297],[40.422465,15.013426],[40.42231,15.013438],[40.422102,15.01345],[40.421754,15.013471],[40.421753,15.013434],[40.421687,15.013437],[40.421687,15.013478],[40.42167,15.013478],[40.421671,15.013555],[40.421635,15.013556],[40.421605,15.013558],[40.421604,15.013478],[40.421572,15.013479],[40.421571,15.013426],[40.42156,15.013426],[40.421559,15.013378],[40.421549,15.013379],[40.421549,15.01343],[40.421523,15.01343],[40.421524,15.013499],[40.421489,15.0135],[40.421489,15.013467],[40.421439,15.013471],[40.421439,15.013488],[40.421195,15.013504],[40.420664,15.013537],[40.420664,15.013501],[40.420533,15.013508],[40.420534,15.013547],[40.419978,15.013585],[40.419977,15.013549],[40.419863,15.013557],[40.419865,15.013591],[40.419775,15.013597],[40.419714,15.013607],[40.419485,15.013606],[40.419433,15.013604],[40.419248,15.013596],[40.419157,15.013559],[40.419158,15.013556],[40.419094,15.013476],[40.419057,15.013251],[40.419039,15.013013],[40.419034,15.012803],[40.419009,15.012804],[40.418979,15.011998],[40.418954,15.011266],[40.41888,15.009316],[40.418867,15.008926],[40.418904,15.008925],[40.418904,15.008896],[40.418866,15.008896],[40.418859,15.008718],[40.418853,15.008682],[40.418851,15.008657],[40.418861,15.008653],[40.418854,15.008578],[40.418839,15.008578],[40.418826,15.008235],[40.418817,15.007974],[40.418775,15.007055],[40.418799,15.007053],[40.418795,15.006974],[40.418719,15.006982],[40.418737,15.007385],[40.418758,15.00765],[40.418765,15.007852],[40.41879,15.008686],[40.418749,15.008688],[40.418752,15.008791],[40.418819,15.008788],[40.418838,15.009315],[40.418875,15.010305],[40.418937,15.011977],[40.418965,15.01281],[40.418969,15.012958],[40.418997,15.01325],[40.419014,15.013386],[40.419023,15.013449],[40.419049,15.013538],[40.419035,15.013559],[40.419099,15.013638],[40.419109,15.013623],[40.419218,15.013665],[40.419254,15.013671],[40.4195,15.01368],[40.419745,15.013682],[40.420177,15.013652],[40.420583,15.013624],[40.420763,15.013611],[40.421074,15.013594],[40.421588,15.013564],[40.421589,15.01361],[40.421615,15.013609],[40.421636,15.013608],[40.421685,15.013605],[40.421684,15.013556],[40.422139,15.013533],[40.422267,15.013524],[40.423389,15.01344],[40.423563,15.013428],[40.424389,15.013372],[40.424824,15.013336],[40.425159,15.013307],[40.425161,15.013326],[40.425231,15.013317],[40.425229,15.01329],[40.425295,15.013278],[40.425408,15.013237],[40.425492,15.013195],[40.425612,15.013118],[40.426023,15.012725],[40.42631,15.012445],[40.426569,15.01219],[40.42681,15.011931],[40.426781,15.01186]],[[40.421182,14.996526],[40.421214,14.996496],[40.421147,14.996421],[40.421151,14.996414],[40.421156,14.996397],[40.421157,14.996382],[40.421154,14.996368],[40.421148,14.996355],[40.42114,14.996344],[40.421129,14.996337],[40.421117,14.996335],[40.421104,14.996337],[40.421093,14.996345],[40.421083,14.996357],[40.421072,14.996358],[40.421078,14.996203],[40.421019,14.9962],[40.421019,14.996248],[40.421044,14.996249],[40.42104,14.996364],[40.42102,14.996363],[40.42102,14.996407],[40.42108,14.996409],[40.421087,14.996424],[40.421096,14.996433],[40.421107,14.996439],[40.421118,14.99644],[40.421129,14.996473],[40.421182,14.996526]],[[40.418702,15.005852],[40.418707,15.005846],[40.418714,15.005828],[40.418715,15.005798],[40.418709,15.00578],[40.418698,15.005764],[40.418693,15.005761],[40.41864,15.00541],[40.418492,15.005084],[40.418333,15.005109],[40.418307,15.004976],[40.418278,15.004921],[40.418369,15.004897],[40.418354,15.004818],[40.418312,15.004829],[40.418318,15.004856],[40.41824,15.004884],[40.418232,15.004853],[40.418195,15.004859],[40.418215,15.004929],[40.418225,15.004948],[40.418219,15.004952],[40.418251,15.005021],[40.418287,15.004991],[40.418308,15.005164],[40.418383,15.005164],[40.418453,15.005124],[40.418607,15.005443],[40.41865,15.00576],[40.418643,15.005765],[40.418633,15.00578],[40.418627,15.005799],[40.418627,15.00582],[40.418631,15.005837],[40.41864,15.005854],[40.418652,15.005864],[40.418659,15.005866],[40.41872,15.006815],[40.41877,15.006812],[40.418769,15.006739],[40.418756,15.006741],[40.418702,15.005852]],[[40.418344,14.995901],[40.417929,14.996035],[40.417927,14.996022],[40.417853,14.996045],[40.417869,14.996148],[40.417828,14.997305],[40.417793,14.998181],[40.417762,14.999064],[40.417731,14.999863],[40.417694,14.999861],[40.417658,14.999908],[40.417693,14.999954],[40.417727,14.999957],[40.417716,15.000251],[40.417671,15.001342],[40.417619,15.002268],[40.41778,15.003705],[40.417774,15.003709],[40.417803,15.003777],[40.41782,15.003768],[40.417937,15.004308],[40.417919,15.004319],[40.417948,15.004411],[40.417998,15.004372],[40.417966,15.004286],[40.417974,15.004282],[40.417856,15.00374],[40.417851,15.003742],[40.417825,15.003677],[40.41782,15.003681],[40.417802,15.003527],[40.4178,15.003509],[40.417782,15.003354],[40.417664,15.002267],[40.417709,15.001371],[40.417721,15.00112],[40.417799,14.999197],[40.417842,14.997961],[40.417862,14.997411],[40.41791,14.99612],[40.417936,14.996114],[40.417932,14.996088],[40.418357,14.995957],[40.418344,14.995901]],[[40.42662,15.00299],[40.426634,15.003273],[40.426595,15.003279],[40.426598,15.003337],[40.426637,15.003338],[40.426643,15.003637],[40.426605,15.003641],[40.426619,15.003898],[40.426642,15.004603],[40.426662,15.004938],[40.426625,15.004933],[40.426625,15.00496],[40.426601,15.00496],[40.426599,15.005043],[40.426635,15.005047],[40.426636,15.005013],[40.426749,15.005026],[40.426752,15.00499],[40.426752,15.00498],[40.426751,15.004898],[40.426719,15.004903],[40.426718,15.004873],[40.426673,15.003826],[40.426639,15.002986],[40.426632,15.002987],[40.42662,15.00299]],[[40.418392,14.995947],[40.419139,14.9957],[40.419144,14.995734],[40.419258,14.995699],[40.419254,14.995675],[40.420424,14.995294],[40.420614,14.995239],[40.420667,14.995664],[40.420714,14.996045],[40.420819,14.996153],[40.420898,14.996233],[40.420895,14.996315],[40.420916,14.996316],[40.420913,14.996402],[40.420929,14.996403],[40.420965,14.996405],[40.420966,14.996363],[40.420947,14.996363],[40.420948,14.996244],[40.420973,14.996245],[40.420973,14.996198],[40.420916,14.996198],[40.420741,14.996031],[40.420716,14.995837],[40.420632,14.995186],[40.420641,14.995182],[40.420628,14.995104],[40.420572,14.995118],[40.420586,14.995189],[40.419245,14.995617],[40.419239,14.995587],[40.419153,14.995618],[40.41916,14.995646],[40.418776,14.995764],[40.418376,14.995889],[40.418392,14.995947]],[[40.426634,15.002918],[40.426608,15.002154],[40.426515,15.001733],[40.426474,15.001441],[40.426463,15.001408],[40.42645,15.001381],[40.426399,15.001298],[40.426378,15.00127],[40.426348,15.001242],[40.426254,15.001172],[40.426229,15.001229],[40.426336,15.001305],[40.426364,15.001337],[40.426386,15.001374],[40.426433,15.001462],[40.426464,15.001736],[40.426555,15.002125],[40.426557,15.002184],[40.426525,15.002186],[40.426527,15.002277],[40.426559,15.002276],[40.426582,15.002921],[40.426634,15.002918]],[[40.425706,15.000775],[40.425681,15.000833],[40.426215,15.001218],[40.42624,15.001162],[40.425706,15.000775]],[[40.426834,15.011807],[40.426836,15.011892],[40.42688,15.011846],[40.426975,15.011739],[40.426983,15.01174],[40.426986,15.011636],[40.426975,15.011636],[40.426955,15.011218],[40.426947,15.010871],[40.426934,15.010512],[40.426918,15.009999],[40.426896,15.009324],[40.426874,15.008631],[40.426855,15.008127],[40.426839,15.007837],[40.426828,15.007386],[40.426811,15.006971],[40.426792,15.006687],[40.426775,15.006353],[40.426784,15.006352],[40.426781,15.006278],[40.426772,15.006278],[40.426751,15.00583],[40.426744,15.005367],[40.426737,15.005239],[40.426666,15.005277],[40.42667,15.005329],[40.4267,15.005839],[40.426726,15.006277],[40.426739,15.006656],[40.426713,15.006657],[40.42672,15.006842],[40.426748,15.006839],[40.426749,15.006879],[40.42675,15.006976],[40.426779,15.007579],[40.426788,15.007842],[40.426801,15.008239],[40.426831,15.009062],[40.426837,15.009319],[40.426858,15.009892],[40.426876,15.010518],[40.426903,15.011207],[40.426913,15.011525],[40.426883,15.011523],[40.426889,15.011621],[40.426906,15.011633],[40.426903,15.011738],[40.426875,15.011736],[40.426834,15.011807]],[[40.418113,15.004638],[40.418102,15.004648],[40.418092,15.004663],[40.418087,15.004676],[40.418085,15.004692],[40.418086,15.004708],[40.41809,15.004723],[40.418095,15.004734],[40.418101,15.004743]]];
  STRATI = STRATI.concat([
    {id:'l220', vettore:true, nome:'Paestum — fascia legge 220/1957',
     fonte:'mura da OpenStreetMap, fascia di 1.000 m calcolata',
     nota:'vietato costruire entro le mura e fino a 1.000 m da esse. Disegno indicativo'}
  ]);
  /* distanza in metri dal muro più vicino e "dentro l'area vincolata" */
  var _l220Seg = null;
  function _l220Metri(lat, lng){ return [(lng - 15.0045) * 111320 * Math.cos(40.4225 * Math.PI / 180), (lat - 40.4225) * 110574]; }
  function _l220Distanza(lat, lng){
    if(!_l220Seg){
      _l220Seg = [];
      L220_MURA.forEach(function(t){
        for(var i = 1; i < t.length; i++) _l220Seg.push([_l220Metri(t[i-1][0], t[i-1][1]), _l220Metri(t[i][0], t[i][1])]);
      });
    }
    var p = _l220Metri(lat, lng), m = Infinity;
    _l220Seg.forEach(function(sg){
      var ax = sg[0][0], ay = sg[0][1], dx = sg[1][0] - ax, dy = sg[1][1] - ay;
      var q = dx * dx + dy * dy, t = q ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / q)) : 0;
      var ex = p[0] - ax - t * dx, ey = p[1] - ay - t * dy;
      m = Math.min(m, ex * ex + ey * ey);
    });
    return Math.sqrt(m);
  }
  function _l220Dentro(lat, lng){
    var c = false, P = L220_FASCIA;
    for(var i = 0, j = P.length - 1; i < P.length; j = i++){
      if((P[i][0] > lat) !== (P[j][0] > lat)
         && lng < (P[j][1] - P[i][1]) * (lat - P[i][0]) / (P[j][0] - P[i][0]) + P[i][1]) c = !c;
    }
    return c;
  }
  function _l220Esito(latlng){
    var d = Math.round(_l220Distanza(latlng.lat, latlng.lng));
    var n = d.toLocaleString('it-IT');
    return _l220Dentro(latlng.lat, latlng.lng)
      ? 'DENTRO l\'area vincolata (a ' + n + ' m dal muro più vicino) — indicativo, fa fede il CDU del Comune'
      : 'fuori (a ' + n + ' m dal muro più vicino, il limite è a 1.000 m)';
  }
  function _l220Disegna(){
    var g = L.layerGroup();
    L.polygon(L220_FASCIA, {pane:'mcatVettori', interactive:false, color:'#991B1B', weight:2.5,
      dashArray:'8 6', fillColor:'#DC2626', fillOpacity:0.12}).addTo(g);
    L220_MURA.forEach(function(t){
      L.polyline(t, {pane:'mcatVettori', interactive:false, color:'#7F1D1D', weight:3, opacity:0.9}).addTo(g);
    });
    return g;
  }
  var _strOn = {}, _strOv = {}, _strOpac = 0.55, _strPan = false, _domanda = false;

  /* [17 set 2026] la costruzione dell'indirizzo sta nel monolite, perché
     chiede l'immagine nella proiezione della mappa (Mercatore): chiederla in
     gradi faceva scivolare lo strato in verticale. La copia qui sotto vale
     solo se il monolite fosse più vecchio del modulo. */
  function _urlStrato(s, b, w, h){
    if(typeof window.geoStratoUrl === 'function') return window.geoStratoUrl(s, b, w, h);
    var bbox, sr;
    try{
      var sw = L.CRS.EPSG3857.project(b.getSouthWest());
      var ne = L.CRS.EPSG3857.project(b.getNorthEast());
      bbox = sw.x + ',' + sw.y + ',' + ne.x + ',' + ne.y; sr = '3857';
    }catch(e){
      bbox = b.getWest() + ',' + b.getSouth() + ',' + b.getEast() + ',' + b.getNorth(); sr = '4326';
    }
    return s.base + '/export?bbox=' + bbox + '&bboxSR=' + sr + '&imageSR=' + sr
      + '&size=' + w + ',' + h + '&format=png32&transparent=true&f=image';
  }
  function _aggiornaStrati(){
    if(!_map) return;
    var b = _map.getBounds(), s = _map.getSize();
    var w = Math.max(256, Math.min(1600, Math.round(s.x)));
    var h = Math.max(256, Math.min(1600, Math.round(s.y)));
    STRATI.forEach(function(st){
      if(!_strOn[st.id]){
        if(_strOv[st.id]){ try{ _map.removeLayer(_strOv[st.id]); }catch(e){} _strOv[st.id] = null; }
        return;
      }
      /* [25 set 2026] strato disegnato: si crea una volta, non si richiede
         a ogni spostamento della mappa */
      if(st.vettore){
        if(!_strOv[st.id]){ try{ _strOv[st.id] = _l220Disegna().addTo(_map); }catch(e){} }
        return;
      }
      var url = _urlStrato(st, b, w, h);
      var img = new Image();
      /* la nuova immagine sostituisce la vecchia solo quando è arrivata, così
         lo strato non sparisce mentre il server risponde */
      img.onload = function(){
        if(!_map || !_strOn[st.id]) return;
        try{
          var nuovo = L.imageOverlay(url, b, {opacity:_strOpac, interactive:false});
          nuovo.addTo(_map);
          if(_strOv[st.id]) _map.removeLayer(_strOv[st.id]);
          _strOv[st.id] = nuovo;
          if(_ov && _ov.bringToFront) _ov.bringToFront();   /* il catasto resta sopra */
        }catch(e){}
      };
      img.onerror = function(){ _avviso('Lo strato "' + st.nome + '" non risponde in questo momento'); };
      img.src = url;
    });
  }
  window._mcatStrato = function(id, acceso){
    _strOn[id] = !!acceso;
    _aggiornaStrati();
    _aggiornaPulsanti();
  };
  window._mcatOpacita = function(v){
    _strOpac = Math.max(0.1, Math.min(1, (+v || 55) / 100));
    Object.keys(_strOv).forEach(function(k){
      if(_strOv[k] && _strOv[k].setOpacity) _strOv[k].setOpacity(_strOpac);
    });
  };
  window._mcatPannello = function(v){
    _strPan = (v === undefined) ? !_strPan : !!v;
    var p = _el('mcat-strati');
    if(p) p.style.display = _strPan ? '' : 'none';
    _aggiornaPulsanti();
  };
  window._mcatDomanda = function(){
    _domanda = !_domanda;
    _avviso(_domanda ? 'Tocca un punto: ti dico cosa dicono gli strati accesi' : '');
    _aggiornaPulsanti();
  };
  function _pannelloStrati(){
    return '<div id="mcat-strati" style="display:none;position:absolute;left:10px;top:10px;z-index:901;'
      + 'width:270px;max-height:calc(100% - 20px);overflow:auto;background:var(--bg2);border:1px solid var(--border);'
      + 'border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.2);padding:12px 14px;font-size:0.82rem">'
      + '<div style="display:flex;align-items:baseline;gap:8px;border-bottom:2px solid var(--text);padding-bottom:8px;margin-bottom:8px">'
      +   '<b style="font-size:0.95rem">Strati</b>'
      +   '<span style="flex:1;font-size:0.72rem;color:var(--text3)">rischio e vincoli</span>'
      +   '<button onclick="_mcatPannello(false)" class="gx-btn" style="padding:2px 8px">Chiudi</button>'
      + '</div>'
      + STRATI.map(function(s){
          return '<label style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer">'
            + '<input type="checkbox" style="margin-top:3px" onchange="_mcatStrato(\'' + s.id + '\', this.checked)">'
            + '<span><span style="font-weight:700">' + s.nome + '</span>'
            + '<span style="display:block;font-size:0.72rem;color:var(--text3)">' + s.nota + '</span>'
            + '<span style="display:block;font-size:0.68rem;color:var(--text3)">fonte: ' + s.fonte + '</span></span></label>';
        }).join('')
      + '<div style="margin-top:10px">'
      +   '<label style="font-size:0.72rem;color:var(--text3);font-weight:700">Trasparenza</label>'
      +   '<input type="range" min="10" max="100" value="55" oninput="_mcatOpacita(this.value)" style="width:100%">'
      + '</div>'
      + '<div style="font-size:0.7rem;color:var(--text3);line-height:1.5;margin-top:8px">'
      +   'Informazione preliminare, non una certificazione: il vincolo vero sta nel PAI vigente '
      +   'e nel certificato di destinazione urbanistica.'
      + '</div></div>';
  }

  /* ── "Cosa c'è qui": interroga gli strati accesi nel punto toccato ── */
  function _etichettaEsito(st, j){
    if(!j) return 'non risponde';
    var r = j.results || [];
    if(!r.length) return 'il punto non ci cade dentro';
    var fuori = /^(NoData|<Null>|null)$/i;
    var voci = [];
    r.forEach(function(x){
      var a = x.attributes || {};
      var parti = [];
      Object.keys(a).forEach(function(k){
        var v = String(a[k] == null ? '' : a[k]).trim();
        if(!v || fuori.test(v)) return;
        if(/^(OBJECTID|Shape|SHAPE|FID)/i.test(k)) return;
        /* i numeri nudi (aree, codici) non dicono niente a chi legge */
        if(/^[\d.,]+$/.test(v)) return;
        if(parti.length < 2) parti.push(v);
      });
      var t = parti.join(' · ') || (x.layerName || 'presente');
      if(voci.indexOf(t) < 0) voci.push(t);
    });
    return voci.length ? voci.slice(0, 3).join(' | ') : 'presente';
  }
  function _interroga(latlng){
    if(!_map || !latlng) return;
    var accesi = STRATI.filter(function(s){ return _strOn[s.id]; });
    if(!accesi.length){ _avviso('Accendi almeno uno strato dal pulsante "Strati"'); return; }
    var b = _map.getBounds(), s = _map.getSize();
    var w = Math.round(s.x), h = Math.round(s.y);
    if(_mkTocco){ try{ _map.removeLayer(_mkTocco); }catch(e){} _mkTocco = null; }
    try{
      _mkTocco = L.circleMarker([latlng.lat, latlng.lng],
        {radius:7, color:'#7F1D1D', weight:2, fillColor:'#FCA5A5', fillOpacity:.9}).addTo(_map);
    }catch(e){}
    var righe = accesi.map(function(st){ return {st:st, esito:'…'}; });
    var mostra = function(){
      var t = 'Nel punto toccato:\n' + righe.map(function(r){ return '· ' + r.st.nome + ': ' + r.esito; }).join('\n')
        + '\n(' + latlng.lat.toFixed(5) + ', ' + latlng.lng.toFixed(5) + ' — '
        + new Date().toLocaleDateString('it-IT') + ')';
      _ultimoRischio = t;
      var el = _el('mcat-avviso');
      if(el){
        el.innerHTML = '<div style="white-space:pre-wrap;text-align:left">' + t.replace(/</g, '&lt;') + '</div>'
          + '<button onclick="_mcatRischioNegliAppunti()" style="margin-top:6px;background:none;border:1px solid currentColor;'
          + 'color:inherit;border-radius:7px;padding:2px 8px;font-size:0.74rem;font-weight:700;font-family:inherit;cursor:pointer">'
          + 'negli appunti</button>';
        el.style.display = '';
      }
    };
    mostra();
    righe.forEach(function(r){
      if(r.st.vettore){ r.esito = _l220Esito(latlng); mostra(); return; }
      if(!r.st.interroga){ r.esito = 'si vede sulla cartina, non si può interrogare'; mostra(); return; }
      var u = r.st.base + '/identify?f=json&tolerance=4&returnGeometry=false'
        + '&geometryType=esriGeometryPoint&geometry=' + latlng.lng + ',' + latlng.lat
        + '&sr=4326&layers=all&mapExtent=' + b.getWest() + ',' + b.getSouth() + ',' + b.getEast() + ',' + b.getNorth()
        + '&imageDisplay=' + w + ',' + h + ',96';
      fetch(u).then(function(x){ return x.json(); })
        .then(function(j){ r.esito = _etichettaEsito(r.st, j); mostra(); })
        .catch(function(){ r.esito = 'non risponde o il browser blocca la lettura'; mostra(); });
    });
  }
  var _ultimoRischio = '';
  window._mcatRischioNegliAppunti = function(){
    if(!_ultimoRischio) return;
    if(!_el('mcat-note')) _mcatAppunti();
    var t = _el('mcat-note-testo');
    if(!t) return;
    var v = t.value || '';
    t.value = v + ((v && !/\n$/.test(v)) ? '\n' : '') + _ultimoRischio + '\n';
    try{ t.dispatchEvent(new Event('input', {bubbles:true})); }catch(e){}
  };
  /* un tocco sulla mappa: o chiede agli strati, o identifica la particella */
  function _clicMappa(e){
    if(_domanda) _interroga(e && e.latlng);
    else _identifica(e);
  }

  /* ════════════════════════════════════════════════════════════════════════
     INTESTATARIO DALLA VISURA                                [18 set 2026]
     ------------------------------------------------------------------------
     La visura si scarica dall'area riservata dell'Agenzia (SPID), e da lì in
     poi il nome finiva a mano su un foglietto. Qui si incolla il testo della
     visura — o solo il riquadro "Intestati" — e il gestionale ne ricava i
     nominativi con quota e diritto, e li scrive sulla scheda dell'immobile.
     COSA RICONOSCE, nelle forme che l'Agenzia usa oggi:
       ROSSI MARIO nato a AGROPOLI (SA) il 12/03/1960  RSSMRA60C12A091K
         Proprieta` per 1/2
       BIANCHI SPA con sede in SALERNO (SA)  01234567890
         Usufrutto per 1000/1000
     I codici fiscali e le partite IVA fanno da àncora: quello che viene prima
     è il nominativo, quello che viene dopo è il diritto con la quota.
     NON è una certificazione e non sostituisce l'ispezione ipotecaria: il
     catasto può essere indietro di una successione. Per questo si salva anche
     la data della visura.
     ════════════════════════════════════════════════════════════════════════ */
  var _VIS_DIRITTI = [
    ['proprieta', 'Proprietà'], ['nuda proprieta', 'Nuda proprietà'], ['usufrutto', 'Usufrutto'],
    ['abitazione', 'Diritto di abitazione'], ['uso', 'Uso'], ['enfiteusi', 'Enfiteusi'],
    ['superficie', 'Superficie'], ['servitu', 'Servitù'], ['livello', 'Livello']
  ];
  function _visSenzaAccenti(t){
    return String(t||'').replace(/[àáâä]/gi,'a').replace(/[èéêë]/gi,'e').replace(/[ìíîï]/gi,'i')
      .replace(/[òóôö]/gi,'o').replace(/[ùúûü]/gi,'u').replace(/[`']/g,'');
  }
  /* [18 set 2026] Vince il diritto che compare PRIMA, non il più lungo: in
     "Usufrutto per 1000/1000 … Nuda proprieta` per 1000/1000" la riga di
     sopra è dell'usufruttuario, e prendendo il più lungo finivano tutti e due
     nudi proprietari. A parità di posizione vince il più lungo, così "nuda
     proprieta" batte "proprieta" che le sta dentro. */
  function _visDiritto(t){
    var b = _visSenzaAccenti(t).toLowerCase();
    var vinc = '', pos = 1e9, lung = 0;
    _VIS_DIRITTI.forEach(function(d){
      var i = b.indexOf(d[0]);
      if(i < 0) return;
      if(i < pos || (i === pos && d[1].length > lung)){ vinc = d[1]; pos = i; lung = d[1].length; }
    });
    return vinc;
  }
  function _visQuota(t){
    var m = String(t||'').match(/(\d{1,5})\s*[\/]\s*(\d{1,5})/);
    return m ? (m[1] + '/' + m[2]) : '';
  }
  /* dal testo incollato agli intestatari */
  function _visLeggi(testo){
    var t = String(testo || '').replace(/\r/g, '');
    if(!t.trim()) return [];
    /* codice fiscale di persona, oppure partita IVA di società */
    var RX = /\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]|\d{11})\b/g;
    var out = [], m;
    while((m = RX.exec(t)) !== null){
      var cf = m[1];
      var prima = t.slice(Math.max(0, m.index - 260), m.index);
      /* la coda si ferma al codice fiscale successivo: il diritto della riga
         dopo appartiene a un'altra persona */
      var coda = t.slice(m.index + cf.length, m.index + cf.length + 400);
      var succ = coda.search(/\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]|\d{11})\b/);
      var dopo = (succ > 0) ? coda.slice(0, succ) : coda;
      /* il nominativo è l'ultima riga piena prima del codice */
      var riga = prima.split('\n').pop();
      if(!riga.trim()) riga = (prima.split('\n').slice(-2)[0] || '');
      var nome = riga
        .replace(/\bnat[oa]\s+a\b[\s\S]*$/i, '')          /* "nato a AGROPOLI il …" */
        .replace(/\bcon\s+sede\s+in\b[\s\S]*$/i, '')       /* "con sede in SALERNO" */
        .replace(/^\s*\d+\s*[).\-]?\s*/, '')               /* il numero di riga */
        .replace(/[|;]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if(!nome || nome.length < 3) continue;
      var dir = _visDiritto(dopo) || _visDiritto(prima);
      var quo = _visQuota(dopo);
      /* stesso codice due volte (es. proprietà e usufrutto): due righe */
      out.push({nome:nome, cf:cf, diritto:dir || '', quota:quo || ''});
    }
    /* doppioni identici in tutto */
    var visti = {}, puliti = [];
    out.forEach(function(x){
      var k = x.cf + '|' + x.diritto + '|' + x.quota;
      if(visti[k]) return;
      visti[k] = 1; puliti.push(x);
    });
    return puliti;
  }
  function _visRiassunto(arr){
    return arr.map(function(x){
      return x.nome + (x.diritto ? ' — ' + x.diritto : '') + (x.quota ? ' per ' + x.quota : '');
    }).join('\n');
  }
  window._mcatVisuraIncolla = function(){
    var box = _el('mcat-vis-box');
    if(box){ box.style.display = (box.style.display === 'none') ? '' : 'none'; return; }
  };
  window._mcatVisuraLeggi = function(){
    var ta = _el('mcat-vis-testo');
    var esito = _el('mcat-vis-esito');
    if(!ta || !esito) return;
    var arr = _visLeggi(ta.value);
    _visUltimi = arr;
    if(!arr.length){
      esito.innerHTML = '<span style="color:#7F1D1D">Non ho riconosciuto nessun intestatario. '
        + 'Incolla il riquadro "Intestati" della visura, quello con i codici fiscali.</span>';
      return;
    }
    esito.innerHTML = '<div style="font-weight:700;margin-bottom:4px">' + arr.length
      + (arr.length === 1 ? ' intestatario' : ' intestatari') + '</div>'
      + arr.map(function(x){
          return '<div>· <b>' + _visEsc(x.nome) + '</b>'
            + (x.diritto ? ' — ' + _visEsc(x.diritto) : '')
            + (x.quota ? ' per ' + _visEsc(x.quota) : '')
            + ' <span style="color:var(--text3)">' + _visEsc(x.cf) + '</span></div>';
        }).join('');
  };
  function _visEsc(t){
    return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  var _visUltimi = [];
  window._mcatVisuraSalva = async function(){
    if(!_visUltimi.length){ _avviso('Prima premi "Leggi": devo sapere cosa salvare.'); return; }
    if(!_immUuid){
      typeof dlgAlert === 'function' && dlgAlert('Questa mappa non è collegata a un immobile: aprila dalla scheda dell\'immobile.', '', 'Nessun immobile');
      return;
    }
    var im = (Array.isArray(D.immobili) ? D.immobili : []).find(function(x){ return x && x.uuid === _immUuid; });
    if(!im){ typeof dlgAlert === 'function' && dlgAlert('L\'immobile non è più in archivio.', '', 'Non trovato'); return; }
    if(Array.isArray(im.intestatari) && im.intestatari.length){
      var vecchi = im.intestatari.map(function(x){ return x.nome; }).join(', ');
      var ok = await (typeof dlgConfirm === 'function'
        ? dlgConfirm('La scheda ha già questi intestatari:\n\n' + vecchi + '\n\nLi sostituisco con quelli appena letti?', '', 'Sostituire?')
        : Promise.resolve(true));
      if(!ok) return;
    }
    im.intestatari = _visUltimi.slice();
    im.intestatariData = new Date().toISOString().slice(0, 10);
    im.intestatariFonte = 'Visura catastale — Agenzia delle Entrate';
    im.dataModifica = new Date().toISOString();
    try{ typeof saveD === 'function' && saveD(); }catch(e){ console.warn('[Visura] saveD KO:', e); }
    if(typeof showToast === 'function') showToast('Intestatari salvati nella scheda dell\'immobile');
    _avviso('Salvati ' + _visUltimi.length + ' intestatari. Il catasto può essere indietro di una successione: '
      + 'per la certezza serve l\'ispezione ipotecaria.');
    if(typeof window.renderSchedaImmobile === 'function'){
      try{ window.renderSchedaImmobile(D.immobili.indexOf(im)); }catch(e){}
    }
  };
  window._mcatVisuraNegliAppunti = function(){
    if(!_visUltimi.length) return;
    var t = 'Intestatari da visura (' + new Date().toLocaleDateString('it-IT') + '):\n' + _visRiassunto(_visUltimi);
    if(!_el('mcat-note')) _mcatAppunti();
    var ta = _el('mcat-note-testo');
    if(!ta) return;
    var v = ta.value || '';
    ta.value = v + ((v && !/\n$/.test(v)) ? '\n' : '') + t + '\n';
    try{ ta.dispatchEvent(new Event('input', {bubbles:true})); }catch(e){}
  };
  function _visPannello(senzaScheda){
    return '<div id="mcat-vis-box" style="display:none;margin-top:8px;padding:10px 12px;background:var(--bg2);'
      + 'border:1px solid var(--border);border-radius:10px">'
      + '<div style="font-size:0.78rem;color:var(--text2);margin-bottom:6px">'
      +   'Incolla qui il testo della visura (basta il riquadro <b>Intestati</b>). '
      +   'Resta tutto sul tuo dispositivo.</div>'
      + '<textarea id="mcat-vis-testo" rows="5" class="finput" style="width:100%;font-family:inherit;font-size:0.8rem" '
      +   'placeholder="ROSSI MARIO nato a AGROPOLI (SA) il 12/03/1960   RSSMRA60C12A091K&#10;   Proprieta` per 1/1"></textarea>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px">'
      +   '<button class="btn btn-primary btn-sm" onclick="_mcatVisuraLeggi()">Leggi</button>'
      +   (senzaScheda ? '' : '<button class="btn btn-outline btn-sm" onclick="_mcatVisuraSalva()">Salva nella scheda</button>')
      +   '<button class="btn btn-outline btn-sm" onclick="_mcatVisuraNegliAppunti()">Negli appunti</button>'
      + '</div>'
      + '<div id="mcat-vis-esito" style="margin-top:7px;font-size:0.8rem;line-height:1.5"></div>'
      + '</div>';
  }

  window.chiudiMappaCatastale=function(){
    clearTimeout(_timer);
    /* [17 set 2026] sensori e posizione vanno spenti: consumano batteria */
    _fermaPosizione(); _fermaDirezione();
    _bussola = false; _segui = false; _giro = 0; _puntatori = {}; _trascina = null;
    window.removeEventListener('resize', _suRidimensiona);
    var n=_el('mcat-note'); if(n) n.remove();   /* [3 set 2026] gli appunti stanno fuori dal contenitore della mappa: vanno tolti a parte */
    var w=_el('mcat-wrap');
    if(w) w.remove();
    if(_map){ try{ _map.remove(); }catch(e){} }
    _map=null; _ov=null; _cerchio=null; _mkPos=null; _mkTocco=null; _immUuid=null; _base=null;
    _strOv={}; _strOn={}; _strPan=false; _domanda=false; _ultimoRischio='';
  };

  /* immUuid è facoltativo: senza, la mappa funziona lo stesso ma il pulsante
     di salvataggio avvisa che non sa a quale immobile riferirsi. */
  /* [25 set 2026] SFONDO a scelta: cartina o satellite (Esri).
     Le particelle restano sopra. Google non si può usare: le sue immagini
     sono lecite solo con la loro API a pagamento.
     - Esri World Imagery: gratis con citazione della fonte.
     - [25 set sera] TOLTA l'Ortofoto AGEA 2012 del Geoportale: risponde solo
       in http e il browser la blocca dentro una pagina https (provato).
       Chi l'aveva scelta riparte dalla cartina: vedi _baseSalvata. */
  var BASI = {
    mappa: { nome:'Mappa', crea:function(){
      return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom:19 }); } },
    esri:  { nome:'Satellite', crea:function(){
      return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
        attribution:'Foto: Esri, Maxar, Earthstar Geographics', maxZoom:19, maxNativeZoom:19 }); } }
  };
  var _base=null, _baseId='mappa';
  function _baseSalvata(){ try{ var v=localStorage.getItem('lecase_mcat_base'); return BASI[v]?v:'mappa'; }catch(e){ return 'mappa'; } }
  function _impostaBase(id){
    if(!_map || !BASI[id]) return;
    if(_base){ try{ _map.removeLayer(_base); }catch(e){} _base=null; }
    _baseId=id;
    var ko=0, ok=0, avvisato=false;
    _base=BASI[id].crea();
    /* Leaflet su un'immagine fallita manda "tileerror" e SUBITO DOPO anche
       "tileload" (misurato): quella seconda non va contata come riuscita */
    _base.on('tileerror', function(e){
      if(e && e.tile) e.tile._mcatKo=true;
      ko++;
      if(!ok && ko>=3 && !avvisato && _baseId===id){ avvisato=true;
        _avviso(BASI[id].nome+': le immagini non arrivano dal servizio. Prova un altro sfondo.'); }
    });
    _base.on('tileload', function(e){ if(e && e.tile && e.tile._mcatKo) return; ok++; });
    _base.addTo(_map); _base.bringToBack();
    var c=_map.getContainer(); if(c) c.classList.toggle('mcat-foto', id!=='mappa');
    try{ localStorage.setItem('lecase_mcat_base', id); }catch(e){}
    /* le particelle si richiedono con gli strati adatti al nuovo sfondo */
    if(_ov) _aggiornaCatasto();
    Object.keys(BASI).forEach(function(k){
      var b=_el('mcat-base-'+k); if(!b) return;
      b.className='btn btn-sm '+(k===id?'btn-primary':'btn-outline');
    });
  }
  window._mcatBase=_impostaBase;

  /* _opz facoltativo [25 set 2026]: {lat, lng, foglio, particella, sub}
     per riaprire una ricerca catastale nel punto dove era stata fatta. */
  var _opz={};
  function _attr(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  window.apriMappaCatastale=function(immUuid, opz){
    if(typeof L==='undefined'){ typeof dlgAlert==='function'&&dlgAlert('La libreria delle mappe non è ancora pronta: riprova fra un istante.','','Mappa'); return; }
    chiudiMappaCatastale();
    _immUuid=immUuid||null;
    _opz=(opz && typeof opz==='object') ? opz : {};
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
      + (_telefono() && typeof DeviceOrientationEvent !== 'undefined'
          ? '<button id="mcat-btn-bussola" onclick="_mcatBussola()" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:6px" title="La cartina gira: ciò che hai davanti va in alto">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg> Bussola</button>'
          : '')
      + '<div style="display:inline-flex;gap:3px" title="Sfondo della mappa">'
      +   Object.keys(BASI).map(function(k){ return '<button id="mcat-base-'+k+'" onclick="_mcatBase(\''+k+'\')" class="btn btn-sm btn-outline" style="padding:5px 10px">'+BASI[k].nome+'</button>'; }).join('')
      + '</div>'
      + '<button id="mcat-btn-strati" onclick="_mcatPannello()" class="btn btn-outline btn-sm" title="Frane, alluvioni, aree tutelate">Strati</button>'
      + '<button id="mcat-btn-domanda" onclick="_mcatDomanda()" class="btn btn-outline btn-sm" title="Tocca un punto e ti dico cosa dicono gli strati accesi">Cosa c\'è qui</button>'
      + '<button onclick="_mcatPosizione(true)" class="btn btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg> Dove sono</button>'
      + '</div>'
      + '<div id="mcat-avviso" style="display:none;padding:7px 14px;background:#FEF3C7;color:#92400E;font-size:0.82rem;font-weight:600;border-bottom:1px solid #FCD34D"></div>'
      + '<div id="mcat-vista" style="flex:1;min-height:0;position:relative;overflow:hidden">'
      +   '<div id="mcat-map" style="position:absolute;left:0;top:0;right:0;bottom:0"></div>'
      +   _pannelloStrati()
      /* rosa dei venti: l'ago indica il nord; toccandola si torna col nord in alto */
      +   '<button id="mcat-rosa" onclick="_mcatNord()" title="Nord in alto" style="position:absolute;right:10px;top:10px;z-index:900;'
      +     'width:46px;height:46px;border-radius:50%;border:1px solid var(--border);background:var(--bg2);'
      +     'box-shadow:0 2px 8px rgba(0,0,0,.18);padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center">'
      +     '<svg width="34" height="34" viewBox="-17 -17 34 34"><g id="mcat-rosa-ago">'
      +       '<polygon points="0,-14 4,0 -4,0" fill="#7F1D1D"/><polygon points="0,14 4,0 -4,0" fill="#94A3B8"/>'
      +     '</g>'
      +     '<circle r="2" fill="var(--bg2)"/></svg></button>'
      +   '<div id="mcat-rosa-av" style="display:none;position:absolute;right:62px;top:14px;z-index:900;background:#FEF3C7;color:#92400E;'
      +     'border:1px solid #FCD34D;border-radius:8px;padding:4px 8px;font-size:0.72rem;font-weight:600;max-width:190px">'
      +     'Bussola incerta: muovi il telefono a otto e allontanati dal ferro</div>'
      +   '<div class="mcat-solo-ruota" style="position:absolute;right:10px;top:64px;z-index:900;display:none;flex-direction:column;gap:6px">'
      +     '<button onclick="_mcatZoom(1)" style="width:46px;height:40px;border-radius:10px;border:1px solid var(--border);background:var(--bg2);font-size:1.3rem;font-weight:700;color:var(--text);cursor:pointer">+</button>'
      +     '<button onclick="_mcatZoom(-1)" style="width:46px;height:40px;border-radius:10px;border:1px solid var(--border);background:var(--bg2);font-size:1.3rem;font-weight:700;color:var(--text);cursor:pointer">−</button>'
      +   '</div>'
      +   '<button id="mcat-segui" onclick="_mcatSegui()" style="display:none;position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:900;'
      +     'border-radius:20px;border:none;background:#1E3A8A;color:#fff;padding:8px 16px;font-family:inherit;font-weight:700;font-size:0.82rem;'
      +     'box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer">Torna su di me</button>'
      +   '<div class="mcat-solo-ruota" style="position:absolute;left:8px;bottom:6px;z-index:900;display:none;font-size:0.62rem;color:#475569;'
      +     'background:rgba(255,255,255,.75);padding:1px 5px;border-radius:4px">© OpenStreetMap</div>'
      + '</div>'
      + '<style>#mcat-wrap.mcat-ruota .leaflet-control-container{display:none}'
      +   '#mcat-wrap.mcat-ruota .mcat-solo-ruota{display:flex!important}'
      +   '#mcat-vista{touch-action:none}</style>'
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
            +   '<button onclick="_mcatVisuraIncolla()" class="btn btn-outline" style="padding:10px 16px">Intestatario da visura</button>'
            +   '<button onclick="_mcatVisura()" class="btn btn-outline" style="padding:10px 16px;display:inline-flex;align-items:center;gap:7px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Chi è il proprietario</button>'
            +   '<div style="flex:1;min-width:120px;text-align:right;font-size:0.68rem;color:var(--text4)">Cartografia © Agenzia delle Entrate — CC BY 4.0</div>'
            + '</div>'
            + _visPannello()
          /* [25 set 2026] MAPPA LIBERA: prima qui "si guardava soltanto". Ora
             foglio, particella e sub si possono salvare come RICERCA CATASTALE
             (D.ricercheCatastali) e agganciare poi a un contatto. Prima il
             pulsante "Intestatario da visura" qui non apriva niente: il
             riquadro della visura c'era solo con un immobile collegato. */
          : '<div style="font-size:0.8rem;color:var(--text2);margin-bottom:7px"><strong>Tocca una particella</strong>: si apre la risposta dell\'Agenzia. Copia la sigla e incollala qui: la traduco in foglio e particella. Con <strong>Salva ricerca</strong> la ritrovi in Ricerche catastali.</div>'
            + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
            +   '<input id="mcat-sigla" class="finput" style="flex:1;min-width:190px" placeholder="incolla qui, es. A091_004300.120" oninput="_mcatLeggiSigla()">'
            +   '<span id="mcat-esito" style="font-size:0.86rem;font-weight:700;color:var(--text4)"></span>'
            + '</div>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">'
            +   '<div><div style="font-size:0.68rem;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.6px">Foglio</div><input id="mcat-foglio" class="finput" style="width:80px" value="'+_attr(_opz.foglio)+'"></div>'
            +   '<div><div style="font-size:0.68rem;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.6px">Particella</div><input id="mcat-part" class="finput" style="width:100px" value="'+_attr(_opz.particella)+'"></div>'
            +   '<div><div style="font-size:0.68rem;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.6px">Sub</div><input id="mcat-sub" class="finput" style="width:70px" value="'+_attr(_opz.sub)+'"></div>'
            +   '<button onclick="_mcatSalvaRicerca()" class="btn btn-primary" style="padding:10px 16px;display:inline-flex;align-items:center;gap:7px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Salva ricerca</button>'
            + '</div>'
            + '<div style="margin-top:8px">' + '<button onclick="_mcatVisuraIncolla()" class="btn btn-outline" style="padding:10px 16px">Intestatario da visura</button>'
            +   '<button onclick="_mcatVisura()" class="btn btn-outline" style="padding:10px 16px;display:inline-flex;align-items:center;gap:7px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Chi è il proprietario</button>' + '</div>'
            + _visPannello(true)
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
    if(!im && _opz.lat!=null && _opz.lng!=null){ coord=[parseFloat(_opz.lat), parseFloat(_opz.lng)]; }
    if(coord && !isNaN(coord[0]) && !isNaN(coord[1])){ centro=[coord[0],coord[1]]; zoom=18; }
    else coord=null;
    _map=L.map('mcat-map',{center:centro,zoom:zoom,zoomControl:true,scrollWheelZoom:true,maxZoom:19});
    /* [25 set notte] Il catasto ha un piano tutto suo, sopra gli strati PAI.
       Motivo: da vicino l'Agenzia colora DENTRO le particelle (crema) e le
       strade (grigio chiaro) — misurato, lo fa lo strato CP.CadastralParcel
       stesso, non "vestizioni". Con il Satellite questo piano si FONDE con
       la foto invece di coprirla (vedi lo stile mcat-stile-foto più sotto:
       confini chiari, case arancio, niente fondo). La fusione funziona solo su un piano
       intero: sull'immagine da sola, dentro il suo piano, non vede la foto. */
    try{ var _pc=_map.createPane('mcatCatasto'); _pc.style.zIndex=410; _pc.style.pointerEvents='none'; }catch(e){}
    /* [25 set 2026] strati disegnati (fascia legge 220) sopra il catasto,
       così non vengono fusi né schiariti con lui */
    try{ var _pv=_map.createPane('mcatVettori'); _pv.style.zIndex=420; _pv.style.pointerEvents='none'; }catch(e){}
    /* [25 set 2026] sfondo scelto l'ultima volta (cartina o satellite);
       l'alone bianco rende leggibili le linee delle particelle sopra le foto */
    if(!_el('mcat-stile-foto')){
      var st=document.createElement('style'); st.id='mcat-stile-foto';
      /* [25 set notte] LINEE CHIARE sul Satellite: l'immagine dell'Agenzia
         si schiarisce (crema 189 e strade grigio 150 diventano bianco) e si
         capovolge (il bianco diventa nero, i confini neri diventano chiari);
         hue-rotate riporta le case dal blu all'arancio. Poi il piano si
         fonde con la foto in "screen": il nero sparisce, il chiaro resta. */
      st.textContent='#mcat-map.mcat-foto .leaflet-mcatCatasto-pane{mix-blend-mode:screen}'
        +'#mcat-map.mcat-foto .mcat-ov{opacity:1!important;filter:brightness(1.7) invert(1) hue-rotate(180deg)}'
        /* [25 set notte] GIUNTURE: con lo schermo ingrandito (Windows al
           110%, 125%…) fra un riquadro della foto e l'altro resta una fessura
           di una frazione di pixel, e traspariva il grigio chiaro di fondo
           della mappa: righe dritte ogni 256 pixel (misurato 282 = 256 x 1,1).
           Con il Satellite il fondo diventa scuro come la foto. NON allargare
           i riquadri di mezzo pixel: Leaflet 1.9.4 somma già i bordi vicini
           (mix-blend-mode plus-lighter) e si ottengono righe più chiare. */
        +'#mcat-map.mcat-foto{background:#2f352b}'
        /* [25 set notte, 2a prova] Il fondo scuro NON bastava (screenshot
           di Enzo): oltre alle fessure c'erano righe BIANCHE dove i bordi di
           due riquadri si sommano. È il rimedio interno di Leaflet 1.9.4
           (mix-blend-mode plus-lighter) che con la scheda video vera sbaglia
           per eccesso. Qui si spegne e i riquadri si sovrappongono di mezzo
           pixel: la sovrapposizione copre la fessura senza schiarire. */
        +'#mcat-map img.leaflet-tile{mix-blend-mode:normal!important;width:256.5px!important;height:256.5px!important}';
      document.head.appendChild(st);
    }
    _impostaBase(_baseSalvata());
    if(coord) L.marker(coord).addTo(_map);
    _map.on('moveend zoomend', _programmaAggiornamento);
    _map.on('click', _clicMappa);
    /* [17 set 2026] tocchi e trascinamenti quando la cartina è girata */
    var _v = _el('mcat-vista');
    if(_v){
      _v.addEventListener('pointerdown', _giuDito, true);
      _v.addEventListener('pointermove', _muoviDito, true);
      _v.addEventListener('pointerup', _suDito, true);
      _v.addEventListener('pointercancel', _suDito, true);
      _v.addEventListener('click', function(e){
        if(!_bussola) return;
        if(e.target && e.target.closest && e.target.closest('button')) return;
        _toccoRuotato(e);
      }, true);
    }
    window.addEventListener('resize', _suRidimensiona);
    _aggiornaPulsanti();
    setTimeout(function(){ try{ _map.invalidateSize(); }catch(e){} _aggiornaCatasto(); }, 150);
    /* Senza coordinate sull'immobile si parte da dove sei: è il caso di quando
       stai davanti al palazzo e la scheda non ha ancora la posizione. */
    if(!coord) setTimeout(_vaiAllaPosizione, 400);
  };
  /* ════════ SALVA RICERCA (mappa libera) ════════════════ [25 set 2026]
     Una ricerca fatta davanti a un immobile che non è in archivio: punto,
     indirizzo, dati catastali, intestatari letti dalla visura, appunti.
     Vive in D.ricercheCatastali, ancorata al suo uuid; quando la agganci a
     un contatto prende il suo clienteUuid ed esce dall'elenco, ma resta la
     stessa scheda (la verità è in un posto solo). */
  window._mcatSalvaRicerca=function(){
    var f=String((_el('mcat-foglio')||{}).value||'').trim();
    var p=String((_el('mcat-part')||{}).value||'').trim();
    var sb=String((_el('mcat-sub')||{}).value||'').trim();
    var sigla=String((_el('mcat-sigla')||{}).value||'').trim();
    var dec=_decodificaSigla(sigla);
    if(dec){ f=f||dec.foglio; p=p||dec.particella; }
    var punto=null;
    try{ if(_mkTocco) punto=_mkTocco.getLatLng(); }catch(e){}
    try{ if(!punto && _map) punto=_map.getCenter(); }catch(e){}
    var appunti='';
    try{ appunti=localStorage.getItem(_noteChiave())||''; }catch(e){}
    var t=_el('mcat-note-testo'); if(t && t.value) appunti=t.value;
    if(!f && !p && !_visUltimi.length && !appunti.trim()){
      _avviso('Non c\'è ancora niente da salvare: tocca una particella e incolla la sigla, o scrivi foglio e particella.');
      return;
    }
    if(!Array.isArray(D.ricercheCatastali)) D.ricercheCatastali=[];
    var r={
      uuid: (typeof genUUID==='function') ? genUUID() : ('rc_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)),
      data: new Date().toISOString(),
      lat: punto ? +punto.lat.toFixed(6) : null,
      lng: punto ? +punto.lng.toFixed(6) : null,
      indirizzo: _ultimoIndirizzo||'',
      comune: dec ? dec.comune : '',
      sigla: sigla,
      foglio: f, particella: p, sub: sb,
      intestatari: _visUltimi.slice(),
      appunti: appunti.trim(),
      clienteUuid: null
    };
    D.ricercheCatastali.push(r);
    try{ typeof saveD==='function' && saveD(); }catch(e){ console.warn('[Ricerca catastale] saveD KO:', e); }
    if(typeof showToast==='function') showToast('Ricerca salvata in Ricerche catastali');
    _avviso('Ricerca salvata'+(f||p?' (foglio '+(f||'?')+', particella '+(p||'?')+(sb?', sub '+sb:'')+')':'')
      +'. La trovi in Ricerche catastali, da agganciare a un contatto.');
  };
  window._mcatPosizione=_vaiAllaPosizione;
  window._mcatSalva=_salvaNellaScheda;
})();
