'use client';

import { decryptFileAttachment } from '@/services/crypto/encryption.service';
import type { Attachment } from '@/types';

// Module-level cache of decrypted object URLs, keyed by attachment id, so the
// same file is never downloaded + decrypted more than once per session.
const objectUrlCache = new Map<string, string>();

/** Returns true if the attachment carries E2EE-encrypted metadata. */
export function isEncryptedAttachment(att: Attachment): boolean {
  return !!(att.metadata?.encrypted_metadata && att.metadata.encrypted_metadata_iv);
}

/** Returns a previously-decrypted object URL for the attachment, if any. */
export function getCachedDecryptedUrl(attachmentId: string): string | undefined {
  return objectUrlCache.get(attachmentId);
}

/**
 * Fetch the encrypted blob at `encryptedUrl`, decrypt it with the chat shared
 * secret, and return an object URL usable by <img> / <video> / <a download>.
 * Results are cached by attachment id.
 */
export async function getDecryptedAttachmentUrl(
  sharedSecret: CryptoKey,
  chatId: string,
  attachment: Attachment,
  encryptedUrl: string,
): Promise<string> {
  const cached = objectUrlCache.get(attachment.id);
  if (cached) return cached;

  const meta = attachment.metadata;
  if (!meta?.encrypted_metadata || !meta.encrypted_metadata_iv) {
    // Not encrypted — fall back to the raw URL untouched.
    return encryptedUrl;
  }

  const res = await fetch(encryptedUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch encrypted file (HTTP ${res.status})`);
  }
  const blob = await res.blob();

  const { blob: decrypted } = await decryptFileAttachment(
    sharedSecret,
    chatId,
    blob,
    meta.encrypted_metadata,
    meta.encrypted_metadata_iv,
  );

  const objectUrl = URL.createObjectURL(decrypted);
  objectUrlCache.set(attachment.id, objectUrl);
  return objectUrl;
}

/**
 * Decrypt an attachment and trigger a browser download with the original
 * filename. Used by the file card in the message bubble.
 */
export async function downloadDecryptedFile(
  sharedSecret: CryptoKey,
  chatId: string,
  attachment: Attachment,
  encryptedUrl: string,
): Promise<void> {
  const url = await getDecryptedAttachmentUrl(sharedSecret, chatId, attachment, encryptedUrl);

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
