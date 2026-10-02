import TaskItem from '@tiptap/extension-task-item';
import { TextSelection } from '@tiptap/pm/state';
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
    };
  }
}

function reorderTasksInList(editor: any, pos: number) {
  if (editor.isDestroyed) return false;
  try {
    const tr = editor.state.tr;
    const $pos = tr.doc.resolve(pos);
    let taskListDepth = -1;
    for (let d = $pos.depth; d > 0; d--) {
      if ($pos.node(d).type.name === 'taskList') {
        taskListDepth = d;
        break;
      }
    }
    if (taskListDepth === -1) return false;

    const taskListPos = $pos.before(taskListDepth);
    const taskListNode = $pos.node(taskListDepth);

    const uncheckedItems: any[] = [];
    const checkedItems: any[] = [];

    taskListNode.forEach((childNode: any) => {
      if (childNode.attrs.checked) {
        checkedItems.push(childNode);
      } else {
        uncheckedItems.push(childNode);
      }
    });

    // If all are checked or none are checked, no reorder needed
    if (uncheckedItems.length === 0 || checkedItems.length === 0) return true;

    const sortedChildren = [...uncheckedItems, ...checkedItems];
    let changed = false;
    taskListNode.forEach((childNode: any, offset: number, index: number) => {
      if (childNode !== sortedChildren[index]) {
        changed = true;
      }
    });

    if (changed) {
      const newTaskList = taskListNode.type.create(taskListNode.attrs, sortedChildren);
      const remap = (position: number) => {
        let result = position;
        taskListNode.forEach((child: any, offset: number) => {
          const start = taskListPos + 1 + offset;
          if (position > start && position < start + child.nodeSize) {
            const index = sortedChildren.indexOf(child);
            const newOffset = sortedChildren.slice(0, index).reduce((sum: number, item: any) => sum + item.nodeSize, 0);
            result = taskListPos + 1 + newOffset + position - start;
          }
        });
        return result;
      };
      const from = remap(editor.state.selection.from), to = remap(editor.state.selection.to);
      tr.replaceWith(taskListPos, taskListPos + taskListNode.nodeSize, newTaskList);
      if (editor.state.selection instanceof TextSelection) tr.setSelection(TextSelection.create(tr.doc, from, to));
      editor.view.dispatch(tr);
    }
    return true;
  } catch (err) {
    console.error('Error auto-sorting tasks:', err);
    return false;
  }
}

export const CustomTaskItem = TaskItem.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      nested: false,
      autoSort: true,
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
              // Resolve the current selection after the toggle; sorting keeps the caret in its task.
              queueMicrotask(() => { if (!this.editor.isDestroyed) reorderTasksInList(this.editor, this.editor.state.selection.from); });
            }
          }
          return true;
        }
        return false;
      },
      sortCompletedTasks: () => ({ state, dispatch }) => {
        if (!this.editor.isActive('taskList')) return false;
        if (dispatch) queueMicrotask(() => { if (!this.editor.isDestroyed) reorderTasksInList(this.editor, this.editor.state.selection.from); });
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

      const updateA11Y = () => {
        checkbox.ariaLabel = `Task item checkbox for ${node.textContent || 'empty task item'}`;
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
              editor.view.dispatch(tr);

              // Auto-sort tasks on check and uncheck (if enabled in storage or options)
              const autoSortEnabled = (editor.storage?.taskItem as any)?.autoSort ?? (this.options.autoSort !== false);
              if (autoSortEnabled) {
                setTimeout(() => {
                  if (typeof getPos === 'function') {
                    const currentPos = getPos();
                    if (typeof currentPos === 'number') {
                      reorderTasksInList(editor, currentPos);
                    }
                  }
                }, 200);
              }
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
      };

      setDirection(node);

      listItem.dataset.checked = String(node.attrs.checked);
      checkbox.checked = !!node.attrs.checked;
      checkboxWrapper.append(checkbox, checkboxStyler);
      listItem.append(checkboxWrapper, content);

      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        listItem.setAttribute(key, value as string);
      });

      return {
        dom: listItem,
        contentDOM: content,
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
      autoSort: true,
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

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
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
