'use client';

import type { MessageKeyEntry } from '@/types';
import type { Attachment } from '@/types';

// Module-level cache of decrypted object URLs, keyed by attachment id, so the
// same file is never downloaded + decrypted more than once per session.
const objectUrlCache = new Map<string, string>();

/** Context required to decrypt a Signal-wrapped attachment. */
export interface AttachmentDecryptContext {
  /** Current (local) user id. */
  userId: string;
  chatId: string;
  /** Sender of the message that carries the attachment. */
  senderId?: string;
  senderDeviceId?: string;
}

/** Returns true if the attachment carries Signal-wrapped E2EE metadata. */
export function isEncryptedAttachment(att: Attachment): boolean {
  const meta = att.metadata?.encrypted_metadata;
  return Array.isArray(meta) && meta.length > 0;
}

/** Returns a previously-decrypted object URL for the attachment, if any. */
export function getCachedDecryptedUrl(attachmentId: string): string | undefined {
  return objectUrlCache.get(attachmentId);
}

/**
 * Fetch the encrypted blob at `encryptedUrl`, decrypt it with the local Signal
 * session, and return an object URL usable by <img> / <video> / <a download>.
 * Results are cached by attachment id.
 */
export async function getDecryptedAttachmentUrl(
  ctx: AttachmentDecryptContext,
  attachment: Attachment,
  encryptedUrl: string,
): Promise<string> {
  const cached = objectUrlCache.get(attachment.id);
  if (cached) return cached;

  const meta = attachment.metadata;
  const encryptedMetadata = Array.isArray(meta?.encrypted_metadata)
    ? (meta.encrypted_metadata as MessageKeyEntry[])
    : null;
  if (!encryptedMetadata || !ctx.senderId || !ctx.senderDeviceId) {
    // Not encrypted (or no sender info) — fall back to the raw URL.
    return encryptedUrl;
  }

  const res = await fetch(encryptedUrl);
  if (!res.ok) {
    console.error(
      `[DecryptAttachment] Failed to fetch encrypted file (HTTP ${res.status})`,
      { encryptedUrl, attachmentId: attachment.id },
    );
    throw new Error(`Failed to fetch encrypted file (HTTP ${res.status})`);
  }
  const blob = await res.blob();

  const { getCurrentDevice } = await import('@/lib/device');
  const device = await getCurrentDevice(ctx.userId);
  if (!device) {
    throw new Error('E2EE not initialized: no local device key');
  }

  const { decryptFileAttachment } = await import('@/services');
  const { blob: decrypted } = await decryptFileAttachment({
    userId: ctx.userId,
    myDeviceId: device.deviceId,
    chatId: ctx.chatId,
    encryptedBlob: blob,
    encryptedMetadata,
    senderId: ctx.senderId,
    senderDeviceId: ctx.senderDeviceId,
  });

  const objectUrl = URL.createObjectURL(decrypted);
  objectUrlCache.set(attachment.id, objectUrl);
  return objectUrl;
}

/**
 * Decrypt an attachment and trigger a browser download with the original
 * filename. Used by the file card in the message bubble.
 */
export async function downloadDecryptedFile(
  ctx: AttachmentDecryptContext,
  attachment: Attachment,
  encryptedUrl: string,
): Promise<void> {
  const url = await getDecryptedAttachmentUrl(ctx, attachment, encryptedUrl);

  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.metadata?.name || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Revoke the cached object URL for a single attachment. */
export function revokeDecryptedUrl(attachmentId: string): void {
  const url = objectUrlCache.get(attachmentId);
  if (url) URL.revokeObjectURL(url);
  objectUrlCache.delete(attachmentId);
}

/** Revoke every cached decrypted object URL (e.g. on chat unmount). */
export function revokeAllDecryptedUrls(): void {
  objectUrlCache.forEach((url) => URL.revokeObjectURL(url));
  objectUrlCache.clear();
}