import type { Block, Design } from '../types';
import { isPlaceholderImage } from './audit';

/**
 * Image checks over the **design**, not the rendered HTML.
 *
 * 1A's `auditImageSources()` regexes `<img src>` out of the output, which is
 * fine for a count but cannot say which block an image belongs to — and it
 * misses the hero background entirely, because that renders as
 * `<td background="…">` rather than an `<img>`. Walking the design instead
 * gives every finding a block to jump to, and covers all twelve image fields.
 */

export interface ImageUse {
  /** '' when the image is not inside a block (none today, but keeps callers honest) */
  blockId: string;
  blockType: Block['type'];
  /** machine name of the field, for tests and debugging */
  field: string;
  /** what a person should read: "Hero image", "Card 2 image" */
  label: string;
  url: string;
  /** null when the field has no alt text of its own (backgrounds, logos, icons) */
  alt: string | null;
  /** rendered width in px, used for the retina note */
  displayWidth: number;
}

export type ImageProblemKind =
  | 'not-https'
  | 'missing-alt'
  | 'placeholder'
  | 'embedded'
  | 'broken';

export interface ImageProblem {
  kind: ImageProblemKind;
  use: ImageUse;
}

export const PROBLEM_LABEL: Record<ImageProblemKind, string> = {
  'not-https': 'Not served over https',
  'missing-alt': 'Missing alt text',
  placeholder: 'Still a placeholder image',
  embedded: 'Embedded data: image',
  broken: 'Could not be loaded',
};

export const PROBLEM_HELP: Record<ImageProblemKind, string> = {
  'not-https': 'Most inboxes block images that are not https. Host it over https.',
  'missing-alt': 'Inboxes block images by default, so alt text is what the reader sees.',
  placeholder: 'Stock art from a preset or a new block. Swap in the real image.',
  embedded: 'Gmail and most clients strip data: images. Host the file and paste its URL.',
  broken: 'The URL did not load. Check it is public and still there.',
};

/** Every image-bearing field in the design, with somewhere to jump to. */
export function collectImages(design: Design): ImageUse[] {
  const uses: ImageUse[] = [];
  const contentWidth = design.body.width || 600;

  const push = (
    block: Block,
    field: string,
    label: string,
    url: string,
    alt: string | null,
    displayWidth: number,
  ) => {
    if (!url || !url.trim()) return;
    uses.push({ blockId: block.id, blockType: block.type, field, label, url: url.trim(), alt, displayWidth });
  };

  for (const row of design.rows) {
    // a block in a 2-column row renders at roughly half the content width
    for (const col of row.columns) {
      const colWidth = Math.round(contentWidth / Math.max(1, row.columns.length));
      for (const block of col.blocks) {
        switch (block.type) {
          case 'image': {
            const v = block.values;
            push(block, 'src', 'Image', v.src, v.alt, Math.round((colWidth * v.width) / 100));
            break;
          }
          case 'video': {
            const v = block.values;
            push(block, 'thumbnail', 'Video thumbnail', v.thumbnail, v.alt, Math.round((colWidth * v.width) / 100));
            break;
          }
          case 'social': {
            const v = block.values;
            v.items.forEach((item, i) => {
              push(block, `items[${i}].iconUrl`, `Social icon ${i + 1}`, item.iconUrl, null, v.size);
            });
            break;
          }
          case 'header': {
            const v = block.values;
            push(block, 'logoSrc', 'Header logo', v.logoSrc, v.logoAlt || null, v.logoWidth);
            break;
          }
          case 'footer': {
            const v = block.values;
            push(block, 'logoSrc', 'Footer logo', v.logoSrc, v.logoAlt || null, v.logoWidth);
            break;
          }
          case 'hero': {
            const v = block.values;
            const half = Math.round(colWidth / 2);
            push(block, 'imageSrc', 'Hero image', v.imageSrc, v.imageAlt, v.layout === 'centered' ? colWidth : half);
            // the background renders as a td attribute, so it has no alt at all
            push(block, 'bgImage', 'Hero background image', v.bgImage, null, colWidth);
            const want = v.layout === 'cards-3' ? 3 : v.layout === 'cards-2' ? 2 : 0;
            v.cards.slice(0, want).forEach((card, i) => {
              push(
                block,
                `cards[${i}].imageSrc`,
                `Hero card ${i + 1} image`,
                card.imageSrc,
                card.imageAlt,
                Math.round(colWidth / Math.max(1, want)),
              );
            });
            break;
          }
          case 'articles': {
            const v = block.values;
            const wide = v.layout === 'thumb-top';
            v.items.slice(0, 10).forEach((item, i) => {
              if (v.layout === 'text-only') return;
              push(
                block,
                `items[${i}].imageSrc`,
                `Article ${i + 1} thumbnail`,
                item.imageSrc,
                item.imageAlt,
                wide ? colWidth : v.thumbWidth,
              );
            });
            break;
          }
          default:
            break;
        }
      }
    }
  }
  return uses;
}

/** A merge tag is resolved by the ESP, so it is not a broken URL. */
const isMergeTag = (url: string) => /^(\{\{|\*\||\[%)/.test(url.trim());

/**
 * Classify each use. `loadStatus` is only consulted for URLs that have actually
 * been probed — an unchecked image is never reported as broken.
 */
export function auditDesignImages(
  uses: ImageUse[],
  loadStatus?: Map<string, 'ok' | 'broken'>,
): ImageProblem[] {
  const problems: ImageProblem[] = [];
  for (const use of uses) {
    const url = use.url;
    if (isMergeTag(url)) continue;

    if (/^data:/i.test(url)) problems.push({ kind: 'embedded', use });
    else if (!/^https:\/\//i.test(url)) problems.push({ kind: 'not-https', use });
    else if (loadStatus?.get(url) === 'broken') problems.push({ kind: 'broken', use });

    if (isPlaceholderImage(url)) problems.push({ kind: 'placeholder', use });
    // alt is only required where the field actually has one
    if (use.alt !== null && !use.alt.trim()) problems.push({ kind: 'missing-alt', use });
  }
  return problems;
}

export function groupProblems(problems: ImageProblem[]): [ImageProblemKind, ImageProblem[]][] {
  const order: ImageProblemKind[] = ['broken', 'embedded', 'not-https', 'missing-alt', 'placeholder'];
  const groups = new Map<ImageProblemKind, ImageProblem[]>();
  for (const p of problems) {
    const bucket = groups.get(p.kind);
    if (bucket) bucket.push(p);
    else groups.set(p.kind, [p]);
  }
  return order.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!]);
}

/* ------------------------------------------------------- resolution notes */

export const VERY_LARGE_WIDTH = 1600;

export interface ResolutionNote {
  kind: 'low-res' | 'very-large';
  message: string;
}

/**
 * Non-blocking advice about an image's natural size. Low resolution is judged
 * against twice the displayed width, which is what a retina screen asks for.
 */
export function resolutionNote(
  naturalWidth: number,
  displayWidth: number,
): ResolutionNote | null {
  if (naturalWidth > VERY_LARGE_WIDTH) {
    return {
      kind: 'very-large',
      message: `Very large image (${naturalWidth}px wide). Resizing it will cut the email's weight.`,
    };
  }
  if (naturalWidth > 0 && displayWidth > 0 && naturalWidth < displayWidth * 2) {
    return {
      kind: 'low-res',
      message: `Low resolution — ${naturalWidth}px for a ${displayWidth}px slot. It will look soft on retina screens.`,
    };
  }
  return null;
}
