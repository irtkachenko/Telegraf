'use client';

// ---------------------------------------------------------------------------
// Ідентичність поточного пристрою (per-device E2EE keys).
//
// Кожен пристрій має власну пару ключів:
//  - приватний ключ — у IndexedDB (за префіксом `device:`), ніколи не виходить;
//  - публічний ключ — зареєстрований у таблиці `devices` на сервері;
//  - `device_id` — у localStorage (щоб дешифрування знало, чий це пристрій).
// ---------------------------------------------------------------------------

import {
  exportPublicPartFromPrivate,
  generateKeyPair,
  getDevicePrivateKey,
  storeDevicePrivateKey,
} from '@/lib/crypto';
import { devicesApi } from '@/services';

const DEVICE_ID_KEY = 'telegraf-device';

export function getDeviceId(userId: string): string | null {
  try {
    return localStorage.getItem(`${DEVICE_ID_KEY}:${userId}`);
  } catch {
    return null;
  }
}

function setDeviceId(userId: string, deviceId: string): void {
  try {
    localStorage.setItem(`${DEVICE_ID_KEY}:${userId}`, deviceId);
  } catch {
    // ignore
  }
}

export interface CurrentDevice {
  deviceId: string;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
}

/**
 * Повертає поточний пристрій, якщо він уже зареєстрований локально.
 */
export async function getCurrentDevice(userId: string): Promise<CurrentDevice | null> {
  const deviceId = getDeviceId(userId);
  if (!deviceId) return null;
  const privateKey = await getDevicePrivateKey(userId);
  if (!privateKey) return null;
  const publicKeyJwk = await exportPublicPartFromPrivate(privateKey);
  return { deviceId, privateKey, publicKeyJwk };
}

/**
 * Гарантує наявність зареєстрованого пристрою: якщо немає — генерує ключ,
 * зберігає його локально й реєструє публічний ключ у БД.
 */
export async function ensureDevice(userId: string): Promise<CurrentDevice> {
  const existing = await getCurrentDevice(userId);
  if (existing) return existing;

  const { privateKey } = await generateKeyPair();
  const publicKeyJwk = await exportPublicPartFromPrivate(privateKey);
  const row = await devicesApi.registerDevice(userId, publicKeyJwk);
  await storeDevicePrivateKey(userId, privateKey);
  setDeviceId(userId, row.id);

  return { deviceId: row.id, privateKey, publicKeyJwk };
}
