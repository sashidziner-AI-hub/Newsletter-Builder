/**
 * Local "who's using this" identity (7A) — no login, no roles, an internal
 * tool's substitute for an account. `getCurrentUser()` is what `createdBy`/
 * `updatedBy` on a saved email or brand actually read; nothing else consumes
 * it, and it is never sent anywhere.
 *
 * Deliberately does not import `writeSafe` from `storage.ts`: `storage.ts`
 * itself calls `getCurrentUser()` for `createdBy`/`updatedBy`, and a two-way
 * import between the two would be a real circular dependency, not just a
 * theoretical one. A profile record is a few dozen bytes, so the quota
 * pruning `writeSafe` exists for is not worth that cycle here.
 */

const STORAGE_KEY = 'email-builder:profile:v1';
const SCHEMA_VERSION = 1;

export const DEFAULT_DISPLAY_NAME = 'Guest';
export const DISPLAY_NAME_MAX = 40;

export interface CurrentUser {
  name: string;
}

interface StoredProfile {
  name: string;
  /** the one-time "set your name" hint has been shown already */
  hintShown: boolean;
}

function readStored(): StoredProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { name: DEFAULT_DISPLAY_NAME, hintShown: false };
    const parsed = JSON.parse(raw) as Partial<StoredProfile>;
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
    return { name: name || DEFAULT_DISPLAY_NAME, hintShown: parsed?.hintShown === true };
  } catch {
    return { name: DEFAULT_DISPLAY_NAME, hintShown: false };
  }
}

function writeStored(next: StoredProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, schemaVersion: SCHEMA_VERSION }));
  } catch {
    // storage full or unavailable; the in-memory default still works for this session
  }
}

export function getCurrentUser(): CurrentUser {
  return { name: readStored().name };
}

/** Plain text, trimmed, capped at DISPLAY_NAME_MAX. An empty name resets to the default. */
export function setDisplayName(name: string): void {
  const trimmed = name.trim().slice(0, DISPLAY_NAME_MAX);
  writeStored({ ...readStored(), name: trimmed || DEFAULT_DISPLAY_NAME });
}

/**
 * True exactly once: the first time this is called while the name is still
 * the default, it also marks the hint shown, so a later reload never shows it
 * again regardless of whether the name was ever changed.
 */
export function shouldShowNameHint(): boolean {
  const stored = readStored();
  if (stored.name !== DEFAULT_DISPLAY_NAME || stored.hintShown) return false;
  writeStored({ ...stored, hintShown: true });
  return true;
}

export const PROFILE_STORAGE_KEY = STORAGE_KEY;

/* --------------------------------------------------------------- avatar */

/** A small, deterministic hash — the same name always gets the same colour. */
function hashHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return Math.abs(hash) % 360;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Fixed 38% lightness at 60% saturation reads as a mid-to-dark swatch across
 * the whole hue wheel, which is what keeps white initials readable regardless
 * of which hue a given name happens to hash to.
 */
export function avatarColor(name: string): string {
  return `hsl(${hashHue(name)}, 60%, 38%)`;
}
