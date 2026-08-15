'use client';

// ---------------------------------------------------------------------------
// Decrypted-message plaintext cache (IndexedDB).
//
// Double Ratchet (Signal) keys move forward on every decryption and the key for
// a given message is deliberately destroyed afterwards (Perfect Forward
// Secrecy). That means a freshly-loaded page can NOT re-decrypt old messages.
// Telegram / Signal / WhatsApp solve this the same way we do here: the server
// only ever stores ciphertext, and a *safe local* store keeps the plaintext of
// messages that were already decrypted on this device. On reload we serve the
// cached plaintext instantly instead of asking the Ratchet to re-decrypt.
//
// Storage schema (single IndexedDB store `decrypted-messages`):
//   keyPath 'id'              = `${chatId}:${messageId}`
//   record: { id, chatId, messageId, content, decryptedAt }
// ---------------------------------------------------------------------------

import { DECRYPTED_MESSAGES_STORE, openE2EEDb } from '@/lib/e2ee-db';

export interface DecryptedMessageRecord {
  /** `${chatId}:${messageId}` — unique per chat + message. */
  id: string;
  chatId: string;
  messageId: string;
  content: string;
  decryptedAt: number;
}

export function decryptedMessageId(chatId: string, messageId: string): string {
  return `${chatId}:${messageId}`;
}

async function getDb(): Promise<IDBDatabase> {
  return openE2EEDb();
}

/** Read the cached plaintext for a single message (or null if not cached). */
export async function getDecryptedMessage(
  chatId: string,
  messageId: string,
): Promise<string | null> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DECRYPTED_MESSAGES_STORE, 'readonly');
    const req = tx.objectStore(DECRYPTED_MESSAGES_STORE).get(decryptedMessageId(chatId, messageId));
    req.onsuccess = () => {
      db.close();
      const rec = req.result as DecryptedMessageRecord | undefined;
      resolve(rec?.content ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Read all cached plaintexts for a chat, keyed by messageId. */
export async function getChatDecryptedMessages(
  chatId: string,
): Promise<Map<string, string>> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DECRYPTED_MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(DECRYPTED_MESSAGES_STORE);
    const req = store.openCursor();
    const result = new Map<string, string>();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const rec = cursor.value as DecryptedMessageRecord;
        if (rec.chatId === chatId) {
          result.set(rec.messageId, rec.content);
        }
        cursor.continue();
      } else {
        db.close();
        resolve(result);
      }
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Persist a freshly decrypted plaintext so it survives reloads. */
export async function cacheDecryptedMessage(
  chatId: string,
  messageId: string,
  content: string,
): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DECRYPTED_MESSAGES_STORE, 'readwrite');
    tx.objectStore(DECRYPTED_MESSAGES_STORE).put({
      id: decryptedMessageId(chatId, messageId),
      chatId,
      messageId,
      content,
      decryptedAt: Date.now(),
    } satisfies DecryptedMessageRecord);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Remove cached plaintexts when a message is edited/deleted or when the user
 * explicitly wipes local state. Best-effort: never throws.
 */
export async function invalidateDecryptedMessage(
  chatId: string,
  messageId: string,
): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DECRYPTED_MESSAGES_STORE, 'readwrite');
      tx.objectStore(DECRYPTED_MESSAGES_STORE).delete(decryptedMessageId(chatId, messageId));
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // best-effort
  }
}