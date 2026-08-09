const CACHE_NAME = 'telegraf-cache-v10';

// ── Install ──────────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
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
  const messageId = notificationData.messageId;
  const targetUrl = notificationData.url || (chatId ? `/chat/${chatId}` : '/chat');

  // Absolute URLs for icons are required by Android OS for background heads-up notifications
  const origin = self.location.origin;
  const iconUrl = new URL('/icons/android/launchericon-192x192.png', origin).href;
  const badgeUrl = new URL('/icons/android/launchericon-96x96.png', origin).href;

  // Unique tag per message + requireInteraction force Android OS to wake up
  // and trigger a high-priority Heads-Up Popup banner even on lockscreen.
  const notificationTag = messageId ? `msg-${messageId}` : `msg-${Date.now()}`;

  const options = {
    body: notificationData.body || 'Нове повідомлення',
    icon: iconUrl,
    badge: badgeUrl,
    data: {
      url: targetUrl,
      chatId: chatId,
      messageId: messageId,
    },
    tag: notificationTag,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300],
    timestamp: Date.now(),
    silent: false,
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
      // 1. If an open window/tab exists, focus it and tell Next.js router to push to the target chat
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

      // 2. If app is closed, open a new window directly to the target chat URL
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