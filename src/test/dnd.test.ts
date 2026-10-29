import { beforeEach, describe, expect, it } from 'vitest';
import type { Over } from '@dnd-kit/core';
import { applyDrop, computeHint } from '../components/dnd';
import { useEditor } from '../store';

const s = () => useEditor.getState();

/** minimal fake of dnd-kit's `over` object */
function over(data: Record<string, unknown>, top = 100, height = 40): Over {
  return {
    id: 'x',
    data: { current: data },
    rect: { top, height, left: 0, width: 100, right: 100, bottom: top + height },
    disabled: false,
  } as unknown as Over;
}

describe('drop targeting', () => {
  beforeEach(() => {
    s().resetDesign();
    s().addRow([1, 1]);
    const [c1] = s().design.rows[0].columns;
    s().addBlock('text', c1.id);
    s().addBlock('button', c1.id);
  });

  const col1 = () => s().design.rows[0].columns[0];
  const col2 = () => s().design.rows[0].columns[1];

  it('dropping on the upper half of a block inserts before it, lower half after it', () => {
    const [a] = col1().blocks;
    const upper = computeHint('tool', over({ kind: 'block', blockId: a.id, columnId: col1().id }), 110);
    const lower = computeHint('tool', over({ kind: 'block', blockId: a.id, columnId: col1().id }), 130);
    expect(upper).toEqual({ type: 'block', columnId: col1().id, index: 0 });
    expect(lower).toEqual({ type: 'block', columnId: col1().id, index: 1 });
  });

  it('dropping on a column appends to it', () => {
    const hint = computeHint('tool', over({ kind: 'column', columnId: col2().id }), 100);
    expect(hint).toEqual({ type: 'block', columnId: col2().id, index: 0 });
  });

  it('dropping a tool on the canvas end creates a new row containing the block', () => {
    const hint = computeHint('tool', over({ kind: 'canvas' }), 100)!;
    expect(hint).toEqual({ type: 'row', index: 1 });
    applyDrop({ kind: 'tool', blockType: 'divider' }, hint);
    expect(s().design.rows).toHaveLength(2);
    expect(s().design.rows[1].columns[0].blocks[0].type).toBe('divider');
  });

  it('tool drop inserts at the computed index', () => {
    const [a] = col1().blocks;
    const hint = computeHint('tool', over({ kind: 'block', blockId: a.id, columnId: col1().id }), 130)!;
    applyDrop({ kind: 'tool', blockType: 'image' }, hint);
    expect(col1().blocks.map((b) => b.type)).toEqual(['text', 'image', 'button']);
  });

  it('moving a block to the other column', () => {
    const [a] = col1().blocks;
    const hint = computeHint('block', over({ kind: 'column', columnId: col2().id }), 100)!;
    applyDrop({ kind: 'block', blockId: a.id }, hint);
    expect(col1().blocks.map((b) => b.type)).toEqual(['button']);
    expect(col2().blocks.map((b) => b.type)).toEqual(['text']);
  });

  it('dropping a block onto itself changes nothing and adds no undo step', () => {
    const [a] = col1().blocks;
    const before = s().past.length;
    const hint = computeHint('block', over({ kind: 'block', blockId: a.id, columnId: col1().id }), 105)!;
    applyDrop({ kind: 'block', blockId: a.id }, hint);
    expect(col1().blocks.map((b) => b.type)).toEqual(['text', 'button']);
    expect(s().past.length).toBe(before);
  });

  it('layouts and rows only target rows / canvas', () => {
    const rowId = s().design.rows[0].id;
    expect(computeHint('layout', over({ kind: 'block', blockId: 'b', columnId: 'c' }), 100)).toBeNull();
    const before = computeHint('layout', over({ kind: 'row', rowId }), 105)!;
    expect(before).toEqual({ type: 'row', index: 0 });
    applyDrop({ kind: 'layout', layout: [1, 2] }, before);
    expect(s().design.rows.map((r) => r.layout.length)).toEqual([2, 2]);
    // the original row is now second (index 1), so "after" it is index 2
    const after = computeHint('layout', over({ kind: 'row', rowId }), 135)!;
    expect(after).toEqual({ type: 'row', index: 2 });
  });

  it('moving a row down and a block into a brand new row', () => {
    s().addRow([1, 1, 1]);
    const first = s().design.rows[0].id;
    applyDrop({ kind: 'row', rowId: first }, { type: 'row', index: 2 });
    expect(s().design.rows[1].id).toBe(first);

    const blockId = s().design.rows[1].columns[0].blocks[0].id;
    applyDrop({ kind: 'block', blockId }, { type: 'row', index: 0 });
    expect(s().design.rows[0].columns[0].blocks[0].id).toBe(blockId);
    expect(s().design.rows).toHaveLength(3);
  });
});
