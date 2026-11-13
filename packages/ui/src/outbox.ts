/**
 * A small queue kept in the browser (IndexedDB) for work done without signal, to be sent later.
 * It holds whatever the app puts in `data`, including photos (Blobs). It never sends anything itself:
 * the app decides how to send each item and removes it once the server has it.
 * If the browser blocks IndexedDB the queue works in memory for the life of the page.
 */
export interface OutboxItem<T> {
  id: string;
  /** Who saved it, so a shared phone never sends one person's work as another's. */
  owner: string;
  createdAt: number;
  status: "pending" | "failed";
  error?: string;
  data: T;
}

export interface Outbox<T> {
  add(item: Omit<OutboxItem<T>, "createdAt" | "status"> & { status?: OutboxItem<T>["status"] }): Promise<void>;
  /** Items for one owner, oldest first. */
  list(owner: string): Promise<OutboxItem<T>[]>;
  update(id: string, patch: Partial<Pick<OutboxItem<T>, "status" | "error">>): Promise<void>;
  remove(id: string): Promise<void>;
  /** Called after any change in this tab or another. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
}

const STORE = "items";

export function createOutbox<T>(name: string): Outbox<T> {
  const memory = new Map<string, OutboxItem<T>>();
  const listeners = new Set<() => void>();
  let channel: BroadcastChannel | null = null;
  try { channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`outbox-${name}`) : null; } catch { channel = null; }
  channel?.addEventListener("message", () => listeners.forEach((fn) => fn()));
  const changed = () => { listeners.forEach((fn) => fn()); try { channel?.postMessage(1); } catch {} };

  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const db = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open(`uplif-outbox-${name}`, 1);
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

  return {
    async add(item) {
      const full: OutboxItem<T> = { status: "pending", ...item, createdAt: Date.now() };
      const ok = await run("readwrite", (s) => s.put(full)).then(() => true, () => false);
      if (!ok || !(await db())) memory.set(full.id, full);
      changed();
    },
    async list(owner) {
      const stored = (await run("readonly", (s) => s.getAll() as IDBRequest<OutboxItem<T>[]>).catch(() => undefined)) ?? [];
      const all = [...stored, ...memory.values()].filter((i) => i.owner === owner);
      return all.sort((a, b) => a.createdAt - b.createdAt);
    },
    async update(id, patch) {
      const cur = await run("readonly", (s) => s.get(id) as IDBRequest<OutboxItem<T> | undefined>).catch(() => undefined);
      if (cur) await run("readwrite", (s) => s.put({ ...cur, ...patch })).catch(() => undefined);
      const m = memory.get(id);
      if (m) memory.set(id, { ...m, ...patch });
      changed();
    },
    async remove(id) {
      await run("readwrite", (s) => s.delete(id)).catch(() => undefined);
      memory.delete(id);
      changed();
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
