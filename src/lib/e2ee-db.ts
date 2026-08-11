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
export const E2EE_DB_VERSION = 2;

/** Stores we manage. */
const KEYS_STORE = 'keys';
const VERIFIED_STORE = 'verified-keys';

/**
 * Open the shared E2EE database. Creates both stores (and the verification
 * index) so either module can use the DB regardless of initialization order.
 */
export function openE2EEDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
