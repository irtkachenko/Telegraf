'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/auth-context';
import { getCurrentDevice } from '@/lib/device';
import { createSignalStore, ensureSignalIdentity } from '@/services';

/**
 * Спроба «закріпити» IndexedDB-базу з ключами, щоб браузер не викидав її
 * при нестачі місця чи періодичному прибиранні сайтів. Best-effort.
 */
async function requestPersistentStorage(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // ignore
  }
}

export interface E2EEInitState {
  isInitialized: boolean;
  /**
   * true, якщо локальний Signal identity пристрою зник (очищені дані
   * браузера / інший пристрій), хоча сам пристрій зареєстрований. Старі
   * повідомлення вже не розшифрувати; генерується новий identity.
   */
  lostKey: boolean;
}

/**
 * Ініціалізація Signal Protocol ключів при вході користувача.
 *
 * - Реєструє пристрій (device row) за потреби.
 * - Гарантує наявність локального Signal identity (identity key, signed
 *   pre-key, one-time pre-keys) та відвантажує публічні pre-keys на сервер.
 *   Це дозволяє НОВОМУ користувачеві одразу отримати перше повідомлення.
 * - Фіксує втрату ключа (`lostKey`), якщо локальний identity зник.
 */
export function useE2EEInit() {
  const { user } = useSupabaseAuth();

  const { data, isLoading, error } = useQuery<E2EEInitState>({
    queryKey: ['e2ee-init', user?.id],
    queryFn: async () => {
      if (!user) return { isInitialized: false, lostKey: false };
      // SSR guard: the query is only meant to run in the browser. During
      // static generation the client component is rendered server-side, but
      // IndexedDB / localStorage / the Supabase client must never be touched
      // there (this also protects against any accidental server-side fetch).
      if (typeof window === 'undefined') {
        return { isInitialized: false, lostKey: false };
      }

      void requestPersistentStorage();

      try {
        const { ensureDevice } = await import('@/lib/device');
        const device = await ensureDevice(user.id);

        const store = createSignalStore(user.id, device.deviceId);
        const hadIdentityBefore = !!(await store.getIdentityKeyPair());

        // Генерація/синхронізація Signal identity та pre-keys (idempotent).
        await ensureSignalIdentity(user.id, device.deviceId);

        // Пристрій існує, але локальний identity зник — старі повідомлення
        // розшифрувати неможливо (втрата ключа).
        return { isInitialized: true, lostKey: !hadIdentityBefore };
      } catch (e) {
        console.error('Signal init failed:', e);
        return { isInitialized: false, lostKey: false };
      }
    },
    enabled: !!user?.id,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });

  useEffect(() => {
    if (error) {
      console.error('E2EE init failed:', error);
    }
  }, [error]);

  // Попереджаємо про втрату ключа один раз за сесію вкладки.
  useEffect(() => {
    if (!(data?.lostKey && user?.id)) return;
    try {
      if (sessionStorage.getItem(`e2ee-key-lost-${user.id}`)) return;
      sessionStorage.setItem(`e2ee-key-lost-${user.id}`, '1');
    } catch {
      // sessionStorage може бути недоступний — просто показуємо попередження
    }
    toast.warning(
      'Ключі шифрування було втрачено (очищені дані браузера або інший пристрій). ' +
        'Раніше зашифровані повідомлення розшифрувати неможливо. ' +
        'Це особливість наскрізного шифрування (Signal Protocol) — щоб цього не повторювалось, ' +
        'не очищайте дані сайту без резервної копії ключа.',
      { duration: 12000 },
    );
  }, [data?.lostKey, user?.id]);

  return {
    isInitialized: !!data?.isInitialized,
    lostKey: !!data?.lostKey,
    isLoading,
    error,
  };
}