import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import { CodeBlockComponent } from './CodeBlockComponent';
import TaskList from '@tiptap/extension-task-list';
import taskListPlugin from 'markdown-it-task-lists';
import markPlugin from 'markdown-it-mark';
import { CustomTaskItem } from '../extensions/CustomTaskItem';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Typography from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';
import { BiDiExtension } from '../extensions/BiDiExtension';
import { CleanBackspaceExtension } from '../extensions/CleanBackspaceExtension';
import { SearchReplaceExtension } from '../extensions/SearchReplaceExtension';
import { CalloutExtension } from '../extensions/CalloutExtension';
import { CollapsibleHeadingsExtension } from '../extensions/CollapsibleHeadingsExtension';
import { MathExtension } from '../extensions/MathExtension';
import { BubbleMenu } from './BubbleMenu';
import { FormattingBar } from './FormattingBar';
import { FLUSH_NOTE_EVENT, FlushNoteRequest } from '../utils/flushNote';
import { NoteHistory } from './NoteHistory';
import { readPosition, savePosition } from '../utils/session';
import { NoteInfo } from './NoteInfo';
import { TableControls } from './TableControls';
import { SlashMenu } from './SlashMenu';
import { FindReplaceBar } from './FindReplaceBar';
import { getTableInfo } from '../utils/tableUtils';
import { NoteFocusRequest, NoteMeta } from '../types';
import { FileText, AlertTriangle } from 'lucide-react';
import { showMessage } from '../utils/dialogs';

const lowlight = createLowlight(common);

const AUTOSAVE_DEBOUNCE_MS = 400;

interface EditorProps {
  note: NoteMeta | null;
  onSave: (filePath: string, markdown: string) => Promise<void>;
  onRename: (filePath: string, newTitle: string) => Promise<void>;
  onSelectFolder?: (folderPath: string) => void;
  setIsSaving: (saving: boolean) => void;
  setLastSavedText: (text: string) => void;
  externalChangeToken?: number;
  searchQuery?: string;
  smartTypography?: boolean;
  autoSortTasks?: boolean;
  focusRequest?: NoteFocusRequest | null;
  onFocusRequestHandled?: (requestId: number) => void;
}

interface TipTapNoteEditorProps {
  note: NoteMeta;
  initialMarkdown: string;
  onSave: (filePath: string, markdown: string) => Promise<void>;
  onRename: (filePath: string, newTitle: string) => Promise<void>;
  onSelectFolder?: (folderPath: string) => void;
  setIsSaving: (saving: boolean) => void;
  setLastSavedText: (text: string) => void;
  externalChangeToken?: number;
  searchQuery?: string;
  smartTypography?: boolean;
  autoSortTasks?: boolean;
  focusRequest?: NoteFocusRequest | null;
  onFocusRequestHandled?: (requestId: number) => void;
}

/**
 * Writes a pasted or dropped image into the vault's assets folder and links to it.
 *
 * Inlining these as base64 data URLs (as this used to) grew the .md file by megabytes per
 * screenshot and made the note unreadable in any other markdown editor.
 */
async function insertImageFile(
  view: any,
  file: File,
  noteFilePath: string,
  dropPos: number | null
) {
  try {
    const buffer = await file.arrayBuffer();
    const { assetUrl } = await window.scribeAPI.saveAttachment({
      noteFilePath,
      fileName: file.name || 'pasted-image.png',
      data: new Uint8Array(buffer)
    });

    const node = view.state.schema.nodes.image.create({ src: assetUrl });
    const tr =
      dropPos === null
        ? view.state.tr.replaceSelectionWith(node)
        : view.state.tr.insert(dropPos, node);
    view.dispatch(tr);
  } catch (err) {
    console.error('Failed to attach image:', err);
    void showMessage('Could not attach image', 'The file could not be saved into the notes folder.', 'error');
  }
}

/**
 * Replaces the document with content from disk while doing as little damage as possible
 * to what the user is looking at. `emitUpdate: false` is important: without it this would
 * be indistinguishable from a user edit and would immediately be saved back.
 */
function applyExternalContent(editor: any, markdown: string) {
  const previousSelection = editor.state.selection;
  const scroller = editor.view.dom.closest('.overflow-y-auto') as HTMLElement | null;
  const scrollTop = scroller?.scrollTop ?? 0;

  // `false` maps to preventUpdate, so this does not look like a user edit and will not
  // schedule a save of content we just read.
  editor.commands.setContent(markdown, false);

  const maxPos = Math.max(0, editor.state.doc.content.size - 1);
  try {
    editor.commands.setTextSelection({
      from: Math.min(previousSelection.from, maxPos),
      to: Math.min(previousSelection.to, maxPos)
    });
  } catch {
    // Document shape changed too much to map the old selection; leave the default.
  }

  if (scroller) scroller.scrollTop = scrollTop;
}

const TipTapNoteEditor: React.FC<TipTapNoteEditorProps> = ({
  note,
  initialMarkdown,
  onSave,
  onRename,
  onSelectFolder,
  setIsSaving,
  setLastSavedText,
  externalChangeToken,
  searchQuery,
  smartTypography = true,
  autoSortTasks = true,
  focusRequest,
  onFocusRequestHandled
}) => {
  const [title, setTitle] = useState(note.title);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const positionRestored = useRef(false);
  const initialPosition = useRef(readPosition(note.filePath));
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [showReplaceMode, setShowReplaceMode] = useState(false);
  const [findTrigger, setFindTrigger] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictMarkdown, setConflictMarkdown] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Everything the debounced save needs is read through refs. TipTap builds its options
  // object once, so reading props directly inside onUpdate would pin first-render values.
  const editorRef = useRef<any>(null);
  const isDirtyRef = useRef(false);
  // What we believe is currently on disk. Serializing the editor and comparing that
  // instead would report a difference for every cosmetic normalisation the markdown
  // round-trip performs, and would pop a conflict prompt on notes nobody touched.
  const lastSyncedMarkdownRef = useRef(initialMarkdown);
  const notePathRef = useRef(note.filePath);
  notePathRef.current = note.filePath;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const setIsSavingRef = useRef(setIsSaving);
  setIsSavingRef.current = setIsSaving;
  const setLastSavedTextRef = useRef(setLastSavedText);
  setLastSavedTextRef.current = setLastSavedText;

  const performSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const editor = editorRef.current;
    if (!editor || editor.isDestroyed || !isDirtyRef.current) {
      setIsSavingRef.current(false);
      return;
    }

    const markdown = editor.storage.markdown.getMarkdown();

    // Serializing to an empty string while the document still holds content means the
    // markdown pipeline misfired. Writing that would wipe the note.
    if (!markdown.trim() && !editor.isEmpty) {
      console.warn('Auto-save skipped: serializer produced empty output for a non-empty document');
      setIsSavingRef.current(false);
      return;
    }

    isDirtyRef.current = false;
    try {
      await onSaveRef.current(notePathRef.current, markdown);
      lastSyncedMarkdownRef.current = markdown;
      setSaveError(null);
      setIsSavingRef.current(false);
      setLastSavedTextRef.current(
        `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      );
    } catch (err: any) {
      // Keep the buffer dirty so the next attempt retries instead of silently dropping it.
      isDirtyRef.current = true;
      setIsSavingRef.current(false);
      setSaveError(err?.message || 'Failed to save note');
      console.error('Error auto-saving:', err);
    }
  }, []);

  const performSaveRef = useRef(performSave);
  performSaveRef.current = performSave;

  useEffect(() => {
    const handler = (event: Event) => {
      const request = (event as CustomEvent<FlushNoteRequest>).detail;
      if (request.filePath !== notePathRef.current) return;
      request.pending.push((async () => {
        await performSaveRef.current();
        if (isDirtyRef.current) throw new Error('Could not save your latest changes. Retry saving before deleting this note.');
      })());
    };
    window.addEventListener(FLUSH_NOTE_EVENT, handler);
    return () => window.removeEventListener(FLUSH_NOTE_EVENT, handler);
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void performSaveRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  const scheduleSaveRef = useRef(scheduleSave);
  scheduleSaveRef.current = scheduleSave;

  const openFind = (replace: boolean) => {
    setShowReplaceMode(replace);
    setIsFindOpen(true);
    setFindTrigger(prev => prev + 1);
  };

  // Find is driven purely by the application menu. A parallel window keydown listener
  // would swallow ⌘F everywhere, including inside text inputs, for no added behaviour.
  useEffect(() => {
    const unsubscribeMenuFind = window.scribeAPI.onMenuEvent?.('menu:find', () => {
      openFind(false);
    });

    const unsubscribeMenuFindReplace = window.scribeAPI.onMenuEvent?.('menu:findReplace', () => {
      openFind(true);
    });

    return () => {
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
        blockquote: false,
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
      CalloutExtension,
      CollapsibleHeadingsExtension,
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
                setup(markdownit: any) {
                  markdownit.use(taskListPlugin);
                },
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
        autoSort: autoSortTasks !== false,
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
      Table.extend({
        addKeyboardShortcuts() {
          return {
            ...this.parent?.(),
            Tab: () => {
              if (this.editor.isActive('table')) {
                const info = getTableInfo(this.editor);
                if (info.inTable && info.currentRowIndex === info.rowCount - 1 && info.currentColIndex === info.colCount - 1) {
                  this.editor.chain().focus().addRowAfter().goToNextCell().run();
                  return true;
                }
                return this.editor.commands.goToNextCell();
              }
              return false;
            },
            'Shift-Tab': () => {
              if (this.editor.isActive('table')) {
                return this.editor.commands.goToPreviousCell();
              }
              return false;
            }
          };
        }
      }).configure({
        resizable: true
      }),
      TableRow,
      TableHeader,
      TableCell,
      // Highlight and underline have no native markdown syntax. `==text==` is the de
      // facto standard for highlight and is understood by Obsidian and others; underline
      // stays as an <u> tag, which is at least valid markdown-embedded HTML rather than
      // the serializer's fallback.
      Highlight.extend({
        addStorage() {
          return {
            ...this.parent?.(),
            markdown: {
              serialize: { open: '==', close: '==', mixable: true, expelEnclosingWhitespace: true },
              parse: {
                setup(markdownit: any) {
                  markdownit.use(markPlugin);
                }
              }
            }
          };
        }
      }).configure({
        multicolor: true
      }),
      Underline.extend({
        addStorage() {
          return {
            ...this.parent?.(),
            markdown: {
              serialize: { open: '<u>', close: '</u>', mixable: true, expelEnclosingWhitespace: true },
              parse: {}
            }
          };
        }
      }),
      ...(smartTypography ? [Typography] : []),
      MathExtension,
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
        class: 'tiptap ProseMirror focus:outline-none w-full max-w-[900px] mx-auto px-8 py-2'
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
                void insertImageFile(view, file, notePathRef.current, null);
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
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              void insertImageFile(view, file, notePathRef.current, coords ? coords.pos : null);
              return true;
            }
          }
        }
        return false;
      }
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
    },
    onUpdate: ({ transaction }) => {
      if (!transaction.docChanged) return;
      // Direction bookkeeping is presentational and must not mark the note dirty.
      if (transaction.getMeta('bidiAutoDetect')) return;

      isDirtyRef.current = true;
      setIsSavingRef.current(true);
      scheduleSaveRef.current();
    }
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const position = initialPosition.current;
    if (position) {
      const max = Math.max(1, editor.state.doc.content.size - 1);
      editor.commands.setTextSelection({ from: Math.max(1, Math.min(position.from, max)), to: Math.max(1, Math.min(position.to, max)) });
    }
    const frame = requestAnimationFrame(() => {
      if (scrollerRef.current && position && !searchQuery?.trim() && !focusRequest) scrollerRef.current.scrollTop = position.scroll;
      positionRestored.current = true;
    });
    const scroller = scrollerRef.current;
    const persist = () => {
      if (!positionRestored.current || editor.isDestroyed) return;
      const { from, to } = editor.state.selection;
      savePosition(note.filePath, { from, to, scroll: scroller?.scrollTop || 0 });
    };
    editor.on('selectionUpdate', persist);
    const onScroll = persist;
    scroller?.addEventListener('scroll', onScroll);
    window.addEventListener('beforeunload', persist);
    return () => {
      persist(); cancelAnimationFrame(frame);
      editor.off('selectionUpdate', persist); scroller?.removeEventListener('scroll', onScroll); window.removeEventListener('beforeunload', persist);
    };
  }, [editor, note.filePath]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || focusRequest?.filePath !== note.filePath) return;
    if (focusRequest.search) {
      editor.commands.setSearchTerm(focusRequest.search);
      const match = editor.storage.searchReplace.results[0];
      if (match) editor.commands.setTextSelection(match);
      if (focusRequest.focus) editor.commands.focus();
    } else editor.commands.focus();
    onFocusRequestHandled?.(focusRequest.requestId);
  }, [editor, focusRequest, note.filePath, onFocusRequestHandled]);

  /**
   * Renaming rewrites the file on disk, which changes the note's identity. Doing that on
   * a keystroke debounce fought the user's cursor and could race an in-flight content
   * save into recreating the old file. It now happens once, on blur or Enter, and only
   * after the pending body save has landed on the old path.
   */
  const commitTitle = useCallback(async () => {
    const next = title.trim();
    if (!next || next === note.title) {
      setTitle(note.title);
      return;
    }

    await performSaveRef.current();
    setIsSavingRef.current(true);
    try {
      await onRename(note.filePath, next);
    } catch (err) {
      console.error('Failed to rename note:', err);
      setTitle(note.title);
    } finally {
      setIsSavingRef.current(false);
    }
  }, [title, note.title, note.filePath, onRename]);

  // Flush on unmount so switching notes, closing the window, or toggling a setting that
  // rebuilds the editor never discards the last few hundred milliseconds of typing.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      void performSaveRef.current();
    };
  }, []);

  useEffect(() => {
    const flushNow = () => {
      void performSaveRef.current();
    };

    const unsubscribeSave = window.scribeAPI.onMenuEvent?.('menu:saveNote', flushNow);
    window.addEventListener('beforeunload', flushNow);
    window.addEventListener('blur', flushNow);

    return () => {
      unsubscribeSave?.();
      window.removeEventListener('beforeunload', flushNow);
      window.removeEventListener('blur', flushNow);
    };
  }, []);

  /**
   * External change handling.
   *
   * A clean buffer is updated in place, which keeps scroll position, cursor and undo
   * history intact instead of tearing the editor down. A dirty buffer is never
   * overwritten silently: the user is asked which version wins.
   */
  useEffect(() => {
    if (!externalChangeToken) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await window.scribeAPI.readNote(notePathRef.current);
        if (cancelled) return;

        const editor = editorRef.current;
        if (!editor || editor.isDestroyed) return;
        if (data.markdown === lastSyncedMarkdownRef.current) return;

        if (isDirtyRef.current) {
          setConflictMarkdown(data.markdown);
        } else {
          applyExternalContent(editor, data.markdown);
          lastSyncedMarkdownRef.current = data.markdown;
        }
      } catch (err) {
        console.error('Failed to reload externally changed note:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [externalChangeToken]);

  const acceptExternalVersion = useCallback(() => {
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed && conflictMarkdown !== null) {
      applyExternalContent(editor, conflictMarkdown);
      lastSyncedMarkdownRef.current = conflictMarkdown;
      isDirtyRef.current = false;
    }
    setConflictMarkdown(null);
  }, [conflictMarkdown]);

  const keepLocalVersion = useCallback(() => {
    setConflictMarkdown(null);
    isDirtyRef.current = true;
    void performSaveRef.current();
  }, []);

  // Sync in-document search highlight when global search query is active
  useEffect(() => {
    if (!editor) return;
    if (searchQuery && searchQuery.trim()) {
      editor.commands.setSearchTerm(searchQuery.trim());
    } else if (!isFindOpen) {
      editor.commands.clearSearch();
    }
  }, [editor, searchQuery, isFindOpen]);

  // Sync autoSort checklist setting dynamically without remounting editor
  useEffect(() => {
    if (editor && (editor.storage as any)?.taskItem) {
      (editor.storage as any).taskItem.autoSort = autoSortTasks;
    }
  }, [editor, autoSortTasks]);

  const text = editor ? editor.getText() : '';
  const wordCount = (text || '').trim() ? (text || '').trim().split(/\s+/).length : 0;


  return (
    <div className="flex-1 h-full bg-[var(--editor-bg)] flex flex-col relative overflow-hidden">
      {/* Top Pinned Formatting & Search/Replace Bars */}
      <FormattingBar editor={editor} />
      <TableControls editor={editor} />
      <FindReplaceBar 
        editor={editor} 
        isOpen={isFindOpen} 
        showReplaceInitial={showReplaceMode}
        findTrigger={findTrigger}
        onClose={() => setIsFindOpen(false)} 
      />

      <BubbleMenu editor={editor} />
      <SlashMenu editor={editor} />

      {conflictMarkdown !== null && (
        <div className="no-print flex items-center gap-3 px-4 py-2 text-[12px] bg-amber-500/15 border-b border-amber-500/40 text-[var(--text-primary)]">
          <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1">
            This note was changed outside Scribe, and you have unsaved edits here.
          </span>
          <button
            onClick={acceptExternalVersion}
            className="px-2 py-1 rounded font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            Use version on disk
          </button>
          <button
            onClick={keepLocalVersion}
            className="px-2 py-1 rounded font-medium bg-[var(--accent-color)] text-white hover:opacity-90 transition-opacity"
          >
            Keep my edits
          </button>
        </div>
      )}

      {saveError && (
        <div className="no-print flex items-center gap-3 px-4 py-2 text-[12px] bg-red-500/15 border-b border-red-500/40 text-[var(--text-primary)]">
          <AlertTriangle size={14} className="shrink-0 text-red-600 dark:text-red-400" />
          <span className="flex-1">Could not save this note: {saveError}</span>
          <button
            onClick={() => void performSaveRef.current()}
            className="px-2 py-1 rounded font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {historyOpen && <NoteHistory note={note} currentMarkdown={editor?.storage.markdown.getMarkdown() ?? initialMarkdown} onClose={() => setHistoryOpen(false)} onRestore={async id => {
        await performSaveRef.current();
        if (isDirtyRef.current) throw new Error('Save your changes before restoring a version.');
        await window.scribeAPI.restoreVersion(note.filePath, id);
        const data = await window.scribeAPI.readNote(note.filePath);
        applyExternalContent(editor, data.markdown);
        lastSyncedMarkdownRef.current = data.markdown;
        isDirtyRef.current = false;
        setConflictMarkdown(null);
      }} />}

      {/* Scrollable Note Content Container */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto relative">
        <div className="w-full max-w-[900px] mx-auto px-8 pt-7 pb-2 print:max-w-full print:p-0 print:m-0">
          <NoteInfo note={note} wordCount={wordCount} onSelectFolder={onSelectFolder} onHistory={async () => {
            await performSaveRef.current();
            if (!isDirtyRef.current) setHistoryOpen(true);
          }} />

          {/* Note Title Input */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setTitle(note.title);
                e.currentTarget.blur();
              }
            }}
            placeholder="Title"
            aria-label="Note title"
            dir="auto"
            className="w-full text-2xl font-bold bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] border-none focus:outline-none focus:ring-0 mb-3 px-0 tracking-tight"
          />

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
  onSelectFolder,
  setIsSaving,
  setLastSavedText,
  externalChangeToken,
  searchQuery,
  smartTypography = true,
  autoSortTasks = true,
  focusRequest,
  onFocusRequestHandled
}) => {
  const [loadedData, setLoadedData] = useState<{
    filePath: string;
    markdown: string;
    variant: string;
  } | null>(null);

  // TipTap fixes its extension list at construction, so a typography change needs a
  // rebuild. It is part of the identity of the loaded buffer for that reason.
  const variant = `typography:${smartTypography}`;

  useEffect(() => {
    if (!note?.filePath) {
      setLoadedData(null);
      return;
    }

    let isMounted = true;
    const targetPath = note.filePath;

    // The outgoing editor flushes any pending save during unmount. Reads and writes for
    // a given file are serialized in the main process, so this read observes that flush.
    window.scribeAPI.readNote(targetPath).then(data => {
      if (isMounted) {
        setLoadedData({ filePath: targetPath, markdown: data.markdown, variant });
      }
    }).catch(err => {
      console.error('Failed to load note content:', err);
    });

    return () => {
      isMounted = false;
    };
  }, [note?.filePath, variant]);

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
  if (!loadedData || loadedData.filePath !== note.filePath || loadedData.variant !== variant) {
    return (
      <div className="flex-1 h-full bg-[var(--editor-bg)] flex flex-col items-center justify-center p-8 text-center text-[var(--text-secondary)] select-none">
        <div className="text-xs opacity-60">Loading note...</div>
      </div>
    );
  }

  // Mount a dedicated TipTap instance with the note's exact markdown as step 0.
  // The key deliberately excludes the external-change token: external edits are applied
  // in place so the user keeps their cursor, scroll position and undo history.
  return (
    <TipTapNoteEditor
      key={`${note.filePath}_${variant}`}
      note={note}
      initialMarkdown={loadedData.markdown}
      onSave={onSave}
      onRename={onRename}
      onSelectFolder={onSelectFolder}
      setIsSaving={setIsSaving}
      setLastSavedText={setLastSavedText}
      externalChangeToken={externalChangeToken}
      searchQuery={searchQuery}
      smartTypography={smartTypography}
      autoSortTasks={autoSortTasks}
      focusRequest={focusRequest}
      onFocusRequestHandled={onFocusRequestHandled}
    />
  );
};
