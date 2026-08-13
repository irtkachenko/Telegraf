'use client';

import { KeyHelper } from '@privacyresearch/libsignal-protocol-typescript';
import type {
  KeyPairType,
  PreKeyType,
  SignedPreKeyPairType,
} from '@privacyresearch/libsignal-protocol-typescript';
import { bufferToBase64 } from './encoding';
import type { SignalProtocolStore } from './store';

// ---------------------------------------------------------------------------
// Signal Protocol key generation (libsignal install-time behaviour).
// ---------------------------------------------------------------------------

/** ID of the one and only signed pre key each device keeps. */
export const SIGNED_PRE_KEY_ID = 1;

/** How many one-time pre keys we upload at install / on refill. */
export const ONE_TIME_PRE_KEY_BATCH_SIZE = 100;

/** Minimum one-time pre keys remaining before we refill the server pool. */
export const ONE_TIME_PRE_KEY_REFILL_THRESHOLD = 20;

export interface GeneratedSignalIdentity {
  identityPublicKey: ArrayBuffer;
  registrationId: number;
  signedPreKeyId: number;
  signedPreKeyPublic: ArrayBuffer;
  signedPreKeySignature: ArrayBuffer;
  /** Public one-time pre keys ready to be uploaded. */
  oneTimePreKeys: { keyId: number; publicKey: ArrayBuffer }[];
}

/**
 * Generate the full Signal identity for a device: identity key pair,
 * registration id, signed pre key and a batch of one-time pre keys. Everything
 * except the server-uploaded public parts is persisted in the local store.
 */
export async function generateAndPersistSignalIdentity(
  store: SignalProtocolStore,
  oneTimePreKeyCount = ONE_TIME_PRE_KEY_BATCH_SIZE,
): Promise<GeneratedSignalIdentity> {
  const identityKeyPair: KeyPairType = await KeyHelper.generateIdentityKeyPair();
  const registrationId = KeyHelper.generateRegistrationId();
  const signedPreKey: SignedPreKeyPairType = await KeyHelper.generateSignedPreKey(
    identityKeyPair,
    SIGNED_PRE_KEY_ID,
  );

  // Persist private state locally — never leaves the browser.
  await store.storeIdentityKeyPair(identityKeyPair);
  await store.storeLocalRegistrationId(registrationId);
  await store.storeSignedPreKeyWithSignature(
    signedPreKey.keyId,
    signedPreKey.keyPair,
    signedPreKey.signature,
  );

  const oneTimePreKeys: { keyId: number; publicKey: ArrayBuffer }[] = [];
  for (let i = 1; i <= oneTimePreKeyCount; i++) {
    const preKey = await KeyHelper.generatePreKey(i);
    await store.storePreKey(preKey.keyId, preKey.keyPair);
    oneTimePreKeys.push({ keyId: preKey.keyId, publicKey: preKey.keyPair.pubKey });
  }

  return {
    identityPublicKey: identityKeyPair.pubKey,
    registrationId,
    signedPreKeyId: signedPreKey.keyId,
    signedPreKeyPublic: signedPreKey.keyPair.pubKey,
    signedPreKeySignature: signedPreKey.signature,
    oneTimePreKeys,
  };
}

/**
 * Generate an extra batch of one-time pre keys and persist them locally.
 * Used to refill the server pool as keys get consumed. Returns the public keys.
 */
export async function generateOneTimePreKeys(
  store: SignalProtocolStore,
  startId: number,
  count: number,
): Promise<PreKeyType<ArrayBuffer>[]> {
  const keys: PreKeyType<ArrayBuffer>[] = [];
  for (let i = 0; i < count; i++) {
    const keyId = startId + i;
    const preKey = await KeyHelper.generatePreKey(keyId);
    await store.storePreKey(preKey.keyId, preKey.keyPair);
    keys.push({ keyId: preKey.keyId, publicKey: preKey.keyPair.pubKey });
  }
  return keys;
}

/** Public key of the local identity as base64 (for the server). */
export async function exportIdentityPublicKeyBase64(
  store: SignalProtocolStore,
): Promise<string | undefined> {
  const pair = await store.getIdentityKeyPair();
  return pair ? bufferToBase64(pair.pubKey) : undefined;
}