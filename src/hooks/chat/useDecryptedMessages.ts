'use client';

import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSharedSecret } from '@/hooks/keys';
import type { Attachment, Message } from '@/types';

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
 * Спроба розшифрувати метадані файлу (назву, тип, ключ).
 */
async function tryDecryptFileMetadata(
  encMetadata: string,
  encIv: string,
  sharedSecret: CryptoKey,
): Promise<{ name: string; type: string } | null> {
  try {
    const { decryptFileAttachment } = await import('@/services');
    const result = await decryptFileAttachment(sharedSecret, new Blob(), encMetadata, encIv);
    return { name: result.name, type: result.type };
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
      const updates = new Map<string, string>();

      for (const msg of pending) {
        const plaintext = await tryDecryptMessageContent(
          msg.encrypted_content!,
          msg.encrypted_iv!,
          sharedSecret,
        );
        if (plaintext !== null) {
          updates.set(msg.id, plaintext);
          decryptedIds.current.add(msg.id);
        }
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
  }, [sharedSecret, messages, chatId, queryClient]);

  return { sharedSecret };
}
