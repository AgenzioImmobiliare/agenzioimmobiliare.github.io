// modules/osservatorio/osservatorio.view.js — Osservatorio Immobiliare
// ----------------------------------------------------------------------------
// Estratto dal monolite il 15 set 2026. Era la più grossa delle dodici parti
// indipendenti dentro un unico blocco inline.
//
// DIPENDENZE dal monolite (via window): D, saveD, showToast, openSchedaImmobile,
//   _anEnsureChart (modulo Analytics, per Chart.js), FileReader del browser.
// Verificato: tutte le chiamate al monolite erano già protette da un typeof —
// questo codice non ridefinisce nessuna funzione altrui.
//
// I dati dell'osservatorio stanno in localStorage ('imio_data'), non in D:
// sono import di listini esterni, non archivio dell'agenzia.
// ----------------------------------------------------------------------------

(function(){
  var LS_KEY = 'imio_data';
  var STYLE_OK = false;
  var charts = {};          // istanze Chart.js
  var sortState = { col:'visite', dir:-1 };  // ordinamento tabella

  function num(v){ var n = parseFloat(String(v==null?'':v).replace(/[^\d.-]/g,'')); return isNaN(n)?0:n; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function fmtN(n){ return (Math.round(n)).toLocaleString('it-IT'); }
  function fmtEur(n){ return n>0 ? '€ '+fmtN(n) : '—'; }

  /* ---- Parser CSV robusto (gestisce virgolette e ; nei campi) ---- */
  function parseCSV(text){
    text = text.replace(/^\uFEFF/,'');           // rimuove BOM
    var rows=[], row=[], field='', inQ=false;
    for(var i=0;i<text.length;i++){
      var c=text[i], nx=text[i+1];
      if(inQ){
        if(c==='"' && nx==='"'){ field+='"'; i++; }
        else if(c==='"'){ inQ=false; }
        else field+=c;
      } else {
        if(c==='"') inQ=true;
        else if(c===';'){ row.push(field); field=''; }
        else if(c==='\r'){ /* skip */ }
        else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
        else field+=c;
      }
    }
    if(field.length||row.length){ row.push(field); rows.push(row); }
    return rows.filter(function(r){ return r.length>1 || (r[0]&&r[0].trim()); });
  }

  /* Mappa colonna -> indice in base all'header */
  function buildRecords(rows){
    if(!rows.length) return [];
    var head = rows[0].map(function(h){ return String(h).trim().toLowerCase().replace(/"/g,''); });
    function idx(){ for(var a=0;a<arguments.length;a++){ var k=head.indexOf(arguments[a]); if(k>=0) return k; } return -1; }
    var I = {
      codice: idx('codice'),
      id: idx('id'),
      tipologia: idx('tipologia'),
      contratto: idx('contratto'),
      superficie: idx('superficie'),
      prezzo: idx('prezzo vendita','prezzo_vendita'),
      canone: idx('canone affitto','canone_affitto'),
      comune: idx('comune'),
      indirizzo: idx('indirizzo'),
      visite: idx('visite'),
      salvati: idx('salvati'),
      nascosti: idx('nascosti'),
      contatti: idx('contatti'),
      premium: idx('premium'),
      qualita: idx('indice_qualita','indice qualita')
    };
    var out=[];
    for(var r=1;r<rows.length;r++){
      var row=rows[r];
      if(!row || !row.join('').trim()) continue;
      function g(k){ return I[k]>=0 ? (row[I[k]]||'').trim() : ''; }
      var _cod=g('codice'), _id=g('id');
      var rec = {
        // chiave univoca: 'id' annuncio Immobiliare.it (sempre presente e unico);
        // 'codice' è il riferimento agenzia, spesso vuoto nel CSV.
        codice: _id || _cod,        // identificatore primario usato ovunque
        codiceAgenzia: _cod,        // riferimento interno agenzia (se presente)
        idPortale: _id,
        tipologia: g('tipologia') || 'N/D',
        contratto: g('contratto') || 'N/D',
        superficie: num(g('superficie')),
        prezzo: num(g('prezzo')),
        canone: num(g('canone')),
        comune: g('comune') || 'N/D',
        indirizzo: g('indirizzo'),
        visite: num(g('visite')),
        salvati: num(g('salvati')),
        nascosti: num(g('nascosti')),
        contatti: num(g('contatti')),
        premium: /^s/i.test(g('premium')),
        qualita: num(g('qualita'))
      };
      if(!rec.codice && !rec.comune && !rec.visite) continue;
      out.push(rec);
    }
    return out;
  }

  function loadLS(){ try{ var s=localStorage.getItem(LS_KEY); return s?JSON.parse(s):null; }catch(e){ return null; } }
  function saveLS(d){ try{ localStorage.setItem(LS_KEY, JSON.stringify(d)); }catch(e){} }

  /* ════════════════════════════════════════════════════════════════════
     STORICO SNAPSHOT — ogni import viene conservato e datato
     imio_snapshots = [ { date:'YYYY-MM-DD', importedAt, fileName, recs:[{codice,visite,salvati,nascosti,contatti,qualita,prezzo,...}] } ]
     ════════════════════════════════════════════════════════════════════ */
  var SNAP_KEY='imio_snapshots';
  function loadSnaps(){ try{ var s=localStorage.getItem(SNAP_KEY); return s?JSON.parse(s):[]; }catch(e){ return []; } }
  function saveSnaps(a){ try{ localStorage.setItem(SNAP_KEY, JSON.stringify(a)); return true; }catch(e){ return false; } }
  function todayISO(d){ d=d||new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  // versione "snella" di un record: solo identificativi + metriche che cambiano nel tempo
  function slimRec(r){
    return { codice:r.codice, codiceAgenzia:r.codiceAgenzia, tipologia:r.tipologia, contratto:r.contratto, comune:r.comune,
      indirizzo:r.indirizzo, prezzo:r.prezzo, canone:r.canone, premium:r.premium,
      visite:r.visite, salvati:r.salvati, nascosti:r.nascosti, contatti:r.contatti, qualita:r.qualita };
  }
  /* Estrae una data YYYY-MM-DD dal nome del file CSV di Immobiliare.it.
     I file esportati si chiamano tipicamente "annunci-2026-06-09.csv".
     Se non trova una data nel nome, usa la data odierna. */
  function dateFromFileName(fileName){
    if(!fileName) return todayISO();
    var m = String(fileName).match(/(\d{4})[-_.](\d{2})[-_.](\d{2})/);
    if(m){
      var y=m[1], mo=m[2], d=m[3];
      // validazione minima
      if(+mo>=1 && +mo<=12 && +d>=1 && +d<=31) return y+'-'+mo+'-'+d;
    }
    // prova formato gg-mm-aaaa
    m = String(fileName).match(/(\d{2})[-_.](\d{2})[-_.](\d{4})/);
    if(m && +m[2]>=1 && +m[2]<=12) return m[3]+'-'+m[2]+'-'+m[1];
    return todayISO();
  }

  /* aggiunge/sostituisce lo snapshot della data indicata (default odierna);
     tiene l'array ordinato per data */
  function pushSnapshot(recs, fileName, snapDate){
    var snaps=loadSnaps();
    var date = snapDate || dateFromFileName(fileName) || todayISO();
    var snap={ date:date, importedAt:new Date().toISOString(), fileName:fileName||'', recs:recs.map(slimRec) };
    var existIdx=-1;
    for(var i=0;i<snaps.length;i++){ if(snaps[i].date===date){ existIdx=i; break; } }
    if(existIdx>=0) snaps[existIdx]=snap;   // stessa data: aggiorna
    else snaps.push(snap);
    snaps.sort(function(a,b){ return a.date<b.date?-1:a.date>b.date?1:0; });
    // limite di sicurezza: max 60 snapshot (rimuove i più vecchi)
    if(snaps.length>60) snaps=snaps.slice(snaps.length-60);
    if(!saveSnaps(snaps)){
      snaps=snaps.slice(5); saveSnaps(snaps);
    }
    return snaps;
  }

  /* ---- Import file ---- */
  window.imioHandleFile = function(input){
    var f = input.files && input.files[0];
    if(!f) return;
    var rd = new FileReader();
    rd.onload = function(e){
      try{
        var recs = buildRecords(parseCSV(e.target.result));
        if(!recs.length){ alert('Nessun annuncio valido trovato nel file CSV.'); return; }
        var snapDate = dateFromFileName(f.name);
        var snaps = pushSnapshot(recs, f.name, snapDate);   // snapshot datato col file
        /* I dati "correnti" mostrati nei KPI seguono lo snapshot più RECENTE,
           così importare un file vecchio dopo uno nuovo non fa regredire la vista. */
        var ultimo = snaps[snaps.length-1];
        var isLatest = (ultimo && ultimo.date===snapDate);
        // salva come "correnti" se è lo snapshot più recente OPPURE se non ci sono dati correnti
        if(isLatest || !loadLS()){
          saveLS({ records: recs, importedAt: new Date().toISOString(), fileName: f.name, snapDate: snapDate });
        }
        imioBoot();
        // feedback: data rilevata + stato confronto
        var dLabel = (function(){ try{ return new Date(snapDate+'T00:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'}); }catch(_){ return snapDate; } })();
        if(typeof showToast==='function'){
          if(snaps.length>=2)
            showToast('✅ Import del '+dLabel+' registrato', recs.length+' annunci · '+snaps.length+' snapshot in archivio: vai su "Confronto" per le variazioni', '#15803D');
          else
            showToast('✅ Import del '+dLabel+' registrato', recs.length+' annunci · importa un file di un\'altra data per confrontare l\'andamento', '#2563EB');
        }
      }catch(err){
        alert('Errore nella lettura del CSV: '+err.message);
      }
    };
    rd.readAsText(f, 'utf-8');
    input.value='';
  };

  window.imioClear = function(){
    var snaps=loadSnaps();
    if(snaps.length>1){
      if(!confirm('Eliminare i dati correnti?\n\nHai '+snaps.length+' import storici salvati per il confronto.\n\nOK = cancella tutto (anche lo storico)\nAnnulla = non cancellare nulla')) return;
      try{ localStorage.removeItem(LS_KEY); }catch(e){}
      try{ localStorage.removeItem(SNAP_KEY); }catch(e){}
    } else {
      if(!confirm('Eliminare i dati importati da Immobiliare.it?')) return;
      try{ localStorage.removeItem(LS_KEY); }catch(e){}
      try{ localStorage.removeItem(SNAP_KEY); }catch(e){}
    }
    imioBoot();
  };

  /* ════════════════════════════════════════════════════════════════════
     ABBINAMENTO con gli immobili del gestionale
     Strategia a 2 livelli:
       1) MATCH ESATTO  → ID Immobiliare.it estratto da im.linkPortale == codice CSV
       2) MATCH FUZZY   → similarità su comune + indirizzo + prezzo (fallback)
     Stato risultante per ogni record CSV:
       'attivo'      = abbinato a immobile con stato 'attivo'
       'non-attivo'  = abbinato a immobile NON attivo (venduto/archiviato/proposta...)
       'non-gest'    = nessun immobile abbinato (non in gestionale)
     ════════════════════════════════════════════════════════════════════ */
  function getGestImmobili(){
    try{ if(typeof window!=='undefined' && window._scD){ var d=window._scD(); if(d&&d.immobili) return d.immobili; } }catch(e){}
    try{ if(typeof window!=='undefined' && window.D && window.D.immobili) return window.D.immobili; }catch(e){}
    return [];
  }
  // Mappa abbinamenti manuali salvata: { codiceCSV : uuid/ref immobile }
  var MAP_KEY='imio_links';
  function loadMap(){ try{ var s=localStorage.getItem(MAP_KEY); return s?JSON.parse(s):{}; }catch(e){ return {}; } }
  function saveMap(m){ try{ localStorage.setItem(MAP_KEY, JSON.stringify(m)); }catch(e){} }
  // Chiave SEMPRE univoca e stabile per un immobile.
  // Priorità: uuid > ref > posizione nell'array (prefisso #idx).
  // L'indice è stabile finché l'ordine di D.immobili non cambia; usato solo come fallback.
  function immKey(im, idx){
    if(im && im.uuid) return 'u:'+im.uuid;
    if(im && im.ref)  return 'r:'+im.ref;
    if(typeof idx==='number') return '#'+idx;
    return '';
  }
  function findImmByKey(imm, key){
    if(!key) return null;
    if(key.charAt(0)==='#'){ var i=parseInt(key.slice(1),10); return (i>=0 && i<imm.length)? imm[i] : null; }
    for(var j=0;j<imm.length;j++){ if(immKey(imm[j],j)===key) return imm[j]; }
    return null;
  }
  // Estrae l'ID numerico dell'annuncio Immobiliare.it da un URL/testo del portale
  function extractPortalId(link){
    if(!link) return '';
    var s=String(link);
    if(!/immobiliare/i.test(s)){
      // se è solo un numero lungo lo accetto comunque
      var only=s.match(/\b(\d{6,9})\b/); return only?only[1]:'';
    }
    var m=s.match(/(\d{6,9})/g);   // gli id Immobiliare.it sono numeri lunghi
    return m? m[m.length-1] : '';  // prendo l'ultimo numero lungo (di solito è l'id annuncio)
  }
  function norm(s){
    return String(s==null?'':s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')   // accenti
      .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  }
  function isAttivo(im){
    var st=norm(im.stato);
    return st==='attivo' || st==='' && false; // solo 'attivo' conta come attivo
  }
  // Similarità 0..1 tra annuncio CSV e immobile gestionale
  function simScore(rec, im){
    var score=0, w=0;
    // comune (peso alto)
    if(rec.comune && im.comune){ w+=3; if(norm(rec.comune)===norm(im.comune)) score+=3;
      else if(norm(im.comune).indexOf(norm(rec.comune))>=0||norm(rec.comune).indexOf(norm(im.comune))>=0) score+=1.5; }
    // indirizzo (token overlap)
    var ia=norm(rec.indirizzo).split(' ').filter(Boolean);
    var ib=norm(im.indirizzo||im.via||'').split(' ').filter(Boolean);
    if(ia.length && ib.length){ w+=3;
      var inter=ia.filter(function(t){return t.length>2 && ib.indexOf(t)>=0;}).length;
      score+= 3*(inter/Math.max(ia.length,1));
    }
    // prezzo (entro ±8%)
    var pr=rec.contratto==='Affitto'? rec.canone : rec.prezzo;
    var pg=num(im.prezzo);
    if(pr>0 && pg>0){ w+=2; var diff=Math.abs(pr-pg)/Math.max(pr,pg); if(diff<=0.02) score+=2; else if(diff<=0.08) score+=1.2; else if(diff<=0.15) score+=0.5; }
    return w>0? score/w : 0;
  }
  // Esegue l'abbinamento su tutto il dataset, popola rec.match{stato,ref,how,im}
  function matchRecords(recs){
    var imm=getGestImmobili();
    var manual=loadMap();
    // indice per ID portale
    var byId={};
    imm.forEach(function(im){
      /* Priorità al codice Immobiliare.it esplicito (campo dedicato in scheda),
         poi fallback all'estrazione dal link. Così l'abbinamento è certo. */
      var idExpl = im.codImmobiliare ? String(im.codImmobiliare).replace(/\D/g,'') : '';
      if(idExpl){ byId[idExpl]=im; }
      var id=extractPortalId(im.linkPortale);
      if(id && !byId[id]) byId[id]=im;
    });
    var stats={attivo:0,nonAttivo:0,nonGest:0,esatti:0,fuzzy:0,manuali:0};
    recs.forEach(function(r){
      var im=null, how='', imIdx=-1;
      // 0) abbinamento MANUALE salvato (priorità massima)
      if(manual[r.codice]){ im=findImmByKey(imm, manual[r.codice]); if(im){ how='manuale'; imIdx=imm.indexOf(im); } }
      // 1) match esatto via ID portale (codice o id CSV)
      if(!im && byId[r.codice]){ im=byId[r.codice]; how='esatto'; imIdx=imm.indexOf(im); }
      // 2) fuzzy (richiede comune coincidente + buona somiglianza complessiva)
      if(!im){
        var best=null, bestS=0, bestIdx=-1;
        imm.forEach(function(g,gi){
          if(norm(g.comune)!==norm(r.comune)) return; // comune deve coincidere
          var s=simScore(r,g); if(s>bestS){ bestS=s; best=g; bestIdx=gi; }
        });
        if(best && bestS>=0.72){ im=best; how='probabile'; imIdx=bestIdx; }
      }
      if(im){
        if(how==='manuale') stats.manuali++; else if(how==='esatto') stats.esatti++; else stats.fuzzy++;
        var attivo=isAttivo(im);
        r.match={ stato: attivo?'attivo':'non-attivo', ref:(im.ref||''), key:immKey(im, imIdx), how:how, statoGest:(im.stato||'—') };
        if(attivo) stats.attivo++; else stats.nonAttivo++;
      } else {
        r.match={ stato:'non-gest', ref:'', key:'', how:'', statoGest:'' };
        stats.nonGest++;
      }
    });
    return stats;
  }

  /* ════════════════════════════════════════════════════════════════════
     ABBINAMENTO MANUALE — modal di selezione immobile + memorizzazione
     ════════════════════════════════════════════════════════════════════ */
  var _mmCodice=null;  // codice CSV in fase di abbinamento

  window.imioOpenMatch=function(codice){
    _mmCodice=codice;
    var data=loadLS(); if(!data) return;
    var rec=null; for(var i=0;i<data.records.length;i++){ if(data.records[i].codice===codice){ rec=data.records[i]; break; } }
    if(!rec) return;
    var ov=document.getElementById('imio-mm-overlay');
    if(!ov){
      ov=document.createElement('div'); ov.id='imio-mm-overlay';
      ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
      ov.innerHTML='<div style="background:#fff;border-radius:16px;max-width:640px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">'+
        '<div style="padding:18px 22px;border-bottom:1px solid #E2E8F0;display:flex;align-items:flex-start;justify-content:space-between;gap:10px">'+
          '<div><div style="font-weight:800;font-size:1.05rem;color:#0F172A">Abbina annuncio al gestionale</div><div id="imio-mm-sub" style="font-size:.8rem;color:#64748B;margin-top:3px"></div></div>'+
          '<button id="imio-mm-close" style="background:#F1F5F9;border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:1.1rem;color:#475569;line-height:1">&times;</button>'+
        '</div>'+
        '<div style="padding:14px 22px 6px"><input id="imio-mm-search" placeholder="&#128269; Cerca immobile per ref, comune, indirizzo..." style="width:100%;padding:10px 12px;border:1px solid #E2E8F0;border-radius:9px;font-size:.88rem"></div>'+
        '<div id="imio-mm-list" style="overflow-y:auto;padding:6px 14px 16px;flex:1"></div>'+
        '<div style="padding:12px 22px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center;gap:10px">'+
          '<button id="imio-mm-unlink" style="background:#fff;color:#B91C1C;border:1px solid #FECACA;padding:9px 14px;border-radius:9px;font-weight:700;cursor:pointer;font-size:.82rem;display:none">Rimuovi abbinamento</button>'+
          '<span style="font-size:.72rem;color:#94A3B8;flex:1;text-align:right">L\'abbinamento viene salvato e riconosciuto nei prossimi CSV</span>'+
        '</div>'+
      '</div>';
      document.body.appendChild(ov);
      // listener robusti (no inline handler)
      ov.addEventListener('click',function(e){ if(e.target===ov) window.imioCloseMatch(); });
      var btnClose=document.getElementById('imio-mm-close'); if(btnClose) btnClose.addEventListener('click',function(){ window.imioCloseMatch(); });
      var inp=document.getElementById('imio-mm-search'); if(inp) inp.addEventListener('input',function(){ window.imioMatchList(); });
      var btnUnlink=document.getElementById('imio-mm-unlink'); if(btnUnlink) btnUnlink.addEventListener('click',function(){ window.imioUnlink(); });
    }
    var pr=rec.contratto==='Affitto'? rec.canone : rec.prezzo;
    document.getElementById('imio-mm-sub').innerHTML='Cod. <strong>'+esc(rec.codice)+'</strong> &middot; '+esc(rec.tipologia)+' &middot; '+esc(rec.comune)+(rec.indirizzo?' &middot; '+esc(rec.indirizzo):'')+(pr>0?' &middot; '+fmtEur(pr):'');
    var unlink=document.getElementById('imio-mm-unlink');
    var manual=loadMap();
    unlink.style.display = manual[codice] ? 'inline-block' : 'none';
    document.getElementById('imio-mm-search').value='';
    try{ ov.setAttribute('data-codice', codice); }catch(e){}   // backup robusto del codice nel DOM
    ov.style.display='flex';
    window.imioMatchList();
  };

  // legge il codice in lavorazione: prima la variabile, poi il backup nel DOM
  function _mmGetCodice(){
    if(_mmCodice) return _mmCodice;
    try{ var ov=document.getElementById('imio-mm-overlay'); if(ov){ var c=ov.getAttribute('data-codice'); if(c) return c; } }catch(e){}
    return null;
  }

  window.imioCloseMatch=function(){ var ov=document.getElementById('imio-mm-overlay'); if(ov){ ov.style.display='none'; try{ov.removeAttribute('data-codice');}catch(e){} } _mmCodice=null; };

  // Lista immobili gestionale, ordinati per somiglianza all'annuncio corrente
  window.imioMatchList=function(){
    var imm=getGestImmobili();
    var data=loadLS(); var rec=null;
    var _cc=_mmGetCodice();
    if(data) for(var i=0;i<data.records.length;i++){ if(data.records[i].codice===_cc){ rec=data.records[i]; break; } }
    var q=norm((document.getElementById('imio-mm-search')||{}).value||'');
    var list=imm.map(function(im,ix){ return {im:im, ix:ix, s: rec?simScore(rec,im):0}; });
    if(q){
      list=list.filter(function(o){ var hay=norm((o.im.ref||'')+' '+(o.im.comune||'')+' '+(o.im.indirizzo||o.im.via||'')+' '+(o.im.tipo||'')); return hay.indexOf(q)>=0; });
    }
    list.sort(function(a,b){ return b.s-a.s; });
    list=list.slice(0,60);
    var manual=loadMap();
    var curKey=manual[_cc]||'';
    var box=document.getElementById('imio-mm-list');
    if(!box) return;
    if(!list.length){ box.innerHTML='<div style="padding:30px;text-align:center;color:#94A3B8;font-size:.85rem">Nessun immobile trovato.</div>'; return; }
    var _codForItems=_cc||'';
    box.innerHTML=list.map(function(o){
      var im=o.im, k=immKey(im, o.ix), sel=(k===curKey);
      var suggest = o.s>=0.72 ? '<span style="background:#DBEAFE;color:#1D4ED8;font-size:.66rem;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:6px">suggerito</span>' : '';
      var att = norm(im.stato)==='attivo';
      var statoBadge='<span style="font-size:.68rem;font-weight:700;padding:1px 7px;border-radius:10px;'+(att?'background:#DCFCE7;color:#15803D':'background:#FEF3C7;color:#B45309')+'">'+esc(im.stato||'—')+'</span>';
      // data-imio-key = chiave immobile; data-imio-cod = codice annuncio (fallback finale)
      return '<div class="imio-mm-item" data-imio-key="'+esc(k)+'" data-imio-cod="'+esc(_codForItems)+'" style="border:1px solid '+(sel?'#2563EB':'#E2E8F0')+';background:'+(sel?'#EFF6FF':'#fff')+';border-radius:11px;padding:11px 13px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:.12s">'+
        '<div style="flex:1;min-width:0;pointer-events:none">'+
          '<div style="font-weight:700;color:#0F172A;font-size:.88rem">'+(im.ref?esc(im.ref):'(senza ref)')+suggest+' '+statoBadge+'</div>'+
          '<div style="font-size:.78rem;color:#64748B;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(im.tipo||'')+(im.comune?' &middot; '+esc(im.comune):'')+(im.indirizzo||im.via?' &middot; '+esc(im.indirizzo||im.via):'')+(num(im.prezzo)>0?' &middot; '+fmtEur(num(im.prezzo)):'')+'</div>'+
        '</div>'+
        (sel?'<span style="color:#2563EB;font-weight:800;font-size:.78rem;pointer-events:none">&#10003; abbinato</span>':'<span style="color:#94A3B8;font-size:1.2rem;pointer-events:none">&rsaquo;</span>')+
      '</div>';
    }).join('');
    // Event delegation: un solo listener sul contenitore, riattaccato a ogni render
    box.onclick=function(ev){
      var el=ev.target;
      while(el && el!==box && !(el.getAttribute && el.getAttribute('data-imio-key')!==null && el.getAttribute('data-imio-key')!==undefined)){ el=el.parentNode; }
      if(el && el.getAttribute){
        var key=el.getAttribute('data-imio-key');
        var codFromItem=el.getAttribute('data-imio-cod');
        if(key!==null && key!==undefined){
          if(ev.stopPropagation) ev.stopPropagation();   // evita che il click chiuda l'overlay
          window.imioConfirmMatch(key, codFromItem);
        }
      }
    };
  };

  // Conferma: scrive il link portale sull'immobile + salva mappa + persiste con saveD
  window.imioConfirmMatch=function(key, codFallback){
    if(!key){ if(window.showToast) window.showToast('Abbinamento non riuscito (chiave mancante)','','#C2410C'); return; }
    var cod=_mmGetCodice() || codFallback || null;
    if(!cod){ if(window.showToast) window.showToast('Riapri la finestra di abbinamento e riprova','','#C2410C'); return; }
    var imm=getGestImmobili();
    if(!imm || !imm.length){ if(window.showToast) window.showToast('Nessun immobile trovato nel gestionale','','#C2410C'); return; }
    var im=findImmByKey(imm,key);
    if(!im){
      // fallback: prova a interpretare la chiave come ref puro o indice puro
      if(key.indexOf(':')<0 && key.charAt(0)!=='#'){
        im=findImmByKey(imm,'r:'+key) || findImmByKey(imm,'u:'+key);
      }
      if(!im){ if(window.showToast) window.showToast('Immobile non individuato, riprova','','#C2410C'); return; }
    }
    // 1) memorizza l'ID portale nel campo linkPortale (così il match esatto lo trova sempre)
    var existingId=extractPortalId(im.linkPortale);
    if(existingId!==cod){
      im.linkPortale='https://www.immobiliare.it/annunci/'+cod+'/';
    }
    // 2) salva nella mappa abbinamenti (robusto anche senza struttura immobili)
    var m=loadMap(); m[cod]=key; saveMap(m);
    // 3) persisti i dati del gestionale se la funzione esiste
    try{ if(typeof window.saveD==='function') window.saveD(); }catch(e){}
    var refLbl=im.ref||'immobile';
    window.imioCloseMatch();
    window.imioRender();
    if(typeof window.showToast==='function') window.showToast('Abbinamento salvato: '+refLbl+' \u2192 cod. '+cod,'','#15803D');
  };

  // Rimuove l'abbinamento manuale per il codice corrente
  window.imioUnlink=function(){
    var cod=_mmGetCodice();
    if(!cod) return;
    var m=loadMap();
    var key=m[cod];
    delete m[cod]; saveMap(m);
    // pulisci anche il linkPortale se puntava a questo codice
    try{
      var imm=getGestImmobili(); var im=findImmByKey(imm,key);
      if(im && extractPortalId(im.linkPortale)===cod){ im.linkPortale=''; if(typeof window.saveD==='function') window.saveD(); }
    }catch(e){}
    window.imioCloseMatch();
    window.imioRender();
    if(typeof window.showToast==='function') window.showToast('Abbinamento rimosso','','#C2410C');
  };

  /* ════════════════════════════════════════════════════════════════════
     ANTEPRIMA ANNUNCIO — dettaglio + link al portale + scheda gestionale
     ════════════════════════════════════════════════════════════════════ */
  window.imioPreview=function(codice){
    var data=loadLS(); if(!data) return;
    var rec=null; for(var i=0;i<data.records.length;i++){ if(data.records[i].codice===codice){ rec=data.records[i]; break; } }
    if(!rec) return;
    matchRecords(data.records); // assicura rec.match aggiornato
    var m=rec.match||{stato:'non-gest'};
    var imm=getGestImmobili();
    var im = m.key? findImmByKey(imm, m.key) : null;
    var imIdx = im? imm.indexOf(im) : -1;

    var ov=document.getElementById('imio-pv-overlay');
    if(!ov){
      ov=document.createElement('div'); ov.id='imio-pv-overlay';
      ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
      ov.innerHTML='<div id="imio-pv-card" style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)"></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click',function(e){ if(e.target===ov) ov.style.display='none'; });
    }
    var pr=rec.contratto==='Affitto'? rec.canone : rec.prezzo;
    var conv=rec.visite? (rec.contatti/rec.visite*100).toFixed(2)+'%':'—';
    // foto immobile gestionale se disponibile
    var foto = (im && im.foto && String(im.foto).length>10) ? im.foto : '';
    var fotoHtml = foto ? '<img src="'+esc(foto)+'" style="width:100%;height:200px;object-fit:cover;border-radius:12px 12px 0 0;display:block" onerror="this.style.display=\'none\'">'
                        : '<div style="height:120px;background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:center"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>';

    var statoBadge;
    if(m.stato==='attivo')      statoBadge='<span style="background:#DCFCE7;color:#15803D;padding:3px 10px;border-radius:20px;font-size:.74rem;font-weight:700">● Attivo in gestionale'+(m.ref?' · '+esc(m.ref):'')+'</span>';
    else if(m.stato==='non-attivo') statoBadge='<span style="background:#FFEDD5;color:#C2410C;padding:3px 10px;border-radius:20px;font-size:.74rem;font-weight:700">● '+esc(m.statoGest||'Non attivo')+(m.ref?' · '+esc(m.ref):'')+'</span>';
    else                        statoBadge='<span style="background:#F1F5F9;color:#64748B;padding:3px 10px;border-radius:20px;font-size:.74rem;font-weight:700">Non in gestionale</span>';

    function stat(lbl,val,col){ return '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px"><div style="font-size:.66rem;color:#64748B;font-weight:700;text-transform:uppercase">'+lbl+'</div><div style="font-size:1.15rem;font-weight:800;color:'+(col||'#0F172A')+'">'+val+'</div></div>'; }

    var portalUrl='https://www.immobiliare.it/annunci/'+encodeURIComponent(rec.codice)+'/';
    var card=document.getElementById('imio-pv-card');
    card.innerHTML=
      fotoHtml+
      '<div style="padding:18px 22px 22px">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">'+
          '<div><div style="font-weight:800;font-size:1.1rem;color:#0F172A">'+esc(rec.tipologia)+(rec.premium?' <span style="color:#D97706">★</span>':'')+'</div>'+
          '<div style="font-size:.84rem;color:#64748B;margin-top:2px">'+esc(rec.comune)+(rec.indirizzo?' · '+esc(rec.indirizzo):'')+'</div></div>'+
          '<button onclick="document.getElementById(\'imio-pv-overlay\').style.display=\'none\'" style="background:#F1F5F9;border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:1.1rem;color:#475569;flex-shrink:0">&times;</button>'+
        '</div>'+
        '<div style="margin:12px 0">'+statoBadge+'</div>'+
        '<div style="font-size:1.5rem;font-weight:800;color:#15803D;margin-bottom:14px">'+(pr>0?fmtEur(pr)+(rec.contratto==='Affitto'?'<span style="font-size:.8rem;color:#94A3B8">/mese</span>':''):'Prezzo n/d')+'</div>'+
        '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px">'+
          stat('Visite',fmtN(rec.visite),'#2563EB')+
          stat('Contatti',fmtN(rec.contatti),'#C2410C')+
          stat('Salvati',fmtN(rec.salvati),'#7C3AED')+
          stat('Conversione',conv,'#15803D')+
        '</div>'+
        '<div style="font-size:.78rem;color:#94A3B8;margin-bottom:16px">Cod. Immobiliare.it: <strong>'+esc(rec.codice)+'</strong>'+(rec.codiceAgenzia?' · Rif. agenzia: <strong>'+esc(rec.codiceAgenzia)+'</strong>':'')+' · Qualità annuncio: <strong>'+(rec.qualita||0)+'%</strong></div>'+
        '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
          (imIdx>=0 ? '<button onclick="imioOpenScheda('+imIdx+')" style="flex:1;min-width:160px;background:#2563EB;color:#fff;border:none;padding:11px 16px;border-radius:10px;font-weight:700;cursor:pointer;font-size:.88rem;display:inline-flex;align-items:center;justify-content:center;gap:7px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg> Apri scheda gestionale</button>'
                     : '<button onclick="document.getElementById(\'imio-pv-overlay\').style.display=\'none\';imioOpenMatch(\''+esc(rec.codice).replace(/'/g,"\\'")+'\')" style="flex:1;min-width:160px;background:#fff;color:#2563EB;border:1px solid #BFDBFE;padding:11px 16px;border-radius:10px;font-weight:700;cursor:pointer;font-size:.88rem">+ Abbina al gestionale</button>')+
          '<a href="'+portalUrl+'" target="_blank" rel="noopener" style="flex:1;min-width:140px;background:#fff;color:#475569;border:1px solid #E2E8F0;padding:11px 16px;border-radius:10px;font-weight:700;cursor:pointer;font-size:.88rem;text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Vedi su Immobiliare.it</a>'+
        '</div>'+
      '</div>';
    ov.style.display='flex';
  };
  // apre la scheda immobile nativa del gestionale e chiude l'anteprima
  window.imioOpenScheda=function(idx){
    var ov=document.getElementById('imio-pv-overlay'); if(ov) ov.style.display='none';
    try{ if(typeof window.openSchedaImmobile==='function'){ window.openSchedaImmobile(idx); return; } }catch(e){}
    try{ if(typeof openSchedaImmobile==='function'){ openSchedaImmobile(idx); return; } }catch(e){}
    if(typeof window.showToast==='function') window.showToast('Scheda immobile non disponibile','','#C2410C');
  };

  /* ---- Popola i filtri (una sola volta per dataset) ---- */
  function fillFilters(recs){
    function opts(sel, vals, label){
      var el=document.getElementById(sel); if(!el) return;
      var cur=el.value;
      var u=Array.from(new Set(vals.filter(Boolean))).sort();
      el.innerHTML='<option value="">'+label+'</option>'+u.map(function(v){return '<option>'+esc(v)+'</option>';}).join('');
      if(u.indexOf(cur)>=0) el.value=cur;
    }
    opts('imio-f-contratto', recs.map(function(r){return r.contratto;}), 'Tutti i contratti');
    opts('imio-f-tipo', recs.map(function(r){return r.tipologia;}), 'Tutte le tipologie');
    opts('imio-f-comune', recs.map(function(r){return r.comune;}), 'Tutti i comuni');
  }

  function applyFilters(recs){
    var fc=(document.getElementById('imio-f-contratto')||{}).value||'';
    var ft=(document.getElementById('imio-f-tipo')||{}).value||'';
    var fco=(document.getElementById('imio-f-comune')||{}).value||'';
    var fp=(document.getElementById('imio-f-premium')||{}).value||'';
    var fm=(document.getElementById('imio-f-match')||{}).value||'attivo';
    var q=((document.getElementById('imio-search')||{}).value||'').toLowerCase().trim();
    return recs.filter(function(r){
      var ms=(r.match&&r.match.stato)||'non-gest';
      if(fm==='attivo' && ms!=='attivo') return false;
      if(fm==='non-attivo' && ms!=='non-attivo') return false;
      if(fm==='non-gest' && ms!=='non-gest') return false;
      // fm==='' => tutti
      if(fc && r.contratto!==fc) return false;
      if(ft && r.tipologia!==ft) return false;
      if(fco && r.comune!==fco) return false;
      if(fp==='si' && !r.premium) return false;
      if(fp==='no' && r.premium) return false;
      if(q){
        var hay=(r.codice+' '+r.comune+' '+r.indirizzo+' '+r.tipologia).toLowerCase();
        if(hay.indexOf(q)<0) return false;
      }
      return true;
    });
  }

  /* ---- KPI cards ---- */
  function kpiCard(label, value, sub, color){
    return '<div style="background:#fff;border:1px solid var(--border,#E2E8F0);border-radius:14px;padding:16px 18px">'+
      '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:'+(color||'#64748B')+'">'+label+'</div>'+
      '<div style="font-size:1.6rem;font-weight:800;color:#0F172A;margin-top:4px;line-height:1.1">'+value+'</div>'+
      (sub?'<div style="font-size:.74rem;color:#94A3B8;margin-top:3px">'+sub+'</div>':'')+
      '</div>';
  }
  function renderKPI(recs){
    var n=recs.length;
    var visite=recs.reduce(function(s,r){return s+r.visite;},0);
    var salvati=recs.reduce(function(s,r){return s+r.salvati;},0);
    var contatti=recs.reduce(function(s,r){return s+r.contatti;},0);
    var prem=recs.filter(function(r){return r.premium;}).length;
    var qVals=recs.filter(function(r){return r.qualita>0;}).map(function(r){return r.qualita;});
    var qMed=qVals.length? Math.round(qVals.reduce(function(a,b){return a+b;},0)/qVals.length):0;
    var conv= visite>0 ? (contatti/visite*100) : 0;
    var html=
      kpiCard('Annunci attivi', fmtN(n), prem+' premium', '#2563EB')+
      kpiCard('Visite totali', fmtN(visite), 'media '+fmtN(n? visite/n:0)+'/annuncio', '#15803D')+
      kpiCard('Contatti', fmtN(contatti), 'conversione '+conv.toFixed(2)+'%', '#C2410C')+
      kpiCard('Salvati', fmtN(salvati), 'media '+fmtN(n? salvati/n:0)+'/annuncio', '#7C3AED')+
      kpiCard('Qualità media', qMed+'%', qMed<60?'da migliorare':'buona', qMed<60?'#C2410C':'#15803D')+
      kpiCard('Quota Premium', (n? Math.round(prem/n*100):0)+'%', prem+' su '+n+' annunci', '#D97706');
    document.getElementById('imio-kpi').innerHTML=html;
  }

  /* ---- Grafici ---- */
  var PALETTE=['#2563EB','#15803D','#C2410C','#7C3AED','#D97706','#0891B2','#DB2777','#65A30D','#9333EA','#DC2626'];
  function destroyCharts(){ Object.keys(charts).forEach(function(k){ try{charts[k].destroy();}catch(e){} }); charts={}; }
  function aggSum(recs, key, valKey){
    var m={}; recs.forEach(function(r){ m[r[key]]=(m[r[key]]||0)+r[valKey]; });
    return Object.keys(m).map(function(k){return [k,m[k]];}).sort(function(a,b){return b[1]-a[1];});
  }

  function renderCharts(recs){
    if(!window.Chart){
      /* Chart.js non ancora caricato: caricalo (via _anEnsureChart, condiviso
         con Analytics) e poi ridisegna. Prima i grafici uscivano vuoti perché
         questa funzione tornava subito senza caricare la libreria. */
      if(typeof _anEnsureChart==='function'){
        _anEnsureChart(function(){ try{ renderCharts(recs); }catch(e){} });
      }
      return;
    }
    destroyCharts();
    Chart.defaults.font.family="'Inter',sans-serif";
    Chart.defaults.font.size=11;

    // 1) Visite per tipologia (barre)
    var t=aggSum(recs,'tipologia','visite').slice(0,10);
    charts.tipo=new Chart(document.getElementById('imio-ch-tipo'),{
      type:'bar',
      data:{labels:t.map(function(x){return x[0];}),
        datasets:[{data:t.map(function(x){return x[1];}),backgroundColor:'#2563EB',borderRadius:6}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{ticks:{maxRotation:45,minRotation:0}},y:{beginAtZero:true}}}
    });

    // 2) Visite per comune (barre orizzontali, top 8)
    var c=aggSum(recs,'comune','visite').slice(0,8);
    charts.comune=new Chart(document.getElementById('imio-ch-comune'),{
      type:'bar',
      data:{labels:c.map(function(x){return x[0];}),
        datasets:[{data:c.map(function(x){return x[1];}),backgroundColor:'#15803D',borderRadius:6}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}
    });

    // 3) Premium vs Standard (ciambella)
    var prem=recs.filter(function(r){return r.premium;}).length, std=recs.length-prem;
    charts.premium=new Chart(document.getElementById('imio-ch-premium'),{
      type:'doughnut',
      data:{labels:['Premium','Standard'],datasets:[{data:[prem,std],backgroundColor:['#D97706','#CBD5E1'],borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'bottom'}}}
    });

    // 4) Scatter visite vs contatti (efficienza)
    charts.scatter=new Chart(document.getElementById('imio-ch-scatter'),{
      type:'scatter',
      data:{datasets:[{
        data:recs.map(function(r){return {x:r.visite,y:r.contatti,_r:r};}),
        backgroundColor:recs.map(function(r){return r.premium?'rgba(217,119,6,.7)':'rgba(37,99,235,.6)';}),
        pointRadius:5, pointHoverRadius:7
      }]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
        tooltip:{callbacks:{label:function(ctx){var r=ctx.raw._r;return [(r.codice||'—')+' · '+r.comune, r.visite+' visite · '+r.contatti+' contatti'];}}}},
        scales:{x:{title:{display:true,text:'Visite'},beginAtZero:true},y:{title:{display:true,text:'Contatti'},beginAtZero:true}}}
    });
  }

  /* ---- Tabella ordinabile ---- */
  var COLS=[
    {k:'codice',  t:'Codice',    align:'left'},
    {k:'tipologia',t:'Tipologia',align:'left'},
    {k:'comune',  t:'Comune',    align:'left'},
    {k:'prezzo',  t:'Prezzo',    align:'right', fmt:function(r){return r.contratto==='Affitto'? (r.canone?fmtEur(r.canone)+'/m':'—') : fmtEur(r.prezzo);}},
    {k:'visite',  t:'Visite',    align:'right', fmt:function(r){return fmtN(r.visite);}},
    {k:'salvati', t:'Salvati',   align:'right', fmt:function(r){return fmtN(r.salvati);}},
    {k:'contatti',t:'Contatti',  align:'right', fmt:function(r){return fmtN(r.contatti);}},
    {k:'conv',    t:'Conv.%',    align:'right', fmt:function(r){return r.visite? (r.contatti/r.visite*100).toFixed(2)+'%':'—';}, val:function(r){return r.visite? r.contatti/r.visite:0;}},
    {k:'qualita', t:'Qualità',   align:'right', fmt:function(r){return r.qualita?r.qualita+'%':'—';}},
    {k:'premium', t:'Premium',   align:'center',fmt:function(r){return r.premium?'<span style="color:#D97706;font-weight:800">★</span>':'';}, val:function(r){return r.premium?1:0;}},
    {k:'gest',    t:'Gestionale',align:'center',
      fmt:function(r){
        var m=r.match||{stato:'non-gest'};
        var cod=esc(r.codice).replace(/'/g,"\\'");
        var inner;
        if(m.stato==='attivo')     inner='<span title="Ref. '+esc(m.ref)+' · '+esc(m.how)+'" style="display:inline-block;background:#DCFCE7;color:#15803D;padding:2px 8px;border-radius:20px;font-size:.72rem;font-weight:700">● '+(m.ref?esc(m.ref):'attivo')+(m.how==='manuale'?' &#128279;':'')+'</span>';
        else if(m.stato==='non-attivo') inner='<span title="Stato: '+esc(m.statoGest)+'" style="display:inline-block;background:#FFEDD5;color:#C2410C;padding:2px 8px;border-radius:20px;font-size:.72rem;font-weight:700">● '+esc(m.statoGest||'non attivo')+'</span>';
        else inner='<span style="display:inline-block;background:#F1F5F9;color:#64748B;padding:2px 8px;border-radius:20px;font-size:.72rem;font-weight:700">non in gestionale</span>';
        return '<span onclick="imioOpenMatch(\''+cod+'\')" title="Clicca per abbinare manualmente" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px">'+inner+'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg></span>';
      },
      val:function(r){var m=r.match||{};return m.stato==='attivo'?2:m.stato==='non-attivo'?1:0;}},
    {k:'azioni', t:'',          align:'center', sortable:false,
      fmt:function(r){
        var cod=esc(r.codice).replace(/'/g,"\\'");
        return '<button onclick="imioPreview(\''+cod+'\')" title="Anteprima immobile" style="background:#EFF6FF;border:1px solid #DBEAFE;color:#2563EB;width:30px;height:30px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
      }}
  ];
  window.imioSort=function(col){
    if(sortState.col===col) sortState.dir*=-1; else { sortState.col=col; sortState.dir=-1; }
    imioRender();
  };
  function renderTable(recs){
    var thead=document.getElementById('imio-thead'), tbody=document.getElementById('imio-tbody');
    thead.innerHTML='<tr>'+COLS.map(function(c){
      var arrow = sortState.col===c.k ? (sortState.dir<0?' ▼':' ▲') : '';
      if(c.sortable===false){
        return '<th style="text-align:'+c.align+';padding:10px 12px;font-size:.7rem;color:#64748B;border-bottom:2px solid var(--border,#E2E8F0);white-space:nowrap;background:#F8FAFC;position:sticky;top:0">'+c.t+'</th>';
      }
      return '<th onclick="imioSort(\''+c.k+'\')" style="text-align:'+c.align+';padding:10px 12px;font-size:.7rem;text-transform:uppercase;letter-spacing:.03em;color:#64748B;border-bottom:2px solid var(--border,#E2E8F0);cursor:pointer;white-space:nowrap;background:#F8FAFC;position:sticky;top:0">'+c.t+arrow+'</th>';
    }).join('')+'</tr>';

    var col=COLS.filter(function(c){return c.k===sortState.col;})[0]||COLS[0];
    var valOf=col.val||function(r){return r[col.k];};
    var sorted=recs.slice().sort(function(a,b){
      var va=valOf(a), vb=valOf(b);
      if(typeof va==='string') return sortState.dir*va.localeCompare(vb);
      return sortState.dir*((va||0)-(vb||0));
    });

    tbody.innerHTML=sorted.map(function(r,i){
      return '<tr style="background:'+(i%2?'#fff':'#FBFCFE')+'">'+COLS.map(function(c){
        var content = c.fmt? c.fmt(r) : esc(r[c.k]);
        return '<td style="text-align:'+c.align+';padding:9px 12px;border-bottom:1px solid #F1F5F9;white-space:nowrap">'+content+'</td>';
      }).join('')+'</tr>';
    }).join('')|| '<tr><td colspan="'+COLS.length+'" style="padding:24px;text-align:center;color:#94A3B8">Nessun annuncio con i filtri selezionati.</td></tr>';
    document.getElementById('imio-tbl-sub').textContent=sorted.length+' annunci visualizzati';
  }

  /* ---- Render completo (post-filtri) ---- */
  /* ════════════════════════════════════════════════════════════════════
     CONFRONTO PERIODI — delta tra due snapshot
     ════════════════════════════════════════════════════════════════════ */
  function snapByDate(date){ var s=loadSnaps(); for(var i=0;i<s.length;i++){ if(s[i].date===date) return s[i]; } return null; }
  function fmtDelta(n, invert){
    if(n===0) return '<span style="color:#94A3B8">—</span>';
    var pos=n>0, good = invert? !pos : pos;
    var col = good? '#15803D':'#DC2626';
    var arr = pos? '▲':'▼';
    return '<span style="color:'+col+';font-weight:700">'+arr+' '+fmtN(Math.abs(n))+'</span>';
  }
  // Popola i due select con le date disponibili
  function fillCompareSelects(){
    var snaps=loadSnaps();
    var selA=document.getElementById('imio-cmp-a'), selB=document.getElementById('imio-cmp-b');
    if(!selA||!selB) return;
    if(snaps.length<2){ return; }
    function fmtDate(s){ var d=new Date(s.date+'T00:00:00'); return d.toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}); }
    var optsHtml=snaps.map(function(s){ return '<option value="'+s.date+'">'+fmtDate(s)+' ('+s.recs.length+' annunci)</option>'; }).join('');
    var curA=selA.value, curB=selB.value;
    selA.innerHTML=optsHtml; selB.innerHTML=optsHtml;
    selA.value = curA && snaps.some(function(s){return s.date===curA;}) ? curA : snaps[snaps.length-2].date;
    selB.value = curB && snaps.some(function(s){return s.date===curB;}) ? curB : snaps[snaps.length-1].date;
  }
  // Renderizza la tabella di confronto tra le due date selezionate
  window.imioRenderCompare=function(){
    var box=document.getElementById('imio-cmp-body'); if(!box) return;
    var snaps=loadSnaps();
    if(snaps.length<2){
      var info='';
      if(snaps.length===1){
        var d1=new Date(snaps[0].date+'T00:00:00');
        info='<div style="margin-bottom:10px;padding:10px 14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;font-size:.82rem;color:#15803D">&#10003; Import registrato del <strong>'+d1.toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'})+'</strong> ('+snaps[0].recs.length+' annunci). Questo &egrave; il tuo primo snapshot storico.</div>';
      }
      box.innerHTML=info+'<div style="padding:18px;text-align:center;color:#94A3B8;font-size:.85rem">Per confrontare l\'andamento serve <strong>almeno un secondo import in una data diversa</strong>. Torna a caricare un nuovo CSV tra qualche giorno o settimana: il sistema calcoler&agrave; automaticamente la crescita di visite, contatti e salvati.</div>';
      return;
    }
    var dA=(document.getElementById('imio-cmp-a')||{}).value;
    var dB=(document.getElementById('imio-cmp-b')||{}).value;
    var A=snapByDate(dA), B=snapByDate(dB);
    if(!A||!B){ box.innerHTML=''; return; }
    var mapA={}; A.recs.forEach(function(r){ mapA[r.codice]=r; });
    var manual=loadMap(); var imm=getGestImmobili();
    var byId={}; imm.forEach(function(im){ var id=extractPortalId(im.linkPortale); if(id) byId[id]=im; });
    function gestStato(cod){
      var im = manual[cod]? findImmByKey(imm,manual[cod]) : byId[cod];
      return im||null;
    }
    var onlyAttivi=(document.getElementById('imio-cmp-attivi')||{}).checked;
    var rows=[];
    var tot={visiteA:0,visiteB:0,contattiA:0,contattiB:0,salvatiA:0,salvatiB:0};
    B.recs.forEach(function(b){
      var im=gestStato(b.codice);
      if(onlyAttivi && (!im || norm(im.stato)!=='attivo')) return;
      var a=mapA[b.codice];
      tot.visiteB+=b.visite; tot.salvatiB+=b.salvati; tot.contattiB+=b.contatti;
      if(a){ tot.visiteA+=a.visite; tot.salvatiA+=a.salvati; tot.contattiA+=a.contatti; }
      rows.push({ rec:b, isNew:!a,
        dVis: a? b.visite-a.visite : null,
        dSal: a? b.salvati-a.salvati : null,
        dCon: a? b.contatti-a.contatti : null,
        ref: im? (im.ref||'') : '' });
    });
    var mapB={}; B.recs.forEach(function(r){ mapB[r.codice]=true; });
    A.recs.forEach(function(a){ if(!mapB[a.codice]){
      var im=gestStato(a.codice);
      if(onlyAttivi && (!im || norm(im.stato)!=='attivo')) return;
      rows.push({ rec:a, isGone:true, dVis:null,dSal:null,dCon:null, ref: im?(im.ref||''):'' });
    }});
    rows.sort(function(x,y){ return (y.dVis===null?-1e9:y.dVis)-(x.dVis===null?-1e9:x.dVis); });

    var giorni=Math.max(1, Math.round((new Date(dB)-new Date(dA))/86400000));
    var header='<div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:14px">'+
      '<div style="flex:1;min-width:140px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px"><div style="font-size:.7rem;color:#64748B;font-weight:700;text-transform:uppercase">Visite nel periodo</div><div style="font-size:1.4rem;font-weight:800;color:#0F172A">'+fmtDelta(tot.visiteB-tot.visiteA)+' <span style="font-size:.8rem;color:#94A3B8;font-weight:600">su '+giorni+' gg</span></div></div>'+
      '<div style="flex:1;min-width:140px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px"><div style="font-size:.7rem;color:#64748B;font-weight:700;text-transform:uppercase">Contatti nel periodo</div><div style="font-size:1.4rem;font-weight:800;color:#0F172A">'+fmtDelta(tot.contattiB-tot.contattiA)+'</div></div>'+
      '<div style="flex:1;min-width:140px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px"><div style="font-size:.7rem;color:#64748B;font-weight:700;text-transform:uppercase">Salvati nel periodo</div><div style="font-size:1.4rem;font-weight:800;color:#0F172A">'+fmtDelta(tot.salvatiB-tot.salvatiA)+'</div></div>'+
      '</div>';

    var trs=rows.map(function(o){
      var r=o.rec;
      var tag = o.isNew? '<span style="background:#DBEAFE;color:#1D4ED8;font-size:.64rem;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:5px">nuovo</span>'
              : o.isGone? '<span style="background:#FEE2E2;color:#B91C1C;font-size:.64rem;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:5px">uscito</span>' : '';
      return '<tr>'+
        '<td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;white-space:nowrap">'+(o.ref?'<strong>'+esc(o.ref)+'</strong> · ':'')+esc(r.codice)+tag+'</td>'+
        '<td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;white-space:nowrap">'+esc(r.tipologia)+' · '+esc(r.comune)+'</td>'+
        '<td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;text-align:right;white-space:nowrap">'+fmtN(r.visite)+'</td>'+
        '<td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;text-align:right;white-space:nowrap">'+(o.dVis===null?'<span style="color:#94A3B8">n/d</span>':fmtDelta(o.dVis))+'</td>'+
        '<td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;text-align:right;white-space:nowrap">'+(o.dCon===null?'<span style="color:#94A3B8">n/d</span>':fmtDelta(o.dCon))+'</td>'+
        '<td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;text-align:right;white-space:nowrap">'+(o.dSal===null?'<span style="color:#94A3B8">n/d</span>':fmtDelta(o.dSal))+'</td>'+
      '</tr>';
    }).join('');
    box.innerHTML=header+
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.82rem;min-width:640px">'+
      '<thead><tr>'+['Immobile','Tipo · Comune','Visite ('+B.date+')','Δ Visite','Δ Contatti','Δ Salvati'].map(function(h,i){return '<th style="text-align:'+(i<2?'left':'right')+';padding:9px 12px;font-size:.68rem;text-transform:uppercase;color:#64748B;border-bottom:2px solid #E2E8F0;background:#F8FAFC;white-space:nowrap">'+h+'</th>';}).join('')+'</tr></thead>'+
      '<tbody>'+(trs||'<tr><td colspan="6" style="padding:20px;text-align:center;color:#94A3B8">Nessun immobile da confrontare con i filtri attuali.</td></tr>')+'</tbody></table></div>';
  };
  /* Pannello IMMOBILI NON ABBINATI: elenca gli immobili attivi del gestionale
     che NON hanno corrispondenza nei dati CSV (né per codice esplicito, né per
     link, né manuale). Sono quelli per cui mancano le statistiche. */
  window.renderImmobiliNonAbbinati=function(){
    var box=document.getElementById('imio-non-abbinati'); if(!box) return;
    var snaps=loadSnaps();
    if(!snaps.length){ box.innerHTML=''; return; }
    /* codici presenti nell'ultimo snapshot */
    var ultimo=snaps[snaps.length-1];
    var codiciCsv={}; ultimo.recs.forEach(function(r){ if(r.codice) codiciCsv[String(r.codice).replace(/\D/g,'')]=true; });
    var manual=loadMap(); var imm=getGestImmobili();
    /* per ogni immobile attivo, ha un codice che sta nel CSV? */
    var nonAbbinati=[];
    imm.forEach(function(im){
      if(norm(im.stato)!=='attivo') return;
      var codExpl = im.codImmobiliare ? String(im.codImmobiliare).replace(/\D/g,'') : '';
      var codLink = extractPortalId(im.linkPortale);
      var hasManual = manual && Object.keys(manual).some(function(c){ return findImmByKey(imm,manual[c])===im; });
      var abbinato = (codExpl && codiciCsv[codExpl]) || (codLink && codiciCsv[codLink]) || hasManual;
      if(!abbinato){
        nonAbbinati.push({ ref:im.ref||'', tipo:im.tipo||'', comune:im.comune||'',
          motivo: (!codExpl && !codLink) ? 'manca codice' : 'codice non nel CSV' });
      }
    });
    if(!nonAbbinati.length){
      box.innerHTML='<div style="padding:12px 16px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;font-size:.83rem;color:#15803D;font-weight:600">&#10003; Tutti gli immobili attivi sono abbinati ai dati statistici.</div>';
      return;
    }
    var righe=nonAbbinati.map(function(o){
      var motivoBg = o.motivo==='manca codice' ? '#FEF3C7' : '#FEE2E2';
      var motivoCol = o.motivo==='manca codice' ? '#92400E' : '#B91C1C';
      return '<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #F1F5F9">'
        + '<div style="flex:1;min-width:0"><span style="font-weight:800;color:#0F172A">'+esc(o.ref||'—')+'</span> '
        + '<span style="color:#64748B;font-size:.82rem">'+esc(o.tipo)+(o.comune?' · '+esc(o.comune):'')+'</span></div>'
        + '<span style="font-size:.7rem;font-weight:700;padding:2px 9px;border-radius:8px;background:'+motivoBg+';color:'+motivoCol+'">'+o.motivo+'</span>'
        + '</div>';
    }).join('');
    box.innerHTML='<div class="imio-chart-card" style="padding:0;overflow:hidden;border:1px solid #FED7AA">'
      + '<div style="padding:13px 16px;background:#FFFBEB;border-bottom:1px solid #FED7AA;display:flex;align-items:center;gap:9px">'
      +   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      +   '<div style="flex:1"><div style="font-weight:800;color:#0F172A;font-size:.92rem">'+nonAbbinati.length+' immobili attivi senza statistiche</div>'
      +   '<div style="font-size:.76rem;color:#92400E">Aggiungi il codice Immobiliare.it nella loro scheda per abbinarli</div></div>'
      + '</div>'
      + righe
      + '</div>';
  };

  window.imioCmpChange=function(){ window.imioRenderCompare(); };

  /* Confronto TOTALE: dal primo snapshot registrato all'ultimo (andamento
     complessivo dall'inizio del monitoraggio). */
  window.imioConfrontoTotale=function(){
    var snaps=loadSnaps();
    if(snaps.length<2){
      if(typeof showToast==='function') showToast('Serve almeno un secondo import in una data diversa per il confronto totale','','#D97706');
      return;
    }
    var selA=document.getElementById('imio-cmp-a'), selB=document.getElementById('imio-cmp-b');
    if(selA&&selB){
      selA.value=snaps[0].date;                 /* primo snapshot */
      selB.value=snaps[snaps.length-1].date;    /* ultimo snapshot */
      window.imioRenderCompare();
      if(typeof showToast==='function'){
        var d1=new Date(snaps[0].date+'T00:00:00'), d2=new Date(snaps[snaps.length-1].date+'T00:00:00');
        showToast('Andamento dal primo all\'ultimo import','dal '+d1.toLocaleDateString('it-IT')+' al '+d2.toLocaleDateString('it-IT'),'#2563EB');
      }
    }
  };

  /* Banner riepilogo abbinamento */
  function renderMatchSummary(stats){
    var el=document.getElementById('imio-match-summary'); if(!el) return;
    var tot=stats.attivo+stats.nonAttivo+stats.nonGest;
    function chip(col,bg,label,val){
      return '<span style="display:inline-flex;align-items:center;gap:6px;background:'+bg+';color:'+col+';padding:5px 11px;border-radius:8px;font-size:.78rem;font-weight:700">'+
        '<span style="width:8px;height:8px;border-radius:50%;background:'+col+'"></span>'+label+': '+val+'</span>';
    }
    el.innerHTML=
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">'+
        chip('#15803D','#F0FDF4','Attivi in gestionale',stats.attivo)+
        chip('#C2410C','#FFF7ED','Non più attivi',stats.nonAttivo)+
        chip('#64748B','#F1F5F9','Non in gestionale',stats.nonGest)+
        '<span style="flex:1"></span>'+
        '<span style="font-size:.72rem;color:#94A3B8">Abbinati: '+stats.esatti+' per link · '+stats.manuali+' manuali · '+stats.fuzzy+' per somiglianza · '+tot+' annunci totali</span>'+
      '</div>';
  }

  window.imioRender=function(){
    var data=loadLS(); if(!data||!data.records) return;
    var stats=matchRecords(data.records);   // abbina e popola r.match su tutti i record
    renderMatchSummary(stats);
    var recs=applyFilters(data.records);
    renderKPI(recs);
    renderCharts(recs);
    renderTable(recs);
    fillCompareSelects();
    window.imioRenderCompare();
    try{ if(typeof window.renderImmobiliNonAbbinati==='function') window.renderImmobiliNonAbbinati(); }catch(e){}
  };

  /* ---- Boot della sezione (chiamato da go('immobiliare')) ---- */
  window.imioBoot=function(){
    var data=loadLS();
    var empty=document.getElementById('imio-empty');
    var content=document.getElementById('imio-content');
    var clearBtn=document.getElementById('imio-clear-btn');
    var sub=document.getElementById('imio-top-sub');
    var cnt=document.getElementById('imio-count');
    if(!data||!data.records||!data.records.length){
      if(empty) empty.style.display='block';
      if(content) content.style.display='none';
      if(clearBtn) clearBtn.style.display='none';
      if(sub) sub.textContent='Importa il CSV dei tuoi annunci attivi';
      if(cnt) cnt.textContent='—';
      return;
    }
    if(empty) empty.style.display='none';
    if(content) content.style.display='block';
    if(clearBtn) clearBtn.style.display='inline-block';
    if(cnt) cnt.textContent=data.records.length+' annunci';
    if(sub){
      var d=data.importedAt? new Date(data.importedAt):null;
      sub.textContent='Ultimo import: '+(d? d.toLocaleDateString('it-IT')+' '+d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'—')+(data.fileName?' · '+data.fileName:'')+(loadSnaps().length>1?' · '+loadSnaps().length+' import storici':'');
    }
    fillFilters(data.records);
    // Carica Chart.js se serve, poi disegna
    if(typeof _anEnsureChart==='function'){ _anEnsureChart(function(){ imioRender(); }); }
    else { imioRender(); }
  };

  /* Inietta stile per le card grafici (riusa il look del gestionale) */
  function injectStyle(){
    if(STYLE_OK) return; STYLE_OK=true;
    var css='.imio-chart-card{background:#fff;border:1px solid var(--border,#E2E8F0);border-radius:14px;padding:16px 18px;box-shadow:0 1px 3px rgba(15,23,42,.04)}'+
      '.imio-chart-title{font-weight:800;font-size:.95rem;color:#0F172A}'+
      '.imio-chart-sub{font-size:.75rem;color:#94A3B8;margin-top:2px}'+
      '#imio-table th:hover{color:#2563EB}';
    var s=document.createElement('style'); s.textContent=css; document.head.appendChild(s);
  }
  injectStyle();
})();
