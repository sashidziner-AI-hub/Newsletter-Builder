import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import {
  type BrandFilter,
  type LibraryImage,
  filterImages,
  imageExportEnvelope,
  imageExportFilename,
  makeLibraryImage,
  nameFromUrl,
  parseUrlList,
  planImageImport,
  probeImage,
  validateImageUrl,
} from '../lib/image-storage';
import { downloadFile } from '../lib/util';
import { useEditor } from '../store';
import { useConfirm } from './ConfirmDialog';
import { Modal } from './Modals';

const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const ghostBtn =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50';
const input =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

/** A row in the add flow: one pasted URL, probed, waiting for a name and alt. */
interface Draft {
  url: string;
  name: string;
  alt: string;
  ok: boolean;
  width: number;
  height: number;
  error?: string;
}

/* --------------------------------------------------------------- add flow */

function AddImages({
  onDone,
  onCancel,
}: {
  onDone: (images: LibraryImage[]) => void;
  onCancel: () => void;
}) {
  const existing = useEditor((s) => s.images);
  const brandId = useEditor((s) => s.design.brandId);
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState(0);

  /** Validate every line, then load each one to confirm it is really there. */
  const check = async () => {
    setBusy(true);
    const urls = parseUrlList(text);
    const rows: Draft[] = [];
    let dupes = 0;

    for (const raw of urls) {
      const result = validateImageUrl(raw);
      if (!result.ok) {
        rows.push({ url: raw, name: '', alt: '', ok: false, width: 0, height: 0, error: result.message });
        continue;
      }
      if (existing.some((i) => i.url === result.url)) {
        dupes += 1;
        continue;
      }
      const probe = await probeImage(result.url);
      rows.push({
        url: result.url,
        name: nameFromUrl(result.url),
        alt: '',
        ok: probe.ok,
        width: probe.width,
        height: probe.height,
        error: probe.ok ? undefined : 'That URL did not load as an image.',
      });
    }
    setSkipped(dupes);
    setDrafts(rows);
    setBusy(false);
  };

  const save = () => {
    const usable = (drafts ?? []).filter((d) => d.ok);
    onDone(
      usable.map((d) =>
        makeLibraryImage(d.url, {
          name: d.name,
          defaultAlt: d.alt,
          width: d.width,
          height: d.height,
          status: 'ok',
          checkedAt: Date.now(),
          brandId,
        }),
      ),
    );
  };

  if (!drafts) {
    return (
      <div className="space-y-3 p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Image URLs — one per line
          </span>
          <textarea
            autoFocus
            aria-label="Image URLs"
            rows={5}
            className={`${input} font-mono text-xs`}
            placeholder={'https://cdn.example.com/hero.jpg\nhttps://cdn.example.com/logo.png'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="text-[11px] leading-snug text-slate-400">
          Only https URLs. Uploads need image hosting, which is not set up yet, so paste a
          public URL instead — an embedded <code>data:</code> image would not render in most
          inboxes.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={primaryBtn}
            disabled={busy || !text.trim()}
            onClick={() => void check()}
          >
            {busy ? 'Checking…' : 'Check URLs'}
          </button>
        </div>
      </div>
    );
  }

  const usable = drafts.filter((d) => d.ok);
  return (
    <div className="space-y-3 p-5">
      {skipped > 0 && (
        <p className="text-[11px] text-slate-500">
          {skipped} already in the library and skipped.
        </p>
      )}
      <ul className="space-y-2">
        {drafts.map((d, i) => (
          <li
            key={d.url + i}
            className={`rounded-md border p-2 ${d.ok ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50'}`}
          >
            <div className="flex gap-2">
              {d.ok ? (
                <img src={d.url} alt="" className="h-14 w-20 shrink-0 rounded border border-slate-200 object-cover" />
              ) : (
                <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded border border-red-200 text-[10px] text-red-600">
                  no load
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="truncate font-mono text-[10px] text-slate-400">{d.url}</p>
                {d.error ? (
                  <p className="text-[11px] text-red-700">{d.error}</p>
                ) : (
                  <>
                    <input
                      aria-label={`Name for image ${i + 1}`}
                      className={input}
                      value={d.name}
                      placeholder="Name"
                      onChange={(e) =>
                        setDrafts(drafts.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))
                      }
                    />
                    <input
                      aria-label={`Default alt text for image ${i + 1}`}
                      className={input}
                      value={d.alt}
                      placeholder="Default alt text"
                      onChange={(e) =>
                        setDrafts(drafts.map((x, j) => (i === j ? { ...x, alt: e.target.value } : x)))
                      }
                    />
                    <p className="text-[10px] text-slate-400">
                      {d.width}×{d.height}
                    </p>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <button type="button" className={ghostBtn} onClick={() => setDrafts(null)}>
          Back
        </button>
        <button type="button" className={primaryBtn} disabled={usable.length === 0} onClick={save}>
          Add {usable.length || ''} {usable.length === 1 ? 'image' : 'images'}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- the library */

export function ImageLibrary({
  mode = 'browse',
  onPick,
  notify,
}: {
  mode?: 'browse' | 'pick';
  onPick?: (image: LibraryImage) => void;
  notify: (m: string) => void;
}) {
  const images = useEditor((s) => s.images);
  const setImages = useEditor((s) => s.setImages);
  const updateImage = useEditor((s) => s.updateImage);
  const removeImage = useEditor((s) => s.removeImage);
  const addImage = useEditor((s) => s.addImage);
  const brandId = useEditor((s) => s.design.brandId);
  const brands = useEditor((s) => s.brands);
  const confirm = useConfirm();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BrandFilter>('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const shown = useMemo(
    () => filterImages(images, query, filter, brandId),
    [images, query, filter, brandId],
  );

  // re-check every URL when the library opens, so a dead link shows as dead
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const image of images) {
        const probe = await probeImage(image.url);
        if (cancelled) return;
        const status = probe.ok ? 'ok' : 'broken';
        if (status !== image.status || (probe.ok && probe.width !== image.width)) {
          updateImage(image.id, {
            status,
            checkedAt: Date.now(),
            width: probe.ok ? probe.width : image.width,
            height: probe.ok ? probe.height : image.height,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // on mount only: a re-check per keystroke would hammer the network
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importImages = async (file?: File) => {
    if (!file) return;
    let plan: ReturnType<typeof planImageImport> = null;
    try {
      plan = planImageImport(JSON.parse(await file.text()), images);
    } catch {
      return notify('Could not read that file');
    }
    if (!plan) return notify('That file is not an image library JSON');

    const { added, duplicates, clashes, rejected } = plan;
    const base = added.length ? [...images, ...added] : images;
    if (added.length) setImages(base);

    const notes: string[] = [];
    if (added.length) notes.push(`Imported ${added.length}`);
    if (duplicates) notes.push(`${duplicates} already present`);
    if (rejected) notes.push(`${rejected} unusable`);

    if (clashes.length === 0) {
      return notify(notes.length ? notes.join(' · ') : 'Nothing to import');
    }
    notify([...notes, `${clashes.length} name clash — asking`].join(' · '));
    confirm(
      {
        title: `Overwrite ${clashes.length} image${clashes.length === 1 ? '' : 's'} with the same name?`,
        message: clashes.map((c) => c.incoming.name).join(', '),
        confirmLabel: 'Overwrite',
        danger: true,
      },
      () => {
        const ids = new Set(clashes.map((c) => c.existing.id));
        setImages([...base.filter((i) => !ids.has(i.id)), ...clashes.map((c) => c.incoming)]);
        notify(`Overwrote ${clashes.length}`);
      },
    );
  };

  if (adding) {
    return (
      <AddImages
        onCancel={() => setAdding(false)}
        onDone={(added) => {
          for (const image of added) addImage(image);
          setAdding(false);
          notify(added.length ? `Added ${added.length} to the library` : 'Nothing added');
        }}
      />
    );
  }

  const edit = images.find((i) => i.id === editing);
  if (edit) {
    return (
      <div className="space-y-3 p-5">
        <img
          src={edit.url}
          alt=""
          className="h-32 w-full rounded border border-slate-200 bg-slate-50 object-contain"
        />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
          <input
            aria-label="Image name"
            className={input}
            value={edit.name}
            onChange={(e) => updateImage(edit.id, { name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Default alt text</span>
          <input
            aria-label="Image default alt text"
            className={input}
            value={edit.defaultAlt}
            onChange={(e) => updateImage(edit.id, { defaultAlt: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Tags, comma separated
          </span>
          <input
            aria-label="Image tags"
            className={input}
            value={edit.tags.join(', ')}
            onChange={(e) =>
              updateImage(edit.id, {
                tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
              })
            }
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Brand</span>
          <select
            aria-label="Image brand"
            className={input}
            value={edit.brandId ?? ''}
            onChange={(e) => updateImage(edit.id, { brandId: e.target.value || null })}
          >
            <option value="">Shared across brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <p className="font-mono text-[10px] break-all text-slate-400">{edit.url}</p>
        <div className="flex justify-end">
          <button type="button" className={primaryBtn} onClick={() => setEditing(null)}>
            <Check size={15} /> Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Search images"
            value={query}
            placeholder="Search by name or tag"
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-slate-300 py-1 pl-7 pr-7 text-xs focus:border-brand-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear image search"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex rounded-md border border-slate-300 bg-slate-50 p-0.5">
          {(['this', 'shared', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
                filter === f ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {f === 'this' ? 'This brand' : f === 'shared' ? 'Shared' : 'All'}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          <button type="button" className={`${ghostBtn} flex-1 justify-center !py-1 !text-[11px]`} onClick={() => setAdding(true)}>
            <Plus size={12} /> Add
          </button>
          <button
            type="button"
            disabled={images.length === 0}
            className={`${ghostBtn} flex-1 justify-center !py-1 !text-[11px]`}
            onClick={() => {
              downloadFile(
                imageExportFilename(images),
                JSON.stringify(imageExportEnvelope(images), null, 2),
                'application/json',
              );
              notify(`Exported ${images.length} images`);
            }}
          >
            <Download size={12} /> Export
          </button>
          <button
            type="button"
            className={`${ghostBtn} flex-1 justify-center !py-1 !text-[11px]`}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={12} /> Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void importImages(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="p-3">
        {images.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-[11px] leading-snug text-slate-500">
            No images yet. <span className="font-medium text-slate-700">Add</span> a public https
            image URL and it becomes reusable in every email, with its alt text already filled in.
          </p>
        ) : shown.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-slate-500">Nothing matches that filter.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {shown.map((image) => (
              <li key={image.id} className="rounded-lg border border-slate-200 bg-white p-1.5">
                <button
                  type="button"
                  aria-label={`${mode === 'pick' ? 'Use' : 'Edit'} ${image.name}`}
                  onClick={() => (mode === 'pick' ? onPick?.(image) : setEditing(image.id))}
                  className="block w-full"
                >
                  <span className="relative block">
                    <img
                      src={image.url}
                      alt=""
                      className="h-16 w-full rounded border border-slate-200 bg-slate-50 object-cover"
                    />
                    {image.status === 'broken' && (
                      <span className="absolute inset-x-0 bottom-0 rounded-b bg-red-600/90 px-1 py-0.5 text-[9px] font-semibold text-white">
                        Could not load
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-left text-[11px] font-medium text-slate-800">
                    {image.name}
                  </span>
                  <span className="block truncate text-left text-[10px] text-slate-400">
                    {image.width > 0 ? `${image.width}×${image.height}` : 'size unknown'}
                    {image.brandId ? '' : ' · shared'}
                  </span>
                </button>
                <div className="mt-1 flex justify-end gap-0.5">
                  <button
                    type="button"
                    title="Copy URL"
                    aria-label={`Copy URL for ${image.name}`}
                    onClick={() => {
                      void navigator.clipboard?.writeText(image.url);
                      notify('URL copied');
                    }}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    aria-label={`Delete ${image.name}`}
                    onClick={() =>
                      confirm(
                        {
                          title: `Delete "${image.name}"?`,
                          message:
                            'This removes it from the library. Emails already using the URL are unaffected.',
                          confirmLabel: 'Delete',
                          danger: true,
                        },
                        () => removeImage(image.id),
                      )
                    }
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** The picker, shown over whatever field asked for it. */
export function ImagePickerModal({
  onPick,
  onClose,
  notify,
}: {
  onPick: (image: LibraryImage) => void;
  onClose: () => void;
  notify: (m: string) => void;
}) {
  return (
    <Modal title="Choose an image" onClose={onClose}>
      <div className="scroll-thin max-h-[70vh] min-h-[320px] flex-1 overflow-y-auto">
        <ImageLibrary
          mode="pick"
          notify={notify}
          onPick={(image) => {
            onPick(image);
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}
