'use client';

import { Check, Download, LoaderCircle } from 'lucide-react';
import { usePushNotifications } from '@/hooks/push/usePushNotifications';

interface PushNotificationButtonProps {
  variant?: 'navbar' | 'landing';
}

export function PushNotificationButton({ variant = 'navbar' }: PushNotificationButtonProps) {
  const {
    isSubscribed,
    isCheckingSubscription,
    isSubscribing,
    isUnsubscribing,
    pushSupported,
    browserSupportsPush,
    hasVapid,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const isLoading = isCheckingSubscription || isSubscribing || isUnsubscribing;

  // Hide the button if push is not fully supported (needs browser support + VAPID key)
  if (!pushSupported) return null;
  
  // Show a different state if the browser supports Push API but VAPID key is missing
  // This allows showing a "not configured" state instead of hiding completely

  const handleClick = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  if (variant === 'landing') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="font-tech group relative inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] text-white font-medium text-sm sm:text-base border border-white/10 hover:border-[#6366f1]/50 shadow-sm hover:shadow-[0_0_35px_rgba(99,102,241,0.25)] transition-all duration-300 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <LoaderCircle className="w-5 h-5 shrink-0 text-[#8d96e9] animate-spin" />
        ) : isSubscribed ? (
          <Check className="w-5 h-5 shrink-0 text-[#8d96e9]" />
        ) : (
          <Download className="w-5 h-5 shrink-0 text-[#8d96e9]" />
        )}

        <span>
          {isLoading
            ? 'Завантаження...'
            : isSubscribed
              ? 'Встановлено'
              : 'Встановити'}
        </span>
      </button>
    );
  }

  // Navbar variant - compact icon button
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      title={isSubscribed ? 'Вимкнути сповіщення' : 'Встановити'}
      aria-label={isSubscribed ? 'Вимкнути сповіщення' : 'Встановити'}
      className={`p-2 rounded-lg border transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        isSubscribed
          ? 'bg-[#4f46e5]/20 border-[#6366f1]/40 text-[#8d96e9] hover:bg-[#4f46e5]/30 hover:border-[#6366f1]/60'
          : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.08] hover:border-white/20'
      }`}
    >
      {isLoading ? (
        <LoaderCircle className="w-4 h-4 animate-spin" />
      ) : isSubscribed ? (
        <Check className="w-4 h-4" />
      ) : (
        <Download className="w-4 h-4" />
      )}
    </button>
  );
}

export default PushNotificationButton;
