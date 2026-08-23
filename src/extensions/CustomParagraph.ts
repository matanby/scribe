import Paragraph from '@tiptap/extension-paragraph';

export const CustomParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          if (node.content.size === 0) {
            // Write standard non-breaking space for intentional blank lines between sections
            state.write('&nbsp;');
          } else {
            state.renderInline(node);
          }
          state.closeBlock(node);
        },
        parse: {}
      }
    };
  }
});
