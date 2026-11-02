/**
 * Local draft images (5A).
 *
 * A generated image has nowhere public to live until image hosting exists, so
 * it is kept here and the design carries only an id. Three rules follow from
 * that and are enforced by this module plus the export boundary:
 *
 *   - bytes go in IndexedDB, never localStorage (quota) and never the design
 *   - the design, saved blocks and every JSON export carry `aiDraftId` only
 *   - a draft is local to one browser, so a missing one is a normal state,
 *     not a crash: `get()` answers null and the canvas and Checks say so
 *
 * The store is injectable for the same reason `probeImage` is: jsdom has no
 * IndexedDB, so the tests run against the in-memory implementation and the
 * real one is exercised in the browser pass.
 */

import { uid } from './util';

export interface DraftImage {
  id: string;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  /** what produced it, kept for "Edit prompt" and the alt suggestion */
  prompt: string;
  alt: string;
  model: string;
  createdAt: number;
}

export interface DraftStore {
  get(id: string): Promise<DraftImage | null>;
  put(draft: DraftImage): Promise<void>;
  remove(id: string): Promise<void>;
  /** ids currently held, for the canvas to resolve in one pass */
  keys(): Promise<string[]>;
}

export const newDraftId = () => uid('aidraft');

/* ------------------------------------------------------------- in-memory */

export function memoryDraftStore(): DraftStore {
  const map = new Map<string, DraftImage>();
  return {
    async get(id) {
      return map.get(id) ?? null;
    },
    async put(draft) {
      map.set(draft.id, draft);
    },
    async remove(id) {
      map.delete(id);
    },
    async keys() {
      return [...map.keys()];
    },
  };
}

/* ------------------------------------------------------------ IndexedDB */

const DB_NAME = 'email-builder-drafts';
const DB_VERSION = 1;
const STORE = 'images';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export function indexedDbDraftStore(): DraftStore {
  return {
    async get(id) {
      try {
        const row = await tx<DraftImage | undefined>('readonly', (s) => s.get(id));
        return row ?? null;
      } catch {
        // private mode, blocked storage, a wiped database — all "no draft"
        return null;
      }
    },
    async put(draft) {
      await tx('readwrite', (s) => s.put(draft) as IDBRequest<IDBValidKey>);
    },
    async remove(id) {
      try {
        await tx('readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>);
      } catch {
        // nothing to do; a draft that cannot be removed is already unreachable
      }
    },
    async keys() {
      try {
        const rows = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
        return rows.map(String);
      } catch {
        return [];
      }
    },
  };
}

/**
 * The store the app uses. Swapped in tests, exactly as 2C-1 swaps
 * `imageStorage`.
 */
export const draftStore: DraftStore =
  typeof indexedDB === 'undefined' ? memoryDraftStore() : indexedDbDraftStore();
