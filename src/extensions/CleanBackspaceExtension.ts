import { Extension } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';

export const CleanBackspaceExtension = Extension.create({
  name: 'cleanBackspace',

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state, dispatch } = this.editor.view;
        const { selection } = state;
        const { $from, empty } = selection;

        // Only handle collapsed selection (cursor)
        if (!empty) return false;

        // Check if inside a paragraph
        if ($from.parent.isTextblock && $from.parent.type.name === 'paragraph') {
          // If paragraph is completely empty
          if ($from.parent.content.size === 0) {
            const nodeBeforePos = $from.before();

            if (nodeBeforePos > 0) {
              const $before = state.doc.resolve(nodeBeforePos);
              const prevNode = $before.nodeBefore;

              // If preceded by a taskList, bulletList, orderedList, table, or blockquote
              if (
                prevNode &&
                ['taskList', 'bulletList', 'orderedList', 'table', 'blockquote'].includes(prevNode.type.name)
              ) {
                const fromPos = $from.before();
                const toPos = $from.after();
                const tr = state.tr.delete(fromPos, toPos);

                // Place cursor at the end of the previous block
                const targetPos = Math.max(0, fromPos - 1);
                const resolvedTarget = tr.doc.resolve(Math.min(targetPos, tr.doc.content.size));
                tr.setSelection(Selection.near(resolvedTarget, -1));

                dispatch(tr);
                return true;
              }
            }
          }
        }

        return false;
      }
    };
  }
});
