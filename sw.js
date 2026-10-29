// Network-first service worker: always fresh when online, playable offline.
// Requests bypass the HTTP cache so a deploy is never mixed with stale files.
const CACHE = 'tropicool-20261029165011';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === location.origin;
  e.respondWith(
    fetch(sameOrigin ? new Request(req, { cache: 'no-cache' }) : req)
      .then((res) => {
        if (res.ok && (sameOrigin || req.url.includes('fonts.g'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: false }).then((r) => r || caches.match(req, { ignoreSearch: true }))),
  );
});
