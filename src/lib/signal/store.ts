'use client';

import type {
  Direction,
  KeyPairType,
  SessionRecordType,
  StorageType,
} from '@privacyresearch/libsignal-protocol-typescript';
import {
  SIGNAL_IDENTITY_STORE,
  SIGNAL_PREKEYS_STORE,
  SIGNAL_REGISTRATION_STORE,
  SIGNAL_REMOTE_IDENTITY_STORE,
  SIGNAL_SESSIONS_STORE,
  SIGNAL_SIGNED_PREKEYS_STORE,
} from '@/lib/e2ee-db';
import { bufferToBase64, base64ToBuffer } from './encoding';
import { idbDelete, idbGet, idbGetAll, idbPut } from './idb';

// ---------------------------------------------------------------------------
// Durable Signal Protocol store backed by IndexedDB.
//
// All records are namespaced by a `scope` of the form `<userId>:<deviceId>` so
// that data from different accounts (and devices) never mixes inside the same
// browser profile.
// ---------------------------------------------------------------------------

interface StoredKeyPair {
  pubKey: string; // base64
  privKey: string; // base64
}

interface StoredSignedPreKey extends StoredKeyPair {
  keyId: number;
  signature: string; // base64
}

const keyIdFor = (scope: string, keyId: number | string) => `${scope}:${keyId}`;
const addressIdFor = (scope: string, encodedAddress: string) => `${scope}:${encodedAddress}`;
const identityIdFor = (scope: string, identifier: string) => `${scope}::${identifier}`;

function toArrayBufferKeyPair(record: StoredKeyPair | undefined): KeyPairType | undefined {
  if (!record) return undefined;
  return {
    pubKey: base64ToBuffer(record.pubKey),
    privKey: base64ToBuffer(record.privKey),
  };
}

export class SignalProtocolStore implements StorageType {
  constructor(private readonly scope: string) {}

  /** Scope used for IndexedDB keys — `<userId>:<deviceId>`. */
  getScope(): string {
    return this.scope;
  }

  // ── Identity keys ──────────────────────────────────────────────

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const record = await idbGet<StoredKeyPair>(SIGNAL_IDENTITY_STORE, this.scope);
    return toArrayBufferKeyPair(record);
  }

  async storeIdentityKeyPair(keyPair: KeyPairType): Promise<void> {
    await idbPut(SIGNAL_IDENTITY_STORE, {
      id: this.scope,
      pubKey: bufferToBase64(keyPair.pubKey),
      privKey: bufferToBase64(keyPair.privKey),
    });
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const record = await idbGet<{ id: string; registrationId: number }>(
      SIGNAL_REGISTRATION_STORE,
      this.scope,
    );
    return record?.registrationId;
  }

  async storeLocalRegistrationId(registrationId: number): Promise<void> {
    await idbPut(SIGNAL_REGISTRATION_STORE, { id: this.scope, registrationId });
  }

  // Trust is checked per-device session; we accept the first-seen identity
  // (TOFU). Explicit fingerprint verification UI was removed in the Signal
  // migration (see git history of src/lib/verification.ts).
  async isTrustedIdentity(
    _identifier: string,
    _identityKey: ArrayBuffer,
    _direction: Direction,
  ): Promise<boolean> {
    return true;
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: ArrayBuffer,
    _nonblockingApproval?: boolean,
  ): Promise<boolean> {
    await idbPut(SIGNAL_REMOTE_IDENTITY_STORE, {
      id: identityIdFor(this.scope, encodedAddress),
      encodedAddress,
      pubKey: bufferToBase64(publicKey),
    });
    return true;
  }

  // ── One-time pre keys ──────────────────────────────────────────

  async loadPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    const record = await idbGet<StoredKeyPair>(SIGNAL_PREKEYS_STORE, keyIdFor(this.scope, keyId));
    return toArrayBufferKeyPair(record);
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await idbPut(SIGNAL_PREKEYS_STORE, {
      id: keyIdFor(this.scope, keyId),
      keyId: Number(keyId),
      pubKey: bufferToBase64(keyPair.pubKey),
      privKey: bufferToBase64(keyPair.privKey),
    });
  }

  async removePreKey(keyId: number | string): Promise<void> {
    await idbDelete(SIGNAL_PREKEYS_STORE, keyIdFor(this.scope, keyId));
  }

  /**
   * List every one-time pre key stored locally for this device scope.
   * Used to derive the next free key id when refilling the pool.
   */
  async listPreKeys(): Promise<{ keyId: number; publicKey: ArrayBuffer }[]> {
    const all = await idbGetAll<{ id: string; keyId: number; pubKey: string }>(
      SIGNAL_PREKEYS_STORE,
    );
    const prefix = `${this.scope}:`;
    return all
      .filter((r) => r.id.startsWith(prefix))
      .map((r) => ({ keyId: r.keyId, publicKey: base64ToBuffer(r.pubKey) }));
  }

  // ── Signed pre keys ────────────────────────────────────────────

  async loadSignedPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    const record = await idbGet<StoredKeyPair>(
      SIGNAL_SIGNED_PREKEYS_STORE,
      keyIdFor(this.scope, keyId),
    );
    return toArrayBufferKeyPair(record);
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    const existing = await idbGet<StoredSignedPreKey>(
      SIGNAL_SIGNED_PREKEYS_STORE,
      keyIdFor(this.scope, keyId),
    );
    await idbPut(SIGNAL_SIGNED_PREKEYS_STORE, {
      id: keyIdFor(this.scope, keyId),
      keyId: Number(keyId),
      pubKey: bufferToBase64(keyPair.pubKey),
      privKey: bufferToBase64(keyPair.privKey),
      signature: existing?.signature ?? '',
    });
  }

  async storeSignedPreKeyWithSignature(
    keyId: number,
    keyPair: KeyPairType,
    signature: ArrayBuffer,
  ): Promise<void> {
    await idbPut(SIGNAL_SIGNED_PREKEYS_STORE, {
      id: keyIdFor(this.scope, keyId),
      keyId,
      pubKey: bufferToBase64(keyPair.pubKey),
      privKey: bufferToBase64(keyPair.privKey),
      signature: bufferToBase64(signature),
    });
  }

  async getSignedPreKeySignature(keyId: number): Promise<ArrayBuffer | undefined> {
    const record = await idbGet<StoredSignedPreKey>(
      SIGNAL_SIGNED_PREKEYS_STORE,
      keyIdFor(this.scope, keyId),
    );
    return record?.signature ? base64ToBuffer(record.signature) : undefined;
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    await idbDelete(SIGNAL_SIGNED_PREKEYS_STORE, keyIdFor(this.scope, keyId));
  }

  // ── Sessions ───────────────────────────────────────────────────

  async loadSession(encodedAddress: string): Promise<SessionRecordType | undefined> {
    const record = await idbGet<{ id: string; record: string }>(
      SIGNAL_SESSIONS_STORE,
      addressIdFor(this.scope, encodedAddress),
    );
    return record?.record;
  }

  async storeSession(encodedAddress: string, record: SessionRecordType): Promise<void> {
    // `record` is a plain JSON string (see SessionRecord.serialize()).
    await idbPut(SIGNAL_SESSIONS_STORE, {
      id: addressIdFor(this.scope, encodedAddress),
      encodedAddress,
      record,
    });
  }

  async removeSession(encodedAddress: string): Promise<void> {
    await idbDelete(SIGNAL_SESSIONS_STORE, addressIdFor(this.scope, encodedAddress));
  }
}

