import { describe, expect, it } from 'vitest';
import { renderDesign, renderBlock, columnWidths, videoThumb } from '../lib/render';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { STARTERS } from '../lib/starters';
import { normalizeDesign } from '../lib/design-ops';

function designWith(...blocks: ReturnType<typeof createBlock>[]) {
  const d = emptyDesign();
  const row = createRow([1]);
  row.columns[0].blocks = blocks;
  d.rows.push(row);
  return d;
}

describe('renderer', () => {
  it('produces a full email document with table layout and mobile css', () => {
    const html = renderDesign(designWith(createBlock('heading')));
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('class="eb-container"');
    expect(html).toContain('@media only screen');
    expect(html).toContain('<h2');
    expect(html).toContain('Your heading here');
  });

  it('escapes heading text and keeps merge tags', () => {
    const h = createBlock('heading');
    if (h.type === 'heading') h.values.text = '<script>alert(1)</script> {{first_name}}';
    const html = renderBlock(h, designWith(h), { colWidth: 560 });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('{{first_name}}');
  });

  it('strips scripts and event handlers from rich text and inlines paragraph styles', () => {
    const t = createBlock('text');
    if (t.type === 'text')
      t.values.html = '<p onclick="x()">Hi <a href="javascript:alert(1)">bad</a> <a href="https://a.com">ok</a></p><script>x</script><p>two</p>';
    const html = renderBlock(t, designWith(t), { colWidth: 560 });
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('margin:0 0 ');
    expect(html).toContain('href="https://a.com"');
    // last paragraph has no bottom margin
    expect(html).toMatch(/<p style="margin:0;">two<\/p>/);
  });

  it('renders a bulletproof button and blocks unsafe urls', () => {
    const b = createBlock('button');
    if (b.type === 'button') b.values.href = 'javascript:alert(1)';
    const html = renderBlock(b, designWith(b), { colWidth: 560 });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('mso-padding-alt');
    expect(html).toContain('href="#"');
  });

  it('computes column widths from ratios and row padding', () => {
    const d = emptyDesign();
    const r = createRow([1, 2]);
    r.padding = { top: 0, right: 30, bottom: 0, left: 30 };
    expect(columnWidths(d, r)).toEqual([180, 360]);
  });

  it('image uses pixel width and hides when empty outside editor', () => {
    const img = createBlock('image');
    const d = designWith(img);
    expect(renderBlock(img, d, { colWidth: 600 })).not.toContain('<img');
    expect(renderBlock(img, d, { colWidth: 600, editor: true })).toContain('Image');
    if (img.type === 'image') {
      img.values.src = 'https://x.com/a.png';
      img.values.width = 50;
    }
    const html = renderBlock(img, d, { colWidth: 600 });
    expect(html).toContain('width="280"'); // (600 - 40 padding) * 0.5
  });

  it('derives youtube thumbnails', () => {
    expect(videoThumb('https://www.youtube.com/watch?v=jNQXAC9IVRw', '')).toBe(
      'https://img.youtube.com/vi/jNQXAC9IVRw/hqdefault.jpg',
    );
    expect(videoThumb('https://youtu.be/jNQXAC9IVRw', '')).toContain('jNQXAC9IVRw');
    expect(videoThumb('https://vimeo.com/123', '')).toBe('');
    expect(videoThumb('https://vimeo.com/123', 'https://t/x.jpg')).toBe('https://t/x.jpg');
  });

  it('renders every block type without throwing', () => {
    const types = ['heading', 'text', 'image', 'button', 'divider', 'menu', 'social', 'video', 'html'] as const;
    const d = designWith(...types.map((t) => createBlock(t)));
    const html = renderDesign(d);
    expect(html.length).toBeGreaterThan(1000);
  });

  it('all starter templates render and round-trip through normalizeDesign', () => {
    for (const s of STARTERS) {
      const design = s.build();
      const html = renderDesign(design);
      expect(html).toContain('</html>');
      const again = normalizeDesign(JSON.parse(JSON.stringify(design)));
      expect(again).not.toBeNull();
      expect(renderDesign(again!)).toBe(html);
    }
  });

  it('normalizeDesign rejects junk and fills missing values', () => {
    expect(normalizeDesign(null)).toBeNull();
    expect(normalizeDesign({ rows: 5 })).toBeNull();
    const d = normalizeDesign({
      rows: [{ columns: [{ blocks: [{ type: 'button', values: { label: 'Hi' } }, { type: 'nope' }] }] }],
    });
    expect(d).not.toBeNull();
    const blk = d!.rows[0].columns[0].blocks;
    expect(blk).toHaveLength(1);
    expect(blk[0].type === 'button' && blk[0].values.bgColor).toBe('#2563EB');
  });
});
