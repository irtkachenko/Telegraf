'use client';

import { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/auth-context';
import { isSignalEncryptedMessage } from '@/services/crypto';
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
 * Для Signal-зашифрованих повідомлень не показує плейсхолдер «🔒»: спершу
 * намагається розшифрувати через локальну Signal-сесію, а поки ключ не готовий
 * — показує нейтральний стан (без замка). Розшифровується автоматично, коли
 * з'являється можливість.
 */
export function ChatPreviewLine({
  chatId,
  lastMessage,
  currentUserId,
}: ChatPreviewLineProps) {
  const { user } = useSupabaseAuth();
  const [decrypted, setDecrypted] = useState<{ id: string; text: string } | null>(null);

  const isEncrypted = !!lastMessage && isSignalEncryptedMessage(lastMessage);
  const hasAttachments =
    Array.isArray(lastMessage?.attachments) && lastMessage.attachments.length > 0;

  useEffect(() => {
    if (!lastMessage || !isEncrypted) return;

    let cancelled = false;
    (async () => {
      try {
        if (!user?.id) return;
        const { getCurrentDevice } = await import('@/lib/device');
        const device = await getCurrentDevice(user.id);
        if (!device) return;

        const { decryptMessageContentForDevice } = await import('@/services');
        const text = await decryptMessageContentForDevice({
          userId: user.id,
          myDeviceId: device.deviceId,
          chatId,
          message: lastMessage,
        });
        if (text !== null && !cancelled) {
          setDecrypted({ id: lastMessage.id, text });
        }
      } catch {
        // Не вдалось розшифрувати — залишаємо нейтральний стан.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, lastMessage, isEncrypted, user?.id]);

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
          ? '' // зашифроване, ще не розшифроване — просто порожньо
          : 'Немає повідомлень';

  return (
    <>
      {prefix}
      {body}
    </>
  );
}