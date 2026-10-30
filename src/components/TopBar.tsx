import { useEffect, useRef, useState } from 'react';
import {
  Braces,
  Check,
  Code2,
  Eye,
  FilePlus2,
  FolderOpen,
  Mail,
  History,
  Monitor,
  Palette,
  Redo2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Undo2,
  Upload,
} from 'lucide-react';
import { summarise } from '../lib/checks';
import { resolvedDesign } from '../lib/output';
import { normalizeDesign } from '../lib/design-ops';
import { downloadFile, slugify } from '../lib/util';
import { useAccessibleBrands, useActiveBrand, useEditor, useVisibleIssues } from '../store';
import { useConfirm } from './ConfirmDialog';

type ModalName = 'preview' | 'html' | 'templates' | 'brands' | 'new' | 'history' | null;

/** "just now", "5 min ago" — kept in step by the 30 s tick below. */
function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'} ago`;
}

/**
 * Auto-save status. Never shows nothing after a failure: a storage problem has
 * to be visible, or the user will trust a save that did not happen.
 */
function SaveStatus() {
  const saveState = useEditor((s) => s.saveState);
  const [now, setNow] = useState(() => Date.now());

  // "Saved just now" has to become "Saved 5 min ago" on its own
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (saveState.status === 'idle') return null;

  const error = saveState.status === 'error';
  const text =
    error
      ? saveState.message || 'Not saved'
      : saveState.status === 'saving'
        ? 'Saving…'
        : `Saved ${ago(saveState.at, now)}`;

  return (
    <span
      role="status"
      title={error ? 'Export your work as JSON to be safe' : undefined}
      className={`hidden shrink-0 text-[11px] font-medium md:inline ${
        error ? 'text-red-600' : 'text-slate-400'
      }`}
    >
      {text}
      {!error && saveState.message ? ` · ${saveState.message}` : ''}
    </span>
  );
}

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
      {label && <span className="hidden 2xl:inline">{label}</span>}
    </button>
  );
}

/**
 * The Checks button. Its badge is the worst thing outstanding: red for errors,
 * amber for warnings, a green tick when the email is clean. It never disables
 * anything — it is a readout, not a gate.
 */
function ChecksButton() {
  const issues = useVisibleIssues();
  const open = useEditor((s) => s.checksOpen);
  const setChecksOpen = useEditor((s) => s.setChecksOpen);
  const counts = summarise(issues);

  const worst = counts.error > 0 ? 'error' : counts.warning > 0 ? 'warning' : 'clean';
  const title =
    worst === 'clean'
      ? counts.info > 0
        ? `Checks: ${counts.info} suggestion${counts.info === 1 ? '' : 's'}`
        : 'Checks: nothing to fix'
      : `Checks: ${counts.error} error${counts.error === 1 ? '' : 's'}, ${counts.warning} warning${
          counts.warning === 1 ? '' : 's'
        }`;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={open}
      onClick={() => setChecksOpen(!open)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
        open ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {worst === 'clean' ? (
        <ShieldCheck size={17} className={counts.info > 0 ? undefined : 'text-emerald-600'} />
      ) : (
        <ShieldAlert size={17} className={worst === 'error' ? 'text-red-600' : 'text-amber-600'} />
      )}
      <span
        className={`min-w-[1.1rem] rounded px-1 text-[11px] font-bold leading-[1.1rem] ${
          worst === 'error'
            ? 'bg-red-100 text-red-700'
            : worst === 'warning'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {worst === 'error' ? counts.error : worst === 'warning' ? counts.warning : <Check size={11} className="mx-auto" />}
      </span>
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
  const { undo, redo, setDevice, updateBody, startNewEmail, setBrandId } = useEditor.getState();
  const brands = useAccessibleBrands();
  const brand = useActiveBrand();
  const dirty = useEditor((s) => s.dirty);
  const fileInput = useRef<HTMLInputElement>(null);

  const confirm = useConfirm();

  /**
   * Auto-save means a replace no longer loses anything, so this only asks when
   * there is a change the debounce has not written yet.
   */
  const replaceThen = (action: () => void) => {
    if (!dirty) return action();
    confirm(
      {
        title: 'Replace the current design?',
        message: 'A change from the last couple of seconds may not be saved yet.',
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
        // an imported design is a new email, not an edit of the open one
        startNewEmail(parsed);
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

      {/* grows into free space rather than clipping at a fixed width; the
          tooltip covers titles longer than any toolbar could show */}
      <input
        aria-label="Email title"
        title={design.body.title}
        value={design.body.title}
        onChange={(e) => updateBody({ title: e.target.value })}
        className="min-w-[7rem] flex-1 basis-56 max-w-xs rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-800 hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />

      <SaveStatus />

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
        <IconBtn title="Version history" label="History" onClick={() => openModal('history')}>
          <History size={17} />
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
        <ChecksButton />
        <span className="mx-1.5 h-5 w-px bg-slate-200" />
        <IconBtn title="Preview" label="Preview" primary onClick={() => openModal('preview')}>
          <Eye size={17} />
        </IconBtn>
      </div>
    </header>
  );
}
