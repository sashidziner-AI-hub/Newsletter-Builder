import type { Block, Design, Row } from '../types';
import { SOCIAL_NETWORKS } from './defaults';

/**
 * Plain-text alternative, generated from an **already resolved** design (see
 * `resolveForOutput`), so URLs carry their UTM parameters and merge tags are
 * already in the chosen format.
 */

const WRAP = 72;
const RULE = '----------';

/** Decode the handful of entities the renderer and the editor produce. */
function decode(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#8199;|&zwnj;/gi, '');
}

/** True for a token that must not be broken across lines. */
const isUnbreakable = (word: string) => /^(https?:\/\/|mailto:|www\.)/i.test(word) || word.length > WRAP;

/**
 * Wrap to ~72 characters on word boundaries. A URL longer than the limit is
 * placed on its own line rather than split, since a broken URL is unclickable.
 */
export function wrapText(text: string, width = WRAP): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.length <= width) return line;
      const out: string[] = [];
      let current = '';
      for (const word of line.split(/\s+/).filter(Boolean)) {
        if (!current) {
          current = word;
          continue;
        }
        if (current.length + 1 + word.length <= width) {
          current += ` ${word}`;
        } else {
          out.push(current);
          current = word;
        }
        // a long URL gets its own line
        if (isUnbreakable(word) && current !== word) {
          out.push(current.slice(0, current.length - word.length - 1));
          current = word;
        }
      }
      if (current) out.push(current);
      return out.join('\n');
    })
    .join('\n');
}

/**
 * Turn a fragment of rich text into plain text: links become `text (url)`,
 * list items get a leading dash, paragraphs are separated by blank lines.
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  let out = html;

  // links first, so their text survives the tag strip
  out = out.replace(
    /<a\b[^>]*?\shref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, inner: string) => {
      const label = decode(inner.replace(/<[^>]+>/g, '')).trim();
      const url = href.trim();
      if (!url || url === '#') return label;
      return label && label !== url ? `${label} (${url})` : url;
    },
  );

  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<li\b[^>]*>/gi, '\n- ');
  out = out.replace(/<\/(p|div|h[1-6]|ul|ol|li|tr)>/gi, '\n\n');
  out = out.replace(/<[^>]+>/g, '');
  out = decode(out);

  return out
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** One block to text, or '' when it contributes nothing. */
function blockToText(block: Block): string {
  switch (block.type) {
    case 'heading': {
      const v = block.values;
      return v.text.trim();
    }
    case 'text':
      return htmlToText(block.values.html);
    case 'image': {
      // images are skipped; alt text stands in only when it is all the block has
      const v = block.values;
      return v.alt.trim() ? v.alt.trim() : '';
    }
    case 'button': {
      const v = block.values;
      const label = v.label.trim() || 'Open';
      const url = v.href.trim();
      return url && url !== '#' ? `${label}: ${url}` : label;
    }
    case 'divider':
      return RULE;
    case 'menu': {
      const items = block.values.items
        .filter((i) => i.label.trim())
        .map((i) => (i.href.trim() ? `- ${i.label.trim()} (${i.href.trim()})` : `- ${i.label.trim()}`));
      return items.join('\n');
    }
    case 'social': {
      const items = block.values.items
        .filter((i) => i.href.trim())
        .map((i) => `- ${SOCIAL_NETWORKS[i.network].label}: ${i.href.trim()}`);
      return items.join('\n');
    }
    case 'video': {
      const v = block.values;
      const label = v.caption.trim() || v.alt.trim() || 'Watch the video';
      return v.url.trim() ? `${label}: ${v.url.trim()}` : '';
    }
    case 'html':
      return htmlToText(block.values.html);

    case 'header': {
      const v = block.values;
      const parts: string[] = [];
      // the logo is an image, so the wordmark falls back to the brand name
      if (!v.logoSrc.trim() && v.fallbackText.trim()) parts.push(v.fallbackText.trim());
      if (v.showNav) {
        const nav = v.navLinks
          .filter((l) => l.label.trim())
          .map((l) => (l.href.trim() ? `${l.label.trim()} (${l.href.trim()})` : l.label.trim()));
        if (nav.length) parts.push(nav.join(' | '));
      }
      return parts.join('\n\n');
    }
    case 'hero': {
      const v = block.values;
      const parts: string[] = [];
      if (v.eyebrow.trim()) parts.push(v.eyebrow.trim());
      if (v.heading.trim()) parts.push(v.heading.trim());
      if (v.subtext.trim()) parts.push(v.subtext.trim());
      if (v.ctaLabel.trim() && v.ctaHref.trim()) parts.push(`${v.ctaLabel.trim()}: ${v.ctaHref.trim()}`);
      if (v.layout === 'cards-2' || v.layout === 'cards-3') {
        const want = v.layout === 'cards-3' ? 3 : 2;
        for (const card of v.cards.slice(0, want)) {
          const card_parts: string[] = [];
          if (card.title.trim()) card_parts.push(card.title.trim());
          if (card.text.trim()) card_parts.push(card.text.trim());
          if (card.linkLabel.trim() && card.linkHref.trim()) {
            card_parts.push(`${card.linkLabel.trim()}: ${card.linkHref.trim()}`);
          }
          if (card_parts.length) parts.push(card_parts.join('\n'));
        }
      }
      return parts.join('\n\n');
    }
    case 'articles': {
      const v = block.values;
      const items = v.items.slice(0, 10).map((item) => {
        const parts: string[] = [];
        if (item.title.trim()) parts.push(item.title.trim());
        if (item.excerpt.trim()) parts.push(item.excerpt.trim());
        const url = item.readMoreHref.trim();
        if (url) {
          const label = item.readMoreLabel.trim();
          parts.push(label ? `${label}: ${url}` : url);
        }
        return parts.join('\n');
      });
      return items.filter(Boolean).join(v.showDivider ? `\n\n${RULE}\n\n` : '\n\n');
    }
    case 'footer': {
      const v = block.values;
      const parts: string[] = [];
      if (v.showSocial) {
        const social = v.socialItems
          .filter((i) => i.href.trim())
          .map((i) => `${SOCIAL_NETWORKS[i.network].label}: ${i.href.trim()}`);
        if (social.length) parts.push(social.join('\n'));
      }
      if (v.address.trim()) parts.push(v.address.trim());
      if (v.legalText.trim()) parts.push(v.legalText.trim());
      if (v.unsubscribeText.trim()) {
        const url = v.unsubscribeHref.trim();
        parts.push(url ? `${v.unsubscribeText.trim()}: ${url}` : v.unsubscribeText.trim());
      }
      return parts.join('\n\n');
    }
  }
}

/**
 * The plain-text version of a resolved design.
 * `showFooter: false` leaves footer blocks out, exactly as the HTML export does.
 */
export function toPlainText(design: Design): string {
  const chunks: string[] = [];

  if (design.body.preheader.trim()) chunks.push(design.body.preheader.trim());

  const rowText = (row: Row): string[] =>
    row.columns.flatMap((col) =>
      col.blocks
        .filter((b) => b.type !== 'footer' || design.body.showFooter)
        .map(blockToText)
        .filter((t) => t.trim()),
    );

  for (const row of design.rows) chunks.push(...rowText(row));

  return (
    wrapText(
      chunks
        .join('\n\n')
        .split('\n')
        .map((l) => l.replace(/[ \t]+$/, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    ) + '\n'
  );
}
