import React from 'react';
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
  Languages,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Printer
} from 'lucide-react';

interface TitlebarProps {
  currentFolder: string;
  activeNoteTitle: string;
  noteCount: number;
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
  onToggleDirection?: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  onGoBack?: () => void;
  onGoForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onExportPDF?: () => void;
  onPrint?: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  currentFolder,
  activeNoteTitle,
  noteCount,
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
  onToggleDirection,
  searchInputRef,
  onGoBack,
  onGoForward,
  canGoBack,
  canGoForward,
  onExportPDF,
  onPrint
}) => {
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
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">{currentFolder || 'All Notes'}</span>
          {activeNoteTitle && (
            <>
              <span className="opacity-40">/</span>
              <span className="truncate max-w-[140px] opacity-80" dir="auto">{activeNoteTitle}</span>
            </>
          )}
        </div>
      </div>

      {/* Center section: Search input */}
      <div className="titlebar-no-drag flex-1 max-w-xs mx-4">
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2.5 text-[var(--text-secondary)] pointer-events-none opacity-60" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={`Search ${noteCount} notes...`}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-6 pl-7 pr-7 text-[11.5px] rounded-md bg-black/5 dark:bg-white/10 border border-transparent focus:border-[var(--accent-border)] focus:bg-white dark:focus:bg-[#252528] text-[var(--text-primary)] placeholder-[var(--text-secondary)] placeholder:opacity-70 outline-none transition-all shadow-inner"
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

      {/* Right section: Save status, RTL override, Theme, Folder picker, New Note */}
      <div className="titlebar-no-drag flex items-center gap-1.5">
        {/* Auto-save status */}
        <div className="flex items-center gap-1 text-[10.5px] text-[var(--text-secondary)] mr-2">
          {isSaving ? (
            <>
              <RefreshCw size={11} className="animate-spin text-[var(--accent-color)]" />
              <span>Saving</span>
            </>
          ) : lastSavedText ? (
            <>
              <Check size={11} className="text-emerald-500" />
              <span className="opacity-70">{lastSavedText}</span>
            </>
          ) : null}
        </div>

        {/* Export PDF Button */}
        {onExportPDF && (
          <button
            onClick={onExportPDF}
            title="Export Note as PDF"
            className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <FileDown size={15} />
          </button>
        )}

        {/* Print Button */}
        {onPrint && (
          <button
            onClick={onPrint}
            title="Print Note (⌘P)"
            className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Printer size={15} />
          </button>
        )}

        {/* Change Folder */}
        <button
          onClick={onSelectFolder}
          title="Open Notes Directory"
          className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <FolderOpen size={15} />
        </button>

        {/* Dark/Light mode toggle */}
        <button
          onClick={onToggleTheme}
          title="Toggle Light / Dark Mode"
          className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* New Note Button */}
        <button
          onClick={onNewNote}
          title="New Note (⌘N)"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold shadow-sm transition-all active:scale-95 ml-1"
        >
          <SquarePen size={13} />
          <span>New Note</span>
        </button>
      </div>
    </header>
  );
};
