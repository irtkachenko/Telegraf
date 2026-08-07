const CACHE_NAME = 'telegraf-cache-v5';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Допоміжна функція для оновлення badge
async function updateBadgeCount() {
  try {
    const notifications = await self.registration.getNotifications();
    const count = notifications.length;
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        await navigator.setAppBadge(count);
      } else {
        await navigator.clearAppBadge();
      }
    }
  } catch (e) {
    console.error('Error updating badge:', e);
  }
}

// Обробка вхідного push-сповіщення
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const notificationData = event.data.json();

    const options = {
      body: notificationData.body || 'Нове повідомлення',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        url: notificationData.url || '/',
        chatId: notificationData.chatId
      },
      // 🚨 КРИТИЧНІ ПАРАМЕТРИ ДЛЯ ЗВУКУ ТА ВИЛІТАЮЧОЇ ПЛАШКИ (HEADS-UP)
      tag: `chat-${notificationData.chatId}`, // Тег чату
      renotify: true,                          // Примусово показувати плашку і видавати звук повторно!
      vibrate: [200, 100, 200],                // Обов'язково для Android Heads-up
      requireInteraction: false,
      priority: 'high'
    };

    const promiseChain = self.registration
      .showNotification(notificationData.title || 'Telegraf', options)
      .then(() => updateBadgeCount());

    event.waitUntil(promiseChain);
  } catch (err) {
    console.error('Error in push event:', err);
  }
});

// Клік по сповіщенню
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  const promiseChain = clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    for (let client of windowClients) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        client.focus();
        if ('navigate' in client) {
          client.navigate(targetUrl);
        }
        return;
      }
    }
    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  }).then(() => updateBadgeCount());

  event.waitUntil(promiseChain);
});

// Обробка команд від клієнта
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_NOTIFICATIONS') {
    event.waitUntil(
      self.registration.getNotifications().then((notifications) => {
        notifications.forEach((notification) => {
          if (!event.data.chatId || notification.data?.chatId === event.data.chatId) {
            notification.close();
          }
        });
        return updateBadgeCount();
      })
    );
  }
});