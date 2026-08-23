import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Fuse from 'fuse.js';
import { NoteMeta } from '../types';
import { Search, FileText, Folder, CornerDownLeft } from 'lucide-react';

interface QuickSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  notes: NoteMeta[];
  onSelectNote: (note: NoteMeta) => void;
  onNewNote: () => void;
}

// Token-aware range calculator that accurately highlights words & prefixes without scattering
function getHighlightRanges(text: string, query: string): [number, number][] {
  if (!text || !query.trim()) return [];

  const ranges: [number, number][] = [];
  const lowerText = text.toLowerCase();
  // Split query into tokens (both words and individual alphanumeric tokens if mixed)
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 0);

  for (const token of tokens) {
    let pos = 0;
    let found = false;

    // 1. Exact substring matches
    while ((pos = lowerText.indexOf(token, pos)) !== -1) {
      ranges.push([pos, pos + token.length - 1]);
      pos += token.length;
      found = true;
    }

    // 2. If multi-char token didn't match exactly, try prefix matches of length >= 2
    if (!found && token.length > 2) {
      for (let len = token.length - 1; len >= 2; len--) {
        const sub = token.slice(0, len);
        let subPos = lowerText.indexOf(sub);
        if (subPos !== -1) {
          ranges.push([subPos, subPos + len - 1]);
          break;
        }
      }
    }
  }

  // Merge overlapping or contiguous ranges
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];

  for (const [start, end] of ranges) {
    if (merged.length > 0 && start <= merged[merged.length - 1][1] + 1) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}

// Render string with highlight ranges cleanly
function renderHighlightedText(text: string, ranges: [number, number][]) {
  if (!ranges || ranges.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  ranges.forEach(([start, end], i) => {
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }
    parts.push(
      <span
        key={i}
        className="font-bold text-[var(--accent-color)] underline decoration-[var(--accent-color)]/40 underline-offset-[3px]"
      >
        {text.slice(start, end + 1)}
      </span>
    );
    lastIndex = end + 1;
  });

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
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

  // Configure Fuse.js for fuzzy scoring and ranking
  const fuse = useMemo(() => {
    return new Fuse(notes, {
      keys: [
        { name: 'title', weight: 0.7 },
        { name: 'folder', weight: 0.2 },
        { name: 'snippet', weight: 0.1 }
      ],
      threshold: 0.45,
      distance: 100,
      ignoreLocation: true,
      minMatchCharLength: 1
    });
  }, [notes]);

  // Compute filtered notes
  const filteredNotes = useMemo(() => {
    if (!query.trim()) {
      return notes.slice(0, 25);
    }
    const results = fuse.search(query.trim());
    return results.slice(0, 25).map(r => r.item);
  }, [query, fuse, notes]);

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

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] bg-black/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-150 p-4"
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
            placeholder="Quick Switcher (⌘P) — type to search notes..."
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none font-medium"
          />
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-color)] px-1.5 py-0.5 rounded-md shrink-0">
            esc
          </span>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 space-y-1">
          {filteredNotes.length > 0 ? (
            filteredNotes.map((note, index) => {
              const isSelected = index === selectedIndex;
              const titleRanges = getHighlightRanges(note.title, query);
              const snippetRanges = getHighlightRanges(note.snippet || '', query);

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
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate" dir="auto">
                          {renderHighlightedText(note.title, titleRanges)}
                        </span>
                        {note.folder && note.folder !== '/' && (
                          <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] opacity-70 truncate bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                            <Folder size={10} />
                            {note.folder}
                          </span>
                        )}
                      </div>
                      {note.snippet && (
                        <p className="text-[11px] text-[var(--text-secondary)] opacity-70 truncate mt-0.5" dir="auto">
                          {renderHighlightedText(note.snippet, snippetRanges)}
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

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
