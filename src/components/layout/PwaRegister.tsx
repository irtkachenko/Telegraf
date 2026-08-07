'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

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

          // Обробка глибокого посилання з пуш-сповіщення (клік у notificationclick)
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'NAVIGATE_TO_CHAT' && event.data.url) {
              router.push(event.data.url);
            }
          });
        } catch (error) {
          console.error('Service worker registration failed:', error);
        }
      };
      void register();
    }
  }, [router]);

  return null;
}
