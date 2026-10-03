import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SearchReplaceStorage {
  searchTerm: string;
  replaceTerm: string;
  results: { from: number; to: number }[];
  currentIndex: number;
  caseSensitive: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearchTerm: (searchTerm: string) => ReturnType;
      setReplaceTerm: (replaceTerm: string) => ReturnType;
      setCaseSensitive: (caseSensitive: boolean) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      replaceCurrent: () => ReturnType;
      replaceAll: () => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
}

export const searchPluginKey = new PluginKey('searchReplacePlugin');

const scrollToActiveMatch = () => {
  setTimeout(() => {
    const activeEl = document.querySelector('.search-result-active');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 20);
};

export const SearchReplaceExtension = Extension.create<void, SearchReplaceStorage>({
  name: 'searchReplace',

  addStorage() {
    return {
      searchTerm: '',
      replaceTerm: '',
      results: [],
      currentIndex: 0,
      caseSensitive: false,
    };
  },

  addCommands() {
    return {
      setSearchTerm:
        (searchTerm: string) =>
        ({ tr, dispatch }) => {
          const term = searchTerm || '';
          this.storage.searchTerm = term;
          this.storage.currentIndex = 0;
          if (dispatch) {
            tr.setMeta(searchPluginKey, { searchTerm: term });
            if (term.trim()) {
              scrollToActiveMatch();
            }
          }
          return true;
        },

      setReplaceTerm:
        (replaceTerm: string) =>
        () => {
          this.storage.replaceTerm = replaceTerm || '';
          return true;
        },

      setCaseSensitive:
        (caseSensitive: boolean) =>
        ({ tr, dispatch }) => {
          this.storage.caseSensitive = caseSensitive;
          this.storage.currentIndex = 0;
          if (dispatch) {
            tr.setMeta(searchPluginKey, { caseSensitive });
            const currentTerm = this.storage.searchTerm || '';
            if (currentTerm.trim()) {
              scrollToActiveMatch();
            }
          }
          return true;
        },

      findNext:
        () =>
        ({ tr, dispatch }) => {
          const { results } = this.storage;
          if (results.length === 0) return false;
          const nextIndex = (this.storage.currentIndex + 1) % results.length;
          this.storage.currentIndex = nextIndex;
          const target = results[nextIndex];
          if (target && dispatch) {
            if (target.from <= tr.doc.content.size && target.to <= tr.doc.content.size) {
              tr.setSelection(TextSelection.create(tr.doc, target.from, target.to));
              tr.setMeta(searchPluginKey, { index: nextIndex });
              scrollToActiveMatch();
            }
          }
          return true;
        },

      findPrevious:
        () =>
        ({ tr, dispatch }) => {
          const { results } = this.storage;
          if (results.length === 0) return false;
          const prevIndex = (this.storage.currentIndex - 1 + results.length) % results.length;
          this.storage.currentIndex = prevIndex;
          const target = results[prevIndex];
          if (target && dispatch) {
            if (target.from <= tr.doc.content.size && target.to <= tr.doc.content.size) {
              tr.setSelection(TextSelection.create(tr.doc, target.from, target.to));
              tr.setMeta(searchPluginKey, { index: prevIndex });
              scrollToActiveMatch();
            }
          }
          return true;
        },

      replaceCurrent:
        () =>
        ({ tr, dispatch }) => {
          const { results, currentIndex, replaceTerm } = this.storage;
          if (results.length === 0) return false;
          const current = results[currentIndex];
          if (!current) return false;

          if (dispatch && current.from < current.to && current.to <= tr.doc.content.size) {
            closeHistory(tr);
            tr.insertText(replaceTerm, current.from, current.to);
            tr.setMeta(searchPluginKey, { replacementEnd: tr.mapping.map(current.to, 1) });
            scrollToActiveMatch();
          }
          return true;
        },

      replaceAll:
        () =>
        ({ tr, dispatch }) => {
          const { results, replaceTerm } = this.storage;
          if (results.length === 0) return false;

          if (dispatch) {
            closeHistory(tr);
            // Replace backwards so document positions remain valid
            for (let i = results.length - 1; i >= 0; i--) {
              const { from, to } = results[i];
              if (from < to && to <= tr.doc.content.size) {
                tr.insertText(replaceTerm, from, to);
              }
            }
            tr.setMeta(searchPluginKey, { replaceAll: true });
          }
          return true;
        },

      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          this.storage.searchTerm = '';
          this.storage.results = [];
          this.storage.currentIndex = 0;
          if (dispatch) {
            tr.setMeta(searchPluginKey, { clear: true });
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldDecoSet, oldState, newState) {
            const rawTerm = extension.storage?.searchTerm || '';
            const caseSensitive = !!extension.storage?.caseSensitive;
            if (!rawTerm || !rawTerm.trim()) {
              if (extension.storage) extension.storage.results = [];
              return DecorationSet.empty;
            }

            const results: { from: number; to: number }[] = [];


            // Match across bold/italic/link boundaries inside each text block.
            const escaped = rawTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
            newState.doc.descendants((block, blockPos) => {
              if (!block.isTextblock) return;
              let text = '';
              const positions: number[] = [];
              block.forEach((child, offset) => {
                const value = child.isText ? child.text || '' : '\uFFFC';
                for (let index = 0; index < value.length; index++) positions.push(blockPos + 1 + offset + index);
                text += value;
              });
              pattern.lastIndex = 0;
              let match: RegExpExecArray | null;
              while ((match = pattern.exec(text))) {
                results.push({ from: positions[match.index], to: positions[match.index + match[0].length - 1] + 1 });
              }
              return false;
            });

            extension.storage.results = results;
            const replacementEnd = tr.getMeta(searchPluginKey)?.replacementEnd;
            if (typeof replacementEnd === 'number') {
              const next = results.findIndex(result => result.from >= replacementEnd);
              extension.storage.currentIndex = next < 0 ? 0 : next;
            }
            if (extension.storage.currentIndex >= results.length) {
              extension.storage.currentIndex = 0;
            }

            if (results.length === 0) {
              return DecorationSet.empty;
            }

            const decorations: Decoration[] = [];
            results.forEach((result, i) => {
              const isCurrent = i === extension.storage.currentIndex;
              decorations.push(
                Decoration.inline(result.from, result.to, {
                  class: isCurrent
                    ? 'search-result-active bg-amber-400 text-black font-semibold'
                    : 'search-result-match bg-yellow-200/80 dark:bg-yellow-500/40',
                })
              );
            });

            return DecorationSet.create(newState.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return searchPluginKey.getState(state) || DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
