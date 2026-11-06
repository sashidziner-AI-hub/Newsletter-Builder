import { describe, expect, it } from 'vitest';
import { veeBrand } from '../lib/brand';
import { checkDesign, type Issue } from '../lib/checks';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { resolveForOutput } from '../lib/output';
import { renderDesign } from '../lib/render';
import type { Block, Design } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;
const vee = veeBrand();

function clean(blocks: Block[] = []): Design {
  const d = emptyDesign();
  d.body.title = 'A good subject';
  d.body.preheader = 'A good preheader';
  d.body.bgColor = '#FFFFFF';
  d.body.contentBgColor = '#FFFFFF';
  d.body.textColor = '#111111';
  d.body.linkColor = '#0B5CAB';
  const row = createRow([1]);
  row.columns[0].blocks = blocks;
  d.rows.push(row);
  return d;
}

function run(design: Design, opts: Parameters<typeof checkDesign>[3] = {}): Issue[] {
  const out = resolveForOutput(design, vee, 'export');
  return checkDesign(out.design, renderDesign(out.design), vee, opts);
}

const codes = (issues: Issue[]) => issues.map((i) => i.code);
const has = (issues: Issue[], code: string) => codes(issues).includes(code);
const find = (issues: Issue[], code: string) => issues.find((i) => i.code === code);

describe('AI_DRAFT_UNREVIEWED', () => {
  it('is quiet when the email has no brief', () => {
    expect(has(run(clean()), 'AI_DRAFT_UNREVIEWED')).toBe(false);
  });

  it('fires when a brief exists and has not been reviewed', () => {
    const issues = run(clean(), { hasBrief: true, briefReviewed: false });
    expect(has(issues, 'AI_DRAFT_UNREVIEWED')).toBe(true);
    expect(find(issues, 'AI_DRAFT_UNREVIEWED')?.action).toBe('Mark as reviewed');
    expect(find(issues, 'AI_DRAFT_UNREVIEWED')?.severity).toBe('warning');
  });

  it('is quiet once reviewed', () => {
    const issues = run(clean(), { hasBrief: true, briefReviewed: true });
    expect(has(issues, 'AI_DRAFT_UNREVIEWED')).toBe(false);
  });

  it('is quiet when hasBrief is true but briefReviewed is simply absent from opts', () => {
    // absent is treated the same as explicit false - a brief with no reviewed
    // flag at all is still unreviewed
    const issues = run(clean(), { hasBrief: true });
    expect(has(issues, 'AI_DRAFT_UNREVIEWED')).toBe(true);
  });
});

describe('BRIEF_PLACEHOLDER_LEFT', () => {
  it('fires for a bracket placeholder left in a heading', () => {
    const heading = mk('heading');
    heading.values.text = 'See you on [add date]';
    const issues = run(clean([heading]));
    const issue = find(issues, 'BRIEF_PLACEHOLDER_LEFT');
    expect(issue).toBeDefined();
    expect(issue?.blockId).toBe(heading.id);
    expect(issue?.message).toContain('[add date]');
  });

  it('is quiet when there is no bracket text', () => {
    const heading = mk('heading');
    heading.values.text = 'A perfectly ordinary heading';
    expect(has(run(clean([heading])), 'BRIEF_PLACEHOLDER_LEFT')).toBe(false);
  });

  it('does not mistake a [% merge tag %] for a missing-fact placeholder', () => {
    const text = mk('text');
    text.values.html = '<p>Hi [% first_name %], welcome.</p>';
    expect(has(run(clean([text])), 'BRIEF_PLACEHOLDER_LEFT')).toBe(false);
  });

  it('does not scan href/src/id fields', () => {
    const button = mk('button');
    button.values.href = 'https://example.com/[not-a-real-placeholder]';
    expect(has(run(clean([button])), 'BRIEF_PLACEHOLDER_LEFT')).toBe(false);
  });

  it('reports one issue per distinct placeholder, with distinct ids', () => {
    const text = mk('text');
    text.values.html = '<p>On [add date] at [add time], at [add venue].</p>';
    const issues = run(clean([text])).filter((i) => i.code === 'BRIEF_PLACEHOLDER_LEFT');
    expect(issues).toHaveLength(3);
    expect(new Set(issues.map((i) => i.id)).size).toBe(3);
  });

  it('detects a placeholder inside a repeater item (articles excerpt)', () => {
    const articles = mk('articles');
    articles.values.items = [
      { ...articles.values.items[0], excerpt: 'Price is [add price] per seat.' },
    ];
    const issues = run(clean([articles]));
    expect(has(issues, 'BRIEF_PLACEHOLDER_LEFT')).toBe(true);
  });
});
