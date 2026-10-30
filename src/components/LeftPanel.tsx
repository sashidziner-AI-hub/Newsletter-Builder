import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Check, Download, Pencil, Search, Trash2, Upload, X } from 'lucide-react';
import type { BlockType } from '../types';
import {
  type SavedBlock,
  exportEnvelope,
  exportFilename,
  groupByCategory,
  labelFor,
  planImport,
  searchBlocks,
} from '../lib/blocks-library';
import { BLOCK_META, ROW_LAYOUTS } from '../lib/defaults';
import { findBlock } from '../lib/design-ops';
import { downloadFile } from '../lib/util';
import { useEditor } from '../store';
import { useConfirm } from './ConfirmDialog';
import { BlockIcon } from './icons';
import { SavedBlockThumb } from './SavedBlockThumb';
import { ImageLibrary } from './ImageLibrary';

type Tab = 'content' | 'rows' | 'saved' | 'images';

function Tile({
  id,
  data,
  title,
  onClick,
  children,
}: {
  id: string;
  data: Record<string, unknown>;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <button
      ref={setNodeRef}
      type="button"
      title={title}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`flex cursor-grab flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-600 transition-all hover:border-brand-500 hover:text-brand-700 hover:shadow-sm active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------- one library item */

function SavedItem({
  saved,
  onInsert,
  onRename,
  onDelete,
}: {
  saved: SavedBlock;
  onInsert: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved.name);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `saved:${saved.id}`,
    data: { kind: saved.kind === 'row' ? 'saved-row' : 'saved-block', saved },
  });

  const commit = () => {
    const next = draft.trim();
    if (next && next !== saved.name) onRename(next);
    setEditing(false);
  };

  return (
    <li
      className={`rounded-lg border border-slate-200 bg-white p-2 transition-all hover:border-brand-500 hover:shadow-sm ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        title={`Add "${saved.name}" — or drag it onto the canvas`}
        aria-label={`Add ${saved.name}`}
        onClick={onInsert}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onInsert();
          }
        }}
        className="block cursor-grab active:cursor-grabbing"
      >
        <SavedBlockThumb saved={saved} width={216} height={104} />
      </div>

      <div className="mt-1.5 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              aria-label={`Rename ${saved.name}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setDraft(saved.name);
                  setEditing(false);
                }
              }}
              className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs focus:border-brand-500 focus:outline-none"
            />
          ) : (
            <p className="truncate text-xs font-medium text-slate-800">{saved.name}</p>
          )}
          <p className="truncate text-[10px] text-slate-400">{labelFor(saved)}</p>
        </div>
        {editing ? (
          <button
            type="button"
            title="Save name"
            aria-label="Save name"
            onClick={commit}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Check size={13} />
          </button>
        ) : (
          <button
            type="button"
            title="Rename"
            aria-label={`Rename ${saved.name}`}
            onClick={() => {
              setDraft(saved.name);
              setEditing(true);
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil size={13} />
          </button>
        )}
        <button
          type="button"
          title="Delete"
          aria-label={`Delete ${saved.name}`}
          onClick={onDelete}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

/* ------------------------------------------------------- the saved blocks tab */

function SavedBlocksTab({ notify }: { notify: (m: string) => void }) {
  const savedBlocks = useEditor((s) => s.savedBlocks);
  const setSavedBlocks = useEditor((s) => s.setSavedBlocks);
  const insertSavedBlock = useEditor((s) => s.insertSavedBlock);
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () => groupByCategory(searchBlocks(savedBlocks, query)),
    [savedBlocks, query],
  );

  const rename = (id: string, name: string) =>
    setSavedBlocks(
      savedBlocks.map((b) => (b.id === id ? { ...b, name, updatedAt: Date.now() } : b)),
    );

  const remove = (block: SavedBlock) =>
    confirm(
      {
        title: `Delete "${block.name}"?`,
        message: 'This removes it from your saved blocks. Emails already using it are unaffected.',
        confirmLabel: 'Delete',
        danger: true,
      },
      () => setSavedBlocks(savedBlocks.filter((b) => b.id !== block.id)),
    );

  const importBlocks = async (file?: File) => {
    if (!file) return;
    let plan: ReturnType<typeof planImport> = null;
    try {
      plan = planImport(JSON.parse(await file.text()), savedBlocks);
    } catch {
      return notify('Could not read that file');
    }
    if (!plan) return notify('That file is not a saved-blocks JSON');

    const { added, duplicates, clashes, rejected } = plan;
    const describe = (n: number) => `${n} block${n === 1 ? '' : 's'}`;

    // Bring in everything unambiguous straight away, then ask about the rest.
    // The confirm helper has no cancel callback, so the question has to be
    // narrowed to just the overwrite rather than gating the whole import.
    const base = added.length ? [...savedBlocks, ...added] : savedBlocks;
    if (added.length) setSavedBlocks([...base].sort((a, b) => b.updatedAt - a.updatedAt));

    const notes: string[] = [];
    if (added.length) notes.push(`Imported ${describe(added.length)}`);
    if (duplicates) notes.push(`${describe(duplicates)} already present`);
    if (rejected) notes.push(`${rejected} unreadable`);

    if (clashes.length === 0) {
      return notify(notes.length ? notes.join(' · ') : 'Nothing to import');
    }

    notify(
      [...notes, `${describe(clashes.length)} with an existing name — asking`].join(' · '),
    );
    confirm(
      {
        title: `Overwrite ${describe(clashes.length)} with the same name?`,
        message: `${clashes.map((c) => c.incoming.name).join(', ')}. Leaving this will keep what you already have.`,
        confirmLabel: 'Overwrite',
        danger: true,
      },
      () => {
        const ids = new Set(clashes.map((c) => c.existing.id));
        setSavedBlocks(
          [...base.filter((b) => !ids.has(b.id)), ...clashes.map((c) => c.incoming)].sort(
            (a, b) => b.updatedAt - a.updatedAt,
          ),
        );
        notify(`Overwrote ${describe(clashes.length)}`);
      },
    );
  };

  return (
    <>
      <div className="space-y-2 border-b border-slate-200 px-3 py-2.5">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Search saved blocks"
            value={query}
            placeholder="Search blocks"
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-slate-300 py-1 pl-7 pr-7 text-xs focus:border-brand-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={savedBlocks.length === 0}
            onClick={() => {
              downloadFile(
                exportFilename(savedBlocks),
                JSON.stringify(exportEnvelope(savedBlocks), null, 2),
                'application/json',
              );
              notify(`Exported ${savedBlocks.length} saved blocks`);
            }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-300 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download size={12} /> Export
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-300 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            <Upload size={12} /> Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void importBlocks(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="p-3">
        {savedBlocks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-[11px] leading-snug text-slate-500">
            No saved blocks yet. Select a block or a row on the canvas and choose
            <span className="font-medium text-slate-700"> Save as block</span> to reuse it in any
            email.
          </p>
        ) : groups.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-slate-500">
            Nothing matches “{query}”.
          </p>
        ) : (
          groups.map(([category, items]) => (
            <div key={category} className="mb-4 last:mb-0">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {category}
              </h3>
              <ul className="space-y-2">
                {items.map((saved) => (
                  <SavedItem
                    key={saved.id}
                    saved={saved}
                    onInsert={() => {
                      insertSavedBlock(saved);
                      notify(`Added "${saved.name}"`);
                    }}
                    onRename={(name) => rename(saved.id, name)}
                    onDelete={() => remove(saved)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- the panel */

export function LeftPanel({ notify }: { notify: (m: string) => void }) {
  const addRow = useEditor((s) => s.addRow);
  const savedCount = useEditor((s) => s.savedBlocks.length);
  const [tab, setTab] = useState<Tab>('content');

  /** Click-to-add: put the block where the user is currently working. */
  const addBlockSmart = (type: BlockType) => {
    const st = useEditor.getState();
    const { design, selection } = st;

    if (selection.kind === 'block') {
      const loc = findBlock(design, selection.id);
      if (loc) return void st.addBlock(type, loc.column.id, loc.index + 1);
    }
    if (selection.kind === 'row') {
      const row = design.rows.find((r) => r.id === selection.id);
      if (row) return void st.addBlock(type, row.columns[0].id);
    }
    const last = design.rows[design.rows.length - 1];
    if (last) return void st.addBlock(type, last.columns[0].id);
    st.addBlockInNewRow(type, 0);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'content', label: 'Content' },
    { id: 'rows', label: 'Rows' },
    { id: 'saved', label: `Saved${savedCount ? ` (${savedCount})` : ''}` },
    { id: 'images', label: 'Images' },
  ];

  return (
    <aside className="scroll-thin flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="sticky top-0 z-10 flex gap-1 border-b border-slate-200 bg-white px-3 pt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-1.5 py-2 text-xs font-medium ${
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'content' && (
        <>
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-[11px] leading-snug text-slate-400">
              Drag onto the canvas, or click to add.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3">
            {BLOCK_META.map((m) => (
              <Tile
                key={m.type}
                id={`tool:${m.type}`}
                data={{ kind: 'tool', blockType: m.type }}
                title={`Add ${m.label}`}
                onClick={() => addBlockSmart(m.type)}
              >
                <BlockIcon type={m.type} />
                {m.label}
              </Tile>
            ))}
          </div>
        </>
      )}

      {tab === 'rows' && (
        <>
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-[11px] leading-snug text-slate-400">
              Pick a column layout for a new row.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {ROW_LAYOUTS.map((l, i) => {
              const total = l.layout.reduce((a, b) => a + b, 0);
              return (
                <Tile
                  key={l.label}
                  id={`layout:${i}`}
                  data={{ kind: 'layout', layout: l.layout }}
                  title={`Add ${l.label} row`}
                  onClick={() => addRow(l.layout)}
                >
                  <div className="flex h-5 w-full gap-1">
                    {l.layout.map((n, j) => (
                      <div
                        key={j}
                        className="rounded-sm bg-slate-300"
                        style={{ width: `${(n / total) * 100}%` }}
                      />
                    ))}
                  </div>
                  {l.label}
                </Tile>
              );
            })}
          </div>
        </>
      )}

      {tab === 'saved' && <SavedBlocksTab notify={notify} />}

      {tab === 'images' && <ImageLibrary notify={notify} />}
    </aside>
  );
}
