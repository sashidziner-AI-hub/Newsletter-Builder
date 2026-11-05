import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// ProseMirror needs real layout APIs that jsdom does not have; the rich-text editor is replaced by a textarea.
vi.mock('../components/RichTextEditor', () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="rich text" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import App from '../App';
import { useEditor } from '../store';
import { DISPLAY_NAME_MAX, getCurrentUser, setDisplayName } from '../lib/user';
import { listTemplates, saveEmail } from '../lib/storage';
import { emptyDesign } from '../lib/defaults';

const s = () => useEditor.getState();

const openSettings = () => fireEvent.click(screen.getByLabelText('Settings'));

beforeEach(() => {
  localStorage.clear();
  s().resetDesign();
});
afterEach(cleanup);

describe('ProfileBar', () => {
  it('shows "Guest" and its initials by default, on every tab', () => {
    render(<App />);
    expect(screen.getByText('Guest')).toBeTruthy();
    expect(screen.getByText('GU')).toBeTruthy();

    fireEvent.click(screen.getByText('Rows'));
    expect(screen.getByText('Guest')).toBeTruthy();
    fireEvent.click(screen.getByText('Images'));
    expect(screen.getByText('Guest')).toBeTruthy();
  });

  it('shows a set display name and its initials', () => {
    setDisplayName('Priya Raman');
    render(<App />);
    expect(screen.getByText('Priya Raman')).toBeTruthy();
    expect(screen.getByText('PR')).toBeTruthy();
  });

  it('truncates a long name visually but keeps it as a tooltip', () => {
    const long = 'A Very Long Display Name That Should Truncate Visually';
    setDisplayName(long);
    const stored = long.slice(0, DISPLAY_NAME_MAX); // setDisplayName itself caps at DISPLAY_NAME_MAX
    render(<App />);
    const nameEl = screen.getByText(stored);
    expect(nameEl.className).toContain('truncate');
    // the enclosing button carries the (capped) name as its title/tooltip
    expect(nameEl.closest('button')?.getAttribute('title')).toBe(stored);
  });

  it('persists the name across a reload (a fresh render re-reads storage)', () => {
    setDisplayName('Priya');
    const { unmount } = render(<App />);
    expect(screen.getByText('Priya')).toBeTruthy();
    unmount();
    render(<App />);
    expect(screen.getByText('Priya')).toBeTruthy();
  });

  it('feeds the saved name into createdBy on a new email', () => {
    setDisplayName('Priya');
    const { entry } = saveEmail(emptyDesign(), { name: 'Test email' });
    expect(entry.createdBy).toBe('Priya');
    expect(entry.updatedBy).toBe('Priya');
    expect(listTemplates().find((t) => t.id === entry.id)?.createdBy).toBe('Priya');
  });
});

describe('Settings hub', () => {
  it('opens the section list from the gear icon, and every section opens', () => {
    render(<App />);
    openSettings();
    expect(screen.getByText('Settings')).toBeTruthy();

    for (const label of ['Profile', 'AI', 'Brands', 'Email defaults', 'Checks', 'Data & storage', 'About']) {
      fireEvent.click(screen.getByText(label));
      expect(screen.getByRole('heading', { name: label })).toBeTruthy();
      fireEvent.click(screen.getByLabelText('Back to Settings'));
      expect(screen.getByText('Settings')).toBeTruthy();
    }
  });

  it('opening via the avatar/name goes straight to Profile', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Guest'));
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy();
  });

  it('Escape inside a section goes back to the list, not out of the hub', () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByText('Profile'));
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Settings')).toBeTruthy(); // back at the list
    expect(screen.queryByRole('heading', { name: 'Profile' })).toBeNull();
  });

  it('Escape at the list level closes the hub entirely, restoring the previous tab', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Images')); // switch off the default Content tab
    openSettings();
    expect(screen.getByText('Settings')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Settings')).toBeNull();
    // the Images tab's own content (not Content's) should be showing again
    expect(screen.getByPlaceholderText('Search by name or tag')).toBeTruthy();
  });

  it('closing the hub (via Back at the list) restores the tab that was active before it opened', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Rows'));
    openSettings();
    fireEvent.click(screen.getByLabelText('Close Settings'));
    expect(screen.queryByText('Settings')).toBeNull();
    expect(screen.getByText('Pick a column layout for a new row.')).toBeTruthy();
  });

  it('the Profile section saves a name that the bottom bar immediately reflects', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Guest'));
    const input = screen.getByLabelText('Display name');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.click(screen.getByText('Save'));
    expect(getCurrentUser().name).toBe('New Name');

    fireEvent.click(screen.getByLabelText('Back to Settings'));
    fireEvent.click(screen.getByLabelText('Close Settings'));
    expect(screen.getByText('New Name')).toBeTruthy();
  });
});
