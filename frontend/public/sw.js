/* Qatar HMS service worker: the app opens offline, recently viewed data stays readable, and the page queues a few safe writes itself. */
const VER = 'hms-v1';
const SHELL = `${VER}-shell`;      // app files
const DATA = `${VER}-data`;        // recently read API answers (cleared at logout)
const NO_CACHE_API = /^\/api\/(auth\/login|public|whatsapp|notify|billing\/day-close\/reopen)/;
const MAX_DATA = 400;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await c.addAll(['/', '/manifest.webmanifest', '/icon-192.png']).catch(() => {});
    try {                                           // every built file, so any page works offline after the first visit
      const list = await (await fetch('/precache.json', { cache: 'no-store' })).json();
      await Promise.all(list.map((u) => c.add(u).catch(() => {})));
    } catch { /* first run without the list: files are cached as they are used */ }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('hms-') && !k.startsWith(VER)) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'clear-data') e.waitUntil(caches.delete(DATA)); });

async function trim(cache) { const ks = await cache.keys(); for (let i = 0; i < ks.length - MAX_DATA; i++) await cache.delete(ks[i]); }

self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (NO_CACHE_API.test(url.pathname) || url.searchParams.get('format') === 'csv') return;
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok && !req.headers.get('range')) { const c = await caches.open(DATA); await c.put(req, r.clone()); trim(c); }
        return r;
      } catch (err) {
        const hit = await (await caches.open(DATA)).match(req);
        if (hit) return hit;
        return new Response(JSON.stringify({ error: 'You are offline and this has not been opened before.' }), { status: 503, headers: { 'content-type': 'application/json' } });
      }
    })());
    return;
  }
  if (req.mode === 'navigate') {                    // single-page app: any page URL loads the app shell
    e.respondWith((async () => {
      try { const r = await fetch(req); if (r.ok) (await caches.open(SHELL)).put('/', r.clone()); return r; }
      catch { return (await caches.open(SHELL)).match('/') || Response.error(); }
    })());
    return;
  }
  e.respondWith((async () => {                      // built files: cache first (hashed names never change); others: network first
    const c = await caches.open(SHELL); const hit = await c.match(req);
    if (url.pathname.startsWith('/_nuxt/') && hit) return hit;
    try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; } catch { return hit || Response.error(); }
  })());
});
