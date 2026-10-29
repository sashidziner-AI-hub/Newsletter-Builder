import { beforeEach, describe, expect, it } from 'vitest';
import { emptyBrand, veeBrand } from '../lib/brand';
import {
  exportEnvelope,
  groupByCategory,
  hasDataUri,
  instantiate,
  labelFor,
  makeSavedBlock,
  normalizeSavedBlock,
  planImport,
  previewRow,
  searchBlocks,
  UNCATEGORISED,
  type SavedBlock,
} from '../lib/blocks-library';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { resolvedDesign } from '../lib/output';
import { renderDesign } from '../lib/render';
import { listSavedBlocks } from '../lib/storage';
import { useEditor } from '../store';
import type { Block, Brand, Row } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;
const vee = veeBrand();

function acme(): Brand {
  const b = emptyBrand('Acme Health');
  b.id = 'brand_acme';
  b.tokens.colors.primary = '#0D9488';
  b.tokens.colors.content_bg = '#FFFFFF';
  // emptyBrand() copies the seed palette, so override every colour that would
  // otherwise still resolve to a Vee value
  b.tokens.colors.link = '#0D9488';
  b.tokens.colors.secondary = '#042F2E';
  b.tokens.colors.text = '#0F172A';
  b.tokens.colors.border = '#CCFBF1';
  b.tokens.colors.page_bg = '#ECFDF5';
  b.tokens.colors.muted = '#64748B';
  b.tokens.colors.accent = '#14B8A6';
  return b;
}

/** A CTA band: the acceptance-test shape — a row with brand-token colours. */
function ctaBand(): Row {
  const row = createRow([1]);
  row.bgColor = 'brand.primary';
  const heading = mk('heading');
  heading.values.text = 'Want this monthly?';
  heading.values.color = 'brand.content_bg';
  const button = mk('button');
  button.values.bgColor = 'brand.content_bg';
  button.values.color = '#123456'; // a hand-set override
  row.columns[0].blocks.push(heading, button);
  return row;
}

const render = (payload: Block | Row, brand: Brand) => {
  const design = emptyDesign();
  const saved = makeSavedBlock('x', '', 'bgColor' in payload ? 'row' : 'block', payload);
  design.rows = [previewRow(saved)];
  return renderDesign(resolvedDesign(design, brand, 'export'));
};

/* ------------------------------------------------------------ fresh copies */

describe('inserting makes an independent copy', () => {
  it('regenerates every id, including nested repeater items', () => {
    // a Hero with cards and an Article list exercise the hc/ai prefixes that
    // cloneWithNewIds did not cover before 2B
    const hero = mk('hero');
    hero.values.layout = 'cards-2';
    const saved = makeSavedBlock('Hero', 'Banner', 'block', hero);

    const a = instantiate(saved) as BlockOf<'hero'>;
    const b = instantiate(saved) as BlockOf<'hero'>;

    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toBe((saved.payload as Block).id);
    const aCards = a.values.cards.map((c) => c.id);
    const bCards = b.values.cards.map((c) => c.id);
    expect(aCards.some((id) => bCards.includes(id))).toBe(false);
  });

  it('refreshes article item and nav link ids too', () => {
    const articles = makeSavedBlock('Articles', '', 'block', mk('articles'));
    const a = instantiate(articles) as BlockOf<'articles'>;
    const b = instantiate(articles) as BlockOf<'articles'>;
    expect(a.values.items.map((i) => i.id)).not.toEqual(b.values.items.map((i) => i.id));

    const header = makeSavedBlock('Header', '', 'block', mk('header'));
    const h1 = instantiate(header) as BlockOf<'header'>;
    const h2 = instantiate(header) as BlockOf<'header'>;
    expect(h1.values.navLinks.map((l) => l.id)).not.toEqual(h2.values.navLinks.map((l) => l.id));
  });

  it('refreshes row and column ids for a saved row', () => {
    const saved = makeSavedBlock('CTA', 'CTA', 'row', ctaBand());
    const a = instantiate(saved) as Row;
    const b = instantiate(saved) as Row;
    expect(a.id).not.toBe(b.id);
    expect(a.columns[0].id).not.toBe(b.columns[0].id);
    expect(a.columns[0].blocks[0].id).not.toBe(b.columns[0].blocks[0].id);
  });

  it('editing the copy leaves the saved block untouched', () => {
    const saved = makeSavedBlock('CTA', 'CTA', 'row', ctaBand());
    const before = JSON.stringify(saved.payload);

    const copy = instantiate(saved) as Row;
    copy.bgColor = '#FF0000';
    (copy.columns[0].blocks[0] as BlockOf<'heading'>).values.text = 'Rewritten';
    copy.columns[0].blocks.pop();

    expect(JSON.stringify(saved.payload)).toBe(before);
    expect(JSON.stringify(saved.payload)).toContain('brand.primary');
    expect(JSON.stringify(saved.payload)).not.toContain('Rewritten');
  });
});

/* ------------------------------------------------------- brand awareness */

describe('brand tokens survive in the library', () => {
  it('stores tokens as tokens and overrides as hex', () => {
    const saved = makeSavedBlock('CTA', 'CTA', 'row', ctaBand());
    const json = JSON.stringify(saved.payload);
    expect(json).toContain('brand.primary');
    expect(json).toContain('brand.content_bg');
    expect(json).toContain('#123456');
  });

  it('re-themes to whichever brand is active, keeping the override', () => {
    const band = ctaBand();
    const veeHtml = render(band, vee);
    const acmeHtml = render(band, acme());

    expect(veeHtml).toContain('#F58220');
    expect(acmeHtml).toContain('#0D9488');
    expect(acmeHtml).not.toContain('#F58220');

    // the hand-set colour is identical under both brands
    expect(veeHtml).toContain('#123456');
    expect(acmeHtml).toContain('#123456');
    // and no token leaks into the export
    expect(acmeHtml).not.toContain('brand.');
  });
});

/* ---------------------------------------------------------- data URI warning */

describe('hasDataUri', () => {
  it('spots an uploaded image in the payload', () => {
    const image = mk('image');
    image.values.src = 'data:image/png;base64,AAAA';
    expect(hasDataUri(image)).toBe(true);
  });

  it('passes a hosted URL', () => {
    const image = mk('image');
    image.values.src = 'https://cdn.example.com/a.png';
    expect(hasDataUri(image)).toBe(false);
  });
});

/* --------------------------------------------------------------- grouping */

describe('grouping, search and labels', () => {
  const blocks = [
    makeSavedBlock('Orange CTA', 'CTA', 'row', ctaBand()),
    makeSavedBlock('Signature', 'Signature', 'block', mk('text')),
    makeSavedBlock('Loose block', '', 'block', mk('button')),
  ];

  it('groups by category with Uncategorised last', () => {
    const groups = groupByCategory(blocks);
    expect(groups.map(([k]) => k)).toEqual(['CTA', 'Signature', UNCATEGORISED]);
  });

  it('searches name, category and kind label', () => {
    expect(searchBlocks(blocks, 'orange')).toHaveLength(1);
    expect(searchBlocks(blocks, 'signature')).toHaveLength(1);
    expect(searchBlocks(blocks, 'nothing here')).toHaveLength(0);
    expect(searchBlocks(blocks, '')).toHaveLength(3);
  });

  it('labels rows by column count and blocks by type', () => {
    expect(labelFor(blocks[0])).toBe('Row (1 column)');
    expect(labelFor(blocks[1])).toBe('Text');
  });
});

/* ----------------------------------------------------------------- import */

describe('import', () => {
  const existing = [makeSavedBlock('Orange CTA', 'CTA', 'row', ctaBand())];

  it('skips an entry whose id is already present', () => {
    const plan = planImport(exportEnvelope(existing), existing);
    expect(plan!.duplicates).toBe(1);
    expect(plan!.added).toHaveLength(0);
    expect(plan!.clashes).toHaveLength(0);
  });

  it('adds genuinely new blocks', () => {
    const incoming = [makeSavedBlock('Footer sig', 'Signature', 'block', mk('text'))];
    const plan = planImport(exportEnvelope(incoming), existing);
    expect(plan!.added).toHaveLength(1);
    expect(plan!.duplicates).toBe(0);
  });

  it('reports a name clash separately, for the caller to confirm', () => {
    const clashing = makeSavedBlock('Orange CTA', 'CTA', 'row', ctaBand());
    const plan = planImport(exportEnvelope([clashing]), existing);
    expect(plan!.clashes).toHaveLength(1);
    expect(plan!.clashes[0].existing.id).toBe(existing[0].id);
    expect(plan!.added).toHaveLength(0);
  });

  it('counts unreadable entries instead of failing the whole import', () => {
    const plan = planImport(
      { blocks: [{ name: 'Broken', kind: 'block', payload: { type: 'nope' } }, null] },
      existing,
    );
    expect(plan!.rejected).toBe(2);
    expect(plan!.added).toHaveLength(0);
  });

  it('accepts either a bare array or the export envelope', () => {
    const incoming = [makeSavedBlock('New', '', 'block', mk('divider'))];
    expect(planImport(incoming, [])!.added).toHaveLength(1);
    expect(planImport(exportEnvelope(incoming), [])!.added).toHaveLength(1);
  });

  it('rejects JSON that is not a block library at all', () => {
    expect(planImport({ rows: [] }, [])).toBeNull();
    expect(planImport(null, [])).toBeNull();
  });

  it('fills a partially stored block from the block defaults', () => {
    const block = normalizeSavedBlock({
      name: 'Minimal',
      kind: 'block',
      payload: { type: 'heading', values: { text: 'Only the text' } },
    });
    expect(block).not.toBeNull();
    const payload = block!.payload as BlockOf<'heading'>;
    expect(payload.values.text).toBe('Only the text');
    // the rest comes from createBlock('heading')
    expect(payload.values.fontSize).toBeGreaterThan(0);
    expect(block!.schemaVersion).toBe(1);
  });
});

/* ------------------------------------------------------------- the store */

describe('the library in the store', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditor.setState({ savedBlocks: [] });
    useEditor.getState().resetDesign();
  });

  it('saves a row from the canvas and persists it', () => {
    useEditor.getState().addSavedBlock('Orange CTA', 'CTA', 'row', ctaBand());

    expect(useEditor.getState().savedBlocks).toHaveLength(1);
    const [stored] = listSavedBlocks();
    expect(stored.name).toBe('Orange CTA');
    expect(stored.category).toBe('CTA');
    expect(stored.kind).toBe('row');
    expect(JSON.stringify(stored.payload)).toContain('brand.primary');
  });

  it('inserts a saved row into the open email as a new row', () => {
    useEditor.getState().addSavedBlock('Orange CTA', 'CTA', 'row', ctaBand());
    const saved = useEditor.getState().savedBlocks[0];

    useEditor.getState().insertSavedBlock(saved);
    const rows = useEditor.getState().design.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe((saved.payload as Row).id);
    expect(rows[0].bgColor).toBe('brand.primary');
  });

  it('inserting twice yields two independent rows', () => {
    useEditor.getState().addSavedBlock('CTA', 'CTA', 'row', ctaBand());
    const saved = useEditor.getState().savedBlocks[0];
    useEditor.getState().insertSavedBlock(saved);
    useEditor.getState().insertSavedBlock(saved);

    const [a, b] = useEditor.getState().design.rows;
    expect(a.id).not.toBe(b.id);
    expect(a.columns[0].blocks[0].id).not.toBe(b.columns[0].blocks[0].id);
  });

  it('inserts a saved block into the last row when one exists', () => {
    useEditor.getState().addRow([1]);
    useEditor.getState().addSavedBlock('Sig', 'Signature', 'block', mk('text'));
    const saved = useEditor.getState().savedBlocks[0];

    useEditor.getState().insertSavedBlock(saved);
    const design = useEditor.getState().design;
    expect(design.rows).toHaveLength(1);
    expect(design.rows[0].columns[0].blocks.map((b) => b.type)).toEqual(['text']);
  });

  it('makes a row for a saved block when the canvas is empty', () => {
    useEditor.getState().addSavedBlock('Sig', '', 'block', mk('text'));
    useEditor.getState().insertSavedBlock(useEditor.getState().savedBlocks[0]);
    const design = useEditor.getState().design;
    expect(design.rows).toHaveLength(1);
    expect(design.rows[0].columns[0].blocks[0].type).toBe('text');
  });

  it('editing the inserted copy never changes the library entry', () => {
    useEditor.getState().addSavedBlock('CTA', 'CTA', 'row', ctaBand());
    const saved = useEditor.getState().savedBlocks[0];
    const before = JSON.stringify(saved.payload);

    useEditor.getState().insertSavedBlock(saved);
    const rowId = useEditor.getState().design.rows[0].id;
    const blockId = useEditor.getState().design.rows[0].columns[0].blocks[0].id;
    useEditor.getState().updateRow(rowId, { bgColor: '#FF0000' });
    useEditor.getState().updateBlock(blockId, { text: 'Rewritten on the canvas' });

    expect(JSON.stringify(useEditor.getState().savedBlocks[0].payload)).toBe(before);
    expect(JSON.stringify(listSavedBlocks()[0].payload)).toBe(before);
  });

  it('survives a reload through localStorage', () => {
    useEditor.getState().addSavedBlock('CTA', 'CTA', 'row', ctaBand());
    // a fresh read is what a reload would do
    const reloaded: SavedBlock[] = listSavedBlocks();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].name).toBe('CTA');
    expect(instantiate(reloaded[0])).toBeTruthy();
  });
});
