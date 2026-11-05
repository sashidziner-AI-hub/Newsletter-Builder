import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('../components/RichTextEditor', () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="rich text" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import App from '../App';
import { useEditor } from '../store';
import { veeBrand } from '../lib/brand';
import { makeSavedBlock } from '../lib/blocks-library';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { draftStore, forgetDraftDataUrl, type DraftImage } from '../lib/drafts';
import { AI_DRAFT_PLACEHOLDER_URL, resolveForOutput, resolvedDesign } from '../lib/output';
import { renderDesign } from '../lib/render';
import type { Block, Design } from '../types';

const s = () => useEditor.getState();
const vee = veeBrand();

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;

/** A real 1x1 PNG. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

const DRAFT_ID = 'aidraft_render';

const draft = (id = DRAFT_ID): DraftImage => ({
  id,
  blob: new Blob([PNG_BYTES], { type: 'image/png' }),
  mime: 'image/png',
  width: 1,
  height: 1,
  prompt: 'a quiet office at sunrise',
  alt: 'A quiet office at sunrise',
  model: 'gpt-image-2',
  createdAt: Date.now(),
});

function designWith(blocks: Block[]): Design {
  const d = emptyDesign();
  const row = createRow([1]);
  row.columns[0].blocks = blocks;
  d.rows.push(row);
  return d;
}

/**
 * Every block type that can hold a draft, with the field the id stands in for.
 * They all reach `safeUrl()` through `imgTag()`/`logoPair()`, which is why one
 * bug hid all five.
 */
const CASES: { name: string; build: (id: string) => Block }[] = [
  {
    name: 'Image block',
    build: (id) => {
      const b = mk('image');
      b.values.src = '';
      b.values.alt = 'A quiet office';
      b.values.aiDraftId = id;
      return b;
    },
  },
  {
    name: 'Hero image',
    build: (id) => {
      const b = mk('hero');
      b.values.layout = 'image-right';
      b.values.imageSrc = '';
      b.values.imageAlt = 'A quiet office';
      b.values.aiDraftId = id;
      return b;
    },
  },
  {
    name: 'Hero card',
    build: (id) => {
      const b = mk('hero');
      b.values.layout = 'cards-2';
      b.values.cards[0].imageSrc = '';
      b.values.cards[0].imageAlt = 'A quiet office';
      b.values.cards[0].aiDraftId = id;
      return b;
    },
  },
  {
    name: 'Article item',
    build: (id) => {
      const b = mk('articles');
      b.values.layout = 'thumb-left';
      b.values.items[0].imageSrc = '';
      b.values.items[0].imageAlt = 'A quiet office';
      b.values.items[0].aiDraftId = id;
      return b;
    },
  },
  {
    name: 'Header logo',
    build: (id) => {
      const b = mk('header');
      b.values.logoSrc = '';
      b.values.logoAlt = 'A quiet office';
      b.values.aiDraftId = id;
      return b;
    },
  },
];

beforeEach(async () => {
  localStorage.clear();
  forgetDraftDataUrl(DRAFT_ID);
  await draftStore.put(draft());
  act(() => s().resetDesign());
});

afterEach(async () => {
  cleanup();
  await draftStore.remove(DRAFT_ID);
});

/* ---------------------------------------------------------- the root cause */

describe('why a blob: URL could never have worked', () => {
  it('safeUrl refuses blob: and accepts data:image, which is why the fix is data:', async () => {
    const { safeUrl } = await import('../lib/util');
    // this single line was the bug: the canvas built an object URL, and the
    // renderer then dropped it and emitted its "add an image" placeholder
    expect(safeUrl('blob:http://localhost:5173/9f0c-1234')).toBe('');
    expect(safeUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  });

  it('DOMPurify would have stripped it too, so widening safeUrl alone was not enough', async () => {
    const DOMPurify = (await import('dompurify')).default;
    expect(DOMPurify.sanitize('<img src="blob:http://localhost/abc" />')).not.toContain('blob:');
    // data: on an img src survives, with no configuration
    expect(DOMPurify.sanitize('<img src="data:image/png;base64,AAAA" />')).toContain(
      'data:image/png;base64,AAAA',
    );
  });
});

/* ------------------------------------------------------------- the canvas */

describe('a draft image on the canvas', () => {
  for (const kase of CASES) {
    it(`renders in a ${kase.name}`, async () => {
      render(<App />);
      act(() => s().loadDesign(designWith([kase.build(DRAFT_ID)])));

      // the conversion is async, so the first paint has no image yet
      await waitFor(
        () => {
          const imgs = [...document.querySelectorAll('main img, [role=main] img')];
          expect(imgs.some((i) => (i.getAttribute('src') ?? '').startsWith('data:image/png;base64,'))).toBe(
            true,
          );
        },
        { timeout: 4000 },
      );

      // and the placeholder prompt is gone
      expect(screen.queryByText(/select this block and add an image/i)).toBeNull();
    });
  }

  it('still says so when the draft is not in this browser', async () => {
    render(<App />);
    const block = CASES[0].build('aidraft_elsewhere');
    act(() => s().loadDesign(designWith([block])));
    await act(async () => {
      await s().refreshDrafts();
    });

    await waitFor(() => expect(screen.getByText(/draft image missing/i)).toBeTruthy());
    expect(s().issues.map((i) => i.code)).toContain('AI_IMAGE_MISSING_DRAFT');
  });
});

/* ------------------------------------------------------------ the preview */

describe('a draft image in the preview', () => {
  it('is rendered as bytes, with the caption saying so', async () => {
    render(<App />);
    act(() => s().loadDesign(designWith([CASES[0].build(DRAFT_ID)])));

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByTitle('Preview'));

    await waitFor(
      () => {
        const frame = screen.getByTitle('Email preview') as HTMLIFrameElement;
        expect(frame.srcdoc).toContain('data:image/png;base64,');
      },
      { timeout: 4000 },
    );
    expect(screen.getByText(/except AI drafts, shown here locally/)).toBeTruthy();
  });

  it('leaves the caption alone when there is no draft', async () => {
    render(<App />);
    const plain = mk('image');
    plain.values.src = 'https://cdn.example.com/real.png';
    plain.values.alt = 'Real';
    act(() => s().loadDesign(designWith([plain])));

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByTitle('Preview'));
    expect(screen.getByText('This is the exact HTML that will be exported.')).toBeTruthy();
  });
});

/* ------------------------------------------------------------- the export */

describe('the export stays free of bytes', () => {
  for (const kase of CASES) {
    it(`ships a placeholder for a ${kase.name}`, () => {
      const design = designWith([kase.build(DRAFT_ID)]);
      const html = renderDesign(resolveForOutput(design, vee, 'export').design);

      expect(html).toContain(AI_DRAFT_PLACEHOLDER_URL.split('?')[0]);
      expect(html).not.toContain('data:');
      expect(html).not.toContain('blob:');
      expect(html).not.toContain(DRAFT_ID);
    });
  }

  it('only substitutes bytes when a caller hands them over', () => {
    const design = designWith([CASES[0].build(DRAFT_ID)]);
    const withBytes = resolvedDesign(design, vee, 'export', {
      draftImages: { [DRAFT_ID]: 'data:image/png;base64,AAAA' },
    });
    expect(renderDesign(withBytes)).toContain('data:image/png;base64,AAAA');

    // the same call without the map cannot produce bytes
    const without = resolvedDesign(design, vee, 'export');
    expect(renderDesign(without)).not.toContain('data:');
  });

  it('keeps the design JSON and a saved block free of bytes', () => {
    const block = CASES[0].build(DRAFT_ID);
    const design = designWith([block]);
    const saved = makeSavedBlock('AI hero', 'Images', 'block', block);

    for (const json of [JSON.stringify(design), JSON.stringify(saved)]) {
      expect(json).toContain(DRAFT_ID);
      expect(json).not.toContain('data:');
      expect(json).not.toContain('blob:');
    }
  });
});
