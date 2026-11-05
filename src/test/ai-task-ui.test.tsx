import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../components/RichTextEditor', () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="rich text" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import App from '../App';
import { useEditor } from '../store';
import { clearAllKeys, markConnected, saveKey, setActiveProvider } from '../lib/ai/key-store';
import { resetGuardsForTests } from '../lib/ai/run-task';
import { loadTaskSettings, resetTaskSettings } from '../lib/ai/task-settings';

const s = () => useEditor.getState();

beforeEach(() => {
  localStorage.clear();
  clearAllKeys();
  resetGuardsForTests();
  resetTaskSettings();
  s().resetDesign();
});
afterEach(cleanup);

const openSettings = () => fireEvent.click(screen.getByLabelText('Settings'));
const openAiSection = () => {
  openSettings();
  fireEvent.click(screen.getByText('AI', { exact: true }));
};

describe('Settings > AI > Models per task', () => {
  it('shows both tasks, each with its own default model', () => {
    render(<App />);
    openAiSection();
    expect(screen.getByRole('heading', { name: 'Generate from brief' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'AI image generation' })).toBeTruthy();
    expect(screen.getByDisplayValue('gpt-4.1-mini')).toBeTruthy();
    expect(screen.getByDisplayValue('gpt-image-2')).toBeTruthy();
  });

  it('each task row only offers models for its own capability', () => {
    render(<App />);
    openAiSection();
    const briefRow = screen.getByRole('heading', { name: 'Generate from brief' }).closest('div')!.parentElement!;
    const imageRow = screen.getByRole('heading', { name: 'AI image generation' }).closest('div')!.parentElement!;

    const briefOptions = within(briefRow)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    const imageOptions = within(imageRow)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);

    expect(briefOptions).toContain('gpt-4.1-mini');
    expect(briefOptions).not.toContain('gpt-image-2');
    expect(imageOptions).toContain('gpt-image-2');
    expect(imageOptions).not.toContain('gpt-4.1-mini');
  });

  it('changing one task model does not change the other, and persists', () => {
    render(<App />);
    openAiSection();
    const briefModelSelect = screen.getByDisplayValue('gpt-4.1-mini');
    fireEvent.change(briefModelSelect, { target: { value: 'gpt-5.4-mini' } });

    expect(loadTaskSettings()['text.brief'].model).toBe('gpt-5.4-mini');
    expect(loadTaskSettings()['image.generate'].model).toBe('gpt-image-2');
  });

  it('Reset to defaults restores both tasks to the exact chosen defaults', () => {
    render(<App />);
    openAiSection();
    fireEvent.change(screen.getByDisplayValue('gpt-4.1-mini'), { target: { value: 'gpt-5.4-mini' } });
    expect(loadTaskSettings()['text.brief'].model).toBe('gpt-5.4-mini');

    fireEvent.click(screen.getByText('Reset to defaults'));
    expect(loadTaskSettings()['text.brief'].model).toBe('gpt-4.1-mini');
    expect(loadTaskSettings()['image.generate'].model).toBe('gpt-image-2');
  });

  it("Test connection for the image task never hits the generation endpoint", async () => {
    saveKey('openai', 'unused', 'sk-test-key', true);
    setActiveProvider('openai');
    markConnected('openai', true);
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve(new Response(JSON.stringify({ data: [{ id: 'gpt-image-2' }] }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    openAiSection();
    const imageRow = screen.getByRole('heading', { name: 'AI image generation' }).closest('div')!.parentElement!;
    fireEvent.click(within(imageRow).getByText('Test connection'));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('generations'))).toBe(false);
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes('/models'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("image Test connection reads \"Key OK, model access not verified until first use.\" when the model isn't listed", async () => {
    saveKey('openai', 'unused', 'sk-test-key', true);
    setActiveProvider('openai');
    markConnected('openai', true);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: [{ id: 'some-other-model' }] }), { status: 200 }))),
    );

    render(<App />);
    openAiSection();
    const imageRow = screen.getByRole('heading', { name: 'AI image generation' }).closest('div')!.parentElement!;
    fireEvent.click(within(imageRow).getByText('Test connection'));

    await vi.waitFor(() =>
      expect(within(imageRow).getByText('Key OK, model access not verified until first use.')).toBeTruthy(),
    );
    vi.unstubAllGlobals();
  });

  it("text Test connection against a 403 flips the chip to \"No access to <model>\" with the hint", async () => {
    saveKey('openai', 'unused', 'sk-test-key', true);
    setActiveProvider('openai');
    markConnected('openai', true);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 'insufficient_permissions' } }), { status: 403 }))),
    );

    render(<App />);
    openAiSection();
    const briefRow = screen.getByRole('heading', { name: 'Generate from brief' }).closest('div')!.parentElement!;
    fireEvent.click(within(briefRow).getByText('Test connection'));

    await vi.waitFor(() => expect(within(briefRow).getByText('No access to gpt-4.1-mini')).toBeTruthy());
    expect(
      within(briefRow).getByText("Choose another model or enable this one in your OpenAI project's Allowed models."),
    ).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('changing the model clears the "No access" chip, and a later successful test restores "Connected"', async () => {
    saveKey('openai', 'unused', 'sk-test-key', true);
    setActiveProvider('openai');
    markConnected('openai', true);
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { code: 'insufficient_permissions' } }), { status: 403 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    openAiSection();
    const briefRow = screen.getByRole('heading', { name: 'Generate from brief' }).closest('div')!.parentElement!;
    fireEvent.click(within(briefRow).getByText('Test connection'));
    await vi.waitFor(() => expect(within(briefRow).getByText('No access to gpt-4.1-mini')).toBeTruthy());

    fireEvent.change(within(briefRow).getByDisplayValue('gpt-4.1-mini'), { target: { value: 'gpt-5.4-mini' } });
    expect(within(briefRow).queryByText(/No access to/)).toBeNull();

    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 })),
    );
    fireEvent.click(within(briefRow).getByText('Test connection'));
    await vi.waitFor(() => expect(within(briefRow).getByText('Connected')).toBeTruthy());
    vi.unstubAllGlobals();
  });
});

describe('BriefForm — not ready / model line', () => {
  it('shows the setup message and no model call when no key is configured', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'New email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate from brief' }));
    expect(screen.getByText(/needs an OpenAI key/)).toBeTruthy();
    expect(screen.getByText('Text model: gpt-4.1-mini')).toBeTruthy();
  });

  it('"Open AI settings" closes the modal and opens Settings > AI', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'New email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate from brief' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open AI settings' }));

    expect(screen.queryByRole('heading', { name: 'New email' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'AI' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Generate from brief' })).toBeTruthy();
  });
});

describe('AiImagePanel — not ready / model line', () => {
  it('opens straight to AI settings (not the composer) when no key is configured', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
    // not ready -> lands on the settings half of the panel, not the chat composer
    expect(screen.getByRole('button', { name: 'Add key' })).toBeTruthy();
  });

  it('shows the not-ready message in the composer too, once toggled there manually', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    fireEvent.click(screen.getByTitle('Add Image'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
    fireEvent.click(screen.getByLabelText('Back to chat'));
    expect(screen.getByText(/needs an OpenAI key/)).toBeTruthy();
    expect(screen.getByText('Image model: gpt-image-2')).toBeTruthy();
  });
});
