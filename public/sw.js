/* Sportron service worker: offline page + hashed-bundle cache. Never caches API/auth traffic. */
const VERSION = 'v1';
const SHELL_CACHE = `sportron-shell-${VERSION}`;
const ASSET_CACHE = `sportron-assets-${VERSION}`;
const SHELL = ['/offline.html', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Cross-origin (Supabase, Cloudinary, Google) and auth callbacks are never touched.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/auth/')) return;

  if (req.mode === 'navigate') {
    // Network-first so a new deploy is never hidden behind a cached index.html.
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }

  if (url.pathname.startsWith('/_expo/static/')) {
    // Content-hashed files: safe to serve from cache forever.
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
});
