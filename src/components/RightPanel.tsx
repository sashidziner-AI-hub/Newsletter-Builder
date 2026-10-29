import { Copy, Settings2, Trash2, Rows3 } from 'lucide-react';
import { BLOCK_META } from '../lib/defaults';
import { findBlock } from '../lib/design-ops';
import { useEditor } from '../store';
import {
  BodyEditor,
  ButtonEditor,
  DividerEditor,
  HeadingEditor,
  HtmlEditor,
  ImageEditor,
  MenuEditor,
  RowEditor,
  SocialEditor,
  TextEditor,
  VideoEditor,
} from './editors';
import { BlockIcon } from './icons';

function Header({
  icon,
  title,
  subtitle,
  onDuplicate,
  onDelete,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
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

export function RightPanel() {
  const design = useEditor((s) => s.design);
  const selection = useEditor((s) => s.selection);
  const revision = useEditor((s) => s.revision);
  const updateBlock = useEditor((s) => s.updateBlock);
  const updateRow = useEditor((s) => s.updateRow);
  const updateBody = useEditor((s) => s.updateBody);
  const setRowLayout = useEditor((s) => s.setRowLayout);
  const duplicateBlock = useEditor((s) => s.duplicateBlock);
  const deleteBlock = useEditor((s) => s.deleteBlock);
  const duplicateRow = useEditor((s) => s.duplicateRow);
  const deleteRow = useEditor((s) => s.deleteRow);

  let header: React.ReactNode;
  let content: React.ReactNode;

  if (selection.kind === 'block') {
    const loc = findBlock(design, selection.id);
    if (loc) {
      const block = loc.block;
      const label = BLOCK_META.find((m) => m.type === block.type)?.label ?? block.type;
      const set = (patch: object) => updateBlock(block.id, patch);
      header = (
        <Header
          icon={<BlockIcon type={block.type} size={17} />}
          title={label}
          subtitle="Content block"
          onDuplicate={() => duplicateBlock(block.id)}
          onDelete={() => deleteBlock(block.id)}
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
          onDuplicate={() => duplicateRow(row.id)}
          onDelete={() => deleteRow(row.id)}
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
    content = <BodyEditor body={design.body} onChange={updateBody} />;
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      {header}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{content}</div>
    </aside>
  );
}
