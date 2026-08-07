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
export async function clearPushNotifications(chatId?: string): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }

  // 1. Reset the App Badge API (Badging API) if supported.
  //    Uses the centralized resetBadge() which also persists count to localStorage.
  resetBadge();

  // 2. Directly clear badge as a safety net (works even without SW controller)
  if ('clearAppBadge' in navigator) {
    try {
      (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge();
    } catch {
      // Ignore
    }
  }

  // 3. Ask the Service Worker to close active push notifications.
  //    Use navigator.serviceWorker.ready as fallback when controller is null
  //    (e.g. right after SW activation before it claims the page).
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sw = registration.active || navigator.serviceWorker.controller;
      if (sw) {
        sw.postMessage({ type: 'CLEAR_NOTIFICATIONS', chatId });
        // If no specific chatId, also do a full badge reset
        if (!chatId) {
          sw.postMessage({ type: 'RESET_BADGE' });
        }
      }
    } catch {
      // Ignore – service worker may not be ready/available
    }
  }
}
