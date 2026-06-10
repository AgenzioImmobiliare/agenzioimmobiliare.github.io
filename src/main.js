// main.js — ENTRY POINT dell'applicazione.
// Fase 1: stili estratti + PWA.
// Fase 2 (attuale): stato incapsulato (state.js) + persistenza adattata (store.js).
// Fasi successive: import dei moduli (modules/*) e routing.

// 1. Stili — un solo import, l'ordine di cascata è gestito in styles/index.css
import './styles/index.css';

// 2. Stato — DEVE essere importato PRIMA che il monolite definisca `D`.
//    state.js fa `window.D = _D`. Il monolite a riga ~14259 fa `let D = {...}`:
//    quella `let` è scoped al suo blocco <script> e NON sovrascrive window.D,
//    ma la riga successiva del monolite (`window.D = D`) sì.
//    REGOLA DI TRANSIZIONE: finché il monolite gira, lui è il proprietario di D.
//    state.js si limita a esporre la stessa forma e a fornire il pub/sub.
//    Quando il monolite verrà smontato, state.js resterà l'unico proprietario.
import { state } from './core/state.js';

// 3. PWA — registrazione Service Worker fisico + auto-update
import { registerPWA } from './core/pwa.js';

// 4. Store — adattatore a saveD/loadD del monolite
import { loadLocal, enableReactiveAutosave } from './core/store.js';

// 5. Moduli migrati (Fase 3). Importarli registra le loro funzioni su window
//    (bridge) così il monolite e gli onclick legacy continuano a trovarle.
//    Primo modulo estratto: Richieste (desktop + mobile + report).
import './modules/richieste/index.js';

// Espongo lo stato in console per debug durante la migrazione
try { window.__state = state; } catch (e) {}

// ─────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────
function boot() {
  registerPWA();

  // Carica i dati locali SOLO se il monolite (che definisce loadD) è presente.
  // In questa fase di transizione il monolite chiama già loadD() per conto suo
  // all'avvio; loadLocal() qui è il punto di aggancio per quando il bootstrap
  // diventerà l'unico responsabile dell'idratazione.
  if (typeof window.loadD === 'function') {
    loadLocal();
  }

  // Autosave reattivo: attivo solo per i moduli migrati che usano state.set/update.
  // Non interferisce con le 175 saveD() esplicite del legacy.
  enableReactiveAutosave();

  console.log('[app] bootstrap Fase 2 completato — stato + store pronti');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
