'use client';

import { useEffect } from 'react';

export default function PwaRegister() {
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
        } catch (error) {
          console.error('Service worker registration failed:', error);
        }
      };
      void register();
    }
  }, []);

  return null;
}