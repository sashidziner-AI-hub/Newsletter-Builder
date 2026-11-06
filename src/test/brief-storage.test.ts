import { beforeEach, describe, expect, it } from 'vitest';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { findTemplate, saveEmail, updateBriefReviewed } from '../lib/storage';
import { defaultBriefFields, type BriefRecord } from '../lib/ai/brief-types';
import { useEditor } from '../store';
import type { Design } from '../types';

function designWith(title: string): Design {
  const d = emptyDesign();
  d.body.title = title;
  const row = createRow([1]);
  row.columns[0].blocks.push(createBlock('heading'));
  d.rows.push(row);
  return d;
}

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
  useEditor.getState().resetDesign();
});

describe('SavedTemplate.brief', () => {
  it('is null for a hand-built email', () => {
    const { entry } = saveEmail(designWith('Hand-built'));
    expect(entry.brief).toBeNull();
  });

  it('is set on the save that supplies it', () => {
    const { entry } = saveEmail(designWith('AI draft'), { brief: brief() });
    expect(entry.brief?.resolvedPresetId).toBe('promotional');
  });

  it('sticks across a later autosave that does not pass it again', () => {
    const { entry: first } = saveEmail(designWith('AI draft'), { brief: brief() });
    const { entry: second } = saveEmail(designWith('AI draft, edited'), { existingId: first.id });
    expect(second.brief?.resolvedPresetId).toBe('promotional');
  });

  it('round-trips through JSON (listTemplates re-parses localStorage)', () => {
    const { entry } = saveEmail(designWith('AI draft'), { brief: brief({ reviewed: true }) });
    const reloaded = findTemplate(entry.id);
    expect(reloaded?.brief?.reviewed).toBe(true);
    expect(reloaded?.brief?.fields.topic).toBe('Diwali sale');
  });

  it('tolerates a corrupt brief field rather than failing the whole record', () => {
    const { entry } = saveEmail(designWith('AI draft'));
    localStorage.setItem(
      'email-builder:templates:v1',
      JSON.stringify([{ ...entry, brief: { nonsense: true } }]),
    );
    const reloaded = findTemplate(entry.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.brief).toBeNull();
  });
});

describe('updateBriefReviewed', () => {
  it('flips reviewed to true and persists it', () => {
    const { entry } = saveEmail(designWith('AI draft'), { brief: brief({ reviewed: false }) });
    const updated = updateBriefReviewed(entry.id, true);
    expect(updated?.brief?.reviewed).toBe(true);
    expect(findTemplate(entry.id)?.brief?.reviewed).toBe(true);
  });

  it('is a no-op (returns null) for an email with no brief', () => {
    const { entry } = saveEmail(designWith('Hand-built'));
    expect(updateBriefReviewed(entry.id, true)).toBeNull();
  });

  it('is a no-op for an unknown id', () => {
    expect(updateBriefReviewed('not-a-real-id', true)).toBeNull();
  });
});
