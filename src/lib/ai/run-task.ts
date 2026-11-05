/**
 * The one entry point every AI call goes through (6B). `runTask` resolves a
 * task's configured provider/model/options/fallback chain from
 * `task-settings.ts`, enforces a per-task one-in-flight guard and the
 * existing 2s floor, calls the right adapter for the task's capability, and
 * — only on a network/timeout/rate-limit class failure — tries the next
 * entry in the fallback chain. Anything else (a bad response, a content-
 * policy refusal, an invalid key, no credit) stops immediately: those are
 * exactly the cases where a different model on the same account wouldn't
 * help, so this is never the blind same-request retry 5A already ruled out.
 */

import {
  AiError,
  type AiErrorKind,
  type AspectChoice,
  type GenerateResult,
  type ImageQuality,
  MIN_REQUEST_GAP_MS,
  toAiError,
} from './provider';
import { isConnected, loadKey } from './key-store';
import { PROVIDERS } from './openai';
import { TEXT_PROVIDERS } from './openai-text';
import {
  AI_TASKS,
  TEXT_TEMPERATURE_VALUE,
  type AiTaskDef,
  type AiTaskId,
  type ImageTaskOptions,
  type TextTaskOptions,
} from './tasks';
import { loadTaskSettings, type FallbackEntry } from './task-settings';

export interface TextTaskInput {
  system: string;
  user: string;
  schema: object;
  schemaName: string;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface ImageTaskInput {
  prompt: string;
  aspect: AspectChoice;
  blockWidth: number;
  /** per-generation override; falls back to the task's configured default quality when omitted */
  quality?: ImageQuality;
  signal: AbortSignal;
}

interface TaskIOMap {
  'text.brief': { input: TextTaskInput; output: unknown };
  'image.generate': { input: ImageTaskInput; output: GenerateResult };
}

/** Candidates (primary first) with a real key on hand, ready to try in order. */
function candidatesFor(taskId: AiTaskId): FallbackEntry[] {
  const route = loadTaskSettings()[taskId];
  return [{ providerId: route.providerId, model: route.model }, ...route.fallbacks];
}

/** Does the task's PRIMARY provider have a key and pass Test connection? Checked before ever calling `runTask`. */
export function isTaskReady(taskId: AiTaskId): boolean {
  const route = loadTaskSettings()[taskId];
  return !!loadKey(route.providerId) && isConnected(route.providerId);
}

/** The model the task will actually use right now — what the UI's "Text/Image model: …" line shows. */
export function currentTaskModel(taskId: AiTaskId): string {
  return loadTaskSettings()[taskId].model;
}

const FALLBACK_TRIGGER: ReadonlySet<AiErrorKind> = new Set(['network', 'timeout', 'rate-limit']);

async function callAdapter(
  def: AiTaskDef,
  candidate: FallbackEntry,
  key: string,
  options: Record<string, unknown>,
  input: unknown,
): Promise<unknown> {
  if (def.capability === 'image') {
    const adapter = PROVIDERS.find((p) => p.id === candidate.providerId);
    if (!adapter) throw new AiError('bad-response', '', `Unknown image provider "${candidate.providerId}".`);
    const req = input as ImageTaskInput;
    const quality = req.quality ?? (options as Partial<ImageTaskOptions>).quality;
    return adapter.generate({ ...req, model: candidate.model, quality }, key);
  }
  const adapter = TEXT_PROVIDERS.find((p) => p.id === candidate.providerId);
  if (!adapter) throw new AiError('bad-response', '', `Unknown text provider "${candidate.providerId}".`);
  const req = input as TextTaskInput;
  const temperature = (options as Partial<TextTaskOptions>).temperature;
  return adapter.generateStructured(
    { ...req, model: candidate.model, temperature: temperature ? TEXT_TEMPERATURE_VALUE[temperature] : undefined },
    key,
  );
}

/* --------------------------------------------------------- per-task guard */

interface GuardState {
  lastSent: number;
  inFlight: boolean;
}

const guards = new Map<AiTaskId, GuardState>();

async function acquireGuard(taskId: AiTaskId): Promise<void> {
  const state = guards.get(taskId) ?? { lastSent: 0, inFlight: false };
  if (state.inFlight) {
    throw new AiError('cancelled', '', 'A generation for this is already running.');
  }
  const since = Date.now() - state.lastSent;
  if (since < MIN_REQUEST_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS - since));
  }
  state.inFlight = true;
  state.lastSent = Date.now();
  guards.set(taskId, state);
}

function releaseGuard(taskId: AiTaskId): void {
  const state = guards.get(taskId);
  if (state) state.inFlight = false;
}

/** For tests only: clears every task's in-flight/throttle state between runs. */
export function resetGuardsForTests(): void {
  guards.clear();
}

/* -------------------------------------------------------------------- run */

export async function runTask<T extends AiTaskId>(
  taskId: T,
  input: TaskIOMap[T]['input'],
): Promise<TaskIOMap[T]['output']> {
  const def = AI_TASKS[taskId];
  const route = loadTaskSettings()[taskId];
  const candidates = candidatesFor(taskId);

  await acquireGuard(taskId);
  try {
    let lastError: AiError | null = null;
    for (const candidate of candidates) {
      const record = loadKey(candidate.providerId);
      if (!record || !isConnected(candidate.providerId)) continue;
      try {
        return (await callAdapter(def, candidate, record.key, route.options, input)) as TaskIOMap[T]['output'];
      } catch (e) {
        const err = toAiError(e);
        if (!FALLBACK_TRIGGER.has(err.kind)) throw err;
        lastError = err;
      }
    }
    throw lastError ?? new AiError('invalid-key', '', `No configured provider for "${def.label}".`);
  } finally {
    releaseGuard(taskId);
  }
}
