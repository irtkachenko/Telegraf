'use client';

import {
  bufferToBase64,
  base64ToBuffer,
  encryptText,
  decryptText,
  encryptFile,
  decryptFile,
  generateFileKey,
  encryptFileMetadata,
  decryptFileMetadata,
} from '@/lib/crypto';
import type { Attachment } from '@/types';

// ──────────────────────────────────────────────
// Шифрування тексту повідомлення
// ──────────────────────────────────────────────

export interface EncryptedMessagePayload {
  /** Base64-encoded ciphertext */
  encryptedContent: string;
  /** Base64-encoded IV */
  encryptedIv: string;
}

/**
 * Зашифрувати текст повідомлення за допомогою спільного секрету чату.
 */
export async function encryptMessageContent(
  sharedSecret: CryptoKey,
  plaintext: string,
): Promise<EncryptedMessagePayload> {
  const { ciphertext, iv } = await encryptText(sharedSecret, plaintext);
  return {
    encryptedContent: bufferToBase64(ciphertext),
    encryptedIv: bufferToBase64(iv),
  };
}

/**
 * Розшифрувати текст повідомлення.
 */
export async function decryptMessageContent(
  sharedSecret: CryptoKey,
  encryptedContent: string,
  encryptedIv: string,
): Promise<string> {
  const ciphertext = base64ToBuffer(encryptedContent);
  const iv = base64ToBuffer(encryptedIv);
  return decryptText(sharedSecret, ciphertext, iv);
}

// ──────────────────────────────────────────────
// Шифрування файлів для вкладень
// ──────────────────────────────────────────────

export interface EncryptedAttachmentPayload {
  /** The encrypted blob for upload */
  encryptedBlob: Blob;
  /** Encrypted metadata to store in the attachment */
  encryptedMetadata: {
    ciphertext: string; // base64
    iv: string; // base64
  };
  /** New metadata name (can be obfuscated) */
  obfuscatedName: string;
}

/**
 * Зашифрувати файл перед завантаженням.
 * Повертає зашифрований Blob та метадані для збереження.
 */
export async function encryptFileAttachment(
  sharedSecret: CryptoKey,
  file: File,
): Promise<EncryptedAttachmentPayload> {
  // 1. Генеруємо унікальний ключ для цього файлу
  const fileKey = await generateFileKey();

  // 2. Шифруємо файл
  const { encryptedBlob, iv: fileIv } = await encryptFile(fileKey, file);

  // 3. Шифруємо метадані (ключ, IV, оригінальна назва, тип)
  const { ciphertext: metadataCiphertext, iv: metadataIv } =
    await encryptFileMetadata(sharedSecret, {
      fileKey,
      fileIv,
      type: file.type,
      name: file.name,
    });

  // 4. Оbfuscated назва для зберігання в storage (без розшифрування не впізнати)
  const obfuscatedName = `enc_${Date.now()}.enc`;

  return {
    encryptedBlob,
    encryptedMetadata: {
      ciphertext: bufferToBase64(metadataCiphertext),
      iv: bufferToBase64(metadataIv),
    },
    obfuscatedName,
  };
}

// ──────────────────────────────────────────────
// Розшифрування вкладених файлів
// ──────────────────────────────────────────────

export interface DecryptedFileResult {
  /** The decrypted blob */
  blob: Blob;
  /** Original MIME type */
  type: string;
  /** Original file name */
  name: string;
}

/**
 * Розшифрувати файл, використовуючи збережені зашифровані метадані у вкладенні.
 * Attachments тепер містять encryptedMetadata в своєму metadata полі.
 */
export async function decryptFileAttachment(
  sharedSecret: CryptoKey,
  encryptedBlob: Blob,
  encryptedMetadataCiphertext: string,
  encryptedMetadataIv: string,
): Promise<DecryptedFileResult> {
  // 1. Розшифровуємо метадані (отримуємо fileKey + IV + оригінальні назву/тип)
  const metadata = await decryptFileMetadata(
    sharedSecret,
    base64ToBuffer(encryptedMetadataCiphertext),
    base64ToBuffer(encryptedMetadataIv),
  );

  // 2. Розшифровуємо файл
  const blob = await decryptFile(metadata.fileKey, encryptedBlob, metadata.iv, metadata.type);

  return {
    blob,
    type: metadata.type,
    name: metadata.name,
  };
}
