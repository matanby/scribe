import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import { CustomTaskItem } from '../extensions/CustomTaskItem';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import { Markdown } from 'tiptap-markdown';
import { BiDiExtension } from '../extensions/BiDiExtension';
import { CleanBackspaceExtension } from '../extensions/CleanBackspaceExtension';
import { BubbleMenu } from './BubbleMenu';
import { FormattingBar } from './FormattingBar';
import { SlashMenu } from './SlashMenu';
import { NoteMeta } from '../types';
import { Calendar, Folder, FileText, AlignRight, CheckCircle2 } from 'lucide-react';

interface EditorProps {
  note: NoteMeta | null;
  onSave: (filePath: string, markdown: string, frontmatter?: Record<string, any>) => Promise<void>;
  onRename: (filePath: string, newTitle: string) => Promise<void>;
  setIsSaving: (saving: boolean) => void;
  setLastSavedText: (text: string) => void;
  externalReloadTrigger?: number;
}

export const Editor: React.FC<EditorProps> = ({
  note,
  onSave,
  onRename,
  setIsSaving,
  setLastSavedText,
  externalReloadTrigger
}) => {
  const [title, setTitle] = useState('');
  const [frontmatter, setFrontmatter] = useState<Record<string, any> | undefined>(undefined);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentNotePathRef = useRef<string | null>(null);

  const isLoadedRef = useRef(false);

  const cleanMarkdownOutput = (raw: string): string => {
    let unescaped = raw
      .replace(/&lt;br&gt;/g, '<br>')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    const lines = unescaped.split('\n');
    const result: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);
      if (i + 2 < lines.length) {
        const currIsList = /^\s*([-*+]|\d+\.)\s+/.test(lines[i]);
        const nextIsEmpty = lines[i + 1].trim() === '';
        const afterIsList = /^\s*([-*+]|\d+\.)\s+/.test(lines[i + 2]);
        if (currIsList && nextIsEmpty && afterIsList) {
          i++; // skip loose blank line between list items
        }
      }
    }
    return result.join('\n');
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false
        }
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'task-list'
        }
      }),
      CustomTaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'task-item'
        }
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-[var(--accent-color)] underline cursor-pointer hover:opacity-80'
        }
      }),
      Table.configure({
        resizable: true
      }),
      TableRow,
      TableHeader,
      TableCell,
      Highlight.configure({
        multicolor: true
      }),
      Underline,
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-xl max-w-full my-3 border border-[var(--border-color)] shadow-sm'
        }
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-'
      }),
      BiDiExtension,
      CleanBackspaceExtension
    ],
    editorProps: {
      attributes: {
        class: 'tiptap ProseMirror focus:outline-none max-w-[720px] mx-auto px-6 py-2'
      }
    },
    onUpdate: ({ editor, transaction }) => {
      // Only auto-save if document actually changed by user action and note is fully loaded
      if (!currentNotePathRef.current || !isLoadedRef.current || !transaction.docChanged) return;
      setIsSaving(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        if (!currentNotePathRef.current) return;
        const rawMarkdown = (editor.storage as any).markdown.getMarkdown();
        const markdown = cleanMarkdownOutput(rawMarkdown);

        // Safety guard: do NOT save empty content over an existing populated note
        if (!markdown.trim() && note && (note.snippet || note.title !== 'Untitled Note')) {
          console.warn('Auto-save skipped: document became unexpectedly empty');
          setIsSaving(false);
          return;
        }

        try {
          await onSave(currentNotePathRef.current, markdown, frontmatter);
          setIsSaving(false);
          setLastSavedText(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        } catch (err) {
          console.error('Error auto-saving:', err);
          setIsSaving(false);
        }
      }, 400);
    }
  });

  // Load note content on selection change with fresh history stack
  useEffect(() => {
    if (!note) {
      setTitle('');
      setFrontmatter(undefined);
      currentNotePathRef.current = null;
      isLoadedRef.current = false;
      editor?.commands.setContent('');
      return;
    }

    currentNotePathRef.current = note.filePath;
    isLoadedRef.current = false;
    setTitle(note.title);

    let isMounted = true;
    window.scribeAPI.readNote(note.filePath).then(({ markdown, frontmatter }) => {
      if (!isMounted || currentNotePathRef.current !== note.filePath) return;
      setFrontmatter(frontmatter);
      if (editor) {
        try {
          // Initialize fresh EditorState so Cmd+Z cannot undo past the loaded note content
          const parser = (editor.storage as any)?.markdown?.parser;
          if (parser) {
            const newDoc = parser.parse(markdown);
            const newState = EditorState.create({
              schema: editor.schema,
              doc: newDoc,
              plugins: editor.state.plugins
            });
            editor.view.updateState(newState);
          } else {
            (editor.commands as any).setContent(markdown, { emitUpdate: false });
          }
        } catch (e) {
          (editor.commands as any).setContent(markdown, { emitUpdate: false });
        }
        setTimeout(() => {
          if (isMounted) isLoadedRef.current = true;
        }, 100);
      }
    }).catch(err => {
      console.error('Failed to read note:', err);
    });

    return () => {
      isMounted = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    };
  }, [note?.filePath, externalReloadTrigger, editor]);

  // Handle note Title rename
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!note) return;

    if (titleTimeoutRef.current) {
      clearTimeout(titleTimeoutRef.current);
    }

    titleTimeoutRef.current = setTimeout(async () => {
      if (!note || !newTitle.trim() || newTitle === note.title) return;
      try {
        await onRename(note.filePath, newTitle.trim());
      } catch (err) {
        console.error('Failed to rename note:', err);
      }
    }, 600);
  };

  // Word count & stats
  const stats = useMemo(() => {
    if (!editor) return { words: 0, characters: 0 };
    const text = editor.getText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const characters = text.length;
    return { words, characters };
  }, [editor?.getText()]);

  if (!note) {
    return (
      <div className="flex-1 h-full bg-[var(--editor-bg)] flex flex-col items-center justify-center text-center p-8 select-none text-[var(--text-secondary)]">
        <FileText size={44} className="opacity-15 mb-3" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">No Note Selected</h2>
        <p className="text-xs opacity-60 max-w-xs">
          Select a note from the left sidebar or press ⌘N to create a new note in Google Drive.
        </p>
      </div>
    );
  }

  const modifiedDate = new Date(note.modifiedAt).toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="flex-1 h-full bg-[var(--editor-bg)] flex flex-col overflow-y-auto relative">
      <FormattingBar editor={editor} />
      <BubbleMenu editor={editor} />
      <SlashMenu editor={editor} />

      <div className="max-w-[720px] w-full mx-auto px-6 pt-7 pb-2">
        {/* Apple Notes Document Metadata Header */}
        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] mb-4 select-none opacity-75">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              <span>{modifiedDate}</span>
            </div>
            {note.folder && note.folder !== '/' && (
              <div className="flex items-center gap-1 font-medium text-[var(--accent-color)]">
                <Folder size={12} />
                <span>{note.folder}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px] opacity-60">
            <span>{stats.words} words</span>
            <span>•</span>
            <span>{stats.characters} chars</span>
          </div>
        </div>

        {/* Note Title Input (Seamlessly auto-aligns for Hebrew / English) */}
        <input
          type="text"
          dir="auto"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled Note"
          className="editor-title-input w-full text-[2.1rem] leading-tight bg-transparent border-none outline-none text-[var(--text-primary)] placeholder-[var(--text-tertiary)] placeholder:opacity-40 mb-3"
        />

        <div className="h-[1px] bg-[var(--border-subtle)] mb-3" />
      </div>

      {/* TipTap Rich Text WYSIWYG Editor */}
      <EditorContent editor={editor} className="flex-1" />
    </div>
  );
};
