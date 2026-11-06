/**
 * Validates and sanitizes a text model's JSON response against a slot schema
 * (6A).
 *
 * This is a separate pass from the provider call, deliberately: the provider
 * only has to prove "valid JSON came back"; everything about whether
 * that JSON is *safe and usable* content lives here, so it can be unit tested
 * against adversarial input without touching a network call.
 *
 * Failure here is binary — the whole response is accepted or the whole thing
 * is rejected with a reason, surfaced to a Regenerate button. There is no
 * partial-repair, no silent truncation of an oversized field: an oversized
 * subject line truncated to fit would be a worse failure than just asking the
 * user to try again, and a model that got the shape wrong once is not
 * trustworthy to patch up automatically.
 */

import { CANONICAL_RE } from '../merge';
import type { BriefSlotSchema } from './slots';

/** Narrower than merge.ts's full MERGE_TAGS — this is specifically what AI
 *  copy is allowed to reference; unsubscribe/view-in-browser links are never
 *  something a model should be inventing placement for. */
export const AI_ALLOWED_MERGE_TAGS = ['first_name', 'last_name', 'company'] as const;

export interface ValidatedBriefResult {
  subjectOptions: string[];
  preheader: string;
  /** slot id -> sanitized text, or null if the model (correctly) skipped an optional slot */
  slotValues: Record<string, string | null>;
  /** repeater id -> one sanitized item per array position */
  repeaterValues: Record<string, Record<string, string>[]>;
  /** image slot id -> sanitized prompt, or null */
  imagePrompts: Record<string, string | null>;
}

export type ValidationFailure = { ok: false; reason: string };
export type ValidationResult = { ok: true; data: ValidatedBriefResult } | ValidationFailure;

/* ------------------------------------------------------------ sanitizing */

const HTML_TAG_RE = /<[^>]*>/g;
const URL_RE = /\bhttps?:\/\/\S+/gi;
/** `[text](url)` markdown links, and the bare markdown emphasis/heading tokens. */
const MD_LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;
/**
 * Deliberately no bare `_`/`__` token here. A lone underscore is far more
 * often a literal part of a word — a merge tag name (`first_name`), a code
 * identifier — than markdown italics, and this was a real bug: an earlier
 * version stripped underscores unconditionally, which turned `{{first_name}}`
 * into `{{firstname}}` *before* the allow-list check ran, so an allowed tag
 * silently vanished. Missing an occasional `_word_` italic is a far smaller
 * cost than corrupting an allowed merge tag.
 */
const MD_TOKEN_RE = /(\*\*|\*|`{1,3}|^#{1,6}\s+|^>\s+|^-\s+|^\d+\.\s+)/gm;
/** Placeholder marker used to shield an allowed merge tag from every later
 *  stripping pass; chosen to be printable and not match any of them itself. */
const TAG_MARK = 'ZzMERGETAGzZ';
const TAG_RESTORE_RE = new RegExp(`${TAG_MARK}(\\d+)${TAG_MARK}`, 'g');

/**
 * Strip HTML/markdown, reject (by stripping) bare URLs, and drop any merge
 * tag not on the allow-list — all while leaving bracket placeholders like
 * `[add date]` alone, since those are the intended missing-fact signal, not
 * something to clean up. Collapses the resulting whitespace.
 *
 * Allowed merge tags are swapped for a placeholder *before* any other pass
 * runs, and restored afterward — so nothing later in the pipeline (now, or
 * added later) can corrupt a `{{first_name}}`-shaped token while cleaning up
 * everything else.
 */
function sanitizeText(raw: string): string {
  const kept: string[] = [];
  let out = raw.replace(CANONICAL_RE, (whole, tag: string) => {
    if (!(AI_ALLOWED_MERGE_TAGS as readonly string[]).includes(tag)) return '';
    const marker = `${TAG_MARK}${kept.length}${TAG_MARK}`;
    kept.push(whole);
    return marker;
  });

  out = out
    .replace(HTML_TAG_RE, ' ')
    .replace(MD_LINK_RE, '$1')
    .replace(MD_TOKEN_RE, '')
    .replace(URL_RE, '');

  out = out.replace(TAG_RESTORE_RE, (_m, i: string) => kept[Number(i)]);

  return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function tooLong(text: string, maxChars: number): boolean {
  return text.length > maxChars;
}

/* ----------------------------------------------------------------- shape */

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * Validate the raw parsed JSON against the schema that was actually sent, and
 * sanitize every string field. Any shape mismatch, or any field over its
 * budget once sanitized, rejects the whole response.
 */
export function validateBriefResponse(raw: unknown, schema: BriefSlotSchema): ValidationResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'The response was not a JSON object.' };
  const body = raw as Record<string, unknown>;

  if (!isStringArray(body.subjectOptions) || body.subjectOptions.length === 0) {
    return { ok: false, reason: 'subjectOptions was missing or not a list of strings.' };
  }
  const subjectOptions = body.subjectOptions.map(sanitizeText);
  for (const s of subjectOptions) {
    if (tooLong(s, 60)) return { ok: false, reason: 'A subject option exceeded 60 characters.' };
  }

  if (typeof body.preheader !== 'string') {
    return { ok: false, reason: 'preheader was missing or not a string.' };
  }
  const preheader = sanitizeText(body.preheader);
  if (tooLong(preheader, 110)) return { ok: false, reason: 'The preheader exceeded 110 characters.' };

  const rawSlots = (body.slots ?? {}) as Record<string, unknown>;
  const slotValues: Record<string, string | null> = {};
  for (const slot of schema.slots) {
    const value = rawSlots[slot.id];
    if (value === null) {
      if (slot.required) return { ok: false, reason: `Required slot "${slot.id}" was left empty.` };
      slotValues[slot.id] = null;
      continue;
    }
    if (typeof value !== 'string') {
      return { ok: false, reason: `Slot "${slot.id}" was not a string.` };
    }
    const clean = sanitizeText(value);
    if (slot.required && clean === '') {
      return { ok: false, reason: `Required slot "${slot.id}" came back empty after cleanup.` };
    }
    if (tooLong(clean, slot.maxChars)) {
      return { ok: false, reason: `Slot "${slot.id}" exceeded its ${slot.maxChars}-character limit.` };
    }
    slotValues[slot.id] = clean;
  }

  const rawRepeaters = (body.repeaters ?? {}) as Record<string, unknown>;
  const repeaterValues: Record<string, Record<string, string>[]> = {};
  for (const repeater of schema.repeaters) {
    const items = rawRepeaters[repeater.id];
    if (!Array.isArray(items) || items.length !== repeater.count) {
      return {
        ok: false,
        reason: `Repeater "${repeater.id}" needed exactly ${repeater.count} items.`,
      };
    }
    const cleanItems: Record<string, string>[] = [];
    for (const rawItem of items as unknown[]) {
      if (!rawItem || typeof rawItem !== 'object') {
        return { ok: false, reason: `Repeater "${repeater.id}" had a non-object item.` };
      }
      const itemObj = rawItem as Record<string, unknown>;
      const cleanItem: Record<string, string> = {};
      for (const field of repeater.itemSlots) {
        const value = itemObj[field.field];
        if (typeof value !== 'string') {
          return { ok: false, reason: `Repeater "${repeater.id}" field "${field.field}" was not a string.` };
        }
        const clean = sanitizeText(value);
        if (tooLong(clean, field.maxChars)) {
          return {
            ok: false,
            reason: `Repeater "${repeater.id}" field "${field.field}" exceeded ${field.maxChars} characters.`,
          };
        }
        cleanItem[field.field] = clean;
      }
      cleanItems.push(cleanItem);
    }
    repeaterValues[repeater.id] = cleanItems;
  }

  const rawImages = (body.imagePrompts ?? {}) as Record<string, unknown>;
  const imagePrompts: Record<string, string | null> = {};
  for (const slot of schema.imageSlots) {
    const value = rawImages[slot.id];
    if (value === null || value === undefined) {
      imagePrompts[slot.id] = null;
      continue;
    }
    if (typeof value !== 'string') {
      return { ok: false, reason: `Image prompt "${slot.id}" was not a string.` };
    }
    const clean = sanitizeText(value);
    if (tooLong(clean, slot.maxChars)) {
      return { ok: false, reason: `Image prompt "${slot.id}" exceeded ${slot.maxChars} characters.` };
    }
    imagePrompts[slot.id] = clean || null;
  }

  return { ok: true, data: { subjectOptions, preheader, slotValues, repeaterValues, imagePrompts } };
}
