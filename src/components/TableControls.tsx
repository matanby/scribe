import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TableMap } from '@tiptap/pm/tables';
import { Editor } from '@tiptap/react';
import { Ellipsis, EllipsisVertical, Plus } from 'lucide-react';
import { getTableInfo, selectTableCell } from '../utils/tableUtils';
import { Popover } from './Popover';
import { TableMenus } from './TableMenus';

interface Geometry {
  tablePos: number; row: number; column: number;
  rowHandle: { x: number; y: number } | null;
  columnHandle: { x: number; y: number } | null;
  addRow: { x: number; y: number } | null;
  addColumn: { x: number; y: number } | null;
}
const handle = 'flex items-center justify-center w-6 h-6 rounded-md border border-[var(--border-color)] bg-[var(--editor-bg)] text-[var(--text-secondary)] hover:text-[var(--accent-color)] hover:bg-[var(--accent-light)] shadow-sm';

/** Controls follow the table edges and never replace the note's typing surface. */
export const TableControls: React.FC<{ editor: Editor | null }> = ({ editor }) => {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const update = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isEditable || document.querySelector('[aria-modal="true"]')) { setGeometry(null); return; }
    const info = getTableInfo(editor);
    if (!info.inTable) { setGeometry(null); return; }
    const node = editor.view.nodeDOM(info.tablePos);
    if (!(node instanceof HTMLElement)) { setGeometry(null); return; }
    const table = node.tagName === 'TABLE' ? node as HTMLTableElement : node.querySelector('table');
    const scroller = editor.view.dom.closest('.overflow-y-auto');
    if (!table || !scroller) { setGeometry(null); return; }
    const rect = table.getBoundingClientRect(), viewport = scroller.getBoundingClientRect();
    const map = TableMap.get(info.tableNode!);
    const offset = map.map[info.currentRowIndex * map.width + info.currentColIndex];
    const cell = editor.view.nodeDOM(info.tablePos + 1 + offset);
    const row = table.rows[info.currentRowIndex];
    const columnCell = cell instanceof HTMLElement ? cell : null;
    if (!row || !columnCell || rect.bottom < viewport.top || rect.top > viewport.bottom) { setGeometry(null); return; }
    const rowRect = row.getBoundingClientRect(), cellRect = columnCell.getBoundingClientRect();
    const visible = (x: number, y: number) => x >= viewport.left + 2 && x + 24 <= viewport.right - 2 && y >= viewport.top + 2 && y + 24 <= viewport.bottom - 2;
    const point = (x: number, y: number) => visible(x, y) ? { x, y } : null;
    const rowY = Math.max(viewport.top + 3, Math.min(rowRect.top + rowRect.height / 2 - 12, viewport.bottom - 27));
    const rowVisible = rowRect.bottom > viewport.top && rowRect.top < viewport.bottom;
    setGeometry({ tablePos: info.tablePos, row: info.currentRowIndex, column: info.currentColIndex,
      rowHandle: rowVisible ? point(rect.left - 28, rowY) : null,
      columnHandle: point(cellRect.left + cellRect.width / 2 - 12, rect.top - 27),
      addRow: point(rect.left + rect.width / 2 - 12, rect.bottom + 4),
      addColumn: rowVisible ? point(rect.right + 4, rowY) : null
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    editor.on('transaction', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(editor.view.dom);
    const onFocus = () => schedule();
    document.addEventListener('focusin', onFocus);
    update();
    return () => {
      cancelAnimationFrame(frame); editor.off('transaction', schedule);
      window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', onFocus); observer.disconnect();
    };
  }, [editor, update]);

  if (!editor || !geometry) return null;
  const info = getTableInfo(editor);
  if (!info.inTable || info.tablePos !== geometry.tablePos) return null;
  const position = (point: { x: number; y: number }) => ({ position: 'fixed' as const, left: point.x, top: point.y, zIndex: 40 });
  return createPortal(<div className="no-print table-edge-controls">
    {geometry.rowHandle && <div style={position(geometry.rowHandle)}>
      <Popover label={`Row ${geometry.row + 1} options`} trigger={<EllipsisVertical size={15} />} triggerClassName={handle} onOpenChange={open => { if (open) selectTableCell(editor, geometry.row, geometry.column); }}>
        {close => <TableMenus editor={editor} scope="row" close={close} />}
      </Popover>
    </div>}
    {geometry.columnHandle && <div style={position(geometry.columnHandle)}>
      <Popover label={`Column ${geometry.column + 1} options`} align="center" trigger={<Ellipsis size={15} />} triggerClassName={handle} onOpenChange={open => { if (open) selectTableCell(editor, geometry.row, geometry.column); }}>
        {close => <TableMenus editor={editor} scope="column" close={close} />}
      </Popover>
    </div>}
    {geometry.addRow && <button type="button" style={position(geometry.addRow)} className={handle} aria-label="Add row at bottom" title="Add row at bottom"
      onClick={() => {
        const current = getTableInfo(editor);
        if (!current.inTable) return;
        selectTableCell(editor, current.rowCount - 1, current.currentColIndex);
        editor.chain().focus().addRowAfter().run();
        selectTableCell(editor, current.rowCount, current.currentColIndex);
        editor.commands.focus();
      }}><Plus size={15} /></button>}
    {geometry.addColumn && <button type="button" style={position(geometry.addColumn)} className={handle} aria-label="Add column at right" title="Add column at right"
      onClick={() => {
        const current = getTableInfo(editor);
        if (!current.inTable) return;
        selectTableCell(editor, current.currentRowIndex, current.colCount - 1);
        editor.chain().focus().addColumnAfter().run();
        selectTableCell(editor, current.currentRowIndex, current.colCount);
        editor.commands.focus();
      }}><Plus size={15} /></button>}
  </div>, document.body);
};
