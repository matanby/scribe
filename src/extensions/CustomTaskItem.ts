import TaskItem from '@tiptap/extension-task-item';

export const CustomTaskItem = TaskItem.extend({
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

          // If cursor is at start of a 1-character task item and presses Delete
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
