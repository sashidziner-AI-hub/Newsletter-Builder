import { describe, expect, it } from 'vitest';
import { AI_TASKS, ALL_TASK_IDS, isKnownModel, providersFor } from '../lib/ai/tasks';
import { openAiProvider, PROVIDERS } from '../lib/ai/openai';
import { openAiTextProvider, TEXT_PROVIDERS } from '../lib/ai/openai-text';

describe('AI_TASKS registry', () => {
  it('has exactly the two tasks the brief names', () => {
    expect(new Set(ALL_TASK_IDS)).toEqual(new Set(['text.brief', 'image.generate']));
  });

  it('text.brief is a text-capability task defaulting to a real text model', () => {
    const t = AI_TASKS['text.brief'];
    expect(t.capability).toBe('text');
    expect(t.defaultProviderId).toBe('openai');
    expect(openAiTextProvider.models).toContain(t.defaultModel);
  });

  it('image.generate is an image-capability task defaulting to a real image model', () => {
    const t = AI_TASKS['image.generate'];
    expect(t.capability).toBe('image');
    expect(t.defaultProviderId).toBe('openai');
    expect(openAiProvider.models).toContain(t.defaultModel);
  });

  it('every task has a distinct settingsKey', () => {
    const keys = ALL_TASK_IDS.map((id) => AI_TASKS[id].settingsKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('providersFor', () => {
  it('returns only image providers for capability "image"', () => {
    const list = providersFor('image');
    expect(list).toHaveLength(PROVIDERS.length);
    expect(list.every((p) => p.capability === 'image')).toBe(true);
    expect(list.map((p) => p.providerId)).toContain('openai');
  });

  it('returns only text providers for capability "text"', () => {
    const list = providersFor('text');
    expect(list).toHaveLength(TEXT_PROVIDERS.length);
    expect(list.every((p) => p.capability === 'text')).toBe(true);
  });

  it('each provider carries its own real model list, not a shared one', () => {
    const image = providersFor('image').find((p) => p.providerId === 'openai')!;
    const text = providersFor('text').find((p) => p.providerId === 'openai')!;
    expect(image.models).toEqual(openAiProvider.models);
    expect(text.models).toEqual(openAiTextProvider.models);
    expect(image.models).not.toEqual(text.models);
  });
});

describe('isKnownModel — the capability guard', () => {
  it('accepts a real image model for the image provider', () => {
    expect(isKnownModel('image', 'openai', 'gpt-image-2.6-flare')).toBe(true);
  });

  it('rejects a text model for the image capability, and vice versa', () => {
    expect(isKnownModel('image', 'openai', 'gpt-6-luna')).toBe(false);
    expect(isKnownModel('text', 'openai', 'gpt-image-2.6-flare')).toBe(false);
  });

  it('rejects an unknown provider id outright', () => {
    expect(isKnownModel('text', 'not-a-real-provider', 'gpt-6-luna')).toBe(false);
  });
});
