/**
 * The OpenAI text adapter (6A) — structured JSON output for filling a
 * preset's copy from a brief.
 *
 * Verified against the live API and the SDK source on 2026-11-05, rather than
 * guessed:
 *
 *   - `POST /v1/chat/completions` answers a CORS preflight with
 *     `access-control-allow-headers: authorization,content-type` — the same
 *     two-header budget the image adapter already established, so only those
 *     two are sent here either.
 *   - the structured-output shape is `response_format: { type: 'json_schema',
 *     json_schema: { name, schema, strict: true } }` (quoted from
 *     `openai-node/src/resources/chat/completions/completions.ts`). Under
 *     `strict: true`, every object's `required` must list *all* of its own
 *     properties — `brief-schema.ts` builds the schema with that constraint
 *     already satisfied.
 *   - `max_completion_tokens` is the current field; `max_tokens` is
 *     deprecated and explicitly incompatible with reasoning models.
 *   - `GET /v1/models` is the same free, no-generation "does this key work"
 *     call the image adapter uses — it is an account-level endpoint, not an
 *     image-specific one.
 *
 * Registered with `id: 'openai'` — the *same id* the image provider uses in
 * `openai.ts` — so `loadKey('openai')` in the shared key store returns the
 * one key regardless of which adapter asks for it. The two adapters are never
 * in the same registry (different capabilities, different request/response
 * shapes), but sharing the id is what makes "reuse the existing key store"
 * literal rather than aspirational.
 */

import { AiError, normalizeKey, redactKeys, toAiError } from './provider';
import type { GenerateStructuredRequest, TextProvider } from './text-provider';

const BASE = 'https://api.openai.com/v1';
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Order is display order only — 6B's task routing owns the actual default,
 * not array position. `gpt-6-luna` (added 6B, verified against the live docs
 * on 2026-11-05) is the current non-reasoning small/fast tier recommended for
 * structured-output work. Every entry here is deliberately non-reasoning: the
 * `6.1-terra`/`6.1-sol`/o-series reasoning models can spend their entire
 * output-token budget on hidden reasoning and return an empty message, which
 * a strict-JSON-schema call cannot recover from (no partial-repair, by this
 * feature's own design). Older generations stay listed and selectable.
 */
export const OPENAI_TEXT_MODELS = [
  'gpt-6-luna',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.1-mini',
  'gpt-4.1-mini',
] as const;

function headers(key: string): HeadersInit {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

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

interface OpenAiErrorBody {
  error?: { code?: string; type?: string; message?: string };
}

function errorCodeOf(body: string): { code: string; message: string } {
  try {
    const parsed = JSON.parse(body) as OpenAiErrorBody;
    const code = (parsed.error?.code || parsed.error?.type || '').toLowerCase();
    return { code, message: (parsed.error?.message || '').trim() };
  } catch {
    return { code: '', message: '' };
  }
}

const GATEWAY_STATUSES = new Set([502, 503, 504, 524]);

/**
 * Map a failed response onto the shared error vocabulary. Mirrors the image
 * adapter's `classify()` — same statuses, same "never show request headers
 * or the key" rule, same redaction of any key-shaped text the provider
 * echoes back — kept as a separate, slightly smaller copy here rather than
 * refactoring the already-shipped image adapter to share it.
 */
async function classify(res: Response, key: string): Promise<AiError> {
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
      'This key or organization may not be allowed to use this text model.',
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
  if (GATEWAY_STATUSES.has(res.status)) {
    return new AiError(
      'network',
      `${res.status} · ${res.headers.get('content-type') ?? ''}`,
      'OpenAI gateway timed out. Try again in a moment.',
    );
  }
  if (res.status >= 500) {
    return new AiError('network', `OpenAI returned ${res.status}`);
  }
  return new AiError('bad-response', code, `OpenAI error (${res.status})${safe ? `: ${safe}` : ''}`);
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

export const openAiTextProvider: TextProvider = {
  id: 'openai',
  name: 'OpenAI',
  models: OPENAI_TEXT_MODELS,

  /** Free: lists models rather than spending a generation. */
  async testKey(rawKey, signal) {
    const key = normalizeKey(rawKey);
    const t = withTimeout(signal);
    try {
      const res = await fetch(`${BASE}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        signal: t.signal,
      });
      if (!res.ok) throw await classify(res, key);
      await res.text();
    } catch (e) {
      throw toAiError(e);
    } finally {
      t.done();
    }
  },

  async generateStructured(req: GenerateStructuredRequest, rawKey: string): Promise<unknown> {
    const key = normalizeKey(rawKey);
    const t = withTimeout(req.signal);
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: headers(key),
        signal: t.signal,
        body: JSON.stringify({
          model: req.model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: req.schemaName, schema: req.schema, strict: true },
          },
          max_completion_tokens: req.maxOutputTokens,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        }),
      });
      if (!res.ok) throw await classify(res, key);

      const body = await res.text();
      if (!body.trim()) throw new AiError('bad-response', '', 'The API returned an empty reply.');

      let payload: ChatCompletionResponse;
      try {
        payload = JSON.parse(body) as ChatCompletionResponse;
      } catch {
        throw new AiError('bad-response', '', 'OpenAI sent a reply that is not JSON.');
      }

      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new AiError('bad-response', '', 'OpenAI replied with no content.');
      }

      try {
        return JSON.parse(content);
      } catch {
        throw new AiError('bad-response', '', 'The structured reply was not valid JSON.');
      }
    } catch (e) {
      throw toAiError(e);
    } finally {
      t.done();
    }
  },
};

export const TEXT_PROVIDERS: readonly TextProvider[] = [openAiTextProvider];

export function textProviderById(id: string): TextProvider | null {
  return TEXT_PROVIDERS.find((p) => p.id === id) ?? null;
}

/**
 * A tiny, real, cheap probe (6B) — proves the specific model id is actually
 * callable, unlike `testKey()`'s generic "does this key work at all" check.
 * One-field schema, ~20-token budget: real spend, deliberately small. Reuses
 * `generateStructured` rather than a second fetch, so it goes through the
 * exact same request shape and error classification the real calls do.
 */
export async function testTextModel(model: string, key: string, signal: AbortSignal): Promise<void> {
  await openAiTextProvider.generateStructured(
    {
      system: 'Reply only with the requested JSON.',
      user: 'Return {"ok": true}.',
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      },
      schemaName: 'connection_test',
      model,
      maxOutputTokens: 20,
      signal,
    },
    key,
  );
}
