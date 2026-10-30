import { useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Copy,
  Download,
  ImagePlus,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Brand, BrandColors, BrandSocialLink, SocialNetwork } from '../types';
import { canEditBrand, emptyBrand, normalizeBrand } from '../lib/brand';
import { FONT_STACKS, SOCIAL_NETWORKS } from '../lib/defaults';
import { readLogoFile } from '../lib/image';
import { downloadFile, slugify, uid } from '../lib/util';
import { useAccessibleBrands, useEditor } from '../store';
import {
  ColorField,
  ImageUrlField,
  NumberField,
  Section,
  Segmented,
  SelectField,
  TextField,
  ToggleField,
} from './fields';
import { useConfirm } from './ConfirmDialog';
import { Modal } from './Modals';

const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const ghostBtn =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50';

const COLOR_FIELDS: { key: keyof BrandColors; label: string }[] = [
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

/* --------------------------------------------------------------- logo field */

function LogoField({
  label,
  upload,
  url,
  onUpload,
  onUrl,
}: {
  label: string;
  upload: string;
  url: string;
  onUpload: (v: string) => void;
  onUrl: (v: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const onFile = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      onUpload(await readLogoFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
          {upload || url ? (
            <img src={upload || url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[10px] text-slate-400">no logo</span>
          )}
        </span>
        <button type="button" className={ghostBtn} onClick={() => input.current?.click()}>
          <ImagePlus size={14} /> Upload
        </button>
        {upload && (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
            onClick={() => onUpload('')}
          >
            Remove
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ImageUrlField
        label="Hosted logo URL (used in exports)"
        value={url}
        onChange={onUrl}
        hint="Uploads are a canvas preview only — email clients strip embedded images. Exports always use this https URL."
      />
    </div>
  );
}

/* ------------------------------------------------------------ kit preview */

function BrandPreview({ brand }: { brand: Brand }) {
  const c = brand.tokens.colors;
  const b = brand.tokens.button;
  const logo = brand.logo || brand.logo_url;

  return (
    <div className="rounded-lg border border-slate-200 p-3" style={{ background: c.page_bg || '#fff' }}>
      <div
        className="mx-auto max-w-sm rounded p-5"
        style={{ background: c.content_bg || '#fff', fontFamily: brand.tokens.fonts.body }}
      >
        {logo ? (
          <img src={logo} alt={brand.name} className="mb-4 max-h-10 object-contain" />
        ) : (
          <div className="mb-4 text-xs italic" style={{ color: c.muted }}>
            (no logo yet)
          </div>
        )}
        <h3
          className="text-xl"
          style={{ fontFamily: brand.tokens.fonts.heading, color: c.secondary, fontWeight: 700 }}
        >
          A sample headline
        </h3>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: c.text }}>
          Body copy in the brand body font. Here is a{' '}
          <span style={{ color: c.link, textDecoration: 'underline' }}>brand link</span> inside a sentence.
        </p>
        <p className="mt-2 text-xs" style={{ color: c.muted }}>
          Muted secondary text, used for captions and small print.
        </p>
        <div className="mt-4">
          <span
            className="inline-block text-sm"
            style={{
              background: c.primary,
              color: c.content_bg,
              borderRadius: b.radius,
              padding: `${b.paddingV}px ${b.paddingH}px`,
              fontWeight: b.weight === 'bold' ? 700 : 400,
              textTransform: b.uppercase ? 'uppercase' : 'none',
            }}
          >
            Call to action
          </span>
        </div>
        <hr className="my-4 border-0 border-t" style={{ borderColor: c.border }} />
        {brand.social_links.length > 0 && (
          <div className="mb-3 flex gap-1.5">
            {brand.social_links.map((l) => (
              <span
                key={l.id}
                title={SOCIAL_NETWORKS[l.network].label}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ background: c.accent }}
              >
                {SOCIAL_NETWORKS[l.network].short}
              </span>
            ))}
          </div>
        )}
        <div className="space-y-0.5 text-[11px]" style={{ color: c.muted }}>
          {brand.footer.address && <p>{brand.footer.address}</p>}
          {brand.footer.legal_text && <p>{brand.footer.legal_text}</p>}
          {brand.footer.unsubscribe_text && (
            <p style={{ color: c.link, textDecoration: 'underline' }}>{brand.footer.unsubscribe_text}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- form */

function BrandForm({
  value,
  onChange,
}: {
  value: Brand;
  onChange: (next: Brand) => void;
}) {
  const set = (patch: Partial<Brand>) => onChange({ ...value, ...patch });
  const setColor = (key: keyof BrandColors, v: string) =>
    onChange({
      ...value,
      tokens: { ...value.tokens, colors: { ...value.tokens.colors, [key]: v } },
    });
  const setFont = (key: 'heading' | 'body', v: string) =>
    onChange({ ...value, tokens: { ...value.tokens, fonts: { ...value.tokens.fonts, [key]: v } } });
  const setButton = (patch: Partial<Brand['tokens']['button']>) =>
    onChange({ ...value, tokens: { ...value.tokens, button: { ...value.tokens.button, ...patch } } });
  const setFooter = (patch: Partial<Brand['footer']>) =>
    onChange({ ...value, footer: { ...value.footer, ...patch } });
  const setLinks = (social_links: BrandSocialLink[]) => onChange({ ...value, social_links });

  return (
    <>
      <Section title="Identity">
        <TextField
          label="Name"
          value={value.name}
          onChange={(name) => set({ name, slug: slugify(name) })}
        />
        <TextField label="Slug" value={value.slug} onChange={(slug) => set({ slug: slugify(slug) })} />
        <TextField
          label="Website URL"
          value={value.website_url}
          placeholder="https://…"
          onChange={(website_url) => set({ website_url })}
        />
      </Section>

      <Section title="Logos">
        <LogoField
          label="Logo (light backgrounds)"
          upload={value.logo}
          url={value.logo_url}
          onUpload={(logo) => set({ logo })}
          onUrl={(logo_url) => set({ logo_url })}
        />
        <LogoField
          label="Logo (dark backgrounds, optional)"
          upload={value.logo_dark}
          url={value.logo_dark_url}
          onUpload={(logo_dark) => set({ logo_dark })}
          onUrl={(logo_dark_url) => set({ logo_dark_url })}
        />
      </Section>

      <Section title="Colors">
        {COLOR_FIELDS.map((f) => (
          // noBrand: the swatch row shows the *active* brand, which is not the
          // brand being edited here.
          <ColorField
            key={f.key}
            noBrand
            label={f.label}
            value={value.tokens.colors[f.key]}
            onChange={(v) => setColor(f.key, v)}
          />
        ))}
      </Section>

      <Section title="Fonts">
        <SelectField
          label="Heading font"
          value={value.tokens.fonts.heading}
          onChange={(v) => setFont('heading', v)}
          options={FONT_STACKS.map((f) => ({ value: f.value, label: f.label }))}
        />
        <SelectField
          label="Body font"
          value={value.tokens.fonts.body}
          onChange={(v) => setFont('body', v)}
          options={FONT_STACKS.map((f) => ({ value: f.value, label: f.label }))}
        />
      </Section>

      <Section title="Buttons" defaultOpen={false}>
        <NumberField
          label="Corner radius"
          unit="px"
          min={0}
          max={50}
          value={value.tokens.button.radius}
          onChange={(radius) => setButton({ radius })}
        />
        <NumberField
          label="Inner padding (vertical)"
          unit="px"
          min={0}
          max={50}
          value={value.tokens.button.paddingV}
          onChange={(paddingV) => setButton({ paddingV })}
        />
        <NumberField
          label="Inner padding (horizontal)"
          unit="px"
          min={0}
          max={100}
          value={value.tokens.button.paddingH}
          onChange={(paddingH) => setButton({ paddingH })}
        />
        <Segmented
          label="Weight"
          value={value.tokens.button.weight}
          onChange={(weight) => setButton({ weight })}
          options={[
            { value: 'normal' as const, label: 'Normal' },
            { value: 'bold' as const, label: 'Bold' },
          ]}
        />
        <ToggleField
          label="Uppercase label"
          value={value.tokens.button.uppercase}
          onChange={(uppercase) => setButton({ uppercase })}
        />
      </Section>

      <Section title="Footer" defaultOpen={false}>
        <TextField
          label="Address"
          multiline
          rows={2}
          value={value.footer.address}
          onChange={(address) => setFooter({ address })}
        />
        <TextField
          label="Legal text"
          multiline
          rows={2}
          value={value.footer.legal_text}
          onChange={(legal_text) => setFooter({ legal_text })}
        />
        <TextField
          label="Unsubscribe text"
          value={value.footer.unsubscribe_text}
          onChange={(unsubscribe_text) => setFooter({ unsubscribe_text })}
        />
      </Section>

      <Section title="Social links" defaultOpen={false}>
        {value.social_links.map((link, i) => (
          <div key={link.id} className="flex items-end gap-1.5">
            <div className="w-28 shrink-0">
              <SelectField
                label="Network"
                value={link.network}
                onChange={(network) =>
                  setLinks(value.social_links.map((l, j) => (i === j ? { ...l, network } : l)))
                }
                options={(Object.keys(SOCIAL_NETWORKS) as SocialNetwork[]).map((n) => ({
                  value: n,
                  label: SOCIAL_NETWORKS[n].label,
                }))}
              />
            </div>
            <div className="min-w-0 flex-1">
              <TextField
                label="URL"
                value={link.url}
                placeholder="https://…"
                onChange={(url) =>
                  setLinks(value.social_links.map((l, j) => (i === j ? { ...l, url } : l)))
                }
              />
            </div>
            <button
              type="button"
              aria-label={`Remove ${SOCIAL_NETWORKS[link.network].label}`}
              className="mb-1 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => setLinks(value.social_links.filter((_, j) => j !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={`${ghostBtn} w-full justify-center`}
          onClick={() =>
            setLinks([...value.social_links, { id: uid('bsl'), network: 'linkedin', url: '' }])
          }
        >
          <Plus size={14} /> Add social link
        </button>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ modal */

export function BrandsModal({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const brands = useEditor((s) => s.brands);
  const accessible = useAccessibleBrands();
  const archived = useMemo(() => brands.filter((b) => !b.is_active), [brands]);
  const upsertBrand = useEditor((s) => s.upsertBrand);
  const duplicateBrand = useEditor((s) => s.duplicateBrand);
  const setBrandArchived = useEditor((s) => s.setBrandArchived);
  const activeBrandId = useEditor((s) => s.design.brandId);
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  /** the in-progress copy; committed to the store on Save */
  const [draft, setDraft] = useState<Brand | null>(null);

  const startEdit = (brand: Brand) => {
    setEditingId(brand.id);
    setDraft(JSON.parse(JSON.stringify(brand)) as Brand);
  };

  const startCreate = () => {
    const fresh = emptyBrand('New brand');
    setEditingId(fresh.id);
    setDraft(fresh);
  };

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) return notify('Give the brand a name first');
    upsertBrand(draft);
    notify(`Saved "${draft.name}"`);
    setEditingId(null);
    setDraft(null);
  };

  const exportBrand = (brand: Brand) =>
    downloadFile(
      `brand-${brand.slug || slugify(brand.name)}.json`,
      JSON.stringify(brand, null, 2),
      'application/json',
    );

  const importBrand = async (file?: File) => {
    if (!file) return;
    let parsed: Brand | null = null;
    try {
      parsed = normalizeBrand(JSON.parse(await file.text()));
    } catch {
      return notify('Could not read that file');
    }
    if (!parsed) return notify('That file is not a valid brand kit JSON');
    const brand = parsed;

    const clash = brands.find((b) => b.id === brand.id || b.slug === brand.slug);
    if (!clash) {
      upsertBrand(brand);
      return notify(`Imported "${brand.name}"`);
    }
    confirm(
      {
        title: `Replace "${clash.name}"?`,
        message: 'A brand with this id or slug already exists. Importing will overwrite it.',
        confirmLabel: 'Overwrite',
        danger: true,
      },
      () => {
        upsertBrand({ ...brand, id: clash.id });
        notify(`Replaced "${clash.name}"`);
      },
    );
  };

  if (draft) {
    const editable = canEditBrand(null, draft);
    return (
      <Modal title={editingId && brands.some((b) => b.id === editingId) ? 'Edit brand' : 'New brand'} onClose={onClose} wide>
        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-2">
          <div className="scroll-thin min-h-0 overflow-y-auto border-r border-slate-200">
            <BrandForm value={draft} onChange={setDraft} />
          </div>
          <div className="scroll-thin min-h-0 overflow-y-auto bg-slate-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Brand kit preview
            </p>
            <BrandPreview brand={draft} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            className={ghostBtn}
            onClick={() => {
              setDraft(null);
              setEditingId(null);
            }}
          >
            Cancel
          </button>
          <button type="button" className={primaryBtn} disabled={!editable} onClick={save}>
            Save brand
          </button>
        </div>
      </Modal>
    );
  }

  const row = (brand: Brand) => (
    <li key={brand.id} className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
        {brand.logo || brand.logo_url ? (
          <img src={brand.logo || brand.logo_url} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[9px] text-slate-400">no logo</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {brand.name}
          {brand.id === activeBrandId && (
            <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
              in use
            </span>
          )}
        </p>
        <div className="mt-1 flex gap-1">
          {COLOR_FIELDS.slice(0, 6).map((f) => (
            <span
              key={f.key}
              title={`${f.label} · ${brand.tokens.colors[f.key]}`}
              className="h-3 w-3 rounded-sm border border-slate-200"
              style={{ background: brand.tokens.colors[f.key] || '#fff' }}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        title="Export brand JSON"
        aria-label={`Export ${brand.name}`}
        className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        onClick={() => exportBrand(brand)}
      >
        <Download size={15} />
      </button>
      <button
        type="button"
        title="Duplicate"
        aria-label={`Duplicate ${brand.name}`}
        className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        onClick={() => {
          const copy = duplicateBrand(brand.id);
          if (copy) {
            notify(`Duplicated as "${copy.name}"`);
            startEdit(copy);
          }
        }}
      >
        <Copy size={15} />
      </button>
      {brand.is_active ? (
        <>
          <button type="button" className={ghostBtn} onClick={() => startEdit(brand)}>
            Edit
          </button>
          <button
            type="button"
            title="Archive"
            aria-label={`Archive ${brand.name}`}
            className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
            onClick={() =>
              confirm(
                {
                  title: `Archive "${brand.name}"?`,
                  message:
                    'It disappears from the brand switcher. Emails using it fall back to the default brand. You can restore it here later.',
                  confirmLabel: 'Archive',
                  danger: true,
                },
                () => setBrandArchived(brand.id, true),
              )
            }
          >
            <Trash2 size={15} />
          </button>
        </>
      ) : (
        <button type="button" className={ghostBtn} onClick={() => setBrandArchived(brand.id, false)}>
          <ArchiveRestore size={14} /> Restore
        </button>
      )}
    </li>
  );

  return (
    <Modal title="Brands" onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
        <button type="button" className={primaryBtn} onClick={startCreate}>
          <Plus size={15} /> New brand
        </button>
        <button type="button" className={ghostBtn} onClick={() => fileInput.current?.click()}>
          <Upload size={15} /> Import JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void importBrand(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="ml-auto text-xs text-slate-400">Stored in this browser</p>
      </div>

      <div className="scroll-thin min-h-[320px] flex-1 overflow-y-auto p-5">
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {accessible.map(row)}
        </ul>
        {archived.length > 0 && (
          <>
            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Archived
            </p>
            <ul className="divide-y divide-slate-200 rounded-lg border border-dashed border-slate-300 opacity-70">
              {archived.map(row)}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
