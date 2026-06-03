'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import imageCompression from 'browser-image-compression';
import { useRef } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { useStorageLimits } from '@/hooks/useDynamicStorageConfig';
import { extractStorageRef, type StorageRef } from '@/lib/storage-utils';
import { messagesApi, storageApi } from '@/services';
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

/**
 * Хук для паралельної відправки повідомлень з файлами
 */
export function useSendMessageWithFiles(chatId: string) {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const { validateFile } = useStorageLimits();

  // Простий кеш для запитів повідомлень, щоб уникнути дублікатів
  const messageFetchCache = useRef<Map<string, Promise<Message>>>(new Map());

  // Функція для отримання повідомлення з кешуванням
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
      // Очищуємо кеш через 5 секунд
      setTimeout(() => {
        messageFetchCache.current.delete(messageId);
      }, 5000);
      return message;
    } catch (error) {
      messageFetchCache.current.delete(messageId);
      throw error;
    }
  };

  return useMutation({
    mutationFn: async ({ content, files, reply_to_id, client_id }: SendMessageWithFilesParams) => {
      if (!user) throw new AuthError('Ви не авторизовані', 'SEND_MESSAGE_AUTH_REQUIRED', 401);

      // Перевірка чи є що відправляти
      if (!content.trim() && files.length === 0) {
        throw new ValidationError(
          'Повідомлення не може бути порожнім',
          'content',
          'EMPTY_MESSAGE',
          400,
        );
      }

      // Валідація файлів
      const validatedFiles: File[] = [];
      const pendingAttachments: PendingAttachment[] = [];

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
        validatedFiles.push(file);

        // Створюємо pending attachment для оптимістичного UI
        const id = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);

        // Визначаємо тип файлу на основі MIME типу
        let type: 'image' | 'video' | 'file';
        if (file.type.startsWith('image/')) {
          type = 'image';
        } else if (file.type.startsWith('video/')) {
          type = 'video';
        } else {
          type = 'file';
        }

        pendingAttachments.push({
          id,
          file,
          previewUrl,
          type,
          metadata: { name: file.name, size: file.size },
        });
      }

      // Паралельне завантаження файлів спочатку
      const uploadOperations = validatedFiles.map((file) =>
        uploadFileOptimized(file, chatId, user.id),
      );
      const uploadResults = await Promise.allSettled(uploadOperations);

      // Обробка результатів завантаження файлів
      const successfulUploads: Attachment[] = [];
      const failedUploads: { file: File; error: Error }[] = [];

      uploadResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          // Переконуємось що результат є типом Attachment
          const uploadResult = result.value;
          if (
            uploadResult &&
            typeof uploadResult === 'object' &&
            'id' in uploadResult &&
            'url' in uploadResult
          ) {
            successfulUploads.push(uploadResult as Attachment);
          }
        } else {
          failedUploads.push({ file: validatedFiles[index], error: result.reason });
        }
      });

      // Якщо всі файли не завантажились і немає тексту, не відправляємо повідомлення
      if (successfulUploads.length === 0 && !content.trim()) {
        throw new ValidationError('Не вдалося завантажити файли', 'files', 'UPLOAD_FAILED', 500);
      }

      // Відправляємо повідомлення тільки з успішно завантаженими файлами
      const clientId = client_id ?? crypto.randomUUID();
      const messagePayload = {
        sender_id: user.id,
        content: content.trim(),
        reply_to_id: reply_to_id || undefined,
        attachments: successfulUploads,
        client_id: clientId, // Тільки реальні завантажені файли
      };

      let savedMessage: Message;
      try {
        savedMessage = await messagesApi.sendMessage(chatId, messagePayload);
      } catch (error) {
        // Best-effort cleanup for already uploaded files
        const refs = successfulUploads
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
        throw error;
      }

      // Очищення preview URLs
      pendingAttachments.forEach(({ previewUrl }) => {
        URL.revokeObjectURL(previewUrl);
      });

      // Повідомляємо про помилки завантаження файлів
      if (failedUploads.length > 0) {
        const errorMessages = failedUploads
          .map(({ file, error }) => {
            const errorCode =
              error && typeof error === 'object' && 'status' in error
                ? (error.status as number)
                : 500;
            const errorType =
              errorCode === 400
                ? 'Неправильний формат файлу'
                : errorCode === 413
                  ? 'Файл занадто великий'
                  : 'Помилка завантаження';
            return `${file.name}: ${errorType} (${errorCode})`;
          })
          .join(', ');

        toast.error(`Помилка завантаження файлів: ${errorMessages}`);
      }

      // Оновлюємо повідомлення з успішно завантаженими файлами
      if (successfulUploads.length > 0) {
        // Оновлюємо повідомлення в базі даних з реальними attachments
        // Це може бути зроблено через окремий API виклик або повернення оновленого повідомлення
      }

      // Повертаємо повідомлення з реальними attachments
      return {
        message: savedMessage,
        uploadedFiles: successfulUploads,
        failedFiles: failedUploads,
        clientId,
      };
    },

    onMutate: async ({ content, files, reply_to_id, client_id }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData(['messages', chatId]);

      // Знаходимо батьківське повідомлення для реплаю в кеші
      const allMessages = (previousData as InfiniteData<Message[]>)?.pages?.flat() || [];
      let parentMessage = reply_to_id ? allMessages.find((m) => m.id === reply_to_id) : null;

      // Якщо повідомлення не знайдено в кеші, робимо запит до API
      if (reply_to_id && !parentMessage) {
        try {
          parentMessage = await getMessageWithCache(reply_to_id);
        } catch (error) {
          console.warn('Failed to fetch reply message:', error);
          // Продовжуємо без даних реплаю, покажемо placeholder
        }
      }

      // Створюємо reply_details з доступною інформацією
      const replyDetails = parentMessage
        ? {
            id: parentMessage.id,
            sender: parentMessage.sender || { name: parentMessage.user?.name },
            content: parentMessage.content,
            sender_id: parentMessage.sender_id,
            attachments: parentMessage.attachments,
          }
        : reply_to_id
          ? {
              id: reply_to_id,
              sender: { name: null },
              content: 'Завантаження...',
              sender_id: null,
              attachments: null,
            }
          : null;

      // Створюємо оптимістичні attachments
      const optimisticAttachments: Attachment[] = files.map((file) => {
        const id = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);

        // Визначаємо тип файлу на основі MIME типу
        let type: 'image' | 'video' | 'file';
        if (file.type.startsWith('image/')) {
          type = 'image';
        } else if (file.type.startsWith('video/')) {
          type = 'video';
        } else {
          type = 'file';
        }

        return {
          id,
          type,
          url: previewUrl,
          metadata: { name: file.name, size: file.size },
          uploading: true,
        } as Attachment;
      });
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

      // Очищення preview URLs при помилці
      context?.optimisticAttachments?.forEach((attachment: Attachment) => {
        if (attachment.url?.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.url);
        }
      });

      // Rollback оптимістичних змін
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
                // ВАЖЛИВО: Ми накладаємо серверні дані на існуючий об'єкт,
                // зберігаючи client_id та дату. Це ПОВНІСТЮ прибирає мерехтіння.
                return {
                  ...msg, // Початкові дані (з client_id та точною датою)
                  ...message, // Дані з сервера (ID, контент)
                  client_id: msg.client_id || clientId, // Запасний варіант

                  is_optimistic: false,
                };
              }
              return msg;
            }),
          ),
        };
      });

      // Очищення preview URLs
      context?.optimisticAttachments?.forEach((attachment: Attachment) => {
        if (attachment.url?.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.url);
        }
      });

      // Показуємо toast про результат
      if (failedFiles.length === 0) {
        toast.success('Повідомлення відправлено');
      } else {
        const failedFileNames = failedFiles.map((f) => f.file.name).join(', ');
        toast.warning(`Повідомлення відправлено, але файли не завантажено: ${failedFileNames}`);
      }
    },
  });
}

/**
 * Оптимізоване завантаження файлу з компресією зображень
 */
async function uploadFileOptimized(
  file: File,
  chatId: string,
  userId: string,
): Promise<Attachment> {
  try {
    let fileToUpload: File | Blob = file;

    // Стиснення тільки для зображень
    if (file.type.startsWith('image/') && file.size > 1024 * 1024) {
      try {
        fileToUpload = await imageCompression(file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        });
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Стиснення не вдалося, вантажимо оригінал', e);
        }
      }
    }

    // Завантажуємо файл
    const attachment = await storageApi.uploadAttachment(fileToUpload as File, chatId, userId);
    return attachment;
  } catch (error) {
    // Зберігаємо оригінальний код помилки від Supabase
    const statusCode =
      error && typeof error === 'object' && 'status' in error ? (error.status as number) : 500;

    throw new NetworkError(
      `Помилка завантаження файлу ${file.name}: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
      'file-upload',
      'ATTACHMENT_UPLOAD_ERROR',
      statusCode,
    );
  }
}
