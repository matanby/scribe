import { Extension } from '@tiptap/core';

/** Consume list indentation keys even at the first item, where indentation is unavailable. */
export const ListKeyboard = Extension.create({
  name: 'listKeyboard',
  priority: 150,
  addKeyboardShortcuts() {
    const itemType = () => {
      const { $from } = this.editor.state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        const name = $from.node(depth).type.name;
        if (name === 'taskItem' || name === 'listItem') return name;
      }
      return null;
    };
    const indent = (outdent: boolean) => {
      if (this.editor.isActive('table')) return false;
      const type = itemType();
      if (!type) return false;
      if (outdent) this.editor.commands.liftListItem(type);
      else this.editor.commands.sinkListItem(type);
      return true;
    };
    return {
      Tab: () => indent(false),
      'Shift-Tab': () => indent(true),
      Enter: () => {
        const type = itemType();
        const { $from, empty } = this.editor.state.selection;
        if (!type || !empty || $from.parent.content.size) return false;
        return this.editor.commands.liftListItem(type);
      }
    };
  }
});
