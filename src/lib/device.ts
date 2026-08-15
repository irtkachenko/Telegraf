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
 *
 * Захист від «фантомної» перегенерації після F5: IndexedDB може відкриватись
 * повільно (або відкриватись race-ом із Signal-стором), тому приватний ключ
 * може «здатися» відсутнім, хоча він ще пишеться. Якщо ми в такому стані одразу
 * зареєструємо новий пристрій, ми розірвемо всі наявні Signal-сесії. Тому:
 *   1) якщо є `device_id` у localStorage і він ДОСІ існує на сервері — це
 *      фантомна «втрата» ключа (або тимчасова недоступність). Чекаємо коротку
 *      паузу й повторюємо читання приватного ключа, щоб дати IndexedDB
 *      завершити запис; перевикористовуємо той самий пристрій;
 *   2) новий пристрій реєструємо лише коли справді немає жодного локального
 *      стану та сервер його не знає.
 */
export async function ensureDevice(userId: string): Promise<CurrentDevice> {
  const existing = await getCurrentDevice(userId);
  if (existing) return existing;

  const deviceId = getDeviceId(userId);

  // Якщо device_id залишився в localStorage, але приватний ключ не знайдено —
  // можливо, це race з відкриттям IndexedDB. Даємо БД шанс дописати ключ.
  if (deviceId) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const retried = await getCurrentDevice(userId);
      if (retried) return retried;
      // Сервер більше не має цього device_id → ключ справді втрачено,
      // створюємо новий пристрій нижче.
      let serverHasDevice = false;
      try {
        const devices = await devicesApi.listDevices(userId);
        serverHasDevice = devices.some((d) => d.id === deviceId);
      } catch {
        // Мережа недоступна — не можемо перевірити; вважаємо, що втратили.
        serverHasDevice = false;
      }
      if (!serverHasDevice) break;
      // Пристрій ще існує на сервері, але локально немає ключа — чекаємо і
      // пробуємо знову, щоб не затирати device_id даремно.
      await new Promise((r) => setTimeout(r, 150));
    }
    // Якщо після повторів ключ з'явився — вже повернулись вище.
  }

  const { privateKey } = await generateKeyPair();
  const publicKeyJwk = await exportPublicPartFromPrivate(privateKey);
  const row = await devicesApi.registerDevice(userId, publicKeyJwk);
  await storeDevicePrivateKey(userId, privateKey);
  setDeviceId(userId, row.id);

  return { deviceId: row.id, privateKey, publicKeyJwk };
}
