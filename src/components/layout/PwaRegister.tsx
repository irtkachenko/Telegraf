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
 */
export function resetBadge(): void {
  setBadgeCount(0);

  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    try {
      navigator.setAppBadge(0);
    } catch {
      // Ignore
    }
  } else if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
    try {
      (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge();
    } catch {
      // Ignore
    }
  }
}

export default function PwaRegister() {
  const router = useRouter();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const register = async () => {
        try {
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

          // Відстежуємо виявлення нової версії Service Worker
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            // Коли новий SW завантажився — надсилаємо SKIP_WAITING,
            // щоб він активувався негайно (без очікування закриття вкладок)
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });

          // Обробка повідомлень від Service Worker
          const handleServiceWorkerMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data || !data.type) return;

            switch (data.type) {
              case 'NAVIGATE_TO_CHAT':
                // Глибоке посилання: перехід у конкретний чат
                if (data.url) {
                  router.push(data.url);
                }
                break;

              case 'INCREMENT_BADGE':
                // Інкремент лічильника badge при отриманні нового пуш-повідомлення
                incrementBadge();
                break;

              case 'RESET_BADGE':
                // Скидання лічильника badge до 0
                resetBadge();
                break;

              case 'CLEAR_NOTIFICATIONS':
                // Очищення активних сповіщень та скидання badge
                resetBadge();
                break;

              case 'NEW_VERSION_ACTIVATED':
                // Нова версія SW активована — логіка обробки в UpdateChecker
                break;

              default:
                break;
            }
          };

          navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

          // Під час завантаження сторінки ініціалізуємо badge з localStorage
          const storedCount = getBadgeCount();
          if (storedCount > 0 && typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
            try {
              navigator.setAppBadge(storedCount);
            } catch {
              // Ignore
            }
          }
        } catch (error) {
          console.error('Service worker registration failed:', error);
        }
      };
      void register();
    }
  }, [router]);

  return null;
}
