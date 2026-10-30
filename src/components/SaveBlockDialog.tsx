import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Block, Row } from '../types';
import { hasDataUri } from '../lib/blocks-library';
import { useEditor } from '../store';
import { Modal } from './Modals';

/**
 * Name a block or row before it joins the library. Category is free text so the
 * team can settle on its own vocabulary (CTA, Banner, Signature…).
 */
export function SaveBlockDialog({
  kind,
  payload,
  onClose,
  notify,
}: {
  kind: 'block' | 'row';
  payload: Block | Row;
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const addSavedBlock = useEditor((s) => s.addSavedBlock);
  const categories = useEditor((s) => s.savedBlocks);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');

  const embedded = useMemo(() => hasDataUri(payload), [payload]);
  const known = useMemo(
    () => [...new Set(categories.map((b) => b.category).filter(Boolean))].sort(),
    [categories],
  );

  const save = () => {
    if (!name.trim()) return;
    addSavedBlock(name, category, kind, payload);
    notify(`Saved "${name.trim()}" to your blocks`);
    onClose();
  };

  const input =
    'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

  return (
    <Modal title={kind === 'row' ? 'Save row as a block' : 'Save as a block'} onClose={onClose}>
      <div className="space-y-4 p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Name <span className="text-red-600">*</span>
          </span>
          <input
            autoFocus
            aria-label="Block name"
            className={input}
            value={name}
            placeholder="e.g. Orange CTA band"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Category (optional)</span>
          <input
            aria-label="Block category"
            className={input}
            value={category}
            placeholder="e.g. CTA, Banner, Signature"
            list="saved-block-categories"
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="saved-block-categories">
            {known.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <p className="text-[11px] leading-snug text-slate-400">
          Brand colours and fonts are stored as tokens, so this block re-themes with whichever
          brand is active. Anything you set by hand stays exactly as it is.
        </p>

        {embedded && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <p>
              <span className="font-semibold">This block contains an uploaded image.</span> Embedded{' '}
              <code>data:</code> images are stripped by Gmail and most clients, so it will not show
              in a real inbox. Replace it with a hosted https URL before sending.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Save block
        </button>
      </div>
    </Modal>
  );
}
