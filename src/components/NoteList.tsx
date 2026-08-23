import React, { useState, useRef, useEffect } from 'react';
import { NoteMeta, SortMode } from '../types';
import { 
  Trash2, 
  FileText, 
  RotateCcw, 
  XCircle, 
  Pin, 
  ArrowUpDown, 
  Check, 
  SlidersHorizontal 
} from 'lucide-react';

interface NoteListProps {
  notes: NoteMeta[];
  selectedNoteId: string | null;
  onSelectNote: (note: NoteMeta) => void;
  onDeleteNote: (note: NoteMeta, e: React.MouseEvent) => void;
  isTrash?: boolean;
  onRestoreNote?: (note: NoteMeta, e: React.MouseEvent) => void;
  onEmptyTrash?: () => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  pinnedIds: Set<string>;
  onTogglePin: (filePath: string, e: React.MouseEvent) => void;
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

export const NoteList: React.FC<NoteListProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
  onDeleteNote,
  isTrash,
  onRestoreNote,
  onEmptyTrash,
  sortMode,
  onSortChange,
  pinnedIds,
  onTogglePin
}) => {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sortOptions: { id: SortMode; label: string }[] = [
    { id: 'date-edited-desc', label: 'Date Modified (Newest)' },
    { id: 'date-edited-asc', label: 'Date Modified (Oldest)' },
    { id: 'date-created-desc', label: 'Date Created (Newest)' },
    { id: 'date-created-asc', label: 'Date Created (Oldest)' },
    { id: 'title-asc', label: 'Title (A to Z)' },
    { id: 'title-desc', label: 'Title (Z to A)' }
  ];

  // Separate pinned and unpinned notes
  const pinnedNotes = !isTrash ? notes.filter(n => pinnedIds.has(n.filePath) || n.frontmatter?.pinned) : [];
  const unpinnedNotes = !isTrash ? notes.filter(n => !pinnedIds.has(n.filePath) && !n.frontmatter?.pinned) : notes;

  const renderNoteCard = (note: NoteMeta) => {
    const isSelected = selectedNoteId === note.id || selectedNoteId === note.filePath;
    const isPinned = pinnedIds.has(note.filePath) || note.frontmatter?.pinned;
    const displayDate = formatDate(note.modifiedAt);

    return (
      <div
        key={note.id}
        onClick={() => onSelectNote(note)}
        className={`group relative px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-100 ${
          isSelected
            ? 'bg-[var(--card-active)] shadow-xs'
            : 'hover:bg-[var(--card-hover)]'
        }`}
      >
        {/* Note Title & Action icons */}
        <div className="flex items-start justify-between gap-1.5 mb-0.5">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {isPinned && !isTrash && (
              <Pin size={11} className="text-[var(--accent-color)] shrink-0 fill-[var(--accent-color)]" />
            )}
            <h3 
              dir="auto"
              className={`text-[13px] leading-tight truncate flex-1 ${
                isSelected 
                  ? 'font-bold text-[var(--text-primary)]' 
                  : 'font-semibold text-[var(--text-primary)]'
              }`}
            >
              {note.title || 'Untitled Note'}
            </h3>
          </div>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {!isTrash && (
              <button
                onClick={(e) => onTogglePin(note.filePath, e)}
                title={isPinned ? "Unpin Note" : "Pin Note to Top"}
                className={`p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 ${
                  isPinned ? 'text-[var(--accent-color)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                <Pin size={11.5} className={isPinned ? 'fill-[var(--accent-color)]' : ''} />
              </button>
            )}

            {isTrash ? (
              <>
                <button
                  onClick={(e) => onRestoreNote && onRestoreNote(note, e)}
                  title="Restore Note"
                  className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-emerald-600"
                >
                  <RotateCcw size={12} />
                </button>
                <button
                  onClick={(e) => onDeleteNote(note, e)}
                  title="Delete Permanently"
                  className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-red-500"
                >
                  <XCircle size={12} />
                </button>
              </>
            ) : (
              <button
                onClick={(e) => onDeleteNote(note, e)}
                title="Move to Trash"
                className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-red-500"
              >
                <Trash2 size={11.5} />
              </button>
            )}
          </div>
        </div>

        {/* Note Metadata & Snippet */}
        <div className="flex items-baseline gap-1.5 text-[11.5px] text-[var(--text-secondary)]">
          <span className="font-medium shrink-0 text-[10.5px] opacity-80">{displayDate}</span>
          <p 
            dir="auto"
            className="truncate opacity-75 text-[11.5px] flex-1"
          >
            {note.snippet || 'No additional text'}
          </p>
        </div>

        {/* Subfolder label if applicable */}
        {note.folder && note.folder !== '/' && note.folder !== 'Trash' && (
          <div className="text-[9.5px] text-[var(--accent-color)] opacity-80 truncate mt-0.5 font-medium">
            📁 {note.folder}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 h-full bg-[var(--notelist-bg)] border-r border-[var(--border-color)] flex flex-col shrink-0 select-none backdrop-blur-2xl">
      {/* Header bar: Sort Selector & Trash Info */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)]">
        <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          {isTrash ? 'Recently Deleted' : `${notes.length} Notes`}
        </span>

        {isTrash ? (
          onEmptyTrash && notes.length > 0 && (
            <button
              onClick={onEmptyTrash}
              className="text-[10px] text-red-500 hover:underline font-medium"
            >
              Empty Trash
            </button>
          )
        ) : (
          <div className="relative" ref={sortMenuRef}>
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              title="Sort Notes"
            >
              <ArrowUpDown size={12} />
            </button>

            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 p-1 rounded-xl bg-white dark:bg-[#252528] border border-[var(--border-color)] shadow-2xl z-50 space-y-0.5 text-xs">
                <div className="px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Sort Notes By
                </div>
                {sortOptions.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onSortChange(opt.id);
                      setShowSortMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                      sortMode === opt.id
                        ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-semibold'
                        : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {sortMode === opt.id && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Note Cards List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {notes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[var(--text-secondary)] select-none">
            <FileText size={32} className="opacity-20 mb-2" />
            <p className="text-xs font-semibold text-[var(--text-primary)] opacity-80">
              {isTrash ? 'Trash is Empty' : 'No Notes'}
            </p>
            <p className="text-[11px] opacity-60 mt-1">
              {isTrash ? 'Deleted notes appear here' : 'Press ⌘N to create a note'}
            </p>
          </div>
        ) : (
          <>
            {/* Pinned Section */}
            {pinnedNotes.length > 0 && (
              <div className="space-y-1 mb-2">
                <div className="px-2 pt-1 text-[9.5px] font-bold text-[var(--accent-color)] uppercase tracking-wider flex items-center gap-1">
                  <Pin size={10} className="fill-[var(--accent-color)]" />
                  <span>Pinned</span>
                </div>
                {pinnedNotes.map(renderNoteCard)}
              </div>
            )}

            {/* Unpinned / Standard Section */}
            {pinnedNotes.length > 0 && unpinnedNotes.length > 0 && (
              <div className="px-2 pt-2 text-[9.5px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                Notes
              </div>
            )}

            {unpinnedNotes.map(renderNoteCard)}
          </>
        )}
      </div>
    </div>
  );
};
