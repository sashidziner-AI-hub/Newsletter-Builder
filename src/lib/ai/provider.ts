/**
 * The image-generation provider contract (5A).
 *
 * One interface, one adapter per file. Adding a second provider must mean
 * adding a file and one line to the registry, never touching the panel.
 *
 * Nothing in here knows what an API key looks like beyond "a string the caller
 * supplies per request". Keys are never stored on a provider, never logged and
 * never put in a URL — see `key-store.ts` for where they do live.
 */

/** What the panel offers; the adapter maps these onto the provider's own sizes. */
export type AspectChoice = 'match' | '1:1' | '16:9' | '3:2' | '4:3';

export interface GenerateRequest {
  prompt: string;
  aspect: AspectChoice;
  /** the block's rendered width in px, for 'match' */
  blockWidth: number;
  model: string;
  signal: AbortSignal;
}

export interface GenerateResult {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
}

export interface ImageProvider {
  id: string;
  name: string;
  /** current model ids, newest first; the first is the default */
  models: readonly string[];
  /** a cheap call that proves the key works without generating an image */
  testKey(key: string, signal: AbortSignal): Promise<void>;
  generate(req: GenerateRequest, key: string): Promise<GenerateResult>;
}

/* ------------------------------------------------------------------ errors */

/**
 * Every failure the panel can show, as a closed set, so the UI never has to
 * pattern-match on a provider's prose.
 */
export type AiErrorKind =
  | 'invalid-key'
  | 'forbidden'
  | 'no-credit'
  | 'rate-limit'
  | 'content-policy'
  | 'network'
  | 'timeout'
  | 'bad-response'
  | 'cancelled';

/** Plain messages. None of these can contain a key, because none interpolate one. */
const MESSAGES: Record<AiErrorKind, string> = {
  'invalid-key': 'That API key was rejected. Check it and save it again.',
  forbidden: 'The provider refused this request.',
  'no-credit': 'No API credits. Add billing credit in your provider account.',
  'rate-limit': 'The provider is rate-limiting this key. Wait a moment and try again.',
  'content-policy': 'The provider refused this prompt on content-policy grounds. Try rewording it.',
  network: 'Could not reach the provider. Check your connection and try again.',
  timeout: 'The provider did not respond in time. Try again, or pick a faster model.',
  'bad-response': 'The provider returned something that is not a usable image.',
  cancelled: 'Generation cancelled.',
};

export class AiError extends Error {
  readonly kind: AiErrorKind;
  /** a hint shown under the message; never the key, never the raw body */
  readonly detail: string;

  /**
   * `message` overrides the default for this kind, which is how a provider's
   * own wording reaches the user for the cases where it is more useful than
   * ours. Anything passed here must already have been through `redactKeys()`:
   * a provider is free to echo the request, including the key, back at us.
   */
  constructor(kind: AiErrorKind, detail = '', message?: string) {
    super(message || MESSAGES[kind]);
    this.name = 'AiError';
    this.kind = kind;
    this.detail = detail;
  }
}

export const isAiError = (e: unknown): e is AiError => e instanceof AiError;

/** Anything thrown inside an adapter, normalised. An unknown cause is a network fault. */
export function toAiError(e: unknown): AiError {
  if (isAiError(e)) return e;
  if (e instanceof DOMException && e.name === 'AbortError') return new AiError('cancelled');
  return new AiError('network');
}

/* -------------------------------------------------------------------- misc */

/**
 * Strip anything key-shaped out of text that came from a provider.
 *
 * Two passes, because both matter: the exact key we just sent (which an error
 * body may quote verbatim) and anything else shaped like a secret, so a
 * different key — an organization key, say — cannot ride along either.
 */
export function redactKeys(text: string, key = ''): string {
  let out = text ?? '';
  const trimmed = key.trim();
  if (trimmed.length >= 8) out = out.split(trimmed).join('[redacted]');
  return out
    .replace(/\b(?:sk|rk|org|proj)[-_][A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]');
}

/** A key with every whitespace character removed. Keys never contain any. */
export function normalizeKey(key: string): string {
  return (key ?? '').replace(/\s+/g, '');
}

/** How long any single provider call may take. */
export const REQUEST_TIMEOUT_MS = 90_000;

/** The UI allows one generation at a time, no faster than this. */
export const MIN_REQUEST_GAP_MS = 2_000;

/** A provider blob above this is refused unread. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
