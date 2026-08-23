import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
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
        ({ editor, tr, dispatch }) => {
          this.storage.searchTerm = searchTerm;
          this.storage.currentIndex = 0;
          if (dispatch) {
            tr.setMeta(searchPluginKey, { update: true });
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
            tr.setMeta(searchPluginKey, { update: true });
          }
          return true;
        },

      findNext:
        () =>
        ({ editor, tr, dispatch }) => {
          const count = this.storage.results.length;
          if (count === 0) return false;
          this.storage.currentIndex = (this.storage.currentIndex + 1) % count;
          const current = this.storage.results[this.storage.currentIndex];
          if (current) {
            editor.commands.setTextSelection({ from: current.from, to: current.to });
            editor.commands.scrollIntoView();
          }
          if (dispatch) {
            tr.setMeta(searchPluginKey, { update: true });
          }
          return true;
        },

      findPrevious:
        () =>
        ({ editor, tr, dispatch }) => {
          const count = this.storage.results.length;
          if (count === 0) return false;
          this.storage.currentIndex = (this.storage.currentIndex - 1 + count) % count;
          const current = this.storage.results[this.storage.currentIndex];
          if (current) {
            editor.commands.setTextSelection({ from: current.from, to: current.to });
            editor.commands.scrollIntoView();
          }
          if (dispatch) {
            tr.setMeta(searchPluginKey, { update: true });
          }
          return true;
        },

      replaceCurrent:
        () =>
        ({ editor }) => {
          const { results, currentIndex, replaceTerm } = this.storage;
          if (results.length === 0) return false;
          const current = results[currentIndex];
          if (!current) return false;

          editor
            .chain()
            .focus()
            .insertContentAt({ from: current.from, to: current.to }, replaceTerm)
            .run();

          setTimeout(() => {
            editor.commands.findNext();
          }, 20);

          return true;
        },

      replaceAll:
        () =>
        ({ editor, state }) => {
          const { results, replaceTerm } = this.storage;
          if (results.length === 0) return false;

          let tr = state.tr;
          // Replace backwards so positions remain valid
          for (let i = results.length - 1; i >= 0; i--) {
            const { from, to } = results[i];
            if (from < to && to <= state.doc.content.size) {
              tr = tr.replaceWith(from, to, state.schema.text(replaceTerm));
            }
          }
          editor.view.dispatch(tr);
          return true;
        },

      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          this.storage.searchTerm = '';
          this.storage.results = [];
          this.storage.currentIndex = 0;
          if (dispatch) {
            tr.setMeta(searchPluginKey, { update: true });
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
          apply(tr, oldSet, oldState, newState) {
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

            const decorations: Decoration[] = [];
            results.forEach((result, i) => {
              const isCurrent = i === extension.storage.currentIndex;
              decorations.push(
                Decoration.inline(result.from, result.to, {
                  class: isCurrent
                    ? 'search-result-active bg-amber-400 text-black rounded-xs shadow-xs font-semibold'
                    : 'search-result-match bg-yellow-200/80 dark:bg-yellow-500/40 rounded-xs',
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
