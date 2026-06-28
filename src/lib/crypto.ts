'use client';

// ---------------------------------------------------------------------------
// E2EE crypto module — Web Crypto API (ECDH + AES-GCM 256-bit)
// Private keys live ONLY in IndexedDB, never leave the client.
// ---------------------------------------------------------------------------

// ──────────────────────────────────────────────
// IndexedDB helpers
// ──────────────────────────────────────────────

const DB_NAME = 'telegraf-e2ee';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Store or overwrite the private CryptoKey for a given user.
 * The key is exported as JWK before being persisted (IndexedDB can not
 * store native CryptoKey objects reliably across sessions).
 */
export async function storePrivateKey(
  userId: string,
  privateKey: CryptoKey,
): Promise<void> {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ userId, jwk });
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
 * Retrieve the private CryptoKey for a given user from IndexedDB.
 * Returns `null` if no key exists.
 */
export async function getPrivateKey(
  userId: string,
): Promise<CryptoKey | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(userId);
    req.onsuccess = async () => {
      db.close();
      const record = req.result as { jwk: JsonWebKey } | undefined;
      if (!record?.jwk) {
        resolve(null);
        return;
      }
      try {
        const key = await crypto.subtle.importKey(
          'jwk',
          record.jwk,
          { name: 'ECDH', namedCurve: 'P-256' },
          false,
          ['deriveKey', 'deriveBits'],
        );
        resolve(key);
      } catch {
        resolve(null);
      }
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * Delete the private key for a given user (e.g. on sign-out).
 */
export async function deletePrivateKey(userId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(userId);
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

// ──────────────────────────────────────────────
// ECDH key pair generation
// ──────────────────────────────────────────────

/**
 * Generate an ECDH key pair on the P-256 curve.
 */
export async function generateKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
}

/**
 * Export an ECDH public key as a JWK object.
 */
export async function exportPublicKey(
  publicKey: CryptoKey,
): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', publicKey);
}

/**
 * Import a public key from a JWK object.
 */
export async function importPublicKey(
  jwk: JsonWebKey,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

// ──────────────────────────────────────────────
// Shared secret derivation (ECDH → AES-GCM)
// ──────────────────────────────────────────────

/**
 * Derive an AES-GCM 256-bit shared secret from the local private key and
 * the remote party's public key.
 */
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ──────────────────────────────────────────────
// IV generation
// ──────────────────────────────────────────────

/**
 * Fill a 12-byte ArrayBuffer with cryptographically random values.
 * ArrayBuffer satisfies BufferSource directly, avoiding TS strict
 * compatibility issues with Uint8Array<ArrayBufferLike>.
 */
function fillIV(buf: ArrayBuffer): ArrayBuffer {
  const view = new Uint8Array(buf);
  crypto.getRandomValues(view);
  return buf;
}

// ──────────────────────────────────────────────
// Text encryption / decryption (AES-GCM)
// ──────────────────────────────────────────────

export interface EncryptedPayload {
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
}

/**
 * Encrypt a plaintext string using the shared AES-GCM key.
 */
export async function encryptText(
  sharedSecret: CryptoKey,
  plaintext: string,
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = fillIV(new ArrayBuffer(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedSecret,
    data,
  );

  return { ciphertext, iv };
}

/**
 * Decrypt a ciphertext back to a plaintext string.
 */
export async function decryptText(
  sharedSecret: CryptoKey,
  ciphertext: ArrayBuffer,
  iv: ArrayBuffer,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedSecret,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

// ──────────────────────────────────────────────
// File encryption / decryption (AES-GCM)
// ──────────────────────────────────────────────

/**
 * Generate a random AES-GCM 256-bit key for encrypting a single file.
 */
export async function generateFileKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export interface FileEncryptionResult {
  /** The encrypted file as a Blob (ready to upload to Supabase Storage) */
  encryptedBlob: Blob;
  /** IV used during file encryption (12 bytes) */
  iv: ArrayBuffer;
}

/**
 * Encrypt a File / Blob using the provided AES-GCM key.
 */
export async function encryptFile(
  fileKey: CryptoKey,
  file: Blob,
): Promise<FileEncryptionResult> {
  const iv = fillIV(new ArrayBuffer(12));
  const fileBuffer = await file.arrayBuffer();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    fileKey,
    fileBuffer,
  );

  const encryptedBlob = new Blob([ciphertext], { type: 'application/octet-stream' });

  return { encryptedBlob, iv };
}

/**
 * Decrypt an encrypted file blob back into its original form.
 */
export async function decryptFile(
  fileKey: CryptoKey,
  encryptedBlob: Blob,
  iv: ArrayBuffer,
  mimeType: string,
): Promise<Blob> {
  const ciphertext = await encryptedBlob.arrayBuffer();

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    fileKey,
    ciphertext,
  );

  return new Blob([decrypted], { type: mimeType });
}

// ──────────────────────────────────────────────
// File metadata encryption helpers
// ──────────────────────────────────────────────

/**
 * Input for encryptFileMetadata: accepts the live CryptoKey object.
 * The function will auto-export it to JWK before encrypting.
 */
export interface EncryptedFileMetadataInput {
  /** The live CryptoKey used to encrypt the file */
  fileKey: CryptoKey;
  /** IV used when encrypting the file blob */
  fileIv: ArrayBuffer;
  /** Original MIME type of the file */
  type: string;
  /** Original file name */
  name: string;
}

/**
 * Result of decryptFileMetadata: returns the imported CryptoKey ready to use.
 */
export interface DecryptedFileMetadata {
  /** The imported CryptoKey for AES-GCM decrypt */
  fileKey: CryptoKey;
  /** IV used when encrypting the file blob */
  iv: ArrayBuffer;
  /** Original MIME type of the file */
  type: string;
  /** Original file name */
  name: string;
}

/**
 * Encrypt file metadata (including the file key) with the chat shared secret.
 *
 * Automatically exports the live CryptoKey → JWK before serialisation,
 * so the caller doesn't need to handle export manually.
 */
export async function encryptFileMetadata(
  sharedSecret: CryptoKey,
  metadata: EncryptedFileMetadataInput,
): Promise<EncryptedPayload> {
  const jwkKey = await crypto.subtle.exportKey('jwk', metadata.fileKey);

  const plainObject = {
    key: jwkKey,
    iv: bufferToBase64(metadata.fileIv),
    type: metadata.type,
    name: metadata.name,
  };

  return encryptText(sharedSecret, JSON.stringify(plainObject));
}

/**
 * Decrypt file metadata and import the file key back into a live CryptoKey.
 *
 * Returns the imported CryptoKey ready for decryptFile().
 */
export async function decryptFileMetadata(
  sharedSecret: CryptoKey,
  ciphertext: ArrayBuffer,
  iv: ArrayBuffer,
): Promise<DecryptedFileMetadata> {
  const json = await decryptText(sharedSecret, ciphertext, iv);
  const parsed = JSON.parse(json);

  const fileKey = await crypto.subtle.importKey(
    'jwk',
    parsed.key,
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed if we ever need to re-encrypt the key
    ['encrypt', 'decrypt'],
  );

  return {
    fileKey,
    iv: base64ToBuffer(parsed.iv),
    type: parsed.type,
    name: parsed.name,
  };
}

// ──────────────────────────────────────────────
// Utility: convert ArrayBuffer ↔ base64 (for DB columns)
// ──────────────────────────────────────────────

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}