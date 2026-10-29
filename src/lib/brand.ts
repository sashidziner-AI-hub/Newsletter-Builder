import { produce } from 'immer';
import type { Brand, BrandSocialLink, Design, SocialNetwork } from '../types';
import { KANIT_STACK, SOCIAL_NETWORKS } from './defaults';
import { slugify, uid } from './util';

/** Resolving for the canvas may use uploaded previews; an export may not. */
export type ResolveMode = 'preview' | 'export';

export const TOKEN_PREFIX = 'brand.';

export function isBrandToken(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(TOKEN_PREFIX);
}

/* ----------------------------------------------------------------- the seed */

export const DEFAULT_BRAND_ID = 'brand_vee';

export function veeBrand(): Brand {
  const now = Date.now();
  return {
    id: DEFAULT_BRAND_ID,
    name: 'Vee Technologies',
    slug: 'vee-technologies',
    logo: '',
    logo_dark: '',
    // TODO: paste the hosted https logo URLs — exports use these, not uploads.
    logo_url: '',
    logo_dark_url: '',
    website_url: 'https://www.veetechnologies.com/',
    tokens: {
      colors: {
        primary: '#F58220',
        secondary: '#151515',
        accent: '#555555',
        text: '#151515',
        muted: '#6B7280', // TODO: confirm with brand guidelines
        link: '#F58220', // TODO: confirm — brand link colour, not the website URL
        page_bg: '#F3F4F6', // TODO: confirm with brand guidelines
        content_bg: '#FFFFFF',
        border: '#E5E7EB', // TODO: confirm with brand guidelines
      },
      fonts: { heading: KANIT_STACK, body: KANIT_STACK },
      button: { radius: 4, paddingV: 12, paddingH: 28, weight: 'bold', uppercase: false },
    },
    footer: {
      address: '', // TODO: registered office address
      legal_text: '', // TODO: copyright / legal line
      unsubscribe_text: 'Unsubscribe', // TODO: confirm wording
    },
    social_links: [],
    is_active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: null,
    updatedBy: null,
  };
}

/** Immutable fallback used when a token is missing from the active brand. */
const FALLBACK_BRAND = veeBrand();

export function emptyBrand(name = ''): Brand {
  const base = veeBrand();
  const now = Date.now();
  return {
    ...base,
    id: uid('brand'),
    name,
    slug: slugify(name || 'brand'),
    logo: '',
    logo_dark: '',
    logo_url: '',
    logo_dark_url: '',
    website_url: '',
    tokens: {
      colors: { ...base.tokens.colors },
      fonts: { ...base.tokens.fonts },
      button: { ...base.tokens.button },
    },
    footer: { address: '', legal_text: '', unsubscribe_text: 'Unsubscribe' },
    social_links: [],
    createdAt: now,
    updatedAt: now,
  };
}

/* ----------------------------------------------------------- token resolver */

/** Reads one token path off a brand. `undefined` = no such token. */
function tokenValue(path: string, brand: Brand, mode: ResolveMode): string | undefined {
  const c = brand.tokens.colors;
  const bare = path.startsWith('colors.') ? path.slice(7) : path;
  if (bare in c) return c[bare as keyof typeof c];

  switch (path) {
    case 'font.heading':
    case 'fonts.heading':
      return brand.tokens.fonts.heading;
    case 'font.body':
    case 'fonts.body':
      return brand.tokens.fonts.body;
    case 'logo':
      return mode === 'export' ? brand.logo_url : brand.logo || brand.logo_url;
    case 'logo_dark':
      return mode === 'export' ? brand.logo_dark_url : brand.logo_dark || brand.logo_dark_url;
    case 'website':
    case 'website_url':
      return brand.website_url;
    case 'name':
      return brand.name;
    case 'footer.address':
      return brand.footer.address;
    case 'footer.legal':
    case 'footer.legal_text':
      return brand.footer.legal_text;
    case 'footer.unsubscribe':
    case 'footer.unsubscribe_text':
      return brand.footer.unsubscribe_text;
    default:
      return undefined;
  }
}

/**
 * Resolve a single stored value.
 * - not a token (hex, font stack, URL, '')  -> returned unchanged
 * - token present on the brand              -> the brand's value
 * - token empty on the brand                -> the seed brand's value
 * - unknown token path                      -> '' (renderer treats as inherit)
 */
export function resolveToken(value: string, brand: Brand, mode: ResolveMode = 'export'): string {
  if (!isBrandToken(value)) return value;
  const path = value.slice(TOKEN_PREFIX.length);
  const own = tokenValue(path, brand, mode);
  if (own) return own;
  return tokenValue(path, FALLBACK_BRAND, mode) ?? '';
}

/** Human label for a token, for the property panel. */
export function tokenLabel(value: string): string {
  if (!isBrandToken(value)) return value;
  const path = value.slice(TOKEN_PREFIX.length).replace(/^colors\./, '');
  return path.replace(/^fonts?\./, '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Return a copy of the design with every `brand.*` token replaced by a literal
 * value. Structural sharing is preserved (immer), so blocks that contain no
 * tokens keep their identity and React memoisation still holds.
 *
 * This is the only piece of token logic the renderer needs: every consumer
 * (canvas, preview, HTML export, JSON export) renders a resolved design, so
 * `renderDesign()` itself never sees a token.
 */
export function resolveDesign(design: Design, brand: Brand, mode: ResolveMode = 'export'): Design {
  return produce(design, (draft) => {
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (isBrandToken(val)) obj[key] = resolveToken(val, brand, mode);
        else if (val && typeof val === 'object') walk(val);
      }
    };
    walk(draft.body);
    walk(draft.rows);

    // Social links are an array, so they cannot ride along as a string token.
    // A footer set to follow the brand gets its icon list filled here, which
    // keeps every piece of brand awareness on this side of the boundary and
    // out of the renderer.
    for (const row of draft.rows) {
      for (const col of row.columns) {
        for (const block of col.blocks) {
          if (block.type !== 'footer' || !block.values.useBrandSocial) continue;
          block.values.socialItems = brand.social_links.map((l) => ({
            id: l.id,
            network: l.network,
            href: l.url,
            iconUrl: '',
          }));
        }
      }
    }
  });
}

/* ------------------------------------------------------------ brand lookup */

/**
 * The brand a design is themed with. An unknown, archived or deleted brandId
 * falls back to the default brand silently so an old template still renders.
 */
export function resolveBrand(brands: Brand[], brandId: string | null | undefined): Brand {
  const active = brands.filter((b) => b.is_active);
  if (brandId) {
    const exact = active.find((b) => b.id === brandId);
    if (exact) return exact;
  }
  return active.find((b) => b.id === DEFAULT_BRAND_ID) ?? active[0] ?? FALLBACK_BRAND;
}

/* ------------------------------------------------------- access (stubs now) */

/** The app has no accounts yet. Kept as the single seam for later roles. */
export type AppUser = { id: string } | null;

/**
 * The only way the UI is allowed to read the brand list — switcher, brands
 * page and template list all go through here. Today it returns every active
 * brand; later it filters by role/membership without other code changing.
 */
export function getAccessibleBrands(_user: AppUser, brands: Brand[]): Brand[] {
  return brands.filter((b) => b.is_active);
}

/** Single permission seam for brand edits. Always true until roles exist. */
export function canEditBrand(_user: AppUser, _brand: Brand): boolean {
  return true;
}

/* -------------------------------------------------------- import / validate */

const COLOR_KEYS = [
  'primary',
  'secondary',
  'accent',
  'text',
  'muted',
  'link',
  'page_bg',
  'content_bg',
  'border',
] as const;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * Coerce arbitrary JSON (an imported file, or a record written by an older
 * version) into a Brand. Returns null only when the shape is not a brand at all.
 */
export function normalizeBrand(input: unknown): Brand | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;

  const base = emptyBrand(raw.name);
  const rawTokens = (raw.tokens ?? {}) as Record<string, unknown>;
  const rawColors = (rawTokens.colors ?? {}) as Record<string, unknown>;
  const rawFonts = (rawTokens.fonts ?? {}) as Record<string, unknown>;
  const rawButton = (rawTokens.button ?? {}) as Record<string, unknown>;
  const rawFooter = (raw.footer ?? {}) as Record<string, unknown>;

  const colors = { ...base.tokens.colors };
  for (const k of COLOR_KEYS) colors[k] = str(rawColors[k], colors[k]);

  const social: BrandSocialLink[] = [];
  if (Array.isArray(raw.social_links)) {
    for (const item of raw.social_links as Record<string, unknown>[]) {
      const network = str(item?.network) as SocialNetwork;
      if (!(network in SOCIAL_NETWORKS)) continue;
      social.push({ id: str(item?.id) || uid('bsl'), network, url: str(item?.url) });
    }
  }

  return {
    ...base,
    id: str(raw.id) || base.id,
    name: raw.name.trim(),
    slug: str(raw.slug) || slugify(raw.name),
    logo: str(raw.logo),
    logo_dark: str(raw.logo_dark),
    logo_url: str(raw.logo_url),
    logo_dark_url: str(raw.logo_dark_url),
    website_url: str(raw.website_url),
    tokens: {
      colors,
      fonts: {
        heading: str(rawFonts.heading, base.tokens.fonts.heading),
        body: str(rawFonts.body, base.tokens.fonts.body),
      },
      button: {
        radius: num(rawButton.radius, base.tokens.button.radius),
        paddingV: num(rawButton.paddingV, base.tokens.button.paddingV),
        paddingH: num(rawButton.paddingH, base.tokens.button.paddingH),
        weight: rawButton.weight === 'normal' ? 'normal' : 'bold',
        uppercase: rawButton.uppercase === true,
      },
    },
    footer: {
      address: str(rawFooter.address),
      legal_text: str(rawFooter.legal_text),
      unsubscribe_text: str(rawFooter.unsubscribe_text, base.footer.unsubscribe_text),
    },
    social_links: social,
    is_active: raw.is_active !== false,
    createdAt: num(raw.createdAt, base.createdAt),
    updatedAt: num(raw.updatedAt, base.updatedAt),
    createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : null,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : null,
  };
}
