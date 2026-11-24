import React, { useEffect, useRef, useState } from 'react';
import Image from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { escapeHTML } from './Attachment';
import { showMessage } from '../utils/dialogs';

const ImageView: React.FC<NodeViewProps> = ({ node, selected, updateAttributes, editor }) => {
  const image = useRef<HTMLImageElement>(null);
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const open = () => {
    if (!node.attrs.src.startsWith('scribe-asset:')) return;
    window.scribeAPI.openAttachment(node.attrs.src).catch(error => void showMessage('Could not open image', error.message, 'error'));
  };
  const resize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation();
    if (!image.current || !editor.isEditable) return;
    const start = event.clientX, width = image.current.getBoundingClientRect().width;
    const maximum = editor.view.dom.clientWidth - 64;
    const direction = getComputedStyle(image.current).direction === 'rtl' ? -1 : 1;
    let next = width;
    const move = (e: PointerEvent) => { next = Math.max(80, Math.min(maximum, width + direction * (e.clientX - start))); setDraftWidth(next); };
    const release = () => {
      stop();
      if (!editor.isDestroyed) updateAttributes({ width: Math.round(next) });
      setDraftWidth(null);
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); cleanup.current = null; };
    cleanup.current?.(); cleanup.current = stop;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
  };
  return <NodeViewWrapper as="span" className={`note-image ${selected ? 'is-selected' : ''}`} contentEditable={false}>
    <img ref={image} src={node.attrs.src} alt={node.attrs.alt || ''} title={node.attrs.title || 'Double-click to open image'}
      style={{ width: draftWidth || node.attrs.width || undefined }} onDoubleClick={open} />
    {selected && <span className="no-print image-controls">
      <button type="button" onClick={open} disabled={!node.attrs.src.startsWith('scribe-asset:')}>Open</button>
      <button type="button" onClick={() => updateAttributes({ width: null })}>Original size</button>
    </span>}
    {selected && <button type="button" className="no-print image-resize" aria-label="Resize image" title="Drag to resize; arrow keys adjust size"
      onPointerDown={resize} onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); event.stopPropagation();
          const width = image.current?.getBoundingClientRect().width || 200;
          updateAttributes({ width: Math.round(Math.max(80, Math.min(editor.view.dom.clientWidth - 64, width + (event.key === 'ArrowRight' ? 20 : -20)))) });
        }
      }} />}
  </NodeViewWrapper>;
};

export const ResizableImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), width: {
      default: null,
      parseHTML: element => { const width = Number(element.getAttribute('width')); return Number.isFinite(width) && width > 0 ? width : null; },
      renderHTML: attrs => attrs.width ? { width: attrs.width } : {}
    } };
  },
  addNodeView() { return ReactNodeViewRenderer(ImageView); },
  addStorage() {
    return { markdown: {
      serialize(state: any, node: any) {
        const { src, alt, title, width } = node.attrs;
        // Markdown can't hold a width, so only resized images need HTML.
        if (width) {
          state.write(`<img src="${escapeHTML(src)}" alt="${escapeHTML(alt || '')}"${title ? ` title="${escapeHTML(title)}"` : ''} width="${width}">`);
          return;
        }
        const destination = /[\s()<>]/.test(src || '') ? `<${String(src).replace(/[<>]/g, character => encodeURIComponent(character))}>` : src;
        const label = String(alt || '').replace(/[\\[\]]/g, '\\$&');
        state.write(`![${label}](${destination}${title ? ` "${String(title).replace(/"/g, '\\"')}"` : ''})`);
      }, parse: {}
    } };
  }
});
