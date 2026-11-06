import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMAIL_DEFAULTS_STORAGE_KEY,
  applyEmailDefaults,
  loadEmailDefaults,
  saveEmailDefaults,
  type EmailDefaults,
} from '../lib/email-defaults';
import { defaultBody } from '../lib/defaults';
import { emptyDesign } from '../lib/defaults';

beforeEach(() => localStorage.clear());

describe('loadEmailDefaults', () => {
  it('before any customization, matches defaultBody() exactly', () => {
    const defaults = loadEmailDefaults();
    const body = defaultBody();
    expect(defaults.mergeFormat).toBe(body.mergeFormat);
    expect(defaults.mergeCustom).toEqual(body.mergeCustom);
    expect(defaults.utmSource).toBe(body.utm.source);
    expect(defaults.utmMedium).toBe(body.utm.medium);
    expect(defaults.darkMode).toBe(body.darkMode);
    expect(defaults.defaultBrandId).toBeNull();
  });

  it('round-trips a saved customization', () => {
    saveEmailDefaults({
      mergeFormat: 'mailchimp',
      mergeCustom: { prefix: '{{', suffix: '}}' },
      utmSource: 'newsletter',
      utmMedium: 'email',
      darkMode: false,
      defaultBrandId: 'brand_123',
    });
    const defaults = loadEmailDefaults();
    expect(defaults.mergeFormat).toBe('mailchimp');
    expect(defaults.utmSource).toBe('newsletter');
    expect(defaults.darkMode).toBe(false);
    expect(defaults.defaultBrandId).toBe('brand_123');
  });

  it('tolerates corrupt storage, falling back to defaultBody()', () => {
    localStorage.setItem(EMAIL_DEFAULTS_STORAGE_KEY, 'not json');
    expect(loadEmailDefaults().mergeFormat).toBe(defaultBody().mergeFormat);
  });

  it('rejects an invalid mergeFormat value rather than storing garbage', () => {
    localStorage.setItem(
      EMAIL_DEFAULTS_STORAGE_KEY,
      JSON.stringify({ mergeFormat: 'not-a-real-format' }),
    );
    expect(loadEmailDefaults().mergeFormat).toBe(defaultBody().mergeFormat);
  });
});

describe('applyEmailDefaults', () => {
  const customized: EmailDefaults = {
    mergeFormat: 'hubspot',
    mergeCustom: { prefix: '[[', suffix: ']]' },
    utmSource: 'weekly-digest',
    utmMedium: 'newsletter',
    darkMode: false,
    defaultBrandId: 'brand_abc',
  };

  it('overlays merge format, UTM source/medium, and dark mode onto a fresh design', () => {
    const design = applyEmailDefaults(emptyDesign(), customized);
    expect(design.body.mergeFormat).toBe('hubspot');
    expect(design.body.utm.source).toBe('weekly-digest');
    expect(design.body.utm.medium).toBe('newsletter');
    expect(design.body.darkMode).toBe(false);
  });

  it('leaves utm.enabled/campaign/content/term untouched — defaults only pre-fill source/medium', () => {
    const base = emptyDesign();
    base.body.utm = { ...base.body.utm, enabled: true, campaign: 'spring-sale', content: 'cta-1', term: 'x' };
    const design = applyEmailDefaults(base, customized);
    expect(design.body.utm.enabled).toBe(true);
    expect(design.body.utm.campaign).toBe('spring-sale');
    expect(design.body.utm.content).toBe('cta-1');
    expect(design.body.utm.term).toBe('x');
  });

  it('never mutates the design object passed in', () => {
    const base = emptyDesign();
    const before = JSON.stringify(base);
    applyEmailDefaults(base, customized);
    expect(JSON.stringify(base)).toBe(before);
  });

  it('with no customization at all, is a no-op relative to the design as built', () => {
    const base = emptyDesign();
    const design = applyEmailDefaults(base); // uses loadEmailDefaults() internally, nothing stored
    expect(design.body.mergeFormat).toBe(base.body.mergeFormat);
    expect(design.body.darkMode).toBe(base.body.darkMode);
    expect(design.body.utm.source).toBe(base.body.utm.source);
  });
});
