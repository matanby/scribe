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
      toggleTextDirection: () => ReturnType;
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

  onCreate() {
    // Initial pass to set dir on all initial nodes right on load
    const { state, view } = this.editor;
    const tr = state.tr;
    let modified = false;

    state.doc.descendants((node, pos) => {
      if (
        node.isBlock &&
        ['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote'].includes(node.type.name)
      ) {
        const text = node.textContent;
        if (!text || !text.trim()) return;

        const detectedDir = getDirection(text);
        if (detectedDir !== 'auto' && node.attrs.dir !== detectedDir) {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            dir: detectedDir
          });
          modified = true;
        }
      }
    });

    if (modified) {
      tr.setMeta('addToHistory', false);
      tr.setMeta('preventUpdate', true);
      view.dispatch(tr);
    }
  },

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
              ['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote'].includes(node.type.name)
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

          return modified ? tr : undefined;
        }
      })
    ];
  }
});
