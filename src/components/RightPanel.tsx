import { Bookmark, Copy, Settings2, Trash2, Rows3 } from 'lucide-react';
import type { Block, Row } from '../types';
import { BLOCK_META } from '../lib/defaults';
import { findBlock } from '../lib/design-ops';
import { useEditor } from '../store';
import {
  ArticleListEditor,
  BodyEditor,
  ButtonEditor,
  DividerEditor,
  FooterEditor,
  HeaderEditor,
  HeadingEditor,
  HeroEditor,
  HtmlEditor,
  ImageEditor,
  MenuEditor,
  RowEditor,
  SocialEditor,
  TextEditor,
  VideoEditor,
} from './editors';
import { BlockIcon } from './icons';
import { DELETE_BLOCK, DELETE_ROW, useConfirm } from './ConfirmDialog';

function Header({
  icon,
  title,
  subtitle,
  onSaveAsBlock,
  onDuplicate,
  onDelete,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onSaveAsBlock?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-50 text-brand-600">{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="truncate text-[11px] text-slate-400">{subtitle}</p>}
      </div>
      {onSaveAsBlock && (
        <button
          type="button"
          title="Save as a reusable block"
          aria-label="Save as block"
          onClick={onSaveAsBlock}
          className="rounded-md p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-700"
        >
          <Bookmark size={15} />
        </button>
      )}
      {onDuplicate && (
        <button
          type="button"
          title="Duplicate"
          aria-label="Duplicate"
          onClick={onDuplicate}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <Copy size={15} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          title="Delete"
          aria-label="Delete"
          onClick={onDelete}
          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

export function RightPanel({
  onSaveAsBlock,
}: {
  onSaveAsBlock: (kind: 'block' | 'row', payload: Block | Row) => void;
}) {
  const design = useEditor((s) => s.design);
  const selection = useEditor((s) => s.selection);
  const revision = useEditor((s) => s.revision);
  const updateBlock = useEditor((s) => s.updateBlock);
  const updateRow = useEditor((s) => s.updateRow);
  const updateBody = useEditor((s) => s.updateBody);
  const resetBodyToBrand = useEditor((s) => s.resetBodyToBrand);
  const setRowLayout = useEditor((s) => s.setRowLayout);
  const duplicateBlock = useEditor((s) => s.duplicateBlock);
  const deleteBlock = useEditor((s) => s.deleteBlock);
  const duplicateRow = useEditor((s) => s.duplicateRow);
  const deleteRow = useEditor((s) => s.deleteRow);
  const confirm = useConfirm();

  let header: React.ReactNode;
  let content: React.ReactNode;

  if (selection.kind === 'block') {
    const loc = findBlock(design, selection.id);
    if (loc) {
      const block = loc.block;
      const label = BLOCK_META.find((m) => m.type === block.type)?.label ?? block.type;
      const set = (patch: object) => updateBlock(block.id, patch);
      // Header/Footer can extend their background across the whole row, which
      // is the only way to paint outside the content container.
      const onRowPatch = (patch: Partial<Row>) => updateRow(loc.row.id, patch);
      header = (
        <Header
          icon={<BlockIcon type={block.type} size={17} />}
          title={label}
          subtitle="Content block"
          onSaveAsBlock={() => onSaveAsBlock('block', block)}
          onDuplicate={() => duplicateBlock(block.id)}
          onDelete={() => confirm(DELETE_BLOCK, () => deleteBlock(block.id))}
        />
      );
      switch (block.type) {
        case 'heading':
          content = <HeadingEditor block={block} set={set} revision={revision} />;
          break;
        case 'text':
          content = <TextEditor block={block} set={set} revision={revision} />;
          break;
        case 'image':
          content = <ImageEditor block={block} set={set} revision={revision} />;
          break;
        case 'button':
          content = <ButtonEditor block={block} set={set} revision={revision} />;
          break;
        case 'divider':
          content = <DividerEditor block={block} set={set} revision={revision} />;
          break;
        case 'menu':
          content = <MenuEditor block={block} set={set} revision={revision} />;
          break;
        case 'social':
          content = <SocialEditor block={block} set={set} revision={revision} />;
          break;
        case 'video':
          content = <VideoEditor block={block} set={set} revision={revision} />;
          break;
        case 'html':
          content = <HtmlEditor block={block} set={set} revision={revision} />;
          break;
        case 'header':
          content = (
            <HeaderEditor block={block} set={set} revision={revision} onRowPatch={onRowPatch} />
          );
          break;
        case 'hero':
          content = <HeroEditor block={block} set={set} revision={revision} />;
          break;
        case 'articles':
          content = <ArticleListEditor block={block} set={set} revision={revision} />;
          break;
        case 'footer':
          content = (
            <FooterEditor block={block} set={set} revision={revision} onRowPatch={onRowPatch} />
          );
          break;
      }
    }
  } else if (selection.kind === 'row') {
    const row = design.rows.find((r) => r.id === selection.id);
    if (row) {
      header = (
        <Header
          icon={<Rows3 size={17} />}
          title="Row"
          subtitle={`${row.layout.length} column${row.layout.length > 1 ? 's' : ''}`}
          onSaveAsBlock={() => onSaveAsBlock('row', row)}
          onDuplicate={() => duplicateRow(row.id)}
          onDelete={() => confirm(DELETE_ROW, () => deleteRow(row.id))}
        />
      );
      content = (
        <RowEditor
          row={row}
          onLayout={(layout) => setRowLayout(row.id, layout)}
          onChange={(patch) => updateRow(row.id, patch)}
        />
      );
    }
  }

  if (!content) {
    header = <Header icon={<Settings2 size={17} />} title="Email settings" subtitle="Applies to the whole email" />;
    content = <BodyEditor body={design.body} onChange={updateBody} onResetToBrand={resetBodyToBrand} />;
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      {header}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{content}</div>
    </aside>
  );
}
