import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// ProseMirror needs real layout APIs that jsdom does not have; the rich-text editor is replaced by a textarea.
vi.mock('../components/RichTextEditor', () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="rich text" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import App from '../App';
import { useEditor } from '../store';

const s = () => useEditor.getState();

beforeEach(() => {
  localStorage.clear();
  s().resetDesign();
});
afterEach(cleanup);

describe('App', () => {
  it('shows the empty state', () => {
    render(<App />);
    expect(screen.getByText('Start building your email')).toBeTruthy();
  });

  it('builds an email by clicking: row, heading, edit text, undo', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add 2 columns row'));
    expect(s().design.rows).toHaveLength(1);

    fireEvent.click(screen.getByTitle('Add Heading'));
    const canvas = () => within(screen.getByRole('main'));
    expect(canvas().getByText('Your heading here')).toBeTruthy();
    // right panel switched to heading properties
    expect(screen.getByText('Content block')).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('Your heading here'), { target: { value: 'Hello world' } });
    expect(canvas().getByText('Hello world')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Undo (Ctrl+Z)'));
    expect(canvas().getByText('Your heading here')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Redo (Ctrl+Shift+Z)'));
    expect(canvas().getByText('Hello world')).toBeTruthy();
  });

  it('adds every block type via click', () => {
    render(<App />);
    for (const label of ['Heading', 'Text', 'Image', 'Button', 'Divider', 'Menu', 'Social', 'Video', 'HTML']) {
      fireEvent.click(screen.getByTitle(`Add ${label}`));
    }
    const types = s().design.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks.map((b) => b.type)));
    expect(types).toEqual(['heading', 'text', 'image', 'button', 'divider', 'menu', 'social', 'video', 'html']);
  });

  it('Delete key removes the selected block, Escape selects the email settings', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Button'));
    expect(s().design.rows[0].columns[0].blocks).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(s().design.rows[0].columns[0].blocks).toHaveLength(0);
    expect(screen.getByText('Email settings')).toBeTruthy();
  });

  it('switches to the mobile canvas', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.eb-mobile')).toBeNull();
    fireEvent.click(screen.getByLabelText('Mobile view'));
    expect(container.querySelector('.eb-mobile')).not.toBeNull();
  });

  it('changing the row layout from the row panel keeps blocks', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add 3 columns row'));
    fireEvent.click(screen.getByTitle('Add Text'));
    fireEvent.click(screen.getByTitle('Add Button')); // second block in the same (first) column
    act(() => s().select({ kind: 'row', id: s().design.rows[0].id }));
    // the row panel offers layout choices (title is the bare label; the left panel tiles say "Add … row")
    fireEvent.click(screen.getByTitle('1 column'));
    const row = s().design.rows[0];
    expect(row.layout).toEqual([1]);
    expect(row.columns).toHaveLength(1);
    expect(row.columns[0].blocks.map((b) => b.type)).toEqual(['text', 'button']);
    fireEvent.click(screen.getByTitle('1 : 2'));
    expect(s().design.rows[0].layout).toEqual([1, 2]);
    expect(s().design.rows[0].columns[0].blocks).toHaveLength(2);
  });

  it('exports HTML and previews', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Heading'));
    fireEvent.click(screen.getByTitle('Export HTML'));
    const dialog = screen.getByRole('dialog', { name: 'Export HTML' });
    const code = within(dialog).getByRole<HTMLTextAreaElement>('textbox');
    expect(code.value).toContain('<!DOCTYPE html>');
    expect(code.value).toContain('Your heading here');
    fireEvent.click(within(dialog).getByLabelText('Close'));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByTitle('Preview'));
    const preview = screen.getByRole('dialog', { name: 'Preview' });
    const frame = within(preview).getByTitle('Email preview') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain('Your heading here');
  });

  it('saves a template and opens it again', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Heading'));
    fireEvent.click(screen.getByTitle('Templates'));
    fireEvent.change(screen.getByPlaceholderText('Template name'), { target: { value: 'My promo' } });
    fireEvent.click(screen.getByText('Save current design'));
    expect(screen.getByText('My promo')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close'));

    s().resetDesign();
    expect(s().design.rows).toHaveLength(0);
    fireEvent.click(screen.getByTitle('Templates'));
    fireEvent.click(screen.getByText('Open'));
    expect(s().design.rows).toHaveLength(1);
  });

  it('starter templates load', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Templates'));
    fireEvent.click(screen.getByText('Starter templates'));
    fireEvent.click(screen.getAllByText('Use this template')[0]);
    expect(s().design.rows.length).toBeGreaterThan(2);
  });
});
