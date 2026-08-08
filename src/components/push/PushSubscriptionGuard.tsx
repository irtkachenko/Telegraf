'use client';

import { BellOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePushNotifications } from '@/hooks/push/usePushNotifications';

/**
 * PushSubscriptionGuard shows a non-blocking banner when the user has
 * denied notification permission in the browser/system settings.
 *
 * When permission is 'denied', the browser will NOT show the permission
 * prompt again — the user must re-enable it manually in browser/system
 * settings. This banner guides them to do so.
 */
export default function PushSubscriptionGuard() {
  const { state, isStandalone } = usePushNotifications();
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when permission changes
  useEffect(() => {
    if (state.kind !== 'permission-denied') {
      setDismissed(false);
    }
  }, [state.kind]);

  // Don't show if subscribed, not denied, in a regular browser (not standalone PWA),
  // or dismissed this session
  if (state.kind === 'ready' || state.kind !== 'permission-denied' || !isStandalone || dismissed)
    return null;

  const openSettings = () => {
    // Try to open browser notification settings
    // Chrome desktop: chrome://settings/content/notifications
    // Firefox: about:preferences#privacy
    // Safari: no direct URL, show instructions instead
    const isChrome = /Chrome/.test(navigator.userAgent) && !/Edge/.test(navigator.userAgent);
    const isFirefox = /Firefox/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

    if (isChrome) {
      window.open('chrome://settings/content/notifications', '_blank');
    } else if (isFirefox) {
      window.open('about:preferences#privacy', '_blank');
    } else if (isSafari) {
      // Safari doesn't have a direct URL — show instructions
      alert(
        'Щоб увімкнути сповіщення:\n\n' +
          '1. Відкрийте Налаштування Safari\n' +
          '2. Знайдіть цей сайт\n' +
          '3. Увімкніть "Сповіщення"',
      );
    } else {
      // Android PWA / other — show generic instructions
      alert(
        'Щоб увімкнути сповіщення:\n\n' +
          '1. Відкрийте Налаштування браузера\n' +
          '2. Знайдіть "Сповіщення" або "Дозволи"\n' +
          '3. Знайдіть цей сайт і увімкніть сповіщення',
      );
    }
  };

  return (
    <div className="fixed bottom-4 left-0 right-0 z-[9998] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md bg-[#12131a]/95 border border-amber-500/30 rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
          <BellOff className="w-4.5 h-4.5 text-amber-400" />
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-white font-tech tracking-wide">
            Сповіщення вимкнені
          </h4>
          <p className="text-xs text-gray-300 mt-1 font-normal leading-snug">
            Увімкніть сповіщення в налаштуваннях, щоб отримувати повідомлення про нові чати.
          </p>

          {isAndroid ? (
            <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-amber-200/90 text-xs leading-relaxed space-y-1">
              <p className="font-semibold text-amber-200">Як увімкнути (Android / PWA):</p>
              <p>1. Натисніть ⋮ (меню) у правому верхньому куті додатка.</p>
              <p>2. Оберіть «Налаштування сайту» (або «Дані сайту»).</p>
              <p>3. Включіть «Сповіщення» (Notifications).</p>
            </div>
          ) : (
            <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-amber-200/90 text-xs leading-relaxed space-y-1">
              <p className="font-semibold text-amber-200">Як увімкнути (комп'ютер):</p>
              <p>1. Відкрийте chrome://settings/content/notifications.</p>
              <p>2. Знайдіть цей домен у списку.</p>
              <p>3. Змініть «Заборонено» на «Дозволено».</p>
            </div>
          )}
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={openSettings}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Відкрити налаштування
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Пізніше
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0 cursor-pointer"
          aria-label="Закрити"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}