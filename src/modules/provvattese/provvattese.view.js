// modules/provvattese/provvattese.view.js — Provvigioni attese
// ----------------------------------------------------------------------------
// Estratta dal monolite il 15 set 2026. Era una delle dodici parti indipendenti
// dentro un unico blocco inline da 208 KB.
//
// PAGINA DI SOLA LETTURA: guarda immobili, pratiche e provvigioni e non li
// modifica mai. Le uniche cose che scrive sono stimaPercV e stimaPercA, campi
// che esistono solo per lei.
//
// DIPENDENZE dal monolite (via window): D, saveD, dlgAlert, fmtD.
// _paCalcola è esposta su window perché la usa anche il Bilancio: è la stessa
// fonte per il pipeline, così i due conti non possono divergere.
//
// NB: in un modulo ES le funzioni non sono globali. Le chiamate a funzioni del
// monolite vanno protette, altrimenti un nome mancante non è un errore visibile
// ma una pagina che non si apre.
// ----------------------------------------------------------------------------

/* [15 set 2026] Le chiamate a saveD e dlgAlert sono protette da un typeof:
   vivono nel monolite, non qui. Da dentro un modulo un nome mancante non dà
   un errore visibile in console, dà una pagina che non si apre. */

(function(){
  /* [8 set 2026] CORRETTO. La versione precedente toglieva SEMPRE i punti,
     trattandoli come separatori delle migliaia: così "5.6" diventava 56 e
     "93.2" diventava 932, e sullo schermo comparivano provvigioni "al 932%".
     Regola giusta: se c'è la virgola, i punti sono migliaia (1.234,56);
     se la virgola non c'è, un punto solo è il separatore decimale (5.6) e
     più punti sono migliaia (1.234.567). */
  function _n(v){
    if(typeof v === 'number') return isNaN(v) ? 0 : v;
    var s = String(v==null?'':v).trim().replace(/[^\d.,-]/g,'');
    if(!s) return 0;
    if(s.indexOf(',') >= 0){ s = s.replace(/\./g,'').replace(',','.'); }
    else {
      var parti = s.split('.');
      /* Senza virgola: più punti sono migliaia (1.234.567); un punto solo
         seguito da ESATTAMENTE tre cifre è anch'esso migliaia (250.000),
         mentre con una o due cifre è il decimale (5.6 · 93.25). */
      if(parti.length > 2) s = parti.join('');
      else if(parti.length === 2 && /^\d{3}$/.test(parti[1])) s = parti.join('');
    }
    var x = parseFloat(s);
    return isNaN(x) ? 0 : x;
  }
  function _eur(v){ return '€ ' + Math.round(v).toLocaleString('it-IT'); }
  function _gg(d){ var t=Date.parse(String(d||'').slice(0,10)+'T00:00:00'); return isNaN(t)?null:Math.round((t-new Date().setHours(0,0,0,0))/86400000); }
  function _attivo(im){ var s=String(im&&im.stato||'').toLowerCase(); return s===''||s==='attivo'||s==='proposta'; }
  /* [8 set 2026] QUOTA AGENZIA E QUOTA AGENTE.
     Dove la provvigione è già registrata si usano LE SUE percentuali vere.
     Dove non c'è ancora nulla (proposte e portafoglio) servono due numeri: li
     propongo leggendoli dalle provvigioni che hai già fatto — il valore più
     ricorrente — e li lascio modificabili in cima alla schermata, perché non
     voglio che una percentuale supposta si travesta da dato certo.
     La scelta resta su questo dispositivo: è un'ipotesi di lettura, non un
     dato dell'agenzia da sincronizzare. */
  var CH_QUOTE='lecase_quote_attese';
  function _piuFrequente(campo, difetto){
    var c={}, prov=Array.isArray(D.provvigioni)?D.provvigioni:[];
    prov.forEach(function(p){ var v=_n(p&&p[campo]); if(v>0) c[v]=(c[v]||0)+1; });
    var best=null, n=0;
    Object.keys(c).forEach(function(k){ if(c[k]>n){ n=c[k]; best=parseFloat(k); } });
    return best===null?difetto:best;
  }
  function _quote(){
    var salv=null;
    try{ salv=JSON.parse(localStorage.getItem(CH_QUOTE)||'null'); }catch(e){}
    /* [12 set 2026] "accTeorica" è la provvigione che chiedi di solito
       all'acquirente. Serve a far vedere quanto varrebbe un affare se anche
       il compratore pagasse, là dove sulla pratica quel dato non è ancora
       stato scritto. È un'ipotesi e resta marcata come tale: non entra mai
       nei totali su cui puoi contare. */
    if(salv && typeof salv==='object') return {
      agente:_n(salv.agente), ufficio:_n(salv.ufficio),
      accTeorica: (salv.accTeorica===undefined||salv.accTeorica==='') ? 3 : _n(salv.accTeorica)
    };
    return { agente:_piuFrequente('percAgente',50), ufficio:_piuFrequente('percUfficio',2.5), accTeorica:3 };
  }
  window._paSalvaQuote=function(){
    var a=document.getElementById('pa-q-agente'), u=document.getElementById('pa-q-ufficio');
    var t=document.getElementById('pa-q-acqt');
    try{ localStorage.setItem(CH_QUOTE, JSON.stringify({agente:_n(a&&a.value), ufficio:_n(u&&u.value), accTeorica:_n(t&&t.value)})); }catch(e){}
    apriProvvAttese();
  };
  /* Dal lordo dell'affare a quello che resta a te. */
  function _netto(lordo, q){ return lordo * (q.agente/100) * (1 - q.ufficio/100); }
  /* [15 set 2026] La parte acquirente entra nel totale anche quando è solo
     stimata: la provvigione matura sull'accordo di entrambe le parti. La
     distinzione fra pattuito e stimato resta, ma nella nota della riga. */
  function _ceSommaAcq(pattuito, stimato){ return pattuito + (stimato || 0); }
  function _nomeImm(im, fallback){
    if(!im) return fallback||'immobile non collegato';
    return (im.ref?'Ref.'+im.ref+' · ':'')+((im.tipo||'Immobile')+' '+(im.comune||'')).trim();
  }
  /* Provvigione attesa su un importo: percentuale venditore + acquirente,
     con ripiego sulla percentuale dell'incarico se la pratica non le ha. */
  function _perc(im, pratica, importo){
    var pv=_n(pratica&&pratica.percV), pa=_n(pratica&&pratica.percA);
    var tot=pv+pa;
    if(tot>0) return tot;
    var inc=_n(im&&im.incPerc);
    if(inc>0) return inc;
    /* [13 set 2026] RIPIEGO SULL'IMPORTO FISSO. Un incarico può pattuire un
       compenso fisso invece di una percentuale (incImp senza incPerc). Prima
       questo ramo restituiva 0 e il chiamante scartava la riga: l'immobile si
       vedeva finché era in portafoglio — dove il fisso è già gestito — e
       spariva dal conto nel momento in cui arrivava una proposta, cioè quando
       diventava più concreto. Il fisso va convertito in percentuale
       equivalente perché chi chiama fa importo*perc/100. */
    var fisso=_n(im&&im.incImp), imp=_n(importo);
    if(fisso>0 && imp>0) return fisso/imp*100;
    return 0;
  }

  function _calcola(){
    var q=_quote();
    var imm=Array.isArray(D.immobili)?D.immobili:[];
    var prat=Array.isArray(D.pratiche)?D.pratiche:[];
    var prov=Array.isArray(D.provvigioni)?D.provvigioni:[];
    var G={maturato:[], accettate:[], inCorso:[], portafoglio:[], scadenze:[]};

    prov.forEach(function(p){
      if(!p) return;
      var st=String(p.statoPag||'');
      if(st!=='Da Incassare' && st!=='Parzialmente Incassata') return;
      var im=imm[parseInt(p.immRef)];
      var incassato=0;
      if(Array.isArray(p.pagamenti)) p.pagamenti.forEach(function(x){ incassato+=_n(x&&x.importo); });
      var resta=_n(p.totale)-incassato;
      if(resta<=0) resta=_n(p.totale);
      /* Qui le percentuali vere ci sono: si applica lo STESSO rapporto fra
         netto agente e totale che quella provvigione ha davvero, così il
         residuo eredita la ripartizione reale invece di una supposta. */
      var tot=_n(p.totale), nettoReg=_n(p.quotaAgenteNetto)||_n(p.quotaAgente);
      var nettoRes = (tot>0 && nettoReg>0) ? resta*(nettoReg/tot) : _netto(resta,q);
      G.maturato.push({ prop:(im&&im.contatto)||p.venditore||'', titolo:_nomeImm(im, p.descr), nota:(st==='Parzialmente Incassata'?'parzialmente incassata · ':'')+'vendita '+_eur(_n(p.importoVendita)), valore:resta, netto:nettoRes, reale:(tot>0&&nettoReg>0), immIdx:parseInt(p.immRef), data:p.data });
    });

    prat.forEach(function(p){
      if(!p) return;
      var esito=String(p.esitoProp||'');
      if(esito!=='accettata' && esito!=='in_corso') return;
      var im=imm[parseInt(p.immRef)];
      var importo=_n(p.importoProp) || _n(p.prezzoRich) || _n(im&&im.prezzo);
      var perc=_perc(im,p,importo);
      if(!importo || !perc) return;
      var _lordo=importo*perc/100;
      /* [12 set 2026] Da dove viene il compenso: venditore, acquirente o
         entrambi. Prima si vedeva un totale senza sapere cosa ci fosse dentro. */
      var _pv=_n(p.percV), _pa=_n(p.percA);
      /* Se la parte acquirente non è stata pattuita, si mostra accanto quanto
         varrebbe con la percentuale che chiedi di solito. */
      /* [15 set 2026] come sopra: la parte acquirente si somma anche quando non
         è stata pattuita nella proposta. */
      var _teorico = 0;
      var _accStim = (_pa>0) ? 0 : importo*_n(q.accTeorica)/100;
      /* [13 set 2026] Se il numero arriva dall'importo fisso, la percentuale
         mostrata sarebbe una percentuale calcolata da me, mai pattuita con
         nessuno: si scrive l'importo, non quella. */
      var _daFisso = (_pv<=0 && _pa<=0 && _n(im&&im.incPerc)<=0 && _n(im&&im.incImp)>0);
      var _origine = (_pv>0||_pa>0)
        ? [ (_pv>0?_pv+'% venditore':''), (_pa>0?_pa+'% acquirente':'') ].filter(Boolean).join(' + ')
        : (_daFisso
            ? _eur(_n(im.incImp))+' fissi (da incarico, manca la parte acquirente)'
            : perc+'% (da incarico, manca la parte acquirente)');
      /* [9 set 2026] Una proposta accettata ma subordinata al mutuo non è
         "manca solo il rogito": se la banca dice no, l'affare salta. Resta nel
         suo gradino ma si vede, e il quadro in cima ne tiene il conto. */
      var _mut = !!p.mutuoSubordinata;
      var _ris = !!p.riservaMigliorOfferta;
      var v={ prop:(im&&im.contatto)||p.venditore||'', titolo:_nomeImm(im, p.descr),
        nota:(p.acquirente?'da '+p.acquirente+' · ':'')+_eur(importo)+' · '+_origine
             +(_accStim>0 ? ' + '+_n(q.accTeorica)+'% acquirente stimato' : '')
             +(_mut?' · in attesa di delibera mutuo'+(p.mutuoDelibera?' entro il '+((typeof fmtD==='function')?fmtD(p.mutuoDelibera):p.mutuoDelibera):''):'')
             +(_ris?' · il venditore può ancora accettare una proposta migliore':''),
        /* [15 set 2026] alla parte pattuita si somma quella dell'acquirente
           stimata, quando nella proposta non è stata indicata */
        valore:_ceSommaAcq(_lordo, _accStim), netto:_netto(_ceSommaAcq(_lordo, _accStim), q), reale:false,
        accStimata:_accStim,
        perc:(_daFisso?null:perc), fisso:(_daFisso?_n(im.incImp):null),
        mutuo:_mut, riserva:_ris,
        teorico:_teorico, percTeorica:_n(q.accTeorica),
        immIdx:parseInt(p.immRef), data:p.drogito||p.scadProp||p.dprop };
      (esito==='accettata'?G.accettate:G.inCorso).push(v);
    });

    /* Solo una proposta ACCETTATA toglie un incarico dai rischi: una proposta
       in corso può ancora saltare, e un incarico che scade mentre la
       trattativa è aperta è esattamente il caso da tenere d'occhio. */
    var conProposta={};
    prat.forEach(function(p){
      if(!p) return;
      if(String(p.esitoProp||'')==='accettata') conProposta[parseInt(p.immRef)]=true;
    });
    imm.forEach(function(im, _ii){
      if(!im || !_attivo(im)) return;
      var prezzo=_n(im.prezzo), perc=_n(im.incPerc), fisso=_n(im.incImp);
      var val = fisso>0 ? fisso : (prezzo*perc/100);
      /* [12 set 2026] Anche qui la parte acquirente. Un immobile che vendi ti
         paga da TUTTI E DUE i lati: mostrarne uno solo dimezza il valore di
         quello che hai in mano e, sulle scadenze, dimezza la perdita. */
      /* ── [13 set 2026] STIME DI PORTAFOGLIO ────────────────────────────
         Due percentuali che decidi tu, immobile per immobile, valide finché
         quell'immobile è solo in portafoglio o a rischio.
         Vivono in campi DEDICATI — stimaPercV e stimaPercA — che nessun'altra
         parte del gestionale legge o scrive: l'incarico continua ad avere il
         suo incPerc, la pratica i suoi percV e percA, e nessuno dei due viene
         toccato da qui.
         Appena nasce una proposta, questa riga non compare più: il calcolo
         passa alla pratica, cioè ai dati inseriti nel posto giusto. */
      var _sv = (im.stimaPercV===''||im.stimaPercV===undefined||im.stimaPercV===null) ? null : _n(im.stimaPercV);
      var _sa = (im.stimaPercA===''||im.stimaPercA===undefined||im.stimaPercA===null) ? null : _n(im.stimaPercA);
      /* venditore: se non l'hai scritta qui, vale quella dell'incarico */
      var _percV_eff = (_sv!==null) ? _sv : perc;
      var _valV = (fisso>0 && _sv===null) ? fisso : prezzo*_percV_eff/100;
      /* acquirente: se non l'hai scritta qui, vale la percentuale teorica */
      var _percA_eff = (_sa!==null) ? _sa : _n(q.accTeorica);
      var _valA = prezzo*_percA_eff/100;
      /* [15 set 2026] La parte acquirente entra SEMPRE nel totale, anche quando
         non è ancora pattuita: la provvigione matura quando l'affare si chiude,
         e si chiude con l'accordo di tutte e due le parti. Prima restava fuori
         e compariva a lato in viola, così il totale generale mostrava metà di
         quello che l'immobile vale davvero.
         Resta la distinzione visiva: dove la percentuale è solo quella che
         chiedi di solito, la riga lo dice. */
      var _teoP = 0;
      /* [13 set 2026] Prima un immobile con provvigione a zero o non indicata
         spariva dall'elenco senza spiegazione. Ora resta, con l'avviso: un
         dato mancante va visto, non nascosto. */
      var _valTot = _valV + _valA;
      G.portafoglio.push({ prop:im.contatto||'', titolo:_nomeImm(im),
        nota:_eur(prezzo)+(fisso>0&&_sv===null?' · importo fisso':'')+(_valTot>0?'':' · provvigione non indicata'),
        valore:_valTot, netto:_netto(_valTot,q), reale:false, perc:(fisso>0&&_sv===null?null:perc),
        fisso:(fisso>0&&_sv===null?fisso:null), manca:(_valTot<=0), teorico:_teoP,
        percTeorica:_n(q.accTeorica), immIdx:_ii, data:im.incFine,
        /* i dati delle due colonne */
        stima:true, percV:_percV_eff, percA:_percA_eff, valV:_valV, valA:_valA,
        svImpostata:(_sv!==null), saImpostata:(_sa!==null) });
      var g=_gg(im.incFine);
      if(g!==null && g<=90 && val>0 && !conProposta[_ii]){
        G.scadenze.push({ prop:im.contatto||'', titolo:_nomeImm(im), nota:(g<0?'scaduto da '+(-g)+' giorni':'scade fra '+g+' giorni'), valore:_valTot, netto:_netto(_valTot,q), reale:false, perc:(fisso>0&&_sv===null?null:perc), fisso:(fisso>0&&_sv===null?fisso:null), teorico:_teoP, percTeorica:_n(q.accTeorica), immIdx:_ii, data:im.incFine, urgenza:g,
          stima:true, percV:_percV_eff, percA:_percA_eff, valV:_valV, valA:_valA,
          svImpostata:(_sv!==null), saImpostata:(_sa!==null) });
      }
    });

    /* ── [9 set 2026] UN IMMOBILE, UN GRADINO SOLO ────────────────────────
       Prima lo stesso immobile poteva comparire in due gradini insieme —
       trovato sul Ref.0036, che ha una provvigione già registrata E una
       pratica ancora "in corso" — e il suo valore veniva contato due volte.
       Ora vale la precedenza: maturato, poi accettate, poi in corso, poi
       portafoglio. Un immobile che compare più in alto sparisce da sotto.
       Dentro lo STESSO gradino restano invece tutte le voci: due provvigioni
       diverse sullo stesso immobile sono due incassi diversi, non un doppione.
       Le scadenze non sono un gradino ma un rischio, e restano a parte. */
    var _visto = {};
    function _chiave(v){
      return (v.immIdx===undefined || v.immIdx===null || isNaN(v.immIdx)) ? null : String(v.immIdx);
    }
    function _filtra(lista){
      var out = lista.filter(function(v){ var k=_chiave(v); return !(k!==null && _visto[k]); });
      out.forEach(function(v){ var k=_chiave(v); if(k!==null) _visto[k]=true; });
      return out;
    }
    G.maturato    = _filtra(G.maturato);
    G.accettate   = _filtra(G.accettate);
    G.inCorso     = _filtra(G.inCorso);
    G.portafoglio = _filtra(G.portafoglio);

    Object.keys(G).forEach(function(k){ G[k].sort(function(a,b){ return b.valore-a.valore; }); });
    G.scadenze.sort(function(a,b){ return a.urgenza-b.urgenza; });
    return G;
  }

  /* [8 set 2026] QUADRO DEI TOTALI, in cima.
     Sul telefono le sezioni sono lunghe e i totali finivano fuori schermo:
     qui si vede tutto in un colpo d'occhio prima di scorrere. I quattro
     gradini NON si sommano fra loro — sono livelli di certezza diversi —
     ma i primi due sì: sono le due voci su cui puoi contare davvero, e
     quella somma è l'unico "totale generale" che abbia senso. */
  function _quadro(G){
    var q=_quote();
    function T(l){ return { lordo:l.reduce(function(s,v){return s+v.valore;},0), netto:l.reduce(function(s,v){return s+(v.netto||0);},0) }; }
    var m=T(G.maturato), a=T(G.accettate), c=T(G.inCorso), pf=T(G.portafoglio);
    var certo={ lordo:m.lordo+a.lordo, netto:m.netto+a.netto };
    var mut=T(G.accettate.filter(function(v){ return v.mutuo || v.riserva; }));
    function freccia(){
      return '<div style="display:flex;align-items:center;color:var(--text4);flex-shrink:0;padding:0 2px">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
        + '</div>';
    }
    function cella(et, t, col){
      return '<div style="flex:1;min-width:118px;padding:9px 11px;background:var(--bg2);border:1px solid var(--border);border-top:3px solid '+col+';border-radius:10px">'
        + '<div style="font-size:0.64rem;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">'+et+'</div>'
        + '<div style="font-size:1rem;font-weight:900;color:'+col+';line-height:1.25">'+_eur(t.lordo)+'</div>'
        + '<div style="font-size:0.74rem;font-weight:800;color:var(--text2)">a te '+_eur(t.netto)+'</div>'
        + '</div>';
    }
    /* [12 set 2026] Stessa veste delle altre schede del gestionale: fondo
       bianco, bordo sottile, angoli da 12. Prima era un riquadro grigio che
       non somigliava a nient'altro. */
    /* [15 set 2026] TESTATA ASCIUTTA. Prima quattro righe di spiegazione e una
       fila di campi occupavano mezzo schermo prima di arrivare ai numeri. Le
       spiegazioni restano dove servono (sulle singole sezioni), i campi delle
       percentuali stanno solo in Portafoglio e A rischio, cioè le uniche due
       viste dove quelle percentuali cambiano qualcosa. */
    return '<div class="card" style="padding:12px 14px;margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px">'
      +   '<div style="display:flex;align-items:baseline;gap:9px;flex-wrap:wrap">'
      +     '<span style="font-size:0.7rem;font-weight:800;color:var(--text4);text-transform:uppercase;letter-spacing:.5px">Su cui puoi contare</span>'
      +     (mut.lordo>0 ? '<span style="font-size:0.72rem;font-weight:700;color:#B45309">'
            + _eur(mut.lordo)+' non ancora al sicuro</span>' : '')
      +   '</div>'
      +   '<div style="display:flex;align-items:baseline;gap:9px">'
      +     '<span style="font-size:1.45rem;font-weight:900;color:var(--text);line-height:1">'+_eur(certo.lordo)+'</span>'
      +     '<span style="font-size:0.84rem;font-weight:800;color:#15803D">a te '+_eur(certo.netto)+'</span>'
      +   '</div>'
      + '</div>'
      /* [12 set 2026] PIPELINE. Prima erano quattro caselle affiancate in ordine
         casuale. Ora si leggono da sinistra a destra come avanza un affare:
         il portafoglio è il punto di partenza, il maturato è l'arrivo. Le
         frecce dicono che è un percorso, non quattro numeri sciolti. */
      + '<div style="display:flex;gap:0;align-items:stretch;flex-wrap:wrap">'
      +   cella('1 · Portafoglio', pf, 'var(--text2)') + freccia()
      +   cella('2 · In corso', c, '#D97706') + freccia()
      +   cella('3 · Accettate', a, '#1D4ED8') + freccia()
      +   cella('4 · Da incassare', m, '#15803D')
      + '</div>'
      + '</div>';
  }

  /* [15 set 2026] I campi delle percentuali, spostati qui dalla testata:
     compaiono solo sopra Portafoglio e A rischio, le due viste dove servono
     davvero — sono stime, e quelle percentuali le governano. Altrove erano
     comandi senza effetto visibile. */
  function _paCampiQuote(){
    var q = _quote();
    return '<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;'
      + 'background:var(--bg2);border:1px solid var(--border);border-radius:10px;'
      + 'padding:8px 12px;margin-bottom:10px">'
      + '<span style="font-size:0.74rem;font-weight:700;color:var(--text2)">Stima con</span>'
      + '<span style="display:inline-flex;gap:5px;align-items:center">'
      +   '<input id="pa-q-agente" class="finput" style="width:52px;padding:4px 6px;text-align:right" value="'+q.agente+'" title="La tua quota sulla provvigione">'
      +   '<span style="font-size:0.74rem;color:var(--text3)">% a te, meno</span>'
      +   '<input id="pa-q-ufficio" class="finput" style="width:52px;padding:4px 6px;text-align:right" value="'+q.ufficio+'" title="Trattenuta dell ufficio">'
      +   '<span style="font-size:0.74rem;color:var(--text3)">% di ufficio ·</span>'
      +   '<input id="pa-q-acqt" class="finput" style="width:52px;padding:4px 6px;text-align:right" value="'+q.accTeorica+'" title="Provvigione che chiedi di solito all acquirente">'
      +   '<span style="font-size:0.74rem;color:var(--text3)">% all acquirente</span>'
      + '</span>'
      + '<button onclick="_paSalvaQuote()" class="btn btn-outline btn-sm" style="padding:4px 10px">Ricalcola</button>'
      + '<span style="font-size:0.71rem;color:var(--text4);flex:1;min-width:160px">'
      + 'valgono solo dove la provvigione non è ancora registrata</span>'
      + '</div>';
  }
  /* [8 set 2026] I totali parziali hanno un fondo tenue del colore della
     sezione: scorrendo l'elenco sul telefono si riconoscono a colpo d'occhio
     senza doverli cercare fra le righe. */
  var _TINTA={ '#15803D':'#F0FDF4', '#1D4ED8':'#EFF6FF', '#D97706':'#FFFBEB', '#DC2626':'#FEF2F2' };
  function _sez(titolo, spiega, voci, colore){
    var tot=voci.reduce(function(s,v){ return s+v.valore; },0);
    var totNetto=voci.reduce(function(s,v){ return s+(v.netto||0); },0);
    var totTeorico=voci.reduce(function(s,v){ return s+(v.teorico||0); },0);
    var righe=voci.length ? voci.map(function(v){
      return '<div style="display:flex;gap:10px;align-items:center;padding:8px 12px;border-top:1px solid var(--border);flex-wrap:wrap">'
        + '<div style="flex:1;min-width:190px">'
        +   '<div style="font-size:0.86rem;font-weight:600;color:var(--text)">'+String(v.titolo).replace(/</g,'&lt;')+'</div>'
        /* [8 set 2026] Il proprietario, perché i codici da soli non dicono di
           quale casa si tratta e qui non ci sono le foto come negli elenchi. */
        +   ((v.mutuo||v.riserva) ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px">'
              + (v.mutuo ? '<span style="font-size:0.66rem;font-weight:800;color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:1px 7px">IN ATTESA DI MUTUO</span>' : '')
              + (v.riserva ? '<span style="font-size:0.66rem;font-weight:800;color:#6D28D9;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:6px;padding:1px 7px">SALVO MIGLIOR OFFERTA</span>' : '')
              + '</div>' : '')
        +   (v.manca ? '<div style="display:inline-block;font-size:0.66rem;font-weight:800;color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:1px 7px;margin-top:2px">PROVVIGIONE DA INDICARE</div>' : '')
        +   (v.prop ? '<div style="font-size:0.79rem;font-weight:600;color:var(--text2);display:flex;align-items:center;gap:5px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'+String(v.prop).replace(/</g,'&lt;')+'</div>' : '')
        +   '<div style="font-size:0.77rem;color:var(--text2)">'+String(v.nota).replace(/</g,'&lt;')+'</div>'
        + '</div>'
        + '<div style="text-align:right;white-space:nowrap;min-width:100px">'
        +   '<div style="font-weight:800;color:var(--text)">'+_eur(v.valore)+'</div>'
        +   '<div style="font-size:0.75rem;font-weight:700;color:'+(v.reale?'#15803D':'var(--text2)')+'">a te '+_eur(v.netto||0)+(v.reale?'':' *')+'</div>'
        /* [12 set 2026] Quanto varrebbe se anche l'acquirente pagasse. Scritto
           in corsivo e tratteggiato: è un'ipotesi, non un dato pattuito. */
        +   (v.teorico>0
              ? '<div style="font-size:0.72rem;font-style:italic;color:#6D28D9;border-top:1px dashed #DDD6FE;margin-top:3px;padding-top:3px" title="Se anche l\'acquirente pagasse il '+v.percTeorica+'%">+ '+_eur(v.teorico)+' con acq.</div>'
              : '')
        + '</div>'
        /* [8 set 2026] Matita solo dove la percentuale è SUPPOSTA e c'è un
           immobile a cui appartiene. Corregge im.incPerc sulla scheda, non un
           valore di comodo: il dato si sistema alla fonte e sparisce da tutte
           le altre schermate. Dove la provvigione è registrata non compare:
           lì i numeri sono quelli veri e non vanno toccati da qui. */
        /* [13 set 2026] LA MATITA È STATA TOLTA.
           Scriveva incPerc sulla SCHEDA DELL'IMMOBILE: da qui si cambiava un
           dato che vive altrove. Mettendo 0 si azzerava la provvigione vera
           dell'immobile e la riga spariva dall'elenco, perché il portafoglio
           mostra solo le voci di valore maggiore di zero.
           Questa pagina è di statistiche: legge e basta. Al posto della
           matita, la percentuale scritta e un pulsante che APRE la scheda,
           dove la correzione si fa nel posto giusto. */
        /* [13 set 2026] Le due colonne, solo in portafoglio e a rischio. */
        + (v.stima
            ? '<div style="display:flex;gap:6px;flex-shrink:0">'
              + _colonna('Venditore', v.immIdx, 'V', v.percV, v.valV, v.svImpostata, '#1D4ED8')
              + _colonna('Acquirente', v.immIdx, 'A', v.percA, v.valA, v.saImpostata, '#6D28D9')
              + '</div>'
            : ((v.perc!==null&&v.perc!==undefined) || v.fisso
                ? '<span style="font-size:0.74rem;font-weight:700;color:var(--text3);background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:3px 8px;white-space:nowrap">'
                  + (v.fisso ? _eur(v.fisso) : v.perc+'%') + '</span>'
                : ''))
        + (v.immIdx>=0
            ? '<button class="btn btn-outline btn-sm" style="padding:5px 9px;white-space:nowrap" title="Apri la scheda dell\'immobile" onclick="chiudiProvvAttese();openSchedaImmobile('+v.immIdx+')">Apri</button>'
            : '')
        + '</div>';
    }).join('') : '<div style="padding:12px;border-top:1px solid var(--border);font-size:0.82rem;color:var(--text4)">Niente in questo gradino.</div>';
    return '<div class="card" style="border-top:3px solid '+colore+';margin-bottom:14px;overflow:hidden;padding:0">'
      + '<div style="padding:11px 14px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;background:'+(_TINTA[colore]||'var(--bg3)')+';border-bottom:1px solid var(--border)">'
      +   '<div style="font-size:0.94rem;font-weight:800;color:var(--text)">'+titolo+'</div>'
      +   '<div style="flex:1;min-width:150px;font-size:0.76rem;color:var(--text3)">'+spiega+'</div>'
      +   '<div style="text-align:right;white-space:nowrap">'
      +     '<div style="font-size:1.05rem;font-weight:900;color:'+colore+'">'+_eur(tot)+'</div>'
      +     '<div style="font-size:0.78rem;font-weight:800;color:var(--text2)">a te '+_eur(totNetto)+'</div>'
      /* [12 set 2026] Quanto varrebbe con la parte acquirente: sul totale di
         sezione serve più che sulla singola riga, perché è la cifra che
         guardi quando decidi se rinnovare un incarico. */
      +     (totTeorico>0 ? '<div style="font-size:0.74rem;font-style:italic;color:#6D28D9">+ '+_eur(totTeorico)+' con acquirente</div>' : '')
      +   '</div>'
      + '</div>'
      + righe + '</div>';
  }

  /* Correzione in linea: il pulsante si trasforma in casella. Niente prompt(),
     che in alcuni contesti di questa applicazione non compare affatto. */
  /* Una colonna: intestazione, casella della percentuale, importo maturato.
     Il fondo è pieno quando il valore l'hai indicato tu, tratteggiato quando
     è ancora quello di partenza (incarico per il venditore, percentuale
     teorica per l'acquirente). */
  function _colonna(et, immIdx, lato, perc, val, impostata, col){
    var id='pa-st-'+lato+'-'+immIdx;
    return '<div style="min-width:104px;text-align:center;border:1px '+(impostata?'solid':'dashed')+' '+(impostata?col:'var(--border2)')+';border-radius:8px;padding:4px 6px;background:'+(impostata?'var(--bg2)':'transparent')+'">'
      + '<div style="font-size:0.6rem;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:'+(impostata?col:'var(--text3)')+'">'+et+'</div>'
      + '<div style="display:flex;align-items:center;justify-content:center;gap:3px;margin:2px 0">'
      +   '<input id="'+id+'" value="'+(perc||0)+'" inputmode="decimal"'
      +     ' onchange="_paStima('+immIdx+',\''+lato+'\',this.value)"'
      +     ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}"'
      +     ' style="width:46px;text-align:right;font-size:0.8rem;font-weight:700;color:var(--text);border:1px solid var(--border2);border-radius:5px;padding:2px 4px;font-family:inherit;background:var(--bg)">'
      +   '<span style="font-size:0.74rem;font-weight:700;color:var(--text3)">%</span>'
      + '</div>'
      + '<div style="font-size:0.78rem;font-weight:800;color:'+(impostata?col:'var(--text3)')+'">'+_eur(val||0)+'</div>'
      + '</div>';
  }

  /* Scrive SOLO stimaPercV / stimaPercA sull'immobile: campi che esistono
     unicamente per questa schermata. incPerc, percV e percA non si toccano. */
  window._paStima=function(immIdx, lato, valore){
    var im=(Array.isArray(D.immobili)?D.immobili:[])[immIdx];
    if(!im) return;
    var v=String(valore==null?'':valore).trim();
    var n=_n(v);
    if(v!=='' && (n<0 || n>100)){
      typeof dlgAlert==='function'&&dlgAlert('La percentuale deve stare fra 0 e 100.','','Valore non valido');
      apriProvvAttese(); return;
    }
    if(lato==='V') im.stimaPercV = v; else im.stimaPercA = v;
    try{ (typeof saveD==='function'&&saveD()); }catch(e){ console.warn('[Provvigioni attese] saveD KO:', e); }
    apriProvvAttese();
  };

  /* [13 set 2026] _paModPerc rimossa: scriveva sulla scheda immobile da una
     pagina che deve solo leggere. La correzione della provvigione si fa nella
     scheda dell'immobile o nella pratica, dove quel dato vive. */

  /* ── LINGUETTE ──────────────────────────────────────────────────────────
     Stesse classi della scheda immobile (.simm-tabs, .simm-tab): si vede una
     sezione per volta invece di scorrere fino in fondo. */
  var _paTabAttiva = 'maturato';
  function _tot(l){ return l.reduce(function(s,v){ return s+v.valore; },0); }
  function _totT(l){ return l.reduce(function(s,v){ return s+(v.teorico||0); },0); }
  function _linguette(G){
    var voci=[
      ['maturato','4 · Da incassare', G.maturato, '#15803D'],
      ['accettate','3 · Accettate',   G.accettate,'#1D4ED8'],
      ['inCorso','2 · In corso',      G.inCorso,  '#D97706'],
      ['portafoglio','1 · Portafoglio',G.portafoglio,'var(--text2)'],
      ['scadenze','A rischio',        G.scadenze, '#DC2626']
    ];
    return '<div class="simm-tabs" style="margin-bottom:14px">'
      + voci.map(function(v){
          if(v[0]==='scadenze' && !v[2].length) return '';
          return '<div class="simm-tab'+(_paTabAttiva===v[0]?' attivo':'')+'" onclick="_paTab(\''+v[0]+'\')">'
            + v[1]
            + '<span style="margin-left:7px;font-size:0.74rem;font-weight:800;color:'+v[3]+'">'+_eur(_tot(v[2]))+'</span>'
            + (_totT(v[2])>0 ? '<span style="margin-left:4px;font-size:0.7rem;font-style:italic;color:#6D28D9">+'+_eur(_totT(v[2]))+'</span>' : '')
            + '<span style="margin-left:5px;font-size:0.7rem;color:var(--text3)">('+v[2].length+')</span>'
            + '</div>';
        }).join('')
      + '</div>';
  }
  function _contenutoTab(G, quale){
    if(quale==='scadenze'){
      var _perdo=_tot(G.scadenze), _perdoT=_totT(G.scadenze);
      /* [15 set 2026] I campi delle percentuali stanno qui e in Portafoglio:
         sono le due viste fatte di stime, dove cambiarli cambia i numeri. */
      return _paCampiQuote()
        + '<div style="font-size:0.78rem;color:var(--text2);margin-bottom:8px">'
        + 'Incarichi in scadenza entro 90 giorni senza una proposta accettata.'
        + (_perdo>0 ? ' <strong style="color:#DC2626">Se li perdi se ne vanno '+_eur(_perdo)+'</strong>'
            + (_perdoT>0 ? ' <span style="color:#6D28D9;font-style:italic">più '+_eur(_perdoT)+' di parte acquirente</span>' : '') : '')
        + '</div>'
        + _sez('Incarichi in scadenza', 'da rinnovare o da lasciar andare', G.scadenze, '#DC2626');
    }
    var mappa={
      maturato:   ['4 · Da incassare','lavoro fatto, soldi non arrivati', G.maturato, '#15803D'],
      accettate:  ['3 · Proposte accettate','manca solo il rogito', G.accettate, '#1D4ED8'],
      inCorso:    ['2 · Proposte in corso','in trattativa, possono saltare', G.inCorso, '#D97706'],
      portafoglio:['1 · Portafoglio','se si vendessero tutti — non succede mai', G.portafoglio, 'var(--text2)']
    };
    var v=mappa[quale]||mappa.maturato;
    return (quale === 'portafoglio' ? _paCampiQuote() : '')
      + _sez(v[0], v[1], v[2], v[3]);
  }
  /* [14 set 2026] Esposta per il modulo Obiettivi, che deve sapere cosa c'è
     in pipeline. È di SOLA LETTURA (nessun saveD, scrive solo sul proprio
     oggetto di lavoro): riusarla evita di avere due conti diversi dello
     stesso portafoglio che col tempo divergono. */
  window._paCalcola=_calcola;
  window._paTab=function(quale){ _paTabAttiva=quale; apriProvvAttese(); };

  window.chiudiProvvAttese=function(){ var w=document.getElementById('pa-wrap'); if(w) w.remove(); };
  window.apriProvvAttese=function(){
    chiudiProvvAttese();
    var G;
    try{ G=_calcola(); }catch(e){ console.warn('[Provvigioni attese] KO:', e); G={maturato:[],accettate:[],inCorso:[],portafoglio:[],scadenze:[]}; }
    var w=document.createElement('div');
    w.id='pa-wrap';
    w.style.cssText='position:fixed;top:0;right:0;bottom:0;left:0;z-index:9000;background:var(--bg);display:flex;flex-direction:column;overflow:hidden';
    w.innerHTML='<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0">'
      + '<button onclick="chiudiProvvAttese()" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Chiudi</button>'
      + '<div style="font-weight:800;color:var(--text);font-size:0.95rem">Provvigioni attese</div></div>'
      + '<div style="flex:1;overflow:auto;padding:14px 18px"><div style="max-width:1500px;margin:0 auto">'
      +   _quadro(G)
      /* [12 set 2026] Le sezioni seguono lo stesso ordine della pipeline in
         cima: dal più vicino alla cassa al più lontano. Prima la lettura era
         la stessa ma senza i numeri di tappa, e non si capiva che fosse un
         percorso. */
      /* [12 set 2026] LINGUETTE al posto delle quattro sezioni impilate.
         Prima bisognava scorrere fino in fondo per arrivare al portafoglio.
         Stesse classi della scheda immobile (.simm-tabs, .simm-tab): niente
         grafica nuova da imparare. */
      +   _linguette(G)
      +   '<div id="pa-corpo">' + _contenutoTab(G, _paTabAttiva) + '</div>'
      + '</div></div>';
    document.body.appendChild(w);
    try{ if(typeof window._ceSeguiMenu === 'function') window._ceSeguiMenu(w); }catch(e){}
  };
})();
