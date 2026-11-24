/**
 * Injected into the real Scribe window by electron/editing.test.ts. It loads a case's
 * Markdown into the live editor, places the caret, and reports what the editor holds
 * after the runner has sent real keyboard events.
 *
 * Markers in a case's Markdown: ‸ is the caret, « and » bound a selection.
 */
const CARET = '‸', OPEN = '«', CLOSE = '»';

const editor = (): any => (document.querySelector('.ProseMirror') as any)?.editor;

const errors: string[] = [];
window.addEventListener('error', event => errors.push(`error: ${event.message}`));
window.addEventListener('unhandledrejection', event => errors.push(`rejection: ${String(event.reason)}`));
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ').slice(0, 300)); consoleError(...args); };

/** The document with the selection drawn in, inserted as unmarked text so links and code don't absorb it. */
function markedDoc() {
  const { state } = editor();
  const { selection, schema } = state;
  const tr = state.tr;
  try {
    if (selection.empty) tr.insert(selection.from, schema.text(CARET));
    else { tr.insert(selection.to, schema.text(CLOSE)); tr.insert(selection.from, schema.text(OPEN)); }
    return tr.doc;
  } catch {
    return state.doc;
  }
}

/** A compact structural rendering: node types, heading levels, task state, code language, marks. */
function tree(doc: any): string {
  const render = (node: any): string => {
    if (node.isText) {
      const marks = node.marks.map((mark: any) => mark.type.name + (mark.attrs.href ? `=${mark.attrs.href}` : '')).join(',');
      return JSON.stringify(node.text) + (marks ? `{${marks}}` : '');
    }
    let name = node.type.name;
    if (name === 'heading') name += node.attrs.level;
    if (name === 'taskItem') name += node.attrs.checked ? '[x]' : '[ ]';
    if (name === 'codeBlock' && node.attrs.language) name += `:${node.attrs.language}`;
    if (name === 'blockquote' && node.attrs.calloutType && node.attrs.calloutType !== 'quote') name += `:${node.attrs.calloutType}`;
    const children: string[] = [];
    node.forEach((child: any) => children.push(render(child)));
    return name + (children.length ? `(${children.join(' ')})` : node.isLeaf ? '' : '()');
  };
  return render(doc);
}

/** Compares the text ProseMirror rendered with the document, ignoring node-view chrome and whitespace. */
function domMismatch(): string {
  const { view, state } = editor();
  let rendered = '';
  const walker = document.createTreeWalker(view.dom, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // Count text owned by a text view, or inside a node view's editable content;
    // skip node-view chrome such as a code block's language label.
    let owner: any = node;
    while (owner && owner !== view.dom && !owner.pmViewDesc) owner = owner.parentNode;
    const desc = owner?.pmViewDesc;
    if (desc && (desc.node?.isText || desc.contentDOM?.contains(node))) rendered += node.nodeValue;
  }
  const strip = (text: string) => text.replace(/[\s​﻿]/g, '');
  const expected = state.doc.textBetween(0, state.doc.content.size, '', '');
  return strip(rendered) === strip(expected) ? '' : `DOM shows ${JSON.stringify(strip(rendered))} but the document holds ${JSON.stringify(strip(expected))}`;
}

const harness = {
  ready: () => !!editor()?.view,

  setup(markdown: string) {
    const ed = editor();
    ed.commands.setContent(markdown, true);
    let caret = -1, open = -1, close = -1;
    ed.state.doc.descendants((node: any, pos: number) => {
      if (!node.isText) return;
      for (let index = 0; index < node.text.length; index++) {
        const char = node.text[index];
        if (char === CARET) caret = pos + index;
        else if (char === OPEN) open = pos + index;
        else if (char === CLOSE) close = pos + index;
      }
    });
    const tr = ed.state.tr;
    let from: number, to: number;
    if (caret >= 0) { tr.delete(caret, caret + 1); from = to = caret; }
    else if (open >= 0 && close > open) { tr.delete(close, close + 1); tr.delete(open, open + 1); from = open; to = close - 1; }
    else { from = to = -1; }
    ed.view.dispatch(tr);
    if (from < 0) ed.commands.focus('end');
    else ed.commands.setTextSelection({ from, to });
    // A fresh state, so undo history and input-rule memory start clean for every case.
    const state = ed.state;
    ed.view.updateState(state.constructor.create({ doc: state.doc, selection: state.selection, plugins: state.plugins }));
    ed.view.focus();
    errors.length = 0;
    return tree(markedDoc());
  },

  snapshot() {
    const ed = editor();
    const marked = markedDoc();
    let caret = '', markdown = '';
    try { caret = ed.storage.markdown.serializer.serialize(marked); } catch (error: any) { caret = `serialize failed: ${error.message}`; }
    try { markdown = ed.storage.markdown.getMarkdown(); } catch (error: any) { markdown = `serialize failed: ${error.message}`; }
    return { caret, markdown, tree: tree(marked), dom: domMismatch(), errors: [...errors] };
  },

  /** Saves and reopens the current note: what a later session would see. */
  reload() {
    const ed = editor();
    const saved = ed.storage.markdown.getMarkdown();
    ed.commands.setContent(saved, false);
    return { markdown: ed.storage.markdown.getMarkdown(), tree: tree(ed.state.doc) };
  }
};

(window as any).__editingHarness = harness;
