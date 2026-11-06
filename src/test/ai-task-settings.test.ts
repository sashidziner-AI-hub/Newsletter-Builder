import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_TASK_ROUTING_STORAGE_KEY,
  loadTaskSettings,
  resetTaskSettings,
  saveTaskSettings,
  setTaskRoute,
} from '../lib/ai/task-settings';
import { AI_TASKS } from '../lib/ai/tasks';
import { clearAllKeys, saveKey, setActiveProvider } from '../lib/ai/key-store';

beforeEach(() => {
  localStorage.clear();
  clearAllKeys();
});

describe('loadTaskSettings — before anything is configured', () => {
  it('matches each task def default exactly', () => {
    const routes = loadTaskSettings();
    expect(routes['text.brief'].providerId).toBe(AI_TASKS['text.brief'].defaultProviderId);
    expect(routes['text.brief'].model).toBe(AI_TASKS['text.brief'].defaultModel);
    expect(routes['image.generate'].model).toBe(AI_TASKS['image.generate'].defaultModel);
    expect(routes['text.brief'].fallbacks).toEqual([]);
  });
});

describe('migration', () => {
  it('seeds image.generate from the old active provider/model, and persists it', () => {
    saveKey('openai', 'gpt-image-1-mini', 'sk-test-key', true);
    setActiveProvider('openai');

    const routes = loadTaskSettings();
    expect(routes['image.generate'].providerId).toBe('openai');
    expect(routes['image.generate'].model).toBe('gpt-image-1-mini');
    // text.brief had nothing to migrate — stays on its coded default
    expect(routes['text.brief'].model).toBe(AI_TASKS['text.brief'].defaultModel);

    // persisted: raw storage now has a real record, not just a transient read
    expect(localStorage.getItem(AI_TASK_ROUTING_STORAGE_KEY)).not.toBeNull();
  });

  it('is a one-time snapshot — a later key-store change does not retroactively move it', () => {
    saveKey('openai', 'gpt-image-1-mini', 'sk-test-key', true);
    setActiveProvider('openai');
    loadTaskSettings(); // triggers + persists the migration

    saveKey('openai', 'gpt-image-2.6-sunburst', 'sk-test-key', true); // key-store model changes afterward
    expect(loadTaskSettings()['image.generate'].model).toBe('gpt-image-1-mini'); // unchanged
  });

  it('never copies the key itself, only the provider id and model string', () => {
    saveKey('openai', 'gpt-image-1-mini', 'sk-test-super-secret-key', true);
    setActiveProvider('openai');
    const json = JSON.stringify(loadTaskSettings());
    expect(json).not.toContain('sk-test-super-secret-key');
  });

  it('with nothing configured at all, migration is a no-op and defaults apply', () => {
    const routes = loadTaskSettings();
    expect(routes['image.generate'].providerId).toBe(AI_TASKS['image.generate'].defaultProviderId);
    expect(routes['image.generate'].model).toBe(AI_TASKS['image.generate'].defaultModel);
  });
});

describe('setTaskRoute / saveTaskSettings', () => {
  it('changing one task leaves the other untouched', () => {
    const routes = loadTaskSettings();
    setTaskRoute('text.brief', { ...routes['text.brief'], model: 'gpt-5.4-mini' });

    const after = loadTaskSettings();
    expect(after['text.brief'].model).toBe('gpt-5.4-mini');
    expect(after['image.generate'].model).toBe(AI_TASKS['image.generate'].defaultModel);
  });

  it('round-trips a fallback chain', () => {
    const routes = loadTaskSettings();
    const withFallback = {
      ...routes['image.generate'],
      fallbacks: [{ providerId: 'openai', model: 'gpt-image-1-mini' }],
    };
    setTaskRoute('image.generate', withFallback);
    expect(loadTaskSettings()['image.generate'].fallbacks).toEqual([
      { providerId: 'openai', model: 'gpt-image-1-mini' },
    ]);
  });

  it('tolerates corrupt storage rather than throwing', () => {
    localStorage.setItem(AI_TASK_ROUTING_STORAGE_KEY, 'not json');
    expect(loadTaskSettings()['text.brief'].model).toBe(AI_TASKS['text.brief'].defaultModel);
  });

  it('drops a malformed fallback entry rather than failing the whole route', () => {
    saveTaskSettings({
      ...loadTaskSettings(),
      'image.generate': {
        providerId: 'openai',
        model: 'gpt-image-2.6-flare',
        options: {},
        fallbacks: [{ providerId: 'openai', model: 'gpt-image-1-mini' }, { not: 'valid' } as never],
      },
    });
    expect(loadTaskSettings()['image.generate'].fallbacks).toEqual([
      { providerId: 'openai', model: 'gpt-image-1-mini' },
    ]);
  });
});

describe('resetTaskSettings', () => {
  it('restores every task to its default, clearing fallbacks', () => {
    const routes = loadTaskSettings();
    setTaskRoute('text.brief', {
      ...routes['text.brief'],
      model: 'gpt-5.4-mini',
      fallbacks: [{ providerId: 'openai', model: 'gpt-5.4-nano' }],
    });

    const reset = resetTaskSettings();
    expect(reset['text.brief'].model).toBe(AI_TASKS['text.brief'].defaultModel);
    expect(reset['text.brief'].fallbacks).toEqual([]);
    expect(loadTaskSettings()['text.brief'].model).toBe(AI_TASKS['text.brief'].defaultModel);
  });
});
