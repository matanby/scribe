import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/** Only adjust the note pane, and only when an active caret reaches its edges. */
export function keepCaretComfortable(view: EditorView) {
  if (!view.hasFocus() || !view.state.selection.empty || !(view.state.selection instanceof TextSelection)) return false;
  const scroller = view.dom.closest<HTMLElement>('.note-scroller');
  if (!scroller || !scroller.clientHeight) return false;
  const bounds = scroller.getBoundingClientRect();
  const caret = view.coordsAtPos(view.state.selection.head);
  const margin = Math.min(72, scroller.clientHeight / 4);
  const top = bounds.top + margin, bottom = bounds.bottom - margin;
  if (caret.top < top) scroller.scrollTop += caret.top - top;
  else if (caret.bottom > bottom) scroller.scrollTop += caret.bottom - bottom;
  // ProseMirror still handles horizontal scrolling, e.g. within wide code blocks.
  return false;
}
