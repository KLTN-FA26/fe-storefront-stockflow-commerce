/**
 * Where the design mock keeps its state so it survives a reload.
 *
 * The design store (Task 3) serialises everything into one `DesignMockSnapshot` keyed by
 * collection, and keeps binary uploads as blobs under keys like `asset/{id}` and
 * `file/{designId}/v{version}/{role}`. Two implementations sit behind one interface: IndexedDB in
 * the browser (database `stockflow-design-mock`, stores `state` and `blobs`) and a memory one for
 * tests, SSR and browsers that refuse IndexedDB (private mode, blocked storage).
 */

export type DesignMockSnapshot = { rows: Record<string, unknown> };

export interface DesignMockStorage {
  /** false for memory: nothing survives a reload. */
  readonly persistent: boolean;
  load(): Promise<DesignMockSnapshot | null>;
  save(snapshot: DesignMockSnapshot): Promise<void>;
  putBlob(key: string, blob: Blob): Promise<void>;
  getBlob(key: string): Promise<Blob | null>;
  /** Removes one blob; an unknown key is not an error. */
  deleteBlob(key: string): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = "stockflow-design-mock";
const STATE_STORE = "state";
const BLOB_STORE = "blobs";
const SNAPSHOT_KEY = "snapshot";

export function createMemoryStorage(): DesignMockStorage {
  let snapshot: DesignMockSnapshot | null = null;
  const blobs = new Map<string, Blob>();

  return {
    persistent: false,
    async load() {
      return snapshot ? structuredClone(snapshot) : null;
    },
    async save(next) {
      snapshot = structuredClone(next);
    },
    async putBlob(key, blob) {
      blobs.set(key, blob); // kept by reference: a Blob is immutable
    },
    async getBlob(key) {
      return blobs.get(key) ?? null;
    },
    async deleteBlob(key) {
      blobs.delete(key);
    },
    async clear() {
      snapshot = null;
      blobs.clear();
    },
  };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/** Resolves once the transaction has committed, so a save is durable when its promise settles. */
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/**
 * Opens the database. A blocked open (another tab holds an older version) is refused at once, so
 * the caller can fall back to memory; should the browser let that open through later, the late
 * connection is closed instead of leaking.
 */
function openDatabase(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      finish();
    };
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STATE_STORE);
      req.result.createObjectStore(BLOB_STORE);
    };
    req.onsuccess = () => {
      if (settled) req.result.close();
      else settle(() => resolve(req.result));
    };
    req.onerror = () => settle(() => reject(req.error ?? new Error("IndexedDB open failed")));
    req.onblocked = () => settle(() => reject(new Error("IndexedDB open blocked")));
  });
}

export async function createIndexedDbStorage(dbName: string = DB_NAME): Promise<DesignMockStorage> {
  /**
   * The open connection, made again on the next call once it is gone: closed for another tab's
   * upgrade or delete (`versionchange`), or by the browser (`close`). A failed open is retried.
   */
  let current: Promise<IDBDatabase> | null = null;
  function connection(): Promise<IDBDatabase> {
    if (current) return current;
    const opening = openDatabase(dbName).then((db) => {
      const forget = () => {
        if (current === opening) current = null;
      };
      db.onversionchange = () => {
        db.close();
        forget();
      };
      db.onclose = forget;
      return db;
    });
    opening.catch(() => {
      if (current === opening) current = null;
    });
    current = opening;
    return opening;
  }
  // The first open decides: when it fails, `openDesignStorage` falls back to memory.
  await connection();

  return {
    persistent: true,
    async load() {
      const db = await connection();
      const tx = db.transaction(STATE_STORE, "readonly");
      const value = await request<DesignMockSnapshot | undefined>(
        tx.objectStore(STATE_STORE).get(SNAPSHOT_KEY),
      );
      return value ?? null;
    },
    async save(snapshot) {
      const db = await connection();
      const tx = db.transaction(STATE_STORE, "readwrite");
      tx.objectStore(STATE_STORE).put(snapshot, SNAPSHOT_KEY);
      await committed(tx);
    },
    async putBlob(key, blob) {
      const db = await connection();
      const tx = db.transaction(BLOB_STORE, "readwrite");
      tx.objectStore(BLOB_STORE).put(blob, key);
      await committed(tx);
    },
    async getBlob(key) {
      const db = await connection();
      const tx = db.transaction(BLOB_STORE, "readonly");
      const value = await request<Blob | undefined>(tx.objectStore(BLOB_STORE).get(key));
      return value ?? null;
    },
    async deleteBlob(key) {
      const db = await connection();
      const tx = db.transaction(BLOB_STORE, "readwrite");
      tx.objectStore(BLOB_STORE).delete(key);
      await committed(tx);
    },
    async clear() {
      const db = await connection();
      const tx = db.transaction([STATE_STORE, BLOB_STORE], "readwrite");
      tx.objectStore(STATE_STORE).clear();
      tx.objectStore(BLOB_STORE).clear();
      await committed(tx);
    },
  };
}

/** Whether this page already said that the design mock keeps its data in memory. */
let warnedMemory = false;

/** IndexedDB when the browser allows it, memory otherwise (said once per page in the console). */
export async function openDesignStorage(): Promise<DesignMockStorage> {
  try {
    return await createIndexedDbStorage();
  } catch (error) {
    if (!warnedMemory) {
      warnedMemory = true;
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[mock-design] IndexedDB cannot be opened (${reason}); the design mock keeps its data in memory, lost on reload.`,
        error,
      );
    }
    return createMemoryStorage();
  }
}
