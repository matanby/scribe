import { Node, mergeAttributes } from '@tiptap/core';

export const escapeHTML = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain HTML links keep files usable in Markdown editors outside Scribe. */
export const Attachment = Node.create({
  name: 'attachment', group: 'block', atom: true, draggable: true,
  addAttributes() {
    return {
      href: { default: '', parseHTML: element => element.getAttribute('href') },
      name: { default: 'Attachment', parseHTML: element => element.textContent || 'Attachment', renderHTML: () => ({}) },
      size: { default: 0, parseHTML: element => Number(element.getAttribute('data-size')) || 0, renderHTML: attrs => ({ 'data-size': attrs.size }) }
    };
  },
  parseHTML() { return [{ tag: 'a[data-type="attachment"]', priority: 100 }]; },
  renderHTML({ node, HTMLAttributes }) {
    const bytes = Number(node.attrs.size) || 0;
    const size = bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} bytes`;
    return ['a', mergeAttributes(HTMLAttributes, { 'data-type': 'attachment', class: 'note-attachment', title: `Open ${node.attrs.name} · ${size}` }), node.attrs.name];
  },
  addStorage() {
    return { markdown: {
      serialize(state: any, node: any) {
        state.write(`<a data-type="attachment" href="${escapeHTML(node.attrs.href)}" data-size="${node.attrs.size}">${escapeHTML(node.attrs.name)}</a>`);
        state.closeBlock(node);
      }, parse: {}
    } };
  }
});
