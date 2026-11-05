/**
 * The text-generation provider contract (6A), parallel to `ImageProvider`
 * (`provider.ts`). Kept as a separate interface rather than extending
 * `ImageProvider` because the two capabilities share nothing beyond "a
 * provider, a model list, and a way to prove a key works" — `generate` returns
 * image bytes, `generateStructured` returns parsed JSON, and the request
 * shapes don't overlap.
 *
 * `AiError`/`AiErrorKind`/`redactKeys`/`normalizeKey` are reused as-is from
 * `provider.ts` — failure handling does not need a second vocabulary.
 */

export interface GenerateStructuredRequest {
  /** the house rules: facts-only, no HTML, maxChars, language, tone, etc. */
  system: string;
  /** the brief itself, already wrapped in delimited untrusted-data sections */
  user: string;
  /** the JSON Schema the response must satisfy (strict mode) */
  schema: object;
  /** a short name for the schema, required by the API */
  schemaName: string;
  model: string;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface TextProvider {
  id: string;
  name: string;
  /** current model ids, newest/most-capable first; the first is the default */
  models: readonly string[];
  /** a cheap call that proves the key works, without spending a generation */
  testKey(key: string, signal: AbortSignal): Promise<void>;
  /**
   * Returns the parsed JSON body, unvalidated — the caller
   * (`brief-validate.ts`) is responsible for checking it against the slot
   * schema, sanitizing every string, and deciding whether to show it or
   * reject it. This function's job ends at "valid JSON came back."
   */
  generateStructured(req: GenerateStructuredRequest, key: string): Promise<unknown>;
}
