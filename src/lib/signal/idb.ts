'use client';

import { openE2EEDb } from '@/lib/e2ee-db';

// Minimal promisified IndexedDB helpers shared by the Signal store.

export async function idbGet<T>(
  storeName: string,
  key: string,
): Promise<T | undefined> {
  const db = await openE2EEDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => {
      db.close();
      resolve(req.result as T | undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function idbPut(
  storeName: string,
  value: Record<string, unknown>,
): Promise<void> {
  const db = await openE2EEDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
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

export async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openE2EEDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
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

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openE2EEDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result as T[]);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function idbClear(storeName: string): Promise<void> {
  const db = await openE2EEDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
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