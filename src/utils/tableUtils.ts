import { Editor } from '@tiptap/react';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { Selection, Transaction } from '@tiptap/pm/state';

/**
 * Rebuilding a table wholesale leaves the selection mapped to an arbitrary spot, which
 * felt like the cursor jumping out of the table. Put it back into the cell the user was
 * working in (following the row/column they just moved).
 */
function placeCursorInCell(
  tr: Transaction,
  tablePos: number,
  table: ProseMirrorNode,
  rowIndex: number,
  colIndex: number
) {
  try {
    if (table.childCount === 0) return;
    const safeRow = Math.max(0, Math.min(rowIndex, table.childCount - 1));

    let rowPos = tablePos + 1;
    for (let r = 0; r < safeRow; r++) {
      rowPos += table.child(r).nodeSize;
    }

    const row = table.child(safeRow);
    if (row.childCount === 0) return;
    const safeCol = Math.max(0, Math.min(colIndex, row.childCount - 1));

    let cellPos = rowPos + 1;
    for (let c = 0; c < safeCol; c++) {
      cellPos += row.child(c).nodeSize;
    }

    const target = Math.min(cellPos + 1, tr.doc.content.size);
    tr.setSelection(Selection.near(tr.doc.resolve(target), 1));
  } catch {
    // Leave the mapped selection alone if the geometry doesn't work out.
  }
}

export interface TableInfo {
  inTable: boolean;
  tableNode: ProseMirrorNode | null;
  tablePos: number;
  rowCount: number;
  colCount: number;
  currentRowIndex: number;
  currentColIndex: number;
  hasHeaderRow: boolean;
}

export function getTableInfo(editor: Editor | null): TableInfo {
  if (!editor || !editor.state) {
    return {
      inTable: false,
      tableNode: null,
      tablePos: -1,
      rowCount: 0,
      colCount: 0,
      currentRowIndex: -1,
      currentColIndex: -1,
      hasHeaderRow: false,
    };
  }

  const { state } = editor;
  const { selection } = state;
  const { $from } = selection;

  let tableDepth = -1;
  let rowDepth = -1;
  let cellDepth = -1;

  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'table') {
      tableDepth = d;
    } else if (node.type.name === 'tableRow') {
      rowDepth = d;
    } else if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      cellDepth = d;
    }
  }

  if (tableDepth === -1) {
    return {
      inTable: false,
      tableNode: null,
      tablePos: -1,
      rowCount: 0,
      colCount: 0,
      currentRowIndex: -1,
      currentColIndex: -1,
      hasHeaderRow: false,
    };
  }

  const tableNode = $from.node(tableDepth);
  const tablePos = $from.before(tableDepth);
  const rowCount = tableNode.childCount;
  const colCount = rowCount > 0 ? tableNode.child(0).childCount : 0;

  const currentRowIndex = rowDepth !== -1 ? $from.index(tableDepth) : 0;
  const currentColIndex = cellDepth !== -1 && rowDepth !== -1 ? $from.index(rowDepth) : 0;

  // Check if first row is header row
  let hasHeaderRow = false;
  if (rowCount > 0) {
    const firstRow = tableNode.child(0);
    hasHeaderRow = firstRow.childCount > 0 && firstRow.child(0).type.name === 'tableHeader';
  }

  return {
    inTable: true,
    tableNode,
    tablePos,
    rowCount,
    colCount,
    currentRowIndex,
    currentColIndex,
    hasHeaderRow,
  };
}

export function moveRow(editor: Editor, fromIndex: number, toIndex: number): boolean {
  const { state, view } = editor;
  const { selection } = state;
  const { $from } = selection;

  let tableDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') {
      tableDepth = d;
      break;
    }
  }

  if (tableDepth === -1) return false;

  const tableNode = $from.node(tableDepth);
  const tablePos = $from.before(tableDepth);
  const numRows = tableNode.childCount;

  if (
    fromIndex < 0 ||
    fromIndex >= numRows ||
    toIndex < 0 ||
    toIndex >= numRows ||
    fromIndex === toIndex
  ) {
    return false;
  }

  const rows: ProseMirrorNode[] = [];
  for (let i = 0; i < numRows; i++) {
    rows.push(tableNode.child(i));
  }

  const [movedRow] = rows.splice(fromIndex, 1);
  rows.splice(toIndex, 0, movedRow);

  const newTable = tableNode.type.create(tableNode.attrs, rows);
  const tr = state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable);
  placeCursorInCell(tr, tablePos, newTable, toIndex, 0);
  view.dispatch(tr);
  return true;
}

export function moveColumn(editor: Editor, fromIndex: number, toIndex: number): boolean {
  const { state, view } = editor;
  const { selection } = state;
  const { $from } = selection;

  let tableDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') {
      tableDepth = d;
      break;
    }
  }

  if (tableDepth === -1) return false;

  const tableNode = $from.node(tableDepth);
  const tablePos = $from.before(tableDepth);
  const numRows = tableNode.childCount;
  const numCols = numRows > 0 ? tableNode.child(0).childCount : 0;

  if (
    fromIndex < 0 ||
    fromIndex >= numCols ||
    toIndex < 0 ||
    toIndex >= numCols ||
    fromIndex === toIndex
  ) {
    return false;
  }

  const newRows: ProseMirrorNode[] = [];
  for (let r = 0; r < numRows; r++) {
    const rowNode = tableNode.child(r);
    const cells: ProseMirrorNode[] = [];
    for (let c = 0; c < rowNode.childCount; c++) {
      cells.push(rowNode.child(c));
    }
    const [movedCell] = cells.splice(fromIndex, 1);
    cells.splice(toIndex, 0, movedCell);

    newRows.push(rowNode.type.create(rowNode.attrs, cells));
  }

  const newTable = tableNode.type.create(tableNode.attrs, newRows);
  const tr = state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable);
  placeCursorInCell(tr, tablePos, newTable, 0, toIndex);
  view.dispatch(tr);
  return true;
}

export function clearTable(editor: Editor): boolean {
  const { state, view } = editor;
  const { selection } = state;
  const { $from } = selection;

  let tableDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') {
      tableDepth = d;
      break;
    }
  }

  if (tableDepth === -1) return false;

  const tableNode = $from.node(tableDepth);
  const tablePos = $from.before(tableDepth);
  const schema = state.schema;

  const newRows: ProseMirrorNode[] = [];
  for (let r = 0; r < tableNode.childCount; r++) {
    const rowNode = tableNode.child(r);
    const cells: ProseMirrorNode[] = [];
    for (let c = 0; c < rowNode.childCount; c++) {
      const cell = rowNode.child(c);
      const emptyParagraph = schema.nodes.paragraph.create();
      cells.push(cell.type.create(cell.attrs, emptyParagraph));
    }
    newRows.push(rowNode.type.create(rowNode.attrs, cells));
  }

  const newTable = tableNode.type.create(tableNode.attrs, newRows);
  const tr = state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable);
  placeCursorInCell(tr, tablePos, newTable, 0, 0);
  view.dispatch(tr);
  return true;
}
