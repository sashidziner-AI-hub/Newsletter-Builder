import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../store';
import { emptyDesign } from '../lib/defaults';
import { findTemplate } from '../lib/storage';
import { defaultBriefFields, type BriefRecord } from '../lib/ai/brief-types';

const s = () => useEditor.getState();

function brief(overrides: Partial<BriefRecord> = {}): BriefRecord {
  return {
    fields: { ...defaultBriefFields(), topic: 'Diwali sale' },
    resolvedPresetId: 'promotional',
    reviewed: false,
    generatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  s().resetDesign();
});

describe('currentBrief', () => {
  it('is null for a blank/new email', () => {
    expect(s().currentBrief).toBeNull();
  });

  it('startNewEmail sets it when given a brief, and clears it when not', () => {
    s().startNewEmail(emptyDesign(), brief());
    expect(s().currentBrief?.resolvedPresetId).toBe('promotional');
    s().startNewEmail(emptyDesign());
    expect(s().currentBrief).toBeNull();
  });

  it('rides along on the first save via saveEmail', () => {
    s().startNewEmail(emptyDesign(), brief());
    s().saveNow();
    const id = s().currentEmailId!;
    expect(findTemplate(id)?.brief?.resolvedPresetId).toBe('promotional');
  });

  it('openEmail restores whatever brief the saved record carries', () => {
    s().startNewEmail(emptyDesign(), brief());
    s().saveNow();
    const saved = findTemplate(s().currentEmailId!)!;

    s().resetDesign(); // leave it, as if the user navigated away
    expect(s().currentBrief).toBeNull();

    s().openEmail(saved);
    expect(s().currentBrief?.resolvedPresetId).toBe('promotional');
  });

  it('markReviewed flips the flag, persists it, and is a no-op without a brief', () => {
    s().startNewEmail(emptyDesign());
    s().markReviewed(); // no brief: nothing to do, must not throw
    expect(s().currentBrief).toBeNull();

    s().startNewEmail(emptyDesign(), brief({ reviewed: false }));
    s().saveNow();
    const id = s().currentEmailId!;

    s().markReviewed();
    expect(s().currentBrief?.reviewed).toBe(true);
    expect(findTemplate(id)?.brief?.reviewed).toBe(true);
  });

  it('runChecks reports AI_DRAFT_UNREVIEWED only while a brief is unreviewed', () => {
    s().startNewEmail(emptyDesign(), brief({ reviewed: false }));
    s().runChecks();
    expect(s().issues.some((i) => i.code === 'AI_DRAFT_UNREVIEWED')).toBe(true);

    s().markReviewed();
    expect(s().issues.some((i) => i.code === 'AI_DRAFT_UNREVIEWED')).toBe(false);
  });
});
