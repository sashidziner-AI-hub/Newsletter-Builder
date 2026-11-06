import { describe, expect, it } from 'vitest';
import { emptyBrand, normalizeBrand, veeBrand } from '../lib/brand';
import { checkDesign } from '../lib/checks';
import { contrastRatio, round2 } from '../lib/contrast';
import {
  DM_LOGO_DARK,
  DM_LOGO_LIGHT,
  DM_PREVIEW_ATTR,
  darkBrand,
  darkColors,
  deriveDarkColors,
  paletteReadable,
} from '../lib/dark';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { normalizeDesign } from '../lib/design-ops';
import { darkRenderOpts, darkResolved, resolveForOutput } from '../lib/output';
import { PRESETS } from '../lib/presets';
import { renderDesign } from '../lib/render';
import type { Block, Brand, Design } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;
const vee = veeBrand();

/** The export, exactly as the Export dialog builds it. */
const exportHtml = (design: Design, brand: Brand = vee, previewDark = false) =>
  renderDesign(
    resolveForOutput(design, brand, 'export').design,
    darkRenderOpts(design, brand, previewDark),
  );

function designWith(blocks: Block[], over: Partial<Design['body']> = {}): Design {
  const d = emptyDesign();
  Object.assign(d.body, over);
  const row = createRow([1]);
  row.columns[0].blocks = blocks;
  d.rows.push(row);
  return d;
}

/**
 * The byte-identity guard.
 *
 * Recorded against the renderer as it stood before 3B. With dark support off
 * the exported HTML must not move by a single byte — no meta tags, no style
 * block, no class names. If this snapshot changes, dark mode has leaked into
 * the light export.
 */
function fingerprint(html: string) {
  // FNV-1a over the whole string: no node builtins, and it moves on any
  // single-byte change, which is all this guard needs
  let h = 0x811c9dc5;
  for (let i = 0; i < html.length; i++) {
    h ^= html.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return { chars: html.length, fnv1a: h.toString(16).padStart(8, '0') };
}

/* ------------------------------------------------------------------- off */

describe('dark mode off leaves the export untouched', () => {
  for (const preset of PRESETS) {
    it(`${preset.name} is byte-identical`, () => {
      const design = preset.build(vee);
      design.body.darkMode = false;
      expect(fingerprint(exportHtml(design))).toMatchSnapshot();
    });
  }

  it('emits none of the dark machinery', () => {
    for (const preset of PRESETS) {
      const design = preset.build(vee);
      design.body.darkMode = false;
      const html = exportHtml(design);
      expect(html, preset.name).not.toContain('prefers-color-scheme');
      expect(html, preset.name).not.toContain('color-scheme');
      expect(html, preset.name).not.toContain('data-ogsc');
      expect(html, preset.name).not.toContain('dm-');
    }
  });

  it('is the flag that decides, not the caller', () => {
    const design = PRESETS[0].build(vee);
    design.body.darkMode = false;
    const off = exportHtml(design);
    design.body.darkMode = true;
    expect(exportHtml(design)).not.toBe(off);
  });
});

/* -------------------------------------------------------------------- on */

describe('dark mode on', () => {
  for (const preset of PRESETS) {
    const design = preset.build(vee);
    const html = exportHtml(design);

    describe(preset.name, () => {
      it('declares both colour schemes', () => {
        expect(html).toContain('<meta name="color-scheme" content="light dark" />');
        expect(html).toContain('<meta name="supported-color-schemes" content="light dark" />');
      });

      it('carries the media query and the Outlook.com selectors', () => {
        expect(html).toContain('@media (prefers-color-scheme: dark){');
        expect(html).toContain('[data-ogsc] ');
        expect(html).toContain('[data-ogsb] ');
      });

      it('stays email-safe and token-free', () => {
        expect(html).not.toContain('brand.');
        expect(html).not.toContain('display:flex');
        expect(html).not.toContain('display:grid');
        expect(html).not.toContain('position:');
        expect(html).toContain('<table role="presentation"');
      });

      it('repaints the page and the content panel', () => {
        // an email whose page and content are the same colour (Cold outreach)
        // gets one class for both, which is right rather than a miss
        expect(html).toMatch(/\.dm-(page|content)\{background-color:/);
        expect(html).toContain('.dm-content{background-color:');
        expect(html).toMatch(/<body class="dm-(page|content)"/);
      });

      it('writes every dark rule with !important, or the inline style would win', () => {
        const from = html.indexOf('@media (prefers-color-scheme: dark)');
        const style = html.slice(from, html.indexOf('</style>'));
        for (const rule of style.match(/\{[^{}]+\}/g) ?? []) {
          expect(rule, rule).toContain('!important');
        }
      });

      it('does not ship the preview-only selector', () => {
        expect(html).not.toContain(DM_PREVIEW_ATTR);
      });
    });
  }

  it('every class it mints has a rule, and every rule is used', () => {
    for (const preset of PRESETS) {
      const html = exportHtml(preset.build(vee));
      const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
      const body = html.slice(html.indexOf('</style>'));

      const defined = new Set((style.match(/\.(dm-[\w-]+)\{/g) ?? []).map((m) => m.slice(1, -1)));
      const used = new Set<string>();
      for (const attr of body.match(/class="[^"]*"/g) ?? []) {
        for (const name of attr.slice(7, -1).split(/\s+/)) {
          if (name.startsWith('dm-')) used.add(name);
        }
      }
      for (const name of used) expect([...defined], `${preset.name}: ${name}`).toContain(name);
      for (const name of defined) {
        expect([...used], `${preset.name}: unused ${name}`).toContain(name);
      }
    }
  });
});

/* ------------------------------------------------------------- logo swap */

describe('logo swap', () => {
  const withLogos = (logoDark: string): Brand => {
    const b = emptyBrand('Logo Co');
    b.id = 'brand_logo';
    b.logo_url = 'https://cdn.example.com/light.png';
    b.logo_dark_url = logoDark;
    return b;
  };

  const headerDesign = () => designWith([mk('header')]);

  it('ships both logos only when the brand has a dark one', () => {
    const brand = withLogos('https://cdn.example.com/dark.png');
    const html = exportHtml(headerDesign(), brand);
    expect(html).toContain('https://cdn.example.com/light.png');
    expect(html).toContain('https://cdn.example.com/dark.png');
    expect(html).toContain(DM_LOGO_LIGHT);
    expect(html).toContain(DM_LOGO_DARK);
    // hidden by default, so a client that ignores the rules shows the light one
    expect(html).toContain('mso-hide:all');
  });

  it('keeps the single logo when there is no dark one', () => {
    const html = exportHtml(headerDesign(), withLogos(''));
    expect(html).toContain('https://cdn.example.com/light.png');
    expect(html).not.toContain(DM_LOGO_LIGHT);
    expect(html).not.toContain(DM_LOGO_DARK);
  });

  it('never swaps when dark support is off', () => {
    const design = headerDesign();
    design.body.darkMode = false;
    const html = exportHtml(design, withLogos('https://cdn.example.com/dark.png'));
    expect(html).not.toContain('https://cdn.example.com/dark.png');
  });
});

/* --------------------------------------------------------------- palette */

describe('the derived palette', () => {
  for (const link of ['#2563EB', '#F58220', '#111111', '#7C3AED', '']) {
    it(`is readable for a ${link || 'missing'} brand link`, () => {
      const b = emptyBrand('X');
      b.tokens.colors.link = link;
      const d = deriveDarkColors(b.tokens.colors);
      expect(round2(contrastRatio(d.text, d.content_bg)!)).toBeGreaterThanOrEqual(4.5);
      expect(round2(contrastRatio(d.link, d.content_bg)!)).toBeGreaterThanOrEqual(4.5);
      expect(paletteReadable(d).ok).toBe(true);
    });
  }

  it('gives the button a label that reads on it', () => {
    for (const primary of ['#F58220', '#111111', '#FFFFFF', '#2563EB']) {
      const b = emptyBrand('X');
      b.tokens.colors.primary = primary;
      const d = deriveDarkColors(b.tokens.colors);
      expect(round2(contrastRatio(d.button_text, d.button_bg)!), primary).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back key by key when a brand fills in only some of it', () => {
    const b = emptyBrand('Half');
    b.darkTokens = {
      page_bg: '#000000',
      content_bg: '',
      text: '',
      muted: '',
      link: '',
      border: '',
      button_bg: '',
      button_text: '',
    };
    const d = darkColors(b);
    expect(d.page_bg).toBe('#000000');
    expect(d.content_bg).toBe(deriveDarkColors(b.tokens.colors).content_bg);
  });

  it('maps the strong-text token, or headings would vanish', () => {
    for (const brand of [vee, emptyBrand('Plain')]) {
      const dark = darkBrand(brand);
      // near-black in most kits; it must not stay near-black on a dark panel
      const ratio = contrastRatio(dark.tokens.colors.secondary, dark.tokens.colors.content_bg);
      expect(round2(ratio!), brand.name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/* --------------------------------------------------- hex vs brand token */

describe('what moves in dark mode and what does not', () => {
  it('leaves a hand-typed hex exactly where it was', () => {
    const heading = mk('heading');
    heading.values.color = '#8B0000'; // nobody's brand token
    const dark = darkResolved(designWith([heading]), vee);
    const out = dark.rows[0].columns[0].blocks[0] as BlockOf<'heading'>;
    expect(out.values.color).toBe('#8B0000');
  });

  it('moves a colour that came from the brand', () => {
    const heading = mk('heading');
    heading.values.color = 'brand.text';
    const dark = darkResolved(designWith([heading]), vee);
    const out = dark.rows[0].columns[0].blocks[0] as BlockOf<'heading'>;
    expect(out.values.color).toBe(darkColors(vee).text);
  });

  it('honours a per-block dark override above both', () => {
    const heading = mk('heading');
    heading.values.color = '#8B0000';
    heading.values.dark = { textColor: '#FFD700' };
    const dark = darkResolved(designWith([heading]), vee);
    const out = dark.rows[0].columns[0].blocks[0] as BlockOf<'heading'>;
    expect(out.values.color).toBe('#FFD700');
    // and the override reaches the stylesheet
    expect(exportHtml(designWith([heading]))).toContain('#FFD700 !important');
  });

  it('honours a per-row dark background', () => {
    const design = designWith([mk('heading')]);
    design.rows[0].dark = { bgColor: '#003300' };
    expect(darkResolved(design, vee).rows[0].contentBgColor).toBe('#003300');
    expect(exportHtml(design)).toContain('#003300 !important');
  });

  it('does not let a surface colour used as a label follow the surface', () => {
    // `brand.content_bg` is how the presets write "white text on the brand
    // colour"; in dark mode that must become a label that reads, not #1E1E1E
    const button = mk('button');
    button.values.bgColor = 'brand.primary';
    button.values.color = 'brand.content_bg';
    const dark = darkResolved(designWith([button]), vee);
    const out = dark.rows[0].columns[0].blocks[0] as BlockOf<'button'>;
    expect(out.values.color).toBe(darkColors(vee).button_text);
    expect(round2(contrastRatio(out.values.color, out.values.bgColor)!)).toBeGreaterThanOrEqual(3);
  });
});

/* --------------------------------------------------------------- preview */

describe('the dark preview', () => {
  it('forces the same rules through an attribute, with no second renderer', () => {
    const design = PRESETS[0].build(vee);
    const dark = exportHtml(design, vee, true);
    expect(dark).toContain(`<html lang="en" ${DM_PREVIEW_ATTR}="1"`);
    expect(dark).toContain(`[${DM_PREVIEW_ATTR}] .dm-content{`);
    // the rules themselves are the export's, not a copy
    expect(dark).toContain('@media (prefers-color-scheme: dark){');
  });

  it('leaves the light preview alone', () => {
    const design = PRESETS[0].build(vee);
    expect(exportHtml(design, vee, false)).not.toContain(DM_PREVIEW_ATTR);
  });
});

/* ---------------------------------------------------------------- checks */

describe('the checks engine in dark mode', () => {
  const run = (design: Design, brand: Brand = vee) => {
    const out = resolveForOutput(design, brand, 'export');
    const html = renderDesign(out.design, darkRenderOpts(design, brand));
    return checkDesign(out.design, html, brand, {
      darkDesign: design.body.darkMode ? darkResolved(design, brand) : undefined,
    });
  };
  const codes = (design: Design, brand?: Brand) => run(design, brand).map((i) => i.code);

  it('flags a hand-typed colour that only fails in the dark', () => {
    const heading = mk('heading');
    heading.values.color = '#111111'; // perfect on white, invisible on #1E1E1E
    const design = designWith([heading], { contentBgColor: 'brand.content_bg' });
    const found = run(design);
    expect(found.map((i) => i.code)).toContain('CONTRAST_TEXT_DARK');
    const issue = found.find((i) => i.code === 'CONTRAST_TEXT_DARK')!;
    expect(issue.severity).toBe('error');
    expect(issue.message).toMatch(/In dark mode/);
    expect(issue.blockId).toBe(heading.id);
  });

  it('says nothing about it when dark support is off', () => {
    const heading = mk('heading');
    heading.values.color = '#111111';
    const design = designWith([heading], { contentBgColor: 'brand.content_bg', darkMode: false });
    expect(codes(design)).not.toContain('CONTRAST_TEXT_DARK');
  });

  it('gives dark issues stable ids', () => {
    const heading = mk('heading');
    heading.values.color = '#111111';
    const design = designWith([heading], { contentBgColor: 'brand.content_bg' });
    const first = run(design).find((i) => i.code === 'CONTRAST_TEXT_DARK')!;
    const second = run(design).find((i) => i.code === 'CONTRAST_TEXT_DARK')!;
    expect(first.id).toBe(second.id);
    expect(first.id).toContain(heading.id);
  });

  it('notes a brand with no dark logo', () => {
    const brand = emptyBrand('No Dark Logo');
    brand.id = 'brand_nodark';
    brand.logo_url = 'https://cdn.example.com/light.png';
    const found = run(designWith([mk('header')]), brand);
    const issue = found.find((i) => i.code === 'DARK_NO_LOGO')!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('info');
    expect(issue.message).toContain('No Dark Logo');
  });

  it('stays quiet once the brand has one', () => {
    const brand = emptyBrand('Has One');
    brand.logo_url = 'https://cdn.example.com/light.png';
    brand.logo_dark_url = 'https://cdn.example.com/dark.png';
    expect(codes(designWith([mk('header')]), brand)).not.toContain('DARK_NO_LOGO');
  });

  it('asks for a manual check on a hero background image', () => {
    const hero = mk('hero');
    hero.values.layout = 'centered';
    hero.values.bgImage = 'https://cdn.example.com/bg.jpg';
    expect(codes(designWith([hero]))).toContain('DARK_IMAGE_MANUAL');
  });

  it('warns when the dark machinery costs more than 3 KB', () => {
    const design = designWith([mk('heading')]);
    const out = resolveForOutput(design, vee, 'export');
    const html = renderDesign(out.design, darkRenderOpts(design, vee));
    const quiet = checkDesign(out.design, html, vee, {
      darkDesign: darkResolved(design, vee),
      darkOverheadBytes: 2000,
    });
    expect(quiet.map((i) => i.code)).not.toContain('SIZE_DARK_OVERHEAD');

    const loud = checkDesign(out.design, html, vee, {
      darkDesign: darkResolved(design, vee),
      darkOverheadBytes: 5000,
    });
    expect(loud.map((i) => i.code)).toContain('SIZE_DARK_OVERHEAD');
  });

  it('keeps every preset free of dark contrast errors with the Vee brand', () => {
    for (const preset of PRESETS) {
      const found = codes(preset.build(vee));
      expect(found, preset.name).not.toContain('CONTRAST_TEXT_DARK');
      expect(found, preset.name).not.toContain('CONTRAST_BUTTON_DARK');
      expect(found, preset.name).not.toContain('CONTRAST_LINK_DARK');
    }
  });
});

/* ------------------------------------------------------------- migration */

describe('loading what was saved before 3B', () => {
  it('reads a brand with no dark palette and no version', () => {
    const legacy = { ...veeBrand() } as Record<string, unknown>;
    delete legacy.darkTokens;
    delete legacy.schemaVersion;
    const brand = normalizeBrand(legacy)!;
    expect(brand.darkTokens).toBeNull();
    expect(brand.schemaVersion).toBe(1);
    // and it still has a working palette
    expect(paletteReadable(darkColors(brand)).ok).toBe(true);
  });

  it('round-trips a brand that has one', () => {
    const brand = emptyBrand('Dark Co');
    brand.darkTokens = deriveDarkColors(brand.tokens.colors);
    const again = normalizeBrand(JSON.parse(JSON.stringify(brand)))!;
    expect(again.darkTokens).toEqual(brand.darkTokens);
    // BRAND_SCHEMA_VERSION bumped 2 -> 3 in 6A (added `voice`); a freshly-built
    // brand round-trips at the current version, not the version this test was
    // first written against.
    expect(again.schemaVersion).toBe(3);
  });

  it('gives an email saved before 3B dark support rather than silence', () => {
    const legacy = {
      version: 1,
      body: { title: 'Old email' },
      rows: [{ layout: [1], columns: [{ blocks: [{ type: 'heading', values: { text: 'Hi' } }] }] }],
    };
    expect(normalizeDesign(legacy)!.body.darkMode).toBe(true);
  });

  it('keeps a per-row dark override through a round trip', () => {
    const design = designWith([mk('heading')]);
    design.rows[0].dark = { bgColor: '#003300' };
    const again = normalizeDesign(JSON.parse(JSON.stringify(design)))!;
    expect(again.rows[0].dark).toEqual({ bgColor: '#003300' });
  });
});
