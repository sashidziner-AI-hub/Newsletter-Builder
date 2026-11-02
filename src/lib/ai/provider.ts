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
  | 'rate-limit'
  | 'content-policy'
  | 'network'
  | 'timeout'
  | 'bad-response'
  | 'cancelled';

/** Plain messages. None of these can contain a key, because none interpolate one. */
const MESSAGES: Record<AiErrorKind, string> = {
  'invalid-key': 'That API key was rejected. Check it and save it again.',
  'rate-limit': 'The provider is rate-limiting this key. Wait a moment and try again.',
  'content-policy': 'The provider refused this prompt on content-policy grounds. Try rewording it.',
  network: 'Could not reach the provider. Check your connection and try again.',
  timeout: 'The provider did not respond in time. Try again, or pick a faster model.',
  'bad-response': 'The provider returned something that is not a usable image.',
  cancelled: 'Generation cancelled.',
};

export class AiError extends Error {
  readonly kind: AiErrorKind;
  /** extra context for the UI only — never the key, never the raw body */
  readonly detail: string;

  constructor(kind: AiErrorKind, detail = '') {
    super(MESSAGES[kind]);
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

/** How long any single provider call may take. */
export const REQUEST_TIMEOUT_MS = 90_000;

/** The UI allows one generation at a time, no faster than this. */
export const MIN_REQUEST_GAP_MS = 2_000;

/** A provider blob above this is refused unread. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
