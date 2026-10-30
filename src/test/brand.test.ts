import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAND_ID,
  emptyBrand,
  normalizeBrand,
  resolveBrand,
  resolveDesign,
  resolveToken,
  veeBrand,
} from '../lib/brand';
import { isPlaceholderImage } from '../lib/audit';
import { checkDesign } from '../lib/checks';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { normalizeDesign } from '../lib/design-ops';
import { renderDesign } from '../lib/render';
import { listBrands, listTemplates, saveTemplate } from '../lib/storage';
import { useEditor } from '../store';
import type { Block, Brand, Design } from '../types';

/** createBlock() returns the Block union; these narrow it for the assertions. */
type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;

const vee = veeBrand();

/** A second brand with visibly different colours, as in the acceptance test. */
function otherBrand(): Brand {
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
  b.tokens.fonts = { heading: 'Georgia, Times, serif', body: 'Verdana, Geneva, sans-serif' };
  b.logo_url = 'https://cdn.example.com/acme.png';
  return b;
}

/** A design that mixes brand tokens with a hand-set override. */
function tokenDesign(brandId: string | null): Design {
  const design = emptyDesign();
  design.brandId = brandId;
  const row = createRow([1]);
  const heading = mk('heading');
  heading.values.color = 'brand.primary';
  heading.values.fontFamily = 'brand.font.heading';
  const button = mk('button');
  button.values.bgColor = 'brand.primary';
  button.values.color = '#FFFFFF'; // manual override, must survive a brand switch
  const divider = mk('divider');
  divider.values.color = 'brand.border';
  row.columns[0].blocks.push(heading, button, divider);
  design.rows.push(row);
  return design;
}

describe('resolveToken', () => {
  it('resolves a colour token to the brand hex', () => {
    expect(resolveToken('brand.primary', vee)).toBe('#F58220');
    expect(resolveToken('brand.secondary', vee)).toBe('#151515');
    expect(resolveToken('brand.colors.accent', vee)).toBe('#555555');
  });

  it('resolves font tokens to the brand stack, with a web-safe fallback', () => {
    expect(resolveToken('brand.font.body', vee)).toBe('Kanit, Arial, Helvetica, sans-serif');
    expect(resolveToken('brand.font.heading', vee)).toMatch(/Arial, Helvetica, sans-serif$/);
  });

  it('passes literal values through untouched', () => {
    expect(resolveToken('#ABCDEF', vee)).toBe('#ABCDEF');
    expect(resolveToken('', vee)).toBe('');
    expect(resolveToken('Verdana, Geneva, sans-serif', vee)).toBe('Verdana, Geneva, sans-serif');
    expect(resolveToken('https://example.com/a.png', vee)).toBe('https://example.com/a.png');
  });

  it('resolves the same token differently per brand', () => {
    expect(resolveToken('brand.primary', otherBrand())).toBe('#0D9488');
  });

  it('falls back to the seed brand when the token is empty on this brand', () => {
    const blank = emptyBrand('Blank');
    blank.tokens.colors.primary = '';
    expect(resolveToken('brand.primary', blank)).toBe('#F58220');
  });

  it('returns an empty string for an unknown token path', () => {
    expect(resolveToken('brand.nope', vee)).toBe('');
    expect(resolveToken('brand.colors.nope', vee)).toBe('');
  });

  it('only uses an uploaded logo for the canvas, never for an export', () => {
    const b = emptyBrand('Logo test');
    b.logo = 'data:image/png;base64,AAA';
    b.logo_url = 'https://cdn.example.com/logo.png';
    expect(resolveToken('brand.logo', b, 'preview')).toBe('data:image/png;base64,AAA');
    expect(resolveToken('brand.logo', b, 'export')).toBe('https://cdn.example.com/logo.png');
  });
});

describe('resolveDesign', () => {
  it('replaces tokens and leaves manual overrides alone', () => {
    const resolved = resolveDesign(tokenDesign(null), vee);
    const blocks = resolved.rows[0].columns[0].blocks;
    const heading = blocks[0] as BlockOf<'heading'>;
    const button = blocks[1] as BlockOf<'button'>;
    const divider = blocks[2] as BlockOf<'divider'>;
    expect(heading.values.color).toBe('#F58220');
    expect(heading.values.fontFamily).toBe('Kanit, Arial, Helvetica, sans-serif');
    expect(button.values.bgColor).toBe('#F58220');
    expect(button.values.color).toBe('#FFFFFF');
    expect(divider.values.color).toBe('#E5E7EB');
  });

  it('resolves the body defaults from the brand', () => {
    const resolved = resolveDesign(emptyDesign(), vee);
    expect(resolved.body.bgColor).toBe('#F3F4F6');
    expect(resolved.body.contentBgColor).toBe('#FFFFFF');
    expect(resolved.body.textColor).toBe('#151515');
    expect(resolved.body.linkColor).toBe('#F58220');
  });

  it('is a no-op on a design with no tokens, preserving identity', () => {
    const plain = resolveDesign(tokenDesign(null), vee);
    expect(resolveDesign(plain, vee)).toBe(plain);
  });
});

describe('resolveBrand', () => {
  it('finds the brand by id', () => {
    const brands = [vee, otherBrand()];
    expect(resolveBrand(brands, 'brand_acme').name).toBe('Acme Health');
  });

  it('falls back to the default brand for null, unknown and archived ids', () => {
    const archived = { ...otherBrand(), is_active: false };
    const brands = [vee, archived];
    expect(resolveBrand(brands, null).id).toBe(DEFAULT_BRAND_ID);
    expect(resolveBrand(brands, 'brand_does_not_exist').id).toBe(DEFAULT_BRAND_ID);
    expect(resolveBrand(brands, 'brand_acme').id).toBe(DEFAULT_BRAND_ID);
  });

  it('still returns a usable brand when the list is empty', () => {
    expect(resolveBrand([], 'anything').tokens.colors.primary).toBe('#F58220');
  });
});

describe('export output', () => {
  it('contains no brand tokens and re-themes per brand', () => {
    const design = tokenDesign(null);

    const veeHtml = renderDesign(resolveDesign(design, vee, 'export'));
    expect(veeHtml).not.toContain('brand.');
    expect(veeHtml).toContain('#F58220');

    const acmeHtml = renderDesign(resolveDesign(design, otherBrand(), 'export'));
    expect(acmeHtml).not.toContain('brand.');
    expect(acmeHtml).toContain('#0D9488');
    expect(acmeHtml).not.toContain('#F58220');

    // the manual override is identical in both
    expect(veeHtml).toContain('#FFFFFF');
    expect(acmeHtml).toContain('#FFFFFF');
  });

  it('never leaks an uploaded logo into the HTML', () => {
    const b = emptyBrand('Logo test');
    b.logo = 'data:image/png;base64,AAAA';
    b.logo_url = 'https://cdn.example.com/logo.png';

    const design = emptyDesign();
    const row = createRow([1]);
    const image = mk('image');
    image.values.src = 'brand.logo';
    row.columns[0].blocks.push(image);
    design.rows.push(row);

    const html = renderDesign(resolveDesign(design, b, 'export'));
    expect(html).toContain('https://cdn.example.com/logo.png');
    expect(html).not.toContain('data:image');
  });
});

describe('image rules, now owned by the checks engine', () => {
  /** Put one image in an email and read back the codes the engine reports. */
  const codesFor = (src: string, alt = 'Something') => {
    const design = emptyDesign();
    const row = createRow([1]);
    const image = mk('image');
    image.values.src = src;
    image.values.alt = alt;
    row.columns[0].blocks = [image];
    design.rows.push(row);
    return checkDesign(design, '', vee).map((i) => i.code);
  };

  it('flags embedded and non-https sources, and passes clean https', () => {
    expect(codesFor('https://x.test/a.png')).not.toContain('IMAGE_NOT_HTTPS');
    expect(codesFor('data:image/png;base64,AA')).toContain('IMAGE_EMBEDDED');
    expect(codesFor('http://x.test/a.png')).toContain('IMAGE_NOT_HTTPS');
    // merge tags are resolved by the ESP, so they are not a problem
    expect(codesFor('{{logo_url}}')).not.toContain('IMAGE_NOT_HTTPS');
    expect(codesFor('{{logo_url}}')).not.toContain('IMAGE_EMBEDDED');
  });

  it('still knows a placeholder host when it sees one', () => {
    expect(isPlaceholderImage('https://picsum.photos/seed/x/600/300')).toBe(true);
    expect(isPlaceholderImage('https://cdn.example.com/real.jpg')).toBe(false);
    expect(codesFor('https://picsum.photos/seed/x/600/300')).toContain('IMAGE_PLACEHOLDER');
  });

  it('flags a missing alt', () => {
    expect(codesFor('https://x.test/a.png', '')).toContain('IMAGE_MISSING_ALT');
    expect(codesFor('https://x.test/a.png', 'Described')).not.toContain('IMAGE_MISSING_ALT');
  });
});

describe('brand switching in the store', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditor.setState({ brands: [vee, otherBrand()] });
    useEditor.getState().resetDesign();
  });

  it('keeps every block and value when the brand changes', () => {
    useEditor.getState().loadDesign(tokenDesign(null));
    const before = useEditor.getState().design;

    useEditor.getState().setBrandId('brand_acme');
    const after = useEditor.getState().design;

    expect(after.brandId).toBe('brand_acme');
    // only brandId moved; the content is byte-identical
    expect(after.rows).toEqual(before.rows);
    expect(after.body).toEqual(before.body);
    expect({ ...after, brandId: null }).toEqual({ ...before, brandId: null });
  });

  it('is undoable and does not touch content on undo', () => {
    useEditor.getState().loadDesign(tokenDesign(null));
    const rows = useEditor.getState().design.rows;
    useEditor.getState().setBrandId('brand_acme');
    useEditor.getState().undo();
    expect(useEditor.getState().design.brandId).toBeNull();
    expect(useEditor.getState().design.rows).toEqual(rows);
  });

  it('resetBodyToBrand puts tokens back, dropping manual overrides', () => {
    useEditor.getState().loadDesign(tokenDesign(null));
    useEditor.getState().updateBody({ textColor: '#123456', linkColor: '#654321' });
    expect(useEditor.getState().design.body.textColor).toBe('#123456');

    useEditor.getState().resetBodyToBrand();
    expect(useEditor.getState().design.body.textColor).toBe('brand.text');
    expect(useEditor.getState().design.body.linkColor).toBe('brand.link');
  });
});

describe('persistence and migration', () => {
  beforeEach(() => localStorage.clear());

  it('seeds the Vee brand on a fresh browser', () => {
    const brands = listBrands();
    expect(brands).toHaveLength(1);
    expect(brands[0].id).toBe(DEFAULT_BRAND_ID);
    expect(brands[0].name).toBe('Vee Technologies');
    expect(brands[0].tokens.colors.primary).toBe('#F58220');
  });

  it('treats a template saved before brands existed as the default brand', () => {
    // a v1 design: no brandId, literal colours
    const legacy = {
      version: 1,
      body: { bgColor: '#101010', contentBgColor: '#202020', textColor: '#303030', linkColor: '#404040' },
      rows: [{ layout: [1], columns: [{ blocks: [{ type: 'heading', values: { text: 'Old' } }] }] }],
    };
    const design = normalizeDesign(legacy);
    expect(design).not.toBeNull();
    expect(design!.brandId).toBeNull();
    // its stored colours are NOT rewritten to tokens
    expect(design!.body.bgColor).toBe('#101010');
    expect(design!.body.textColor).toBe('#303030');

    const html = renderDesign(resolveDesign(design!, vee, 'export'));
    expect(html).toContain('#101010');
    expect(html).not.toContain('brand.');
  });

  it('a template whose brand was deleted still renders, on the default brand', () => {
    const design = tokenDesign('brand_deleted_forever');
    saveTemplate('Orphaned', design);

    const [saved] = listTemplates();
    expect(saved.brandId).toBe('brand_deleted_forever');

    // the brand list no longer has it
    const brand = resolveBrand(listBrands(), saved.brandId);
    expect(brand.id).toBe(DEFAULT_BRAND_ID);

    const html = renderDesign(resolveDesign(saved.design, brand, 'export'));
    expect(html).not.toContain('brand.');
    expect(html).toContain('#F58220');
  });

  it('round-trips a brand through export/import JSON', () => {
    const exported = JSON.parse(JSON.stringify(otherBrand()));
    const imported = normalizeBrand(exported);
    expect(imported).not.toBeNull();
    expect(imported!.name).toBe('Acme Health');
    expect(imported!.tokens.colors.primary).toBe('#0D9488');
    expect(imported!.logo_url).toBe('https://cdn.example.com/acme.png');
  });

  it('rejects JSON that is not a brand kit', () => {
    expect(normalizeBrand(null)).toBeNull();
    expect(normalizeBrand({ rows: [] })).toBeNull();
    expect(normalizeBrand({ name: '   ' })).toBeNull();
  });

  it('fills missing fields on a partial brand instead of failing', () => {
    const partial = normalizeBrand({ name: 'Half Filled', tokens: { colors: { primary: '#111111' } } });
    expect(partial!.tokens.colors.primary).toBe('#111111');
    expect(partial!.tokens.colors.content_bg).toBe('#FFFFFF');
    expect(partial!.slug).toBe('half-filled');
    expect(partial!.is_active).toBe(true);
    expect(partial!.createdBy).toBeNull();
  });
});
