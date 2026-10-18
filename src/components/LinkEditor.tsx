import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Editor } from '@tiptap/react';
import { ExternalLink, Link2, Unlink, X } from 'lucide-react';
import { normalizeLink } from '../utils/links';

export interface LinkAnchor { left: number; top: number; bottom: number }

export const LinkEditor: React.FC<{ editor: Editor; anchor: LinkAnchor; onClose: () => void }> = ({ editor, anchor, onClose }) => {
  const existing = useRef(editor.getAttributes('link').href as string || '');
  const [url, setUrl] = useState(existing.current);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ left: 12, top: 64 });
  const panel = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const bookmark = useRef(editor.state.selection.getBookmark());
  const returnFocus = () => { if (!editor.isDestroyed) editor.commands.focus(undefined, { scrollIntoView: false }); };
  const close = () => { onClose(); returnFocus(); };
  useLayoutEffect(() => {
    const place = () => {
      const height = panel.current?.offsetHeight || 180;
      const width = panel.current?.offsetWidth || 320;
      setPosition({ left: Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12)), top: Math.max(12, anchor.bottom + height + 10 < window.innerHeight ? anchor.bottom + 8 : anchor.top - height - 8) });
    };
    place(); window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);
  useEffect(() => {
    const map = ({ transaction }: any) => { bookmark.current = bookmark.current.map(transaction.mapping); };
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) onClose(); };
    const dismiss = () => onClose();
    window.dispatchEvent(new CustomEvent('scribe:popover-open', { detail: 'link-editor' }));
    editor.on('transaction', map);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scribe:popover-open', dismiss);
    input.current?.focus(); input.current?.select();
    return () => { editor.off('transaction', map); document.removeEventListener('pointerdown', outside); window.removeEventListener('scribe:popover-open', dismiss); };
  }, [editor, onClose]);
  const restore = () => {
    if (editor.isDestroyed) return false;
    try { editor.view.dispatch(editor.state.tr.setSelection(bookmark.current.resolve(editor.state.doc))); return true; }
    catch { setError('The selected text changed. Select it again to edit this link.'); return false; }
  };
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    let href: string;
    try { href = normalizeLink(url); } catch (error) { setError((error as Error).message); return; }
    if (!restore()) return;
    const chain = editor.chain().focus(undefined, { scrollIntoView: false });
    const success = editor.state.selection.empty
      ? chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run()
      : chain.setLink({ href }).run();
    if (!success) { setError('This address cannot be used as a link.'); return; }
    close();
  };
  return createPortal(<form ref={panel} role="dialog" aria-label={existing.current ? 'Edit link' : 'Insert link'} className="link-editor no-print" style={{ left: position.left, top: position.top }} onSubmit={apply}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="flex items-center gap-2 mb-3"><Link2 size={15} /><h2 className="text-xs font-semibold flex-1">{existing.current ? 'Edit Link' : 'Add Link'}</h2><button type="button" aria-label="Close link editor" className="chrome-button" onClick={close}><X size={14} /></button></div>
    <label className="text-[11px] text-[var(--text-secondary)]" htmlFor="link-address">Link address</label>
    <input ref={input} id="link-address" className="link-input" type="text" autoComplete="off" spellCheck={false} dir="ltr" placeholder="https://example.com" value={url} onChange={event => { setUrl(event.target.value); setError(''); }} aria-describedby={error ? 'link-error' : undefined} aria-invalid={!!error} />
    {error && <p id="link-error" role="alert" className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
    <div className="flex items-center justify-between gap-2 mt-3">
      <div className="flex gap-1">{existing.current && <>
        <button type="button" className="chrome-button" aria-label="Remove link" title="Remove Link" onClick={() => { if (restore()) { editor.chain().focus().unsetLink().run(); close(); } }}><Unlink size={15} /></button>
        {/^(https?:\/\/|mailto:)/i.test(existing.current) && <button type="button" className="chrome-button" aria-label="Open link" title="Open Link" onClick={() => { void window.scribeAPI.openExternal(existing.current).catch(() => setError('This link could not be opened.')); }}><ExternalLink size={15} /></button>}
      </>}</div><button type="submit" className="primary-button">{existing.current ? 'Save Link' : 'Add Link'}</button>
    </div>
  </form>, document.body);
};
