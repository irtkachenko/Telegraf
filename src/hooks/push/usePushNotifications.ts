'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { pushApi, type PushSubscriptionPayload } from '@/services/push/push.service';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
let didWarnMissingVapidKey = false;

function hasVapidKey(): boolean {
  return !!VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY.trim().length > 0;
}

function hasPushConfig(): boolean {
  if (hasVapidKey()) return true;

  if (!didWarnMissingVapidKey && typeof window !== 'undefined') {
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set or empty. Push notifications are disabled.');
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/sw.js');

  // Ensure the service worker is active and controlling the page before
  // subscribing. A stale/inactive SW can cause pushManager.subscribe() to
  // fail with "Registration failed - push service error".
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

/**
 * Fully clears any existing push subscription on this device.
 * Waits for unsubscribe() to complete and adds a small delay so the
 * browser has time to propagate the removal to the push service (FCM).
 * This avoids the "Registration failed - push service error" that occurs
 * when subscribe() is called too quickly after unsubscribe() on Android.
 */
async function clearExistingSubscription(
  registration: ServiceWorkerRegistration,
): Promise<void> {
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      try {
        await existing.unsubscribe();
      } catch (unsubErr) {
        console.warn('[Push] Failed to unsubscribe existing subscription:', unsubErr);
      }
      // Give the browser time to fully remove the old subscription from FCM
      await sleep(500);
    }
  } catch (err) {
    console.warn('[Push] Failed to read existing subscription:', err);
  }
}

/**
 * Attempts to create a fresh browser push subscription with a robust retry
 * loop. On Android Chrome, a stale/broken subscription can cause
 * "Registration failed - push service error". We fully clear the old
 * subscription, wait, and retry a few times before giving up.
 */
async function createFreshBrowserSubscription(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscriptionPayload | null> {
  if (!isPushAPISupported() || !hasVapidKey()) return null;

  const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY!);

  // Try up to 3 times, fully clearing the old subscription between attempts.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await clearExistingSubscription(registration);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      return subscription.toJSON() as unknown as PushSubscriptionPayload;
    } catch (err) {
      console.warn(
        `[Push] Subscription attempt ${attempt}/3 failed:`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < 3) {
        // Wait before retrying so the push service can settle.
        await sleep(700);
      }
    }
  }

  console.error('[Push] Browser push service error: could not create a subscription after 3 attempts');
  return null;
}


async function getOrCreateBrowserSubscription(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscriptionPayload | null> {
  if (!isPushAPISupported()) return null;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing.toJSON() as unknown as PushSubscriptionPayload;
  }

  return createFreshBrowserSubscription(registration);
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
  const [permissionDenied, setPermissionDenied] = useState(
    typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'denied',
  );
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
      const browserEndpoint = browserSub?.endpoint;

      const dbStatus = await pushApi.isSubscribed(browserEndpoint).catch(() => ({
        subscribed: false,
        matchedEndpoint: false,
      }));

      // Case 2 & Case 9: Browser has sub, but DB doesn't have this exact endpoint -> Auto sync to DB
      if (browserSub && (!dbStatus.subscribed || !dbStatus.matchedEndpoint)) {
        try {
          const payload = browserSub.toJSON() as unknown as PushSubscriptionPayload;
          if (payload?.endpoint) {
            await pushApi.subscribe(payload);
            return true;
          }
        } catch {
          return false;
        }
      }

      // Case 5: Permission granted, DB has sub for user, but browser on this device doesn't have sub yet
      if (!browserSub && dbStatus.subscribed && Notification.permission === 'granted') {
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
        const subscription = await createFreshBrowserSubscription(registration);

        if (!subscription?.endpoint) {
          const errMsg =
            'Не вдалося активувати сповіщення на цьому пристрої. Перезавантажте додаток і спробуйте ще раз. Якщо не допоможе — видаліть додаток з головного екрана та додайте заново (це скидає налаштування push). Також перевірте, що Google Push не заблоковано VPN / AdBlock.';
          setSubscribeError(errMsg);
          return { success: false, error: errMsg };
        }


        await pushApi.subscribe(subscription);
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
      } else {
        await pushApi.unsubscribe();
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
      try {
        if (isCheckingSubscription) return;
        const hasDbSub = queryClient.getQueryData(['push-subscription', user.id]) === true;
        const registration = await navigator.serviceWorker.getRegistration('/sw.js');
        const browserSub = await registration?.pushManager.getSubscription();
        const permission = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';

        if (permission === 'granted' && !browserSub && !hasDbSub) {
          return;
        }

        if (permission === 'granted' && browserSub && !hasDbSub) {
          const payload = browserSub.toJSON() as unknown as PushSubscriptionPayload;
          if (payload?.endpoint) {
            try {
              await pushApi.subscribe(payload);
              queryClient.setQueryData(['push-subscription', user.id], true);
            } catch {
              // ignore sync errors
            }
          }
          return;
        }

        if (permission === 'denied') {
          setPermissionDenied(true);
          return;
        }

        if (permission === 'default' && !hasDbSub && !browserSub) {
          return;
        }
      } catch (error) {
        console.error('[Push] Sync error:', error);
      }
    };

    syncPushState();
  }, [user?.id, pushSupported, queryClient, isCheckingSubscription]);

  // Keep server subscription in sync when permission changes
  useEffect(() => {
    if (!user || !pushSupported) return;

    const syncPermissionState = () => {
      const currentPermission = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
      setPermissionDenied(currentPermission === 'denied');
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
  }, [pushSupported, user]);

  return {
    isSubscribed: !!isSubscribed,
    isCheckingSubscription,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
    isSupported: pushSupported,
    pushSupported,
    browserSupportsPush,
    hasVapid,
    permissionDenied,
    isIos,
    isStandalone,
    isIosNonStandalone,
    subscribeError,
    subscribe: useCallback(() => subscribeMutation.mutateAsync(), [subscribeMutation]),
    unsubscribe: useCallback(() => unsubscribeMutation.mutateAsync(), [unsubscribeMutation]),
  };
}