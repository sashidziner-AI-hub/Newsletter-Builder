import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearModelAccessDenied,
  deniedModelFor,
  recordModelAccessDenied,
  resetModelAccessForTests,
} from '../lib/ai/model-access';
import { isModelAccessError, resetGuardsForTests, runTask } from '../lib/ai/run-task';
import { AiError } from '../lib/ai/provider';
import { setTaskRoute, loadTaskSettings } from '../lib/ai/task-settings';
import { clearAllKeys, markConnected, saveKey, setActiveProvider } from '../lib/ai/key-store';

const KEY = 'sk-test-DO-NOT-LEAK-abcdef123456';

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setupKey() {
  saveKey('openai', 'unused', KEY, true);
  setActiveProvider('openai');
  markConnected('openai', true);
}

beforeEach(() => {
  localStorage.clear();
  clearAllKeys();
  resetGuardsForTests();
  resetModelAccessForTests();
});

describe('model-access.ts — the per-task denial record', () => {
  it('deniedModelFor is null before anything is recorded', () => {
    expect(deniedModelFor('text.brief', 'gpt-4.1-mini')).toBeNull();
  });

  it('matches only when the task AND the model match', () => {
    recordModelAccessDenied('text.brief', 'gpt-4.1-mini');
    expect(deniedModelFor('text.brief', 'gpt-4.1-mini')).toBe('gpt-4.1-mini');
    // a different task is unaffected
    expect(deniedModelFor('image.generate', 'gpt-4.1-mini')).toBeNull();
    // a different (current) model for the SAME task is unaffected — this is
    // what "clear it when the model is changed" means in practice: nothing
    // needs to be deleted, it just stops matching
    expect(deniedModelFor('text.brief', 'gpt-5.4-mini')).toBeNull();
  });

  it('clearModelAccessDenied removes the record outright', () => {
    recordModelAccessDenied('text.brief', 'gpt-4.1-mini');
    clearModelAccessDenied('text.brief');
    expect(deniedModelFor('text.brief', 'gpt-4.1-mini')).toBeNull();
  });

  it('switching back to a previously-denied model shows the denial again', () => {
    recordModelAccessDenied('text.brief', 'gpt-4.1-mini');
    expect(deniedModelFor('text.brief', 'gpt-5.4-mini')).toBeNull(); // switched away
    expect(deniedModelFor('text.brief', 'gpt-4.1-mini')).toBe('gpt-4.1-mini'); // switched back
  });
});

describe('isModelAccessError', () => {
  it('is true for a forbidden (403) error', () => {
    expect(isModelAccessError(new AiError('forbidden'))).toBe(true);
  });

  it('is true when the message/detail names a model-access problem, regardless of kind', () => {
    expect(
      isModelAccessError(new AiError('bad-response', '', 'The model `gpt-x` does not exist or you do not have access to it.')),
    ).toBe(true);
    expect(isModelAccessError(new AiError('bad-response', 'model_not_found', ''))).toBe(true);
  });

  it('is false for unrelated error kinds/messages', () => {
    expect(isModelAccessError(new AiError('rate-limit'))).toBe(false);
    expect(isModelAccessError(new AiError('network'))).toBe(false);
    expect(isModelAccessError(new AiError('invalid-key'))).toBe(false);
    expect(isModelAccessError(new AiError('bad-response', '', 'The server returned malformed JSON.'))).toBe(false);
  });
});

describe('runTask — recording and clearing a model-access denial', () => {
  const textReq = () => ({
    system: 's',
    user: 'u',
    schema: {},
    schemaName: 't',
    maxOutputTokens: 10,
    signal: new AbortController().signal,
  });

  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a 403 from a real call records the denial for that task + model', async () => {
    setupKey();
    fetchMock.mockImplementation(() => okResponse({ error: { code: 'insufficient_permissions' } }, 403));

    await expect(runTask('text.brief', textReq())).rejects.toThrow();
    expect(deniedModelFor('text.brief', loadTaskSettings()['text.brief'].model)).toBe(
      loadTaskSettings()['text.brief'].model,
    );
  });

  it('a successful call clears a previously-recorded denial for that task', async () => {
    setupKey();
    const model = loadTaskSettings()['text.brief'].model;
    recordModelAccessDenied('text.brief', model);
    fetchMock.mockImplementation(() =>
      okResponse({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }),
    );

    await runTask('text.brief', textReq());
    expect(deniedModelFor('text.brief', model)).toBeNull();
  });

  it('changing the model stops the old denial from matching, with no call required', async () => {
    setupKey();
    const oldModel = loadTaskSettings()['text.brief'].model;
    recordModelAccessDenied('text.brief', oldModel);
    setTaskRoute('text.brief', { ...loadTaskSettings()['text.brief'], model: 'gpt-5.4-mini' });
    expect(deniedModelFor('text.brief', loadTaskSettings()['text.brief'].model)).toBeNull();
  });

  it('a non-model-access failure (rate limit) does not record a denial', async () => {
    setupKey();
    fetchMock.mockImplementation(() => okResponse({ error: { code: 'rate_limit_exceeded' } }, 429));

    await expect(runTask('text.brief', textReq())).rejects.toThrow();
    expect(deniedModelFor('text.brief', loadTaskSettings()['text.brief'].model)).toBeNull();
  });
});
