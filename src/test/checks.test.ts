import { describe, expect, it } from 'vitest';
import { veeBrand } from '../lib/brand';
import {
  PREHEADER_MAX,
  SIZE_WARN_KB,
  SUBJECT_MAX,
  byteLength,
  checkDesign,
  classifyLink,
  collectLinks,
  effectiveBackground,
  groupBySeverity,
  hasUnsubscribe,
  summarise,
  textWords,
  type Issue,
} from '../lib/checks';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { resolveForOutput } from '../lib/output';
import { PRESETS } from '../lib/presets';
import { renderDesign } from '../lib/render';
import type { Block, Design } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;
const vee = veeBrand();

/** A design with sane defaults, so only the rule under test fires. */
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

/** Run the engine the way the app does: resolved design plus the real HTML. */
function run(design: Design, opts = {}): Issue[] {
  const out = resolveForOutput(design, vee, 'export');
  return checkDesign(out.design, renderDesign(out.design), vee, opts);
}

const codes = (issues: Issue[]) => issues.map((i) => i.code);
const has = (issues: Issue[], code: string) => codes(issues).includes(code);
const find = (issues: Issue[], code: string) => issues.find((i) => i.code === code);

/* ------------------------------------------------------------------- size */

describe('SIZE', () => {
  const sized = (kb: number) => 'x'.repeat(Math.round(kb * 1024));

  it('is quiet below the warning threshold', () => {
    const issues = checkDesign(clean(), sized(SIZE_WARN_KB - 1), vee);
    expect(has(issues, 'SIZE_NEAR_LIMIT')).toBe(false);
    expect(has(issues, 'SIZE_OVER_LIMIT')).toBe(false);
  });

  it('warns from 90 KB', () => {
    expect(has(checkDesign(clean(), sized(89), vee), 'SIZE_NEAR_LIMIT')).toBe(false);
    expect(has(checkDesign(clean(), sized(90), vee), 'SIZE_NEAR_LIMIT')).toBe(true);
  });

  it('errors from 102 KB, and stops warning', () => {
    const at101 = checkDesign(clean(), sized(101), vee);
    expect(has(at101, 'SIZE_NEAR_LIMIT')).toBe(true);
    expect(has(at101, 'SIZE_OVER_LIMIT')).toBe(false);

    const at102 = checkDesign(clean(), sized(102), vee);
    expect(has(at102, 'SIZE_OVER_LIMIT')).toBe(true);
    expect(has(at102, 'SIZE_NEAR_LIMIT')).toBe(false);
    expect(find(at102, 'SIZE_OVER_LIMIT')!.severity).toBe('error');
    expect(find(at102, 'SIZE_OVER_LIMIT')!.message).toMatch(/clip/i);
  });

  it('counts bytes, not characters', () => {
    // a multi-byte character must weigh more than one byte
    expect(byteLength('é')).toBe(2);
    expect(byteLength('abc')).toBe(3);
  });
});

/* -------------------------------------------------------- subject/preheader */

describe('SUBJECT and PREHEADER', () => {
  it('errors on an empty subject and points at the field', () => {
    const d = clean();
    d.body.title = '   ';
    const issue = find(run(d), 'SUBJECT_EMPTY')!;
    expect(issue.severity).toBe('error');
    expect(issue.field).toBe('title');
  });

  it('notes a long subject without complaining', () => {
    const d = clean();
    d.body.title = 'x'.repeat(SUBJECT_MAX + 1);
    expect(find(run(d), 'SUBJECT_LONG')!.severity).toBe('info');

    d.body.title = 'x'.repeat(SUBJECT_MAX);
    expect(has(run(d), 'SUBJECT_LONG')).toBe(false);
  });

  it('warns on an empty preheader and notes a long one', () => {
    const d = clean();
    d.body.preheader = '';
    expect(find(run(d), 'PREHEADER_EMPTY')!.severity).toBe('warning');

    d.body.preheader = 'x'.repeat(PREHEADER_MAX + 1);
    expect(find(run(d), 'PREHEADER_LONG')!.severity).toBe('info');
  });
});

/* ------------------------------------------------------------ unsubscribe */

describe('UNSUBSCRIBE', () => {
  it('is quiet when a footer carries the merge tag', () => {
    expect(has(run(clean([mk('footer')])), 'UNSUBSCRIBE_MISSING')).toBe(false);
  });

  it('warns when there is no unsubscribe anywhere', () => {
    const issue = find(run(clean([mk('heading')])), 'UNSUBSCRIBE_MISSING')!;
    expect(issue.severity).toBe('warning');
    expect(issue.hint).toMatch(/sending tool/i);
  });

  it('warns when the footer exists but Show footer is off', () => {
    const d = clean([mk('footer')]);
    d.body.showFooter = false;
    expect(has(run(d), 'UNSUBSCRIBE_MISSING')).toBe(true);
  });

  it('spots the tag in any ESP format', () => {
    expect(hasUnsubscribe('<a href="{{unsubscribe_url}}">Out</a>')).toBe(true);
    expect(hasUnsubscribe('<a href="*|UNSUB|*">Out</a>')).toBe(true);
    expect(hasUnsubscribe('<a href="{{ unsubscribe_link }}">Out</a>')).toBe(true);
    expect(hasUnsubscribe('<a href="https://esp.test/u/123">Unsubscribe</a>')).toBe(true);
    expect(hasUnsubscribe('<p>Nothing here</p>')).toBe(false);
  });

  it('is quiet when the footer is in the Mailchimp format', () => {
    const d = clean([mk('footer')]);
    d.body.mergeFormat = 'mailchimp';
    expect(has(run(d), 'UNSUBSCRIBE_MISSING')).toBe(false);
  });
});

/* ------------------------------------------------------------------ links */

describe('LINKS', () => {
  it('classifies each kind', () => {
    expect(classifyLink('https://real.example/page')).toBe('ok');
    expect(classifyLink('')).toBe('empty');
    expect(classifyLink('#')).toBe('hash');
    expect(classifyLink('/about')).toBe('relative');
    expect(classifyLink('about.html')).toBe('relative');
    expect(classifyLink('http://real.test/x')).toBe('http');
    expect(classifyLink('https://example.com/go')).toBe('placeholder');
    expect(classifyLink('https://yourdomain.com')).toBe('placeholder');
  });

  it('treats merge tags as valid links', () => {
    expect(classifyLink('{{unsubscribe_url}}')).toBe('ok');
    expect(classifyLink('*|UNSUB|*')).toBe('ok');
    expect(classifyLink('{{ view_as_page_link }}')).toBe('ok');
  });

  it('accepts well-formed mailto: and tel:, and rejects malformed ones', () => {
    expect(classifyLink('mailto:hello@example.test')).toBe('ok');
    expect(classifyLink('tel:+441234567890')).toBe('ok');
    expect(classifyLink('mailto:')).toBe('empty');
    expect(classifyLink('tel:')).toBe('empty');
  });

  it('does not flag a UTM-tagged link', () => {
    const d = clean([mk('button')]);
    const button = d.rows[0].columns[0].blocks[0] as BlockOf<'button'>;
    button.values.href = 'https://real.test/page';
    d.body.utm = {
      enabled: true, source: 'newsletter', medium: 'email', campaign: 'spring', content: '', term: '',
    };
    const issues = run(d);
    expect(has(issues, 'LINK_HTTP')).toBe(false);
    expect(has(issues, 'LINK_RELATIVE')).toBe(false);
    expect(has(issues, 'LINK_PLACEHOLDER_DOMAIN')).toBe(false);
  });

  it('reports an empty button href against its block', () => {
    const button = mk('button');
    button.values.href = '';
    const issue = find(run(clean([button])), 'LINK_EMPTY')!;
    expect(issue.severity).toBe('error');
    expect(issue.blockId).toBe(button.id);
  });

  it('finds links inside a Text block', () => {
    const text = mk('text');
    text.values.html = '<p>Go <a href="#">nowhere</a></p>';
    expect(has(run(clean([text])), 'LINK_HASH')).toBe(true);
  });

  it('collects the social email address as the mailto: it ships as', () => {
    const social = mk('social');
    social.values.items = [
      { id: 's1', network: 'email', href: 'hello@example.test', iconUrl: '' },
    ];
    const links = collectLinks(clean([social]));
    expect(links[0].url).toBe('mailto:hello@example.test');
    expect(classifyLink(links[0].url)).toBe('ok');
  });
});

/* --------------------------------------------------------------- contrast */

describe('CONTRAST', () => {
  it('passes dark text on white', () => {
    const heading = mk('heading');
    heading.values.color = '#111111';
    expect(has(run(clean([heading])), 'CONTRAST_TEXT')).toBe(false);
  });

  it('fails light grey text on white, and reports the ratio', () => {
    const heading = mk('heading');
    heading.values.color = '#BBBBBB';
    heading.values.fontSize = 16;
    heading.values.fontWeight = 'normal';
    const issue = find(run(clean([heading])), 'CONTRAST_TEXT')!;
    expect(issue.severity).toBe('error');
    expect(issue.message).toMatch(/\d+(\.\d+)?:1/);
    expect(issue.message).toMatch(/4\.5:1/);
    expect(issue.hint).toMatch(/#/); // suggests a concrete colour
    expect(issue.blockId).toBe(heading.id);
  });

  it('holds large text to the easier 3:1 bar', () => {
    const big = mk('heading');
    big.values.color = '#777777';
    big.values.fontSize = 28;
    big.values.fontWeight = 'normal';
    expect(has(run(clean([big])), 'CONTRAST_TEXT')).toBe(false);

    const small = mk('heading');
    small.values.color = '#777777';
    small.values.fontSize = 14;
    small.values.fontWeight = 'normal';
    expect(has(run(clean([small])), 'CONTRAST_TEXT')).toBe(true);
  });

  it('judges a button label against the button, not the page', () => {
    const button = mk('button');
    button.values.bgColor = '#FFFFFF';
    button.values.color = '#EEEEEE'; // invisible on its own white fill
    const issue = find(run(clean([button])), 'CONTRAST_BUTTON')!;
    expect(issue.severity).toBe('error');
  });

  it('uses the row background when the body is a different colour', () => {
    const d = clean();
    d.body.contentBgColor = '';
    d.rows[0].contentBgColor = '#111111';
    const heading = mk('heading');
    heading.values.color = '#222222'; // dark on dark
    d.rows[0].columns[0].blocks = [heading];
    expect(has(run(d), 'CONTRAST_TEXT')).toBe(true);
  });

  it('follows the renderer chain for the effective background', () => {
    const d = clean();
    const block = mk('heading');
    d.rows[0].columns[0].blocks = [block];
    expect(effectiveBackground(d, d.rows[0], block)).toBe('#FFFFFF');

    d.rows[0].contentBgColor = '#ABCDEF';
    expect(effectiveBackground(d, d.rows[0], block)).toBe('#ABCDEF');
  });

  it('skips contrast on a hero background image and says to check by hand', () => {
    const hero = mk('hero');
    hero.values.layout = 'centered';
    hero.values.bgImage = 'https://cdn.test/bg.jpg';
    hero.values.headingColor = '#EEEEEE'; // would fail on white
    const issues = run(clean([hero]));
    expect(has(issues, 'CONTRAST_TEXT')).toBe(false);
    const note = find(issues, 'CONTRAST_UNKNOWN')!;
    expect(note.severity).toBe('info');
    expect(note.hint).toMatch(/manually/i);
  });

  it('checks the default link colour against the content background', () => {
    const d = clean();
    d.body.linkColor = '#DDDDDD';
    const issue = find(run(d), 'CONTRAST_LINK')!;
    expect(issue.severity).toBe('error');
    expect(issue.blockId).toBeUndefined();
  });
});

/* ------------------------------------------------------------ readability */

describe('READABILITY', () => {
  /** A fresh block each time: immer freezes anything that has been resolved. */
  const textAt = (fontSize: number) => {
    const text = mk('text');
    text.values.fontSize = fontSize;
    return clean([text]);
  };
  const buttonWith = (innerPaddingV: number, fontSize = 14) => {
    const button = mk('button');
    button.values.innerPaddingV = innerPaddingV;
    button.values.fontSize = fontSize;
    return clean([button]);
  };

  it('warns about text under 12px', () => {
    expect(find(run(textAt(11)), 'TEXT_TOO_SMALL')!.severity).toBe('warning');
    expect(has(run(textAt(12)), 'TEXT_TOO_SMALL')).toBe(false);
  });

  it('warns about a button too small to tap', () => {
    expect(find(run(buttonWith(4)), 'TAP_TARGET_SMALL')!.severity).toBe('warning');
    expect(has(run(buttonWith(14)), 'TAP_TARGET_SMALL')).toBe(false);
  });
});

/* ---------------------------------------------------------------- content */

describe('CONTENT', () => {
  it('warns about an image-only email', () => {
    const image = mk('image');
    image.values.src = 'https://cdn.test/a.png';
    image.values.alt = 'A picture';
    const d = clean([image]);
    d.body.preheader = '';
    expect(has(run(d), 'CONTENT_THIN')).toBe(true);
  });

  it('is quiet when there is real copy', () => {
    const text = mk('text');
    text.values.html = `<p>${'word '.repeat(60)}</p>`;
    const image = mk('image');
    image.values.src = 'https://cdn.test/a.png';
    image.values.alt = 'A picture';
    expect(has(run(clean([text, image])), 'CONTENT_THIN')).toBe(false);
  });

  it('does not count the hidden preheader as visible copy', () => {
    const html = renderDesign(resolveForOutput(clean(), vee, 'export').design);
    // "A good preheader" is in the HTML but hidden, so it must not be counted
    expect(html).toContain('A good preheader');
    expect(textWords(html)).toBe(0);
  });
});

/* ----------------------------------------------------------------- images */

describe('IMAGES', () => {
  const withImage = (src: string, alt = 'Something') => {
    const image = mk('image');
    image.values.src = src;
    image.values.alt = alt;
    return clean([image]);
  };

  it('errors on a data: URI and on http', () => {
    expect(has(run(withImage('data:image/png;base64,AAAA')), 'IMAGE_EMBEDDED')).toBe(true);
    expect(has(run(withImage('http://cdn.test/a.png')), 'IMAGE_NOT_HTTPS')).toBe(true);
  });

  it('never asks for alt on a field that has none', () => {
    // a hero background and a video thumbnail have no alt attribute to fill in
    const hero = mk('hero');
    hero.values.bgImage = 'https://cdn.example.com/bg.jpg';
    expect(has(run(clean([hero])), 'IMAGE_MISSING_ALT')).toBe(false);
  });

  it('warns on placeholder art and missing alt', () => {
    expect(has(run(withImage('https://picsum.photos/seed/a/600/400')), 'IMAGE_PLACEHOLDER')).toBe(true);
    expect(has(run(withImage('https://cdn.test/a.png', '')), 'IMAGE_MISSING_ALT')).toBe(true);
  });

  it('only calls an image broken once it has been probed', () => {
    const d = withImage('https://cdn.test/a.png');
    expect(has(run(d), 'IMAGE_BROKEN')).toBe(false);
    const probed = run(d, { loadStatus: new Map([['https://cdn.test/a.png', 'broken']]) });
    expect(has(probed, 'IMAGE_BROKEN')).toBe(true);
  });

  it('warns about an image wider than 1600px when the width is known', () => {
    const d = withImage('https://cdn.test/huge.png');
    expect(has(run(d), 'IMAGE_TOO_WIDE')).toBe(false);
    const sized = run(d, { imageWidths: new Map([['https://cdn.test/huge.png', 2400]]) });
    expect(find(sized, 'IMAGE_TOO_WIDE')!.severity).toBe('warning');

    const fine = run(d, { imageWidths: new Map([['https://cdn.test/huge.png', 1600]]) });
    expect(has(fine, 'IMAGE_TOO_WIDE')).toBe(false);
  });
});

/* -------------------------------------------------------------- stability */

describe('issue ids', () => {
  it('are identical across runs of the same design', () => {
    const heading = mk('heading');
    heading.values.color = '#CCCCCC';
    const d = clean([heading]);
    expect(run(d).map((i) => i.id)).toEqual(run(d).map((i) => i.id));
  });

  it('survive an unrelated edit elsewhere in the email', () => {
    const heading = mk('heading');
    heading.values.color = '#CCCCCC';
    const d = clean([heading]);
    const before = find(run(d), 'CONTRAST_TEXT')!.id;

    d.body.preheader = 'Something completely different';
    expect(find(run(d), 'CONTRAST_TEXT')!.id).toBe(before);
  });

  it('distinguish the same problem in two different blocks', () => {
    const a = mk('heading');
    a.values.color = '#CCCCCC';
    const b = mk('heading');
    b.values.color = '#CCCCCC';
    const ids = run(clean([a, b]))
      .filter((i) => i.code === 'CONTRAST_TEXT')
      .map((i) => i.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

/* ---------------------------------------------------------------- shaping */

describe('summary and grouping', () => {
  it('counts by severity', () => {
    const issues: Issue[] = [
      { id: 'a', code: 'A', severity: 'error', message: '', hint: '' },
      { id: 'b', code: 'B', severity: 'warning', message: '', hint: '' },
      { id: 'c', code: 'C', severity: 'warning', message: '', hint: '' },
    ];
    expect(summarise(issues)).toEqual({ error: 1, warning: 2, info: 0, total: 3 });
  });

  it('orders errors before warnings before info', () => {
    const image = mk('image');
    image.values.src = 'http://cdn.test/a.png';
    image.values.alt = '';
    const grouped = groupBySeverity(run(clean([image])));
    expect(grouped[0][0]).toBe('error');
  });
});

/* ---------------------------------------------------------------- presets */

describe('the presets, through the engine', () => {
  it('raise placeholder warnings but no errors of their own', () => {
    for (const preset of PRESETS) {
      const design = preset.build(vee);
      const out = resolveForOutput(design, vee, 'export');
      const issues = checkDesign(out.design, renderDesign(out.design), vee);
      // their links and art are deliberately placeholders
      expect(issues.some((i) => i.code === 'LINK_PLACEHOLDER_DOMAIN'), preset.name).toBe(true);
      // but nothing should be structurally broken
      expect(issues.some((i) => i.code === 'LINK_RELATIVE'), preset.name).toBe(false);
      expect(issues.some((i) => i.code === 'IMAGE_EMBEDDED'), preset.name).toBe(false);
      expect(issues.some((i) => i.code === 'SUBJECT_EMPTY'), preset.name).toBe(false);
      expect(issues.some((i) => i.code === 'PREHEADER_EMPTY'), preset.name).toBe(false);
    }
  });

  it('every preset carries an unsubscribe link', () => {
    for (const preset of PRESETS) {
      const out = resolveForOutput(preset.build(vee), vee, 'export');
      const issues = checkDesign(out.design, renderDesign(out.design), vee);
      expect(issues.some((i) => i.code === 'UNSUBSCRIBE_MISSING'), preset.name).toBe(false);
    }
  });
});
