const EMPTY_TASK = /^\s*\[([ xX])\]\s*$/;

/** The text node holding an item's own text: directly in a tight item, or in its first paragraph. */
function leadingText(item: Element): Text | null {
  let node: ChildNode | null = item.firstChild;
  while (node && node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) node = node.nextSibling;
  if (node?.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'P') node = (node as Element).firstChild;
  return node?.nodeType === Node.TEXT_NODE ? node as Text : null;
}

/**
 * markdown-it-task-lists only recognises `[ ]` when text follows it, so an empty
 * checklist item such as `- [ ] ` came back as a bullet reading "[ ]". Turn those
 * items into checklist items, as long as the rest of their list is a checklist too.
 */
export function restoreEmptyTaskItems(root: Element) {
  // Nothing may sit beside the marker except whitespace and nested lists.
  const alone = (text: Text) => Array.from(text.parentNode!.childNodes).every(node =>
    node === text || (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) || ['UL', 'OL'].includes((node as Element).tagName));
  root.querySelectorAll('ul').forEach(list => {
    const items = Array.from(list.children).filter(child => child.tagName === 'LI');
    const empty = items.filter(item => {
      const text = leadingText(item);
      return !item.classList.contains('task-list-item') && !!text && EMPTY_TASK.test(text.textContent || '') && alone(text);
    });
    if (!empty.length || empty.length + items.filter(item => item.classList.contains('task-list-item')).length !== items.length) return;
    empty.forEach(item => {
      const text = leadingText(item)!;
      const checked = EMPTY_TASK.exec(text.textContent || '')![1] !== ' ';
      const input = item.ownerDocument.createElement('input');
      input.type = 'checkbox';
      if (checked) input.setAttribute('checked', '');
      input.checked = checked;
      text.replaceWith(input);
      item.classList.add('task-list-item');
    });
    list.classList.add('contains-task-list');
  });
}

/**
 * markdown-it-task-lists also turns `1. [ ] task` into a checkbox, which the editor can't
 * hold inside a numbered list, so the list fell apart. Keep those items as text.
 */
export function keepOrderedTaskText(root: Element) {
  root.querySelectorAll('ol > li.task-list-item').forEach(item => {
    const input = item.querySelector(':scope > input, :scope > p > input');
    if (input) input.replaceWith(item.ownerDocument.createTextNode(`[${(input as HTMLInputElement).checked ? 'x' : ' '}] `));
    item.classList.remove('task-list-item');
  });
  root.querySelectorAll('ol.contains-task-list').forEach(list => list.classList.remove('contains-task-list'));
}
