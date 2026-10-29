import { useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import type {
  BodySettings,
  ButtonValues,
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
import { FONT_STACKS, ROW_LAYOUTS, SOCIAL_NETWORKS } from '../lib/defaults';
import { uid } from '../lib/util';
import {
  AlignField,
  ColorField,
  NumberField,
  PaddingField,
  Section,
  Segmented,
  SelectField,
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
        <TextField label="Heading text" multiline rows={2} value={v.text} onChange={(text) => set({ text })} />
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
const MAX_UPLOAD_WIDTH = 1200;

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not a valid image'));
      img.onload = () => {
        const scale = Math.min(1, MAX_UPLOAD_WIDTH / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(type, 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function ImageEditor({ block, set }: EditorProps<'image', ImageValues>) {
  const v = block.values;
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const isData = v.src.startsWith('data:');

  const onFile = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) return setError('Please choose an image file.');
    try {
      set({ src: await readImageFile(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
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
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <TextField
          label="Image URL"
          value={isData ? '' : v.src}
          placeholder={isData ? '(uploaded image embedded in the template)' : 'https://…'}
          onChange={(src) => set({ src })}
          hint={
            isData
              ? 'Embedded images do not display in Gmail and many other inboxes. Upload the file to your own storage/CDN and paste its URL here before sending.'
              : undefined
          }
        />
        <TextField label="Alt text" value={v.alt} onChange={(alt) => set({ alt })} placeholder="Describe the image" />
        <TextField label="Link URL (optional)" value={v.href} onChange={(href) => set({ href })} placeholder="https://…" />
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
  return (
    <>
      <Section title="Content">
        <TextField label="Label" value={v.label} onChange={(label) => set({ label })} />
        <TextField label="Link URL" value={v.href} onChange={(href) => set({ href })} placeholder="https://…" />
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
                <input
                  aria-label="Custom icon URL"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  value={it.iconUrl}
                  placeholder="Custom icon PNG URL (optional)"
                  onChange={(e) => updateItem(it.id, { iconUrl: e.target.value })}
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
        <TextField
          label="Thumbnail URL (optional)"
          value={v.thumbnail}
          onChange={(thumbnail) => set({ thumbnail })}
          placeholder="https://…/thumbnail.jpg"
          hint="Required for Vimeo and other platforms."
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
export function BodyEditor({
  body,
  onChange,
}: {
  body: BodySettings;
  onChange: (patch: Partial<BodySettings>) => void;
}) {
  return (
    <>
      <Section title="Email">
        <TextField label="Title / subject" value={body.title} onChange={(title) => onChange({ title })} />
        <TextField
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
      <Section title="Typography">
        <SelectField label="Default font" value={body.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} options={fontOptions(false)} />
        <ColorField label="Text color" value={body.textColor} onChange={(textColor) => onChange({ textColor })} />
        <ColorField label="Link color" value={body.linkColor} onChange={(linkColor) => onChange({ linkColor })} />
      </Section>
    </>
  );
}
