/**
 * Full local-data backup/restore (7A) — brands, emails, saved blocks, the
 * image library, and version history, as one JSON object.
 *
 * Deliberately excludes two things the Data & storage section must never
 * export: the AI key store (`email-builder:aikeys:v2` / the legacy `:v1`)
 * and anything drafts-related (IndexedDB image bytes, `ai-text-consent`).
 * This file never imports `key-store.ts` or `drafts.ts` at all, so there is
 * no code path here that could accidentally reach either.
 */

import type { Brand } from '../types';
import type { SavedBlock } from './blocks-library';
import { normalizeSavedBlock } from './blocks-library';
import { normalizeDesign } from './design-ops';
import type { LibraryImage } from './image-storage';
import { normalizeLibraryImage } from './image-storage';
import { normalizeBrand } from './brand';
import {
  type SavedTemplate,
  type WriteResult,
  listBrands,
  listImages,
  listSavedBlocks,
  listTemplates,
  listVersions,
  normalizeTemplate,
  saveBrands,
  saveImages,
  saveSavedBlocks,
  saveTemplates,
  saveVersions,
} from './storage';
import { normalizeVersion, type VersionRecord } from './versions';

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupData {
  schemaVersion: number;
  exportedAt: number;
  brands: Brand[];
  templates: SavedTemplate[];
  savedBlocks: SavedBlock[];
  images: LibraryImage[];
  versions: VersionRecord[];
}

export function exportBackup(): BackupData {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    brands: listBrands(),
    templates: listTemplates(),
    savedBlocks: listSavedBlocks(),
    images: listImages(),
    versions: listVersions(),
  };
}

export interface BackupSummary {
  brands: number;
  templates: number;
  savedBlocks: number;
  images: number;
  versions: number;
}

export function summarizeBackup(data: BackupData): BackupSummary {
  return {
    brands: data.brands.length,
    templates: data.templates.length,
    savedBlocks: data.savedBlocks.length,
    images: data.images.length,
    versions: data.versions.length,
  };
}

export type ValidateResult = { ok: true; data: BackupData } | { ok: false; reason: string };

const LIST_FIELDS = ['brands', 'templates', 'savedBlocks', 'images', 'versions'] as const;

/**
 * Shape-check, then normalize every record through the same readers a normal
 * app load uses — a malformed individual brand/template/etc. is dropped
 * rather than failing the whole import, exactly like a corrupt localStorage
 * record already behaves today.
 */
export function validateBackupShape(raw: unknown): ValidateResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'The file is not a JSON object.' };
  const r = raw as Record<string, unknown>;
  for (const field of LIST_FIELDS) {
    if (!Array.isArray(r[field])) return { ok: false, reason: `Missing or invalid "${field}" list.` };
  }

  const brands = (r.brands as unknown[]).map(normalizeBrand).filter((b): b is Brand => !!b);
  const templates = (r.templates as unknown[]).map(normalizeTemplate).filter((t): t is SavedTemplate => !!t);
  const savedBlocks = (r.savedBlocks as unknown[])
    .map(normalizeSavedBlock)
    .filter((b): b is SavedBlock => !!b);
  const images = (r.images as unknown[]).map(normalizeLibraryImage).filter((i): i is LibraryImage => !!i);
  const versions = (r.versions as unknown[])
    .map((v) => normalizeVersion(v, normalizeDesign))
    .filter((v): v is VersionRecord => !!v);

  if (brands.length === 0 && templates.length === 0 && savedBlocks.length === 0 && images.length === 0) {
    return { ok: false, reason: 'The file has no recognizable brands, emails, saved blocks, or images.' };
  }

  return {
    ok: true,
    data: { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: Number(r.exportedAt) || 0, brands, templates, savedBlocks, images, versions },
  };
}

/** Overwrites every category this backup covers. Call only after the caller has confirmed with the user. */
export function importBackup(data: BackupData): WriteResult {
  const results = [
    saveBrands(data.brands) ? 'ok' : 'full',
    saveTemplates(data.templates),
    saveSavedBlocks(data.savedBlocks),
    saveImages(data.images),
    saveVersions(data.versions),
  ];
  return results.includes('full') ? 'full' : 'ok';
}
