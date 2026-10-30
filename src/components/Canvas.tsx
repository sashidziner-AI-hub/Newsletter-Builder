import { memo, useEffect, useMemo, useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import DOMPurify from 'dompurify';
import { Copy, GripVertical, Trash2 } from 'lucide-react';
import type { Block, BodySettings, Column, Design, Device, Row } from '../types';
import { BLOCK_META } from '../lib/defaults';
import { resolvedDesign } from '../lib/output';
import { columnWidths, renderBlock } from '../lib/render';
import { useActiveBrand, useEditor, useSampleData } from '../store';
import { DropLine, useDropHint } from './dnd';
import { DELETE_BLOCK, DELETE_ROW, useConfirm } from './ConfirmDialog';

const MOBILE_WIDTH = 375;

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}

/* ------------------------------------------------------------------- block */
const BlockView = memo(function BlockView({
  block,
  column,
  colWidth,
  body,
  selected,
  index,
}: {
  block: Block;
  column: Column;
  colWidth: number;
  body: BodySettings;
  selected: boolean;
  index: number;
}) {
  const select = useEditor((s) => s.select);
  const duplicateBlock = useEditor((s) => s.duplicateBlock);
  const deleteBlock = useEditor((s) => s.deleteBlock);
  const confirm = useConfirm();
  const hint = useDropHint();

  const node = useRef<HTMLDivElement | null>(null);

  /**
   * A block selected from the Checks drawer can be far off-screen. `nearest`
   * does nothing when the block is already fully visible, so clicking a block
   * in the canvas never jolts the page.
   */
  useEffect(() => {
    if (selected) node.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const drag = useDraggable({ id: `b:${block.id}`, data: { kind: 'block', blockId: block.id } });
  const drop = useDroppable({ id: block.id, data: { kind: 'block', blockId: block.id, columnId: column.id } });

  // Only the properties that affect rendering are dependencies; `body` fields used by the renderer are listed explicitly.
  const html = useMemo(
    () =>
      sanitize(
        renderBlock(block, { version: 1, brandId: null, body, rows: [] }, { colWidth, editor: true }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block, colWidth, body.fontFamily, body.linkColor, body.textColor],
  );

  const label = BLOCK_META.find((m) => m.type === block.type)?.label ?? block.type;
  const showLineBefore = hint?.type === 'block' && hint.columnId === column.id && hint.index === index;
  // "Show footer" off: keep it visible but obviously excluded, so it is still
  // selectable and deletable. Preview and export leave it out entirely.
  const hiddenOnSend = block.type === 'footer' && !body.showFooter;

  return (
    <div
      ref={(el) => {
        node.current = el;
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.attributes}
      {...drag.listeners}
      role="button"
      aria-label={`${label} block`}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'block', id: block.id });
      }}
      className={`group/block relative cursor-grab outline-offset-[-1px] ${
        selected ? 'outline outline-2 outline-brand-500' : 'hover:outline hover:outline-1 hover:outline-brand-500/60'
      } ${drag.isDragging ? 'opacity-30' : ''}`}
    >
      {showLineBefore && <DropLine className="-top-[2px]" />}
      <div
        className={`eb-canvas-content pointer-events-none ${hiddenOnSend ? 'opacity-40' : ''}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {hiddenOnSend && (
        <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
          Hidden on send
        </span>
      )}
      {selected && (
        <div className="absolute -top-7 right-0 z-20 flex items-center gap-0.5 rounded-md bg-brand-600 p-0.5 text-white shadow-md">
          <span className="flex items-center gap-1 px-1.5 text-[11px] font-medium">
            <GripVertical size={12} /> {label}
          </span>
          <button
            type="button"
            title="Duplicate"
            aria-label="Duplicate block"
            className="rounded p-1 hover:bg-white/20"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              duplicateBlock(block.id);
            }}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            title="Delete"
            aria-label="Delete block"
            className="rounded p-1 hover:bg-white/20"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              confirm(DELETE_BLOCK, () => deleteBlock(block.id));
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ column */
function ColumnView({
  column,
  rowId,
  ratio,
  colWidth,
  design,
  selectedBlockId,
}: {
  column: Column;
  rowId: string;
  ratio: number;
  colWidth: number;
  design: Design;
  selectedBlockId: string | null;
}) {
  const hint = useDropHint();
  const select = useEditor((s) => s.select);
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { kind: 'column', columnId: column.id, rowId } });
  const hinted = hint?.type === 'block' && hint.columnId === column.id;
  const endLine = hinted && hint.index === column.blocks.length && column.blocks.length > 0;

  return (
    <div
      ref={setNodeRef}
      className="eb-colwrap relative min-h-[56px]"
      style={{ flex: `${ratio} 1 0`, minWidth: 0 }}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'row', id: rowId });
      }}
    >
      {column.blocks.map((b, i) => (
        <BlockView
          key={b.id}
          block={b}
          column={column}
          index={i}
          colWidth={colWidth}
          body={design.body}
          selected={selectedBlockId === b.id}
        />
      ))}
      {column.blocks.length === 0 && (
        <div
          className={`m-2 flex min-h-[44px] items-center justify-center rounded border-2 border-dashed px-2 text-center text-xs ${
            hinted || isOver
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-slate-300 text-slate-400'
          }`}
        >
          Drop content here
        </div>
      )}
      {endLine && <DropLine className="-bottom-[2px]" />}
    </div>
  );
}

/* --------------------------------------------------------------------- row */
function RowView({
  row,
  index,
  total,
  design,
  device,
  selected,
  selectedBlockId,
}: {
  row: Row;
  index: number;
  total: number;
  design: Design;
  device: Device;
  selected: boolean;
  selectedBlockId: string | null;
}) {
  const select = useEditor((s) => s.select);
  const duplicateRow = useEditor((s) => s.duplicateRow);
  const deleteRow = useEditor((s) => s.deleteRow);
  const confirm = useConfirm();
  const hint = useDropHint();

  const drop = useDroppable({ id: row.id, data: { kind: 'row', rowId: row.id } });
  const drag = useDraggable({ id: `r:${row.id}`, data: { kind: 'row', rowId: row.id } });

  const stacked = device === 'mobile' && row.stackOnMobile;
  const widths = useMemo(() => columnWidths(design, row), [design, row]);
  const contentBg = row.contentBgColor || design.body.contentBgColor;
  const lineBefore = hint?.type === 'row' && hint.index === index;
  const lineAfter = hint?.type === 'row' && hint.index === total && index === total - 1;
  const mobileInner = MOBILE_WIDTH - row.padding.left - row.padding.right;

  return (
    <div
      ref={(node) => {
        drop.setNodeRef(node);
        drag.setNodeRef(node);
      }}
      className={`group/row relative ${drag.isDragging ? 'opacity-30' : ''}`}
      style={{ background: row.bgColor || undefined }}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'row', id: row.id });
      }}
    >
      {lineBefore && <DropLine className="-top-[2px]" />}
      <div
        className={`relative mx-auto ${
          selected ? 'outline outline-2 outline-offset-[-2px] outline-brand-500/70' : 'group-hover/row:outline group-hover/row:outline-1 group-hover/row:outline-offset-[-1px] group-hover/row:outline-dashed group-hover/row:outline-slate-400'
        }`}
        style={{
          width: device === 'mobile' ? '100%' : design.body.width,
          maxWidth: '100%',
          background: contentBg || undefined,
          padding: `${row.padding.top}px ${row.padding.right}px ${row.padding.bottom}px ${row.padding.left}px`,
        }}
      >
        <div className={`eb-cols flex ${row.stackOnMobile ? 'eb-stack' : ''}`}>
          {row.columns.map((c, i) => (
            <ColumnView
              key={c.id}
              column={c}
              rowId={row.id}
              ratio={row.layout[i] ?? 1}
              colWidth={stacked ? mobileInner : widths[i]}
              design={design}
              selectedBlockId={selectedBlockId}
            />
          ))}
        </div>

        <div
          className={`absolute -left-0 top-0 z-20 flex -translate-y-full items-center gap-0.5 rounded-t-md bg-slate-700 p-0.5 text-white shadow ${
            selected ? 'flex' : 'hidden group-hover/row:flex'
          }`}
        >
          <button
            type="button"
            title="Drag to reorder row"
            aria-label="Drag row"
            ref={drag.setActivatorNodeRef}
            {...drag.attributes}
            {...drag.listeners}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab rounded p-1 hover:bg-white/20 active:cursor-grabbing"
          >
            <GripVertical size={13} />
          </button>
          <span className="px-1 text-[11px] font-medium">Row</span>
          <button
            type="button"
            title="Duplicate row"
            aria-label="Duplicate row"
            className="rounded p-1 hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              duplicateRow(row.id);
            }}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            title="Delete row"
            aria-label="Delete row"
            className="rounded p-1 hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              confirm(DELETE_ROW, () => deleteRow(row.id));
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {lineAfter && <DropLine className="-bottom-[2px]" />}
    </div>
  );
}

/* ------------------------------------------------------------------ canvas */
function EndZone({ empty }: { empty: boolean }) {
  const hint = useDropHint();
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-end', data: { kind: 'canvas' } });
  const active = isOver || (hint?.type === 'row' && empty);
  return (
    <div ref={setNodeRef} className={`relative ${empty ? 'min-h-[320px]' : 'min-h-[140px]'} p-4`}>
      {empty && (
        <div
          className={`mx-auto mt-6 flex max-w-md flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center ${
            active ? 'border-brand-500 bg-brand-50/70' : 'border-slate-300 bg-white/60'
          }`}
        >
          <p className="text-sm font-semibold text-slate-700">Start building your email</p>
          <p className="mt-1 text-xs text-slate-500">
            Drag a row layout or a content block here, or click one in the left panel.
          </p>
        </div>
      )}
    </div>
  );
}

export function Canvas() {
  const raw = useEditor((s) => s.design);
  const brand = useActiveBrand();
  const sampleData = useSampleData();
  const device = useEditor((s) => s.device);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const selectedBlockId = selection.kind === 'block' ? selection.id : null;

  // The canvas renders a resolved copy, so switching brands re-themes it live.
  // 'preview' mode may use uploaded logos and never applies UTM; with the sample
  // data toggle on, merge tags show their sample values instead.
  const design = useMemo(
    () => resolvedDesign(raw, brand, 'preview', { sampleData }),
    [raw, brand, sampleData],
  );

  return (
    <main
      className="scroll-thin min-w-0 flex-1 overflow-auto bg-slate-200"
      onClick={() => select({ kind: 'body' })}
    >
      <div
        className={`mx-auto my-6 min-h-[480px] shadow-lg ${device === 'mobile' ? 'eb-mobile overflow-hidden rounded-[22px] ring-8 ring-slate-800' : ''}`}
        style={{
          width: device === 'mobile' ? MOBILE_WIDTH : 'calc(100% - 48px)',
          minWidth: device === 'mobile' ? undefined : Math.min(design.body.width, 480),
          background: design.body.bgColor,
          fontFamily: design.body.fontFamily,
          color: design.body.textColor,
        }}
      >
        {design.rows.map((row, i) => (
          <RowView
            key={row.id}
            row={row}
            index={i}
            total={design.rows.length}
            design={design}
            device={device}
            selected={selection.kind === 'row' && selection.id === row.id}
            selectedBlockId={selectedBlockId}
          />
        ))}
        <EndZone empty={design.rows.length === 0} />
      </div>
    </main>
  );
}
