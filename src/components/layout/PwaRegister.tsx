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

          await navigator.serviceWorker.register('/sw.js');
        } catch (error) {
          console.error('Service worker registration failed:', error);
        }
      };
      void register();
    }
  }, []);

  return null;
}
