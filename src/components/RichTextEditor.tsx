import { useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
} from 'lucide-react';

function Btn({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      // keep focus inside the editor when clicking toolbar buttons
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded p-1.5 transition-colors ${
        active ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      link: e.isActive('link'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? '',
    }),
  });

  const openLink = () => {
    setLinkValue((editor.getAttributes('link').href as string | undefined) ?? 'https://');
    setLinkOpen(true);
  };
  const applyLink = () => {
    const href = linkValue.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!href || href === 'https://') chain.unsetLink().run();
    else chain.setLink({ href }).run();
    setLinkOpen(false);
  };

  return (
    <div className="border-b border-slate-200 bg-slate-50">
      <div className="flex flex-wrap items-center gap-0.5 p-1">
        <Btn title="Bold" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={15} />
        </Btn>
        <Btn title="Italic" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={15} />
        </Btn>
        <Btn title="Underline" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon size={15} />
        </Btn>
        <Btn title="Strikethrough" active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={15} />
        </Btn>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <Btn title="Link" active={s.link} onClick={openLink}>
          <LinkIcon size={15} />
        </Btn>
        <Btn title="Bullet list" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={15} />
        </Btn>
        <Btn title="Numbered list" active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={15} />
        </Btn>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <Btn title="Align left" active={s.left} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft size={15} />
        </Btn>
        <Btn title="Align center" active={s.center} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter size={15} />
        </Btn>
        <Btn title="Align right" active={s.right} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight size={15} />
        </Btn>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <label title="Text color" className="flex cursor-pointer items-center rounded p-1 hover:bg-slate-200">
          <input
            type="color"
            aria-label="Text color"
            className="h-5 w-5 cursor-pointer rounded border border-slate-300 bg-white p-0"
            value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#374151'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <Btn
          title="Clear formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().unsetColor().run()}
        >
          <RemoveFormatting size={15} />
        </Btn>
      </div>
      {linkOpen && (
        <div className="flex items-center gap-1.5 border-t border-slate-200 p-1.5">
          <input
            autoFocus
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
            placeholder="https://…"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') setLinkOpen(false);
            }}
          />
          <button
            type="button"
            onClick={applyLink}
            className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setLinkOpen(false)}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-200"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } },
      }),
      TextAlign.configure({ types: ['paragraph'] }),
      TextStyle,
      Color,
    ],
    content: value,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  return (
    <div className="rte overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
