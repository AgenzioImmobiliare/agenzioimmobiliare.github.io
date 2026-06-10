// modules/immobili/immobili.report.js — report Immobili in gestione.
// Estratto (57050-57051). Dipendenze: _rptTable, _rptStampa.
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function reportImmobiliGestioneRender(){var el=document.getElementById('rpt-imm-table');if(!el)return;var search=(document.getElementById('rpt-imm-search')||{value:''}).value.toLowerCase();var tipo=(document.getElementById('rpt-imm-tipo')||{value:''}).value.toLowerCase();var stato=(document.getElementById('rpt-imm-stato')||{value:''}).value.toLowerCase();var list=(typeof D!=='undefined'&&D.immobili)?D.immobili:[];var filt=list.filter(function(i){var t=JSON.stringify(i).toLowerCase();return(!search||t.indexOf(search)>=0)&&(!tipo||(i.tipo||'').toLowerCase().indexOf(tipo)>=0)&&(!stato||(i.stato||'').toLowerCase().indexOf(stato)>=0);});var cnt=document.getElementById('rpt-imm-count');if(cnt)cnt.textContent=filt.length+' / '+list.length+' immobili';var rows=filt.map(function(i){var prz=i.prezzo?'€ '+Number(i.prezzo).toLocaleString('it-IT'):'—';return[i.ref||i.codice||'—',i.indirizzo||i.via||'—',i.comune||i.citta||'—',i.tipo||'—',(i.mq||'—')+(i.mq?' m²':''),prz,i.stato||'—',i.proprietario||i.prop||'—',i.agente||'—'];});el.innerHTML=_rptTable(['Rif.','Indirizzo','Comune','Tipo','MQ','Prezzo','Stato','Proprietario','Agente'],rows,'Nessun immobile trovato');}
function reportImmobiliGestioneStampa(){var list=(typeof D!=='undefined'&&D.immobili)?D.immobili:[];var ths='<tr><th>Rif.</th><th>Indirizzo</th><th>Comune</th><th>Tipo</th><th>MQ</th><th>Prezzo</th><th>Stato</th><th>Proprietario</th><th>Agente</th></tr>';var trs=list.map(function(i){var prz=i.prezzo?'€ '+Number(i.prezzo).toLocaleString('it-IT'):'';return'<tr><td>'+(i.ref||i.codice||'')+'</td><td>'+(i.indirizzo||i.via||'')+'</td><td>'+(i.comune||i.citta||'')+'</td><td>'+(i.tipo||'')+'</td><td>'+(i.mq?i.mq+' m²':'')+'</td><td>'+prz+'</td><td>'+(i.stato||'')+'</td><td>'+(i.proprietario||i.prop||'')+'</td><td>'+(i.agente||'')+'</td></tr>';}).join('');_rptStampa('Report Immobili in Gestione','<table><thead>'+ths+'</thead><tbody>'+trs+'</tbody></table>');}

Object.assign(window, { reportImmobiliGestioneRender, reportImmobiliGestioneStampa });
export { reportImmobiliGestioneRender, reportImmobiliGestioneStampa };
