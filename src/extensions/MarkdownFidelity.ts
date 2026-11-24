import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Keeps notes written in other apps intact when Scribe saves them, and makes pasted
 * Markdown behave like Markdown. Parsing hooks live in this extension's markdown
 * storage; serialisation hooks are installed by DirectionMarkdown via patchSerializer.
 */

// ---------------------------------------------------------------------------
// Escaping text

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD = /[\p{L}\p{N}]/u;
const ENTITY = /^&(#\d+|#x[\da-f]+|[a-z][a-z\d]*);/i;

/** Brackets that would form a link, image or reference definition if left alone. */
function bracketsToEscape(text: string, startOfLine: boolean) {
  const escape = new Set<number>();
  for (let open = text.indexOf('['); open >= 0; open = text.indexOf('[', open + 1)) {
    const close = text.indexOf(']', open + 1);
    if (close < 0) break;
    const follow = text[close + 1];
    const definition = follow === ':' && startOfLine && open === 0 && /^:\s*\S+\s*(["'(].*)?$/.test(text.slice(close + 1));
    if (follow === '(' || follow === '[' || definition) { escape.add(open); escape.add(close); }
  }
  return escape;
}

/**
 * Escapes only what would otherwise change meaning, so text such as `5 * 3`, `a < b`,
 * `[[Wiki Links]]` and footnotes `[^1]` is saved as written rather than as `5 \* 3`,
 * `a &lt; b` or `\[\[Wiki Links\]\]`.
 */
export function escapeMarkdownText(text: string, { startOfLine = false, inTable = false } = {}) {
  const brackets = bracketsToEscape(text, startOfLine);
  const space = (char: string | undefined) => char !== undefined && /\s/.test(char);
  let out = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index], previous = text[index - 1], next = text[index + 1];
    switch (char) {
      case '\\': out += next === undefined || ASCII_PUNCTUATION.test(next) ? '\\\\' : '\\'; break;
      case '`': out += '\\`'; break;
      case '~': out += '\\~'; break;
      case '*': case '_':
        // A run with whitespace on both sides cannot open or close emphasis, and an
        // underscore inside a word never does.
        if (space(previous) && space(next)) out += char;
        else if (char === '_' && previous && next && WORD.test(previous) && WORD.test(next)) out += char;
        else out += '\\' + char;
        break;
      case '=': {
        if (previous !== '=' && next !== '=') { out += char; break; }
        let start = index, end = index;
        while (text[start - 1] === '=') start--;
        while (text[end + 1] === '=') end++;
        out += space(text[start - 1]) && space(text[end + 1]) ? char : '\\=';
        break;
      }
      case '[': case ']': out += brackets.has(index) ? '\\' + char : char; break;
      case '<': out += next !== undefined && /[A-Za-z/!?]/.test(next) ? '\\<' : '<'; break;
      case '&': out += ENTITY.test(text.slice(index)) ? '&amp;' : '&'; break;
      case '|': out += inTable ? '\\|' : '|'; break;
      default: out += char;
    }
  }
  if (startOfLine) {
    out = out
      .replace(/^(\s*)([-+*])(?=\s|$)/, '$1\\$2')
      .replace(/^(\s*)>/, '$1\\>')
      .replace(/^(\s*)(#{1,6})(?=\s|$)/, '$1\\$2')
      .replace(/^(\s*\d+)([.)])(?=\s|$)/, '$1\\$2');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Raw HTML the editor has no node for (comments, <details>, <kbd>, …) is kept verbatim.

const KNOWN_BLOCK_HTML = /^<\/?(p|h[1-6]|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|colgroup|col|blockquote|pre|hr|img|br)(\s|>|\/)/i;
// <input> is the checkbox markdown-it-task-lists emits for checklist items.
const KNOWN_INLINE_HTML = /^<\/?(u|br|mark|img|a|strong|b|em|i|s|del|strike|code|input)(\s|>|\/)/i;

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const RawHtmlBlock = Node.create({
  name: 'rawHtmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { html: { default: '', parseHTML: element => element.getAttribute('data-raw-html') || '', renderHTML: () => ({}) } };
  },
  parseHTML() { return [{ tag: 'div[data-raw-html]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-raw-html': node.attrs.html, class: 'raw-html-block', contenteditable: 'false', dir: 'ltr' }), node.attrs.html];
  },
  addStorage() {
    return { markdown: { serialize(state: any, node: PMNode) { state.write(node.attrs.html); state.closeBlock(node); }, parse: {} } };
  }
});

export const RawHtmlInline = Node.create({
  name: 'rawHtmlInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { html: { default: '', parseHTML: element => element.getAttribute('data-raw-inline') || '', renderHTML: () => ({}) } };
  },
  parseHTML() { return [{ tag: 'span[data-raw-inline]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-raw-inline': node.attrs.html, class: 'raw-html-inline', contenteditable: 'false', dir: 'ltr' }), node.attrs.html];
  },
  addStorage() {
    return { markdown: { serialize(state: any, node: PMNode) { state.write(node.attrs.html); }, parse: {} } };
  }
});

// ---------------------------------------------------------------------------
// Parsing

function setupMarkdownIt(markdownit: any) {
  const rules = markdownit.renderer.rules;
  rules.html_block = (tokens: any[], index: number) => {
    const html = tokens[index].content;
    return KNOWN_BLOCK_HTML.test(html.trim()) ? html : `<div data-raw-html="${escapeAttribute(html.replace(/\s+$/, ''))}"></div>\n`;
  };
  rules.html_inline = (tokens: any[], index: number) => {
    const html = tokens[index].content;
    return KNOWN_INLINE_HTML.test(html) ? html : `<span data-raw-inline="${escapeAttribute(html)}"></span>`;
  };
  // A single line break inside a paragraph stays a line break.
  rules.softbreak = () => '<br data-soft="true">\n';
  rules.scribe_blank_line = () => '<p></p>\n';

  // Extra blank lines between blocks (at the top level or inside a quote) become empty
  // paragraphs, and are written back the same way, so spacing survives saving.
  if (markdownit.core.ruler.__find__('scribe_blank_lines') < 0) {
    markdownit.core.ruler.after('block', 'scribe_blank_lines', (state: any) => {
      const tokens: any[] = [];
      const lines: string[] = state.src.split('\n');
      // Per open container: whether blank lines may become paragraphs there, and where
      // its previous child ended. Leading blank lines of the note itself are left alone.
      const containers: { spaced: boolean; previousEnd: number | null }[] = [{ spaced: true, previousEnd: null }];
      for (const token of state.tokens) {
        const container = containers[containers.length - 1];
        if (token.nesting === -1) {
          if (token.block && containers.length > 1) containers.pop();
          tokens.push(token);
          if (containers.length) containers[containers.length - 1].previousEnd = token.map?.[1] ?? containers[containers.length - 1].previousEnd;
          continue;
        }
        if (token.block && token.map && container) {
          // Only a gap of nothing but blank (or bare ">") lines; reference definitions leave no token.
          const gap = container.previousEnd === null ? [] : lines.slice(container.previousEnd, token.map[0]);
          if (container.spaced && gap.every(line => !line.replace(/^[\s>]*/, ''))) {
            for (let line = 1; line < gap.length; line++) {
              const blank = new state.Token('scribe_blank_line', '', 0);
              blank.block = true;
              tokens.push(blank);
            }
          }
          container.previousEnd = token.map[1];
        }
        tokens.push(token);
        if (token.nesting === 1 && token.block) {
          containers.push({ spaced: token.type === 'blockquote_open', previousEnd: token.type === 'blockquote_open' && token.map ? token.map[0] : null });
        }
      }
      state.tokens = tokens;
    });
  }
}

// ---------------------------------------------------------------------------
// Serialising

type Serialize = (state: any, node: PMNode, parent: any, index: number) => void;

function serializeTable(fallback: Serialize): Serialize {
  return (state, node, parent, index) => {
    const rows: PMNode[] = [];
    node.forEach(row => rows.push(row));
    const plain = rows.every((row, rowIndex) => {
      let ok = true;
      row.forEach(cell => {
        if (cell.childCount > 1 || cell.attrs.colspan > 1 || cell.attrs.rowspan > 1) ok = false;
        if ((cell.type.name === 'tableHeader') !== (rowIndex === 0)) ok = false;
      });
      return ok;
    });
    if (!plain) return fallback(state, node, parent, index);
    state.inTable = true;
    rows.forEach((row, rowIndex) => {
      state.write('| ');
      row.forEach((cell, _offset, cellIndex) => {
        if (cellIndex) state.write(' | ');
        const content = cell.firstChild;
        if (content && content.textContent.trim()) state.renderInline(content);
        else if (content?.childCount) state.renderInline(content);
      });
      state.write(' |');
      state.ensureNewLine();
      if (!rowIndex) {
        const delimiters: string[] = [];
        row.forEach(cell => {
          const align = cell.attrs.align;
          delimiters.push(align === 'center' ? ':---:' : align === 'right' ? '---:' : align === 'left' ? ':---' : '---');
        });
        state.write(`| ${delimiters.join(' | ')} |`);
        state.ensureNewLine();
      }
    });
    state.closeBlock(node);
    state.inTable = false;
  };
}

const allEmpty = (parent: any, from: number, to: number) => {
  for (let index = from; index < to; index++) if (parent.child(index).type.name !== 'paragraph' || parent.child(index).content.size) return false;
  return true;
};

/** Installs the serialisation side of Markdown fidelity on tiptap-markdown's serializer. */
export function patchNodeSerializer(name: string, serialize: Serialize | undefined): Serialize | undefined {
  if (!serialize) return serialize;
  if (name === 'text') {
    return (state, node) => {
      const text = node.text || '';
      if (node.marks.some(mark => mark.type.name === 'code')) {
        state.text(state.inTable ? text.replace(/\|/g, '\\|') : text, false);
        return;
      }
      state.text(escapeMarkdownText(text, { startOfLine: state.atBlockStart || state.atBlank(), inTable: state.inTable }), false);
    };
  }
  if (name === 'paragraph') {
    return (state, node, parent, index) => {
      const topLevel = parent?.type?.name === 'doc';
      if (!topLevel || node.content.size) return serialize(state, node, parent, index);
      // Each empty paragraph between blocks is one extra blank line; leading and
      // trailing ones are dropped, as Markdown would drop them anyway.
      if (allEmpty(parent, 0, index) || allEmpty(parent, index + 1, parent.childCount)) return;
      if (state.closed) state.flushClose(3);
      else state.out += '\n';
    };
  }
  if (name === 'hardBreak') {
    return (state, node, parent, index) => {
      if (!node.attrs.soft || state.inTable) return serialize(state, node, parent, index);
      for (let next = index + 1; next < parent.childCount; next++) {
        if (parent.child(next).type !== node.type) { state.write('\n'); return; }
      }
    };
  }
  if (name === 'table') return serializeTable(serialize);
  return serialize;
}

export function patchMarkSerializer(name: string, spec: any) {
  // Code text goes through the text serializer, which leaves it unescaped but
  // escapes | inside tables.
  if (name === 'code' && spec) return { ...spec, escape: true };
  return spec;
}

// ---------------------------------------------------------------------------
// Pasting

const MARKDOWN_BLOCK = /^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|>\s?|```|~~~|\|.*\|\s*$)/m;
const MARKDOWN_INLINE = /\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^)\n]+\)|`[^`\n]+`|~~[^~\n]+~~|==[^=\n]+==/;

function listContext($context: ResolvedPos) {
  for (let depth = $context.depth; depth > 0; depth--) {
    const name = $context.node(depth).type.name;
    if (name === 'taskItem') return '- [ ] ';
    if (name === 'listItem') return $context.node(depth - 1).type.name === 'orderedList' ? '1. ' : '- ';
  }
  return null;
}

export const MarkdownFidelity = Extension.create({
  name: 'markdownFidelity',

  addGlobalAttributes() {
    return [
      {
        types: ['hardBreak'],
        attributes: {
          soft: {
            default: false,
            parseHTML: element => element.getAttribute('data-soft') === 'true',
            renderHTML: attributes => attributes.soft ? { 'data-soft': 'true' } : {}
          }
        }
      },
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          align: {
            default: null,
            parseHTML: element => (element as HTMLElement).style.textAlign || element.getAttribute('align') || null,
            renderHTML: attributes => attributes.align ? { style: `text-align: ${attributes.align}` } : {}
          }
        }
      },
      {
        types: ['link'],
        attributes: {
          title: {
            default: null,
            parseHTML: element => element.getAttribute('title'),
            renderHTML: attributes => attributes.title ? { title: attributes.title } : {}
          }
        }
      }
    ];
  },

  addStorage() {
    return { markdown: { parse: { setup: setupMarkdownIt } } };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('markdownPaste'),
        props: {
          // Plain text that looks like Markdown is pasted as Markdown, and lines pasted
          // into a list become items of that list. Shift+Cmd+V still pastes plain text.
          clipboardTextParser: (text, $context, plain) => {
            if (plain) return null as any;
            const normalized = text.replace(/\r\n?/g, '\n');
            const prefix = listContext($context);
            let markdown: string | null = null;
            if (prefix && normalized.includes('\n') && !MARKDOWN_BLOCK.test(normalized)) {
              markdown = normalized.split('\n').filter(line => line.trim()).map(line => prefix + line.trim()).join('\n');
            } else if (MARKDOWN_BLOCK.test(normalized) || MARKDOWN_INLINE.test(normalized)) {
              markdown = normalized;
            }
            if (markdown === null) return null as any;
            const html = editor.storage.markdown.parser.parse(markdown);
            const container = document.createElement('div');
            container.innerHTML = html;
            return PMDOMParser.fromSchema(editor.schema).parseSlice(container, { context: $context });
          }
        }
      })
    ];
  }
});
