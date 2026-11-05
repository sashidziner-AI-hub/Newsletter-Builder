import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_TEXT_CONSENT_STORAGE_KEY,
  grantTextConsent,
  hasTextConsent,
} from '../lib/ai/text-consent';
import { pickAutoPreset } from '../lib/ai/preset-selection';
import { PRESETS } from '../lib/presets';
import type { BriefGoal } from '../lib/ai/brief-types';

describe('text-consent', () => {
  beforeEach(() => localStorage.removeItem(AI_TEXT_CONSENT_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(AI_TEXT_CONSENT_STORAGE_KEY));

  it('starts false for an unknown provider, and true once granted', () => {
    expect(hasTextConsent('openai')).toBe(false);
    grantTextConsent('openai');
    expect(hasTextConsent('openai')).toBe(true);
  });

  it('is per provider — granting one does not grant another', () => {
    grantTextConsent('openai');
    expect(hasTextConsent('some-other-provider')).toBe(false);
  });

  it('persists across a fresh read of storage', () => {
    grantTextConsent('openai');
    // readGranted() re-parses localStorage every call; nothing is cached
    expect(hasTextConsent('openai')).toBe(true);
    expect(localStorage.getItem(AI_TEXT_CONSENT_STORAGE_KEY)).toContain('openai');
  });

  it('tolerates corrupt storage rather than throwing', () => {
    localStorage.setItem(AI_TEXT_CONSENT_STORAGE_KEY, 'not json');
    expect(hasTextConsent('openai')).toBe(false);
  });
});

describe('pickAutoPreset', () => {
  const presetIds = new Set(PRESETS.map((p) => p.id));

  it('maps every brief goal to a real preset id', () => {
    const goals: BriefGoal[] = ['inform', 'promote', 'announce', 'welcome', 'outreach'];
    for (const goal of goals) {
      const id = pickAutoPreset(goal);
      expect(presetIds.has(id), `${goal} -> ${id}`).toBe(true);
    }
  });

  it('gives each goal a distinct, sensibly-matched preset', () => {
    expect(pickAutoPreset('welcome')).toBe('welcome');
    expect(pickAutoPreset('promote')).toBe('promotional');
    expect(pickAutoPreset('outreach')).toBe('cold-outreach');
  });
});
