import React, { useEffect, useRef, useState } from 'react';
import { Search, FolderOpen, Sun, Moon, Check, RefreshCw, PanelLeft, X, MoreHorizontal, ChevronLeft, ChevronRight, NotebookPen, AlertTriangle, Focus, SquarePen } from 'lucide-react';
import { Popover } from './Popover';

interface TitlebarProps {
  currentFolder: string;
  documentTitle?: string;
  documentPath?: string;
  onRenameDocument?: () => void;
  onDocumentHistory?: () => void;
  onRevealDocument?: () => void;
  onOpenLibrary?: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: () => void;
  onNewNote: () => void;
  onSelectFolder: () => void;
  isSaving: boolean;
  lastSavedText: string;
  isDark: boolean;
  onToggleTheme: () => void;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  writingFocus: boolean;
  onToggleFocus: () => void;
  libraryWidth: number;
  toolbarRef: (element: HTMLDivElement | null) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  onGoBack?: () => void;
  onGoForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onQuickCapture?: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = (props) => {
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    const doubleClick = (event: MouseEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      if (event.target.closest('button, input, textarea, select, a, [role="button"], .titlebar-no-drag')) return;
      void window.scribeAPI.titleBarDoubleClick().catch(error => console.error('Could not resize window:', error));
    };
    // Use DOM bubbling so this also covers the editor toolbar rendered here
    // through a React portal. Native drag regions consume their own clicks.
    header?.addEventListener('dblclick', doubleClick);
    return () => header?.removeEventListener('dblclick', doubleClick);
  }, []);
  const [showSaving, setShowSaving] = useState(false);
  useEffect(() => {
    if (!props.isSaving) { setShowSaving(false); return; }
    const timer = setTimeout(() => setShowSaving(true), 800);
    return () => clearTimeout(timer);
  }, [props.isSaving]);
  const documentMode = !!props.documentTitle;
  const saveFailed = props.lastSavedText === "Couldn't save" || props.lastSavedText === 'Review changes';
  const actions = [
    { label: 'Find in Note…', icon: Search, run: () => window.dispatchEvent(new CustomEvent('scribe:find', { detail: false })), shortcut: '⌘F' },
    { label: 'Find and Replace…', icon: Search, run: () => window.dispatchEvent(new CustomEvent('scribe:find', { detail: true })), shortcut: '⌘⇧F' },
    ...(props.onRenameDocument ? [{ label: 'Rename File…', icon: SquarePen, run: props.onRenameDocument }] : []),
    { label: 'Version History…', icon: RefreshCw, run: () => window.dispatchEvent(new Event('scribe:open-history')) },
    ...(props.onRevealDocument ? [{ label: 'Reveal in Finder', icon: FolderOpen, run: props.onRevealDocument }] : []),
    ...(props.onOpenLibrary ? [{ label: 'Open Notes Library', icon: NotebookPen, run: props.onOpenLibrary }] : []),
    ...(!documentMode ? [
      { label: props.writingFocus ? 'Leave Writing Focus' : 'Enter Writing Focus', icon: Focus, run: props.onToggleFocus, shortcut: '⌘⇧L' },
      ...(props.onQuickCapture ? [{ label: 'Quick Capture…', icon: NotebookPen, run: props.onQuickCapture }] : []),
      { label: 'Open Notes Folder…', icon: FolderOpen, run: props.onSelectFolder }
    ] : []),
    { label: props.isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode', icon: props.isDark ? Sun : Moon, run: props.onToggleTheme }
  ];
  return <header ref={headerRef} className={`app-titlebar titlebar-drag-region no-print ${documentMode ? 'document-titlebar' : ''}`}>
    <div className={`library-toolbar ${props.libraryWidth < 380 ? 'compact-navigation' : ''}`} style={{ width: documentMode ? 92 : props.libraryWidth }}>
      {!documentMode && <>
        <button onClick={props.onToggleSidebar} className="chrome-button titlebar-no-drag" aria-label={props.showSidebar ? 'Hide folders' : 'Show folders'} title={`${props.showSidebar ? 'Hide' : 'Show'} Folders (⌘\\)`} aria-pressed={props.showSidebar}><PanelLeft size={18} /></button>
        <div className="navigation-history titlebar-no-drag">
          <button onClick={props.onGoBack} disabled={!props.canGoBack} className="chrome-button" aria-label="Back" title="Back (⌘[)"><ChevronLeft size={17} /></button>
          <button onClick={props.onGoForward} disabled={!props.canGoForward} className="chrome-button" aria-label="Forward" title="Forward (⌘])"><ChevronRight size={17} /></button>
        </div>
        <div className="library-search titlebar-no-drag">
          <Search size={14} aria-hidden="true" />
          <input ref={props.searchInputRef} aria-label="Search notes" placeholder="Search notes" value={props.searchQuery} dir="auto"
            onChange={event => props.onSearchChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.onSearchChange(''); }
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); props.onSearchSubmit(); }
            }} />
          {props.searchQuery && <button onClick={() => { props.onSearchChange(''); props.searchInputRef?.current?.focus(); }} aria-label="Clear search"><X size={13} /></button>}
          {!props.searchQuery && <span className="search-shortcut" aria-hidden="true">⌥⌘F</span>}
        </div>
      </>}
    </div>
    <div className="editor-toolbar">
      <div ref={props.toolbarRef} id="editor-toolbar-slot" className="editor-toolbar-slot" />
      {documentMode && <span className="document-name" dir="auto" title={props.documentPath}>{props.documentTitle}</span>}
      <div className={`save-status ${saveFailed ? 'save-status-error' : ''}`} role="status" aria-live="polite" title={props.lastSavedText || 'All changes saved'}>
        {saveFailed ? <><AlertTriangle size={15} /><span>{props.lastSavedText}</span></> : showSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
        {!saveFailed && <span className="sr-only">{showSaving ? 'Saving changes' : props.lastSavedText ? 'All changes saved' : ''}</span>}
      </div>
      {!documentMode && <button onClick={props.onToggleFocus} className="chrome-button focus-toggle" aria-pressed={props.writingFocus} aria-label={props.writingFocus ? 'Leave writing focus' : 'Enter writing focus'} title="Writing Focus (⌘⇧L)"><Focus size={17} /></button>}
      <Popover label="More actions" align="right" triggerClassName="chrome-button" trigger={<MoreHorizontal size={18} />}>
        {close => <>{actions.map(({ label, icon: Icon, run, ...action }) => <button key={label} className="menu-item" onClick={() => { close(); run(); }}><Icon size={15} /><span>{label}</span>{'shortcut' in action && <kbd>{action.shortcut}</kbd>}</button>)}</>}
      </Popover>
    </div>
  </header>;
};
