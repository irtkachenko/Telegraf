'use client';

import { useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 хвилин

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
    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const data = await res.json();

        if (currentVersionRef.current && data.version !== currentVersionRef.current) {
          triggerReload();
        }

        currentVersionRef.current = data.version;
      } catch (error) {
        console.error('Failed to check version:', error);
      }
    };

    // 1. Перевірка версії при старті
    checkVersion();

    // 2. Періодична перевірка (важливо для PWA, коли додаток у фоновому режимі)
    const intervalId = setInterval(checkVersion, CHECK_INTERVAL);

    // 3. Перевірка при фокусі та поверненні онлайн
    window.addEventListener('focus', checkVersion);
    window.addEventListener('online', checkVersion);

    // 4. Перевірка при вході в додаток (вкладка стає видимою — юзер повернувся в PWA)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 5. Перевірка при поверненні з bfcache (мобільні браузери)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        checkVersion();
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
      window.removeEventListener('focus', checkVersion);
      window.removeEventListener('online', checkVersion);
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