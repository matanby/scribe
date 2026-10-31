import MarkdownIt from 'markdown-it';
import sanitizeHTML from 'sanitize-html';
import { parseDocument } from 'htmlparser2';
import { getElementsByTagName, textContent } from 'domutils';
import { isTag } from 'domhandler';
import serialize from 'dom-serializer';
import mark from 'markdown-it-mark';
import { getDirection } from '../utils/textDirection';

const parser = new MarkdownIt({ html: true, breaks: true }).use(mark);

// Track the enclosing list in one pass. The editor's task-list plugin searches
// backwards for it on every checkbox, which slows previews of long checklists.
parser.core.ruler.after('inline', 'preview-tasks', state => {
  const lists: typeof state.tokens = [];
  for (let index = 0; index < state.tokens.length; index++) {
    const token = state.tokens[index];
    if (['bullet_list_open', 'ordered_list_open'].includes(token.type)) lists.push(token);
    else if (['bullet_list_close', 'ordered_list_close'].includes(token.type)) lists.pop();
    if (token.type !== 'inline' || state.tokens[index - 1]?.type !== 'paragraph_open'
      || state.tokens[index - 2]?.type !== 'list_item_open' || !/^\[[ xX]\] /.test(token.content)
      || token.children?.[0]?.type !== 'text') continue;

    const checkbox = new state.Token('html_inline', '', 0);
    checkbox.content = `<input type="checkbox" disabled${token.content[1] === ' ' ? '' : ' checked'}>`;
    token.children[0].content = token.children[0].content.slice(3);
    token.children.unshift(checkbox);
    token.content = token.content.slice(3);
    state.tokens[index - 2].attrJoin('class', 'task-list-item');
    const list = lists[lists.length - 1];
    if (list && !list.attrGet('class')?.split(/\s+/).includes('contains-task-list')) {
      list.attrJoin('class', 'contains-task-list');
    }
  }
});

/** Pure JavaScript: runs in JavaScriptCore without a browser or filesystem API. */
export function renderPreviewHTML(markdown: string): string {
  const body = markdown.replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const safe = sanitizeHTML(parser.render(body), {
    allowedTags: [...sanitizeHTML.defaults.allowedTags, 'input', 'label', 'mark'],
    allowedAttributes: {
      '*': ['dir', 'class', 'data-type', 'data-checked'],
      input: ['type', 'checked', 'disabled'],
      ol: ['start'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'],
    },
    transformTags: {
      a: () => ({ tagName: 'span', attribs: { class: 'link' } }),
      img: (_tag, attrs) => ({ tagName: 'span', attribs: { class: 'attachment' }, text: attrs.alt || 'Image' }),
      input: (_tag, attrs) => ({ tagName: attrs.type === 'checkbox' ? 'input' : 'span', attribs: {
        type: 'checkbox', disabled: '', ...(Object.prototype.hasOwnProperty.call(attrs, 'checked') ? { checked: '' } : {}),
      } }),
    },
  });
  const doc = parseDocument(`<main id="preview" aria-label="Read-only Markdown preview">${safe}</main>`);
  const root = doc.children.find(isTag)!;
  const docDir = getDirection(textContent(root)) === 'rtl' ? 'rtl' : 'ltr';
  root.attribs.dir = docDir;
  const elements = getElementsByTagName('*', root.children, true);
  const explicit = new Set(elements.filter(element => ['rtl', 'ltr'].includes(element.attribs.dir)));
  const overrideFor = (element: typeof root) => {
    for (let ancestor: typeof element | null = element; ancestor; ancestor = ancestor.parent && isTag(ancestor.parent) ? ancestor.parent : null) {
      if (explicit.has(ancestor)) return ancestor.attribs.dir;
    }
    return undefined;
  };
  for (const element of elements) {
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'li'].includes(element.name)) {
      element.attribs.dir = overrideFor(element) || getDirection(textContent(element));
    }
  }
  for (const element of elements.filter(element => ['ul', 'ol'].includes(element.name))) {
    const items = element.children.filter(isTag);
    const directions = items.map(item => getDirection(textContent(item)));
    const dir = overrideFor(element) || (directions.includes('rtl') ? 'rtl' : directions.includes('ltr') ? 'ltr' : docDir);
    element.attribs.dir = dir;
    for (const item of items) {
      if (item.name === 'li' && !item.attribs.class?.split(/\s+/).includes('task-list-item') && item.attribs['data-type'] !== 'taskItem') {
        item.attribs.dir = overrideFor(item) || dir;
      }
    }
  }
  return serialize(doc);
}
