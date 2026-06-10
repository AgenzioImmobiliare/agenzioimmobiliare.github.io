/* sw.js — Service Worker FISICO (servito da root, scope './').
   Logica identica al SW inline originale del monolite.
   IMPORTANTE: quando esce un aggiornamento, bumpa CACHE='lecase-vN'
   per invalidare la cache HTML/JS e forzare il telefono a scaricare il nuovo codice. */

var CACHE = 'lecase-v14';            /* era v13 nel monolite: bump perché ora i bundle hanno hash diversi */
var FOTO_CACHE = 'lecase-foto-v1';

self.addEventListener('install', function (e) { self.skipWaiting(); });

/* Permette al codice di registrazione di forzare l'attivazione del SW in attesa */
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        /* Elimina le vecchie cache HTML/JS (non-foto) di versioni precedenti */
        if (k !== CACHE && k !== FOTO_CACHE && k.indexOf('lecase-') === 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);

  /* Cache opportunistica per foto Firebase Storage (stale-while-revalidate) */
  if (url.hostname === 'firebasestorage.googleapis.com' && url.pathname.indexOf('/o/') >= 0) {
    e.respondWith(
      caches.open(FOTO_CACHE).then(function (cache) {
        return cache.match(e.request).then(function (cached) {
          var fetchPromise = fetch(e.request).then(function (r) {
            if (r && r.status === 200) cache.put(e.request, r.clone());
            return r;
          }).catch(function () { return cached; });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  /* Non cachare altre richieste cloud Firebase, Google, ecc. */
  if (url.hostname.indexOf('googleapis.com') >= 0 ||
      url.hostname.indexOf('firebaseio.com') >= 0 ||
      url.hostname.indexOf('gstatic.com') >= 0) return;

  /* Per la navigazione (index.html): network-first così l'utente vede sempre il codice aggiornato.
     Solo se offline, fallback alla cache. */
  if (e.request.mode === 'navigate' || url.pathname === '/' ||
      url.pathname.endsWith('/index.html') || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(function (r) {
        if (r && r.status === 200) {
          var c = r.clone();
          caches.open(CACHE).then(function (cache) { cache.put(e.request, c); });
        }
        return r;
      }).catch(function () {
        return caches.match(e.request).then(function (c) { return c || caches.match('./'); });
      })
    );
    return;
  }

  /* Altri asset (immagini, font, css, js esterni): cache-first */
  e.respondWith(
    fetch(e.request).then(function (r) {
      if (r && r.status === 200 && r.type === 'basic') {
        var c = r.clone();
        caches.open(CACHE).then(function (cache) { cache.put(e.request, c); });
      }
      return r;
    }).catch(function () {
      return caches.match(e.request).then(function (c) { return c || caches.match('./'); });
    })
  );
});
