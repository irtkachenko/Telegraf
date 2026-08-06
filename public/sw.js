/* Telegraf Service Worker - PWA Shell + Safe Caching + Web Push */

const CACHE_NAME = 'telegraf-cache-v3';

// Файли, які гарантовано кешуємо при інсталяції Service Worker
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/android/launchericon-192x192.png',
  '/icons/android/launchericon-512x512.png',
  '/icons/ios/180.png',
];

// 1. Install Event: Пре-кешування статичних іконок та маніфесту
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Видалення старих версій кешу та негайне перехоплення контролю
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Повідомляємо всі відкриті вкладки, що нова версія SW активована
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'NEW_VERSION_ACTIVATED' });
          });
        });
      })
  );
});

// 2.1 Message Event: Обробка запиту на негайне оновлення від клієнта
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 3. Fetch Event: Абсолютно безпечний обробник мережевих запитів
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Обробляємо тільки звичайні GET-запити
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ігноруємо розширення браузера та зовнішні ресурси (із сторонніх доменів)
  if (!url.protocol.startsWith('http')) return;
  if (url.origin !== self.location.origin) return;

  // 🚨 ЗОНА БЕЗПЕКИ: Повний обхід Service Worker для динамічного контенту!
  // Якщо ми робимо просто `return;` без `event.respondWith()`, браузер 
  // обробляє запити через стандартну мережу. Це 100% захищає від білих/чорних екранів при F5.
  
  // - Навігація (перехід по сторінках / оновлення F5 / HTML)
  // - API роути Next.js та Supabase
  // - Runtime бандли Next.js (файли з /_next/)
  if (
    request.mode === 'navigate' ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Кешуємо тільки ТІЛЬКИ безпечні статичні файли (зображення, шрифти, маніфест)
  const isSafeStaticAsset =
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname === '/manifest.json';

  if (!isSafeStaticAsset) {
    return;
  }

  // Стратегія Cache-First для статичних ресурсів (медіа та шрифти)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Зберігаємо в кеш тільки успішні відповіді
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      }).catch((err) => {
        console.warn('[SW] Static asset fetch failed:', err);
        // Повертаємо пусту відповідь замість помилки промісу
        return new Response('', { status: 404, statusText: 'Not Found' });
      });
    })
  );
});

// 4. Push Event: Прийом та відображення пуш-повідомлень від сервера
self.addEventListener('push', (event) => {
  let data = { title: 'Telegraf', body: 'Нове повідомлення', url: '/' };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    // Якщо прийшов не JSON, використовуємо дефолтний фолбек
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

// 5. Notification Click Event: Клік по пуш-повідомленню
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Якщо вкладка додатка вже відкрита — фокусуємося на ній
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Інакше відкриваємо нову вкладку
      return self.clients.openWindow(targetUrl);
    })
  );
});