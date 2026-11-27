/**
 * What the app read last time, kept on this device so it can be read again
 * without signal (offline release 1). lib/api.ts saves every successful JSON
 * GET here and, when a GET fails for want of a network, answers from here
 * instead — so any page someone opened while online still opens in a plant
 * room with no bars.
 *
 * Reading only. Nothing here sends anything; a change made offline fails as
 * before, with a message that says why (`errorMessage` in lib/api.ts).
 *
 * Per person and wiped on sign-out (`clearSession`), because a shared phone
 * must not show the last user's jobs to the next one. Entries older than
 * MAX_AGE_DAYS are dropped, and the store keeps at most MAX_ENTRIES, oldest
 * first out.
 *
 * IndexedDB, not localStorage: a site's asset register runs to megabytes, past
 * localStorage's few-MB ceiling, and IndexedDB does not block the page.
 */

const DB_NAME = "hanni-offline";
const STORE = "responses";
const MAX_ENTRIES = 500;
const MAX_AGE_DAYS = 14;
const MAX_BYTES = 2_000_000; // one response; a bigger one is not worth the space

export type Saved<T = unknown> = { data: T; savedAt: number };

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE);
        store.createIndex("savedAt", "savedAt");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null); // private mode in some browsers: no offline copy, nothing breaks
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve) => {
    if (!db) return resolve(undefined);
    try {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  }));
}

const keyFor = (userId: string, url: string) => `${userId}|${url}`;

export async function saveResponse(userId: string, url: string, data: unknown): Promise<void> {
  let size = 0;
  try { size = JSON.stringify(data).length; } catch { return; }
  if (size > MAX_BYTES) return;
  await tx("readwrite", (s) => s.put({ data, savedAt: Date.now() }, keyFor(userId, url)));
}

export async function readResponse<T = unknown>(userId: string, url: string): Promise<Saved<T> | null> {
  const hit = await tx<Saved<T>>("readonly", (s) => s.get(keyFor(userId, url)));
  if (!hit) return null;
  if (Date.now() - hit.savedAt > MAX_AGE_DAYS * 86_400_000) return null;
  return hit;
}

/** Everything, for everyone — signing out. */
export async function clearOfflineData(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
}

/** Drops what is too old, then the oldest beyond MAX_ENTRIES. Run once per load. */
export async function pruneOfflineData(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  await new Promise<void>((resolve) => {
    try {
      const t = db.transaction(STORE, "readwrite");
      const store = t.objectStore(STORE);
      const countReq = store.count();
      countReq.onsuccess = () => {
        let excess = Math.max(0, countReq.result - MAX_ENTRIES);
        // savedAt ascending: oldest first.
        store.index("savedAt").openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          if (excess > 0 || (cursor.value as Saved).savedAt < cutoff) {
            cursor.delete();
            if (excess > 0) excess--;
            cursor.continue();
          }
        };
      };
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** True when the browser says there is no network. A hint only; requests are the truth. */
export const browserOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * Told whenever a page's data came from this device instead of the server, so
 * the offline bar can say how old it is. Detail: { savedAt }.
 */
export const OFFLINE_DATA_EVENT = "hanni:offline-data";
/** Told when a request reached the server again. */
export const ONLINE_DATA_EVENT = "hanni:online-data";
