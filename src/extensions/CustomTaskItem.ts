import TaskItem from '@tiptap/extension-task-item';
import { closeHistory } from '@tiptap/pm/history';
import { adjacentTask, checklistPlugin, checklistViewKey, sortAllChecklists, sortChecklist, taskAt, reorderTask, TASK_DRAG_TYPE } from './checklist';
import { getDirection } from './BiDiExtension';

declare module '@tiptap/extension-task-item' {
  interface TaskItemOptions {
    autoSort?: boolean;
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    checklistActions: {
      toggleCurrentTask: () => ReturnType;
      sortCompletedTasks: () => ReturnType;
      setCompletedTasksHidden: (hidden: boolean) => ReturnType;
      moveTask: (direction: 'up' | 'down', position?: number) => ReturnType;
    };
  }
}

export const CustomTaskItem = TaskItem.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      nested: false,
      autoSort: false,
      HTMLAttributes: {}
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      toggleCurrentTask: () => ({ state, tr, dispatch }) => {
        const { $from } = state.selection;
        for (let depth = $from.depth; depth > 0; depth--) {
          if ($from.node(depth).type.name !== this.name) continue;
          const position = $from.before(depth), node = $from.node(depth);
          if (dispatch) {
            tr.setNodeMarkup(position, undefined, { ...node.attrs, checked: !node.attrs.checked });
            if (this.storage.autoSort ?? this.options.autoSort) {
              const task = taskAt(tr.doc, position);
              if (task) sortChecklist(tr, task.listPos);
            }
            closeHistory(tr);
          }
          return true;
        }
        return false;
      },
      sortCompletedTasks: () => ({ tr, dispatch }) => {
        if (dispatch) { sortAllChecklists(tr); closeHistory(tr); }
        return true;
      },
      setCompletedTasksHidden: hidden => ({ tr, dispatch }) => {
        if (dispatch) tr.setMeta(checklistViewKey, { hideCompleted: hidden }).setMeta('addToHistory', false);
        return true;
      },
      moveTask: (direction, position) => ({ state, tr, dispatch }) => {
        const adjacent = adjacentTask(tr.doc, position ?? state.selection.from, direction);
        if (!adjacent) return false;
        if (dispatch) { reorderTask(tr, adjacent.sourcePos, adjacent.targetPos, adjacent.after); closeHistory(tr); }
        return true;
      }
    };
  },

  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor }) => {
      const listItem = document.createElement('li');
      listItem.classList.add('task-item');
      listItem.setAttribute('data-type', 'taskItem');

      const checkboxWrapper = document.createElement('label');
      const checkboxStyler = document.createElement('span');
      const checkbox = document.createElement('input');
      const content = document.createElement('div');
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'task-drag-handle';
      handle.contentEditable = 'false';
      handle.draggable = true;
      handle.title = 'Drag to reorder within this checklist. Use ↑ / ↓ when focused.';
      handle.innerHTML = '<svg viewBox="0 0 16 20" width="14" height="18" aria-hidden="true" fill="currentColor"><circle cx="5" cy="5" r="1.2"/><circle cx="11" cy="5" r="1.2"/><circle cx="5" cy="10" r="1.2"/><circle cx="11" cy="10" r="1.2"/><circle cx="5" cy="15" r="1.2"/><circle cx="11" cy="15" r="1.2"/></svg>';
      // Keep the browser's drag initiation; the node view prevents editor selection changes.
      handle.addEventListener('mousedown', event => event.stopPropagation());
      handle.addEventListener('dragstart', event => {
        const pos = getPos();
        if (!editor.isEditable || typeof pos !== 'number' || !event.dataTransfer) { event.preventDefault(); return; }
        event.stopPropagation();
        event.dataTransfer.setData(TASK_DRAG_TYPE, 'task');
        event.dataTransfer.setData('text/plain', node.textContent);
        event.dataTransfer.effectAllowed = 'move';
        // Drag-image offsets are measured from the physical left edge, even for
        // RTL text. Anchor at the grabbed handle rather than a fixed left inset.
        const bounds = listItem.getBoundingClientRect();
        event.dataTransfer.setDragImage(listItem,
          Math.round(event.clientX - bounds.left),
          Math.round(event.clientY - bounds.top));
        editor.view.dispatch(editor.state.tr.setMeta(checklistViewKey, { draggedPos: pos }).setMeta('addToHistory', false));
      });
      handle.addEventListener('keydown', event => {
        if (!editor.isEditable) return;
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault(); event.stopPropagation();
        const pos = getPos();
        if (typeof pos !== 'number') return;
        const direction = event.key === 'ArrowUp' ? 'up' : 'down';
        const adjacent = adjacentTask(editor.state.doc, pos, direction);
        if (adjacent && editor.commands.moveTask(direction, pos)) {
          (editor.view.nodeDOM(adjacent.movedPos) as HTMLElement | null)?.querySelector<HTMLButtonElement>('.task-drag-handle')?.focus({ preventScroll: true });
        }
      });

      const updateA11Y = () => {
        checkbox.ariaLabel = `Task item checkbox for ${node.textContent || 'empty task item'}`;
        handle.ariaLabel = `Reorder task: ${node.firstChild?.textContent || 'empty task'}`;
      };
      updateA11Y();

      checkboxWrapper.contentEditable = 'false';
      checkbox.type = 'checkbox';
      checkbox.addEventListener('mousedown', event => event.preventDefault());
      checkbox.addEventListener('change', event => {
        if (!editor.isEditable) {
          checkbox.checked = !checkbox.checked;
          return;
        }
        const { checked } = event.target as HTMLInputElement;
        if (typeof getPos === 'function') {
          const pos = getPos();
          if (typeof pos === 'number') {
            const tr = editor.state.tr;
            const currentNode = tr.doc.nodeAt(pos);
            if (currentNode) {
              tr.setNodeMarkup(pos, undefined, {
                ...currentNode.attrs,
                checked
              });
              if ((editor.storage.taskItem as any).autoSort ?? this.options.autoSort) {
                const task = taskAt(tr.doc, pos);
                if (task) sortChecklist(tr, task.listPos);
              }
              closeHistory(tr);
              editor.view.dispatch(tr);
            }
          }
        }
      });

      Object.entries(this.options.HTMLAttributes).forEach(([key, value]) => {
        listItem.setAttribute(key, value as string);
      });

      // Direction detection and attribute assignment
      const setDirection = (n: any) => {
        const text = n.textContent;
        const detected = getDirection(text);
        const resolvedDir = n.attrs.dir && n.attrs.dir !== 'auto' 
          ? n.attrs.dir 
          : (detected !== 'auto' ? detected : 'ltr');

        listItem.setAttribute('dir', resolvedDir);
        listItem.setAttribute('data-dir', resolvedDir);
        content.setAttribute('dir', resolvedDir);
        if (n.attrs.directionOverride) listItem.setAttribute('data-direction-override', n.attrs.directionOverride);
        else listItem.removeAttribute('data-direction-override');
      };

      setDirection(node);

      listItem.dataset.checked = String(node.attrs.checked);
      checkbox.checked = !!node.attrs.checked;
      checkboxWrapper.append(checkbox, checkboxStyler);
      listItem.append(handle, checkboxWrapper, content);

      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        listItem.setAttribute(key, value as string);
      });

      return {
        dom: listItem,
        contentDOM: content,
        stopEvent: event => event.target instanceof Node && (checkboxWrapper.contains(event.target) || handle.contains(event.target)) && !['drop', 'dragover', 'dragend'].includes(event.type),
        update: updatedNode => {
          if (updatedNode.type !== this.type) {
            return false;
          }
          listItem.dataset.checked = String(updatedNode.attrs.checked);
          checkbox.checked = !!updatedNode.attrs.checked;
          setDirection(updatedNode);
          node = updatedNode;
          updateA11Y();
          return true;
        }
      };
    };
  },

  addStorage() {
    return {
      autoSort: this.options.autoSort ?? false,
      markdown: {
        serialize(state: any, node: any) {
          const check = node.attrs.checked ? '[x]' : '[ ]';
          state.write(`${check} `);
          state.renderContent(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            element.querySelectorAll('.task-list-item').forEach((item: any) => {
              const input = item.querySelector('input');
              item.setAttribute('data-type', 'taskItem');
              if (input) {
                item.setAttribute('data-checked', String(input.checked));
                input.remove();
              }
            });
          }
        }
      }
    };
  },

  addProseMirrorPlugins() { return [...(this.parent?.() || []), checklistPlugin()]; },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Enter: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!$from.depth || !taskAt(this.editor.state.doc, $from.pos)) return false;
        if (empty && !$from.parent.content.size) return this.editor.commands.liftListItem(this.name);
        return this.editor.commands.splitListItem(this.name, { checked: false });
      },
      'Mod-Shift-u': () => this.editor.commands.toggleCurrentTask(),
      Backspace: () => {
        const { state, dispatch } = this.editor.view;
        const { selection } = state;
        const { $from, empty } = selection;

        // Check if inside a taskItem
        let isInsideTaskItem = false;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === this.name) {
            isInsideTaskItem = true;
            break;
          }
        }

        if (!isInsideTaskItem) return false;

        if (empty && $from.parent.isTextblock) {
          const text = $from.parent.textContent;
          const offset = $from.parentOffset;

          // Case 1: Exactly 1 character and cursor is right after it (offset === 1)
          if (text.length === 1 && offset === 1) {
            const tr = state.tr.delete($from.pos - 1, $from.pos);
            dispatch(tr);
            return true;
          }

          // Case 2: Task item is empty -> lift/remove task list item
          if (text.length === 0) {
            return this.editor.commands.liftListItem(this.name);
          }

          // Case 3: Cursor is at the beginning of the textblock (offset === 0)
          if (offset === 0) {
            return this.editor.commands.liftListItem(this.name);
          }
        }

        return false;
      },
      Delete: () => {
        const { state, dispatch } = this.editor.view;
        const { selection } = state;
        const { $from, empty } = selection;

        let isInsideTaskItem = false;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === this.name) {
            isInsideTaskItem = true;
            break;
          }
        }

        if (!isInsideTaskItem) return false;

        if (empty && $from.parent.isTextblock) {
          const text = $from.parent.textContent;
          const offset = $from.parentOffset;

          if (text.length === 1 && offset === 0) {
            const tr = state.tr.delete($from.pos, $from.pos + 1);
            dispatch(tr);
            return true;
          }
        }

        return false;
      }
    };
  }
});
