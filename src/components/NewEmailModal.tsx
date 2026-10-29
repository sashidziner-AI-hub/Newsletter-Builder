import { useMemo } from 'react';
import { FilePlus2 } from 'lucide-react';
import type { Brand, Design } from '../types';
import { resolvedDesign } from '../lib/output';
import { emptyDesign } from '../lib/defaults';
import { PRESETS, type Preset } from '../lib/presets';
import { renderDesign } from '../lib/render';
import { useAccessibleBrands, useActiveBrand, useEditor } from '../store';
import { useConfirm } from './ConfirmDialog';
import { Modal } from './Modals';

/** Width the renderer lays out at; thumbnails are this scaled down. */
const DESIGN_WIDTH = 600;
const THUMB_WIDTH = 190;
const THUMB_HEIGHT = 240;

/**
 * A live thumbnail: the real exported HTML in a sandboxed iframe, scaled with a
 * CSS transform. The transform is builder chrome and never reaches an email, so
 * the no-flex/grid/position rule for the renderer does not apply here.
 */
function PresetThumb({ design, brand }: { design: Design; brand: Brand }) {
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
  const design = useEditor((s) => s.design);
  const loadDesign = useEditor((s) => s.loadDesign);
  const setBrandId = useEditor((s) => s.setBrandId);
  const brands = useAccessibleBrands();
  const brand = useActiveBrand();
  const confirm = useConfirm();

  // built once per brand: each build() mints fresh ids, so these previews are
  // throwaway copies and never the designs that get applied
  const previews = useMemo(
    () => PRESETS.map((p) => ({ preset: p, design: p.build(brand) })),
    [brand],
  );

  /** Runs `action` straight away on an empty canvas, otherwise asks first. */
  const replaceThen = (action: () => void) => {
    if (design.rows.length === 0) return action();
    confirm(
      {
        title: 'Replace the current design?',
        message: 'Unsaved changes will be lost.',
        confirmLabel: 'Replace',
        danger: true,
      },
      action,
    );
  };

  const apply = (preset: Preset) =>
    replaceThen(() => {
      // a fresh build, not the preview copy
      loadDesign({ ...preset.build(brand), brandId: brand.id });
      notify(`Started from "${preset.name}"`);
      onClose();
    });

  const blank = () =>
    replaceThen(() => {
      loadDesign({ ...emptyDesign(), brandId: brand.id });
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
          Previews are themed with the selected brand. Placeholder images and copy are meant to
          be replaced.
        </p>
      </div>

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
    </Modal>
  );
}
