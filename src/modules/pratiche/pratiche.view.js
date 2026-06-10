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

function pulisciPraticheBloccate(){
  // Trova pratiche con stato='proposta' il cui immobile è 'attivo' (disallineamento)
  const bloccate=D.pratiche.filter((p,idx)=>{
    if(p.stato!=='proposta') return false;
    const im=D.immobili[parseInt(p.immRef)];
    // Bloccata se: immobile attivo, o immRef non valido, o nessun dato acquirente
    if(!im||(im.stato||'')==='attivo') return true;
    return false;
  });
  if(bloccate.length===0){
    dlgAlert('Nessuna pratica bloccata trovata. Tutte le pratiche sono in stato coerente.','','Tutto OK');
    return;
  }
  const elenco=bloccate.map((p,i)=>{
    const im=D.immobili[parseInt(p.immRef)];
    return `• ${im?(im.tipo||'Immobile')+' — '+(im.comune||''):('Immobile #'+(p.immRef||'?'))} / Acquirente: ${p.acquirente||'n.d.'}`;
  }).join('\n');
  dlgConfirm(
    `Trovate ${bloccate.length} pratica/e bloccata/e (stato=proposta ma immobile=attivo):\n\n${elenco}\n\nVuoi eliminarle?`,
    '','Correggi Pratiche Bloccate'
  ).then(ok=>{
    if(!ok) return;
    // Elimina le pratiche bloccate
    D.pratiche=D.pratiche.filter((p,idx)=>{
      if(p.stato!=='proposta') return true;
      const im=D.immobili[parseInt(p.immRef)];
      if(!im||(im.stato||'')==='attivo') return false;
      return true;
    });
    saveD(); renderPratiche(); updateBadges();
    showToast(` ${bloccate.length} pratica/e bloccata/e rimossa/e`,'','');
  });
}
function renderPratiche(){
  const pd=document.getElementById('pd-prat');if(pd)pd.textContent=new Date().toLocaleDateString('it-IT');
  const q=(document.getElementById('f-prat-q')?.value||'').toLowerCase();
  // Mostra SOLO pratiche in stato 'proposta' E il cui immobile non è tornato attivo
  const f=D.pratiche.map((p,i)=>({p,i})).filter(({p})=>{
    if((p.stato||'')!=='proposta') return false;
    // Doppio controllo: se l'immobile è tornato 'attivo' questa pratica non è più in proposta
    const im=D.immobili[parseInt(p.immRef)];
    if(im&&(im.stato||'')==='attivo') return false;
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
    +'<th style="width:52px">Foto</th><th>#</th><th>Immobile</th><th>Esito</th>'
    +'<th>Venditore</th><th>Acquirente</th><th>Tel. Acq.</th>'
    +'<th>Importo Prop.</th><th>Caparra</th><th>Data Prop.</th><th>Scad. Prop.</th><th>Data Rogito</th><th></th>'
    +'</tr></thead><tbody>'
    +f.map(({p,i},rowIdx)=>{
      const im=D.immobili[parseInt(p.immRef)];
      const foto=im?.foto||'';
      const fotoCell=foto
        ?`<td style="padding:4px 6px"><img src="${foto}" style="width:46px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" loading="lazy"></td>`
        :`<td style="padding:4px 6px"><div style="width:46px;height:36px;background:#F1F5F9;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:1rem;color:#CBD5E1"></div></td>`;
      const esito=p.esitoProp||'in_corso';
      const esitoBg=esito==='accettata'?'#10B981':esito==='in_corso'?'#F59E0B':'#EF4444';
      const esitoLabel=esito==='accettata'?' Accettata':esito==='in_corso'?' In Corso':' '+esito;
      const esitoPill=`<span style="background:${esitoBg};color:white;padding:2px 9px;border-radius:12px;font-size:0.7rem;font-weight:700;white-space:nowrap">${esitoLabel}</span>`;
      const immTit=im?(im.tipo||'Immobile')+(im.comune?' — '+im.comune:''):'—';
      const immRef=im?.ref?`<span style="font-size:0.68rem;color:var(--text4)">#${im.ref}</span> `:'';
      // Evidenzia se proposta scaduta
      const oggi=today();
      const scaduta=p.scadProp&&p.scadProp<oggi&&esito==='in_corso';
      const rowBg=scaduta?'background:#FFF7ED':'';
      return`<tr style="${rowBg}">
        ${fotoCell}
        <td style="color:var(--text3);font-size:0.78rem">${rowIdx+1}</td>
        <td><div style="font-weight:600;font-size:0.85rem">${immRef}${immTit}</div></td>
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
