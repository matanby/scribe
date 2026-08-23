import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
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
          this.storage.searchTerm = searchTerm;
          this.storage.currentIndex = 0;
          if (dispatch) {
            tr.setMeta(searchPluginKey, { searchTerm });
            if (searchTerm.trim()) {
              scrollToActiveMatch();
            }
          }
          return true;
        },

      setReplaceTerm:
        (replaceTerm: string) =>
        () => {
          this.storage.replaceTerm = replaceTerm;
          return true;
        },

      setCaseSensitive:
        (caseSensitive: boolean) =>
        ({ tr, dispatch }) => {
          this.storage.caseSensitive = caseSensitive;
          this.storage.currentIndex = 0;
          if (dispatch) {
            tr.setMeta(searchPluginKey, { caseSensitive });
            if (this.storage.searchTerm.trim()) {
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
            tr.insertText(replaceTerm, current.from, current.to);
            tr.setMeta(searchPluginKey, { replace: true });
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
            const { searchTerm, caseSensitive } = extension.storage;
            if (!searchTerm || !searchTerm.trim()) {
              extension.storage.results = [];
              return DecorationSet.empty;
            }

            const results: { from: number; to: number }[] = [];
            const term = caseSensitive ? searchTerm : searchTerm.toLowerCase();

            newState.doc.descendants((node, pos) => {
              if (node.isText && node.text) {
                const text = caseSensitive ? node.text : node.text.toLowerCase();
                let index = text.indexOf(term);
                while (index !== -1) {
                  const from = pos + index;
                  const to = from + term.length;
                  if (from < to && to <= newState.doc.content.size) {
                    results.push({ from, to });
                  }
                  index = text.indexOf(term, index + term.length);
                }
              }
            });

            extension.storage.results = results;
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
