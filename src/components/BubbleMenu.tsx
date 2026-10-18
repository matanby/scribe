import React from 'react';
import { BubbleMenu as TipTapBubbleMenu, Editor, useEditorState } from '@tiptap/react';
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
  onEditLink: () => void;
}

export const BubbleMenu: React.FC<BubbleMenuProps> = ({ editor, onEditLink }) => {
  useEditorState({ editor, selector: ({ editor }) => editor?.state, equalityFn: Object.is });
  if (!editor) return null;


  return (
    <TipTapBubbleMenu
      editor={editor}
      pluginKey="textBubbleMenu"
      shouldShow={({ state, editor }) => {
        return !state.selection.empty && !editor.isActive('image') && !editor.isActive('codeBlock');
      }}
      tippyOptions={{ 
        duration: 120, 
        placement: 'top', 
        animation: 'shift-away',
        maxWidth: 'none',
        offset: [0, 8]
      }}
      className="bubble-formatting-menu flex flex-nowrap whitespace-nowrap items-center gap-0.5 p-1 rounded-lg bg-[var(--editor-bg)] backdrop-blur-2xl border border-[var(--border-color)] shadow-2xl z-50 select-none shrink-0"
    >
      <div className="contents" onMouseDown={event => { if (event.button === 0) event.preventDefault(); }}>
      {/* Inline Formatting */}
      <button
        onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleBold().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('bold')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Bold (⌘B)" aria-label="Bold" aria-pressed={editor.isActive('bold')}
      >
        <Bold size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleItalic().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('italic')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Italic (⌘I)" aria-label="Italic" aria-pressed={editor.isActive('italic')}
      >
        <Italic size={13.5} />
      </button>

      <button
        onClick={() => (editor.chain().focus(undefined, { scrollIntoView: false }) as any).toggleUnderline().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('underline')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Underline (⌘U)" aria-label="Underline" aria-pressed={editor.isActive('underline')}
      >
        <UnderlineIcon size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleStrike().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('strike')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Strikethrough" aria-label="Strikethrough" aria-pressed={editor.isActive('strike')}
      >
        <Strikethrough size={13.5} />
      </button>

      <button
        onClick={() => (editor.chain().focus(undefined, { scrollIntoView: false }) as any).toggleHighlight({ color: '#fde047' }).run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('highlight')
            ? 'bg-yellow-400 text-black shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Highlight" aria-label="Highlight" aria-pressed={editor.isActive('highlight')}
      >
        <Highlighter size={13.5} />
      </button>

      <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-1 shrink-0" />

      {/* Headings & Lists */}
      <button
        onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 1 }).run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('heading', { level: 1 })
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Title" aria-label="Title" aria-pressed={editor.isActive('heading', { level: 1 })}
      >
        <Heading1 size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 2 }).run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('heading', { level: 2 })
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Heading" aria-label="Heading" aria-pressed={editor.isActive('heading', { level: 2 })}
      >
        <Heading2 size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleTaskList().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('taskList')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Checklist" aria-label="Checklist" aria-pressed={editor.isActive('taskList')}
      >
        <CheckSquare size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleBulletList().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('bulletList')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Bullet List" aria-label="Bullet List" aria-pressed={editor.isActive('bulletList')}
      >
        <List size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleBlockquote().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('blockquote')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Quote" aria-label="Quote" aria-pressed={editor.isActive('blockquote')}
      >
        <Quote size={13.5} />
      </button>

      <button
        onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleCode().run()}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('code')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Code" aria-label="Code" aria-pressed={editor.isActive('code')}
      >
        <Code size={13.5} />
      </button>

      <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-1 shrink-0" />

      {/* Link Button */}
      <button
        onClick={onEditLink}
        className={`p-1.5 rounded-lg text-xs transition-all shrink-0 ${
          editor.isActive('link')
            ? 'bg-[var(--accent-color)] text-white shadow-xs'
            : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
        title="Edit Link (⌘K)" aria-label="Edit link"
      >
        <LinkIcon size={13.5} />
      </button>
      </div>
    </TipTapBubbleMenu>
  );
};
