'use client';

import { useEffect, useState } from 'react';
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
 * - якщо sharedSecret готовий — розшифровує локально й показує текст;
 * - якщо ще не готовий — показує нейтральний стан (без замка), а коли секрет
 *   з'явиться, розшифровується автоматично (reactive до useSharedSecret).
 */
export function ChatPreviewLine({
  chatId,
  recipientId,
  lastMessage,
  currentUserId,
}: ChatPreviewLineProps) {
  const { data: sharedSecret } = useSharedSecret(chatId, recipientId);
  // Розшифрований текст для конкретного повідомлення (id-guard від гонок).
  const [decrypted, setDecrypted] = useState<{ id: string; text: string } | null>(null);

  const isEncrypted = !!lastMessage?.encrypted_content && !!lastMessage?.encrypted_iv;
  const hasAttachments =
    Array.isArray(lastMessage?.attachments) && lastMessage.attachments.length > 0;

  useEffect(() => {
    if (!lastMessage || !isEncrypted || !sharedSecret) return;

    let cancelled = false;
    (async () => {
      try {
        const { decryptMessageContent } = await import('@/services');
        const text = await decryptMessageContent(
          sharedSecret,
          chatId,
          lastMessage.encrypted_content!,
          lastMessage.encrypted_iv!,
        );
        if (!cancelled) setDecrypted({ id: lastMessage.id, text });
      } catch {
        // Не вдалось розшифрувати — залишаємо порожній стан.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, sharedSecret, lastMessage, isEncrypted]);

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

