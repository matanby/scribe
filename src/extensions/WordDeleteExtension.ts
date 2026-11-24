import { Extension } from '@tiptap/core';

// Runs of whitespace, of word characters (any script, including Hebrew niqqud and
// in-word apostrophes and gershayim), or of other punctuation.
const RUNS = /\s+|[\p{L}\p{N}\p{M}_'’"״׳]+|[^\s\p{L}\p{N}\p{M}_'’"״׳]+/gu;

/**
 * Length of the word to delete at the end (backward) or start (forward) of `text`,
 * including the whitespace between it and the caret. A run of punctuation counts as a word.
 */
export function wordDeleteLength(text: string, backward: boolean): number {
  const parts = text.match(RUNS) || [];
  if (backward) parts.reverse();
  let length = 0;
  for (const part of parts) {
    length += part.length;
    if (/\S/.test(part)) break;
  }
  return length;
}

/**
 * Option+Backspace and Option+Delete delete a word inside ProseMirror. Left to the
 * browser, emptying a block (such as a checklist item whose only word is deleted)
 * rewrites the node view's DOM in a way ProseMirror reads back as a split, so the
 * word stayed and a new line appeared instead.
 */
export const WordDeleteExtension = Extension.create({
  name: 'wordDelete',
  priority: 200,

  addKeyboardShortcuts() {
    const deleteWord = (backward: boolean) => {
      const { state, view } = this.editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const { $from } = selection;
      if (!$from.parent.isTextblock) return false;
      // At a block edge, defer to the regular join behavior.
      if (backward ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size) return false;
      const from = backward ? $from.start() : $from.pos;
      const to = backward ? $from.pos : $from.end();
      // Inline nodes (images, math) read as one character, matching their document size.
      const text = state.doc.textBetween(from, to, undefined, '￼');
      if (text.length !== to - from) return false;
      const length = wordDeleteLength(text, backward);
      if (!length) return false;
      view.dispatch(backward
        ? state.tr.delete($from.pos - length, $from.pos).scrollIntoView()
        : state.tr.delete($from.pos, $from.pos + length).scrollIntoView());
      return true;
    };
    return {
      'Alt-Backspace': () => deleteWord(true),
      'Alt-Delete': () => deleteWord(false)
    };
  }
});
