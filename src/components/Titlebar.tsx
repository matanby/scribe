import React, { useEffect, useRef, useState } from 'react';
import { 
  SquarePen, 
  Search, 
  FolderOpen, 
  Sun, 
  Moon, 
  Check, 
  RefreshCw,
  Sidebar as SidebarIcon,
  X,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Printer,
  NotebookPen
} from 'lucide-react';

interface TitlebarProps {
  currentFolder: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNewNote: () => void;
  onSelectFolder: () => void;
  isSaving: boolean;
  lastSavedText: string;
  isDark: boolean;
  onToggleTheme: () => void;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  onGoBack?: () => void;
  onGoForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onQuickCapture?: () => void;
  onExportPDF?: () => void;
  onPrint?: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  currentFolder,
  searchQuery,
  onSearchChange,
  onNewNote,
  onSelectFolder,
  isSaving,
  lastSavedText,
  isDark,
  onToggleTheme,
  showSidebar,
  onToggleSidebar,
  searchInputRef,
  onGoBack,
  onGoForward,
  canGoBack,
  canGoForward,
  onQuickCapture,
  onExportPDF,
  onPrint
}) => {
  const [showActions, setShowActions] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setShowActions(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showActions) {
        setShowActions(false);
        actionsButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showActions]);
  const secondaryActions = [
    ...(onQuickCapture ? [{ label: 'Quick Capture…', icon: NotebookPen, action: onQuickCapture }] : []),
    ...(onExportPDF ? [{ label: 'Export PDF…', icon: FileDown, action: onExportPDF }] : []),
    ...(onPrint ? [{ label: 'Print…', icon: Printer, action: onPrint }] : []),
    { label: 'Open Notes Folder…', icon: FolderOpen, action: onSelectFolder },
    { label: isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode', icon: isDark ? Sun : Moon, action: onToggleTheme }
  ];
  return (
    <header className="titlebar-drag-region no-print h-11 border-b border-[var(--border-color)] flex items-center justify-between px-3 select-none bg-[var(--sidebar-bg)] backdrop-blur-2xl shrink-0 z-30">
      {/* Left section: traffic lights spacing, history arrows & sidebar toggle */}
      <div className="flex items-center gap-1.5 pl-[72px] titlebar-no-drag">
        {/* Navigation History */}
        <div className="flex items-center gap-0.5 mr-1">
          <button
            onClick={onGoBack}
            disabled={!canGoBack}
            title="Back (⌘[)"
            className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-25 disabled:pointer-events-none active:scale-95"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={onGoForward}
            disabled={!canGoForward}
            title="Forward (⌘])"
            className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-25 disabled:pointer-events-none active:scale-95"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <button
          onClick={onToggleSidebar}
          title={showSidebar ? "Hide Sidebar (⌘\\)" : "Show Sidebar (⌘\\)"}
          className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:scale-95"
        >
          <SidebarIcon size={15} />
        </button>

        {/* Breadcrumb path */}
        <div className="text-[13px] text-[var(--text-primary)] min-w-0">
          <span className="block truncate max-w-[180px] font-medium" dir="auto">{currentFolder || 'All Notes'}</span>
        </div>
      </div>

      {/* Center section: Search input */}
      <div className="titlebar-no-drag flex-1 max-w-xs mx-4">
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2.5 text-[var(--text-secondary)] pointer-events-none opacity-60" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search notes…"
            aria-label="Search notes"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-7 pl-7 pr-7 text-xs rounded-md bg-black/5 dark:bg-white/10 border border-transparent focus:border-[var(--accent-border)] focus:bg-white dark:focus:bg-[#252528] text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none transition-colors"
          />
          {searchQuery ? (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-0.5 rounded-full"
            >
              <X size={11} />
            </button>
          ) : (
            <span className="absolute right-2 text-[9px] font-medium text-[var(--text-secondary)] opacity-40 uppercase pointer-events-none">
              ⌘F
            </span>
          )}
        </div>
      </div>

      {/* Save status, secondary actions, and New Note */}
      <div className="titlebar-no-drag flex items-center gap-1.5">
        {/* Auto-save status */}
        <div role="status" className="flex items-center gap-1 text-[10.5px] text-[var(--text-secondary)] mr-2">
          {isSaving ? (
            <>
              <RefreshCw size={11} className="animate-spin text-[var(--accent-color)]" />
              <span>Saving</span>
            </>
          ) : lastSavedText ? (
            <>
              <span role="img" title={lastSavedText} aria-label={lastSavedText}><Check size={11} className="text-[var(--text-secondary)]" /></span>
            </>
          ) : null}
        </div>

        <div className="relative" ref={actionsRef} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowActions(false);
        }}>
          <button
            ref={actionsButtonRef}
            onClick={() => setShowActions(!showActions)}
            aria-label="More actions"
            aria-expanded={showActions}
            aria-controls="titlebar-actions"
            title="More actions"
            className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <MoreHorizontal size={15} />
          </button>
          {showActions && (
            <div id="titlebar-actions" className="absolute right-0 top-full mt-2 w-52 p-1.5 rounded-xl bg-[var(--editor-bg)] border border-[var(--border-color)] shadow-xl z-50">
              {secondaryActions.map(({ label, icon: Icon, action }) => (
                <button key={label} onClick={() => {
                  setShowActions(false);
                  actionsButtonRef.current?.focus();
                  action();
                }} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10">
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* New Note Button */}
        <button
          onClick={onNewNote}
          title="New Note (⌘N)"
          aria-label="New note"
          className="p-1.5 rounded-md text-[var(--accent-color)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors ml-1"
        >
          <SquarePen size={18} />
        </button>
      </div>
    </header>
  );
};
