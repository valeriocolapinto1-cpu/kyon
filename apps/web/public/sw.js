/*
 * Kyon service worker.
 * - Offline, read only: pages and the main data (projects, tasks, chat, home…) come from the
 *   network first and fall back to the last copy saved on this device. Writes are never cached.
 * - Static files with a content hash (/_next/static) are cached once: they never change.
 * - Web Push: shows notifications and opens the right page on click.
 * - On logout the page asks to forget the saved data ({ type: 'clear' }).
 */
const VERSION = 'v1';
const STATIC = `kyon-static-${VERSION}`;
const PAGES = `kyon-pages-${VERSION}`;
const DATA = `kyon-data-${VERSION}`;

/** Read-only API data worth having offline (everything else goes straight to the network). */
const DATA_PATHS = [
  /^\/api\/me$/,
  /^\/api\/home$/,
  /^\/api\/people$/,
  /^\/api\/projects$/,
  /^\/api\/projects\/[^/]+$/,
  /^\/api\/projects\/[^/]+\/tasks$/,
  /^\/api\/projects\/[^/]+\/prompts$/,
  /^\/api\/chat\/rooms$/,
  /^\/api\/chat\/rooms\/[^/]+\/messages$/,
  /^\/api\/notifications$/,
  /^\/api\/activity$/,
];
const PAGE_PATHS = ['/', '/progetti', '/chat', '/persone', '/attivita', '/settings'];

self.addEventListener('install', (event) => {
  // The app shell pages, so the first offline visit works even for a page not opened yet.
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(PAGE_PATHS))
      .catch((error) => console.warn('Shell precache failed', error))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('kyon-') && ![STATIC, PAGES, DATA].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear')
    event.waitUntil(Promise.all([caches.delete(DATA), caches.delete(PAGES)]));
});

async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    const saved = await cache.match(cacheKey);
    if (saved) {
      // Tells the page this is the copy saved on the device.
      const headers = new Headers(saved.headers);
      headers.set('x-kyon-offline', '1');
      return new Response(saved.body, { status: saved.status, headers });
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    // Pages are static shells: one copy per path (the query string only selects data).
    const key = new Request(new URL(url.pathname, self.location.origin).href);
    event.respondWith(
      networkFirst(request, PAGES, key).catch(async () => {
        const cache = await caches.open(PAGES);
        return (await cache.match('/')) ?? Response.error();
      }),
    );
    return;
  }
  if (DATA_PATHS.some((re) => re.test(url.pathname))) {
    event.respondWith(networkFirst(request, DATA));
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'Kyon', body: '', url: '/', tag: undefined };
  try {
    data = { ...data, ...event.data.json() };
  } catch (error) {
    console.warn('Push without JSON payload', error);
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      lang: 'it',
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then((w) => w.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
