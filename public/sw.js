/* Telegraf Service Worker - PWA shell + Web Push notifications */
const CACHE_NAME = 'telegraf-cache-v2';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/android/launchericon-192x192.png',
  '/icons/android/launchericon-512x512.png',
  '/icons/ios/180.png',
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch: network-first for navigation, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip non-http(s) requests (e.g. chrome-extension://)
  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  if (url.origin !== self.location.origin) return;

  // Never cache Next.js runtime/build assets. Stale chunks can make React render
  // imported components as undefined after an app update.
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigation requests: always use the network so HTML points at the current build.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request));
    return;
  }

  const isSafeStaticAsset =
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname === '/manifest.json';

  if (!isSafeStaticAsset) {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets that are safe across builds: cache-first, then network.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

// Push: display notification from server
self.addEventListener('push', (event) => {
  let data = { title: 'Telegraf', body: 'New message', url: '/' };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    // Fallback to default data if JSON parsing fails
  }

  const options = {
    body: data.body,
    icon: '/icons/android/launchericon-192x192.png',
    badge: '/icons/android/launchericon-192x192.png',
    data: { url: data.url },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click: open or focus the target URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab if one is open
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    }),
  );
});
