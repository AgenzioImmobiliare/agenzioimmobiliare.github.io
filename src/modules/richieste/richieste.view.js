// modules/richieste/richieste.view.js — vista DESKTOP del modulo Richieste.
//
// Estratto dal monolite (righe 23283-23346 e 23657-23928 dell'originale).
// Contiene: openRichiestaForClient, _richiestaDaVisita, gestione zone (riqZone*),
// riqFillFromClient, openRichiesta, saveRichiesta, delRichiesta, renderRichieste,
// saveRichiesta_goAbb.
//
// DIPENDENZE ESTERNE (ancora nel monolite, accesso via window durante la migrazione):
//   FUNZIONI globali: showToast, saveD, openModal, closeModal, renderAttivita,
//     renderSchedaCliente, updateBadges, go, renderAbb, computeMatches, fmtD,
//     getNum, setNum, parseCurrStr, enc, chk, today, num, _attEnsure, statCard,
//     openAttivita, attImmBuild, hasPermission (sistema permessi/ruoli, riga 30192).
//   VARIABILE globale: `curSection` (sezione attiva, riga 17470 del monolite).
//     ATTENZIONE: nel monolite è dichiarata con `let`, quindi NON è su window.
//     Perché il modulo la veda quando il monolite verrà caricato accanto, il
//     monolite deve cambiare `let curSection` → `var curSection` (modifica minima,
//     non distruttiva). In alternativa, in una fase successiva curSection migra
//     dentro core/state.js come stato di navigazione (è la sua sede naturale).
// Tutte le FUNZIONI sono globali nel monolite e si risolvono a runtime via window.
//
// Lo stato D è condiviso: state.js fa window.D = _D, quindi i riferimenti a `D`
// in questo codice puntano allo stesso oggetto. Importiamo state per il futuro
// (quando sostituiremo D.richieste.push + saveD con state.update).
import { state } from '../../core/state.js';

// Alias verso le globali del monolite, così il codice estratto resta invariato.
// Quando una dipendenza verrà migrata a modulo, basterà cambiare questa riga.
// `D` è un Proxy LIVE su window.D: legge/scrive sempre l'oggetto stato corrente,
// indipendentemente dall'ordine di caricamento monolite-vs-modulo. Il codice
// estratto resta invariato (continua a usare D.richieste, ecc.).
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function openRichiestaForClient(cliIdx, prefill){
  openRichiesta();
  // Pre-fill client
  const sel=document.getElementById('riq-cli-ref');
  if(sel) sel.value=cliIdx;
  // Fill nome/tel from cliente
  if(D.clienti[cliIdx]){
    const cl=D.clienti[cliIdx];
    const nome=document.getElementById('riq-nome');
    const tel=document.getElementById('riq-tel');
    const email=document.getElementById('riq-email');
    if(nome&&!nome.value) nome.value=cl.nome||'';
    if(tel&&!tel.value) tel.value=cl.tel||'';
    if(email&&!email.value) email.value=cl.email||'';
    // Pre-fill budget from cliente
    const bmin=document.getElementById('riq-bmin');
    if(bmin&&cl.budget) setNum('riq-bmin', parseFloat(cl.budget)*0.8);
    const bmax=document.getElementById('riq-bmax');
    if(bmax&&cl.budget) setNum('riq-bmax', parseFloat(cl.budget));
  }
  // Pre-fill preferenze dalla visita (tipo immobile, comune, note origine)
  if(prefill){
    if(prefill.nome){ var nn=document.getElementById('riq-nome'); if(nn&&!nn.value) nn.value=prefill.nome; }
    if(prefill.tel){ var tt=document.getElementById('riq-tel'); if(tt&&!tt.value) tt.value=prefill.tel; }
    if(prefill.tipo){ var tp=document.getElementById('riq-tipo'); if(tp){ try{ tp.value=prefill.tipo; }catch(_){} } }
    if(prefill.comune){ var cm=document.getElementById('riq-comune'); if(cm&&!cm.value) cm.value=prefill.comune; }
    if(prefill.note){ var no=document.getElementById('riq-note'); if(no&&!no.value) no.value=prefill.note; }
    _riqApplicaProfilo(prefill.prof);
  }
}
/* Scrive nel modulo i campi che vengono dal profilo. I campi già compilati
   non vengono toccati, tranne budget e urgenza che il profilo conosce meglio. */
function _riqApplicaProfilo(P){
  if(!P) return;
  try{
    if(P.bmax!==undefined && typeof setNum==='function'){ setNum('riq-bmax', P.bmax); setNum('riq-bmin', P.bmin); }
    if(P.mutuo){ var m=document.getElementById('riq-mutuo'); if(m) m.value=P.mutuo; }
    if(P.daVendere){ var dv=document.getElementById('riq-da-vendere'); if(dv) dv.value=P.daVendere; }
    if(P.urg){ var u=document.getElementById('riq-urg'); if(u) u.value=P.urg; }
  }catch(e){ console.warn('[Richiesta] profilo non applicato:', e); }
}

/* Apre il modale Richiesta precompilato a partire da una visita con esito
   negativo. Se il cliente non è in rubrica (cliRef vuoto), apre comunque il
   modale con nome/tel della visita così l'utente può creare la richiesta. */
/* [26 ago 2026] Traduce il profilo acquirente raccolto durante la visita
   (dal telefono) nei campi del modulo Richiesta. Non salva niente: riempie
   soltanto, poi la Richiesta la controlli e la salvi tu dal PC come sempre. */
function _riqDaProfilo(P){
  if(!P || typeof P!=='object') return null;
  var out = {};
  /* Budget: quello dichiarato diventa il tetto, il minimo si stima all'80%.
     È solo un punto di partenza da correggere a mano. */
  var b = parseFloat(String(P.budget||'').replace(',','.'));
  if(!isNaN(b) && b>0){ out.bmax = b; out.bmin = Math.round(b*0.8); }
  /* Come paga → "Mutuo necessario" */
  if(P.pagamento==='contanti') out.mutuo = 'no';
  else if(P.pagamento==='mutuo' || P.pagamento==='misto'){
    out.mutuo = (P.mutuo==='deliberato') ? 'pre-approvato' : 'si';
  }
  if(P.vendePrima==='si') out.daVendere = 'si';
  /* Tempi → urgenza */
  if(P.tempi==='subito') out.urg='alta';
  else if(P.tempi==='3mesi') out.urg='alta';
  else if(P.tempi==='oltre') out.urg='bassa';
  else if(P.tempi==='guarda') out.urg='bassa';
  /* Righe di testo per le note, in italiano leggibile */
  var L = {
    pagamento:{contanti:'Paga in contanti',mutuo:'Acquista con mutuo',misto:'Mutuo parziale',dacapire:'Modalità di pagamento da capire'},
    mutuo:{deliberato:'mutuo già deliberato',avviata:'pratica di mutuo avviata',nonchiesto:'mutuo non ancora richiesto'},
    tempi:{subito:'vuole comprare subito','3mesi':'entro 3 mesi',oltre:'oltre 3 mesi',guarda:'per ora sta guardando'},
    vendePrima:{si:'deve vendere un immobile prima',no:'non ha immobili da vendere'}
  };
  var righe=[];
  if(P.pagamento && L.pagamento[P.pagamento]) righe.push(L.pagamento[P.pagamento]);
  if(P.mutuo && L.mutuo[P.mutuo]) righe.push(L.mutuo[P.mutuo]);
  if(P.tempi && L.tempi[P.tempi]) righe.push(L.tempi[P.tempi]);
  if(P.vendePrima && L.vendePrima[P.vendePrima]) righe.push(L.vendePrima[P.vendePrima]);
  if(P.prossimo) righe.push('prossimo passo: '+P.prossimo+(P.prossimoData?' entro il '+P.prossimoData.split('-').reverse().join('/'):''));
  if(P.note) righe.push(P.note);
  out.testo = righe.length ? righe.join('. ')+'.' : '';
  return out;
}
function _richiestaDaVisita(v){
  var _P = _riqDaProfilo(v && v.profiloAcq);
  var prefill = {
    nome: v.cliente||'',
    tel: v.tel||'',
    tipo: (D.immobili[v.immRef]||{}).tipo || '',
    comune: (D.immobili[v.immRef]||{}).comune || '',
    note: (_P && _P.testo ? _P.testo+'\n\n' : '')
        + 'Rilevato durante la visita'+(v.esito?' con esito "'+v.esito+'"':'')+' su '+(v.immTitolo||v.ref||'immobile')
        + (v.data?(' del '+v.data.split('-').reverse().join('/')):'')+'.',
    prof: _P
  };
  var cliIdx = (v.cliRef!=='' && v.cliRef!==undefined && v.cliRef!==null) ? parseInt(v.cliRef) : null;
  if(cliIdx!==null && D.clienti[cliIdx]){
    openRichiestaForClient(cliIdx, prefill);
  } else {
    // nessun cliente in rubrica: apri vuoto e precompila i campi liberi
    openRichiesta();
    setTimeout(function(){
      var nn=document.getElementById('riq-nome'); if(nn) nn.value=prefill.nome;
      var tt=document.getElementById('riq-tel'); if(tt) tt.value=prefill.tel;
      var tp=document.getElementById('riq-tipo'); if(tp&&prefill.tipo){ try{ tp.value=prefill.tipo; }catch(_){} }
      var cm=document.getElementById('riq-comune'); if(cm) cm.value=prefill.comune;
      var no=document.getElementById('riq-note'); if(no) no.value=prefill.note;
      _riqApplicaProfilo(prefill.prof);
    }, 60);
  }
}

// ── Chip-input Zone Richiesta ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
// GESTIONE ATTIVITÀ
// ══════════════════════════════════════════════════════════════════


function riqZoneRender(){
  var hidden = document.getElementById('riq-zone');
  var container = document.getElementById('riq-zone-chips');
  if(!hidden || !container) return;
  var zones = hidden.value ? hidden.value.split(',').map(function(z){ return z.trim(); }).filter(Boolean) : [];
  container.innerHTML = zones.map(function(z, i){
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:#EFF6FF;color:#1D4ED8;border:1.5px solid #BFDBFE;border-radius:20px;padding:3px 10px;font-size:0.78rem;font-weight:700">'
      + z
      + '<button type="button" onclick="riqZoneRemove('+i+')" style="background:none;border:none;cursor:pointer;color:#2563EB;padding:0;line-height:1;font-size:1rem;margin-left:2px">&times;</button>'
      + '</span>';
  }).join('');
}
function riqZoneAdd(val){
  val = val.trim().replace(/,/g,'').trim();
  if(!val) return;
  var hidden = document.getElementById('riq-zone');
  if(!hidden) return;
  var zones = hidden.value ? hidden.value.split(',').map(function(z){ return z.trim(); }).filter(Boolean) : [];
  if(zones.indexOf(val) === -1) zones.push(val);
  hidden.value = zones.join(',');
  riqZoneRender();
  var inp = document.getElementById('riq-zone-input');
  if(inp) inp.value = '';
}
function riqZoneRemove(idx){
  var hidden = document.getElementById('riq-zone');
  if(!hidden) return;
  var zones = hidden.value ? hidden.value.split(',').map(function(z){ return z.trim(); }).filter(Boolean) : [];
  zones.splice(idx, 1);
  hidden.value = zones.join(',');
  riqZoneRender();
}
function riqZoneKeydown(e){
  if(e.key === 'Enter' || e.key === ','){
    e.preventDefault();
    riqZoneAdd(e.target.value);
  } else if(e.key === 'Backspace' && !e.target.value){
    // Rimuovi ultimo chip con backspace se input vuoto
    var hidden = document.getElementById('riq-zone');
    if(!hidden) return;
    var zones = hidden.value ? hidden.value.split(',').map(function(z){ return z.trim(); }).filter(Boolean) : [];
    if(zones.length){ zones.pop(); hidden.value = zones.join(','); riqZoneRender(); }
  }
}
function riqZoneInput(inp){
  // Aggiungi chip se viene incollato testo con virgole
  if(inp.value.includes(',')){
    var parts = inp.value.split(',');
    parts.forEach(function(p){ riqZoneAdd(p); });
    inp.value = '';
  }
}
function riqZoneClear(){
  var hidden = document.getElementById('riq-zone');
  var inp = document.getElementById('riq-zone-input');
  if(hidden) hidden.value = '';
  if(inp) inp.value = '';
  riqZoneRender();
}
function riqZoneSet(val){
  var hidden = document.getElementById('riq-zone');
  if(hidden) hidden.value = val || '';
  var inp = document.getElementById('riq-zone-input');
  if(inp) inp.value = '';
  riqZoneRender();
}
// ─────────────────────────────────────────────────────────────────────────────


function riqFillFromClient(cliRef){
  try{
    if(!cliRef || cliRef === '' || typeof D==='undefined') return;
    var idx = parseInt(cliRef);
    if(isNaN(idx) || !D.clienti || !D.clienti[idx]) return;
    var cl = D.clienti[idx];
    var s = function(id, val){ var el=document.getElementById(id); if(el && !el.value) el.value=val||''; };
    s('riq-nome', cl.nome); s('riq-tel', cl.tel); s('riq-email', cl.email);
    if(cl.budget){ var b=parseFloat(cl.budget)||0; if(b>0){ setNum('riq-bmin',Math.round(b*0.8)); setNum('riq-bmax',b); } }
  }catch(e){}
}

/* Risolve un identificativo richiesta in un indice ATTUALE dell'array.
   Accetta sia un id stabile (stringa) sia un indice numerico (per
   compatibilità con eventuali altre chiamate esistenti). */
function _riqResolveIdx(idOrIdx){
  if(typeof idOrIdx==='string') return D.richieste.findIndex(function(x){return x&&x.id===idOrIdx;});
  return idOrIdx;
}

function openRichiesta(idxOrId){
  const idx=idxOrId!==undefined?_riqResolveIdx(idxOrId):undefined;
  if(idxOrId!==undefined && (idx===undefined || idx<0)){
    if(typeof showToast==='function') showToast('Richiesta non trovata (forse aggiornata altrove). Aggiorno la lista...','','#DC2626');
    try{ renderRichieste(); }catch(e){}
    return;
  }
  D.editIdx=null; D.editType=null; D.editRichiestaId=null;

  // Reset manuale di tutti i campi (evita problemi con clearModal)
  ['riq-nome','riq-tel','riq-email','riq-comune','riq-note'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  riqZoneClear(); // reset chip-input zone
  ['riq-bmin','riq-bmax','riq-mq','riq-mqmax'].forEach(function(id){
    var el=document.getElementById(id); if(el){el.value=''; el.removeAttribute('data-raw');}
  });
  ['riq-cli-ref','riq-urg','riq-fonte','riq-tipo','riq-inc','riq-stato-imm',
   'riq-piano','riq-esposizione','riq-cam','riq-bagni','riq-mare','riq-servizi',
   'riq-riscald','riq-classe-en','riq-mutuo','riq-da-vendere','riq-data'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.selectedIndex=0;
  });
  ['riq-box','riq-terrazzo','riq-giardino','riq-ascensore','riq-piscina','riq-portineria'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.checked=false;
  });

  // Data di oggi
  var dataEl=document.getElementById('riq-data');
  if(dataEl) dataEl.value=today();

  // Titolo
  var title=document.getElementById('mt-riq');
  if(title) title.textContent = idx!==undefined ? 'Modifica Richiesta' : 'Nuova Richiesta Acquisto';

  // Popola select clienti (senza onchange che triggera riqFillFromClient)
  var sel=document.getElementById('riq-cli-ref');
  if(sel){
    var sorted=(D.clienti||[]).map(function(cl,i){return{cl:cl,i:i};}).sort(function(a,b){return(a.cl.nome||'').localeCompare(b.cl.nome||'','it');});
    sel.innerHTML='<option value="">— Nuovo cliente —</option>'+sorted.map(function(x){return'<option value="'+x.i+'">'+( x.cl.nome||'Cliente '+(x.i+1))+'</option>';}).join('');
  }

  // Se modifica: ripopola i campi
  if(idx!==undefined){
    if(!D.richieste[idx].id) D.richieste[idx].id=(typeof genUUID==='function')?genUUID():('riq_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
    D.editIdx=idx; D.editType='richiesta'; D.editRichiestaId=D.richieste[idx].id;
    var r=D.richieste[idx];
    var g=function(id,val){var el=document.getElementById(id);if(el)el.value=val||'';};
    g('riq-cli-ref', r.cliRef); g('riq-nome',r.nome); g('riq-tel',r.tel); g('riq-email',r.email);
    riqZoneSet(r.zone);
    g('riq-urg',r.urg||'media'); g('riq-fonte',r.fonte); g('riq-tipo',r.tipo); g('riq-inc',r.inc);
    g('riq-stato-imm',r.statoImm); g('riq-piano',r.piano); g('riq-esposizione',r.esposizione);
    g('riq-comune',r.comune); g('riq-cam',r.cam); g('riq-bagni',r.bagni); // riq-zone gestito da riqZoneSet
    g('riq-mare',r.mare); g('riq-servizi',r.servizi); g('riq-riscald',r.riscald);
    g('riq-classe-en',r.classeEn); g('riq-mutuo',r.mutuo); g('riq-da-vendere',r.daVendere);
    g('riq-note',r.note); g('riq-data',r.data);
    setNum('riq-bmin', parseCurrStr(r.bmin||'')); setNum('riq-bmax', parseCurrStr(r.bmax||''));
    var mqEl=document.getElementById('riq-mq'); if(mqEl) mqEl.value=r.mq||'';
    var mqmEl=document.getElementById('riq-mqmax'); if(mqmEl) mqmEl.value=r.mqmax||'';
    ['box','terrazzo','giardino','ascensore','piscina','portineria'].forEach(function(k){
      var el=document.getElementById('riq-'+k); if(el) el.checked=!!(r[k]);
    });
  }

  openModal('modal-richiesta');
}
function saveRichiesta(goAbb){
  try{
    /* Anti-drift: ri-risolvi l'indice reale della richiesta in modifica
       appena prima di leggere/scrivere D.richieste. */
    if(D.editType==='richiesta' && D.editRichiestaId){
      const _freshIdx=D.richieste.findIndex(x=>x&&x.id===D.editRichiestaId);
      if(_freshIdx<0){
        alert('Questa richiesta non esiste più (probabilmente cancellata o aggiornata da un altro dispositivo). La lista viene aggiornata.');
        D.editIdx=null; D.editType=null; D.editRichiestaId=null;
        try{ closeModal('modal-richiesta'); }catch(_e){}
        renderRichieste();
        return;
      }
      D.editIdx=_freshIdx;
    }
    const _riqEraNuova = !(D.editIdx!==null && D.editType==='richiesta');
    const g = function(id){ const el=document.getElementById(id); return el?el.value:''; };
    const chk = function(id){ const el=document.getElementById(id); return el?el.checked:false; };
    const cliRef = g('riq-cli-ref');
    let nome = g('riq-nome').trim();
    let tel  = g('riq-tel').trim();
    if(!nome){ showToast('Inserisci il nome del cliente','','#DC2626'); return; }
    if(cliRef!=='' && D.clienti[parseInt(cliRef)]){
      const c = D.clienti[parseInt(cliRef)];
      nome = nome || c.nome || '';
      tel  = tel  || c.tel  || '';
    }
    const r = {
      cliRef      : cliRef,
      nome        : nome,
      tel         : tel,
      email       : g('riq-email'),
      urg         : g('riq-urg') || 'media',
      fonte       : g('riq-fonte'),
      tipo        : g('riq-tipo'),
      inc         : g('riq-inc'),
      statoImm    : g('riq-stato-imm'),
      piano       : g('riq-piano'),
      esposizione : g('riq-esposizione'),
      bmin        : getNum('riq-bmin'),
      bmax        : getNum('riq-bmax'),
      mq          : g('riq-mq'),
      mqmax       : g('riq-mqmax'),
      cam         : g('riq-cam'),
      bagni       : g('riq-bagni'),
      comune      : g('riq-comune'),
      zone        : g('riq-zone'),
      mare        : g('riq-mare'),
      servizi     : g('riq-servizi'),
      riscald     : g('riq-riscald'),
      classeEn    : g('riq-classe-en'),
      mutuo       : g('riq-mutuo'),
      daVendere   : g('riq-da-vendere'),
      box         : chk('riq-box'),
      terrazzo    : chk('riq-terrazzo'),
      giardino    : chk('riq-giardino'),
      ascensore   : chk('riq-ascensore'),
      piscina     : chk('riq-piscina'),
      portineria  : chk('riq-portineria'),
      note        : g('riq-note'),
      data        : g('riq-data') || today()
    };
    if(D.editIdx!==null && D.editType==='richiesta'){
      r.id = D.editRichiestaId || D.richieste[D.editIdx].id || ((typeof genUUID==='function')?genUUID():('riq_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)));
      D.richieste[D.editIdx]=r;
    } else {
      r.id = (typeof genUUID==='function')?genUUID():('riq_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
      D.richieste.push(r);
    }
    const _riqSavedIdx = D.richieste.indexOf(r);
    saveD();
    closeModal('modal-richiesta');
    if(goAbb){
      go('abbinamento'); renderAbb();
    } else if(curSection==='scheda-cliente' && D.schedaCliIdx!==null){
      renderSchedaCliente(D.schedaCliIdx);
    } else {
      renderRichieste();
    }
    updateBadges();
    showToast('Richiesta salvata','','#15803D');
    /* ─── MATCH PROATTIVO: solo su richiesta NUOVA, mostra gli immobili
       compatibili già in portafoglio (direzione gemella di quello che
       parte da un immobile nuovo) ─── */
    try{
      if(_riqEraNuova && typeof window.mostraMatchProattivoRichiesta === 'function'){
        setTimeout(function(){ window.mostraMatchProattivoRichiesta(_riqSavedIdx, true); }, 500);
      }
    }catch(_mp){ console.warn('[MatchProattivo] KO:', _mp); }
  }catch(err){ alert('Errore salvataggio richiesta: '+err.message); console.error(err); }
}
function delRichiesta(idxOrId){
  if(!hasPermission('immobili.delete')){ if(typeof showToast==='function') showToast('Eliminazione non consentita per il tuo ruolo','','#DC2626'); return; }
  const i=_riqResolveIdx(idxOrId);
  if(i<0){
    if(typeof showToast==='function') showToast('Richiesta non trovata (forse già cancellata altrove). Aggiorno la lista...','','#DC2626');
    try{ renderRichieste(); }catch(e){}
    return;
  }
  if(confirm('Eliminare questa richiesta?')){
    const iNow=_riqResolveIdx(idxOrId);
    if(iNow<0) return;
    D.richieste.splice(iNow,1);
    saveD();
    if(curSection==='scheda-cliente' && D.schedaCliIdx!==null){
      renderSchedaCliente(D.schedaCliIdx);
    } else {
      renderRichieste();
    }
    updateBadges();
  }
}
function renderRichieste(){
  /* Spegne il badge rosso "nuove" quando l'utente apre la sezione.
     Le richieste restano comunque riconoscibili dalla colonna FONTE
     ("Feedback visita"), quindi non si perde l'informazione. */
  try{
    var _hadNuove = D.richieste.some(function(r){ return r && r.nuova; });
    if(_hadNuove){
      D.richieste.forEach(function(r){ if(r && r.nuova) r.nuova=false; });
      if(typeof saveD==='function') saveD();
      if(typeof updateBadges==='function') updateBadges();
    }
  }catch(e){}
  const q    = (document.getElementById('f-riq-q')?.value||'').toLowerCase();
  const tipo = document.getElementById('f-riq-tipo')?.value||'';
  const urg  = document.getElementById('f-riq-urg')?.value||'';
  const f = D.richieste.filter(function(r){
    const t = [r.nome,r.comune,r.tipo,r.zone,r.note,r.inc].join(' ').toLowerCase();
    return (!q||t.includes(q)) && (!tipo||(r.tipo||'').includes(tipo)) && (!urg||r.urg===urg);
  });
  const tbody = document.getElementById('riq-tbody');
  if(!tbody) return;

  // Badge dotazioni compatto
  function dotBadge(r){
    var dot=[];
    if(r.box)       dot.push('<span title="Box/Garage" style="font-size:0.65rem;background:#EFF6FF;color:#1D4ED8;padding:1px 5px;border-radius:4px;border:1px solid #BFDBFE">Box</span>');
    if(r.terrazzo)  dot.push('<span title="Terrazzo" style="font-size:0.65rem;background:#F0FDF4;color:#15803D;padding:1px 5px;border-radius:4px;border:1px solid #86EFAC">Terr.</span>');
    if(r.giardino)  dot.push('<span title="Giardino" style="font-size:0.65rem;background:#F0FDF4;color:#15803D;padding:1px 5px;border-radius:4px;border:1px solid #86EFAC">Giar.</span>');
    if(r.ascensore) dot.push('<span title="Ascensore" style="font-size:0.65rem;background:#FEF3C7;color:#92400E;padding:1px 5px;border-radius:4px;border:1px solid #FCD34D">Asc.</span>');
    if(r.piscina)   dot.push('<span title="Piscina" style="font-size:0.65rem;background:#EFF6FF;color:#0369A1;padding:1px 5px;border-radius:4px;border:1px solid #7DD3FC">Pisc.</span>');
    return dot.join(' ');
  }

  const svgEdit = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const svgDel  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>';
  const svgAbb  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

  tbody.innerHTML = f.length ? f.map(function(r){
    const ri  = D.richieste.indexOf(r);
    if(!r.id) r.id=(typeof genUUID==='function')?genUUID():('riq_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
    const rid = r.id.replace(/'/g,"\\'");
    const bud = (r.bmin||r.bmax)
      ? (r.bmin?'€'+Number(r.bmin).toLocaleString('it-IT'):'') + (r.bmin&&r.bmax?' – ':'') + (r.bmax?'€'+Number(r.bmax).toLocaleString('it-IT'):'')
      : '—';
    const mq  = (r.mq||r.mqmax) ? (r.mq||'')+(r.mqmax?' – '+r.mqmax:'')+'m²' : '—';
    const cam = r.cam ? r.cam+(r.bagni?' / '+r.bagni+' b':'') : '—';
    return '<tr>'
      +'<td style="font-weight:700">'+( r.nome||'—')+'</td>'
      +'<td>'+(r.tel?'<a href="tel:'+r.tel+'" style="color:var(--brand)">'+r.tel+'</a>':'—')+'</td>'
      +'<td><span style="font-size:0.78rem">'+( r.tipo||'—')+'</span></td>'
      +'<td style="font-weight:700;color:var(--brand);white-space:nowrap">'+bud+'</td>'
      +'<td>'+( r.comune||'—')+(r.zone?'<div style="font-size:0.68rem;color:var(--text3)">'+r.zone+'</div>':'')+'</td>'
      +'<td style="white-space:nowrap">'+mq+'</td>'
      +'<td style="white-space:nowrap">'+cam+'</td>'
      +'<td>'+dotBadge(r)+'</td>'
      +'<td>'+bUrg(r.urg)+'</td>'
      +'<td><span class="badge badge-gray" style="font-size:0.68rem">'+( r.fonte||'—')+'</span></td>'
      +'<td style="font-size:0.8rem">'+fmtD(r.data)+'</td>'
      +'<td><div class="actions-col" style="gap:4px">'
        +'<button class="icon-btn" onclick="openRichiesta('+"'"+rid+"'"+')" title="Modifica">'+svgEdit+'</button>'
        +'<button class="icon-btn" onclick="saveRichiesta_goAbb('+"'"+rid+"'"+')" title="Vai ad abbinamento" style="color:#2563EB">'+svgAbb+'</button>'
        +'<button class="icon-btn" onclick="delRichiesta('+"'"+rid+"'"+')" style="color:var(--red-l)" title="Elimina">'+svgDel+'</button>'
      +'</div></td>'
    +'</tr>';
  }).join('') : '<tr><td colspan="12"><div class="empty-state"><div class="empty-icon"></div><p>Nessuna richiesta</p></div></td></tr>';
}

function saveRichiesta_goAbb(ri){
  go('abbinamento'); renderAbb();
}

// ─── BRIDGE: espongo le funzioni su window ───────────────────────────────────
// Gli onclick inline negli HTML interpolati e il router del monolite chiamano
// queste funzioni da window. Restano esposte finché non migriamo i chiamanti.
Object.assign(window, {
  _riqDaProfilo, _riqApplicaProfilo,
  openRichiestaForClient, _richiestaDaVisita, riqZoneRender, riqZoneAdd,
  riqZoneRemove, riqZoneKeydown, riqZoneInput, riqZoneClear, riqZoneSet,
  riqFillFromClient, openRichiesta, saveRichiesta, delRichiesta,
  renderRichieste, saveRichiesta_goAbb,
});

export {
  openRichiesta, saveRichiesta, delRichiesta, renderRichieste,
  openRichiestaForClient,
};
