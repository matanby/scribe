import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import type { SelectionBookmark, Transaction } from '@tiptap/pm/state';

/** Menus can take DOM focus without changing the text the user chose to format. */
export function useFormattingSelection(editor: Editor | null) {
  const bookmark = useRef<SelectionBookmark | null>(null);
  useEffect(() => {
    if (!editor) return;
    const track = ({ transaction }: { transaction: Transaction }) => {
      if (bookmark.current) bookmark.current = bookmark.current.map(transaction.mapping);
      if (transaction.selectionSet && !transaction.docChanged && editor.view.hasFocus()) bookmark.current = null;
    };
    editor.on('transaction', track);
    return () => { editor.off('transaction', track); bookmark.current = null; };
  }, [editor]);
  const remember = () => { if (editor && !editor.isDestroyed) bookmark.current = editor.state.selection.getBookmark(); };
  const restore = () => {
    if (!editor || editor.isDestroyed || !bookmark.current) return;
    const selection = bookmark.current;
    bookmark.current = null;
    editor.commands.command(({ tr }) => { tr.setSelection(selection.resolve(tr.doc)); return true; });
  };
  return { remember, restore };
}
