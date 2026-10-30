import { describe, expect, it } from 'vitest';
import { veeBrand } from '../lib/brand';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import {
  VERY_LARGE_WIDTH,
  auditDesignImages,
  collectImages,
  groupProblems,
  resolutionNote,
} from '../lib/image-audit';
import { resolvedDesign } from '../lib/output';
import { PRESETS } from '../lib/presets';
import type { Block, Design } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;

function designWith(blocks: Block[], columns = 1): Design {
  const d = emptyDesign();
  const row = createRow(Array.from({ length: columns }, () => 1));
  row.columns[0].blocks = blocks;
  d.rows.push(row);
  return d;
}

const urls = (d: Design) => collectImages(d).map((u) => u.url);
const fields = (d: Design) => collectImages(d).map((u) => u.field);

/* ------------------------------------------------------------- collection */

describe('collectImages', () => {
  it('finds the Image block source', () => {
    const b = mk('image');
    b.values.src = 'https://a.test/photo.png';
    const [use] = collectImages(designWith([b]));
    expect(use.url).toBe('https://a.test/photo.png');
    expect(use.label).toBe('Image');
    expect(use.blockId).toBe(b.id);
  });

  it('finds the hero image AND the hero background, which the HTML audit misses', () => {
    const b = mk('hero');
    b.values.imageSrc = 'https://a.test/hero.png';
    b.values.bgImage = 'https://a.test/bg.jpg';
    expect(fields(designWith([b]))).toEqual(['imageSrc', 'bgImage']);
  });

  it('finds every hero card for the chosen layout only', () => {
    const b = mk('hero');
    b.values.layout = 'cards-2';
    b.values.imageSrc = '';
    b.values.cards = [
      { ...b.values.cards[0], id: 'c1', imageSrc: 'https://a.test/1.png' },
      { ...b.values.cards[0], id: 'c2', imageSrc: 'https://a.test/2.png' },
      { ...b.values.cards[0], id: 'c3', imageSrc: 'https://a.test/3.png' },
    ];
    // cards-2 renders two, so the third is not in the email
    expect(urls(designWith([b]))).toEqual(['https://a.test/1.png', 'https://a.test/2.png']);
  });

  it('finds article thumbnails, but not in the text-only layout', () => {
    const b = mk('articles');
    b.values.items = b.values.items.map((i, n) => ({ ...i, imageSrc: `https://a.test/${n}.png` }));
    expect(urls(designWith([b]))).toHaveLength(2);

    b.values.layout = 'text-only';
    expect(urls(designWith([b]))).toHaveLength(0);
  });

  it('finds the header and footer logos', () => {
    const header = mk('header');
    header.values.logoSrc = 'https://a.test/logo.png';
    const footer = mk('footer');
    footer.values.logoSrc = 'https://a.test/logo-dark.png';
    expect(collectImages(designWith([header, footer])).map((u) => u.label)).toEqual([
      'Header logo',
      'Footer logo',
    ]);
  });

  it('finds the two fields the HTML audit never covered: social icons and video thumbnails', () => {
    const social = mk('social');
    social.values.items = [
      { id: 's1', network: 'linkedin', href: 'https://x.test', iconUrl: 'https://a.test/in.png' },
    ];
    const video = mk('video');
    video.values.thumbnail = 'https://a.test/thumb.jpg';

    const labels = collectImages(designWith([social, video])).map((u) => u.label);
    expect(labels).toContain('Social icon 1');
    expect(labels).toContain('Video thumbnail');
  });

  it('skips empty fields entirely', () => {
    const b = mk('hero');
    b.values.imageSrc = '';
    b.values.bgImage = '';
    expect(collectImages(designWith([b]))).toHaveLength(0);
  });

  it('halves the display width in a two-column row', () => {
    const b = mk('image');
    b.values.src = 'https://a.test/a.png';
    b.values.width = 100;
    const one = collectImages(designWith([b]))[0];
    const two = collectImages(designWith([b], 2))[0];
    expect(two.displayWidth).toBeLessThan(one.displayWidth);
  });

  it('runs over the resolved design, so a brand logo token is checked as its real URL', () => {
    const brand = veeBrand();
    brand.logo_url = 'https://cdn.example.com/vee.png';
    const header = mk('header'); // logoSrc defaults to 'brand.logo'
    const design = designWith([header]);
    const [use] = collectImages(resolvedDesign(design, brand, 'export'));
    expect(use.url).toBe('https://cdn.example.com/vee.png');
    // the block id survives resolution, so jump-to-block still lands
    expect(use.blockId).toBe(header.id);
  });
});

/* --------------------------------------------------------------- problems */

describe('auditDesignImages', () => {
  const useWith = (patch: Partial<ReturnType<typeof collectImages>[number]>) => ({
    blockId: 'blk_1',
    blockType: 'image' as const,
    field: 'src',
    label: 'Image',
    url: 'https://a.test/ok.png',
    alt: 'Fine',
    displayWidth: 600,
    ...patch,
  });

  it('is quiet about a well-formed image', () => {
    expect(auditDesignImages([useWith({})])).toEqual([]);
  });

  it('flags http, data:, missing alt and placeholders', () => {
    const problems = auditDesignImages([
      useWith({ url: 'http://a.test/x.png' }),
      useWith({ url: 'data:image/png;base64,AAAA' }),
      useWith({ alt: '   ' }),
      useWith({ url: 'https://picsum.photos/seed/x/600/300' }),
    ]);
    const kinds = problems.map((p) => p.kind);
    expect(kinds).toContain('not-https');
    expect(kinds).toContain('embedded');
    expect(kinds).toContain('missing-alt');
    expect(kinds).toContain('placeholder');
  });

  it('only calls an image broken when it has actually been probed', () => {
    const use = useWith({});
    expect(auditDesignImages([use])).toEqual([]);
    expect(auditDesignImages([use], new Map([[use.url, 'ok']]))).toEqual([]);

    const broken = auditDesignImages([use], new Map([[use.url, 'broken']]));
    expect(broken.map((p) => p.kind)).toEqual(['broken']);
  });

  it('never asks for alt on a field that has none', () => {
    // hero background, social icon and logos carry no alt of their own
    expect(auditDesignImages([useWith({ alt: null })])).toEqual([]);
  });

  it('leaves merge tags alone', () => {
    expect(auditDesignImages([useWith({ url: '{{hero_image_url}}', alt: 'x' })])).toEqual([]);
    expect(auditDesignImages([useWith({ url: '*|HERO|*', alt: 'x' })])).toEqual([]);
  });

  it('reports both problems when an image is placeholder AND missing alt', () => {
    const problems = auditDesignImages([
      useWith({ url: 'https://picsum.photos/seed/a/60/60', alt: '' }),
    ]);
    expect(problems.map((p) => p.kind).sort()).toEqual(['missing-alt', 'placeholder']);
  });

  it('groups by kind, worst first', () => {
    const grouped = groupProblems(
      auditDesignImages([
        useWith({ alt: '' }),
        useWith({ url: 'data:image/png;base64,AA' }),
      ]),
    );
    expect(grouped[0][0]).toBe('embedded');
  });
});

/* ------------------------------------------------------------- resolution */

describe('resolutionNote', () => {
  it('flags an image below twice its displayed width', () => {
    expect(resolutionNote(500, 300)?.kind).toBe('low-res');
    // exactly 2x is fine
    expect(resolutionNote(600, 300)).toBeNull();
    expect(resolutionNote(1200, 300)).toBeNull();
  });

  it('flags a very large image', () => {
    expect(resolutionNote(VERY_LARGE_WIDTH + 1, 600)?.kind).toBe('very-large');
    expect(resolutionNote(VERY_LARGE_WIDTH, 600)).toBeNull();
  });

  it('says nothing when the size is unknown', () => {
    expect(resolutionNote(0, 600)).toBeNull();
    expect(resolutionNote(500, 0)).toBeNull();
  });
});

/* ---------------------------------------------------------------- presets */

describe('the presets, through the new audit', () => {
  it('flags their placeholder art and nothing worse', () => {
    const brand = veeBrand();
    for (const preset of PRESETS) {
      const design = resolvedDesign(preset.build(brand), brand, 'export');
      const problems = auditDesignImages(collectImages(design));
      const kinds = new Set(problems.map((p) => p.kind));
      expect(kinds.has('embedded'), preset.name).toBe(false);
      expect(kinds.has('not-https'), preset.name).toBe(false);
    }
  });

  it('finds the placeholders the Newsletter preset ships with', () => {
    const brand = veeBrand();
    const design = resolvedDesign(
      PRESETS.find((p) => p.id === 'newsletter')!.build(brand),
      brand,
      'export',
    );
    const problems = auditDesignImages(collectImages(design));
    expect(problems.filter((p) => p.kind === 'placeholder').length).toBeGreaterThan(0);
    // and each one knows which block to jump to
    for (const p of problems) expect(p.use.blockId).toBeTruthy();
  });

  it('finds no images at all in the Cold outreach preset', () => {
    const brand = veeBrand();
    const design = resolvedDesign(
      PRESETS.find((p) => p.id === 'cold-outreach')!.build(brand),
      brand,
      'export',
    );
    expect(collectImages(design)).toHaveLength(0);
  });
});
