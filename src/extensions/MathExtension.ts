import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import katex from 'katex';

export const mathPluginKey = new PluginKey('liveMathPlugin');

function createMathWidget(
  latex: string, 
  isBlock: boolean, 
  from: number, 
  to: number, 
  view: any
): HTMLElement {
  const dom = document.createElement(isBlock ? 'div' : 'span');
  dom.className = isBlock
    ? 'math-block my-3 p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-[var(--border-color)] text-center overflow-x-auto cursor-pointer hover:border-[var(--accent-color)] transition-colors select-none group relative'
    : 'math-inline cursor-pointer select-none px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors inline-flex items-center align-middle mx-0.5';
  
  dom.setAttribute('contenteditable', 'false');
  dom.title = 'Click or double-click to edit formula';

  try {
    const raw = (latex || '').trim();
    dom.innerHTML = katex.renderToString(raw || '\\dots', {
      throwOnError: false,
      displayMode: isBlock
    });
  } catch {
    dom.textContent = isBlock ? `$$\n${latex || ''}\n$$` : `$${latex || ''}$`;
  }

  if (isBlock) {
    const badge = document.createElement('span');
    badge.className = 'absolute top-1.5 right-2 text-[9px] font-mono opacity-0 group-hover:opacity-60 transition-opacity bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded text-[var(--text-secondary)] pointer-events-none';
    badge.textContent = 'LaTeX';
    dom.appendChild(badge);
  }

  // Click or double click to unrender and place cursor right inside for live inline editing
  const handleActivate = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Position cursor inside the formula (just after opening $ or $$)
    const targetPos = isBlock ? Math.min(from + 2, to) : Math.min(from + 1, to);
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, targetPos));
    view.dispatch(tr);
    view.focus();
  };

  dom.addEventListener('click', handleActivate);
  dom.addEventListener('dblclick', handleActivate);

  return dom;
}

export const MathExtension = Extension.create({
  name: 'mathExtension',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: mathPluginKey,
        state: {
          init(_, state) {
            return buildMathDecorations(state);
          },
          apply(tr, oldDeco, oldState, newState) {
            if (tr.docChanged || tr.selectionSet) {
              return buildMathDecorations(newState);
            }
            return oldDeco.map(tr.mapping, tr.doc);
          }
        },
        props: {
          decorations(state) {
            return this.getState(state);
          }
        }
      })
    ];
  }
});

function buildMathDecorations(state: any): DecorationSet {
  const { doc, selection } = state;
  const decorations: Decoration[] = [];
  const selFrom = selection.from;
  const selTo = selection.to;

  // Find all matches in text nodes
  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text) {
      const text = node.text;

      // Ranges already claimed by block math, so the inline pass below doesn't also
      // match a `$...$` pair *inside* a `$$...$$` formula and render it twice.
      const blockRanges: Array<[number, number]> = [];

      // 1. Block math: $$formula$$
      const blockInlineRegex = /\$\$([\s\S]+?)\$\$/g;
      let match: RegExpExecArray | null;

      while ((match = blockInlineRegex.exec(text)) !== null) {
        blockRanges.push([match.index, match.index + match[0].length]);
        const formula = (match[1] || '').trim();
        const matchFrom = pos + match.index;
        const matchTo = matchFrom + match[0].length;

        const isCursorInside = selTo >= matchFrom && selFrom <= matchTo;

        if (!isCursorInside && formula) {
          // Hide raw text
          decorations.push(
            Decoration.inline(matchFrom, matchTo, {
              class: 'math-hidden-source'
            })
          );
          // Render widget
          decorations.push(
            Decoration.widget(matchFrom, (view: any) => createMathWidget(formula, true, matchFrom, matchTo, view), {
              side: 0,
              stopEvent: () => false
            })
          );
        } else if (isCursorInside) {
          decorations.push(
            Decoration.inline(matchFrom, matchTo, {
              class: 'math-editing-block font-mono bg-[var(--accent-light)] text-[var(--accent-color)] rounded px-1.5 py-0.5 border border-[var(--accent-border)]'
            })
          );
        }
      }

      // 2. Inline math: $formula$ (ignoring escaped \$ and not matching $$)
      const inlineRegex = /(?<![\$\\\])\$([^\$\n]+?)(?<!\\)\$/g;

      while ((match = inlineRegex.exec(text)) !== null) {
        const localFrom = match.index;
        const localTo = localFrom + match[0].length;
        if (blockRanges.some(([bFrom, bTo]) => localFrom >= bFrom && localTo <= bTo)) {
          continue;
        }

        const formula = (match[1] || '').trim();
        const matchFrom = pos + localFrom;
        const matchTo = matchFrom + match[0].length;

        // Check if cursor/selection intersects or touches the math expression
        // When cursor is inside [matchFrom, matchTo], do not decorate -> exposes raw $formula$ text!
        const isCursorInside = selTo >= matchFrom && selFrom <= matchTo;

        if (!isCursorInside && formula) {
          // Hide raw text
          decorations.push(
            Decoration.inline(matchFrom, matchTo, {
              class: 'math-hidden-source'
            })
          );
          // Render widget
          decorations.push(
            Decoration.widget(matchFrom, (view: any) => createMathWidget(formula, false, matchFrom, matchTo, view), {
              side: 0,
              stopEvent: () => false
            })
          );
        } else if (isCursorInside) {
          // Highlight syntax subtly while editing
          decorations.push(
            Decoration.inline(matchFrom, matchTo, {
              class: 'math-editing-inline font-mono bg-[var(--accent-light)] text-[var(--accent-color)] rounded px-1 border border-[var(--accent-border)]'
            })
          );
        }
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}
