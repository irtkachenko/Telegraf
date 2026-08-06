'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { isStandaloneMode } from '@/hooks/pwa/usePwaInstall';
import { pushApi, type PushSubscriptionPayload } from '@/services/push/push.service';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
let didWarnMissingVapidKey = false;

function hasPushConfig(): boolean {
  if (VAPID_PUBLIC_KEY) return true;

  if (!didWarnMissingVapidKey && typeof window !== 'undefined') {
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Push notifications are disabled.');
    didWarnMissingVapidKey = true;
  }

  return false;
}

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    hasPushConfig() &&
    'PushManager' in window &&
    'serviceWorker' in navigator &&
    'Notification' in window
  );
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
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
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Push notifications are disabled.');
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
  const isStandalonePwa = typeof window !== 'undefined' && isStandaloneMode();
  const pushSupported = isPushSupported();

  const {
    data: isSubscribed,
    isLoading: isCheckingSubscription,
  } = useQuery({
    queryKey: ['push-subscription', user?.id],
    queryFn: async () => {
      if (!user) return false;

      if (!isStandalonePwa || !pushSupported) return false;

      if (Notification.permission !== 'granted') return false;

      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const browserSubscription = await registration?.pushManager.getSubscription();

      if (!browserSubscription) return false;

      // Check if there's an active server-side subscription too.
      return pushApi.isSubscribed();
    },
    enabled: !!user?.id && isStandalonePwa && pushSupported,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!user) return false;

      if (!isStandalonePwa || !pushSupported) return false;

      if (Notification.permission === 'denied') {
        return false;
      }

      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          return false;
        }
      }

      const registration = await getPushRegistration();
      const subscription = await createBrowserSubscription(registration);

      if (!subscription?.endpoint) {
        return false;
      }

      await pushApi.subscribe(subscription);
      return true;
    },
    onSuccess: (subscribed) => {
      queryClient.setQueryData(['push-subscription', user?.id], subscribed);
      void queryClient.invalidateQueries({ queryKey: ['push-subscription', user?.id] });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!user) return false;

      if (!pushSupported) return false;

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

  // Keep server subscription in sync when permission changes outside our button.
  useEffect(() => {
    if (!user || !isStandalonePwa || !pushSupported) return;

    const syncPermissionState = () => {
      if (document.visibilityState === 'hidden') return;

      if (Notification.permission === 'denied') {
        pushApi.unsubscribe().catch(() => {});
        queryClient.setQueryData(['push-subscription', user.id], false);
        return;
      }

      if (
        Notification.permission === 'granted' &&
        !subscribeMutation.isPending &&
        queryClient.getQueryData(['push-subscription', user.id]) !== true
      ) {
        subscribeMutation.mutateAsync().catch(() => {});
      }
    };

    const permissionStatus = navigator.permissions?.query
      ? navigator.permissions.query({ name: 'notifications' as PermissionName })
      : null;

    permissionStatus
      ?.then((status) => {
        status.addEventListener('change', syncPermissionState);
      })
      .catch(() => {});

    window.addEventListener('focus', syncPermissionState);
    window.addEventListener('pageshow', syncPermissionState);
    document.addEventListener('visibilitychange', syncPermissionState);
    syncPermissionState();

    return () => {
      window.removeEventListener('focus', syncPermissionState);
      window.removeEventListener('pageshow', syncPermissionState);
      document.removeEventListener('visibilitychange', syncPermissionState);
      permissionStatus
        ?.then((status) => {
          status.removeEventListener('change', syncPermissionState);
        })
        .catch(() => {});
    };
  }, [isStandalonePwa, pushSupported, queryClient, subscribeMutation, user]);

  return {
    isSubscribed: !!isSubscribed,
    isCheckingSubscription,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
    isSupported: pushSupported,
    pushSupported,
    subscribe: useCallback(() => subscribeMutation.mutateAsync(), [subscribeMutation]),
    unsubscribe: useCallback(() => unsubscribeMutation.mutateAsync(), [unsubscribeMutation]),
  };
}
