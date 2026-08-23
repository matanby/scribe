import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { 
  ChevronUp, 
  ChevronDown, 
  X, 
  CaseSensitive,
  ChevronRight
} from 'lucide-react';

interface FindReplaceBarProps {
  editor: Editor | null;
  isOpen: boolean;
  showReplaceInitial?: boolean;
  onClose: () => void;
}

export const FindReplaceBar: React.FC<FindReplaceBarProps> = ({
  editor,
  isOpen,
  showReplaceInitial = false,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [showReplace, setShowReplace] = useState(showReplaceInitial);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const storage = editor?.storage?.searchReplace as any;
  const resultsCount = storage?.results?.length || 0;
  const currentIndex = resultsCount > 0 ? (storage?.currentIndex || 0) + 1 : 0;

  useEffect(() => {
    if (isOpen) {
      if (showReplaceInitial) {
        setShowReplace(true);
      }
      setTimeout(() => {
        if (showReplaceInitial && searchTerm) {
          replaceInputRef.current?.focus();
          replaceInputRef.current?.select();
        } else {
          inputRef.current?.focus();
          inputRef.current?.select();
        }
      }, 50);
    } else {
      if (editor && !editor.isDestroyed) {
        editor.commands.clearSearch();
      }
    }
  }, [isOpen, showReplaceInitial]);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (editor && !editor.isDestroyed) {
      editor.commands.setSearchTerm(val);
    }
  };

  const handleReplaceChange = (val: string) => {
    setReplaceTerm(val);
    if (editor && !editor.isDestroyed) {
      editor.commands.setReplaceTerm(val);
    }
  };

  const handleToggleCase = () => {
    const next = !caseSensitive;
    setCaseSensitive(next);
    if (editor && !editor.isDestroyed) {
      editor.commands.setCaseSensitive(next);
    }
  };

  const handleNext = () => {
    if (editor && !editor.isDestroyed) editor.commands.findNext();
  };

  const handlePrevious = () => {
    if (editor && !editor.isDestroyed) editor.commands.findPrevious();
  };

  const handleReplace = () => {
    if (editor && !editor.isDestroyed) editor.commands.replaceCurrent();
  };

  const handleReplaceAll = () => {
    if (editor && !editor.isDestroyed) editor.commands.replaceAll();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevious();
      } else {
        handleNext();
      }
    }
  };

  return (
    <div 
      className={`no-print absolute top-3 right-6 z-30 flex flex-col bg-white/95 dark:bg-[#222226]/95 backdrop-blur-2xl border border-[var(--border-color)] shadow-2xl rounded-2xl p-1.5 transition-all text-xs select-none ${
        isOpen ? 'block animate-in fade-in duration-100' : 'hidden'
      }`}
    >
      {/* Top Search Row */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowReplace(!showReplace)}
          className={`p-1 rounded-md transition-colors ${
            showReplace 
              ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]' 
              : 'text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          title="Toggle Replace (⌘⇧F)"
        >
          <ChevronRight size={13} className={`transition-transform duration-150 ${showReplace ? 'rotate-90' : ''}`} />
        </button>

        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find in note (⌘F)..."
            className="w-44 px-2 py-1 rounded-lg bg-black/5 dark:bg-white/5 border border-transparent focus:border-[var(--accent-color)] focus:bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none text-xs"
          />
          {searchTerm && (
            <span className="absolute right-2 text-[10px] text-[var(--text-secondary)] pointer-events-none">
              {resultsCount > 0 ? `${currentIndex}/${resultsCount}` : '0/0'}
            </span>
          )}
        </div>

        <button
          onClick={handleToggleCase}
          className={`p-1 rounded-md transition-colors ${
            caseSensitive 
              ? 'bg-[var(--accent-color)] text-white shadow-xs' 
              : 'text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          title="Match Case"
        >
          <CaseSensitive size={14} />
        </button>

        <button
          onClick={handlePrevious}
          disabled={resultsCount === 0}
          className="p-1 rounded-md text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Previous Match (Shift+Enter)"
        >
          <ChevronUp size={14} />
        </button>

        <button
          onClick={handleNext}
          disabled={resultsCount === 0}
          className="p-1 rounded-md text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Next Match (Enter)"
        >
          <ChevronDown size={14} />
        </button>

        <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-0.5" />

        <button
          onClick={onClose}
          className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Expandable Replace Row */}
      {showReplace && (
        <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-[var(--border-color)] animate-in fade-in duration-100">
          <span className="w-5" />
          <input
            ref={replaceInputRef}
            type="text"
            value={replaceTerm}
            onChange={(e) => handleReplaceChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleReplace();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Replace with..."
            className="w-44 px-2 py-1 rounded-lg bg-black/5 dark:bg-white/5 border border-transparent focus:border-[var(--accent-color)] focus:bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none text-xs"
          />

          <button
            onClick={handleReplace}
            disabled={resultsCount === 0}
            className="px-2 py-1 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none text-[11px] font-medium transition-colors"
          >
            Replace
          </button>

          <button
            onClick={handleReplaceAll}
            disabled={resultsCount === 0}
            className="px-2 py-1 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none text-[11px] font-medium transition-colors"
          >
            All
          </button>
        </div>
      )}
    </div>
  );
};
