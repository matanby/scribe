import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, FileText, RotateCcw, X } from 'lucide-react';
import { NoteMeta } from '../types';
import { useFocusTrap } from '../utils/useFocusTrap';
import { NotePreview } from './NotePreview';

interface Version { id: string; savedAt: number; excerpt: string; wordCount: number }
interface Props { note: NoteMeta; currentMarkdown: string; onClose: () => void; onRestore: (id: string) => Promise<void> }
const CURRENT = 'current';
const dateLabel = (timestamp: number) => {
  const date = new Date(timestamp), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const day = date.toDateString() === today.toDateString() ? 'Today' : date.toDateString() === yesterday.toDateString() ? 'Yesterday' : date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
  return `${day}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

export const NoteHistory: React.FC<Props> = ({ note, currentMarkdown, onClose, onRestore }) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState(CURRENT);
  const [preview, setPreview] = useState<{ id: string; markdown: string } | null>(null);
  const [listError, setListError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const previewScroll = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  useFocusTrap(panel, true);

  useEffect(() => {
    rowRefs.current.get(CURRENT)?.focus();
    let active = true;
    window.scribeAPI.listVersions(note.filePath).then(items => {
      if (active) { setVersions(items); setListLoading(false); }
    }).catch(error => { if (active) { setListError(error.message); setListLoading(false); } });
    return () => { active = false; };
  }, [note.filePath]);

  useEffect(() => {
    setPreviewError(''); setRestoreError('');
    if (selected === CURRENT) return;
    let active = true;
    window.scribeAPI.previewVersion(note.filePath, selected).then(markdown => {
      if (active) setPreview({ id: selected, markdown });
    }).catch(error => { if (active) setPreviewError(error.message); });
    return () => { active = false; };
  }, [selected, note.filePath]);

  useEffect(() => { if (previewScroll.current) previewScroll.current.scrollTop = 0; }, [selected, preview]);
  const current = selected === CURRENT;
  const version = versions.find(item => item.id === selected);
  const loading = !current && preview?.id !== selected && !previewError;
  const markdown = current ? currentMarkdown : preview?.id === selected ? preview.markdown : '';
  const select = (id: string) => { if (!busy) setSelected(id); };
  const navigate = (event: React.KeyboardEvent, id: string) => {
    if (event.nativeEvent.isComposing || busy || event.altKey || event.ctrlKey || event.metaKey) return;
    const ids = [CURRENT, ...versions.map(item => item.id)];
    const index = ids.indexOf(id);
    const target = event.key === 'ArrowDown' ? ids[Math.min(index + 1, ids.length - 1)] : event.key === 'ArrowUp' ? ids[Math.max(0, index - 1)] : event.key === 'Home' ? ids[0] : event.key === 'End' ? ids[ids.length - 1] : null;
    if (target) { event.preventDefault(); select(target); rowRefs.current.get(target)?.focus(); }
  };
  const row = (id: string, label: string, excerpt: string, words?: number) => <button key={id} ref={element => { if (element) rowRefs.current.set(id, element); else rowRefs.current.delete(id); }}
    type="button" role="option" aria-selected={selected === id} tabIndex={selected === id ? 0 : -1} disabled={busy}
    onClick={() => select(id)} onKeyDown={event => navigate(event, id)}
    title={id === CURRENT ? 'The note as it is now' : new Date(versions.find(item => item.id === id)!.savedAt).toLocaleString()}
    className={`w-full rounded-lg px-3 py-3 text-left transition-colors ${selected === id ? 'bg-[var(--card-active)]' : 'hover:bg-[var(--card-hover)]'}`}>
    <span className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">{id === CURRENT ? <FileText size={13} /> : <Clock3 size={13} />}<span>{label}</span></span>
    <span dir="auto" className="block text-left text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-2 mt-1.5">{excerpt || 'Empty note'}</span>
    {words !== undefined && <span className="block text-[11px] text-[var(--text-tertiary)] mt-1">{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>}
  </button>;

  return createPortal(<div className="fixed inset-0 z-[100] bg-black/35 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="history-title" tabIndex={-1}
      className="w-full max-w-[1040px] h-[85vh] max-h-[860px] flex flex-col rounded-xl shadow-2xl border border-[var(--border-color)] bg-[var(--editor-bg)] text-[var(--text-primary)] overflow-hidden"
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); } }}>
      <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[var(--border-color)]">
        <div className="min-w-0"><h2 id="history-title" className="text-sm font-semibold">Version History</h2><p dir="auto" className="text-left text-xs text-[var(--text-secondary)] truncate mt-1">{note.title}</p></div>
        <button type="button" aria-label="Close version history" disabled={busy} onClick={onClose} className="p-1.5 rounded-md text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"><X size={17} /></button>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="w-[210px] sm:w-[240px] shrink-0 flex flex-col bg-[var(--notelist-bg)] border-r border-[var(--border-color)]">
          <div role="listbox" aria-label="Note versions. Use arrow keys to browse." aria-orientation="vertical" className="flex-1 overflow-y-auto p-2 space-y-1">
            {row(CURRENT, 'Current version', 'The note as it is now')}
            <p className="px-3 pt-3 pb-1 text-[11px] font-semibold text-[var(--text-secondary)]">Previous versions{versions.length ? ` · ${versions.length}` : ''}</p>
            {versions.map(item => row(item.id, dateLabel(item.savedAt), item.excerpt, item.wordCount))}
            {listLoading && <p role="status" className="px-3 py-3 text-xs text-[var(--text-secondary)]">Loading versions…</p>}
            {listError && <p role="alert" className="px-3 py-3 text-xs text-red-500">{listError}</p>}
            {!listLoading && !listError && !versions.length && <p className="px-3 py-3 text-xs leading-relaxed text-[var(--text-secondary)]">Previous versions will appear here as you edit this note.</p>}
          </div>
        </aside>
        <section className="flex-1 min-w-0 flex flex-col" aria-label="Version preview" aria-busy={loading}>
          <div className="px-6 py-3 border-b border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] flex items-center justify-between gap-3">
            <span>{current ? 'Current version' : version ? dateLabel(version.savedAt) : 'Previous version'}</span><span className="shrink-0">Read only</span>
          </div>
          <div ref={previewScroll} tabIndex={0} aria-label="Preview content" className="flex-1 overflow-y-auto px-6 sm:px-8 py-6">
            {loading ? <p role="status" className="text-sm text-[var(--text-secondary)]">Loading preview…</p> : previewError ? <p role="alert" className="text-sm text-red-500">{previewError}</p> : <>
              <h3 dir="auto" className="text-2xl font-bold mb-5">{note.title}</h3>
              {markdown.trim() ? <NotePreview key={selected} markdown={markdown} /> : <p className="text-sm text-[var(--text-secondary)]">This version is empty.</p>}
            </>}
          </div>
        </section>
      </div>
      <footer className="flex items-center justify-between gap-4 px-5 py-4 border-t border-[var(--border-color)]">
        <div className="min-w-0 text-xs text-[var(--text-secondary)]">{restoreError ? <p role="alert" className="text-red-500">{restoreError}</p> : current ? 'Select a previous version to preview or restore it.' : 'Your current version is kept when you restore.'}</div>
        <button type="button" disabled={current || loading || busy || !!previewError || !version} className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--accent-color)] text-black text-xs font-medium disabled:opacity-35"
          onClick={async () => { setBusy(true); setRestoreError(''); try { await onRestore(selected); onClose(); } catch (error: any) { setRestoreError(error.message); setBusy(false); } }}>
          <RotateCcw size={13} />{busy ? 'Restoring…' : 'Restore This Version'}
        </button>
      </footer>
    </div>
  </div>, document.body);
};
