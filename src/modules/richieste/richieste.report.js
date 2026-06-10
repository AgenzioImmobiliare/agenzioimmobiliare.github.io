// modules/richieste/richieste.report.js — render e stampa report Richieste.
// Estratto dal monolite (righe 57062-57063 dell'originale).
// Dipendenze esterne (monolite via window): _rptTable, _rptStampa.
// `D` è un Proxy LIVE su window.D: legge/scrive sempre l'oggetto stato corrente,
// indipendentemente dall'ordine di caricamento monolite-vs-modulo. Il codice
// estratto resta invariato (continua a usare D.richieste, ecc.).
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function reportRichiesteRender(){var el=document.getElementById('rpt-rich-table');if(!el)return;var search=(document.getElementById('rpt-rich-search')||{value:''}).value.toLowerCase();var stato=(document.getElementById('rpt-rich-stato')||{value:''}).value.toLowerCase();var list=(typeof D!=='undefined'&&D.richieste)?D.richieste:[];var filt=list.filter(function(r){var t=JSON.stringify(r).toLowerCase();return(!search||t.indexOf(search)>=0)&&(!stato||(r.stato||'').toLowerCase().indexOf(stato)>=0);});var cnt=document.getElementById('rpt-rich-count');if(cnt)cnt.textContent=filt.length+' / '+list.length+' richieste';var rows=filt.map(function(r){var pMin=r.prezzoMin||r.budgetMin?'€ '+Number(r.prezzoMin||r.budgetMin).toLocaleString('it-IT'):'—';var pMax=r.prezzoMax||r.budget?'€ '+Number(r.prezzoMax||r.budget).toLocaleString('it-IT'):'—';return[r.cliente||r.nome||'—',r.tipo||'—',r.zona||r.comune||'—',(r.mqMin||'—')+(r.mqMin?' m²':''),pMin+' / '+pMax,r.stato||'—',r.data?new Date(r.data).toLocaleDateString('it-IT'):'—',r.agente||'—'];});el.innerHTML=_rptTable(['Cliente','Tipo','Zona','MQ Min','Budget','Stato','Data','Agente'],rows,'Nessuna richiesta trovata');}
function reportRichiesteStampa(){var list=(typeof D!=='undefined'&&D.richieste)?D.richieste:[];var ths='<tr><th>Cliente</th><th>Tipo</th><th>Zona</th><th>MQ Min</th><th>Budget</th><th>Stato</th><th>Data</th><th>Agente</th></tr>';var trs=list.map(function(r){var pMin=r.prezzoMin||r.budgetMin?'€ '+Number(r.prezzoMin||r.budgetMin).toLocaleString('it-IT'):'';var pMax=r.prezzoMax||r.budget?'€ '+Number(r.prezzoMax||r.budget).toLocaleString('it-IT'):'';return'<tr><td>'+(r.cliente||r.nome||'')+'</td><td>'+(r.tipo||'')+'</td><td>'+(r.zona||r.comune||'')+'</td><td>'+(r.mqMin?r.mqMin+' m²':'')+'</td><td>'+pMin+' / '+pMax+'</td><td>'+(r.stato||'')+'</td><td>'+(r.data?new Date(r.data).toLocaleDateString('it-IT'):'')+'</td><td>'+(r.agente||'')+'</td></tr>';}).join('');_rptStampa('Report Richieste','<table><thead>'+ths+'</thead><tbody>'+trs+'</tbody></table>');}

Object.assign(window, { reportRichiesteRender, reportRichiesteStampa });
export { reportRichiesteRender, reportRichiesteStampa };
