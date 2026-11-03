import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../components/RichTextEditor', () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="rich text" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import App from '../App';
import { useEditor } from '../store';
import { veeBrand } from '../lib/brand';
import { checkDesign } from '../lib/checks';
import { clearAllKeys, AI_KEYS_STORAGE_KEY } from '../lib/ai/key-store';
import { draftStore } from '../lib/drafts';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { normalizeDesign } from '../lib/design-ops';
import { makeSavedBlock } from '../lib/blocks-library';
import { resolveForOutput } from '../lib/output';
import { renderDesign } from '../lib/render';
import { saveSavedBlocks } from '../lib/storage';
import type { Block, Design } from '../types';

const s = () => useEditor.getState();
const vee = veeBrand();

/* A real 1x1 PNG, base64, so validation has something honest to accept. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);
const PNG_B64 = (() => {
  let out = '';
  for (const b of PNG_BYTES) out += String.fromCharCode(b);
  return btoa(out);
})();

const KEY = 'sk-ui-DO-NOT-LEAK-9876543210';

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  clearAllKeys();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  // jsdom has neither of these
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:mock/1'),
    revokeObjectURL: vi.fn(),
  }));
  act(() => s().resetDesign());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearAllKeys();
});

/* --------------------------------------------------------------- helpers */

/** Walk the setup state: enter a key, test it, save it. */
async function configureKey() {
  fetchMock.mockImplementation(json({ data: [] }));
  fireEvent.click(screen.getByText('Add key'));
  fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: KEY } });
  fireEvent.click(screen.getByText('Test and save'));
  await waitFor(() => expect(screen.getByLabelText('Image prompt')).toBeTruthy(), {
    timeout: 5000,
  });
}

async function generate(prompt: string) {
  fetchMock.mockImplementation(json({ data: [{ b64_json: PNG_B64 }] }));
  fireEvent.change(screen.getByLabelText('Image prompt'), { target: { value: prompt } });
  fireEvent.click(screen.getByLabelText('Generate'));
  await waitFor(() => expect(screen.getByText('Use this image')).toBeTruthy(), { timeout: 5000 });
}

/* ------------------------------------------------------------ the gating */

describe('the AI panel', () => {
  it('opens on settings and hides the composer until a key passes its test', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));

    // settings first, with the provider listed and unconfigured
    expect(screen.getByText('Not configured')).toBeTruthy();
    expect(screen.queryByLabelText('Image prompt')).toBeNull();

    await configureKey();
    expect(screen.getByLabelText('Image prompt')).toBeTruthy();
  });

  it('keeps settings reachable once a key is configured', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));
    await configureKey();

    // this is the bug the fix is for: a gear in the header, from the chat
    fireEvent.click(screen.getByLabelText('AI settings'));
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('Replace key')).toBeTruthy();
    expect(screen.getByText('Remove key')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Back to chat'));
    expect(screen.getByLabelText('Image prompt')).toBeTruthy();
  });

  it('reports a rejected key and keeps the composer shut', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));

    fetchMock.mockImplementation(json({ error: { message: 'bad key' } }, 401));
    fireEvent.click(screen.getByText('Add key'));
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: KEY } });
    fireEvent.click(screen.getByText('Test and save'));

    await waitFor(() => expect(screen.getByText(/was rejected/)).toBeTruthy());
    expect(screen.queryByLabelText('Image prompt')).toBeNull();
    // and nothing was stored, because the test did not pass
    expect(localStorage.getItem(AI_KEYS_STORAGE_KEY)).toBeNull();
  });

  it('has a Back button that restores the properties panel', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    expect(screen.getByText('Content block')).toBeTruthy();
    fireEvent.click(screen.getByText('Generate with AI'));
    expect(screen.queryByText('Content block')).toBeNull();

    fireEvent.click(screen.getByLabelText('Back to properties'));
    expect(screen.getByText('Content block')).toBeTruthy();
  });
});

/* ----------------------------------------------------------- generation */

describe('generating', () => {
  it('shows a result with all four actions', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));
    await configureKey();
    await generate('a quiet office at sunrise');

    expect(screen.getByText('Use this image')).toBeTruthy();
    expect(screen.getByText('Regenerate')).toBeTruthy();
    expect(screen.getByText('Edit prompt')).toBeTruthy();
    expect(screen.getByText('PNG')).toBeTruthy();
  });

  it('keeps every result of the session visible', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));
    await configureKey();
    await generate('first idea');
    await waitFor(() => expect(screen.getAllByText('Use this image')).toHaveLength(1));

    fireEvent.click(screen.getByText('Regenerate'));
    await waitFor(() => expect(screen.getAllByText('Use this image')).toHaveLength(2), {
      timeout: 8000,
    });
    // both results are on screen, each with its own prompt bubble
    // scoped to the bubbles: React renders a controlled textarea's value as
    // its text content, so the composer matches this text too
    expect(screen.getAllByText('first idea', { selector: 'p' })).toHaveLength(2);
  });

  it('prefills the composer from Edit prompt', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));
    await configureKey();
    await generate('a quiet office at sunrise');

    fireEvent.change(screen.getByLabelText('Image prompt'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Edit prompt'));
    expect((screen.getByLabelText('Image prompt') as HTMLTextAreaElement).value).toBe(
      'a quiet office at sunrise',
    );
  });

  it('shows a plain message for a content-policy refusal', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));
    await configureKey();

    fetchMock.mockImplementation(json({ error: { message: 'blocked by content_policy' } }, 400));
    fireEvent.change(screen.getByLabelText('Image prompt'), { target: { value: 'something' } });
    fireEvent.click(screen.getByLabelText('Generate'));

    await waitFor(() => expect(screen.getByText(/content-policy grounds/)).toBeTruthy(), {
      timeout: 5000,
    });
    // and never the key
    expect(document.body.textContent).not.toContain(KEY);
  });

  it('can be cancelled while it is in flight', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));
    await configureKey();

    // a request that only ever settles by being aborted
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () =>
            rej(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    fireEvent.change(screen.getByLabelText('Image prompt'), { target: { value: 'a slow one' } });
    fireEvent.click(screen.getByLabelText('Generate'));

    await waitFor(() => expect(screen.getByText('Cancel')).toBeTruthy(), { timeout: 5000 });
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => expect(screen.getByText('Generation cancelled.')).toBeTruthy());
    // and the composer is usable again
    expect((screen.getByLabelText('Generate') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends the brand palette only when the toggle is on, and never the logo', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));
    await configureKey();

    fireEvent.click(screen.getByLabelText('Brand colours', { selector: 'input' }));
    await generate('a quiet office');

    const body = JSON.parse(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('generations')).pop()![1].body,
    );
    expect(body.prompt).toContain(vee.tokens.colors.primary);
    expect(body.prompt).not.toContain('logo');
    expect(body.prompt).not.toContain(vee.footer.unsubscribe_text);
  });
});

/* ----------------------------------------------------------------- using */

describe('using a result', () => {
  it('requires alt text before it can be added', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    const sel = s().selection;
    const blockId = sel.kind === 'block' ? sel.id : '';
    fireEvent.click(screen.getByText('Generate with AI'));
    await configureKey();
    await generate('a quiet office at sunrise');

    fireEvent.click(screen.getByText('Use this image'));
    const alt = screen.getByLabelText('Alt text') as HTMLInputElement;
    expect(alt.value).toBe('a quiet office at sunrise'); // suggested from the prompt

    fireEvent.change(alt, { target: { value: '   ' } });
    expect((screen.getByText('Add to email') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/alt text is what most readers see/)).toBeTruthy();

    fireEvent.change(alt, { target: { value: 'A quiet office at sunrise' } });
    fireEvent.click(screen.getByText('Add to email'));

    await waitFor(() => {
      const block = s().design.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.id === blockId);
      expect((block!.values as { aiDraftId?: string }).aiDraftId).toBeTruthy();
    });
  });

  it('writes an id into the design, never bytes', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));
    await configureKey();
    await generate('a quiet office');
    fireEvent.click(screen.getByText('Use this image'));
    fireEvent.change(screen.getByLabelText('Alt text'), { target: { value: 'An office' } });
    fireEvent.click(screen.getByText('Add to email'));

    await waitFor(() => expect(JSON.stringify(s().design)).toContain('aidraft_'));
    const asJson = JSON.stringify(s().design);
    expect(asJson).not.toContain('data:');
    expect(asJson).not.toContain('blob:');
    expect(asJson).not.toContain(PNG_B64);
  });
});

/* ------------------------------------------------------------ the export */

describe('an unhosted draft', () => {
  const designWithDraft = (): Design => {
    const d = emptyDesign();
    const row = createRow([1]);
    const image = createBlock('image') as Extract<Block, { type: 'image' }>;
    image.values.alt = 'An office';
    image.values.aiDraftId = 'aidraft_ui';
    row.columns[0].blocks = [image];
    d.rows.push(row);
    return d;
  };

  it('is flagged in Checks and exports without data: or blob:', async () => {
    await draftStore.put({
      id: 'aidraft_ui',
      blob: new Blob([PNG_BYTES], { type: 'image/png' }),
      mime: 'image/png',
      width: 1,
      height: 1,
      prompt: 'an office',
      alt: 'An office',
      model: 'gpt-image-1-mini',
      createdAt: Date.now(),
    });

    render(<App />);
    act(() => s().loadDesign(designWithDraft()));
    await act(async () => {
      await s().refreshDrafts();
    });

    expect(s().issues.map((i) => i.code)).toContain('AI_IMAGE_NOT_HOSTED');

    const html = renderDesign(resolveForOutput(s().design, vee, 'export').design);
    expect(html).not.toContain('data:');
    expect(html).not.toContain('blob:');
    expect(html).toContain('placehold.co');

    await draftStore.remove('aidraft_ui');
  });
});

/* ------------------------------------------------- drafts from elsewhere */

describe('a draft this browser does not hold', () => {
  const rawDesign = {
    version: 1,
    body: { title: 'Imported' },
    rows: [
      {
        layout: [1],
        columns: [
          {
            blocks: [
              {
                type: 'image',
                values: { src: '', alt: 'From another machine', aiDraftId: 'aidraft_elsewhere' },
              },
            ],
          },
        ],
      },
    ],
  };

  it('survives a design import and is flagged, not crashed', async () => {
    const imported = normalizeDesign(rawDesign);
    expect(imported).not.toBeNull();
    const block = imported!.rows[0].columns[0].blocks[0] as Extract<Block, { type: 'image' }>;
    expect(block.values.aiDraftId).toBe('aidraft_elsewhere');

    render(<App />);
    act(() => s().loadDesign(imported!));
    await act(async () => {
      await s().refreshDrafts();
    });

    const codes = s().issues.map((i) => i.code);
    expect(codes).toContain('AI_IMAGE_MISSING_DRAFT');
    expect(codes).not.toContain('AI_IMAGE_NOT_HOSTED');

    // the canvas says so rather than showing a broken image
    await waitFor(() => expect(screen.getByText('Draft image missing')).toBeTruthy());

    // and it still exports, as a placeholder
    const html = renderDesign(resolveForOutput(s().design, vee, 'export').design);
    expect(html).toContain('placehold.co');
    expect(html).not.toContain('aidraft_elsewhere');
  });

  it('survives a saved-block insert, carrying the id and no bytes', async () => {
    const block = createBlock('image') as Extract<Block, { type: 'image' }>;
    block.values.alt = 'Saved elsewhere';
    block.values.aiDraftId = 'aidraft_saved';
    const saved = makeSavedBlock('AI hero', 'Images', 'block', block);

    // what goes to storage carries the id only
    expect(JSON.stringify(saved)).toContain('aidraft_saved');
    expect(JSON.stringify(saved)).not.toContain('data:');
    expect(JSON.stringify(saved)).not.toContain(PNG_B64);
    saveSavedBlocks([saved]);

    render(<App />);
    act(() => s().setSavedBlocks([saved]));
    act(() => s().insertSavedBlock(saved));
    await act(async () => {
      await s().refreshDrafts();
    });

    expect(s().issues.map((i) => i.code)).toContain('AI_IMAGE_MISSING_DRAFT');
    await waitFor(() => expect(screen.getByText('Draft image missing')).toBeTruthy());
  });

  it('reports one issue per missing draft with stable ids', async () => {
    const imported = normalizeDesign(rawDesign)!;
    const out = resolveForOutput(imported, vee, 'export');
    const run = () =>
      checkDesign(out.design, renderDesign(out.design), vee, { knownDrafts: new Set<string>() })
        .filter((i) => i.code === 'AI_IMAGE_MISSING_DRAFT')
        .map((i) => i.id);
    expect(run()).toHaveLength(1);
    expect(run()).toEqual(run());
  });
});

/* --------------------------------------------------------- the key again */

describe('the key never escapes', () => {
  it('is in no design, brand, saved block, library or export after a full run', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByText('Generate with AI'));
    await configureKey();
    await generate('a quiet office');
    fireEvent.click(screen.getByText('Use this image'));
    fireEvent.change(screen.getByLabelText('Alt text'), { target: { value: 'An office' } });
    fireEvent.click(screen.getByText('Add to email'));
    await waitFor(() => expect(JSON.stringify(s().design)).toContain('aidraft_'));
    act(() => s().saveNow());

    const st = s();
    const surfaces = [
      JSON.stringify(st.design),
      JSON.stringify(st.brands),
      JSON.stringify(st.savedBlocks),
      JSON.stringify(st.images),
      JSON.stringify(st.issues),
      renderDesign(resolveForOutput(st.design, vee, 'export').design),
    ];
    for (const surface of surfaces) expect(surface).not.toContain(KEY);

    // storage: only the one dedicated key may hold it, and only if remembered
    for (const name of Object.keys(localStorage)) {
      if (name === AI_KEYS_STORAGE_KEY) continue;
      expect(localStorage.getItem(name) ?? '', name).not.toContain(KEY);
    }
    // this run did not tick Remember, so not even there
    expect(localStorage.getItem(AI_KEYS_STORAGE_KEY)).toBeNull();
    expect(document.body.textContent).not.toContain(KEY);
  });
});
