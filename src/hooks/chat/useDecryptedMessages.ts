'use client';

import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/auth-context';
import type { CurrentDevice } from '@/lib/device';
import {
  cacheDecryptedMessage,
  getChatDecryptedMessages,
} from '@/lib/decrypted-message-cache';
import { isSignalEncryptedMessage } from '@/services/crypto';
import type { Message } from '@/types';

/**
 * Спроба розшифрувати повідомлення через Signal-сесію для поточного пристрою.
 * Повертає null, якщо пристрій не є одержувачем або розшифрування не вдалось —
 * додаток не падає, а показує нейтральний стан.
 */
async function tryDecryptMessageContent(
  msg: Message,
  chatId: string,
  ctx: { userId?: string; myDeviceId?: string },
): Promise<string | null> {
  if (!ctx.userId || !ctx.myDeviceId) return null;
  try {
    const { decryptMessageContentForDevice } = await import('@/services');
    const decrypted = await decryptMessageContentForDevice({
      userId: ctx.userId,
      myDeviceId: ctx.myDeviceId,
      chatId,
      message: msg,
    });
    return decrypted !== null ? decrypted : null;
  } catch {
    return null;
  }
}

/**
 * Повідомлення ще не розшифроване на цьому клієнті, якщо воно несе Signal
 * per-device payload (`message_keys`) і `content` досі є плейсхолдером
 * ('🔒' або null). Після успішного розшифрування `content` стає текстом.
 */
function isUndecrypted(message: Message): boolean {
  return (
    isSignalEncryptedMessage(message) &&
    (message.content === null || message.content === '🔒' || message.content === '')
  );
}

/**
 * Хук для дешифрування повідомлень у чаті.
 *
 * Автоматично розшифровує Signal-повідомлення та оновлює кеш react-query
 * InfiniteData. Кандидати відбираються за станом `content` (плейсхолдер),
 * тому після перезавантаження кешу зашифровані повідомлення розшифруються
 * знову автоматично. Нерозшифровані id зберігаються, щоб не повторювати
 * спроби.
 */
export function useDecryptChatMessages(
  chatId: string | undefined,
  _recipientId: string | undefined,
  messages: Message[],
) {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [device, setDevice] = useState<CurrentDevice | null>(null);

  // Завантажуємо поточний пристрій (необхідний для Signal-сесії).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentDevice } = await import('@/lib/device');
        const d = await getCurrentDevice(user.id);
        if (!cancelled) setDevice(d);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const myDeviceId = device?.deviceId ?? undefined;

  useEffect(() => {
    if (!chatId || messages.length === 0) return;
    if (!myDeviceId) return;

    let cancelled = false;

    // 1) Спершу зчитуємо вже розшифровані тексти з локального кешу
    //    (IndexedDB). Це те, що робить повідомлення миттєвими після F5:
    //    Double Ratchet не може (і не повинен) перешифровувати старі
    //    повідомлення, а тут ми просто беремо збережений plaintext.
    const applyCached = async () => {
      let cached: Map<string, string>;
      try {
        cached = await getChatDecryptedMessages(chatId);
      } catch {
        cached = new Map();
      }
      if (cancelled) return;

      const cachedUpdates = new Map<string, string>();
      for (const m of messages) {
        if (!isSignalEncryptedMessage(m)) continue;
        const plain = cached.get(m.id);
        if (plain && isUndecrypted(m)) cachedUpdates.set(m.id, plain);
      }

      if (cachedUpdates.size > 0) {
        queryClient.setQueryData<InfiniteData<Message[]>>(['messages', chatId], (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((msg) => {
                const decrypted = cachedUpdates.get(msg.id);
                return decrypted ? { ...msg, content: decrypted } : msg;
              }),
            ),
          };
        });
      }

      // 2) Решта повідомлень — розшифровуємо через Signal і ОДРАЗУ
      //    зберігаємо результат у кеш, щоб наступне завантаження було миттєвим.
      const pending = messages.filter(isUndecrypted).filter((m) => !failedIds.has(m.id));
      if (pending.length === 0) return;

      const results = await Promise.all(
        pending.map(async (msg) => {
          const plaintext = await tryDecryptMessageContent(msg, chatId, {
            userId: user?.id,
            myDeviceId,
          });
          return { id: msg.id, plaintext };
        }),
      );

      const updates = new Map<string, string>();
      const newlyFailed: string[] = [];
      for (const { id, plaintext } of results) {
        if (plaintext === null) {
          newlyFailed.push(id);
          continue;
        }
        updates.set(id, plaintext);
        // Зберігаємо розшифрований текст локально.
        try {
          await cacheDecryptedMessage(chatId, id, plaintext);
        } catch {
          // best-effort: якщо IndexedDB недоступний, просто не кешуємо.
        }
      }

      if (newlyFailed.length > 0) {
        setFailedIds((prev) => {
          const next = new Set(prev);
          for (const id of newlyFailed) next.add(id);
          return next;
        });
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

    applyCached();
    return () => {
      cancelled = true;
    };
  }, [chatId, messages, myDeviceId, user?.id, queryClient, failedIds]);

  return { failedIds };
}