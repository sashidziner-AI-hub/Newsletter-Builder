import { describe, expect, it } from 'vitest';
import { auditImageSources, isPlaceholderImage } from '../lib/audit';
import { emptyBrand, resolveDesign, veeBrand } from '../lib/brand';
import { normalizeDesign } from '../lib/design-ops';
import { PRESETS, type Preset } from '../lib/presets';
import { renderDesign } from '../lib/render';
import type { Block, Brand, Design } from '../types';

const vee = veeBrand();

/** A second, visibly different brand, as in the acceptance test. */
function acme(): Brand {
  const b = emptyBrand('Acme Health');
  b.id = 'brand_acme';
  b.logo_url = 'https://cdn.example.com/acme.png';
  b.tokens.colors = {
    primary: '#0D9488',
    secondary: '#042F2E',
    accent: '#14B8A6',
    text: '#0F172A',
    muted: '#64748B',
    link: '#0D9488',
    page_bg: '#ECFDF5',
    content_bg: '#FFFFFF',
    border: '#CCFBF1',
  };
  b.tokens.fonts = { heading: 'Georgia, Times, serif', body: 'Verdana, Geneva, sans-serif' };
  b.footer = {
    address: '12 Example Street, Chennai 600001',
    legal_text: '© 2026 Acme Health. All rights reserved.',
    unsubscribe_text: 'Unsubscribe',
  };
  b.social_links = [{ id: 'sl1', network: 'linkedin', url: 'https://linkedin.com/company/acme' }];
  return b;
}

const BRANDS: Brand[] = [vee, acme()];

const exportHtml = (design: Design, brand: Brand) =>
  renderDesign(resolveDesign(design, brand, 'export'));

const allBlocks = (d: Design): Block[] => d.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks));

const allIds = (d: Design): string[] => [
  ...d.rows.map((r) => r.id),
  ...d.rows.flatMap((r) => r.columns.map((c) => c.id)),
  ...allBlocks(d).map((b) => b.id),
];

/* ------------------------------------------------------- per preset, 2 brands */

describe.each(PRESETS.map((p) => [p.name, p] as [string, Preset]))('%s preset', (_name, preset) => {
  for (const brand of BRANDS) {
    describe(`themed for ${brand.name}`, () => {
      const html = exportHtml(preset.build(brand), brand);

      it('emits no flex, grid, position or brand tokens', () => {
        expect(html).not.toContain('display:flex');
        expect(html).not.toContain('display:grid');
        expect(html).not.toContain('position:');
        expect(html).not.toContain('brand.');
        expect(html).toContain('<table role="presentation"');
      });

      it('gives every image alt text and a width', () => {
        for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
          expect(img, img).toMatch(/\salt="[^"]/); // present AND non-empty
          expect(img, img).toMatch(/\swidth="\d+"/);
          // border is zeroed either as an attribute (composite blocks) or in the
          // inline style (the original Image block, which 1C does not touch)
          expect(/border="0"|border:0/.test(img), img).toBe(true);
          expect(img, img).toContain('display:block');
        }
      });

      it('uses https for every link, bar merge tags', () => {
        const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) {
          expect(/^https:\/\//.test(href) || /^\{\{[\w.]+\}\}$/.test(href), href).toBe(true);
        }
      });

      it('keeps merge tags literal', () => {
        // whichever tags this preset uses must survive verbatim
        const source = JSON.stringify(preset.build(brand));
        for (const tag of source.match(/\{\{\w+\}\}/g) ?? []) {
          expect(html).toContain(tag);
        }
      });

      it('exports under 90 KB', () => {
        // Blob is what the export dialog measures with, so this matches the UI
        const kb = new Blob([html]).size / 1024;
        expect(kb, `${preset.name} is ${kb.toFixed(1)} KB`).toBeLessThan(90);
      });

      it('is themed by this brand', () => {
        expect(html).toContain(brand.tokens.colors.primary);
      });

      it('round-trips through normalizeDesign unchanged', () => {
        const design = resolveDesign(preset.build(brand), brand, 'export');
        const again = normalizeDesign(JSON.parse(JSON.stringify(design)));
        expect(again).not.toBeNull();
        expect(renderDesign(again!)).toBe(renderDesign(design));
      });
    });
  }
});

/* ------------------------------------------------------------- brand switching */

describe('brand switching', () => {
  it('re-themes every preset', () => {
    for (const preset of PRESETS) {
      // one design, rendered against two brands — tokens resolve differently
      const design = preset.build(vee);
      const a = exportHtml(design, vee);
      const b = exportHtml(design, acme());
      expect(a, preset.name).toContain('#F58220');
      expect(b, preset.name).toContain('#0D9488');
      expect(b, preset.name).not.toContain('#F58220');
    }
  });

  it('keeps a hex override through a brand switch', () => {
    const design = PRESETS[0].build(vee);
    const block = allBlocks(design).find((b) => b.type === 'hero')!;
    (block.values as { headingColor: string }).headingColor = '#ABCDEF';
    expect(exportHtml(design, vee)).toContain('#ABCDEF');
    expect(exportHtml(design, acme())).toContain('#ABCDEF');
  });
});

/* ----------------------------------------------------------------- copies only */

describe('applying a preset yields an independent copy', () => {
  it('mints fresh ids every time', () => {
    for (const preset of PRESETS) {
      const first = allIds(preset.build(vee));
      const second = allIds(preset.build(vee));
      expect(first.length, preset.name).toBeGreaterThan(0);
      expect(first.length).toBe(second.length);
      // not one id in common
      const shared = first.filter((id) => second.includes(id));
      expect(shared, preset.name).toEqual([]);
    }
  });

  it('editing an applied design cannot reach the preset', () => {
    const preset = PRESETS[0];
    const before = JSON.stringify(preset.build(vee)).replace(/"id":"[^"]+"/g, '"id":"X"');

    const mine = preset.build(vee);
    mine.body.title = 'Rewritten by the user';
    const hero = allBlocks(mine).find((b) => b.type === 'hero')!;
    (hero.values as { heading: string }).heading = 'Totally different heading';
    mine.rows.splice(1, 1);

    const after = JSON.stringify(preset.build(vee)).replace(/"id":"[^"]+"/g, '"id":"X"');
    expect(after).toBe(before);
    expect(after).not.toContain('Totally different heading');
  });

  it('bakes the active brand name into the copy at apply time', () => {
    const welcome = PRESETS.find((p) => p.id === 'welcome')!;
    expect(JSON.stringify(welcome.build(vee))).toContain('Vee Technologies');
    expect(JSON.stringify(welcome.build(acme()))).toContain('Acme Health');
  });
});

/* -------------------------------------------------------- subject / preheader */

describe('subject and preheader', () => {
  it('every preset pre-fills both, and they reach the export', () => {
    for (const preset of PRESETS) {
      const design = preset.build(vee);
      expect(design.body.title.trim(), preset.name).not.toBe('');
      expect(design.body.preheader.trim(), preset.name).not.toBe('');
      expect(exportHtml(design, vee)).toContain('<title>');
    }
  });
});

/* -------------------------------------------------------- the plain-email one */

describe('cold outreach preset', () => {
  const preset = PRESETS.find((p) => p.id === 'cold-outreach')!;
  const design = preset.build(vee);

  it('has no images at all', () => {
    expect(exportHtml(design, vee)).not.toContain('<img');
  });

  it('has no header or hero block', () => {
    const types = allBlocks(design).map((b) => b.type);
    expect(types).not.toContain('header');
    expect(types).not.toContain('hero');
    expect(types).not.toContain('articles');
  });

  it('reads like a personal email: no page frame, a greeting and a signature', () => {
    // body background matches the content background, so there is no grey frame
    expect(design.body.bgColor).toBe('brand.content_bg');
    const html = exportHtml(design, vee);
    expect(html).toContain('{{first_name}}');
    expect(html).toContain('{{unsubscribe_url}}');
  });
});

/* -------------------------------------------------------- placeholder warning */

describe('placeholder image audit', () => {
  it('recognises the placeholder hosts and leaves real URLs alone', () => {
    expect(isPlaceholderImage('https://picsum.photos/seed/x/600/300')).toBe(true);
    expect(isPlaceholderImage('https://via.placeholder.com/600')).toBe(true);
    expect(isPlaceholderImage('https://cdn.example.com/real-photo.jpg')).toBe(false);
    expect(isPlaceholderImage('')).toBe(false);
  });

  it('flags presets that still carry placeholder art', () => {
    const withArt = PRESETS.filter((p) => exportHtml(p.build(vee), vee).includes('<img'));
    expect(withArt.length).toBeGreaterThan(0);
    for (const preset of withArt) {
      const audit = auditImageSources(exportHtml(preset.build(vee), vee));
      expect(audit.placeholders, preset.name).toBeGreaterThan(0);
      expect(audit.ok, preset.name).toBe(false);
    }
  });

  it('clears once the images are replaced', () => {
    const preset = PRESETS.find((p) => p.id === 'product-launch')!;
    const design = preset.build(vee);
    for (const block of allBlocks(design)) {
      const v = block.values as unknown as Record<string, unknown>;
      if (typeof v.imageSrc === 'string' && v.imageSrc) v.imageSrc = 'https://cdn.example.com/a.jpg';
      if (typeof v.src === 'string' && v.src) v.src = 'https://cdn.example.com/b.jpg';
      if (Array.isArray(v.cards)) {
        v.cards = (v.cards as Record<string, unknown>[]).map((c) => ({
          ...c,
          imageSrc: 'https://cdn.example.com/c.jpg',
        }));
      }
    }
    const audit = auditImageSources(exportHtml(design, vee));
    expect(audit.placeholders).toBe(0);
    expect(audit.ok).toBe(true);
  });

  it('does not flag the cold outreach preset, which has no images', () => {
    const preset = PRESETS.find((p) => p.id === 'cold-outreach')!;
    expect(auditImageSources(exportHtml(preset.build(vee), vee)).placeholders).toBe(0);
  });
});
