'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { useStorageLimits } from '@/hooks/useDynamicStorageConfig';
import { extractStorageRef, type StorageRef } from '@/lib/storage-utils';
import {
  encryptMessageContent,
  encryptFileAttachment,
  messagesApi,
  storageApi,
  uploadFileOptimized,
} from '@/services';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, NetworkError, ValidationError } from '@/shared/lib/errors';
import type { Attachment, Message } from '@/types';

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'video' | 'file';
  metadata: { name: string; size: number };
}

interface SendMessageWithFilesParams {
  content: string;
  files: File[];
  reply_to_id?: string;
  client_id?: string;
}

function getFileType(mimeType: string): 'image' | 'video' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function buildReplyDetails(
  parentMessage: Message | null | undefined,
  reply_to_id: string | undefined,
): Message['reply_details'] {
  if (parentMessage) {
    return {
      id: parentMessage.id,
      sender: parentMessage.sender || { name: parentMessage.user?.name },
      content: parentMessage.content ?? '',
      sender_id: parentMessage.sender_id ?? undefined,
      attachments: parentMessage.attachments ?? undefined,
    };
  }
  if (reply_to_id) {
    return {
      id: reply_to_id,
      sender: { name: null },
      content: 'Завантаження...',
      sender_id: undefined,
      attachments: undefined,
    };
  }
  return null;
}

/**
 * Хук для паралельної відправки повідомлень з файлами
 */
export function useSendMessageWithFiles(
  chatId: string,
  options?: {
    recipientId?: string;
  },
) {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const { validateFile } = useStorageLimits();

  // Простий кеш для запитів повідомлень, щоб уникнути дублікатів
  const messageFetchCache = useRef<Map<string, Promise<Message>>>(new Map());

  const getMessageWithCache = async (messageId: string): Promise<Message | null> => {
    const cached = messageFetchCache.current.get(messageId);
    if (cached) {
      try {
        return await cached;
      } catch {
        messageFetchCache.current.delete(messageId);
      }
    }

    const promise = messagesApi.getMessage(messageId);
    messageFetchCache.current.set(messageId, promise);

    try {
      const message = await promise;
      setTimeout(() => {
        messageFetchCache.current.delete(messageId);
      }, 5000);
      return message;
    } catch (error) {
      messageFetchCache.current.delete(messageId);
      throw error;
    }
  };

  /**
   * Спроба отримати спільний секрет з кешу react-query.
   * Якщо shared secret вже закешований (хуком useSharedSecret),
   * використовуємо його для шифрування.
   */
  const getCachedSharedSecret = (): CryptoKey | null => {
    if (!user || !options?.recipientId) return null;
    const cached = queryClient.getQueryData<CryptoKey>([
      'shared-secret',
      chatId,
      user.id,
      options.recipientId,
    ]);
    return cached ?? null;
  };

  return useMutation({
    mutationFn: async ({ content, files, reply_to_id, client_id }: SendMessageWithFilesParams) => {
      if (!user) throw new AuthError('Ви не авторизовані', 'SEND_MESSAGE_AUTH_REQUIRED', 401);

      if (!content.trim() && files.length === 0) {
        throw new ValidationError(
          'Повідомлення не може бути порожнім',
          'content',
          'EMPTY_MESSAGE',
          400,
        );
      }

      // Валідація файлів
      for (const file of files) {
        const validation = validateFile(file);
        if (!validation.valid) {
          throw new ValidationError(
            validation.error || 'Помилка валідації файлу',
            'file',
            'FILE_VALIDATION_ERROR',
            400,
          );
        }
      }

      // Перевіряємо, чи доступний спільний секрет для E2EE
      const sharedSecret = getCachedSharedSecret();
      const shouldEncrypt = !!sharedSecret;

      // Паралельне завантаження файлів (з шифруванням якщо E2EE активне)
      const uploadResults = await Promise.allSettled(
        files.map((file) => {
          if (shouldEncrypt) {
            const { uploadEncryptedFileOptimized } = require('@/services');
            return uploadEncryptedFileOptimized(file, chatId, user.id, sharedSecret!);
          }
          return uploadFileOptimized(file, chatId, user.id);
        }),
      );

      // Обробка результатів завантаження
      const successfulUploads: Attachment[] = [];
      const failedUploads: { file: File; error: Error }[] = [];

      uploadResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && isAttachment(result.value)) {
          successfulUploads.push(result.value);
        } else if (result.status === 'rejected') {
          failedUploads.push({ file: files[index], error: result.reason });
        }
      });

      // Якщо всі файли не завантажились і немає тексту, не відправляємо повідомлення
      if (successfulUploads.length === 0 && !content.trim()) {
        throw new ValidationError('Не вдалося завантажити файли', 'files', 'UPLOAD_FAILED', 500);
      }

      const clientId = client_id ?? crypto.randomUUID();

      // E2EE: шифруємо текст та використовуємо sendEncryptedMessage
      if (shouldEncrypt) {
        const { encryptMessageContent } = await import('@/services');
        const encrypted = await encryptMessageContent(sharedSecret!, content.trim());

        const messagePayload = {
          sender_id: user.id,
          content: '🔒', // Плейсхолдер для клієнтів без E2EE
          encrypted_content: encrypted.encryptedContent,
          encrypted_iv: encrypted.encryptedIv,
          reply_to_id: reply_to_id || undefined,
          attachments: successfulUploads,
          client_id: clientId,
        };

        let savedMessage: Message;
        try {
          savedMessage = await messagesApi.sendEncryptedMessage(chatId, messagePayload);
        } catch (error) {
          await cleanupFailedUploads(successfulUploads);
          throw error;
        }

        if (failedUploads.length > 0) {
          const errorMessages = failedUploads
            .map(({ file, error }) => {
              const ec = error && typeof error === 'object' && 'status' in error
                ? (error.status as number) : 500;
              const et = ec === 400 ? 'Неправильний формат файлу'
                : ec === 413 ? 'Файл занадто великий' : 'Помилка завантаження';
              return `${file.name}: ${et} (${ec})`;
            }).join(', ');
          toast.error(`Помилка завантаження файлів: ${errorMessages}`);
        }

        return { message: savedMessage, uploadedFiles: successfulUploads, failedFiles: failedUploads, clientId, isEncrypted: true };
      }

      // Без шифрування (plaintext)
      const messagePayload = {
        sender_id: user.id,
        content: content.trim(),
        reply_to_id: reply_to_id || undefined,
        attachments: successfulUploads,
        client_id: clientId,
      };

      let savedMessage: Message;
      try {
        savedMessage = await messagesApi.sendMessage(chatId, messagePayload);
      } catch (error) {
        await cleanupFailedUploads(successfulUploads);
        throw error;
      }

      if (failedUploads.length > 0) {
        const errorMessages = failedUploads
          .map(({ file, error }) => {
            const ec = error && typeof error === 'object' && 'status' in error
              ? (error.status as number) : 500;
            const et = ec === 400 ? 'Неправильний формат файлу'
              : ec === 413 ? 'Файл занадто великий' : 'Помилка завантаження';
            return `${file.name}: ${et} (${ec})`;
          }).join(', ');
        toast.error(`Помилка завантаження файлів: ${errorMessages}`);
      }

      return {
        message: savedMessage,
        uploadedFiles: successfulUploads,
        failedFiles: failedUploads,
        clientId,
        isEncrypted: false,
      };
    },

    onMutate: async ({ content, files, reply_to_id, client_id }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData(['messages', chatId]);

      // Знаходимо батьківське повідомлення для реплаю
      const allMessages = (previousData as InfiniteData<Message[]>)?.pages?.flat() || [];
      let parentMessage = reply_to_id ? allMessages.find((m) => m.id === reply_to_id) : null;

      if (reply_to_id && !parentMessage) {
        try {
          parentMessage = await getMessageWithCache(reply_to_id);
        } catch {
          // Продовжуємо без даних реплаю
        }
      }

      const replyDetails = buildReplyDetails(parentMessage, reply_to_id);

      // Створюємо оптимістичні attachments
      const optimisticAttachments: Attachment[] = files.map((file) => ({
        id: crypto.randomUUID(),
        type: getFileType(file.type),
        url: URL.createObjectURL(file),
        metadata: { name: file.name, size: file.size },
        uploading: true,
      })) as Attachment[];

      const clientId = client_id ?? crypto.randomUUID();
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        content,
        sender_id: user?.id,
        chat_id: chatId,
        created_at: new Date().toISOString(),
        updated_at: null,
        client_id: clientId,
        reply_to_id: reply_to_id || null,
        reply_to: parentMessage,
        reply_details: replyDetails,
        attachments: optimisticAttachments,
        is_optimistic: true,
      } as Message;

      queryClient.setQueryData(['messages', chatId], (old: InfiniteData<Message[]> | undefined) => {
        if (!old) return { pages: [[optimisticMessage]], pageParams: [undefined] };
        const newPages = [...old.pages];
        newPages[newPages.length - 1] = [...newPages[newPages.length - 1], optimisticMessage];
        return { ...old, pages: newPages };
      });

      return { previousData, optimisticAttachments, clientId };
    },

    onError: (error: Error & { status?: number }, _variables, context) => {
      handleError(
        new AuthError(error.message, 'SEND_MESSAGE_ERROR', error.status || 500),
        'SendMessageWithFiles',
      );

      context?.optimisticAttachments?.forEach((attachment: Attachment) => {
        if (attachment.url?.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.url);
        }
      });

      queryClient.setQueryData(['messages', chatId], context?.previousData);
    },

    onSuccess: (result, _variables, context) => {
      const { message, failedFiles, clientId } = result;

      queryClient.setQueryData(['messages', chatId], (old: InfiniteData<Message[]> | undefined) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((msg) => {
              const matches =
                (msg.client_id && msg.client_id === clientId) ||
                (msg.client_id && msg.client_id === message.client_id);

              if (matches) {
                return {
                  ...msg,
                  ...message,
                  client_id: msg.client_id || clientId,
                  is_optimistic: false,
                };
              }
              return msg;
            }),
          ),
        };
      });

      context?.optimisticAttachments?.forEach((attachment: Attachment) => {
        if (attachment.url?.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.url);
        }
      });

      if (failedFiles.length > 0) {
        const failedFileNames = failedFiles.map((f) => f.file.name).join(', ');
        toast.error(`Помилка завантаження файлів: ${failedFileNames}`);
      }
    },
  });
}

function isAttachment(value: unknown): value is Attachment {
  return (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    'url' in value &&
    'type' in value &&
    'metadata' in value
  );
}

async function cleanupFailedUploads(attachments: Attachment[]) {
  const refs = attachments
    .map((a) => extractStorageRef(a.url))
    .filter((r): r is StorageRef => !!r);
  const bucketToPaths = new Map<string, string[]>();
  refs.forEach((r) => {
    const list = bucketToPaths.get(r.bucket) || [];
    list.push(r.path);
    bucketToPaths.set(r.bucket, list);
  });
  await Promise.allSettled(
    Array.from(bucketToPaths.entries()).map(([bucket, paths]) =>
      storageApi.deleteFiles(bucket, paths),
    ),
  );
}