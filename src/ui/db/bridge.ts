/// <reference lib="dom" />
/**
 * Persistence bridge: mem:// SurrealDB ↔ IndexedDB.
 *
 * SurrealDB's native indxdb:// engine is broken (upstream WASM↔JS async
 * barrier bug). This module bypasses it entirely: we use mem:// for the
 * engine and persist via db.export()/db.import() through our own IndexedDB
 * key-value store.
 *
 * Each SurrealDB database gets its own dump keyed by its UUID.
 * The _ui database is keyed as "ui".
 */

const IDB_NAME = "marlinspike_snapshots";
const IDB_STORE = "dumps";
const IDB_VERSION = 1;

function openSnapshotDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save a SurrealQL dump string to IndexedDB. */
export async function saveDump(key: string, data: string): Promise<void> {
  const idb = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(data, key);
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => {
      idb.close();
      reject(tx.error);
    };
  });
}

/** Load a SurrealQL dump string from IndexedDB. Returns null if not found. */
export async function loadDump(key: string): Promise<string | null> {
  const idb = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => {
      idb.close();
      resolve((req.result as string) ?? null);
    };
    req.onerror = () => {
      idb.close();
      reject(req.error);
    };
  });
}

/** Delete a dump from IndexedDB. */
export async function deleteDump(key: string): Promise<void> {
  const idb = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => {
      idb.close();
      reject(tx.error);
    };
  });
}

/** List all stored dump keys. */
export async function listDumpKeys(): Promise<string[]> {
  const idb = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = () => {
      idb.close();
      resolve(req.result as string[]);
    };
    req.onerror = () => {
      idb.close();
      reject(req.error);
    };
  });
}
