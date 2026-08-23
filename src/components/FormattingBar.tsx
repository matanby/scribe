import React, { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  Highlighter, 
  Heading1, 
  Heading2, 
  Heading3, 
  Pilcrow, 
  Code, 
  List, 
  ListOrdered, 
  CheckSquare, 
  Table as TableIcon, 
  Link as LinkIcon, 
  AlignRight, 
  AlignLeft, 
  ChevronDown,
  Plus,
  Trash2,
  Columns,
  Rows,
  Share,
  Printer,
  Download,
  FileText,
  Minus,
  Sigma
} from 'lucide-react';

interface FormattingBarProps {
  editor: Editor | null;
}

export const FormattingBar: React.FC<FormattingBarProps> = ({ editor }) => {
  const [showAaMenu, setShowAaMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const aaMenuRef = useRef<HTMLDivElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (aaMenuRef.current && !aaMenuRef.current.contains(e.target as Node)) {
        setShowAaMenu(false);
      }
      if (tableMenuRef.current && !tableMenuRef.current.contains(e.target as Node)) {
        setShowTableMenu(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!editor) return null;

  const getCurrentFormatLabel = () => {
    if (editor.isActive('heading', { level: 1 })) return 'Title';
    if (editor.isActive('heading', { level: 2 })) return 'Heading';
    if (editor.isActive('heading', { level: 3 })) return 'Subheading';
    if (editor.isActive('codeBlock')) return 'Monospaced';
    if (editor.isActive('bulletList')) return 'Bullet List';
    if (editor.isActive('orderedList')) return 'Numbered List';
    if (editor.isActive('taskList')) return 'Checklist';
    return 'Body';
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter Link URL:', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="no-print flex items-center justify-between px-6 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--editor-bg)]/80 backdrop-blur-md select-none shrink-0 sticky top-0 z-20">
      <div className="flex items-center gap-1">
        {/* Apple Notes Aa Paragraph Style Popover */}
        <div className="relative" ref={aaMenuRef}>
          <button
            onClick={() => setShowAaMenu(!showAaMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
              showAaMenu 
                ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)] shadow-xs' 
                : 'bg-black/5 dark:bg-white/10 text-[var(--text-primary)] border-transparent hover:bg-black/10 dark:hover:bg-white/15'
            }`}
            title="Text Style & Formatting"
          >
            <span className="font-serif text-[13px] font-bold">Aa</span>
            <span className="text-[11px] font-medium opacity-80 max-w-[80px] truncate">{getCurrentFormatLabel()}</span>
            <ChevronDown size={11} className={`opacity-60 transition-transform ${showAaMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Aa Dropdown Menu */}
          {showAaMenu && (
            <div className="absolute left-0 top-full mt-1.5 w-48 p-1.5 rounded-xl bg-white dark:bg-[#252528] border border-[var(--border-color)] shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 space-y-0.5">
              <button
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 1 }).run();
                  setShowAaMenu(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left text-sm font-bold transition-colors ${
                  editor.isActive('heading', { level: 1 })
                    ? 'bg-[var(--accent-light)] text-[var(--accent-color)]'
                    : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
                }`}
              >
                <span>Title</span>
                <span className="text-[10px] opacity-40 font-normal">⌘⌥1</span>
              </button>

              <button
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 2 }).run();
                  setShowAaMenu(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left text-xs font-bold transition-colors ${
                  editor.isActive('heading', { level: 2 })
                    ? 'bg-[var(--accent-light)] text-[var(--accent-color)]'
                    : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
                }`}
              >
                <span>Heading</span>
                <span className="text-[10px] opacity-40 font-normal">⌘⌥2</span>
              </button>

              <button
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: 3 }).run();
                  setShowAaMenu(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left text-xs font-semibold transition-colors ${
                  editor.isActive('heading', { level: 3 })
                    ? 'bg-[var(--accent-light)] text-[var(--accent-color)]'
                    : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
                }`}
              >
                <span>Subheading</span>
                <span className="text-[10px] opacity-40 font-normal">⌘⌥3</span>
              </button>

              <button
                onClick={() => {
                  editor.chain().focus().setParagraph().run();
                  setShowAaMenu(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left text-xs transition-colors ${
                  editor.isActive('paragraph') && !editor.isActive('taskList') && !editor.isActive('bulletList') && !editor.isActive('orderedList')
                    ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-medium'
                    : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
                }`}
              >
                <span>Body</span>
                <span className="text-[10px] opacity-40 font-normal">⌘⌥0</span>
              </button>

              <div className="h-[1px] bg-[var(--border-subtle)] my-1" />

              <button
                onClick={() => {
                  editor.chain().focus().toggleTaskList().run();
                  setShowAaMenu(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-xs transition-colors ${
                  editor.isActive('taskList')
                    ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-medium'
                    : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
                }`}
              >
                <CheckSquare size={13} />
                <span>Checklist</span>
              </button>

              <button
                onClick={() => {
                  editor.chain().focus().toggleBulletList().run();
                  setShowAaMenu(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-xs transition-colors ${
                  editor.isActive('bulletList')
                    ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-medium'
                    : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
                }`}
              >
                <List size={13} />
                <span>Bullet List</span>
              </button>

              <button
                onClick={() => {
                  editor.chain().focus().toggleOrderedList().run();
                  setShowAaMenu(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-xs transition-colors ${
                  editor.isActive('orderedList')
                    ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-medium'
                    : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
                }`}
              >
                <ListOrdered size={13} />
                <span>Numbered List</span>
              </button>

              <button
                onClick={() => {
                  editor.chain().focus().toggleCodeBlock().run();
                  setShowAaMenu(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-xs transition-colors ${
                  editor.isActive('codeBlock')
                    ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-medium'
                    : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]'
                }`}
              >
                <Code size={13} />
                <span>Monospaced</span>
              </button>
            </div>
          )}
        </div>

        <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-1" />

        {/* Inline Formatting Controls */}
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded-md text-xs transition-all ${
            editor.isActive('bold')
              ? 'bg-[var(--accent-color)] text-white shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          title="Bold (⌘B)"
        >
          <Bold size={13.5} />
        </button>

        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded-md text-xs transition-all ${
            editor.isActive('italic')
              ? 'bg-[var(--accent-color)] text-white shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          title="Italic (⌘I)"
        >
          <Italic size={13.5} />
        </button>

        <button
          onClick={() => (editor.chain().focus() as any).toggleUnderline().run()}
          className={`p-1.5 rounded-md text-xs transition-all ${
            editor.isActive('underline')
              ? 'bg-[var(--accent-color)] text-white shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          title="Underline (⌘U)"
        >
          <Underline size={13.5} />
        </button>

        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded-md text-xs transition-all ${
            editor.isActive('strike')
              ? 'bg-[var(--accent-color)] text-white shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          title="Strikethrough"
        >
          <Strikethrough size={13.5} />
        </button>

        <button
          onClick={() => (editor.chain().focus() as any).toggleHighlight({ color: '#fde047' }).run()}
          className={`p-1.5 rounded-md text-xs transition-all ${
            editor.isActive('highlight')
              ? 'bg-yellow-400 text-black shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          title="Highlight"
        >
          <Highlighter size={13.5} />
        </button>

        <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-1" />

        {/* Checklist Quick Button */}
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`p-1.5 rounded-md text-xs transition-all ${
            editor.isActive('taskList')
              ? 'bg-[var(--accent-color)] text-white shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          title="Checklist Item (⌘⇧C)"
        >
          <CheckSquare size={13.5} />
        </button>

        {/* Table Button & Table Controls */}
        <div className="relative" ref={tableMenuRef}>
          <button
            onClick={() => {
              if (editor.isActive('table')) {
                setShowTableMenu(!showTableMenu);
              } else {
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
              }
            }}
            className={`p-1.5 rounded-md text-xs transition-all flex items-center gap-1 ${
              editor.isActive('table')
                ? 'bg-[var(--accent-color)] text-white shadow-xs'
                : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            title={editor.isActive('table') ? "Table Options" : "Insert Table"}
          >
            <TableIcon size={13.5} />
            {editor.isActive('table') && <ChevronDown size={10} />}
          </button>

          {/* Table Actions Popover when inside a table */}
          {showTableMenu && editor.isActive('table') && (
            <div className="absolute left-0 top-full mt-1.5 w-44 p-1.5 rounded-xl bg-white dark:bg-[#252528] border border-[var(--border-color)] shadow-2xl z-50 space-y-0.5 text-xs">
              <button
                onClick={() => {
                  editor.chain().focus().addRowAfter().run();
                  setShowTableMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]"
              >
                <Rows size={13} />
                <span>Add Row</span>
              </button>
              <button
                onClick={() => {
                  editor.chain().focus().addColumnAfter().run();
                  setShowTableMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]"
              >
                <Columns size={13} />
                <span>Add Column</span>
              </button>
              <button
                onClick={() => {
                  editor.chain().focus().deleteRow().run();
                  setShowTableMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/10 text-red-500"
              >
                <Trash2 size={13} />
                <span>Delete Row</span>
              </button>
              <button
                onClick={() => {
                  editor.chain().focus().deleteColumn().run();
                  setShowTableMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/10 text-red-500"
              >
                <Trash2 size={13} />
                <span>Delete Column</span>
              </button>
              <div className="h-[1px] bg-[var(--border-subtle)] my-1" />
              <button
                onClick={() => {
                  editor.chain().focus().deleteTable().run();
                  setShowTableMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 font-medium"
              >
                <Trash2 size={13} />
                <span>Delete Table</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={setLink}
          className={`p-1.5 rounded-md text-xs transition-all ${
            editor.isActive('link')
              ? 'bg-[var(--accent-color)] text-white shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          title="Insert Link (⌘K)"
        >
          <LinkIcon size={13.5} />
        </button>

        <button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className="p-1.5 rounded-md text-xs text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-all"
          title="Insert Divider Line (---)"
        >
          <Minus size={13.5} />
        </button>

        <button
          onClick={() => editor.chain().focus().insertContent('$E = mc^2$ ').run()}
          className="p-1.5 rounded-md text-xs text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-all"
          title="Insert LaTeX Math Formula ($...$)"
        >
          <Sigma size={13.5} />
        </button>
      </div>

      {/* Right side: Export & Direction Switcher */}
      <div className="flex items-center gap-1.5">
        {/* Export Button */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-all active:scale-95"
            title="Export / Print Note"
          >
            <Share size={12.5} />
            <span className="text-[11px] font-medium">Export</span>
          </button>

          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-44 p-1.5 rounded-xl bg-white dark:bg-[#252528] border border-[var(--border-color)] shadow-2xl z-50 space-y-0.5 text-xs">
              <button
                onClick={() => {
                  window.print();
                  setShowExportMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]"
              >
                <Printer size={13} />
                <span>Print / PDF...</span>
              </button>

              <button
                onClick={() => {
                  const rawMarkdown = (editor.storage as any).markdown.getMarkdown();
                  const blob = new Blob([rawMarkdown], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'Note.md';
                  a.click();
                  URL.revokeObjectURL(url);
                  setShowExportMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]"
              >
                <Download size={13} />
                <span>Export Markdown</span>
              </button>

              <button
                onClick={() => {
                  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Note</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.7;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ccc;padding:8px;}</style></head><body>${editor.getHTML()}</body></html>`;
                  const blob = new Blob([html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'Note.html';
                  a.click();
                  URL.revokeObjectURL(url);
                  setShowExportMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)]"
              >
                <FileText size={13} />
                <span>Export HTML</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
