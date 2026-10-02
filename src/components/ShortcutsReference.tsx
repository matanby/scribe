import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../utils/useFocusTrap';

export const ShortcutsReference: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [capture, setCapture] = useState('');
  useFocusTrap(panel, true);
  useEffect(() => {
    close.current?.focus();
    window.scribeAPI.getShortcutSettings().then(state => setCapture(state.label)).catch(() => setCapture('See Settings'));
    return window.scribeAPI.onShortcutsChanged(state => setCapture(state.label));
  }, []);
  const groups: [string, [string, string][]][] = [
    ['Notes', [['New note', '⌘N'], ['Quick Capture', capture], ['Quick Switcher', '⌘⇧O'], ['Save', '⌘S'], ['Duplicate note', '⌘D'], ['Move note to Trash', '⌘⌫'], ['Settings', '⌘,']]],
    ['Navigation', [['Find in note', '⌘F'], ['Find and replace', '⌘⇧F'], ['Next / previous match', '↵ / ⇧↵ in Find'], ['Back / forward', '⌘[ / ⌘]'], ['Show / hide sidebar', '⌘\\'], ['Rename title → body', '↵ in title']]],
    ['Writing', [['Bold / italic / underline', '⌘B / ⌘I / ⌘U'], ['Checklist', '⌘⇧C'], ['Check / uncheck current task', '⌘⇧U'], ['Heading levels 1–3', '⌘⌥1–3'], ['Body text', '⌘⌥0'], ['Insert menu', '/ in an empty paragraph'], ['Next / previous table cell', '⇥ / ⇧⇥']]],
    ['Quick Capture', [['Save capture', '⌘↵'], ['Keep draft and close', 'Esc']]]
  ];
  return <div className="fixed inset-0 z-[110] bg-black/35 backdrop-blur-sm flex items-center justify-center p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" className="w-full max-w-[640px] max-h-[85vh] flex flex-col rounded-xl border border-[var(--border-color)] bg-[var(--editor-bg)] text-[var(--text-primary)] shadow-2xl"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]"><h2 id="shortcuts-title" className="text-sm font-semibold">Keyboard Shortcuts</h2><button ref={close} onClick={onClose} aria-label="Close keyboard shortcuts" className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"><X size={16} /></button></header>
      <div className="overflow-y-auto px-5 py-4 space-y-5">{groups.map(([name, rows]) => <section key={name}>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">{name}</h3>
        <dl className="space-y-2">{rows.map(([label, keys]) => <div key={label} className="flex justify-between gap-4 text-xs"><dt>{label}</dt><dd className="text-[var(--text-secondary)] text-right whitespace-nowrap">{keys}</dd></div>)}</dl>
      </section>)}</div>
    </div>
  </div>;
};
