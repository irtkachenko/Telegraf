'use client';

// ---------------------------------------------------------------------------
// Shared IndexedDB for E2EE.
//
// CRITICAL: both crypto.ts (private keys) and verification.ts (verified-key
// fingerprints) must open the SAME database with the SAME version, otherwise
// one of them opens with a *lower* version than the stored one and
// `indexedDB.open` throws VersionError, breaking E2EE init permanently
// (e.g. "keys not initialized" forever).
//
// Keep E2EE_DB_VERSION >= any version these stores have ever used. Bumping it
// here upgrades the schema for both modules at once.
// ---------------------------------------------------------------------------

export const E2EE_DB_NAME = 'telegraf-e2ee';

/** Stores we manage. */
const KEYS_STORE = 'keys';
const VERIFIED_STORE = 'verified-keys';

export const E2EE_DB_VERSION = 4;

/** Signal Protocol stores (managed by src/lib/signal). */
export const SIGNAL_SESSIONS_STORE = 'signal-sessions';
export const SIGNAL_IDENTITY_STORE = 'signal-identity';
export const SIGNAL_PREKEYS_STORE = 'signal-prekeys';
export const SIGNAL_SIGNED_PREKEYS_STORE = 'signal-signed-prekeys';
export const SIGNAL_REGISTRATION_STORE = 'signal-registration';
export const SIGNAL_REMOTE_IDENTITY_STORE = 'signal-remote-identity';

/**
 * Store of already-decrypted message plaintexts, keyed by `chatId:messageId`
 * (so it is unique per chat + message). Keeping the plaintext locally is what
 * makes messages stay readable after a reload even if the local Ratchet
 * session / Signal identity is gone — the same approach Telegram/Signal use.
 */
export const DECRYPTED_MESSAGES_STORE = 'decrypted-messages';

/**
 * Open the shared E2EE database. Creates all stores (legacy + Signal) so any
 * module can use the DB regardless of initialization order.
 *
 * SSR guard: IndexedDB only exists in the browser. During static generation /
 * server rendering this throws immediately instead of crashing with a
 * `ReferenceError: indexedDB is not defined`.
 */
export function openE2EEDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment (SSR).'));
      return;
    }
    const req = indexedDB.open(E2EE_DB_NAME, E2EE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEYS_STORE)) {
        db.createObjectStore(KEYS_STORE, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(VERIFIED_STORE)) {
        const store = db.createObjectStore(VERIFIED_STORE, { keyPath: 'recipientId' });
        store.createIndex('byOwner', 'userId', { unique: false });
      }
      // Signal Protocol stores (v3)
      if (!db.objectStoreNames.contains(SIGNAL_SESSIONS_STORE)) {
        db.createObjectStore(SIGNAL_SESSIONS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SIGNAL_IDENTITY_STORE)) {
        db.createObjectStore(SIGNAL_IDENTITY_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SIGNAL_PREKEYS_STORE)) {
        db.createObjectStore(SIGNAL_PREKEYS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SIGNAL_SIGNED_PREKEYS_STORE)) {
        db.createObjectStore(SIGNAL_SIGNED_PREKEYS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SIGNAL_REGISTRATION_STORE)) {
        db.createObjectStore(SIGNAL_REGISTRATION_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SIGNAL_REMOTE_IDENTITY_STORE)) {
        // keyPath 'id' = `<localScope>:<peerUserId>:<deviceNumber>` -> { pubKey (b64) }
        db.createObjectStore(SIGNAL_REMOTE_IDENTITY_STORE, { keyPath: 'id' });
      }
      // Decrypted-message plaintext cache (v4). keyPath 'id' = `chatId:messageId`.
      if (!db.objectStoreNames.contains(DECRYPTED_MESSAGES_STORE)) {
        db.createObjectStore(DECRYPTED_MESSAGES_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
