'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/auth-context';
import { exportPublicKey, generateKeyPair, storePrivateKey } from '@/lib/crypto';
import { keysApi } from '@/services';

/**
 * Спроба «закріпити» IndexedDB-базу з ключами, щоб браузер не викидав її
 * при нестачі місця чи періодичному прибиранні сайтів. Best-effort:
 * у більшості браузерів просто підтверджує поточний статус, тому це лише
 * додатковий захист, а не гарантія.
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
   * true, якщо локальний приватний ключ зник, хоча раніше на сервері був
   * публічний ключ цього користувача. Це означає втрату ключа (очищені
   * дані браузера / інший пристрій): старі повідомлення вже не
   * розшифрувати. Новий ключ генерується для подальшої роботи.
   */
  lostKey: boolean;
}

/**
 * Ініціалізація E2EE ключів при вході користувача.
 *
 * - Перевіряє, чи є ключ у IndexedDB
 * - Якщо є — перевіряє, чи публічний ключ на сервері актуальний
 * - Якщо немає — генерує нову пару. Якщо на сервері вже був публічний ключ
 *   цього користувача, фіксує втрату ключа (`lostKey`) і попереджає.
 */
export function useE2EEInit() {
  const { user } = useSupabaseAuth();

  const { data, isLoading, error } = useQuery<E2EEInitState>({
    queryKey: ['e2ee-init', user?.id],
    queryFn: async () => {
      if (!user) return { isInitialized: false, lostKey: false };

      void requestPersistentStorage();

      // 1. Спробуємо отримати приватний ключ з IndexedDB
      const { getPrivateKey } = await import('@/lib/crypto');
      const existingKey = await getPrivateKey(user.id);

      // Реєструємо поточний пристрій (per-device E2EE). Якщо реєстрація
      // недоступна (міграція не застосована), не ламаємо ініціалізацію —
      // залишиться fallback на стару схему спільного секрету.
      const ensureDevice = async () => {
        try {
          const { ensureDevice: ensure } = await import('@/lib/device');
          await ensure(user.id);
        } catch (e) {
          console.warn('Device registration failed (per-device E2EE disabled):', e);
        }
      };

      if (existingKey) {
        // Ключ вже є — перевіряємо публічний на сервері
        try {
          const serverKey = await keysApi.getPublicKey(user.id);
          if (serverKey) {
            await ensureDevice();
            return { isInitialized: true, lostKey: false };
          }
        } catch {
          // Помилка отримання — продовжуємо
        }

        // Публічний ключ відсутній на сервері — синхронізуємо
        const publicKeyJwk = await exportPublicKey(existingKey);
        await keysApi.upsertPublicKey(publicKeyJwk);
        await ensureDevice();
        return { isInitialized: true, lostKey: false };
      }

      // 2. Локального ключа немає. Перевіряємо, чи користувач раніше мав ключ
      //    на сервері — якщо так, це втрата ключа, і старі повідомлення
      //    вже неможливо розшифрувати.
      let hadKeyBefore = false;
      try {
        hadKeyBefore = !!(await keysApi.getPublicKey(user.id));
      } catch {
        hadKeyBefore = false;
      }

      // 3. Генеруємо нову ключову пару, щоб месенджер далі працював
      const { privateKey, publicKey } = await generateKeyPair();

      // 4. Зберігаємо приватний ключ локально
      await storePrivateKey(user.id, privateKey);

      // 5. Відправляємо публічний ключ на сервер
      const publicKeyJwk = await exportPublicKey(publicKey);
      await keysApi.upsertPublicKey(publicKeyJwk);

      await ensureDevice();
      return { isInitialized: true, lostKey: hadKeyBefore };
    },
    enabled: !!user?.id,
    staleTime: Infinity, // Ніколи не оновлюється автоматично
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
      'Ключ шифрування було втрачено (очищені дані браузера або інший пристрій). ' +
        'Раніше зашифровані повідомлення розшифрувати неможливо. ' +
        'Це особливість наскрізного шифрування — щоб цього не повторювалось, ' +
        'не очищайте дані сайту і не виходьте з цього браузера без резервної копії ключа.',
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
