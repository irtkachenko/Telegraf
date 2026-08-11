'use client';

import { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/auth-context';
import { useSharedSecret } from '@/hooks/keys';
import type { Message } from '@/types';

interface ChatPreviewLineProps {
  chatId: string;
  recipientId?: string;
  lastMessage?: Message | null;
  currentUserId?: string;
}

/**
 * Прев'ю останнього повідомлення в списку чатів.
 *
 * Для зашифрованих (E2EE) повідомлень не показує плейсхолдер «🔒»:
 * - спершу пробує per-device (багатопристроєве) розшифрування;
 * - якщо не вийшло — стару схему спільного секрету;
 * - якщо ще не готове — показує нейтральний стан (без замка), а коли ключ
 *   з'явиться, розшифровується автоматично.
 */
export function ChatPreviewLine({
  chatId,
  recipientId,
  lastMessage,
  currentUserId,
}: ChatPreviewLineProps) {
  const { user } = useSupabaseAuth();
  const { data: sharedSecret } = useSharedSecret(chatId, recipientId);
  // Розшифрований текст для конкретного повідомлення (id-guard від гонок).
  const [decrypted, setDecrypted] = useState<{ id: string; text: string } | null>(null);

  const isEncrypted = !!lastMessage?.encrypted_content && !!lastMessage?.encrypted_iv;
  const hasAttachments =
    Array.isArray(lastMessage?.attachments) && lastMessage.attachments.length > 0;

  useEffect(() => {
    if (!lastMessage || !isEncrypted) return;

    let cancelled = false;
    (async () => {
      const enc = lastMessage.encrypted_content!;
      const iv = lastMessage.encrypted_iv!;

      // 1. Per-device E2EE.
      try {
        if (user?.id) {
          const { getCurrentDevice } = await import('@/lib/device');
          const device = await getCurrentDevice(user.id);
          if (device) {
            const { decryptMessageContentForDevice } = await import('@/services');
            const text = await decryptMessageContentForDevice(
              device.privateKey,
              device.deviceId,
              chatId,
              lastMessage,
            );
            if (text !== null) {
              if (!cancelled) setDecrypted({ id: lastMessage.id, text });
              return;
            }
          }
        }
      } catch {
        // fallback
      }

      // 2. Legacy: спільний секрет.
      try {
        if (sharedSecret) {
          const { decryptMessageContent } = await import('@/services');
          const text = await decryptMessageContent(sharedSecret, chatId, enc, iv);
          if (!cancelled) setDecrypted({ id: lastMessage.id, text });
        }
      } catch {
        // Не вдалось розшифрувати — залишаємо порожній стан.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, sharedSecret, lastMessage, isEncrypted, user?.id]);

  const isCurrentDecrypted = decrypted?.id === lastMessage?.id;
  const displayText = isEncrypted
    ? isCurrentDecrypted
      ? decrypted!.text
      : ''
    : lastMessage?.content || '';

  const prefix = lastMessage?.sender_id === currentUserId ? 'Ви: ' : '';
  const body =
    displayText && displayText.length > 0
      ? displayText
      : hasAttachments
        ? '📎 Медіа'
        : isEncrypted
          ? '' // шифроване, ще не розшифроване — просто порожньо
          : 'Немає повідомлень';

  return (
    <>
      {prefix}
      {body}
    </>
  );
}

