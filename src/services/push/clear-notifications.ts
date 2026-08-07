'use client';

import { resetBadge } from '@/components/layout/PwaRegister';

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
  //    Uses the centralized resetBadge() which also persists count to localStorage.
  resetBadge();

  // 2. Ask the Service Worker to close every active push notification.
  //    On Android this resets the system unread-notification counter that
  //    renders on the PWA icon.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'CLEAR_NOTIFICATIONS' });
      // Notify the client (and other tabs) to reset their badge counter state
      registration.active?.postMessage({ type: 'RESET_BADGE' });
    } catch {
      // Ignore – service worker may not be ready/available
    }
  }
}
