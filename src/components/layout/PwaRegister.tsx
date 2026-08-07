'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const BADGE_COUNT_STORAGE_KEY = 'telegraf:badge-count';

/**
 * Gets the persisted badge count from localStorage (or 0 if unavailable).
 */
function getBadgeCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(BADGE_COUNT_STORAGE_KEY);
    return raw ? Number.parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Persists the badge count to localStorage.
 */
function setBadgeCount(count: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BADGE_COUNT_STORAGE_KEY, String(count));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Increments the unread badge counter by 1 and updates the PWA icon badge.
 */
export function incrementBadge(): number {
  const next = getBadgeCount() + 1;
  setBadgeCount(next);

  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    try {
      navigator.setAppBadge(next);
    } catch {
      // Ignore — badge API may not be available in all contexts
    }
  }

  return next;
}

/**
 * Resets the unread badge counter to 0 and clears the PWA icon badge.
 * Uses clearAppBadge() as primary method, setAppBadge(0) as fallback.
 */
export function resetBadge(): void {
  setBadgeCount(0);

  if (typeof navigator === 'undefined') return;

  // Always try clearAppBadge first — it's the correct API for full reset
  if ('clearAppBadge' in navigator) {
    try {
      (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge();
    } catch {
      // Ignore
    }
  } else if ('setAppBadge' in navigator) {
    try {
      (navigator as unknown as { setAppBadge: (count: number) => Promise<void> }).setAppBadge(0);
    } catch {
      // Ignore
    }
  }
}

export default function PwaRegister() {
  const router = useRouter();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let messageHandler: ((event: MessageEvent) => void) | null = null;

    const register = async () => {
      try {
        // In development, clear old caches to avoid stale content
        if (process.env.NODE_ENV !== 'production') {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(
              keys
                .filter((key) => key.startsWith('telegraf-cache-'))
                .map((key) => caches.delete(key)),
            );
          }
        }

        const registration = await navigator.serviceWorker.register('/sw.js');

        // Force check for SW updates on every page load
        try {
          await registration.update();
        } catch {
          // update() can fail if offline — that's OK
        }

        // When a new SW is found, tell it to activate immediately
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // Handle messages from Service Worker
        messageHandler = (event: MessageEvent) => {
          const data = event.data;
          if (!data || !data.type) return;

          switch (data.type) {
            case 'NAVIGATE_TO_CHAT':
              if (data.url) {
                router.push(data.url);
              }
              break;

            case 'INCREMENT_BADGE':
              // If the push payload included a total unread count, use it directly
              if (typeof data.count === 'number' && data.count > 0) {
                setBadgeCount(data.count);
                if ('setAppBadge' in navigator) {
                  try {
                    navigator.setAppBadge(data.count);
                  } catch {
                    // Ignore
                  }
                }
              } else {
                incrementBadge();
              }
              break;

            case 'RESET_BADGE':
            case 'CLEAR_NOTIFICATIONS':
              resetBadge();
              break;

            case 'NEW_VERSION_ACTIVATED':
              // Handled by UpdateChecker
              break;

            default:
              break;
          }
        };

        navigator.serviceWorker.addEventListener('message', messageHandler);

        // On page load, sync badge from localStorage
        const storedCount = getBadgeCount();
        if (storedCount > 0 && 'setAppBadge' in navigator) {
          try {
            navigator.setAppBadge(storedCount);
          } catch {
            // Ignore
          }
        } else if (storedCount === 0) {
          // Ensure badge is cleared if localStorage says 0
          resetBadge();
        }
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    };

    void register();

    return () => {
      if (messageHandler) {
        navigator.serviceWorker.removeEventListener('message', messageHandler);
      }
    };
  }, [router]);

  return null;
}
