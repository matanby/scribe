import React from 'react';
import { Editor } from '@tiptap/react';
import { Check, Trash2 } from 'lucide-react';
import { getTableInfo, moveRow, moveColumn, clearTable, selectTableCell } from '../utils/tableUtils';
import { confirmDestructive } from '../utils/dialogs';

const item = 'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent';
export const TableMenus: React.FC<{ editor: Editor; scope?: 'row' | 'column' | 'table'; close: () => void }> = ({ editor, scope = 'table', close }) => {
  const info = getTableInfo(editor);
  if (!info.inTable) return null;
  const run = (action: () => void) => { close(); if (!editor.isDestroyed) action(); };
  const destructive = async (kind: 'row' | 'column' | 'table' | 'clear') => {
    // Dialogs capture the exact table and selection; changing notes never deletes another table.
    const table = info.tableNode, position = info.tablePos;
    const bookmark = editor.state.selection.getBookmark();
    close();
    const removesTable = kind === 'table' || (kind === 'row' && info.rowCount === 1) || (kind === 'column' && info.colCount === 1);
    if (removesTable || kind === 'clear') {
      const ok = await confirmDestructive(kind === 'clear' ? 'Clear every cell in this table?' : 'Delete this table?', kind === 'clear' ? 'The rows and columns will be kept.' : 'All of its contents will be removed. You can undo this with ⌘Z.', kind === 'clear' ? 'Clear' : 'Delete');
      if (!ok) return;
    }
    if (editor.isDestroyed || editor.state.doc.nodeAt(position) !== table) return;
    editor.view.dispatch(editor.state.tr.setSelection(bookmark.resolve(editor.state.doc)));
    if (kind === 'clear') { clearTable(editor); editor.commands.focus(); }
    else if (kind === 'table') editor.chain().focus().deleteTable().run();
    else if (kind === 'row') editor.chain().focus().deleteRow().run();
    else editor.chain().focus().deleteColumn().run();
  };
  const button = (label: string, action: () => void, disabled = false) => <button type="button" key={label} className={item} disabled={disabled} onClick={() => run(action)}>{label}</button>;
  const danger = (label: string, kind: 'row' | 'column' | 'table' | 'clear') => <button type="button" className={`${item} ${kind === 'clear' ? '' : 'text-red-500 hover:bg-red-500/10'}`} onClick={() => void destructive(kind)}><Trash2 size={13} />{label}</button>;
  const separator = <div className="h-px bg-[var(--border-subtle)] my-1" />;
  const heading = (text: string) => <p className="px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]">{text}</p>;
  // Moving a merged cell by rebuilding rows/columns would break its geometry.
  let merged = false;
  info.tableNode?.descendants(node => { if ((node.attrs.colspan || 1) > 1 || (node.attrs.rowspan || 1) > 1) merged = true; });
  return <>
    {(scope === 'row' || scope === 'table') && <>
      {heading(`Row ${info.currentRowIndex + 1} of ${info.rowCount}`)}
      {button('Insert Row Above', () => { editor.chain().focus().addRowBefore().run(); selectTableCell(editor, info.currentRowIndex, info.currentColIndex); editor.commands.focus(); })}
      {button('Insert Row Below', () => { editor.chain().focus().addRowAfter().run(); selectTableCell(editor, info.currentRowIndex + 1, info.currentColIndex); editor.commands.focus(); })}
      {scope === 'row' && <>
        {button('Move Row Up', () => { moveRow(editor, info.currentRowIndex, info.currentRowIndex - 1); editor.commands.focus(); }, merged || info.currentRowIndex <= 0)}
        {button('Move Row Down', () => { moveRow(editor, info.currentRowIndex, info.currentRowIndex + 1); editor.commands.focus(); }, merged || info.currentRowIndex >= info.rowCount - 1)}
      </>}
      {danger(info.rowCount === 1 ? 'Delete Last Row…' : 'Delete Row', 'row')}
    </>}
    {scope === 'table' && separator}
    {(scope === 'column' || scope === 'table') && <>
      {heading(`Column ${info.currentColIndex + 1} of ${info.colCount}`)}
      {button('Insert Column Left', () => { editor.chain().focus().addColumnBefore().run(); selectTableCell(editor, info.currentRowIndex, info.currentColIndex); editor.commands.focus(); })}
      {button('Insert Column Right', () => { editor.chain().focus().addColumnAfter().run(); selectTableCell(editor, info.currentRowIndex, info.currentColIndex + 1); editor.commands.focus(); })}
      {scope === 'column' && <>
        {button('Move Column Left', () => { moveColumn(editor, info.currentColIndex, info.currentColIndex - 1); editor.commands.focus(); }, merged || info.currentColIndex <= 0)}
        {button('Move Column Right', () => { moveColumn(editor, info.currentColIndex, info.currentColIndex + 1); editor.commands.focus(); }, merged || info.currentColIndex >= info.colCount - 1)}
      </>}
      {danger(info.colCount === 1 ? 'Delete Last Column…' : 'Delete Column', 'column')}
    </>}
    {scope === 'table' && <>
      {separator}
      <button type="button" className={item} aria-pressed={info.hasHeaderRow} onClick={() => run(() => { editor.chain().focus().toggleHeaderRow().run(); })}>
        <span className="flex-1">Header Row</span>{info.hasHeaderRow && <Check size={13} />}
      </button>
      {danger('Clear All Cells…', 'clear')}
      {danger('Delete Table…', 'table')}
    </>}
  </>;
};
