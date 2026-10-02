import React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import { Attachment } from '../extensions/Attachment';
import { showMessage } from '../utils/dialogs';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import markPlugin from 'markdown-it-mark';
import { BiDiExtension } from '../extensions/BiDiExtension';
import { CalloutExtension } from '../extensions/CalloutExtension';

/** Dedicated read-only instance: no autosave, formatting menus, or editing shortcuts. */
export const NotePreview: React.FC<{ markdown: string }> = ({ markdown }) => {
  const editor = useEditor({
    editable: false,
    content: markdown,
    extensions: [
      StarterKit.configure({ blockquote: false }), CalloutExtension,
      Underline,
      Highlight.extend({
        addStorage() {
          return { ...this.parent?.(), markdown: { parse: { setup(parser: any) { parser.use(markPlugin); } } } };
        }
      }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-[var(--accent-color)] underline' } }),
      Attachment, Image.extend({ addAttributes() { return { ...this.parent?.(), width: { default: null, parseHTML: element => Number(element.getAttribute('width')) || null } }; } }).configure({ inline: true, allowBase64: true }), Table.configure({ resizable: false }), TableRow, TableCell, TableHeader,
      TaskList, TaskItem.configure({ nested: true }), BiDiExtension,
      Markdown.configure({ html: true, transformPastedText: false, transformCopiedText: false })
    ],
    editorProps: {
      attributes: { tabindex: '-1', 'aria-label': 'Read-only note preview' },
      handleClick: (_view, _pos, event) => {
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
        if (!link) return false;
        event.preventDefault();
        if (link.href.startsWith('scribe-asset:')) window.scribeAPI.openAttachment(link.href).catch(error => void showMessage('Could not open attachment', error.message, 'error'));
        else void window.scribeAPI.openExternal(link.href);
        return true;
      }
    }
  });
  return <EditorContent editor={editor} className="history-preview" />;
};
