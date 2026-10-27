const CACHE_NAME = 'voxa-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/voxa-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API calls; client IndexedDB + sync queue handles offline persistence honestly.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  // Navigation requests: network first, fallback to cached shell for offline PWA startup
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/') || caches.match('/index.html'))
    );
    return;
  }

  // Static same-origin assets: stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const net = fetch(request)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || net;
      })
    );
  }
});
