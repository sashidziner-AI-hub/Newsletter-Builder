import type { Block, BlockType, Column, Design, Row } from '../types';
import { BLOCK_META, createBlock, createRow, defaultBody } from './defaults';
import { uid } from './util';

export interface BlockLocation {
  row: Row;
  rowIndex: number;
  column: Column;
  colIndex: number;
  index: number;
  block: Block;
}

export function findBlock(design: Design, blockId: string): BlockLocation | null {
  for (let rowIndex = 0; rowIndex < design.rows.length; rowIndex++) {
    const row = design.rows[rowIndex];
    for (let colIndex = 0; colIndex < row.columns.length; colIndex++) {
      const column = row.columns[colIndex];
      const index = column.blocks.findIndex((b) => b.id === blockId);
      if (index !== -1) {
        return { row, rowIndex, column, colIndex, index, block: column.blocks[index] };
      }
    }
  }
  return null;
}

export function findColumn(
  design: Design,
  columnId: string,
): { row: Row; rowIndex: number; column: Column; colIndex: number } | null {
  for (let rowIndex = 0; rowIndex < design.rows.length; rowIndex++) {
    const row = design.rows[rowIndex];
    const colIndex = row.columns.findIndex((c) => c.id === columnId);
    if (colIndex !== -1) return { row, rowIndex, column: row.columns[colIndex], colIndex };
  }
  return null;
}

export function findRowIndex(design: Design, rowId: string): number {
  return design.rows.findIndex((r) => r.id === rowId);
}

/** Resize a row's columns. Removed columns' blocks are merged into the last kept column. */
export function applyRowLayout(row: Row, layout: number[]): void {
  const next: Column[] = [];
  layout.forEach((_, i) => {
    next.push(row.columns[i] ?? { id: uid('col'), blocks: [] });
  });
  if (row.columns.length > layout.length) {
    const overflow = row.columns.slice(layout.length).flatMap((c) => c.blocks);
    next[next.length - 1].blocks.push(...overflow);
  }
  row.layout = [...layout];
  row.columns = next;
}

/**
 * Validate / migrate an arbitrary imported JSON into a Design.
 * Missing values are filled from block defaults so older or hand-written files still load.
 */
export function normalizeDesign(input: unknown): Design | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.rows)) return null;

  const validTypes = new Set<string>(BLOCK_META.map((m) => m.type));
  const body = { ...defaultBody(), ...((raw.body as object) ?? {}) };
  // designs saved before 1B carry no showFooter; default it to on
  if (typeof body.showFooter !== 'boolean') body.showFooter = true;

  const rows: Row[] = [];
  for (const r of raw.rows as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.columns)) return null;
    const layout =
      Array.isArray(r.layout) && r.layout.length === (r.columns as unknown[]).length
        ? (r.layout as number[]).map((n) => (Number(n) > 0 ? Number(n) : 1))
        : (r.columns as unknown[]).map(() => 1);
    const base = createRow(layout);
    const row: Row = {
      ...base,
      id: typeof r.id === 'string' ? r.id : base.id,
      bgColor: typeof r.bgColor === 'string' ? r.bgColor : '',
      contentBgColor: typeof r.contentBgColor === 'string' ? r.contentBgColor : '',
      stackOnMobile: r.stackOnMobile !== false,
      padding: { ...base.padding, ...((r.padding as object) ?? {}) },
      columns: [],
    };
    for (const c of r.columns as Record<string, unknown>[]) {
      const blocks: Block[] = [];
      const rawBlocks = c && Array.isArray(c.blocks) ? (c.blocks as Record<string, unknown>[]) : [];
      for (const b of rawBlocks) {
        if (!b || typeof b.type !== 'string' || !validTypes.has(b.type)) continue;
        const fresh = createBlock(b.type as BlockType);
        blocks.push({
          ...fresh,
          id: typeof b.id === 'string' ? b.id : fresh.id,
          values: {
            ...fresh.values,
            ...((b.values as object) ?? {}),
          },
        } as Block);
      }
      row.columns.push({
        id: c && typeof c.id === 'string' ? c.id : uid('col'),
        blocks,
      });
    }
    rows.push(row);
  }
  // Designs saved before brands existed have no brandId; null means "default
  // brand", and their literal colours are kept exactly as stored.
  const brandId = typeof raw.brandId === 'string' && raw.brandId ? raw.brandId : null;
  return { version: 1, brandId, body, rows };
}
