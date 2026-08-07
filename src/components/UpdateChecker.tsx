'use client';

import { useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 хвилин
const VERSION_STORAGE_KEY = 'telegraf:last-known-version';

export default function UpdateChecker({ children }: { children: React.ReactNode }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const currentVersionRef = useRef<string | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerReload = () => {
    if (reloadTimerRef.current) return;
    setIsUpdating(true);
    reloadTimerRef.current = setTimeout(() => {
      window.location.reload();
    }, 300 + Math.random() * 200);
  };

  useEffect(() => {
    // On mount, load the last known version from sessionStorage
    // to prevent infinite reload loops (version is set BEFORE reload)
    try {
      const stored = sessionStorage.getItem(VERSION_STORAGE_KEY);
      if (stored) currentVersionRef.current = stored;
    } catch {
      // Ignore
    }

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();

        if (currentVersionRef.current && data.version !== currentVersionRef.current) {
          // Save new version BEFORE reload so we don't loop
          try {
            sessionStorage.setItem(VERSION_STORAGE_KEY, data.version);
          } catch {
            // Ignore
          }
          triggerReload();
        }

        currentVersionRef.current = data.version;
      } catch (error) {
        console.error('Failed to check version:', error);
      }
    };

    /** Force the browser to check for a new Service Worker script. */
    const forceSwUpdate = async () => {
      if (!('serviceWorker' in navigator)) return;
      try {
        const registration = await navigator.serviceWorker.getRegistration('/sw.js');
        if (registration) {
          await registration.update();
        }
      } catch {
        // Ignore — can fail when offline
      }
    };

    const checkAll = async () => {
      await Promise.all([checkVersion(), forceSwUpdate()]);
    };

    // 1. Перевірка при старті
    void checkAll();

    // 2. Періодична перевірка (важливо для PWA, коли додаток у фоновому режимі)
    const intervalId = setInterval(checkAll, CHECK_INTERVAL);

    // 3. Перевірка при фокусі та поверненні онлайн
    const handleFocus = () => void checkAll();
    const handleOnline = () => void checkAll();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    // 4. Перевірка при вході в додаток (вкладка стає видимою — юзер повернувся в PWA)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkAll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 5. Перевірка при поверненні з bfcache (мобільні браузери)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void checkAll();
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    // 6. Обробка подій від Service Worker
    const handleControllerChange = () => {
      // Новий SW перехопив контроль — перезавантажуємо для завантаження нових бандлів
      triggerReload();
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NEW_VERSION_ACTIVATED') {
        triggerReload();
      }
    };

    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, []);

  if (isUpdating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-lg font-medium text-white">Встановлення оновлення...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}