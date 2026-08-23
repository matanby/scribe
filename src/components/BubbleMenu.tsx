import React from 'react';
import { BubbleMenu as TipTapBubbleMenu, Editor } from '@tiptap/react';
import { 
  Bold, 
  Italic, 
  Strikethrough, 
  Code, 
  Heading1, 
  Heading2, 
  Heading3,
  List, 
  ListOrdered, 
  CheckSquare, 
  Link as LinkIcon,
  AlignRight,
  AlignLeft,
  Quote
} from 'lucide-react';

interface BubbleMenuProps {
  editor: Editor | null;
}

export const BubbleMenu: React.FC<BubbleMenuProps> = ({ editor }) => {
  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter Link URL:', previousUrl);

    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <TipTapBubbleMenu
      editor={editor}
      tippyOptions={{ duration: 120, placement: 'top', animation: 'shift-away' }}
      className="flex items-center gap-0.5 p-1 rounded-xl bg-white/95 dark:bg-[#252528]/95 backdrop-blur-2xl border border-[var(--border-color)] shadow-2xl z-50 select-none"
    >
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('bold')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Bold (⌘B)"
      >
        <Bold size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('italic')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Italic (⌘I)"
      >
        <Italic size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('strike')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Strikethrough"
      >
        <Strikethrough size={13.5} />
      </button>

      <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('heading', { level: 1 })
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Large Heading"
      >
        <Heading1 size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('heading', { level: 2 })
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Medium Heading"
      >
        <Heading2 size={13.5} />
      </button>

      <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('taskList')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Checklist"
      >
        <CheckSquare size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('bulletList')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Bullet List"
      >
        <List size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('orderedList')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Numbered List"
      >
        <ListOrdered size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('blockquote')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Quote"
      >
        <Quote size={13.5} />
      </button>

      <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-1" />

      {/* RTL / LTR Direction Toggle */}
      <button
        onClick={() => (editor.commands as any).toggleTextDirection()}
        className="p-1.5 rounded-lg text-xs text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-all"
        title="Toggle Text Direction (⌘⇧X)"
      >
        <AlignRight size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('code')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Code"
      >
        <Code size={13.5} />
      </button>

      <button
        onClick={setLink}
        className={`p-1.5 rounded-lg text-xs transition-all ${
          editor.isActive('link')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Link (⌘K)"
      >
        <LinkIcon size={13.5} />
      </button>
    </TipTapBubbleMenu>
  );
};
