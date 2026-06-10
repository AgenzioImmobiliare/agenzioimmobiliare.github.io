// core/state.js — stato applicativo (oggetto D) + pub/sub.
//
// CONVIVENZA COL MONOLITE (Strangler Fig):
// Il proprietario di window.D è il MONOLITE quando è presente: la sua riga
// `window.D = D` contiene i dati reali idratati da loadD(). state.js NON deve
// sovrascriverlo (cancellerebbe i dati). Quindi:
//   - se window.D esiste gia'  -> lo ADOTTIAMO (i moduli operano su quello);
//   - altrimenti (Vite stand-alone, senza monolite) -> installiamo il nostro _default.
// In entrambi i casi `_live` e' l'oggetto stato effettivo su cui get/set operano.

// Forma di default (usata solo in stand-alone, senza monolite).
// Rispecchia la definizione del monolite + brchProjects (garantito da loadD).
const _default = {
  clienti: [], immobili: [], richieste: [], pratiche: [], visite: [],
  eventi: [], informatori: [], notizie: [], agenti: [], provvigioni: [],
  altriIncassi: [], fatture: [], incassiNonFatt: [], primaNota: [],
  socialLog: [], cacciAnnunci: [], rvLog: {}, mktLog: [], valutazioni: [],
  clientiFattura: [], attivita: [], leadsWeb: [], timeline: [],
  brchProjects: [],
  imView: 'grid',
  calY: new Date().getFullYear(), calM: new Date().getMonth(),
  calD: new Date().getDate(), calView: 'mese',
  editIdx: null, editType: null, reportImmIdx: null, schedaCliIdx: null,
};

// `_live` = oggetto stato reale. Determinato subito in base alla presenza del monolite.
let _live;
try {
  if (typeof window !== 'undefined' && window.D && typeof window.D === 'object') {
    _live = window.D;                 // adotta lo stato del monolite (coi dati)
  } else {
    _live = _default;
    if (typeof window !== 'undefined') window.D = _live;  // stand-alone
  }
} catch (e) {
  _live = _default;
}

// --- Pub/Sub ----------------------------------------------------------------
const _subs = new Map(); // key -> Set<fn>;  '*' = qualunque cambiamento

function subscribe(key, fn) {
  if (!_subs.has(key)) _subs.set(key, new Set());
  _subs.get(key).add(fn);
  return function unsubscribe() { _subs.get(key)?.delete(fn); };
}

function _notify(key, value) {
  _subs.get(key)?.forEach(function (fn) { try { fn(value, key); } catch (e) { console.error(e); } });
  _subs.get('*')?.forEach(function (fn) { try { fn(value, key); } catch (e) { console.error(e); } });
}

// --- Accesso controllato -----------------------------------------------------
function get(key) { return _live[key]; }

function set(key, value) {
  _live[key] = value;
  _notify(key, value);
}

function update(key, mutator) {
  mutator(_live[key]);
  _notify(key, _live[key]);
}

// notifica manuale (per il legacy che muta D direttamente e poi vuole avvisare i moduli)
function touch(key) { _notify(key || '*', key ? _live[key] : _live); }

// riferimento diretto all'oggetto stato reale
function raw() { return _live; }

export const state = { get, set, update, subscribe, touch, raw };
