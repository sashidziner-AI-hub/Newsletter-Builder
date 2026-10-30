import { beforeEach, describe, expect, it } from 'vitest';
import { emptyBrand, veeBrand } from '../lib/brand';
import { instantiate } from '../lib/blocks-library';
import { createBlock, createRow } from '../lib/defaults';
import { resolvedDesign } from '../lib/output';
import { PRESETS } from '../lib/presets';
import { renderDesign } from '../lib/render';
import {
  findTemplate,
  listSavedBlocks,
  listVersions,
  loadLastEmailId,
  saveBrands,
} from '../lib/storage';
import { versionsFor } from '../lib/versions';
import { useEditor } from '../store';
import type { Block, Brand, Row } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;

function acme(): Brand {
  const b = emptyBrand('Acme Health');
  b.id = 'brand_acme';
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
  return b;
}

/** The CTA band from the Newsletter preset's shape. */
function ctaBand(): Row {
  const row = createRow([1]);
  row.bgColor = 'brand.primary';
  const heading = mk('heading');
  heading.values.text = 'Want this as a monthly briefing?';
  heading.values.color = 'brand.content_bg';
  const button = mk('button');
  button.values.label = 'Subscribe';
  button.values.bgColor = 'brand.content_bg';
  button.values.color = 'brand.primary';
  row.columns[0].blocks.push(heading, button);
  return row;
}

beforeEach(() => {
  localStorage.clear();
  saveBrands([veeBrand(), acme()]);
  useEditor.setState({ brands: [veeBrand(), acme()], savedBlocks: [] });
  useEditor.getState().resetDesign();
});

describe('2B acceptance', () => {
  it('1. a saved CTA band re-themes in a new preset email, and the original is untouched', () => {
    const st = () => useEditor.getState();

    // save the band from one email
    st().addSavedBlock('Orange CTA', 'CTA', 'row', ctaBand());
    const saved = listSavedBlocks()[0];
    const originalJson = JSON.stringify(saved.payload);

    // start a fresh email from a preset, on the other brand
    const preset = PRESETS.find((p) => p.id === 'promotional')!;
    const brand = acme();
    st().startNewEmail({ ...preset.build(brand), brandId: brand.id });
    const rowsBefore = st().design.rows.length;

    // add the block from the library
    st().insertSavedBlock(saved);
    expect(st().design.rows).toHaveLength(rowsBefore + 1);

    // it matches the active brand
    const html = renderDesign(resolvedDesign(st().design, brand, 'export'));
    expect(html).toContain('#0D9488');
    expect(html).not.toContain('#F58220');
    expect(html).not.toContain('brand.');
    expect(html).toContain('Want this as a monthly briefing?');

    // editing the inserted copy leaves the library entry alone
    const inserted = st().design.rows[st().design.rows.length - 1];
    st().updateRow(inserted.id, { bgColor: '#FF0000' });
    st().updateBlock(inserted.columns[0].blocks[0].id, { text: 'Edited on the canvas' });

    expect(JSON.stringify(listSavedBlocks()[0].payload)).toBe(originalJson);
    expect(JSON.stringify(listSavedBlocks()[0].payload)).not.toContain('Edited on the canvas');

    // and the same block still renders in Vee colours elsewhere
    const again = instantiate(listSavedBlocks()[0]) as Row;
    expect(again.bgColor).toBe('brand.primary');
  });

  it('2. an edit survives closing the tab without ever clicking save', () => {
    const st = () => useEditor.getState();

    st().startNewEmail({ ...PRESETS[0].build(veeBrand()), brandId: 'brand_vee' });
    st().updateBody({ title: 'Half-finished work' });
    st().addRow([1, 1]);

    // what the beforeunload flush does when the debounce has not fired yet
    st().saveNow();

    const id = loadLastEmailId();
    expect(id).not.toBeNull();

    // a fresh boot: read the pointer and reopen that record
    const reopened = findTemplate(id);
    expect(reopened).not.toBeNull();
    expect(reopened!.design.body.title).toBe('Half-finished work');
    expect(reopened!.design.rows.some((r) => r.columns.length === 2)).toBe(true);
    // it is a draft, because it was never named
    expect(reopened!.autoSaved).toBe(true);
  });

  it('3. restoring back and forth loses nothing', () => {
    const st = () => useEditor.getState();

    st().startNewEmail({ ...PRESETS[0].build(veeBrand()), brandId: 'brand_vee' });
    st().updateBody({ title: 'Version one' });
    st().saveNow();
    const emailId = st().currentEmailId!;
    // saveNow() already took an 'auto' snapshot of this exact design, so an
    // immediate manual one is correctly skipped as a duplicate — the state is
    // recoverable either way, which is what matters here.
    st().snapshot('manual', 'v1');

    // a big change
    st().updateBody({ title: 'Version two' });
    const rowId = st().design.rows[0].id;
    st().deleteRow(rowId);
    st().saveNow();
    const rowsAtV2 = st().design.rows.length;

    // restore the earlier version, snapshotting the present first
    const v1 = versionsFor(listVersions(), emailId).find(
      (v) => v.design.body.title === 'Version one',
    )!;
    expect(v1).toBeTruthy();
    st().snapshot('pre-restore', 'Before restoring v1');
    st().restoreVersion(v1.design);
    expect(st().design.body.title).toBe('Version one');

    // the newer state is still in history, so we can go forward again
    const v2 = versionsFor(listVersions(), emailId).find(
      (v) => v.design.body.title === 'Version two',
    );
    expect(v2).toBeTruthy();
    st().restoreVersion(v2!.design);
    expect(st().design.body.title).toBe('Version two');
    expect(st().design.rows).toHaveLength(rowsAtV2);

    // both versions remain available afterwards
    const notes = versionsFor(listVersions(), emailId).map((v) => v.design.body.title);
    expect(notes).toContain('Version one');
    expect(notes).toContain('Version two');
  });
});
