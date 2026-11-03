/**
 * Where the provider API keys live (5A, extended).
 *
 * One key **per provider**, plus which provider is active. Keys default to
 * module memory and die with the tab; "Remember on this device" is opt-in and
 * per provider, so remembering OpenAI does not quietly remember another.
 *
 * Everything persists under ONE storage key, so there is exactly one place to
 * look for a secret and one thing a full wipe has to clear.
 *
 * The keys are deliberately not in the zustand store. Everything in that store
 * is a candidate for serialisation — designs, brands, saved blocks, version
 * snapshots all round-trip through JSON — and a key that is never in the store
 * cannot be written out by a future feature that forgets this rule exists.
 */

import { writeSafe } from '../storage';

/** The only key this module writes. v1 held a single provider's key. */
const KEYS_STORAGE = 'email-builder:aikeys:v2';
const LEGACY_STORAGE = 'email-builder:aikey:v1';
const KEY_SCHEMA = 2;

interface StoredEntry {
  model: string;
  key: string;
}

interface StoredKeys {
  activeProviderId: string;
  byProvider: Record<string, StoredEntry>;
  schemaVersion: number;
}

/** Session keys, by provider id. Not exported: reads go through the functions. */
const memory = new Map<string, StoredEntry>();
/** The active provider for this session, which may differ from the stored one. */
let activeId: string | null = null;
let migrated = false;

export interface KeyRecord {
  providerId: string;
  model: string;
  key: string;
  /** true when this provider's key is also on disk */
  remembered: boolean;
}

export type ProviderStatus = 'not-configured' | 'configured' | 'connected';

/** Providers whose key has passed Test connection this session. */
const connected = new Set<string>();

/* ----------------------------------------------------------------- storage */

function readStored(): StoredKeys {
  try {
    const raw = localStorage.getItem(KEYS_STORAGE);
    if (!raw) return { activeProviderId: '', byProvider: {}, schemaVersion: KEY_SCHEMA };
    const parsed = JSON.parse(raw) as Partial<StoredKeys>;
    const byProvider: Record<string, StoredEntry> = {};
    for (const [id, entry] of Object.entries(parsed?.byProvider ?? {})) {
      const e = entry as Partial<StoredEntry>;
      if (typeof e?.key === 'string' && e.key) {
        byProvider[id] = { model: typeof e.model === 'string' ? e.model : '', key: e.key };
      }
    }
    return {
      activeProviderId:
        typeof parsed?.activeProviderId === 'string' ? parsed.activeProviderId : '',
      byProvider,
      schemaVersion: Number(parsed?.schemaVersion) || 1,
    };
  } catch {
    return { activeProviderId: '', byProvider: {}, schemaVersion: KEY_SCHEMA };
  }
}

function writeStored(next: StoredKeys): 'ok' | 'full' {
  const hasAny = Object.keys(next.byProvider).length > 0;
  if (!hasAny) {
    // nothing remembered: remove the record rather than leaving an empty husk
    try {
      localStorage.removeItem(KEYS_STORAGE);
    } catch {
      // a browser that will not let us remove it did not let us write it
    }
    return 'ok';
  }
  return writeSafe(KEYS_STORAGE, { ...next, schemaVersion: KEY_SCHEMA }) === 'full' ? 'full' : 'ok';
}

/**
 * Fold a v1 record into the new shape, once.
 *
 * A key saved before this change was stored globally with its provider id
 * beside it, so it migrates cleanly into that provider's slot and the old
 * record is removed. Somebody who had configured OpenAI keeps working.
 */
function migrateLegacy(): void {
  if (migrated) return;
  migrated = true;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE);
    if (!raw) return;
    const old = JSON.parse(raw) as { providerId?: string; model?: string; key?: string };
    if (typeof old?.key === 'string' && old.key) {
      const id = typeof old.providerId === 'string' && old.providerId ? old.providerId : 'openai';
      const next = readStored();
      if (!next.byProvider[id]) {
        next.byProvider[id] = { model: typeof old.model === 'string' ? old.model : '', key: old.key };
        if (!next.activeProviderId) next.activeProviderId = id;
        writeStored(next);
      }
    }
    localStorage.removeItem(LEGACY_STORAGE);
  } catch {
    // an unreadable legacy record is not worth failing startup over
  }
}

/* ------------------------------------------------------------------ reading */

/** One provider's key, from memory first and storage second. */
export function loadKey(providerId: string): KeyRecord | null {
  if (!providerId) return null;
  migrateLegacy();

  const inMemory = memory.get(providerId);
  const stored = readStored().byProvider[providerId];
  const entry = inMemory ?? stored;
  if (!entry) return null;

  // promote so the rest of the session does not re-read storage
  if (!inMemory && stored) memory.set(providerId, { ...stored });
  return { providerId, model: entry.model, key: entry.key, remembered: !!stored };
}

export function hasKey(providerId: string): boolean {
  return loadKey(providerId) !== null;
}

export function isRemembered(providerId: string): boolean {
  migrateLegacy();
  return !!readStored().byProvider[providerId];
}

/**
 * What the settings list shows. `connected` only ever comes from a passing
 * Test connection this session — a remembered key is "configured" until proven.
 */
export function statusOf(providerId: string): ProviderStatus {
  if (!hasKey(providerId)) return 'not-configured';
  return connected.has(providerId) ? 'connected' : 'configured';
}

export function markConnected(providerId: string, ok: boolean): void {
  if (ok) connected.add(providerId);
  else connected.delete(providerId);
}

export function isConnected(providerId: string): boolean {
  return connected.has(providerId);
}

/* ------------------------------------------------------------------ writing */

/**
 * Save one provider's key. `remember: false` also clears any stored copy for
 * that provider, so unticking the box is not a no-op — and it leaves every
 * other provider's stored key alone.
 */
export function saveKey(
  providerId: string,
  model: string,
  key: string,
  remember: boolean,
): 'ok' | 'full' {
  migrateLegacy();
  const entry: StoredEntry = { model, key: key.trim() };
  memory.set(providerId, entry);

  const next = readStored();
  if (remember) next.byProvider[providerId] = entry;
  else delete next.byProvider[providerId];

  // The first key configured becomes the active one. This has to happen in
  // memory as well as on disk: a key saved WITHOUT "Remember" persists nothing,
  // so relying on the stored pointer alone would leave no provider active and
  // the composer permanently locked.
  if (!activeId && !next.activeProviderId) activeId = providerId;
  if (!next.activeProviderId) next.activeProviderId = providerId;
  return writeStored(next);
}

/** Update the chosen model without re-entering the key. */
export function setModel(providerId: string, model: string): void {
  const inMemory = memory.get(providerId);
  if (inMemory) memory.set(providerId, { ...inMemory, model });

  const next = readStored();
  if (next.byProvider[providerId]) {
    next.byProvider[providerId] = { ...next.byProvider[providerId], model };
    writeStored(next);
  }
}

/** Remove one provider's key from memory and from disk. */
export function clearKey(providerId: string): void {
  memory.delete(providerId);
  connected.delete(providerId);
  const next = readStored();
  delete next.byProvider[providerId];
  if (next.activeProviderId === providerId) next.activeProviderId = '';
  writeStored(next);
  if (activeId === providerId) activeId = null;
}

/** Wipe everything. Used by tests and by a future "forget all keys". */
export function clearAllKeys(): void {
  memory.clear();
  connected.clear();
  activeId = null;
  migrated = false;
  try {
    localStorage.removeItem(KEYS_STORAGE);
    localStorage.removeItem(LEGACY_STORAGE);
  } catch {
    // nothing we can do, and nothing was written if this throws
  }
}

/* ------------------------------------------------------------------- active */

/** The active provider id, remembered across reloads. */
export function activeProvider(): string | null {
  migrateLegacy();
  if (activeId) return activeId;
  const stored = readStored().activeProviderId;
  if (stored) {
    activeId = stored;
    return activeId;
  }
  return null;
}

export function setActiveProvider(providerId: string): void {
  activeId = providerId;
  const next = readStored();
  next.activeProviderId = providerId;
  // only persist when something is actually remembered; otherwise the choice
  // is a session one, like the keys it points at
  if (Object.keys(next.byProvider).length > 0) writeStored(next);
}

/* -------------------------------------------------------------------- misc */

/** For tests: the storage keys, so a sweep can prove nothing else holds one. */
export const AI_KEYS_STORAGE_KEY = KEYS_STORAGE;
export const AI_LEGACY_STORAGE_KEY = LEGACY_STORAGE;

/**
 * A key, masked for display. Used by nothing that writes to disk — the settings
 * view shows this instead of rendering the value into an input it controls.
 */
export function maskKey(key: string): string {
  const k = (key || '').trim();
  if (k.length <= 8) return '•'.repeat(Math.max(4, k.length));
  return `${k.slice(0, 3)}${'•'.repeat(12)}${k.slice(-4)}`;
}
