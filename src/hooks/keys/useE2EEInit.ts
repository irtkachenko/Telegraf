'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import {
  generateKeyPair,
  exportPublicKey,
  storePrivateKey,
} from '@/lib/crypto';
import { keysApi } from '@/services';

/**
 * Ініціалізація E2EE ключів при вході користувача.
 *
 * - Перевіряє, чи є ключ у IndexedDB
 * - Якщо немає — генерує нову пару, зберігає приватний ключ,
 *   публічний ключ синхронізує з сервером
 * - Якщо ключ є — перевіряє, чи публічний ключ на сервері актуальний
 */
export function useE2EEInit() {
  const { user } = useSupabaseAuth();

  const {
    data: isInitialized,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['e2ee-init', user?.id],
    queryFn: async () => {
      if (!user) return false;

      // 1. Спробуємо отримати приватний ключ з IndexedDB
      const { getPrivateKey } = await import('@/lib/crypto');
      const existingKey = await getPrivateKey(user.id);

      if (existingKey) {
        // Ключ вже є — перевіряємо публічний на сервері
        try {
          const serverKey = await keysApi.getPublicKey(user.id);
          if (serverKey) return true; // Все ок
        } catch {
          // Помилка отримання — продовжуємо
        }

        // Публічний ключ відсутній на сервері — синхронізуємо
        const publicKeyJwk = await exportPublicKey(
          existingKey,
        );
        await keysApi.upsertPublicKey(publicKeyJwk);
        return true;
      }

      // 2. Генеруємо нову ключову пару
      const { privateKey, publicKey } = await generateKeyPair();

      // 3. Зберігаємо приватний ключ локально
      await storePrivateKey(user.id, privateKey);

      // 4. Відправляємо публічний ключ на сервер
      const publicKeyJwk = await exportPublicKey(publicKey);
      await keysApi.upsertPublicKey(publicKeyJwk);

      return true;
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

  return { isInitialized: !!isInitialized, isLoading };
}
