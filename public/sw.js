// Service worker: ituma app ifungura vuba (app shell) kandi ikagaragaza ubutumwa
// bwiza iyo nta internet ihari. AMAKURU (API) ntabwo abikwa hano - buri gihe
// avanwa kuri server, kugira ngo stock n'amafaranga bihore ari ukuri (nta
// kubura guhuza hagati y'abakoresha benshi).
const CACHE = 'ittp-shell-v3';
const ASSETS = ['/', '/css/style.css', '/js/app.js', '/js/api.js', '/js/i18n.js', '/manifest.webmanifest', '/logo.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.url.includes('/api/')) return; // API: buri gihe kuri network
  e.respondWith(
    fetch(req).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return r;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('/')))
  );
});
