import React from 'react';
import { BubbleMenu as TipTapBubbleMenu, Editor } from '@tiptap/react';
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon,
  Strikethrough, 
  Highlighter,
  Heading1, 
  Heading2, 
  CheckSquare, 
  List, 
  Quote,
  Code, 
  Link as LinkIcon 
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
      tippyOptions={{ 
        duration: 120, 
        placement: 'top', 
        animation: 'shift-away',
        maxWidth: 'none',
        offset: [0, 8]
      }}
      className="flex flex-nowrap whitespace-nowrap items-center gap-0.5 p-1 rounded-2xl bg-white/95 dark:bg-[#252528]/95 backdrop-blur-2xl border border-[var(--border-color)] shadow-2xl z-50 select-none shrink-0"
    >
      {/* Inline Formatting */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
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
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('italic')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Italic (⌘I)"
      >
        <Italic size={13.5} />
      </button>

      <button
        onClick={() => (editor.chain().focus() as any).toggleUnderline().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('underline')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Underline (⌘U)"
      >
        <UnderlineIcon size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('strike')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Strikethrough"
      >
        <Strikethrough size={13.5} />
      </button>

      <button
        onClick={() => (editor.chain().focus() as any).toggleHighlight({ color: '#fde047' }).run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('highlight')
            ? 'bg-yellow-400 text-black shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Highlight"
      >
        <Highlighter size={13.5} />
      </button>

      <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-1 shrink-0" />

      {/* Headings & Lists */}
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('heading', { level: 1 })
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Title"
      >
        <Heading1 size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('heading', { level: 2 })
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Heading"
      >
        <Heading2 size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
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
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('bulletList')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Bullet List"
      >
        <List size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('blockquote')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Quote"
      >
        <Quote size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('code')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Code"
      >
        <Code size={13.5} />
      </button>

      <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-1 shrink-0" />

      {/* Link Button */}
      <button
        onClick={setLink}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('link')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Insert Link (⌘K)"
      >
        <LinkIcon size={13.5} />
      </button>
    </TipTapBubbleMenu>
  );
};
