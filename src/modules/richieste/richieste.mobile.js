// modules/richieste/richieste.mobile.js — vista MOBILE del modulo Richieste.
//
// Estratto dal monolite (righe 53007-53220 dell'originale).
// Contiene: mobRenderRichieste, mobOpenRichiestaForm, _mobRiqCliChange,
// mobSaveRichiesta, mobDelRichiesta.
//
// DIPENDENZE ESTERNE (helper mobile condivisi, restano nel monolite via window):
//   _mobEsc, _mobFmtCur, mobToast, mobSheetOpen, mobSheetClose,
//   _mobSearchQ, _mobUrgColors, renderRichieste, saveD.
// Lo stato D è condiviso tramite window.D (vedi state.js).
import { state } from '../../core/state.js';

// `D` è un Proxy LIVE su window.D: legge/scrive sempre l'oggetto stato corrente,
// indipendentemente dall'ordine di caricamento monolite-vs-modulo. Il codice
// estratto resta invariato (continua a usare D.richieste, ecc.).
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

// Stato locale del modulo: indice della richiesta in modifica sul mobile.
// Nel monolite era una global (let _mobEditingRichiestaIdx a riga 52993), ma è
// usata SOLO dalle funzioni Richieste, quindi è stato locale del modulo.
let _mobEditingRichiestaIdx = null;

function mobRenderRichieste(){
  var c = document.getElementById('mob-content');
  if(!c || typeof D === 'undefined') return;

  var lista = (D.richieste||[]).map(function(r,i){ return {r:r, idx:i}; })
    .filter(function(o){
      var hay = ((o.r.nome||'') + ' ' + (o.r.tel||'') + ' ' + (o.r.comune||'') + ' ' + (o.r.zone||'') + ' ' + (o.r.tipo||'') + ' ' + (o.r.note||'')).toLowerCase();
      return !_mobSearchQ || hay.indexOf(_mobSearchQ.toLowerCase()) >= 0;
    })
    .sort(function(a,b){
      /* Ordina per urgenza poi data desc */
      var rank = {'alta':0,'media':1,'bassa':2};
      var ra = rank[a.r.urg]||1, rb = rank[b.r.urg]||1;
      if(ra !== rb) return ra - rb;
      return (b.r.data||'').localeCompare(a.r.data||'');
    });

  var html = '<div class="mob-section-title">Richieste <span class="mob-section-title-cnt">'+lista.length+'</span></div>';

  if(!lista.length){
    html += '<div class="mob-empty"><div class="mob-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>'
         + (_mobSearchQ ? 'Nessuna richiesta trovata.' : 'Nessuna richiesta ancora.<br>Premi <strong>+</strong> per aggiungerne una.')
         + '</div>';
  } else {
    lista.forEach(function(o){
      var r = o.r;
      var uc = _mobUrgColors(r.urg);
      /* Riga budget */
      var budget = '';
      if(r.bmin && r.bmax)      budget = '€ '+_mobFmtCur(r.bmin)+' – '+_mobFmtCur(r.bmax);
      else if(r.bmax)           budget = 'fino a € '+_mobFmtCur(r.bmax);
      else if(r.bmin)           budget = 'da € '+_mobFmtCur(r.bmin);
      /* Riga "cosa cerca": tipo + comune + zona */
      var cosa = [];
      if(r.tipo)   cosa.push(r.tipo);
      if(r.comune) cosa.push(r.comune);
      if(r.zone)   cosa.push(r.zone);
      var incTag = '';
      if(r.inc === 'acquisto') incTag = '<span class="mob-tag mob-tag-blue">Acquisto</span>';
      else if(r.inc === 'affitto') incTag = '<span class="mob-tag mob-tag-gold">Affitto</span>';
      var budgetTag = budget ? '<span class="mob-tag mob-tag-green">'+budget+'</span>' : '';

      html += '<div class="mob-card" onclick="mobOpenRichiestaForm('+o.idx+')">'
        + '<div class="mob-card-row">'
        +   '<div class="mob-avatar" style="background:'+uc.bg+';color:'+uc.col+';display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>'
        +   '<div class="mob-card-body">'
        +     '<div class="mob-card-title">'+_mobEsc(r.nome||'(senza nome)')+'</div>'
        +     (cosa.length ? '<div class="mob-card-sub">'+_mobEsc(cosa.join(' · '))+'</div>' : '<div class="mob-card-sub" style="font-style:italic;color:#94A3B8;">Senza dettagli</div>')
        +     '<div class="mob-card-tags">'
        +       incTag + budgetTag
        +       '<span class="mob-tag" style="background:'+uc.bg+';color:'+uc.col+';">'+(r.urg||'media')+'</span>'
        +     '</div>'
        +   '</div>'
        + '</div>'
        + '</div>';
    });
  }
  c.innerHTML = html;
}

/* FORM RICHIESTA */
function mobOpenRichiestaForm(rIdx, preCliIdx){
  _mobEditingRichiestaIdx = (rIdx !== null && rIdx !== undefined) ? rIdx : null;
  var r = (_mobEditingRichiestaIdx !== null) ? D.richieste[_mobEditingRichiestaIdx] : null;
  document.getElementById('mob-sheet-richiesta-title').textContent = r ? 'Modifica richiesta' : 'Nuova richiesta';

  var dCli    = r ? r.cliRef : (preCliIdx !== null && preCliIdx !== undefined ? preCliIdx : '');
  var dNome   = r ? r.nome : '';
  var dTel    = r ? r.tel : '';
  var dEmail  = r ? r.email : '';
  var dUrg    = r ? (r.urg||'media') : 'media';
  var dFonte  = r ? r.fonte : '';
  var dTipo   = r ? r.tipo : '';
  var dInc    = r ? r.inc : 'acquisto';
  var dBmin   = r ? r.bmin : '';
  var dBmax   = r ? r.bmax : '';
  var dComune = r ? r.comune : '';
  var dZone   = r ? r.zone : '';
  var dMq     = r ? r.mq : '';
  var dCam    = r ? r.cam : '';
  var dMare   = r ? r.mare : '';
  var dNote   = r ? r.note : '';

  var cliOpts = '<option value="">— Senza cliente in rubrica —</option>' +
    (D.clienti||[]).map(function(cl,i){ return {cl:cl, i:i}; })
    .filter(function(o){ return !o.cl.archiviato; })
    .sort(function(a,b){ return (a.cl.nome||'').localeCompare(b.cl.nome||'','it'); })
    .map(function(o){
      return '<option value="'+o.i+'"'+(String(dCli)===String(o.i)?' selected':'')+'>'+_mobEsc(o.cl.nome||'(senza nome)')+'</option>';
    }).join('');

  var tipoOpts = _MOB_TIPI_IMM.map(function(t){
    var lbl = t ? t.charAt(0).toUpperCase()+t.slice(1) : '— Qualsiasi —';
    return '<option value="'+t+'"'+(dTipo===t?' selected':'')+'>'+lbl+'</option>';
  }).join('');
  var incOpts = _MOB_INC_RIQ.map(function(p){
    return '<option value="'+p[0]+'"'+(dInc===p[0]?' selected':'')+'>'+p[1]+'</option>';
  }).join('');
  var urgOpts = _MOB_URG.map(function(p){
    return '<option value="'+p[0]+'"'+(dUrg===p[0]?' selected':'')+'>'+p[1]+'</option>';
  }).join('');
  var mareOpts = ['','no','vicino','vista','fronte'].map(function(t){
    var lbl = t ? (t.charAt(0).toUpperCase()+t.slice(1)) : '— Indifferente —';
    return '<option value="'+t+'"'+(dMare===t?' selected':'')+'>'+lbl+'</option>';
  }).join('');

  var body = document.getElementById('mob-sheet-richiesta-body');
  body.innerHTML = ''
    /* Cliente */
    + '<div class="mob-field">'
    +   '<label class="mob-field-lbl">Cliente (rubrica)</label>'
    +   '<select class="mob-select" id="mob-riq-cli" onchange="_mobRiqCliChange()">'+cliOpts+'</select>'
    + '</div>'
    + '<div class="mob-field"><label class="mob-field-lbl">Nome <span class="req">*</span></label><input class="mob-input" type="text" id="mob-riq-nome" value="'+_mobEsc(dNome)+'" placeholder="Anche se non in rubrica"></div>'
    + '<div class="mob-row-2">'
    +   '<div class="mob-field"><label class="mob-field-lbl">Telefono</label><input class="mob-input" type="tel" id="mob-riq-tel" value="'+_mobEsc(dTel)+'"></div>'
    +   '<div class="mob-field"><label class="mob-field-lbl">Email</label><input class="mob-input" type="email" id="mob-riq-email" value="'+_mobEsc(dEmail)+'"></div>'
    + '</div>'
    + '<div class="mob-row-2">'
    +   '<div class="mob-field"><label class="mob-field-lbl">Urgenza</label><select class="mob-select" id="mob-riq-urg">'+urgOpts+'</select></div>'
    +   '<div class="mob-field"><label class="mob-field-lbl">Fonte</label><input class="mob-input" type="text" id="mob-riq-fonte" value="'+_mobEsc(dFonte)+'" placeholder="Es: passaparola"></div>'
    + '</div>'
    /* Cosa cerca */
    + '<div style="font-size:0.78rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin:18px 4px 10px;">Cosa cerca</div>'
    + '<div class="mob-row-2">'
    +   '<div class="mob-field"><label class="mob-field-lbl">Incarico</label><select class="mob-select" id="mob-riq-inc">'+incOpts+'</select></div>'
    +   '<div class="mob-field"><label class="mob-field-lbl">Tipo immobile</label><select class="mob-select" id="mob-riq-tipo">'+tipoOpts+'</select></div>'
    + '</div>'
    + '<div class="mob-row-2">'
    +   '<div class="mob-field"><label class="mob-field-lbl">Budget min (€)</label><input class="mob-input" type="number" inputmode="numeric" id="mob-riq-bmin" value="'+_mobEsc(dBmin)+'"></div>'
    +   '<div class="mob-field"><label class="mob-field-lbl">Budget max (€)</label><input class="mob-input" type="number" inputmode="numeric" id="mob-riq-bmax" value="'+_mobEsc(dBmax)+'"></div>'
    + '</div>'
    + '<div class="mob-field"><label class="mob-field-lbl">Comune</label><input class="mob-input" type="text" id="mob-riq-comune" value="'+_mobEsc(dComune)+'"></div>'
    + '<div class="mob-field"><label class="mob-field-lbl">Zone preferite</label><input class="mob-input" type="text" id="mob-riq-zone" value="'+_mobEsc(dZone)+'" placeholder="Centro, lungomare..."></div>'
    + '<div class="mob-row-3">'
    +   '<div class="mob-field"><label class="mob-field-lbl">Mq min</label><input class="mob-input" type="number" inputmode="numeric" id="mob-riq-mq" value="'+_mobEsc(dMq)+'"></div>'
    +   '<div class="mob-field"><label class="mob-field-lbl">Camere min</label><input class="mob-input" type="number" inputmode="numeric" id="mob-riq-cam" value="'+_mobEsc(dCam)+'"></div>'
    +   '<div class="mob-field"><label class="mob-field-lbl">Mare</label><select class="mob-select" id="mob-riq-mare">'+mareOpts+'</select></div>'
    + '</div>'
    + '<div class="mob-field"><label class="mob-field-lbl">Note</label><textarea class="mob-textarea" id="mob-riq-note" placeholder="Esigenze particolari, ascensore, garage...">'+_mobEsc(dNote)+'</textarea></div>'
    + (r ? '<button class="mob-sheet-action danger" style="width:100%;margin-top:8px;padding:12px;" onclick="mobDelRichiesta('+_mobEditingRichiestaIdx+')">Elimina richiesta</button>' : '');

  mobSheetOpen('mob-sheet-richiesta');
}
function _mobRiqCliChange(){
  var sel = document.getElementById('mob-riq-cli');
  var idx = sel.value;
  if(idx === '' || !D.clienti[parseInt(idx)]) return;
  var cl = D.clienti[parseInt(idx)];
  var nm = document.getElementById('mob-riq-nome');
  var tl = document.getElementById('mob-riq-tel');
  var em = document.getElementById('mob-riq-email');
  if(nm && !nm.value) nm.value = cl.nome  || '';
  if(tl && !tl.value) tl.value = cl.tel   || '';
  if(em && !em.value) em.value = cl.email || '';
}
function mobSaveRichiesta(){
  var g = function(id){ var el=document.getElementById(id); return el?el.value:''; };
  var nome = g('mob-riq-nome').trim();
  if(!nome){ mobToast('Inserisci il nome'); return; }
  var cliRef = g('mob-riq-cli');
  var todayStr = new Date().toISOString().slice(0,10);
  var num = function(v){ v = parseFloat(v); return isNaN(v) ? '' : v; };
  var existingData = (_mobEditingRichiestaIdx !== null && D.richieste[_mobEditingRichiestaIdx]) ? D.richieste[_mobEditingRichiestaIdx].data : '';
  var r = {
    cliRef: cliRef,
    nome:   nome,
    tel:    g('mob-riq-tel'),
    email:  g('mob-riq-email'),
    urg:    g('mob-riq-urg') || 'media',
    fonte:  g('mob-riq-fonte'),
    tipo:   g('mob-riq-tipo'),
    inc:    g('mob-riq-inc'),
    bmin:   num(g('mob-riq-bmin')),
    bmax:   num(g('mob-riq-bmax')),
    comune: g('mob-riq-comune'),
    zone:   g('mob-riq-zone'),
    mq:     g('mob-riq-mq'),
    cam:    g('mob-riq-cam'),
    mare:   g('mob-riq-mare'),
    note:   g('mob-riq-note'),
    data:   existingData || todayStr
  };
  if(!Array.isArray(D.richieste)) D.richieste = [];
  if(_mobEditingRichiestaIdx !== null){
    D.richieste[_mobEditingRichiestaIdx] = r;
  } else {
    D.richieste.push(r);
  }
  saveD();
  try{ if(typeof renderRichieste==='function') renderRichieste(); }catch(e){}
  try{ if(typeof updateBadges==='function') updateBadges(); }catch(e){}
  mobSheetClose('mob-sheet-richiesta');
  /* Se siamo dentro la scheda cliente, ricaricala */
  if(document.getElementById('mob-sheet-cliente').classList.contains('open') && cliRef !== ''){
    mobOpenSchedaCliente(parseInt(cliRef));
  }
  mobToast(_mobEditingRichiestaIdx !== null ? 'Richiesta aggiornata' : 'Richiesta salvata');
  _mobEditingRichiestaIdx = null;
}
function mobDelRichiesta(i){
  if(!confirm('Eliminare questa richiesta?')) return;
  D.richieste.splice(i, 1);
  saveD();
  try{ if(typeof renderRichieste==='function') renderRichieste(); }catch(e){}
  mobSheetClose('mob-sheet-richiesta');
  mobToast('Richiesta eliminata');
  _mobEditingRichiestaIdx = null;
  /* Chiudi scheda cliente se aperta (cosi' si refresha al prossimo open) */
  var clSheet = document.getElementById('mob-sheet-cliente');
  if(clSheet && clSheet.classList.contains('open')){
    /* Lascialo aperto: il pulsante "indietro" lo chiuderà */
  }
}

// ─── BRIDGE window ───────────────────────────────────────────────────────────
Object.assign(window, {
  mobRenderRichieste, mobOpenRichiestaForm, _mobRiqCliChange,
  mobSaveRichiesta, mobDelRichiesta,
});

export { mobRenderRichieste, mobOpenRichiestaForm, mobSaveRichiesta, mobDelRichiesta };
