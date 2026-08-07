'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL = 2 * 60 * 1000; // Check every 2 minutes
const VERSION_STORAGE_KEY = 'telegraf:app-version';

export default function UpdateChecker({ children }: { children: React.ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const latestServerVersionRef = useRef<string | null>(null);

  const checkVersion = useCallback(async () => {
    try {
      // Append timestamp query parameter to bypass mobile browser cache entirely
      const res = await fetch(`/api/version?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      const serverVersion = data.version;

      if (!serverVersion) return;

      latestServerVersionRef.current = serverVersion;

      let storedVersion: string | null = null;
      try {
        storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);
      } catch {
        // Ignore
      }

      if (!storedVersion) {
        // First run on this device — record the baseline version
        try {
          localStorage.setItem(VERSION_STORAGE_KEY, serverVersion);
        } catch {
          // Ignore
        }
        return;
      }

      if (storedVersion !== serverVersion) {
        // Server version is different from the stored version -> BLOCK APP
        setUpdateAvailable(true);
      }
    } catch {
      // Ignore network errors
    }
  }, []);

  const forceSwUpdate = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (registration) {
        await registration.update();
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleUpdate = useCallback(async () => {
    setIsReloading(true);

    try {
      const newVersion = latestServerVersionRef.current;
      if (newVersion) {
        try {
          localStorage.setItem(VERSION_STORAGE_KEY, newVersion);
        } catch {
          // Ignore
        }
      }

      // 1. Clear caches
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }

      // 2. Tell SW to skip waiting and unregister
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          await reg.update();
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    // 3. Hard reload bypassing cache
    setTimeout(() => {
      window.location.href = window.location.origin + window.location.pathname + `?v=${Date.now()}`;
    }, 400);
  }, []);

  useEffect(() => {
    // Check version immediately on mount
    void checkVersion();
    void forceSwUpdate();

    // Check version periodically
    const intervalId = setInterval(() => {
      void checkVersion();
      void forceSwUpdate();
    }, CHECK_INTERVAL);

    // Check when window gains focus or PWA resumes from background
    const handleFocus = () => {
      void checkVersion();
      void forceSwUpdate();
    };
    const handleOnline = () => {
      void checkVersion();
      void forceSwUpdate();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkVersion();
        void forceSwUpdate();
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void checkVersion();
        void forceSwUpdate();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [checkVersion, forceSwUpdate]);

  // ── Blocking Update Modal ─────────────────────────────
  if (updateAvailable) {
    return (
      <>
        {/* Render children behind overlay */}
        <div className="pointer-events-none select-none" aria-hidden="true" inert={true}>
          {children}
        </div>

        {/* Fullscreen blocking modal */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/95 backdrop-blur-xl"
        >
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.05 }}
            className="flex flex-col items-center gap-6 px-8 py-10 max-w-sm w-full mx-4"
          >
            {/* Logo */}
            <div className="relative w-20 h-20">
              <Image
                src="/logo.png"
                alt="Telegraf"
                fill
                className="object-contain"
                sizes="80px"
                priority
              />
            </div>

            {/* Title */}
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-white font-tech tracking-tight">
                Доступне оновлення
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                Вийшла нова версія Telegraf. Оновіть додаток, щоб продовжити використання.
              </p>
            </div>

            {/* Update button */}
            <button
              type="button"
              onClick={handleUpdate}
              disabled={isReloading}
              className="group relative w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-[#4f46e5]/30 hover:bg-[#4f46e5]/50 text-white font-semibold text-sm border border-[#6366f1]/50 hover:border-[#6366f1]/80 shadow-[0_0_35px_rgba(99,102,241,0.3)] hover:shadow-[0_0_55px_rgba(99,102,241,0.5)] transition-all duration-300 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isReloading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Оновлення...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                  <span>Оновити</span>
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      </>
    );
  }

  // ── Reloading state ────────────────────────────────────
  if (isReloading) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#6366f1] border-t-transparent" />
          <p className="text-lg font-medium text-white font-tech">Встановлення оновлення...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}