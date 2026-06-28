'use client';

import { useQuery } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { keysApi } from '@/services';

/**
 * Хук для отримання/кешування спільного секрету (AES-GCM ключа)
 * для конкретного чату.
 *
 * Спільний секрет обчислюється через ECDH:
 *   privateKey (наш) + publicKey (співрозмовника) → sharedSecret
 */
export function useSharedSecret(chatId: string | undefined, recipientId: string | undefined) {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ['shared-secret', chatId, user?.id, recipientId],
    queryFn: async () => {
      if (!user || !recipientId) return null;

      const [getPrivateKey, importPublicKey, deriveSharedSecret] = await Promise.all([
        import('@/lib/crypto').then((m) => m.getPrivateKey),
        import('@/lib/crypto').then((m) => m.importPublicKey),
        import('@/lib/crypto').then((m) => m.deriveSharedSecret),
      ]);

      // 1. Отримуємо свій приватний ключ
      const privateKey = await getPrivateKey(user.id);
      if (!privateKey) {
        throw new Error('E2EE not initialized: no private key found');
      }

      // 2. Отримуємо публічний ключ співрозмовника
      const recipientJwk = await keysApi.getPublicKey(recipientId);
      if (!recipientJwk) {
        throw new Error(`Recipient ${recipientId} has no public key`);
      }

      const recipientPublicKey = await importPublicKey(recipientJwk);

      // 3. Обчислюємо спільний секрет
      const sharedSecret = await deriveSharedSecret(privateKey, recipientPublicKey);

      return sharedSecret;
    },
    enabled: !!user?.id && !!chatId && !!recipientId,
    staleTime: 24 * 60 * 60 * 1000, // 24 години — секрет не змінюється
    gcTime: Infinity,
    retry: 1,
  });
}
