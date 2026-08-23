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
