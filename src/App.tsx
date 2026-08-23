import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Titlebar } from './components/Titlebar';
import { Sidebar } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { Editor } from './components/Editor';
import { NoteMeta, NotesTree } from './types';

export const App: React.FC = () => {
  const [tree, setTree] = useState<NotesTree | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [selectedNote, setSelectedNote] = useState<NoteMeta | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedText, setLastSavedText] = useState('');
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [showSidebar, setShowSidebar] = useState(true);

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
        const found = data.allNotes.find((n: NoteMeta) => n.id === preserveSelectedId || n.filePath === preserveSelectedId);
        if (found) {
          setSelectedNote(found);
          return;
        }
      }

      setSelectedNote(prev => {
        if (!prev) {
          return data.allNotes.length > 0 ? data.allNotes[0] : null;
        }
        const match = data.allNotes.find((n: NoteMeta) => n.filePath === prev.filePath);
        return match || (data.allNotes.length > 0 ? data.allNotes[0] : null);
      });
    } catch (err) {
      console.error('Failed to load notes tree:', err);
    }
  }, []);

  useEffect(() => {
    loadTree();

    // Listen for file changes from Google Drive watcher
    const unsubscribe = window.scribeAPI.onNotesChanged(() => {
      loadTree();
    });

    return () => {
      unsubscribe();
    };
  }, [loadTree]);

  // Create Note
  const handleNewNote = useCallback(async () => {
    try {
      const root = tree?.rootPath || '';
      const folderPath = selectedFolder ? `${root}/${selectedFolder}` : root;
      const newNote = await window.scribeAPI.createNote({
        folderPath,
        title: 'Untitled Note',
        content: '# Untitled Note\n\n'
      });
      await loadTree(newNote.filePath);
      setSelectedNote(newNote);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [tree, selectedFolder, loadTree]);

  // Delete Note
  const handleDeleteNote = useCallback(async (note: NoteMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmDelete = window.confirm(`Are you sure you want to delete "${note.title}"?`);
    if (!confirmDelete) return;

    try {
      await window.scribeAPI.deleteNote(note.filePath);
      await loadTree();
    } catch (err) {
      console.error('Failed to delete note:', err);
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

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewNote();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setShowSidebar(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewNote]);

  // Filter notes based on folder and search query
  const filteredNotes = useMemo(() => {
    if (!tree) return [];
    let list = tree.allNotes;

    if (selectedFolder) {
      list = list.filter(n => n.folder === selectedFolder || n.folder.startsWith(`${selectedFolder}/`));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(n => 
        n.title.toLowerCase().includes(q) || 
        n.snippet.toLowerCase().includes(q)
      );
    }

    return list;
  }, [tree, selectedFolder, searchQuery]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      {/* Native macOS Titlebar */}
      <Titlebar
        currentFolder={selectedFolder || 'All Notes'}
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
      />

      {/* 3-Pane Main Layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Pane 1: Sidebar Folders */}
        {showSidebar && (
          <Sidebar
            tree={tree}
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
            allNotesCount={tree?.allNotes.length || 0}
          />
        )}

        {/* Pane 2: Note List */}
        <NoteList
          notes={filteredNotes}
          selectedNoteId={selectedNote?.id || null}
          onSelectNote={setSelectedNote}
          onDeleteNote={handleDeleteNote}
        />

        {/* Pane 3: WYSIWYG Editor */}
        <Editor
          note={selectedNote}
          onSave={handleSaveNote}
          onRename={handleRenameNote}
          setIsSaving={setIsSaving}
          setLastSavedText={setLastSavedText}
        />
      </main>
    </div>
  );
};
