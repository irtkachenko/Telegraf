'use client';

import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/auth-context';
import { useSharedSecret } from '@/hooks/keys';
import type { CurrentDevice } from '@/lib/device';
import type { Message } from '@/types';

/**
 * Спроба розшифрувати повідомлення. Спершу пробує per-device (багатопристроєве
 * E2EE: розгорнути ключ повідомлення своїм пристроєм), потім — стару схему
 * спільного секрету (для старих повідомлень). Повертає null, якщо не вийшло.
 */
async function tryDecryptMessageContent(
  msg: Message,
  chatId: string,
  ctx: {
    myDeviceId?: string;
    devicePrivateKey?: CryptoKey;
    sharedSecret?: CryptoKey | null;
  },
): Promise<string | null> {
  if (!msg.encrypted_content || !msg.encrypted_iv) return null;

  // 1. Per-device E2EE.
  if (ctx.myDeviceId && ctx.devicePrivateKey) {
    try {
      const { decryptMessageContentForDevice } = await import('@/services');
      const decrypted = await decryptMessageContentForDevice(
        ctx.devicePrivateKey,
        ctx.myDeviceId,
        chatId,
        msg,
      );
      // TODO(debug): remove
      console.log('[E2EE][decrypt] per-device', { myDeviceId: ctx.myDeviceId, messageKeys: msg.message_keys?.length, senderDev: !!msg.sender_device_public_key, ok: decrypted !== null });
      if (decrypted !== null) return decrypted;
    } catch (e) {
      // TODO(debug): remove
      console.warn('[E2EE][decrypt] per-device error', e);
    }
  }

  // 2. Legacy: спільний секрет.
  if (ctx.sharedSecret) {
    try {
      const { decryptMessageContent } = await import('@/services');
      const decrypted = await decryptMessageContent(
        ctx.sharedSecret,
        chatId,
        msg.encrypted_content,
        msg.encrypted_iv,
      );
      // TODO(debug): remove
      console.log('[E2EE][decrypt] legacy ok?', decrypted !== null);
      return decrypted;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Повідомлення ще не розшифроване на цьому клієнті, якщо його `content`
 * досі є плейсхолдером з сервера ('🔒' або null). Після успішного
 * розшифрування `content` стає реальним текстом і більше не збігається.
 *
 * Не перевіряємо порожній рядок: повідомлення лише з файлами мають
 * порожній текст ПІСЛЯ розшифрування, тож така перевірка спричинила б
 * безкінечне повторне розшифрування.
 */
type EncryptedMessage = Message & {
  encrypted_content: string;
  encrypted_iv: string;
};

function isUndecrypted(message: Message): message is EncryptedMessage {
  return (
    !!message.encrypted_content &&
    !!message.encrypted_iv &&
    (message.content === null || message.content === '🔒')
  );
}

/**
 * Хук для дешифрування повідомлень у чаті.
 *
 * Автоматично дешифрує encrypted_content/encrypted_iv всіх повідомлень
 * та оновлює кеш react-query InfiniteData структури.
 *
 * Кандидати на дешифрування відбираються за станом `content` (плейсхолдер),
 * а не за одноразовим набором id. Тому якщо кеш повідомлень буде
 * перезавантажено сирими зашифрованими рядками (наприклад, invalidateQueries
 * після видалення повідомлення), зашифровані повідомлення розшифруються
 * повторно автоматично, а не залишаться порожніми.
 */
export function useDecryptChatMessages(
  chatId: string | undefined,
  recipientId: string | undefined,
  messages: Message[],
) {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const { data: sharedSecret } = useSharedSecret(chatId, recipientId);

  // Повідомлення, які не вдалось розшифрувати (спільний секрет не збігається).
  // Використовується для показу зрозумілого замінника замість порожнього бульки.
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [device, setDevice] = useState<CurrentDevice | null>(null);

  // Завантажуємо поточний пристрій (для per-device E2EE).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentDevice } = await import('@/lib/device');
        const d = await getCurrentDevice(user.id);
        if (!cancelled) setDevice(d);
      } catch {
        // ignore — залишається legacy-дешифрування
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!chatId || messages.length === 0) return;
    if (!sharedSecret && !device) return;

    // Не чіпаємо ті, що вже не вдалось розшифрувати (щоб не повторювати спроби).
    const pending = messages.filter(isUndecrypted).filter((m) => !failedIds.has(m.id));
    if (pending.length === 0) return;

    const decryptAll = async () => {
      const results = await Promise.all(
        pending.map(async (msg) => {
          const plaintext = await tryDecryptMessageContent(msg, chatId, {
            myDeviceId: device?.deviceId,
            devicePrivateKey: device?.privateKey,
            sharedSecret,
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

    decryptAll();
  }, [sharedSecret, chatId, messages, queryClient, failedIds, device]);

  return { sharedSecret, failedIds };
}
