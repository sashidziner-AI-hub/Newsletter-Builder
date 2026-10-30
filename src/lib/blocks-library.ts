import type { Block, BlockType, Row } from '../types';
import { BLOCK_META, cloneWithNewIds, createRow } from './defaults';
import { normalizeDesign } from './design-ops';
import { slugify, uid } from './util';

/**
 * The saved-block library.
 *
 * A saved item keeps the design exactly as it was built — `brand.*` tokens stay
 * tokens, so the block re-themes with whichever brand is active, and hex
 * overrides stay hex. Inserting always goes through `cloneWithNewIds()`, so the
 * copy on the canvas can never alias the stored original.
 */

export interface SavedBlock {
  id: string;
  name: string;
  /** free text; '' groups under "Uncategorised" */
  category: string;
  kind: 'block' | 'row';
  /** a Block for kind 'block', a Row for kind 'row' */
  payload: Block | Row;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export const SAVED_BLOCK_SCHEMA = 2;
export const UNCATEGORISED = 'Uncategorised';

export function makeSavedBlock(
  name: string,
  category: string,
  kind: 'block' | 'row',
  payload: Block | Row,
): SavedBlock {
  const now = Date.now();
  return {
    id: uid('sb'),
    name: name.trim() || 'Untitled block',
    category: category.trim(),
    kind,
    // snapshot it, so later edits to the canvas cannot reach the library
    payload: JSON.parse(JSON.stringify(payload)) as Block | Row,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SAVED_BLOCK_SCHEMA,
  };
}

/** A fresh copy, with every id regenerated. */
export function instantiate(saved: SavedBlock): Block | Row {
  return cloneWithNewIds(saved.payload);
}

/**
 * Data URIs do not survive most inboxes, so warn before a block carrying one is
 * stored and handed to someone else.
 */
export function hasDataUri(payload: Block | Row): boolean {
  return /"data:image\//.test(JSON.stringify(payload));
}

const VALID_TYPES = new Set<string>(BLOCK_META.map((m) => m.type));

/** Is this a Block the app still understands? */
function validBlock(value: unknown): Block | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.type !== 'string' || !VALID_TYPES.has(raw.type)) return null;
  // reuse the design normaliser so stored values are filled from block defaults
  const design = normalizeDesign({
    version: 1,
    rows: [{ layout: [1], columns: [{ blocks: [raw] }] }],
  });
  return design?.rows[0]?.columns[0]?.blocks[0] ?? null;
}

/** Is this a Row the app still understands? */
function validRow(value: unknown): Row | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.columns)) return null;
  const design = normalizeDesign({ version: 1, rows: [raw] });
  return design?.rows[0] ?? null;
}

/**
 * Coerce arbitrary JSON into a SavedBlock. Returns null when the payload is not
 * something this app can place on a canvas.
 */
export function normalizeSavedBlock(input: unknown): SavedBlock | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;

  const kind = raw.kind === 'row' ? 'row' : 'block';
  const payload = kind === 'row' ? validRow(raw.payload) : validBlock(raw.payload);
  if (!payload) return null;

  const now = Date.now();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('sb'),
    name: raw.name.trim(),
    category: typeof raw.category === 'string' ? raw.category.trim() : '',
    kind,
    payload,
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
    schemaVersion: Number(raw.schemaVersion) || 1,
  };
}

export interface ImportResult {
  added: SavedBlock[];
  /** already present by id */
  duplicates: number;
  /** same name, different id — the caller confirms before overwriting */
  clashes: { incoming: SavedBlock; existing: SavedBlock }[];
  /** entries that were not a usable block or row */
  rejected: number;
}

/**
 * Work out what an import would do, without applying it.
 * Duplicates by id are skipped silently; a name clash is reported so the UI can
 * ask before overwriting.
 */
export function planImport(incoming: unknown, existing: SavedBlock[]): ImportResult | null {
  const list = Array.isArray(incoming)
    ? incoming
    : Array.isArray((incoming as { blocks?: unknown[] })?.blocks)
      ? (incoming as { blocks: unknown[] }).blocks
      : null;
  if (!list) return null;

  const byId = new Map(existing.map((b) => [b.id, b]));
  const byName = new Map(existing.map((b) => [b.name.trim().toLowerCase(), b]));

  const result: ImportResult = { added: [], duplicates: 0, clashes: [], rejected: 0 };
  for (const entry of list) {
    const block = normalizeSavedBlock(entry);
    if (!block) {
      result.rejected += 1;
      continue;
    }
    if (byId.has(block.id)) {
      result.duplicates += 1;
      continue;
    }
    const clash = byName.get(block.name.trim().toLowerCase());
    if (clash) result.clashes.push({ incoming: block, existing: clash });
    else result.added.push(block);
  }
  return result;
}

/** The export envelope: brand-neutral, since payloads keep their tokens. */
export function exportEnvelope(blocks: SavedBlock[]) {
  return { schemaVersion: SAVED_BLOCK_SCHEMA, exportedAt: Date.now(), blocks };
}

export function exportFilename(blocks: SavedBlock[]): string {
  return blocks.length === 1
    ? `block-${slugify(blocks[0].name)}.json`
    : `saved-blocks-${blocks.length}.json`;
}

/**
 * Wrap a saved item in a row so it can be rendered for a thumbnail.
 * A saved block goes into a fresh single-column row; a saved row is used as-is.
 */
export function previewRow(saved: SavedBlock): Row {
  const copy = instantiate(saved);
  if (saved.kind === 'row') return copy as Row;
  const row = createRow([1]);
  row.columns[0].blocks = [copy as Block];
  return row;
}

/** Group for the left panel: category name -> items, "Uncategorised" last. */
export function groupByCategory(blocks: SavedBlock[]): [string, SavedBlock[]][] {
  const groups = new Map<string, SavedBlock[]>();
  for (const b of blocks) {
    const key = b.category || UNCATEGORISED;
    const bucket = groups.get(key);
    if (bucket) bucket.push(b);
    else groups.set(key, [b]);
  }
  return [...groups.entries()]
    .map(([k, v]) => [k, v.sort((a, b) => a.name.localeCompare(b.name))] as [string, SavedBlock[]])
    .sort(([a], [b]) => {
      if (a === UNCATEGORISED) return 1;
      if (b === UNCATEGORISED) return -1;
      return a.localeCompare(b);
    });
}

/** Case-insensitive search over name and category. */
export function searchBlocks(blocks: SavedBlock[], query: string): SavedBlock[] {
  const q = query.trim().toLowerCase();
  if (!q) return blocks;
  return blocks.filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q) ||
      labelFor(b).toLowerCase().includes(q),
  );
}

/** "Hero", "Row (2 columns)" — what kind of thing this is. */
export function labelFor(saved: SavedBlock): string {
  if (saved.kind === 'row') {
    const row = saved.payload as Row;
    const n = row.columns.length;
    return `Row (${n} column${n === 1 ? '' : 's'})`;
  }
  const block = saved.payload as Block;
  return BLOCK_META.find((m) => m.type === (block.type as BlockType))?.label ?? block.type;
}
