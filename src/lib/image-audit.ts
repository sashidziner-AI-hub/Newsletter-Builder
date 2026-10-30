import type { Block, Design } from '../types';

/**
 * Where the images are.
 *
 * Walking the **design** rather than the rendered HTML gives every image a
 * block to jump to, and covers the hero background, which renders as
 * `<td background="…">` rather than an `<img>` and so cannot be found in the
 * output at all. The rules that judge what this finds live in
 * `src/lib/checks.ts`; this file only reports what is there.
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
