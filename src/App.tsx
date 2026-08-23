import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Titlebar } from './components/Titlebar';
import { Sidebar } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { Editor } from './components/Editor';
import { QuickSwitcher } from './components/QuickSwitcher';
import { AppearanceModal, AppearanceSettings, ACCENT_PALETTES } from './components/AppearanceModal';
import { NoteMeta, NotesTree, SortMode } from './types';

export const App: React.FC = () => {
  const [tree, setTree] = useState<NotesTree | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [selectedNote, setSelectedNote] = useState<NoteMeta | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedText, setLastSavedText] = useState('');
  const [externalReloadTrigger, setExternalReloadTrigger] = useState<number>(0);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [showSidebar, setShowSidebar] = useState(true);
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);

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
      themeMode: 'system'
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

    // Theme Mode
    let darkActive = false;
    if (appearance.themeMode === 'dark') {
      darkActive = true;
    } else if (appearance.themeMode === 'light') {
      darkActive = false;
    } else {
      darkActive = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    setIsDark(darkActive);
    root.classList.toggle('dark', darkActive);
  }, [appearance, isDark]);

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
  const isSavingRef = useRef<boolean>(isSaving);
  isSavingRef.current = isSaving;
  const lastLocalSaveTimeRef = useRef<number>(0);

  const isDraggingSidebar = useRef(false);
  const isDraggingNoteList = useRef(false);
  const [isResizing, setIsResizing] = useState(false);

  // Smooth Theme Toggle Handler
  const handleToggleTheme = useCallback(() => {
    const applyThemeChange = () => {
      setIsDark(prev => {
        const next = !prev;
        handleUpdateAppearance({ themeMode: next ? 'dark' : 'light' });
        return next;
      });
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

  // Load / Refresh Notes Tree
  const loadTree = useCallback(async (preferredSelectPath?: string) => {
    try {
      const data = await window.scribeAPI.listNotesTree();
      setTree(data);

      setSelectedNote((prev: NoteMeta | null) => {
        if (preferredSelectPath) {
          const found = [...data.allNotes, ...data.trashNotes].find(
            (n: NoteMeta) => n.filePath === preferredSelectPath
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
    } catch (err) {
      console.error('Failed to load notes tree:', err);
    }
  }, []);

  // Navigation History Stack
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isNavigatingHistory = useRef(false);

  const selectNoteWithHistory = useCallback((note: NoteMeta | null) => {
    setSelectedNote(note);
    if (!note) return;
    if (isNavigatingHistory.current) {
      isNavigatingHistory.current = false;
      return;
    }
    setHistory(prev => {
      const current = prev[historyIndex];
      if (current === note.filePath) return prev;
      const nextHistory = [...prev.slice(0, historyIndex + 1), note.filePath];
      setHistoryIndex(nextHistory.length - 1);
      return nextHistory;
    });
  }, [historyIndex]);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const handleGoBack = useCallback(() => {
    if (historyIndex > 0) {
      const targetPath = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      isNavigatingHistory.current = true;
      const found = tree?.allNotes.find(n => n.filePath === targetPath);
      if (found) {
        setSelectedNote(found);
      }
    }
  }, [historyIndex, history, tree]);

  const handleGoForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const targetPath = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      isNavigatingHistory.current = true;
      const found = tree?.allNotes.find(n => n.filePath === targetPath);
      if (found) {
        setSelectedNote(found);
      }
    }
  }, [historyIndex, history, tree]);

  const handleGoBackRef = useRef(handleGoBack);
  handleGoBackRef.current = handleGoBack;
  const handleGoForwardRef = useRef(handleGoForward);
  handleGoForwardRef.current = handleGoForward;

  // Move note to another folder
  const handleMoveNote = useCallback(async (filePath: string, targetFolderPath: string) => {
    try {
      const movedNote = await window.scribeAPI.moveNote({ filePath, targetFolderPath });
      await loadTree(movedNote.filePath);
      selectNoteWithHistory(movedNote);
    } catch (err) {
      console.error('Failed to move note:', err);
    }
  }, [loadTree, selectNoteWithHistory]);

  // Trash note via drag or action
  const handleTrashNoteByPath = useCallback(async (filePath: string) => {
    try {
      await window.scribeAPI.trashNote(filePath);
      await loadTree();
    } catch (err) {
      console.error('Failed to trash note:', err);
    }
  }, [loadTree]);

  // Export PDF & Print
  const handleExportPDF = useCallback(async () => {
    const title = selectedNote?.title || 'Note';
    if (window.scribeAPI.exportPDF) {
      await window.scribeAPI.exportPDF(title);
    }
  }, [selectedNote]);

  const handlePrint = useCallback(() => {
    if (window.scribeAPI.printNote) {
      window.scribeAPI.printNote();
    } else {
      window.print();
    }
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
    try {
      const root = tree?.rootPath || '';
      const folderPath = selectedFolder && selectedFolder !== '__TRASH__' ? `${root}/${selectedFolder}` : root;
      const newNote = await window.scribeAPI.createNote({
        folderPath,
        title: 'Untitled Note',
        content: '# Untitled Note\n\n'
      });
      if (selectedFolder === '__TRASH__') {
        setSelectedFolder('');
      }
      await loadTree(newNote.filePath);
      selectNoteWithHistory(newNote);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [tree, selectedFolder, loadTree, selectNoteWithHistory]);

  const handleNewNoteRef = useRef(handleNewNote);
  handleNewNoteRef.current = handleNewNote;

  useEffect(() => {
    loadTree();

    // Listen for external file modifications
    const unsubscribe = window.scribeAPI.onNotesChanged(async (data) => {
      await loadTree();

      const now = Date.now();
      // Only reload active note if modification came from an external app (>1500ms after last local save)
      if (
        data?.filePath && 
        selectedNoteRef.current && 
        selectedNoteRef.current.filePath === data.filePath && 
        !isSavingRef.current &&
        now - lastLocalSaveTimeRef.current > 1500
      ) {
        setExternalReloadTrigger(now);
      }
    });

    const unsubscribeRoot = window.scribeAPI.onRootChanged?.(() => {
      setSelectedFolder('');
      setSelectedNote(null);
      loadTree();
    });

    const unsubscribeQuickSwitcher = window.scribeAPI.onMenuEvent?.('menu:quickSwitcher', () => {
      setIsQuickSwitcherOpen(true);
    });

    const unsubscribeNewNote = window.scribeAPI.onMenuEvent?.('menu:newNote', () => {
      handleNewNoteRef.current();
    });

    const unsubscribeGoBack = window.scribeAPI.onMenuEvent?.('menu:goBack', () => {
      handleGoBackRef.current();
    });

    const unsubscribeGoForward = window.scribeAPI.onMenuEvent?.('menu:goForward', () => {
      handleGoForwardRef.current();
    });

    const unsubscribeExportPDF = window.scribeAPI.onMenuEvent?.('menu:exportPDF', () => {
      handleExportPDFRef.current();
    });

    const unsubscribePrintNote = window.scribeAPI.onMenuEvent?.('menu:printNote', () => {
      handlePrintRef.current();
    });

    // Keyboard Shortcuts: ⌘N -> New Note, ⌘P -> Quick Switcher, ⌘\ -> Toggle Sidebar, ⌘[ / ⌘] -> History, ⌘⇧P -> Print
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        handleNewNoteRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setIsQuickSwitcherOpen(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrintRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === '[' || e.code === 'BracketLeft')) {
        e.preventDefault();
        handleGoBackRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === ']' || e.code === 'BracketRight')) {
        e.preventDefault();
        handleGoForwardRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        setShowSidebar(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      unsubscribe();
      unsubscribeRoot?.();
      unsubscribeQuickSwitcher?.();
      unsubscribeNewNote?.();
      unsubscribeGoBack?.();
      unsubscribeGoForward?.();
      unsubscribeExportPDF?.();
      unsubscribePrintNote?.();
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [loadTree]);

  // Delete / Trash Note
  const handleDeleteNote = useCallback(async (note: NoteMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedFolder === '__TRASH__') {
      const confirmDelete = window.confirm(`Permanently delete "${note.title}"? This cannot be undone.`);
      if (!confirmDelete) return;
      try {
        await window.scribeAPI.permanentDeleteNote(note.filePath);
        await loadTree();
      } catch (err) {
        console.error('Failed to permanently delete note:', err);
      }
    } else {
      try {
        await window.scribeAPI.trashNote(note.filePath);
        await loadTree();
      } catch (err) {
        console.error('Failed to move note to trash:', err);
      }
    }
  }, [selectedFolder, loadTree]);

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
    const confirmEmpty = window.confirm('Permanently delete all items in Recently Deleted?');
    if (!confirmEmpty) return;
    try {
      await window.scribeAPI.emptyTrash();
      await loadTree();
    } catch (err) {
      console.error('Failed to empty trash:', err);
    }
  }, [loadTree]);

  // Save Note Content
  const handleSaveNote = useCallback(async (filePath: string, markdown: string, frontmatter?: Record<string, any>) => {
    lastLocalSaveTimeRef.current = Date.now();
    await window.scribeAPI.saveNote({ filePath, markdown, frontmatter });
    setTree(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        allNotes: prev.allNotes.map(n => {
          if (n.filePath === filePath) {
            return {
              ...n,
              modifiedAt: Date.now()
            };
          }
          return n;
        })
      };
    });
  }, []);

  // Rename Note
  const handleRenameNote = useCallback(async (filePath: string, newTitle: string) => {
    try {
      const updated = await window.scribeAPI.renameNote({ filePath, newTitle });
      await loadTree(updated.filePath);
      setSelectedNote(updated);
    } catch (err) {
      console.error('Failed to rename note:', err);
    }
  }, [loadTree]);

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

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(n => 
        n.title.toLowerCase().includes(q) || 
        n.snippet.toLowerCase().includes(q)
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
  }, [tree, selectedFolder, isTrashView, searchQuery, sortMode, pinnedIds]);

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)] ${isDark ? 'dark' : ''} font-${appearance.fontFamily}-mode`}>
      {/* Native macOS Titlebar */}
      <Titlebar
        currentFolder={isTrashView ? 'Recently Deleted' : (selectedFolder || 'All Notes')}
        activeNoteTitle={selectedNote?.title || ''}
        noteCount={filteredNotes.length}
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
        onExportPDF={handleExportPDF}
        onPrint={handlePrint}
      />

      {/* 3-Pane Resizable Layout */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Pane 1: Sidebar Folders (Resizable & Foldable with smooth animation) */}
        <div 
          style={{ 
            width: showSidebar ? `${sidebarWidth}px` : '0px',
            opacity: showSidebar ? 1 : 0,
          }} 
          className={`h-full shrink-0 overflow-hidden ${
            isResizing ? '' : 'transition-[width,opacity] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]'
          }`}
        >
          <div style={{ width: `${sidebarWidth}px` }} className="h-full">
            <Sidebar
              tree={tree}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              allNotesCount={tree?.allNotes.length || 0}
              onOpenFolderDialog={handleOpenFolderDialog}
              onOpenAppearance={() => setIsAppearanceOpen(true)}
              onMoveNote={handleMoveNote}
              onTrashNote={handleTrashNoteByPath}
            />
          </div>
        </div>

        {/* Draggable Divider 1 (Sidebar <-> NoteList) */}
        <div
          onMouseDown={handleSidebarMouseDown}
          className={`w-[4px] h-full cursor-col-resize hover:bg-[var(--accent-color)]/60 active:bg-[var(--accent-color)] z-20 shrink-0 select-none -mr-[2px] -ml-[2px] ${
            !showSidebar ? 'pointer-events-none opacity-0' : 'opacity-100'
          } ${isResizing ? '' : 'transition-opacity duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]'}`}
          title="Drag to resize sidebar"
        />

        {/* Pane 2: Note List (Resizable) */}
        <div 
          style={{ width: `${noteListWidth}px` }} 
          className="h-full shrink-0 overflow-hidden"
        >
          <NoteList
            notes={filteredNotes}
            selectedNoteId={selectedNote?.id || null}
            onSelectNote={selectNoteWithHistory}
            onDeleteNote={handleDeleteNote}
            isTrash={isTrashView}
            onRestoreNote={handleRestoreNote}
            onEmptyTrash={handleEmptyTrash}
            sortMode={sortMode}
            onSortChange={handleSortChange}
            pinnedIds={pinnedIds}
            onTogglePin={handleTogglePin}
          />
        </div>

        {/* Draggable Divider 2 (NoteList <-> Editor) */}
        <div
          onMouseDown={handleNoteListMouseDown}
          className="w-[4px] h-full cursor-col-resize hover:bg-[var(--accent-color)]/60 active:bg-[var(--accent-color)] transition-colors z-20 shrink-0 select-none -mr-[2px] -ml-[2px]"
          title="Drag to resize note list"
        />

        {/* Pane 3: WYSIWYG Editor (Takes remaining space) */}
        <div className="flex-1 h-full min-w-0 overflow-hidden">
          <Editor
            note={selectedNote}
            onSave={handleSaveNote}
            onRename={handleRenameNote}
            onSelectFolder={setSelectedFolder}
            setIsSaving={setIsSaving}
            setLastSavedText={setLastSavedText}
            externalReloadTrigger={externalReloadTrigger}
          />
        </div>
      </main>

      {/* Quick Switcher Modal (⌘O / ⌘P / ⌘K) */}
      <QuickSwitcher
        isOpen={isQuickSwitcherOpen}
        onClose={() => setIsQuickSwitcherOpen(false)}
        notes={tree?.allNotes || []}
        onSelectNote={(note) => {
          selectNoteWithHistory(note);
          setSelectedFolder('');
        }}
        onNewNote={handleNewNote}
      />

      {/* Appearance & Typography Settings Modal */}
      <AppearanceModal
        isOpen={isAppearanceOpen}
        onClose={() => setIsAppearanceOpen(false)}
        settings={appearance}
        onUpdateSettings={handleUpdateAppearance}
      />
    </div>
  );
};
