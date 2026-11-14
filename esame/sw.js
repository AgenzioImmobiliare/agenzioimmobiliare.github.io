/* Simulatore Esame Mediatore: funziona anche senza internet.
   Quando si aggiornano i file della cartella, alzare il numero di versione qui sotto. */
var CACHE = 'esame-mediatore-v3';
var FILES = ['./', 'index.html', 'mappe.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      /* tocca solo le proprie cache, mai quelle del gestionale */
      if (k !== CACHE && k.indexOf('esame-mediatore-') === 0) return caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  /* prima la rete (per avere gli aggiornamenti), poi la copia salvata se manca internet */
  e.respondWith(
    fetch(e.request).then(function (r) {
      if (r && r.status === 200) { var c = r.clone(); caches.open(CACHE).then(function (cache) { cache.put(e.request, c); }); }
      return r;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (c) { return c || caches.match('index.html'); });
    })
  );
});
