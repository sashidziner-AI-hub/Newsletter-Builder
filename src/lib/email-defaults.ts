/**
 * Global defaults applied to a brand-new email at the moment it is created
 * (7A). `applyEmailDefaults()` is only ever called on a freshly built
 * `Design` — never on one already saved — which is what makes "defaults
 * apply to new emails only, and changing them never edits an existing email"
 * true by construction rather than by a special case somewhere else.
 */

import type { Design, MergeCustomFormat, MergeFormat } from '../types';
import { defaultBody } from './defaults';

const STORAGE_KEY = 'email-builder:email-defaults:v1';
const SCHEMA_VERSION = 1;

export interface EmailDefaults {
  mergeFormat: MergeFormat;
  mergeCustom: MergeCustomFormat;
  utmSource: string;
  utmMedium: string;
  darkMode: boolean;
  /** null = no override; NewEmailModal pre-selects this brand id when set */
  defaultBrandId: string | null;
}

const MERGE_FORMATS: readonly MergeFormat[] = ['curly', 'mailchimp', 'hubspot', 'custom'];

/**
 * Before anything has been customized, the stored defaults are exactly
 * `defaultBody()`'s own values — so a new email behaves identically to today
 * until someone actually changes something in the Email defaults section.
 */
function seedFromDefaultBody(): EmailDefaults {
  const body = defaultBody();
  return {
    mergeFormat: body.mergeFormat,
    mergeCustom: { ...body.mergeCustom },
    utmSource: body.utm.source,
    utmMedium: body.utm.medium,
    darkMode: body.darkMode,
    defaultBrandId: null,
  };
}

export function loadEmailDefaults(): EmailDefaults {
  const seed = seedFromDefaultBody();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw) as Partial<EmailDefaults> & { mergeCustom?: Partial<MergeCustomFormat> };
    return {
      mergeFormat: MERGE_FORMATS.includes(parsed.mergeFormat as MergeFormat)
        ? (parsed.mergeFormat as MergeFormat)
        : seed.mergeFormat,
      mergeCustom: {
        prefix: typeof parsed.mergeCustom?.prefix === 'string' ? parsed.mergeCustom.prefix : seed.mergeCustom.prefix,
        suffix: typeof parsed.mergeCustom?.suffix === 'string' ? parsed.mergeCustom.suffix : seed.mergeCustom.suffix,
      },
      utmSource: typeof parsed.utmSource === 'string' ? parsed.utmSource : seed.utmSource,
      utmMedium: typeof parsed.utmMedium === 'string' ? parsed.utmMedium : seed.utmMedium,
      darkMode: typeof parsed.darkMode === 'boolean' ? parsed.darkMode : seed.darkMode,
      defaultBrandId: typeof parsed.defaultBrandId === 'string' ? parsed.defaultBrandId : null,
    };
  } catch {
    return seed;
  }
}

export function saveEmailDefaults(defaults: EmailDefaults): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaults, schemaVersion: SCHEMA_VERSION }));
  } catch {
    // storage full or unavailable; the change just doesn't persist this session
  }
}

export function applyEmailDefaults(design: Design, defaults: EmailDefaults = loadEmailDefaults()): Design {
  return {
    ...design,
    body: {
      ...design.body,
      mergeFormat: defaults.mergeFormat,
      mergeCustom: { ...defaults.mergeCustom },
      utm: { ...design.body.utm, source: defaults.utmSource, medium: defaults.utmMedium },
      darkMode: defaults.darkMode,
    },
  };
}

export const EMAIL_DEFAULTS_STORAGE_KEY = STORAGE_KEY;
