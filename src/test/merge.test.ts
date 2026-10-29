import { describe, expect, it } from 'vitest';
import { veeBrand } from '../lib/brand';
import { createBlock, createRow, defaultBody, emptyDesign } from '../lib/defaults';
import { normalizeDesign } from '../lib/design-ops';
import {
  applySampleData,
  defaultSampleData,
  formatMergeTags,
  hasLinkTag,
  hasMergeTag,
  isMergeTagOnly,
  MERGE_TAGS,
  renderTag,
} from '../lib/merge';
import { resolveForOutput } from '../lib/output';
import { PRESETS } from '../lib/presets';
import { renderDesign } from '../lib/render';
import { auditImageSources } from '../lib/audit';
import type { Block, Design, MergeFormat } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;
const vee = veeBrand();

function designWith(blocks: Block[], over: Partial<Design['body']> = {}): Design {
  const d = emptyDesign();
  Object.assign(d.body, over);
  const row = createRow([1]);
  row.columns[0].blocks = blocks;
  d.rows.push(row);
  return d;
}

const exportHtml = (d: Design) => renderDesign(resolveForOutput(d, vee, 'export').design);

const body = (format: MergeFormat, custom = { prefix: '[%', suffix: '%]' }) => ({
  mergeFormat: format,
  mergeCustom: custom,
});

/* ------------------------------------------------------------- renderTag */

describe('renderTag', () => {
  it('writes the real Mailchimp spellings, not a naive uppercase', () => {
    expect(renderTag('first_name', 'mailchimp')).toBe('*|FNAME|*');
    expect(renderTag('last_name', 'mailchimp')).toBe('*|LNAME|*');
    expect(renderTag('company', 'mailchimp')).toBe('*|COMPANY|*');
    expect(renderTag('email', 'mailchimp')).toBe('*|EMAIL|*');
    expect(renderTag('unsubscribe_url', 'mailchimp')).toBe('*|UNSUB|*');
    expect(renderTag('view_in_browser_url', 'mailchimp')).toBe('*|ARCHIVE|*');
  });

  it('writes HubSpot contact properties', () => {
    expect(renderTag('first_name', 'hubspot')).toBe('{{ contact.firstname }}');
    expect(renderTag('last_name', 'hubspot')).toBe('{{ contact.lastname }}');
    expect(renderTag('unsubscribe_url', 'hubspot')).toBe('{{ unsubscribe_link }}');
    expect(renderTag('view_in_browser_url', 'hubspot')).toBe('{{ view_as_page_link }}');
  });

  it('leaves the canonical form alone for double curly', () => {
    expect(renderTag('first_name', 'curly')).toBe('{{first_name}}');
  });

  it('uses the prefix and suffix for custom', () => {
    expect(renderTag('first_name', 'custom', { prefix: '[%', suffix: '%]' })).toBe('[%first_name%]');
    expect(renderTag('first_name', 'custom', { prefix: '${', suffix: '}' })).toBe('${first_name}');
  });

  it('falls back generically for a tag not in the table', () => {
    expect(renderTag('job_title', 'mailchimp')).toBe('*|JOB_TITLE|*');
    expect(renderTag('job_title', 'hubspot')).toBe('{{ contact.job_title }}');
    expect(renderTag('job_title', 'curly')).toBe('{{job_title}}');
  });
});

/* ------------------------------------------------------- formatMergeTags */

describe('formatMergeTags', () => {
  const text = 'Hi {{first_name}} at {{company}} — {{unsubscribe_url}}';

  it('converts every tag in a string', () => {
    expect(formatMergeTags(text, body('mailchimp'))).toBe(
      'Hi *|FNAME|* at *|COMPANY|* — *|UNSUB|*',
    );
    expect(formatMergeTags(text, body('hubspot'))).toBe(
      'Hi {{ contact.firstname }} at {{ contact.company }} — {{ unsubscribe_link }}',
    );
    expect(formatMergeTags(text, body('custom'))).toBe(
      'Hi [%first_name%] at [%company%] — [%unsubscribe_url%]',
    );
  });

  it('is an identity transform for the canonical format', () => {
    expect(formatMergeTags(text, body('curly'))).toBe(text);
  });

  it('tolerates inner whitespace in the stored tag', () => {
    expect(formatMergeTags('Hi {{ first_name }}', body('mailchimp'))).toBe('Hi *|FNAME|*');
  });

  it('leaves non-tag text and braces alone', () => {
    expect(formatMergeTags('a { b } c', body('mailchimp'))).toBe('a { b } c');
    expect(formatMergeTags('', body('mailchimp'))).toBe('');
  });

  it('is repeatable — converting twice does not double-wrap', () => {
    const once = formatMergeTags(text, body('mailchimp'));
    expect(formatMergeTags(once, body('mailchimp'))).toBe(once);
  });
});

/* --------------------------------------------------------- tag detection */

describe('tag detection', () => {
  it('spots a URL that is nothing but a tag', () => {
    expect(isMergeTagOnly('{{unsubscribe_url}}')).toBe(true);
    expect(isMergeTagOnly('  {{ view_in_browser_url }}  ')).toBe(true);
    expect(isMergeTagOnly('https://example.com/{{company}}')).toBe(false);
    expect(isMergeTagOnly('https://example.com')).toBe(false);
    expect(isMergeTagOnly('')).toBe(false);
  });

  it('spots the link tags that must never be tracked', () => {
    expect(hasLinkTag('{{unsubscribe_url}}')).toBe(true);
    expect(hasLinkTag('https://esp.test/u?t={{unsubscribe_url}}')).toBe(true);
    expect(hasLinkTag('https://example.com/{{first_name}}')).toBe(false);
  });

  it('hasMergeTag does not get confused by repeated calls', () => {
    // a global regex reused with .test() would alternate true/false here
    for (let i = 0; i < 4; i++) expect(hasMergeTag('Hi {{first_name}}')).toBe(true);
    for (let i = 0; i < 4; i++) expect(hasMergeTag('no tags here')).toBe(false);
  });

  it('never reports a merge tag as a broken or insecure link', () => {
    const footer = mk('footer');
    const html = exportHtml(designWith([footer]));
    expect(html).toContain('href="{{unsubscribe_url}}"');
    // the image audit is the thing that flags bad URLs, and it stays clean
    const audit = auditImageSources(html);
    expect(audit.insecure).toEqual([]);
  });
});

/* ---------------------------------------------------- through the boundary */

describe('format conversion at the export boundary', () => {
  it('converts tags in text, headings, buttons, subject and preheader', () => {
    const heading = mk('heading');
    heading.values.text = 'Hello {{first_name}}';
    const text = mk('text');
    text.values.html = '<p>From {{company}}</p>';
    const button = mk('button');
    button.values.label = 'Hi {{first_name}}';
    const design = designWith([heading, text, button], {
      title: 'Hey {{first_name}}',
      preheader: 'A note for {{company}}',
      mergeFormat: 'mailchimp',
    });

    const html = exportHtml(design);
    expect(html).toContain('Hello *|FNAME|*');
    expect(html).toContain('From *|COMPANY|*');
    expect(html).toContain('Hi *|FNAME|*');
    expect(html).toContain('<title>Hey *|FNAME|*</title>');
    expect(html).toContain('A note for *|COMPANY|*');
    expect(html).not.toContain('{{');
  });

  it('converts a tag used as a whole URL', () => {
    const footer = mk('footer');
    const html = exportHtml(designWith([footer], { mergeFormat: 'mailchimp' }));
    expect(html).toContain('href="*|UNSUB|*"');
  });

  it('leaves the stored design completely unchanged', () => {
    const heading = mk('heading');
    heading.values.text = 'Hello {{first_name}}';
    const design = designWith([heading], { mergeFormat: 'mailchimp' });
    const before = JSON.stringify(design);

    exportHtml(design);
    resolveForOutput(design, vee, 'preview');

    expect(JSON.stringify(design)).toBe(before);
    expect(JSON.stringify(design)).toContain('{{first_name}}');
  });

  it('switching format changes only the export, never the content', () => {
    const heading = mk('heading');
    heading.values.text = 'Hello {{first_name}}';
    const design = designWith([heading]);

    const stored = () =>
      (design.rows[0].columns[0].blocks[0] as BlockOf<'heading'>).values.text;

    for (const format of ['curly', 'mailchimp', 'hubspot', 'custom'] as MergeFormat[]) {
      design.body.mergeFormat = format;
      exportHtml(design);
      // the editor content is identical after every switch
      expect(stored(), format).toBe('Hello {{first_name}}');
    }
  });

  it('every preset still exports its tags in the chosen format', () => {
    for (const preset of PRESETS) {
      const design = preset.build(vee);
      design.body.mergeFormat = 'mailchimp';
      const html = renderDesign(resolveForOutput(design, vee, 'export').design);
      expect(html, preset.name).not.toContain('{{');
      if (preset.id !== 'digest') expect(html, preset.name).toContain('*|');
    }
  });
});

/* ------------------------------------------------------------ sample data */

describe('sample data preview', () => {
  it('substitutes values in the canvas but never in the export', () => {
    const heading = mk('heading');
    heading.values.text = 'Hello {{first_name}}';
    const design = designWith([heading]);
    const sample = defaultSampleData();

    const preview = renderDesign(
      resolveForOutput(design, vee, 'preview', { sampleData: sample }).design,
    );
    expect(preview).toContain('Hello John');

    // the export keeps the tag, whatever the preview is showing
    expect(exportHtml(design)).toContain('Hello {{first_name}}');
    expect(exportHtml(design)).not.toContain('John');
  });

  it('leaves a tag alone when there is no sample value for it', () => {
    expect(applySampleData('Hi {{nickname}}', { first_name: 'John' })).toBe('Hi {{nickname}}');
  });

  it('ships a sample value for every built-in tag', () => {
    const sample = defaultSampleData();
    for (const t of MERGE_TAGS) expect(sample[t.tag], t.tag).toBeTruthy();
  });
});

/* ---------------------------------------------------------- settings data */

describe('settings defaults and migration', () => {
  it('defaults to the canonical format with tracking off', () => {
    const d = defaultBody();
    expect(d.mergeFormat).toBe('curly');
    expect(d.utm.enabled).toBe(false);
    expect(d.utm.medium).toBe('email');
  });

  it('fills the new settings on a design saved before 2A', () => {
    const legacy = {
      version: 1,
      body: { title: 'Old email', bgColor: '#101010' },
      rows: [{ layout: [1], columns: [{ blocks: [{ type: 'heading', values: { text: 'Hi' } }] }] }],
    };
    const design = normalizeDesign(legacy);
    expect(design).not.toBeNull();
    expect(design!.body.mergeFormat).toBe('curly');
    expect(design!.body.utm.enabled).toBe(false);
    expect(design!.body.utm.medium).toBe('email');
    expect(design!.body.mergeCustom.prefix).toBe('{{');
    // and it does not disturb what was stored
    expect(design!.body.bgColor).toBe('#101010');
  });

  it('completes a partially stored utm object rather than trusting it', () => {
    const design = normalizeDesign({
      version: 1,
      body: { utm: { enabled: true, source: 'nl' } },
      rows: [],
    });
    expect(design!.body.utm.enabled).toBe(true);
    expect(design!.body.utm.source).toBe('nl');
    // the missing keys come from the defaults, not undefined
    expect(design!.body.utm.medium).toBe('email');
    expect(design!.body.utm.campaign).toBe('');
  });
});
