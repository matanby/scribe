import { Extension, InputRule } from '@tiptap/core';
import { Selection, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';

const LISTS = ['bulletList', 'orderedList', 'taskList'];
const ITEMS = ['listItem', 'taskItem'];

/** The depth of the closest list item around a position, or -1. */
function itemDepth($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth--) if (ITEMS.includes($pos.node(depth).type.name)) return depth;
  return -1;
}

/** Deletes from the end of one textblock to the start of the next, joining their text. */
function joinTextblocks(state: EditorState, dispatch: (tr: Transaction) => void, end: number, start: number) {
  const tr = state.tr.delete(end, start);
  if (!tr.docChanged) return false;
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(end, -1)));
  dispatch(tr.scrollIntoView());
  return true;
}

/** The selection covers the whole note (Select All), whatever it starts or ends in. */
function selectsEverything(state: EditorState) {
  const { selection, doc } = state;
  return !selection.empty && selection.from <= Selection.atStart(doc).from && selection.to >= Selection.atEnd(doc).to;
}

/**
 * Keyboard behaviour that ProseMirror's defaults get wrong for notes:
 * - Backspace at the start of a bullet or numbered item takes the bullet away (or
 *   outdents a nested item), like checklists, instead of tucking the text into the
 *   previous item as an unbulleted paragraph.
 * - Backspace at the start of a paragraph after a list, and Delete at the end of a list
 *   item, join the text instead of turning the paragraph into a new item.
 * - Backspace at the start of a heading turns it into text first.
 * - Shift+Enter in a heading starts a new block: a line break cannot be saved in one.
 * - Backspace at the start of a code block turns its lines into paragraphs rather than
 *   merging the code into the paragraph above; Tab and Shift+Tab indent code lines; and
 *   ArrowUp from a code block at the top of the note makes room above it.
 * - Backspace or Delete over Select All empties the note, even when it starts with a table.
 */
export const EditingKeys = Extension.create({
  name: 'editingKeys',
  priority: 200,

  addInputRules() {
    // Typing "- [ ] " gives a checklist item: "- " has already made a bullet by the time
    // "[ ] " is typed, so convert that fresh, single-item bullet list.
    return [new InputRule({
      find: /^\s*\[([ xX])\]\s$/,
      handler: ({ state, range, match, chain }) => {
        const $from = state.doc.resolve(range.from);
        const depth = itemDepth($from);
        if (depth < 1 || $from.node(depth).type.name !== 'listItem' || $from.index(depth) !== 0) return null;
        const list = $from.node(depth - 1);
        if (list.type.name !== 'bulletList' || list.childCount !== 1) return null;
        chain().deleteRange(range).toggleTaskList().updateAttributes('taskItem', { checked: match[1] !== ' ' }).run();
      }
    })];
  },

  addKeyboardShortcuts() {
    const clearAll = () => {
      const { state, view } = this.editor;
      if (!selectsEverything(state)) return false;
      const paragraph = state.schema.nodes.paragraph.create();
      const tr = state.tr.replaceWith(0, state.doc.content.size, paragraph);
      tr.setSelection(TextSelection.create(tr.doc, 1));
      view.dispatch(tr.scrollIntoView());
      return true;
    };

    const backspace = () => {
      if (clearAll()) return true;
      const { state, view } = this.editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const { $from } = selection;
      if ($from.parentOffset !== 0 || !$from.parent.isTextblock) return false;
      const parent = $from.parent;

      if (parent.type.name === 'codeBlock' && parent.content.size) {
        const { paragraph } = state.schema.nodes;
        const lines = parent.textContent.split('\n').map(line => paragraph.create(null, line ? state.schema.text(line) : null));
        const tr = state.tr.replaceWith($from.before(), $from.after(), lines);
        tr.setSelection(TextSelection.create(tr.doc, $from.before() + 1));
        view.dispatch(tr.scrollIntoView());
        return true;
      }

      if (parent.type.name === 'heading') return this.editor.commands.setNode('paragraph');

      if (parent.type.name !== 'paragraph') return false;
      const depth = itemDepth($from);
      if (depth > 0 && $from.node(depth).type.name === 'listItem' && $from.index(depth) === 0) {
        return this.editor.commands.liftListItem('listItem');
      }
      if (depth > 0) return false;

      // A paragraph right after a list joins the list's last line.
      const before = state.doc.resolve($from.before()).nodeBefore;
      if (!before || !LISTS.includes(before.type.name)) return false;
      const previous = Selection.findFrom(state.doc.resolve($from.before()), -1, true);
      if (!previous || !(previous instanceof TextSelection) || previous.$from.parent.type.name !== 'paragraph') return false;
      return joinTextblocks(state, view.dispatch, previous.from, $from.pos);
    };

    const forwardDelete = () => {
      if (clearAll()) return true;
      const { state, view } = this.editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const { $from } = selection;
      if (!$from.parent.isTextblock || $from.parent.type.name !== 'paragraph' || $from.parentOffset !== $from.parent.content.size) return false;
      if (itemDepth($from) < 0) return false;
      const next = Selection.findFrom(state.doc.resolve($from.after()), 1, true);
      if (!next || !(next instanceof TextSelection) || next.$from.parent.type.name !== 'paragraph') return false;
      return joinTextblocks(state, view.dispatch, $from.pos, next.from);
    };

    const indentCode = (outdent: boolean) => {
      const { state, view } = this.editor;
      const { $from, from, to } = state.selection;
      if ($from.parent.type.name !== 'codeBlock' || !state.selection.$to.sameParent($from)) return false;
      const start = $from.start();
      const text = $from.parent.textContent;
      if (!outdent && state.selection.empty) {
        view.dispatch(state.tr.insertText('  ', from, to).scrollIntoView());
        return true;
      }
      // Indent or outdent every line the selection touches.
      const tr = state.tr;
      let lineStart = text.lastIndexOf('\n', from - start - 1) + 1;
      const lineStarts: number[] = [];
      while (lineStart <= to - start) {
        lineStarts.push(lineStart);
        const nextBreak = text.indexOf('\n', lineStart);
        if (nextBreak < 0) break;
        lineStart = nextBreak + 1;
      }
      for (const offset of lineStarts.reverse()) {
        const pos = start + offset;
        if (outdent) {
          const spaces = /^ {1,2}|^\t/.exec(text.slice(offset))?.[0].length || 0;
          if (spaces) tr.delete(pos, pos + spaces);
        } else tr.insertText('  ', pos);
      }
      if (tr.docChanged) view.dispatch(tr.scrollIntoView());
      return true;
    };

    const escapeCodeAtTop = (requireLineStart: boolean) => {
      const { state, view } = this.editor;
      const { selection } = state;
      const { $from } = selection;
      if (!selection.empty || $from.parent.type.name !== 'codeBlock' || $from.depth !== 1 || $from.index(0) !== 0) return false;
      const before = $from.parent.textBetween(0, $from.parentOffset);
      if (requireLineStart ? $from.parentOffset !== 0 : before.includes('\n')) return false;
      const tr = state.tr.insert(0, state.schema.nodes.paragraph.create());
      tr.setSelection(TextSelection.create(tr.doc, 1));
      view.dispatch(tr.scrollIntoView());
      return true;
    };

    const tableLineBreak = () => {
      const { $from } = this.editor.state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        const name = $from.node(depth).type.name;
        if (name === 'tableCell' || name === 'tableHeader') return this.editor.commands.setHardBreak();
      }
      return false;
    };

    return {
      // A Markdown table cell holds one line; Enter adds a line break (saved as <br>)
      // rather than a second paragraph, which forced the whole table into HTML.
      Enter: tableLineBreak,
      Backspace: backspace,
      Delete: forwardDelete,
      Tab: () => indentCode(false),
      'Shift-Tab': () => indentCode(true),
      ArrowUp: () => escapeCodeAtTop(false),
      ArrowLeft: () => escapeCodeAtTop(true),
      'Shift-Enter': () => this.editor.isActive('heading') ? this.editor.commands.splitBlock() : false
    };
  }
});
