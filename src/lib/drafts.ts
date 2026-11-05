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

/* ------------------------------------------------------------ data URIs */

/**
 * Draft bytes as a `data:` URI, for the canvas and the preview only.
 *
 * It has to be `data:` rather than an object URL, for two independent reasons:
 * `safeUrl()` refuses every scheme but http(s), merge tags and `data:image`,
 * and DOMPurify strips `blob:` from an `img src`. The preview adds a third —
 * its iframe is sandboxed without `allow-same-origin`, so a parent-origin
 * `blob:` could never load inside it.
 *
 * Converted once per draft and cached, because the base64 of a 1024px PNG is a
 * couple of megabytes of string and the canvas re-renders on every edit.
 */
const dataUrlCache = new Map<string, string>();

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** The cached data URI for a draft, converting on first use. */
export async function draftDataUrl(id: string): Promise<string | null> {
  const cached = dataUrlCache.get(id);
  if (cached) return cached;
  const draft = await draftStore.get(id);
  if (!draft) return null;
  const url = await blobToDataUrl(draft.blob);
  dataUrlCache.set(id, url);
  return url;
}

/** Drop a converted draft, so removing one frees its megabytes. */
export function forgetDraftDataUrl(id: string): void {
  dataUrlCache.delete(id);
}

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
      forgetDraftDataUrl(id);
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
      forgetDraftDataUrl(id);
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
