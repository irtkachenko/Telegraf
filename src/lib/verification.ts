'use client';

// ---------------------------------------------------------------------------
// E2EE key verification — key fingerprints (SAS) + TOFU persistence.
//
// Public keys are exchanged through the server, which a malicious server could
// substitute (MITM). This module lets users verify the identity of a peer's key
// out-of-band by comparing a short fingerprint. The first key seen is stored
// (TOFU); if a previously *verified* key changes, the app blocks messaging.
// ---------------------------------------------------------------------------

import { openE2EEDb } from '@/lib/e2ee-db';

const STORE_NAME = 'verified-keys';

export interface StoredVerification {
  userId: string; // owner of this verification record
  recipientId: string;
  fingerprint: string; // hex SHA-256 of the recipient's canonical public key
  verified: boolean;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return openE2EEDb();
}

/**
 * Canonicalise a JWK so identical keys always hash identically regardless of
 * property insertion order.
 */
export function canonicalJwk(jwk: JsonWebKey): string {
  const keys = Object.keys(jwk).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) {
    sorted[k] = jwk[k as keyof JsonWebKey];
  }
  return JSON.stringify(sorted);
}

/** Compute a hex SHA-256 fingerprint of a public key JWK. */
export async function fingerprintOfPublicKey(jwk: JsonWebKey): Promise<string> {
  const data = new TextEncoder().encode(canonicalJwk(jwk));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Format a hex fingerprint into human-readable groups, e.g. "ABCD EFGH ...". */
export function formatFingerprint(hex: string): string {
  return (hex || '').toUpperCase().match(/.{1,4}/g)?.join(' ') ?? '';
}

export async function getVerification(
  userId: string,
  recipientId: string,
): Promise<StoredVerification | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(recipientId);
    req.onsuccess = () => {
      db.close();
      const record = req.result as StoredVerification | undefined;
      resolve(record && record.userId === userId ? record : null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Store the first-seen fingerprint (TOFU). Does not downgrade `verified`. */
export async function storeFingerprint(
  userId: string,
  recipientId: string,
  fingerprint: string,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(recipientId);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredVerification | undefined;
      // Never overwrite a record owned by another user id.
      if (existing && existing.userId !== userId) {
        db.close();
        resolve();
        return;
      }
      const record: StoredVerification = {
        userId,
        recipientId,
        fingerprint,
        verified: existing?.verified ?? false,
        updatedAt: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    getReq.onerror = () => {
      db.close();
      reject(getReq.error);
    };
  });
}

/** Mark a recipient's key as verified after out-of-band comparison. */
export async function markVerified(userId: string, recipientId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(recipientId);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredVerification | undefined;
      if (!existing || existing.userId !== userId) {
        db.close();
        resolve();
        return;
      }
      store.put({ ...existing, verified: true, updatedAt: Date.now() });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    getReq.onerror = () => {
      db.close();
      reject(getReq.error);
    };
  });
}