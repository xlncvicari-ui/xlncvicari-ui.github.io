// Surge League app: plays offline after the first launch. Always tries the live file first so updates arrive right away.
const CACHE = 'surge-league-app-9943340669';
const FILES = ["./","v1/","fonts/OFL.txt","fonts/exo2-latin.woff2","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","index.html","js/data.js","js/game.js","js/kit.js","js/look.js","js/net.js","js/profile.js","js/realms.js","js/styles.js","js/ui.js","lib/aframe.min.js","lib/fonts/Roboto-msdf.json","lib/fonts/Roboto-msdf.png","lib/offline.js","manifest.webmanifest","v1/index.html","v3/index.html","v3/js/combat.js","v3/js/data.js","v3/js/game.js","v3/js/gfx.js","v3/js/kit.js","v3/js/look.js","v3/js/net.js","v3/js/profile.js","v3/js/realms.js","v3/js/styles.js","v3/js/ui.js"];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => null))))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('surge-league-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || Response.error())));
});
