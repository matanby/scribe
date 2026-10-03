import React, { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../utils/useFocusTrap';
import { NoteMeta } from '../types';
import { flushNote } from '../utils/flushNote';

export const RenameDocument: React.FC<{ note: NoteMeta; onRename: (path: string, title: string) => Promise<void>; onClose: () => void }> = ({ note, onRename, onClose }) => {
  const [title, setTitle] = useState(note.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef<HTMLFormElement>(null), input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  useFocusTrap(panel, true);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const extension = note.fileName.match(/\.[^.]+$/)?.[0] || '.md';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = title.trim().replace(/\.(md|markdown)$/i, '');
    if (saving.current || !name) return;
    saving.current = true; setBusy(true); setError('');
    try { await flushNote(note.filePath); await onRename(note.filePath, name); onClose(); }
    catch (error: any) { setError(error.message || 'Could not rename this file.'); setBusy(false); saving.current = false; }
  };
  return <div className="fixed inset-0 z-[110] bg-black/35 backdrop-blur-sm flex items-center justify-center p-6" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form ref={panel} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="rename-file-title" className="w-full max-w-sm rounded-xl border border-[var(--border-color)] bg-[var(--editor-bg)] text-[var(--text-primary)] p-5 shadow-2xl"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onClose(); } }}>
      <h2 id="rename-file-title" className="text-sm font-semibold mb-4">Rename File</h2>
      <label className="block text-xs text-[var(--text-secondary)]">Filename
        <div className="flex items-center gap-2 mt-1.5"><input ref={input} disabled={busy} value={title} onChange={event => setTitle(event.target.value)} className="flex-1 min-w-0 px-3 py-2 rounded-md border border-[var(--border-color)] bg-transparent text-sm text-[var(--text-primary)]" /><span>{extension}</span></div>
      </label>
      {error && <p role="alert" className="text-xs text-red-500 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-5"><button type="button" disabled={busy} onClick={onClose} className="px-3 py-2 rounded-md text-xs hover:bg-black/5 dark:hover:bg-white/10">Cancel</button><button type="submit" disabled={busy || !title.trim()} className="px-3 py-2 rounded-md text-xs font-medium bg-[var(--accent-color)] text-black disabled:opacity-40">{busy ? 'Renaming…' : 'Rename'}</button></div>
    </form>
  </div>;
};
