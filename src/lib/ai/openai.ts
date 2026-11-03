/**
 * The OpenAI image adapter (5A) — the only provider implemented.
 *
 * Verified against the API on 2026-11-02 rather than from memory:
 *
 *   - `POST /v1/images/generations` answers a CORS preflight with
 *     `access-control-allow-origin: *` and `access-control-allow-headers:
 *     authorization,content-type`. A browser can call it directly, and may
 *     send *only* those two headers — an `OpenAI-Organization` header or any
 *     telemetry header would fail the preflight, so none is sent.
 *   - the GPT image models always answer in base64 (`data[].b64_json`).
 *     `response_format` is deprecated and unsupported for them, so there is no
 *     second cross-origin fetch of a returned URL.
 *   - `GET /v1/models` is also browser-callable, which is what makes a free
 *     "Test connection" possible without generating a billable image.
 *
 * Model ids come from the current spec-generated SDK. `gpt-image-1` is no
 * longer among them.
 */

import {
  AiError,
  type GenerateRequest,
  type GenerateResult,
  type ImageProvider,
  REQUEST_TIMEOUT_MS,
  normalizeKey,
  redactKeys,
  toAiError,
} from './provider';
import { decodeBase64, readPngSize, toImageBlob } from './validate';

const BASE = 'https://api.openai.com/v1';

/** Newest first; the first entry is the panel's default. */
export const OPENAI_MODELS = [
  'gpt-image-1-mini',
  'gpt-image-1.5',
  'gpt-image-2',
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-flare',
  'chatgpt-image-latest',
] as const;

/** The sizes the API documents. Anything else is a custom request that may 400. */
const SQUARE = '1024x1024';
const LANDSCAPE = '1536x1024';
const PORTRAIT = '1024x1536';

/**
 * An aspect choice as a `WIDTHxHEIGHT` string, plus the documented size to fall
 * back to if the model refuses a custom one. 16:9 and 4:3 have no documented
 * equivalent, so they are the two that can fall back.
 */
function sizeFor(req: GenerateRequest): { size: string; fallback: string } {
  switch (req.aspect) {
    case '1:1':
      return { size: SQUARE, fallback: SQUARE };
    case '3:2':
      return { size: LANDSCAPE, fallback: LANDSCAPE };
    case '16:9':
      return { size: '1536x864', fallback: LANDSCAPE };
    case '4:3':
      return { size: '1365x1024', fallback: LANDSCAPE };
    case 'match':
    default:
      // a full-width block reads as landscape, a narrow column as a portrait,
      // and anything between as a square
      if (req.blockWidth >= 480) return { size: LANDSCAPE, fallback: LANDSCAPE };
      if (req.blockWidth > 0 && req.blockWidth < 220) {
        return { size: PORTRAIT, fallback: PORTRAIT };
      }
      return { size: SQUARE, fallback: SQUARE };
  }
}

/** Only ever these two. See the header comment. */
function headers(key: string): HeadersInit {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/** The shape OpenAI reports failures in. Every field is optional in practice. */
interface OpenAiErrorBody {
  error?: { code?: string; type?: string; message?: string };
}

/** `error.code`, falling back to `error.type`, lowercased. '' when absent. */
function errorCodeOf(body: string): { code: string; message: string } {
  try {
    const parsed = JSON.parse(body) as OpenAiErrorBody;
    const code = (parsed.error?.code || parsed.error?.type || '').toLowerCase();
    return { code, message: (parsed.error?.message || '').trim() };
  } catch {
    return { code: '', message: '' };
  }
}

/**
 * Map a failed response by HTTP status and `error.code`.
 *
 * Two of these surface OpenAI's own `error.message`, because for a permissions
 * or an unrecognised failure their wording says more than anything generic we
 * could write. That text is provider-controlled, so it goes through
 * `redactKeys()` with the key we just sent: an error body is free to quote the
 * request back, and a 403 about an organization is exactly where that happens.
 * Nothing else from the response is ever shown — no headers, no Authorization
 * value, no raw body.
 */
async function classify(res: Response, key = ''): Promise<AiError> {
  let body = '';
  try {
    body = (await res.text()).slice(0, 4000);
  } catch {
    // a body we cannot read is still a status we can classify
  }
  const { code, message } = errorCodeOf(body);
  const safe = redactKeys(message, key);
  const lower = `${code} ${body}`.toLowerCase();

  if (res.status === 401) {
    return new AiError(
      'invalid-key',
      code || 'invalid_api_key',
      'OpenAI rejected the key. Check for typos or extra spaces, or create a new key.',
    );
  }

  if (res.status === 403) {
    return new AiError(
      'forbidden',
      'This key or organization may not be allowed to use this image model.',
      safe || 'OpenAI refused this request (403).',
    );
  }

  if (res.status === 429) {
    if (code.includes('insufficient_quota') || lower.includes('insufficient_quota')) {
      return new AiError(
        'no-credit',
        code || 'insufficient_quota',
        'No API credits. Add billing credit in your OpenAI account.',
      );
    }
    return new AiError('rate-limit', code || 'rate_limit');
  }

  if (
    code.includes('content_policy') ||
    lower.includes('content_policy') ||
    lower.includes('content policy') ||
    lower.includes('safety system') ||
    lower.includes('moderation')
  ) {
    return new AiError('content-policy', code || 'content_policy_violation');
  }

  if (res.status >= 500) {
    return new AiError('network', `OpenAI returned ${res.status}`);
  }

  return new AiError(
    'bad-response',
    code,
    `OpenAI error (${res.status})${safe ? `: ${safe}` : ''}`,
  );
}

/** A timeout that also honours the caller's Cancel. */
function withTimeout(signal: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctl.abort(new AiError('timeout')), REQUEST_TIMEOUT_MS);
  return {
    signal: ctl.signal,
    done: () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    },
  };
}

interface ImagesResponse {
  data?: { b64_json?: string; url?: string }[];
  size?: string;
}

async function requestImage(
  key: string,
  model: string,
  prompt: string,
  size: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: headers(key),
    signal,
    body: JSON.stringify({
      model,
      prompt,
      size,
      n: 1,
      output_format: 'png',
    }),
  });
}

export const openAiProvider: ImageProvider = {
  id: 'openai',
  name: 'OpenAI',
  models: OPENAI_MODELS,

  /** Free: lists models rather than generating anything billable. */
  async testKey(rawKey, signal) {
    // a pasted key often carries a trailing newline or a stray space
    const key = normalizeKey(rawKey);
    const t = withTimeout(signal);
    try {
      const res = await fetch(`${BASE}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        signal: t.signal,
      });
      if (!res.ok) throw await classify(res, key);
      // drain so the connection is reusable
      await res.text();
    } catch (e) {
      throw toAiError(e);
    } finally {
      t.done();
    }
  },

  async generate(req, rawKey) {
    const key = normalizeKey(rawKey);
    const prompt = req.prompt.trim();
    if (!prompt) throw new AiError('bad-response', 'empty prompt');

    const { size, fallback } = sizeFor(req);
    const t = withTimeout(req.signal);
    try {
      let res = await requestImage(key, req.model, prompt, size, t.signal);

      // 16:9 and 4:3 are custom sizes; a model that will not take one gets the
      // nearest documented size rather than an error the user cannot act on
      if (!res.ok && res.status === 400 && size !== fallback) {
        res = await requestImage(key, req.model, prompt, fallback, t.signal);
      }
      if (!res.ok) throw await classify(res, key);

      let payload: ImagesResponse;
      try {
        payload = (await res.json()) as ImagesResponse;
      } catch {
        throw new AiError('bad-response', 'reply was not JSON');
      }

      const b64 = payload.data?.[0]?.b64_json;
      if (typeof b64 !== 'string' || !b64) {
        throw new AiError('bad-response', 'reply carried no image data');
      }

      const bytes = decodeBase64(b64);
      const { blob, mime } = toImageBlob(bytes);
      const { width, height } = readPngSize(bytes);
      return { blob, mime, width, height } satisfies GenerateResult;
    } catch (e) {
      throw toAiError(e);
    } finally {
      t.done();
    }
  },
};

/** The registry. A second provider is one import and one entry. */
export const PROVIDERS: readonly ImageProvider[] = [openAiProvider];

export function providerById(id: string): ImageProvider | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}
