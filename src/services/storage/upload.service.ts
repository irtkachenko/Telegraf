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