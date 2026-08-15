import imageCompression from 'browser-image-compression';
import { storageApi } from './storage.service';
import type { Attachment } from '@/types';
import { NetworkError } from '@/shared/lib/errors';

/**
 * Оптимізоване завантаження файлу з компресією зображень.
 * Винесено з хука, щоб перевикористовувати у різних місцях.
 */
export async function uploadFileOptimized(
  file: File,
  chatId: string,
  userId: string,
): Promise<Attachment> {
  try {
    let fileToUpload: File | Blob = file;

    // Стиснення тільки для зображень більше 1MB
    if (file.type.startsWith('image/') && file.size > 1024 * 1024) {
      try {
        fileToUpload = await imageCompression(file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        });
      } catch {
        // Якщо стиснення не вдалося, вантажимо оригінал
      }
    }

    const attachment = await storageApi.uploadAttachment(fileToUpload as File, chatId, userId);
    return attachment;
  } catch (error) {
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

import { encryptFileAttachment } from '@/services/crypto/encryption.service';

/**
 * Завантаження зашифрованого файлу.
 * Шифрує файл перед відправкою на сервер (AES-GCM), а ключ файлу + метадані
 * загортаються через Signal-сесію окремо для кожного пристрою-одержувача.
 */
export async function uploadEncryptedFileOptimized(
  file: File,
  chatId: string,
  userId: string,
  opts: {
    recipientId: string;
    senderDeviceId: string;
  },
): Promise<Attachment> {
  try {
    // 1. Шифруємо файл та загортаємо метадані через Signal-сесії
    const encrypted = await encryptFileAttachment({
      userId,
      senderDeviceId: opts.senderDeviceId,
      chatId,
      recipientId: opts.recipientId,
      file,
    });

    // 2. Завантажуємо зашифрований файл (з обфускованою назвою)
    const encryptedFile = new File([encrypted.encryptedBlob], encrypted.obfuscatedName, {
      type: 'application/octet-stream',
    });

    const attachment = await storageApi.uploadAttachment(encryptedFile, chatId, userId);

    // 3. Додаємо загорнуті через Signal метадані до вкладення
    return {
      ...attachment,
      type: file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : 'file',

      metadata: {
        ...attachment.metadata,
        type: file.type,
        name: file.name,
        encrypted_metadata: encrypted.encryptedMetadata,
      },
    };
  } catch (error) {
    console.error(
      '[Upload] Encrypted file upload failed',
      { file: file.name, chatId },
      error,
    );
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
