/* Redazione AI — pacchetto editoriale originale, collegato al Piano Social.
   I dati dell'immobile sono limitati ai campi pubblicabili; nomi, contatti,
   indirizzi, note private e dati catastali non vengono inviati al modello. */
(function(){
  'use strict';
  var rootId='sec-redazione', navId='nav-redazione';
  var ultimo=null, inCorso=false, giaAggiunto=false;
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var toast=function(m,t){try{if(typeof window.toast==='function') window.toast(m,t||''); else alert(m);}catch(e){}};
  var $=function(id){return document.getElementById(id);};
  function stile(){
    if($('ra-css')) return;
    var s=document.createElement('style'); s.id='ra-css';
    s.textContent=`
      #${rootId} .ra-intro{background:linear-gradient(125deg,#11283a,#244c5a);color:#fff;border-radius:14px;padding:20px 22px;margin-bottom:16px;display:flex;gap:18px;align-items:center;justify-content:space-between}
      #${rootId} .ra-intro h2{font-size:1.04rem;margin:0 0 5px;letter-spacing:-.02em}#${rootId} .ra-intro p{margin:0;color:#d3e0e2;font-size:.78rem;max-width:740px;line-height:1.55}
      #${rootId} .ra-badge{border:1px solid #ffffff36;background:#ffffff12;border-radius:999px;padding:7px 11px;font-size:.7rem;font-weight:700;white-space:nowrap}
      #${rootId} .ra-grid{display:grid;grid-template-columns:minmax(280px,.78fr) minmax(0,1.22fr);gap:16px;align-items:start}
      #${rootId} .ra-card{background:var(--hb-card,#fff);border:1px solid var(--cream2,#e8e3da);border-radius:13px;box-shadow:var(--shadow,0 4px 14px #0000000a);overflow:hidden}
      #${rootId} .ra-cardhead{padding:14px 16px;border-bottom:1px solid var(--cream2,#e8e3da);display:flex;align-items:center;justify-content:space-between;gap:10px}
      #${rootId} .ra-cardhead b{font-size:.86rem;color:var(--navy,#0D1B2A)}#${rootId} .ra-cardhead small{display:block;color:var(--text3,#77818c);font-size:.7rem;margin-top:3px}
      #${rootId} .ra-body{padding:15px 16px}#${rootId} .ra-field{display:grid;gap:5px;margin-bottom:12px}#${rootId} .ra-field label{font-size:.72rem;font-weight:700;color:var(--text2,#44515b)}
      #${rootId} .ra-field input,#${rootId} .ra-field select,#${rootId} .ra-field textarea{width:100%;border:1px solid var(--cream2,#ddd8cf);border-radius:8px;padding:9px 10px;background:var(--hb-card,#fff);color:var(--text,#17212b);font:inherit;font-size:.8rem}
      #${rootId} .ra-field textarea{min-height:96px;resize:vertical;line-height:1.45}#${rootId} .ra-field .ra-hint{font-size:.66rem;line-height:1.4;color:var(--text3,#77818c)}
      #${rootId} .ra-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px}#${rootId} .ra-disclosure{font-size:.68rem;color:var(--text3,#77818c);line-height:1.45;margin-top:11px}
      #${rootId} .ra-result{display:grid;gap:10px}#${rootId} .ra-piece{border:1px solid var(--cream2,#e8e3da);border-radius:10px;background:var(--hb-card,#fff);overflow:hidden}
      #${rootId} .ra-piecehead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:var(--hb-sub,#f7f5f1);border-bottom:1px solid var(--cream2,#e8e3da)}#${rootId} .ra-piecehead b{font-size:.76rem}
      #${rootId} .ra-piecebody{padding:11px 12px;font-size:.74rem;line-height:1.55;color:var(--text2,#44515b);white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto}
      #${rootId} .ra-slides{display:grid;gap:7px;padding:10px 12px}#${rootId} .ra-slide{display:grid;grid-template-columns:25px 1fr;gap:8px;padding:8px;border:1px solid var(--cream2,#e8e3da);border-radius:8px}
      #${rootId} .ra-slide-n{width:22px;height:22px;border-radius:7px;background:#e8f1f2;color:#315d6b;display:grid;place-items:center;font-size:.66rem;font-weight:800}#${rootId} .ra-slide b{font-size:.72rem;display:block;margin-bottom:3px;color:var(--navy,#0D1B2A)}#${rootId} .ra-slide p{font-size:.69rem;line-height:1.4;margin:0}
      #${rootId} .ra-flag{border-radius:8px;background:#fff5e6;border:1px solid #eed7ae;padding:10px 12px;font-size:.7rem;line-height:1.5;color:#714b1f;margin-bottom:10px}#${rootId} .ra-empty{padding:35px 18px;text-align:center;color:var(--text3,#77818c);font-size:.78rem;line-height:1.5}
      #${rootId} .ra-queue{margin-top:12px;padding:12px;border-radius:9px;background:#eef5f2;color:#285944;font-size:.72rem;line-height:1.45}
      @media(max-width:900px){#${rootId} .ra-grid{grid-template-columns:1fr}}@media(max-width:600px){#${rootId} .ra-intro{align-items:flex-start;flex-direction:column;padding:17px}#${rootId} .ra-badge{white-space:normal}}
    `;
    document.head.appendChild(s);
  }
  function install(){
    if($(rootId)) return;
    stile();
    var social=document.getElementById('navsub-social'), main=document.querySelector('.main-content');
    if(!social||!main) return;
    var nav=document.createElement('div'); nav.className='nav-item'; nav.id=navId; nav.setAttribute('onclick',"switchSection('redazione')");
    nav.innerHTML='<div class="ni-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/></svg></div><span>Redazione AI</span><span class="nav-badge" style="background:#7C3AED;color:white">NUOVO</span>';
    social.insertBefore(nav,social.firstChild);
    var panel=document.createElement('div'); panel.id=rootId; panel.className='section-panel';
    panel.innerHTML=`
      <div class="page-title-row"><div><div class="page-title">Redazione <span>AI</span></div><div class="page-subtitle">Un’idea originale diventa un pacchetto pronto da rifinire nel Piano Social.</div></div><button class="btn btn-outline btn-sm" onclick="aiToggleConfig();switchSection('ai')">⚙ Configura AI</button></div>
      <div class="ra-intro"><div><h2>Racconta il Cilento con una voce riconoscibile.</h2><p>Parti da una tua osservazione o da un immobile. L’AI prepara una guida YouTube, un Reel/Short, un carosello e un post Facebook; tu controlli i fatti e li aggiungi come bozze al Piano Social.</p></div><span class="ra-badge">Bozze con revisione · nessuna pubblicazione automatica da qui</span></div>
      <div class="ra-grid">
        <section class="ra-card"><div class="ra-cardhead"><div><b>Prepara il contenuto</b><small>Più esperienza reale inserisci, meno generico sarà il risultato.</small></div></div><div class="ra-body">
          <div class="ra-field"><label for="ra-mode">Da dove partiamo?</label><select id="ra-mode"><option value="territorio">Una storia o una guida sul territorio</option><option value="immobile">Un immobile del gestionale</option></select></div>
          <div id="ra-imm-wrap" class="ra-field" style="display:none"><label for="ra-imm">Scegli immobile</label><select id="ra-imm"><option value="">— Seleziona —</option></select><span class="ra-hint">Vengono usati solo dati descrittivi pubblici; non invio proprietario, telefono, indirizzo preciso, note private o dati catastali.</span></div>
          <div id="ra-area-wrap" class="ra-field"><label for="ra-area">Paese o zona</label><input id="ra-area" maxlength="100" placeholder="Es. Agropoli, Castellabate, entroterra cilentano"></div>
          <div class="ra-field"><label for="ra-idea">Angolo creativo</label><input id="ra-idea" maxlength="180" placeholder="Es. una cosa che capisci solo dopo aver visitato tre case qui"></div>
          <div class="ra-field"><label for="ra-fatti">La tua esperienza e i fatti verificati *</label><textarea id="ra-fatti" maxlength="2400" placeholder="Scrivi osservazioni tue, dettagli verificati, stagione, servizi o contesto che puoi confermare. Evita dati personali dei clienti."></textarea><span class="ra-hint">Questo è ciò che rende il contenuto tuo. L’AI non cercherà di inventare distanze, prezzi, servizi, regole o caratteristiche mancanti.</span></div>
          <div class="ra-field"><label for="ra-voce">Voce</label><select id="ra-voce"><option>Competente, calda e concreta</option><option>Curiosa e narrativa</option><option>Elegante e misurata</option><option>Diretta, con ironia leggera</option></select></div>
          <div class="ra-actions"><button class="btn btn-gold" id="ra-go">✨ Crea il pacchetto</button><button class="btn btn-outline" id="ra-reset">Pulisci</button></div>
          <div class="ra-disclosure">Il risultato resta una bozza. Rivedi nomi, numeri, affermazioni, diritti di foto/video e disponibilità dell’immobile prima di programmare. Una scena suggerita non prova che quel luogo o dettaglio esista.</div>
        </div></section>
        <section class="ra-card"><div class="ra-cardhead"><div><b>Il pacchetto editoriale</b><small id="ra-status">YouTube · Reel/Shorts · Instagram · Facebook</small></div><div id="ra-result-actions" style="display:none"><button class="btn btn-gold btn-sm" id="ra-queue">＋ Aggiungi bozze al Piano Social</button></div></div><div class="ra-body" id="ra-output"><div class="ra-empty">Scegli un tema e aggiungi la tua esperienza. Riceverai quattro formati con tagli diversi, non la stessa didascalia copiata ovunque.</div></div></section>
      </div>`;
    var overview=document.getElementById('sec-overview');
    if(overview) main.insertBefore(panel,overview); else main.appendChild(panel);
    fillProperties();
    $('ra-mode').addEventListener('change',modeChange);
    $('ra-go').addEventListener('click',genera);
    $('ra-reset').addEventListener('click',reset);
    $('ra-queue').addEventListener('click',aggiungiPiano);
    $('ra-output').addEventListener('click',function(e){var b=e.target.closest('[data-ra-copy]');if(b)copia(b.dataset.raCopy);});
    if(typeof window.switchSection==='function'&&!window._raWrappedSwitch){
      var old=window.switchSection;
      window.switchSection=function(name){old.apply(this,arguments);if(name==='redazione'){modeChange();}};
      window._raWrappedSwitch=true;
    }
  }
  function fillProperties(){
    var sel=$('ra-imm'); if(!sel)return;
    var old=sel.value, L=(typeof D!=='undefined'&&Array.isArray(D.immobili))?D.immobili:[];
    sel.innerHTML='<option value="">— Seleziona un immobile —</option>'+L.map(function(x,i){return '<option value="'+i+'">'+esc([x.tipo||'Immobile',x.comune||'',x.zona||'',x.ref?'Ref. '+x.ref:''].filter(Boolean).join(' · '))+'</option>';}).join('');
    if(old&&L[Number(old)])sel.value=old;
  }
  function modeChange(){
    var prop=$('ra-mode')&&$('ra-mode').value==='immobile';
    if($('ra-imm-wrap'))$('ra-imm-wrap').style.display=prop?'grid':'none';
    if($('ra-area-wrap'))$('ra-area-wrap').style.display=prop?'none':'grid';
    if(prop)fillProperties();
  }
  function publicText(value,im){
    var s=String(value==null?'':value);
    [im&&im.indirizzo,im&&im.proprietario,im&&im.nomeProprietario,im&&im.telefono,im&&im.tel].filter(Boolean).forEach(function(secret){
      var escaped=String(secret).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(escaped.length>2)try{s=s.replace(new RegExp(escaped,'gi'),'[dato omesso]');}catch(e){}
    });
    return s.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[contatto omesso]')
      .replace(/\+?\d[\d\s()./-]{7,}\d/g,'[numero omesso]').slice(0,900);
  }
  function propertyFacts(){
    fillProperties(); var i=$('ra-imm')&&$('ra-imm').value, im=(typeof D!=='undefined'&&Array.isArray(D.immobili)&&D.immobili[Number(i)])||null;
    if(!im)return null;
    var keys=[['tipo','Tipologia'],['comune','Comune'],['zona','Zona'],['prezzo','Prezzo richiesto'],['mq','Superficie'],['locali','Locali'],['camere','Camere'],['bagni','Bagni'],['energia','Classe energetica'],['descrizione','Descrizione pubblica'],['caratteristiche','Caratteristiche']];
    var out={}; keys.forEach(function(pair){var v=im[pair[0]];if(v==null||v==='')return;if(typeof v==='string')out[pair[1]]=publicText(v,im);else if(typeof v==='number'||typeof v==='boolean')out[pair[1]]=String(v).slice(0,900);else if(Array.isArray(v))out[pair[1]]=v.filter(function(x){return typeof x==='string'||typeof x==='number';}).map(function(x){return publicText(x,im);}).slice(0,20);});
    return {record:im,facts:out,title:[im.tipo||'Immobile',im.comune||'',im.zona||''].filter(Boolean).join(' a ')};
  }
  function systemPrompt(){
    return 'Sei la redattrice e direttrice creativa di un canale immobiliare indipendente del Cilento. Scrivi in italiano naturale, specifico, distintivo e umano. Non produrre frasi fatte da agenzia, inviti generici o hashtag in serie. Il contenuto deve partire da un angolo editoriale, spiegare qualcosa o far notare un dettaglio concreto. '+
      'AFFIDABILITÀ: usa soltanto i fatti confermati nel brief. Non inventare distanze, servizi, storia locale, prezzi, regole, dati di mercato, viste, caratteristiche dell’immobile, testimonianze o dettagli dei clienti. Se un’affermazione utile richiede conferma, aggiungila a "da_verificare" e formula il testo in modo prudente. Non rivelare dati personali o indirizzi precisi. Le idee di ripresa devono usare materiale reale e non simulare luoghi o caratteristiche. '+
      'Crea quattro contenuti realmente diversi: 1) video YouTube 4–6 minuti con titolo, descrizione, capitoli e copione; 2) Reel/Short 30–45 secondi con apertura forte, copione parlato, testi a schermo e inquadrature; 3) carosello Instagram di 6 slide con titolo, testo breve e suggerimento visuale realistico per ciascuna slide, più didascalia; 4) post Facebook autonomo, più conversazionale. Il Reel/Short deve avere titolo e descrizione Shorts. Il carosello deve essere utile anche senza leggere la didascalia. Nessun contenuto deve essere un duplicato degli altri. '+
      'Rispondi SOLO con JSON valido, senza markdown, con questa struttura esatta: '+
      '{"angolo":"","da_verificare":[""],"youtube":{"titolo":"","descrizione":"","miniatura":"","capitoli":[{"tempo":"00:00","titolo":""}],"copione":""},"reel":{"apertura":"","copione":"","schermate":[""],"inquadrature":[""],"titolo_shorts":"","descrizione_shorts":"","didascalia_ig":"","didascalia_fb":""},"carosello":{"titolo":"","slide":[{"titolo":"","testo":"","visual":""}],"didascalia_ig":""},"facebook":{"titolo":"","post":""}}';
  }
  function parse(text){if(typeof window.faiParseJSON==='function'){try{return faiParseJSON(text);}catch(e){}}try{return JSON.parse(String(text).replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/,'').trim());}catch(e){return null;}}
  async function genera(){
    if(inCorso)return;
    var proxy=typeof window.aiGetProxy==='function'?aiGetProxy():'';
    if(!proxy){toast('Configura prima il proxy AI in “Genera con AI”.','error');return;}
    var mode=$('ra-mode').value, fatti=$('ra-fatti').value.trim(), idea=$('ra-idea').value.trim(), voce=$('ra-voce').value;
    if(!fatti){toast('Aggiungi almeno un fatto o un’osservazione verificata.','error');$('ra-fatti').focus();return;}
    var source;
    if(mode==='immobile'){
      source=propertyFacts();if(!source){toast('Seleziona un immobile.','error');return;}
    }else{
      var area=$('ra-area').value.trim();if(!area){toast('Indica il paese o la zona.','error');$('ra-area').focus();return;}
      source={title:area,facts:{'Paese o zona':area}};
    }
    var brief={fonte:mode==='immobile'?'immobile dal gestionale':'territorio',titolo:source.title,angolo_suggerito:idea,voce:voce,fatti_confermati_dal_titolare:fatti,dati_pubblici_immobile:source.facts||null};
    inCorso=true;giaAggiunto=false;$('ra-go').disabled=true;$('ra-go').textContent='⏳ Sto preparando i contenuti…';$('ra-status').textContent='L’AI sta lavorando sui quattro formati';
    try{
      var resp=await aiFetch(proxy,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:typeof window.aiModel==='function'?aiModel():'claude-sonnet-4-6',max_tokens:5200,temperature:0.75,system:systemPrompt(),messages:[{role:'user',content:'Brief editoriale:\n'+JSON.stringify(brief,null,2)+'\n\nScrivi il pacchetto completo. Distingui opinioni personali da fatti e non aggiungere fatti esterni.'}]})},90000);
      var data=await resp.json();if(!resp.ok||data.error||data.type==='error')throw new Error((data.error&&(data.error.message||data.error))||data.message||('Risposta AI HTTP '+resp.status));
      var txt=(data.content||[]).map(function(b){return b.text||'';}).join('').trim(), pack=parse(txt);
      if(!pack||!pack.youtube||!pack.reel||!pack.carosello||!pack.facebook||!Array.isArray(pack.carosello.slide))throw new Error('Il pacchetto ricevuto è incompleto. Riprova.');
      ultimo={pack:pack,brief:brief,mode:mode};renderResult();$('ra-status').textContent='Bozza pronta · controlla i fatti prima di programmarla';
    }catch(e){toast('Redazione AI: '+(e&&e.message||'errore di connessione'),'error');$('ra-status').textContent='Non sono riuscita a generare il pacchetto';}
    finally{inCorso=false;$('ra-go').disabled=false;$('ra-go').textContent='✨ Crea il pacchetto';}
  }
  function copyButton(key,label){return '<button type="button" class="btn btn-outline btn-sm" data-ra-copy="'+esc(key)+'">📋 '+label+'</button>';}
  function resultText(key){var p=ultimo.pack;switch(key){case'youtube':return [p.youtube.titolo,p.youtube.descrizione,'CAPITOLI',...(p.youtube.capitoli||[]).map(function(x){return x.tempo+' — '+x.titolo;}),'COPIONE',p.youtube.copione].join('\n\n');case'reel':return ['APERTURA',p.reel.apertura,'COPIONE',p.reel.copione,'TESTI A SCHERMO',...(p.reel.schermate||[]),'INQUADRATURE',...(p.reel.inquadrature||[]),'TITOLO SHORTS',p.reel.titolo_shorts,'DESCRIZIONE SHORTS',p.reel.descrizione_shorts,'DIDASCALIA IG',p.reel.didascalia_ig,'DIDASCALIA FB',p.reel.didascalia_fb].join('\n\n');case'carousel':return [p.carosello.titolo,...(p.carosello.slide||[]).map(function(s,i){return 'SLIDE '+(i+1)+' — '+s.titolo+'\n'+s.testo+'\nVisual reale: '+s.visual;}),'DIDASCALIA',p.carosello.didascalia_ig].join('\n\n');case'facebook':return [p.facebook.titolo,p.facebook.post].join('\n\n');}return '';}
  function renderResult(){
    if(!ultimo)return;
    var p=ultimo.pack, checks=Array.isArray(p.da_verificare)?p.da_verificare.filter(Boolean):[];
    $('ra-result-actions').style.display='block';
    var html='<div class="ra-flag"><b>Prima di pubblicare:</b> verifica i fatti, i dati numerici e la correttezza delle immagini. Il Planner manterrà la revisione umana attiva.'+(checks.length?'<br><br>Da verificare: '+checks.map(esc).join(' · '):'')+'</div>';
    html+='<div class="ra-piece"><div class="ra-piecehead"><b>▶ YouTube · video approfondimento</b>'+copyButton('youtube','Copia copione')+'</div><div class="ra-piecebody"><b>'+esc(p.youtube.titolo)+'</b><br><br>'+esc(p.youtube.descrizione)+'<br><br><b>Copione</b><br>'+esc(p.youtube.copione)+'<br><br><b>Capitoli</b><br>'+esc((p.youtube.capitoli||[]).map(function(x){return x.tempo+' — '+x.titolo;}).join('\n'))+'</div></div>';
    html+='<div class="ra-piece"><div class="ra-piecehead"><b>▸ Reel Instagram · Short YouTube</b>'+copyButton('reel','Copia scaletta')+'</div><div class="ra-piecebody"><b>APERTURA</b> '+esc(p.reel.apertura)+'<br><br><b>Copione</b><br>'+esc(p.reel.copione)+'<br><br><b>Schermate</b><br>'+esc((p.reel.schermate||[]).join('\n'))+'<br><br><b>Riprese suggerite</b><br>'+esc((p.reel.inquadrature||[]).join('\n'))+'<br><br><b>Didascalia IG</b><br>'+esc(p.reel.didascalia_ig)+'</div></div>';
    html+='<div class="ra-piece"><div class="ra-piecehead"><b>▤ Instagram · carosello</b>'+copyButton('carousel','Copia testi slide')+'</div><div class="ra-slides">'+(p.carosello.slide||[]).map(function(s,i){return '<div class="ra-slide"><span class="ra-slide-n">'+(i+1)+'</span><div><b>'+esc(s.titolo)+'</b><p>'+esc(s.testo)+'</p><p style="color:var(--text3);margin-top:4px">Visual: '+esc(s.visual)+'</p></div></div>';}).join('')+'</div><div class="ra-piecebody" style="border-top:1px solid var(--cream2,#e8e3da)"><b>Didascalia</b><br>'+esc(p.carosello.didascalia_ig)+'</div></div>';
    html+='<div class="ra-piece"><div class="ra-piecehead"><b>f Facebook · post autonomo</b>'+copyButton('facebook','Copia post')+'</div><div class="ra-piecebody"><b>'+esc(p.facebook.titolo)+'</b><br><br>'+esc(p.facebook.post)+'</div></div>';
    $('ra-output').innerHTML=html;
  }
  async function copia(key){if(!ultimo)return;var t=resultText(key);try{await navigator.clipboard.writeText(t);toast('Contenuto copiato negli appunti.','success');}catch(e){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy');toast('Contenuto copiato.','success');}catch(_){toast('Copia non riuscita: seleziona il testo manualmente.','error');}a.remove();}}
  function ideaBase(formato,titolo,dove,scaletta,testi,nota){
    var check=(Array.isArray(ultimo.pack.da_verificare)?ultimo.pack.da_verificare.filter(Boolean):[]).concat(['Controlla fatti, numeri, correttezza del testo e diritti dei media prima della pubblicazione.']).slice(0,10);
    return {id:_settNuovoId(),filone:ultimo.mode==='immobile'?'immobili':'territorio',formato:formato,titolo:String(titolo||'Contenuto editoriale').slice(0,160),perche:'Pacchetto creato da Redazione AI · '+(ultimo.brief.titolo||''),scaletta:scaletta||[],testi:Object.assign({ig:'',fb:'',tt:'',yt:'',li:''},testi||{}),pubbl:{},dove:dove.slice(),doveScelti:dove.slice(),verificare:check,verificato:false,fatta:false,archiviata:false,creata:Date.now(),manuale:true,note:String(nota||'').slice(0,4000)};
  }
  function aggiungiPiano(){
    if(!ultimo||giaAggiunto||typeof window._settData!=='function'||typeof window.saveData!=='function'){toast('Il Piano Social non è pronto. Aprilo dopo aver caricato il gestionale.','error');return;}
    var p=ultimo.pack, g=p.carosello.slide||[], chapters=p.youtube.capitoli||[];
    var slides=g.map(function(s,i){return 'Slide '+(i+1)+' · '+String(s.titolo||'')+': '+String(s.testo||'')+' [Visual: '+String(s.visual||'ripresa reale')+']';});
    var reelOutline=['Apertura: '+String(p.reel.apertura||''),'Voce: '+String(p.reel.copione||'')].concat((p.reel.schermate||[]).map(function(s){return 'Testo a schermo: '+s;}),(p.reel.inquadrature||[]).map(function(s){return 'Ripresa suggerita: '+s;}));
    var ytOutline=chapters.map(function(c){return String(c.tempo||'')+' '+String(c.titolo||'');});
    var ytText=String(p.youtube.titolo||'Video sul Cilento')+'\n\n'+String(p.youtube.descrizione||'');
    var ytShort=String(p.reel.titolo_shorts||p.reel.apertura||'Cilento in breve')+'\n\n'+String(p.reel.descrizione_shorts||p.reel.didascalia_ig||'')+' #Shorts';
    var items=[
      ideaBase('Carosello',p.carosello.titolo,['ig'],slides,{ig:String(p.carosello.didascalia_ig||''),fb:'',tt:'',yt:'',li:''},'Testi e visual delle slide sono nel campo Scaletta.'),
      ideaBase('Reel',p.reel.titolo_shorts||p.reel.apertura,['ig','fb','yt'],reelOutline,{ig:String(p.reel.didascalia_ig||''),fb:String(p.reel.didascalia_fb||''),tt:String(p.reel.didascalia_ig||''),yt:ytShort,li:''},'Copione e istruzioni di ripresa sono nel campo Scaletta.'),
      ideaBase('Video lungo',p.youtube.titolo,['yt'],ytOutline,{ig:'',fb:'',tt:'',yt:ytText,li:''},String(p.youtube.copione||'')),
      ideaBase('Post',p.facebook.titolo,['fb'],[],{ig:'',fb:String(p.facebook.post||''),tt:'',yt:'',li:''},'Post Facebook creato nel pacchetto Redazione AI.')
    ];
    var s=_settData(); items.forEach(function(x){_settMettiGiorno(x,'',_settOre());s.idee.unshift(x);}); saveData(D);giaAggiunto=true;
    $('ra-queue').disabled=true;$('ra-queue').textContent='✓ Bozze aggiunte';
    toast('Quattro bozze aggiunte al Piano Social. Completa la revisione e aggiungi i media reali.','success');
    setTimeout(function(){if(typeof window.switchSection==='function')window.switchSection('settimana');},250);
  }
  function reset(){ultimo=null;giaAggiunto=false;$('ra-idea').value='';$('ra-fatti').value='';$('ra-output').innerHTML='<div class="ra-empty">Scegli un tema e aggiungi la tua esperienza. Riceverai quattro formati con tagli diversi, non la stessa didascalia copiata ovunque.</div>';$('ra-status').textContent='YouTube · Reel/Shorts · Instagram · Facebook';$('ra-result-actions').style.display='none';$('ra-queue').disabled=false;$('ra-queue').textContent='＋ Aggiungi bozze al Piano Social';}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
