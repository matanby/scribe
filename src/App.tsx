import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Titlebar } from './components/Titlebar';
import { Sidebar } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { Editor } from './components/Editor';
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

  // Handle Sort Change
  const handleSortChange = useCallback((mode: SortMode) => {
    setSortMode(mode);
    localStorage.setItem('scribe_sort_mode', mode);
  }, []);

  // Handle Pin / Unpin Note
  const handleTogglePin = useCallback((filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      localStorage.setItem('scribe_pinned_notes', JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  // Sync with system light/dark theme dynamically
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Handle Dark mode class on <html>
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Load Notes Tree from disk
  const loadTree = useCallback(async (preserveSelectedId?: string) => {
    try {
      const data: NotesTree = await window.scribeAPI.listNotesTree();
      setTree(data);

      if (preserveSelectedId) {
        const found = [...data.allNotes, ...data.trashNotes].find(
          (n: NoteMeta) => n.id === preserveSelectedId || n.filePath === preserveSelectedId
        );
        if (found) {
          setSelectedNote(found);
          return;
        }
      }

      setSelectedNote(prev => {
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

  useEffect(() => {
    loadTree();

    // Listen for external file modifications in Google Drive
    const unsubscribe = window.scribeAPI.onNotesChanged(async (data) => {
      await loadTree();

      // If active note was modified externally and user is not currently auto-saving
      if (
        data?.filePath && 
        selectedNoteRef.current && 
        selectedNoteRef.current.filePath === data.filePath && 
        !isSavingRef.current
      ) {
        setExternalReloadTrigger(Date.now());
      }
    });

    return () => {
      unsubscribe();
    };
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
      setSelectedNote(newNote);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [tree, selectedFolder, loadTree]);

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
    const res = await window.scribeAPI.renameNote({ filePath, newTitle });
    await loadTree(res.newPath);
  }, [loadTree]);

  // Select Folder Dialog
  const handleSelectFolder = useCallback(async () => {
    const selected = await window.scribeAPI.selectFolder();
    if (selected) {
      setSelectedFolder('');
      await loadTree();
    }
  }, [loadTree]);

  // Global Keyboard Shortcuts (⌘N, ⌘F, ⌘\)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘N: New Note
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewNote();
      }
      // ⌘F: Focus search input
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      // ⌘\: Fold/Unfold Folders Sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setShowSidebar(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewNote]);

  const isTrashView = selectedFolder === '__TRASH__';

  // Filter and sort notes based on folder, sortMode, and search query
  const filteredNotes = useMemo(() => {
    if (!tree) return [];
    let list = [...(isTrashView ? tree.trashNotes : tree.allNotes)];

    if (!isTrashView && selectedFolder) {
      list = list.filter(n => n.folder === selectedFolder || n.folder.startsWith(`${selectedFolder}/`));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(n => 
        n.title.toLowerCase().includes(q) || 
        n.snippet.toLowerCase().includes(q)
      );
    }

    // Apply Sorting
    list.sort((a, b) => {
      switch (sortMode) {
        case 'date-edited-desc':
          return b.modifiedAt - a.modifiedAt;
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
  }, [tree, selectedFolder, isTrashView, searchQuery, sortMode]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      {/* Native macOS Titlebar */}
      <Titlebar
        currentFolder={isTrashView ? 'Recently Deleted' : (selectedFolder || 'All Notes')}
        activeNoteTitle={selectedNote?.title || ''}
        noteCount={filteredNotes.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewNote={handleNewNote}
        onSelectFolder={handleSelectFolder}
        isSaving={isSaving}
        lastSavedText={lastSavedText}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
        searchInputRef={searchInputRef}
      />

      {/* 3-Pane Main Layout */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Pane 1: Sidebar Folders (Foldable with smooth transition) */}
        <div className={`transition-all duration-200 ease-in-out shrink-0 overflow-hidden ${
          showSidebar ? 'w-52 opacity-100' : 'w-0 opacity-0 pointer-events-none'
        }`}>
          <Sidebar
            tree={tree}
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
            allNotesCount={tree?.allNotes.length || 0}
          />
        </div>

        {/* Pane 2: Note List */}
        <NoteList
          notes={filteredNotes}
          selectedNoteId={selectedNote?.id || null}
          onSelectNote={setSelectedNote}
          onDeleteNote={handleDeleteNote}
          isTrash={isTrashView}
          onRestoreNote={handleRestoreNote}
          onEmptyTrash={handleEmptyTrash}
          sortMode={sortMode}
          onSortChange={handleSortChange}
          pinnedIds={pinnedIds}
          onTogglePin={handleTogglePin}
        />

        {/* Pane 3: WYSIWYG Editor */}
        <Editor
          note={selectedNote}
          onSave={handleSaveNote}
          onRename={handleRenameNote}
          setIsSaving={setIsSaving}
          setLastSavedText={setLastSavedText}
          externalReloadTrigger={externalReloadTrigger}
        />
      </main>
    </div>
  );
};
