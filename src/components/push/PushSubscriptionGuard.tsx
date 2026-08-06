'use client';

import { Bell, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { usePushNotifications } from '@/hooks/push/usePushNotifications';
import { isStandaloneMode } from '@/hooks/pwa/usePwaInstall';

export default function PushSubscriptionGuard() {
  const { user, loading: isAuthLoading } = useSupabaseAuth();
  const {
    isSubscribed,
    isCheckingSubscription,
    isSubscribing,
    pushSupported,
    browserSupportsPush,
    hasVapid,
    subscribe,
  } = usePushNotifications();
  const [isInstalledApp] = useState(() => isStandaloneMode());
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const autoSubscribeAttemptedRef = useRef(false);

  // Determine the actual reason why push is not supported
  const isBrowserIncompatible = isInstalledApp && !browserSupportsPush;
  const isMissingVapidKey = isInstalledApp && browserSupportsPush && !hasVapid;

  useEffect(() => {
    if (
      !user ||
      !isInstalledApp ||
      !pushSupported ||
      isSubscribed ||
      isCheckingSubscription ||
      autoSubscribeAttemptedRef.current
    ) {
      return;
    }

    autoSubscribeAttemptedRef.current = true;
    subscribe().catch(() => {
      setSubscribeError('Не вдалося увімкнути push-сповіщення. Спробуйте ще раз.');
    });
  }, [isCheckingSubscription, isInstalledApp, isSubscribed, pushSupported, subscribe, user]);

  if (isAuthLoading || !user || !isInstalledApp || isSubscribed) return null;

  const isLoading = isCheckingSubscription || isSubscribing;
  const permissionDenied =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'denied';

  const handleSubscribe = async () => {
    setSubscribeError(null);

    try {
      await subscribe();
    } catch {
      setSubscribeError('Не вдалося увімкнути push-сповіщення. Спробуйте ще раз.');
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#050508]/95 px-5 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d12] p-6 text-center shadow-[0_0_60px_rgba(79,70,229,0.22)]">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#6366f1]/40 bg-[#4f46e5]/20 text-[#9aa2ff]">
          {isLoading ? (
            <LoaderCircle className="h-6 w-6 animate-spin" />
          ) : (
            <Bell className="h-6 w-6" />
          )}
        </div>

        <h2 className="font-tech text-xl font-medium text-white">
          Увімкніть push-сповіщення
        </h2>

        <p className="mt-3 text-sm leading-6 text-gray-400">
          У встановленому додатку Telegraf push-сповіщення обов'язкові, щоб ви не пропускали нові повідомлення.
        </p>

        {isBrowserIncompatible && (
          <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Цей браузер або пристрій не підтримує push-сповіщення для PWA.
          </p>
        )}

        {isMissingVapidKey && (
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Пуш-сповіщення не налаштовані. Зверніться до адміністратора.
          </p>
        )}

        {permissionDenied && (
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Дозвіл заблоковано в налаштуваннях браузера. Дозвольте сповіщення для цього сайту і поверніться в додаток.
          </p>
        )}

        {subscribeError && !permissionDenied && (
          <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {subscribeError}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubscribe}
          disabled={!pushSupported || isLoading || permissionDenied}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#6366f1]/50 bg-[#4f46e5]/35 px-5 py-3 font-tech text-sm font-medium text-white transition-all duration-200 hover:border-[#6366f1]/80 hover:bg-[#4f46e5]/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Увімкнути сповіщення
        </button>
      </div>
    </div>
  );
}
