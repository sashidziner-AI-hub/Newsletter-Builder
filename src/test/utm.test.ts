import { describe, expect, it } from 'vitest';
import { veeBrand } from '../lib/brand';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { resolveForOutput } from '../lib/output';
import { renderDesign } from '../lib/render';
import { PRESETS } from '../lib/presets';
import { addUtm, countHtmlLinks, rewriteHtmlLinks, shouldSkip } from '../lib/utm';
import type { Block, Design, UtmSettings } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;
const vee = veeBrand();

const utm = (over: Partial<UtmSettings> = {}): UtmSettings => ({
  enabled: true,
  source: 'newsletter',
  medium: 'email',
  campaign: 'spring-2026',
  content: '',
  term: '',
  ...over,
});

function designWith(blocks: Block[], over: Partial<Design['body']> = {}): Design {
  const d = emptyDesign();
  Object.assign(d.body, over);
  const row = createRow([1]);
  row.columns[0].blocks = blocks;
  d.rows.push(row);
  return d;
}

const exportHtml = (d: Design) => renderDesign(resolveForOutput(d, vee, 'export').design);

/* ------------------------------------------------------------------ addUtm */

describe('addUtm', () => {
  it('appends the configured parameters to a plain link', () => {
    expect(addUtm('https://example.com/page', utm())).toBe(
      'https://example.com/page?utm_source=newsletter&utm_medium=email&utm_campaign=spring-2026',
    );
  });

  it('keeps an existing query string and appends to it', () => {
    expect(addUtm('https://example.com/p?ref=abc', utm())).toBe(
      'https://example.com/p?ref=abc&utm_source=newsletter&utm_medium=email&utm_campaign=spring-2026',
    );
  });

  it('keeps a #hash at the end', () => {
    expect(addUtm('https://example.com/p#section', utm())).toBe(
      'https://example.com/p?utm_source=newsletter&utm_medium=email&utm_campaign=spring-2026#section',
    );
  });

  it('keeps both a query string and a hash', () => {
    const out = addUtm('https://example.com/p?a=1#frag', utm());
    expect(out).toBe(
      'https://example.com/p?a=1&utm_source=newsletter&utm_medium=email&utm_campaign=spring-2026#frag',
    );
  });

  it('never overrides a utm_* the link already carries', () => {
    const out = addUtm('https://example.com/p?utm_source=partner', utm());
    expect(out).toContain('utm_source=partner');
    expect(out).not.toContain('utm_source=newsletter');
    // the others are still added
    expect(out).toContain('utm_medium=email');
    expect(out).toContain('utm_campaign=spring-2026');
  });

  it('includes the optional parameters only when set', () => {
    expect(addUtm('https://example.com', utm())).not.toContain('utm_content');
    expect(addUtm('https://example.com', utm({ content: 'hero', term: 'spring' }))).toContain(
      'utm_content=hero',
    );
    expect(addUtm('https://example.com', utm({ term: 'a b' }))).toContain('utm_term=a%20b');
  });

  it('is a no-op when tracking is off', () => {
    expect(addUtm('https://example.com', utm({ enabled: false }))).toBe('https://example.com');
  });

  it('skips the URL kinds that must never be tagged', () => {
    for (const url of [
      'mailto:hello@example.com',
      'tel:+441234567890',
      '#section',
      '{{unsubscribe_url}}',
      '{{ view_in_browser_url }}',
      'https://example.com/u?x={{unsubscribe_url}}',
      '',
    ]) {
      expect(shouldSkip(url), url).toBe(true);
      expect(addUtm(url, utm()), url).toBe(url);
    }
  });

  it('leaves a relative URL alone', () => {
    expect(addUtm('/about', utm())).toBe('/about');
  });
});

/* -------------------------------------------------------- html rewriting */

describe('rewriteHtmlLinks', () => {
  it('tags every anchor href', () => {
    const html = '<p><a href="https://a.test">A</a> and <a href="https://b.test">B</a></p>';
    const out = rewriteHtmlLinks(html, (u) => addUtm(u, utm()));
    expect(out).toContain('https://a.test?utm_source=newsletter');
    expect(out).toContain('https://b.test?utm_source=newsletter');
  });

  it('honours data-no-track and strips the attribute', () => {
    const html = '<a href="https://a.test" data-no-track="1">A</a>';
    const out = rewriteHtmlLinks(html, (u) => addUtm(u, utm()));
    expect(out).not.toContain('utm_source');
    expect(out).not.toContain('data-no-track');
    expect(out).toContain('href="https://a.test"');
  });

  it('counts what it would and would not tag', () => {
    const html =
      '<a href="https://a.test">A</a><a href="mailto:x@y.z">M</a><a href="https://b.test" data-no-track="1">B</a>';
    expect(countHtmlLinks(html, utm())).toEqual({ added: 1, skipped: 2 });
  });
});

/* ------------------------------------------------- through the boundary */

describe('UTM at the export boundary', () => {
  it('is off by default, leaving every link untouched', () => {
    const button = mk('button');
    button.values.href = 'https://example.com/go';
    const html = exportHtml(designWith([button]));
    expect(html).toContain('https://example.com/go"');
    expect(html).not.toContain('utm_');
  });

  it('tags discrete link fields across block types when on', () => {
    const button = mk('button');
    button.values.href = 'https://example.com/button';
    const menu = mk('menu');
    menu.values.items = [{ id: 'm1', label: 'Home', href: 'https://example.com/home' }];
    const article = mk('articles');
    article.values.items = [
      {
        id: 'a1',
        imageSrc: '',
        imageAlt: 'x',
        title: 'T',
        excerpt: 'E',
        readMoreLabel: 'Read',
        readMoreHref: 'https://example.com/article',
      },
    ];
    const html = exportHtml(designWith([button, menu, article], { utm: utm() }));
    expect(html).toContain('example.com/button?utm_source=newsletter');
    expect(html).toContain('example.com/home?utm_source=newsletter');
    expect(html).toContain('example.com/article?utm_source=newsletter');
  });

  it('respects a per-link opt-out', () => {
    const a = mk('button');
    a.values.href = 'https://example.com/tracked';
    const b = mk('button');
    b.values.href = 'https://example.com/clean';
    b.values.noTrack = true;
    const html = exportHtml(designWith([a, b], { utm: utm() }));
    expect(html).toContain('example.com/tracked?utm_source=');
    expect(html).toContain('"https://example.com/clean"');
  });

  it('never tags the unsubscribe link', () => {
    const footer = mk('footer');
    const html = exportHtml(designWith([footer], { utm: utm() }));
    expect(html).toContain('href="{{unsubscribe_url}}"');
    expect(html).not.toContain('{{unsubscribe_url}}?utm');
  });

  it('tags links inside a Text block', () => {
    const text = mk('text');
    text.values.html = '<p>See <a href="https://example.com/inline">this</a>.</p>';
    const html = exportHtml(designWith([text], { utm: utm() }));
    expect(html).toContain('example.com/inline?utm_source=newsletter');
  });

  it('leaves the canvas preview untagged', () => {
    const button = mk('button');
    button.values.href = 'https://example.com/go';
    const design = designWith([button], { utm: utm() });
    const preview = renderDesign(resolveForOutput(design, vee, 'preview').design);
    expect(preview).not.toContain('utm_');
  });

  it('reports a count for the export summary', () => {
    const button = mk('button');
    button.values.href = 'https://example.com/go';
    const out = resolveForOutput(designWith([button], { utm: utm() }), vee, 'export');
    expect(out.utm.added).toBe(1);
    expect(out.utm.skipped).toBe(0);
  });

  it('counts the untagged unsubscribe link as skipped, not as invisible', () => {
    const button = mk('button');
    button.values.href = 'https://example.com/go';
    const out = resolveForOutput(
      designWith([button, mk('footer')], { utm: utm() }),
      vee,
      'export',
    );
    expect(out.utm.added).toBe(1);
    // the footer's unsubscribe link is reported rather than silently dropped
    expect(out.utm.skipped).toBe(1);
  });

  it('counts an opted-out link and a mailto as skipped', () => {
    const optedOut = mk('button');
    optedOut.values.href = 'https://example.com/clean';
    optedOut.values.noTrack = true;
    const image = mk('image');
    image.values.href = 'mailto:hello@example.com';
    const out = resolveForOutput(designWith([optedOut, image], { utm: utm() }), vee, 'export');
    expect(out.utm.added).toBe(0);
    expect(out.utm.skipped).toBe(2);
  });

  it('reports nothing while tracking is off', () => {
    const button = mk('button');
    button.values.href = 'https://example.com/go';
    const out = resolveForOutput(designWith([button]), vee, 'export');
    expect(out.utm).toEqual({ added: 0, skipped: 0 });
  });

  it('strips data-no-track even when tracking is off', () => {
    const text = mk('text');
    text.values.html = '<p><a href="https://a.test" data-no-track="1">A</a></p>';
    const html = exportHtml(designWith([text]));
    expect(html).not.toContain('data-no-track');
  });

  it('tags the presets without breaking their merge tags', () => {
    for (const preset of PRESETS) {
      const design = preset.build(vee);
      design.body.utm = utm();
      const html = renderDesign(resolveForOutput(design, vee, 'export').design);
      expect(html, preset.name).not.toContain('{{unsubscribe_url}}?');
      // every tagged link still parses as one query string
      for (const href of [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])) {
        expect(href.split('?').length, `${preset.name} ${href}`).toBeLessThanOrEqual(2);
      }
    }
  });
});
