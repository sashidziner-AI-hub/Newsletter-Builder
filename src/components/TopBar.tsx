import { useRef } from 'react';
import {
  Braces,
  Code2,
  Eye,
  FilePlus2,
  FolderOpen,
  Mail,
  Monitor,
  Palette,
  Redo2,
  Smartphone,
  Undo2,
  Upload,
} from 'lucide-react';
import { resolvedDesign } from '../lib/output';
import { normalizeDesign } from '../lib/design-ops';
import { downloadFile, slugify } from '../lib/util';
import { useAccessibleBrands, useActiveBrand, useEditor } from '../store';
import { useConfirm } from './ConfirmDialog';

type ModalName = 'preview' | 'html' | 'templates' | 'brands' | 'new' | null;

function IconBtn({
  title,
  onClick,
  disabled,
  children,
  label,
  primary,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  label?: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'bg-brand-600 text-white hover:bg-brand-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
      {label && <span className="hidden xl:inline">{label}</span>}
    </button>
  );
}

export function TopBar({
  openModal,
  notify,
}: {
  openModal: (m: ModalName) => void;
  notify: (m: string) => void;
}) {
  const design = useEditor((s) => s.design);
  const device = useEditor((s) => s.device);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const { undo, redo, setDevice, updateBody, loadDesign, setBrandId } = useEditor.getState();
  const brands = useAccessibleBrands();
  const brand = useActiveBrand();
  const fileInput = useRef<HTMLInputElement>(null);

  const confirm = useConfirm();

  /** Runs `action` straight away on an empty canvas, otherwise asks first. */
  const replaceThen = (action: () => void) => {
    if (design.rows.length === 0) return action();
    confirm(
      {
        title: 'Replace the current design?',
        message: 'Unsaved changes will be lost.',
        confirmLabel: 'Replace',
        danger: true,
      },
      action,
    );
  };

  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = normalizeDesign(JSON.parse(await file.text()));
      if (!parsed) return notify('That file is not a valid email design JSON');
      replaceThen(() => {
        loadDesign(parsed);
        notify('Design imported');
      });
    } catch {
      notify('Could not read that file');
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Mail size={17} />
        </span>
        <span className="hidden text-sm font-semibold text-slate-900 lg:inline">Newsletter Builder</span>
      </div>

      <input
        aria-label="Email title"
        value={design.body.title}
        onChange={(e) => updateBody({ title: e.target.value })}
        className="w-56 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-800 hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />

      <div className="flex items-center gap-1">
        <label className="sr-only" htmlFor="brand-switcher">
          Brand
        </label>
        <span
          aria-hidden="true"
          className="h-5 w-5 shrink-0 rounded border border-slate-300"
          style={{ background: brand.tokens.colors.primary || '#fff' }}
        />
        <select
          id="brand-switcher"
          aria-label="Brand"
          title="Switching brand re-themes the email without changing its content"
          value={brand.id}
          onChange={(e) => setBrandId(e.target.value)}
          className="max-w-[9rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <IconBtn title="Manage brands" onClick={() => openModal('brands')}>
          <Palette size={17} />
        </IconBtn>
      </div>

      <div className="mx-auto flex items-center gap-1">
        <IconBtn title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={17} />
        </IconBtn>
        <IconBtn title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={17} />
        </IconBtn>
        <span className="mx-2 h-5 w-px bg-slate-200" />
        <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {(['desktop', 'mobile'] as const).map((d) => (
            <button
              key={d}
              type="button"
              title={d === 'desktop' ? 'Desktop view' : 'Mobile view'}
              aria-label={d === 'desktop' ? 'Desktop view' : 'Mobile view'}
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
              className={`rounded p-1.5 ${
                device === d ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {d === 'desktop' ? <Monitor size={16} /> : <Smartphone size={16} />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <IconBtn title="New email" label="New" onClick={() => openModal('new')}>
          <FilePlus2 size={17} />
        </IconBtn>
        <IconBtn title="Templates" label="Templates" onClick={() => openModal('templates')}>
          <FolderOpen size={17} />
        </IconBtn>
        <IconBtn title="Import JSON" label="Import" onClick={() => fileInput.current?.click()}>
          <Upload size={17} />
        </IconBtn>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void importJson(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <IconBtn
          title="Download design JSON"
          label="JSON"
          onClick={() =>
            // exported JSON carries resolved values and absolute URLs, never tokens
            downloadFile(
              `${slugify(design.body.title)}.json`,
              JSON.stringify(resolvedDesign(design, brand, 'export'), null, 2),
              'application/json',
            )
          }
        >
          <Braces size={17} />
        </IconBtn>
        <IconBtn title="Export HTML or plain text" label="Export" onClick={() => openModal('html')}>
          <Code2 size={17} />
        </IconBtn>
        <span className="mx-1.5 h-5 w-px bg-slate-200" />
        <IconBtn title="Preview" label="Preview" primary onClick={() => openModal('preview')}>
          <Eye size={17} />
        </IconBtn>
      </div>
    </header>
  );
}
