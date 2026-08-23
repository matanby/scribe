import TaskItem from '@tiptap/extension-task-item';
import { getDirection } from './BiDiExtension';

export const CustomTaskItem = TaskItem.extend({
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
          updateA11Y();
          return true;
        }
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const check = node.attrs.checked ? '[x]' : '[ ]';
          state.write(`${check} `);
          state.renderInline(node);
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
