import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const RTL_REGEX = /[\u0590-\u05FF\uFB1D-\uFB4F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const LTR_REGEX = /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/;

export function getDirection(text: string): 'rtl' | 'ltr' | 'auto' {
  if (!text || !text.trim()) return 'auto';
  for (const char of text) {
    if (RTL_REGEX.test(char)) return 'rtl';
    if (LTR_REGEX.test(char)) return 'ltr';
  }
  return 'auto';
}

export function getDocDirection(doc: any): 'rtl' | 'ltr' {
  const text = doc.textContent;
  if (!text || !text.trim()) return 'ltr';
  const firstDir = getDirection(text);
  if (firstDir !== 'auto') return firstDir;
  return RTL_REGEX.test(text) ? 'rtl' : 'ltr';
}

export function getListDirection(listNode: any, fallbackDir: 'rtl' | 'ltr'): 'rtl' | 'ltr' {
  let hasRtl = false;
  let hasLtr = false;

  listNode.forEach((child: any) => {
    const text = child.textContent;
    if (!text || !text.trim()) return;
    const dir = getDirection(text);
    if (dir === 'rtl') hasRtl = true;
    else if (dir === 'ltr') hasLtr = true;
  });

  if (hasRtl) return 'rtl';
  if (hasLtr) return 'ltr';

  const overallText = listNode.textContent;
  if (overallText && overallText.trim()) {
    const dir = getDirection(overallText);
    if (dir !== 'auto') return dir;
  }

  return fallbackDir;
}

export function updateDocDirection(state: any, tr: any): boolean {
  let modified = false;
  const docDir = getDocDirection(state.doc);

  state.doc.descendants((node: any, pos: number) => {
    if (!node.isBlock) return;

    if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
      const $pos = state.doc.resolve(pos);
      const prevBlock = $pos.nodeBefore;
      const fallback = (prevBlock?.attrs?.dir && prevBlock.attrs.dir !== 'auto')
        ? prevBlock.attrs.dir
        : docDir;

      const detectedDir = getListDirection(node, fallback);
      if (node.attrs.dir !== detectedDir) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          dir: detectedDir
        });
        modified = true;
      }
      return;
    }

    if (node.type.name === 'listItem') {
      const $pos = state.doc.resolve(pos);
      const parentList = $pos.parent;
      const parentDir = parentList?.attrs?.dir && parentList.attrs.dir !== 'auto'
        ? parentList.attrs.dir
        : docDir;

      if (node.attrs.dir !== parentDir) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          dir: parentDir
        });
        modified = true;
      }
      return;
    }

    if (['paragraph', 'heading', 'blockquote', 'table', 'taskItem'].includes(node.type.name)) {
      const text = node.textContent;
      if (!text || !text.trim()) {
        // If empty paragraph inside a listItem, inherit direction from the listItem
        const $pos = state.doc.resolve(pos);
        if ($pos.parent?.type.name === 'listItem') {
          const parentDir = $pos.parent.attrs?.dir || docDir;
          if (node.attrs.dir !== parentDir) {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              dir: parentDir
            });
            modified = true;
          }
        }
        return;
      }

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

  return modified;
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
          'taskList',
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
      },
      {
        types: ['listItem', 'taskItem'],
        attributes: {
          dir: {
            default: 'auto',
            rendered: true,
            renderHTML: (attributes) => {
              const dir = attributes.dir;
              if (!dir || dir === 'auto') return {};
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

  onCreate() {
    if (this.editor.isDestroyed) return;
    const { state, view } = this.editor;
    const tr = state.tr;
    if (updateDocDirection(state, tr)) {
      tr.setMeta('addToHistory', false);
      tr.setMeta('preventUpdate', true);
      tr.setMeta('bidiAutoDetect', true);
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

          const tr = newState.tr;
          if (updateDocDirection(newState, tr)) {
            tr.setMeta('addToHistory', false);
            tr.setMeta('bidiAutoDetect', true);
            return tr;
          }
          return undefined;
        }
      })
    ];
  }
});
