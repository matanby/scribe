import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const RTL_REGEX = /[\u0590-\u05FF\uFB1D-\uFB4F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_REGEX = /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/;

export function getDirection(text: string): 'rtl' | 'ltr' | 'auto' {
  if (!text || !text.trim()) return 'auto';
  for (const char of text) {
    if (RTL_REGEX.test(char)) return 'rtl';
    if (LTR_REGEX.test(char)) return 'ltr';
  }
  return 'auto';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bidi: {
      setTextDirection: (dir: 'rtl' | 'ltr' | 'auto') => ReturnType;
    };
  }
}

export const BiDiExtension = Extension.create({
  name: 'bidi',

  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'listItem',
          'taskList',
          'taskItem',
          'blockquote',
          'table'
        ],
        attributes: {
          dir: {
            default: 'auto',
            rendered: true,
            renderHTML: (attributes) => {
              const dir = attributes.dir || 'auto';
              return {
                dir,
                'data-dir': dir
              };
            },
            parseHTML: (element) => element.getAttribute('dir') || 'auto'
          }
        }
      }
    ];
  },

  addCommands() {
    return {
      setTextDirection:
        (dir: 'rtl' | 'ltr' | 'auto') =>
        ({ state, tr, dispatch }: any) => {
          const { from, to } = state.selection;
          let modified = false;

          state.doc.nodesBetween(from, to, (node: any, pos: number) => {
            if (node.isBlock && node.type.spec.attrs?.dir) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, dir });
              modified = true;
            }
          });

          if (modified && dispatch) dispatch(tr);
          return modified;
        }
    };
  },

  // The previous onCreate pass walked the whole document on open to stamp `dir` on every
  // block. It was safe (its transaction set `preventUpdate`, which TipTap honours, so it
  // never triggered a save) but redundant: `dir` defaults to "auto", which the browser
  // already resolves per block from the first strong character. The plugin below refines
  // it as the user types, so the extra pass bought nothing.

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('bidiAutoDetect'),
        appendTransaction: (transactions, oldState, newState) => {
          const docChanged = transactions.some((tr) => tr.docChanged);
          if (!docChanged) return;

          let tr = newState.tr;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (
              node.isBlock &&
              ['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'orderedList', 'bulletList', 'taskList'].includes(node.type.name)
            ) {
              const text = node.textContent;
              if (!text || !text.trim()) return;

              const detectedDir = getDirection(text);
              const currentDir = node.attrs.dir || 'auto';

              if (detectedDir !== 'auto' && currentDir !== detectedDir) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  dir: detectedDir
                });
                modified = true;
              }
            }
          });

          if (!modified) return undefined;

          // Direction is derived presentation, not user intent: it must not create its
          // own undo step, and the autosave layer keys off this meta to ignore it.
          tr.setMeta('addToHistory', false);
          tr.setMeta('bidiAutoDetect', true);
          return tr;
        }
      })
    ];
  }
});
