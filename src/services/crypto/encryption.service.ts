'use client';

// ---------------------------------------------------------------------------
// Message / attachment encryption backed by the official Signal Protocol
// (X3DH session establishment + Double Ratchet), via
// `@privacyresearch/libsignal-protocol-typescript` (a browser-compatible port
// of the reference libsignal implementation).
//
// Every message is encrypted once per target device (recipient devices + our
// own devices) with an independent Signal session. The serialized Signal
// messages are stored per-device in `messages.message_keys`:
//
//   [{ device_id, type (1|3), body (base64) }]
//
// Applications that do not support E2EE still show a placeholder as `content`.
// ---------------------------------------------------------------------------

import {
  base64ToBuffer,
  bufferToBase64,
  decryptFile,
  encryptFile,
  generateFileKey,
} from '@/lib/crypto';
import type { DeviceRow } from '@/services/devices';
import { devicesApi } from '@/services/devices';
import { createSignalStore, encryptToDevice, decryptFromDevice } from '@/services/signal';
import type { Message, MessageKeyEntry } from '@/types';

/** Non-empty placeholder stored in `encrypted_content` for legacy checks. */
export const E2EE_CONTENT_MARKER = '__telegraf_signal__';

export interface EncryptedDeviceMessagePayload {
  /** Marker (non-empty) for clients that still check `encrypted_content`. */
  encryptedContent: string;
  encryptedIv: string;
  senderDeviceId: string;
  senderDevicePublicKey?: JsonWebKey | null;
  /** Serialized Signal message per target device. */
  messageKeys: MessageKeyEntry[];
}

/**
 * Encrypt `plaintext` for every target device using a per-device Signal
 * session. Establishes X3DH sessions lazily for new recipients/devices.
 */
export async function encryptMessageContentForDevices(params: {
  userId: string;
  senderDeviceId: string;
  chatId: string;
  plaintext: string;
  targetDevices: DeviceRow[];
}): Promise<EncryptedDeviceMessagePayload> {
  const { userId, senderDeviceId, plaintext, targetDevices } = params;
  const store = createSignalStore(userId, senderDeviceId);
  const buffer = new TextEncoder().encode(plaintext).buffer;

  const messageKeys: MessageKeyEntry[] = [];
  const seen = new Set<string>();
  for (const dev of targetDevices) {
    if (seen.has(dev.id)) continue;
    seen.add(dev.id);
    const ct = await encryptToDevice(store, dev.user_id, dev.id, buffer);
    messageKeys.push({ device_id: dev.id, type: ct.type, body: ct.body });
  }

  return {
    encryptedContent: E2EE_CONTENT_MARKER,
    encryptedIv: '',
    senderDeviceId,
    senderDevicePublicKey: null,
    messageKeys,
  };
}

/**
 * Decrypt a message that was encrypted for this device via Signal. Returns the
 * plaintext, or null if this device is not a target or decryption fails
 * (e.g. key mismatch) — callers must not crash.
 */
export async function decryptMessageContentForDevice(params: {
  userId: string;
  myDeviceId: string;
  chatId: string;
  message: Message;
}): Promise<string | null> {
  const { userId, myDeviceId, message } = params;
  const keys: MessageKeyEntry[] = Array.isArray(message.message_keys)
    ? (message.message_keys as MessageKeyEntry[])
    : [];
  const entry = keys.find((k) => k.device_id === myDeviceId);
  if (!entry || !message.sender_id || !message.sender_device_id) return null;

  try {
    const store = createSignalStore(userId, myDeviceId);
    const plaintextBuffer = await decryptFromDevice(
      store,
      message.sender_id,
      message.sender_device_id,
      entry.type,
      entry.body,
    );
    return new TextDecoder().decode(new Uint8Array(plaintextBuffer));
  } catch {
    return null;
  }
}

/** True if the message carries Signal-encrypted per-device payloads. */
export function isSignalEncryptedMessage(message: Message): boolean {
  return Array.isArray(message.message_keys) && message.message_keys.length > 0;
}

/** Resolve the set of target devices for a 1:1 chat (recipient + self). */
export async function resolveTargetDevices(
  userId: string,
  recipientId: string,
): Promise<DeviceRow[]> {
  const [recipientDevices, myDevices] = await Promise.all([
    devicesApi.listDevices(recipientId),
    devicesApi.listDevices(userId),
  ]);
  const seen = new Set<string>();
  return [...recipientDevices, ...myDevices].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

// ──────────────────────────────────────────────
// Файлові вкладення (AES-GCM файл + ключ через Signal-сесію)
// ──────────────────────────────────────────────

export interface EncryptedAttachmentPayload {
  /** The encrypted blob for upload. */
  encryptedBlob: Blob;
  /** New metadata name (obfuscated). */
  obfuscatedName: string;
  /**
   * File-key metadata wrapped via a Signal session for every target device:
   * [{ device_id, type (1|3), body (base64) }].
   */
  encryptedMetadata: MessageKeyEntry[];
}

/**
 * Encrypt a file before upload: the blob is encrypted with a fresh random
 * AES-GCM key, and the key + original metadata are wrapped via per-device
 * Signal sessions so only chat participants can recover them.
 */
export async function encryptFileAttachment(params: {
  userId: string;
  senderDeviceId: string;
  chatId: string;
  recipientId: string;
  file: File;
}): Promise<EncryptedAttachmentPayload> {
  const { userId, senderDeviceId, chatId, recipientId, file } = params;

  // 1. Унікальний ключ файлу.
  const fileKey = await generateFileKey();
  const { encryptedBlob, iv: fileIv } = await encryptFile(fileKey, file, chatId);

  // 2. Метадані: ключ + IV + оригінальна назва/тип.
  const jwkKey = await crypto.subtle.exportKey('jwk', fileKey);
  const metadataJson = JSON.stringify({
    key: jwkKey,
    iv: bufferToBase64(fileIv),
    type: file.type,
    name: file.name,
  });
  const metadataBuffer = new TextEncoder().encode(metadataJson).buffer;

  // 3. Загортаємо метадані через Signal-сесію для кожного пристрою.
  const store = createSignalStore(userId, senderDeviceId);
  const targetDevices = await resolveTargetDevices(userId, recipientId);
  const encryptedMetadata: MessageKeyEntry[] = [];
  for (const dev of targetDevices) {
    const ct = await encryptToDevice(store, dev.user_id, dev.id, metadataBuffer);
    encryptedMetadata.push({ device_id: dev.id, type: ct.type, body: ct.body });
  }

  const obfuscatedName = `enc_${Date.now()}.enc`;

  return { encryptedBlob, obfuscatedName, encryptedMetadata };
}

export interface DecryptedFileResult {
  blob: Blob;
  type: string;
  name: string;
}

/**
 * Decrypt a previously encrypted attachment. Finds the Signal-wrapped metadata
 * for this device, decrypts it, and decrypts the file blob.
 */
export async function decryptFileAttachment(params: {
  userId: string;
  myDeviceId: string;
  chatId: string;
  encryptedBlob: Blob;
  encryptedMetadata: MessageKeyEntry[];
  /** Sender of the message that carries the attachment. */
  senderId?: string;
  senderDeviceId?: string;
}): Promise<DecryptedFileResult> {
  const { userId, myDeviceId, chatId, encryptedBlob, encryptedMetadata } = params;
  const entry = encryptedMetadata.find((e) => e.device_id === myDeviceId);
  if (!entry || !params.senderId || !params.senderDeviceId) {
    throw new Error('No Signal-wrapped file key for this device');
  }

  const store = createSignalStore(userId, myDeviceId);
  const metadataBuffer = await decryptFromDevice(
    store,
    params.senderId,
    params.senderDeviceId,
    entry.type,
    entry.body,
  );
  const parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(metadataBuffer))) as {
    key: JsonWebKey;
    iv: string;
    type: string;
    name: string;
  };

  const fileKey = await crypto.subtle.importKey(
    'jwk',
    parsed.key,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const blob = await decryptFile(fileKey, encryptedBlob, base64ToBuffer(parsed.iv), parsed.type, chatId);

  return { blob, type: parsed.type, name: parsed.name };
}