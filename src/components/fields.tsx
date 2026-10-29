import { useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Link2, Link2Off, X } from 'lucide-react';
import type { Align, BrandColors, Padding } from '../types';
import { isBrandToken, resolveToken, tokenLabel } from '../lib/brand';
import { useActiveBrand } from '../store';

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
