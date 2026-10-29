import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { BlockType } from '../types';
import { BLOCK_META } from '../lib/defaults';
import { findBlock, findColumn } from '../lib/design-ops';
import { useEditor } from '../store';
import { BlockIcon } from './icons';

/** Where a drop would land. */
export type Hint =
  | { type: 'block'; columnId: string; index: number }
  | { type: 'row'; index: number };

const HintContext = createContext<Hint | null>(null);
export const useDropHint = () => useContext(HintContext);

export type DragKind = 'tool' | 'layout' | 'block' | 'row';

export interface DragData {
  kind: DragKind;
  blockType?: BlockType;
  layout?: number[];
  blockId?: string;
  rowId?: string;
}

interface ActiveInfo {
  kind: DragKind;
  label: string;
  blockType?: BlockType;
  layout?: number[];
}

const RANK_BLOCKS: Record<string, number> = { block: 0, column: 1, canvas: 2 };
const RANK_ROWS: Record<string, number> = { row: 0, canvas: 1 };

/**
 * Pick the most specific droppable under the pointer.
 * Blocks/tools can only target blocks, columns and the empty canvas area.
 * Rows/layouts can only target rows and the empty canvas area.
 */
const collisionDetection: CollisionDetection = (args) => {
  const kind = args.active.data.current?.kind as DragKind | undefined;
  const wantRows = kind === 'row' || kind === 'layout';
  const rank = wantRows ? RANK_ROWS : RANK_BLOCKS;
  const kindOf = (id: string | number) =>
    args.droppableContainers.find((c) => c.id === id)?.data.current?.kind as string | undefined;

  const allowed = args.droppableContainers.filter((c) => {
    const k = c.data.current?.kind as string | undefined;
    return k !== undefined && k in rank;
  });
  const scoped = { ...args, droppableContainers: allowed };
  const within = pointerWithin(scoped);
  if (within.length) {
    return [...within].sort((a, b) => (rank[kindOf(a.id) ?? ''] ?? 9) - (rank[kindOf(b.id) ?? ''] ?? 9));
  }
  return closestCenter(scoped);
};

function pointerOf(e: DragMoveEvent | DragEndEvent): { x: number; y: number } | null {
  const a = e.activatorEvent as MouseEvent | TouchEvent | null;
  if (!a) return null;
  if ('clientX' in a) return { x: a.clientX + e.delta.x, y: a.clientY + e.delta.y };
  const t = a.touches?.[0] ?? a.changedTouches?.[0];
  return t ? { x: t.clientX + e.delta.x, y: t.clientY + e.delta.y } : null;
}

export function computeHint(kind: DragKind, over: Over | null, pointerY: number | null): Hint | null {
  if (!over) return null;
  const { design } = useEditor.getState();
  const od = over.data.current as { kind: string; columnId?: string; blockId?: string; rowId?: string } | undefined;
  if (!od) return null;
  const after = pointerY !== null && pointerY > over.rect.top + over.rect.height / 2;

  if (kind === 'row' || kind === 'layout') {
    if (od.kind === 'canvas') return { type: 'row', index: design.rows.length };
    if (od.kind === 'row' && od.rowId) {
      const i = design.rows.findIndex((r) => r.id === od.rowId);
      return i === -1 ? null : { type: 'row', index: i + (after ? 1 : 0) };
    }
    return null;
  }

  if (od.kind === 'canvas') return { type: 'row', index: design.rows.length };
  if (od.kind === 'column' && od.columnId) {
    const loc = findColumn(design, od.columnId);
    return loc ? { type: 'block', columnId: od.columnId, index: loc.column.blocks.length } : null;
  }
  if (od.kind === 'block' && od.blockId) {
    const loc = findBlock(design, od.blockId);
    return loc ? { type: 'block', columnId: loc.column.id, index: loc.index + (after ? 1 : 0) } : null;
  }
  return null;
}

/** Perform the editor mutation for a completed drop. */
export function applyDrop(d: DragData, target: Hint): void {
  const st = useEditor.getState();
  switch (d.kind) {
    case 'tool':
      if (!d.blockType) return;
      if (target.type === 'block') st.addBlock(d.blockType, target.columnId, target.index);
      else st.addBlockInNewRow(d.blockType, target.index);
      break;
    case 'layout':
      if (target.type === 'row' && d.layout) st.addRow(d.layout, target.index);
      break;
    case 'block':
      if (!d.blockId) return;
      if (target.type === 'block') st.moveBlock(d.blockId, target.columnId, target.index);
      else st.moveBlockToNewRow(d.blockId, target.index);
      break;
    case 'row':
      if (target.type === 'row' && d.rowId) st.moveRow(d.rowId, target.index);
      break;
  }
}

export function DndShell({ children }: { children: ReactNode }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );
  const [hint, setHint] = useState<Hint | null>(null);
  const [active, setActive] = useState<ActiveInfo | null>(null);
  const hintRef = useRef<string>('');

  const updateHint = useCallback((h: Hint | null) => {
    const key = JSON.stringify(h);
    if (key !== hintRef.current) {
      hintRef.current = key;
      setHint(h);
    }
  }, []);

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as
      | { kind: DragKind; blockType?: BlockType; layout?: number[]; blockId?: string }
      | undefined;
    if (!d) return;
    let label = 'Row';
    let blockType = d.blockType;
    if (d.kind === 'tool' && blockType) label = BLOCK_META.find((m) => m.type === blockType)?.label ?? 'Block';
    if (d.kind === 'layout') label = `${d.layout?.length ?? 1} column row`;
    if (d.kind === 'block' && d.blockId) {
      const loc = findBlock(useEditor.getState().design, d.blockId);
      blockType = loc?.block.type;
      label = blockType ? (BLOCK_META.find((m) => m.type === blockType)?.label ?? 'Block') : 'Block';
    }
    setActive({ kind: d.kind, label, blockType, layout: d.layout });
  };

  const onDragMove = (e: DragMoveEvent) => {
    const kind = e.active.data.current?.kind as DragKind | undefined;
    if (!kind) return;
    updateHint(computeHint(kind, e.over, pointerOf(e)?.y ?? null));
  };

  const clear = () => {
    updateHint(null);
    setActive(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const d = e.active.data.current as DragData | undefined;
    const target = d ? computeHint(d.kind, e.over, pointerOf(e)?.y ?? null) : null;
    clear();
    if (d && target) applyDrop(d, target);
  };

  return (
    <HintContext.Provider value={hint}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={clear}
      >
        {children}
        <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
          {active && (
            <div className="flex items-center gap-2 rounded-lg border border-brand-500 bg-white px-3 py-2 text-sm font-medium text-brand-700 shadow-xl">
              {active.blockType ? <BlockIcon type={active.blockType} size={16} /> : <GripVertical size={16} />}
              {active.label}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </HintContext.Provider>
  );
}

/** Blue insertion marker shown while dragging. */
export function DropLine({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 z-30 h-[3px] rounded-full bg-brand-500 shadow-[0_0_0_2px_rgba(59,130,246,0.25)] ${className}`}
    />
  );
}
