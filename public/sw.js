const CACHE_NAME = 'telegraf-cache-v7';

// ── Install ──────────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  // Clear ALL old caches on activation — we don't cache app assets,
  // Vercel/Next.js handles immutable hashed bundles on its own CDN.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('telegraf-cache-'))
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

// ── Badge helpers ────────────────────────────────────────
async function updateBadgeFromNotifications(badgeCountOverride) {
  try {
    let count = badgeCountOverride;
    if (typeof count !== 'number') {
      const notifications = await self.registration.getNotifications();
      count = notifications.length;
    }
    if ('setAppBadge' in self.navigator) {
      if (count > 0) {
        await self.navigator.setAppBadge(count);
      } else {
        await self.navigator.clearAppBadge();
      }
    }
  } catch (e) {
    console.error('[SW] Error updating badge:', e);
  }
}

async function clearBadge() {
  try {
    if ('clearAppBadge' in self.navigator) {
      await self.navigator.clearAppBadge();
    } else if ('setAppBadge' in self.navigator) {
      await self.navigator.setAppBadge(0);
    }
  } catch (e) {
    console.error('[SW] Error clearing badge:', e);
  }
}

/** Broadcast a message to every controlled window/tab. */
async function broadcastToClients(message) {
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
  for (const client of windowClients) {
    client.postMessage(message);
  }
}

// ── Push ─────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let notificationData;
  try {
    notificationData = event.data.json();
  } catch (err) {
    console.error('[SW] Failed to parse push payload:', err);
    return;
  }

  const chatId = notificationData.chatId;
  const targetUrl = notificationData.url || (chatId ? `/chat/${chatId}` : '/chat');

  const options = {
    body: notificationData.body || 'Нове повідомлення',
    icon: '/icons/android/launchericon-192x192.png',
    badge: '/icons/android/launchericon-96x96.png',
    data: {
      url: targetUrl,
      chatId: chatId,
    },
    tag: `chat-${chatId}`,
    renotify: true,
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  const badgeCount = typeof notificationData.badgeCount === 'number' ? notificationData.badgeCount : undefined;

  const promiseChain = self.registration
    .showNotification(notificationData.title || 'Telegraf', options)
    .then(() => updateBadgeFromNotifications(badgeCount))
    .then(() => broadcastToClients({ type: 'INCREMENT_BADGE', count: badgeCount }));

  event.waitUntil(promiseChain);
});

// ── Notification click ───────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const chatId = event.notification.data?.chatId;
  const targetUrl = event.notification.data?.url || (chatId ? `/chat/${chatId}` : '/chat');

  const promiseChain = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(async (windowClients) => {
      // 1. If an open browser window/tab exists, focus it and trigger Next.js SPA navigation
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          await client.focus();
          client.postMessage({
            type: 'NAVIGATE_TO_CHAT',
            url: targetUrl,
            chatId: chatId,
          });
          return;
        }
      }

      // 2. If no window is open, open a fresh window directly to the target chat URL
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
    .then(() => updateBadgeFromNotifications());

  event.waitUntil(promiseChain);
});

// ── Notification close (swipe away) ──────────────────────
self.addEventListener('notificationclose', (event) => {
  event.waitUntil(updateBadgeFromNotifications());
});

// ── Messages from client ─────────────────────────────────
self.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) return;

  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_NOTIFICATIONS':
      event.waitUntil(
        self.registration.getNotifications().then((notifications) => {
          for (const notification of notifications) {
            if (!event.data.chatId || notification.data?.chatId === event.data.chatId) {
              notification.close();
            }
          }
          return updateBadgeFromNotifications();
        }),
      );
      break;

    case 'RESET_BADGE':
      event.waitUntil(
        self.registration.getNotifications().then((notifications) => {
          for (const notification of notifications) {
            notification.close();
          }
          return clearBadge();
        }),
      );
      break;

    default:
      break;
  }
});