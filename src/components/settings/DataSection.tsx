import { useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  type BackupData,
  type BackupSummary,
  exportBackup,
  importBackup,
  summarizeBackup,
  validateBackupShape,
} from '../../lib/backup';
import { clearAllLocalData } from '../../lib/clear-all';
import { formatBytes, storageUsage } from '../../lib/storage';
import { downloadFile, slugify } from '../../lib/util';
import { useConfirm } from '../ConfirmDialog';

const DELETE_PHRASE = 'DELETE';

export function DataSection({ notify }: { notify: (m: string) => void }) {
  const usage = storageUsage();
  const fileInput = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const [pendingImport, setPendingImport] = useState<{ summary: BackupSummary; data: BackupData } | null>(null);
  const [deleteText, setDeleteText] = useState('');
  const [showDanger, setShowDanger] = useState(false);

  const exportAll = () => {
    const data = exportBackup();
    downloadFile(
      `newsletter-builder-backup-${slugify(new Date(data.exportedAt).toISOString().slice(0, 10))}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    );
  };

  const pickImportFile = () => fileInput.current?.click();

  const onFileChosen = async (file?: File) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const result = validateBackupShape(raw);
      if (!result.ok) {
        notify(`Could not read that backup: ${result.reason}`);
        return;
      }
      setPendingImport({ summary: summarizeBackup(result.data), data: result.data });
    } catch {
      notify('Could not read that file as JSON.');
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    const { data, summary } = pendingImport;
    confirm(
      {
        title: 'Overwrite local data with this backup?',
        message: `This replaces ${summary.brands} brand(s), ${summary.templates} email(s), ${summary.savedBlocks} saved block(s) and ${summary.images} image(s) in this browser. Your AI key is not affected.`,
        confirmLabel: 'Overwrite',
        danger: true,
      },
      () => {
        importBackup(data);
        setPendingImport(null);
        window.location.reload();
      },
    );
  };

  const clearAll = () => {
    if (deleteText !== DELETE_PHRASE) return;
    confirm(
      {
        title: 'Clear all local data?',
        message:
          'Every brand, email, saved block, image, version, AI key and generated draft in this browser is deleted. This cannot be undone.',
        confirmLabel: 'Clear everything',
        danger: true,
      },
      () => {
        void clearAllLocalData().then(() => window.location.reload());
      },
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-600">Storage</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${usage.bytes > usage.limit * 0.8 ? 'bg-amber-500' : 'bg-brand-500'}`}
            style={{ width: `${Math.min(100, (usage.bytes / usage.limit) * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {formatBytes(usage.bytes)} of about {formatBytes(usage.limit)}
        </p>
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-4">
        <p className="text-[11px] font-medium text-slate-600">Backup</p>
        <button
          type="button"
          onClick={exportAll}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export all data
        </button>
        <p className="text-[10px] leading-snug text-slate-400">
          Brands, emails, saved blocks, the image library and version history, as one JSON file.
          Never includes your AI key.
        </p>

        <div className="pt-1">
          <button
            type="button"
            onClick={pickImportFile}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Import backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void onFileChosen(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {pendingImport && (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-800">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              Found {pendingImport.summary.brands} brand(s), {pendingImport.summary.templates} email(s),{' '}
              {pendingImport.summary.savedBlocks} saved block(s), {pendingImport.summary.images} image(s).
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={confirmImport}
                className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
              >
                Review and overwrite
              </button>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-red-200 pt-4">
        {!showDanger ? (
          <button
            type="button"
            onClick={() => setShowDanger(true)}
            className="text-[11px] font-medium text-red-700 hover:underline"
          >
            Danger zone
          </button>
        ) : (
          <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-2.5">
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-red-800">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              Deletes every brand, email, saved block, image, version, your AI key and any
              generated drafts in this browser. This cannot be undone.
            </p>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-red-800">
                Type {DELETE_PHRASE} to confirm
              </span>
              <input
                className="w-full rounded-md border border-red-300 px-2 py-1 text-xs"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={deleteText !== DELETE_PHRASE}
              onClick={clearAll}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Clear all local data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
