import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Copy, Download, Monitor, Smartphone, Trash2, X } from 'lucide-react';
import type { Device } from '../types';
import { auditImageSources } from '../lib/audit';
import { resolveDesign } from '../lib/brand';
import { renderDesign } from '../lib/render';
import { downloadFile, slugify } from '../lib/util';
import { STARTERS } from '../lib/starters';
import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
  type SavedTemplate,
} from '../lib/storage';
import { useAccessibleBrands, useActiveBrand, useEditor } from '../store';
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
  // the preview is the export, so it resolves tokens the same way
  const html = useMemo(() => renderDesign(resolveDesign(design, brand, 'export')), [design, brand]);

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
  const html = useMemo(() => renderDesign(resolveDesign(design, brand, 'export')), [design, brand]);
  const kb = Math.round((new Blob([html]).size / 1024) * 10) / 10;
  const images = useMemo(() => auditImageSources(html), [html]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      notify('HTML copied to clipboard');
    } catch {
      notify('Copy failed — select the code and copy manually');
    }
  };

  return (
    <Modal title="Export HTML" onClose={onClose} wide>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
        <div className="text-xs text-slate-500">
          {kb} KB
          {kb > 100 && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
              Gmail clips emails larger than ~102 KB — reduce embedded images or content.
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className={ghostBtn} onClick={copy}>
            <Copy size={15} /> Copy
          </button>
          <button
            type="button"
            className={primaryBtn}
            onClick={() => downloadFile(`${slugify(design.body.title)}.html`, html, 'text/html')}
          >
            <Download size={15} /> Download .html
          </button>
        </div>
      </div>
      {!images.ok && (
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Images need attention before you send</p>
            {images.embedded > 0 && (
              <p className="mt-0.5">
                {images.embedded} embedded {images.embedded === 1 ? 'image is' : 'images are'} a{' '}
                <code>data:</code> URI. Gmail and most clients strip these — upload the file to your
                storage/CDN and paste the https URL instead (brand logos: use the hosted logo URL
                field).
              </p>
            )}
            {images.insecure.length > 0 && (
              <p className="mt-0.5">
                Not served over https: {images.insecure.slice(0, 3).join(', ')}
                {images.insecure.length > 3 ? ` and ${images.insecure.length - 3} more` : ''}.
              </p>
            )}
          </div>
        </div>
      )}
      <textarea
        readOnly
        spellCheck={false}
        value={html}
        className="min-h-[50vh] flex-1 resize-none bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 focus:outline-none"
        onFocus={(e) => e.currentTarget.select()}
      />
    </Modal>
  );
}

/* ---------------------------------------------------------------- templates */
export function TemplatesModal({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const design = useEditor((s) => s.design);
  const brands = useAccessibleBrands();
  const loadDesign = useEditor((s) => s.loadDesign);
  const [tab, setTab] = useState<'mine' | 'starters'>('mine');
  const [list, setList] = useState<SavedTemplate[]>(() => listTemplates());
  const [name, setName] = useState(design.body.title);

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

  const write = (existingId?: string) => {
    const saved = saveTemplate(name, design, existingId);
    if (!saved) return notify('Could not save — browser storage is full or unavailable');
    setList(listTemplates());
    notify(`Saved "${saved.name}"`);
  };

  const save = () => {
    // saving under a name that is already taken used to silently create a duplicate
    const clash = list.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (!clash) return write();
    confirm(
      {
        title: `Replace "${clash.name}"?`,
        message: 'A template with this name already exists. Saving will overwrite it.',
        confirmLabel: 'Overwrite',
        danger: true,
      },
      () => write(clash.id),
    );
  };

  return (
    <Modal title="Templates" onClose={onClose}>
      <div className="flex gap-1 border-b border-slate-200 px-5 pt-2">
        {(['mine', 'starters'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t === 'mine' ? 'My templates' : 'Starter templates'}
          </button>
        ))}
      </div>

      <div className="scroll-thin min-h-[320px] flex-1 overflow-y-auto p-5">
        {tab === 'mine' ? (
          <>
            <div className="mb-5 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <button type="button" className={primaryBtn} onClick={save}>
                Save current design
              </button>
            </div>
            {list.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No saved templates yet. Templates are stored in this browser.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                {list.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{t.name}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(t.updatedAt).toLocaleString()} · {t.design.rows.length} rows ·{' '}
                        {brands.find((b) => b.id === t.brandId)?.name ?? 'Default brand'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={ghostBtn}
                      onClick={() =>
                        replaceThen(() => {
                          loadDesign(t.design);
                          notify(`Loaded "${t.name}"`);
                          onClose();
                        })
                      }
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      title="Delete template"
                      aria-label={`Delete ${t.name}`}
                      className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() =>
                        confirm(
                          {
                            title: `Delete "${t.name}"?`,
                            message: 'This removes the saved template from this browser. It cannot be undone.',
                            confirmLabel: 'Delete',
                            danger: true,
                          },
                          () => {
                            deleteTemplate(t.id);
                            setList(listTemplates());
                          },
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {STARTERS.map((s) => (
              <li key={s.id} className="flex flex-col rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                <p className="mt-1 flex-1 text-xs text-slate-500">{s.description}</p>
                <button
                  type="button"
                  className={`${ghostBtn} mt-3 self-start`}
                  onClick={() =>
                    replaceThen(() => {
                      // a starter brings content, not a brand — keep the active one
                      loadDesign({ ...s.build(), brandId: design.brandId });
                      notify(`Started from "${s.name}"`);
                      onClose();
                    })
                  }
                >
                  Use this template
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
