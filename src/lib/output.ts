import { produce } from 'immer';
import type { Block, Brand, Design } from '../types';
import { resolveDesign, type ResolveMode } from './brand';
import { applySampleData, formatMergeTags } from './merge';
import { addUtm, countHtmlLinks, rewriteHtmlLinks, wouldTag } from './utm';

/**
 * The export boundary.
 *
 * This composes 1A's `resolveDesign()` rather than introducing a second
 * pipeline: brand tokens resolve first, then UTM, then merge-tag formatting.
 * Everything that renders — canvas, thumbnails, preview, HTML export, JSON
 * export, plain text — goes through here, so the stored design never changes.
 *
 * Order matters. UTM runs while tags are still canonical `{{tag}}`, so
 * "is this URL nothing but a merge tag?" stays one regex instead of a
 * per-format problem.
 */

export interface OutputOpts {
  /** preview only: render tags as these values instead of formatting them */
  sampleData?: Record<string, string> | null;
}

export interface UtmStats {
  added: number;
  skipped: number;
}

export interface OutputResult {
  design: Design;
  utm: UtmStats;
}

/** Text fields on each block that may carry a merge tag. */
const TEXT_FIELDS = [
  'text',
  'html',
  'label',
  'heading',
  'subtext',
  'eyebrow',
  'title',
  'excerpt',
  'caption',
  'alt',
  'imageAlt',
  'readMoreLabel',
  'linkLabel',
  'fallbackText',
  'address',
  'legalText',
  'unsubscribeText',
] as const;

/** Discrete link fields, paired with the flag that opts them out. */
const LINK_FIELDS: { url: string; flag: string }[] = [
  { url: 'href', flag: 'noTrack' },
  { url: 'url', flag: 'noTrack' },
  { url: 'ctaHref', flag: 'ctaNoTrack' },
  { url: 'linkHref', flag: 'noTrack' },
  { url: 'readMoreHref', flag: 'noTrack' },
  // unsubscribeHref is deliberately absent: it is never tagged
];

/** Nested arrays that hold their own links and text. */
const ITEM_ARRAYS = ['items', 'navLinks', 'cards', 'socialItems'];

export function resolveForOutput(
  design: Design,
  brand: Brand,
  mode: ResolveMode,
  opts: OutputOpts = {},
): OutputResult {
  // 1. brand tokens — unchanged 1A behaviour
  const branded = resolveDesign(design, brand, mode);

  const body = branded.body;
  const utm = body.utm;
  // UTM is an export-time concern; the canvas and thumbnails stay clean
  const taggingOn = mode === 'export' && utm.enabled;
  const stats: UtmStats = { added: 0, skipped: 0 };

  const tagUrl = (url: string, optedOut: boolean): string => {
    if (!url) return url;
    if (optedOut || !wouldTag(url, utm)) {
      if (url.trim()) stats.skipped += 1;
      return url;
    }
    stats.added += 1;
    return addUtm(url, utm);
  };

  const sample = opts.sampleData;
  const text = (value: string): string =>
    sample ? applySampleData(value, sample) : formatMergeTags(value, body);

  const next = produce(branded, (draft) => {
    const visit = (holder: Record<string, unknown>) => {
      // links first, while tags are still canonical
      if (taggingOn) {
        for (const { url, flag } of LINK_FIELDS) {
          if (typeof holder[url] === 'string') {
            holder[url] = tagUrl(holder[url] as string, holder[flag] === true);
          }
        }
        for (const key of ['html'] as const) {
          if (typeof holder[key] === 'string') {
            const html = holder[key] as string;
            const counted = countHtmlLinks(html, utm);
            stats.added += counted.added;
            stats.skipped += counted.skipped;
            holder[key] = rewriteHtmlLinks(html, (u) => addUtm(u, utm));
          }
        }
      } else if (typeof holder.html === 'string') {
        // still strip the editor-only attribute so it never ships
        holder.html = rewriteHtmlLinks(holder.html as string, (u) => u);
      }

      // the unsubscribe link is never tagged, but it is still a link the
      // summary should account for, so count it rather than ignoring it
      if (taggingOn && typeof holder.unsubscribeHref === 'string' && holder.unsubscribeHref.trim()) {
        stats.skipped += 1;
      }

      // then merge tags, in text and in any URL that embeds one
      for (const key of TEXT_FIELDS) {
        if (typeof holder[key] === 'string') holder[key] = text(holder[key] as string);
      }
      for (const { url } of LINK_FIELDS) {
        if (typeof holder[url] === 'string') holder[url] = text(holder[url] as string);
      }
      if (typeof holder.unsubscribeHref === 'string') {
        holder.unsubscribeHref = text(holder.unsubscribeHref);
      }

      for (const arrayKey of ITEM_ARRAYS) {
        const arr = holder[arrayKey];
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item && typeof item === 'object') visit(item as Record<string, unknown>);
          }
        }
      }
    };

    // the subject line and preheader carry tags too
    draft.body.title = text(draft.body.title);
    draft.body.preheader = text(draft.body.preheader);

    for (const row of draft.rows) {
      for (const col of row.columns) {
        for (const block of col.blocks as Block[]) {
          visit(block.values as unknown as Record<string, unknown>);
        }
      }
    }
  });

  return { design: next, utm: stats };
}

/** Convenience for the many call sites that only want the design. */
export function resolvedDesign(
  design: Design,
  brand: Brand,
  mode: ResolveMode,
  opts: OutputOpts = {},
): Design {
  return resolveForOutput(design, brand, mode, opts).design;
}
