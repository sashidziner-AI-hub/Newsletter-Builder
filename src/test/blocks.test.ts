import { beforeEach, describe, expect, it } from 'vitest';
import { emptyBrand, resolveDesign, veeBrand } from '../lib/brand';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { normalizeDesign } from '../lib/design-ops';
import { renderDesign } from '../lib/render';
import { useEditor } from '../store';
import type { Block, Brand, BlockType, Design, HeroValues } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;

const vee = veeBrand();

/** A brand with a logo and social links, so header/footer have everything. */
function fullBrand(): Brand {
  const b = emptyBrand('Acme Health');
  b.id = 'brand_acme';
  b.logo_url = 'https://cdn.example.com/acme.png';
  b.tokens.colors.primary = '#0D9488';
  b.tokens.colors.secondary = '#042F2E';
  b.tokens.colors.text = '#0F172A';
  b.tokens.colors.link = '#0D9488';
  b.tokens.colors.border = '#CCFBF1';
  b.footer = {
    address: '12 Example Street, Chennai 600001',
    legal_text: '© 2026 Acme Health. All rights reserved.',
    unsubscribe_text: 'Unsubscribe from these emails',
  };
  b.social_links = [
    { id: 'sl1', network: 'linkedin', url: 'https://linkedin.com/company/acme' },
    { id: 'sl2', network: 'youtube', url: 'https://youtube.com/@acme' },
  ];
  return b;
}

function designWith(blocks: Block[], brandId: string | null = null): Design {
  const d = emptyDesign();
  d.brandId = brandId;
  const row = createRow([1]);
  row.columns[0].blocks = blocks;
  d.rows.push(row);
  return d;
}

const exportHtml = (blocks: Block[], brand: Brand = vee) =>
  renderDesign(resolveDesign(designWith(blocks), brand, 'export'));

const NEW_BLOCKS: BlockType[] = ['header', 'hero', 'articles', 'footer'];

const HERO_LAYOUTS: HeroValues['layout'][] = [
  'image-right',
  'image-left',
  'centered',
  'cards-2',
  'cards-3',
];

/* --------------------------------------------------------- email safety */

describe('email-safe output', () => {
  /** Every layout of every new block, against the house rules. */
  const cases: { name: string; blocks: Block[] }[] = [
    ...NEW_BLOCKS.map((t) => ({ name: t, blocks: [createBlock(t)] })),
    ...(['logo-left', 'logo-center'] as const).map((layout) => {
      const b = mk('header');
      b.values.layout = layout;
      return { name: `header/${layout}`, blocks: [b] };
    }),
    ...HERO_LAYOUTS.map((layout) => {
      const b = mk('hero');
      b.values.layout = layout;
      if (layout === 'cards-3') b.values.cards = [...b.values.cards, { ...b.values.cards[0], id: 'c3' }];
      if (layout === 'centered') b.values.bgImage = 'https://cdn.example.com/bg.jpg';
      return { name: `hero/${layout}`, blocks: [b] };
    }),
    ...(['thumb-left', 'thumb-top', 'text-only'] as const).map((layout) => {
      const b = mk('articles');
      b.values.layout = layout;
      return { name: `articles/${layout}`, blocks: [b] };
    }),
  ];

  for (const c of cases) {
    it(`${c.name}: no flex/grid/position, no tokens, table-based`, () => {
      const html = exportHtml(c.blocks, fullBrand());
      expect(html).not.toContain('display:flex');
      expect(html).not.toContain('display:grid');
      expect(html).not.toContain('position:');
      expect(html).not.toContain('brand.');
      expect(html).toContain('<table role="presentation"');
    });

    it(`${c.name}: every image has alt, width and border="0"`, () => {
      const html = exportHtml(c.blocks, fullBrand());
      const imgs = html.match(/<img\b[^>]*>/g) ?? [];
      for (const img of imgs) {
        expect(img, img).toMatch(/\salt="/);
        expect(img, img).toMatch(/\swidth="\d+"/);
        expect(img, img).toContain('border="0"');
        expect(img, img).toContain('display:block');
      }
    });

    it(`${c.name}: every href is https or a merge tag`, () => {
      const html = exportHtml(c.blocks, fullBrand());
      const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(/^https:\/\//.test(href) || /^\{\{.*\}\}$/.test(href), href).toBe(true);
      }
    });
  }

  it('hero cards use stacking cells so they collapse on mobile', () => {
    const b = mk('hero');
    b.values.layout = 'cards-3';
    b.values.cards = [...b.values.cards, { ...b.values.cards[0], id: 'c3' }];
    const html = exportHtml([b]);
    // three stacking cells, and the media query that stacks them
    expect((html.match(/class="eb-col"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('.eb-col{display:block !important');
  });

  it('thumb-left articles use stacking cells', () => {
    const b = mk('articles');
    b.values.layout = 'thumb-left';
    const html = exportHtml([b]);
    expect(html).toContain('class="eb-col"');
  });

  it('the hero centered background image falls back to a colour for Outlook', () => {
    const b = mk('hero');
    b.values.layout = 'centered';
    b.values.bgImage = 'https://cdn.example.com/bg.jpg';
    b.values.bgColor = '#151515';
    const html = exportHtml([b]);
    expect(html).toContain('background="https://cdn.example.com/bg.jpg"');
    expect(html).toContain('bgcolor="#151515"');
  });

  it('keeps the unsubscribe merge tag verbatim', () => {
    const html = exportHtml([createBlock('footer')], fullBrand());
    expect(html).toContain('href="{{unsubscribe_url}}"');
  });

  it('reuses the bulletproof button for the hero CTA', () => {
    const html = exportHtml([createBlock('hero')]);
    expect(html).toContain('mso-padding-alt:');
  });

  it('nav hidden on mobile uses the hide class, not a second markup path', () => {
    const b = mk('header');
    b.values.hideNavOnMobile = true;
    const html = exportHtml([b]);
    expect(html).toContain('eb-hide-mobile');
    expect(html).toContain('.eb-hide-mobile{display:none !important;}');
  });
});

/* -------------------------------------------------------- brand awareness */

describe('brand awareness', () => {
  it('re-themes all four blocks and keeps hex overrides', () => {
    const header = mk('header');
    const hero = mk('hero');
    hero.values.headingColor = '#ABCDEF'; // manual override
    const articles = mk('articles');
    const footer = mk('footer');
    const blocks = [header, hero, articles, footer];

    const veeHtml = exportHtml(blocks, vee);
    const acmeHtml = exportHtml(blocks, fullBrand());

    expect(veeHtml).toContain('#F58220');
    expect(acmeHtml).toContain('#0D9488');
    expect(acmeHtml).not.toContain('#F58220');

    // the override is untouched by the switch
    expect(veeHtml).toContain('#ABCDEF');
    expect(acmeHtml).toContain('#ABCDEF');

    expect(veeHtml).not.toContain('brand.');
    expect(acmeHtml).not.toContain('brand.');
  });

  it('header shows the brand name as text when the brand has no logo', () => {
    const html = exportHtml([createBlock('header')], vee); // seeded Vee has no logo_url
    expect(html).toContain('Vee Technologies');
    expect(html).not.toContain('<img');
  });

  it('header uses the brand logo when there is one', () => {
    const html = exportHtml([createBlock('header')], fullBrand());
    expect(html).toContain('src="https://cdn.example.com/acme.png"');
    expect(html).not.toContain('Acme Health</div>');
  });

  it('footer pulls address, legal and unsubscribe text from the brand', () => {
    const html = exportHtml([createBlock('footer')], fullBrand());
    expect(html).toContain('12 Example Street, Chennai 600001');
    expect(html).toContain('© 2026 Acme Health. All rights reserved.');
    expect(html).toContain('Unsubscribe from these emails');
  });

  it('a per-email override beats the brand footer text', () => {
    const footer = mk('footer');
    footer.values.legalText = 'Custom legal line for this send';
    const html = exportHtml([footer], fullBrand());
    expect(html).toContain('Custom legal line for this send');
    expect(html).not.toContain('All rights reserved');
  });

  it('footer social icons follow the brand list', () => {
    const html = exportHtml([createBlock('footer')], fullBrand());
    expect(html).toContain('https://linkedin.com/company/acme');
    expect(html).toContain('https://youtube.com/@acme');
  });

  it('footer social can be overridden per email', () => {
    const footer = mk('footer');
    footer.values.useBrandSocial = false;
    footer.values.socialItems = [
      { id: 'x1', network: 'x', href: 'https://x.com/acme', iconUrl: '' },
    ];
    const html = exportHtml([footer], fullBrand());
    expect(html).toContain('https://x.com/acme');
    expect(html).not.toContain('linkedin.com/company/acme');
  });
});

/* ------------------------------------------------------------ show footer */

describe('Show footer switch', () => {
  it('drops footer blocks from the export but keeps the rest', () => {
    const design = designWith([createBlock('header'), createBlock('footer')]);
    design.body.showFooter = false;
    const html = renderDesign(resolveDesign(design, fullBrand(), 'export'));
    expect(html).not.toContain('{{unsubscribe_url}}');
    // the header is still there
    expect(html).toContain('https://cdn.example.com/acme.png');
  });

  it('keeps footer blocks in the export when on', () => {
    const design = designWith([createBlock('footer')]);
    expect(design.body.showFooter).toBe(true);
    const html = renderDesign(resolveDesign(design, fullBrand(), 'export'));
    expect(html).toContain('{{unsubscribe_url}}');
  });

  it('defaults to on for designs saved before 1B', () => {
    const legacy = {
      version: 1,
      body: { title: 'Old email' },
      rows: [{ layout: [1], columns: [{ blocks: [{ type: 'heading', values: { text: 'Hi' } }] }] }],
    };
    const design = normalizeDesign(legacy);
    expect(design?.body.showFooter).toBe(true);
  });
});

/* --------------------------------------------------------------- repeaters */

describe('repeater data', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditor.setState({ brands: [vee, fullBrand()] });
    useEditor.getState().resetDesign();
  });

  const articlesBlock = () => {
    const st = useEditor.getState();
    const rowId = st.addRow([1]);
    const colId = useEditor.getState().design.rows.find((r) => r.id === rowId)!.columns[0].id;
    const id = useEditor.getState().addBlock('articles', colId)!;
    return id;
  };

  const items = (id: string) => {
    const block = useEditor
      .getState()
      .design.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
      .find((b) => b.id === id) as BlockOf<'articles'>;
    return block.values.items;
  };

  it('add, remove and reorder keep every item field intact', () => {
    const id = articlesBlock();
    const start = items(id);
    expect(start).toHaveLength(2);
    const [first, second] = start;

    // add
    const third = { ...first, id: 'ai_three', title: 'Third article' };
    useEditor.getState().updateBlock(id, { items: [...start, third] });
    expect(items(id)).toHaveLength(3);

    // reorder: swap the first two, as the panel's move-up does
    const cur = items(id);
    useEditor.getState().updateBlock(id, { items: [cur[1], cur[0], cur[2]] });
    const moved = items(id);
    expect(moved[0]).toEqual(second);
    expect(moved[1]).toEqual(first);
    expect(moved[2].title).toBe('Third article');

    // remove the middle one, the others survive untouched
    useEditor.getState().updateBlock(id, { items: moved.filter((_, i) => i !== 1) });
    const left = items(id);
    expect(left).toHaveLength(2);
    expect(left[0]).toEqual(second);
    expect(left[1].title).toBe('Third article');
  });

  it('renders at most 10 article items', () => {
    const block = mk('articles');
    const base = block.values.items[0];
    block.values.items = Array.from({ length: 14 }, (_, i) => ({
      ...base,
      id: `ai_${i}`,
      title: `Article ${i}`,
    }));
    const html = exportHtml([block]);
    expect(html).toContain('Article 9');
    expect(html).not.toContain('Article 10');
  });

  it('hero card count follows the layout', () => {
    const b = mk('hero');
    b.values.layout = 'cards-2';
    b.values.cards = [
      { ...b.values.cards[0], id: 'c1', title: 'One' },
      { ...b.values.cards[0], id: 'c2', title: 'Two' },
      { ...b.values.cards[0], id: 'c3', title: 'Three' },
    ];
    // cards-2 renders only the first two, even if a third is stored
    const html = exportHtml([b]);
    expect(html).toContain('One');
    expect(html).toContain('Two');
    expect(html).not.toContain('Three');
  });
});

/* ------------------------------------------------------------- round trip */

describe('persistence', () => {
  it('survives a JSON round trip through normalizeDesign', () => {
    const design = designWith(NEW_BLOCKS.map((t) => createBlock(t)));
    const back = normalizeDesign(JSON.parse(JSON.stringify(design)));
    expect(back).not.toBeNull();
    const types = back!.rows[0].columns[0].blocks.map((b) => b.type);
    expect(types).toEqual(['header', 'hero', 'articles', 'footer']);

    const html = renderDesign(resolveDesign(back!, fullBrand(), 'export'));
    expect(html).not.toContain('brand.');
    expect(html).toContain('{{unsubscribe_url}}');
  });
});
