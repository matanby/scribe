import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderPlus, Edit3, X } from 'lucide-react';
import { useFocusTrap } from '../utils/useFocusTrap';

export interface FolderDialogState {
  isOpen: boolean;
  mode: 'newFolder' | 'newSubfolder' | 'renameFolder';
  parentPath: string;
  initialValue?: string;
  title: string;
}

interface FolderDialogProps {
  state: FolderDialogState;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

export const FolderDialog: React.FC<FolderDialogProps> = ({ state, onClose, onConfirm }) => {
  const [folderName, setFolderName] = useState(state.initialValue || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, state.isOpen);

  useEffect(() => {
    if (state.isOpen) {
      setFolderName(state.initialValue || '');
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [state.isOpen, state.initialValue, onClose]);

  if (!state.isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = folderName.trim();
    if (trimmed) {
      onConfirm(trimmed);
      onClose();
    }
  };

  const isRename = state.mode === 'renameFolder';

  const modalContent = (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-150 p-4"
    >
      <div 
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white/95 dark:bg-[#202024]/95 backdrop-blur-2xl border border-[var(--border-color)] shadow-2xl rounded-2xl overflow-hidden flex flex-col select-none animate-in zoom-in-95 duration-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            {isRename ? (
              <Edit3 size={16} className="text-[var(--accent-color)]" />
            ) : (
              <FolderPlus size={16} className="text-[var(--accent-color)]" />
            )}
            <span>{state.title}</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Folder Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g. Work, Projects, Receipts"
              dir="auto"
              className="w-full h-9 px-3 text-xs rounded-xl bg-black/5 dark:bg-white/10 border border-transparent focus:border-[var(--accent-border)] focus:bg-white dark:focus:bg-[#28282c] text-[var(--text-primary)] outline-none transition-all"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!folderName.trim()}
              className="px-4 py-1.5 rounded-xl bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none shadow-sm transition-all"
            >
              {isRename ? 'Rename' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
