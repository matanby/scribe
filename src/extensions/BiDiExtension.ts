import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { getDirection, RTL_REGEX } from '../utils/textDirection';
export { getDirection, RTL_REGEX, LTR_REGEX } from '../utils/textDirection';

export type TextDirection = 'rtl' | 'ltr' | 'auto';
const directionTypes = ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote', 'table'];

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

    // Explicit choices (including those on an enclosing item) beat detection.
    let override = node.attrs.directionOverride;
    const $node = state.doc.resolve(pos);
    for (let depth = $node.depth; !override && depth > 0; depth--) {
      override = $node.node(depth).attrs.directionOverride;
    }
    if (override === 'rtl' || override === 'ltr') {
      if (node.type.spec.attrs?.dir && node.attrs.dir !== override) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, dir: override });
        modified = true;
      }
      return;
    }

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
      setTextDirection: (dir: TextDirection) => ReturnType;
    };
  }
}

export const BiDiExtension = Extension.create({
  name: 'bidi',

  addGlobalAttributes() {
    return [
      {
        types: directionTypes,
        attributes: {
          directionOverride: {
            default: null,
            keepOnSplit: true,
            parseHTML: element => {
              const value = element.getAttribute('data-direction-override')
                || (!element.hasAttribute('data-dir') ? element.getAttribute('dir') : null);
              return value === 'rtl' || value === 'ltr' ? value : null;
            },
            renderHTML: attributes => attributes.directionOverride
              ? { 'data-direction-override': attributes.directionOverride } : {}
          }
        }
      },
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
        (dir: TextDirection) =>
        ({ state, tr }: any) => {
          const { from, to } = state.selection;
          const targets = new Set<number>();
          // Only affect selected text blocks and their nearest list items, never
          // an entire ancestor list merely because the caret is inside it.
          state.doc.nodesBetween(from, to, (node: any, pos: number) => {
            if (!['paragraph', 'heading'].includes(node.type.name)) return;
            if (from !== to && (pos + 1 >= to || pos + node.nodeSize <= from)) return;
            targets.add(pos);
            const $pos = state.doc.resolve(pos);
            for (let depth = $pos.depth; depth > 0; depth--) {
              if (['listItem', 'taskItem'].includes($pos.node(depth).type.name)) {
                targets.add($pos.before(depth));
                break;
              }
            }
          });
          let modified = false;
          for (const pos of targets) {
            const node = tr.doc.nodeAt(pos);
            const directionOverride = dir === 'auto' ? null : dir;
            if (node.attrs.directionOverride === directionOverride) continue;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, directionOverride, dir });
            modified = true;
          }
          // TipTap dispatches the command transaction, including chained commands.

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
