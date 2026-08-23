import React, { useState, useEffect, useRef } from 'react';
import { NoteMeta } from '../types';
import { Search, FileText, Folder, Calendar, ArrowRight, CornerDownLeft } from 'lucide-react';

interface QuickSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  notes: NoteMeta[];
  onSelectNote: (note: NoteMeta) => void;
  onNewNote: () => void;
}

export const QuickSwitcher: React.FC<QuickSwitcherProps> = ({
  isOpen,
  onClose,
  notes,
  onSelectNote,
  onNewNote
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Filter notes
  const filteredNotes = notes.filter(n => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.folder.toLowerCase().includes(q) ||
      n.snippet.toLowerCase().includes(q)
    );
  }).slice(0, 20);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (filteredNotes.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredNotes.length) % (filteredNotes.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredNotes.length > 0) {
        onSelectNote(filteredNotes[selectedIndex]);
        onClose();
      } else if (query.trim()) {
        onNewNote();
        onClose();
      }
    }
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-black/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white/95 dark:bg-[#202024]/95 backdrop-blur-2xl border border-[var(--border-color)] shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[65vh] select-none"
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border-color)]">
          <Search size={18} className="text-[var(--accent-color)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Quick Switcher (type to search notes, folders, text)..."
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none font-medium"
          />
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-color)] px-1.5 py-0.5 rounded-md shrink-0">
            esc to close
          </span>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 space-y-1">
          {filteredNotes.length > 0 ? (
            filteredNotes.map((note, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={note.filePath}
                  ref={(el) => { itemRefs.current[index] = el; }}
                  onClick={() => {
                    onSelectNote(note);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[var(--card-active)] shadow-xs'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText 
                      size={16} 
                      className={`shrink-0 ${isSelected ? 'text-[var(--accent-color)]' : 'text-[var(--text-tertiary)]'}`} 
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {note.title}
                        </span>
                        {note.folder && note.folder !== '/' && (
                          <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] opacity-70 truncate bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                            <Folder size={10} />
                            {note.folder}
                          </span>
                        )}
                      </div>
                      {note.snippet && (
                        <p className="text-[11px] text-[var(--text-secondary)] opacity-70 truncate mt-0.5">
                          {note.snippet}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[10px] text-[var(--text-secondary)] opacity-60">
                      {formatDate(note.modifiedAt)}
                    </span>
                    {isSelected && (
                      <CornerDownLeft size={13} className="text-[var(--accent-color)] animate-pulse" />
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
              <p>No notes matching "{query}"</p>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 border-t border-[var(--border-color)] bg-black/5 dark:bg-white/5 flex items-center justify-between text-[11px] text-[var(--text-secondary)] opacity-80">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono text-[10px] bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono text-[10px] bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">↵</kbd> open</span>
          </div>
          <span>{notes.length} total notes</span>
        </div>
      </div>
    </div>
  );
};
