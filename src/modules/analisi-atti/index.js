/* ═══════════════════════════════════════════════════════════════════════
   src/modules/analisi-atti/index.js
   ANALISI ATTI CON AI — assistente notarile per l'agente immobiliare.
   ---------------------------------------------------------------------
   Enzo carica documenti (PDF e/o foto): atto di compravendita, visura
   catastale, dichiarazione di successione, atto di donazione. L'AI
   (Worker apiagenzio + Claude, via callClaude — legge già PDF e immagini)
   produce una RELAZIONE professionale + una CHECKLIST di rischi, come farebbe
   un assistente del notaio: verifica coerenza proprietario atto↔visura,
   segnala rischi eredi in donazioni/successioni, elenca cosa controllare.

   IMPORTANTE (prudenza deliberata):
   - È un SUPPORTO al lavoro dell'agente, NON sostituisce il notaio. Non fa
     visure ipotecarie ufficiali, non certifica nulla, può sbagliare a leggere.
     Il testo lo dichiara sempre.
   - I dati estratti vengono PROPOSTI, mai scritti automaticamente nelle schede
     cliente/immobile: Enzo conferma campo per campo (come richiesto).
   - Salvataggio dell'analisi SOLO su richiesta esplicita (pulsante).
   Si registra su window (pattern Strangler Fig).
   ═══════════════════════════════════════════════════════════════════════ */

(function(){

  var MAX_FILE_MB = 15;
  var TIPI_DOC = [
    { v:'compravendita', l:'Atto di compravendita' },
    { v:'visura',        l:'Visura catastale' },
    { v:'successione',   l:'Dichiarazione di successione' },
    { v:'donazione',     l:'Atto di donazione' },
    { v:'provenienza',   l:'Altro atto di provenienza' },
    { v:'altro',         l:'Altro documento' }
  ];

  /* Stato della sessione: documenti caricati (in memoria, non persistiti) */
  var _aaDocs = [];   /* { nome, tipo, mime, b64, size } */
  var _aaUltimaAnalisi = null;  /* testo dell'ultima analisi, per salvataggio */

  function aaIcon(d, size){
    size=size||18;
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;flex-shrink:0">'+d+'</svg>';
  }

  /* ── Render della sezione ──────────────────────────────────────────── */
  window.renderAnalisiAtti = function(){
    var el = document.getElementById('sec-analisi-atti');
    if(!el) return;
    el.innerHTML = ''
      + '<div style="max-width:860px;margin:0 auto">'
      + '<h2 style="margin:0 0 4px;display:flex;align-items:center;gap:8px;font-size:1.2rem;font-weight:800;color:var(--text)">'
      +   aaIcon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/>')
      +   ' Analisi Atti con AI</h2>'
      + '<p style="color:var(--text3);font-size:0.86rem;margin:0 0 12px">Carica atto, visura, successione o donazione. L\'AI produce una relazione e una checklist di rischi, da assistente notarile.</p>'
      + '<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:10px 14px;font-size:0.8rem;color:#92400E;margin-bottom:18px;display:flex;gap:8px;align-items:flex-start">'
      +   aaIcon('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 16)
      +   '<span><strong>È un supporto, non sostituisce il notaio.</strong> L\'AI può sbagliare a leggere e non fa visure ipotecarie ufficiali. Verifica sempre col documento originale e con il notaio prima di decidere.</span>'
      + '</div>'
      + '<div style="border:2px dashed var(--border);border-radius:12px;padding:18px;text-align:center;margin-bottom:16px">'
      +   '<input type="file" id="aa-file-input" accept="application/pdf,image/*" multiple style="display:none" onchange="aaAggiungiFile(this.files)">'
      +   '<button class="btn btn-outline" onclick="document.getElementById(\'aa-file-input\').click()">'
      +     aaIcon('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>')
      +     ' Carica documenti (PDF o foto)</button>'
      +   '<div style="font-size:0.76rem;color:var(--text4);margin-top:8px">Puoi caricarne più d\'uno. Max '+MAX_FILE_MB+' MB per file.</div>'
      + '</div>'
      + '<div id="aa-lista-docs" style="margin-bottom:16px"></div>'
      + '<div id="aa-azioni" style="display:none">'
      +   '<div class="frow fcol" style="margin-bottom:10px">'
      +     '<label class="flabel">Come vuoi che l\'AI lavori i documenti?</label>'
      +     '<select class="fselect" id="aa-modalita">'
      +       '<option value="insieme">Analisi complessiva (confronta tutti i documenti insieme)</option>'
      +       '<option value="singolo">Uno per uno (analizza ogni documento separatamente)</option>'
      +     '</select>'
      +   '</div>'
      +   '<button class="btn btn-primary" style="width:100%" id="aa-btn-analizza" onclick="aaAnalizza()">'
      +     aaIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>')
      +     ' Analizza documenti</button>'
      + '</div>'
      + '<div id="aa-stato" style="margin-top:14px;text-align:center;font-size:0.86rem"></div>'
      + '<div id="aa-risultato" style="margin-top:18px"></div>'
      + '</div>';
    aaRidisegnaLista();
  };

  /* ── Gestione file caricati ────────────────────────────────────────── */
  window.aaAggiungiFile = function(files){
    Array.prototype.forEach.call(files, function(f){
      if(f.size > MAX_FILE_MB*1024*1024){
        if(typeof showToast==='function') showToast('"'+f.name+'" troppo grande (max '+MAX_FILE_MB+' MB)','','#DC2626');
        return;
      }
      var reader = new FileReader();
      reader.onload = function(e){
        var b64 = String(e.target.result).split(',')[1];
        var mime = (f.type||'').indexOf('pdf')>=0 ? 'application/pdf' : (f.type||'image/jpeg');
        /* Indovina il tipo dal nome file, altrimenti "altro" */
        var nomeLow = (f.name||'').toLowerCase();
        var tipoGuess = 'altro';
        if(nomeLow.indexOf('visura')>=0) tipoGuess='visura';
        else if(nomeLow.indexOf('success')>=0) tipoGuess='successione';
        else if(nomeLow.indexOf('donaz')>=0) tipoGuess='donazione';
        else if(nomeLow.indexOf('comprav')>=0||nomeLow.indexOf('rogito')>=0||nomeLow.indexOf('atto')>=0) tipoGuess='compravendita';
        _aaDocs.push({ nome:f.name, tipo:tipoGuess, mime:mime, b64:b64, size:f.size });
        aaRidisegnaLista();
      };
      reader.readAsDataURL(f);
    });
  };
  window.aaRimuoviDoc = function(i){ _aaDocs.splice(i,1); aaRidisegnaLista(); };
  window.aaCambiaTipo = function(i, val){ if(_aaDocs[i]) _aaDocs[i].tipo = val; };

  function aaRidisegnaLista(){
    var cont = document.getElementById('aa-lista-docs');
    var azioni = document.getElementById('aa-azioni');
    if(!cont) return;
    if(!_aaDocs.length){
      cont.innerHTML = '<div style="text-align:center;color:var(--text4);font-size:0.82rem;padding:8px">Nessun documento caricato.</div>';
      if(azioni) azioni.style.display='none';
      return;
    }
    var opts = function(sel){ return TIPI_DOC.map(function(t){ return '<option value="'+t.v+'"'+(t.v===sel?' selected':'')+'>'+t.l+'</option>'; }).join(''); };
    cont.innerHTML = _aaDocs.map(function(d,i){
      var isPdf = d.mime==='application/pdf';
      var icona = isPdf
        ? aaIcon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>', 20)
        : aaIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>', 20);
      var kb = Math.round(d.size/1024);
      return '<div style="display:flex;align-items:center;gap:10px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px">'
        + '<span style="color:var(--brand)">'+icona+'</span>'
        + '<div style="flex:1;min-width:0">'
        +   '<div style="font-weight:600;font-size:0.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+d.nome+'</div>'
        +   '<div style="font-size:0.72rem;color:var(--text4)">'+(isPdf?'PDF':'Immagine')+' · '+kb+' KB</div>'
        + '</div>'
        + '<select class="fselect" style="max-width:210px;font-size:0.8rem" onchange="aaCambiaTipo('+i+',this.value)">'+opts(d.tipo)+'</select>'
        + '<button onclick="aaRimuoviDoc('+i+')" title="Rimuovi" style="background:none;border:none;color:#DC2626;cursor:pointer;padding:4px">'+aaIcon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',16)+'</button>'
        + '</div>';
    }).join('');
    if(azioni) azioni.style.display='block';
  }

  /* ── Costruzione del prompt professionale ──────────────────────────── */
  function aaSystemPrompt(modalita){
    var base = 'Sei un assistente esperto in diritto immobiliare italiano che affianca un agente immobiliare nella verifica preliminare dei documenti PRIMA del rogito, con l\'occhio di un collaboratore di notaio. '
      + 'Analizzi atti di compravendita, visure catastali, dichiarazioni di successione e atti di donazione. '
      + 'NON sostituisci il notaio e NON hai accesso ai registri immobiliari: non puoi certificare assenza di ipoteche o trascrizioni pregiudizievoli che non siano nei documenti forniti. Dillo chiaramente. '
      + 'Basati SOLO su ciò che leggi nei documenti; se un dato non c\'è o è illeggibile, dillo invece di inventarlo. '
      + '\n\nProduci in ITALIANO due parti ben distinte:\n'
      + '\n=== RELAZIONE ===\n'
      + 'Una relazione professionale discorsiva che includa: identificazione dell\'immobile (dati catastali: comune, foglio, particella, subalterno, categoria), le parti (venditore/i e acquirente/i con dati), il titolo di provenienza (come l\'attuale proprietario è diventato tale: compravendita, successione, donazione), prezzo/valore se presente, e la coerenza tra i documenti. '
      + 'IN PARTICOLARE verifica e commenta: (a) se il PROPRIETARIO che risulta nella visura catastale COINCIDE con il venditore dell\'atto; (b) se i DATI CATASTALI coincidono tra i vari documenti; (c) in caso di provenienza per DONAZIONE, il rischio per l\'acquirente legato all\'azione di riduzione degli eredi legittimari (donazioni aggredibili, tema della lesione di legittima) e l\'opportunità di verificare fidejussione/assicurazione o rinuncia; (d) in caso di SUCCESSIONE, se risultano tutti gli eredi/chiamati, la presenza della dichiarazione di successione e delle relative volture, eventuali quote indivise. '
      + '\n\n=== CHECKLIST DI VERIFICA ===\n'
      + 'Un elenco puntato di controlli da fare prima del rogito, ciascuno marcato con un livello: [OK] verificabile e coerente nei documenti, [DA VERIFICARE] serve un controllo esterno (visura ipotecaria, atti mancanti, ecc.), [ATTENZIONE] possibile criticità o rischio da approfondire col notaio. Sii concreto e specifico rispetto ai documenti forniti.'
      + '\n\nChiudi SEMPRE con una riga: "Questa è un\'analisi preliminare di supporto, da verificare col notaio e con visure ufficiali."';
    if(modalita==='singolo'){
      base += '\n\nI documenti ti vengono forniti per essere analizzati UNO PER UNO: per ciascuno fai una mini-relazione e i punti salienti, poi alla fine un breve riepilogo di coerenza tra tutti.';
    }
    return base;
  }

  /* ── Analisi ───────────────────────────────────────────────────────── */
  window.aaAnalizza = function(){
    if(!_aaDocs.length) return;
    var stato = document.getElementById('aa-stato');
    var btn = document.getElementById('aa-btn-analizza');
    var risultato = document.getElementById('aa-risultato');
    var modalita = (document.getElementById('aa-modalita')||{}).value || 'insieme';
    if(typeof callClaude!=='function'){
      if(stato){ stato.style.color='#DC2626'; stato.textContent='Funzione AI non disponibile: verifica l\'indirizzo del Worker nelle Impostazioni AI.'; }
      return;
    }
    if(stato){ stato.style.color='#7C3AED'; stato.innerHTML=aaIcon('<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>',16)+' Analisi in corso… (può richiedere fino a un minuto)'; }
    if(btn){ btn.disabled=true; btn.style.opacity='.6'; }
    if(risultato) risultato.innerHTML='';

    /* Costruisce il content: ogni documento con un'etichetta di tipo, poi il PDF/immagine */
    var content = [];
    _aaDocs.forEach(function(d, i){
      var etichetta = (TIPI_DOC.find(function(t){return t.v===d.tipo;})||{}).l || 'Documento';
      content.push({ type:'text', text:'--- Documento '+(i+1)+' — tipo dichiarato: '+etichetta+' ('+d.nome+') ---' });
      if(d.mime==='application/pdf'){
        content.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:d.b64 } });
      } else {
        content.push({ type:'image', source:{ type:'base64', media_type:d.mime, data:d.b64 } });
      }
    });
    content.push({ type:'text', text:'Analizza i documenti qui sopra e produci la RELAZIONE e la CHECKLIST come indicato.' });

    var payload = {
      model:(typeof aiGetConfig==='function'&&aiGetConfig().model)||'claude-sonnet-4-6',
      max_tokens:4000,
      system: aaSystemPrompt(modalita),
      messages:[{ role:'user', content:content }]
    };

    callClaude(payload).then(function(data){
      var txt=''; try{ txt=(data.content||[]).map(function(b){return b.text||'';}).join('').trim(); }catch(_e){}
      if(!txt){
        if(stato){ stato.style.color='#DC2626'; stato.textContent='Non ho ricevuto una risposta leggibile. Riprova o verifica il Worker.'; }
        if(btn){ btn.disabled=false; btn.style.opacity='1'; }
        return;
      }
      _aaUltimaAnalisi = txt;
      if(stato){ stato.style.color='#15803D'; stato.textContent='✓ Analisi completata.'; }
      aaMostraRisultato(txt);
      if(btn){ btn.disabled=false; btn.style.opacity='1'; }
    }).catch(function(err){
      if(stato){ stato.style.color='#DC2626'; stato.textContent='Errore AI: '+((err&&err.message)||'riprova')+'.'; }
      if(btn){ btn.disabled=false; btn.style.opacity='1'; }
    });
  };

  /* ── Mostra il risultato + azioni (salva, copia) ───────────────────── */
  function aaMostraRisultato(txt){
    var cont = document.getElementById('aa-risultato');
    if(!cont) return;
    /* Formattazione leggera: evidenzia i marcatori checklist */
    var html = txt
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\[ATTENZIONE\]/g,'<span style="color:#DC2626;font-weight:700">⚠ ATTENZIONE</span>')
      .replace(/\[DA VERIFICARE\]/g,'<span style="color:#B45309;font-weight:700">◐ DA VERIFICARE</span>')
      .replace(/\[OK\]/g,'<span style="color:#15803D;font-weight:700">✓ OK</span>')
      .replace(/=== RELAZIONE ===/g,'<h3 style="margin:16px 0 8px;color:var(--text);font-size:1rem">Relazione</h3>')
      .replace(/=== CHECKLIST DI VERIFICA ===/g,'<h3 style="margin:18px 0 8px;color:var(--text);font-size:1rem">Checklist di verifica</h3>')
      .replace(/\n/g,'<br>');
    cont.innerHTML = ''
      + '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px;font-size:0.88rem;line-height:1.55;color:var(--text)">'+html+'</div>'
      + '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">'
      +   '<button class="btn btn-outline" style="flex:1;min-width:150px" onclick="aaCopia()">'+aaIcon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',16)+' Copia testo</button>'
      +   '<button class="btn btn-outline" style="flex:1;min-width:150px" onclick="aaSalva()">'+aaIcon('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/>',16)+' Salva analisi</button>'
      + '</div>'
      + '<div style="font-size:0.74rem;color:var(--text4);margin-top:8px;text-align:center">Rilettura consigliata: confronta sempre coi documenti originali prima di usare questi dati.</div>';
  }

  window.aaCopia = function(){
    if(!_aaUltimaAnalisi) return;
    navigator.clipboard.writeText(_aaUltimaAnalisi).then(function(){
      if(typeof showToast==='function') showToast('Analisi copiata','','#15803D');
    });
  };

  /* Salvataggio: solo su richiesta. Archivia in D.analisiAtti con data e nomi doc. */
  window.aaSalva = function(){
    if(!_aaUltimaAnalisi) return;
    if(!Array.isArray(D.analisiAtti)) D.analisiAtti = [];
    var rec = {
      id: 'aa_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
      data: new Date().toISOString(),
      documenti: _aaDocs.map(function(d){ return { nome:d.nome, tipo:d.tipo }; }),
      testo: _aaUltimaAnalisi
    };
    D.analisiAtti.unshift(rec);
    if(typeof saveD==='function') saveD();
    if(typeof showToast==='function') showToast('Analisi salvata nell\'archivio','','#15803D');
  };

})();

export {};
