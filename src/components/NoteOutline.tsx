import React, { useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import { ListTree } from 'lucide-react';
import { Popover } from './Popover';
import { CollapsibleHeadingsKey } from '../extensions/CollapsibleHeadingsExtension';

interface Heading { position: number; level: number; title: string }
export const NoteOutline: React.FC<{ editor: Editor }> = ({ editor }) => {
  const [headings, setHeadings] = useState<Heading[]>([]);
  useEffect(() => {
    const refresh = () => {
      const next: Heading[] = [];
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === 'heading') next.push({ position, level: node.attrs.level, title: node.textContent || 'Untitled heading' });
      });
      setHeadings(next);
    };
    refresh(); editor.on('update', refresh);
    return () => { editor.off('update', refresh); };
  }, [editor]);
  return <Popover label="Note outline" align="right" triggerClassName="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"
    trigger={<ListTree size={16} />}>
    {close => <>
      <p className="px-2.5 py-2 text-xs font-medium text-[var(--text-secondary)]">Outline</p>
      {headings.length ? headings.map(heading => <button type="button" key={heading.position} dir="auto"
        className="w-full text-left text-xs py-2 pr-2 rounded-md text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 truncate"
        style={{ paddingLeft: 10 + (heading.level - 1) * 12 }} title={heading.title}
        onClick={() => {
          close();
          // Reveal folded ancestors before jumping to a nested heading.
          const collapsed: number[] = CollapsibleHeadingsKey.getState(editor.state)?.collapsed || [];
          const enclosing = collapsed.filter(position => {
            const index = headings.findIndex(item => item.position === position);
            if (index < 0 || position > heading.position) return false;
            const end = headings.slice(index + 1).find(item => item.level <= headings[index].level)?.position ?? editor.state.doc.content.size;
            return heading.position < end;
          });
          for (const position of enclosing) {
            editor.view.dispatch(editor.state.tr.setMeta(CollapsibleHeadingsKey, { togglePos: position }));
          }
          editor.commands.setTextSelection(heading.position + 1);
          editor.commands.focus(undefined, { scrollIntoView: false });
          requestAnimationFrame(() => (editor.view.nodeDOM(heading.position) as HTMLElement | null)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
        }}>{heading.title}</button>) : <p className="px-2.5 pb-3 text-xs text-[var(--text-secondary)]">Add headings with the Aa menu to navigate this note.</p>}
    </>}
  </Popover>;
};
