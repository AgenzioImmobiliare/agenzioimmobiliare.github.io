// modules/diario/diario.view.js — Diario giornaliero di Enzo: note libere del
// giorno (notizie, contatti, promemoria) che altrimenti si perdono dopo pochi
// giorni, più il Report Attività (Appuntamenti + Visite + Diario) da
// consegnare al broker, con periodo Giorno/Settimana/Mese.
//
// Le voci possono restare libere (nessun collegamento) o agganciarsi a un
// cliente/immobile esistente. Una voce segnata "da seguire" crea in automatico
// un promemoria in Appuntamenti (D.eventi, tipo 'Promemoria'); se la voce
// viene modificata o eliminata, il promemoria collegato si aggiorna o si
// rimuove con lei (vedi _diaSyncPromemoria).
//
// Dipendenze esterne (monolite via window): D, saveD, showToast, today, fmtD,
//   genUUID, openModal, closeModal, clearModal, dlgConfirm, getNomeAgenzia,
//   getNomeAgente.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function _diaEnsure(){ if(!Array.isArray(D.diario)) D.diario=[]; }

function _diaOraOra(){
  var n=new Date();
  return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
}

function _diaEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* Crea/aggiorna/rimuove il promemoria in Appuntamenti (D.eventi, tipo
   'Promemoria') collegato a una voce di diario segnata "da seguire".
   L'id dell'evento resta su entry._promemoriaEvId per ritrovarlo in seguito. */
function _diaSyncPromemoria(entry){
  if(!Array.isArray(D.eventi)) D.eventi=[];
  var attivo = !!(entry.daSeguire && !entry.fatto && entry.dataSeguire);
  var idx = entry._promemoriaEvId ? D.eventi.findIndex(function(e){return e&&e.id===entry._promemoriaEvId;}) : -1;
  if(!attivo){
    if(idx>=0) D.eventi.splice(idx,1);
    entry._promemoriaEvId='';
    return;
  }
  var titolo = 'Diario: '+((entry.testo||'').slice(0,60))+((entry.testo||'').length>60?'…':'');
  if(idx>=0){
    D.eventi[idx].data=entry.dataSeguire;
    D.eventi[idx].titolo=titolo;
    D.eventi[idx].note=entry.testo||'';
    if(entry.cliente) D.eventi[idx].cliente=entry.cliente;
  } else {
    var ev={ id:genUUID(), tipo:'Promemoria', titolo:titolo, data:entry.dataSeguire, ora:'09:00',
      cliente:entry.cliente||'', note:entry.testo||'', _daDiarioId:entry.id };
    D.eventi.push(ev);
    entry._promemoriaEvId=ev.id;
  }
}

/* ══════════════════════════ ELENCO ══════════════════════════ */
function renderDiario(){
  _diaEnsure();
  var q=((document.getElementById('f-dia-q')||{}).value||'').toLowerCase().trim();
  var soloSeguire=(document.getElementById('f-dia-seguire')||{}).checked;
  var dal=(document.getElementById('f-dia-dal')||{}).value||'';
  var al=(document.getElementById('f-dia-al')||{}).value||'';

  var voci=D.diario.filter(function(v){
    if(!v) return false;
    if(soloSeguire && !(v.daSeguire && !v.fatto)) return false;
    if(dal && (v.data||'')<dal) return false;
    if(al && (v.data||'')>al) return false;
    if(q){
      var hay=((v.testo||'')+' '+(v.cliente||'')+' '+(v.immTitolo||'')).toLowerCase();
      if(hay.indexOf(q)<0) return false;
    }
    return true;
  });

  var oggi=today();
  var aperte=D.diario.filter(function(v){return v&&v.daSeguire&&!v.fatto;});
  var scadute=aperte.filter(function(v){return v.dataSeguire&&v.dataSeguire<=oggi;}).length;

  var statEl=document.getElementById('dia-stat-cards');
  if(statEl){
    statEl.innerHTML =
      '<div class="card" style="padding:12px 14px"><div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:#64748B">Voci totali</div><div style="font-size:1.5rem;font-weight:900;color:#0F172A">'+D.diario.length+'</div></div>'+
      '<div class="card" style="padding:12px 14px"><div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:#64748B">Da seguire aperte</div><div style="font-size:1.5rem;font-weight:900;color:'+(aperte.length>0?'#D97706':'#0F172A')+'">'+aperte.length+'</div></div>'+
      '<div class="card" style="padding:12px 14px"><div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:#64748B">Scadute o di oggi</div><div style="font-size:1.5rem;font-weight:900;color:'+(scadute>0?'#DC2626':'#15803D')+'">'+scadute+'</div></div>';
  }

  var perGiorno={};
  voci.forEach(function(v){ var g=v.data||'—'; (perGiorno[g]=perGiorno[g]||[]).push(v); });
  var giorni=Object.keys(perGiorno).sort().reverse();

  var cont=document.getElementById('dia-lista');
  if(cont){
    if(!giorni.length){
      cont.innerHTML='<div style="text-align:center;padding:44px;color:var(--text4)"><p>Nessuna voce di diario'+((q||soloSeguire||dal||al)?' con questi filtri.':'. Scrivi la prima nota qui sopra.')+'</p></div>';
    } else {
      cont.innerHTML = giorni.map(function(g){
        var vociG = perGiorno[g].slice().sort(function(a,b){ return (a.ora||'').localeCompare(b.ora||''); });
        var etichetta = g==='—' ? 'Senza data' : (fmtD(g) + (g===oggi?' · Oggi':''));
        var chip=function(t,bg,fg,bd){ return t?('<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:8px;font-size:0.68rem;font-weight:600;background:'+bg+';color:'+fg+';border:1px solid '+bd+'">'+t+'</span>'):''; };
        var righe = vociG.map(function(v){
          var seg = !v.daSeguire ? '' : (v.fatto
            ? chip('✓ Seguito','#F0FDF4','#15803D','#BBF7D0')
            : chip('⏰ Da seguire'+(v.dataSeguire?' il '+fmtD(v.dataSeguire):''), (v.dataSeguire&&v.dataSeguire<=oggi)?'#FEF2F2':'#FFFBEB', (v.dataSeguire&&v.dataSeguire<=oggi)?'#DC2626':'#D97706', (v.dataSeguire&&v.dataSeguire<=oggi)?'#FECACA':'#FDE68A'));
          return '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'+
            '<div style="width:46px;flex-shrink:0;font-size:0.76rem;font-weight:700;color:#64748B;padding-top:1px">'+_diaEsc(v.ora||'')+'</div>'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-size:0.86rem;color:var(--text);white-space:pre-wrap;line-height:1.4">'+_diaEsc(v.testo||'')+'</div>'+
              '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">'+
                chip(v.cliente?('👤 '+_diaEsc(v.cliente)):'', '#EFF6FF','#1D4ED8','#BFDBFE')+
                chip(v.immTitolo?('🏠 '+_diaEsc(v.immTitolo)):'', '#F5F3FF','#7C3AED','#DDD6FE')+
                seg+
              '</div>'+
            '</div>'+
            '<div style="display:flex;gap:4px;flex-shrink:0;align-items:flex-start">'+
              (v.daSeguire&&!v.fatto?('<button class="btn btn-sm btn-outline" onclick="diaSegnaFatto(\''+v.id+'\')" title="Segna come seguita">✓</button>'):'')+
              '<button class="btn btn-sm btn-outline" onclick="openDiarioModal(\''+v.id+'\')" title="Modifica">✎</button>'+
              '<button class="btn btn-sm btn-outline" onclick="delDiario(\''+v.id+'\')" title="Elimina">🗑</button>'+
            '</div>'+
          '</div>';
        }).join('');
        return '<div class="card" style="margin-bottom:14px;padding:14px 16px">'+
          '<div style="font-size:0.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:#1D4ED8;margin-bottom:4px">'+etichetta+'</div>'+
          righe+
        '</div>';
      }).join('');
    }
  }

  var badge=document.getElementById('nb-diario');
  if(badge){ badge.textContent=scadute; badge.style.display=scadute>0?'':'none'; badge.classList.toggle('empty',scadute===0); }
}

/* ══════════════════ VOCE RAPIDA (in testa alla lista) ══════════════════ */
function diaQuickSave(){
  var el=document.getElementById('dia-quick-testo');
  var testo=el?el.value.trim():'';
  if(!testo) return;
  _diaEnsure();
  D.diario.push({ id:genUUID(), data:today(), ora:_diaOraOra(), testo:testo, cliente:'', immRef:'', immTitolo:'', daSeguire:false, dataSeguire:'', fatto:false, _promemoriaEvId:'', _modificata:Date.now() });
  saveD();
  if(el){ el.value=''; el.focus(); }
  renderDiario();
  showToast('Nota salvata nel diario','','#15803D');
}
function diaQuickKey(ev){
  if(ev && ev.key==='Enter' && !ev.shiftKey){ ev.preventDefault(); diaQuickSave(); }
}

/* ══════════════════════════ MODAL COMPLETO ══════════════════════════ */
function openDiarioModal(idOrUndefined){
  _diaEnsure();
  D.editDiarioId = (typeof idOrUndefined==='string') ? idOrUndefined : null;
  var v = D.editDiarioId ? D.diario.find(function(x){return x&&x.id===D.editDiarioId;}) : null;

  clearModal('modal-diario');
  var mt=document.getElementById('mt-dia'); if(mt) mt.textContent = v?'Modifica voce di diario':'Nuova voce di diario';

  var dlc=document.getElementById('dia-clienti-dl');
  if(dlc) dlc.innerHTML=(D.clienti||[]).slice().sort(function(a,b){return (a.nome||'').localeCompare(b.nome||'','it');}).map(function(c){return '<option value="'+_diaEsc(c.nome||'')+'">';}).join('');
  var selImm=document.getElementById('dia-immobile');
  if(selImm){
    selImm.innerHTML='<option value="">— Nessun immobile —</option>'+
      (D.immobili||[]).map(function(im,i){return '<option value="'+i+'">('+(im.ref||i)+') '+_diaEsc(im.tipo||'Immobile')+(im.comune?' — '+_diaEsc(im.comune):'')+'</option>';}).join('');
  }

  var g=function(id,val){ var e=document.getElementById(id); if(e) e.value=val||''; };
  var c=function(id,val){ var e=document.getElementById(id); if(e) e.checked=!!val; };

  g('dia-data', (v&&v.data)||today());
  g('dia-ora', (v&&v.ora)||_diaOraOra());
  g('dia-testo', v?v.testo:'');
  g('dia-cliente', v?v.cliente:'');
  if(selImm) selImm.value = (v&&v.immRef!==undefined&&v.immRef!=='') ? String(v.immRef) : '';
  c('dia-seguire', v?v.daSeguire:false);
  g('dia-data-seguire', (v&&v.dataSeguire)||'');
  _diaToggleSeguireFields();

  openModal('modal-diario');
  setTimeout(function(){ var t=document.getElementById('dia-testo'); if(t) t.focus(); }, 50);
}

function _diaToggleSeguireFields(){
  var on=(document.getElementById('dia-seguire')||{}).checked;
  var box=document.getElementById('dia-seguire-data-row');
  if(box) box.style.display=on?'':'none';
  if(on){
    var dEl=document.getElementById('dia-data-seguire');
    if(dEl && !dEl.value){
      var d=new Date(); d.setDate(d.getDate()+1);
      dEl.value=d.toISOString().slice(0,10);
    }
  }
}

function saveDiarioModal(){
  _diaEnsure();
  var g=function(id){ var e=document.getElementById(id); return e?e.value.trim():''; };
  var testo=g('dia-testo');
  if(!testo){ showToast('Scrivi qualcosa nella nota','','#DC2626'); return; }

  var immRefRaw=g('dia-immobile');
  var immIdx = immRefRaw!=='' ? parseInt(immRefRaw) : '';
  var imm = immIdx!=='' ? (D.immobili||[])[immIdx] : null;
  var daSeguire=(document.getElementById('dia-seguire')||{}).checked;

  var v = D.editDiarioId ? D.diario.find(function(x){return x&&x.id===D.editDiarioId;}) : null;
  var isNew = !v;
  if(isNew){ v={ id:genUUID(), _promemoriaEvId:'', fatto:false }; }

  v.data = g('dia-data')||today();
  v.ora = g('dia-ora')||_diaOraOra();
  v.testo = testo;
  v.cliente = g('dia-cliente');
  v.immRef = immIdx!=='' ? immIdx : '';
  v.immTitolo = imm ? ('('+(imm.ref||immIdx)+') '+(imm.tipo||'Immobile')+(imm.comune?' — '+imm.comune:'')) : '';
  v.daSeguire = !!daSeguire;
  v.dataSeguire = daSeguire ? g('dia-data-seguire') : '';
  if(!daSeguire) v.fatto=false;
  v._modificata = Date.now();

  _diaSyncPromemoria(v);
  if(isNew) D.diario.push(v);

  saveD();
  closeModal('modal-diario');
  D.editDiarioId=null;
  renderDiario();
  showToast(isNew?'Voce aggiunta al diario':'Voce aggiornata','','#15803D');
}

function diaSegnaFatto(id){
  _diaEnsure();
  var v=D.diario.find(function(x){return x&&x.id===id;});
  if(!v) return;
  v.fatto=true;
  _diaSyncPromemoria(v);
  saveD();
  renderDiario();
  showToast('Segnata come seguita','','#15803D');
}

function delDiario(id){
  _diaEnsure();
  var v=D.diario.find(function(x){return x&&x.id===id;});
  if(!v) return;
  dlgConfirm('Eliminare questa voce di diario?','','Elimina').then(function(ok){
    if(!ok) return;
    if(v._promemoriaEvId && Array.isArray(D.eventi)){
      var ei=D.eventi.findIndex(function(e){return e&&e.id===v._promemoriaEvId;});
      if(ei>=0) D.eventi.splice(ei,1);
    }
    var i=D.diario.findIndex(function(x){return x&&x.id===id;});
    if(i>=0) D.diario.splice(i,1);
    saveD();
    renderDiario();
    showToast('Voce eliminata','','#DC2626');
  });
}

/* ══════════ REPORT ATTIVITÀ (Giorno / Settimana / Mese) ══════════
   Un'unica pagina con selettore di periodo: aggrega Appuntamenti (D.eventi),
   Visite (D.visite) e Diario (D.diario) nell'intervallo scelto e apre lo
   stampabile — stesso meccanismo (finestra popup + window.print()) usato in
   tutti gli altri report del gestionale. */
function rdInit(){
  var pd=document.getElementById('pd-report-diario');
  if(pd) pd.textContent=new Date().toLocaleDateString('it-IT');
  var dEl=document.getElementById('rd-data');
  if(dEl && !dEl.value) dEl.value=today();
}

function _rdRange(){
  var periodo=(document.getElementById('rd-periodo')||{}).value||'giorno';
  var rifStr=(document.getElementById('rd-data')||{}).value||today();
  var rif=new Date(rifStr+'T00:00:00');
  var da,al,label;
  var nomiMesi=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  if(periodo==='settimana'){
    var dow=(rif.getDay()+6)%7; // lunedì=0
    da=new Date(rif); da.setDate(rif.getDate()-dow);
    al=new Date(da); al.setDate(da.getDate()+6);
    label='Settimana '+fmtD(da.toISOString().slice(0,10))+' – '+fmtD(al.toISOString().slice(0,10));
  } else if(periodo==='mese'){
    da=new Date(rif.getFullYear(), rif.getMonth(), 1);
    al=new Date(rif.getFullYear(), rif.getMonth()+1, 0);
    label=nomiMesi[rif.getMonth()]+' '+rif.getFullYear();
  } else {
    da=new Date(rif); al=new Date(rif);
    label=fmtD(rifStr);
  }
  return { da:da.toISOString().slice(0,10), al:al.toISOString().slice(0,10), label:label };
}

function rdGenera(){
  var r=_rdRange();
  var nowFull=new Date().toLocaleString('it-IT');

  var eventi=(D.eventi||[]).filter(function(e){return e&&e.data&&e.data>=r.da&&e.data<=r.al;})
    .sort(function(a,b){ return (a.data+(a.ora||'')).localeCompare(b.data+(b.ora||'')); });
  var visite=(D.visite||[]).filter(function(v){return v&&v.data&&v.data>=r.da&&v.data<=r.al;})
    .sort(function(a,b){ return (a.data+(a.ora||'')).localeCompare(b.data+(b.ora||'')); });
  var diario=(D.diario||[]).filter(function(v){return v&&v.data&&v.data>=r.da&&v.data<=r.al;})
    .sort(function(a,b){ return (a.data+(a.ora||'')).localeCompare(b.data+(b.ora||'')); });

  var th=function(t){ return '<th style="padding:5px 8px;text-align:left;font-size:8px;font-weight:700;text-transform:uppercase;color:#6B7280;border-bottom:1px solid #E5E7EB">'+t+'</th>'; };
  var td=function(t){ return '<td style="padding:5px 8px;font-size:9px;color:#111827;border-bottom:1px solid #F1F5F9;vertical-align:top">'+_diaEsc(t||'—')+'</td>'; };

  var rigEv = eventi.map(function(e){
    return '<tr>'+td(fmtD(e.data))+td(e.ora)+td(e.tipo)+td(e.titolo)+td(e.cliente)+td(e.note)+'</tr>';
  }).join('') || '<tr><td colspan="6" style="padding:10px;text-align:center;color:#9CA3AF;font-size:9px">Nessun appuntamento nel periodo</td></tr>';

  var rigVis = visite.map(function(v){
    var immO=(D.immobili||[])[parseInt(v.immRef)];
    var immTxt = immO ? ('('+(immO.ref||v.immRef)+') '+(immO.comune||'')) : '';
    return '<tr>'+td(fmtD(v.data))+td(v.ora)+td(immTxt)+td(v.cliente)+td(v.esito)+td(v.feedback||v.note)+'</tr>';
  }).join('') || '<tr><td colspan="6" style="padding:10px;text-align:center;color:#9CA3AF;font-size:9px">Nessuna visita nel periodo</td></tr>';

  var rigDia = diario.map(function(v){
    var seg = v.daSeguire ? (v.fatto?'Seguita':('Da seguire'+(v.dataSeguire?' il '+fmtD(v.dataSeguire):''))) : '';
    return '<tr>'+td(fmtD(v.data))+td(v.ora)+td(v.testo)+td(v.cliente)+td(v.immTitolo)+td(seg)+'</tr>';
  }).join('') || '<tr><td colspan="6" style="padding:10px;text-align:center;color:#9CA3AF;font-size:9px">Nessuna voce di diario nel periodo</td></tr>';

  var html = '<!doctype html><html lang="it"><head><meta charset="utf-8">'
    +'<title>Report Attività — '+r.label+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:A4 portrait;margin:10mm 12mm}'
    +'body{font-family:"Helvetica Neue",Arial,sans-serif;font-size:11px;color:#111827;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'table{width:100%;border-collapse:collapse;margin-bottom:14px}'
    +'</style></head><body>'

    +'<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:8px;border-bottom:3px solid #1D4ED8;margin-bottom:10px">'
      +'<div><div style="font-size:16px;font-weight:900;color:#1D4ED8">'+getNomeAgenzia()+'</div>'
      +'<div style="font-size:8px;color:#6B7280;margin-top:2px">Agente: '+getNomeAgente()+'</div></div>'
      +'<div style="text-align:right">'
        +'<div style="font-size:9px;font-weight:700;color:#1D4ED8;text-transform:uppercase;letter-spacing:.5px">Report Attività</div>'
        +'<div style="font-size:8px;color:#6B7280;margin-top:1px">'+r.label+' · '+nowFull+'</div>'
      +'</div>'
    +'</div>'

    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">'
      +'<div style="padding:9px 12px;border-radius:7px;background:#EFF6FF;border:1px solid #BFDBFE;text-align:center"><div style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#2563EB;margin-bottom:2px">Appuntamenti</div><div style="font-size:22px;font-weight:900;color:#1D4ED8;line-height:1">'+eventi.length+'</div></div>'
      +'<div style="padding:9px 12px;border-radius:7px;background:#F0FDF4;border:1px solid #BBF7D0;text-align:center"><div style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#15803D;margin-bottom:2px">Visite</div><div style="font-size:22px;font-weight:900;color:#15803D;line-height:1">'+visite.length+'</div></div>'
      +'<div style="padding:9px 12px;border-radius:7px;background:#FFF7ED;border:1px solid #FED7AA;text-align:center"><div style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#C2410C;margin-bottom:2px">Voci di Diario</div><div style="font-size:22px;font-weight:900;color:#C2410C;line-height:1">'+diario.length+'</div></div>'
    +'</div>'

    +'<div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#374151;border-bottom:2px solid #1D4ED8;padding-bottom:3px;margin-bottom:6px">Appuntamenti ('+eventi.length+')</div>'
    +'<table><thead><tr style="background:#F9FAFB">'+th('Data')+th('Ora')+th('Tipo')+th('Titolo')+th('Cliente')+th('Note')+'</tr></thead><tbody>'+rigEv+'</tbody></table>'

    +'<div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#374151;border-bottom:2px solid #15803D;padding-bottom:3px;margin-bottom:6px">Visite ('+visite.length+')</div>'
    +'<table><thead><tr style="background:#F9FAFB">'+th('Data')+th('Ora')+th('Immobile')+th('Cliente')+th('Esito')+th('Feedback')+'</tr></thead><tbody>'+rigVis+'</tbody></table>'

    +'<div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#374151;border-bottom:2px solid #C2410C;padding-bottom:3px;margin-bottom:6px">Diario ('+diario.length+')</div>'
    +'<table><thead><tr style="background:#F9FAFB">'+th('Data')+th('Ora')+th('Nota')+th('Cliente')+th('Immobile')+th('Da seguire')+'</tr></thead><tbody>'+rigDia+'</tbody></table>'

    +'<div style="margin-top:10px;padding-top:6px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;font-size:8px;color:#9CA3AF">'
      +'<span>'+getNomeAgenzia()+' — '+getNomeAgente()+'</span>'
      +'<span>'+nowFull+' — DOCUMENTO RISERVATO</span>'
    +'</div>'
    +'</body></html>';

  var printBar = '<div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1D4ED8;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,.3)" class="no-print">'
    +'<div style="display:flex;align-items:center;gap:10px">'
      +'<span style="color:white;font-weight:800;font-size:14px">Anteprima Report Attività</span>'
      +'<span style="color:rgba(255,255,255,.7);font-size:12px">'+r.label+'</span>'
    +'</div>'
    +'<div style="display:flex;gap:8px">'
      +'<button onclick="window.print()" style="display:inline-flex;align-items:center;gap:6px;padding:8px 20px;background:white;border:none;border-radius:8px;color:#1D4ED8;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit">Stampa</button>'
      +'<button onclick="window.close()" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(255,255,255,.2);border:1.5px solid rgba(255,255,255,.4);border-radius:8px;color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Chiudi</button>'
    +'</div>'
  +'</div>'
  +'<style>@media print{.no-print{display:none!important}body{padding-top:0!important}}</style>'
  +'<style>body{padding-top:56px}</style>';

  html = html.replace('<body>', '<body>' + printBar);

  var win=window.open('','_blank','width=960,height=800');
  if(!win){ showToast('Abilita i popup del browser per la stampa','','#D97706'); return; }
  win.document.open(); win.document.write(html); win.document.close(); win.focus();
}

Object.assign(window, {
  _diaEnsure, renderDiario, diaQuickSave, diaQuickKey, openDiarioModal, saveDiarioModal,
  _diaToggleSeguireFields, diaSegnaFatto, delDiario, rdInit, rdGenera,
});
export { renderDiario, openDiarioModal, saveDiarioModal, rdInit, rdGenera };
