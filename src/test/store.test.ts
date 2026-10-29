import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../store';

const s = () => useEditor.getState();

describe('editor store', () => {
  beforeEach(() => s().resetDesign());

  it('adds rows and blocks and selects the new block', () => {
    const rowId = s().addRow([1, 1]);
    const row = s().design.rows.find((r) => r.id === rowId)!;
    expect(row.columns).toHaveLength(2);
    const blockId = s().addBlock('text', row.columns[0].id)!;
    expect(s().selection).toEqual({ kind: 'block', id: blockId });
    expect(s().design.rows[0].columns[0].blocks).toHaveLength(1);
  });

  it('inserts at an index', () => {
    s().addRow([1]);
    const col = s().design.rows[0].columns[0].id;
    s().addBlock('text', col);
    s().addBlock('button', col);
    s().addBlock('divider', col, 1);
    expect(s().design.rows[0].columns[0].blocks.map((b) => b.type)).toEqual(['text', 'divider', 'button']);
  });

  it('moves blocks within and across columns', () => {
    s().addRow([1, 1]);
    const [c1, c2] = s().design.rows[0].columns.map((c) => c.id);
    const a = s().addBlock('text', c1)!;
    s().addBlock('button', c1);
    s().moveBlock(a, c1, 2); // move first to the end (index is pre-removal)
    expect(s().design.rows[0].columns[0].blocks.map((b) => b.type)).toEqual(['button', 'text']);
    s().moveBlock(a, c2, 0);
    expect(s().design.rows[0].columns[0].blocks).toHaveLength(1);
    expect(s().design.rows[0].columns[1].blocks[0].id).toBe(a);
  });

  it('reorders rows', () => {
    const r1 = s().addRow([1]);
    s().addRow([1, 1]);
    s().addRow([1, 1, 1]);
    s().moveRow(r1, 3);
    expect(s().design.rows.map((r) => r.layout.length)).toEqual([2, 3, 1]);
  });

  it('undo / redo restore previous designs', () => {
    s().addRow([1]);
    s().addRow([1, 1]);
    expect(s().design.rows).toHaveLength(2);
    s().undo();
    expect(s().design.rows).toHaveLength(1);
    s().redo();
    expect(s().design.rows).toHaveLength(2);
    s().undo();
    s().undo();
    s().undo(); // extra undo is a no-op
    expect(s().design.rows).toHaveLength(0);
  });

  it('coalesces rapid edits to the same field into one undo step', () => {
    s().addRow([1]);
    const id = s().addBlock('heading', s().design.rows[0].columns[0].id)!;
    s().updateBlock(id, { text: 'H' });
    s().updateBlock(id, { text: 'He' });
    s().updateBlock(id, { text: 'Hel' });
    s().undo();
    const blk = s().design.rows[0].columns[0].blocks[0];
    expect(blk.type === 'heading' && blk.values.text).toBe('Your heading here');
  });

  it('changing row layout merges removed columns into the last one', () => {
    const rowId = s().addRow([1, 1, 1]);
    const cols = s().design.rows[0].columns.map((c) => c.id);
    s().addBlock('text', cols[0]);
    s().addBlock('button', cols[2]);
    s().setRowLayout(rowId, [1, 1]);
    const row = s().design.rows[0];
    expect(row.columns).toHaveLength(2);
    expect(row.columns[1].blocks.map((b) => b.type)).toEqual(['button']);
    s().setRowLayout(rowId, [1]);
    expect(s().design.rows[0].columns[0].blocks.map((b) => b.type).sort()).toEqual(['button', 'text']);
  });

  it('duplicates blocks with fresh ids and deletes selection safely', () => {
    s().addRow([1]);
    const id = s().addBlock('button', s().design.rows[0].columns[0].id)!;
    s().duplicateBlock(id);
    const blocks = s().design.rows[0].columns[0].blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0].id).not.toBe(blocks[1].id);
    s().deleteBlock(blocks[1].id);
    expect(s().selection).toEqual({ kind: 'body' });
    expect(s().design.rows[0].columns[0].blocks).toHaveLength(1);
  });

  it('duplicating a row gives all columns and blocks new ids', () => {
    const rowId = s().addRow([1, 1]);
    s().addBlock('text', s().design.rows[0].columns[0].id);
    s().duplicateRow(rowId);
    const [a, b] = s().design.rows;
    expect(a.id).not.toBe(b.id);
    expect(a.columns[0].id).not.toBe(b.columns[0].id);
    expect(a.columns[0].blocks[0].id).not.toBe(b.columns[0].blocks[0].id);
  });
});

describe('new-row helpers', () => {
  beforeEach(() => s().resetDesign());

  it('addBlockInNewRow is a single undo step', () => {
    s().addBlockInNewRow('button', 0);
    expect(s().design.rows).toHaveLength(1);
    expect(s().design.rows[0].columns[0].blocks[0].type).toBe('button');
    s().undo();
    expect(s().design.rows).toHaveLength(0);
  });

  it('moveBlockToNewRow moves the block into a new row at the given index', () => {
    s().addRow([1, 1]);
    const id = s().addBlock('text', s().design.rows[0].columns[0].id)!;
    s().moveBlockToNewRow(id, 0);
    expect(s().design.rows).toHaveLength(2);
    expect(s().design.rows[0].columns[0].blocks[0].id).toBe(id);
    expect(s().design.rows[1].columns[0].blocks).toHaveLength(0);
    s().undo();
    expect(s().design.rows).toHaveLength(1);
    expect(s().design.rows[0].columns[0].blocks[0].id).toBe(id);
  });
});
