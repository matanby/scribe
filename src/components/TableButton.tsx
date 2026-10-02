import React, { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import { Table as TableIcon, ChevronDown } from 'lucide-react';
import { Popover } from './Popover';
import { TableMenus } from './TableMenus';

const TableSizePicker: React.FC<{ editor: Editor; close: () => void }> = ({ editor, close }) => {
  const [rows, setRows] = useState(2);
  const [columns, setColumns] = useState(2);
  const [header, setHeader] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const valid = Number.isInteger(rows) && rows >= 1 && rows <= 50 && Number.isInteger(columns) && columns >= 1 && columns <= 20;
  const insert = (r = rows, c = columns) => {
    if (!Number.isInteger(r) || r < 1 || r > 50 || !Number.isInteger(c) || c < 1 || c > 20 || editor.isDestroyed) return;
    close(); editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: header }).run();
  };
  return <div className="px-2 py-1 text-[var(--text-primary)]">
    <p className="text-xs font-medium mb-1">Insert Table</p>
    <p aria-live="polite" className="text-[11px] text-[var(--text-secondary)] mb-3">{columns || '—'} columns × {rows || '—'} rows</p>
    <div ref={grid} className="grid grid-cols-6 gap-1 mb-3" role="group" aria-label="Choose table size"
      onKeyDown={event => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const index = Number((event.target as HTMLElement).dataset.cell);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 29 : Math.max(0, Math.min(29, index + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 6 : -6)));
        grid.current?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus();
      }}>
      {Array.from({ length: 30 }, (_, index) => {
        const r = Math.floor(index / 6) + 1, c = index % 6 + 1;
        return <button key={index} data-cell={index} data-autofocus={r === 2 && c === 2 ? '' : undefined} type="button"
          tabIndex={r === Math.min(rows, 5) && c === Math.min(columns, 6) ? 0 : -1}
          aria-label={`Insert ${c} columns and ${r} rows`} title={`${c} columns × ${r} rows`}
          onMouseEnter={() => { setRows(r); setColumns(c); }} onFocus={() => { setRows(r); setColumns(c); }}
          onClick={() => insert(r, c)}
          className={`h-6 rounded border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)] ${r <= rows && c <= columns ? 'border-[var(--accent-color)] bg-[var(--accent-light)]' : 'border-[var(--border-color)] bg-[var(--card-hover)]'}`} />;
      })}
    </div>
    <div className="flex gap-3 mb-3">
      <label className="flex-1 text-[11px] text-[var(--text-secondary)]">Columns<input type="number" min={1} max={20} value={columns || ''} onChange={event => setColumns(Number(event.target.value))} className="mt-1 w-full px-2 py-1.5 rounded-md bg-[var(--card-hover)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]" /></label>
      <label className="flex-1 text-[11px] text-[var(--text-secondary)]">Rows<input type="number" min={1} max={50} value={rows || ''} onChange={event => setRows(Number(event.target.value))} className="mt-1 w-full px-2 py-1.5 rounded-md bg-[var(--card-hover)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]" /></label>
    </div>
    <label className="flex items-center gap-2 text-xs mb-3"><input type="checkbox" checked={header} onChange={event => setHeader(event.target.checked)} />Header row</label>
    <button type="button" disabled={!valid} onClick={() => insert()} className="w-full rounded-md py-2 text-xs font-medium bg-[var(--accent-color)] text-black disabled:opacity-40">Insert Table</button>
    {!valid && <p role="status" className="text-[11px] text-[var(--text-secondary)] mt-2">Choose 1–20 columns and 1–50 rows.</p>}
  </div>;
};

export const TableButton: React.FC<{ editor: Editor; insertTrigger: number }> = ({ editor, insertTrigger }) => {
  const [open, setOpen] = useState(false);
  const [forceInsert, setForceInsert] = useState(false);
  useEffect(() => { if (insertTrigger) { setForceInsert(true); setOpen(true); } }, [insertTrigger]);
  const inserting = forceInsert || !editor.isActive('table');
  return <Popover label={inserting ? 'Insert table' : 'Table options'} open={open}
    onOpenChange={next => { setOpen(next); if (!next) setForceInsert(false); }}
    triggerClassName={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs hover:bg-black/5 dark:hover:bg-white/10 ${editor.isActive('table') ? 'text-[var(--accent-color)] bg-[var(--accent-light)]' : 'text-[var(--text-primary)]'}`}
    trigger={<><TableIcon size={16} /><ChevronDown size={11} /></>}>
    {close => inserting ? <TableSizePicker editor={editor} close={close} /> : <TableMenus editor={editor} close={close} />}
  </Popover>;
};
