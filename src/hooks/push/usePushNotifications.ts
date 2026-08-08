'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { pushApi, type PushSubscriptionPayload } from '@/services/push/push.service';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const ENDPOINT_STORAGE_KEY = 'telegraf:push-endpoint';
let didWarnMissingVapidKey = false;

export type PushState =
  | { kind: 'unsupported' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'needs-permission' }
  | { kind: 'needs-subscribe' }
  | { kind: 'needs-db-sync' }
  | { kind: 'permission-denied' };

function hasVapidKey(): boolean {
  return !!VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY.trim().length > 0;
}

function hasPushConfig(): boolean {
  if (hasVapidKey()) return true;

  if (!didWarnMissingVapidKey && typeof window !== 'undefined') {
    console.warn(
      'NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set or empty. Push notifications are disabled.',
    );
    didWarnMissingVapidKey = true;
  }

  return false;
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
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

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const cleanBase64 = base64String.trim().replace(/["']/g, '');
  const padding = '='.repeat((4 - (cleanBase64.length % 4)) % 4);
  const base64 = (cleanBase64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/sw.js');

  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      const onControllerChange = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      // Safety timeout in case the controller never changes.
      setTimeout(onControllerChange, 3000);
    });
  }

  return navigator.serviceWorker.ready;
}

/**
 * Get the existing browser push subscription (if any), WITHOUT destroying it.
 * We NEVER call unsubscribe() before subscribe() — doing so triggers a long
 * cooldown in FCM/Chrome on Android that makes new subscriptions fail.
 */
async function getOrCreateBrowserSubscription(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscriptionPayload | null> {
  if (!isPushAPISupported()) return null;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing.toJSON() as unknown as PushSubscriptionPayload;
  }

  if (!hasVapidKey()) return null;

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    });
    return subscription.toJSON() as unknown as PushSubscriptionPayload;
  } catch (err) {
    console.warn(
      '[Push] Failed to create a new subscription:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Store the endpoint of the last known subscription for THIS device.
 * Used to detect dead DB rows when the browser subscription disappears.
 */
function rememberEndpoint(endpoint: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (endpoint) {
      localStorage.setItem(ENDPOINT_STORAGE_KEY, endpoint);
    } else {
      localStorage.removeItem(ENDPOINT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function getRememberedEndpoint(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ENDPOINT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function usePushNotifications() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  const isIos = isIosDevice();
  const isStandalone = isStandalonePwa();
  const isIosNonStandalone = isIos && !isStandalone;

  const browserSupportsPush = isPushAPISupported();
  const hasVapid = hasVapidKey();
  const pushSupported = canUsePush();

  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  const {
    data: isSubscribed,
    isLoading: isCheckingSubscription,
  } = useQuery({
    queryKey: ['push-subscription', user?.id],
    queryFn: async () => {
      if (!user) return false;
      if (!pushSupported) return false;
      if (typeof window === 'undefined' || !('Notification' in window)) return false;
      if (Notification.permission !== 'granted') return false;

      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const browserSub = await registration?.pushManager.getSubscription();
      const browserEndpoint = browserSub?.endpoint ?? null;

      const dbStatus = await pushApi.isSubscribed(browserEndpoint ?? undefined).catch(() => ({
        subscribed: false,
        matchedEndpoint: false,
      }));

      if (browserSub && (!dbStatus.subscribed || !dbStatus.matchedEndpoint)) {
        try {
          const payload = browserSub.toJSON() as unknown as PushSubscriptionPayload;
          if (payload?.endpoint) {
            await pushApi.subscribe(payload);
            rememberEndpoint(payload.endpoint);
            return true;
          }
        } catch {
          return false;
        }
      }

      if (!browserSub && Notification.permission === 'granted') {
        const rememberedEndpoint = getRememberedEndpoint();
        const thisDeviceHadSub = rememberedEndpoint && dbStatus.matchedEndpoint;

        if (thisDeviceHadSub) {
          try {
            await pushApi.unsubscribe(rememberedEndpoint!);
          } catch {
            // Ignore cleanup errors
          }
        }

        if (dbStatus.subscribed && !thisDeviceHadSub) {
          return false;
        }

        try {
          const freshReg = await navigator.serviceWorker.ready;
          const newSub = await getOrCreateBrowserSubscription(freshReg);
          if (newSub?.endpoint) {
            await pushApi.subscribe(newSub);
            rememberEndpoint(newSub.endpoint);
            return true;
          }
        } catch {
          return false;
        }
      }

      if (!browserSub && !dbStatus.subscribed) return false;

      return true;
    },
    enabled: !!user?.id && pushSupported,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (): Promise<{ success: boolean; error?: string }> => {
      setSubscribeError(null);
      if (!user) return { success: false, error: 'Необхідна авторизація' };
      if (!pushSupported) return { success: false, error: 'Push API не підтримується' };

      try {
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            return { success: false, error: 'Дозвіл на сповіщення відхилено' };
          }
        } else if (Notification.permission !== 'granted') {
          return { success: false, error: 'Дозвіл на сповіщення заблоковано в налаштуваннях' };
        }

        const registration = await getPushRegistration();
        const subscription = await getOrCreateBrowserSubscription(registration);

        if (!subscription?.endpoint) {
          const errMsg =
            'Браузер не зміг створити push-підписку. Якщо ви нещодавно вимикали сповіщення — зачекайте кілька хвилин і спробуйте ще раз. Також перевірте, що Google Push не заблоковано VPN / AdBlock.';
          setSubscribeError(errMsg);
          return { success: false, error: errMsg };
        }

        await pushApi.subscribe(subscription);
        rememberEndpoint(subscription.endpoint);
        return { success: true };
      } catch (err: unknown) {
        console.error('[Push] Subscribe error:', err);
        const errMsg =
          err instanceof Error
            ? err.message
            : 'Помилка реєстрації підписки у push-сервісі браузера';
        setSubscribeError(errMsg);
        return { success: false, error: errMsg };
      }
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.setQueryData(['push-subscription', user?.id], true);
        queryClient.invalidateQueries({ queryKey: ['push-subscription', user?.id] });
      }
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!user) return false;
      if (!pushSupported) return false;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await pushApi.unsubscribe(endpoint);
        rememberEndpoint(null);
      } else {
        await pushApi.unsubscribe();
        rememberEndpoint(null);
      }

      return false;
    },
    onSuccess: (subscribed) => {
      queryClient.setQueryData(['push-subscription', user?.id], subscribed);
      queryClient.invalidateQueries({ queryKey: ['push-subscription', user?.id] });
    },
  });

  // Sync push subscription state when user logs in or permission changes
  useEffect(() => {
    if (!user || !pushSupported) return;

    const syncPushState = async () => {
      if (isCheckingSubscription) return;
      const hasDbSub = queryClient.getQueryData(['push-subscription', user.id]) === true;
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const browserSub = await registration?.pushManager.getSubscription();
      const permission =
        typeof window !== 'undefined' && 'Notification' in window
          ? Notification.permission
          : 'default';

      if (permission === 'granted' && !browserSub && !hasDbSub) {
        return;
      }

      if (permission === 'granted' && browserSub && !hasDbSub) {
        const payload = browserSub.toJSON() as unknown as PushSubscriptionPayload;
        if (payload?.endpoint) {
          try {
            await pushApi.subscribe(payload);
            rememberEndpoint(payload.endpoint);
            queryClient.setQueryData(['push-subscription', user.id], true);
          } catch {
            // ignore sync errors
          }
        }
        return;
      }

      if (permission === 'denied' || (permission === 'default' && !hasDbSub && !browserSub)) {
        return;
      }

      if (permission === 'granted' && !browserSub && hasDbSub) {
        const rememberedEndpoint = getRememberedEndpoint();
        if (rememberedEndpoint) {
          try {
            await pushApi.unsubscribe(rememberedEndpoint);
            queryClient.setQueryData(['push-subscription', user.id], false);
          } catch {
            // ignore cleanup errors
          }
        }
      }
    };
    void syncPushState();
  }, [user?.id, pushSupported, queryClient, isCheckingSubscription]);

  // Invalidate subscription state whenever permission changes
  useEffect(() => {
    if (!user || !pushSupported) return;
    const refreshState = () => {
      queryClient.invalidateQueries({ queryKey: ['push-subscription', user?.id] });
    };
    window.addEventListener('focus', refreshState);
    refreshState();
    return () => {
      window.removeEventListener('focus', refreshState);
    };
  }, [pushSupported, user, queryClient]);

  const state = useMemo<PushState>((): PushState => {
    if (!pushSupported) return { kind: 'unsupported' };
    if (isCheckingSubscription) return { kind: 'loading' };

    const permission =
      typeof window !== 'undefined' && 'Notification' in window
        ? Notification.permission
        : 'default';

    if (permission === 'denied') return { kind: 'permission-denied' };
    if (permission === 'default') return { kind: 'needs-permission' };
    if (isSubscribed) return { kind: 'ready' };

    return { kind: 'needs-subscribe' };
  }, [pushSupported, isCheckingSubscription, isSubscribed]);

  return {
    isSubscribed: !!isSubscribed,
    isCheckingSubscription,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
    isSupported: pushSupported,
    pushSupported,
    browserSupportsPush,
    hasVapid,
    permissionDenied: state.kind === 'permission-denied',
    isIos,
    isStandalone,
    isIosNonStandalone,
    subscribeError,
    subscribe: useCallback(() => subscribeMutation.mutateAsync(), [subscribeMutation]),
    unsubscribe: useCallback(() => unsubscribeMutation.mutateAsync(), [unsubscribeMutation]),
    state,
  };
}
