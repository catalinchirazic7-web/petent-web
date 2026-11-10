/* Petent — service worker pentru functionare offline.
   Fara cont, fara server, fara telemetry. Doar fisierele acestui site.
   Strategie: navigare = retea intai (cu copie proaspata in cache), rest = cache intai.
   Astfel, cand exista net, vezi mereu ultima versiune publicata; fara net, merge din cache. */
const CACHE = 'petent-offline-v1';
const CORE = [
  './', './index.html', './manifest.webmanifest', './teste.html',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k.indexOf('petent-offline-') === 0)
                                   .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', ev => {
  if (ev.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    ev.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) {
          /* Păstrăm două copii: sub URL-ul cerut ȘI sub cheia fixă folosită la fallback-ul
             offline. Altfel, după o publicare nouă, utilizatorul offline primea vechea copie
             din install, deși navigarea online era proaspătă. */
          const c1 = res.clone(), c2 = res.clone();
          caches.open(CACHE)
            .then(c => Promise.all([c.put(req, c1), c.put('./index.html', c2)]))
            .catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  ev.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
