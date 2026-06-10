// modules/clienti/clienti.report.js — render e stampa report Clienti.
// Estratto dal monolite (57046-57047). Dipendenze: _rptTable, _rptStampa.
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

function reportClientiRender(){var el=document.getElementById('rpt-cli-table');if(!el)return;var search=(document.getElementById('rpt-cli-search')||{value:''}).value.toLowerCase();var tipo=(document.getElementById('rpt-cli-tipo')||{value:''}).value.toLowerCase();var list=(typeof D!=='undefined'&&D.clienti)?D.clienti:[];var filt=list.filter(function(c){var t=JSON.stringify(c).toLowerCase();return(!search||t.indexOf(search)>=0)&&(!tipo||(c.tipo||'').toLowerCase()===tipo);});var cnt=document.getElementById('rpt-cli-count');if(cnt)cnt.textContent=filt.length+' / '+list.length+' clienti';var rows=filt.map(function(c){return[c.nome||'—',c.cognome||'—',c.tipo||'—',c.tel||c.telefono||'—',c.email||'—',c.citta||c.comune||'—',c.stato||'—',c.note?(c.note.substring(0,60)+(c.note.length>60?'…':'')):'']; });el.innerHTML=_rptTable(['Nome','Cognome','Tipo','Telefono','Email','Città','Stato','Note'],rows,'Nessun cliente trovato');}
function reportClientiStampa(){var list=(typeof D!=='undefined'&&D.clienti)?D.clienti:[];var ths='<tr><th>Nome</th><th>Cognome</th><th>Tipo</th><th>Telefono</th><th>Email</th><th>Città</th><th>Stato</th><th>Note</th></tr>';var trs=list.map(function(c){return'<tr><td>'+(c.nome||'')+'</td><td>'+(c.cognome||'')+'</td><td>'+(c.tipo||'')+'</td><td>'+(c.tel||c.telefono||'')+'</td><td>'+(c.email||'')+'</td><td>'+(c.citta||c.comune||'')+'</td><td>'+(c.stato||'')+'</td><td>'+((c.note||'').substring(0,60))+'</td></tr>';}).join('');_rptStampa('Report Clienti','<table><thead>'+ths+'</thead><tbody>'+trs+'</tbody></table>');}

Object.assign(window, { reportClientiRender, reportClientiStampa });
export { reportClientiRender, reportClientiStampa };
