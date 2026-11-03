import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { veeBrand } from '../lib/brand';
import { checkDesign } from '../lib/checks';
import {
  AI_KEYS_STORAGE_KEY,
  AI_LEGACY_STORAGE_KEY,
  activeProvider,
  clearAllKeys,
  clearKey,
  hasKey,
  isRemembered,
  loadKey,
  markConnected,
  maskKey,
  saveKey,
  setActiveProvider,
  statusOf,
} from '../lib/ai/key-store';
import { openAiProvider } from '../lib/ai/openai';
import { AiError, MAX_IMAGE_BYTES, type GenerateRequest } from '../lib/ai/provider';
import { decodeBase64, readPngSize, sniffMime, toImageBlob } from '../lib/ai/validate';
import { memoryDraftStore, newDraftId, type DraftImage } from '../lib/drafts';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { AI_DRAFT_PLACEHOLDER_URL, resolveForOutput } from '../lib/output';
import { renderDesign } from '../lib/render';
import type { Block, Design } from '../types';

type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
const mk = <T extends Block['type']>(type: T) => createBlock(type) as BlockOf<T>;
const vee = veeBrand();

function designWith(blocks: Block[]): Design {
  const d = emptyDesign();
  const row = createRow([1]);
  row.columns[0].blocks = blocks;
  d.rows.push(row);
  return d;
}

/* --------------------------------------------------------- test fixtures */

/** A real 1x1 PNG, so the magic-byte check has something honest to accept. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const PNG_B64 = toB64(PNG_BYTES);

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A Response body can be read once, so a repeated call needs a fresh one. */
const okAlways = (body: unknown, status = 200) => () => okResponse(body, status);

/** The technical reason lives on `detail`; `message` is the plain user text. */
function aiDetail(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof AiError ? e.detail : String(e);
  }
  throw new Error('expected a throw');
}

/** Await a rejection as a typed AiError. */
async function rejection(p: Promise<unknown>): Promise<AiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AiError) return e;
    throw e;
  }
  throw new Error('expected a rejection');
}

const request = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  prompt: 'a calm mountain at dawn',
  aspect: '1:1',
  blockWidth: 600,
  model: 'gpt-image-1-mini',
  signal: new AbortController().signal,
  ...over,
});

const KEY = 'sk-test-DO-NOT-LEAK-abcdef123456';

/* ----------------------------------------------------------- validation */

describe('response validation', () => {
  it('accepts the three formats by their signatures, not their headers', () => {
    expect(sniffMime(PNG_BYTES)).toBe('image/png');
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffMime(webp)).toBe('image/webp');
  });

  it('refuses an SVG, which is a document that can carry script', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(sniffMime(svg)).toBeNull();
    expect(() => toImageBlob(svg)).toThrow(AiError);
  });

  it('refuses HTML served with a 200, and JSON where an image was promised', () => {
    for (const text of ['<!DOCTYPE html><html><body>error</body></html>', '{"error":"nope"}']) {
      expect(aiDetail(() => toImageBlob(new TextEncoder().encode(text)))).toMatch(
        /not a PNG, JPEG or WebP/,
      );
    }
  });

  it('refuses anything over 10 MB', () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG_BYTES.slice(0, 8), 0);
    expect(aiDetail(() => toImageBlob(big))).toMatch(/over the 10 MB limit/);
    // one byte under is fine
    const edge = new Uint8Array(MAX_IMAGE_BYTES);
    edge.set(PNG_BYTES.slice(0, 8), 0);
    expect(toImageBlob(edge).mime).toBe('image/png');
  });

  it('refuses an empty body', () => {
    expect(aiDetail(() => toImageBlob(new Uint8Array(0)))).toMatch(/empty response/);
  });

  it('decodes base64 and reads the PNG header for the natural size', () => {
    const bytes = decodeBase64(PNG_B64);
    expect(sniffMime(bytes)).toBe('image/png');
    expect(readPngSize(bytes)).toEqual({ width: 1, height: 1 });
    expect(readPngSize(new Uint8Array([1, 2, 3]))).toEqual({ width: 0, height: 0 });
  });

  it('rejects a payload that is not base64 at all', () => {
    expect(aiDetail(() => decodeBase64('%%%not base64%%%'))).toMatch(/not valid base64/);
  });
});

/* ------------------------------------------------------------ key store */

const KEY_B = 'sk-second-provider-DO-NOT-LEAK-zzz';

describe('the API keys, one per provider', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllKeys();
  });
  afterEach(() => clearAllKeys());

  it('lives in memory by default and is not written to storage', () => {
    saveKey('openai', 'gpt-image-1-mini', KEY, false);
    expect(loadKey('openai')?.key).toBe(KEY);
    expect(hasKey('openai')).toBe(true);
    expect(isRemembered('openai')).toBe(false);
    expect(localStorage.getItem(AI_KEYS_STORAGE_KEY)).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain(KEY);
  });

  it('writes to exactly one storage key when remembering, and nowhere else', () => {
    saveKey('openai', 'gpt-image-1-mini', KEY, true);
    expect(isRemembered('openai')).toBe(true);
    const holders = Object.keys(localStorage).filter((k) =>
      (localStorage.getItem(k) ?? '').includes(KEY),
    );
    expect(holders).toEqual([AI_KEYS_STORAGE_KEY]);
  });

  it('keeps two providers side by side without either overwriting the other', () => {
    saveKey('openai', 'gpt-image-1-mini', KEY, true);
    saveKey('mock', 'mock-1', KEY_B, true);

    expect(loadKey('openai')?.key).toBe(KEY);
    expect(loadKey('mock')?.key).toBe(KEY_B);
    expect(loadKey('openai')?.model).toBe('gpt-image-1-mini');
    expect(loadKey('mock')?.model).toBe('mock-1');
  });

  it('remembers per provider, so one can be on disk and the other not', () => {
    saveKey('openai', 'gpt-image-1-mini', KEY, true);
    saveKey('mock', 'mock-1', KEY_B, false);

    expect(isRemembered('openai')).toBe(true);
    expect(isRemembered('mock')).toBe(false);
    const stored = localStorage.getItem(AI_KEYS_STORAGE_KEY) ?? '';
    expect(stored).toContain(KEY);
    expect(stored).not.toContain(KEY_B);
    // but the un-remembered one still works this session
    expect(loadKey('mock')?.key).toBe(KEY_B);
  });

  it('removes one provider without touching the other', () => {
    saveKey('openai', 'gpt-image-1-mini', KEY, true);
    saveKey('mock', 'mock-1', KEY_B, true);
    clearKey('openai');

    expect(hasKey('openai')).toBe(false);
    expect(hasKey('mock')).toBe(true);
    const stored = localStorage.getItem(AI_KEYS_STORAGE_KEY) ?? '';
    expect(stored).not.toContain(KEY);
    expect(stored).toContain(KEY_B);
  });

  it('unticking Remember clears only that provider stored copy', () => {
    saveKey('openai', 'gpt-image-1-mini', KEY, true);
    saveKey('mock', 'mock-1', KEY_B, true);
    saveKey('openai', 'gpt-image-1-mini', KEY, false);

    expect(localStorage.getItem(AI_KEYS_STORAGE_KEY) ?? '').not.toContain(KEY);
    expect(localStorage.getItem(AI_KEYS_STORAGE_KEY) ?? '').toContain(KEY_B);
    expect(loadKey('openai')?.key).toBe(KEY); // still usable this session
  });

  it('tracks the active provider and remembers it', () => {
    saveKey('openai', 'gpt-image-1-mini', KEY, true);
    expect(activeProvider()).toBe('openai'); // first save becomes active
    saveKey('mock', 'mock-1', KEY_B, true);
    setActiveProvider('mock');
    expect(activeProvider()).toBe('mock');
    expect(localStorage.getItem(AI_KEYS_STORAGE_KEY) ?? '').toContain('"activeProviderId":"mock"');
  });

  it('clears the active pointer when that provider is removed', () => {
    saveKey('mock', 'mock-1', KEY_B, true);
    setActiveProvider('mock');
    clearKey('mock');
    expect(activeProvider()).toBeNull();
  });

  it('reports status, and only a passing test makes it connected', () => {
    expect(statusOf('openai')).toBe('not-configured');
    saveKey('openai', 'gpt-image-1-mini', KEY, false);
    expect(statusOf('openai')).toBe('configured');
    markConnected('openai', true);
    expect(statusOf('openai')).toBe('connected');
    markConnected('openai', false);
    expect(statusOf('openai')).toBe('configured');
  });

  it('migrates a key saved under the old single-slot shape', () => {
    // clearAllKeys resets the run-once flag as well as storage, so the legacy
    // record has to be seeded after it
    clearAllKeys();
    localStorage.setItem(
      AI_LEGACY_STORAGE_KEY,
      JSON.stringify({ providerId: 'openai', model: 'gpt-image-1-mini', key: KEY, schemaVersion: 1 }),
    );

    expect(loadKey('openai')?.key).toBe(KEY);
    expect(loadKey('openai')?.model).toBe('gpt-image-1-mini');
    expect(activeProvider()).toBe('openai');
    // the old record is gone, so there is one place to look again
    expect(localStorage.getItem(AI_LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('wipes everything on clearAllKeys', () => {
    saveKey('openai', 'gpt-image-1-mini', KEY, true);
    saveKey('mock', 'mock-1', KEY_B, true);
    clearAllKeys();
    expect(hasKey('openai')).toBe(false);
    expect(hasKey('mock')).toBe(false);
    expect(JSON.stringify(localStorage)).not.toContain(KEY);
    expect(JSON.stringify(localStorage)).not.toContain(KEY_B);
  });

  it('masks for display without revealing the middle', () => {
    const masked = maskKey(KEY);
    expect(masked).not.toContain('DO-NOT-LEAK');
    expect(masked.startsWith('sk-')).toBe(true);
    expect(masked.endsWith(KEY.slice(-4))).toBe(true);
  });
});

/* ------------------------------------------------------------- provider */

describe('the OpenAI adapter', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends only the two headers CORS allows, and never the key in the URL', async () => {
    fetchMock.mockImplementation(okAlways({ data: [{ b64_json: PNG_B64 }] }));
    await openAiProvider.generate(request(), KEY);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(String(url)).not.toContain(KEY);
    expect(Object.keys(init.headers)).toEqual(['Authorization', 'Content-Type']);
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it('asks for one PNG at the size the aspect maps to', async () => {
    fetchMock.mockImplementation(okAlways({ data: [{ b64_json: PNG_B64 }] }));
    await openAiProvider.generate(request({ aspect: '3:2' }), KEY);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: 'gpt-image-1-mini', n: 1, output_format: 'png', size: '1536x1024' });
    expect(body.prompt).toBe('a calm mountain at dawn');
    // the key is not in the body
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it('maps "match" onto a size from the block width', async () => {
    fetchMock.mockImplementation(okAlways({ data: [{ b64_json: PNG_B64 }] }));
    for (const [width, size] of [[600, '1536x1024'], [300, '1024x1024'], [180, '1024x1536']] as const) {
      fetchMock.mockClear();
      await openAiProvider.generate(request({ aspect: 'match', blockWidth: width }), KEY);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).size, String(width)).toBe(size);
    }
  });

  it('falls back to a documented size when a custom one is refused', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ error: { message: 'invalid size' } }, 400))
      .mockResolvedValueOnce(okResponse({ data: [{ b64_json: PNG_B64 }] }));
    const result = await openAiProvider.generate(request({ aspect: '16:9' }), KEY);
    expect(result.mime).toBe('image/png');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).size).toBe('1536x864');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).size).toBe('1536x1024');
  });

  it('returns a validated blob, not whatever came back', async () => {
    fetchMock.mockImplementation(okAlways({ data: [{ b64_json: PNG_B64 }] }));
    const result = await openAiProvider.generate(request(), KEY);
    expect(result.blob.type).toBe('image/png');
    expect(result.blob.size).toBe(PNG_BYTES.length);
    expect(result).toMatchObject({ width: 1, height: 1 });
  });

  describe('errors', () => {
    /** Exactly the shape OpenAI reports failures in. */
    const oaError = (code: string, message: string) => ({ error: { code, message, type: code } });

    const failWith = async (status: number, body: unknown, key = KEY) => {
      fetchMock.mockImplementation(okAlways(body, status));
      return rejection(openAiProvider.generate(request(), key));
    };

    it('401 invalid_api_key names the likely cause', async () => {
      const err = await failWith(401, oaError('invalid_api_key', 'Incorrect API key provided'));
      expect(err.kind).toBe('invalid-key');
      expect(err.message).toBe(
        'OpenAI rejected the key. Check for typos or extra spaces, or create a new key.',
      );
    });

    it('403 shows OpenAI’s own message, with the organization hint', async () => {
      const err = await failWith(
        403,
        oaError('organization_not_verified', 'Your organization must be verified to use gpt-image-2'),
      );
      expect(err.kind).toBe('forbidden');
      expect(err.message).toBe('Your organization must be verified to use gpt-image-2');
      expect(err.detail).toBe(
        'This key or organization may not be allowed to use this image model.',
      );
    });

    it('403 with no message still says something useful', async () => {
      const err = await failWith(403, {});
      expect(err.kind).toBe('forbidden');
      expect(err.message).toBe('OpenAI refused this request (403).');
    });

    it('429 insufficient_quota points at billing, not at waiting', async () => {
      const err = await failWith(
        429,
        oaError('insufficient_quota', 'You exceeded your current quota'),
      );
      expect(err.kind).toBe('no-credit');
      expect(err.message).toBe('No API credits. Add billing credit in your OpenAI account.');
    });

    it('429 rate_limit_exceeded keeps the wait-and-retry message', async () => {
      const err = await failWith(429, oaError('rate_limit_exceeded', 'Rate limit reached'));
      expect(err.kind).toBe('rate-limit');
      expect(err.message).toMatch(/rate-limiting/);
    });

    it('400 content_policy_violation keeps the content-policy message', async () => {
      const err = await failWith(
        400,
        oaError('content_policy_violation', 'Your request was rejected'),
      );
      expect(err.kind).toBe('content-policy');
      expect(err.message).toMatch(/content-policy grounds/);
    });

    it('anything else reports the status and the provider message', async () => {
      const err = await failWith(404, oaError('model_not_found', 'The model does not exist'));
      expect(err.kind).toBe('bad-response');
      expect(err.message).toBe('OpenAI error (404): The model does not exist');
    });

    it('a 5xx is a network fault, not a bad response', async () => {
      const err = await failWith(503, oaError('server_error', 'Service unavailable'));
      expect(err.kind).toBe('network');
    });

    it('classifies the same way from testKey', async () => {
      fetchMock.mockImplementation(okAlways(oaError('insufficient_quota', 'no quota'), 429));
      const err = await rejection(openAiProvider.testKey(KEY, new AbortController().signal));
      expect(err.kind).toBe('no-credit');
    });

    it('turns a thrown network fault into a network error', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(openAiProvider.generate(request(), KEY)).rejects.toMatchObject({ kind: 'network' });
    });

    it('reports a reply with no image data rather than crashing', async () => {
      fetchMock.mockImplementation(okAlways({ data: [{}] }));
      await expect(openAiProvider.generate(request(), KEY)).rejects.toMatchObject({
        kind: 'bad-response',
      });
    });

    it('rejects an over-sized image the provider claims is fine', async () => {
      // 'A' decodes to 0x00, so four chars per three bytes gets past the cap
      // without the cost of encoding ten megabytes one char at a time
      const quads = Math.ceil((MAX_IMAGE_BYTES + 10) / 3);
      fetchMock.mockImplementation(okAlways({ data: [{ b64_json: 'A'.repeat(quads * 4) }] }));
      const err = await rejection(openAiProvider.generate(request(), KEY));
      expect(err.kind).toBe('bad-response');
      expect(err.detail).toMatch(/over the 10 MB limit/);
    });

    it('never puts the key in a message a user could see', async () => {
      const statuses = [401, 403, 429, 400, 404, 503];
      for (const status of statuses) {
        // the body echoes the key back, which a provider is entitled to do
        fetchMock.mockImplementation(
          okAlways({ error: { code: 'x', message: `key ${KEY} rejected for ${KEY}` } }, status),
        );
        const err = await rejection(openAiProvider.generate(request(), KEY));
        expect(err.message, String(status)).not.toContain(KEY);
        expect(err.detail, String(status)).not.toContain(KEY);
        expect(String(err.stack ?? ''), String(status)).not.toContain(KEY);
      }
    });

    it('redacts a key-shaped string even when it is not the key we sent', async () => {
      fetchMock.mockImplementation(
        okAlways(
          { error: { code: 'x', message: 'use sk-proj-AAAAAAAAAAAAAAAAAAAA instead' } },
          404,
        ),
      );
      const err = await rejection(openAiProvider.generate(request(), KEY));
      expect(err.message).not.toContain('sk-proj-AAAAAAAAAAAAAAAAAAAA');
      expect(err.message).toContain('[redacted]');
    });

    it('never echoes an Authorization header back', async () => {
      fetchMock.mockImplementation(
        okAlways({ error: { code: 'x', message: `sent Authorization: Bearer ${KEY}` } }, 404),
      );
      const err = await rejection(openAiProvider.generate(request(), KEY));
      expect(err.message).not.toContain(KEY);
      expect(err.message).toContain('Bearer [redacted]');
    });
  });

  it('cancels through the AbortController', async () => {
    const ctl = new AbortController();
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () =>
            rej(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = openAiProvider.generate(request({ signal: ctl.signal }), KEY);
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('tests a key without generating anything billable', async () => {
    fetchMock.mockImplementation(() => new Response('{"data":[]}', { status: 200 }));
    await openAiProvider.testKey(KEY, new AbortController().signal);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/models');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  it('reports a rejected key from the test call', async () => {
    fetchMock.mockImplementation(okAlways({ error: { message: 'bad key' } }, 401));
    await expect(openAiProvider.testKey(KEY, new AbortController().signal)).rejects.toMatchObject({
      kind: 'invalid-key',
    });
  });

  it('lists current model ids and no retired one', () => {
    expect(openAiProvider.models.length).toBeGreaterThan(0);
    expect(openAiProvider.models).not.toContain('gpt-image-1');
    expect(openAiProvider.models[0]).toBe('gpt-image-1-mini');
  });
});

/* --------------------------------------------------------- draft store */

describe('the draft store', () => {
  const draft = (id: string): DraftImage => ({
    id,
    blob: new Blob([PNG_BYTES], { type: 'image/png' }),
    mime: 'image/png',
    width: 1,
    height: 1,
    prompt: 'a calm mountain at dawn',
    alt: 'A calm mountain at dawn',
    model: 'gpt-image-1-mini',
    createdAt: Date.now(),
  });

  it('round-trips a draft and answers null for one it does not hold', async () => {
    const store = memoryDraftStore();
    const id = newDraftId();
    await store.put(draft(id));
    expect((await store.get(id))?.prompt).toBe('a calm mountain at dawn');
    expect(await store.get('aidraft_nope')).toBeNull();
    expect(await store.keys()).toEqual([id]);
    await store.remove(id);
    expect(await store.get(id)).toBeNull();
  });
});

/* ------------------------------------------------- export and the checks */

describe('an unhosted draft at the export boundary', () => {
  const imageWithDraft = () => {
    const image = mk('image');
    image.values.src = '';
    image.values.alt = 'A calm mountain at dawn';
    image.values.aiDraftId = 'aidraft_abc';
    return image;
  };

  const exported = (design: Design) =>
    renderDesign(resolveForOutput(design, vee, 'export').design);

  it('ships a placeholder https URL, never data: or blob:', () => {
    const html = exported(designWith([imageWithDraft()]));
    expect(html).toContain(AI_DRAFT_PLACEHOLDER_URL.split('?')[0]);
    expect(html).not.toContain('data:');
    expect(html).not.toContain('blob:');
    expect(html).not.toContain('aidraft_abc');
  });

  it('leaves the canvas pass alone, so the real image can still be shown', () => {
    const design = designWith([imageWithDraft()]);
    const preview = resolveForOutput(design, vee, 'preview').design;
    const block = preview.rows[0].columns[0].blocks[0] as BlockOf<'image'>;
    expect(block.values.src).toBe('');
    expect(block.values.aiDraftId).toBe('aidraft_abc');
  });

  it('raises AI_IMAGE_NOT_HOSTED, and the placeholder warning rides along', () => {
    const design = designWith([imageWithDraft()]);
    const out = resolveForOutput(design, vee, 'export');
    const issues = checkDesign(out.design, renderDesign(out.design), vee, {
      knownDrafts: new Set(['aidraft_abc']),
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('AI_IMAGE_NOT_HOSTED');
    expect(codes).toContain('IMAGE_PLACEHOLDER');
    const issue = issues.find((i) => i.code === 'AI_IMAGE_NOT_HOSTED')!;
    expect(issue.severity).toBe('error');
    expect(issue.hint).toMatch(/Download the PNG/);
  });

  it('raises AI_IMAGE_MISSING_DRAFT when this browser does not hold it', () => {
    const design = designWith([imageWithDraft()]);
    const out = resolveForOutput(design, vee, 'export');
    const issues = checkDesign(out.design, renderDesign(out.design), vee, {
      knownDrafts: new Set<string>(),
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('AI_IMAGE_MISSING_DRAFT');
    expect(codes).not.toContain('AI_IMAGE_NOT_HOSTED');
  });

  it('never calls a draft missing when it has not looked', () => {
    const design = designWith([imageWithDraft()]);
    const out = resolveForOutput(design, vee, 'export');
    const codes = checkDesign(out.design, renderDesign(out.design), vee).map((i) => i.code);
    expect(codes).not.toContain('AI_IMAGE_MISSING_DRAFT');
    expect(codes).toContain('AI_IMAGE_NOT_HOSTED');
  });

  it('gives both codes stable ids across runs', () => {
    const design = designWith([imageWithDraft()]);
    const run = () => {
      const out = resolveForOutput(design, vee, 'export');
      return checkDesign(out.design, renderDesign(out.design), vee, {
        knownDrafts: new Set(['aidraft_abc']),
      }).find((i) => i.code === 'AI_IMAGE_NOT_HOSTED')!.id;
    };
    expect(run()).toBe(run());
  });

  it('finds drafts on hero cards and article items too', () => {
    const hero = mk('hero');
    hero.values.layout = 'cards-2';
    hero.values.cards[0].aiDraftId = 'aidraft_card';
    const articles = mk('articles');
    articles.values.items[0].aiDraftId = 'aidraft_item';

    const out = resolveForOutput(designWith([hero, articles]), vee, 'export');
    const codes = checkDesign(out.design, renderDesign(out.design), vee, {
      knownDrafts: new Set<string>(),
    }).map((i) => i.code);
    expect(codes.filter((c) => c === 'AI_IMAGE_MISSING_DRAFT')).toHaveLength(2);
  });
});
