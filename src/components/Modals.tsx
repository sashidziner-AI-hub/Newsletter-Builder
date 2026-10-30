import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Monitor,
  ShieldAlert,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import type { Device } from '../types';
import { summarise } from '../lib/checks';
import { resolveForOutput, resolvedDesign } from '../lib/output';
import { toPlainText } from '../lib/plaintext';
import { renderDesign } from '../lib/render';
import { downloadFile, slugify } from '../lib/util';
import {
  deleteTemplate,
  duplicateTemplate,
  formatBytes,
  listTemplates,
  renameTemplate,
  storageUsage,
  type SavedTemplate,
} from '../lib/storage';
import { useAccessibleBrands, useActiveBrand, useEditor, useVisibleIssues } from '../store';
import { useConfirm } from './ConfirmDialog';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl ${
          wide ? 'max-w-5xl' : 'max-w-2xl'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const ghostBtn =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50';

/* ------------------------------------------------------------------ preview */
export function PreviewModal({ onClose }: { onClose: () => void }) {
  const design = useEditor((s) => s.design);
  const brand = useActiveBrand();
  const [device, setDevice] = useState<Device>('desktop');
  // the preview is the export, so it goes through the same boundary: brand
  // tokens, UTM and merge-tag formatting all included
  const html = useMemo(() => renderDesign(resolvedDesign(design, brand, 'export')), [design, brand]);

  return (
    <Modal title="Preview" onClose={onClose} wide>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-2">
        <p className="text-xs text-slate-500">This is the exact HTML that will be exported.</p>
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
          {(['desktop', 'mobile'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
                device === d ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {d === 'desktop' ? <Monitor size={14} /> : <Smartphone size={14} />}
              {d === 'desktop' ? 'Desktop' : 'Mobile'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-slate-200 p-4">
        <iframe
          title="Email preview"
          // no scripts; links may open in new tabs
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={html}
          className="h-[70vh] rounded bg-white shadow-lg"
          style={{ width: device === 'mobile' ? 375 : '100%', maxWidth: '100%' }}
        />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- export */
export function ExportHtmlModal({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const design = useEditor((s) => s.design);
  const brand = useActiveBrand();
  const [tab, setTab] = useState<'html' | 'text'>('html');

  // one boundary pass gives both outputs and the UTM counts
  const out = useMemo(() => resolveForOutput(design, brand, 'export'), [design, brand]);
  const html = useMemo(() => renderDesign(out.design), [out]);
  const plain = useMemo(() => toPlainText(out.design), [out]);

  const body = tab === 'html' ? html : plain;
  const kb = Math.round((new Blob([body]).size / 1024) * 10) / 10;
  const utmOn = design.body.utm.enabled;
  const setChecksOpen = useEditor((s) => s.setChecksOpen);

  // the same engine result the badge shows; the size warning that used to live
  // here is its SIZE rule now, so there is one verdict rather than two
  const issues = useVisibleIssues();
  const counts = summarise(issues);

  /** Hand the detail over to the drawer rather than duplicating it here. */
  const openChecks = () => {
    setChecksOpen(true);
    onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      notify(tab === 'html' ? 'HTML copied to clipboard' : 'Plain text copied to clipboard');
    } catch {
      notify('Copy failed — select the text and copy manually');
    }
  };

  const download = () =>
    tab === 'html'
      ? downloadFile(`${slugify(design.body.title)}.html`, html, 'text/html')
      : downloadFile(`${slugify(design.body.title)}.txt`, plain, 'text/plain');

  return (
    <Modal title="Export" onClose={onClose} wide>
      <div className="flex gap-1 border-b border-slate-200 px-5 pt-2">
        {(['html', 'text'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t === 'html' ? 'HTML' : 'Plain text'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
        <div className="text-xs text-slate-500">
          {kb} KB
          {utmOn && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
              UTM added to {out.utm.added} {out.utm.added === 1 ? 'link' : 'links'}, skipped{' '}
              {out.utm.skipped}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className={ghostBtn} onClick={copy}>
            <Copy size={15} /> Copy
          </button>
          <button type="button" className={primaryBtn} onClick={download}>
            <Download size={15} /> Download {tab === 'html' ? '.html' : '.txt'}
          </button>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
        {counts.total === 0 ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 size={14} className="shrink-0" /> Checks passed
          </p>
        ) : (
          <p
            className={`flex items-center gap-1.5 text-xs font-medium ${
              counts.error > 0 ? 'text-red-700' : 'text-amber-800'
            }`}
          >
            {counts.error > 0 ? (
              <ShieldAlert size={14} className="shrink-0" />
            ) : (
              <AlertTriangle size={14} className="shrink-0" />
            )}
            {[
              counts.error > 0 && `${counts.error} error${counts.error === 1 ? '' : 's'}`,
              counts.warning > 0 && `${counts.warning} warning${counts.warning === 1 ? '' : 's'}`,
              counts.info > 0 && `${counts.info} suggestion${counts.info === 1 ? '' : 's'}`,
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
        )}
        {counts.total > 0 && (
          <button
            type="button"
            onClick={openChecks}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:border-brand-500 hover:text-brand-700"
          >
            Open checks &rarr;
          </button>
        )}
        <p className="ml-auto text-[11px] text-slate-400">
          Warnings only &mdash; the export is never blocked.
        </p>
      </div>
      <textarea
        readOnly
        aria-label={tab === 'html' ? 'Exported HTML' : 'Exported plain text'}
        spellCheck={false}
        value={body}
        className={`min-h-[50vh] flex-1 resize-none p-4 font-mono text-xs leading-relaxed focus:outline-none ${
          tab === 'html' ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'
        }`}
        onFocus={(e) => e.currentTarget.select()}
      />
    </Modal>
  );
}

/* ---------------------------------------------------------------- templates */
export function TemplatesModal({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const design = useEditor((s) => s.design);
  const currentEmailId = useEditor((s) => s.currentEmailId);
  const dirty = useEditor((s) => s.dirty);
  const brands = useAccessibleBrands();
  const openEmail = useEditor((s) => s.openEmail);
  const snapshot = useEditor((s) => s.snapshot);
  const [list, setList] = useState<SavedTemplate[]>(() => listTemplates());
  const [name, setName] = useState(design.body.title);

  const confirm = useConfirm();
  const usage = useMemo(() => storageUsage(), [list]);

  const refresh = () => setList(listTemplates());

  /** Auto-save means opening another email loses nothing unless mid-debounce. */
  const replaceThen = (action: () => void) => {
    if (!dirty) return action();
    confirm(
      {
        title: 'Open another email?',
        message: 'A change from the last couple of seconds may not be saved yet.',
        confirmLabel: 'Open',
      },
      action,
    );
  };

  const open = (t: SavedTemplate) =>
    replaceThen(() => {
      // snapshot what is on the canvas before it is replaced
      snapshot('pre-replace', 'Before opening another email');
      openEmail(t);
      notify(`Opened "${t.name}"`);
      onClose();
    });

  /** Name the record being edited, promoting it out of the drafts group. */
  const rename = () => {
    if (!currentEmailId) return notify('Make an edit first — this email has no record yet');
    if (!name.trim()) return notify('Give the email a name first');
    const saved = renameTemplate(currentEmailId, name);
    if (!saved) return notify('Could not save — browser storage is full');
    refresh();
    notify(`Renamed to "${saved.name}"`);
  };

  /** A separate record with a new id, so the original is left alone. */
  const saveCopy = () => {
    if (!name.trim()) return notify('Give the copy a name first');
    const saved = duplicateTemplate(design, name);
    if (!saved) return notify('Could not save — browser storage is full');
    refresh();
    openEmail(saved);
    notify(`Saved a copy as "${saved.name}" — you are now editing the copy`);
  };

  const remove = (t: SavedTemplate) =>
    confirm(
      {
        title: `Delete "${t.name}"?`,
        message:
          'This removes the email and its version history from this browser. It cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
      },
      () => {
        deleteTemplate(t.id);
        refresh();
        notify(`Deleted "${t.name}"`);
      },
    );

  const named = list.filter((t) => !t.autoSaved);
  const drafts = list.filter((t) => t.autoSaved);

  const row = (t: SavedTemplate) => (
    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {t.name}
          {t.id === currentEmailId && (
            <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
              editing
            </span>
          )}
        </p>
        <p className="text-xs text-slate-400">
          {new Date(t.updatedAt).toLocaleString()} · {t.design.rows.length} rows ·{' '}
          {brands.find((b) => b.id === t.brandId)?.name ?? 'Default brand'}
        </p>
      </div>
      {t.id !== currentEmailId && (
        <button type="button" className={ghostBtn} onClick={() => open(t)}>
          Open
        </button>
      )}
      <button
        type="button"
        title="Delete"
        aria-label={`Delete ${t.name}`}
        className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
        onClick={() => remove(t)}
      >
        <Trash2 size={16} />
      </button>
    </li>
  );

  return (
    <Modal title="Templates" onClose={onClose}>
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-2.5">
        <p className="text-[11px] text-slate-500">
          Your emails are saved automatically as you work. For a ready-made starting point, use
          <span className="font-medium text-slate-700"> New</span> instead.
        </p>
      </div>

      <div className="scroll-thin min-h-[320px] flex-1 overflow-y-auto p-5">
        <div className="mb-5 flex flex-wrap gap-2">
          <input
            aria-label="Email name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Email name"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <button type="button" className={primaryBtn} onClick={rename}>
            Rename this email
          </button>
          <button type="button" className={ghostBtn} onClick={saveCopy}>
            Save as a copy
          </button>
        </div>

        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Nothing saved yet. Make an edit and this email will appear here on its own.
          </p>
        ) : (
          <>
            {named.length > 0 && (
              <>
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  My templates
                </h3>
                <ul className="mb-5 divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {named.map(row)}
                </ul>
              </>
            )}
            {drafts.length > 0 && (
              <>
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Drafts (auto-saved)
                </h3>
                <ul className="divide-y divide-slate-200 rounded-lg border border-dashed border-slate-300">
                  {drafts.map(row)}
                </ul>
                <p className="mt-2 text-[11px] leading-snug text-slate-400">
                  These were created automatically. Give one a name above to move it into your
                  templates.
                </p>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-2.5">
        <p className="text-[11px] text-slate-500">
          Storage: {formatBytes(usage.bytes)} of about {formatBytes(usage.limit)}
        </p>
        {usage.bytes > usage.limit * 0.8 && (
          <p className="text-[11px] font-medium text-amber-700">
            Running low — export emails you no longer need as JSON, then delete them.
          </p>
        )}
      </div>
    </Modal>
  );
}
