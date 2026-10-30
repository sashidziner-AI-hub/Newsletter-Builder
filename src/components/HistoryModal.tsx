import { useMemo, useState } from 'react';
import { History, RotateCcw, Save } from 'lucide-react';
import { resolvedDesign } from '../lib/output';
import { renderDesign } from '../lib/render';
import { listVersions, type SavedTemplate } from '../lib/storage';
import { versionsFor, type VersionRecord } from '../lib/versions';
import { useActiveBrand, useEditor } from '../store';
import { Modal } from './Modals';
import { useConfirm } from './ConfirmDialog';

const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const ghostBtn =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50';

/** "just now", "5 min ago", "2 days ago" */
export function relativeTime(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const REASON_LABEL: Record<VersionRecord['reason'], string> = {
  manual: 'Saved version',
  auto: 'Auto snapshot',
  'pre-restore': 'Before a restore',
  'pre-replace': 'Before the canvas was replaced',
};

export function HistoryModal({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const currentEmailId = useEditor((s) => s.currentEmailId);
  const snapshot = useEditor((s) => s.snapshot);
  const restoreVersion = useEditor((s) => s.restoreVersion);
  const brand = useActiveBrand();
  const confirm = useConfirm();

  // re-read after every action so the list reflects what is stored
  const [tick, setTick] = useState(0);
  const versions = useMemo(
    () => (currentEmailId ? versionsFor(listVersions(), currentEmailId) : []),
    [currentEmailId, tick],
  );

  const [note, setNote] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = versions.find((v) => v.id === previewId) ?? null;

  const previewHtml = useMemo(
    () => (preview ? renderDesign(resolvedDesign(preview.design, brand, 'export')) : ''),
    [preview, brand],
  );

  const saveVersion = () => {
    const before = listVersions().length;
    snapshot('manual', note);
    const after = listVersions().length;
    setNote('');
    setTick((t) => t + 1);
    notify(after > before ? 'Version saved' : 'No changes since the last version');
  };

  const restore = (version: VersionRecord) =>
    confirm(
      {
        title: `Restore the version from ${relativeTime(version.at)}?`,
        message:
          'Your current design is snapshotted first, so you can come straight back to it from this list.',
        confirmLabel: 'Restore',
      },
      () => {
        // snapshot the present before loading the past: restore never destroys
        snapshot('pre-restore', 'Before restoring an earlier version');
        restoreVersion(version.design);
        setTick((t) => t + 1);
        notify(`Restored the version from ${relativeTime(version.at)}`);
        onClose();
      },
    );

  if (preview) {
    return (
      <Modal title={`Version from ${relativeTime(preview.at)}`} onClose={() => setPreviewId(null)} wide>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
          <p className="text-xs text-slate-500">
            Read-only preview · {new Date(preview.at).toLocaleString()} · {preview.rows} rows ·{' '}
            {preview.blocks} blocks
          </p>
          <div className="flex gap-2">
            <button type="button" className={ghostBtn} onClick={() => setPreviewId(null)}>
              Back to history
            </button>
            <button type="button" className={primaryBtn} onClick={() => restore(preview)}>
              <RotateCcw size={15} /> Restore this version
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-slate-200 p-4">
          <iframe
            title="Version preview"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={previewHtml}
            className="h-[70vh] w-full rounded bg-white shadow-lg"
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Version history" onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <input
          aria-label="Version note"
          value={note}
          placeholder="Optional note, e.g. before the legal review"
          onChange={(e) => setNote(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <button type="button" className={primaryBtn} disabled={!currentEmailId} onClick={saveVersion}>
          <Save size={15} /> Save version
        </button>
      </div>

      <div className="scroll-thin min-h-[320px] flex-1 overflow-y-auto p-5">
        {!currentEmailId ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            This email has not been saved yet. Make an edit and it will appear here.
          </p>
        ) : versions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No versions yet. One is taken automatically every few minutes while you edit, or save
            one now.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                    <History size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {v.note || REASON_LABEL[v.reason]}
                    </p>
                    <p className="text-xs text-slate-400">
                      {relativeTime(v.at)} · {new Date(v.at).toLocaleString()} · {v.rows} rows ·{' '}
                      {v.blocks} blocks
                    </p>
                  </div>
                  <button type="button" className={ghostBtn} onClick={() => setPreviewId(v.id)}>
                    Preview
                  </button>
                  <button
                    type="button"
                    className={ghostBtn}
                    aria-label={`Restore the version from ${relativeTime(v.at)}`}
                    onClick={() => restore(v)}
                  >
                    <RotateCcw size={14} /> Restore
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-snug text-slate-400">
              The last 20 versions of this email are kept. Restoring snapshots your current design
              first, so nothing is ever lost.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Shared by the top bar's status text. */
export function describeSave(
  status: 'idle' | 'saving' | 'saved' | 'error',
  at: number,
  message: string,
  now = Date.now(),
): string {
  if (status === 'error') return message || 'Not saved';
  if (status === 'saving') return 'Saving…';
  if (status === 'saved') return `Saved ${relativeTime(at, now)}`;
  return '';
}

export type { SavedTemplate };
