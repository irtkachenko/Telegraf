/* Telegraf Service Worker - PWA Shell + Safe Caching + Web Push */

const CACHE_NAME = 'telegraf-cache-v4'; // Піднято версію для примусового оновлення

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

// 2.1 Message Event: Обробка запитів від клієнта
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Очищення всіх активних push-сповіщень та скидання badge у фоні
  if (event.data && event.data.type === 'CLEAR_NOTIFICATIONS') {
    event.waitUntil(
      self.registration.getNotifications().then((notifications) => {
        notifications.forEach((notification) => notification.close());
        if ('clearAppBadge' in navigator) {
          navigator.clearAppBadge().catch(() => {});
        } else if ('setAppBadge' in navigator) {
          navigator.setAppBadge(0).catch(() => {});
        }
      })
    );
  }

  // Скидання badge до 0 — клієнт повідомляє про закриття сповіщень чи читання
  if (event.data && event.data.type === 'RESET_BADGE') {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    } else if ('setAppBadge' in navigator) {
      navigator.setAppBadge(0).catch(() => {});
    }

    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'RESET_BADGE' });
      });
    });
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
  if (
    request.mode === 'navigate' ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Кешуємо ТІЛЬКИ безпечні статичні файли (зображення, шрифти, маніфест)
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
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      }).catch((err) => {
        console.warn('[SW] Static asset fetch failed:', err);
        return new Response('', { status: 404, statusText: 'Not Found' });
      });
    })
  );
});

// 4. Push Event: Прийом та відображення пуш-повідомлень від сервера
self.addEventListener('push', (event) => {
  let data = { title: 'Telegraf', body: 'Нове повідомлення', url: '/', chatId: null };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    // Якщо прийшов не JSON, використовуємо дефолтний фолбек
  }

  const tag = data.chatId ? 'chat-' + data.chatId : 'general';

  // Якщо додаток відкритий у фокусі/вкладці — повідомляємо клієнт
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'INCREMENT_BADGE',
        chatId: data.chatId ?? null,
      });
    });
  });

  // Опції сповіщення з високим пріоритетом для появи вилітаючої плашки (Heads-Up)
  const options = {
    body: data.body,
    icon: '/icons/android/launchericon-192x192.png',
    badge: '/icons/android/launchericon-192x192.png',
    data: { url: data.url, chatId: data.chatId },
    vibrate: [200, 100, 200], // Агресивніший паттерн вібрації
    renotify: true,
    tag: tag,
    priority: 'high',          // Високий пріоритет для плашки
    urgency: 'high',           // Підказка браузеру про терміновість
    timestamp: Date.now(),
  };

  event.waitUntil(
    (async () => {
      // 1. Показуємо повідомлення
      await self.registration.showNotification(data.title, options);

      // 2. Рахуємо реально кількість активних сповіщень у шторці і ставимо точний badge
      if ('setAppBadge' in navigator) {
        try {
          const activeNotifications = await self.registration.getNotifications();
          await navigator.setAppBadge(activeNotifications.length);
        } catch {
          // Ігноруємо помилки Badging API
        }
      }
    })()
  );
});

// 5. Notification Click Event: Клік по пуш-сповіщенню
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';
  const normalizedUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      // Оновлюємо бейдж після закриття/кліку по сповіщенню
      if ('setAppBadge' in navigator) {
        try {
          const remaining = await self.registration.getNotifications();
          if (remaining.length > 0) {
            await navigator.setAppBadge(remaining.length);
          } else if ('clearAppBadge' in navigator) {
            await navigator.clearAppBadge();
          } else {
            await navigator.setAppBadge(0);
          }
        } catch {}
      }

      // 1. Якщо ХОЧ БИ ОДНА вкладка PWA вже відкрита:
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NAVIGATE_TO_CHAT',
            url: normalizedUrl,
            chatId: event.notification.data?.chatId ?? null,
          });
          return client.focus();
        }
      }

      // 2. Якщо PWA повністю закрите:
      return self.clients.openWindow(normalizedUrl);
    })
  );
});