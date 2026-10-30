import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ImagePlus, Plus, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import type {
  ArticleItem,
  ArticleListValues,
  BodySettings,
  ButtonValues,
  FooterValues,
  HeaderValues,
  HeroCard,
  HeroValues,
  NavLink,
  SocialItem,
  DividerValues,
  HeadingValues,
  HtmlValues,
  ImageValues,
  MenuValues,
  Padding,
  Row,
  SocialNetwork,
  SocialValues,
  TextValues,
  VideoValues,
  Block,
} from '../types';
import { resolveToken } from '../lib/brand';
import { MERGE_TAGS } from '../lib/merge';
import { FONT_STACKS, ROW_LAYOUTS, SOCIAL_NETWORKS } from '../lib/defaults';
import { UPLOAD_UNAVAILABLE } from '../lib/image-storage';
import { slugify, uid } from '../lib/util';
import { useActiveBrand, useEditor } from '../store';
import {
  AlignField,
  ColorField,
  ImageUrlField,
  LinkField,
  NumberField,
  PaddingField,
  Section,
  Segmented,
  SelectField,
  TagTextField,
  TextField,
  ToggleField,
} from './fields';
import { RichTextEditor } from './RichTextEditor';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
interface EditorProps<T extends Block['type'], V> {
  block: BlockOf<T>;
  set: (patch: Partial<V>) => void;
  revision: number;
}

const fontOptions = (withInherit: boolean) => [
  ...(withInherit ? [{ value: '', label: 'Same as email' }] : []),
  // tokens first: these follow the active brand, the stacks below are overrides
  { value: 'brand.font.body', label: 'Brand — body font' },
  { value: 'brand.font.heading', label: 'Brand — heading font' },
  ...FONT_STACKS,
];

const boldOptions = [
  { value: 'normal' as const, label: 'Normal' },
  { value: 'bold' as const, label: 'Bold' },
];

/* ------------------------------------------------------------------ heading */
export function HeadingEditor({ block, set }: EditorProps<'heading', HeadingValues>) {
  const v = block.values;
  return (
    <>
      <Section title="Content">
        <TagTextField label="Heading text" multiline rows={2} value={v.text} onChange={(text) => set({ text })} />
        <SelectField
          label="Level"
          value={v.level}
          onChange={(level) => set({ level })}
          options={([1, 2, 3, 4, 5, 6] as const).map((n) => ({ value: n, label: `H${n}` }))}
        />
      </Section>
      <Section title="Style">
        <NumberField label="Font size" unit="px" min={10} max={72} value={v.fontSize} onChange={(fontSize) => set({ fontSize })} />
        <Segmented label="Weight" value={v.fontWeight} onChange={(fontWeight) => set({ fontWeight })} options={boldOptions} />
        <ColorField label="Color" value={v.color} onChange={(color) => set({ color })} />
        <NumberField label="Line height" unit="%" min={80} max={250} value={v.lineHeight} onChange={(lineHeight) => set({ lineHeight })} />
        <SelectField label="Font" value={v.fontFamily} onChange={(fontFamily) => set({ fontFamily })} options={fontOptions(true)} />
        <AlignField value={v.align} onChange={(align) => set({ align })} />
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding: Padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* --------------------------------------------------------------------- text */
export function TextEditor({ block, set, revision }: EditorProps<'text', TextValues>) {
  const v = block.values;
  return (
    <>
      <Section title="Content">
        {/* remount on undo/redo/load so the editor picks up restored content */}
        <RichTextEditor key={`${block.id}:${revision}`} value={v.html} onChange={(html) => set({ html })} />
      </Section>
      <Section title="Style">
        <NumberField label="Font size" unit="px" min={10} max={40} value={v.fontSize} onChange={(fontSize) => set({ fontSize })} />
        <ColorField label="Text color" value={v.color} allowEmpty emptyLabel="same as email" onChange={(color) => set({ color })} />
        <NumberField label="Line height" unit="%" min={100} max={250} value={v.lineHeight} onChange={(lineHeight) => set({ lineHeight })} />
        <SelectField label="Font" value={v.fontFamily} onChange={(fontFamily) => set({ fontFamily })} options={fontOptions(true)} />
        <AlignField value={v.align} onChange={(align) => set({ align })} />
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------- image */

export function ImageEditor({ block, set }: EditorProps<'image', ImageValues>) {
  const v = block.values;
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const isData = v.src.startsWith('data:');

  /**
   * Uploading would have to embed a data: URI, which Gmail and most inboxes
   * strip. Until there is somewhere to host files, this says so rather than
   * putting an image in the email that will not render.
   */
  const onFile = (file?: File) => {
    if (!file) return;
    setError(UPLOAD_UNAVAILABLE);
  };

  return (
    <>
      <Section title="Image">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 hover:border-brand-500 hover:text-brand-700"
          >
            <ImagePlus size={15} /> Upload from device
          </button>
          {v.src && (
            <button
              type="button"
              onClick={() => set({ src: '' })}
              className="rounded-md border border-slate-300 px-2.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              Remove
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <ImageUrlField
          label="Image URL"
          value={isData ? '' : v.src}
          onChange={(src) => set({ src })}
          onPickAlt={(alt) => set({ alt })}
          displayWidth={Math.round((600 * v.width) / 100)}
          hint={
            isData
              ? 'This block still holds an embedded image, which Gmail and many inboxes strip. Paste a hosted https URL to replace it.'
              : undefined
          }
        />
        <TextField label="Alt text" value={v.alt} onChange={(alt) => set({ alt })} placeholder="Describe the image" />
        <LinkField
          label="Link URL (optional)"
          value={v.href}
          onChange={(href) => set({ href })}
          noTrack={v.noTrack}
          onNoTrack={(noTrack) => set({ noTrack })}
        />
      </Section>
      <Section title="Style">
        <NumberField label="Width" unit="%" min={10} max={100} value={v.width} onChange={(width) => set({ width })} />
        <NumberField label="Corner radius" unit="px" min={0} max={60} value={v.borderRadius} onChange={(borderRadius) => set({ borderRadius })} />
        <AlignField value={v.align} onChange={(align) => set({ align })} />
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------- button */
export function ButtonEditor({ block, set }: EditorProps<'button', ButtonValues>) {
  const v = block.values;
  const brand = useActiveBrand();

  /** Apply the brand's button tokens. Colours become tokens so they re-theme. */
  const applyBrandStyle = () => {
    const b = brand.tokens.button;
    set({
      bgColor: 'brand.primary',
      color: 'brand.content_bg',
      fontFamily: 'brand.font.body',
      borderRadius: b.radius,
      innerPaddingV: b.paddingV,
      innerPaddingH: b.paddingH,
      fontWeight: b.weight,
      ...(b.uppercase ? { label: v.label.toUpperCase() } : {}),
    });
  };

  return (
    <>
      <Section title="Content">
        <TagTextField label="Label" value={v.label} onChange={(label) => set({ label })} />
        <LinkField
          value={v.href}
          onChange={(href) => set({ href })}
          noTrack={v.noTrack}
          onNoTrack={(noTrack) => set({ noTrack })}
        />
        <button
          type="button"
          onClick={applyBrandStyle}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-brand-300 bg-brand-50 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
        >
          <Wand2 size={14} /> Apply {brand.name} button style
        </button>
      </Section>
      <Section title="Colors">
        <ColorField label="Background" value={v.bgColor} onChange={(bgColor) => set({ bgColor })} />
        <ColorField label="Text color" value={v.color} onChange={(color) => set({ color })} />
      </Section>
      <Section title="Style">
        <NumberField label="Font size" unit="px" min={10} max={36} value={v.fontSize} onChange={(fontSize) => set({ fontSize })} />
        <Segmented label="Weight" value={v.fontWeight} onChange={(fontWeight) => set({ fontWeight })} options={boldOptions} />
        <SelectField label="Font" value={v.fontFamily} onChange={(fontFamily) => set({ fontFamily })} options={fontOptions(true)} />
        <NumberField label="Corner radius" unit="px" min={0} max={50} value={v.borderRadius} onChange={(borderRadius) => set({ borderRadius })} />
        <NumberField label="Border width" unit="px" min={0} max={8} value={v.borderWidth} onChange={(borderWidth) => set({ borderWidth })} />
        {v.borderWidth > 0 && (
          <ColorField label="Border color" value={v.borderColor} onChange={(borderColor) => set({ borderColor })} />
        )}
        <NumberField label="Inner padding (vertical)" unit="px" min={0} max={50} value={v.innerPaddingV} onChange={(innerPaddingV) => set({ innerPaddingV })} />
        <NumberField label="Inner padding (horizontal)" unit="px" min={0} max={100} value={v.innerPaddingH} onChange={(innerPaddingH) => set({ innerPaddingH })} />
        <ToggleField label="Full width" value={v.fullWidth} onChange={(fullWidth) => set({ fullWidth })} />
        {!v.fullWidth && <AlignField value={v.align} onChange={(align) => set({ align })} />}
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ divider */
export function DividerEditor({ block, set }: EditorProps<'divider', DividerValues>) {
  const v = block.values;
  return (
    <>
      <Section title="Style">
        <ColorField label="Color" value={v.color} onChange={(color) => set({ color })} />
        <NumberField label="Thickness" unit="px" min={1} max={12} value={v.thickness} onChange={(thickness) => set({ thickness })} />
        <Segmented
          label="Line style"
          value={v.lineStyle}
          onChange={(lineStyle) => set({ lineStyle })}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'dotted', label: 'Dotted' },
          ]}
        />
        <NumberField label="Width" unit="%" min={5} max={100} value={v.width} onChange={(width) => set({ width })} />
        <AlignField value={v.align} onChange={(align) => set({ align })} />
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* --------------------------------------------------------------------- menu */
export function MenuEditor({ block, set }: EditorProps<'menu', MenuValues>) {
  const v = block.values;
  const updateItem = (id: string, patch: Partial<{ label: string; href: string }>) =>
    set({ items: v.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  return (
    <>
      <Section title="Menu items">
        <div className="space-y-2">
          {v.items.map((it) => (
            <div key={it.id} className="flex items-start gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <input
                  aria-label="Label"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                  value={it.label}
                  placeholder="Label"
                  onChange={(e) => updateItem(it.id, { label: e.target.value })}
                />
                <input
                  aria-label="URL"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  value={it.href}
                  placeholder="https://…"
                  onChange={(e) => updateItem(it.id, { href: e.target.value })}
                />
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
                    checked={it.noTrack === true}
                    onChange={(e) =>
                      set({
                        items: v.items.map((x) =>
                          x.id === it.id ? { ...x, noTrack: e.target.checked } : x,
                        ),
                      })
                    }
                  />
                  <span className="text-[11px] text-slate-500">Don&rsquo;t add tracking</span>
                </label>
              </div>
              <button
                type="button"
                title="Remove item"
                onClick={() => set({ items: v.items.filter((x) => x.id !== it.id) })}
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => set({ items: [...v.items, { id: uid('mi'), label: 'New link', href: 'https://example.com' }] })}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-500 hover:text-brand-700"
        >
          <Plus size={14} /> Add item
        </button>
      </Section>
      <Section title="Style">
        <Segmented
          label="Layout"
          value={v.layout}
          onChange={(layout) => set({ layout })}
          options={[
            { value: 'horizontal', label: 'Horizontal' },
            { value: 'vertical', label: 'Vertical' },
          ]}
        />
        <NumberField label="Font size" unit="px" min={10} max={28} value={v.fontSize} onChange={(fontSize) => set({ fontSize })} />
        <ColorField label="Link color" value={v.color} onChange={(color) => set({ color })} />
        <Segmented label="Weight" value={v.fontWeight} onChange={(fontWeight) => set({ fontWeight })} options={boldOptions} />
        <SelectField label="Font" value={v.fontFamily} onChange={(fontFamily) => set({ fontFamily })} options={fontOptions(true)} />
        {v.layout === 'horizontal' && (
          <TextField label="Separator" value={v.separator} placeholder="e.g. |" onChange={(separator) => set({ separator })} />
        )}
        <NumberField label="Item spacing" unit="px" min={0} max={40} value={v.itemPadding} onChange={(itemPadding) => set({ itemPadding })} />
        <AlignField value={v.align} onChange={(align) => set({ align })} />
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------- social */
export function SocialEditor({ block, set }: EditorProps<'social', SocialValues>) {
  const v = block.values;
  const updateItem = (id: string, patch: Record<string, string>) =>
    set({ items: v.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) as SocialValues['items'] });
  const networks = (Object.keys(SOCIAL_NETWORKS) as SocialNetwork[]).map((n) => ({
    value: n,
    label: SOCIAL_NETWORKS[n].label,
  }));
  return (
    <>
      <Section title="Networks">
        <div className="space-y-2">
          {v.items.map((it) => (
            <div key={it.id} className="flex items-start gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <select
                  aria-label="Network"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                  value={it.network}
                  onChange={(e) => updateItem(it.id, { network: e.target.value })}
                >
                  {networks.map((n) => (
                    <option key={n.value} value={n.value}>
                      {n.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Profile URL"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  value={it.href}
                  placeholder={it.network === 'email' ? 'name@example.com' : 'https://…'}
                  onChange={(e) => updateItem(it.id, { href: e.target.value })}
                />
                <ImageUrlField
                  label="Custom icon URL"
                  value={it.iconUrl}
                  onChange={(iconUrl) => updateItem(it.id, { iconUrl })}
                  displayWidth={v.size}
                />
              </div>
              <button
                type="button"
                title="Remove"
                onClick={() => set({ items: v.items.filter((x) => x.id !== it.id) })}
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            set({ items: [...v.items, { id: uid('si'), network: 'x', href: 'https://x.com', iconUrl: '' }] })
          }
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-500 hover:text-brand-700"
        >
          <Plus size={14} /> Add network
        </button>
        <p className="text-[11px] leading-snug text-slate-400">
          Icons are simple colored badges that work in every email client. Paste a hosted PNG URL per network for custom logos.
        </p>
      </Section>
      <Section title="Style">
        <NumberField label="Icon size" unit="px" min={20} max={64} value={v.size} onChange={(size) => set({ size })} />
        <Segmented
          label="Shape"
          value={v.shape}
          onChange={(shape) => set({ shape })}
          options={[
            { value: 'circle', label: 'Circle' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'square', label: 'Square' },
          ]}
        />
        <Segmented
          label="Colors"
          value={v.colorMode}
          onChange={(colorMode) => set({ colorMode })}
          options={[
            { value: 'brand', label: 'Brand' },
            { value: 'mono', label: 'Single color' },
          ]}
        />
        {v.colorMode === 'mono' && (
          <ColorField label="Icon color" value={v.monoColor} onChange={(monoColor) => set({ monoColor })} />
        )}
        <NumberField label="Spacing" unit="px" min={0} max={40} value={v.gap} onChange={(gap) => set({ gap })} />
        <AlignField value={v.align} onChange={(align) => set({ align })} />
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------- video */
export function VideoEditor({ block, set }: EditorProps<'video', VideoValues>) {
  const v = block.values;
  return (
    <>
      <Section title="Video">
        <TextField
          label="Video URL"
          value={v.url}
          onChange={(url) => set({ url })}
          placeholder="https://www.youtube.com/watch?v=…"
          hint="Email clients cannot play video, so the email shows a thumbnail that links to the video. YouTube thumbnails are picked up automatically."
        />
        <ImageUrlField
          label="Thumbnail URL (optional)"
          value={v.thumbnail}
          onChange={(thumbnail) => set({ thumbnail })}
          onPickAlt={(alt) => set({ alt })}
          displayWidth={Math.round((600 * v.width) / 100)}
          hint="YouTube thumbnails are picked up automatically. Other platforms need one here."
        />
        <TextField label="Alt text" value={v.alt} onChange={(alt) => set({ alt })} />
      </Section>
      <Section title="Style">
        <NumberField label="Width" unit="%" min={10} max={100} value={v.width} onChange={(width) => set({ width })} />
        <NumberField label="Corner radius" unit="px" min={0} max={60} value={v.borderRadius} onChange={(borderRadius) => set({ borderRadius })} />
        <AlignField value={v.align} onChange={(align) => set({ align })} />
        <ToggleField label="Show caption link" value={v.showCaption} onChange={(showCaption) => set({ showCaption })} />
        {v.showCaption && (
          <>
            <TextField label="Caption" value={v.caption} onChange={(caption) => set({ caption })} />
            <ColorField label="Caption color" value={v.captionColor} onChange={(captionColor) => set({ captionColor })} />
          </>
        )}
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* --------------------------------------------------------------------- html */
export function HtmlEditor({ block, set }: EditorProps<'html', HtmlValues>) {
  const v = block.values;
  return (
    <>
      <Section title="Custom HTML">
        <TextField
          label="HTML code"
          mono
          multiline
          rows={12}
          value={v.html}
          onChange={(html) => set({ html })}
          hint="Use email-safe HTML: tables and inline styles. Scripts and event handlers are removed in the editor preview."
        />
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------------- row */
export function RowEditor({
  row,
  onLayout,
  onChange,
}: {
  row: Row;
  onLayout: (layout: number[]) => void;
  onChange: (patch: Partial<Omit<Row, 'id' | 'columns'>>) => void;
}) {
  const sameLayout = (a: number[], b: number[]) => a.length === b.length && a.every((n, i) => n === b[i]);
  return (
    <>
      <Section title="Columns">
        <div className="grid grid-cols-2 gap-2">
          {ROW_LAYOUTS.map((l) => {
            const total = l.layout.reduce((a, b) => a + b, 0);
            const active = sameLayout(l.layout, row.layout);
            return (
              <button
                key={l.label}
                type="button"
                title={l.label}
                onClick={() => onLayout(l.layout)}
                className={`rounded-md border p-2 transition-colors ${
                  active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="flex h-6 gap-1">
                  {l.layout.map((n, i) => (
                    <div
                      key={i}
                      className={`rounded-sm ${active ? 'bg-brand-500' : 'bg-slate-300'}`}
                      style={{ width: `${(n / total) * 100}%` }}
                    />
                  ))}
                </div>
                <span className="mt-1 block text-center text-[10px] text-slate-500">{l.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-snug text-slate-400">
          When you reduce the number of columns, blocks from the removed columns move into the last one.
        </p>
      </Section>
      <Section title="Background">
        <ColorField
          label="Row background (full width)"
          value={row.bgColor}
          allowEmpty
          emptyLabel="transparent"
          onChange={(bgColor) => onChange({ bgColor })}
        />
        <ColorField
          label="Content background"
          value={row.contentBgColor}
          allowEmpty
          emptyLabel="same as email"
          onChange={(contentBgColor) => onChange({ contentBgColor })}
        />
      </Section>
      <Section title="Layout">
        <PaddingField value={row.padding} onChange={(padding) => onChange({ padding })} />
        {row.layout.length > 1 && (
          <ToggleField
            label="Stack columns on mobile"
            value={row.stackOnMobile}
            onChange={(stackOnMobile) => onChange({ stackOnMobile })}
          />
        )}
      </Section>
    </>
  );
}

/* --------------------------------------------------------------------- body */
/* ====================================================== composite blocks */

/** Add / remove / reorder rows of a repeater, bounded by min and max. */
function Repeater<T extends { id: string }>({
  items,
  onChange,
  make,
  min = 0,
  max = 99,
  addLabel,
  render,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  make: () => T;
  min?: number;
  max?: number;
  addLabel: string;
  render: (item: T, patch: (p: Partial<T>) => void) => React.ReactNode;
}) {
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const iconBtn =
    'rounded p-1 text-slate-400 enabled:hover:bg-white enabled:hover:text-slate-700 disabled:opacity-30';

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="mb-1.5 flex items-center gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              #{i + 1}
            </span>
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                title="Move up"
                aria-label={`Move item ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className={iconBtn}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                title="Move down"
                aria-label={`Move item ${i + 1} down`}
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
                className={iconBtn}
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                title={items.length <= min ? `At least ${min} required` : 'Remove'}
                aria-label={`Remove item ${i + 1}`}
                disabled={items.length <= min}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="rounded p-1 text-slate-400 enabled:hover:bg-red-50 enabled:hover:text-red-600 disabled:opacity-30"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {render(item, (p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x))))}
          </div>
        </div>
      ))}
      {items.length < max && (
        <button
          type="button"
          onClick={() => onChange([...items, make()])}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-500 hover:text-brand-700"
        >
          <Plus size={14} /> {addLabel}
        </button>
      )}
    </div>
  );
}

/** Image URL + alt pair. Alt is required: email clients block images by default. */
function ImageFields({
  label = 'Image',
  src,
  alt,
  onSrc,
  onAlt,
  displayWidth,
}: {
  label?: string;
  src: string;
  alt: string;
  onSrc: (v: string) => void;
  onAlt: (v: string) => void;
  /** rendered width in px, for the resolution note */
  displayWidth?: number;
}) {
  const missing = !alt.trim();
  return (
    <>
      <ImageUrlField
        label={`${label} URL`}
        value={src}
        onChange={onSrc}
        onPickAlt={onAlt}
        displayWidth={displayWidth}
      />
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Alt text <span className="text-red-600">*</span>
        </span>
        <input
          aria-label={`${label} alt text`}
          value={alt}
          placeholder="Describe the image"
          onChange={(e) => onAlt(e.target.value)}
          className={`w-full rounded-md border bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
            missing
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
              : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/20'
          }`}
        />
        {missing && (
          <span className="mt-1 block text-[11px] leading-snug text-red-600">
            Required — most inboxes block images by default, so this is what the reader sees.
          </span>
        )}
      </div>
    </>
  );
}

/**
 * A text field that either follows a brand token or holds a per-email override.
 * Mirrors how ColorField treats brand colours.
 */
function BrandTextField({
  label,
  value,
  token,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  token: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const brand = useActiveBrand();
  const fromBrand = value === token;
  const resolved = resolveToken(token, brand, 'preview');
  const cls =
    'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <button
          type="button"
          onClick={() => onChange(fromBrand ? resolved : token)}
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
        >
          {fromBrand ? 'Override' : 'Use brand'}
        </button>
      </div>
      {fromBrand ? (
        <div className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-xs text-brand-700">
          <span className="font-semibold">From brand</span>{' '}
          <span className="text-brand-600">
            {resolved || '(empty — fill it in the brand kit)'}
          </span>
        </div>
      ) : multiline ? (
        <textarea className={cls} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={cls} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** Background colour + the row write-through that makes it edge-to-edge. */
function FullWidthBg({
  bgColor,
  fullWidthBg,
  setBg,
  setFullWidth,
}: {
  bgColor: string;
  fullWidthBg: boolean;
  setBg: (v: string) => void;
  setFullWidth: (v: boolean) => void;
}) {
  return (
    <>
      <ColorField label="Background color" value={bgColor} allowEmpty emptyLabel="transparent" onChange={setBg} />
      <ToggleField label="Extend background full width" value={fullWidthBg} onChange={setFullWidth} />
      <p className="text-[11px] leading-snug text-slate-400">
        A block stops at the content width. This also paints the row behind it, which is the only
        way to reach the window edges — so it affects anything else sharing this row.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ header */
export function HeaderEditor({
  block,
  set,
  onRowPatch,
}: EditorProps<'header', HeaderValues> & { onRowPatch?: (patch: Partial<Row>) => void }) {
  const v = block.values;
  const brand = useActiveBrand();
  const usesBrandLogo = v.logoSrc === 'brand.logo';
  const resolvedLogo = resolveToken(v.logoSrc, brand, 'preview');

  const setBg = (bgColor: string) => {
    set({ bgColor });
    if (v.fullWidthBg) onRowPatch?.({ bgColor });
  };

  return (
    <>
      <Section title="Logo">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">Source</span>
          <button
            type="button"
            onClick={() => set({ logoSrc: usesBrandLogo ? resolvedLogo : 'brand.logo' })}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
          >
            {usesBrandLogo ? 'Use a custom logo' : 'Use brand logo'}
          </button>
        </div>
        {usesBrandLogo ? (
          <div className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-xs text-brand-700">
            <span className="font-semibold">From brand</span>{' '}
            <span className="text-brand-600">
              {resolvedLogo || `no logo set — showing "${brand.name}" as text`}
            </span>
          </div>
        ) : (
          <ImageFields
            label="Logo"
            src={v.logoSrc}
            alt={v.logoAlt}
            onSrc={(logoSrc) => set({ logoSrc })}
            onAlt={(logoAlt) => set({ logoAlt })}
          />
        )}
        <NumberField label="Logo width" unit="px" min={40} max={400} value={v.logoWidth} onChange={(logoWidth) => set({ logoWidth })} />
        {!resolvedLogo && (
          <>
            <p className="text-[11px] leading-snug text-slate-400">
              Text fallback, shown while the brand has no logo URL.
            </p>
            <NumberField label="Fallback text size" unit="px" min={12} max={40} value={v.fallbackFontSize} onChange={(fallbackFontSize) => set({ fallbackFontSize })} />
            <ColorField label="Fallback text color" value={v.fallbackColor} onChange={(fallbackColor) => set({ fallbackColor })} />
            <SelectField label="Fallback font" value={v.fallbackFontFamily} onChange={(fallbackFontFamily) => set({ fallbackFontFamily })} options={fontOptions(true)} />
          </>
        )}
      </Section>

      <Section title="Navigation">
        <ToggleField label="Show navigation" value={v.showNav} onChange={(showNav) => set({ showNav })} />
        {v.showNav && (
          <>
            <Repeater<NavLink>
              items={v.navLinks}
              onChange={(navLinks) => set({ navLinks })}
              make={() => ({ id: uid('nv'), label: 'New link', href: 'https://example.com' })}
              max={6}
              addLabel="Add link"
              render={(item, patch) => (
                <>
                  <input
                    aria-label="Link label"
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                    value={item.label}
                    onChange={(e) => patch({ label: e.target.value })}
                  />
                  <input
                    aria-label="Link URL"
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                    value={item.href}
                    placeholder="https://…"
                    onChange={(e) => patch({ href: e.target.value })}
                  />
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
                      checked={item.noTrack === true}
                      onChange={(e) => patch({ noTrack: e.target.checked })}
                    />
                    <span className="text-[11px] text-slate-500">Don&rsquo;t add tracking</span>
                  </label>
                </>
              )}
            />
            <NumberField label="Link size" unit="px" min={10} max={22} value={v.navFontSize} onChange={(navFontSize) => set({ navFontSize })} />
            <ColorField label="Link color" value={v.navColor} onChange={(navColor) => set({ navColor })} />
            <SelectField label="Link font" value={v.navFontFamily} onChange={(navFontFamily) => set({ navFontFamily })} options={fontOptions(true)} />
            <TextField label="Separator" value={v.navSeparator} placeholder="e.g. |" onChange={(navSeparator) => set({ navSeparator })} />
            <ToggleField label="Hide navigation on mobile" value={v.hideNavOnMobile} onChange={(hideNavOnMobile) => set({ hideNavOnMobile })} />
          </>
        )}
      </Section>

      <Section title="Style">
        <Segmented
          label="Layout"
          value={v.layout}
          onChange={(layout) => set({ layout })}
          options={[
            { value: 'logo-left' as const, label: 'Logo left' },
            { value: 'logo-center' as const, label: 'Centered' },
          ]}
        />
        <FullWidthBg
          bgColor={v.bgColor}
          fullWidthBg={v.fullWidthBg}
          setBg={setBg}
          setFullWidth={(fullWidthBg) => {
            set({ fullWidthBg });
            onRowPatch?.({ bgColor: fullWidthBg ? v.bgColor : '' });
          }}
        />
        <NumberField label="Bottom border" unit="px" min={0} max={8} value={v.borderWidth} onChange={(borderWidth) => set({ borderWidth })} />
        {v.borderWidth > 0 && (
          <ColorField label="Border color" value={v.borderColor} onChange={(borderColor) => set({ borderColor })} />
        )}
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------- hero */
export function HeroEditor({ block, set }: EditorProps<'hero', HeroValues>) {
  const v = block.values;
  const isCards = v.layout === 'cards-2' || v.layout === 'cards-3';
  const cardCount = v.layout === 'cards-3' ? 3 : 2;

  const makeCard = (): HeroCard => ({
    id: uid('hc'),
    imageSrc: '',
    imageAlt: '',
    title: 'New card',
    text: 'A short supporting sentence.',
    linkLabel: 'Learn more',
    linkHref: 'https://example.com',
  });

  /** The layout decides the column count, so the card list follows it. */
  const setLayout = (layout: HeroValues['layout']) => {
    if (layout !== 'cards-2' && layout !== 'cards-3') return set({ layout });
    const want = layout === 'cards-3' ? 3 : 2;
    const cards = [...v.cards];
    while (cards.length < want) cards.push(makeCard());
    set({ layout, cards: cards.slice(0, want) });
  };

  return (
    <>
      <Section title="Layout">
        <SelectField
          label="Arrangement"
          value={v.layout}
          onChange={setLayout}
          options={[
            { value: 'image-right' as const, label: 'Text left, image right' },
            { value: 'image-left' as const, label: 'Image left, text right' },
            { value: 'centered' as const, label: 'Centered' },
            { value: 'cards-2' as const, label: '2 cards' },
            { value: 'cards-3' as const, label: '3 cards' },
          ]}
        />
      </Section>

      <Section title="Content">
        <TextField label="Eyebrow" value={v.eyebrow} placeholder="Small label above the heading" onChange={(eyebrow) => set({ eyebrow })} />
        <TextField label="Heading" multiline rows={2} value={v.heading} onChange={(heading) => set({ heading })} />
        <TextField label="Subtext" multiline rows={3} value={v.subtext} onChange={(subtext) => set({ subtext })} />
      </Section>

      {!isCards && (
        <Section title="Image">
          <ImageFields
            src={v.imageSrc}
            alt={v.imageAlt}
            onSrc={(imageSrc) => set({ imageSrc })}
            onAlt={(imageAlt) => set({ imageAlt })}
          />
        </Section>
      )}

      {isCards && (
        <Section title={`Cards (${cardCount})`}>
          <Repeater<HeroCard>
            items={v.cards.slice(0, cardCount)}
            onChange={(cards) => set({ cards })}
            make={makeCard}
            min={cardCount}
            max={cardCount}
            addLabel="Add card"
            render={(item, patch) => (
              <>
                <input
                  aria-label="Card title"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                  value={item.title}
                  onChange={(e) => patch({ title: e.target.value })}
                />
                <textarea
                  aria-label="Card text"
                  rows={2}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  value={item.text}
                  onChange={(e) => patch({ text: e.target.value })}
                />
                <ImageFields
                  label="Card image"
                  src={item.imageSrc}
                  alt={item.imageAlt}
                  onSrc={(imageSrc) => patch({ imageSrc })}
                  onAlt={(imageAlt) => patch({ imageAlt })}
                />
                <input
                  aria-label="Card link label"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  value={item.linkLabel}
                  placeholder="Link label (optional)"
                  onChange={(e) => patch({ linkLabel: e.target.value })}
                />
                <input
                  aria-label="Card link URL"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  value={item.linkHref}
                  placeholder="https://…"
                  onChange={(e) => patch({ linkHref: e.target.value })}
                />
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
                    checked={item.noTrack === true}
                    onChange={(e) => patch({ noTrack: e.target.checked })}
                  />
                  <span className="text-[11px] text-slate-500">Don&rsquo;t add tracking</span>
                </label>
              </>
            )}
          />
          <p className="text-[11px] leading-snug text-slate-400">
            The arrangement sets the card count ({cardCount}). Cards stack on mobile.
          </p>
          <ColorField label="Card title color" value={v.cardTitleColor} onChange={(cardTitleColor) => set({ cardTitleColor })} />
          <ColorField label="Card text color" value={v.cardTextColor} onChange={(cardTextColor) => set({ cardTextColor })} />
          <ColorField label="Card link color" value={v.cardLinkColor} onChange={(cardLinkColor) => set({ cardLinkColor })} />
        </Section>
      )}

      {!isCards && (
        <Section title="Call to action">
          <TextField label="Button label" value={v.ctaLabel} placeholder="Leave empty to hide" onChange={(ctaLabel) => set({ ctaLabel })} />
          <LinkField
            label="Button URL"
            value={v.ctaHref}
            onChange={(ctaHref) => set({ ctaHref })}
            noTrack={v.ctaNoTrack}
            onNoTrack={(ctaNoTrack) => set({ ctaNoTrack })}
          />
          <Segmented
            label="Style"
            value={v.ctaStyle}
            onChange={(ctaStyle) => set({ ctaStyle })}
            options={[
              { value: 'filled' as const, label: 'Filled' },
              { value: 'outline' as const, label: 'Outline' },
            ]}
          />
          <ColorField label="Button color" value={v.ctaColor} onChange={(ctaColor) => set({ ctaColor })} />
          {v.ctaStyle === 'filled' && (
            <ColorField label="Button text color" value={v.ctaTextColor} onChange={(ctaTextColor) => set({ ctaTextColor })} />
          )}
        </Section>
      )}

      <Section title="Typography">
        <NumberField label="Heading size" unit="px" min={16} max={56} value={v.headingFontSize} onChange={(headingFontSize) => set({ headingFontSize })} />
        <Segmented label="Heading weight" value={v.headingFontWeight} onChange={(headingFontWeight) => set({ headingFontWeight })} options={boldOptions} />
        <SelectField label="Heading font" value={v.headingFontFamily} onChange={(headingFontFamily) => set({ headingFontFamily })} options={fontOptions(true)} />
        <ColorField label="Heading color" value={v.headingColor} onChange={(headingColor) => set({ headingColor })} />
        <ColorField label="Eyebrow color" value={v.eyebrowColor} onChange={(eyebrowColor) => set({ eyebrowColor })} />
        <NumberField label="Subtext size" unit="px" min={11} max={24} value={v.subtextFontSize} onChange={(subtextFontSize) => set({ subtextFontSize })} />
        <ColorField label="Subtext color" value={v.subtextColor} onChange={(subtextColor) => set({ subtextColor })} />
        <AlignField value={v.align} onChange={(align) => set({ align })} />
      </Section>

      <Section title="Background">
        <ColorField label="Background color" value={v.bgColor} allowEmpty emptyLabel="transparent" onChange={(bgColor) => set({ bgColor })} />
        {v.layout === 'centered' && (
          <ImageUrlField
            label="Background image URL"
            value={v.bgImage}
            onChange={(bgImage) => set({ bgImage })}
            displayWidth={600}
            hint="Outlook on Windows ignores background images and shows the background color instead, so pick a color that works on its own."
          />
        )}
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* ----------------------------------------------------------- article list */
export function ArticleListEditor({ block, set }: EditorProps<'articles', ArticleListValues>) {
  const v = block.values;
  const textOnly = v.layout === 'text-only';

  return (
    <>
      <Section title="Layout">
        <Segmented
          label="Arrangement"
          value={v.layout}
          onChange={(layout) => set({ layout })}
          options={[
            { value: 'thumb-left' as const, label: 'Thumb left' },
            { value: 'thumb-top' as const, label: 'Thumb top' },
            { value: 'text-only' as const, label: 'Text only' },
          ]}
        />
        {v.layout === 'thumb-left' && (
          <NumberField label="Thumbnail width" unit="px" min={80} max={280} value={v.thumbWidth} onChange={(thumbWidth) => set({ thumbWidth })} />
        )}
      </Section>

      <Section title={`Items (${v.items.length} of 10)`}>
        <Repeater<ArticleItem>
          items={v.items}
          onChange={(items) => set({ items })}
          make={() => ({
            id: uid('ai'),
            imageSrc: '',
            imageAlt: '',
            title: 'New article',
            excerpt: 'A short summary.',
            readMoreLabel: 'Read more',
            readMoreHref: 'https://example.com',
          })}
          min={1}
          max={10}
          addLabel="Add item"
          render={(item, patch) => (
            <>
              <input
                aria-label="Article title"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                value={item.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
              <textarea
                aria-label="Article excerpt"
                rows={2}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                value={item.excerpt}
                onChange={(e) => patch({ excerpt: e.target.value })}
              />
              {!textOnly && (
                <ImageFields
                  label="Thumbnail"
                  src={item.imageSrc}
                  alt={item.imageAlt}
                  onSrc={(imageSrc) => patch({ imageSrc })}
                  onAlt={(imageAlt) => patch({ imageAlt })}
                />
              )}
              <input
                aria-label="Read more label"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                value={item.readMoreLabel}
                placeholder="Read more label (optional)"
                onChange={(e) => patch({ readMoreLabel: e.target.value })}
              />
              <input
                aria-label="Read more URL"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                value={item.readMoreHref}
                placeholder="https://…"
                onChange={(e) => patch({ readMoreHref: e.target.value })}
              />
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
                  checked={item.noTrack === true}
                  onChange={(e) => patch({ noTrack: e.target.checked })}
                />
                <span className="text-[11px] text-slate-500">Don&rsquo;t add tracking</span>
              </label>
            </>
          )}
        />
      </Section>

      <Section title="Style">
        <ToggleField label="Divider between items" value={v.showDivider} onChange={(showDivider) => set({ showDivider })} />
        {v.showDivider && (
          <ColorField label="Divider color" value={v.dividerColor} onChange={(dividerColor) => set({ dividerColor })} />
        )}
        <NumberField label="Item spacing" unit="px" min={0} max={60} value={v.itemSpacing} onChange={(itemSpacing) => set({ itemSpacing })} />
        <NumberField label="Title size" unit="px" min={12} max={32} value={v.titleFontSize} onChange={(titleFontSize) => set({ titleFontSize })} />
        <Segmented label="Title weight" value={v.titleFontWeight} onChange={(titleFontWeight) => set({ titleFontWeight })} options={boldOptions} />
        <SelectField label="Title font" value={v.titleFontFamily} onChange={(titleFontFamily) => set({ titleFontFamily })} options={fontOptions(true)} />
        <ColorField label="Title color" value={v.titleColor} onChange={(titleColor) => set({ titleColor })} />
        <NumberField label="Excerpt size" unit="px" min={11} max={22} value={v.excerptFontSize} onChange={(excerptFontSize) => set({ excerptFontSize })} />
        <ColorField label="Excerpt color" value={v.excerptColor} onChange={(excerptColor) => set({ excerptColor })} />
        <ColorField label="Link color" value={v.linkColor} onChange={(linkColor) => set({ linkColor })} />
        <ColorField label="Background color" value={v.bgColor} allowEmpty emptyLabel="transparent" onChange={(bgColor) => set({ bgColor })} />
        <AlignField value={v.align} onChange={(align) => set({ align })} />
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ footer */
export function FooterEditor({
  block,
  set,
  onRowPatch,
}: EditorProps<'footer', FooterValues> & { onRowPatch?: (patch: Partial<Row>) => void }) {
  const v = block.values;
  const brand = useActiveBrand();
  const showFooter = useEditor((s) => s.design.body.showFooter);
  const usesBrandLogo = v.logoSrc === 'brand.logo';
  const resolvedLogo = resolveToken(v.logoSrc, brand, 'preview');

  const setBg = (bgColor: string) => {
    set({ bgColor });
    if (v.fullWidthBg) onRowPatch?.({ bgColor });
  };

  return (
    <>
      {!showFooter && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] leading-snug text-amber-900">
          <span className="font-semibold">Hidden on send.</span> “Show footer” is off in Email
          settings, so this block is left out of the preview and the export.
        </div>
      )}

      <Section title="Logo">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">Source</span>
          <button
            type="button"
            onClick={() => set({ logoSrc: usesBrandLogo ? resolvedLogo : 'brand.logo' })}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
          >
            {usesBrandLogo ? 'Use a custom logo' : 'Use brand logo'}
          </button>
        </div>
        {usesBrandLogo ? (
          <div className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-xs text-brand-700">
            <span className="font-semibold">From brand</span>{' '}
            <span className="text-brand-600">{resolvedLogo || '(no logo set — nothing is shown)'}</span>
          </div>
        ) : (
          <ImageFields
            label="Logo"
            src={v.logoSrc}
            alt={v.logoAlt}
            onSrc={(logoSrc) => set({ logoSrc })}
            onAlt={(logoAlt) => set({ logoAlt })}
          />
        )}
        <NumberField label="Logo width" unit="px" min={40} max={320} value={v.logoWidth} onChange={(logoWidth) => set({ logoWidth })} />
      </Section>

      <Section title="Text">
        <BrandTextField
          label="Address"
          value={v.address}
          token="brand.footer.address"
          multiline
          onChange={(address) => set({ address })}
        />
        <BrandTextField
          label="Legal text"
          value={v.legalText}
          token="brand.footer.legal"
          multiline
          onChange={(legalText) => set({ legalText })}
        />
        <BrandTextField
          label="Unsubscribe text"
          value={v.unsubscribeText}
          token="brand.footer.unsubscribe"
          onChange={(unsubscribeText) => set({ unsubscribeText })}
        />
        <TextField
          label="Unsubscribe URL"
          value={v.unsubscribeHref}
          onChange={(unsubscribeHref) => set({ unsubscribeHref })}
          hint="Merge tags like {{unsubscribe_url}} are passed through to the export untouched — your ESP fills them in."
        />
      </Section>

      <Section title="Social">
        <ToggleField label="Show social icons" value={v.showSocial} onChange={(showSocial) => set({ showSocial })} />
        {v.showSocial && (
          <>
            <ToggleField
              label="Use the brand's social links"
              value={v.useBrandSocial}
              onChange={(useBrandSocial) => set({ useBrandSocial })}
            />
            {v.useBrandSocial ? (
              <div className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-xs text-brand-700">
                <span className="font-semibold">From brand</span>{' '}
                <span className="text-brand-600">
                  {brand.social_links.length
                    ? brand.social_links.map((l) => SOCIAL_NETWORKS[l.network].label).join(', ')
                    : '(none yet — add them in the brand kit)'}
                </span>
              </div>
            ) : (
              <Repeater<SocialItem>
                items={v.socialItems}
                onChange={(socialItems) => set({ socialItems })}
                make={() => ({ id: uid('si'), network: 'linkedin', href: 'https://linkedin.com', iconUrl: '' })}
                max={8}
                addLabel="Add network"
                render={(item, patch) => (
                  <>
                    <select
                      aria-label="Network"
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                      value={item.network}
                      onChange={(e) => patch({ network: e.target.value as SocialNetwork })}
                    >
                      {(Object.keys(SOCIAL_NETWORKS) as SocialNetwork[]).map((n) => (
                        <option key={n} value={n}>
                          {SOCIAL_NETWORKS[n].label}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Profile URL"
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                      value={item.href}
                      placeholder="https://…"
                      onChange={(e) => patch({ href: e.target.value })}
                    />
                  </>
                )}
              />
            )}
            <NumberField label="Icon size" unit="px" min={18} max={48} value={v.socialSize} onChange={(socialSize) => set({ socialSize })} />
            <Segmented
              label="Icon colors"
              value={v.socialColorMode}
              onChange={(socialColorMode) => set({ socialColorMode })}
              options={[
                { value: 'brand' as const, label: 'Network' },
                { value: 'mono' as const, label: 'Single color' },
              ]}
            />
            {v.socialColorMode === 'mono' && (
              <ColorField label="Icon color" value={v.socialMonoColor} onChange={(socialMonoColor) => set({ socialMonoColor })} />
            )}
          </>
        )}
      </Section>

      <Section title="Style">
        <NumberField label="Text size" unit="px" min={9} max={18} value={v.fontSize} onChange={(fontSize) => set({ fontSize })} />
        <ColorField label="Text color" value={v.textColor} onChange={(textColor) => set({ textColor })} />
        <ColorField label="Link color" value={v.linkColor} onChange={(linkColor) => set({ linkColor })} />
        <SelectField label="Font" value={v.fontFamily} onChange={(fontFamily) => set({ fontFamily })} options={fontOptions(true)} />
        <FullWidthBg
          bgColor={v.bgColor}
          fullWidthBg={v.fullWidthBg}
          setBg={setBg}
          setFullWidth={(fullWidthBg) => {
            set({ fullWidthBg });
            onRowPatch?.({ bgColor: fullWidthBg ? v.bgColor : '' });
          }}
        />
        <NumberField label="Top border" unit="px" min={0} max={8} value={v.borderWidth} onChange={(borderWidth) => set({ borderWidth })} />
        {v.borderWidth > 0 && (
          <ColorField label="Border color" value={v.borderColor} onChange={(borderColor) => set({ borderColor })} />
        )}
        <AlignField value={v.align} onChange={(align) => set({ align })} />
      </Section>
      <Section title="Spacing">
        <PaddingField value={v.padding} onChange={(padding) => set({ padding })} />
      </Section>
    </>
  );
}

export function BodyEditor({
  body,
  onChange,
  onResetToBrand,
}: {
  body: BodySettings;
  onChange: (patch: Partial<BodySettings>) => void;
  onResetToBrand: () => void;
}) {
  const brand = useActiveBrand();
  // sample values are editor state, never part of the design
  const showSample = useEditor((s) => s.showSampleData);
  const onShowSample = useEditor((s) => s.setShowSampleData);
  const sample = useEditor((s) => s.sampleData);
  const onSample = useEditor((s) => s.setSampleData);
  return (
    <>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span
          className="h-5 w-5 shrink-0 rounded border border-slate-300"
          style={{ background: brand.tokens.colors.primary || '#fff' }}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{brand.name}</span>
        <button
          type="button"
          title="Put the brand colours and font back into the settings below"
          onClick={onResetToBrand}
          className="flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
        >
          <RotateCcw size={12} /> Reset to brand
        </button>
      </div>
      <Section title="Email">
        <TagTextField label="Title / subject" value={body.title} onChange={(title) => onChange({ title })} />
        <TagTextField
          label="Preheader"
          value={body.preheader}
          placeholder="Preview text shown next to the subject"
          onChange={(preheader) => onChange({ preheader })}
        />
      </Section>
      <Section title="Layout">
        <NumberField label="Content width" unit="px" min={400} max={800} step={10} value={body.width} onChange={(width) => onChange({ width })} />
        <ColorField label="Background color" value={body.bgColor} onChange={(bgColor) => onChange({ bgColor })} />
        <ColorField
          label="Content background"
          value={body.contentBgColor}
          allowEmpty
          emptyLabel="transparent"
          onChange={(contentBgColor) => onChange({ contentBgColor })}
        />
      </Section>
      <Section title="Merge tags" defaultOpen={false}>
        <SelectField
          label="Merge tag format"
          value={body.mergeFormat}
          onChange={(mergeFormat) => onChange({ mergeFormat })}
          options={[
            { value: 'curly' as const, label: 'Double curly — {{tag}}' },
            { value: 'mailchimp' as const, label: 'Mailchimp — *|TAG|*' },
            { value: 'hubspot' as const, label: 'HubSpot — {{ contact.tag }}' },
            { value: 'custom' as const, label: 'Custom prefix / suffix' },
          ]}
        />
        {body.mergeFormat === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="Prefix"
              value={body.mergeCustom.prefix}
              onChange={(prefix) => onChange({ mergeCustom: { ...body.mergeCustom, prefix } })}
            />
            <TextField
              label="Suffix"
              value={body.mergeCustom.suffix}
              onChange={(suffix) => onChange({ mergeCustom: { ...body.mergeCustom, suffix } })}
            />
          </div>
        )}
        <p className="text-[11px] leading-snug text-slate-400">
          Tags are always stored as <code>{'{{tag}}'}</code> and converted on export, so changing
          the format never edits your content.
        </p>
        <ToggleField label="Preview with sample data" value={showSample} onChange={onShowSample} />
        {showSample && (
          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
            {MERGE_TAGS.filter((t) => !t.tag.endsWith('_url')).map((t) => (
              <label key={t.tag} className="block">
                <span className="mb-0.5 block text-[11px] font-medium text-slate-600">{t.label}</span>
                <input
                  aria-label={`Sample ${t.label}`}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  value={sample[t.tag] ?? ''}
                  onChange={(e) => onSample({ ...sample, [t.tag]: e.target.value })}
                />
              </label>
            ))}
            <p className="text-[11px] leading-snug text-slate-500">
              Canvas only. The export always keeps the tags.
            </p>
          </div>
        )}
      </Section>

      <Section title="Link tracking" defaultOpen={false}>
        <ToggleField
          label="Add UTM parameters"
          value={body.utm.enabled}
          onChange={(enabled) =>
            onChange({
              utm: {
                ...body.utm,
                enabled,
                // a sensible campaign on first enable, still editable
                campaign: body.utm.campaign || slugify(body.title),
              },
            })
          }
        />
        {body.utm.enabled && (
          <>
            <TextField
              label="utm_source"
              value={body.utm.source}
              placeholder="e.g. newsletter"
              onChange={(source) => onChange({ utm: { ...body.utm, source } })}
            />
            <TextField
              label="utm_medium"
              value={body.utm.medium}
              onChange={(medium) => onChange({ utm: { ...body.utm, medium } })}
            />
            <TextField
              label="utm_campaign"
              value={body.utm.campaign}
              onChange={(campaign) => onChange({ utm: { ...body.utm, campaign } })}
            />
            <TextField
              label="utm_content (optional)"
              value={body.utm.content}
              onChange={(content) => onChange({ utm: { ...body.utm, content } })}
            />
            <TextField
              label="utm_term (optional)"
              value={body.utm.term}
              onChange={(term) => onChange({ utm: { ...body.utm, term } })}
            />
            <p className="text-[11px] leading-snug text-slate-400">
              Added at export only. Unsubscribe and view-in-browser links, merge tags,
              <code> mailto:</code>, <code>tel:</code> and anchors are always left alone, and an
              existing <code>utm_*</code> on a link is never overwritten.
            </p>
          </>
        )}
      </Section>

      <Section title="Footer">
        <ToggleField
          label="Show footer"
          value={body.showFooter}
          onChange={(showFooter) => onChange({ showFooter })}
        />
        <p className="text-[11px] leading-snug text-slate-400">
          When off, every Footer block is left out of the preview and the export. The blocks stay
          in the email, dimmed on the canvas, so you can switch them back on.
        </p>
      </Section>
      <Section title="Typography">
        <SelectField label="Default font" value={body.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} options={fontOptions(false)} />
        <ColorField label="Text color" value={body.textColor} onChange={(textColor) => onChange({ textColor })} />
        <ColorField label="Link color" value={body.linkColor} onChange={(linkColor) => onChange({ linkColor })} />
      </Section>
    </>
  );
}
