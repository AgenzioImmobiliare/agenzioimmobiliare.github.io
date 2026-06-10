// core/store.js — persistenza.
//
// DECISIONE ARCHITETTURALE (importante): NON reimplemento saveD/loadD.
// Le funzioni originali del monolite (~120 righe ciascuna) gestiscono:
//   - chiave localStorage PER-UTENTE: lecaseAZ2_{uid} (non solo 'lecaseAZ2')
//   - parse protetto anti-corruzione (salva copia _corrotto_ + avvisa)
//   - foto base64 in cache SEPARATA (key + '_fotoCache'), keyed per ref/uuid
//   - eventi calendario esterno (_extCalId) salvati a parte per evitare duplicati
//   - gestione QUOTA: ritenta senza foto se localStorage è pieno
//   - replacer che esclude editIdx/editType dalla serializzazione
//   - timestamp _localTs per il merge cloud-vs-locale
//   - push Firestore a valle
// Sono dettagli conquistati con mesi di bugfix. Riscriverli = reintrodurre quei bug.
//
// Quindi lo store fa da ADATTATORE: delega a window.saveD/window.loadD (ancora
// nel monolite, esposte su window) e fornisce un'interfaccia pulita ai moduli
// nuovi. Quando — in una fase MOLTO successiva e isolata — vorrai spostare
// fisicamente saveD/loadD qui dentro, lo farai SENZA cambiarne la logica,
// solo trasferendo il corpo e i suoi helper (_lsKey, _injectFotoCache, ...).

import { state } from './state.js';

// ─── Load: idrata D dal localStorage tramite la loadD del monolite ───────────
export function loadLocal() {
  if (typeof window.loadD === 'function') {
    window.loadD();        // popola window.D (= stesso oggetto di state.raw())
    state.touch('*');      // notifica i subscriber nuovi che lo stato è cambiato
  } else {
    console.warn('[store] window.loadD non disponibile (monolite non caricato?)');
  }
}

// ─── Save: delega alla saveD del monolite ────────────────────────────────────
export function saveLocal() {
  if (typeof window.saveD === 'function') {
    window.saveD();
  } else {
    console.warn('[store] window.saveD non disponibile');
  }
}

// ─── Autosave reattivo per i MODULI NUOVI ────────────────────────────────────
// Il codice legacy chiama già saveD() esplicitamente nei suoi 175 punti: quello
// continua a funzionare. Questo hook serve SOLO ai moduli migrati che usano
// state.set()/update(): quando cambiano un dato, salviamo (con debounce per non
// martellare il localStorage). Non si attiva sulle mutazioni dirette di D fatte
// dal legacy, perché quelle non passano dal pub/sub — ed è giusto così: evitiamo
// doppi salvataggi durante la transizione.
let _saveTimer = null;
let _autosaveOn = false;

export function enableReactiveAutosave(ms = 800) {
  if (_autosaveOn) return;
  _autosaveOn = true;
  state.subscribe('*', function () {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveLocal, ms);
  });
}

// Chiavi dati persistite (utile ai moduli per sapere cosa è "dato" vs "stato UI").
// Riflette ciò che saveD serializza e _ensureDArrays garantisce.
export const DATA_KEYS = [
  'clienti', 'immobili', 'richieste', 'pratiche', 'visite', 'eventi',
  'informatori', 'notizie', 'agenti', 'provvigioni', 'altriIncassi',
  'fatture', 'incassiNonFatt', 'primaNota', 'socialLog', 'cacciAnnunci',
  'rvLog', 'mktLog', 'valutazioni', 'clientiFattura', 'attivita',
  'leadsWeb', 'timeline', 'brchProjects',
];
