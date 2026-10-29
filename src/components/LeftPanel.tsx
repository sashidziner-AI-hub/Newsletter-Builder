import type { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { BlockType } from '../types';
import { BLOCK_META, ROW_LAYOUTS } from '../lib/defaults';
import { findBlock } from '../lib/design-ops';
import { useEditor } from '../store';
import { BlockIcon } from './icons';

function Tile({
  id,
  data,
  title,
  onClick,
  children,
}: {
  id: string;
  data: Record<string, unknown>;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <button
      ref={setNodeRef}
      type="button"
      title={title}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`flex cursor-grab flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-600 transition-all hover:border-brand-500 hover:text-brand-700 hover:shadow-sm active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {children}
    </button>
  );
}

export function LeftPanel() {
  const addRow = useEditor((s) => s.addRow);

  /** Click-to-add: put the block where the user is currently working. */
  const addBlockSmart = (type: BlockType) => {
    const st = useEditor.getState();
    const { design, selection } = st;

    if (selection.kind === 'block') {
      const loc = findBlock(design, selection.id);
      if (loc) return void st.addBlock(type, loc.column.id, loc.index + 1);
    }
    if (selection.kind === 'row') {
      const row = design.rows.find((r) => r.id === selection.id);
      if (row) return void st.addBlock(type, row.columns[0].id);
    }
    const last = design.rows[design.rows.length - 1];
    if (last) return void st.addBlock(type, last.columns[0].id);
    st.addBlockInNewRow(type, 0);
  };

  return (
    <aside className="scroll-thin flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Content</h2>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">Drag onto the canvas, or click to add.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {BLOCK_META.map((m) => (
          <Tile
            key={m.type}
            id={`tool:${m.type}`}
            data={{ kind: 'tool', blockType: m.type }}
            title={`Add ${m.label}`}
            onClick={() => addBlockSmart(m.type)}
          >
            <BlockIcon type={m.type} />
            {m.label}
          </Tile>
        ))}
      </div>

      <div className="border-y border-slate-200 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rows</h2>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">Pick a column layout for a new row.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {ROW_LAYOUTS.map((l, i) => {
          const total = l.layout.reduce((a, b) => a + b, 0);
          return (
            <Tile
              key={l.label}
              id={`layout:${i}`}
              data={{ kind: 'layout', layout: l.layout }}
              title={`Add ${l.label} row`}
              onClick={() => addRow(l.layout)}
            >
              <div className="flex h-5 w-full gap-1">
                {l.layout.map((n, j) => (
                  <div key={j} className="rounded-sm bg-slate-300" style={{ width: `${(n / total) * 100}%` }} />
                ))}
              </div>
              {l.label}
            </Tile>
          );
        })}
      </div>
    </aside>
  );
}
