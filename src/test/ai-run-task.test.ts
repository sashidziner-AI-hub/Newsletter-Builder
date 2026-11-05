import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentTaskModel, isTaskReady, resetGuardsForTests, runTask } from '../lib/ai/run-task';
import { setTaskRoute, loadTaskSettings } from '../lib/ai/task-settings';
import { AiError } from '../lib/ai/provider';
import { verifyModelListed } from '../lib/ai/openai';
import { clearAllKeys, markConnected, saveKey, setActiveProvider } from '../lib/ai/key-store';

const KEY = 'sk-test-DO-NOT-LEAK-abcdef123456';

/** A real 1x1 PNG, so the magic-byte check has something honest to accept. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);
const PNG_B64 = (() => {
  let s = '';
  for (const b of PNG_BYTES) s += String.fromCharCode(b);
  return btoa(s);
})();

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const textBody = () =>
  JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
  });

const fetchMock = vi.fn();

async function rejection(p: Promise<unknown>): Promise<AiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AiError) return e;
    throw e;
  }
  throw new Error('expected a rejection');
}

function setupKey(providerId = 'openai') {
  saveKey(providerId, 'unused', KEY, true);
  setActiveProvider(providerId);
  markConnected(providerId, true);
}

beforeEach(() => {
  localStorage.clear();
  clearAllKeys();
  resetGuardsForTests();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('runTask — per-task routing', () => {
  it('uses the configured model for the task that was called, and no other', async () => {
    setupKey();
    setTaskRoute('text.brief', { ...loadTaskSettings()['text.brief'], model: 'gpt-5.4-mini' });
    setTaskRoute('image.generate', { ...loadTaskSettings()['image.generate'], model: 'gpt-image-1-mini' });

    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('chat/completions')) return okResponse(JSON.parse(textBody()));
      return okResponse({ data: [{ b64_json: PNG_B64 }] });
    });

    await runTask('text.brief', {
      system: 's',
      user: 'u',
      schema: { type: 'object' },
      schemaName: 'test',
      maxOutputTokens: 20,
      signal: new AbortController().signal,
    });
    const textCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('chat/completions'))!;
    expect(JSON.parse(textCall[1].body).model).toBe('gpt-5.4-mini');

    fetchMock.mockClear();
    await runTask('image.generate', {
      prompt: 'a cat',
      aspect: '1:1',
      blockWidth: 600,
      signal: new AbortController().signal,
    });
    const imageCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('images/generations'))!;
    expect(JSON.parse(imageCall[1].body).model).toBe('gpt-image-1-mini');
  });

  it('changing one task leaves the other unaffected', () => {
    setTaskRoute('text.brief', { ...loadTaskSettings()['text.brief'], model: 'gpt-4.1-mini' });
    expect(loadTaskSettings()['image.generate'].model).toBe('gpt-image-2.6-flare');
  });

  it('always dispatches to the capability-matching endpoint, regardless of what the stored model string looks like', async () => {
    setupKey();
    // a misconfigured route (a text-looking model string on the image task) —
    // runTask must still call the IMAGE endpoint, never the text one
    setTaskRoute('image.generate', { ...loadTaskSettings()['image.generate'], model: 'gpt-6-luna' });
    fetchMock.mockImplementation(() => okResponse({ data: [{ b64_json: PNG_B64 }] }));

    await runTask('image.generate', { prompt: 'x', aspect: '1:1', blockWidth: 600, signal: new AbortController().signal });
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes('images/generations'))).toBe(true);
  });
});

describe('isTaskReady', () => {
  it('is false with no key configured', () => {
    expect(isTaskReady('text.brief')).toBe(false);
    expect(isTaskReady('image.generate')).toBe(false);
  });

  it('is false with a key but not Connected this session', () => {
    saveKey('openai', 'unused', KEY, true);
    expect(isTaskReady('text.brief')).toBe(false);
  });

  it('is true once a key is saved and connected', () => {
    setupKey();
    expect(isTaskReady('text.brief')).toBe(true);
    expect(isTaskReady('image.generate')).toBe(true);
  });

  it('never calls fetch when nothing is configured — the UI gate works', async () => {
    const err = await runTask('text.brief', {
      system: 's',
      user: 'u',
      schema: {},
      schemaName: 't',
      maxOutputTokens: 10,
      signal: new AbortController().signal,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('currentTaskModel', () => {
  it('reflects whatever is currently configured for that task', () => {
    expect(currentTaskModel('text.brief')).toBe('gpt-6-luna');
    setTaskRoute('text.brief', { ...loadTaskSettings()['text.brief'], model: 'gpt-5.1-mini' });
    expect(currentTaskModel('text.brief')).toBe('gpt-5.1-mini');
    expect(currentTaskModel('image.generate')).toBe('gpt-image-2.6-flare');
  });
});

describe('fallback chain', () => {
  it('falls through to the next entry on a network-class failure', async () => {
    setupKey();
    setTaskRoute('text.brief', {
      ...loadTaskSettings()['text.brief'],
      model: 'gpt-6-luna',
      fallbacks: [{ providerId: 'openai', model: 'gpt-5.4-mini' }],
    });

    let call = 0;
    fetchMock.mockImplementation(() => {
      call += 1;
      if (call === 1) throw new TypeError('Failed to fetch'); // classifies as 'network'
      return okResponse(JSON.parse(textBody()));
    });

    const result = await runTask('text.brief', {
      system: 's',
      user: 'u',
      schema: {},
      schemaName: 't',
      maxOutputTokens: 10,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('gpt-5.4-mini');
  });

  it('does NOT fall through on a validation-class failure (bad response)', async () => {
    setupKey();
    setTaskRoute('text.brief', {
      ...loadTaskSettings()['text.brief'],
      fallbacks: [{ providerId: 'openai', model: 'gpt-5.4-mini' }],
    });
    fetchMock.mockImplementation(() => new Response('not json', { status: 200 }));

    await expect(
      runTask('text.brief', {
        system: 's',
        user: 'u',
        schema: {},
        schemaName: 't',
        maxOutputTokens: 10,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1); // no fallback attempt
  });

  it('does NOT fall through on an invalid-key failure', async () => {
    setupKey();
    setTaskRoute('text.brief', {
      ...loadTaskSettings()['text.brief'],
      fallbacks: [{ providerId: 'openai', model: 'gpt-5.4-mini' }],
    });
    fetchMock.mockImplementation(() => okResponse({ error: { code: 'invalid_api_key' } }, 401));

    const err = await rejection(
      runTask('text.brief', {
        system: 's',
        user: 'u',
        schema: {},
        schemaName: 't',
        maxOutputTokens: 10,
        signal: new AbortController().signal,
      }),
    );
    expect(err.kind).toBe('invalid-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips a fallback entry whose provider has no key configured', async () => {
    setupKey();
    setTaskRoute('text.brief', {
      ...loadTaskSettings()['text.brief'],
      fallbacks: [{ providerId: 'some-other-provider', model: 'x' }, { providerId: 'openai', model: 'gpt-5.4-mini' }],
    });
    let call = 0;
    fetchMock.mockImplementation(() => {
      call += 1;
      if (call === 1) throw new TypeError('Failed to fetch');
      return okResponse(JSON.parse(textBody()));
    });

    const result = await runTask('text.brief', {
      system: 's',
      user: 'u',
      schema: {},
      schemaName: 't',
      maxOutputTokens: 10,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('one-in-flight guard — per task', () => {
  it('rejects a second concurrent call for the SAME task', async () => {
    setupKey();
    let resolveFirst: () => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve(okResponse(JSON.parse(textBody())));
        }),
    );

    const first = runTask('text.brief', {
      system: 's',
      user: 'u',
      schema: {},
      schemaName: 't',
      maxOutputTokens: 10,
      signal: new AbortController().signal,
    });
    await Promise.resolve(); // let the first call register as in-flight

    const second = runTask('text.brief', {
      system: 's',
      user: 'u',
      schema: {},
      schemaName: 't',
      maxOutputTokens: 10,
      signal: new AbortController().signal,
    });
    await expect(second).rejects.toThrow();

    resolveFirst!();
    await first;
  });

  it('a task in flight never blocks a DIFFERENT task', async () => {
    setupKey();
    let resolveFirst: () => void;
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('chat/completions')) {
        return new Promise((resolve) => {
          resolveFirst = () => resolve(okResponse(JSON.parse(textBody())));
        });
      }
      return Promise.resolve(okResponse({ data: [{ b64_json: PNG_B64 }] }));
    });

    const brief = runTask('text.brief', {
      system: 's',
      user: 'u',
      schema: {},
      schemaName: 't',
      maxOutputTokens: 10,
      signal: new AbortController().signal,
    });
    await Promise.resolve();

    const image = await runTask('image.generate', {
      prompt: 'x',
      aspect: '1:1',
      blockWidth: 600,
      signal: new AbortController().signal,
    });
    expect(image.blob).toBeInstanceOf(Blob);

    resolveFirst!();
    await brief;
  });
});

describe('key never leaks', () => {
  it('is absent from a thrown error even when the provider echoes it back', async () => {
    setupKey();
    fetchMock.mockImplementation(() => okResponse({ error: { message: `Bad request, key ${KEY} is malformed` } }, 400));

    const err = await rejection(
      runTask('text.brief', {
        system: 's',
        user: 'u',
        schema: {},
        schemaName: 't',
        maxOutputTokens: 10,
        signal: new AbortController().signal,
      }),
    );
    expect(err.message).not.toContain(KEY);
    expect(err.detail).not.toContain(KEY);
  });
});

describe('verifyModelListed — image test-connection never generates', () => {
  it('only calls GET /models, never /images/generations', async () => {
    fetchMock.mockImplementation(() => okResponse({ data: [{ id: 'gpt-image-2.6-flare' }] }));
    const ok = await verifyModelListed('gpt-image-2.6-flare', KEY, new AbortController().signal);
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/models');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('generations'))).toBe(false);
  });

  it('returns false (not an error) when the key works but the model is not listed', async () => {
    fetchMock.mockImplementation(() => okResponse({ data: [{ id: 'some-other-model' }] }));
    const ok = await verifyModelListed('gpt-image-2.6-flare', KEY, new AbortController().signal);
    expect(ok).toBe(false);
  });
});
