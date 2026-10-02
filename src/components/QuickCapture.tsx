import React, { useEffect, useRef, useState } from 'react';

export const QuickCapture: React.FC = () => {
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(() => localStorage.getItem('scribe_capture_title') || '');
  const [content, setContent] = useState(() => localStorage.getItem('scribe_capture_content') || '');
  const [folder, setFolder] = useState('');
  const [shortcutLabel, setShortcutLabel] = useState('');
  const [shortcutAvailable, setShortcutAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    window.scribeAPI.captureInfo().then(info => { setFolder(info.rootPath.split('/').pop() || 'Notes'); setShortcutAvailable(info.shortcutAvailable); setShortcutLabel(info.shortcutLabel); }).catch(() => setError('Could not locate your notes folder.'));
    document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
    return window.scribeAPI.onShortcutsChanged(state => { setShortcutAvailable(state.available); setShortcutLabel(state.label); });
  }, []);
  useEffect(() => {
    localStorage.setItem('scribe_capture_title', title);
    localStorage.setItem('scribe_capture_content', content);
  }, [title, content]);
  const save = async () => {
    if (saving || (!title.trim() && !content.trim())) return;
    setSaving(true); setError('');
    try {
      await window.scribeAPI.saveCapture(title, content);
      localStorage.removeItem('scribe_capture_title'); localStorage.removeItem('scribe_capture_content');
      await window.scribeAPI.closeCapture();
    } catch (e: any) { setError(e.message || 'Could not save. Your draft is retained.'); setSaving(false); }
  };
  return <div className="h-screen flex flex-col bg-[var(--editor-bg)] text-[var(--text-primary)]"
    onKeyDown={event => {
      if (event.key === 'Escape' && !saving) { event.preventDefault(); window.scribeAPI.closeCapture(); }
      if (!event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void save(); }
    }}>
    <header style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} className="h-14 shrink-0 flex items-center justify-center text-sm font-medium">Quick Capture</header>
    <div className="flex flex-col flex-1 min-h-0 px-6 pb-4 gap-3">
      <input autoFocus aria-label="Note title" dir="auto" placeholder="Title (optional)" value={title} disabled={saving}
        onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.metaKey && !event.ctrlKey) { event.preventDefault(); contentRef.current?.focus(); } }}
        onChange={event => setTitle(event.target.value)} className="text-xl font-semibold bg-transparent outline-none" />
      <textarea ref={contentRef} aria-label="Note content" dir="auto" placeholder="Write something…" value={content} disabled={saving}
        onChange={event => setContent(event.target.value)} className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed" />
      {!shortcutAvailable && <p className="text-xs text-[var(--text-secondary)]">{shortcutLabel || 'This shortcut'} is unavailable. Open Quick Capture from Scribe’s File menu.</p>}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      <footer className="flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
        <span className="truncate" title={folder}>Save to {folder} · ⌘↵</span>
        <button disabled={saving || (!title.trim() && !content.trim())} onClick={() => void save()}
          className="rounded-md px-4 py-2 bg-[var(--accent-color)] text-black disabled:opacity-40">{saving ? 'Saving…' : 'Save Note'}</button>
      </footer>
    </div>
  </div>;
};
