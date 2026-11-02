/**
 * Where the provider API key lives (5A).
 *
 * Default is module memory: it dies with the tab, which is the behaviour the
 * setup panel promises. "Remember on this device" is opt-in and writes to ONE
 * dedicated localStorage key, so there is exactly one place to look for it and
 * exactly one thing for "Remove key" to clear.
 *
 * The key is deliberately not in the zustand store. Everything in that store
 * is a candidate for serialisation — designs, brands, saved blocks, version
 * snapshots all round-trip through JSON — and a key that is never in the store
 * cannot be written out by a future feature that forgets this rule exists.
 */

import { writeSafe } from '../storage';

/** The only key this module ever touches. */
const KEY_STORAGE = 'email-builder:aikey:v1';
const KEY_SCHEMA = 1;

interface StoredKey {
  providerId: string;
  model: string;
  key: string;
  schemaVersion: number;
}

/** Session state. Not exported: every read goes through the functions below. */
let memory: { providerId: string; model: string; key: string } | null = null;

export interface KeyRecord {
  providerId: string;
  model: string;
  key: string;
  /** true when this came from localStorage rather than memory */
  remembered: boolean;
}

function readStored(): StoredKey | null {
  try {
    const raw = localStorage.getItem(KEY_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredKey>;
    if (typeof parsed?.key !== 'string' || !parsed.key) return null;
    return {
      providerId: typeof parsed.providerId === 'string' ? parsed.providerId : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      key: parsed.key,
      schemaVersion: Number(parsed.schemaVersion) || 1,
    };
  } catch {
    return null;
  }
}

/** The configured key, from memory first and storage second. */
export function loadKey(): KeyRecord | null {
  if (memory) return { ...memory, remembered: false };
  const stored = readStored();
  if (!stored) return null;
  // promote into memory so the rest of the session does not re-read storage
  memory = { providerId: stored.providerId, model: stored.model, key: stored.key };
  return { ...memory, remembered: true };
}

/** Is a key configured at all? Safe to call from render; returns no secret. */
export function hasKey(): boolean {
  return loadKey() !== null;
}

/**
 * Save for this session, and to this device only when asked. Passing
 * `remember: false` after a remembered save also clears the stored copy, so
 * unticking the box is not a no-op.
 */
export function saveKey(
  providerId: string,
  model: string,
  key: string,
  remember: boolean,
): 'ok' | 'full' {
  memory = { providerId, model, key: key.trim() };
  if (!remember) {
    clearStored();
    return 'ok';
  }
  const record: StoredKey = { providerId, model, key: key.trim(), schemaVersion: KEY_SCHEMA };
  return writeSafe(KEY_STORAGE, record) === 'full' ? 'full' : 'ok';
}

/** Update the chosen model without re-entering the key. */
export function setModel(model: string): void {
  if (memory) memory.model = model;
  const stored = readStored();
  if (stored) writeSafe(KEY_STORAGE, { ...stored, model });
}

export function isRemembered(): boolean {
  return readStored() !== null;
}

function clearStored(): void {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    // a browser that will not let us remove it will not have let us write it
  }
}

/** Remove the key everywhere it could be. */
export function clearKey(): void {
  memory = null;
  clearStored();
}

/**
 * For tests only: the storage key, so a test can assert nothing else holds a
 * key and that every export is clean.
 */
export const AI_KEY_STORAGE_KEY = KEY_STORAGE;

/**
 * A key, masked for display. Used by nothing that writes to disk — the setup
 * panel shows this instead of re-rendering the value into an input it controls.
 */
export function maskKey(key: string): string {
  const k = (key || '').trim();
  if (k.length <= 8) return '•'.repeat(Math.max(4, k.length));
  return `${k.slice(0, 3)}${'•'.repeat(12)}${k.slice(-4)}`;
}
