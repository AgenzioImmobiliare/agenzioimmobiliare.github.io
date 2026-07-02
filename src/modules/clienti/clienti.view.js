// modules/clienti/clienti.view.js — vista DESKTOP del modulo Clienti.
//
// Estratto dal monolite: openClienteModal (19059-19087) + blocco CRUD/render
// (20102-20863): onTipoClienteChange, saveCliente, editCliente, delCliente,
// archiviaCliente, riattivaCliente, delCliPure, _hasOtherActiveOwners,
// openSchedaCliente, renderClienti, renderSchedaCliente.
//
// DIPENDENZE ESTERNE (monolite, via window durante la migrazione):
//   FUNZIONI: _norm, fmtE, fmtD, _immApparteneCli, saveD, updateBadges, bStato,
//     _tlLog, showToast, openSchedaImmobile, today, renderImmobili, renderIncarichi,
//     openImmobileModalWithClient, setNum, getNum, genUUID, go, hasPermission,
//     openVisita, reindexAfterImmSplice, reindexAfterCliSplice.
//   VARIABILE: curSection (nel monolite resa `var` per esporla su window).
//
// `D` e' un Proxy LIVE su window.D: opera sempre sullo stato reale del monolite,
// a prescindere dall'ordine di caricamento. Il codice estratto resta invariato.
import { state } from '../../core/state.js';

const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

/* Risolve un identificativo cliente in un indice ATTUALE dell'array.
   Accetta sia un uuid stabile (stringa, usato dai pulsanti nel rendering
   più recente) sia un indice numerico (per compatibilità con chiamate
   esistenti altrove nel gestionale, es. D.schedaCliIdx). Usare SEMPRE
   questo all'inizio di ogni funzione che modifica/cancella un cliente,
   per non dipendere da un indice catturato al momento del render (che
   può "scivolare" se nel frattempo arriva una sincronizzazione cloud). */
function _cliResolveIdx(idOrIdx){
  if(typeof idOrIdx==='string') return D.clienti.findIndex(function(x){return x&&x.uuid===idOrIdx;});
  return idOrIdx;
}

function openClienteModal(idxOrUuid){
  const idx=idxOrUuid!==undefined?_cliResolveIdx(idxOrUuid):undefined;
  if(idxOrUuid!==undefined && (idx===undefined || idx<0)){
    if(typeof showToast==='function') showToast('Cliente non trovato (forse aggiornato altrove). Aggiorno la lista...','','#DC2626');
    try{ renderClienti(); }catch(e){}
    return;
  }
  // Reset state first
  D.editIdx=null; D.editType=null; D.editClienteUuid=null;
  clearModal('modal-cliente');
  document.getElementById('mt-cli').textContent = idx!==undefined ? 'Modifica Cliente' : 'Nuovo Cliente';
  document.getElementById('cli-data').value = today();
  if(idx!==undefined){
    if(!D.clienti[idx].uuid) D.clienti[idx].uuid=genUUID();
    D.editIdx=idx; D.editType='cliente'; D.editClienteUuid=D.clienti[idx].uuid;
    const c=D.clienti[idx];
    ['nome','tipo','sesso','tel','email','cf','citta','fonte','data','op','budget','note','nascita'].forEach(k=>{
      const el=document.getElementById('cli-'+k); if(el) el.value=c[k]||'';
    });
  }
  onTipoClienteChange();
  // If editing an acquirente, load existing richiesta data into cli-riq-* fields
  if(idx!==undefined && D.clienti[idx] && D.clienti[idx].tipo==='acquirente'){
    const existing=D.richieste.find(r=>parseInt(r.cliRef)===idx);
    if(existing){
      // Map riq fields → cli-riq- fields
      ['inc','tipo','comune','mq','cam','mare','urg','note'].forEach(k=>{
        const el=document.getElementById('cli-riq-'+k);
        if(el) el.value=existing[k]||'';
      });
      if(existing.bmin) setNum('cli-riq-bmin', parseFloat(existing.bmin));
      if(existing.bmax) setNum('cli-riq-bmax', parseFloat(existing.bmax));
    }
  }
  openModal('modal-cliente');
}

function onTipoClienteChange(){
  const tipo=document.getElementById('cli-tipo').value;
  const hint=document.getElementById('cli-tipo-hint');
  const msgs={
    acquirente:{txt:' <strong>Acquirente</strong> — Compila i dati anagrafici e la sezione <strong>"Richiesta"</strong> qui sotto. La richiesta verrà creata <strong>automaticamente</strong> al salvataggio — nessuna scheda aggiuntiva da compilare.',bg:'#EFF6FF',border:'#BFDBFE',col:'#1D4ED8'},
    venditore:{txt:' <strong>Venditore</strong> — Dopo aver salvato i dati cliente, si aprirà automaticamente la scheda immobile per registrare l\'immobile da vendere, già collegato a questo cliente.',bg:'#F0FDF4',border:'#BBF7D0',col:'#15803D'},
    entrambi:{txt:' <strong>Entrambi</strong> — Il cliente è sia acquirente che venditore. Dopo il salvataggio si aprirà la scheda immobile per registrare il suo immobile.',bg:'#FFFBEB',border:'#FDE68A',col:'#92400E'},
  };
  const m=msgs[tipo];
  if(m){hint.style.display='block';hint.innerHTML=m.txt;hint.style.background=m.bg;hint.style.borderColor=m.border;hint.style.color=m.col;}
  else hint.style.display='none';
  // Hide full richiesta section for venditori
  const isVend = tipo==='venditore' || tipo==='entrambi';
  const intSec=document.getElementById('cli-interesse-section');
  if(intSec) intSec.style.display = isVend ? 'none' : '';
  const riqRows=['cli-riq-row-inc','cli-riq-row-tipo','cli-riq-row-bmin','cli-riq-row-bmax',
    'cli-riq-row-comune','cli-riq-row-mq','cli-riq-row-cam','cli-riq-row-mare',
    'cli-riq-row-urg','cli-riq-row-note'];
  riqRows.forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display = isVend ? 'none' : '';
  });
}
function saveCliente(){
  /* Anti-drift: ri-risolvi l'indice reale del cliente in modifica appena
     prima di leggere/scrivere D.clienti, così non rischi di sovrascrivere
     un record diverso da quello che stai modificando (es. se nel frattempo
     è arrivata una sincronizzazione cloud che ha riordinato l'array). */
  if(D.editType==='cliente' && D.editClienteUuid){
    const _freshIdx=D.clienti.findIndex(x=>x&&x.uuid===D.editClienteUuid);
    if(_freshIdx<0){
      alert('Questo cliente non esiste più (probabilmente cancellato o aggiornato da un altro dispositivo). La lista viene aggiornata.');
      D.editIdx=null; D.editType=null; D.editClienteUuid=null;
      try{ closeModal('modal-cliente'); }catch(_e){}
      renderClienti();
      return;
    }
    D.editIdx=_freshIdx;
  }
  const g=id=>document.getElementById(id).value;
  if(!g('cli-nome').trim()){dlgAlert('Il Nome del cliente è obbligatorio.','','Campo obbligatorio');document.getElementById('cli-nome').focus();return;}
  if(!g('cli-tipo')){dlgAlert('Il Tipo cliente è obbligatorio.','','Campo obbligatorio');document.getElementById('cli-tipo').focus();return;}
  const c={nome:g('cli-nome'),tipo:g('cli-tipo'),sesso:g('cli-sesso'),tel:g('cli-tel'),email:g('cli-email'),cf:g('cli-cf'),citta:g('cli-citta'),fonte:g('cli-fonte'),data:g('cli-data'),nascita:g('cli-nascita')};
  const isNuovoCliente=(D.editIdx===null || D.editType!=='cliente');
  /* ─── PREVENZIONE DUPLICATI: se sto creando un cliente NUOVO e ne esiste già
     uno con lo stesso nome (anche con ordine nome/cognome invertito), chiedo
     conferma prima di crearne un altro. ─── */
  if(isNuovoCliente && typeof window.clientiSimiliA==='function'){
    var _simili = window.clientiSimiliA(c.nome, null);
    if(_simili && _simili.length){
      var _elenco = _simili.map(function(o){ return '• '+(o.cliente.nome||'')+(o.cliente.tel?' ('+o.cliente.tel+')':''); }).join('\n');
      var _ok = confirm('Esiste già un cliente con questo nome:\n\n'+_elenco+'\n\nVuoi crearne comunque uno nuovo?\n\n(Premi Annulla per non creare il doppione — potrai cercare e modificare quello esistente.)');
      if(!_ok){ return; }
    }
  }
  let savedIdx;
  if(D.editIdx!==null && D.editType==='cliente'){
    c.uuid = D.clienti[D.editIdx].uuid || genUUID();
    D.clienti[D.editIdx]=c;
    savedIdx=D.editIdx;
  } else {
    c.uuid = genUUID();
    D.clienti.push(c);
    savedIdx=D.clienti.length-1;
    /* ─── TIMELINE: creazione cliente ─── */
    try{
      _tlLog('cli_creato', 'cliente', savedIdx,
        'Cliente creato: '+(c.nome||'—')+(c.tipo?' ('+c.tipo+')':''),
        { nome: c.nome, tipo: c.tipo, fonte: c.fonte });
    }catch(_tlErr){ console.warn('[Timeline] hook saveCliente KO:', _tlErr); }
  }
  // Sync compleanno allo scadenzario
  D.eventi=D.eventi.filter(e=>!(e._type==='compleanno'&&e.cliente===c.nome));
  if(c.nascita&&c.nascita.length===10){
    const _oggi=new Date();_oggi.setHours(0,0,0,0);
    const _mm=c.nascita.slice(5,7),_dd=c.nascita.slice(8,10);
    let _anno=_oggi.getFullYear();
    const _bq=new Date(_anno+'-'+_mm+'-'+_dd+'T00:00:00');
    if(_bq<_oggi) _anno++;
    const _bdData=_anno+'-'+_mm+'-'+_dd;
    D.eventi.push({titolo:' Compleanno di '+c.nome,tipo:'Compleanno',data:_bdData,ora:'',cliente:c.nome,tel:c.tel||'',note:'Data di nascita: '+c.nascita,_type:'compleanno'});
  }
  saveD();
  closeModal('modal-cliente');
  // If we are viewing this cliente's scheda, refresh it in place
  if(curSection==='scheda-cliente' && D.schedaCliIdx===savedIdx){
    renderSchedaCliente(savedIdx);
  } else {
    renderClienti();
  }
  updateBadges();
  // WORKFLOW per tipo cliente — solo al PRIMO inserimento, non in modifica
  if(_afterCliSaveOpenImm && isNuovoCliente){
    _afterCliSaveOpenImm=false;
    setTimeout(()=>{ openImmobileModalWithClient(savedIdx); }, 200);
  } else if(isNuovoCliente && (c.tipo==='venditore' || c.tipo==='entrambi')){
    // Venditore nuovo → apri subito scheda immobile
    setTimeout(()=>{ openImmobileModalWithClient(savedIdx); }, 150);
  } else if(c.tipo==='acquirente'){
    // Acquirente → auto-create/update richiesta from inline form fields
    const bmin=getNum('cli-riq-bmin');
    const bmax=getNum('cli-riq-bmax');
    const riq={
      cliRef: savedIdx,
      nome: c.nome,
      tel: c.tel,
      email: c.email,
      inc: g('cli-riq-inc')||'Acquisto',
      tipo: g('cli-riq-tipo')||'Appartamento',
      bmin: bmin||'',
      bmax: bmax||'',
      comune: g('cli-riq-comune'),
      mq: g('cli-riq-mq'),
      cam: g('cli-riq-cam'),
      mare: g('cli-riq-mare'),
      urg: g('cli-riq-urg')||'media',
      note: g('cli-riq-note'),
      data: c.data||today(),
      fonte: c.fonte||''
    };
    // Only create/update if at least one richiesta field is filled
    const hasRiqData=riq.comune||bmin||bmax||riq.note||riq.mq;
    if(hasRiqData){
      const existingRiqIdx=D.richieste.findIndex(r=>parseInt(r.cliRef)===savedIdx);
      if(existingRiqIdx>=0){
        D.richieste[existingRiqIdx]=riq; // update
      } else {
        D.richieste.push(riq); // create
      }
      saveD();
    }
    // Navigate directly to scheda cliente — no extra modal needed
    setTimeout(()=>{ openSchedaCliente(savedIdx); }, 150);
  }
}
function editCliente(i){
  event && event.stopPropagation();
  openClienteModal(i);
}
function delCliente(i){
  if(!hasPermission('clienti.delete')){ if(typeof showToast==='function') showToast('Eliminazione non consentita per il tuo ruolo','','#DC2626'); return; }
  event && event.stopPropagation();
  if(confirm('Eliminare il cliente "'+( D.clienti[i]?.nome||'')+ '"?')){
    D.clienti.splice(i,1);
    reindexAfterCliSplice(i);
    saveD();
    renderClienti();
    updateBadges();
  }
}
// Helper: delete cliente with full cascade (immobili + visite + pratiche)
function archiviaCliente(idxOrUuid){
  const i=_cliResolveIdx(idxOrUuid);
  const c=D.clienti[i];
  if(!c)return;
  if(!c.uuid) c.uuid=genUUID();
  const cUuid=c.uuid; /* catturato ORA: servirà a ritrovare il record giusto dopo il dialog di conferma */
  // Trova immobili collegati ATTIVI (non già archiviati/venduti).
  // NOTA: 'non attivo' NON è uno stato legittimo dell'immobile (lo è solo per gli agenti).
  // Eventuali dati legacy con quel valore vengono comunque trattati come attivi e archiviati a cascata.
  const statiChiusi=['venduto','archiviata','revoca','vendita','archiviato','affittato'];
  const immCli=D.immobili.map((im,idx)=>({im,idx})).filter(({im})=>{
    return _immApparteneCli(im, i);
  });
  const immAttivi=immCli.filter(({im})=>!statiChiusi.includes((im.stato||'').toLowerCase()));

  /* ── Suddividi in: immobili con SOLO questo proprietario vs immobili COINTESTATI ── */
  function _hasOtherActiveOwners(im){
    if(!Array.isArray(im.coIntestari) || im.coIntestari.length===0) return false;
    return im.coIntestari.some(function(co){
      if(!co || !co.nome) return false;
      /* salta se il co-intestatario è il cliente che stiamo archiviando */
      if(_norm(co.nome) === _norm(c.nome||'')) return false;
      /* il co-intestatario corrisponde a un cliente nel DB? se sì, è "altro proprietario" */
      var altro = D.clienti.find(function(cl,ci){
        return ci !== i && cl && cl.nome && _norm(cl.nome) === _norm(co.nome) && !cl.archiviato;
      });
      /* se non c'è match in clienti ma c'è solo il nome libero, lo consideriamo comunque
         "altro proprietario" per sicurezza (no auto-archiviazione distruttiva) */
      return altro ? true : true;
    });
  }
  const immAttiviSoloMio = immAttivi.filter(function(o){ return !_hasOtherActiveOwners(o.im); });
  const immAttiviCointest = immAttivi.filter(function(o){ return _hasOtherActiveOwners(o.im); });

  let extraInfo='';
  if(immAttiviSoloMio.length>0){
    extraInfo+=`<div style="margin-top:10px;padding:10px 12px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;font-size:0.82rem;color:#78350F">
      <strong>⚠️ ${immAttiviSoloMio.length} immobil${immAttiviSoloMio.length===1?'e attivo verrà archiviato':'i attivi verranno archiviati'} a cascata:</strong><br>
      ${immAttiviSoloMio.slice(0,3).map(({im})=>'• '+(im.tipo||'Immobile')+(im.comune?' — '+im.comune:'')).join('<br>')}
      ${immAttiviSoloMio.length>3?'<br>• ... e altri '+(immAttiviSoloMio.length-3):''}<br>
      <span style="font-size:0.78rem;color:#92400E;display:block;margin-top:6px">Saranno automaticamente ripristinati alla riattivazione del cliente (eccetto se venduti nel frattempo).</span>
    </div>`;
  }
  if(immAttiviCointest.length>0){
    extraInfo+=`<div style="margin-top:10px;padding:10px 12px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;font-size:0.82rem;color:#1E3A8A">
      <strong>ℹ️ ${immAttiviCointest.length} immobil${immAttiviCointest.length===1?'e cointestato':'i cointestati'} preservat${immAttiviCointest.length===1?'o':'i'}:</strong><br>
      ${immAttiviCointest.slice(0,3).map(({im})=>'• '+(im.tipo||'Immobile')+(im.comune?' — '+im.comune:'')+' <span style="color:#64748B">(altri proprietari attivi)</span>').join('<br>')}
      ${immAttiviCointest.length>3?'<br>• ... e altri '+(immAttiviCointest.length-3):''}<br>
      <span style="font-size:0.78rem;color:#475569">Non verranno archiviati per non perdere il riferimento agli altri proprietari.</span>
    </div>`;
  }
  dlgConfirm(`Archiviare il cliente "<strong>${c.nome||''}</strong>"?<br><small style="color:var(--text3)">Il cliente rimarrà nel sistema ma verrà nascosto dalla lista Attivi. Potrai riattivarlo in qualsiasi momento.</small>${extraInfo}`,'','Archivia Cliente').then(ok=>{
    if(!ok)return;
    /* Anti-drift: ri-risolvi l'indice del cliente dal suo uuid, proprio ora
       che l'utente ha confermato — può essere passato tempo dall'apertura
       del dialog, durante il quale una sincronizzazione cloud in background
       potrebbe aver riordinato D.clienti. */
    const i2=D.clienti.findIndex(x=>x&&x.uuid===cUuid);
    if(i2<0){
      alert('Questo cliente non esiste più (probabilmente cancellato o aggiornato da un altro dispositivo). La lista viene aggiornata.');
      renderClienti();
      return;
    }
    // Archivia SEMPRE automaticamente gli immobili a proprietà esclusiva (no più scelta utente)
    const archImmToo = immAttiviSoloMio.length>0;
    D.clienti[i2].archiviato=true;
    /* ─── TIMELINE: archiviazione cliente ─── */
    try{
      _tlLog('cli_archiviato', 'cliente', i2,
        'Cliente archiviato: '+(c.nome||''),
        { nome: c.nome });
    }catch(_e){ }
    let archImmCount=0;
    if(archImmToo){
      immAttiviSoloMio.forEach(({im,idx})=>{
        /* Salva lo stato precedente per poterlo ripristinare alla riattivazione del cliente */
        im._statoPrecedenteArchivio = im.stato || 'attivo';
        im.stato='archiviato';
        im._archiviaData=today();
        im._archiviaMotivo='Cliente archiviato';
        im._archiviaNota='Archiviato automaticamente con il cliente "'+(c.nome||'')+'"';
        // rimuovi proposte e scadenze incarico
        D.pratiche=D.pratiche.filter(p=>!(String(p.immRef)===String(idx)&&p.stato==='proposta'));
        D.eventi=D.eventi.filter(e=>!(e._immIdx===idx&&e._type==='incarico'));
        archImmCount++;
        /* ─── TIMELINE: immobile archiviato a cascata ─── */
        try{
          _tlLog('imm_archiviato', 'immobile', idx,
            'Immobile archiviato (cascata da cliente '+(c.nome||'')+')',
            { motivo: 'Cliente archiviato', cliente: c.nome, statoPrec: im._statoPrecedenteArchivio },
            { relIds: [{t:'cliente', id: i2}] });
        }catch(_e){ }
      });
    }
    /* Per gli immobili cointestati: rimuovi il cliente dal campo contatto/clienteRef se possibile,
       trasferendo l'intestazione principale a un co-intestatario attivo se presente. */
    immAttiviCointest.forEach(function(o){
      var im = o.im;
      /* sgancia clienteRef se puntava a questo cliente */
      if(im.clienteRef !== undefined && parseInt(im.clienteRef) === i2){
        im.clienteRef = '';
      }
      /* se il contatto principale era questo cliente, promuovi il primo co-intestatario */
      if(im.contatto && _norm(im.contatto) === _norm(c.nome||'')){
        var nuovo = (im.coIntestari||[]).find(function(co){
          return co && co.nome && _norm(co.nome) !== _norm(c.nome||'');
        });
        if(nuovo){
          im.contatto = nuovo.nome;
          if(nuovo.tel && !im.telefono) im.telefono = nuovo.tel;
          /* rimuovi il nuovo intestatario dai cointestari (è ora il principale) */
          im.coIntestari = (im.coIntestari||[]).filter(function(co){
            return co && _norm(co.nome) !== _norm(nuovo.nome);
          });
          /* aggiungi il vecchio intestatario tra i cointestari "storici" se non c'è già */
          var presente = (im.coIntestari||[]).some(function(co){ return co && _norm(co.nome) === _norm(c.nome||''); });
          if(!presente){
            im.coIntestari = (im.coIntestari||[]).concat([{nome:c.nome, tel:im.telefono||'', _storico:true}]);
          }
        }
      }
    });
    saveD();
    renderClienti();
    if(archImmCount>0 && typeof renderImmobili==='function') renderImmobili();
    if(archImmCount>0 && typeof renderIncarichi==='function') renderIncarichi();
    if(archImmCount>0 && typeof renderPratiche==='function') renderPratiche();
    /* Se ho rimaneggiato cointestati, ridisegna comunque immobili per riflettere il cambio */
    if(immAttiviCointest.length>0 && typeof renderImmobili==='function') renderImmobili();
    updateBadges();
    var msg='📦 Cliente "'+(c.nome||'')+'" archiviato';
    if(archImmCount>0) msg += ' + '+archImmCount+' immobil'+(archImmCount===1?'e':'i');
    if(immAttiviCointest.length>0) msg += ' · '+immAttiviCointest.length+' cointestat'+(immAttiviCointest.length===1?'o':'i')+' preservat'+(immAttiviCointest.length===1?'o':'i');
    showToast(msg,'','');
  });
}
function riattivaCliente(idxOrUuid){
  const i=_cliResolveIdx(idxOrUuid);
  const c=D.clienti[i];
  if(!c)return;
  /* ── Cerca immobili archiviati a cascata col cliente ───────────────
     Criteri:
     1) stato corrente == 'archiviato' (se è diventato 'venduto' nel
        frattempo NON entra qui — escluso automaticamente)
     2) _archiviaMotivo == 'Cliente archiviato' (cioè cascata, non
        archiviazione manuale)
     3) cliente corrisponde tramite clienteRef o contatto             */
  const statiNonRipristinabili = ['venduto','vendita','affittato'];
  const immArchCli=D.immobili.map((im,idx)=>({im,idx})).filter(({im})=>{
    /* Skip se stato non è archiviato (es. nel frattempo è stato venduto manualmente) */
    if(((im.stato||'').toLowerCase()!=='archiviato')) return false;
    /* Skip se non era archiviato per cascata cliente */
    if(im._archiviaMotivo!=='Cliente archiviato') return false;
    return _immApparteneCli(im, i);
  });

  /* ── Conteggio immobili "venduti nel frattempo" per messaggio info ──
     Cerca immobili del cliente che ora sono in stato non-ripristinabile
     ma che probabilmente erano stati archiviati a cascata.            */
  const immVendutiDopo = D.immobili.filter(im=>{
    if(!statiNonRipristinabili.includes((im.stato||'').toLowerCase())) return false;
    /* Verifica se il cliente ne è (o era) proprietario */
    return _immApparteneCli(im, i);
  });

  D.clienti[i].archiviato=false;
  /* ─── TIMELINE: riattivazione cliente ─── */
  try{
    _tlLog('cli_riattivato', 'cliente', i,
      'Cliente riattivato: '+(c.nome||''),
      { nome: c.nome });
  }catch(_e){ }
  let riattCount=0;
  immArchCli.forEach(({im,idx})=>{
    /* Ripristina stato precedente se disponibile, altrimenti 'attivo' */
    const statoPrec = im._statoPrecedenteArchivio || 'attivo';
    im.stato=statoPrec;
    delete im._archiviaData;
    delete im._archiviaMotivo;
    delete im._archiviaNota;
    delete im._statoPrecedenteArchivio;
    riattCount++;
    /* ─── TIMELINE: immobile riattivato a cascata ─── */
    try{
      _tlLog('imm_stato', 'immobile', idx,
        'Immobile riattivato (cascata da cliente '+(c.nome||'')+')',
        { da: 'archiviato', a: statoPrec, motivo: 'Riattivazione cliente' },
        { relIds: [{t:'cliente', id: i}] });
    }catch(_e){ }
  });
  saveD();
  renderClienti();
  if(riattCount>0){
    if(typeof renderImmobili==='function') renderImmobili();
    if(typeof renderIncarichi==='function') renderIncarichi();
  }
  updateBadges();
  /* Messaggio dettagliato */
  var msg='✅ Cliente "'+(c.nome||'')+'" riattivato';
  if(riattCount>0) msg += ' + '+riattCount+' immobil'+(riattCount===1?'e ripristinato':'i ripristinati');
  if(immVendutiDopo.length>0) msg += ' · '+immVendutiDopo.length+' non ripristinabil'+(immVendutiDopo.length===1?'e (venduto)':'i (venduti/affittati)');
  showToast(msg,'','');
}

function delCliPure(idxOrUuid){
  if(!hasPermission('clienti.delete')){ if(typeof showToast==='function') showToast('Eliminazione non consentita per il tuo ruolo','','#DC2626'); return; }
  const i=_cliResolveIdx(idxOrUuid);
  const c=D.clienti[i];
  if(!c) return;
  // FIX BUG 3 (rinforzato): l'utente ha riportato che dopo eliminazione cliente
  // restano in DB immobili con `contatto` = nome del cliente cancellato, ma
  // `clienteRef` puntante per errore a un altro cliente (es. shiftato per
  // un precedente reindex o per un dato sporco legacy). Per evitare residui:
  // cancella l'immobile se SODDISFA UNA delle seguenti condizioni:
  //   - clienteRef === i (puntamento esplicito)
  //   - contatto = c.nome (anche se clienteRef punta altrove: è probabile
  //     che il puntamento sia sporco — il contatto è dato più stabile)
  const cliNomeNorm=_norm(c.nome||'');
  const linkedImm=D.immobili.map((im,idx)=>({im,idx})).filter(({im})=>{
    if(!im) return false;
    // Match per clienteRef numerico
    if(im.clienteRef!==undefined && im.clienteRef!==null && im.clienteRef!==''){
      const r=parseInt(im.clienteRef);
      if(!isNaN(r) && r===i) return true;
    }
    // Match per contatto (anche se clienteRef punta altrove): forte segnale
    // che l'immobile era di QUESTO cliente.
    if(cliNomeNorm && im.contatto && _norm(im.contatto)===cliNomeNorm) return true;
    return false;
  });
  const linkedPrat=D.pratiche.filter(p=>String(p.vendRef)===String(i)||String(p.acqRef)===String(i));
  const linkedVis=D.visite.filter(v=>String(v.cliRef)===String(i));
  const linkedRiq=D.richieste.filter(r=>String(r.cliRef)===String(i));
  const linkedEv=D.eventi.filter(e=>e.cliente&&_norm(e.cliente)===cliNomeNorm);
  const linkedIncEv=linkedImm.reduce((acc,{idx})=>acc+D.eventi.filter(e=>e._immIdx===idx&&e._type==='incarico').length,0);
  let msg=` Eliminare il cliente "${c.nome||''}"?`;
  const parts=[];
  if(linkedImm.length>0){parts.push(`${linkedImm.length} immobile/i collegato/i`);}
  if(linkedPrat.length>0){parts.push(`${linkedPrat.length} pratica/e collegate`);}
  if(linkedVis.length>0){parts.push(`${linkedVis.length} visita/e registrate`);}
  if(linkedRiq.length>0){parts.push(`${linkedRiq.length} richiesta/e`);}
  if(linkedEv.length+linkedIncEv>0){parts.push(`${linkedEv.length+linkedIncEv} evento/i nello scadenzario`);}
  if(parts.length>0){
    msg+=`\n\n ATTENZIONE — verranno eliminati automaticamente:\n`;
    parts.forEach(p=>{msg+=`  • ${p}\n`;});
    if(linkedImm.length>0){linkedImm.forEach(({im})=>{msg+=`     ${im.tipo||'Immobile'}${im.ref?' n.'+im.ref:''} — ${im.comune||'n.d.'}\n`;});}
    if(linkedPrat.length>0){linkedPrat.forEach(p=>{msg+=`     Pratica: ${p.descr||p.venditore||'—'}\n`;});}
    msg+='\nConfermi l\'eliminazione completa?';
  }
  if(!confirm(msg)) return;
  // Remove in correct order
  const immIdxs=linkedImm.map(({idx})=>idx).sort((a,b)=>b-a);
  // Remove visite of linked immobili
  immIdxs.forEach(idx=>{D.visite=D.visite.filter(v=>parseInt(v.immRef)!==idx);});
  // Remove scadenzario incarichi eventi for linked immobili
  immIdxs.forEach(idx=>{D.eventi=D.eventi.filter(e=>!(e._immIdx===idx&&e._type==='incarico'));});
  // Remove scadenzario appuntamenti linked to this client by nome
  D.eventi=D.eventi.filter(e=>!(e.cliente&&_norm(e.cliente)===cliNomeNorm));
  // Remove linked immobili (in ordine decrescente per non spostare indici)
  immIdxs.forEach(idx=>{
    _blocklistImmobile(D.immobili[idx]); // FIX SYNC anti-resurrezione
    D.visite=D.visite.filter(v=>parseInt(v.immRef)!==idx);
    D.eventi=D.eventi.filter(e=>!(e._immIdx===idx&&e._type==='incarico'));
    D.immobili.splice(idx,1);
    reindexAfterImmSplice(idx);
  });
  // Remove pratiche
  D.pratiche=D.pratiche.filter(p=>String(p.vendRef)!==String(i)&&String(p.acqRef)!==String(i));
  // Remove richieste del cliente
  D.richieste=D.richieste.filter(r=>String(r.cliRef)!==String(i));
  // Remove visite del cliente
  D.visite=D.visite.filter(v=>String(v.cliRef)!==String(i));
  // Remove cliente e aggiusta tutti i riferimenti clienteRef
  D.clienti.splice(i,1);
  reindexAfterCliSplice(i);
  // FIX BUG 3: dopo lo splice, qualunque immobile rimasto con clienteRef=null
  // proveniente da questo cliente è un orfano. Se anche il suo `contatto`
  // corrisponde al nome appena cancellato, lo eliminiamo (ulteriore sicurezza).
  const _orfani=[];
  D.immobili.forEach((im,idx)=>{
    if((im.clienteRef===null||im.clienteRef===undefined||im.clienteRef==='')
       && im.contatto && _norm(im.contatto)===cliNomeNorm){
      _orfani.push(idx);
    }
  });
  if(_orfani.length>0){
    _orfani.sort((a,b)=>b-a).forEach(idx=>{
      _blocklistImmobile(D.immobili[idx]); // FIX SYNC anti-resurrezione
      D.visite=D.visite.filter(v=>parseInt(v.immRef)!==idx);
      D.eventi=D.eventi.filter(e=>!(e._immIdx===idx&&e._type==='incarico'));
      D.immobili.splice(idx,1);
      reindexAfterImmSplice(idx);
    });
  }
  const totalImmCancellati=linkedImm.length+_orfani.length;
  saveD();
  if(totalImmCancellati>0 && typeof _msoprForcePushImmobili==='function') _msoprForcePushImmobili();
  renderClienti();
  updateBadges();
  if(totalImmCancellati>0) alert(` Cliente e ${totalImmCancellati} immobile/i collegati eliminati.`);
}
function openSchedaCliente(i){D.schedaCliIdx=i;D.editIdx=null;D.editType=null;renderSchedaCliente(i);go('scheda-cliente');}
function renderClienti(){
  const q=(document.getElementById('f-cli-q').value||'').toLowerCase();
  const tipo=document.getElementById('f-cli-tipo').value;
  const statoFiltro=document.getElementById('f-cli-stato')?.value||'';
  const view=document.getElementById('f-cli-view').value;
  const f=D.clienti.filter(c=>{
    const t=[c.nome,c.tel,c.email,c.citta].join(' ').toLowerCase();
    const isArch=c.archiviato===true;
    const statoOk = statoFiltro==='' || (statoFiltro==='attivi'&&!isArch) || (statoFiltro==='archiviati'&&isArch);
    return(!q||t.includes(q))&&(!tipo||c.tipo===tipo)&&statoOk;
  }).slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','it'));
  const cnt=document.getElementById('cli-container');
  // Badge conteggio attivi/archiviati
  const nAttivi=D.clienti.filter(c=>!c.archiviato).length;
  const nArch=D.clienti.filter(c=>c.archiviato).length;
  // Aggiorna opzioni select con contatori
  const sel=document.getElementById('f-cli-stato');
  if(sel){
    sel.options[0].text=`● Tutti (${D.clienti.length})`;
    sel.options[1].text=`● Attivi (${nAttivi})`;
    sel.options[2].text=`● Archiviati (${nArch})`;
  }
  if(!f.length){cnt.innerHTML='<div class="card"><div class="card-body"><div class="empty-state"><div class="empty-icon">👥</div><p>Nessun cliente trovato.</p></div></div></div>';return;}

  /* SVG icons riutilizzabili */
  const icoEye='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const icoEdit='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const icoDel='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
  const icoPhone='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.06 6.06l1.27-.27a2 2 0 012.11.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>';
  const icoMail='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
  const icoHouse='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  const icoDoc='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  const icoArchive='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
  const icoUnarchive='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><polyline points="10 14 12 12 14 14"/><line x1="12" y1="12" x2="12" y2="17"/></svg>';

  if(view==='grid'){
    const cards=f.map(c=>{
      const ri=D.clienti.indexOf(c);
      if(!c.uuid) c.uuid=genUUID();
      const cuuid=c.uuid.replace(/'/g,"\\'");
      const isArch=c.archiviato===true;
      const vis=D.visite.filter(v=>parseInt(v.cliRef)===ri).length;
      const prat=D.pratiche.filter(p=>parseInt(p.acqRef)===ri||parseInt(p.vendRef)===ri).length;
      const ini=(c.nome||'?').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();

      /* Colori per tipo cliente */
      const tcol={acquirente:'#2563EB',venditore:'#D97706',entrambi:'#15803D'};
      const tpal={acquirente:'#EFF6FF',venditore:'#FFFBEB',entrambi:'#F0FDF4'};
      const avatarBg=isArch?'#94A3B8':(tcol[c.tipo]||'#2563EB');
      const avatarPale=isArch?'#F1F5F9':(tpal[c.tipo]||'#EFF6FF');

      /* Immobili collegati */
      const immCli=D.immobili.filter(im=>{
        return _immApparteneCli(im, ri);
      });
      const statiChiusi=['venduto','archiviata','revoca','vendita','archiviato'];
      const immAttivi=immCli.filter(im=>!statiChiusi.includes((im.stato||'').toLowerCase()));

      /* Bordo card */
      let borderColor=isArch?'#CBD5E1':'var(--border)';
      if(!isArch&&immCli.length>0&&immAttivi.length>0) borderColor='#86EFAC';
      else if(!isArch&&immCli.length>0&&immAttivi.length===0) borderColor='#FCA5A5';

      /* Badge stato */
      let statusBadge='';
      if(isArch)
        statusBadge=`<span style="padding:2px 8px;border-radius:20px;background:#F1F5F9;color:#64748B;font-size:0.66rem;font-weight:800;white-space:nowrap">${icoArchive} Archiviato</span>`;
      else if(immCli.length>0&&immAttivi.length>0)
        statusBadge=`<span style="padding:2px 8px;border-radius:20px;background:#DCFCE7;color:#15803D;font-size:0.66rem;font-weight:800;white-space:nowrap">● Attivo</span>`;
      else if(immCli.length>0&&immAttivi.length===0)
        statusBadge=`<span style="padding:2px 8px;border-radius:20px;background:#FFE4E6;color:#DC2626;font-size:0.66rem;font-weight:800;white-space:nowrap">● Archiv.</span>`;
      else
        /* FIX: cliente senza immobili agganciati ma non archiviato → "Attivo".
           Era invisibile prima (nessun ramo coperto). Casi tipici: cliente
           acquirente, cliente nuovo non ancora abbinato a immobili, o cliente
           con immobili scollegati per uuid disallineato dopo i rollback. */
        statusBadge=`<span style="padding:2px 8px;border-radius:20px;background:#DCFCE7;color:#15803D;font-size:0.66rem;font-weight:800;white-space:nowrap">● Attivo</span>`;

      /* ACCENT BAR */
      const accentBar=`<div style="height:4px;background:${isArch?'#CBD5E1':avatarBg};flex-shrink:0"></div>`;

      /* ── SEZIONE CLIENTE — 3D hover button sul nome ── */
      const clienteHtml=`
        <div style="padding:4px 6px 6px">
          <div class="cli-name-btn" onclick="openSchedaCliente(${ri})">
            <!-- Avatar -->
            <div style="width:38px;height:38px;border-radius:10px;background:${avatarPale};border:2px solid ${avatarBg}33;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.82rem;color:${avatarBg};flex-shrink:0;letter-spacing:-.5px;transition:transform 0.18s">${ini}</div>
            <!-- Info -->
            <div style="flex:1;min-width:0">
              <div style="font-weight:800;font-size:0.95rem;color:${isArch?'#94A3B8':'var(--text)'};line-height:1.25;word-break:break-word;margin-bottom:4px">${escH(c.nome)||'—'}</div>
              <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
                ${isArch?'':bStato(c.tipo)}
                ${statusBadge}
              </div>
            </div>
            <!-- Freccia scheda -->
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--brand);opacity:0.5;transition:opacity .15s"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
        ${c.citta?`<div style="padding:0 13px 8px;font-size:0.78rem;color:var(--text4);display:flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${escH(c.citta)}</div>`:''}`;
      /* CONTATTI */
      const contattiHtml=`
        <div style="padding:0 14px 10px;display:flex;flex-direction:column;gap:5px;border-bottom:1px solid var(--border)">
          ${c.tel?`<a href="tel:${c.tel}" style="display:flex;align-items:center;gap:7px;font-size:0.79rem;color:var(--text2);text-decoration:none;font-weight:500">
            <span style="width:22px;height:22px;border-radius:6px;background:#F1F5F9;display:flex;align-items:center;justify-content:center;flex-shrink:0">${icoPhone}</span>${c.tel}
          </a>`:''}
          ${c.email?`<span style="display:flex;align-items:center;gap:7px;font-size:0.79rem;color:var(--text3)">
            <span style="width:22px;height:22px;border-radius:6px;background:#F1F5F9;display:flex;align-items:center;justify-content:center;flex-shrink:0">${icoMail}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.email}</span>
          </span>`:''}
          ${(!c.tel&&!c.email)?`<span style="font-size:0.76rem;color:var(--text4);font-style:italic">Nessun contatto</span>`:''}
        </div>`;

      /* STRISCIA FOTO IMMOBILI */
      let fotoStripHtml='';
      if(immCli.length>0){
        const fotoItems=immCli.slice(0,4).map(im=>{
          const idx=D.immobili.indexOf(im);
          const s=calcolaStatoImmobile(idx);
          const sc={attivo:'#15803D',proposta:'#B45309',venduto:'#1D4ED8','non attivo':'#94A3B8',affittato:'#7C3AED'};
          const dotColor=sc[s]||'#94A3B8';
          if(im.foto){
            return`<div onclick="openSchedaImmobile(${idx})" title="${(im.tipo||'Immobile')+' — '+(im.comune||'')}" style="cursor:pointer;position:relative;flex:1;min-width:0;overflow:hidden;border-radius:8px;border:1.5px solid ${dotColor}22">
              <img src="${im.foto}" style="width:100%;height:62px;object-fit:cover;display:block" loading="lazy">
              <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.55));padding:3px 5px">
                <div style="font-size:0.6rem;font-weight:700;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${im.comune||im.tipo||''}</div>
              </div>
              <div style="position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;background:${dotColor};border:1.5px solid white"></div>
            </div>`;
          } else {
            return`<div onclick="openSchedaImmobile(${idx})" title="${(im.tipo||'Immobile')+' — '+(im.comune||'')}" style="cursor:pointer;flex:1;min-width:0;height:62px;border-radius:8px;border:1.5px solid ${dotColor}33;background:linear-gradient(135deg,#F8FAFC,#F1F5F9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:4px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${dotColor}" stroke-width="2" opacity=".7"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <div style="font-size:0.58rem;font-weight:700;color:#64748B;text-align:center;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${(im.comune||im.tipo||'').substring(0,12)}</div>
              <div style="width:7px;height:7px;border-radius:50%;background:${dotColor}"></div>
            </div>`;
          }
        });
        const extra=immCli.length>4?`<div style="width:38px;height:62px;flex-shrink:0;border-radius:8px;background:#F1F5F9;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;color:var(--text3)">+${immCli.length-4}</div>`:'';
        fotoStripHtml=`
          <div style="padding:10px 14px">
            <div style="font-size:0.65rem;font-weight:800;color:var(--text4);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;display:flex;align-items:center;gap:5px">
              ${icoHouse} Immobili (${immCli.length})
            </div>
            <div style="display:flex;gap:5px">${fotoItems.join('')}${extra}</div>
          </div>`;
      }

      /* FOOTER: stats + azioni */
      const archBtn=isArch
        ?`<button class="icon-btn" onclick="event.stopPropagation();riattivaCliente('${cuuid}')" title="Riattiva cliente" style="color:#15803D;font-size:0.7rem;display:flex;align-items:center;gap:3px">${icoUnarchive} Riattiva</button>`
        :`<button class="icon-btn" onclick="event.stopPropagation();archiviaCliente('${cuuid}')" title="Archivia cliente" style="color:#64748B;font-size:0.7rem;display:flex;align-items:center;gap:3px">${icoArchive}</button>`;

      const footerHtml=`
        <div style="padding:8px 14px 12px;display:flex;align-items:center;justify-content:space-between;margin-top:auto">
          <div style="display:flex;gap:10px;font-size:0.75rem;color:var(--text4)">
            <span style="display:flex;align-items:center;gap:3px" title="Visite">${icoEye} ${vis}</span>
            <span style="display:flex;align-items:center;gap:3px" title="Pratiche">${icoDoc} ${prat}</span>
          </div>
          <div style="display:flex;gap:3px">
            <button class="icon-btn" onclick="openSchedaCliente(${ri})" title="Scheda" style="font-size:0.72rem;display:flex;align-items:center;gap:4px">${icoEye} Scheda</button>
            ${archBtn}
            <button class="icon-btn" onclick="event.stopPropagation();openClienteModal('${cuuid}')" title="Modifica">${icoEdit}</button>
            <button class="icon-btn" onclick="event.stopPropagation();delCliPure('${cuuid}')" style="color:var(--red-l)" title="Elimina">${icoDel}</button>
          </div>
        </div>`;

      const cardOpacity=isArch?'opacity:0.72;':'';
      return `<div class="imm-card" style="cursor:default;border-color:${borderColor};display:flex;flex-direction:column;overflow:hidden;${cardOpacity}">
        ${accentBar}
        ${clienteHtml}
        ${contattiHtml}
        ${fotoStripHtml}
        ${footerHtml}
      </div>`;
    });
    cnt.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">${cards.join('')}</div>`;

  }else{
    /* Vista tabella */
    cnt.innerHTML='<div class="card"><div class="table-wrap"><table><thead><tr><th>Nome</th><th>Tel.</th><th>Email</th><th>Tipo</th><th>Fonte</th><th>Città</th><th>Budget</th><th>Immobili</th><th>Stato</th><th></th></tr></thead><tbody>'+f.map(c=>{
      const ri=D.clienti.indexOf(c);
      if(!c.uuid) c.uuid=genUUID();
      const cuuid=c.uuid.replace(/'/g,"\\'");
      const isArch=c.archiviato===true;
      const immCli=D.immobili.filter(im=>{
        return _immApparteneCli(im, ri);
      });
      return`<tr style="${isArch?'opacity:0.6;':''}">
        <td style="font-weight:700;cursor:pointer;color:var(--brand)" onclick="openSchedaCliente(${ri})">${c.nome||'—'}</td>
        <td>${c.tel?`<a href="tel:${c.tel}" style="color:var(--brand)">${c.tel}</a>`:'—'}</td>
        <td style="font-size:0.8rem;color:var(--text3)">${c.email||'—'}</td>
        <td>${bStato(c.tipo)}</td>
        <td><span class="badge badge-gray" style="font-size:0.68rem">${c.fonte||'—'}</span></td>
        <td>${c.citta||'—'}</td>
        <td style="color:var(--brand);font-weight:600">${c.budget?fmtE(c.budget):'—'}</td>
        <td>${immCli.length?`<span class="badge badge-green">${immCli.length}</span>`:'—'}</td>
        <td>${isArch?`<span class="badge badge-gray" style="font-size:0.68rem">Archiviato</span>`:`<span class="badge badge-green" style="font-size:0.68rem">Attivo</span>`}</td>
        <td><div class="actions-col">
          <button class="icon-btn" onclick="openSchedaCliente(${ri})" title="Scheda">${icoEye}</button>
          ${isArch
            ?`<button class="icon-btn" onclick="riattivaCliente('${cuuid}')" title="Riattiva" style="color:#15803D"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><polyline points="10 14 12 12 14 14"/><line x1="12" y1="12" x2="12" y2="17"/></svg></button>`
            :`<button class="icon-btn" onclick="archiviaCliente('${cuuid}')" title="Archivia" style="color:#64748B"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>`
          }
          <button class="icon-btn" onclick="openClienteModal('${cuuid}')" title="Modifica">${icoEdit}</button>
          <button class="icon-btn" onclick="delCliPure('${cuuid}')" style="color:var(--red-l)" title="Elimina">${icoDel}</button>
        </div></td>
      </tr>`;
    }).join('')+'</tbody></table></div></div>';
  }
}
function renderSchedaCliente(i){
  const c=D.clienti[i];
  if(!c){go('clienti');return;}
  document.getElementById('ph-scheda-title').textContent='Scheda: '+c.nome;
  const immClienti=D.immobili.filter(im=>{
    return _immApparteneCli(im, i);
  });
  const pratCli=D.pratiche.filter(p=>p.acqRef==i||p.vendRef==i||(p.venditore&&p.venditore===c.nome)||(p.acquirente&&p.acquirente===c.nome));
  // Visits: match by cliRef OR by nome. For venditori also include visits to their immobili.
  const immIdxOfClient=D.immobili.map((_,idx)=>idx).filter(idx=>{
    const im=D.immobili[idx];
    return _immApparteneCli(im, i);
  });
  const visCli=D.visite.filter(v=>{
    if(parseInt(v.cliRef)===i) return true;
    if(v.cliente&&v.cliente===c.nome) return true;
    // For venditori: also show visits to their immobili
    if((c.tipo==='venditore'||c.tipo==='entrambi') && immIdxOfClient.includes(parseInt(v.immRef))) return true;
    return false;
  });
  const totProvv=pratCli.reduce((s,p)=>{const prov=(parseFloat(p.qv)||0)+(parseFloat(p.qa)||0);return s+prov;},0);
  const totInc=pratCli.reduce((s,p)=>s+(parseFloat(p.inc)||0),0);
  const pipeSteps=['Contatto','Visita','Proposta','Contratto','Rogito'];
  const maxStep=visCli.length?1:0;
  const hasProp=pratCli.some(p=>p.stato==='proposta'||p.stato==='venduto');if(hasProp&&maxStep<2){}
  let pipeIdx=0;if(visCli.length)pipeIdx=1;if(pratCli.some(p=>['acquisito','trattativa'].includes(p.stato)))pipeIdx=2;if(pratCli.some(p=>p.stato==='proposta'))pipeIdx=3;if(pratCli.some(p=>p.stato==='venduto'))pipeIdx=4;
  // ---- dati anagrafici card (comune a tutti i tipi) ----
  const cardAnagrafica=`
    <div class="card">
      <div class="card-header"><span class="card-title"> Dati Anagrafici</span>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${c.tel?`<a href="https://wa.me/39${c.tel.replace(/[^0-9]/g,'')}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#25D366;color:white;border:none;font-size:0.78rem;padding:5px 11px;border-radius:7px;text-decoration:none;display:flex;align-items:center;gap:5px" title="Apri WhatsApp"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.866 9.866 0 001.51 5.26l.602.961-.999 3.648 3.736-.964zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg> WhatsApp</a>`:''}
          ${c.email?`<a href="mailto:${c.email}?subject=Le case dalla A allo Z.io — ${c.nome}" class="btn btn-sm" style="background:#2563EB;color:white;border:none;font-size:0.78rem;padding:5px 11px;border-radius:7px;text-decoration:none;display:flex;align-items:center;gap:5px" title="Invia Email">Email</a>`:''}
          ${c.tel?`<a href="tel:${c.tel}" class="btn btn-sm" style="background:#64748B;color:white;border:none;font-size:0.78rem;padding:5px 11px;border-radius:7px;text-decoration:none;display:flex;align-items:center;gap:5px" title="Chiama">Chiama</a>`:''}
          ${pratCli.some(p=>p.stato==='vendita'||p.stato==='venduto')?`<a href="https://wa.me/39${(c.tel||'').replace(/[^0-9]/g,'')}&text=${encodeURIComponent('Gentile '+c.nome+', grazie per aver scelto Le case dalla A allo Z.io! Le chiediamo gentilmente un breve feedback sul nostro servizio. Come valuta la sua esperienza? ⭐')}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#F59E0B;color:white;border:none;font-size:0.78rem;padding:5px 11px;border-radius:7px;text-decoration:none;display:flex;align-items:center;gap:5px">⭐ Feedback</a>`:''}
          <button class="btn btn-outline btn-sm" onclick="editCliente(${i})"> Modifica</button>
        </div>
      </div>
      <div class="card-body">
        <div class="grid-2" style="gap:10px">
          <div style="grid-column:1/-1;display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:4px">
            <div style="width:84px;height:84px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2.8rem;background:${c.sesso==='F'?'#FCE7F3':c.sesso==='M'?'#DBEAFE':'var(--bg3)'};border:3px solid ${c.sesso==='F'?'#F9A8D4':c.sesso==='M'?'#93C5FD':'var(--border)'};box-shadow:0 4px 16px rgba(0,0,0,0.10)">
              ${c.sesso==='M'?'':c.sesso==='F'?'':''}
            </div>
            <div>
              <div style="font-weight:800;font-size:1.2rem">${c.nome||'—'}</div>
              <div style="margin-top:4px;display:flex;gap:6px;align-items:center">${bStato(c.tipo)}${c.sesso?'<span style="font-size:0.78rem;color:var(--text3)">'+(c.sesso==='M'?'Maschio':'Femmina')+'</span>':''}</div>
            </div>
          </div>
          <div><div class="flabel">Nome</div><div style="font-weight:700;font-size:1.05rem">${c.nome||'—'}</div></div>
          <div><div class="flabel">Tipo</div>${bStato(c.tipo)}</div>
          <div><div class="flabel">Telefono</div><div>${c.tel?`<a href="tel:${c.tel}" style="color:var(--brand);font-weight:600">${c.tel}</a>`:'—'}</div></div>
          <div><div class="flabel">Email</div><div style="font-size:0.88rem">${c.email||'—'}</div></div>
          ${c.nascita?`<div style="grid-column:1/-1"><div class="flabel">Data di Nascita </div><div style="font-weight:600;display:flex;align-items:center;gap:10px">${fmtD(c.nascita)}${(()=>{const b=new Date(c.nascita+'T00:00:00');const t=new Date();const age=t.getFullYear()-b.getFullYear()-((t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))?1:0);const isBday=b.getMonth()===t.getMonth()&&b.getDate()===t.getDate();return '<span style="color:#6B7280;font-weight:400">('+age+' anni)</span>'+(isBday?'<span style="background:#FEF3C7;color:#92400E;padding:3px 10px;border-radius:20px;font-size:0.82rem;font-weight:700"> COMPLEANNO OGGI!</span>':'');})()}</div></div>`:''}
          <div><div class="flabel">Codice Fiscale</div><div style="font-size:0.88rem">${c.cf||'—'}</div></div>
          <div><div class="flabel">Città</div><div>${c.citta||'—'}</div></div>
          <div><div class="flabel">Fonte</div><span class="badge badge-gray">${c.fonte||'—'}</span></div>
          <div><div class="flabel">Operazione</div><div>${c.op||'—'}</div></div>
          ${c.budget?`<div><div class="flabel">Budget</div><div style="font-weight:700;color:var(--brand)">${fmtE(c.budget)}</div></div>`:''}
          ${c.note?`<div style="grid-column:1/-1"><div class="flabel">Note</div><div style="font-size:0.88rem;color:var(--text2)">${c.note}</div></div>`:''}
        </div>
      </div>
    </div>`;

  // ---- pipeline card ----
  const cardPipeline=`
    <div class="card">
      <div class="card-header"><span class="card-title"> Stato Rapporto</span>${c.tipo!=='acquirente'?``:''}</div>
      <div class="card-body">
        <div class="pipeline" style="margin-bottom:18px">
          ${pipeSteps.map((s,idx)=>`${idx>0?`<div class="pipe-line${idx<=pipeIdx?' done':''}"></div>`:''}
          <div class="pipe-step"><div class="pipe-dot${idx<pipeIdx?' done':idx===pipeIdx?' active':''}">${idx<pipeIdx?'':(idx+1)}</div><div class="pipe-label">${s}</div></div>`).join('')}
        </div>
        <div class="fin-row"><span>Visite effettuate</span><span class="fin-val">${visCli.length}</span></div>
        ${c.tipo!=='acquirente'?`
        <div class="fin-row"><span>Pratiche collegate</span><span class="fin-val">${pratCli.length}</span></div>
        <div class="fin-row"><span>Tot. Provvigioni</span><span class="fin-val">${fmtE(totProvv)}</span></div>
        <div class="fin-row"><span>Incassato</span><span class="fin-val g">${fmtE(totInc)}</span></div>
        <div class="fin-row"><span>Da incassare</span><span class="fin-val ${totProvv-totInc>0?'r':'g'}">${fmtE(totProvv-totInc)}</span></div>`:''}
      </div>
    </div>`;

  // ---- ACQUIRENTE: scheda dedicata ----
  if(c.tipo==='acquirente'){
    const riqCli=D.richieste.filter(r=>parseInt(r.cliRef)===i||(r.nome&&r.nome===c.nome));
    document.getElementById('scheda-cliente-body').innerHTML=`
      <div class="alert" style="background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;font-size:0.88rem;color:#1D4ED8">
        <span style="font-size:1.3rem"></span>
        <span><strong>${c.nome}</strong> è registrato come <strong>Acquirente</strong>. Può partecipare alle visite ed essere abbinato agli immobili tramite la sezione <strong>Richieste</strong>. La gestione immobili e pratiche è riservata ai Venditori.</span>
      </div>
      <div class="grid-2" style="margin-bottom:0">${cardAnagrafica}${cardPipeline}</div>
      <div class="card">
        <div class="card-header">
          <span class="card-title"> Richieste di Acquisto</span>
          <button class="btn btn-primary btn-sm" onclick="openRichiestaForClient(${i})">+ Nuova Richiesta</button>
        </div>
        <div class="card-body">
          ${riqCli.length?`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Incarico</th><th>Budget Min</th><th>Budget Max</th><th>Comune</th><th>Camere</th><th>Urgenza</th><th>Fonte</th><th></th></tr></thead><tbody>
          ${riqCli.map(r=>{const ri=D.richieste.indexOf(r);return`<tr>
            <td style="font-weight:600">${r.tipo||'—'}</td>
            <td><span class="badge badge-blue" style="font-size:0.68rem">${r.inc||'—'}</span></td>
            <td style="color:var(--brand)">${r.bmin?fmtE(r.bmin):'—'}</td>
            <td style="color:var(--brand);font-weight:700">${r.bmax?fmtE(r.bmax):'—'}</td>
            <td>${r.comune||'—'}</td>
            <td>${r.cam||'—'}</td>
            <td>${bUrg(r.urg)}</td>
            <td><span class="badge badge-gray" style="font-size:0.68rem">${r.fonte||'—'}</span></td>
            <td><div class="actions-col"><button class="icon-btn" onclick="openRichiesta(${ri})" title="Modifica"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="icon-btn" onclick="delRichiesta(${ri})" style="color:var(--red-l)" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button></div></td>
          </tr>`;}).join('')}
          </tbody></table></div>`
          :`<div class="empty-state" style="padding:20px"><div class="empty-icon"></div><p>Nessuna richiesta registrata.<br><small>Clicca <strong>+ Nuova Richiesta</strong> per aggiungere le preferenze di questo acquirente.</small></p></div>`}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title"> Visite Effettuate</span><button class="btn btn-primary btn-sm" onclick="openVisita()">+ Nuova Visita</button></div>
        <div class="card-body"><div class="table-wrap"><table><thead><tr><th>Data</th><th>Ora</th><th>Immobile</th><th>Visitatore</th><th>Tel.</th><th>Esito</th><th>Feedback</th><th>Note</th><th></th></tr></thead><tbody>${visCli.length?visCli.sort((a,b)=>(b.data||'').localeCompare(a.data||'')).map(v=>{if(typeof _visEnsureId==='function')_visEnsureId(v);const vid=(v.id||'').replace(/'/g,"\\'");return`<tr><td style="white-space:nowrap;font-weight:600">${fmtD(v.data)}</td><td>${v.ora||'—'}</td><td style="font-weight:600">${v.immTitolo||v.ref||'—'}</td><td>${v.cliente||'—'}</td><td>${v.tel?`<a href="tel:${v.tel}" style="color:var(--brand)">${v.tel}</a>`:'—'}</td><td>${bEsito(v.esito)}</td><td><span class="badge badge-gray" style="font-size:0.68rem">${v.feedback||'—'}</span></td><td class="note-cell">${v.note||'—'}</td><td><div class="actions-col"><button class="icon-btn" onclick="editVisita('${vid}')" title="Modifica"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="icon-btn" onclick="delVisita('${vid}')" style="color:var(--red-l)" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button></div></td></tr>`;}).join(''):'<tr><td colspan="9"><div class="empty-state" style="padding:14px"><p>Nessuna visita</p></div></td></tr>'}</tbody></table></div></div>
      </div>
      <div id="tl-host-cliente-${i}"></div>`;
    /* Monto la timeline audit dopo aver iniettato l'HTML */
    try{ _tlMount('cliente', i); }catch(_e){ }
    return;
  }

  // ---- VENDITORE / ENTRAMBI: scheda completa ----
  document.getElementById('scheda-cliente-body').innerHTML=`
    <div class="grid-2" style="margin-bottom:0">${cardAnagrafica}${cardPipeline}</div>
    <div class="card">
      <div class="card-header"><span class="card-title"> Immobili Collegati</span><button class="btn btn-primary btn-sm" onclick="openImmobileModalWithClient(${i})">+ Collega Immobile</button></div>
      <div class="card-body">${immClienti.length?'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">'+immClienti.map(im=>{const ri=D.immobili.indexOf(im);return`<div class="imm-card"><div style="cursor:pointer" onclick="openSchedaImmobile(${ri})">${immPhotoWithStato(im,ri,null)}</div><div class="imm-body"><div class="imm-price">${im.prezzo?fmtE(im.prezzo):'—'}</div><div style="font-size:0.78rem;color:var(--text3)">${im.tipo||''} · ${im.comune||''}</div>${bStato(im.stato)}<div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" onclick="openSchedaImmobile(${ri})"> Scheda</button><button class="btn btn-primary btn-sm" onclick="openPraticaImm(${ri})"> Pratica</button><button class="btn btn-sm" style="background:var(--red-pale);color:var(--red-l);border:1px solid #FECACA" onclick="delImmobileFromScheda(${ri})" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button></div></div></div>`;}).join('')+'</div>':'<div class="empty-state" style="padding:18px"><p>Nessun immobile collegato</p></div>'}</div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title"> Visite Effettuate</span><button class="btn btn-primary btn-sm" onclick="openVisita()">+ Nuova Visita</button></div>
      <div class="card-body"><div class="table-wrap"><table><thead><tr><th>Data</th><th>Ora</th><th>Immobile</th><th>Visitatore</th><th>Esito</th><th>Feedback</th><th>Note</th><th></th></tr></thead><tbody>${visCli.length?visCli.sort((a,b)=>(b.data||'').localeCompare(a.data||'')).map(v=>{if(typeof _visEnsureId==='function')_visEnsureId(v);const vid=(v.id||'').replace(/'/g,"\\'");return`<tr><td style="white-space:nowrap;font-weight:600">${fmtD(v.data)}</td><td>${v.ora||'—'}</td><td style="font-weight:600">${v.immTitolo||v.ref||'—'}</td><td style="color:var(--text2)">${v.cliente||'—'}</td><td>${bEsito(v.esito)}</td><td><span class="badge badge-gray" style="font-size:0.68rem">${v.feedback||'—'}</span></td><td class="note-cell">${v.note||'—'}</td><td><div class="actions-col"><button class="icon-btn" onclick="editVisita('${vid}')" title="Modifica"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="icon-btn" onclick="delVisita('${vid}')" style="color:var(--red-l)" title="Elimina"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button></div></td></tr>`;}).join(''):'<tr><td colspan="8"><div class="empty-state" style="padding:14px"><p>Nessuna visita</p></div></td></tr>'}</tbody></table></div></div>
    </div>

    ${renderNoteCRM(i,c)}
    <div id="tl-host-cliente-${i}"></div>`;
  /* Monto la timeline audit dopo aver iniettato l'HTML */
  try{ _tlMount('cliente', i); }catch(_e){ }
}

// ===== IMMOBILI =====
// ── STORICO PREZZI IMMOBILE — solo visualizzazione ──
let _spImmIdx=null;

// --- BRIDGE window ---
Object.assign(window, {
  openClienteModal, onTipoClienteChange, saveCliente, editCliente, delCliente,
  archiviaCliente, riattivaCliente, delCliPure, openSchedaCliente,
  renderClienti, renderSchedaCliente,
});

export { renderClienti, openSchedaCliente, saveCliente, editCliente, delCliente, openClienteModal };
