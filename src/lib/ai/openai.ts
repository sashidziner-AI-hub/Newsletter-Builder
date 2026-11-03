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

/**
 * The first entry is the panel's default.
 *
 * `gpt-image-2` leads because it is the better image for a marketing hero;
 * `gpt-image-1-mini` stays one line below as the cheap one to iterate on, and
 * the Draft quality setting is the other half of that.
 */
export const OPENAI_MODELS = [
  'gpt-image-2',
  'gpt-image-1-mini',
  'gpt-image-1.5',
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-flare',
  'chatgpt-image-latest',
] as const;

/** The sizes every image model documents. */
const SQUARE = '1024x1024';
const LANDSCAPE = '1536x1024';
const PORTRAIT = '1024x1536';

/**
 * Models that take an arbitrary `WIDTHxHEIGHT`.
 *
 * The spec names gpt-image-2, its dated snapshot, and the 2.5 variants. The
 * constraints it states are: both dimensions divisible by 16, aspect ratio
 * between 1:3 and 3:1, and no larger than 3840x2160.
 */
const ARBITRARY_SIZE = /^gpt-image-2(\.5)?(-|$)/;

/**
 * The size to ask for.
 *
 * Previously 16:9 and 4:3 were sent as custom sizes to every model with a
 * retry behind them. Two things were wrong with that: `1365x1024` is not
 * divisible by 16, so 4:3 was rejected and silently became 3:2; and a model
 * that takes no custom size at all was being asked for one on purpose. Now the
 * exact ratio goes only to models that document it, everything else gets the
 * nearest documented size, and there is nothing to retry.
 */
function sizeFor(req: GenerateRequest): string {
  const arbitrary = ARBITRARY_SIZE.test(req.model);

  switch (req.aspect) {
    case '1:1':
      return SQUARE;
    case '3:2':
      return LANDSCAPE;
    case '16:9':
      return arbitrary ? '1536x864' : LANDSCAPE;
    case '4:3':
      // 1360 is the nearest multiple of 16 to a true 4:3 at this height
      return arbitrary ? '1360x1024' : LANDSCAPE;
    case 'match':
    default:
      // a full-width block reads as landscape, a narrow column as a portrait,
      // and anything between as a square
      if (req.blockWidth >= 480) return LANDSCAPE;
      if (req.blockWidth > 0 && req.blockWidth < 220) return PORTRAIT;
      return SQUARE;
  }
}

/** What the request was, for a diagnostic that can actually be acted on. */
interface Attempt {
  status: number;
  contentType: string;
  elapsedMs: number;
  model: string;
  quality?: string;
  size: string;
}

/** `502 · text/html · 31s · gpt-image-2 / high / 1536x864` */
function describeAttempt(a: Attempt): string {
  const secs = Math.round(a.elapsedMs / 1000);
  const bits = [
    String(a.status || 'no status'),
    a.contentType || 'no content-type',
    `${secs}s`,
    [a.model, a.quality, a.size].filter(Boolean).join(' / '),
  ];
  return bits.join(' \u00b7 ');
}

/**
 * The first 200 characters of a body, as plain text.
 *
 * A proxy or a gateway answers with HTML, which is unreadable in a one-line
 * error, so tags come out and whitespace collapses. Keys are redacted on the
 * way through: this snippet is the one place a response body reaches a human.
 */
function snippet(body: string, key: string): string {
  const text = redactKeys(body, key)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 200 ? `${text.slice(0, 200)}\u2026` : text;
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
async function classify(res: Response, key: string, attempt: Attempt): Promise<AiError> {
  let body = '';
  try {
    body = (await res.text()).slice(0, 4000);
  } catch {
    // a body we cannot read is still a status we can classify
  }
  const { code, message } = errorCodeOf(body);
  const safe = redactKeys(message, key);
  const lower = `${code} ${body}`.toLowerCase();
  const facts = describeAttempt({ ...attempt, contentType: attempt.contentType });
  const detail = (extra = '') => [facts, extra].filter(Boolean).join(' \u2014 ');

  if (res.status === 401) {
    return new AiError(
      'invalid-key',
      detail(code || 'invalid_api_key'),
      'OpenAI rejected the key. Check for typos or extra spaces, or create a new key.',
    );
  }

  if (res.status === 403) {
    return new AiError(
      'forbidden',
      detail('This key or organization may not be allowed to use this image model.'),
      safe || 'OpenAI refused this request (403).',
    );
  }

  if (res.status === 429) {
    if (code.includes('insufficient_quota') || lower.includes('insufficient_quota')) {
      return new AiError(
        'no-credit',
        detail(code || 'insufficient_quota'),
        'No API credits. Add billing credit in your OpenAI account.',
      );
    }
    return new AiError('rate-limit', detail(code || 'rate_limit'));
  }

  // a gateway failure is the expensive one: the image may well have been made
  // and billed, and a retry would pay for it twice
  if (GATEWAY_STATUSES.has(res.status)) {
    return new AiError(
      'network',
      detail(snippet(body, key)),
      'OpenAI gateway timed out. The image may still have been generated and billed; check your OpenAI usage before retrying. Try medium quality or a smaller size.',
    );
  }

  if (
    code.includes('content_policy') ||
    lower.includes('content_policy') ||
    lower.includes('content policy') ||
    lower.includes('safety system') ||
    lower.includes('moderation')
  ) {
    return new AiError('content-policy', detail(code || 'content_policy_violation'));
  }

  if (isHtml(attempt.contentType, body)) {
    return new AiError(
      'bad-response',
      detail(snippet(body, key)),
      'A proxy or firewall returned a web page instead of the API reply.',
    );
  }

  if (!body.trim()) {
    return new AiError('bad-response', detail(), 'The API returned an empty reply.');
  }

  if (res.status >= 500) {
    return new AiError('network', detail(snippet(body, key)), `OpenAI returned ${res.status}.`);
  }

  return new AiError(
    'bad-response',
    detail(snippet(body, key)),
    `OpenAI error (${res.status})${safe ? `: ${safe}` : ''}`,
  );
}

/** Gateways in front of the API, which fail after the work may already be done. */
const GATEWAY_STATUSES = new Set([502, 503, 504, 524]);

function isHtml(contentType: string, body: string): boolean {
  return /text\/html/i.test(contentType) || /^\s*<(?:!doctype|html)\b/i.test(body);
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
  quality: string | undefined,
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
      // omitted entirely when unset, so the model picks its own default
      ...(quality ? { quality } : {}),
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
    const started = Date.now();
    try {
      const res = await fetch(`${BASE}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        signal: t.signal,
      });
      if (!res.ok) {
        throw await classify(res, key, {
          status: res.status,
          contentType: res.headers.get('content-type') ?? '',
          elapsedMs: Date.now() - started,
          model: 'models',
          size: '-',
        });
      }
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

    const size = sizeFor(req);
    const t = withTimeout(req.signal);
    const started = Date.now();

    /** The facts about this one attempt, for any diagnostic below. */
    const attemptOf = (res?: Response): Attempt => ({
      status: res?.status ?? 0,
      contentType: res?.headers.get('content-type') ?? '',
      elapsedMs: Date.now() - started,
      model: req.model,
      quality: req.quality,
      size,
    });

    try {
      // Deliberately one request and no retry: a generation that failed late
      // may already have been produced and billed, and asking again would pay
      // for it twice. Sizes are chosen per model so there is nothing to retry.
      const res = await requestImage(key, req.model, prompt, size, req.quality, t.signal);
      const attempt = attemptOf(res);

      if (!res.ok) throw await classify(res, key, attempt);

      const body = await res.text();
      if (!body.trim()) {
        throw new AiError(
          'bad-response',
          describeAttempt(attempt),
          'The API returned an empty reply.',
        );
      }
      if (isHtml(attempt.contentType, body)) {
        throw new AiError(
          'bad-response',
          `${describeAttempt(attempt)} \u2014 ${snippet(body, key)}`,
          'A proxy or firewall returned a web page instead of the API reply.',
        );
      }

      let payload: ImagesResponse;
      try {
        payload = JSON.parse(body) as ImagesResponse;
      } catch {
        throw new AiError(
          'bad-response',
          `${describeAttempt(attempt)} \u2014 ${snippet(body, key)}`,
          'OpenAI sent a reply that is not JSON.',
        );
      }

      const b64 = payload.data?.[0]?.b64_json;
      if (typeof b64 !== 'string' || !b64) {
        throw new AiError(
          'bad-response',
          `${describeAttempt(attempt)} \u2014 ${snippet(body, key)}`,
          'OpenAI replied without any image data.',
        );
      }

      const bytes = decodeBase64(b64);
      let blob: Blob;
      let mime: string;
      try {
        ({ blob, mime } = toImageBlob(bytes));
      } catch (e) {
        // the bytes arrived but are not an image we accept; say which, and
        // what was asked for, rather than just "not a usable image"
        const why = e instanceof AiError ? e.detail : 'unreadable';
        throw new AiError(
          'bad-response',
          `${describeAttempt(attempt)} \u2014 ${why}`,
          'OpenAI returned something that is not a usable image.',
        );
      }
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
