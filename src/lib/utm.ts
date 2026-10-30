import type { UtmSettings } from '../types';
import { hasLinkTag, isMergeTagOnly } from './merge';

/**
 * UTM link tagger. Applied at the export boundary only, so the stored design
 * keeps clean URLs and turning tracking on or off never edits content.
 */

const UTM_KEYS: (keyof UtmSettings)[] = ['source', 'medium', 'campaign', 'content', 'term'];

/** Which links the tagger refuses to touch, and why. */
export function shouldSkip(url: string): boolean {
  const trimmed = (url || '').trim();
  if (!trimmed) return true;
  if (isMergeTagOnly(trimmed)) return true; // nothing but a tag
  if (hasLinkTag(trimmed)) return true; // unsubscribe / view-in-browser
  if (!/^https?:\/\//i.test(trimmed)) return true; // mailto:, tel:, #anchor, relative
  return false;
}

/**
 * Append the configured utm_* parameters to a URL.
 *
 * Parsed by hand rather than with `new URL()`, which throws on relative input.
 * Existing query strings and #hash are preserved, and a utm_* parameter the
 * link already carries is never overwritten.
 */
export function addUtm(url: string, utm: UtmSettings): string {
  if (!utm.enabled || shouldSkip(url)) return url;

  const raw = url.trim();
  const hashAt = raw.indexOf('#');
  const hash = hashAt === -1 ? '' : raw.slice(hashAt);
  const withoutHash = hashAt === -1 ? raw : raw.slice(0, hashAt);

  const queryAt = withoutHash.indexOf('?');
  const base = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const query = queryAt === -1 ? '' : withoutHash.slice(queryAt + 1);

  const parts = query ? query.split('&').filter(Boolean) : [];
  const present = new Set(parts.map((p) => p.split('=')[0].toLowerCase()));

  let added = 0;
  for (const key of UTM_KEYS) {
    const value = (utm[key] as string) || '';
    if (!value) continue; // content and term are optional
    const name = `utm_${key}`;
    if (present.has(name)) continue; // the link already says this — leave it
    parts.push(`${name}=${encodeURIComponent(value)}`);
    added += 1;
  }
  if (added === 0) return url;

  return `${base}?${parts.join('&')}${hash}`;
}

/** Did `addUtm` actually change this URL? Used for the export summary. */
export function wouldTag(url: string, utm: UtmSettings): boolean {
  return utm.enabled && addUtm(url, utm) !== url;
}

/**
 * Rewrite every `href` in a block of HTML.
 *
 * A regex rather than DOMParser, because `render.ts` already has to guard
 * `typeof DOMParser === 'undefined'` — the parser is not dependable in every
 * environment this runs in. Anchors carrying `data-no-track` are skipped, and
 * the attribute is removed so it never reaches the exported email.
 */
export function rewriteHtmlLinks(html: string, fn: (url: string) => string): string {
  if (!html) return html;

  return html.replace(/<a\b[^>]*>/gi, (tag) => {
    const optedOut = /\sdata-no-track\s*=\s*["']?[^"'\s>]*["']?/i.test(tag);
    const cleaned = tag.replace(/\sdata-no-track\s*=\s*["']?[^"'\s>]*["']?/gi, '');
    if (optedOut) return cleaned;
    return cleaned.replace(/(\shref\s*=\s*")([^"]*)(")/i, (_m, pre, url: string, post) =>
      `${pre}${fn(url)}${post}`,
    );
  });
}

/** Count the links in a block of HTML that the tagger would change. */
export function countHtmlLinks(html: string, utm: UtmSettings): { added: number; skipped: number } {
  let added = 0;
  let skipped = 0;
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const optedOut = /\sdata-no-track\s*=/i.test(tag);
    const href = tag.match(/\shref\s*=\s*"([^"]*)"/i)?.[1] ?? '';
    if (!href) continue;
    if (optedOut || !wouldTag(href, utm)) skipped += 1;
    else added += 1;
  }
  return { added, skipped };
}
