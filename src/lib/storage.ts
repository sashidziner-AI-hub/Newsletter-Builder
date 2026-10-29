import type { Brand, Design } from '../types';
import { normalizeBrand, veeBrand } from './brand';
import { normalizeDesign } from './design-ops';
import { uid } from './util';

const DRAFT_KEY = 'email-builder:draft:v1';
const TEMPLATES_KEY = 'email-builder:templates:v1';
const BRANDS_KEY = 'email-builder:brands:v1';
const SAMPLE_KEY = 'email-builder:sample:v1';

export interface SavedTemplate {
  id: string;
  name: string;
  updatedAt: number;
  /** mirrors design.brandId; null for templates saved before brands existed */
  brandId: string | null;
  design: Design;
  /** nullable today; becomes a user reference when accounts exist */
  createdBy: string | null;
  updatedBy: string | null;
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

export function loadDraft(): Design | null {
  return normalizeDesign(read<unknown>(DRAFT_KEY));
}

export function saveDraft(design: Design): boolean {
  return write(DRAFT_KEY, design);
}

export function listTemplates(): SavedTemplate[] {
  const raw = read<SavedTemplate[]>(TEMPLATES_KEY);
  if (!Array.isArray(raw)) return [];
  const out: SavedTemplate[] = [];
  for (const t of raw) {
    const design = normalizeDesign(t?.design);
    if (design && typeof t.id === 'string') {
      out.push({
        id: t.id,
        name: typeof t.name === 'string' ? t.name : 'Untitled',
        updatedAt: Number(t.updatedAt) || 0,
        brandId: design.brandId,
        design,
        createdBy: typeof t.createdBy === 'string' ? t.createdBy : null,
        updatedBy: typeof t.updatedBy === 'string' ? t.updatedBy : null,
      });
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveTemplate(name: string, design: Design, existingId?: string): SavedTemplate | null {
  const list = listTemplates();
  const previous = existingId ? list.find((t) => t.id === existingId) : undefined;
  const entry: SavedTemplate = {
    id: existingId ?? uid('tpl'),
    name: name.trim() || 'Untitled',
    updatedAt: Date.now(),
    brandId: design.brandId,
    design,
    createdBy: previous?.createdBy ?? null,
    updatedBy: null,
  };
  const next = [entry, ...list.filter((t) => t.id !== entry.id)];
  return write(TEMPLATES_KEY, next) ? entry : null;
}

export function deleteTemplate(id: string): void {
  write(
    TEMPLATES_KEY,
    listTemplates().filter((t) => t.id !== id),
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
