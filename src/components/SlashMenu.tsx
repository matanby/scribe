import React, { useEffect, useState, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Heading1, 
  Heading2, 
  Heading3, 
  CheckSquare, 
  List, 
  ListOrdered, 
  Table as TableIcon, 
  Code, 
  Quote, 
  Minus,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';

interface SlashMenuProps {
  editor: Editor | null;
}

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  action: (editor: Editor) => void;
}

export const SlashMenu: React.FC<SlashMenuProps> = ({ editor }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = [
    {
      id: 'title',
      title: 'Title',
      subtitle: 'Large page title',
      icon: <Heading1 size={15} className="text-amber-500" />,
      action: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run()
    },
    {
      id: 'heading',
      title: 'Heading',
      subtitle: 'Section heading',
      icon: <Heading2 size={15} className="text-amber-500" />,
      action: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run()
    },
    {
      id: 'subheading',
      title: 'Subheading',
      subtitle: 'Subsection heading',
      icon: <Heading3 size={15} className="text-amber-500" />,
      action: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run()
    },
    {
      id: 'checklist',
      title: 'Checklist',
      subtitle: 'Track tasks with checkboxes',
      icon: <CheckSquare size={15} className="text-emerald-500" />,
      action: (ed) => ed.chain().focus().toggleTaskList().run()
    },
    {
      id: 'bullet-list',
      title: 'Bulleted List',
      subtitle: 'Create a simple bulleted list',
      icon: <List size={15} className="text-blue-500" />,
      action: (ed) => ed.chain().focus().toggleBulletList().run()
    },
    {
      id: 'ordered-list',
      title: 'Numbered List',
      subtitle: 'Create an ordered list',
      icon: <ListOrdered size={15} className="text-blue-500" />,
      action: (ed) => ed.chain().focus().toggleOrderedList().run()
    },
    {
      id: 'table',
      title: 'Table',
      subtitle: 'Insert a 3x3 table',
      icon: <TableIcon size={15} className="text-purple-500" />,
      action: (ed) => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
    {
      id: 'image',
      title: 'Image / Photo',
      subtitle: 'Upload or insert an image',
      icon: <ImageIcon size={15} className="text-emerald-600" />,
      action: (ed) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
              const base64 = re.target?.result as string;
              if (base64) {
                ed.chain().focus().setImage({ src: base64 }).run();
              }
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      }
    },
    {
      id: 'callout-note',
      title: 'Note Callout',
      subtitle: 'Amber highlighted note box',
      icon: <Sparkles size={15} className="text-amber-500" />,
      action: (ed) => (ed.chain().focus() as any).toggleCallout('note').run()
    },
    {
      id: 'callout-tip',
      title: 'Tip Callout',
      subtitle: 'Green helpful tip box',
      icon: <CheckSquare size={15} className="text-emerald-500" />,
      action: (ed) => (ed.chain().focus() as any).toggleCallout('tip').run()
    },
    {
      id: 'callout-info',
      title: 'Info Callout',
      subtitle: 'Blue informational notice',
      icon: <Sparkles size={15} className="text-blue-500" />,
      action: (ed) => (ed.chain().focus() as any).toggleCallout('info').run()
    },
    {
      id: 'callout-warning',
      title: 'Warning Callout',
      subtitle: 'Orange warning attention box',
      icon: <Sparkles size={15} className="text-orange-500" />,
      action: (ed) => (ed.chain().focus() as any).toggleCallout('warning').run()
    },
    {
      id: 'callout-caution',
      title: 'Caution / Danger',
      subtitle: 'Red critical notice box',
      icon: <Sparkles size={15} className="text-red-500" />,
      action: (ed) => (ed.chain().focus() as any).toggleCallout('caution').run()
    },
    {
      id: 'quote',
      title: 'Quote',
      subtitle: 'Capture a stylized quote',
      icon: <Quote size={15} className="text-purple-500" />,
      action: (ed) => (ed.chain().focus() as any).toggleCallout('quote').run()
    },
    {
      id: 'code',
      title: 'Code Block',
      subtitle: 'Monospaced code snippet',
      icon: <Code size={15} className="text-pink-500" />,
      action: (ed) => ed.chain().focus().toggleCodeBlock().run()
    },
    {
      id: 'divider',
      title: 'Divider',
      subtitle: 'Visual dividing line',
      icon: <Minus size={15} className="text-gray-400" />,
      action: (ed) => ed.chain().focus().setHorizontalRule().run()
    }
  ];

  const filtered = commands.filter(c => 
    c.title.toLowerCase().includes(query.toLowerCase()) || 
    c.subtitle.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      const { selection } = editor.state;
      const { $from, empty } = selection;

      if (!empty) {
        setIsOpen(false);
        return;
      }

      const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n');
      const match = textBefore.match(/^\/([a-zA-Z0-9]*)$/);

      if (match) {
        setQuery(match[1]);
        setSelectedIndex(0);

        try {
          const coords = editor.view.coordsAtPos($from.pos);
          setMenuPosition({
            top: coords.bottom + 8,
            left: Math.max(16, Math.min(coords.left, window.innerWidth - 260))
          });
          setIsOpen(true);
        } catch {
          setIsOpen(false);
        }
      } else {
        setIsOpen(false);
      }
    };

    editor.on('selectionUpdate', handleUpdate);
    editor.on('update', handleUpdate);

    return () => {
      editor.off('selectionUpdate', handleUpdate);
      editor.off('update', handleUpdate);
    };
  }, [editor]);

  const executeCommand = (cmd: CommandItem) => {
    if (!editor) return;
    const { selection } = editor.state;
    const { $from } = selection;

    // Delete the slash command query text
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n');
    const slashPos = $from.pos - textBefore.length;
    editor.chain().focus().deleteRange({ from: slashPos, to: $from.pos }).run();

    cmd.action(editor);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          executeCommand(filtered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, filtered, selectedIndex]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
      className="fixed z-50 w-64 max-h-80 overflow-y-auto p-1.5 rounded-2xl bg-white/95 dark:bg-[#252528]/95 backdrop-blur-2xl border border-[var(--border-color)] shadow-2xl animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      <div className="px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1">
        <Sparkles size={11} className="text-amber-500" />
        <span>Insert Element</span>
      </div>

      <div className="space-y-0.5 mt-1">
        {filtered.map((cmd, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={cmd.id}
              onClick={() => executeCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all ${
                isSelected
                  ? 'bg-[var(--accent-light)] text-[var(--accent-color)] shadow-xs'
                  : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
              }`}
            >
              <div className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 shrink-0">
                {cmd.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold leading-tight truncate">{cmd.title}</div>
                <div className="text-[10px] opacity-60 truncate">{cmd.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
