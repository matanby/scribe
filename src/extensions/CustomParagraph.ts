import Paragraph from '@tiptap/extension-paragraph';

export const CustomParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          if (node.content.size === 0) {
            state.write('<br>');
          } else {
            state.renderInline(node);
          }
          state.closeBlock(node);
        },
        parse: {
          // Handled by markdown-it with html: true
        }
      }
    };
  }
});
