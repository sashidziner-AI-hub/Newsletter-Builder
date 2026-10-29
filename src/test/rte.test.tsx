import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RichTextEditor } from '../components/RichTextEditor';

// jsdom has no layout engine; ProseMirror only needs these to exist.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} };
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = rects;
  Element.prototype.getClientRects = rects;
  document.elementFromPoint = () => null;
});

afterEach(cleanup);

describe('RichTextEditor (real TipTap)', () => {
  it('mounts with the given HTML and reports edits through bold / list commands', async () => {
    const onChange = vi.fn();
    const { container } = render(<RichTextEditor value="<p>Hello</p>" onChange={onChange} />);
    await waitFor(() => expect(container.querySelector('.tiptap')).not.toBeNull());
    expect(container.querySelector('.tiptap')!.innerHTML).toContain('Hello');

    // toolbar exists
    expect(screen.getByTitle('Bold')).toBeTruthy();
    expect(screen.getByTitle('Link')).toBeTruthy();

    // run a command: toggling a bullet list rewrites the document and fires onChange
    await act(async () => {
      fireEvent.click(screen.getByTitle('Bullet list'));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)![0]).toContain('<ul>');
  });

  it('opens the link input', async () => {
    render(<RichTextEditor value="<p>Hello</p>" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByTitle('Link')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Link'));
    expect(screen.getByPlaceholderText('https://…')).toBeTruthy();
  });
});
