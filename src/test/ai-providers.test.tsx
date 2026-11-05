import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../components/RichTextEditor', () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="rich text" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

/**
 * Two providers, so the per-provider behaviour is exercised for real.
 *
 * The second adapter is test-only and deliberately not shipped: the registry is
 * mocked rather than extended, so nothing here can leak a half-built provider
 * into the app. Both are driven through the same `ImageProvider` interface the
 * real OpenAI adapter implements, which is the point — a second provider costs
 * one file and one registry entry.
 */
vi.mock('../lib/ai/openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ai/openai')>();
  const { AiError } = await import('../lib/ai/provider');
  const { toImageBlob, decodeBase64 } = await import('../lib/ai/validate');

  const makeProvider = (id: string, name: string, models: string[]) => ({
    id,
    name,
    models,
    async testKey(key: string) {
      const res = await fetch(`https://${id}.test/v1/validate`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new AiError(res.status === 401 ? 'invalid-key' : 'network');
      await res.text();
    },
    async generate(req: { prompt: string; signal: AbortSignal }, key: string) {
      const res = await fetch(`https://${id}.test/v1/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({ prompt: req.prompt }),
      });
      if (!res.ok) throw new AiError('bad-response');
      const payload = (await res.json()) as { b64: string };
      const bytes = decodeBase64(payload.b64);
      const { blob, mime } = toImageBlob(bytes);
      return { blob, mime, width: 1, height: 1 };
    },
  });

  const alpha = makeProvider('alpha', 'Alpha Images', ['alpha-1', 'alpha-2']);
  const beta = makeProvider('beta', 'Beta Pictures', ['beta-1']);
  const PROVIDERS = [alpha, beta];
  return {
    ...actual,
    PROVIDERS,
    providerById: (id: string) => PROVIDERS.find((p) => p.id === id) ?? null,
  };
});

import App from '../App';
import { useEditor } from '../store';
import {
  AI_KEYS_STORAGE_KEY,
  clearAllKeys,
  isConnected,
  loadKey,
} from '../lib/ai/key-store';
import { resolveForOutput } from '../lib/output';
import { renderDesign } from '../lib/render';
import { veeBrand } from '../lib/brand';

const s = () => useEditor.getState();
const vee = veeBrand();

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

const KEY_A = 'sk-alpha-DO-NOT-LEAK-1111111111';
const KEY_B = 'sk-beta-DO-NOT-LEAK-22222222222';

const fetchMock = vi.fn();

/** Answers every host with 200 unless told otherwise. */
function routeAll() {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/images')) {
      return new Response(JSON.stringify({ b64: PNG_B64 }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
}

/** Rejects validation for one host only. */
function rejectValidate(host: string) {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes(`${host}.test/v1/validate`)) {
      return new Response(JSON.stringify({ error: 'bad key' }), { status: 401 });
    }
    if (String(url).includes('/images')) {
      return new Response(JSON.stringify({ b64: PNG_B64 }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
}

beforeEach(() => {
  localStorage.clear();
  clearAllKeys();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
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

function openPanel() {
  fireEvent.click(screen.getByTitle('Add Image'));
  fireEvent.click(screen.getByText('Generate with AI'));
}

/** Configure one provider through the settings list. */
async function configure(name: string, key: string, remember = false) {
  const section = screen.getByText(name).closest('section') as HTMLElement;
  fireEvent.click(within(section).getByText(/Add key|Replace key/));
  fireEvent.change(screen.getByLabelText(`${name} API key`), { target: { value: key } });
  if (remember) fireEvent.click(screen.getByLabelText(/Remember on this device/i, { selector: 'input' }));
  fireEvent.click(within(section).getByText('Test and save'));
}


const sectionFor = (name: string) =>
  within(screen.getByText(name).closest('section') as HTMLElement);

/* ------------------------------------------------------------ the fix */

describe('AI settings with more than one provider', () => {
  it('lists every registered provider with a status', async () => {
    render(<App />);
    openPanel();

    expect(screen.getByText('Alpha Images')).toBeTruthy();
    expect(screen.getByText('Beta Pictures')).toBeTruthy();
    expect(screen.getAllByText('Not configured')).toHaveLength(2);
  });

  it('configures one provider and leaves the other untouched', async () => {
    routeAll();
    render(<App />);
    openPanel();
    await configure('Alpha Images', KEY_A);

    await waitFor(() => expect(screen.getByLabelText('Image prompt')).toBeTruthy());
    expect(loadKey('alpha')?.key).toBe(KEY_A);
    expect(loadKey('beta')).toBeNull();
    // the chat header names the active provider and model
    expect(screen.getByText(/Provider: Alpha Images \/ alpha-1/)).toBeTruthy();
  });

  it('adds a second provider and makes it active, keeping both keys', async () => {
    routeAll();
    render(<App />);
    openPanel();
    await configure('Alpha Images', KEY_A);
    await waitFor(() => expect(screen.getByLabelText('Image prompt')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('AI settings'));
    await configure('Beta Pictures', KEY_B);
    await waitFor(() => expect(isConnected('beta')).toBe(true));

    // beta is not active yet, so the settings view stays put
    fireEvent.click(sectionFor('Beta Pictures').getByText('Set as active'));

    await waitFor(() => {
      expect(sectionFor('Beta Pictures').getByText('ACTIVE')).toBeTruthy();
    });
    // both keys survive, separately
    expect(loadKey('alpha')?.key).toBe(KEY_A);
    expect(loadKey('beta')?.key).toBe(KEY_B);
  });

  it('keeps the previous key when a replacement fails its test', async () => {
    routeAll();
    render(<App />);
    openPanel();
    await configure('Alpha Images', KEY_A);
    await waitFor(() => expect(screen.getByLabelText('Image prompt')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('AI settings'));
    rejectValidate('alpha');
    fireEvent.click(sectionFor('Alpha Images').getByText('Replace key'));
    fireEvent.change(screen.getByLabelText('Alpha Images API key'), {
      target: { value: 'sk-alpha-REPLACEMENT-that-fails' },
    });
    fireEvent.click(sectionFor('Alpha Images').getByText('Test and save'));

    await waitFor(() => expect(screen.getByText(/was rejected/)).toBeTruthy());
    // the working key is untouched, and the bad one was never stored
    expect(loadKey('alpha')?.key).toBe(KEY_A);
    expect(JSON.stringify(localStorage)).not.toContain('REPLACEMENT');
  });

  it('disables the composer when the active key is removed', async () => {
    routeAll();
    render(<App />);
    openPanel();
    await configure('Alpha Images', KEY_A);
    await waitFor(() => expect(screen.getByLabelText('Image prompt')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('AI settings'));
    fireEvent.click(sectionFor('Alpha Images').getByText('Remove key'));
    await waitFor(() => expect(loadKey('alpha')).toBeNull());

    fireEvent.click(screen.getByLabelText('Back to chat'));
    expect((screen.getByLabelText('Image prompt') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByText(/No provider is active/)).toBeTruthy();
  });

  it('cancels an in-flight generation when the active provider changes, keeping the messages', async () => {
    render(<App />);
    openPanel();

    // alpha connects, then its generation hangs until aborted
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (String(url).includes('/validate')) return new Response('{}', { status: 200 });
      return new Promise((_res, rej) => {
        init.signal?.addEventListener('abort', () =>
          rej(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    await configure('Alpha Images', KEY_A);
    await waitFor(() => expect(screen.getByLabelText('Image prompt')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Image prompt'), { target: { value: 'a slow one' } });
    fireEvent.click(screen.getByLabelText('Generate'));
    await waitFor(() => expect(screen.getByText('Cancel')).toBeTruthy(), { timeout: 5000 });

    // configure beta and switch to it while alpha is still in flight
    fireEvent.click(screen.getByLabelText('AI settings'));
    routeAll();
    await configure('Beta Pictures', KEY_B);
    await waitFor(() => expect(isConnected('beta')).toBe(true));
    fireEvent.click(sectionFor('Beta Pictures').getByText('Set as active'));

    // the messages live in the chat view, so come back to see them
    fireEvent.click(screen.getByText('Back to chat'));
    await waitFor(() => expect(screen.getByText('Generation cancelled.')).toBeTruthy(), {
      timeout: 6000,
    });
    // the session is intact: the prompt bubble is still there
    expect(screen.getAllByText('a slow one', { selector: 'p' })).toHaveLength(1);
    // and the newly active provider is the one named in the header
    expect(screen.getByText(/Provider: Beta Pictures/)).toBeTruthy();
  }, 20_000);

  it('remembers keys per provider across a reload', async () => {
    routeAll();
    const { unmount } = render(<App />);
    openPanel();
    await configure('Alpha Images', KEY_A, true);
    await waitFor(() => expect(screen.getByLabelText('Image prompt')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('AI settings'));
    await configure('Beta Pictures', KEY_B);
    await waitFor(() => expect(isConnected('beta')).toBe(true));

    const stored = localStorage.getItem(AI_KEYS_STORAGE_KEY) ?? '';
    expect(stored).toContain(KEY_A); // remembered
    expect(stored).not.toContain(KEY_B); // session only

    // a reload is a fresh module state with the same localStorage
    unmount();
    clearAllKeys.call(null);
    localStorage.setItem(AI_KEYS_STORAGE_KEY, stored);

    expect(loadKey('alpha')?.key).toBe(KEY_A);
    expect(loadKey('beta')).toBeNull();
  });
});

/* -------------------------------------------------------------- secrets */

describe('two providers, two keys, neither escapes', () => {
  it('keeps both out of every export and error string', async () => {
    routeAll();
    render(<App />);
    openPanel();
    await configure('Alpha Images', KEY_A, true);
    await waitFor(() => expect(screen.getByLabelText('Image prompt')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('AI settings'));
    await configure('Beta Pictures', KEY_B, true);
    await waitFor(() => expect(isConnected('beta')).toBe(true));

    // provoke an error from each provider, which may echo the request back
    fetchMock.mockImplementation((url: string) =>
      new Response(JSON.stringify({ error: `key ${String(url).includes('alpha') ? KEY_A : KEY_B} is bad` }), {
        status: 400,
      }),
    );
    fireEvent.click(screen.getByLabelText('Back to chat'));
    fireEvent.change(screen.getByLabelText('Image prompt'), { target: { value: 'provoke' } });
    fireEvent.click(screen.getByLabelText('Generate'));
    await waitFor(() => expect(screen.getByText(/not a usable image|Could not reach/)).toBeTruthy(), {
      timeout: 5000,
    });

    const st = s();
    const surfaces = [
      JSON.stringify(st.design),
      JSON.stringify(st.brands),
      JSON.stringify(st.savedBlocks),
      JSON.stringify(st.images),
      JSON.stringify(st.issues),
      renderDesign(resolveForOutput(st.design, vee, 'export').design),
      document.body.textContent ?? '',
    ];
    for (const surface of surfaces) {
      expect(surface).not.toContain(KEY_A);
      expect(surface).not.toContain(KEY_B);
    }

    // only the one dedicated storage key may hold them
    for (const name of Object.keys(localStorage)) {
      if (name === AI_KEYS_STORAGE_KEY) continue;
      expect(localStorage.getItem(name) ?? '', name).not.toContain(KEY_A);
      expect(localStorage.getItem(name) ?? '', name).not.toContain(KEY_B);
    }
  });
});
