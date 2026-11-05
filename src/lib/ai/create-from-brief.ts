/**
 * The orchestration layer for 6A: turns a brief into a reviewable draft
 * (`generateBriefDraft`), and turns an approved draft into a filled `Design`
 * (`writeBriefDraftOntoDesign`) — the two halves of "Generate" and "Create"
 * on the review screen, with "Regenerate" just calling the first half again.
 *
 * Deliberately two functions, not one: the review screen needs to show the
 * subject options, preheader, image prompts and bracket placeholders
 * *before* anything is written onto a design, so the user can pick a subject
 * and then either Create or Regenerate without re-asking the model twice for
 * one decision.
 *
 * A provider failure (`AiError`) is left to propagate — the caller already
 * has a try/catch around every other provider call in this codebase (5A's
 * image generation action is the precedent) and shows the same Regenerate
 * button either way. Only a *validation* failure (the response parsed as
 * JSON but didn't pass `validateBriefResponse`) is returned as `{ ok: false }`,
 * since that is this layer's own concern, not the provider's.
 */

import { PRESETS } from '../presets';
import type { Block, Brand, Design } from '../../types';
import { BRIEF_SCHEMA_NAME, buildBriefJsonSchema } from './brief-schema';
import { buildSystemPrompt, buildUserMessage } from './brief-prompt';
import type { BriefFields } from './brief-types';
import { validateBriefResponse, type ValidatedBriefResult } from './brief-validate';
import { pickAutoPreset } from './preset-selection';
import {
  buildSlotSchema,
  PREHEADER_MAX_CHARS,
  resizeArticleRepeater,
  SUBJECT_MAX_CHARS,
  SUBJECT_OPTION_COUNT,
  type BriefSlotSchema,
} from './slots';
import type { TextProvider } from './text-provider';

export interface BriefDraft {
  presetId: string;
  /** fresh from `preset.build(brand)`, resized — not yet written with AI text */
  design: Design;
  schema: BriefSlotSchema;
  data: ValidatedBriefResult;
}

export type BriefDraftResult = { ok: true; draft: BriefDraft } | { ok: false; reason: string };

export interface GenerateBriefDraftOptions {
  brand: Brand;
  fields: BriefFields;
  provider: TextProvider;
  key: string;
  model: string;
  signal: AbortSignal;
}

/**
 * `chars / 3` is a deliberately pessimistic (over-, not under-) tokens
 * estimate for structured JSON output, which carries field-name and
 * punctuation overhead on top of the content itself. Clamped so a tiny
 * brief still gets enough room to produce valid JSON, and a huge one can't
 * ask for an unbounded reply.
 */
function estimateMaxOutputTokens(schema: BriefSlotSchema): number {
  let chars = SUBJECT_OPTION_COUNT * SUBJECT_MAX_CHARS + PREHEADER_MAX_CHARS;
  for (const slot of schema.slots) chars += slot.maxChars;
  for (const repeater of schema.repeaters) {
    for (const field of repeater.itemSlots) chars += field.maxChars * repeater.count;
  }
  for (const slot of schema.imageSlots) chars += slot.maxChars;
  const estimate = Math.ceil(chars / 3) + 500;
  return Math.min(4000, Math.max(400, estimate));
}

/** Resolve Auto to a concrete id, and fail clearly on an unknown explicit one. */
function resolvePreset(fields: BriefFields): { ok: true; presetId: string } | { ok: false; reason: string } {
  const presetId = fields.presetId ?? pickAutoPreset(fields.goal);
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return { ok: false, reason: `Unknown preset "${presetId}".` };
  return { ok: true, presetId };
}

/**
 * Call the model once and validate the result. Throws `AiError` on a
 * provider/network failure; returns `{ ok: false, reason }` on a response
 * that parsed but didn't validate.
 */
export async function generateBriefDraft(opts: GenerateBriefDraftOptions): Promise<BriefDraftResult> {
  const resolved = resolvePreset(opts.fields);
  if (!resolved.ok) return resolved;
  const preset = PRESETS.find((p) => p.id === resolved.presetId)!;

  const design = preset.build(opts.brand);
  resizeArticleRepeater(design, opts.fields.articleCount);

  const ctaLabelProvided = opts.fields.ctaLabel.trim() !== '';
  const schema = buildSlotSchema(resolved.presetId, design, { length: opts.fields.length, ctaLabelProvided });
  const jsonSchema = buildBriefJsonSchema(schema);

  const raw = await opts.provider.generateStructured(
    {
      system: buildSystemPrompt(opts.brand),
      user: buildUserMessage(opts.fields, schema),
      schema: jsonSchema,
      schemaName: BRIEF_SCHEMA_NAME,
      model: opts.model,
      maxOutputTokens: estimateMaxOutputTokens(schema),
      signal: opts.signal,
    },
    opts.key,
  );

  const result = validateBriefResponse(raw, schema);
  if (!result.ok) return { ok: false, reason: result.reason };

  return { ok: true, draft: { presetId: resolved.presetId, design, schema, data: result.data } };
}

/** Which href field carries a given block type's CTA link. */
const CTA_HREF_FIELD: Partial<Record<Block['type'], string>> = { hero: 'ctaHref', button: 'href' };

/**
 * Write a validated draft onto its own design: AI slot values, repeater
 * items, the user's own CTA label/URL (never AI content — see the brief's
 * own "AI never touches links" rule), and the chosen subject/preheader.
 * Mutates `draft.design` in place; call this only once Create is pressed.
 */
export function writeBriefDraftOntoDesign(draft: BriefDraft, fields: BriefFields, chosenSubject: string): void {
  const { design, schema, data } = draft;

  for (const slot of schema.slots) {
    const value = data.slotValues[slot.id];
    if (value === null) continue;
    (slot.block.values as unknown as Record<string, unknown>)[slot.field] = value;
  }

  for (const repeater of schema.repeaters) {
    const items = data.repeaterValues[repeater.id];
    const arr = (repeater.block.values as unknown as Record<string, unknown>)[repeater.arrayField] as Record<
      string,
      unknown
    >[];
    items.forEach((item, i) => {
      const target = arr[i];
      if (!target) return;
      for (const [field, value] of Object.entries(item)) target[field] = value;
    });
  }

  // cta_label fields are excluded from the AI schema entirely when the brief
  // supplies its own label (see slots.ts's `ctaLabelProvided`) — re-deriving
  // the schema against this same design, with that flag off, is how we find
  // which blocks those are without a second lookup table.
  const ctaLabel = fields.ctaLabel.trim();
  const ctaUrl = fields.ctaUrl.trim();
  if (ctaLabel || (ctaUrl && ctaUrl.startsWith('https://'))) {
    const ctaSlots = buildSlotSchema(draft.presetId, design, { length: fields.length, ctaLabelProvided: false }).slots;
    for (const slot of ctaSlots) {
      if (slot.kind !== 'cta_label') continue;
      const values = slot.block.values as unknown as Record<string, unknown>;
      if (ctaLabel) values[slot.field] = ctaLabel;
      if (ctaUrl && ctaUrl.startsWith('https://')) {
        const hrefField = CTA_HREF_FIELD[slot.block.type];
        if (hrefField) values[hrefField] = ctaUrl;
      }
    }
  }

  design.body.title = chosenSubject;
  design.body.preheader = data.preheader;
}
