import React, { useRef, useMemo } from 'react';
import { FolderNode, NoteMeta, SortMode } from '../types';
import { 
  FileText, 
  Pin, 
  ArrowUpDown, 
  Check, 
  List,
  Folder,
  MoreHorizontal, SquarePen, Search
} from 'lucide-react';
import { Popover } from './Popover';

interface NoteListProps {
  currentFolder: string;
  showFolderLabels: boolean;
  onNewNote: () => void;
  isSearching: boolean;
  searchError: boolean;
  searchScope: 'all' | 'folder';
  onSearchScopeChange: (scope: 'all' | 'folder') => void;
  canSearchFolder: boolean;
  onClearSearch: () => void;
  searchQuery?: string;
  searchExcerpts?: Map<string, string> | null;
  compact: boolean;
  onToggleCompact: () => void;
  notes: NoteMeta[];
  selectedNoteId: string | null;
  onSelectNote: (note: NoteMeta) => void;
  onEditNote: (note: NoteMeta) => void;
  onDeleteNote: (note: NoteMeta, e: React.MouseEvent) => void;
  isTrash?: boolean;
  onRestoreNote?: (note: NoteMeta, e: React.MouseEvent) => void;
  onEmptyTrash?: () => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  pinnedIds: Set<string>;
  onTogglePin: (filePath: string, e: React.MouseEvent) => void;
  folders?: FolderNode[];
  onDuplicateNote?: (note: NoteMeta) => void;
  onMoveNote?: (filePath: string, targetFolderPath: string) => void;
  onRevealInFinder?: (filePath: string) => void;
  onExportPDF?: (title: string) => void;
}

function highlightExcerpt(text: string, query: string): React.ReactNode {
  const lower = text.toLowerCase(), needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0, index = lower.indexOf(needle);
  while (index >= 0 && needle) {
    parts.push(text.slice(cursor, index));
    parts.push(<mark key={index} className="note-search-match">{text.slice(index, index + query.length)}</mark>);
    cursor = index + query.length; index = lower.indexOf(needle, cursor);
  }
  parts.push(text.slice(cursor)); return parts;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameYear) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString([], { year: '2-digit', month: 'short', day: 'numeric' });
}

interface NoteGroup {
  title: string;
  notes: NoteMeta[];
}

export const NoteList: React.FC<NoteListProps> = ({
  currentFolder,
  showFolderLabels,
  onNewNote,
  isSearching,
  searchError,
  searchScope,
  onSearchScopeChange,
  canSearchFolder,
  onClearSearch,
  searchQuery = '',
  searchExcerpts,
  compact,
  onToggleCompact,
  notes,
  selectedNoteId,
  onSelectNote,
  onEditNote,
  onDeleteNote,
  isTrash,
  onRestoreNote,
  onEmptyTrash,
  sortMode,
  onSortChange,
  pinnedIds,
  onTogglePin,
  folders = [],
  onDuplicateNote,
  onMoveNote,
  onRevealInFinder,
  onExportPDF
}) => {
  const noteRefs = useRef(new Map<string, HTMLDivElement>());
  const listRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = async (note: NoteMeta, e: React.MouseEvent, position?: { x: number; y: number }) => {
    const trigger = e.currentTarget as HTMLElement;
    const index = orderedNotes.findIndex(item => item.filePath === note.filePath);
    e.preventDefault();
    e.stopPropagation();
    onSelectNote(note);

    if (window.scribeAPI.showNoteContextMenu) {
      const isPinned = pinnedIds.has(note.filePath) || !!note.frontmatter?.pinned;
      let res: any = null;
      try {
        res = await window.scribeAPI.showNoteContextMenu({
          note,
          isPinned,
          isTrash: !!isTrash,
          folders,
          position
        });
      } catch (err) {
        console.error('Failed to open note context menu:', err);
        return;
      }

      if (res?.action) {
        if (res.action === 'togglePin') {
          onTogglePin(note.filePath, e);
        } else if (res.action === 'duplicate') {
          await onDuplicateNote?.(note);
        } else if (res.action === 'revealInFinder') {
          if (onRevealInFinder) {
            onRevealInFinder(note.filePath);
          } else {
            window.scribeAPI.showInFinder?.(note.filePath);
          }
        } else if (res.action === 'moveToFolder' && res.targetPath) {
          await onMoveNote?.(note.filePath, res.targetPath);
        } else if (res.action === 'exportPDF') {
          onExportPDF?.(note.title);
        } else if (res.action === 'trash') {
          await onDeleteNote(note, e);
        } else if (res.action === 'restore') {
          await onRestoreNote?.(note, e);
        } else if (res.action === 'permanentDelete') {
          await onDeleteNote(note, e);
        }
      }
      requestAnimationFrame(() => {
        const rows = Array.from(listRef.current?.querySelectorAll<HTMLDivElement>('.note-list-row') || []);
        const selectedRow = rows.find(row => row.getAttribute('aria-current') === 'true') || rows[Math.max(0, Math.min(index, rows.length - 1))];
        const target = trigger.isConnected && trigger.closest('.note-list-row') === selectedRow ? trigger : selectedRow;
        target?.focus({ preventScroll: true });
      });
    }
  };

  const sortOptions: { id: SortMode; label: string }[] = [
    { id: 'date-edited-desc', label: 'Date Modified (Newest)' },
    { id: 'date-edited-asc', label: 'Date Modified (Oldest)' },
    { id: 'date-created-desc', label: 'Date Created (Newest)' },
    { id: 'date-created-asc', label: 'Date Created (Oldest)' },
    { id: 'title-asc', label: 'Title (A to Z)' },
    { id: 'title-desc', label: 'Title (Z to A)' }
  ];

  // Group notes like Apple Notes
  const { pinnedNotes, groupedNotes } = useMemo(() => {
    if (searchQuery.trim()) return { pinnedNotes: [], groupedNotes: [{ title: 'Search Results', notes }] };
    if (isTrash) {
      return { pinnedNotes: [], groupedNotes: [{ title: 'Recently Deleted', notes }] };
    }

    const pinned: NoteMeta[] = [];
    const unpinned: NoteMeta[] = [];

    notes.forEach(note => {
      if (pinnedIds.has(note.filePath) || note.frontmatter?.pinned) {
        pinned.push(note);
      } else {
        unpinned.push(note);
      }
    });

    // If sorting by title, group alphabetically
    if (sortMode === 'title-asc' || sortMode === 'title-desc') {
      return {
        pinnedNotes: pinned,
        groupedNotes: [{ title: 'Notes', notes: unpinned }]
      };
    }

    // Otherwise group by Apple Notes timeframe relative to modified/created date
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;
    const thirtyDays = 30 * oneDay;

    const today: NoteMeta[] = [];
    const previous7Days: NoteMeta[] = [];
    const previous30Days: NoteMeta[] = [];
    const older: Record<string, NoteMeta[]> = {};

    unpinned.forEach(note => {
      const time = sortMode.includes('created') ? note.createdAt : note.modifiedAt;
      const diff = now - time;

      const date = new Date(time);
      const isCurrentDay = new Date().toDateString() === date.toDateString();

      if (isCurrentDay) {
        today.push(note);
      } else if (diff < sevenDays) {
        previous7Days.push(note);
      } else if (diff < thirtyDays) {
        previous30Days.push(note);
      } else {
        const yearOrMonth = date.toLocaleDateString([], { month: 'long', year: 'numeric' });
        if (!older[yearOrMonth]) older[yearOrMonth] = [];
        older[yearOrMonth].push(note);
      }
    });

    const groups: NoteGroup[] = [];
    if (today.length > 0) groups.push({ title: 'Today', notes: today });
    if (previous7Days.length > 0) groups.push({ title: 'Previous 7 Days', notes: previous7Days });
    if (previous30Days.length > 0) groups.push({ title: 'Previous 30 Days', notes: previous30Days });
    
    Object.keys(older).forEach(key => {
      groups.push({ title: key, notes: older[key] });
    });
    const time = (note: NoteMeta) => sortMode.includes('created') ? note.createdAt : note.modifiedAt;
    groups.sort((a, b) => (time(a.notes[0]) - time(b.notes[0])) * (sortMode.endsWith('asc') ? 1 : -1));

    if (groups.length === 0 && unpinned.length > 0) {
      groups.push({ title: 'Notes', notes: unpinned });
    }

    return { pinnedNotes: pinned, groupedNotes: groups };
  }, [notes, pinnedIds, sortMode, isTrash, searchQuery]);

  // Navigate the visible order, including the pinned section and date groups.
  const orderedNotes = useMemo(() => [
    ...pinnedNotes,
    ...groupedNotes.flatMap(group => group.notes)
  ], [pinnedNotes, groupedNotes]);
  const tabStop = orderedNotes.find(note => note.id === selectedNoteId || note.filePath === selectedNoteId) || orderedNotes[0];

  const handleNoteKeyDown = (note: NoteMeta, event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!isTrash && !note.isFolder) onEditNote(note);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = orderedNotes.findIndex(item => item.filePath === note.filePath);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? orderedNotes.length - 1
      : Math.max(0, Math.min(orderedNotes.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    const nextNote = orderedNotes[nextIndex];
    if (!nextNote) return;
    const row = noteRefs.current.get(nextNote.filePath);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: 'nearest' });
  };

  const renderNoteCard = (note: NoteMeta) => {
    const isSelected = selectedNoteId === note.id || selectedNoteId === note.filePath;
    const isPinned = pinnedIds.has(note.filePath) || note.frontmatter?.pinned;
    const displayDate = formatDate(note.modifiedAt);

    return (
      <div
        key={note.id}
        ref={row => {
          if (row) noteRefs.current.set(note.filePath, row);
          else noteRefs.current.delete(note.filePath);
        }}
        role="listitem"
        tabIndex={tabStop?.filePath === note.filePath ? 0 : -1}
        aria-current={isSelected ? 'true' : undefined}
        aria-label={note.title || 'Untitled Note'}
        onKeyDown={event => handleNoteKeyDown(note, event)}
        onFocus={event => {
          if (event.target === event.currentTarget && !isSelected) onSelectNote(note);
        }}
        onClick={event => {
          event.currentTarget.focus({ preventScroll: true });
          onSelectNote(note);
        }}
        onContextMenu={e => handleContextMenu(note, e, { x: e.clientX, y: e.clientY })}
        draggable={!isTrash}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', note.filePath);
          e.dataTransfer.setData('application/json', JSON.stringify({ filePath: note.filePath, title: note.title }));
          e.dataTransfer.effectAllowed = 'move';
        }}
        title={compact ? `${note.title || 'Untitled Note'}${note.folder ? ` · ${note.folder}` : ''} · ${displayDate}` : undefined}
        className={`note-list-row group relative px-3.5 rounded-lg ${compact ? 'py-2.5' : 'py-3'} cursor-pointer transition-colors duration-150 select-none ${
          isSelected
            ? 'bg-[var(--card-active)] text-[var(--text-primary)]'
            : 'hover:bg-[var(--card-hover)] text-[var(--text-primary)]'
        }`}
      >
        {/* Note Title & Action icons */}
        <div className={`flex items-start justify-between gap-1.5 ${compact ? '' : 'mb-1'}`}>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {isPinned && !isTrash && (
              <Pin size={10.5} className="text-[var(--accent-color)] shrink-0 fill-[var(--accent-color)]" />
            )}
            {note.isFolder && (
              <Folder size={11} className="text-[var(--text-secondary)] shrink-0" />
            )}
            <h3 
              dir="auto"
              className="text-start text-[13px] leading-snug truncate flex-1 font-semibold text-[var(--text-primary)]"
              title={note.title || 'Untitled Note'}
            >
              {searchQuery.trim() ? highlightExcerpt(note.title || 'Untitled Note', searchQuery.trim()) : note.title || 'Untitled Note'}
            </h3>
          </div>
          
          {isSelected && (
            <button
              type="button"
              aria-label={`Actions for ${note.title || 'Untitled Note'}`}
              aria-haspopup="menu"
              title="Note actions"
              draggable={false}
              onClick={event => {
                const bounds = event.currentTarget.getBoundingClientRect();
                void handleContextMenu(note, event, { x: bounds.left, y: bounds.bottom + 4 });
              }}
              className="shrink-0 p-1 min-w-6 min-h-6 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
          )}
        </div>

        {/* Note Metadata & Snippet */}
        {!compact && !searchQuery.trim() && (
          <div className="text-[12px] text-[var(--text-secondary)]">
            {note.snippet && (
              <p dir="auto" className="text-start line-clamp-2 text-[12px] leading-relaxed">
                {note.snippet}
              </p>
            )}
          </div>
        )}

        {searchQuery.trim() && (searchExcerpts?.get(note.filePath) || note.snippet) && (
          <p dir="auto" className="text-start text-xs leading-relaxed text-[var(--text-secondary)] mt-1.5 line-clamp-3">
            {highlightExcerpt(searchExcerpts?.get(note.filePath) || note.snippet, searchQuery.trim())}
          </p>
        )}

        {/* Subfolder label if applicable */}
        {!compact && <div className="note-row-metadata">
          <time dateTime={new Date(note.modifiedAt).toISOString()}>{displayDate}</time>
          {showFolderLabels && note.folder && note.folder !== '/' && note.folder !== 'Trash' && <span className="flex items-center gap-1 min-w-0">
            <Folder size={11} className="shrink-0" />
            <span className="truncate" dir="auto">{note.folder}</span>
          </span>}
        </div>}
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-[var(--notelist-bg)] border-r border-[var(--border-color)] flex flex-col shrink-0 select-none backdrop-blur-2xl">
      {/* Header bar: Sort Selector & Trash Info */}
      <div className="note-list-heading">
        <div className="min-w-0"><h1 dir="auto" className="truncate text-start text-lg font-semibold tracking-tight" title={currentFolder}>{searchQuery.trim() ? 'Search' : currentFolder}</h1>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5" role="status" aria-live="polite">{isSearching ? 'Searching notes…' : searchError ? 'Search unavailable · title matches shown' : `${notes.length} ${searchQuery.trim() ? (notes.length === 1 ? 'result' : 'results') : (notes.length === 1 ? 'note' : 'notes')}`}</p>
        </div>
        {!isTrash && <button onClick={onNewNote} className="chrome-button text-[var(--accent-color)]" aria-label="New note" title="New Note (⌘N)"><SquarePen size={18} /></button>}
      </div>
      {searchQuery.trim() && !isTrash && <div className="search-scope" role="group" aria-label="Search scope">
        <button aria-pressed={searchScope === 'all'} onClick={() => onSearchScopeChange('all')}>All Notes</button>
        {canSearchFolder && <button aria-pressed={searchScope === 'folder'} onClick={() => onSearchScopeChange('folder')}>This Folder</button>}
      </div>}
      <div className="note-list-options">
        <span className="text-[11px] text-[var(--text-secondary)]">{searchQuery.trim() ? (isTrash ? 'Recently Deleted' : searchScope === 'all' ? 'Across your library' : currentFolder) : 'Notes'}</span>

        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCompact}
            aria-label="Compact view"
            aria-pressed={compact}
            title={compact ? 'Show note previews' : 'Compact view: hide note previews'}
            className={`chrome-button ${compact ? 'bg-[var(--accent-light)] text-[var(--accent-color)]' : 'text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10'}`}
          >
            <List size={13} />
          </button>
          {isTrash ? (
            onEmptyTrash && notes.length > 0 && (
              <button
                onClick={onEmptyTrash}
                className="text-[10.5px] text-red-500 hover:underline font-medium"
              >
                Empty Trash
              </button>
            )
          ) : (
            <Popover label="Sort notes" align="right" triggerClassName="chrome-button" trigger={<ArrowUpDown size={14} />}>
              {close => <>
                <p className="px-2.5 py-2 text-[11px] font-medium text-[var(--text-secondary)]">Sort notes by</p>
                {sortOptions.map(option => <button key={option.id} className="menu-item" aria-pressed={sortMode === option.id} onClick={() => { onSortChange(option.id); close(); }}><span>{option.label}</span>{sortMode === option.id && <Check size={14} />}</button>)}
              </>}
            </Popover>
          )}
        </div>
      </div>

      {/* Note Cards List with Apple Notes Section Headers */}
      <div ref={listRef} role="list" aria-label="Notes. Use arrow keys to browse and Enter to edit." className="flex-1 overflow-y-auto px-2 py-1.5 space-y-2">
        {notes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[var(--text-secondary)] select-none">
            {searchQuery.trim() ? <Search size={28} className="opacity-40 mb-3" /> : <FileText size={32} className="opacity-30 mb-3" />}
            <p className="text-xs font-semibold text-[var(--text-primary)] opacity-80">
              {isSearching ? 'Searching…' : searchQuery.trim() ? 'No matching notes' : isTrash ? 'Trash is Empty' : 'No Notes Yet'}
            </p>
            <p className="text-[11px] opacity-60 mt-1">
              {searchQuery.trim() ? 'Try a different word or search all notes.' : isTrash ? 'Deleted notes appear here' : 'Capture a thought with ⌘N'}
            </p>
            {searchQuery.trim() && <button className="mt-4 text-xs text-[var(--text-primary)] hover:underline" onClick={onClearSearch}>Clear search</button>}
          </div>
        ) : (
          <>
            {/* Pinned Section */}
            {pinnedNotes.length > 0 && (
              <div className="space-y-1">
                <div className="px-2.5 pt-1 text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Pin size={10.5} className="fill-[var(--accent-color)]" />
                  <span>Pinned</span>
                </div>
                <div className="space-y-0.5">
                  {pinnedNotes.map(renderNoteCard)}
                </div>
              </div>
            )}

            {/* Timeframe Grouped Sections */}
            {groupedNotes.map(group => (
              <div key={group.title} className="space-y-1">
                <div className="px-2.5 pt-1.5 text-xs font-semibold text-[var(--text-secondary)] flex items-center justify-between">
                  <span>{group.title}</span>
                </div>
                <div className="space-y-0.5">
                  {group.notes.map(renderNoteCard)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
