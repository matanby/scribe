import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';

interface Entry { id: number; root: string; trashPath: string; title: string }
export function useTrashUndo(root: string, restore: (entry: Entry) => Promise<void>) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const toastRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef(root); rootRef.current = root;
  const restoring = useRef(false);
  const current = entries[entries.length - 1];
  useEffect(() => { setEntries([]); setError(''); setPaused(false); }, [root]);
  useEffect(() => {
    setError('');
    setPaused(!!current && !!toastRef.current && (toastRef.current.matches(':hover') || toastRef.current.contains(document.activeElement)));
  }, [current?.id]);
  useEffect(() => {
    if (!current || paused || busy) return;
    const timer = setTimeout(() => setEntries([]), 10000);
    return () => clearTimeout(timer);
  }, [current?.id, paused, busy]);
  const remember = useCallback((operationRoot: string, trashPath: string, title: string) => {
    if (rootRef.current !== operationRoot) return;
    setEntries(previous => [...previous, { id: ++sequence.current, root: operationRoot, trashPath, title }].slice(-10));
  }, []);
  const undo = async () => {
    if (!current || restoring.current || current.root !== rootRef.current) return;
    restoring.current = true; setBusy(true); setError('');
    try { await restore(current); setEntries(previous => previous.filter(entry => entry.id !== current.id)); }
    catch (error: any) { setError(error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
    finally { restoring.current = false; setBusy(false); }
  };
  const toast = current && <div ref={toastRef} role="status" aria-live="polite" aria-atomic="true"
    className="no-print fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-40px)] rounded-xl border border-[var(--border-color)] bg-[var(--editor-bg)] shadow-lg p-3 text-[var(--text-primary)]"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(!!toastRef.current?.contains(document.activeElement))}
    onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(!!toastRef.current?.matches(':hover')); }}>
    <div className="flex items-center gap-3 text-xs">
      <span className="flex-1 min-w-0"><span dir="auto" className="block truncate font-medium">{current.title}</span><span className="block mt-0.5 text-[var(--text-secondary)]">Moved to Trash</span></span>
      <button type="button" disabled={busy} onClick={() => void undo()} className="shrink-0 px-2 py-1.5 rounded-md font-medium text-[var(--accent-color)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40">{busy ? 'Restoring…' : 'Undo'}</button>
      <button type="button" aria-label="Dismiss undo notification" disabled={busy} onClick={() => { setEntries([]); setPaused(false); }} className="shrink-0 rounded p-1 text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"><X size={13} /></button>
    </div>
    {error && <p className="text-xs text-red-500 mt-2" role="alert">{error}</p>}
  </div>;
  return { remember, toast };
}
