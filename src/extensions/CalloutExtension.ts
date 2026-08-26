import { Extension } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';

export type CalloutType = 'note' | 'tip' | 'info' | 'warning' | 'caution' | 'quote';

export interface CalloutOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (type?: CalloutType) => ReturnType;
      toggleCallout: (type?: CalloutType) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

export const CalloutExtension = Blockquote.extend({
  name: 'blockquote',

  addAttributes() {
    return {
      ...this.parent?.(),
      calloutType: {
        default: 'quote',
        parseHTML: element => {
          const type = element.getAttribute('data-callout');
          if (type) return type;
          const className = element.className || '';
          const match = className.match(/callout-([a-z]+)/);
          return match ? match[1] : 'quote';
        },
        renderHTML: attributes => {
          const type = attributes.calloutType || 'quote';
          return {
            'data-callout': type,
            class: `callout callout-${type}`
          };
        }
      }
    };
  },

  /**
   * Without this, a callout serialized as a plain `> ` blockquote and came back as a
   * generic quote, so the type was lost every time the note was saved. We use the
   * widely supported `> [!type]` marker so the files stay portable.
   */
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(state: any, node: any) {
          const type = node.attrs.calloutType || 'quote';
          // `firstDelim` lets the marker occupy the first line while the rest of the
          // block is quoted normally, producing:  > [!warning]\n> body
          const firstDelim = type === 'quote' ? null : `> [!${type}]\n> `;
          state.wrapBlock('> ', firstDelim, node, () => state.renderContent(node));
        },
        parse: {
          updateDOM(element: HTMLElement) {
            element.querySelectorAll('blockquote').forEach((quote) => {
              // Walk to the first text node rather than rewriting textContent, so inline
              // markup on the callout's opening line survives the round-trip.
              const walker = document.createTreeWalker(quote, NodeFilter.SHOW_TEXT);
              const firstText = walker.nextNode();
              if (!firstText) return;

              const value = firstText.nodeValue || '';
              const match = value.match(/^[ \t]*\[!([a-zA-Z]+)\][ \t]*\r?\n?/);
              if (!match) return;

              quote.setAttribute('data-callout', match[1].toLowerCase());
              firstText.nodeValue = value.slice(match[0].length);
            });
          }
        }
      }
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setCallout: (type: CalloutType = 'note') => ({ commands }) => {
        return commands.wrapIn(this.name, { calloutType: type });
      },
      toggleCallout: (type: CalloutType = 'note') => ({ commands, state }) => {
        const { selection } = state;
        const isActive = this.editor.isActive(this.name, { calloutType: type });
        if (isActive) {
          return commands.lift(this.name);
        }
        if (this.editor.isActive(this.name)) {
          return commands.updateAttributes(this.name, { calloutType: type });
        }
        return commands.wrapIn(this.name, { calloutType: type });
      },
      unsetCallout: () => ({ commands }) => {
        return commands.lift(this.name);
      }
    };
  }
});
