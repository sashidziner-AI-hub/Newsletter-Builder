import { useRef, useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Braces, ChevronDown, Image as ImageIcon, Link2, Link2Off, Plus, X } from 'lucide-react';
import type { Align, BrandColors, Padding } from '../types';
import { isBrandToken, resolveToken, tokenLabel } from '../lib/brand';
import { isMergeTagOnly, MERGE_TAGS } from '../lib/merge';
import { resolutionNote } from '../lib/image-audit';
import {
  type LibraryImage,
  findByUrl,
  makeLibraryImage,
  probeImage,
  validateImageUrl,
} from '../lib/image-storage';
import { useActiveBrand, useEditor } from '../store';

const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

export function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-slate-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
      >
        {title}
        <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-slate-400">{hint}</span>}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  rows = 4,
  mono,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {multiline ? (
        <textarea
          className={`${inputCls} ${mono ? 'font-mono text-xs' : ''}`}
          rows={rows}
          value={value}
          placeholder={placeholder}
          spellCheck={!mono}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={inputCls}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const set = (raw: number) => {
    if (Number.isNaN(raw)) return;
    onChange(Math.min(max, Math.max(min, raw)));
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-right text-xs focus:border-brand-500 focus:outline-none"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => set(parseFloat(e.target.value))}
          />
          {unit && <span className="text-xs text-slate-400">{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        className="w-full accent-brand-600"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(parseFloat(e.target.value))}
      />
    </div>
  );
}

/* ======================================================= merge tags (2A) */

/**
 * Insert-tag dropdown. Hands the host the canonical `{{tag}}` form; the export
 * boundary rewrites it into whichever ESP format the email is set to.
 */
export function MergeTagMenu({ onInsert }: { onInsert: (tag: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        title="Insert a merge tag"
        aria-label="Insert a merge tag"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
      >
        <Braces size={12} /> Tag
      </button>
      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            {MERGE_TAGS.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => {
                  onInsert(`{{${t.tag}}}`);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
              >
                <span>{t.label}</span>
                <code className="shrink-0 text-[10px] text-slate-400">{`{{${t.tag}}}`}</code>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A text field with an insert-tag menu that writes at the caret. */
export function TagTextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const insert = (tag: string) => {
    const el = ref.current;
    if (!el) return onChange(value + tag);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + tag + value.slice(end));
    // put the caret after the tag once React has re-rendered
    requestAnimationFrame(() => {
      el.focus();
      const at = start + tag.length;
      el.setSelectionRange(at, at);
    });
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <MergeTagMenu onInsert={insert} />
      </div>
      {multiline ? (
        <textarea
          ref={ref}
          aria-label={label}
          className={inputCls}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          ref={ref}
          aria-label={label}
          className={inputCls}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-slate-400">{hint}</span>}
    </div>
  );
}

/**
 * A URL field with a per-link tracking opt-out. UTM parameters are added at
 * export time, so the stored URL stays exactly as typed either way.
 */
export function LinkField({
  label = 'Link URL',
  value,
  onChange,
  noTrack,
  onNoTrack,
  placeholder = 'https://…',
  hint,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  noTrack?: boolean;
  onNoTrack?: (v: boolean) => void;
  placeholder?: string;
  hint?: string;
}) {
  const isTag = isMergeTagOnly(value);
  return (
    <div>
      <TextField label={label} value={value} onChange={onChange} placeholder={placeholder} hint={hint} />
      {onNoTrack && !isTag && (
        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
            checked={noTrack === true}
            onChange={(e) => onNoTrack(e.target.checked)}
          />
          <span className="text-[11px] text-slate-500">Don&rsquo;t add tracking</span>
        </label>
      )}
      {isTag && (
        <span className="mt-1 block text-[11px] leading-snug text-slate-400">
          A merge tag — your ESP fills this in, and link tracking never touches it.
        </span>
      )}
    </div>
  );
}

/* ================================================= image URL field (2C-1) */

/**
 * Opened by every image field. Declared here as a hole the app fills on mount,
 * so `fields.tsx` does not have to import the library modal and create a cycle
 * (ImageLibrary itself uses these field components).
 */
type PickerOpener = (opts: {
  onPick: (image: LibraryImage) => void;
}) => void;

let openPickerImpl: PickerOpener | null = null;
export function registerImagePicker(fn: PickerOpener | null) {
  openPickerImpl = fn;
}

/**
 * A URL field for an image, with the library picker beside it.
 *
 * Alt text stays the caller's business — the composite blocks mark it required
 * — but picking from the library fills it in from the image's default alt so
 * the common path starts correct.
 */
export function ImageUrlField({
  label = 'Image URL',
  value,
  onChange,
  onPickAlt,
  displayWidth,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  /** called with the library default alt when one is picked */
  onPickAlt?: (alt: string) => void;
  /** rendered width in px, for the resolution note */
  displayWidth?: number;
  hint?: string;
}) {
  const images = useEditor((s) => s.images);
  const addImage = useEditor((s) => s.addImage);
  const brandId = useEditor((s) => s.design.brandId);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const known = findByUrl(images, value);
  const check = validateImageUrl(value);
  const isTag = /^(\{\{|\*\||\[%)/.test((value || '').trim());
  const note = known && displayWidth ? resolutionNote(known.width, displayWidth) : null;

  const pick = () => {
    if (!openPickerImpl) return;
    openPickerImpl({
      onPick: (image) => {
        onChange(image.url);
        if (image.defaultAlt) onPickAlt?.(image.defaultAlt);
        setError('');
        setSaved(false);
      },
    });
  };

  const saveToLibrary = async () => {
    const result = validateImageUrl(value);
    if (!result.ok) return setError(result.message ?? 'That URL cannot be used.');
    const probe = await probeImage(result.url);
    addImage(
      makeLibraryImage(result.url, {
        width: probe.width,
        height: probe.height,
        status: probe.ok ? 'ok' : 'broken',
        checkedAt: Date.now(),
        brandId,
      }),
    );
    setSaved(true);
    setError('');
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <button
          type="button"
          onClick={pick}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
        >
          <ImageIcon size={12} /> Choose from library
        </button>
      </div>

      <input
        aria-label={label}
        className={inputCls}
        value={value}
        placeholder="https://…"
        onChange={(e) => {
          onChange(e.target.value);
          setError('');
          setSaved(false);
        }}
      />

      {hint && <span className="mt-1 block text-[11px] leading-snug text-slate-400">{hint}</span>}

      {/* a URL that is not in the library yet is one keystroke from being reusable */}
      {value.trim() && !isTag && check.ok && !known && !saved && (
        <button
          type="button"
          onClick={() => void saveToLibrary()}
          className="mt-1 flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
        >
          <Plus size={11} /> Save to library
        </button>
      )}
      {saved && <span className="mt-1 block text-[11px] text-emerald-700">Saved to the library.</span>}
      {known && (
        <span className="mt-1 block truncate text-[11px] text-slate-400">
          From the library: {known.name}
          {known.width > 0 ? ` · ${known.width}×${known.height}` : ''}
        </span>
      )}

      {value.trim() && !isTag && !check.ok && (
        <span className="mt-1 block text-[11px] leading-snug text-red-600">{check.message}</span>
      )}
      {error && <span className="mt-1 block text-[11px] leading-snug text-red-600">{error}</span>}
      {note && (
        <span className="mt-1 block text-[11px] leading-snug text-amber-700">{note.message}</span>
      )}
    </div>
  );
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const expandHex = (v: string) =>
  v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;

/** The brand colours offered as one-click swatches, in panel order. */
const SWATCHES: { key: keyof BrandColors; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted' },
  { key: 'link', label: 'Link' },
  { key: 'page_bg', label: 'Page background' },
  { key: 'content_bg', label: 'Content background' },
  { key: 'border', label: 'Border' },
];

/**
 * Colour input that stores either a brand token (`brand.primary`) or a literal
 * hex override. Picking a swatch stores the token, so the value follows a brand
 * switch; typing or using the picker stores hex, which a brand switch leaves
 * alone.
 */
export function ColorField({
  label,
  value,
  onChange,
  allowEmpty,
  emptyLabel = 'none',
  noBrand,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** hide the brand swatch row (for colours a brand has no opinion about) */
  noBrand?: boolean;
}) {
  const brand = useActiveBrand();
  const token = isBrandToken(value) ? value : '';
  const resolved = token ? resolveToken(value, brand, 'preview') : value;
  const valid = HEX.test(resolved);

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          className="h-8 w-9 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
          value={valid ? expandHex(resolved) : '#ffffff'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        {token ? (
          <span className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-xs font-medium text-brand-700">
            <span className="truncate">Brand · {tokenLabel(token)}</span>
            <span className="ml-auto font-mono text-[10px] text-brand-500">{resolved || '—'}</span>
            <button
              type="button"
              title="Replace with a fixed colour"
              aria-label={`Unlink ${label} from the brand`}
              className="shrink-0 rounded p-0.5 hover:bg-brand-100"
              onClick={() => onChange(resolved || '#000000')}
            >
              <X size={12} />
            </button>
          </span>
        ) : (
          <input
            className={inputCls}
            value={value}
            placeholder={allowEmpty ? emptyLabel : '#000000'}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {allowEmpty && value && (
          <button
            type="button"
            className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
            onClick={() => onChange('')}
          >
            Clear
          </button>
        )}
      </div>
      {!noBrand && (
        <div className="mt-1.5">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Brand colors
          </span>
          <div className="flex flex-wrap gap-1">
            {SWATCHES.map((sw) => {
              const hex = brand.tokens.colors[sw.key];
              const active = token === `brand.${sw.key}`;
              return (
                <button
                  key={sw.key}
                  type="button"
                  title={`${sw.label} · ${hex}`}
                  aria-label={`${label}: brand ${sw.label}`}
                  aria-pressed={active}
                  onClick={() => onChange(`brand.${sw.key}`)}
                  className={`h-6 w-6 rounded border transition-transform hover:scale-110 ${
                    active ? 'border-brand-600 ring-2 ring-brand-500/40' : 'border-slate-300'
                  }`}
                  style={{ background: hex || '#ffffff' }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function SelectField<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <Field label={label}>
      <select
        className={inputCls}
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value);
          if (picked) onChange(picked.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
}) {
  return (
    <div>
      {label && <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>}
      <div className="flex rounded-md border border-slate-300 bg-slate-50 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center rounded px-2 py-1 text-xs font-medium transition-colors ${
              value === o.value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AlignField({
  value,
  onChange,
  label = 'Alignment',
}: {
  value: Align;
  onChange: (v: Align) => void;
  label?: string;
}) {
  return (
    <Segmented<Align>
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: 'left', label: <AlignLeft size={15} />, title: 'Left' },
        { value: 'center', label: <AlignCenter size={15} />, title: 'Center' },
        { value: 'right', label: <AlignRight size={15} />, title: 'Right' },
      ]}
    />
  );
}

export function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 rounded-full transition-colors ${value ? 'bg-brand-600' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${value ? 'left-[18px]' : 'left-0.5'}`}
        />
      </button>
    </label>
  );
}

export function PaddingField({
  label = 'Padding',
  value,
  onChange,
}: {
  label?: string;
  value: Padding;
  onChange: (v: Padding) => void;
}) {
  const [linked, setLinked] = useState(
    value.top === value.right && value.right === value.bottom && value.bottom === value.left,
  );
  const setSide = (side: keyof Padding, raw: string) => {
    const n = Math.max(0, Math.min(200, parseInt(raw, 10) || 0));
    onChange(linked ? { top: n, right: n, bottom: n, left: n } : { ...value, [side]: n });
  };
  const sides: { key: keyof Padding; label: string }[] = [
    { key: 'top', label: 'Top' },
    { key: 'right', label: 'Right' },
    { key: 'bottom', label: 'Bottom' },
    { key: 'left', label: 'Left' },
  ];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{label} (px)</span>
        <button
          type="button"
          title={linked ? 'Sides linked' : 'Sides independent'}
          onClick={() => setLinked(!linked)}
          className={`rounded p-1 ${linked ? 'bg-brand-50 text-brand-600' : 'text-slate-400 hover:bg-slate-100'}`}
        >
          {linked ? <Link2 size={14} /> : <Link2Off size={14} />}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {sides.map((s) => (
          <label key={s.key} className="block">
            <input
              type="number"
              min={0}
              max={200}
              className="w-full rounded-md border border-slate-300 px-1.5 py-1 text-center text-xs focus:border-brand-500 focus:outline-none"
              value={value[s.key]}
              onChange={(e) => setSide(s.key, e.target.value)}
            />
            <span className="mt-0.5 block text-center text-[10px] text-slate-400">{s.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
