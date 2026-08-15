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
  bufferToBinaryString,
  binaryStringToBuffer,
  base64ToBuffer,
  bufferToBase64,
  SIGNED_PRE_KEY_ID,
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
 *
 * Anti-phantom-regeneration guard: if the local identity looks missing but the
 * server ALREADY has a valid Signal identity for this exact device, we treat it
 * as a race / slow IndexedDB and DO NOT regenerate. Generating a fresh identity
 * here would publish a new identity key for the same device and permanently
 * break every existing session addressed to the old key (exactly the "🔒 after
 * F5" failure). The local private identity cannot be recovered from the public
 * one, so the only safe action is to leave the server state untouched and let
 * the plaintext cache (decrypted-messages) serve already-decrypted history.
 */
export async function ensureSignalIdentity(
  userId: string,
  deviceId: string,
): Promise<void> {
  const store = createSignalStore(userId, deviceId);

  const identity = await store.getIdentityKeyPair();
  const localRegistrationId = await store.getLocalRegistrationId();

  if (!identity || !localRegistrationId) {
    // Identity виглядає відсутнім. Перевіряємо сервер, чи пристрій вже має
    // опублікований identity — якщо так, це фантомна втрата (race при
    // відкритті IndexedDB), а не перший запуск. Нічого не перегенеруємо.
    const serverAlreadyHasIdentity = await deviceHasSignalIdentity(deviceId);
    if (serverAlreadyHasIdentity) {
      // Не затираємо старий identity. Лишаємо локальний стан порожнім;
      // історія буде доступна з кешу розшифрованих повідомлень.
      return;
    }
    // Install-time generation for this device (only when the server has no
    // identity for it at all — i.e. a genuinely new device).
    await generateAndPersistSignalIdentity(store, ONE_TIME_PRE_KEY_BATCH_SIZE);
  } else {
    await refillOneTimePreKeys(userId, deviceId);
  }

  // Re-upload the public identity + signed pre key so the server stays in sync
  // (idempotent for one-time pre keys already present).
  await uploadSignalIdentity(userId, deviceId);
}

/**
 * True if the server already holds a valid Signal identity for this device.
 * Uses the same public device row the recipient side sees, so we never consume
 * one-time pre keys just to check (unlike `getSignalBundle`).
 */
async function deviceHasSignalIdentity(deviceId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('devices')
      .select('identity_key, signed_pre_key, signed_pre_key_signature')
      .eq('id', deviceId)
      .maybeSingle();
    if (error) return false;
    return !!(
      data &&
      data.identity_key &&
      data.signed_pre_key &&
      data.signed_pre_key_signature
    );
  } catch {
    // Мережа недоступна — не впевнені; консервативно вважаємо, що identity є,
    // щоб не створити новий і не розірвати сесії під час тимчасових збоїв.
    return true;
  }
}

/** Upload (or refresh) the device's public Signal identity + signed pre key. */
async function uploadSignalIdentity(userId: string, deviceId: string): Promise<void> {
  const store = createSignalStore(userId, deviceId);
  const identity = await store.getIdentityKeyPair();
  if (!identity) return;

  const registrationId = (await store.getLocalRegistrationId()) ?? 0;
  const signedPreKey = await store.loadSignedPreKey(SIGNED_PRE_KEY_ID);
  const signedPreKeySignature = await store.getSignedPreKeySignature(SIGNED_PRE_KEY_ID);
  const preKeys = await store.listPreKeys();

  if (!signedPreKey) {
    throw new Error('Signed pre key missing from local store');
  }

  const { error } = await supabase.rpc('rpc_upsert_signal_device', {
    p_device_id: deviceId,
    p_registration_id: registrationId,
    p_identity_key: bufferToBase64(identity.pubKey),
    p_signed_pre_key_id: SIGNED_PRE_KEY_ID,
    p_signed_pre_key: bufferToBase64(signedPreKey.pubKey),
    p_signed_pre_key_signature: signedPreKeySignature
      ? bufferToBase64(signedPreKeySignature)
      : null,
    p_one_time_pre_keys: preKeys.map((k) => ({
      keyId: k.keyId,
      publicKey: bufferToBase64(k.publicKey),
    })),
  });
  if (error) throw error;
}


/**
 * Refill the server-side pool of one-time pre keys when it runs low.
 * Called by `ensureSignalIdentity` on subsequent logins.
 * Generates new keys that continue after the highest locally-known key id, so
 * in-flight sessions that already claimed earlier keys are unaffected.
 */
export async function refillOneTimePreKeys(userId: string, deviceId: string): Promise<void> {
  const store = createSignalStore(userId, deviceId);

  const { data: count, error } = await supabase.rpc('rpc_get_one_time_pre_key_count', {
    p_device_id: deviceId,
  });
  if (error) throw error;
  if (typeof count !== 'number' || count > ONE_TIME_PRE_KEY_REFILL_THRESHOLD) return;

  const existing = await store.listPreKeys();
  const startId =
    existing.length > 0 ? Math.max(...existing.map((k) => k.keyId)) + 1 : 1;
  const newKeys = await generateOneTimePreKeys(store, startId, ONE_TIME_PRE_KEY_BATCH_SIZE);

  const { error: refillError } = await supabase.rpc('rpc_refill_one_time_pre_keys', {
    p_device_id: deviceId,
    p_one_time_pre_keys: newKeys.map((k) => ({
      keyId: k.keyId,
      publicKey: bufferToBase64(k.publicKey),
    })),
  });
  if (refillError) throw refillError;
}

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
  const bodyString = result.body ?? '';
  if (!bodyString) {
    throw new Error('Signal ciphertext body is empty');
  }
  return {
    type: result.type === 3 ? 3 : 1,
    // `body` is a binary string (one char per byte).
    body: bufferToBase64(binaryStringToBuffer(bodyString)),
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
