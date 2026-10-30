import { describe, expect, it } from 'vitest';
import { veeBrand } from '../lib/brand';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { resolveForOutput } from '../lib/output';
import { htmlToText, toPlainText, wrapText } from '../lib/plaintext';
import { PRESETS } from '../lib/presets';
import type { Block, Design, UtmSettings } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;
const vee = veeBrand();

const text = (d: Design) => toPlainText(resolveForOutput(d, vee, 'export').design);

const presetText = (id: string, mutate?: (d: Design) => void) => {
  const design = PRESETS.find((p) => p.id === id)!.build(vee);
  mutate?.(design);
  return text(design);
};

function designWith(blocks: Block[], over: Partial<Design['body']> = {}): Design {
  const d = emptyDesign();
  Object.assign(d.body, over);
  const row = createRow([1]);
  row.columns[0].blocks = blocks;
  d.rows.push(row);
  return d;
}

/* ------------------------------------------------------------- golden output */

describe('golden output', () => {
  it('Newsletter preset', () => {
    expect(presetText('newsletter')).toBe(
      `The lead story, three quick reads and what is next.

Vee Technologies

Services (https://example.com/services) | Insights
(https://example.com/insights) | Contact (https://example.com/contact)

THIS MONTH

The one change that cut our response time in half

A short look at what we changed, what it cost us, and what we would do
differently.

Read the full story: https://example.com/lead-story

Hello {{first_name}},

Here is what the team at Vee Technologies has been working on this month
— one longer read, three shorter ones, and a date for your diary at the
bottom.

What the new intake form changed
Fewer fields, clearer labels, and a 22% drop in abandoned submissions.
Read more: https://example.com/intake-form

----------

Three questions we now ask every new client
They take four minutes and have saved us weeks of rework.
Read more: https://example.com/three-questions

----------

Behind the scenes: how we plan a quarter
Our planning doc, the arguments it starts, and why we keep doing it.
Read more: https://example.com/planning

Want this as a monthly briefing?

One email a month. No more than that.

Subscribe to the briefing: https://example.com/subscribe

Unsubscribe: {{unsubscribe_url}}
`,
    );
  });

  it('Cold outreach preset', () => {
    expect(presetText('cold-outreach')).toBe(
      `One question, and I will keep it short.

Hi {{first_name}},

I noticed your team handles patient intake across three different
systems. Most groups your size tell us the handover between them is
where the time goes — usually a couple of hours a week per coordinator.

We built something for exactly that, and two clinics near you switched
last quarter. One of them cut their intake handling time by about a
third; I am happy to share what they did either way.

Would a short call next week be useful? If it is not a priority right
now, just say so and I will leave you alone.

Book 15 minutes: https://example.com/book-a-call

Best,
Priya Raman
Vee Technologies
example.com (https://example.com)

Unsubscribe: {{unsubscribe_url}}
`,
    );
  });
});

/* ------------------------------------------------------------------ hygiene */

describe('output hygiene', () => {
  for (const preset of PRESETS) {
    it(`${preset.name}: no HTML tags or entities survive`, () => {
      const out = presetText(preset.id);
      expect(out).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(out).not.toContain('&nbsp;');
      expect(out).not.toContain('&amp;');
      expect(out).not.toContain('&lt;');
      expect(out).not.toContain('&#39;');
      expect(out).not.toContain('style=');
    });

    it(`${preset.name}: wraps at 72 unless a single URL is longer`, () => {
      for (const line of presetText(preset.id).split('\n')) {
        if (line.length <= 72) continue;
        // an over-long line must be one unbreakable token, i.e. a URL
        expect(line.trim().split(/\s+/).length, line).toBe(1);
      }
    });
  }
});

/* --------------------------------------------------------------- footer off */

describe('Show footer', () => {
  it('omits the footer when the switch is off', () => {
    const on = presetText('newsletter');
    expect(on).toContain('Unsubscribe');

    const off = presetText('newsletter', (d) => {
      d.body.showFooter = false;
    });
    expect(off).not.toContain('Unsubscribe');
    expect(off).not.toContain('{{unsubscribe_url}}');
    // the rest of the email is still there
    expect(off).toContain('The one change that cut our response time in half');
  });
});

/* ------------------------------------------------------------ utm and tags */

describe('links and tags in plain text', () => {
  const utm: UtmSettings = {
    enabled: true,
    source: 'newsletter',
    medium: 'email',
    campaign: 'march',
    content: '',
    term: '',
  };

  it('URLs carry UTM parameters when tracking is on', () => {
    const out = presetText('newsletter', (d) => {
      d.body.utm = utm;
    });
    expect(out).toContain('https://example.com/lead-story?utm_source=newsletter');
    expect(out).toContain('utm_campaign=march');
  });

  it('the unsubscribe link stays untagged', () => {
    const out = presetText('newsletter', (d) => {
      d.body.utm = utm;
    });
    expect(out).toContain('Unsubscribe: {{unsubscribe_url}}');
    expect(out).not.toContain('{{unsubscribe_url}}?utm');
  });

  it('merge tags use the selected format', () => {
    const out = presetText('newsletter', (d) => {
      d.body.mergeFormat = 'mailchimp';
    });
    expect(out).toContain('Hello *|FNAME|*,');
    expect(out).toContain('Unsubscribe: *|UNSUB|*');
    expect(out).not.toContain('{{');
  });
});

/* ------------------------------------------------------------- block shapes */

describe('per-block rendering', () => {
  it('renders a button as "Label: url"', () => {
    const b = mk('button');
    b.values.label = 'Get started';
    b.values.href = 'https://example.com/go';
    expect(text(designWith([b]))).toContain('Get started: https://example.com/go');
  });

  it('renders a divider as a rule', () => {
    expect(text(designWith([mk('divider')]))).toContain('----------');
  });

  it('skips an image but keeps its alt text when that is all the block has', () => {
    const img = mk('image');
    img.values.src = 'https://cdn.example.com/a.png';
    img.values.alt = 'A chart of response times';
    const out = text(designWith([img]));
    expect(out).toContain('A chart of response times');
    expect(out).not.toContain('cdn.example.com');
  });

  it('renders a menu and social block as simple lists', () => {
    const menu = mk('menu');
    const social = mk('social');
    const out = text(designWith([menu, social]));
    expect(out).toContain('- Home (https://example.com)');
    expect(out).toContain('- Facebook: https://facebook.com');
  });

  it('renders inline links as "text (url)"', () => {
    const t = mk('text');
    t.values.html = '<p>Read <a href="https://example.com/post">our post</a> today.</p>';
    expect(text(designWith([t]))).toContain('Read our post (https://example.com/post) today.');
  });

  it('renders hero cards as stacked blocks', () => {
    const hero = mk('hero');
    hero.values.layout = 'cards-2';
    const out = text(designWith([hero]));
    expect(out).toContain('First card');
    expect(out).toContain('Second card');
    expect(out).toContain('Learn more: https://example.com');
  });

  it('separates paragraphs with a blank line', () => {
    const t = mk('text');
    t.values.html = '<p>One.</p><p>Two.</p>';
    expect(text(designWith([t]))).toContain('One.\n\nTwo.');
  });

  it('keeps list items as dashes', () => {
    const t = mk('text');
    t.values.html = '<ul><li>First</li><li>Second</li></ul>';
    const out = text(designWith([t]));
    expect(out).toContain('- First');
    expect(out).toContain('- Second');
  });
});

/* ------------------------------------------------------------------ helpers */

describe('helpers', () => {
  it('wrapText never splits a URL', () => {
    const url = 'https://example.com/a/very/long/path/that/goes/on/and/on/and/on/forever/really';
    const out = wrapText(`See ${url} for details`);
    expect(out).toContain(url);
    expect(out.split('\n').some((l) => l.trim() === url)).toBe(true);
  });

  it('wrapText leaves short text alone', () => {
    expect(wrapText('short line')).toBe('short line');
  });

  it('htmlToText drops a bare # href but keeps the label', () => {
    expect(htmlToText('<p><a href="#">Click</a></p>')).toBe('Click');
  });

  it('htmlToText collapses an anchor whose label is its URL', () => {
    expect(htmlToText('<p><a href="https://a.test">https://a.test</a></p>')).toBe('https://a.test');
  });
});
