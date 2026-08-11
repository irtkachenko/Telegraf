'use client';

import { useQuery } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/auth/auth-context';
import { keysApi } from '@/services';

/**
 * Обчислити спільний секрет для діалогу через ECDH:
 *   privateKey (наш) + publicKey (співрозмовника) → AES‑GCM sharedSecret.
 *
 * Повертає live CryptoKey. Кидає, якщо:
 *  - у користувача нема приватного ключа (E2EE не ініціалізовано);
 *  - у співрозмовника нема публічного ключа на сервері.
 *
 * Не залежить від кешу React Query — використовується:
 *  - useSharedSecret (кешує результат);
 *  - useSendMessageWithFiles (fail‑secure: обчислюємо перед відправкою,
 *    щоб не дозволяти fallback на plaintext).
 */
export async function getSharedSecret(userId: string, recipientId: string): Promise<CryptoKey> {
  const [cryptoMod, recipientJwk] = await Promise.all([
    import('@/lib/crypto'),
    keysApi.getPublicKey(recipientId),
  ]);

  // 1. Свій приватний ключ із IndexedDB
  const privateKey = await cryptoMod.getPrivateKey(userId);
  if (!privateKey) {
    throw new Error('E2EE not initialized: no private key found');
  }

  // 2. Публічний ключ співрозмовника з сервера
  if (!recipientJwk) {
    throw new Error(`Recipient ${recipientId} has no public key`);
  }

  const recipientPublicKey = await cryptoMod.importPublicKey(recipientJwk);

  // 3. ECDH → спільний секрет
  return cryptoMod.deriveSharedSecret(privateKey, recipientPublicKey);
}

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
      if (!(user && recipientId)) return null;
      return getSharedSecret(user.id, recipientId);
    },
    enabled: !!user?.id && !!chatId && !!recipientId,
    staleTime: 24 * 60 * 60 * 1000, // 24 години — секрет не змінюється
    gcTime: Infinity,
    retry: 3, // не стікаємо у стан error, коли ключ ще не завантажений
    retryOnMount: true,
    retryDelay: (attempt) => Math.min(300 * 2 ** attempt, 2000),
  });
}
