import React, { useEffect, useState } from 'react';
import type { CaptureShortcut, CaptureShortcutState } from '../../electron/shortcuts';

const keys = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'Space', ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)];
export const ShortcutSettings: React.FC = () => {
  const [state, setState] = useState<CaptureShortcutState | null>(null);
  const [draft, setDraft] = useState<CaptureShortcut | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    const receive = (value: CaptureShortcutState) => { if (active) { setState(value); setDraft(value.config); } };
    window.scribeAPI.getShortcutSettings().then(receive).catch(error => { if (active) setError(error.message); });
    const off = window.scribeAPI.onShortcutsChanged(receive);
    return () => { active = false; off(); };
  }, []);
  const save = async (config: CaptureShortcut) => {
    setBusy(true); setError(''); setSaved(false);
    try { const next = await window.scribeAPI.setCaptureShortcut(config); setState(next); setDraft(next.config); setEditing(false); setSaved(true); }
    catch (error: any) { setError(error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
    finally { setBusy(false); }
  };
  const modifiers: { key: 'command' | 'control' | 'alt' | 'shift'; label: string }[] = [
    ...(state?.isMac ? [{ key: 'command' as const, label: '⌘ Command' }] : []),
    { key: 'control', label: '⌃ Control' }, { key: 'alt', label: state?.isMac ? '⌥ Option' : 'Alt' }, { key: 'shift', label: '⇧ Shift' }
  ];
  return <section className="pt-4 border-t border-[var(--border-color)]">
    <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-3">Keyboard shortcuts</h3>
    <div className="flex items-center justify-between gap-3 text-xs">
      <span>Quick Capture</span>
      <div className="flex items-center gap-3"><kbd className="text-[var(--text-secondary)]">{state?.label || 'Loading…'}</kbd><button type="button" disabled={!state || busy} onClick={() => { setEditing(!editing); setSaved(false); setError(''); if (state) setDraft(state.config); }} className="text-[var(--accent-color)] hover:underline disabled:opacity-40">{editing ? 'Cancel' : 'Change…'}</button></div>
    </div>
    {state && !state.available && <p className="text-xs text-[var(--text-secondary)] mt-2">This shortcut is unavailable. Choose another combination.</p>}
    {editing && draft && <div className="mt-3 space-y-3">
      <fieldset disabled={busy} className="space-y-2"><legend className="text-[11px] text-[var(--text-secondary)] mb-2">Choose modifiers and a key</legend>
        <div className="grid grid-cols-2 gap-2">{modifiers.map(modifier => <label key={modifier.key} className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={draft[modifier.key]} onChange={event => { setDraft({ ...draft, [modifier.key]: event.target.checked }); setError(''); }} />{modifier.label}</label>)}</div>
        <label className="flex items-center gap-3 text-xs pt-2">Key<select value={draft.key} onChange={event => { setDraft({ ...draft, key: event.target.value }); setError(''); }} className="bg-[var(--editor-bg)] rounded-md px-3 py-1.5 border border-[var(--border-color)]">{keys.map(key => <option key={key}>{key}</option>)}</select></label>
      </fieldset>
      <div className="flex items-center justify-between gap-3"><button type="button" disabled={busy} onClick={() => { if (state) { setDraft(state.defaultConfig); setError(''); } }} className="text-[11px] text-[var(--text-secondary)] hover:underline">Use default</button><button type="button" disabled={busy || (!draft.command && !draft.control)} onClick={() => void save(draft)} className="rounded-md px-3 py-1.5 text-xs bg-[var(--accent-color)] text-black disabled:opacity-40">{busy ? 'Saving…' : 'Save Shortcut'}</button></div>
      {!draft.command && !draft.control && <p className="text-[11px] text-[var(--text-secondary)]">Include Command or Control.</p>}
    </div>}
    {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
    {saved && <p role="status" className="mt-2 text-[11px] text-[var(--text-secondary)]">Shortcut saved.</p>}
  </section>;
};
