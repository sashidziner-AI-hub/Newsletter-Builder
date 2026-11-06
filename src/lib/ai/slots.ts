/**
 * Slots (6A) — the declarative bridge between a preset and a brief.
 *
 * A slot schema is **derived**, not hand-written per preset: it walks whatever
 * `preset.build(brand)` actually produced and classifies each block by *type*
 * against the lookup tables below. That is deliberate — writing 8 presets'
 * worth of literal block paths by hand would be fragile (every edit to a
 * preset's block order would silently break a hand-written path) and would
 * not generalise to a 9th preset. The classification table is the only thing
 * that has to know a field exists; everything else — which preset, how many
 * blocks, in what order — falls out of walking the real design tree.
 *
 * A field is REQUIRED exactly when the preset's own default copy for that
 * field is non-empty — a preset author filling in placeholder text is itself
 * the signal "this field matters for this layout." An empty default (e.g. a
 * hero's `ctaLabel` on a layout that does not really use a CTA) makes the
 * slot optional, and the AI may return `null` for it.
 *
 * AI never touches: `footer` (brand/legal copy), `divider`/`social`/`menu`/
 * `video` (no free copy, or structural), `html` (an open door we are not
 * handing to a model), logos, or `hero.bgImage`. Those are brand identity or
 * layout, not brief content — exactly the boundary 6A's brief draws.
 */

import { createBlock } from '../defaults';
import { uid } from '../util';
import type { ArticleItem, Block, Design } from '../../types';

export type SlotKind = 'short' | 'medium' | 'cta_label';

/** A single text field on a single (non-repeated) block. */
export interface Slot {
  id: string;
  /** live reference for write-back — never serialized, rebuilt per design */
  block: Block;
  field: string;
  /** human label, used as the review screen's "blockPath" breadcrumb */
  label: string;
  kind: SlotKind;
  maxChars: number;
  required: boolean;
}

/** One field, templated across every item of a repeater array. */
export interface RepeaterItemSlot {
  field: string;
  label: string;
  kind: SlotKind;
  maxChars: number;
}

export interface RepeaterGroup {
  id: string;
  block: Block;
  arrayField: 'cards' | 'items';
  label: string;
  itemSlots: RepeaterItemSlot[];
  /** the array's length right now — fixed for hero cards, user-resizable for articles */
  count: number;
}

/** Not filled by AI text generation — only a short prompt suggestion is asked for. */
export interface ImageSlot {
  id: string;
  block: Block;
  field: string;
  label: string;
  maxChars: number;
}

export interface BriefSlotSchema {
  presetId: string;
  slots: Slot[];
  repeaters: RepeaterGroup[];
  imageSlots: ImageSlot[];
}

/** Base character budgets, before the brief's `length` setting scales them. */
const MAX_CHARS: Record<SlotKind, number> = {
  short: 80,
  medium: 400,
  cta_label: 30,
};

/** `length: 'short'` asks for roughly two-thirds the room. */
const LENGTH_SCALE: Record<'short' | 'medium', number> = { short: 0.65, medium: 1 };

export const IMAGE_PROMPT_MAX_CHARS = 200;
export const SUBJECT_MAX_CHARS = 60;
export const PREHEADER_MAX_CHARS = 110;
export const SUBJECT_OPTION_COUNT = 3;

interface FieldSpec {
  field: string;
  label: string;
  kind: SlotKind;
  /** overrides the kind's base budget, before length scaling */
  maxChars?: number;
}

/** Which text fields a block type exposes, in the order they should appear. */
const TEXT_FIELDS: Partial<Record<Block['type'], FieldSpec[]>> = {
  heading: [{ field: 'text', label: 'Heading', kind: 'short', maxChars: 90 }],
  text: [{ field: 'html', label: 'Body text', kind: 'medium' }],
  button: [{ field: 'label', label: 'Button label', kind: 'cta_label', maxChars: 28 }],
  hero: [
    { field: 'eyebrow', label: 'Hero eyebrow', kind: 'short', maxChars: 40 },
    { field: 'heading', label: 'Hero heading', kind: 'short', maxChars: 90 },
    { field: 'subtext', label: 'Hero subtext', kind: 'medium', maxChars: 220 },
    { field: 'ctaLabel', label: 'Hero button label', kind: 'cta_label', maxChars: 28 },
  ],
};

/** Image fields AI may suggest a prompt for — content images only, never logos. */
const IMAGE_FIELDS: Partial<Record<Block['type'], { field: string; label: string }[]>> = {
  hero: [{ field: 'imageSrc', label: 'Hero image' }],
  image: [{ field: 'src', label: 'Image' }],
};

const REPEATERS: Partial<
  Record<
    Block['type'],
    {
      arrayField: 'cards' | 'items';
      label: string;
      itemSlots: RepeaterItemSlot[];
      /**
       * A block's array field can hold default placeholder data that is never
       * actually rendered — `createBlock('hero')` always populates `cards`,
       * but `render.ts` only draws them when `layout` is `cards-2`/`cards-3`
       * (every other layout ignores the array entirely). Without this guard,
       * the AI would be asked to write hero-card copy for presets like
       * `newsletter` or `promotional` that can never show it.
       */
      appliesIf?: (values: Record<string, unknown>) => boolean;
    }
  >
> = {
  hero: {
    arrayField: 'cards',
    label: 'Hero cards',
    itemSlots: [
      { field: 'title', label: 'Card title', kind: 'short', maxChars: 60 },
      { field: 'text', label: 'Card text', kind: 'medium', maxChars: 160 },
      { field: 'linkLabel', label: 'Card link label', kind: 'cta_label', maxChars: 24 },
    ],
    appliesIf: (values) => values.layout === 'cards-2' || values.layout === 'cards-3',
  },
  articles: {
    arrayField: 'items',
    label: 'Articles',
    itemSlots: [
      { field: 'title', label: 'Article title', kind: 'short', maxChars: 90 },
      { field: 'excerpt', label: 'Article excerpt', kind: 'medium', maxChars: 200 },
      { field: 'readMoreLabel', label: 'Read-more label', kind: 'cta_label', maxChars: 24 },
    ],
  },
};

/** The repeater's own image field, for an image-prompt slot per item. */
const REPEATER_IMAGE_FIELD: Partial<Record<Block['type'], string>> = {
  hero: 'imageSrc', // on each card
  articles: 'imageSrc', // on each item
};

function budget(kind: SlotKind, maxChars: number | undefined, length: 'short' | 'medium'): number {
  const base = maxChars ?? MAX_CHARS[kind];
  return Math.max(16, Math.round(base * LENGTH_SCALE[length]));
}

function walkBlocks(design: Design): Block[] {
  const out: Block[] = [];
  for (const row of design.rows) {
    for (const col of row.columns) out.push(...col.blocks);
  }
  return out;
}

export interface BuildSlotSchemaOptions {
  length: 'short' | 'medium';
  /** when the brief supplies its own CTA label, AI is not asked for one */
  ctaLabelProvided: boolean;
}

/**
 * Derive the slot schema from a freshly-built design. Call this again (on a
 * fresh `preset.build(brand)`) every time you need live block references —
 * the ones on a previous schema point at a design that may already be gone.
 */
export function buildSlotSchema(
  presetId: string,
  design: Design,
  opts: BuildSlotSchemaOptions,
): BriefSlotSchema {
  const slots: Slot[] = [];
  const repeaters: RepeaterGroup[] = [];
  const imageSlots: ImageSlot[] = [];
  let n = 0;

  for (const block of walkBlocks(design)) {
    const values = block.values as unknown as Record<string, unknown>;

    for (const spec of TEXT_FIELDS[block.type] ?? []) {
      if (spec.kind === 'cta_label' && opts.ctaLabelProvided) continue;
      const current = values[spec.field];
      if (typeof current !== 'string') continue;
      slots.push({
        id: `s${n++}_${block.type}_${spec.field}`,
        block,
        field: spec.field,
        label: spec.label,
        kind: spec.kind,
        maxChars: budget(spec.kind, spec.maxChars, opts.length),
        required: current.trim() !== '',
      });
    }

    for (const spec of IMAGE_FIELDS[block.type] ?? []) {
      const current = values[spec.field];
      if (typeof current !== 'string' || !current.trim()) continue;
      imageSlots.push({
        id: `img${n++}_${block.type}_${spec.field}`,
        block,
        field: spec.field,
        label: spec.label,
        maxChars: IMAGE_PROMPT_MAX_CHARS,
      });
    }

    const repeater = REPEATERS[block.type];
    if (repeater && (!repeater.appliesIf || repeater.appliesIf(values))) {
      const arr = values[repeater.arrayField];
      if (Array.isArray(arr) && arr.length > 0) {
        repeaters.push({
          id: `r${n++}_${block.type}_${repeater.arrayField}`,
          block,
          arrayField: repeater.arrayField,
          label: repeater.label,
          itemSlots: repeater.itemSlots.map((s) => ({
            ...s,
            maxChars: budget(s.kind, s.maxChars, opts.length),
          })),
          count: arr.length,
        });

        const imageField = REPEATER_IMAGE_FIELD[block.type];
        if (imageField) {
          arr.forEach((item: Record<string, unknown>, i: number) => {
            const current = item[imageField];
            if (typeof current === 'string' && current.trim()) {
              imageSlots.push({
                id: `img${n++}_${block.type}_${repeater.arrayField}_${i}`,
                block,
                field: `${repeater.arrayField}[${i}].${imageField}`,
                label: `${repeater.label} ${i + 1} image`,
                maxChars: IMAGE_PROMPT_MAX_CHARS,
              });
            }
          });
        }
      }
    }
  }

  return { presetId, slots, repeaters, imageSlots };
}

/**
 * Resize the first `articles` block's item array to `count` (clamped 1–10),
 * before deriving slots. This is the only brief-driven structural change 6A
 * makes, and it is deliberately narrow: it only ever touches an `articles`
 * block's own `items` array — never adds/removes blocks, never touches hero
 * cards (whose count is fixed by the preset's chosen layout, a structural
 * choice outside the brief's reach). Presets with no `articles` block are
 * simply unaffected; the brief's article-count field has nothing to resize.
 */
export function resizeArticleRepeater(design: Design, count: number): void {
  const clamped = Math.max(1, Math.min(10, Math.round(count)));
  for (const row of design.rows) {
    for (const col of row.columns) {
      for (const block of col.blocks) {
        if (block.type !== 'articles') continue;
        const values = block.values; // narrowed to ArticleListValues by the guard above
        const items = values.items;
        if (items.length === clamped) return;
        if (items.length > clamped) {
          values.items = items.slice(0, clamped);
          return;
        }
        // grow: clone the last item's shape with fresh ids and empty-ish copy,
        // which is also fine either as a slot default or an AI target
        // createBlock() returns the general Block union regardless of the
        // literal type passed in, so its own return type isn't narrowed here
        const fresh = createBlock('articles') as Extract<Block, { type: 'articles' }>;
        const template: ArticleItem = items[items.length - 1] ?? fresh.values.items[0];
        const grown = [...items];
        while (grown.length < clamped) {
          grown.push({ ...template, id: uid('ai') });
        }
        values.items = grown;
        return;
      }
    }
  }
}
