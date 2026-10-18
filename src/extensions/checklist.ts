import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';

export const TASK_DRAG_TYPE = 'application/x-scribe-task';
interface ChecklistView { hideCompleted: boolean; draggedPos: number | null; target: { pos: number; after: boolean } | null; }
export const checklistViewKey = new PluginKey<ChecklistView>('checklistView');

export function taskAt(doc: ProseMirrorNode, position: number) {
  if (position < 0 || position > doc.content.size) return null;
  let pos = position;
  if (doc.nodeAt(pos)?.type.name !== 'taskItem') {
    const $pos = doc.resolve(pos);
    const depth = Array.from({ length: $pos.depth }, (_, i) => $pos.depth - i).find(d => $pos.node(d).type.name === 'taskItem');
    if (!depth) return null;
    pos = $pos.before(depth);
  }
  const $task = doc.resolve(pos);
  if ($task.parent.type.name !== 'taskList') return null;
  return { pos, node: doc.nodeAt(pos)!, list: $task.parent, listPos: $task.before(), index: $task.index() };
}

/** Reorder whole items, including nested lists, and keep each selection endpoint in its original item. */
function replaceOrder(tr: Transaction, listPos: number, order: number[]) {
  const list = tr.doc.nodeAt(listPos)!;
  const original: ProseMirrorNode[] = [];
  list.forEach(node => original.push(node));
  if (order.every((index, i) => index === i)) return false;
  const remap = (position: number) => {
    let result = position;
    list.forEach((node, offset, originalIndex) => {
      const start = listPos + 1 + offset;
      if (position >= start && position < start + node.nodeSize) {
        const index = order.indexOf(originalIndex);
        result = listPos + 1 + order.slice(0, index).reduce((sum, childIndex) => sum + original[childIndex].nodeSize, 0) + position - start;
      }
    });
    return result;
  };
  const selection = tr.selection;
  const anchor = remap(selection.anchor), head = remap(selection.head);
  tr.replaceWith(listPos, listPos + list.nodeSize, list.type.create(list.attrs, order.map(index => original[index]), list.marks));
  if (selection instanceof TextSelection) tr.setSelection(TextSelection.create(tr.doc, anchor, head));
  else if (selection instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, anchor));
  return true;
}

export function sortChecklist(tr: Transaction, listPos: number) {
  const list = tr.doc.nodeAt(listPos);
  if (list?.type.name !== 'taskList') return false;
  const items: ProseMirrorNode[] = [];
  list.forEach(node => items.push(node));
  const indices = items.map((_, index) => index);
  return replaceOrder(tr, listPos, [...indices.filter(index => !items[index].attrs.checked), ...indices.filter(index => items[index].attrs.checked)]);
}

export function sortAllChecklists(tr: Transaction) {
  const positions: number[] = [];
  tr.doc.descendants((node, pos) => { if (node.type.name === 'taskList') positions.push(pos); });
  positions.reverse().forEach(pos => sortChecklist(tr, pos));
}

export function reorderTask(tr: Transaction, sourcePos: number, targetPos: number, after: boolean) {
  const source = taskAt(tr.doc, sourcePos), target = taskAt(tr.doc, targetPos);
  if (!source || !target || source.listPos !== target.listPos || source.pos === target.pos) return false;
  const order = Array.from({ length: source.list.childCount }, (_, index) => index).filter(index => index !== source.index);
  const index = order.indexOf(target.index) + (after ? 1 : 0);
  order.splice(index, 0, source.index);
  return replaceOrder(tr, source.listPos, order);
}

export function adjacentTask(doc: ProseMirrorNode, position: number, direction: 'up' | 'down') {
  const task = taskAt(doc, position);
  if (!task) return null;
  const index = task.index + (direction === 'up' ? -1 : 1);
  if (index < 0 || index >= task.list.childCount) return null;
  let targetPos = task.listPos + 1;
  for (let i = 0; i < index; i++) targetPos += task.list.child(i).nodeSize;
  return { sourcePos: task.pos, targetPos, after: direction === 'down', movedPos: direction === 'up' ? targetPos : targetPos + task.list.child(index).nodeSize - task.node.nodeSize };
}

export function checklistSummary(doc: ProseMirrorNode) {
  let total = 0, completed = 0;
  doc.descendants(node => { if (node.type.name === 'taskItem') { total++; if (node.attrs.checked) completed++; } });
  return { total, completed };
}

function completedBranch(node: ProseMirrorNode) {
  if (!node.attrs.checked) return false;
  let allCompleted = true;
  node.descendants(child => { if (child.type.name === 'taskItem' && !child.attrs.checked) allCompleted = false; });
  return allCompleted;
}

export function checklistPlugin() {
  let lastDrag: DragEvent | null = null;
  // Read only siblings in the source checklist. Hovering over a nested child still
  // moves the whole containing task, and the gaps remain valid outside its text.
  const rowsFor = (view: EditorView, source: number) => {
    const task = taskAt(view.state.doc, source);
    if (!task) return null;
    const list = view.nodeDOM(task.listPos);
    if (!(list instanceof HTMLElement)) return null;
    const rows: { pos: number; index: number; bounds: DOMRect }[] = [];
    task.list.forEach((node, offset, index) => {
      const pos = task.listPos + 1 + offset;
      const element = view.nodeDOM(pos);
      if (!(element instanceof HTMLElement)) return;
      const bounds = element.getBoundingClientRect();
      if (bounds.height > 0) rows.push({ pos, index, bounds });
    });
    return { task, rows, bounds: list.getBoundingClientRect() };
  };
  const dropTarget = (view: EditorView, event: DragEvent) => {
    const source = checklistViewKey.getState(view.state)?.draggedPos;
    if (!view.editable || source == null || !(event.target instanceof Node) || !view.dom.contains(event.target)) return null;
    const siblings = rowsFor(view, source);
    if (!siblings || !siblings.rows.length) return null;
    const { task, rows, bounds } = siblings;
    if (event.clientX < bounds.left - 32 || event.clientX > bounds.right + 32 || event.clientY < bounds.top - 12 || event.clientY > bounds.bottom + 12) return null;
    const paneBounds = view.dom.closest('.note-scroller')?.getBoundingClientRect();
    if (paneBounds && (event.clientY < paneBounds.top || event.clientY > paneBounds.bottom)) return null;
    const index = rows.findIndex(row => event.clientY < (row.bounds.top + row.bounds.bottom) / 2);
    const row = index < 0 ? rows[rows.length - 1] : rows[index];
    const after = index < 0;
    const insertionIndex = row.index + (after ? 1 : 0);
    // Both gaps adjacent to the source leave it in the same place.
    if (insertionIndex === task.index || insertionIndex === task.index + 1) return null;
    return { pos: row.pos, after };
  };
  return new Plugin<ChecklistView>({
    key: checklistViewKey,
    state: {
      init: () => ({ hideCompleted: false, draggedPos: null, target: null }),
      apply(tr, previous) {
        const next = { ...previous, ...tr.getMeta(checklistViewKey) };
        if (tr.docChanged) {
          if (next.draggedPos !== null) {
            const mapped = tr.mapping.mapResult(next.draggedPos);
            next.draggedPos = mapped.deleted ? null : mapped.pos;
          }
          next.target = null;
        }
        return next;
      }
    },
    props: {
      decorations(state) {
        const options = checklistViewKey.getState(state)!;
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name !== 'taskItem') return;
          // Keep a completed parent visible when it still contains an unfinished task.
          // The item being edited also stays visible until the caret leaves it.
          const containsSelection = state.selection.from < pos + node.nodeSize && state.selection.to > pos;
          if (options.hideCompleted && completedBranch(node) && !containsSelection) {
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'task-completed-hidden' }));
            return false;
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
      handleDOMEvents: {
        dragover(view, event) {
          if (checklistViewKey.getState(view.state)?.draggedPos == null) return false;
          lastDrag = event;
          event.preventDefault();
          const target = dropTarget(view, event);
          if (event.dataTransfer) event.dataTransfer.dropEffect = target ? 'move' : 'none';
          const old = checklistViewKey.getState(view.state)?.target;
          if (old?.pos !== target?.pos || old?.after !== target?.after) view.dispatch(view.state.tr.setMeta(checklistViewKey, { target }).setMeta('addToHistory', false));
          return true;
        },
        drop(view, event) {
          const source = checklistViewKey.getState(view.state)?.draggedPos;
          if (source == null) return false;
          event.preventDefault();
          const target = dropTarget(view, event);
          lastDrag = null;
          const tr = view.state.tr;
          if (target) reorderTask(tr, source, target.pos, target.after);
          tr.setMeta(checklistViewKey, { draggedPos: null, target: null });
          if (tr.docChanged) closeHistory(tr);
          else tr.setMeta('addToHistory', false);
          view.dispatch(tr);
          return true;
        },
        dragend(view) {
          lastDrag = null;
          if (checklistViewKey.getState(view.state)?.draggedPos == null) return false;
          view.dispatch(view.state.tr.setMeta(checklistViewKey, { draggedPos: null, target: null }).setMeta('addToHistory', false));
          return true;
        },
        dragleave(view, event) {
          if (event.relatedTarget instanceof Node && view.dom.contains(event.relatedTarget)) return false;
          lastDrag = null;
          if (!checklistViewKey.getState(view.state)?.target) return false;
          view.dispatch(view.state.tr.setMeta(checklistViewKey, { target: null }).setMeta('addToHistory', false));
          return true;
        }
      }
    },
    view(view) {
      const host = view.dom.closest('.note-editor') || view.dom.closest('.note-scroller') || view.dom.parentElement!;
      const indicator = document.createElement('div');
      indicator.className = 'task-drop-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      // The overlay uses viewport coordinates and never participates in editor layout.
      // Keep its color local to this editor even though it lives outside the note pane.
      const render = () => {
        const options = checklistViewKey.getState(view.state)!;
        host.classList.toggle('task-reordering', options.draggedPos !== null);
        indicator.remove();
        if (options.draggedPos === null || !options.target) return;
        const siblings = rowsFor(view, options.draggedPos);
        const index = siblings?.rows.findIndex(row => row.pos === options.target!.pos) ?? -1;
        if (!siblings || index < 0) return;
        const { rows } = siblings;
        const row = rows[index];
        const previous = rows[index - 1];
        const top = options.target.after ? row.bounds.bottom : previous ? (previous.bounds.bottom + row.bounds.top) / 2 : row.bounds.top;
        const scroller = view.dom.closest<HTMLElement>('.note-scroller');
        const visible = scroller?.getBoundingClientRect();
        if (visible && (top < visible.top || top > visible.bottom)) return;
        indicator.style.left = `${row.bounds.left}px`;
        indicator.style.top = `${top - 1}px`;
        indicator.style.width = `${row.bounds.width}px`;
        indicator.style.backgroundColor = getComputedStyle(view.dom).getPropertyValue('--accent-ink').trim() || getComputedStyle(view.dom).getPropertyValue('--accent-color').trim();
        document.body.append(indicator);
      };
      const cancel = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && checklistViewKey.getState(view.state)?.draggedPos !== null) {
          lastDrag = null;
          view.dispatch(view.state.tr.setMeta(checklistViewKey, { draggedPos: null, target: null }).setMeta('addToHistory', false));
        }
      };
      const reposition = () => {
        if (lastDrag && checklistViewKey.getState(view.state)?.draggedPos !== null) {
          const target = dropTarget(view, lastDrag);
          const previous = checklistViewKey.getState(view.state)?.target;
          if (previous?.pos !== target?.pos || previous?.after !== target?.after) {
            view.dispatch(view.state.tr.setMeta(checklistViewKey, { target }).setMeta('addToHistory', false));
            return;
          }
        }
        render();
      };
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
      window.addEventListener('keydown', cancel, true);
      render();
      return {
        update: render,
        destroy() {
          indicator.remove(); host.classList.remove('task-reordering');
          lastDrag = null;
          window.removeEventListener('scroll', reposition, true);
          window.removeEventListener('resize', reposition);
          window.removeEventListener('keydown', cancel, true);
        }
      };
    }
  });
}
