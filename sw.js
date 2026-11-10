/* Petent — service worker pentru functionare offline.
   Fara cont, fara server, fara telemetry. Doar fisierele acestui site.
   Strategie: navigare = retea intai (cu copie proaspata in cache), rest = cache intai.
   Astfel, cand exista net, vezi mereu ultima versiune publicata; fara net, merge din cache. */
const CACHE = 'petent-offline-v2';
const APP_ROOT = new URL('./', self.registration.scope).pathname;
const APP_HTML = new URL('./index.html', self.registration.scope).pathname;
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
    /* waitUntil se apelează SINCRON (din .then() poate fi refuzat), dar printr-un
       deferred preia ulterior promisiunea scrierilor, ca SW-ul să nu fie oprit înainte
       ca acestea să termine. */
    let done;
    const jobs = new Promise(r => { done = r; });
    ev.waitUntil(jobs);
    ev.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) {
          /* Copie proaspătă sub URL-ul cerut. Cheia fixă ./index.html (fallback-ul offline)
             o actualizăm DOAR când navigarea e chiar aplicația: altfel o vizită la teste.html
             putea lăsa pagina de teste drept „aplicație" pentru offline. */
          const isApp = (url.pathname === APP_ROOT || url.pathname === APP_HTML);
          const c1 = res.clone(), c2 = isApp ? res.clone() : null;
          done(
            caches.open(CACHE)
              .then(c => Promise.all([c.put(req, c1)].concat(isApp ? [c.put('./index.html', c2)] : [])))
              .catch(() => {})
          );
        } else {
          done();
        }
        return res;
      }).catch(() => {
        done();
        return caches.match(req).then(hit => hit || caches.match('./index.html'));
      })
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
