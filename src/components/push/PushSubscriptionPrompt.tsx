'use client';

import { AlertCircle, Bell, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePushNotifications } from '@/hooks/push/usePushNotifications';

const PROMPT_SESSION_KEY = 'telegraf:push-prompt-dismissed';

/**
 * PushSubscriptionPrompt shows a non-blocking banner when the user needs
 * to take action to enable push notifications (permission not granted or
 * no subscription exists). Works on mobile (iOS/Android PWA) and desktop.
 */
export default function PushSubscriptionPrompt() {
  const { state, isSubscribing, isStandalone, isIosNonStandalone, subscribeError, subscribe } =
    usePushNotifications();
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when subscription state changes
  useEffect(() => {
    if (state.kind === 'ready') {
      setDismissed(false);
    }
  }, [state.kind]);

  const isDenied = state.kind === 'permission-denied';

  // Don't show again this session if user dismissed
  const isSessionDismissed =
    typeof window !== 'undefined' && sessionStorage.getItem(PROMPT_SESSION_KEY) === 'true';

  // Special case for iOS in regular browser (not Standalone PWA)
  if (isIosNonStandalone && !dismissed && !isSessionDismissed) {
    const handleDismissIos = () => {
      setDismissed(true);
      try {
        sessionStorage.setItem(PROMPT_SESSION_KEY, 'true');
      } catch {
        // Ignore
      }
    };

    return (
      <div className="fixed bottom-4 left-0 right-0 z-[9998] flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-[#12131a]/95 border border-[#6366f1]/30 rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-[#6366f1]/15 border border-[#6366f1]/20 flex items-center justify-center">
            <Share className="w-4.5 h-4.5 text-[#8d96e9]" />
          </div>

          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold text-white font-tech tracking-wide">
              Встановіть Telegraf на iPhone
            </h4>
            <p className="text-xs text-gray-300 mt-1 font-normal leading-snug">
              Щоб отримувати сповіщення на iOS, натисніть{' '}
              <span className="font-semibold text-white">«Поділитися»</span> та оберіть{' '}
              <span className="font-semibold text-white">«На початковий екран»</span>.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleDismissIos}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Зрозуміло
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismissIos}
            className="p-1.5 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0 cursor-pointer"
            aria-label="Закрити"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Don't show if already subscribed, checking, not supported, denied permission,
  // or dismissed this session
  if (
    state.kind === 'ready' ||
    state.kind === 'unsupported' ||
    state.kind === 'loading' ||
    isDenied ||
    !isStandalone ||
    dismissed ||
    isSessionDismissed
  ) {
    return null;
  }

  const handleEnable = async () => {
    const result = await subscribe();
    if (result && result.success) {
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(PROMPT_SESSION_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <div className="fixed bottom-4 left-0 right-0 z-[9998] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md bg-[#12131a]/95 border border-[#6366f1]/30 rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-[#6366f1]/15 border border-[#6366f1]/20 flex items-center justify-center">
          <Bell className="w-4.5 h-4.5 text-[#8d96e9]" />
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-white font-tech tracking-wide">
            Увімкнути сповіщення
          </h4>
          <p className="text-xs text-gray-300 mt-1 font-normal leading-snug">
            Отримуйте сповіщення про нові повідомлення, навіть коли додаток закритий.
          </p>

          {subscribeError && (
            <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[#f87171] text-xs flex items-start gap-1.5 leading-snug">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{subscribeError}</span>
            </div>
          )}

          {subscribeError && (
            <div className="mt-2 rounded-lg bg-[#6366f1]/10 border border-[#6366f1]/25 p-3 text-[#c7d2fe] text-xs leading-relaxed space-y-1.5">
              <p className="font-semibold text-white">Щоб сповіщення запрацювали:</p>
              <p>1. Зачекайте 15–30 хвилин (Google тимчасово блокує нові підписки).</p>
              {isAndroid ? (
                <>
                  <p>2. Або: іконка 🔒 або ⓘ біля адреси → «Дані сайту» → «Очистити».</p>
                  <p>3. Перезапустіть додаток з головного екрана і натисніть «Увімкнути» ще раз.</p>
                </>
              ) : (
                <p>
                  2. Або відкрийте chrome://settings/content/notifications і дозвольте цей домен,
                  потім натисніть «Увімкнути» ще раз.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleEnable}
              disabled={isSubscribing}
              className="px-3 py-1.5 rounded-lg bg-[#6366f1]/20 hover:bg-[#6366f1]/30 border border-[#6366f1]/30 text-[#8d96e9] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isSubscribing ? 'Завантаження...' : 'Увімкнути'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Пізніше
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="p-1.5 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0 cursor-pointer"
          aria-label="Закрити"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}