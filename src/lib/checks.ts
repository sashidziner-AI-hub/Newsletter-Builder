import type { Block, Brand, Design, Row } from '../types';
import { isPlaceholderImage } from './audit';
import { contrastRatio, meetsAA, requiredRatio, round2, suggestFix } from './contrast';
import { collectImages, type ImageUse } from './image-audit';

/**
 * The email quality engine.
 *
 * Pure: it is handed the **resolved** design and the **real exported HTML**, so
 * every rule sees exactly what gets sent — brand tokens resolved, UTM applied,
 * merge tags in the chosen ESP format. It reads and reports; it never edits, and
 * nothing it returns blocks an export.
 *
 * This is the single source of truth. 2C-1's image rules live here now.
 */

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  /** stable across runs: the same problem keeps the same id */
  id: string;
  code: string;
  severity: Severity;
  message: string;
  hint: string;
  /** set when the problem belongs to a block the user can jump to */
  blockId?: string;
  /** set for email-level problems, naming the settings field to focus */
  field?: 'title' | 'preheader' | 'footer';
}

export interface CheckOptions {
  /** only consulted for URLs that have actually been probed */
  loadStatus?: Map<string, 'ok' | 'broken'>;
  /** natural widths, from the image library */
  imageWidths?: Map<string, number>;
}

const KB = 1024;
export const SIZE_WARN_KB = 90;
export const SIZE_ERROR_KB = 102;
export const MIN_BODY_PX = 12;
export const MIN_TAP_TARGET_PX = 44;
export const MAX_IMAGE_WIDTH = 1600;
export const SUBJECT_MAX = 60;
export const PREHEADER_MAX = 110;
/** below this many words, an email reads as image-only to a spam filter */
export const THIN_CONTENT_WORDS = 20;

const PLACEHOLDER_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'yourdomain.com',
  'yoursite.com',
  'yourcompany.com',
];

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** A merge tag in any of the four formats 2A can emit. */
const isMergeTag = (value: string) => /^(\{\{|\*\||\[%)/.test((value || '').trim());

const id = (code: string, blockId: string | undefined, discriminator: string) =>
  `${code}#${blockId ?? 'email'}#${discriminator}`;

/* ------------------------------------------------------ effective background */

/**
 * What a block's text actually sits on, following the renderer's own chain:
 * the block's own background, then the row's content background, then the
 * body's, then the full-width row colour, then the page.
 */
export function effectiveBackground(design: Design, row: Row, block: Block): string {
  const own = 'bgColor' in block.values ? (block.values as { bgColor?: string }).bgColor : '';
  // a button's bgColor is the button itself, not the surface behind its block
  const blockBg = block.type === 'button' ? '' : own;
  return (
    blockBg ||
    row.contentBgColor ||
    design.body.contentBgColor ||
    row.bgColor ||
    design.body.bgColor ||
    '#FFFFFF'
  );
}

/** Text that sits on a hero background image cannot be judged automatically. */
function hasBackgroundImage(block: Block): boolean {
  return block.type === 'hero' && block.values.layout === 'centered' && !!block.values.bgImage.trim();
}

/* ---------------------------------------------------------------- text runs */

interface TextRun {
  label: string;
  color: string;
  fontSize: number;
  bold: boolean;
  /** overrides the block background, for a button's own fill */
  onColor?: string;
  code: 'CONTRAST_TEXT' | 'CONTRAST_BUTTON';
}

/** Every coloured text run in a block, with the size it renders at. */
function textRuns(block: Block, body: Design['body']): TextRun[] {
  const t = (
    label: string,
    color: string,
    fontSize: number,
    bold = false,
    extra: Partial<TextRun> = {},
  ): TextRun => ({ label, color, fontSize, bold, code: 'CONTRAST_TEXT', ...extra });

  switch (block.type) {
    case 'heading': {
      const v = block.values;
      return [t('Heading', v.color, v.fontSize, v.fontWeight === 'bold')];
    }
    case 'text': {
      const v = block.values;
      return [t('Text', v.color || body.textColor, v.fontSize)];
    }
    case 'menu': {
      const v = block.values;
      return [t('Menu links', v.color, v.fontSize, v.fontWeight === 'bold')];
    }
    case 'button': {
      const v = block.values;
      return [
        t('Button label', v.color, v.fontSize, v.fontWeight === 'bold', {
          onColor: v.bgColor,
          code: 'CONTRAST_BUTTON',
        }),
      ];
    }
    case 'video': {
      const v = block.values;
      return v.showCaption ? [t('Video caption', v.captionColor, 14)] : [];
    }
    case 'header': {
      const v = block.values;
      const runs: TextRun[] = [];
      if (v.showNav) runs.push(t('Header nav links', v.navColor, v.navFontSize));
      if (!v.logoSrc.trim()) {
        runs.push(t('Header wordmark', v.fallbackColor, v.fallbackFontSize, true));
      }
      return runs;
    }
    case 'hero': {
      const v = block.values;
      const runs: TextRun[] = [];
      if (v.eyebrow.trim()) runs.push(t('Hero eyebrow', v.eyebrowColor, 12, true));
      if (v.heading.trim()) {
        runs.push(t('Hero heading', v.headingColor, v.headingFontSize, v.headingFontWeight === 'bold'));
      }
      if (v.subtext.trim()) runs.push(t('Hero subtext', v.subtextColor, v.subtextFontSize));
      if (v.layout === 'cards-2' || v.layout === 'cards-3') {
        runs.push(t('Hero card titles', v.cardTitleColor, 17, true));
        runs.push(t('Hero card text', v.cardTextColor, 14));
        runs.push(t('Hero card links', v.cardLinkColor, 14));
      }
      if (v.ctaLabel.trim() && v.ctaStyle === 'filled') {
        runs.push(
          t('Hero button label', v.ctaTextColor, 16, true, {
            onColor: v.ctaColor,
            code: 'CONTRAST_BUTTON',
          }),
        );
      }
      return runs;
    }
    case 'articles': {
      const v = block.values;
      return [
        t('Article titles', v.titleColor, v.titleFontSize, v.titleFontWeight === 'bold'),
        t('Article excerpts', v.excerptColor, v.excerptFontSize),
        t('Article links', v.linkColor, v.excerptFontSize),
      ];
    }
    case 'footer': {
      const v = block.values;
      return [
        t('Footer text', v.textColor, v.fontSize),
        t('Footer links', v.linkColor, v.fontSize),
      ];
    }
    default:
      return [];
  }
}

/* -------------------------------------------------------------------- links */

export interface LinkUse {
  blockId: string;
  label: string;
  url: string;
}

/** Every link in the design, with the block it belongs to. */
export function collectLinks(design: Design): LinkUse[] {
  const links: LinkUse[] = [];
  const push = (block: Block, label: string, url: string) =>
    links.push({ blockId: block.id, label, url: (url ?? '').trim() });

  for (const row of design.rows) {
    for (const col of row.columns) {
      for (const block of col.blocks) {
        switch (block.type) {
          case 'button':
            push(block, 'Button', block.values.href);
            break;
          case 'image':
            if (block.values.href.trim()) push(block, 'Image link', block.values.href);
            break;
          case 'video':
            if (block.values.url.trim()) push(block, 'Video link', block.values.url);
            break;
          case 'menu':
            block.values.items.forEach((i, n) => push(block, `Menu item ${n + 1}`, i.href));
            break;
          case 'social':
            block.values.items.forEach((i, n) =>
              push(block, `Social link ${n + 1}`, socialHref(i.network, i.href)),
            );
            break;
          case 'header':
            if (block.values.showNav) {
              block.values.navLinks.forEach((l, n) => push(block, `Nav link ${n + 1}`, l.href));
            }
            break;
          case 'hero': {
            const v = block.values;
            if (v.ctaLabel.trim()) push(block, 'Hero button', v.ctaHref);
            if (v.layout === 'cards-2' || v.layout === 'cards-3') {
              const want = v.layout === 'cards-3' ? 3 : 2;
              v.cards.slice(0, want).forEach((c, n) => {
                if (c.linkLabel.trim()) push(block, `Hero card ${n + 1} link`, c.linkHref);
              });
            }
            break;
          }
          case 'articles':
            block.values.items.slice(0, 10).forEach((i, n) => {
              if (i.readMoreLabel.trim()) push(block, `Article ${n + 1} link`, i.readMoreHref);
            });
            break;
          case 'footer': {
            const v = block.values;
            if (v.unsubscribeText.trim()) push(block, 'Unsubscribe link', v.unsubscribeHref);
            if (v.showSocial) {
              v.socialItems.forEach((i, n) =>
                push(block, `Footer social ${n + 1}`, socialHref(i.network, i.href)),
              );
            }
            break;
          }
          case 'text':
          case 'html':
            for (const match of block.values.html.matchAll(/\shref\s*=\s*"([^"]*)"/gi)) {
              push(block, 'Link in text', match[1]);
            }
            break;
          default:
            break;
        }
      }
    }
  }
  return links;
}

/** The Social renderer turns a bare address into mailto: before it ships. */
function socialHref(network: string, raw: string): string {
  const url = (raw || '').trim();
  if (network === 'email' && url && !/^mailto:/i.test(url) && /^[^\s@]+@[^\s@]+$/.test(url)) {
    return `mailto:${url}`;
  }
  return url;
}

type LinkVerdict = 'ok' | 'empty' | 'hash' | 'relative' | 'http' | 'placeholder';

export function classifyLink(url: string): LinkVerdict {
  const value = (url || '').trim();
  if (!value) return 'empty';
  if (isMergeTag(value)) return 'ok';
  if (value === '#' || /^#$/.test(value)) return 'hash';
  if (/^mailto:/i.test(value)) return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value) ? 'ok' : 'empty';
  if (/^tel:/i.test(value)) return /^tel:\+?[\d\s().-]{4,}$/i.test(value) ? 'ok' : 'empty';
  if (/^http:\/\//i.test(value)) return 'http';
  if (!/^https:\/\//i.test(value)) return 'relative';

  const host = value.replace(/^https:\/\//i, '').split('/')[0].toLowerCase();
  if (PLACEHOLDER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return 'placeholder';
  return 'ok';
}

/* ------------------------------------------------------------------- engine */

export function checkDesign(
  design: Design,
  html: string,
  _brand: Brand,
  opts: CheckOptions = {},
): Issue[] {
  const issues: Issue[] = [];
  const add = (issue: Issue) => issues.push(issue);
  const body = design.body;

  /* ---- SIZE, measured on the real exported string */
  const bytes = byteLength(html);
  const kb = bytes / KB;
  if (kb >= SIZE_ERROR_KB) {
    add({
      id: id('SIZE_OVER_LIMIT', undefined, 'html'),
      code: 'SIZE_OVER_LIMIT',
      severity: 'error',
      message: `This email is ${kb.toFixed(1)} KB. Gmail will clip it and hide the footer and unsubscribe link.`,
      hint: 'Shorten the content or swap embedded images for hosted URLs to get under 102 KB.',
    });
  } else if (kb >= SIZE_WARN_KB) {
    add({
      id: id('SIZE_NEAR_LIMIT', undefined, 'html'),
      code: 'SIZE_NEAR_LIMIT',
      severity: 'warning',
      message: `This email is ${kb.toFixed(1)} KB, close to Gmail's ~102 KB clipping limit.`,
      hint: 'Trim content now and you will not hit the limit as the email grows.',
    });
  }

  /* ---- SUBJECT and PREHEADER */
  if (!body.title.trim()) {
    add({
      id: id('SUBJECT_EMPTY', undefined, 'title'),
      code: 'SUBJECT_EMPTY',
      severity: 'error',
      message: 'The email has no subject line.',
      hint: 'Add one in Email settings — it is the first thing a reader sees.',
      field: 'title',
    });
  } else if (body.title.length > SUBJECT_MAX) {
    add({
      id: id('SUBJECT_LONG', undefined, 'title'),
      code: 'SUBJECT_LONG',
      severity: 'info',
      message: `The subject is ${body.title.length} characters; most inboxes cut it around ${SUBJECT_MAX}.`,
      hint: 'Put the point in the first few words so it survives truncation.',
      field: 'title',
    });
  }

  if (!body.preheader.trim()) {
    add({
      id: id('PREHEADER_EMPTY', undefined, 'preheader'),
      code: 'PREHEADER_EMPTY',
      severity: 'warning',
      message: 'The preheader is empty, so inboxes will show the first words of the email instead.',
      hint: 'Add a preheader in Email settings to control the preview text.',
      field: 'preheader',
    });
  } else if (body.preheader.length > PREHEADER_MAX) {
    add({
      id: id('PREHEADER_LONG', undefined, 'preheader'),
      code: 'PREHEADER_LONG',
      severity: 'info',
      message: `The preheader is ${body.preheader.length} characters; most inboxes show about ${PREHEADER_MAX}.`,
      hint: 'Front-load the useful part.',
      field: 'preheader',
    });
  }

  /* ---- UNSUBSCRIBE */
  if (!hasUnsubscribe(html)) {
    add({
      id: id('UNSUBSCRIBE_MISSING', undefined, 'html'),
      code: 'UNSUBSCRIBE_MISSING',
      severity: 'warning',
      message: 'This email has no unsubscribe link.',
      hint: 'Marketing emails need an unsubscribe link; add it here or confirm your sending tool inserts one.',
      field: 'footer',
    });
  }

  /* ---- CONTENT */
  const words = textWords(html);
  const imageUses = collectImages(design);
  if (words < THIN_CONTENT_WORDS && imageUses.length > 0) {
    add({
      id: id('CONTENT_THIN', undefined, 'html'),
      code: 'CONTENT_THIN',
      severity: 'warning',
      message: `This email is almost all image — only ${words} ${words === 1 ? 'word' : 'words'} of text.`,
      hint: 'Image-only emails are more likely to land in spam, and say nothing when images are blocked.',
    });
  }

  /* ---- per block: contrast and readability */
  for (const row of design.rows) {
    for (const col of row.columns) {
      for (const block of col.blocks) {
        const background = effectiveBackground(design, row, block);
        const overImage = hasBackgroundImage(block);

        if (overImage) {
          add({
            id: id('CONTRAST_UNKNOWN', block.id, 'bgImage'),
            code: 'CONTRAST_UNKNOWN',
            severity: 'info',
            message: 'This hero sits on a background image, so its contrast cannot be measured.',
            hint: 'Check contrast manually, and pick a background colour that works if the image is blocked.',
            blockId: block.id,
          });
        }

        for (const run of textRuns(block, body)) {
          const surface = run.onColor || background;
          if (!overImage || run.onColor) {
            const ratio = contrastRatio(run.color, surface);
            if (ratio !== null && !meetsAA(ratio, run.fontSize, run.bold)) {
              const fix = suggestFix(run.color, surface, run.fontSize, run.bold);
              add({
                id: id(run.code, block.id, run.label),
                code: run.code,
                severity: 'error',
                message: `${run.label} is ${round2(ratio)}:1 against its background — WCAG AA needs ${requiredRatio(run.fontSize, run.bold)}:1.`,
                hint: fix
                  ? `${run.color} on ${surface} is too close. Try ${fix}, or change the background.`
                  : 'Increase the difference between the text and background colours.',
                blockId: block.id,
              });
            }
          }

          if (run.fontSize < MIN_BODY_PX) {
            add({
              id: id('TEXT_TOO_SMALL', block.id, run.label),
              code: 'TEXT_TOO_SMALL',
              severity: 'warning',
              message: `${run.label} is ${run.fontSize}px, below the ${MIN_BODY_PX}px most people can read comfortably.`,
              hint: 'Small print is harder on phones than it looks on a desktop.',
              blockId: block.id,
            });
          }
        }

        /* ---- tap targets */
        if (block.type === 'button') {
          const v = block.values;
          const height = v.innerPaddingV * 2 + Math.round(v.fontSize * 1.2);
          if (height < MIN_TAP_TARGET_PX) {
            add({
              id: id('TAP_TARGET_SMALL', block.id, 'button'),
              code: 'TAP_TARGET_SMALL',
              severity: 'warning',
              message: `This button is about ${height}px tall, under the ${MIN_TAP_TARGET_PX}px a thumb needs.`,
              hint: 'Raise the vertical inner padding until it clears 44px.',
              blockId: block.id,
            });
          }
        }
      }
    }
  }

  /* ---- body link colour, which applies everywhere */
  const bodyLinkRatio = contrastRatio(body.linkColor, body.contentBgColor || body.bgColor || '#FFFFFF');
  if (bodyLinkRatio !== null && !meetsAA(bodyLinkRatio, 15, false)) {
    const surface = body.contentBgColor || body.bgColor || '#FFFFFF';
    const fix = suggestFix(body.linkColor, surface, 15, false);
    add({
      id: id('CONTRAST_LINK', undefined, 'bodyLink'),
      code: 'CONTRAST_LINK',
      severity: 'error',
      message: `The default link colour is ${round2(bodyLinkRatio)}:1 against the content background — AA needs 4.5:1.`,
      hint: fix ? `Try ${fix} in Email settings.` : 'Darken the link colour in Email settings.',
    });
  }

  /* ---- LINKS */
  for (const link of collectLinks(design)) {
    const verdict = classifyLink(link.url);
    if (verdict === 'ok') continue;
    const spec: Record<Exclude<LinkVerdict, 'ok'>, { code: string; severity: Severity; message: string; hint: string }> = {
      empty: {
        code: 'LINK_EMPTY',
        severity: 'error',
        message: `${link.label} has no destination.`,
        hint: 'Add a URL, or remove the link.',
      },
      hash: {
        code: 'LINK_HASH',
        severity: 'error',
        message: `${link.label} still points at "#".`,
        hint: 'Anchors do not work in email. Point it at a real https URL.',
      },
      relative: {
        code: 'LINK_RELATIVE',
        severity: 'error',
        message: `${link.label} is a relative URL ("${link.url}"), which has nothing to resolve against in an inbox.`,
        hint: 'Use the full https:// address.',
      },
      http: {
        code: 'LINK_HTTP',
        severity: 'warning',
        message: `${link.label} uses http://, which browsers and some clients warn about.`,
        hint: 'Switch it to https://.',
      },
      placeholder: {
        code: 'LINK_PLACEHOLDER_DOMAIN',
        severity: 'warning',
        message: `${link.label} still points at a placeholder domain (${link.url}).`,
        hint: 'Swap in the real destination before sending.',
      },
    };
    const s = spec[verdict];
    add({
      id: id(s.code, link.blockId, `${link.label}:${link.url}`),
      code: s.code,
      severity: s.severity,
      message: s.message,
      hint: s.hint,
      blockId: link.blockId,
    });
  }

  /* ---- IMAGES, absorbed from 2C-1 so there is one source of truth */
  for (const use of imageUses) {
    issues.push(...imageIssues(use, opts));
  }

  return issues.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id),
  );
}

function imageIssues(use: ImageUse, opts: CheckOptions): Issue[] {
  const out: Issue[] = [];
  const url = use.url;
  if (isMergeTag(url)) return out;

  const base = { blockId: use.blockId };
  if (/^data:/i.test(url)) {
    out.push({
      ...base,
      id: id('IMAGE_EMBEDDED', use.blockId, use.field),
      code: 'IMAGE_EMBEDDED',
      severity: 'error',
      message: `${use.label} is an embedded data: image.`,
      hint: 'Gmail and most clients strip these. Host the file and paste its https URL.',
    });
  } else if (!/^https:\/\//i.test(url)) {
    out.push({
      ...base,
      id: id('IMAGE_NOT_HTTPS', use.blockId, use.field),
      code: 'IMAGE_NOT_HTTPS',
      severity: 'error',
      message: `${use.label} is not served over https.`,
      hint: 'Most inboxes block non-https images. Host it over https.',
    });
  } else if (opts.loadStatus?.get(url) === 'broken') {
    out.push({
      ...base,
      id: id('IMAGE_BROKEN', use.blockId, use.field),
      code: 'IMAGE_BROKEN',
      severity: 'error',
      message: `${use.label} did not load.`,
      hint: 'Check the URL is public and still there.',
    });
  }

  if (isPlaceholderImage(url)) {
    out.push({
      ...base,
      id: id('IMAGE_PLACEHOLDER', use.blockId, use.field),
      code: 'IMAGE_PLACEHOLDER',
      severity: 'warning',
      message: `${use.label} is still placeholder art.`,
      hint: 'Stock art from a preset or a new block. Swap in the real image.',
    });
  }

  if (use.alt !== null && !use.alt.trim()) {
    out.push({
      ...base,
      id: id('IMAGE_MISSING_ALT', use.blockId, use.field),
      code: 'IMAGE_MISSING_ALT',
      severity: 'warning',
      message: `${use.label} has no alt text.`,
      hint: 'Inboxes block images by default, so alt text is what the reader sees.',
    });
  }

  const natural = opts.imageWidths?.get(url) ?? 0;
  if (natural > MAX_IMAGE_WIDTH) {
    out.push({
      ...base,
      id: id('IMAGE_TOO_WIDE', use.blockId, use.field),
      code: 'IMAGE_TOO_WIDE',
      severity: 'warning',
      message: `${use.label} is ${natural}px wide, more than the ${MAX_IMAGE_WIDTH}px any email needs.`,
      hint: 'Resizing it will cut the email weight and load faster on mobile data.',
    });
  }

  return out;
}

/* ------------------------------------------------------------------ helpers */

/** UTF-8 byte length, which is what an inbox actually counts. */
export function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

/**
 * How many visible words the email has.
 *
 * The hidden preheader div is stripped first — it is real text, but the reader
 * never sees it in the body, so counting it would hide a genuinely image-only
 * email from this check.
 */
export function textWords(html: string): number {
  const body = html.slice(html.indexOf('<body'));
  const visible = body
    // the preheader is the one deliberately hidden block the renderer emits
    .replace(/<div style="display:none[\s\S]*?<\/div>/gi, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
  return visible.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

export function hasUnsubscribe(html: string): boolean {
  if (/unsubscribe/i.test(html)) return true;
  // the tag may have been rewritten into any of the ESP formats
  return /\*\|UNSUB\|\*|\{\{\s*unsubscribe/i.test(html);
}

export interface IssueSummary {
  error: number;
  warning: number;
  info: number;
  total: number;
}

export function summarise(issues: Issue[]): IssueSummary {
  const summary: IssueSummary = { error: 0, warning: 0, info: 0, total: issues.length };
  for (const i of issues) summary[i.severity] += 1;
  return summary;
}

export function groupBySeverity(issues: Issue[]): [Severity, Issue[]][] {
  const order: Severity[] = ['error', 'warning', 'info'];
  return order
    .map((s) => [s, issues.filter((i) => i.severity === s)] as [Severity, Issue[]])
    .filter(([, list]) => list.length > 0);
}
