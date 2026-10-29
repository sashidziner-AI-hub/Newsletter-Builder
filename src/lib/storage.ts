import type { Brand, Design } from '../types';
import { normalizeBrand, veeBrand } from './brand';
import { type SavedBlock, normalizeSavedBlock } from './blocks-library';
import { normalizeDesign } from './design-ops';
import { uid } from './util';
import {
  type SnapshotReason,
  type VersionRecord,
  normalizeVersion,
  pruneOldestGlobal,
  pruneToCap,
  summarise,
} from './versions';

const DRAFT_KEY = 'email-builder:draft:v1';
const TEMPLATES_KEY = 'email-builder:templates:v1';
const BRANDS_KEY = 'email-builder:brands:v1';
const SAMPLE_KEY = 'email-builder:sample:v1';
const BLOCKS_KEY = 'email-builder:blocks:v1';
const VERSIONS_KEY = 'email-builder:versions:v1';
const SESSION_KEY = 'email-builder:session:v1';

/**
 * Stamped on every record this module writes. Records without it were written
 * before 2B and are read as version 1 — nothing is discarded for being old.
 */
export const SCHEMA_VERSION = 2;

/** localStorage is about 5 MB per origin in every browser that matters. */
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

export interface SavedTemplate {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  /** mirrors design.brandId; null for templates saved before brands existed */
  brandId: string | null;
  design: Design;
  /**
   * true while this record exists only because auto-save created it. Naming it
   * promotes it to a template. Records written before 2B have no flag and are
   * read as named templates, so an existing list is undisturbed.
   */
  autoSaved: boolean;
  /** nullable today; becomes a user reference when accounts exist */
  createdBy: string | null;
  updatedBy: string | null;
  schemaVersion: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or unavailable (e.g. private mode)
  }
}

export type WriteResult = 'ok' | 'pruned' | 'full';

/** How many old versions to drop on the first quota failure. */
const QUOTA_PRUNE_COUNT = 10;

/**
 * The only writer anything outside this module should use.
 *
 * On a quota failure it frees space by dropping the oldest versions across every
 * email, retries once, and only then admits defeat. Callers get a result they
 * can show the user — nothing fails silently.
 */
export function writeSafe(key: string, value: unknown): WriteResult {
  if (write(key, value)) return 'ok';

  // make room: version history is the largest and most expendable thing here
  const versions = listVersions();
  if (versions.length > 0) {
    const kept = pruneOldestGlobal(versions, QUOTA_PRUNE_COUNT);
    if (kept.length < versions.length && write(VERSIONS_KEY, kept) && write(key, value)) {
      return 'pruned';
    }
  }
  return 'full';
}

/** Approximate bytes this app occupies, for the usage readout. */
export function storageUsage(): { bytes: number; limit: number } {
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('email-builder:')) continue;
      // UTF-16 code units, which is what the quota is actually counted in
      bytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
    }
  } catch {
    return { bytes: 0, limit: STORAGE_LIMIT_BYTES };
  }
  return { bytes, limit: STORAGE_LIMIT_BYTES };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function loadDraft(): Design | null {
  return normalizeDesign(read<unknown>(DRAFT_KEY));
}

export function saveDraft(design: Design): boolean {
  return write(DRAFT_KEY, design);
}

export function listTemplates(): SavedTemplate[] {
  const raw = read<Record<string, unknown>[]>(TEMPLATES_KEY);
  if (!Array.isArray(raw)) return [];
  const out: SavedTemplate[] = [];
  for (const t of raw) {
    const design = normalizeDesign(t?.design);
    if (design && typeof t.id === 'string') {
      const updatedAt = Number(t.updatedAt) || 0;
      out.push({
        id: t.id,
        name: typeof t.name === 'string' ? t.name : 'Untitled',
        updatedAt,
        createdAt: Number(t.createdAt) || updatedAt,
        brandId: design.brandId,
        design,
        // absent on pre-2B records, which were all saved on purpose
        autoSaved: t.autoSaved === true,
        createdBy: typeof t.createdBy === 'string' ? t.createdBy : null,
        updatedBy: typeof t.updatedBy === 'string' ? t.updatedBy : null,
        schemaVersion: Number(t.schemaVersion) || 1,
      });
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function findTemplate(id: string | null): SavedTemplate | null {
  if (!id) return null;
  return listTemplates().find((t) => t.id === id) ?? null;
}

function putTemplate(entry: SavedTemplate): { entry: SavedTemplate; result: WriteResult } {
  const list = listTemplates();
  const next = [entry, ...list.filter((t) => t.id !== entry.id)];
  return { entry, result: writeSafe(TEMPLATES_KEY, next) };
}

export interface SaveOptions {
  /** update this record instead of creating one */
  existingId?: string;
  /** false marks the record as a deliberate save rather than an auto-save */
  autoSaved?: boolean;
  name?: string;
}

/**
 * Write the open email. Creates the record when there is no `existingId`, which
 * is how auto-save brings a brand-new email into existence on the first edit.
 */
export function saveEmail(
  design: Design,
  opts: SaveOptions = {},
): { entry: SavedTemplate; result: WriteResult } {
  const list = listTemplates();
  const previous = opts.existingId ? list.find((t) => t.id === opts.existingId) : undefined;
  const now = Date.now();
  const entry: SavedTemplate = {
    id: previous?.id ?? opts.existingId ?? uid('tpl'),
    name: (opts.name ?? previous?.name ?? design.body.title ?? 'Untitled').trim() || 'Untitled',
    updatedAt: now,
    createdAt: previous?.createdAt ?? now,
    brandId: design.brandId,
    design,
    autoSaved: opts.autoSaved ?? previous?.autoSaved ?? true,
    createdBy: previous?.createdBy ?? null,
    updatedBy: null,
    schemaVersion: SCHEMA_VERSION,
  };
  return putTemplate(entry);
}

/** Kept for the older call sites: a deliberate, named save. */
export function saveTemplate(name: string, design: Design, existingId?: string): SavedTemplate | null {
  const { entry, result } = saveEmail(design, { existingId, name, autoSaved: false });
  return result === 'full' ? null : entry;
}

/** Name an auto-saved record, promoting it out of the drafts group. */
export function renameTemplate(id: string, name: string): SavedTemplate | null {
  const existing = findTemplate(id);
  if (!existing) return null;
  const entry: SavedTemplate = {
    ...existing,
    name: name.trim() || existing.name,
    autoSaved: false,
    updatedAt: Date.now(),
    schemaVersion: SCHEMA_VERSION,
  };
  const { result } = putTemplate(entry);
  return result === 'full' ? null : entry;
}

/** A new record with a new id, for "Save as a copy". */
export function duplicateTemplate(design: Design, name: string): SavedTemplate | null {
  const { entry, result } = saveEmail(design, { name, autoSaved: false });
  return result === 'full' ? null : entry;
}

export function deleteTemplate(id: string): void {
  writeSafe(
    TEMPLATES_KEY,
    listTemplates().filter((t) => t.id !== id),
  );
  // its history goes with it
  writeSafe(
    VERSIONS_KEY,
    listVersions().filter((v) => v.emailId !== id),
  );
}

/* -------------------------------------------------------------------- brands */

/**
 * The brand list, seeded with Vee Technologies the first time the app runs.
 * Archived brands are kept here (is_active: false) and filtered out by
 * `getAccessibleBrands()`, so a design pointing at one still resolves.
 */
export function listBrands(): Brand[] {
  const raw = read<unknown[]>(BRANDS_KEY);
  const out: Brand[] = [];
  if (Array.isArray(raw)) {
    for (const b of raw) {
      const brand = normalizeBrand(b);
      if (brand) out.push(brand);
    }
  }
  if (out.length === 0) {
    const seeded = [veeBrand()];
    write(BRANDS_KEY, seeded);
    return seeded;
  }
  return out;
}

export function saveBrands(brands: Brand[]): boolean {
  return write(BRANDS_KEY, brands);
}

/* -------------------------------------------------------------- sample data */

/**
 * Merge-tag sample values for the editor's preview toggle. Deliberately kept
 * out of the design: they are a per-user convenience and must never reach an
 * export or a saved template.
 */
export function loadSampleData(): Record<string, string> | null {
  const raw = read<Record<string, unknown>>(SAMPLE_KEY);
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export function saveSampleData(values: Record<string, string>): boolean {
  return write(SAMPLE_KEY, values);
}

/* ------------------------------------------------------------ saved blocks */

export function listSavedBlocks(): SavedBlock[] {
  const raw = read<unknown[]>(BLOCKS_KEY);
  const out: SavedBlock[] = [];
  if (Array.isArray(raw)) {
    for (const b of raw) {
      const block = normalizeSavedBlock(b);
      if (block) out.push(block);
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveSavedBlocks(blocks: SavedBlock[]): WriteResult {
  return writeSafe(BLOCKS_KEY, blocks);
}

/* ---------------------------------------------------------------- versions */

export function listVersions(): VersionRecord[] {
  const raw = read<unknown[]>(VERSIONS_KEY);
  const out: VersionRecord[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      const record = normalizeVersion(v, normalizeDesign);
      if (record) out.push(record);
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Append a snapshot and prune to the per-email cap. The caller decides *whether*
 * to snapshot (see `shouldSnapshot`); this just stores it.
 */
export function addVersion(
  emailId: string,
  design: Design,
  reason: SnapshotReason,
  note = '',
): { record: VersionRecord; result: WriteResult } {
  const summary = summarise(design);
  const record: VersionRecord = {
    id: uid('ver'),
    emailId,
    at: Date.now(),
    note: note.trim(),
    reason,
    rows: summary.rows,
    blocks: summary.blocks,
    design,
    schemaVersion: SCHEMA_VERSION,
  };
  const next = pruneToCap([record, ...listVersions()]);
  return { record, result: writeSafe(VERSIONS_KEY, next) };
}

export function deleteVersions(emailId: string): void {
  writeSafe(
    VERSIONS_KEY,
    listVersions().filter((v) => v.emailId !== emailId),
  );
}

/* ----------------------------------------------------------------- session */

/** Which email to reopen on the next load. */
export function loadLastEmailId(): string | null {
  const raw = read<{ lastEmailId?: unknown }>(SESSION_KEY);
  return typeof raw?.lastEmailId === 'string' ? raw.lastEmailId : null;
}

export function saveLastEmailId(id: string | null): void {
  writeSafe(SESSION_KEY, { lastEmailId: id, schemaVersion: SCHEMA_VERSION });
}

/* --------------------------------------------------------------- migration */

/**
 * Before 2B the open email lived in a single unnamed draft slot. Move it into a
 * real auto-saved record once, then drop the old key so it cannot come back as a
 * duplicate on the next load.
 */
export function migrateDraft(): SavedTemplate | null {
  const design = loadDraft();
  if (!design) return null;

  const { entry, result } = saveEmail(design, {
    name: design.body.title?.trim() || 'Recovered draft',
    autoSaved: true,
  });
  if (result === 'full') return null;

  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // leaving the key behind is harmless: the record now exists either way
  }
  return entry;
}
