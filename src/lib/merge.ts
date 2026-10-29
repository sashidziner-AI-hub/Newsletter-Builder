import type { BodySettings, MergeFormat } from '../types';

/**
 * Merge tags.
 *
 * A design always stores a tag in the canonical `{{tag}}` form. The ESP-specific
 * spelling is produced at the export boundary by `formatMergeTags()`, so
 * switching the format never touches stored content.
 */

export interface MergeTag {
  tag: string;
  label: string;
  /** value used by the "preview with sample data" toggle */
  sample: string;
}

export const MERGE_TAGS: MergeTag[] = [
  { tag: 'first_name', label: 'First name', sample: 'John' },
  { tag: 'last_name', label: 'Last name', sample: 'Doe' },
  { tag: 'company', label: 'Company', sample: 'Acme Corp' },
  { tag: 'email', label: 'Email address', sample: 'john.doe@acme.example' },
  { tag: 'unsubscribe_url', label: 'Unsubscribe URL', sample: 'https://example.com/unsubscribe' },
  { tag: 'view_in_browser_url', label: 'View in browser URL', sample: 'https://example.com/view' },
];

/** Tags whose links must never be touched by the UTM tagger. */
export const LINK_TAGS = ['unsubscribe_url', 'view_in_browser_url'];

/** Matches a canonical tag, tolerating inner whitespace. */
export const CANONICAL_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Real ESP spellings. Anything missing falls back to the generic rule below. */
const ESP_NAMES: Record<'mailchimp' | 'hubspot', Record<string, string>> = {
  mailchimp: {
    first_name: 'FNAME',
    last_name: 'LNAME',
    company: 'COMPANY',
    email: 'EMAIL',
    unsubscribe_url: 'UNSUB',
    view_in_browser_url: 'ARCHIVE',
  },
  hubspot: {
    first_name: 'contact.firstname',
    last_name: 'contact.lastname',
    company: 'contact.company',
    email: 'contact.email',
    unsubscribe_url: 'unsubscribe_link',
    view_in_browser_url: 'view_as_page_link',
  },
};

/** Write one canonical tag in the given format. */
export function renderTag(tag: string, format: MergeFormat, custom?: { prefix: string; suffix: string }): string {
  switch (format) {
    case 'mailchimp': {
      const name = ESP_NAMES.mailchimp[tag] ?? tag.toUpperCase();
      return `*|${name}|*`;
    }
    case 'hubspot': {
      const name = ESP_NAMES.hubspot[tag] ?? `contact.${tag}`;
      return `{{ ${name} }}`;
    }
    case 'custom':
      return `${custom?.prefix ?? '{{'}${tag}${custom?.suffix ?? '}}'}`;
    case 'curly':
    default:
      return `{{${tag}}}`;
  }
}

/**
 * Rewrite every canonical tag in `text` into the format the email is set to.
 * With the default 'curly' format this is an identity transform.
 */
export function formatMergeTags(text: string, body: Pick<BodySettings, 'mergeFormat' | 'mergeCustom'>): string {
  if (!text) return text;
  if (body.mergeFormat === 'curly') return text;
  return text.replace(CANONICAL_RE, (_m, tag: string) =>
    renderTag(tag, body.mergeFormat, body.mergeCustom),
  );
}

/** Replace tags with sample values, for the editor's preview toggle only. */
export function applySampleData(text: string, sample: Record<string, string>): string {
  if (!text) return text;
  return text.replace(CANONICAL_RE, (m, tag: string) => sample[tag] ?? m);
}

/** The default sample values, used until the user edits them. */
export function defaultSampleData(): Record<string, string> {
  return Object.fromEntries(MERGE_TAGS.map((t) => [t.tag, t.sample]));
}

/** True when a URL is nothing but a merge tag, so there is nothing to track. */
export function isMergeTagOnly(url: string): boolean {
  const trimmed = (url || '').trim();
  if (!trimmed) return false;
  return /^\{\{\s*[\w.]+\s*\}\}$/.test(trimmed);
}

/** True when a URL carries one of the tags that must stay untracked. */
export function hasLinkTag(url: string): boolean {
  const trimmed = (url || '').trim();
  return LINK_TAGS.some((t) => trimmed.includes(`{{${t}}}`) || trimmed.includes(`{{ ${t} }}`));
}

/**
 * Does this text contain any canonical tag?
 * Uses its own non-global copy: `.test()` on CANONICAL_RE would advance its
 * lastIndex and make the next call lie.
 */
export function hasMergeTag(text: string): boolean {
  return /\{\{\s*[\w.]+\s*\}\}/.test(text || '');
}
