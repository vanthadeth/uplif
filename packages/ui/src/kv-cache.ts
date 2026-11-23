/**
 * A small key-value copy of server data kept in the browser (IndexedDB), so a screen can show what it last
 * loaded when there is no signal. It is a read copy only: the server stays the source of truth.
 * Every entry is stamped with its owner, and entries of another owner are never returned.
 * If the browser blocks IndexedDB, it works in memory for the life of the page.
 */
export interface KvEntry<T> { value: T; savedAt: number }

export interface KvCache {
  get<T>(owner: string, key: string): Promise<KvEntry<T> | undefined>;
  set<T>(owner: string, key: string, value: T): Promise<void>;
  /** Removes everything, or only one owner's entries. */
  clear(owner?: string): Promise<void>;
}

const STORE = "kv";

export function createKvCache(name: string): KvCache {
  const memory = new Map<string, KvEntry<unknown> & { owner: string }>();
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const db = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open(`uplif-cache-${name}`, 1);
          req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: "id" }); };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch { resolve(null); }
      });
    }
    return dbPromise;
  };
  const run = async <R,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<R>): Promise<R | undefined> => {
    const d = await db();
    if (!d) return undefined;
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  const id = (owner: string, key: string) => `${owner}\u0000${key}`;

  return {
    async get<T>(owner: string, key: string) {
      const row = await run("readonly", (s) => s.get(id(owner, key)) as IDBRequest<(KvEntry<T> & { owner: string }) | undefined>).catch(() => undefined);
      const hit = row ?? (memory.get(id(owner, key)) as (KvEntry<T> & { owner: string }) | undefined);
      return hit && hit.owner === owner ? { value: hit.value, savedAt: hit.savedAt } : undefined;
    },
    async set<T>(owner: string, key: string, value: T) {
      const row = { id: id(owner, key), owner, value, savedAt: Date.now() };
      const ok = await run("readwrite", (s) => s.put(row)).then(() => true, () => false);
      if (!ok || !(await db())) memory.set(row.id, row);
    },
    async clear(owner) {
      if (!owner) { await run("readwrite", (s) => s.clear()).catch(() => undefined); memory.clear(); return; }
      const rows = (await run("readonly", (s) => s.getAll() as IDBRequest<{ id: string; owner: string }[]>).catch(() => undefined)) ?? [];
      for (const r of rows) if (r.owner === owner) await run("readwrite", (s) => s.delete(r.id)).catch(() => undefined);
      for (const [k, v] of memory) if (v.owner === owner) memory.delete(k);
    },
  };
}
