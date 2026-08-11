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
  generateMessageKey,
  encryptWithMessageKey,
  wrapMessageKey,
  unwrapMessageKey,
  importPublicKey,
  deriveSharedSecret,
} from '@/lib/crypto';
import type { DeviceRow } from '@/services/devices';
import type { Message, MessageKeyEntry } from '@/types';

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
 * `chatId` використовується як AAD, щоб шифротекст не можна було перенести
 * між чатами.
 */
export async function encryptMessageContent(
  sharedSecret: CryptoKey,
  chatId: string,
  plaintext: string,
): Promise<EncryptedMessagePayload> {
  const { ciphertext, iv } = await encryptText(sharedSecret, plaintext, chatId);
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
  chatId: string,
  encryptedContent: string,
  encryptedIv: string,
): Promise<string> {
  const ciphertext = base64ToBuffer(encryptedContent);
  const iv = base64ToBuffer(encryptedIv);
  return decryptText(sharedSecret, ciphertext, iv, chatId);
}

// ──────────────────────────────────────────────
// Багатопристроєве шифрування (per-device E2EE)
// ──────────────────────────────────────────────

export interface EncryptedDeviceMessagePayload {
  /** Base64 AES-GCM ciphertext of the content (per-message key). */
  encryptedContent: string;
  /** Base64 IV for the content ciphertext. */
  encryptedIv: string;
  senderDeviceId: string;
  senderDevicePublicKey: JsonWebKey;
  /** Per-message key wrapped for every target device. */
  messageKeys: MessageKeyEntry[];
}

/**
 * Зашифрувати повідомлення так, щоб його міг розшифрувати КОЖЕН пристрій
 * зі списку `targetDevices` (пристрої одержувача + власні пристрої).
 * Текст шифрується випадковим ключем повідомлення, який обгортається
 * окремо для кожного пристрою через ECDH.
 */
export async function encryptMessageContentForDevices(
  devicePrivateKey: CryptoKey,
  senderDeviceId: string,
  senderDevicePublicKey: JsonWebKey,
  chatId: string,
  plaintext: string,
  targetDevices: DeviceRow[],
): Promise<EncryptedDeviceMessagePayload> {
  const messageKey = await generateMessageKey();
  const { ciphertext, iv } = await encryptWithMessageKey(messageKey, plaintext, chatId);

  const messageKeys: MessageKeyEntry[] = [];
  for (const dev of targetDevices) {
    const devPublicKey = await importPublicKey(dev.public_key_jwk);
    const shared = await deriveSharedSecret(devicePrivateKey, devPublicKey);
    const wrapped = await wrapMessageKey(shared, messageKey);
    messageKeys.push({
      device_id: dev.id,
      key: bufferToBase64(wrapped.ciphertext),
      iv: bufferToBase64(wrapped.iv),
    });
  }

  return {
    encryptedContent: bufferToBase64(ciphertext),
    encryptedIv: bufferToBase64(iv),
    senderDeviceId,
    senderDevicePublicKey,
    messageKeys,
  };
}

/**
 * Розшифрувати повідомлення на поточному пристрої: знайти свій `device_id`
 * у `message_keys`, розгорнути ключ повідомлення і розшифрувати текст.
 * Повертає null, якщо пристрій не є адресатом або не вдалось розшифрувати.
 */
export async function decryptMessageContentForDevice(
  devicePrivateKey: CryptoKey,
  myDeviceId: string,
  chatId: string,
  message: Pick<
    Message,
    | 'sender_device_id'
    | 'sender_device_public_key'
    | 'message_keys'
    | 'encrypted_content'
    | 'encrypted_iv'
  >,
): Promise<string | null> {
  const entry = message.message_keys?.find((k) => k.device_id === myDeviceId);
  if (
    !entry ||
    !message.sender_device_public_key ||
    !message.encrypted_content ||
    !message.encrypted_iv
  ) {
    return null;
  }

  try {
    const senderPublicKey = await importPublicKey(message.sender_device_public_key);
    const shared = await deriveSharedSecret(devicePrivateKey, senderPublicKey);
    const messageKey = await unwrapMessageKey(
      shared,
      base64ToBuffer(entry.key),
      base64ToBuffer(entry.iv),
    );
    return decryptText(
      messageKey,
      base64ToBuffer(message.encrypted_content),
      base64ToBuffer(message.encrypted_iv),
      chatId,
    );
  } catch {
    return null;
  }
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
  chatId: string,
  file: File,
): Promise<EncryptedAttachmentPayload> {
  // 1. Генеруємо унікальний ключ для цього файлу
  const fileKey = await generateFileKey();

  // 2. Шифруємо файл (з AAD = chatId)
  const { encryptedBlob, iv: fileIv } = await encryptFile(fileKey, file, chatId);

  // 3. Шифруємо метадані (ключ, IV, оригінальна назва, тип)
  const { ciphertext: metadataCiphertext, iv: metadataIv } =
    await encryptFileMetadata(
      sharedSecret,
      {
        fileKey,
        fileIv,
        type: file.type,
        name: file.name,
      },
      chatId,
    );

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
  chatId: string,
  encryptedBlob: Blob,
  encryptedMetadataCiphertext: string,
  encryptedMetadataIv: string,
): Promise<DecryptedFileResult> {
  // 1. Розшифровуємо метадані (отримуємо fileKey + IV + оригінальні назву/тип)
  const metadata = await decryptFileMetadata(
    sharedSecret,
    base64ToBuffer(encryptedMetadataCiphertext),
    base64ToBuffer(encryptedMetadataIv),
    chatId,
  );

  // 2. Розшифровуємо файл
  const blob = await decryptFile(metadata.fileKey, encryptedBlob, metadata.iv, metadata.type, chatId);

  return {
    blob,
    type: metadata.type,
    name: metadata.name,
  };
}
