// オフライン（海の上・電波が弱い場所）でも開けるように、アプリ本体をキャッシュする。
// 同じサイトのファイルは「ネット優先、だめならキャッシュ」。地図タイルやFirebaseは対象外。
const CACHE = 'gyokaku-v6';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'config.js', 'data/market.json', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const same = u.origin === location.origin, leaflet = u.hostname === 'unpkg.com';
  if (!same && !leaflet) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
