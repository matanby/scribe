import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import { CodeBlockComponent } from './CodeBlockComponent';
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
import { SearchReplaceExtension } from '../extensions/SearchReplaceExtension';
import { BubbleMenu } from './BubbleMenu';
import { FormattingBar } from './FormattingBar';
import { SlashMenu } from './SlashMenu';
import { FindReplaceBar } from './FindReplaceBar';
import { NoteMeta } from '../types';
import { Calendar, Folder, FileText, CheckCircle2 } from 'lucide-react';

const lowlight = createLowlight(common);

interface EditorProps {
  note: NoteMeta | null;
  onSave: (filePath: string, markdown: string, frontmatter?: Record<string, any>) => Promise<void>;
  onRename: (filePath: string, newTitle: string) => Promise<void>;
  setIsSaving: (saving: boolean) => void;
  setLastSavedText: (text: string) => void;
  externalReloadTrigger?: number;
}

interface TipTapNoteEditorProps {
  note: NoteMeta;
  initialMarkdown: string;
  initialFrontmatter?: Record<string, any>;
  onSave: (filePath: string, markdown: string, frontmatter?: Record<string, any>) => Promise<void>;
  onRename: (filePath: string, newTitle: string) => Promise<void>;
  setIsSaving: (saving: boolean) => void;
  setLastSavedText: (text: string) => void;
}

const TipTapNoteEditor: React.FC<TipTapNoteEditorProps> = ({
  note,
  initialMarkdown,
  initialFrontmatter,
  onSave,
  onRename,
  setIsSaving,
  setLastSavedText
}) => {
  const [title, setTitle] = useState(note.title);
  const [frontmatter, setFrontmatter] = useState(initialFrontmatter);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [showReplaceMode, setShowReplaceMode] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard shortcut listeners for Find (⌘F) and Find/Replace (⌘⇧F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (e.shiftKey || e.altKey) {
          setShowReplaceMode(true);
          setIsFindOpen(true);
        } else {
          setShowReplaceMode(false);
          setIsFindOpen(true);
        }
      }
    };

    const unsubscribeMenuFind = window.scribeAPI.onMenuEvent?.('menu:find', () => {
      setShowReplaceMode(false);
      setIsFindOpen(true);
    });

    const unsubscribeMenuFindReplace = window.scribeAPI.onMenuEvent?.('menu:findReplace', () => {
      setShowReplaceMode(true);
      setIsFindOpen(true);
    });

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unsubscribeMenuFind?.();
      unsubscribeMenuFindReplace?.();
    };
  }, []);

  // Initialize TipTap with initialMarkdown as the root document (history depth = 0)
  const editor = useEditor({
    content: initialMarkdown,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
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
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockComponent);
        }
      }).configure({
        lowlight,
        defaultLanguage: null
      }),
      TaskList.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            tight: {
              default: true,
              parseHTML: () => true,
              renderHTML: () => ({ 'data-tight': 'true' })
            }
          };
        },
        addStorage() {
          return {
            markdown: {
              serialize(state: any, node: any) {
                return state.renderList(node, "  ", () => "- ");
              },
              parse: {
                updateDOM(element: HTMLElement) {
                  element.querySelectorAll('.contains-task-list').forEach((list: any) => {
                    list.setAttribute('data-type', 'taskList');
                    list.setAttribute('data-tight', 'true');
                  });
                }
              }
            }
          };
        }
      }).configure({
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
        html: true,
        tightLists: true,
        bulletListMarker: '-'
      }),
      BiDiExtension,
      CleanBackspaceExtension,
      SearchReplaceExtension
    ],
    editorProps: {
      attributes: {
        class: 'tiptap ProseMirror focus:outline-none max-w-[720px] mx-auto px-6 py-2'
      },
      handleClick: (view, pos, event) => {
        const target = (event.target as HTMLElement).closest('a');
        if (target && target.getAttribute('href')) {
          const href = target.getAttribute('href');
          if (href) {
            event.preventDefault();
            window.scribeAPI.openExternal(href);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        // Image paste from clipboard (e.g. screenshots)
        const items = event.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
              const file = items[i].getAsFile();
              if (file) {
                event.preventDefault();
                const reader = new FileReader();
                reader.onload = (e) => {
                  const base64 = e.target?.result as string;
                  if (base64) {
                    view.dispatch(
                      view.state.tr.replaceSelectionWith(
                        view.state.schema.nodes.image.create({ src: base64 })
                      )
                    );
                  }
                };
                reader.readAsDataURL(file);
                return true;
              }
            }
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        // Image Drag & Drop from macOS Finder
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.startsWith('image/')) {
              event.preventDefault();
              const reader = new FileReader();
              reader.onload = (e) => {
                const base64 = e.target?.result as string;
                if (base64) {
                  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
                  const pos = coords ? coords.pos : view.state.selection.from;
                  view.dispatch(
                    view.state.tr.insert(
                      pos,
                      view.state.schema.nodes.image.create({ src: base64 })
                    )
                  );
                }
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor, transaction }) => {
      // Only auto-save if document actually changed by user typing
      if (!transaction.docChanged) return;
      setIsSaving(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        const markdown = (editor.storage as any).markdown.getMarkdown();

        // Safety guard: prevent accidental wipeout
        if (!markdown.trim() && note.snippet && note.title !== 'Untitled Note') {
          console.warn('Auto-save aborted: document unexpectedly empty');
          setIsSaving(false);
          return;
        }

        try {
          await onSave(note.filePath, markdown, frontmatter);
          setIsSaving(false);
          setLastSavedText(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        } catch (err) {
          console.error('Error auto-saving:', err);
          setIsSaving(false);
        }
      }, 400);
    }
  });

  // Handle note Title rename
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);

    if (titleTimeoutRef.current) {
      clearTimeout(titleTimeoutRef.current);
    }

    titleTimeoutRef.current = setTimeout(async () => {
      if (newTitle.trim() && newTitle !== note.title) {
        setIsSaving(true);
        try {
          await onRename(note.filePath, newTitle.trim());
          setIsSaving(false);
        } catch (err) {
          console.error('Failed to rename note:', err);
          setIsSaving(false);
        }
      }
    }, 800);
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    };
  }, []);

  const modifiedDate = new Date(note.modifiedAt).toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="flex-1 h-full bg-[var(--editor-bg)] flex flex-col relative overflow-hidden">
      {/* Top Pinned Formatting & Search/Replace Bars */}
      <FormattingBar editor={editor} />
      <FindReplaceBar 
        editor={editor} 
        isOpen={isFindOpen} 
        showReplaceInitial={showReplaceMode}
        onClose={() => setIsFindOpen(false)} 
      />

      <div key="tiptap-floating-menus" className="pointer-events-none">
        <BubbleMenu editor={editor} />
        <SlashMenu editor={editor} />
      </div>

      {/* Scrollable Note Content Container */}
      <div className="flex-1 overflow-y-auto relative">
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
            <div className="flex items-center gap-1 opacity-70">
              <CheckCircle2 size={11} className="text-emerald-500" />
              <span>Synced</span>
            </div>
          </div>

          {/* Note Title Input */}
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Title"
            dir="auto"
            className="w-full text-2xl font-bold bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] border-none focus:outline-none focus:ring-0 mb-3 px-0 tracking-tight"
          />

          <div className="h-[1px] bg-[var(--border-subtle)] mb-5" />
        </div>

        {/* TipTap Document Area */}
        <div className="flex-1 pb-28 cursor-text" onClick={() => editor?.commands.focus()}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
};

export const Editor: React.FC<EditorProps> = ({
  note,
  onSave,
  onRename,
  setIsSaving,
  setLastSavedText,
  externalReloadTrigger
}) => {
  const [loadedData, setLoadedData] = useState<{
    filePath: string;
    markdown: string;
    frontmatter?: Record<string, any>;
  } | null>(null);

  useEffect(() => {
    if (!note) {
      setLoadedData(null);
      return;
    }

    let isMounted = true;
    window.scribeAPI.readNote(note.filePath).then(({ markdown, frontmatter }) => {
      if (isMounted) {
        setLoadedData({
          filePath: note.filePath,
          markdown,
          frontmatter
        });
      }
    }).catch(err => {
      console.error('Failed to load note content:', err);
    });

    return () => {
      isMounted = false;
    };
  }, [note?.filePath, externalReloadTrigger]);

  if (!note) {
    return (
      <div className="flex-1 h-full bg-[var(--editor-bg)] flex flex-col items-center justify-center p-8 text-center text-[var(--text-secondary)] select-none">
        <FileText size={48} className="opacity-20 mb-3" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)] opacity-70">
          No Note Selected
        </h2>
        <p className="text-xs opacity-50 mt-1">
          Select a note from the list or press ⌘N to create a new note
        </p>
      </div>
    );
  }

  // Show note while loading
  if (!loadedData || loadedData.filePath !== note.filePath) {
    return (
      <div className="flex-1 h-full bg-[var(--editor-bg)] flex flex-col items-center justify-center p-8 text-center text-[var(--text-secondary)] select-none">
        <div className="text-xs opacity-60">Loading note...</div>
      </div>
    );
  }

  // Mount a dedicated TipTap instance with the note's exact markdown as step 0
  return (
    <TipTapNoteEditor
      key={`${note.filePath}_${externalReloadTrigger || 0}`}
      note={note}
      initialMarkdown={loadedData.markdown}
      initialFrontmatter={loadedData.frontmatter}
      onSave={onSave}
      onRename={onRename}
      setIsSaving={setIsSaving}
      setLastSavedText={setLastSavedText}
    />
  );
};
