'use client';

import {
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
} from '@privacyresearch/libsignal-protocol-typescript';
import {
  SignalProtocolStore,
  generateAndPersistSignalIdentity,
  generateOneTimePreKeys,
  deviceNumberFromId,
  binaryStringToBuffer,
  base64ToBuffer,
  bufferToBase64,
  ONE_TIME_PRE_KEY_BATCH_SIZE,
  ONE_TIME_PRE_KEY_REFILL_THRESHOLD,
} from '@/lib/signal';
import { supabase } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Signal Protocol orchestration layer.
//
// Wraps the official libsignal-protocol-typescript implementation (X3DH session
// establishment + Double Ratchet encryption) and coordinates the server-side
// pre-key lifecycle.
// ---------------------------------------------------------------------------

export interface SignalCiphertext {
  /** 1 = WhisperMessage, 3 = PreKeyWhisperMessage. */
  type: 1 | 3;
  /** Base64-encoded serialized Signal message. */
  body: string;
}

export interface SignalBundle {
  identity_key: string | null;
  registration_id: number | null;
  signed_pre_key_id: number | null;
  signed_pre_key: string | null;
  signed_pre_key_signature: string | null;
  one_time_pre_key_id: number | null;
  one_time_pre_key: string | null;
}

/** Create the IndexedDB-backed store scoped to `(userId, deviceId)`. */
export function createSignalStore(userId: string, deviceId: string): SignalProtocolStore {
  return new SignalProtocolStore(`${userId}:${deviceId}`);
}

function toBinaryString(bodyBase64: string): string {
  return bufferToBinaryString(base64ToBuffer(bodyBase64));
}

/**
 * Ensure this device has a Signal identity and that its public pre-keys are
 * uploaded to the server. Called on login/registration so a brand-new user can
 * immediately receive the first message from anyone.
 *
 * - First run: generates identity + registration id + signed pre key + batch of
 *   one-time pre keys, persists them locally, uploads the public parts.
 * - Later runs: refills the server pool when it drops below a threshold.
 */
export async function ensureSignalIdentity(
  userId: string,
  deviceId: string,
): Promise<void> {
  const store = createSignalStore(userId, deviceId);

  const identity = await store.getIdentityKeyPair();
  const localRegistrationId = await store.getLocalRegistrationId();

  if (!identity || !localRegistrationId) {
    // Install-time generation for this device.
    await generateAndPersistSignalIdentity(store, ONE_TIME_PRE_KEY_BATCH_SIZE);
  } else {
    await refillOneTimePreKeys(userId, deviceId);
  }

  // Re-upload the public identity + signed pre key so the server stays in sync
  // (idempotent for one-time pre keys already present).
  await uploadSignalIdentity(userId, deviceId);
}

/** Upload (or refresh) the device's public Signal identity + signed pre key. */
async function uploadSignalIdentity(userId: string, deviceId: string): Promise<void> {
  const store = createSignalStore(userId, deviceId);
  const identity = await store.getIdentityKeyPair();
  if (!identity) return;

  const registrationId = (await store.getLocalRegistrationId()) ?? 0;
  const signedKeyPair = await store.loadSignedPreKey(1);
  const signatureBuffer = await store.getSignedPreKeySignature(1);
  const preKeys = await store.listPreKeys();

  const { error } = await supabase.rpc('rpc_upsert_signal_device', {
    p_device_id: deviceId,
    p_registration_id: registrationId,
    p_identity_key: bufferToBase64(identity.pubKey),
    p_signed_pre_key_id: 1,
    p_signed_pre_key: signedKeyPair ? bufferToBase64(signedKeyPair.pubKey) : '',
    p_signed_pre_key_signature: signatureBuffer ? bufferToBase64(signatureBuffer) : '',
    p_one_time_pre_keys: preKeys.map((k) => ({
      keyId: k.keyId,
      publicKey: bufferToBase64(k.publicKey),
    })),
  });

  if (error) throw error;
}

/**
 * Top up the server-side one-time pre key pool when it drops below a threshold.
 * Generates new keys that continue after the highest locally-known key id, so
 * in-flight sessions that already claimed earlier keys are unaffected.
 */
export async function refillOneTimePreKeys(userId: string, deviceId: string): Promise<void> {
  const store = createSignalStore(userId, deviceId);
  const identity = await store.getIdentityKeyPair();
  if (!identity) return;

  const { data: count, error } = await supabase.rpc('rpc_get_one_time_pre_key_count', {
    p_device_id: deviceId,
  });
  if (error) throw error;
  if (typeof count !== 'number' || count > ONE_TIME_PRE_KEY_REFILL_THRESHOLD) return;

  const existing = await store.listPreKeys();
  const startId = existing.length > 0 ? Math.max(...existing.map((k) => k.keyId)) + 1 : 1;
  const newKeys = await generateOneTimePreKeys(store, startId, ONE_TIME_PRE_KEY_BATCH_SIZE);

  const { error: refillError } = await supabase.rpc('rpc_refill_one_time_pre_keys', {
    p_device_id: deviceId,
    p_one_time_pre_keys: newKeys.map((k) => ({
      keyId: k.keyId,
      publicKey: bufferToBase64(k.publicKey),
/** Fetch a recipient device's Signal pre-key bundle from the server. */
export async function getSignalBundle(recipientDeviceId: string): Promise<SignalBundle | null> {
  const { data, error } = await supabase.rpc('rpc_get_signal_bundle', {
    p_device_id: recipientDeviceId,
  });
  if (error) throw error;
  return (data as SignalBundle) ?? null;
}

/**
 * Encrypt a plaintext buffer for a single recipient device, establishing an
 * X3DH session first if none exists yet. Returns the serialized Signal message.
 */
export async function encryptToDevice(
  store: SignalProtocolStore,
  peerUserId: string,
  peerDeviceId: string,
  plaintext: ArrayBuffer,
): Promise<SignalCiphertext> {
  const address = new SignalProtocolAddress(peerUserId, deviceNumberFromId(peerDeviceId));

  const hasSession = !!(await store.loadSession(address.toString()));
  if (!hasSession) {
    const bundle = await getSignalBundle(peerDeviceId);
    if (
      !bundle ||
      !bundle.identity_key ||
      !bundle.signed_pre_key ||
      !bundle.signed_pre_key_signature
    ) {
      throw new Error(`Recipient device ${peerDeviceId} has no Signal pre-keys yet`);
    }
    const device = {
      identityKey: base64ToBuffer(bundle.identity_key),
      signedPreKey: {
        keyId: bundle.signed_pre_key_id as number,
        publicKey: base64ToBuffer(bundle.signed_pre_key),
        signature: base64ToBuffer(bundle.signed_pre_key_signature),
      },
      preKey: bundle.one_time_pre_key
        ? {
            keyId: bundle.one_time_pre_key_id as number,
            publicKey: base64ToBuffer(bundle.one_time_pre_key),
          }
        : undefined,
      registrationId: bundle.registration_id ?? undefined,
    };

    const builder = new SessionBuilder(store, address);
    await builder.processPreKey(device);
  }

  const cipher = new SessionCipher(store, address);
  const result = await cipher.encrypt(plaintext);
  return {
    type: result.type === 3 ? 3 : 1,
    // `body` is a binary string (one char per byte).
    body: bufferToBase64(binaryStringToBuffer(result.body)),
  };
}

/**
 * Decrypt a Signal message for a given local device + peer device. Handles both
 * PreKeyWhisperMessage (establishes the session) and WhisperMessage.
 */
export async function decryptFromDevice(
  store: SignalProtocolStore,
  peerUserId: string,
  peerDeviceId: string,
  type: 1 | 3,
  bodyBase64: string,
): Promise<ArrayBuffer> {
  const address = new SignalProtocolAddress(peerUserId, deviceNumberFromId(peerDeviceId));
  const cipher = new SessionCipher(store, address);
  const binary = toBinaryString(bodyBase64);

  if (type === 3) {
    return cipher.decryptPreKeyWhisperMessage(binary, 'binary');
  }
  return cipher.decryptWhisperMessage(binary, 'binary');
}
    })),
  });
  if (refillError) throw refillError;
}