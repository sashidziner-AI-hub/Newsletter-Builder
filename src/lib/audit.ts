/**
 * Pre-send checks on exported HTML. Advisory only — nothing here blocks an
 * export, it just tells the sender what will break in a real inbox.
 */
export interface ImageAudit {
  /** uploads embedded as data URIs — stripped by Gmail and most clients */
  embedded: number;
  /** http:// or protocol-relative sources — blocked or warned about */
  insecure: string[];
  /** true when the export is safe to send as far as images go */
  ok: boolean;
}

const SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*"([^"]*)"/gi;

export function auditImageSources(html: string): ImageAudit {
  let embedded = 0;
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
  }

  return { embedded, insecure, ok: embedded === 0 && insecure.length === 0 };
}
