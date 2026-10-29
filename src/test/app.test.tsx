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
import { emptyBrand, veeBrand } from '../lib/brand';

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
    for (const label of [
      'Heading',
      'Text',
      'Image',
      'Button',
      'Divider',
      'Menu',
      'Social',
      'Video',
      'HTML',
      'Header',
      'Hero',
      'Article list',
      'Footer',
    ]) {
      fireEvent.click(screen.getByTitle(`Add ${label}`));
    }
    const types = s().design.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks.map((b) => b.type)));
    expect(types).toEqual([
      'heading',
      'text',
      'image',
      'button',
      'divider',
      'menu',
      'social',
      'video',
      'html',
      'header',
      'hero',
      'articles',
      'footer',
    ]);
  });

  it('Delete key asks first, then removes the selected block', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Button'));
    expect(s().design.rows[0].columns[0].blocks).toHaveLength(1);

    // the key press only opens the dialog — the block survives until confirmed
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(s().design.rows[0].columns[0].blocks).toHaveLength(1);
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Delete this block?')).toBeTruthy();

    fireEvent.click(within(dialog).getByText('Delete'));
    expect(s().design.rows[0].columns[0].blocks).toHaveLength(0);
  });

  it('Delete key cancelled keeps the block', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Button'));
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Cancel'));
    expect(s().design.rows[0].columns[0].blocks).toHaveLength(1);
  });

  it('Escape selects the email settings', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Button'));
    fireEvent.keyDown(window, { key: 'Escape' });
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
    fireEvent.click(screen.getByTitle('Export HTML or plain text'));
    const dialog = screen.getByRole('dialog', { name: 'Export' });
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

  it('presets load from the New email dialog', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('New email'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Blank')).toBeTruthy();

    fireEvent.click(within(dialog).getByText('Newsletter'));
    expect(s().design.rows.length).toBeGreaterThan(2);
    // the preset brought its own subject line
    expect(s().design.body.title).toContain('This month at');
  });

  it('the New email dialog offers a blank start that keeps the brand', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('New email'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Blank'));
    expect(s().design.rows).toHaveLength(0);
    expect(s().design.brandId).toBe('brand_vee');
  });

  describe('replacing a non-empty design', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    afterEach(() => confirmSpy.mockClear());

    /** Fill the canvas via the New email dialog. */
    const loadSomething = () => {
      fireEvent.click(screen.getByTitle('New email'));
      fireEvent.click(within(screen.getByRole('dialog')).getByText('Newsletter'));
    };

    /** Reopen the dialog and pick Blank, which is what now asks to replace. */
    const startBlank = () => {
      fireEvent.click(screen.getByTitle('New email'));
      fireEvent.click(within(screen.getByRole('dialog')).getByText('Blank'));
    };

    it('asks in an in-app dialog instead of window.confirm, and cancelling keeps the design', () => {
      render(<App />);
      loadSomething();
      const rows = s().design.rows.length;

      startBlank();

      // the native dialog must never be used
      expect(confirmSpy).not.toHaveBeenCalled();
      const dialog = screen.getByRole('alertdialog');
      expect(within(dialog).getByText('Replace the current design?')).toBeTruthy();

      fireEvent.click(within(dialog).getByText('Cancel'));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(s().design.rows).toHaveLength(rows);
    });

    it('performs the action once confirmed', () => {
      render(<App />);
      loadSomething();
      expect(s().design.rows.length).toBeGreaterThan(0);

      startBlank();
      fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Replace'));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(s().design.rows).toHaveLength(0);
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('skips the dialog entirely when the canvas is empty', () => {
      render(<App />);
      expect(s().design.rows).toHaveLength(0);
      startBlank();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(s().design.rows).toHaveLength(0);
    });
  });

  describe('brand switcher', () => {
    const acme = () => {
      const b = emptyBrand('Acme Health');
      b.id = 'brand_acme';
      b.tokens.colors.primary = '#0D9488';
      b.tokens.colors.link = '#0D9488';
      b.tokens.colors.page_bg = '#ECFDF5';
      return b;
    };

    beforeEach(() => {
      act(() => useEditor.setState({ brands: [veeBrand(), acme()] }));
      s().resetDesign();
    });

    it('lists the accessible brands and re-themes the canvas without losing content', () => {
      render(<App />);
      // scope colour assertions to the canvas: the property panel also paints
      // brand swatches, which would match either brand's palette
      const canvasHtml = () => screen.getByRole('main').innerHTML;

      const switcher = screen.getByLabelText('Brand') as HTMLSelectElement;
      expect(Array.from(switcher.options).map((o) => o.textContent)).toEqual([
        'Vee Technologies',
        'Acme Health',
      ]);

      fireEvent.click(screen.getByTitle('Add Heading'));
      act(() => s().updateBlock(s().design.rows[0].columns[0].blocks[0].id, { color: 'brand.primary' }));
      expect(canvasHtml()).toContain('#F58220');

      const before = s().design.rows;
      fireEvent.change(switcher, { target: { value: 'brand_acme' } });

      // re-themed...
      expect(s().design.brandId).toBe('brand_acme');
      expect(canvasHtml()).toContain('#0D9488');
      expect(canvasHtml()).not.toContain('#F58220');
      // ...without touching the content
      expect(s().design.rows).toEqual(before);
      expect(within(screen.getByRole('main')).getByText('Your heading here')).toBeTruthy();
    });

    it('falls back to the default brand when the design points at a missing brand', () => {
      act(() => s().setBrandId('brand_gone'));
      render(<App />);
      expect((screen.getByLabelText('Brand') as HTMLSelectElement).value).toBe('brand_vee');
    });

    it('opens the brands manager and shows the seeded brand', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Manage brands'));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Vee Technologies')).toBeTruthy();
      expect(within(dialog).getByText('New brand')).toBeTruthy();
    });
  });

  describe('composite blocks (1B)', () => {
    const blockValues = <T,>(type: string): T => {
      const b = s()
        .design.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
        .find((x) => x.type === type);
      return b!.values as T;
    };

    it('the article list repeater adds, reorders and removes items', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Add Article list'));

      type Items = { items: { id: string; title: string }[] };
      expect(blockValues<Items>('articles').items).toHaveLength(2);
      const originalSecond = blockValues<Items>('articles').items[1].title;

      // add
      fireEvent.click(screen.getByText('Add item'));
      expect(blockValues<Items>('articles').items).toHaveLength(3);

      // reorder: move #2 up, its data must come along
      fireEvent.click(screen.getByLabelText('Move item 2 up'));
      expect(blockValues<Items>('articles').items[0].title).toBe(originalSecond);

      // remove
      fireEvent.click(screen.getByLabelText('Remove item 3'));
      expect(blockValues<Items>('articles').items).toHaveLength(2);
      expect(blockValues<Items>('articles').items[0].title).toBe(originalSecond);
    });

    it('the hero card count follows the chosen layout', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Add Hero'));

      type Cards = { cards: unknown[]; layout: string };
      fireEvent.change(screen.getByLabelText('Arrangement'), { target: { value: 'cards-3' } });
      expect(blockValues<Cards>('hero').cards).toHaveLength(3);

      fireEvent.change(screen.getByLabelText('Arrangement'), { target: { value: 'cards-2' } });
      expect(blockValues<Cards>('hero').cards).toHaveLength(2);
    });

    it('Show footer off dims the footer on the canvas and leaves it out of the export', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Add Footer'));

      // the toggle lives in Email settings
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByText('Email settings')).toBeTruthy();
      expect(s().design.body.showFooter).toBe(true);

      fireEvent.click(screen.getByRole('switch', { name: 'Show footer' }));
      expect(s().design.body.showFooter).toBe(false);
      expect(screen.getByText('Hidden on send')).toBeTruthy();

      // ...and the export drops it
      fireEvent.click(screen.getByTitle('Export HTML or plain text'));
      const html = (screen.getByRole('dialog').querySelector('textarea') as HTMLTextAreaElement).value;
      expect(html).not.toContain('{{unsubscribe_url}}');
    });

    it('marks a missing image alt as required', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Add Hero'));
      const alt = screen.getByLabelText('Image alt text');
      fireEvent.change(alt, { target: { value: '' } });
      expect(screen.getByText(/Required/)).toBeTruthy();
    });
  });

  describe('merge tags, UTM and plain text (2A)', () => {
    /** The text currently shown in the export dialog's active tab. */
    const exportText = () => {
      fireEvent.click(screen.getByTitle('Export HTML or plain text'));
      const value = (screen.getByRole('dialog').querySelector('textarea') as HTMLTextAreaElement)
        .value;
      fireEvent.click(screen.getByLabelText('Close'));
      return value;
    };

    const openSettings = () => {
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByText('Email settings')).toBeTruthy();
    };

    it('inserts a merge tag into a heading from the tag menu', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Add Heading'));

      const field = screen.getByLabelText('Heading text') as HTMLTextAreaElement;
      fireEvent.change(field, { target: { value: 'Hello ' } });
      field.setSelectionRange(6, 6);

      // the panel's insert-tag menu
      fireEvent.click(screen.getAllByLabelText('Insert a merge tag')[0]);
      fireEvent.click(screen.getByText('First name'));

      expect((screen.getByLabelText('Heading text') as HTMLTextAreaElement).value).toBe(
        'Hello {{first_name}}',
      );
    });

    it('switching format changes the export but not the stored content', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Add Heading'));
      fireEvent.change(screen.getByLabelText('Heading text'), {
        target: { value: 'Hello {{first_name}}' },
      });

      expect(exportText()).toContain('Hello {{first_name}}');

      openSettings();
      fireEvent.click(screen.getByText('Merge tags'));
      fireEvent.change(screen.getByLabelText('Merge tag format'), {
        target: { value: 'mailchimp' },
      });

      // the export is converted...
      const html = exportText();
      expect(html).toContain('Hello *|FNAME|*');
      expect(html).not.toContain('{{first_name}}');

      // ...while the stored block is untouched
      const heading = s()
        .design.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
        .find((b) => b.type === 'heading')!;
      expect((heading.values as { text: string }).text).toBe('Hello {{first_name}}');
    });

    it('UTM is off by default and tags links once enabled, sparing unsubscribe', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Add Footer'));
      fireEvent.click(screen.getByTitle('Add Button'));

      expect(s().design.body.utm.enabled).toBe(false);
      expect(exportText()).not.toContain('utm_source');

      openSettings();
      fireEvent.click(screen.getByText('Link tracking'));
      fireEvent.click(screen.getByRole('switch', { name: 'Add UTM parameters' }));
      fireEvent.change(screen.getByLabelText('utm_source'), { target: { value: 'newsletter' } });

      const html = exportText();
      expect(html).toContain('utm_source=newsletter');
      expect(html).toContain('utm_medium=email');
      // the unsubscribe link is left exactly as it was
      expect(html).toContain('href="{{unsubscribe_url}}"');
      expect(html).not.toContain('{{unsubscribe_url}}?utm');
    });

    it('offers a plain-text tab with no HTML in it', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Add Heading'));
      fireEvent.change(screen.getByLabelText('Heading text'), {
        target: { value: 'A plain heading' },
      });

      fireEvent.click(screen.getByTitle('Export HTML or plain text'));
      const dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getByText('Plain text'));

      const value = (
        within(dialog).getByLabelText('Exported plain text') as HTMLTextAreaElement
      ).value;
      expect(value).toContain('A plain heading');
      expect(value).not.toMatch(/<\/?[a-z][^>]*>/i);
    });

    it('sample data previews on the canvas but never in the export', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Add Heading'));
      fireEvent.change(screen.getByLabelText('Heading text'), {
        target: { value: 'Hi {{first_name}}' },
      });

      const canvas = () => screen.getByRole('main').innerHTML;
      expect(canvas()).toContain('{{first_name}}');

      openSettings();
      fireEvent.click(screen.getByText('Merge tags'));
      fireEvent.click(screen.getByRole('switch', { name: 'Preview with sample data' }));

      expect(canvas()).toContain('Hi John');
      expect(canvas()).not.toContain('{{first_name}}');
      // the export still carries the tag
      expect(exportText()).toContain('Hi {{first_name}}');
    });
  });

  it('saving over an existing template name overwrites instead of duplicating', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Add Button'));

    const saveOnce = () => {
      fireEvent.click(screen.getByTitle('Templates'));
      fireEvent.click(screen.getByText('Save current design'));
    };
    // count saved rows inside the Templates modal only, not the canvas toolbars
    const savedCount = () =>
      within(screen.getByRole('dialog')).getAllByLabelText(/^Delete /).length;

    saveOnce();
    expect(savedCount()).toBe(1);
    fireEvent.click(screen.getByLabelText('Close'));

    // same name again: must ask, and must not leave two entries behind
    saveOnce();
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Overwrite')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('Overwrite'));
    expect(savedCount()).toBe(1);
  });
});
