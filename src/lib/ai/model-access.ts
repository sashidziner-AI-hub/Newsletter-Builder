/**
 * Session-only "this task's current model was refused by the provider"
 * signal. Set when a real call (a generation, or a text task's Test
 * connection — which is itself a real call) hits a model-access-class
 * error; read by the Settings > AI status chip to show "No access to
 * `<model>`" instead of "Connected".
 *
 * Deliberately not persisted and not provider-wide: it is a live signal
 * about whether THIS session's key can use THIS specific model right now,
 * scoped per task so one task's denial never bleeds into another's chip.
 * Changing the model naturally stops it from matching (`deniedModelFor`
 * only returns a hit when the stored model still equals the task's current
 * one) — the record for the old model is left in place rather than deleted,
 * so switching back to a previously-denied model still shows the denial
 * instead of a misleadingly blank slate.
 */

import type { AiTaskId } from './tasks';

const denied = new Map<AiTaskId, { model: string }>();

export function recordModelAccessDenied(taskId: AiTaskId, model: string): void {
  denied.set(taskId, { model });
}

export function clearModelAccessDenied(taskId: AiTaskId): void {
  denied.delete(taskId);
}

/** The denied model id, only when it's still the task's current model; null otherwise. */
export function deniedModelFor(taskId: AiTaskId, currentModel: string): string | null {
  const entry = denied.get(taskId);
  return entry && entry.model === currentModel ? entry.model : null;
}

/** For tests only. */
export function resetModelAccessForTests(): void {
  denied.clear();
}
