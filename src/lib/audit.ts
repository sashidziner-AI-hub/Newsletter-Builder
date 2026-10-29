/**
 * Pre-send checks on exported HTML. Advisory only — nothing here blocks an
 * export, it just tells the sender what will break in a real inbox.
 */
export interface ImageAudit {
  /** uploads embedded as data URIs — stripped by Gmail and most clients */
  embedded: number;
  /** http:// or protocol-relative sources — blocked or warned about */
  insecure: string[];
  /** placeholder art left over from a preset or a fresh block */
  placeholders: number;
  /** true when the export is safe to send as far as images go */
  ok: boolean;
}

const SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*"([^"]*)"/gi;

/**
 * Hosts used for placeholder art by presets and new blocks. An email going out
 * with one of these still in it has not been finished.
 */
export const PLACEHOLDER_PATTERN = /(^|\/\/|\.)((picsum\.photos)|(placehold(er)?\.(co|it|com))|(dummyimage\.com)|(via\.placeholder\.com))\//i;

export function isPlaceholderImage(src: string): boolean {
  return PLACEHOLDER_PATTERN.test((src || '').trim());
}

export function auditImageSources(html: string): ImageAudit {
  let embedded = 0;
  let placeholders = 0;
  const insecure: string[] = [];

  for (const match of html.matchAll(SRC_RE)) {
    const src = (match[1] || '').trim();
    if (!src) continue;
    if (/^data:/i.test(src)) {
      embedded += 1;
    } else if (!/^https:\/\//i.test(src) && !/^\{\{/.test(src)) {
      // merge tags are resolved by the ESP, so they are not flagged
      if (!insecure.includes(src)) insecure.push(src);
    }
    if (isPlaceholderImage(src)) placeholders += 1;
  }

  return {
    embedded,
    insecure,
    placeholders,
    ok: embedded === 0 && insecure.length === 0 && placeholders === 0,
  };
}
