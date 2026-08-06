'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { pushApi, type PushSubscriptionPayload } from '@/services/push/push.service';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'serviceWorker' in navigator &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function createBrowserSubscription(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscriptionPayload | null> {
  if (!('PushManager' in window)) return null;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing.toJSON() as unknown as PushSubscriptionPayload;
  }

  if (!VAPID_PUBLIC_KEY) {
    console.error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
    return null;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  return subscription.toJSON() as unknown as PushSubscriptionPayload;
}

/**
 * Hook for managing Web Push subscriptions.
 *
 * - Checks browser support and permission
 * - Creates a browser PushSubscription with VAPID keys
 * - Syncs the subscription with the Supabase backend
 */
export function usePushNotifications() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  const {
    data: isSubscribed,
    isLoading: isCheckingSubscription,
  } = useQuery({
    queryKey: ['push-subscription', user?.id],
    queryFn: async () => {
      if (!user) return false;

      // Check if Push API is supported
      if (!isPushSupported()) return false;

      // Check permission
      if (Notification.permission !== 'granted') return false;

      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const browserSubscription = await registration?.pushManager.getSubscription();

      if (!browserSubscription) return false;

      // Check if there's an active server-side subscription too.
      return pushApi.isSubscribed();
    },
    enabled: !!user?.id && typeof window !== 'undefined',
    staleTime: 5 * 60 * 1000,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!user) return false;

      if (!isPushSupported()) return false;

      if (Notification.permission === 'denied') return false;

      // Request permission if not yet granted
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return false;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await createBrowserSubscription(registration);

      if (!subscription) return false;

      await pushApi.subscribe(subscription);
      return true;
    },
    onSuccess: (subscribed) => {
      queryClient.setQueryData(['push-subscription', user?.id], subscribed);
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!user) return false;

      if (!isPushSupported()) return false;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      await pushApi.unsubscribe();
      return false;
    },
    onSuccess: (subscribed) => {
      queryClient.setQueryData(['push-subscription', user?.id], subscribed);
    },
  });

  // Auto-unsubscribe from server when browser push permission is revoked
  useEffect(() => {
    if (!user || !isPushSupported()) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      // Re-check permission; if denied, remove server subscription
      if (Notification.permission === 'denied') {
        pushApi.unsubscribe().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  return {
    isSubscribed: !!isSubscribed,
    isCheckingSubscription,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
    pushSupported: isPushSupported(),
    subscribe: useCallback(() => subscribeMutation.mutateAsync(), [subscribeMutation]),
    unsubscribe: useCallback(() => unsubscribeMutation.mutateAsync(), [unsubscribeMutation]),
  };
}
