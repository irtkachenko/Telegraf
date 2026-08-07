'use client';

/**
 * Closes all active push notifications via the Service Worker and resets
 * the PWA app badge counter (navigator.setAppBadge / clearAppBadge).
 *
 * This is used after a chat is marked as read to ensure the Android home
 * screen badge / unread counter is cleared when the user has read the
 * messages.
 */
export async function clearPushNotifications(): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }

  // 1. Reset the App Badge API (Badging API) if supported.
  if ('setAppBadge' in navigator) {
    try {
      await navigator.setAppBadge(0);
    } catch {
      // Ignore – badge API may not be available in all contexts
    }
  } else if ('clearAppBadge' in navigator) {
    try {
      await (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge();
    } catch {
      // Ignore
    }
  }

  // 2. Ask the Service Worker to close every active push notification.
  //    On Android this resets the system unread-notification counter that
  //    renders on the PWA icon.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'CLEAR_NOTIFICATIONS' });
    } catch {
      // Ignore – service worker may not be ready/available
    }
  }
}
