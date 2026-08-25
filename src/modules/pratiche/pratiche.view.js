// modules/pratiche/pratiche.view.js — vista DESKTOP del modulo Pratiche.
// Estratto (26087-26179): pulisciPraticheBloccate, renderPratiche.
// NOTA: la gestione pratiche (openPratica/savePratica) resta nel monolite,
// intrecciata con immobili/provvigioni. Qui estraiamo render + pulizia.
// Dipendenze esterne (monolite via window): saveD, showToast, fmtE, fmtD, go,
//   updateBadges, openModal.
import { state } from '../../core/state.js';
const D = new Proxy({}, {
  get(_, p) { return window.D ? window.D[p] : undefined; },
  set(_, p, v) { if (window.D) window.D[p] = v; return true; },
  has(_, p) { return window.D ? (p in window.D) : false; },
});

/* RISCRITTA il 1 ago 2026 — prima ELIMINAVA le pratiche.
   La logica di partenza era: "pratica in proposta ma immobile ancora attivo =
   dato incoerente, quindi la pratica è spazzatura". È il ragionamento
   sbagliato. In quella coppia il dato prezioso è la PRATICA (una proposta
   d'acquisto vera, con importi, caparra e date); quello sbagliato è lo stato
   dell'immobile, rimasto 'attivo' quando invece è in proposta.
   Ora quindi si corregge l'immobile e la pratica non si tocca mai.
   Costo di un errore: prima una proposta cancellata per sempre, adesso uno
   stato immobile da rimettere a mano. */
function pulisciPraticheBloccate(){
  const casi=[];
  D.pratiche.forEach((p,idx)=>{
    if(!p || p.stato!=='proposta') return;
    const n=parseInt(p.immRef);
    const im=(!isNaN(n)) ? D.immobili[n] : null;
    if(!im){ casi.push({p,idx,im:null,tipo:'senza immobile'}); return; }
    if((im.stato||'')==='attivo') casi.push({p,idx,im,tipo:'stato da allineare'});
  });
  if(casi.length===0){
    dlgAlert('Nessun disallineamento trovato: ogni proposta in corso ha il suo immobile nello stato giusto.','','Tutto OK');
    return;
  }
  const daAllineare=casi.filter(c=>c.tipo==='stato da allineare');
  const orfane=casi.filter(c=>c.tipo==='senza immobile');
  let msg='';
  if(daAllineare.length){
    msg+=`${daAllineare.length} immobile/i risulta/no ancora "attivo" pur avendo una proposta in corso:\n\n`
      + daAllineare.map(c=>`• ${(c.im.ref?'['+c.im.ref+'] ':'')}${c.im.tipo||'Immobile'} — ${c.im.comune||''} / Acquirente: ${c.p.acquirente||'n.d.'}`).join('\n')
      + '\n\nVuoi rimettere questi immobili "in proposta"?\nLe proposte NON vengono toccate.';
  }
  if(orfane.length){
    msg+=(msg?'\n\n':'')
      + `Attenzione: ${orfane.length} proposta/e non trova/no il proprio immobile:\n`
      + orfane.map(c=>`• Acquirente: ${c.p.acquirente||'n.d.'} — venditore: ${c.p.venditore||'n.d.'}`).join('\n')
      + '\nQueste NON vengono toccate: vanno riagganciate a mano con riagganciaPratica().';
  }
  if(!daAllineare.length){
    dlgAlert(msg,'','Proposte da riagganciare');
    return;
  }
  dlgConfirm(msg,'','Allinea stato immobili').then(ok=>{
    if(!ok) return;
    let n=0;
    daAllineare.forEach(c=>{
      /* Si azzera lo stato manuale: da lì in poi lo stato viene ricalcolato
         dalla pratica (calcolaStatoImmobile), quindi mostrerà "in proposta". */
      c.im.stato='';
      n++;
    });
    saveD(); renderPratiche(); updateBadges();
    try{ if(typeof renderImmobili==='function') renderImmobili(); }catch(e){}
    showToast(n+' immobile/i riallineato/i — nessuna proposta è stata eliminata','','#15803D');
  });
}
function renderPratiche(){
  const pd=document.getElementById('pd-prat');if(pd)pd.textContent=new Date().toLocaleDateString('it-IT');
  const q=(document.getElementById('f-prat-q')?.value||'').toLowerCase();
  /* Mostra tutte le pratiche in stato 'proposta'.
     PRIMA venivano NASCOSTE quelle il cui immobile risultava ancora 'attivo':
     è così che la proposta di un cliente poteva sparire dalla lista senza che
     nessuno se ne accorgesse, e restare visibile solo al pulsante che la
     cancellava. Ora restano in lista, marcate con un avviso. */
  const f=D.pratiche.map((p,i)=>({p,i})).filter(({p})=>{
    if((p.stato||'')!=='proposta') return false;
    const im=D.immobili[parseInt(p.immRef)];
    const txt=[p.venditore,p.acquirente,p.descr,im?.comune,im?.tipo,im?.ref,im?.indirizzo].join(' ').toLowerCase();
    return !q||txt.includes(q);
  });
  const cnt=document.getElementById('prat-list');
  if(!cnt) return;
  if(!f.length){
    cnt.innerHTML='<div class="empty-state" style="padding:40px"><div class="empty-icon" style="font-size:2.5rem"></div><p>Nessuna proposta in corso</p><div style="font-size:0.82rem;color:var(--text3);margin-top:6px">Le proposte appaiono qui dopo che vengono inserite nella scheda immobile</div></div>';
    return;
  }
  cnt.innerHTML='<div class="card"><div class="table-wrap"><table><thead><tr>'
    +'<th style="width:104px">Foto</th><th>#</th><th>Immobile</th><th>Esito</th>'
    +'<th>Venditore</th><th>Acquirente</th><th>Tel. Acq.</th>'
    +'<th>Importo Prop.</th><th>Caparra</th><th>Data Prop.</th><th>Scad. Prop.</th><th>Data Rogito</th><th></th>'
    +'</tr></thead><tbody>'
    +f.map(({p,i},rowIdx)=>{
      const im=D.immobili[parseInt(p.immRef)];
      const foto=im?.foto||'';
      /* [25 ago 2026] Foto portate a 96x72, la stessa misura del Registro Visite,
         così le due tabelle si leggono allo stesso modo. Prima erano 46x36. */
      const fotoCell=foto
        ?`<td style="padding:4px 6px"><img src="${foto}" style="width:96px;height:72px;object-fit:cover;border-radius:8px;border:1px solid var(--border);display:block;cursor:pointer" onclick="openSchedaImmobile(${parseInt(p.immRef)})" loading="lazy" title="${im?.tipo||''} — ${im?.comune||''}"></td>`
        :`<td style="padding:4px 6px"><div style="width:96px;height:72px;background:#F1F5F9;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:#CBD5E1"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div></td>`;
      const esito=p.esitoProp||'in_corso';
      const esitoBg=esito==='accettata'?'#10B981':esito==='in_corso'?'#F59E0B':'#EF4444';
      const esitoLabel=esito==='accettata'?' Accettata':esito==='in_corso'?' In Corso':' '+esito;
      const esitoPill=`<span style="background:${esitoBg};color:white;padding:2px 9px;border-radius:12px;font-size:0.7rem;font-weight:700;white-space:nowrap">${esitoLabel}</span>`;
      const immTit=im?(im.tipo||'Immobile')+(im.comune?' — '+im.comune:''):'—';
      const immRef=im?.ref?`<span style="font-size:0.68rem;color:var(--text4)">#${im.ref}</span> `:'';
      /* segnale di disallineamento: proposta in corso ma immobile ancora
         "attivo", oppure immobile non trovato. Prima erano i casi che la lista
         nascondeva; ora si vedono e si correggono con "Allinea stati". */
      const disallineata = !im || (im.stato||'')==='attivo';
      const avviso = !im
        ? '<div style="font-size:0.68rem;color:#B91C1C;font-weight:700">immobile non collegato</div>'
        : ((im.stato||'')==='attivo'
            ? '<div style="font-size:0.68rem;color:#B45309;font-weight:700">immobile ancora "attivo" — da allineare</div>'
            : '');
      // Evidenzia se proposta scaduta
      const oggi=today();
      const scaduta=p.scadProp&&p.scadProp<oggi&&esito==='in_corso';
      const rowBg=scaduta?'background:#FFF7ED':(disallineata?'background:#FEF9C3':'');
      return`<tr style="${rowBg}">
        ${fotoCell}
        <td style="color:var(--text3);font-size:0.78rem">${rowIdx+1}</td>
        <td><div style="font-weight:600;font-size:0.85rem">${immRef}${immTit}</div>${avviso}</td>
        <td>${esitoPill}</td>
        <td>${p.venditore||'—'}</td>
        <td style="font-weight:600">${p.acquirente||'—'}</td>
        <td style="font-size:0.82rem">${p.telA?`<a href="tel:${p.telA}" style="color:var(--brand)">${p.telA}</a>`:'—'}</td>
        <td style="font-weight:700;color:var(--orange)">${p.importoProp?fmtE(p.importoProp):'—'}</td>
        <td style="font-weight:600">${p.caparra?fmtE(p.caparra):'—'}</td>
        <td>${p.dprop?fmtD(p.dprop):'—'}</td>
        <td style="${scaduta?'color:var(--red-l);font-weight:700':''}">${p.scadProp?fmtD(p.scadProp)+(scaduta?' ':''):'—'}</td>
        <td style="font-size:0.82rem">${p.drogito?('<span style="font-weight:700;color:#15803D">'+fmtD(p.drogito)+'</span>'+(p.oraRogito?' <span style="color:var(--text3);font-size:0.74rem">'+p.oraRogito+'</span>':'')):'<span style="color:#94A3B8;font-style:italic;font-weight:600">da definire</span>'}</td>
        <td><div class="actions-col">
          <button class="icon-btn" onclick="openSchedaImmobile(${parseInt(p.immRef)})" title="Scheda immobile"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button class="icon-btn" onclick="openPraticaImm(${parseInt(p.immRef)})" title="Gestisci proposta"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        </div></td>
      </tr>`;
    }).join('')
    +'</tbody></table></div></div>';
}

Object.assign(window, { pulisciPraticheBloccate, renderPratiche });
export { renderPratiche, pulisciPraticheBloccate };
