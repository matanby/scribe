import { DOMSerializer, Fragment } from '@tiptap/pm/model';
import { Markdown } from 'tiptap-markdown';

/** Keep regular Markdown, using standard HTML only where direction needs saving. */
export const DirectionMarkdown = Markdown.extend({
  onBeforeCreate() {
    this.parent?.();
    const serializer = this.editor.storage.markdown.serializer;
    const original = serializer.serializeNode.bind(serializer);
    serializer.serializeNode = (extension: any) => {
      const serialize = original(extension);
      if (!serialize) return serialize;
      return (state: any, node: any, parent: any, index: number) => {
        let manual = !!node.attrs.directionOverride;
        if (node.isBlock) node.descendants((child: any) => {
          if (child.attrs.directionOverride) manual = true;
        });
        if (!node.isBlock || !manual) return serialize(state, node, parent, index);

        // Serialize the containing list as HTML too, so nested items and checkbox
        // state remain valid rather than mixing HTML list items into Markdown lists.
        const container = document.createElement('div');
        container.appendChild(DOMSerializer.fromSchema(node.type.schema).serializeFragment(Fragment.from(node)));
        container.querySelectorAll('[dir], [data-dir], [data-direction-override]').forEach(element => {
          const override = element.getAttribute('data-direction-override');
          element.removeAttribute('dir');
          element.removeAttribute('data-dir');
          element.removeAttribute('data-direction-override');
          if (override) element.setAttribute('dir', override);
        });
        state.write(container.innerHTML);
        state.closeBlock(node);
      };
    };
  }
});
