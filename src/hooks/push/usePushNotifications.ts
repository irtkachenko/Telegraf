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

function isPushAPISupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'serviceWorker' in navigator &&
    'Notification' in window
  );
}

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

async function createFreshBrowserSubscription(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscriptionPayload | null> {
  if (!isPushAPISupported() || !hasVapidKey()) return null;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      // Ignore
    }
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
  });

  return subscription.toJSON() as unknown as PushSubscriptionPayload;
}

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

export function usePushNotifications() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const isStandalonePwa = typeof window !== 'undefined' && isStandaloneMode();

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

      if (browserSubscription && !hasServerSub) {
        try {
          const payload = browserSubscription.toJSON() as unknown as PushSubscriptionPayload;
          if (payload?.endpoint) {
            await pushApi.subscribe(payload);
            return true;
          }
        } catch {
          return false;
        }
      }

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

      if (!browserSubscription && !hasServerSub) return false;

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

      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          return false;
        }
      } else if (Notification.permission !== 'granted') {
        return false;
      }

      const registration = await getPushRegistration();
      const subscription = await createFreshBrowserSubscription(registration);

      if (!subscription?.endpoint) {
        return false;
      }

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

  // Sync push subscription state when user logs in or permission changes
  useEffect(() => {
    if (!user || !isStandalonePwa || !pushSupported) return;

    const syncPushState = async () => {
      try {
        const hasDbSub = queryClient.getQueryData(['push-subscription', user.id]) === true;
        const registration = await navigator.serviceWorker.getRegistration('/sw.js');
        const browserSub = await registration?.pushManager.getSubscription();
        const permission = Notification.permission;

        // Case 1: Permission granted, but no subscription anywhere
        if (permission === 'granted' && !browserSub && !hasDbSub) {
          console.log('[Push] Permission granted but no subscription, creating...');
          await subscribeMutation.mutateAsync();
          return;
        }

        // Case 2: Browser has sub but DB does not
        if (permission === 'granted' && browserSub && !hasDbSub) {
          console.log('[Push] Browser has sub but DB does not, syncing...');
          const payload = browserSub.toJSON() as unknown as PushSubscriptionPayload;
          if (payload?.endpoint) {
            await pushApi.subscribe(payload);
            queryClient.setQueryData(['push-subscription', user.id], true);
          }
          return;
        }

        // Case 3: Permission denied but DB has subscription
        if (permission === 'denied' && hasDbSub) {
          console.log('[Push] Permission denied but DB has sub, removing...');
          await pushApi.unsubscribe();
          return;
        }

        // Case 4: Permission default, no subscription - request it
        if (permission === 'default' && !hasDbSub && !browserSub) {
          console.log('[Push] Permission default, requesting...');
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            await subscribeMutation.mutateAsync();
          }
          return;
        }
      } catch (error) {
        console.error('[Push] Sync error:', error);
      }
    };

    syncPushState();
  }, [user?.id, isStandalonePwa, pushSupported, queryClient, subscribeMutation]);

  // Keep server subscription in sync when permission changes
  useEffect(() => {
    if (!user || !isStandalonePwa || !pushSupported) return;

    const syncPermissionState = () => {
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

  // Request permission on first login (once per session)
  useEffect(() => {
    if (!user || !isStandalonePwa || !pushSupported) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    const sessionKey = `telegraf:push-prompt-requested:${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(sessionKey, 'true');
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted' && !subscribeMutation.isPending) {
            subscribeMutation.mutateAsync().catch(() => {});
          }
        });
      } catch {
        // Ignore prompt errors
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, [user?.id, isStandalonePwa, pushSupported, subscribeMutation]);

  return {
    isSubscribed: !!isSubscribed,
    isCheckingSubscription,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
    isSupported: pushSupported,
    pushSupported,
    browserSupportsPush,
    hasVapid,
    subscribe: useCallback(() => subscribeMutation.mutateAsync(), [subscribeMutation]),
    unsubscribe: useCallback(() => unsubscribeMutation.mutateAsync(), [unsubscribeMutation]),
  };
}