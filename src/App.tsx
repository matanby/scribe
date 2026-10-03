import React, { useEffect, useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { flushNote } from './utils/flushNote';
import { readStored, writeStored, remapPosition } from './utils/session';
import { useTrashUndo } from './components/TrashUndo';
import { Titlebar } from './components/Titlebar';
import { Sidebar } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { AppearanceSettings, ACCENT_PALETTES } from './utils/appearance';
import { NoteMeta, NoteFocusRequest, NotesTree, SortMode, FolderNode } from './types';
import { confirmDestructive, showMessage } from './utils/dialogs';

// Start downloading the editor while the shell mounts and the note index loads.
const editorModule = import('./components/Editor');
const Editor = lazy(() => editorModule.then(module => ({ default: module.Editor })));
const QuickSwitcher = lazy(() => import('./components/QuickSwitcher').then(module => ({ default: module.QuickSwitcher })));
const AppearanceModal = lazy(() => import('./components/AppearanceModal').then(module => ({ default: module.AppearanceModal })));

const RenameDocument = lazy(() => import('./components/RenameDocument').then(module => ({ default: module.RenameDocument })));
const ShortcutsReference = lazy(() => import('./components/ShortcutsReference').then(module => ({ default: module.ShortcutsReference })));

export const App: React.FC = () => {
  const [renameDocumentOpen, setRenameDocumentOpen] = useState(false);
  const [documentMode, setDocumentMode] = useState(() => new URLSearchParams(window.location.search).has('document'));
  const [tree, setTree] = useState<NotesTree | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [selectedNote, setSelectedNote] = useState<NoteMeta | null>(null);
  const [editorFocusRequest, setEditorFocusRequest] = useState<NoteFocusRequest | null>(null);
  const editorFocusSequence = useRef(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedText, setLastSavedText] = useState('');
  const [externalChangeToken, setExternalChangeToken] = useState<number>(0);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [showSidebar, setShowSidebar] = useState(true);
  const [compactNotes, setCompactNotes] = useState(() => localStorage.getItem('scribe_compact_notes') === 'true');
  const handleToggleCompactNotes = () => {
    const next = !compactNotes;
    setCompactNotes(next);
    localStorage.setItem('scribe_compact_notes', String(next));
  };
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(() => new URLSearchParams(window.location.search).has('settings'));

  const [shortcutsOpen, setShortcutsOpen] = useState(() => new URLSearchParams(window.location.search).has('shortcuts'));

  // Appearance & Themes
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
    try {
      const saved = localStorage.getItem('scribe_appearance');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      accentColor: '#EAB308',
      fontFamily: 'sans',
      fontSize: 'normal',
      themeMode: 'system',
      smartTypography: true,
      autoSortTasks: true
    };
  });

  const handleUpdateAppearance = (newSettings: Partial<AppearanceSettings>) => {
    setAppearance(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem('scribe_appearance', JSON.stringify(updated));
      return updated;
    });
  };

  // Synchronize CSS variables and theme classes
  useEffect(() => {
    const root = document.documentElement;
    const accent = appearance.accentColor || '#EAB308';
    root.style.setProperty('--accent-color', accent);
    
    // Find matching palette hover
    const found = ACCENT_PALETTES.find(p => p.color.toLowerCase() === accent.toLowerCase());
    const hoverColor = found ? found.hover : accent;
    root.style.setProperty('--accent-hover', hoverColor);

    const hexToRgba = (hex: string, alpha: number) => {
      const clean = hex.replace('#', '');
      if (clean.length === 6) {
        const r = parseInt(clean.substring(0, 2), 16);
        const g = parseInt(clean.substring(2, 4), 16);
        const b = parseInt(clean.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      return hex;
    };

    root.style.setProperty('--accent-light', hexToRgba(accent, isDark ? 0.22 : 0.14));
    root.style.setProperty('--accent-border', hexToRgba(accent, isDark ? 0.45 : 0.3));
    root.style.setProperty('--card-active', hexToRgba(accent, isDark ? 0.22 : 0.14));
    root.style.setProperty('--selection-bg', hexToRgba(accent, isDark ? 0.35 : 0.25));

    root.classList.toggle('dark', isDark);
  }, [appearance, isDark]);

  // Resolve the active theme from the setting, and keep following the OS while the
  // setting is "system". This is kept separate from the CSS-variable effect above so that
  // the effect which writes isDark is not also the effect that depends on it.
  useEffect(() => {
    if (appearance.themeMode === 'dark') {
      setIsDark(true);
      return;
    }
    if (appearance.themeMode === 'light') {
      setIsDark(false);
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setIsDark(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [appearance.themeMode]);

  // Resizable Panes State (Saved in LocalStorage)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('scribe_sidebar_width');
    return saved ? Math.max(160, Math.min(360, parseInt(saved, 10))) : 210;
  });

  const [noteListWidth, setNoteListWidth] = useState<number>(() => {
    const saved = localStorage.getItem('scribe_notelist_width');
    return saved ? Math.max(220, Math.min(460, parseInt(saved, 10))) : 260;
  });

  const [sortMode, setSortMode] = useState<SortMode>(() => {
    return (localStorage.getItem('scribe_sort_mode') as SortMode) || 'date-edited-desc';
  });

  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('scribe_pinned_notes');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedNoteRef = useRef<NoteMeta | null>(selectedNote);
  selectedNoteRef.current = selectedNote;

  const isDraggingSidebar = useRef(false);
  const isDraggingNoteList = useRef(false);
  const [isResizing, setIsResizing] = useState(false);

  // Smooth Theme Toggle Handler
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  const handleToggleTheme = useCallback(() => {
    const applyThemeChange = () => {
      // Toggling picks an explicit mode; the effect above then derives isDark from it.
      handleUpdateAppearance({ themeMode: isDarkRef.current ? 'light' : 'dark' });
    };

    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as any).startViewTransition(applyThemeChange);
    } else {
      applyThemeChange();
    }
  }, []);

  // Resize Handler for Sidebar (Pane 1)
  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSidebar.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingSidebar.current) return;
      const newWidth = Math.max(160, Math.min(360, moveEvent.clientX));
      setSidebarWidth(newWidth);
      localStorage.setItem('scribe_sidebar_width', newWidth.toString());
    };

    const onMouseUp = () => {
      isDraggingSidebar.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  // Resize Handler for NoteList (Pane 2)
  const handleNoteListMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingNoteList.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const startX = e.clientX;
    const startWidth = noteListWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingNoteList.current) return;
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(220, Math.min(460, startWidth + deltaX));
      setNoteListWidth(newWidth);
      localStorage.setItem('scribe_notelist_width', newWidth.toString());
    };

    const onMouseUp = () => {
      isDraggingNoteList.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [noteListWidth]);

  const restoredRoot = useRef('');
  useEffect(() => {
    if (documentMode || !tree || restoredRoot.current !== tree.rootPath) return;
    if (selectedNote && ![...tree.allNotes, ...tree.trashNotes].some(note => note.filePath === selectedNote.filePath)) return;
    writeStored(`scribe_session:${tree.rootPath}`, { folder: selectedFolder, note: selectedNote?.filePath || null });
  }, [tree, selectedNote, selectedFolder, documentMode]);

  // Load / Refresh Notes Tree
  const loadTree = useCallback(async (preferredSelectPath?: string) => {
    try {
      const data = await window.scribeAPI.listNotesTree();
      let restoredPath: string | undefined;
      if (restoredRoot.current !== data.rootPath) {
        restoredRoot.current = data.rootPath;
        const session = documentMode ? null : readStored<{ folder: string; note: string | null } | null>(`scribe_session:${data.rootPath}`, null);
        if (session) {
          restoredPath = session.note || undefined;
          const folders = (nodes: FolderNode[]): string[] => nodes.flatMap(node => [node.relativePath, ...folders(node.children)]);
          setSelectedFolder(session.folder === '__TRASH__' || folders(data.folders).includes(session.folder) ? session.folder : '');
        } else setSelectedFolder('');
      }
      setTree(data);

      setSelectedNote((prev: NoteMeta | null) => {
        if (preferredSelectPath || restoredPath) {
          const found = [...data.allNotes, ...data.trashNotes].find(
            (n: NoteMeta) => n.filePath === (preferredSelectPath || restoredPath)
          );
          if (found) return found;
        }
        if (!prev) {
          return data.allNotes.length > 0 ? data.allNotes[0] : null;
        }
        const match = [...data.allNotes, ...data.trashNotes].find(
          (n: NoteMeta) => n.filePath === prev.filePath
        );
        return match || (data.allNotes.length > 0 ? data.allNotes[0] : null);
      });
      return data as NotesTree;
    } catch (err) {
      console.error('Failed to load notes tree:', err);
    }
  }, [documentMode]);

  const rootRef = useRef(tree?.rootPath || '');
  rootRef.current = tree?.rootPath || '';
  const { remember: rememberTrash, toast: trashToast } = useTrashUndo(tree?.rootPath || '', async entry => {
    if (entry.root !== rootRef.current) throw new Error('Return to the original notes folder to restore this note.');
    const restoredPath = await window.scribeAPI.restoreNote(entry.trashPath);
    const data = await loadTree(restoredPath);
    if (data?.rootPath === entry.root && entry.root === rootRef.current) {
      const note = data?.allNotes.find(note => note.filePath === restoredPath);
      setSelectedFolder(note?.folder && note.folder !== '/' ? note.folder : '');
      setSearchQuery('');
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.note-list-row[aria-current="true"]')?.focus());
    }
  });

  // Navigation history. Entries and cursor live in one piece of state so the two can
  // never disagree, and so nothing has to update state from inside a state updater.
  const [history, setHistory] = useState<{ entries: string[]; index: number }>({
    entries: [],
    index: -1
  });

  const selectNoteWithHistory = useCallback((note: NoteMeta | null) => {
    setEditorFocusRequest(null);
    setSelectedNote(note);
    if (!note) return;
    setHistory(prev => {
      if (prev.entries[prev.index] === note.filePath) return prev;
      const entries = [...prev.entries.slice(0, prev.index + 1), note.filePath];
      return { entries, index: entries.length - 1 };
    });
  }, []);

  const handleEditNote = useCallback((note: NoteMeta) => {
    selectNoteWithHistory(note);
    setEditorFocusRequest({ filePath: note.filePath, requestId: ++editorFocusSequence.current });
  }, [selectNoteWithHistory]);

  const handleEditorFocused = useCallback((requestId: number) => {
    setEditorFocusRequest(prev => prev?.requestId === requestId ? null : prev);
  }, []);

  const canGoBack = history.index > 0;
  const canGoForward = history.index < history.entries.length - 1;

  const findNoteByPath = useCallback(
    (filePath: string) =>
      [...(tree?.allNotes || []), ...(tree?.trashNotes || [])].find(n => n.filePath === filePath),
    [tree]
  );

  // Navigating history moves the cursor without appending, so it must bypass
  // selectNoteWithHistory rather than rely on a flag that the next click would consume.
  const goToHistoryIndex = useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= history.entries.length) return;
    const target = findNoteByPath(history.entries[nextIndex]);
    if (!target) return;
    setSelectedNote(target);
    setHistory(prev => ({ ...prev, index: nextIndex }));
  }, [history.entries, findNoteByPath]);

  const handleGoBack = useCallback(() => {
    goToHistoryIndex(history.index - 1);
  }, [goToHistoryIndex, history.index]);

  const handleGoForward = useCallback(() => {
    goToHistoryIndex(history.index + 1);
  }, [goToHistoryIndex, history.index]);

  const handleGoBackRef = useRef(handleGoBack);
  handleGoBackRef.current = handleGoBack;
  const handleGoForwardRef = useRef(handleGoForward);
  handleGoForwardRef.current = handleGoForward;

  /**
   * A note's identity is its path, so anything that moves a note has to carry its
   * client-side state (pins, history entries) across to the new path.
   */
  const remapNotePath = useCallback((oldPath: string, newPath: string) => {
    if (oldPath === newPath) return;
    remapPosition(oldPath, newPath);

    setPinnedIds(prev => {
      if (!prev.has(oldPath)) return prev;
      const next = new Set(prev);
      next.delete(oldPath);
      next.add(newPath);
      localStorage.setItem('scribe_pinned_notes', JSON.stringify(Array.from(next)));
      return next;
    });

    setHistory(prev => {
      if (!prev.entries.includes(oldPath)) return prev;
      return { ...prev, entries: prev.entries.map(p => (p === oldPath ? newPath : p)) };
    });
  }, []);

  // Move note to another folder
  const handleMoveNote = useCallback(async (filePath: string, targetFolderPath: string) => {
    try {
      const movedNote = await window.scribeAPI.moveNote({ filePath, targetFolderPath });
      remapNotePath(filePath, movedNote.filePath);
      await loadTree(movedNote.filePath);
      selectNoteWithHistory(movedNote);
    } catch (err) {
      console.error('Failed to move note:', err);
    }
  }, [loadTree, selectNoteWithHistory, remapNotePath]);

  // Duplicate Note
  const handleDuplicateNote = useCallback(async (noteToDuplicate?: NoteMeta | null) => {
    const target = noteToDuplicate || selectedNote;
    if (!target) return;
    try {
      const duplicated = await window.scribeAPI.duplicateNote(target.filePath);
      await loadTree(duplicated.filePath);
      selectNoteWithHistory(duplicated);
    } catch (err) {
      console.error('Failed to duplicate note:', err);
    }
  }, [selectedNote, loadTree, selectNoteWithHistory]);

  const handleDuplicateNoteRef = useRef(handleDuplicateNote);
  handleDuplicateNoteRef.current = handleDuplicateNote;

  // Reveal in Finder
  const handleRevealInFinder = useCallback((filePath?: string) => {
    const target = filePath || selectedNote?.filePath;
    if (target) {
      window.scribeAPI.showInFinder(target);
    }
  }, [selectedNote]);

  const handleRevealInFinderRef = useRef(handleRevealInFinder);
  handleRevealInFinderRef.current = handleRevealInFinder;

  // Folder CRUD handlers
  const handleCreateFolder = useCallback(async (parentPath: string, name: string) => {
    try {
      const createdPath = await window.scribeAPI.createFolder({ parentPath, name });
      await loadTree();
      if (tree?.rootPath && createdPath) {
        const rootClean = tree.rootPath.replace(/\/$/, '');
        const rel = createdPath.startsWith(rootClean)
          ? createdPath.slice(rootClean.length).replace(/^\//, '')
          : '';
        if (rel) {
          setSelectedFolder(rel);
        }
      }
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }, [tree?.rootPath, loadTree]);

  const handleRenameFolder = useCallback(async (folderPath: string, newName: string) => {
    try {
      const renamedPath = await window.scribeAPI.renameFolder({ folderPath, newName });
      await loadTree();
      if (tree?.rootPath && renamedPath) {
        const rootClean = tree.rootPath.replace(/\/$/, '');
        const rel = renamedPath.startsWith(rootClean)
          ? renamedPath.slice(rootClean.length).replace(/^\//, '')
          : '';
        if (rel) {
          setSelectedFolder(rel);
        }
      }
    } catch (err) {
      console.error('Failed to rename folder:', err);
    }
  }, [tree?.rootPath, loadTree]);

  const handleDeleteFolder = useCallback(async (folderPath: string) => {
    try {
      await window.scribeAPI.deleteFolder(folderPath);
      setSelectedFolder('');
      await loadTree();
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  }, [loadTree]);

  const trashNoteWithUndo = useCallback(async (filePath: string, title: string) => {
    const operationRoot = rootRef.current;
    await flushNote(filePath);
    const trashPath = await window.scribeAPI.trashNote(filePath);
    rememberTrash(operationRoot, trashPath, title);
    await loadTree();
  }, [loadTree, rememberTrash]);

  // Trash note via drag or action
  const handleTrashNoteByPath = useCallback(async (filePath: string) => {
    try {
      await trashNoteWithUndo(filePath, findNoteByPath(filePath)?.title || filePath.split('/').pop()?.replace(/\.md$/i, '') || 'Note');
    } catch (err) {
      console.error('Failed to trash note:', err);
    }
  }, [trashNoteWithUndo, findNoteByPath]);

  // Export PDF & Print
  const handleExportPDF = useCallback(async () => {
    const title = selectedNote?.title || 'Note';
    if (!window.scribeAPI.exportPDF) return;
    try {
      const res: any = await window.scribeAPI.exportPDF(title);
      if (res && res.success === false && !res.canceled) {
        console.error('PDF export failed:', res.error);
        void showMessage('Could not export PDF', res.error || 'unknown error', 'error');
      }
    } catch (err: any) {
      console.error('PDF export failed:', err);
      void showMessage('Could not export PDF', err?.message || 'unknown error', 'error');
    }
  }, [selectedNote]);

  const handlePrint = useCallback(() => {
    // Goes through the main process so printing uses Electron's native dialog.
    void window.scribeAPI.printNote?.().catch((err: any) => {
      console.error('Failed to print note:', err);
    });
  }, []);

  const handleExportPDFRef = useRef(handleExportPDF);
  handleExportPDFRef.current = handleExportPDF;
  const handlePrintRef = useRef(handlePrint);
  handlePrintRef.current = handlePrint;

  // Open Folder dialog handler
  const handleOpenFolderDialog = useCallback(async () => {
    try {
      const selected = await window.scribeAPI.selectFolder();
      if (selected) {
        setDocumentMode(false);
        setSelectedFolder('');
        setSelectedNote(null);
        await loadTree();
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  }, [loadTree]);

  // Create Note
  const handleNewNote = useCallback(async () => {
    if (documentMode) return;
    try {
      const root = tree?.rootPath || '';
      const folderPath = selectedFolder && selectedFolder !== '__TRASH__' ? `${root}/${selectedFolder}` : root;
      const newNote = await window.scribeAPI.createNote({
        folderPath,
        title: 'Untitled Note',
        content: ''
      });
      if (selectedFolder === '__TRASH__') {
        setSelectedFolder('');
      }
      await loadTree(newNote.filePath);
      selectNoteWithHistory(newNote);
      setSearchQuery('');
      setEditorFocusRequest({ filePath: newNote.filePath, requestId: ++editorFocusSequence.current, target: 'title' });
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [tree, selectedFolder, loadTree, selectNoteWithHistory, documentMode]);

  const handleNewNoteRef = useRef(handleNewNote);
  handleNewNoteRef.current = handleNewNote;

  const handleNewNoteInFolder = useCallback(async (folderPath: string) => {
    try {
      const newNote = await window.scribeAPI.createNote({
        folderPath,
        title: 'Untitled Note',
        content: ''
      });
      await loadTree(newNote.filePath);
      selectNoteWithHistory(newNote);
      setSearchQuery('');
      setEditorFocusRequest({ filePath: newNote.filePath, requestId: ++editorFocusSequence.current, target: 'title' });
    } catch (err) {
      console.error('Failed to create note in folder:', err);
    }
  }, [loadTree, selectNoteWithHistory]);

  useEffect(() => {
    loadTree();

    // The main process already filtered out echoes of our own writes, so anything that
    // arrives here is a genuine change made by another application.
    const unsubscribe = window.scribeAPI.onNotesChanged(async (data) => {
      const activePath = selectedNoteRef.current?.filePath;
      if (activePath && data.changedPaths.includes(activePath)) {
        setExternalChangeToken(Date.now());
      }
      await loadTree();
    });

    const unsubscribeRoot = window.scribeAPI.onRootChanged?.(() => {
      setDocumentMode(false);
      setSelectedFolder('');
      setSelectedNote(null);
      loadTree();
    });

    const unsubscribeShortcuts = window.scribeAPI.onMenuEvent('menu:shortcuts', () => setShortcutsOpen(true));
    const unsubscribeRenameFile = window.scribeAPI.onMenuEvent('menu:renameFile', () => { if (documentMode && selectedNoteRef.current) setRenameDocumentOpen(true); });
    const unsubscribeSettings = window.scribeAPI.onMenuEvent('menu:settings', () => setIsAppearanceOpen(true));

    const unsubscribeQuickSwitcher = window.scribeAPI.onMenuEvent?.('menu:quickSwitcher', () => {
      if (!documentMode) setIsQuickSwitcherOpen(true);
    });

    const unsubscribeNewNote = window.scribeAPI.onMenuEvent?.('menu:newNote', () => {
      handleNewNoteRef.current();
    });

    const unsubscribeDuplicateNote = window.scribeAPI.onMenuEvent?.('menu:duplicateNote', () => {
      if (!documentMode) handleDuplicateNoteRef.current();
    });

    const unsubscribeRevealInFinder = window.scribeAPI.onMenuEvent?.('menu:revealInFinder', () => {
      handleRevealInFinderRef.current();
    });

    const unsubscribeGoBack = window.scribeAPI.onMenuEvent?.('menu:goBack', () => {
      if (!documentMode) handleGoBackRef.current();
    });

    const unsubscribeGoForward = window.scribeAPI.onMenuEvent?.('menu:goForward', () => {
      if (!documentMode) handleGoForwardRef.current();
    });

    const unsubscribeExportPDF = window.scribeAPI.onMenuEvent?.('menu:exportPDF', () => {
      handleExportPDFRef.current();
    });

    const unsubscribePrintNote = window.scribeAPI.onMenuEvent?.('menu:printNote', () => {
      handlePrintRef.current();
    });

    // Everything with a menu accelerator is handled by the application menu, which fires
    // before the renderer and never fights text inputs. Only shortcuts without a menu
    // entry are bound here.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!documentMode && (e.metaKey || e.ctrlKey) && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        setShowSidebar(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsAppearanceOpen(false);
        setIsQuickSwitcherOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribe();
      unsubscribeRoot?.();
      unsubscribeSettings();
      unsubscribeRenameFile();
      unsubscribeShortcuts();
      unsubscribeQuickSwitcher?.();
      unsubscribeNewNote?.();
      unsubscribeDuplicateNote?.();
      unsubscribeRevealInFinder?.();
      unsubscribeGoBack?.();
      unsubscribeGoForward?.();
      unsubscribeExportPDF?.();
      unsubscribePrintNote?.();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loadTree, documentMode]);

  // Delete / Trash Note
  const handleDeleteNote = useCallback(async (note: NoteMeta, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedFolder === '__TRASH__') {
      const what = note.isFolder ? `folder "${note.title}" and everything in it` : `"${note.title}"`;
      const confirmDelete = await confirmDestructive(
        `Permanently delete ${what}?`,
        'This cannot be undone.'
      );
      if (!confirmDelete) return;
      try {
        await window.scribeAPI.permanentDeleteNote(note.filePath);
        await loadTree();
      } catch (err) {
        console.error('Failed to permanently delete note:', err);
      }
    } else {
      try {
        await trashNoteWithUndo(note.filePath, note.title);
      } catch (err) {
        console.error('Failed to move note to trash:', err);
        void showMessage('Could not move note to Trash', (err as Error).message, 'error');
      }
    }
  }, [selectedFolder, loadTree, trashNoteWithUndo]);

  useEffect(() => window.scribeAPI.onMenuEvent('menu:trashNote', () => {
    if (documentMode || isQuickSwitcherOpen || isAppearanceOpen || document.querySelector('[aria-modal="true"]') || selectedFolder === '__TRASH__') return;
    const note = selectedNoteRef.current;
    if (note && !note.isFolder) void handleDeleteNote(note).then(() => {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.note-list-row[aria-current="true"]')?.focus());
    });
  }), [handleDeleteNote, selectedFolder, isQuickSwitcherOpen, isAppearanceOpen, documentMode]);

  // Restore note from trash
  const handleRestoreNote = useCallback(async (note: NoteMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const restoredPath = await window.scribeAPI.restoreNote(note.filePath);
      await loadTree(restoredPath);
    } catch (err) {
      console.error('Failed to restore note:', err);
    }
  }, [loadTree]);

  // Empty trash
  const handleEmptyTrash = useCallback(async () => {
    const confirmEmpty = await confirmDestructive(
      'Permanently delete all items in Recently Deleted?',
      'This cannot be undone.',
      'Empty Trash'
    );
    if (!confirmEmpty) return;
    try {
      await window.scribeAPI.emptyTrash();
      await loadTree();
    } catch (err) {
      console.error('Failed to empty trash:', err);
    }
  }, [loadTree]);

  // Save Note Content
  const handleSaveNote = useCallback(async (filePath: string, markdown: string) => {
    await window.scribeAPI.saveNote({ filePath, markdown });
    const modifiedAt = Date.now();
    setSelectedNote(prev => prev?.filePath === filePath ? { ...prev, modifiedAt } : prev);
    setTree(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        allNotes: prev.allNotes.map(n => {
          if (n.filePath === filePath) {
            return {
              ...n,
              modifiedAt
            };
          }
          return n;
        })
      };
    });
  }, []);

  // Rename Note
  const handleRenameNote = useCallback(async (filePath: string, newTitle: string, focusBody = false) => {
    const updated = await window.scribeAPI.renameNote({ filePath, newTitle });
    remapNotePath(filePath, updated.filePath);
    await loadTree(updated.filePath);
    setSelectedNote(updated);
    if (focusBody) setEditorFocusRequest({ filePath: updated.filePath, requestId: ++editorFocusSequence.current });
  }, [loadTree, remapNotePath]);

  // Toggle Pinned
  const handleTogglePin = useCallback((noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      localStorage.setItem('scribe_pinned_notes', JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  // Sort mode changes
  const handleSortChange = useCallback((mode: SortMode) => {
    setSortMode(mode);
    localStorage.setItem('scribe_sort_mode', mode);
  }, []);

  // Select Folder
  const handleSelectFolder = (folderRelativePath: string) => {
    setSelectedFolder(folderRelativePath);
    setSearchQuery('');
  };

  // Full-text matches come from the main process, which can read note bodies. The list
  // still filters on title/snippet immediately so typing stays responsive; body matches
  // fold in when the search returns.
  const [bodyMatches, setBodyMatches] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setBodyMatches(null);
      return;
    }

    setBodyMatches(null);
    let cancelled = false;
    const timer = setTimeout(() => {
      window.scribeAPI
        .searchExcerpts(query)
        .then(results => {
          if (!cancelled) setBodyMatches(new Map(results.map(result => [result.filePath, result.excerpt])));
        })
        .catch(err => console.error('Search failed:', err));
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, tree]);

  // Filter notes based on selected folder / trash and search query
  const isTrashView = selectedFolder === '__TRASH__';

  const filteredNotes = useMemo(() => {
    if (!tree) return [];

    let list: NoteMeta[] = [];

    if (isTrashView) {
      list = [...tree.trashNotes];
    } else if (selectedFolder === '') {
      list = [...tree.allNotes];
    } else {
      list = tree.allNotes.filter(n => {
        const folder = n.folder.replace(/^\//, '');
        const target = selectedFolder.replace(/^\//, '');
        return folder === target || folder.startsWith(`${target}/`);
      });
    }

    if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.snippet || '').toLowerCase().includes(q) ||
        bodyMatches?.has(n.filePath)
      );
    }

    // Sort notes
    list.sort((a, b) => {
      const aPinned = pinnedIds.has(a.id);
      const bPinned = pinnedIds.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      switch (sortMode) {
        case 'date-edited-asc':
          return a.modifiedAt - b.modifiedAt;
        case 'date-created-desc':
          return b.createdAt - a.createdAt;
        case 'date-created-asc':
          return a.createdAt - b.createdAt;
        case 'title-asc':
          return a.title.localeCompare(b.title, undefined, { numeric: true });
        case 'title-desc':
          return b.title.localeCompare(a.title, undefined, { numeric: true });
        default:
          return b.modifiedAt - a.modifiedAt;
      }
    });

    return list;
  }, [tree, selectedFolder, isTrashView, searchQuery, sortMode, pinnedIds, bodyMatches]);

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)] ${isDark ? 'dark' : ''} font-${appearance.fontFamily}-mode`}>
      {/* Native macOS Titlebar */}
      <Titlebar
        documentTitle={documentMode ? (selectedNote?.fileName || 'Markdown Document') : undefined}
        documentPath={documentMode ? selectedNote?.filePath : undefined}
        onRenameDocument={documentMode && selectedNote ? () => setRenameDocumentOpen(true) : undefined}
        onDocumentHistory={documentMode && selectedNote ? () => window.dispatchEvent(new Event('scribe:open-history')) : undefined}
        onRevealDocument={documentMode && selectedNote ? () => handleRevealInFinder() : undefined}
        onOpenLibrary={documentMode ? () => { void window.scribeAPI.openLibraryWindow(); } : undefined}
        currentFolder={isTrashView ? 'Recently Deleted' : (selectedFolder || 'All Notes')}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewNote={handleNewNote}
        onSelectFolder={handleOpenFolderDialog}
        isSaving={isSaving}
        lastSavedText={lastSavedText}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
        searchInputRef={searchInputRef}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onQuickCapture={() => { void window.scribeAPI.openCapture(); }}
        onExportPDF={handleExportPDF}
        onPrint={handlePrint}
      />

      {/* 3-Pane Resizable Layout */}
      <main className="flex-1 flex overflow-hidden relative">
        {!documentMode && <>
        {/* Pane 1: Sidebar Folders (Resizable & Foldable with smooth animation) */}
        <div 
          style={{ 
            width: showSidebar ? `${sidebarWidth}px` : '0px',
            opacity: showSidebar ? 1 : 0,
          }} 
          className={`h-full shrink-0 overflow-hidden no-print ${
            isResizing ? '' : 'transition-[width,opacity] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]'
          }`}
        >
          <div style={{ width: `${sidebarWidth}px` }} className="h-full">
            <Sidebar
              key={tree?.rootPath || "loading"}
              tree={tree}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              allNotesCount={tree?.allNotes.length || 0}
              onOpenFolderDialog={handleOpenFolderDialog}
              onOpenAppearance={() => setIsAppearanceOpen(true)}
              onMoveNote={handleMoveNote}
              onTrashNote={handleTrashNoteByPath}
              onNewNoteInFolder={handleNewNoteInFolder}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onRevealInFinder={handleRevealInFinder}
            />
          </div>
        </div>

        {/* Draggable Divider 1 (Sidebar <-> NoteList) */}
        <div
          onMouseDown={handleSidebarMouseDown}
          className={`w-[4px] h-full cursor-col-resize hover:bg-[var(--accent-color)]/60 active:bg-[var(--accent-color)] z-20 shrink-0 select-none -mr-[2px] -ml-[2px] no-print ${
            !showSidebar ? 'pointer-events-none opacity-0' : 'opacity-100'
          } ${isResizing ? '' : 'transition-opacity duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]'}`}
          title="Drag to resize sidebar"
        />

        {/* Pane 2: Note List (Resizable) */}
        <div 
          style={{ width: `${noteListWidth}px` }} 
          className="h-full shrink-0 overflow-hidden no-print"
        >
          <NoteList
            compact={compactNotes}
            onToggleCompact={handleToggleCompactNotes}
            notes={filteredNotes}
            selectedNoteId={selectedNote?.id || null}
            searchQuery={searchQuery}
            searchExcerpts={bodyMatches}
            onSelectNote={note => {
              selectNoteWithHistory(note);
              if (searchQuery.trim()) setEditorFocusRequest({ filePath: note.filePath, requestId: ++editorFocusSequence.current, search: searchQuery.trim() });
            }}
            onEditNote={note => {
              handleEditNote(note);
              if (searchQuery.trim()) setEditorFocusRequest({ filePath: note.filePath, requestId: ++editorFocusSequence.current, search: searchQuery.trim(), focus: true });
            }}
            onDeleteNote={handleDeleteNote}
            isTrash={isTrashView}
            onRestoreNote={handleRestoreNote}
            onEmptyTrash={handleEmptyTrash}
            sortMode={sortMode}
            onSortChange={handleSortChange}
            pinnedIds={pinnedIds}
            onTogglePin={handleTogglePin}
            folders={tree?.folders || []}
            onDuplicateNote={handleDuplicateNote}
            onMoveNote={handleMoveNote}
            onRevealInFinder={handleRevealInFinder}
            onExportPDF={handleExportPDF}
          />
        </div>

        {/* Draggable Divider 2 (NoteList <-> Editor) */}
        <div
          onMouseDown={handleNoteListMouseDown}
          className="w-[4px] h-full cursor-col-resize hover:bg-[var(--accent-color)]/60 active:bg-[var(--accent-color)] transition-colors z-20 shrink-0 select-none -mr-[2px] -ml-[2px] no-print"
          title="Drag to resize note list"
        />

        </>}
        {/* Pane 3: WYSIWYG Editor (Takes remaining space) */}
        <div className="flex-1 h-full min-w-0 overflow-hidden">
          <Suspense fallback={<div className="h-full bg-[var(--editor-bg)]" />}><Editor
            note={selectedNote}
            documentMode={documentMode}
            focusRequest={editorFocusRequest}
            onFocusRequestHandled={handleEditorFocused}
            onSave={handleSaveNote}
            onRename={handleRenameNote}
            onSelectFolder={documentMode ? undefined : setSelectedFolder}
            setIsSaving={setIsSaving}
            setLastSavedText={setLastSavedText}
            externalChangeToken={externalChangeToken}
            searchQuery={searchQuery}
            smartTypography={appearance.smartTypography !== false}
            autoSortTasks={appearance.autoSortTasks !== false}
          /></Suspense>
        </div>
      </main>

      {/* Quick Switcher Modal (⌘⇧O) */}
      {isQuickSwitcherOpen && <Suspense fallback={null}><QuickSwitcher
        isOpen={isQuickSwitcherOpen}
        onClose={() => setIsQuickSwitcherOpen(false)}
        notes={tree?.allNotes || []}
        onSelectNote={(note) => {
          selectNoteWithHistory(note);
          setSelectedFolder('');
        }}
        onNewNote={handleNewNote}
      /></Suspense>}

      {trashToast}

      {/* Appearance & Typography Settings Modal */}
      {renameDocumentOpen && selectedNote && <Suspense fallback={null}><RenameDocument note={selectedNote} onRename={handleRenameNote} onClose={() => setRenameDocumentOpen(false)} /></Suspense>}
      {shortcutsOpen && <Suspense fallback={null}><ShortcutsReference documentMode={documentMode} onClose={() => setShortcutsOpen(false)} /></Suspense>}
      {isAppearanceOpen && <Suspense fallback={null}><AppearanceModal
        isOpen={isAppearanceOpen}
        onClose={() => setIsAppearanceOpen(false)}
        settings={appearance}
        onUpdateSettings={handleUpdateAppearance}
      /></Suspense>}
    </div>
  );
};
