import { useMemo } from 'react';
import { create } from 'zustand';
import { produce } from 'immer';
import type { Block, BlockType, Brand, Design, Device, Row, Selection, BodySettings } from './types';
import type { SavedBlock } from './lib/blocks-library';
import { instantiate, makeSavedBlock } from './lib/blocks-library';
import { shouldSnapshot, type SnapshotReason } from './lib/versions';
import { type Issue, checkDesign } from './lib/checks';
import { resolveForOutput } from './lib/output';
import { renderDesign } from './lib/render';
import { imageStorage, type LibraryImage } from './lib/image-storage';
import { cloneWithNewIds, createBlock, createRow, defaultBody, emptyDesign } from './lib/defaults';
import { applyRowLayout, findBlock, findColumn, findRowIndex } from './lib/design-ops';
import { emptyBrand, getAccessibleBrands, resolveBrand } from './lib/brand';
import { defaultSampleData } from './lib/merge';
import {
  type SavedTemplate,
  addVersion,
  listBrands,
  listSavedBlocks,
  listIgnored,
  listVersions,
  loadSampleData,
  saveIgnored,
  saveBrands,
  saveEmail,
  saveLastEmailId,
  saveSampleData,
  saveSavedBlocks,
} from './lib/storage';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 900;

/** What the top bar shows. Never silently idle after a failed write. */
export interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  /** when the last successful save landed */
  at: number;
  message: string;
}

interface EditorState {
  design: Design;
  /** every brand on this browser, archived ones included */
  brands: Brand[];
  past: Design[];
  future: Design[];
  selection: Selection;
  device: Device;
  lastCoalesce: { key: string; at: number } | null;
  /** bumps whenever a whole design is loaded, so editors can reset their internal state */
  revision: number;

  /** the saved-email record this canvas belongs to; null until the first save */
  currentEmailId: string | null;
  /** a change the debounce has not written yet */
  dirty: boolean;
  saveState: SaveState;
  savedBlocks: SavedBlock[];
  /** the image library, shared across every email in this browser */
  images: LibraryImage[];
  setImages: (images: LibraryImage[]) => void;
  addImage: (image: LibraryImage) => void;
  updateImage: (id: string, patch: Partial<LibraryImage>) => void;
  removeImage: (id: string) => void;
  /** when the last automatic version snapshot was taken, for the 5-minute throttle */

  /**
   * Quality checks. `issues` is everything the engine found on the last run,
   * ignored ones included, so un-ignoring needs no re-run. Nothing here ever
   * blocks an edit or an export — it only informs.
   */
  issues: Issue[];
  /** issue ids dismissed for this email, persisted with it */
  ignoredIssues: string[];
  /** image load results probed this session, keyed by URL */
  imageStatus: Record<string, 'ok' | 'broken'>;
  checksOpen: boolean;
  runChecks: () => void;
  ignoreIssue: (id: string) => void;
  unignoreIssue: (id: string) => void;
  setChecksOpen: (open: boolean) => void;
  setImageStatus: (statuses: Record<string, 'ok' | 'broken'>) => void;

  openEmail: (record: SavedTemplate) => void;
  startNewEmail: (design: Design) => void;
  saveNow: () => void;
  renameCurrent: (name: string) => void;
  snapshot: (reason: SnapshotReason, note?: string) => void;
  restoreVersion: (design: Design) => void;

  insertBlock: (block: Block, columnId: string, index?: number) => void;
  insertRow: (row: Row, index?: number) => void;
  addSavedBlock: (name: string, category: string, kind: 'block' | 'row', payload: Block | Row) => void;
  setSavedBlocks: (blocks: SavedBlock[]) => void;
  insertSavedBlock: (saved: SavedBlock, columnId?: string, index?: number) => void;

  /** merge-tag preview: editor-only, never part of the design */
  showSampleData: boolean;
  sampleData: Record<string, string>;
  setShowSampleData: (on: boolean) => void;
  setSampleData: (values: Record<string, string>) => void;

  select: (s: Selection) => void;
  setDevice: (d: Device) => void;

  addRow: (layout: number[], index?: number) => string;
  addBlock: (type: BlockType, columnId: string, index?: number) => string | null;
  addBlockInNewRow: (type: BlockType, rowIndex: number) => string;
  moveBlock: (blockId: string, toColumnId: string, toIndex: number) => void;
  moveBlockToNewRow: (blockId: string, rowIndex: number) => void;
  moveRow: (rowId: string, toIndex: number) => void;

  updateBlock: (blockId: string, patch: object) => void;
  updateRow: (rowId: string, patch: Partial<Omit<Row, 'id' | 'columns'>>) => void;
  updateBody: (patch: Partial<BodySettings>) => void;
  setRowLayout: (rowId: string, layout: number[]) => void;

  /** re-theme the email; only design.brandId changes, content is untouched */
  setBrandId: (brandId: string | null) => void;
  /** put the brand tokens back into the email settings, dropping overrides */
  resetBodyToBrand: () => void;

  upsertBrand: (brand: Brand) => void;
  duplicateBrand: (brandId: string) => Brand | null;
  setBrandArchived: (brandId: string, archived: boolean) => void;

  deleteBlock: (blockId: string) => void;
  duplicateBlock: (blockId: string) => void;
  deleteRow: (rowId: string) => void;
  duplicateRow: (rowId: string) => void;

  undo: () => void;
  redo: () => void;
  loadDesign: (design: Design) => void;
  resetDesign: () => void;
}

export const useEditor = create<EditorState>((set, get) => {
  /**
   * Apply a mutation to the design and push history.
   * Calls with the same coalesceKey in quick succession (typing, dragging a slider)
   * collapse into a single undo step.
   */
  const commit = (recipe: (draft: Design) => void, coalesceKey?: string) => {
    const { design, past, lastCoalesce } = get();
    const next = produce(design, recipe);
    if (next === design) return;
    const now = Date.now();
    const coalesce =
      !!coalesceKey && lastCoalesce?.key === coalesceKey && now - lastCoalesce.at < COALESCE_MS;
    const newPast = coalesce ? past : [...past, design].slice(-HISTORY_LIMIT);
    set({
      design: next,
      past: newPast,
      future: [],
      lastCoalesce: coalesceKey ? { key: coalesceKey, at: now } : null,
    });
  };


  /** After undo/redo the selected item might not exist anymore. */
  function fixSelection() {
    const { selection, design } = get();
    if (selection.kind === 'block' && !findBlock(design, selection.id)) {
      set({ selection: { kind: 'body' } });
    } else if (selection.kind === 'row' && findRowIndex(design, selection.id) === -1) {
      set({ selection: { kind: 'body' } });
    }
  }

  /** one place to surface a failed write, so none of them fail silently */
  const reportFull = (
    setState: typeof set,
    getState: typeof get,
    message: string,
  ) => setState({ saveState: { status: 'error', at: getState().saveState.at, message } });

  /** brands live outside undo history; they are shared across all emails */
  const writeBrands = (next: Brand[]) => {
    set({ brands: next });
    saveBrands(next);
  };

  return {
    design: emptyDesign(),
    brands: listBrands(),
    currentEmailId: null,
    dirty: false,
    saveState: { status: 'idle', at: 0, message: '' },
    savedBlocks: listSavedBlocks(),
    images: imageStorage.list(),
    issues: [],
    ignoredIssues: [],
    imageStatus: {},
    checksOpen: false,
    past: [],
    future: [],
    selection: { kind: 'body' },
    device: 'desktop',
    lastCoalesce: null,
    revision: 0,

    select: (selection) => set({ selection }),
    setDevice: (device) => set({ device }),

    setChecksOpen: (checksOpen) => set({ checksOpen }),

    setImageStatus: (statuses) => {
      set({ imageStatus: { ...get().imageStatus, ...statuses } });
      get().runChecks();
    },

    /**
     * Run the engine over what would actually be sent: the resolved design and
     * the real exported HTML, exactly as the export dialog builds them.
     */
    runChecks: () => {
      const { design, brands, images, imageStatus } = get();
      const brand = resolveBrand(brands, design.brandId);
      const out = resolveForOutput(design, brand, 'export');

      // the library already knows what it has probed and how big each image is;
      // an unprobed URL stays absent, so it is never called broken
      const loadStatus = new Map<string, 'ok' | 'broken'>();
      const imageWidths = new Map<string, number>();
      for (const image of images) {
        if (image.status !== 'unknown') loadStatus.set(image.url, image.status);
        if (image.width > 0) imageWidths.set(image.url, image.width);
      }
      for (const [url, status] of Object.entries(imageStatus)) loadStatus.set(url, status);

      set({ issues: checkDesign(out.design, renderDesign(out.design), brand, { loadStatus, imageWidths }) });
    },

    ignoreIssue: (id) => {
      const { ignoredIssues, currentEmailId } = get();
      if (ignoredIssues.includes(id)) return;
      const next = [...ignoredIssues, id];
      set({ ignoredIssues: next });
      saveIgnored(currentEmailId, next);
    },

    unignoreIssue: (id) => {
      const next = get().ignoredIssues.filter((i) => i !== id);
      set({ ignoredIssues: next });
      saveIgnored(get().currentEmailId, next);
    },

    /** Open a saved record for editing. Auto-save then updates it in place. */
    openEmail: (record) => {
      set({
        design: record.design,
        currentEmailId: record.id,
        dirty: false,
        saveState: { status: 'saved', at: record.updatedAt, message: '' },
        past: [],
        future: [],
        selection: { kind: 'body' },
        lastCoalesce: null,
        revision: get().revision + 1,
        // the dismissed warnings belong to this email, not the one just closed
        issues: [],
        ignoredIssues: listIgnored(record.id),
      });
      saveLastEmailId(record.id);
    },

    /**
     * Start a brand-new email. currentEmailId stays null so the first edit
     * creates its own record rather than overwriting the one just left.
     */
    startNewEmail: (design) => {
      set({
        design,
        currentEmailId: null,
        dirty: false,
        saveState: { status: 'idle', at: 0, message: '' },
        past: [],
        future: [],
        selection: { kind: 'body' },
        lastCoalesce: null,
        revision: get().revision + 1,
        issues: [],
        ignoredIssues: [],
      });
      saveLastEmailId(null);
    },

    /** Write the open email now, creating its record if this is the first time. */
    saveNow: () => {
      const { design, currentEmailId } = get();
      set({ saveState: { ...get().saveState, status: 'saving' } });

      const { entry, result } = saveEmail(design, { existingId: currentEmailId ?? undefined });
      if (result === 'full') {
        set({
          saveState: {
            status: 'error',
            at: get().saveState.at,
            message: 'Not saved: storage full',
          },
        });
        return;
      }
      if (!currentEmailId) {
        saveLastEmailId(entry.id);
        // anything dismissed before the record existed now has somewhere to live
        const ignored = get().ignoredIssues;
        if (ignored.length > 0) saveIgnored(entry.id, ignored);
      }
      set({
        currentEmailId: entry.id,
        dirty: false,
        saveState: {
          status: 'saved',
          at: entry.updatedAt,
          message: result === 'pruned' ? 'Saved — pruned old versions to make room' : '',
        },
      });

      // one automatic snapshot per five minutes of editing
      get().snapshot('auto');
    },

    renameCurrent: (name) => {
      const id = get().currentEmailId;
      if (!id) return;
      const { entry, result } = saveEmail(get().design, {
        existingId: id,
        name,
        autoSaved: false,
      });
      if (result !== 'full') {
        set({ saveState: { status: 'saved', at: entry.updatedAt, message: '' } });
      }
    },

    /**
     * Take a version snapshot if the rules allow one. Silently does nothing when
     * the design is unchanged or the throttle has not elapsed.
     */
    snapshot: (reason, note = '') => {
      const { design, currentEmailId } = get();
      if (!currentEmailId) return;
      if (!shouldSnapshot(listVersions(), currentEmailId, design, Date.now(), reason)) return;
      const { result } = addVersion(currentEmailId, design, reason, note);
      if (result === 'full') {
        set({
          saveState: {
            status: 'error',
            at: get().saveState.at,
            message: 'Version not saved: storage full',
          },
        });
      }
    },

    /** Load an old design over the canvas. The caller snapshots first. */
    restoreVersion: (design) => {
      set({
        design,
        dirty: true,
        past: [],
        future: [],
        selection: { kind: 'body' },
        lastCoalesce: null,
        revision: get().revision + 1,
      });
    },

    insertBlock: (block, columnId, index) => {
      commit((d) => {
        const loc = findColumn(d, columnId);
        if (!loc) return;
        const at =
          index === undefined
            ? loc.column.blocks.length
            : Math.max(0, Math.min(index, loc.column.blocks.length));
        loc.column.blocks.splice(at, 0, block);
      });
      set({ selection: { kind: 'block', id: block.id } });
    },

    insertRow: (row, index) => {
      commit((d) => {
        const at = index === undefined ? d.rows.length : Math.max(0, Math.min(index, d.rows.length));
        d.rows.splice(at, 0, row);
      });
      set({ selection: { kind: 'row', id: row.id } });
    },

    addSavedBlock: (name, category, kind, payload) => {
      const next = [makeSavedBlock(name, category, kind, payload), ...get().savedBlocks];
      set({ savedBlocks: next });
      if (saveSavedBlocks(next) === 'full') {
        set({
          saveState: {
            status: 'error',
            at: get().saveState.at,
            message: 'Block not saved: storage full',
          },
        });
      }
    },

    setImages: (images) => {
      set({ images });
      if (imageStorage.replaceAll(images) === 'full') reportFull(set, get, 'Images not saved: storage full');
    },

    addImage: (image) => {
      const next = [image, ...get().images.filter((i) => i.id !== image.id)];
      set({ images: next });
      if (imageStorage.add(image) === 'full') reportFull(set, get, 'Image not saved: storage full');
    },

    updateImage: (id, patch) => {
      set({ images: get().images.map((i) => (i.id === id ? { ...i, ...patch, id } : i)) });
      if (imageStorage.update(id, patch) === 'full') reportFull(set, get, 'Image not saved: storage full');
    },

    removeImage: (id) => {
      set({ images: get().images.filter((i) => i.id !== id) });
      imageStorage.remove(id);
    },

    setSavedBlocks: (blocks) => {
      set({ savedBlocks: blocks });
      saveSavedBlocks(blocks);
    },

    /**
     * Put a copy of a saved item on the canvas. `instantiate` regenerates every
     * id, so the copy can never alias the stored original.
     */
    insertSavedBlock: (saved, columnId, index) => {
      const copy = instantiate(saved);
      if (saved.kind === 'row') return get().insertRow(copy as Row, index);

      const block = copy as Block;
      const target = columnId ?? (() => {
        const { design, selection } = get();
        if (selection.kind === 'block') {
          const loc = findBlock(design, selection.id);
          if (loc) return loc.column.id;
        }
        if (selection.kind === 'row') {
          const row = design.rows.find((r) => r.id === selection.id);
          if (row) return row.columns[0].id;
        }
        return design.rows[design.rows.length - 1]?.columns[0]?.id;
      })();

      if (!target) {
        // no row to put it in yet, so make one
        const row = createRow([1]);
        row.columns[0].blocks.push(block);
        return get().insertRow(row, index);
      }
      get().insertBlock(block, target, index);
    },

    showSampleData: false,
    sampleData: { ...defaultSampleData(), ...(loadSampleData() ?? {}) },
    setShowSampleData: (showSampleData) => set({ showSampleData }),
    setSampleData: (sampleData) => {
      set({ sampleData });
      saveSampleData(sampleData);
    },

    addRow: (layout, index) => {
      const row = createRow(layout);
      commit((d) => {
        const at = index === undefined ? d.rows.length : Math.max(0, Math.min(index, d.rows.length));
        d.rows.splice(at, 0, row);
      });
      set({ selection: { kind: 'row', id: row.id } });
      return row.id;
    },

    addBlock: (type, columnId, index) => {
      const block = createBlock(type);
      const res = { added: false };
      commit((d) => {
        const loc = findColumn(d, columnId);
        if (!loc) return;
        const at =
          index === undefined
            ? loc.column.blocks.length
            : Math.max(0, Math.min(index, loc.column.blocks.length));
        loc.column.blocks.splice(at, 0, block);
        res.added = true;
      });
      if (!res.added) return null;
      set({ selection: { kind: 'block', id: block.id } });
      return block.id;
    },

    addBlockInNewRow: (type, rowIndex) => {
      const block = createBlock(type);
      const row = createRow([1]);
      row.columns[0].blocks.push(block);
      commit((d) => {
        const at = Math.max(0, Math.min(rowIndex, d.rows.length));
        d.rows.splice(at, 0, row);
      });
      set({ selection: { kind: 'block', id: block.id } });
      return block.id;
    },

    moveBlockToNewRow: (blockId, rowIndex) => {
      commit((d) => {
        const from = findBlock(d, blockId);
        if (!from) return;
        const [block] = from.column.blocks.splice(from.index, 1);
        const row = createRow([1]);
        row.columns[0].blocks.push(block);
        const at = Math.max(0, Math.min(rowIndex, d.rows.length));
        d.rows.splice(at, 0, row);
      });
      set({ selection: { kind: 'block', id: blockId } });
    },

    moveBlock: (blockId, toColumnId, toIndex) => {
      commit((d) => {
        const from = findBlock(d, blockId);
        const to = findColumn(d, toColumnId);
        if (!from || !to) return;
        if (from.column.id === toColumnId && (toIndex === from.index || toIndex === from.index + 1)) return;
        const [block] = from.column.blocks.splice(from.index, 1);
        let at = toIndex;
        if (from.column.id === toColumnId && from.index < toIndex) at -= 1;
        at = Math.max(0, Math.min(at, to.column.blocks.length));
        to.column.blocks.splice(at, 0, block);
      });
      set({ selection: { kind: 'block', id: blockId } });
    },

    moveRow: (rowId, toIndex) => {
      commit((d) => {
        const from = findRowIndex(d, rowId);
        if (from === -1 || toIndex === from || toIndex === from + 1) return;
        const [row] = d.rows.splice(from, 1);
        let at = toIndex;
        if (from < toIndex) at -= 1;
        at = Math.max(0, Math.min(at, d.rows.length));
        d.rows.splice(at, 0, row);
      });
    },

    updateBlock: (blockId, patch) => {
      commit((d) => {
        const loc = findBlock(d, blockId);
        if (!loc) return;
        Object.assign(loc.block.values, patch);
      }, `block:${blockId}:${Object.keys(patch).sort().join(',')}`);
    },

    updateRow: (rowId, patch) => {
      commit((d) => {
        const row = d.rows.find((r) => r.id === rowId);
        if (row) Object.assign(row, patch);
      }, `row:${rowId}:${Object.keys(patch).sort().join(',')}`);
    },

    updateBody: (patch) => {
      commit((d) => {
        Object.assign(d.body, patch);
      }, `body:${Object.keys(patch).sort().join(',')}`);
    },

    setBrandId: (brandId) => {
      commit((d) => {
        d.brandId = brandId;
      });
    },

    resetBodyToBrand: () => {
      const { bgColor, contentBgColor, fontFamily, textColor, linkColor } = defaultBody();
      commit((d) => {
        Object.assign(d.body, { bgColor, contentBgColor, fontFamily, textColor, linkColor });
      });
    },

    upsertBrand: (brand) => {
      const next = { ...brand, updatedAt: Date.now() };
      const list = get().brands;
      writeBrands(
        list.some((b) => b.id === next.id)
          ? list.map((b) => (b.id === next.id ? next : b))
          : [...list, next],
      );
    },

    duplicateBrand: (brandId) => {
      const source = get().brands.find((b) => b.id === brandId);
      if (!source) return null;
      const copy: Brand = {
        ...emptyBrand(`${source.name} copy`),
        tokens: JSON.parse(JSON.stringify(source.tokens)),
        footer: { ...source.footer },
        social_links: source.social_links.map((l) => ({ ...l })),
        logo: source.logo,
        logo_dark: source.logo_dark,
        logo_url: source.logo_url,
        logo_dark_url: source.logo_dark_url,
        website_url: source.website_url,
      };
      writeBrands([...get().brands, copy]);
      return copy;
    },

    setBrandArchived: (brandId, archived) => {
      writeBrands(
        get().brands.map((b) =>
          b.id === brandId ? { ...b, is_active: !archived, updatedAt: Date.now() } : b,
        ),
      );
    },

    setRowLayout: (rowId, layout) => {
      commit((d) => {
        const row = d.rows.find((r) => r.id === rowId);
        if (row) applyRowLayout(row, layout);
      });
    },

    deleteBlock: (blockId) => {
      commit((d) => {
        const loc = findBlock(d, blockId);
        if (loc) loc.column.blocks.splice(loc.index, 1);
      });
      const sel = get().selection;
      if (sel.kind === 'block' && sel.id === blockId) set({ selection: { kind: 'body' } });
    },

    duplicateBlock: (blockId) => {
      const res: { id: string | null } = { id: null };
      commit((d) => {
        const loc = findBlock(d, blockId);
        if (!loc) return;
        const copy = cloneWithNewIds(loc.block) as Block;
        res.id = copy.id;
        loc.column.blocks.splice(loc.index + 1, 0, copy);
      });
      if (res.id) set({ selection: { kind: 'block', id: res.id } });
    },

    deleteRow: (rowId) => {
      commit((d) => {
        const i = findRowIndex(d, rowId);
        if (i !== -1) d.rows.splice(i, 1);
      });
      const { selection, design } = get();
      if (selection.kind === 'row' && selection.id === rowId) set({ selection: { kind: 'body' } });
      if (selection.kind === 'block' && !findBlock(design, selection.id))
        set({ selection: { kind: 'body' } });
    },

    duplicateRow: (rowId) => {
      const res: { id: string | null } = { id: null };
      commit((d) => {
        const i = findRowIndex(d, rowId);
        if (i === -1) return;
        const copy = cloneWithNewIds(d.rows[i]) as Row;
        res.id = copy.id;
        d.rows.splice(i + 1, 0, copy);
      });
      if (res.id) set({ selection: { kind: 'row', id: res.id } });
    },

    undo: () => {
      const { past, future, design } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({
        design: prev,
        past: past.slice(0, -1),
        future: [design, ...future].slice(0, HISTORY_LIMIT),
        lastCoalesce: null,
        revision: get().revision + 1,
      });
      fixSelection();
    },

    redo: () => {
      const { past, future, design } = get();
      if (!future.length) return;
      const [next, ...rest] = future;
      set({
        design: next,
        past: [...past, design].slice(-HISTORY_LIMIT),
        future: rest,
        lastCoalesce: null,
        revision: get().revision + 1,
      });
      fixSelection();
    },

    loadDesign: (design) =>
      set({
        design,
        past: [],
        future: [],
        selection: { kind: 'body' },
        lastCoalesce: null,
        revision: get().revision + 1,
      }),

    /**
     * Start over on a blank canvas. This is `startNewEmail` with an empty
     * design, so it also clears the record pointer and the save state — a
     * reset that left those behind would auto-save the blank canvas over the
     * email it just discarded.
     */
    resetDesign: () => get().startNewEmail(emptyDesign()),
  };
});

/**
 * The brand the current email is themed with. An archived or missing brandId
 * resolves to the default brand, so an old template never breaks.
 */
export function useActiveBrand(): Brand {
  const brands = useEditor((s) => s.brands);
  const brandId = useEditor((s) => s.design.brandId);
  return useMemo(() => resolveBrand(brands, brandId), [brands, brandId]);
}

/** Brands the current user may use. The only read path the UI should take. */
export function useAccessibleBrands(): Brand[] {
  const brands = useEditor((s) => s.brands);
  return useMemo(() => getAccessibleBrands(null, brands), [brands]);
}

/**
 * Issues the user has not dismissed — what the badge and the drawer show. The
 * ignored ones stay in the store so they can be brought back without a re-run.
 */
export function useVisibleIssues(): Issue[] {
  const issues = useEditor((s) => s.issues);
  const ignored = useEditor((s) => s.ignoredIssues);
  return useMemo(() => issues.filter((i) => !ignored.includes(i.id)), [issues, ignored]);
}

/** The ignored ones, for the drawer's un-ignore list. */
export function useIgnoredIssues(): Issue[] {
  const issues = useEditor((s) => s.issues);
  const ignored = useEditor((s) => s.ignoredIssues);
  return useMemo(() => issues.filter((i) => ignored.includes(i.id)), [issues, ignored]);
}

/**
 * The sample values to render with, or null when the preview toggle is off.
 * Null means "show the merge tags themselves".
 */
export function useSampleData(): Record<string, string> | null {
  const on = useEditor((s) => s.showSampleData);
  const values = useEditor((s) => s.sampleData);
  return on ? values : null;
}
