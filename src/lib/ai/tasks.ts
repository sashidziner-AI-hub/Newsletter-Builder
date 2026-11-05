/**
 * The task registry (6B) — the one place that knows which AI features exist,
 * what each needs, and what it defaults to. Adding a task (e.g. a future
 * `text.subject_lines`) is one new id in `AiTaskId` and one new entry in
 * `AI_TASKS`; nothing else in this file, or in `run-task.ts`, needs to know
 * about it specifically.
 *
 * `providersFor(capability)` is what makes "providers declare which
 * capabilities/models they support" true without touching `ImageProvider`/
 * `TextProvider` at all — it's derived entirely from which registry
 * (`PROVIDERS` vs `TEXT_PROVIDERS`) a provider is already in, plus its own
 * `models` list, which both interfaces already carry.
 */

import { PROVIDERS } from './openai';
import { TEXT_PROVIDERS } from './openai-text';

export type AiCapability = 'text' | 'image';

export type AiTaskId = 'text.brief' | 'image.generate';

/** Friendly enum exposed to the UI; mapped to the real numeric API value at the call site. */
export type TextTemperature = 'low' | 'medium' | 'high';
export const TEXT_TEMPERATURE_VALUE: Record<TextTemperature, number> = {
  low: 0.3,
  medium: 0.7,
  high: 1.0,
};

export interface TextTaskOptions {
  temperature: TextTemperature;
}
export interface ImageTaskOptions {
  quality: 'low' | 'medium' | 'high';
}

export interface AiTaskDef {
  id: AiTaskId;
  label: string;
  capability: AiCapability;
  defaultProviderId: string;
  defaultModel: string;
  defaultOptions: TextTaskOptions | ImageTaskOptions;
  /** the task-settings.ts storage key for this task's route */
  settingsKey: string;
}

export const AI_TASKS: Record<AiTaskId, AiTaskDef> = {
  'text.brief': {
    id: 'text.brief',
    label: 'Generate from brief',
    capability: 'text',
    defaultProviderId: 'openai',
    defaultModel: 'gpt-6-luna',
    defaultOptions: { temperature: 'low' },
    settingsKey: 'text.brief',
  },
  'image.generate': {
    id: 'image.generate',
    label: 'AI image generation',
    capability: 'image',
    defaultProviderId: 'openai',
    defaultModel: 'gpt-image-2.6-flare',
    defaultOptions: { quality: 'medium' },
    settingsKey: 'image.generate',
  },
};

export const ALL_TASK_IDS: readonly AiTaskId[] = Object.keys(AI_TASKS) as AiTaskId[];

export interface CapabilityProvider {
  providerId: string;
  name: string;
  capability: AiCapability;
  models: readonly string[];
}

/** Every provider that supports the given capability, with its own model list. */
export function providersFor(capability: AiCapability): CapabilityProvider[] {
  if (capability === 'image') {
    return PROVIDERS.map((p) => ({ providerId: p.id, name: p.name, capability: 'image' as const, models: p.models }));
  }
  return TEXT_PROVIDERS.map((p) => ({ providerId: p.id, name: p.name, capability: 'text' as const, models: p.models }));
}

/** Whether `model` is one `providerId` actually declares for `capability` — the guard a free-typed "Other model id" can't bypass by construction for the dropdown, but can for the explicit override. */
export function isKnownModel(capability: AiCapability, providerId: string, model: string): boolean {
  return providersFor(capability).some((p) => p.providerId === providerId && p.models.includes(model));
}
