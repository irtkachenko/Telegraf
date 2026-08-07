'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL = 3 * 60 * 1000; // 3 minutes
const INITIAL_CHECK_DELAY = 3000; // Wait 3s after page load before first check

/**
 * UpdateChecker — blocking update gate.
 *
 * How it works:
 * 1. On Vercel, every `git push` triggers a new deploy. Each deploy gets a unique
 *    `VERCEL_GIT_COMMIT_SHA` which is exposed via `/api/version`.
 * 2. On first load, the component fetches the current version and stores it.
 * 3. Periodically (every 3 min), on focus, on visibility change, and on coming
 *    back online, it re-fetches `/api/version`.
 * 4. If the version has changed, a BLOCKING full-screen modal appears:
 *    "Доступне оновлення — натисніть Оновити". The user CANNOT use the app
 *    until they press the button.
 * 5. Pressing "Оновити" clears all SW caches and hard-reloads the page.
 */
export default function UpdateChecker({ children }: { children: React.ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const currentVersionRef = useRef<string | null>(null);
  const hasCheckedOnce = useRef(false);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/version', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return;
      const data = await res.json();
      const serverVersion = data.version;

      if (!serverVersion) return;

      if (!hasCheckedOnce.current) {
        // First check — just store the version, don't trigger update
        currentVersionRef.current = serverVersion;
        hasCheckedOnce.current = true;
        return;
      }

      if (currentVersionRef.current && serverVersion !== currentVersionRef.current) {
        // Version changed — show blocking update modal
        setUpdateAvailable(true);
      }
    } catch {
      // Network error — ignore, will retry later
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
      // Ignore — can fail when offline
    }
  }, []);

  const handleUpdate = useCallback(async () => {
    setIsReloading(true);

    try {
      // 1. Clear all caches
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }

      // 2. Unregister old SW and register fresh
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          const waiting = reg.waiting;
          if (waiting) {
            waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          await reg.update();
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    // 3. Hard reload — bypass browser cache entirely
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }, []);

  useEffect(() => {
    // Delay first check to let the app fully hydrate
    const initialTimer = setTimeout(() => {
      void checkVersion();
      void forceSwUpdate();
    }, INITIAL_CHECK_DELAY);

    // Periodic check
    const intervalId = setInterval(() => {
      void checkVersion();
      void forceSwUpdate();
    }, CHECK_INTERVAL);

    // Check on focus (user switches back to the app)
    const handleFocus = () => void checkVersion();
    window.addEventListener('focus', handleFocus);

    // Check on coming back online
    const handleOnline = () => void checkVersion();
    window.addEventListener('online', handleOnline);

    // Check on visibility change (PWA resumed from background)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // bfcache restore
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void checkVersion();
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      clearTimeout(initialTimer);
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
        {/* Render children behind the overlay so the layout doesn't break */}
        <div className="pointer-events-none select-none" aria-hidden="true" inert={true}>
          {children}
        </div>

        {/* Full-screen blocking overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/95 backdrop-blur-xl"
        >
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
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

  // ── Reloading state (after pressing update) ────────────
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