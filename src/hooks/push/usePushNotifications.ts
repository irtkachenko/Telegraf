'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { isStandaloneMode } from '@/hooks/pwa/usePwaInstall';
import { pushApi, type PushSubscriptionPayload } from '@/services/push/push.service';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
let didWarnMissingVapidKey = false;

function hasVapidKey(): boolean {
  return !!VAPID_PUBLIC_KEY;
}

function hasPushConfig(): boolean {
  if (hasVapidKey()) return true;

  if (!didWarnMissingVapidKey && typeof window !== 'undefined') {
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Push notifications are disabled.');
    didWarnMissingVapidKey = true;
  }

  return false;
}

/**
 * Checks if the browser supports the Push API (regardless of configuration).
 * This is a browser capability check only.
 */
function isPushAPISupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'serviceWorker' in navigator &&
    'Notification' in window
  );
}

/**
 * Checks if push notifications can actually be used.
 * Requires both browser support AND valid VAPID configuration.
 */
function canUsePush(): boolean {
  return isPushAPISupported() && hasPushConfig();
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

/**
 * Creates a fresh browser PushSubscription, unsubscribing from any existing
 * one first to guarantee a valid endpoint.
 */
async function createFreshBrowserSubscription(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscriptionPayload | null> {
  if (!isPushAPISupported() || !hasVapidKey()) return null;

  // Unsubscribe from any existing subscription to force a fresh endpoint
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      // Ignore — old sub may already be invalid
    }
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
  });

  return subscription.toJSON() as unknown as PushSubscriptionPayload;
}

/**
 * Gets the current browser subscription or creates a new one.
 */
async function getOrCreateBrowserSubscription(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscriptionPayload | null> {
  if (!isPushAPISupported()) return null;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing.toJSON() as unknown as PushSubscriptionPayload;
  }

  if (!hasVapidKey()) {
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Push notifications are disabled.');
    return null;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
  });

  return subscription.toJSON() as unknown as PushSubscriptionPayload;
}

/**
 * Hook for managing Web Push subscriptions.
 *
 * - Checks browser support and permission
 * - Creates a browser PushSubscription with VAPID keys
 * - Syncs the subscription with the Supabase backend
 * - Auto-resubscribes if the browser subscription or server record is missing/stale
 */
export function usePushNotifications() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const isStandalonePwa = typeof window !== 'undefined' && isStandaloneMode();
  
  // Separate checks for better error handling
  const browserSupportsPush = isPushAPISupported();
  const hasVapid = hasVapidKey();
  const pushSupported = canUsePush();

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
      if (!registration) return false;

      const browserSubscription = await registration.pushManager.getSubscription();
      const hasServerSub = await pushApi.isSubscribed().catch(() => false);

      // ── Auto-resubscribe logic ──
      // Case 1: Browser has subscription but server does not → re-sync to server
      if (browserSubscription && !hasServerSub) {
        try {
          const payload = browserSubscription.toJSON() as unknown as PushSubscriptionPayload;
          if (payload?.endpoint) {
            await pushApi.subscribe(payload);
            return true;
          }
        } catch {
          // Failed to sync — treat as not subscribed
          return false;
        }
      }

      // Case 2: Server has subscription but browser does not → re-create browser sub
      if (!browserSubscription && hasServerSub) {
        try {
          const freshReg = await navigator.serviceWorker.ready;
          const newSub = await getOrCreateBrowserSubscription(freshReg);
          if (newSub?.endpoint) {
            await pushApi.subscribe(newSub);
            return true;
          }
        } catch {
          return false;
        }
      }

      // Case 3: Neither exists
      if (!browserSubscription && !hasServerSub) return false;

      // Case 4: Both exist — good state
      return true;
    },
    enabled: !!user?.id && isStandalonePwa && pushSupported,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!user) return false;

      if (!isStandalonePwa || !pushSupported) return false;

      // Request permission even if previously denied - browser will show prompt again
      if (Notification.permission === 'default' || Notification.permission === 'denied') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          return false;
        }
      }

      const registration = await getPushRegistration();
      // Use createFresh to guarantee a valid, current endpoint
      const subscription = await createFreshBrowserSubscription(registration);

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
    // Expose separate states for better UI feedback
    browserSupportsPush,
    hasVapid,
    subscribe: useCallback(() => subscribeMutation.mutateAsync(), [subscribeMutation]),
    unsubscribe: useCallback(() => unsubscribeMutation.mutateAsync(), [unsubscribeMutation]),
  };
}
