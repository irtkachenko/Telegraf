'use client';

import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSharedSecret } from '@/hooks/keys';
import type { Message } from '@/types';

/**
 * Спроба розшифрувати зашифрований вміст повідомлення.
 */
async function tryDecryptMessageContent(
  encryptedContent: string,
  encryptedIv: string,
  sharedSecret: CryptoKey | undefined,
): Promise<string | null> {
  if (!sharedSecret) return null;
  try {
    const { decryptMessageContent } = await import('@/services');
    return decryptMessageContent(sharedSecret, encryptedContent, encryptedIv);
  } catch {
    return null;
  }
}


/**
 * Хук для дешифрування повідомлень у чаті.
 *
 * Автоматично дешифрує encrypted_content/encrypted_iv всіх повідомлень
 * та оновлює кеш react-query InfiniteData структури.
 */
export function useDecryptChatMessages(
  chatId: string | undefined,
  recipientId: string | undefined,
  messages: Message[],
) {
  const queryClient = useQueryClient();
  const { data: sharedSecret } = useSharedSecret(chatId, recipientId);
  const decryptedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!sharedSecret || !chatId || messages.length === 0) return;

    const pending = messages.filter(
      (m) => m.encrypted_content && m.encrypted_iv && !decryptedIds.current.has(m.id),
    );
    if (pending.length === 0) return;

    const decryptAll = async () => {
      const results = await Promise.all(
        pending.map(async (msg) => {
          const plaintext = await tryDecryptMessageContent(
            msg.encrypted_content!,
            msg.encrypted_iv!,
            sharedSecret,
          );
          return plaintext !== null ? { id: msg.id, decrypted: plaintext } : null;
        }),
      );

      const updates = new Map<string, string>();
      for (const result of results) {
        if (!result) continue;
        updates.set(result.id, result.decrypted);
        decryptedIds.current.add(result.id);
      }

      if (updates.size === 0) return;

      // Оновлюємо InfiniteData кеш ['messages', chatId]
      queryClient.setQueryData<InfiniteData<Message[]>>(['messages', chatId], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((msg) => {
              const decrypted = updates.get(msg.id);
              return decrypted ? { ...msg, content: decrypted } : msg;
            }),
          ),
        };
      });
    };

    decryptAll();
  }, [sharedSecret, chatId, messages, queryClient]);

  return { sharedSecret };
}
