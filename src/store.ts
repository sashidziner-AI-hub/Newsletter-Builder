import { create } from 'zustand';
import { produce } from 'immer';
import type { Block, BlockType, Design, Device, Row, Selection, BodySettings } from './types';
import { cloneWithNewIds, createBlock, createRow, emptyDesign } from './lib/defaults';
import { applyRowLayout, findBlock, findColumn, findRowIndex } from './lib/design-ops';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 900;

interface EditorState {
  design: Design;
  past: Design[];
  future: Design[];
  selection: Selection;
  device: Device;
  lastCoalesce: { key: string; at: number } | null;
  /** bumps whenever a whole design is loaded, so editors can reset their internal state */
  revision: number;

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

  return {
    design: emptyDesign(),
    past: [],
    future: [],
    selection: { kind: 'body' },
    device: 'desktop',
    lastCoalesce: null,
    revision: 0,

    select: (selection) => set({ selection }),
    setDevice: (device) => set({ device }),

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

    resetDesign: () =>
      set({
        design: emptyDesign(),
        past: [],
        future: [],
        selection: { kind: 'body' },
        lastCoalesce: null,
        revision: get().revision + 1,
      }),
  };
});
