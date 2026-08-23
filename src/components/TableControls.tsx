import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Editor } from '@tiptap/react';
import { 
  Table as TableIcon, 
  Plus, 
  Trash2, 
  ArrowLeft, 
  ArrowRight, 
  ArrowUp, 
  ArrowDown, 
  Eraser, 
  Check, 
  ChevronDown 
} from 'lucide-react';
import { getTableInfo, moveRow, moveColumn, clearTable, TableInfo } from '../utils/tableUtils';

interface TableControlsProps {
  editor: Editor | null;
}

export const TableControls: React.FC<TableControlsProps> = ({ editor }) => {
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const getActiveTableElement = useCallback((): HTMLElement | null => {
    if (!editor) return null;
    const info = getTableInfo(editor);
    if (!info.inTable) return null;

    if (info.tablePos >= 0) {
      try {
        const dom = editor.view.nodeDOM(info.tablePos);
        if (dom instanceof HTMLElement) {
          return dom.tagName === 'TABLE' ? dom : dom.querySelector('table') || dom;
        }
      } catch {}
    }

    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      const el = sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode.parentElement;
      return el?.closest('table') || null;
    }

    return null;
  }, [editor]);

  const updatePosition = useCallback(() => {
    if (!editor || !editor.isActive('table')) {
      setIsVisible(false);
      setTableInfo(null);
      return;
    }

    const info = getTableInfo(editor);
    if (!info.inTable) {
      setIsVisible(false);
      setTableInfo(null);
      return;
    }

    setTableInfo(info);

    const tableEl = getActiveTableElement();
    if (!tableEl) {
      setIsVisible(false);
      return;
    }

    const rect = tableEl.getBoundingClientRect();
    // If table is completely offscreen, hide
    if (rect.bottom < 40 || rect.top > window.innerHeight) {
      setIsVisible(false);
      return;
    }

    // Position menu in a fixed position directly above the top-left of the table
    const menuHeight = 36;
    const top = Math.max(50, rect.top - menuHeight - 6);
    const left = Math.max(16, rect.left);

    setCoords({ top, left });
    setIsVisible(true);
  }, [editor, getActiveTableElement]);

  useEffect(() => {
    if (!editor) return;

    editor.on('selectionUpdate', updatePosition);
    editor.on('update', updatePosition);
    updatePosition();

    const handleScrollOrResize = () => {
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      editor.off('selectionUpdate', updatePosition);
      editor.off('update', updatePosition);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [editor, updatePosition]);

  // Click outside listener for table options dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key listener for table options dropdown
  useEffect(() => {
    if (!showMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [showMenu]);

  if (!editor || !isVisible || !coords || !tableInfo || !tableInfo.inTable) {
    return null;
  }

  const rowCount = tableInfo.rowCount || 0;
  const colCount = tableInfo.colCount || 0;
  const currentRowIndex = tableInfo.currentRowIndex ?? 0;
  const currentColIndex = tableInfo.currentColIndex ?? 0;
  const hasHeaderRow = tableInfo.hasHeaderRow || false;

  const handleAddColumnAfter = () => {
    editor.chain().focus().addColumnAfter().run();
    setTimeout(updatePosition, 20);
  };

  const handleDeleteColumn = () => {
    editor.chain().focus().deleteColumn().run();
    setTimeout(updatePosition, 20);
  };

  const handleAddRowAfter = () => {
    editor.chain().focus().addRowAfter().run();
    setTimeout(updatePosition, 20);
  };

  const handleDeleteRow = () => {
    editor.chain().focus().deleteRow().run();
    setTimeout(updatePosition, 20);
  };

  const handleDeleteTable = () => {
    editor.chain().focus().deleteTable().run();
    setIsVisible(false);
  };

  const handleToggleHeaderRow = () => {
    editor.chain().focus().toggleHeaderRow().run();
    setTimeout(updatePosition, 20);
  };

  const handleClearTable = () => {
    clearTable(editor);
  };

  const handleMoveColLeft = () => {
    if (currentColIndex > 0) {
      moveColumn(editor, currentColIndex, currentColIndex - 1);
      setTimeout(updatePosition, 20);
    }
  };

  const handleMoveColRight = () => {
    if (currentColIndex < colCount - 1) {
      moveColumn(editor, currentColIndex, currentColIndex + 1);
      setTimeout(updatePosition, 20);
    }
  };

  const handleMoveRowUp = () => {
    if (currentRowIndex > 0) {
      moveRow(editor, currentRowIndex, currentRowIndex - 1);
      setTimeout(updatePosition, 20);
    }
  };

  const handleMoveRowDown = () => {
    if (currentRowIndex < rowCount - 1) {
      moveRow(editor, currentRowIndex, currentRowIndex + 1);
      setTimeout(updatePosition, 20);
    }
  };

  const content = (
    <div
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 50,
      }}
      className="flex flex-nowrap whitespace-nowrap items-center gap-1 p-1 rounded-2xl bg-white/95 dark:bg-[#252528]/95 backdrop-blur-2xl border border-[var(--border-color)] shadow-2xl select-none shrink-0 pointer-events-auto animate-in fade-in duration-100"
    >
      {/* Table Badge & Options Popover */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={`flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-semibold transition-all ${
            showMenu
              ? 'bg-[var(--accent-color)] text-white shadow-xs'
              : 'bg-[var(--accent-light)] text-[var(--accent-color)] hover:opacity-90'
          }`}
          title="Table Options"
        >
          <TableIcon size={13} />
          <span>{rowCount}×{colCount}</span>
          <ChevronDown size={10} className={`opacity-70 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
        </button>

        {showMenu && (
          <div className="absolute left-0 bottom-full mb-2 w-48 p-1.5 rounded-2xl bg-white dark:bg-[#252528] border border-[var(--border-color)] shadow-2xl z-50 space-y-0.5 text-xs animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Table Options
            </div>

            <button
              onClick={() => {
                handleToggleHeaderRow();
                setShowMenu(false);
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-primary)] transition-colors"
            >
              <span>Header Row</span>
              {hasHeaderRow && <Check size={12} className="text-[var(--accent-color)]" />}
            </button>

            <button
              onClick={() => {
                handleClearTable();
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/10 text-amber-600 transition-colors"
            >
              <Eraser size={12} />
              <span>Clear All Cells</span>
            </button>

            <div className="h-[1px] bg-[var(--border-subtle)] my-1" />

            <button
              onClick={() => {
                handleDeleteTable();
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left hover:bg-red-500/10 text-red-500 font-medium transition-colors"
            >
              <Trash2 size={12} />
              <span>Delete Entire Table</span>
            </button>
          </div>
        )}
      </div>

      <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-0.5 shrink-0" />

      {/* Column Group */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={handleMoveColLeft}
          disabled={currentColIndex <= 0}
          className="p-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title="Move Column Left"
        >
          <ArrowLeft size={12.5} />
        </button>

        <button
          onClick={handleMoveColRight}
          disabled={currentColIndex >= colCount - 1}
          className="p-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title="Move Column Right"
        >
          <ArrowRight size={12.5} />
        </button>

        <button
          onClick={handleAddColumnAfter}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Add Column to Right"
        >
          <Plus size={12} />
          <span>Col</span>
        </button>

        <button
          onClick={handleDeleteColumn}
          className="p-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
          title="Delete Current Column"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-0.5 shrink-0" />

      {/* Row Group */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={handleMoveRowUp}
          disabled={currentRowIndex <= 0}
          className="p-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title="Move Row Up"
        >
          <ArrowUp size={12.5} />
        </button>

        <button
          onClick={handleMoveRowDown}
          disabled={currentRowIndex >= rowCount - 1}
          className="p-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title="Move Row Down"
        >
          <ArrowDown size={12.5} />
        </button>

        <button
          onClick={handleAddRowAfter}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Add Row to Bottom"
        >
          <Plus size={12} />
          <span>Row</span>
        </button>

        <button
          onClick={handleDeleteRow}
          className="p-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
          title="Delete Current Row"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="w-[1px] h-3.5 bg-[var(--border-color)] mx-0.5 shrink-0" />

      {/* Delete Table Button */}
      <button
        onClick={handleDeleteTable}
        className="p-1.5 rounded-lg text-xs text-red-500 hover:bg-red-500/10 transition-colors"
        title="Delete Entire Table"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
