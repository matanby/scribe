/**
 * A key the runner sends to the real editor window.
 *
 * - A string is one key press, with modifiers as prefixes: `M-` Command, `A-` Option,
 *   `S-` Shift, `C-` Control (for example `A-Backspace`, `S-Tab`, `Enter`).
 * - `UNDO`, `REDO`, `CUT`, `COPY`, `PASTE` and `SELECT_ALL` go through the same
 *   Electron editing commands as the Edit menu.
 * - `{ type }` types text one character at a time (a newline presses Enter).
 * - `{ paste }` / `{ html }` put text or HTML on the clipboard and paste it.
 * - `{ wait }` pauses, for example to end an undo group.
 */
export type Key = string | { type: string } | { paste: string } | { html: string; text?: string } | { wait: number };

export interface Snapshot {
  /** Saved Markdown with the selection drawn in as ‸ or «…». */
  caret: string;
  /** The Markdown Scribe would save. */
  markdown: string;
  tree: string;
  dom: string;
  errors: string[];
}

export interface EditCase {
  name: string;
  /** Starting Markdown, with ‸ for the caret or «…» for a selection. */
  md: string;
  keys?: Key[];
  /** Expected saved Markdown with the caret drawn in. */
  expect?: string;
  /** Expected saved Markdown, without the caret. */
  markdown?: string;
  /** Expected structure (see harness `tree`), with the caret drawn in. */
  tree?: string;
  /** Expected structure computed from the starting structure. */
  treeFrom?: (before: string) => string;
  /** Expected structure after saving and reopening the note. */
  reloadTree?: string;
  /** Id of a known, not-yet-fixed bug. The case must fail until the bug is fixed. */
  bug?: string;
  /** Skip the check that saving and reopening the note keeps it unchanged. */
  unstableReload?: boolean;
}
