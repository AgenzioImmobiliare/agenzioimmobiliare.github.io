// core/pwa.js — registrazione Service Worker + auto-update.
// Sostituisce lo script inline che creava il SW via Blob.
// Il manifest ora è un file fisico (manifest.webmanifest) linkato nell'<head>,
// quindi non serve più generarlo runtime.

export function registerPWA() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(function (reg) {
        console.log('[PWA] Service Worker registrato');

        /* AUTO-UPDATE: se trova un nuovo SW in attesa, lo attiva e ricarica. */
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });

        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] Nuova versione installata, ricarico…');
              try {
                if (typeof window.showToast === 'function')
                  window.showToast('🔄 App aggiornata — ricarico…', '', '#2563EB');
              } catch (_) {}
              setTimeout(function () { window.location.reload(); }, 800);
            }
          });
        });

        /* Forza check ogni avvio + ogni 30 minuti */
        try { reg.update(); } catch (_) {}
        setInterval(function () { try { reg.update(); } catch (_) {} }, 30 * 60 * 1000);
      })
      .catch(function (e) { console.warn('[PWA] SW KO:', e); });

    /* Quando il SW cambia (nuova versione attivata), ricarica una sola volta */
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
