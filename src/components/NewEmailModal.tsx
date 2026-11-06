import { useEffect, useMemo, useState } from 'react';
import { FilePlus2, Wand2 } from 'lucide-react';
import type { Brand, Design } from '../types';
import { resolvedDesign } from '../lib/output';
import { emptyDesign } from '../lib/defaults';
import { applyEmailDefaults, loadEmailDefaults } from '../lib/email-defaults';
import { PRESETS, type Preset } from '../lib/presets';
import { renderDesign } from '../lib/render';
import { useAccessibleBrands, useActiveBrand, useEditor } from '../store';
import { useConfirm } from './ConfirmDialog';
import { Modal } from './Modals';
import { BriefForm } from './BriefForm';
import { BriefReview } from './BriefReview';
import { defaultBriefFields, type BriefFields, type BriefRecord } from '../lib/ai/brief-types';
import { generateBriefDraft, writeBriefDraftOntoDesign, type BriefDraft } from '../lib/ai/create-from-brief';
import { currentTaskModel, isTaskReady } from '../lib/ai/run-task';
import { openAiSettings } from './settings/settings-nav';
import { toAiError } from '../lib/ai/provider';

/** Width the renderer lays out at; thumbnails are this scaled down. */
const DESIGN_WIDTH = 600;
const THUMB_WIDTH = 190;
const THUMB_HEIGHT = 240;

/**
 * A live thumbnail: the real exported HTML in a sandboxed iframe, scaled with a
 * CSS transform. The transform is builder chrome and never reaches an email, so
 * the no-flex/grid/position rule for the renderer does not apply here.
 */
export function PresetThumb({ design, brand }: { design: Design; brand: Brand }) {
  const html = useMemo(
    () => renderDesign(resolvedDesign(design, brand, 'preview')),
    [design, brand],
  );
  const scale = THUMB_WIDTH / DESIGN_WIDTH;

  return (
    <div
      className="overflow-hidden rounded border border-slate-200 bg-white"
      style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
    >
      <iframe
        title=""
        aria-hidden="true"
        tabIndex={-1}
        // no scripts: the thumbnail is inert
        sandbox=""
        scrolling="no"
        srcDoc={html}
        style={{
          width: DESIGN_WIDTH,
          height: THUMB_HEIGHT / scale,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function Card({
  name,
  description,
  onPick,
  children,
}: {
  name: string;
  description: string;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex w-full flex-col items-stretch gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition-all hover:border-brand-500 hover:shadow-md focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        {children}
        <div className="px-0.5">
          <p className="text-sm font-semibold text-slate-900">{name}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{description}</p>
        </div>
      </button>
    </li>
  );
}

export function NewEmailModal({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const startNewEmail = useEditor((s) => s.startNewEmail);
  const snapshot = useEditor((s) => s.snapshot);
  const dirty = useEditor((s) => s.dirty);
  const setBrandId = useEditor((s) => s.setBrandId);
  const brands = useAccessibleBrands();
  const brand = useActiveBrand();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'presets' | 'brief'>('presets');

  // 7A: pre-select the configured default brand once, the same way the brand
  // selector below already works (setBrandId previews against the current
  // design) — a no-op when no default is set or it doesn't resolve to a real,
  // accessible brand.
  useEffect(() => {
    const defaultBrandId = loadEmailDefaults().defaultBrandId;
    if (defaultBrandId && defaultBrandId !== brand.id && brands.some((b) => b.id === defaultBrandId)) {
      setBrandId(defaultBrandId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // built once per brand: each build() mints fresh ids, so these previews are
  // throwaway copies and never the designs that get applied
  const previews = useMemo(
    () => PRESETS.map((p) => ({ preset: p, design: p.build(brand) })),
    [brand],
  );

  /**
   * Auto-save means starting a new email keeps the old one, so this only asks
   * when a change from the last couple of seconds is still unflushed.
   */
  const replaceThen = (action: () => void) => {
    if (!dirty) return action();
    confirm(
      {
        title: 'Start a new email?',
        message: 'A change from the last couple of seconds may not be saved yet.',
        confirmLabel: 'Start new',
      },
      action,
    );
  };

  const apply = (preset: Preset) =>
    replaceThen(() => {
      // snapshot the outgoing email before the canvas is replaced
      snapshot('pre-replace', 'Before starting from a preset');
      // a fresh build, not the preview copy; a new email, not an edit of this one
      startNewEmail(applyEmailDefaults({ ...preset.build(brand), brandId: brand.id }));
      notify(`Started from "${preset.name}"`);
      onClose();
    });

  const blank = () =>
    replaceThen(() => {
      snapshot('pre-replace', 'Before starting a blank email');
      startNewEmail(applyEmailDefaults({ ...emptyDesign(), brandId: brand.id }));
      notify('New blank email');
      onClose();
    });

  return (
    <Modal title="New email" onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <label htmlFor="new-email-brand" className="text-xs font-medium text-slate-600">
          Brand
        </label>
        <span
          aria-hidden="true"
          className="h-5 w-5 shrink-0 rounded border border-slate-300"
          style={{ background: brand.tokens.colors.primary || '#fff' }}
        />
        <select
          id="new-email-brand"
          aria-label="Brand"
          value={brand.id}
          onChange={(e) => setBrandId(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <p className="ml-auto text-[11px] text-slate-400">
          {tab === 'presets'
            ? 'Previews are themed with the selected brand. Placeholder images and copy are meant to be replaced.'
            : 'AI fills in a preset\'s copy from your brief. Layout, colours and links stay untouched.'}
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 bg-white px-5 pt-2">
        {(['presets', 'brief'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium ${
              tab === t
                ? 'border border-b-0 border-slate-200 bg-white text-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'brief' && <Wand2 size={13} />}
            {t === 'presets' ? 'Presets' : 'Generate from brief'}
          </button>
        ))}
      </div>

      {tab === 'presets' ? (
        <div className="scroll-thin min-h-[360px] flex-1 overflow-y-auto p-5">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Card
              name="Blank"
              description="An empty canvas using this brand's colours and fonts."
              onPick={blank}
            >
              <div
                className="flex items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-slate-400"
                style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
              >
                <FilePlus2 size={28} strokeWidth={1.5} />
              </div>
            </Card>

            {previews.map(({ preset, design: d }) => (
              <Card
                key={preset.id}
                name={preset.name}
                description={preset.description}
                onPick={() => apply(preset)}
              >
                <PresetThumb design={d} brand={brand} />
              </Card>
            ))}
          </ul>
        </div>
      ) : (
        <div className="scroll-thin min-h-[360px] flex-1 overflow-y-auto p-5">
          <BriefTab brand={brand} replaceThen={replaceThen} snapshot={snapshot} notify={notify} onClose={onClose} />
        </div>
      )}
    </Modal>
  );
}

/* ----------------------------------------------------------- generate-from-brief */

function BriefTab({
  brand,
  replaceThen,
  snapshot,
  notify,
  onClose,
}: {
  brand: Brand;
  replaceThen: (action: () => void) => void;
  snapshot: (reason: 'pre-replace', note?: string) => void;
  notify: (m: string) => void;
  onClose: () => void;
}) {
  const startNewEmail = useEditor((s) => s.startNewEmail);
  const [fields, setFields] = useState<BriefFields>(defaultBriefFields());
  const [draft, setDraft] = useState<BriefDraft | null>(null);
  const [chosenSubject, setChosenSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = isTaskReady('text.brief');
  const model = currentTaskModel('text.brief');

  const generate = async () => {
    if (busy) return;
    if (!ready) {
      setError('text.brief task not ready.'); // the inline setup message covers this; generate() stays unreachable while !ready
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await generateBriefDraft({ brand, fields, signal: new AbortController().signal });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setDraft(result.draft);
      setChosenSubject(result.draft.data.subjectOptions[0] ?? '');
    } catch (e) {
      setError(toAiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    if (!draft) return;
    replaceThen(() => {
      snapshot('pre-replace', 'Before creating an email from a brief');
      writeBriefDraftOntoDesign(draft, fields, chosenSubject.trim());
      const brief: BriefRecord = {
        fields,
        resolvedPresetId: draft.presetId,
        reviewed: false,
        generatedAt: Date.now(),
      };
      startNewEmail(applyEmailDefaults({ ...draft.design, brandId: brand.id }), brief);
      notify('Created from a brief');
      onClose();
    });
  };

  if (draft) {
    return (
      <BriefReview
        draft={draft}
        brand={brand}
        model={model}
        chosenSubject={chosenSubject}
        onChosenSubjectChange={setChosenSubject}
        onCreate={create}
        onRegenerate={() => void generate()}
        onEditBrief={() => setDraft(null)}
        busy={busy}
      />
    );
  }

  return (
    <BriefForm
      brand={brand}
      fields={fields}
      onChange={setFields}
      onGenerate={() => void generate()}
      busy={busy}
      error={error}
      ready={ready}
      model={model}
      onOpenAiSettings={() => {
        // the modal covers the whole screen, so the hub underneath isn't
        // visible until this closes
        openAiSettings();
        onClose();
      }}
    />
  );
}
