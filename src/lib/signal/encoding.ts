'use client';

// ---------------------------------------------------------------------------
// Encoding helpers for the Signal Protocol integration.
//
// libsignal-protocol-typescript works with ArrayBuffers and — for the wire
// format produced by `SessionCipher.encrypt()` — binary strings (one JS char
// per byte). We persist everything as base64 so it survives JSON/PostgREST
// round-trips losslessly.
// ---------------------------------------------------------------------------

/** Convert an ArrayBuffer to a base64 string. */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Convert a base64 string back to an ArrayBuffer. */
export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Convert a byte ArrayBuffer to a binary string (one char per byte). */
export function bufferToBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return binary;
}

/** Convert a binary string (chars 0-255) back to an ArrayBuffer. */
export function binaryStringToBuffer(binary: string): ArrayBuffer {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Base64 of a binary string. */
export function binaryStringToBase64(binary: string): string {
  return bufferToBase64(binaryStringToBuffer(binary));
}

/** Convert a base64 payload back to the binary string the library expects. */
export function base64ToBinaryString(base64: string): string {
  return bufferToBinaryString(base64ToBuffer(base64));
}

/**
 * Derive a stable numeric device id from a UUID device row id.
 *
 * `SignalProtocolAddress` requires the device id to be a number, and the value
 * must be identical on both the sender and the receiver for the same device.
 * We use FNV-1a over the UUID, which is deterministic across clients.
 */
export function deviceNumberFromId(deviceId: string): number {
  const str = String(deviceId);
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const value = hash >>> 0;
  // Signal device ids start at 1.
  return value === 0 ? 1 : value;
}
