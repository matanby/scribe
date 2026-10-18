import React from 'react';
import { createPortal } from 'react-dom';
import { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough, Highlighter, Code, List, ListOrdered,
  CheckSquare, Link as LinkIcon, ChevronDown, Plus,
  Share, Printer, Download, FileText, Minus, Sigma,
  type LucideIcon
} from 'lucide-react';
import { showMessage } from '../utils/dialogs';
import { TableButton } from './TableButton';
import { NoteOutline } from './NoteOutline';
import { Popover } from './Popover';

interface FormattingBarProps { editor: Editor | null; onAttach: () => void; onEditLink: () => void; toolbarTarget?: HTMLElement | null; noteFilePath: string; tableInsertTrigger: number; documentMode?: boolean; }
interface Action {
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  active?: boolean;
  danger?: boolean;
  run: () => void;
}

const toolbarButton = 'chrome-button';
const Divider = () => <div className="h-px bg-[var(--border-subtle)] my-1" />;
const Actions: React.FC<{ actions: Action[]; close: () => void }> = ({ actions, close }) => (
  <>
    {actions.map(({ label, icon: Icon, shortcut, active, danger, run }) => (
      <button key={label} type="button" aria-pressed={active} onClick={() => { close(); run(); }}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs transition-colors ${
          active ? 'bg-[var(--accent-light)] text-[var(--accent-color)]'
            : danger ? 'text-red-500 hover:bg-red-500/10'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}>
        {Icon && <Icon size={14} className="shrink-0" />}
        <span className="flex-1">{label}</span>
        {shortcut && <span className="text-[11px] text-[var(--text-secondary)]">{shortcut}</span>}
      </button>
    ))}
  </>
);

export const FormattingBar: React.FC<FormattingBarProps> = ({ editor, onAttach, onEditLink, toolbarTarget, noteFilePath, tableInsertTrigger, documentMode = false }) => {
  if (!editor) return null;

  const paragraphStyles: Action[] = [
    { label: 'Title', shortcut: '⌘⌥1', active: editor.isActive('heading', { level: 1 }), run: () => { editor.chain().focus().toggleHeading({ level: 1 }).run(); } },
    { label: 'Heading', shortcut: '⌘⌥2', active: editor.isActive('heading', { level: 2 }), run: () => { editor.chain().focus().toggleHeading({ level: 2 }).run(); } },
    { label: 'Subheading', shortcut: '⌘⌥3', active: editor.isActive('heading', { level: 3 }), run: () => { editor.chain().focus().toggleHeading({ level: 3 }).run(); } },
    { label: 'Body', shortcut: '⌘⌥0', active: editor.isActive('paragraph') && !['taskList', 'bulletList', 'orderedList', 'codeBlock'].some(type => editor.isActive(type)), run: () => { editor.chain().focus().setParagraph().run(); } }
  ];
  const inlineStyles: Action[] = [
    { label: 'Bold', icon: Bold, shortcut: '⌘B', active: editor.isActive('bold'), run: () => { editor.chain().focus().toggleBold().run(); } },
    { label: 'Italic', icon: Italic, shortcut: '⌘I', active: editor.isActive('italic'), run: () => { editor.chain().focus().toggleItalic().run(); } },
    { label: 'Underline', icon: Underline, shortcut: '⌘U', active: editor.isActive('underline'), run: () => { editor.chain().focus().toggleUnderline().run(); } },
    { label: 'Strikethrough', icon: Strikethrough, active: editor.isActive('strike'), run: () => { editor.chain().focus().toggleStrike().run(); } },
    { label: 'Highlight', icon: Highlighter, active: editor.isActive('highlight'), run: () => { editor.chain().focus().toggleHighlight({ color: '#fde047' }).run(); } }
  ];
  const listStyles: Action[] = [
    { label: 'Checklist', icon: CheckSquare, active: editor.isActive('taskList'), run: () => { editor.chain().focus().toggleTaskList().run(); } },
    { label: 'Bullet List', icon: List, active: editor.isActive('bulletList'), run: () => { editor.chain().focus().toggleBulletList().run(); } },
    { label: 'Numbered List', icon: ListOrdered, active: editor.isActive('orderedList'), run: () => { editor.chain().focus().toggleOrderedList().run(); } },
    { label: 'Monospaced', icon: Code, active: editor.isActive('codeBlock'), run: () => { editor.chain().focus().toggleCodeBlock().run(); } }
  ];
  const directions: Action[] = [
    { label: 'Automatic', active: editor.isActive('paragraph', { directionOverride: null }) || editor.isActive('heading', { directionOverride: null }), run: () => { editor.chain().focus().setTextDirection('auto').run(); } },
    { label: 'Right to left', active: editor.isActive({ directionOverride: 'rtl' }), run: () => { editor.chain().focus().setTextDirection('rtl').run(); } },
    { label: 'Left to right', active: editor.isActive({ directionOverride: 'ltr' }), run: () => { editor.chain().focus().setTextDirection('ltr').run(); } }
  ];
  const inserts: Action[] = [
    { label: 'Image or File…', icon: Plus, run: onAttach },
    { label: 'Link…', icon: LinkIcon, shortcut: '⌘K', run: onEditLink },
    { label: 'Divider', icon: Minus, run: () => { editor.chain().focus().setHorizontalRule().run(); } },
    { label: 'Math Formula', icon: Sigma, run: () => { editor.chain().focus().insertContent('$E = mc^2$ ').run(); } }
  ];
  const exportDocument = async (content: string, format: 'md' | 'html') => {
    try { await window.scribeAPI.exportDocument({ filePath: noteFilePath, content, format }); }
    catch (error: any) { void showMessage('Could not export note', error.message || 'The note or its attachments could not be copied.', 'error'); }
  };
  const exports: Action[] = [
    { label: 'Print / PDF…', icon: Printer, run: () => { window.print(); } },
    { label: 'Export Markdown', icon: Download, run: () => {
      try {
        const markdown = editor.storage.markdown?.getMarkdown?.();
        if (typeof markdown !== 'string') throw new Error('Markdown serializer unavailable');
        void exportDocument(markdown, 'md');
      } catch (error: any) {
        console.error('Failed to export markdown:', error);
        void showMessage('Could not export markdown', error?.message || 'unknown error', 'error');
      }
    } },
    { label: 'Export HTML', icon: FileText, run: () => {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Note</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.7;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ccc;padding:8px;}</style></head><body>${editor.getHTML()}</body></html>`;
      void exportDocument(html, 'html');
    } }
  ];

  const toolbar = (
    <div role="group" aria-label="Note formatting" className="formatting-bar no-print">
      <div className="flex items-center gap-1">
        <Popover label="Text style and formatting" triggerClassName={toolbarButton}
          trigger={<><span className="text-[15px] font-medium">Aa</span><ChevronDown size={11} /></>}>
          {close => <><Actions actions={paragraphStyles} close={close} /><Divider /><Actions actions={inlineStyles} close={close} /><Divider /><Actions actions={listStyles} close={close} /><Divider /><div className="px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">Text direction</div><Actions actions={directions} close={close} />{editor.isActive('taskList') && <><Divider /><Actions close={close} actions={[{ label: 'Check / Uncheck Task', shortcut: '⌘⇧U', run: () => { editor.chain().focus().toggleCurrentTask().run(); } }, { label: 'Move Completed to Bottom', run: () => { editor.chain().focus().sortCompletedTasks().run(); } }]} /></>}</>}
        </Popover>
        <button type="button" aria-label="Checklist" aria-pressed={editor.isActive('taskList')} title="Checklist (⌘⇧C)"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`${toolbarButton} ${editor.isActive('taskList') ? 'bg-[var(--accent-light)] text-[var(--accent-color)]' : ''}`}>
          <CheckSquare size={16} />
        </button>
        <TableButton editor={editor} insertTrigger={tableInsertTrigger} />
        <Popover label="Insert" triggerClassName={toolbarButton} trigger={<><Plus size={16} /><ChevronDown size={11} /></>}>
          {close => <Actions actions={inserts} close={close} />}
        </Popover>
      </div>
      <div className="formatting-secondary flex items-center gap-1"><NoteOutline editor={editor} documentMode={documentMode} />
      <Popover label={documentMode ? "Export file" : "Export note"} align="right" triggerClassName={`${toolbarButton} text-[var(--text-secondary)]`} trigger={<Share size={16} />}>
        {close => <Actions actions={exports} close={close} />}
      </Popover></div>
    </div>
  );
  return toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbar;
};
