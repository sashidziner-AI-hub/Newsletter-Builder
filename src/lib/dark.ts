/**
 * Dark mode (3B).
 *
 * The shape of the feature: light mode is unchanged, always. Dark mode is one
 * extra `<style>` block plus class names, and both are emitted only when
 * `body.darkMode` is on. With it off the exported HTML is byte-identical to a
 * pre-3B export.
 *
 * How a dark colour is decided is settled at the boundary, not in the renderer.
 * `darkBrand()` swaps the brand's colour tokens for the dark palette, and the
 * design is resolved a second time against it. That means:
 *
 *   - a colour that came from a `brand.*` token follows the dark palette
 *   - a hex somebody typed by hand comes out identical in both passes, so the
 *     renderer can see it has not moved and leaves it alone
 *
 * which is exactly the rule the feature asks for, with no provenance tracking.
 */

import type { Brand, BrandColors, BrandDarkColors, Design } from '../types';
import { contrastRatio, round2, suggestFix } from './contrast';

/** The shared class names. Per-colour classes are minted as `dm-<kind><hex>`. */
export const DM_PAGE = 'dm-page';
export const DM_CONTENT = 'dm-content';
export const DM_TEXT = 'dm-text';
export const DM_LINK = 'dm-link';
export const DM_BORDER = 'dm-border';
export const DM_BTN = 'dm-btn';
export const DM_LOGO_LIGHT = 'dm-logo-light';
export const DM_LOGO_DARK = 'dm-logo-dark';

/** The attribute the preview iframe carries, so it can force the dark rules. */
export const DM_PREVIEW_ATTR = 'data-eb-dark';

/** Defaults for a brand that has not filled in a dark palette. */
const DEFAULT_PAGE_BG = '#121212';
const DEFAULT_CONTENT_BG = '#1E1E1E';
const DEFAULT_TEXT = '#E5E7EB';
const DEFAULT_MUTED = '#9CA3AF';
const DEFAULT_BORDER = '#374151';

/**
 * A safe dark palette from the light one.
 *
 * The surfaces are fixed (a near-black page, a slightly lifted content panel —
 * pure #000 makes text ring). The link keeps the brand's hue but is lightened
 * until it clears 4.5:1 against the content background, and the button keeps
 * the brand's primary with whichever of black or white reads on it.
 */
export function deriveDarkColors(light: BrandColors): BrandDarkColors {
  const content = DEFAULT_CONTENT_BG;
  const link = suggestFix(light.link || '#2563EB', content, 16, false) ?? DEFAULT_TEXT;
  const buttonBg = light.primary || '#2563EB';
  const onWhite = contrastRatio('#FFFFFF', buttonBg) ?? 0;
  const onBlack = contrastRatio('#111111', buttonBg) ?? 0;

  return {
    page_bg: DEFAULT_PAGE_BG,
    content_bg: content,
    text: DEFAULT_TEXT,
    muted: DEFAULT_MUTED,
    link,
    border: DEFAULT_BORDER,
    button_bg: buttonBg,
    button_text: onWhite >= onBlack ? '#FFFFFF' : '#111111',
  };
}

/** The brand's dark palette, derived when it has none of its own. */
export function darkColors(brand: Brand): BrandDarkColors {
  const derived = deriveDarkColors(brand.tokens.colors);
  if (!brand.darkTokens) return derived;
  // a half-filled palette falls back key by key, so one blank field cannot
  // produce an invisible email
  const own = brand.darkTokens;
  return {
    page_bg: own.page_bg || derived.page_bg,
    content_bg: own.content_bg || derived.content_bg,
    text: own.text || derived.text,
    muted: own.muted || derived.muted,
    link: own.link || derived.link,
    border: own.border || derived.border,
    button_bg: own.button_bg || derived.button_bg,
    button_text: own.button_text || derived.button_text,
  };
}

/**
 * The brand as it behaves in dark mode: the same record with its colour tokens
 * swapped for the dark palette, so `resolveDesign()` produces the dark design.
 *
 * The three identity tokens have no dark counterpart of their own, so they are
 * mapped by the role the presets and block defaults mostly use them for:
 * `secondary` is the strong-text colour (near-black in most kits, so it *must*
 * move or headings vanish), `accent` is a secondary text colour, and `primary`
 * is the call-to-action fill.
 *
 * "Mostly" is doing real work in that sentence — the same token is used the
 * other way round in places, and `prepareDarkDesign()` below corrects both
 * directions afterwards, where the surrounding colours are known.
 */
export function darkBrand(brand: Brand): Brand {
  const d = darkColors(brand);
  return {
    ...brand,
    tokens: {
      ...brand.tokens,
      colors: {
        primary: d.button_bg,
        secondary: d.text,
        accent: d.muted,
        text: d.text,
        muted: d.muted,
        link: d.link,
        page_bg: d.page_bg,
        content_bg: d.content_bg,
        border: d.border,
      },
    },
  };
}

/* ------------------------------------------------------------ class minting */

export type DmKind = 'bg' | 'text' | 'link' | 'border' | 'btn' | 'btntext';

const PREFIX: Record<DmKind, string> = {
  bg: 'dm-g',
  text: 'dm-t',
  link: 'dm-l',
  border: 'dm-k',
  btn: 'dm-u',
  btntext: 'dm-v',
};

const PROPERTY: Record<DmKind, string> = {
  bg: 'background-color',
  text: 'color',
  link: 'color',
  border: 'border-color',
  btn: 'background-color',
  btntext: 'color',
};

/** `#1E1E1E` -> `1e1e1e`, so the class name is deterministic and legal. */
function slug(hex: string): string {
  return hex.trim().replace(/^#/, '').toLowerCase().replace(/[^0-9a-z]/g, '');
}

/**
 * What the renderer carries while emitting dark-aware HTML: the dark design to
 * read counterpart colours from, the palette for the shared classes, and the
 * set of per-colour classes actually used, which becomes the stylesheet.
 */
export interface DarkCtx {
  palette: BrandDarkColors;
  /** the dark design's own body settings, for the page and content surfaces */
  body: Design['body'];
  /** every block of the dark design, by id */
  blocks: Map<string, { values: Record<string, unknown> }>;
  /** every row of the dark design, by id */
  rows: Map<string, Record<string, unknown>>;
  /** minted classes -> their rule body */
  used: Map<string, string>;
  /** true once a logo swap has been emitted, so the rules are worth writing */
  logoSwap: boolean;
  /** the preview forces the rules through an attribute instead of the media query */
  preview: boolean;
}

export function darkCtx(dark: Design, palette: BrandDarkColors, preview: boolean): DarkCtx {
  const blocks = new Map<string, { values: Record<string, unknown> }>();
  const rows = new Map<string, Record<string, unknown>>();
  for (const row of dark.rows) {
    rows.set(row.id, row as unknown as Record<string, unknown>);
    for (const col of row.columns) {
      for (const block of col.blocks) {
        blocks.set(block.id, block as unknown as { values: Record<string, unknown> });
      }
    }
  }
  return { palette, body: dark.body, blocks, rows, used: new Map(), logoSwap: false, preview };
}

/**
 * The class that repaints one value in dark mode, or `''` when it must not
 * change. An empty string is the answer in three cases, and all three matter:
 * dark mode is off, the colour is a hand-typed hex that both passes agree on,
 * or there is no colour here at all.
 */
export function dmClass(
  ctx: DarkCtx | undefined,
  kind: DmKind,
  lightValue: string,
  darkValue: string | undefined,
): string {
  if (!ctx || !darkValue || !lightValue) return '';
  if (lightValue.trim().toLowerCase() === darkValue.trim().toLowerCase()) return '';

  const shared =
    kind === 'bg' && darkValue === ctx.palette.page_bg
      ? DM_PAGE
      : kind === 'bg' && darkValue === ctx.palette.content_bg
        ? DM_CONTENT
        : kind === 'text' && darkValue === ctx.palette.text
          ? DM_TEXT
          : kind === 'link' && darkValue === ctx.palette.link
            ? DM_LINK
            : kind === 'border' && darkValue === ctx.palette.border
              ? DM_BORDER
              : kind === 'btn' && darkValue === ctx.palette.button_bg
                ? DM_BTN
                : '';

  const name = shared || `${PREFIX[kind]}${slug(darkValue)}`;
  if (!name.endsWith('-') && slug(darkValue)) {
    ctx.used.set(name, `${PROPERTY[kind]}:${darkValue} !important;`);
  }
  return name;
}

/** ` class="…"`, or nothing, for splicing into a tag. */
export function dmAttr(name: string): string {
  return name ? ` class="${name}"` : '';
}

/** Append to an existing class attribute value. */
export function dmJoin(existing: string, name: string): string {
  return [existing, name].filter(Boolean).join(' ');
}

/* ------------------------------------------------------------- the stylesheet */

/** Hidden in light mode, revealed by the dark rules. */
export const LOGO_DARK_HIDDEN =
  'display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;';

/**
 * The `<style>` body. Every rule is written three times over: once in the
 * media query that Apple Mail and Outlook for Mac/iOS honour, once behind
 * Outlook.com's `[data-ogsc]` / `[data-ogsb]` attributes, which it rewrites
 * selectors into rather than supporting the media query, and — in the preview
 * only — once behind a plain attribute, so a light-scheme iframe can be made
 * to show the dark result without a second renderer.
 */
export function darkCss(ctx: DarkCtx, rendered: string): string {
  // A class is minted while a colour is being considered, which happens a
  // little before the element is known to render at all — an empty hero
  // eyebrow computes its colour and then emits nothing. Keeping only the
  // classes that reached the document stops dead rules shipping.
  const present = new Set<string>();
  for (const attr of rendered.match(/class="[^"]*"/g) ?? []) {
    for (const name of attr.slice(7, -1).split(/\s+/)) {
      if (name.startsWith('dm-')) present.add(name);
    }
  }

  const rules: string[] = [];
  for (const [name, body] of ctx.used) {
    if (present.has(name)) rules.push(`.${name}{${body}}`);
  }

  if (ctx.logoSwap) {
    rules.push(`.${DM_LOGO_LIGHT}{display:none !important;max-height:0 !important;max-width:0 !important;overflow:hidden !important;}`);
    rules.push(`.${DM_LOGO_DARK}{display:block !important;max-height:none !important;max-width:none !important;overflow:visible !important;}`);
  }
  if (rules.length === 0) return '';

  const body = rules.join('\n    ');
  const ogs = rules
    .map((r) => `[data-ogsc] ${r}`)
    .concat(rules.map((r) => `[data-ogsb] ${r}`))
    .join('\n  ');

  const previewBlock = ctx.preview
    ? `\n  ${rules.map((r) => `[${DM_PREVIEW_ATTR}] ${r}`).join('\n  ')}`
    : '';

  return `
  @media (prefers-color-scheme: dark){
    ${body}
  }
  ${ogs}${previewBlock}`;
}

/** The two meta tags that tell a client this email handles both schemes. */
export const DARK_META =
  '<meta name="color-scheme" content="light dark" />\n<meta name="supported-color-schemes" content="light dark" />';

/* ------------------------------------------------------------------ checking */

/** Does this palette give readable body text and links on its own content panel? */
export function paletteReadable(d: BrandDarkColors): { text: number; link: number; ok: boolean } {
  const text = round2(contrastRatio(d.text, d.content_bg) ?? 0);
  const link = round2(contrastRatio(d.link, d.content_bg) ?? 0);
  return { text, link, ok: text >= 4.5 && link >= 4.5 };
}

/* ----------------------------------------------------- preparing the pass */

/**
 * Foreground fields, for the surface-used-as-a-foreground correction below.
 * A button label and a hero heading over a coloured panel are the cases that
 * matter; both are written as `brand.content_bg` in the presets.
 */
const FOREGROUND_FIELDS: Record<string, string[]> = {
  button: ['color'],
  heading: ['color'],
  text: ['color'],
  menu: ['color'],
  header: ['navColor', 'fallbackColor'],
  hero: ['eyebrowColor', 'headingColor', 'subtextColor', 'ctaTextColor', 'cardTitleColor', 'cardTextColor', 'cardLinkColor'],
  articles: ['titleColor', 'excerptColor', 'linkColor'],
  footer: ['textColor', 'linkColor'],
};

/** Block fields that a manual "Dark mode text colour" should drive. */
const TEXT_FIELDS: Record<string, string[]> = {
  heading: ['color'],
  text: ['color'],
  menu: ['color'],
  button: ['color'],
  video: ['captionColor'],
  header: ['navColor', 'fallbackColor'],
  hero: ['eyebrowColor', 'headingColor', 'subtextColor', 'cardTitleColor', 'cardTextColor'],
  articles: ['titleColor', 'excerptColor'],
  footer: ['textColor'],
};

/** Block fields that a manual "Dark mode background" should drive. */
const BG_FIELDS: Record<string, string[]> = {
  button: ['bgColor'],
  header: ['bgColor'],
  hero: ['bgColor'],
  footer: ['bgColor'],
  articles: ['bgColor'],
};

/**
 * Finish the dark pass.
 *
 * Two things the second resolve cannot do on its own: honour a manual dark
 * override typed on a row or a block, which beats whatever the palette said,
 * and carry the brand's dark logo, which has no token of its own.
 *
 * This mutates a design that exists only to be compared against the light one,
 * so the extra `logoDarkSrc` key never reaches a stored document or an export.
 */
export function prepareDarkDesign(dark: Design, light: Design, brand: Brand): Design {
  const logoDark = (brand.logo_dark_url || '').trim();
  const palette = darkColors(brand);
  const lightBlocks = new Map<string, Record<string, unknown>>();
  for (const row of light.rows) {
    for (const col of row.columns) {
      for (const block of col.blocks) {
        lightBlocks.set(block.id, block.values as unknown as Record<string, unknown>);
      }
    }
  }

  /*
   * A brand kit names colours by identity, not by role, and the presets use
   * several of them both ways round. Swapping the palette wholesale therefore
   * gets two cases backwards, and both are badly wrong rather than slightly
   * off, so they are corrected here:
   *
   *   - an INK colour used as a background (`brand.secondary` as a dark hero
   *     panel) would flip to the light text colour, turning a dark panel white
   *   - a SURFACE colour used as a foreground (`brand.content_bg` meaning
   *     "white text on the brand colour") would follow the surface down and
   *     turn the label near-black on a dark fill
   *
   * An ink colour used as a panel is already dark, so it simply stays. A
   * surface colour used as a label becomes whatever actually reads on the
   * background that label sits on — which is the button's own fill for a
   * button, and the block's panel otherwise.
   */
  const inks = new Set(
    [brand.tokens.colors.secondary, brand.tokens.colors.text, brand.tokens.colors.accent]
      .filter(Boolean)
      .map((c) => c.toLowerCase()),
  );
  const surfaces = new Set(
    [brand.tokens.colors.content_bg, brand.tokens.colors.page_bg]
      .filter(Boolean)
      .map((c) => c.toLowerCase()),
  );

  /** The lightest or darkest thing that reads on `surface`. */
  const readableOn = (surface: string): string => {
    if ((contrastRatio(palette.text, surface) ?? 0) >= 4.5) return palette.text;
    const onLight = contrastRatio('#111111', surface) ?? 0;
    const onDark = contrastRatio('#FFFFFF', surface) ?? 0;
    return onDark >= onLight ? '#FFFFFF' : '#111111';
  };

  for (const row of dark.rows) {
    const over = row.dark;
    if (over?.bgColor) row.contentBgColor = over.bgColor;

    for (const col of row.columns) {
      for (const block of col.blocks) {
        const values = block.values as unknown as Record<string, unknown>;
        const lightValues = lightBlocks.get(block.id);

        // backgrounds first: a label's correction depends on what it sits on
        for (const field of BG_FIELDS[block.type] ?? []) {
          const was = lightValues?.[field];
          if (typeof was === 'string' && inks.has(was.toLowerCase())) values[field] = was;
        }
        if (block.type === 'hero') {
          const wasCta = lightValues?.ctaColor;
          if (typeof wasCta === 'string' && inks.has(wasCta.toLowerCase())) values.ctaColor = wasCta;
        }

        const panel =
          (values.bgColor as string) ||
          row.contentBgColor ||
          dark.body.contentBgColor ||
          row.bgColor ||
          dark.body.bgColor ||
          palette.content_bg;

        for (const field of FOREGROUND_FIELDS[block.type] ?? []) {
          const was = lightValues?.[field];
          if (typeof was !== 'string' || !surfaces.has(was.toLowerCase())) continue;
          const on =
            block.type === 'button'
              ? (values.bgColor as string) || panel
              : field === 'ctaTextColor'
                ? (values.ctaColor as string) || panel
                : panel;
          values[field] = readableOn(on);
        }

        if (logoDark && (block.type === 'header' || block.type === 'footer')) {
          values.logoDarkSrc = logoDark;
        }
        const own = block.values.dark;
        if (!own) continue;
        if (own.textColor) {
          for (const field of TEXT_FIELDS[block.type] ?? []) {
            if (typeof values[field] === 'string') values[field] = own.textColor;
          }
        }
        if (own.bgColor) {
          for (const field of BG_FIELDS[block.type] ?? []) {
            if (typeof values[field] === 'string') values[field] = own.bgColor;
          }
        }
      }
    }
  }
  return dark;
}
