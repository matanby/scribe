import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import { CustomTaskItem } from '../src/extensions/CustomTaskItem';
import { ListKeyboard } from '../src/extensions/ListKeyboard';
import { BiDiExtension } from '../src/extensions/BiDiExtension';
import { DirectionMarkdown } from '../src/extensions/DirectionMarkdown';
import { checklistViewKey } from '../src/extensions/checklist';
import { keepCaretComfortable } from '../src/utils/caretVisibility';
import { FormattingBar } from '../src/components/FormattingBar';

export async function runWritingTests() {
  const results: string[] = [];
  const check = (name: string, condition: unknown) => { if (!condition) throw new Error(name); results.push(name); };
  const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const instances: Editor[] = [];
  const create = (content: string, autoSort = false) => {
    const scroller = document.createElement('div');
    scroller.className = 'scribe-app note-scroller';
    scroller.style.cssText = 'height:240px;width:650px;overflow:auto;position:relative;padding:0 40px;';
    const element = document.createElement('div'); scroller.append(element); document.body.append(scroller);
    const editor = new Editor({ element, content, extensions: [StarterKit, TaskList,
      CustomTaskItem.configure({ nested: true, autoSort }), BiDiExtension, ListKeyboard, Underline, Highlight, Link.configure({ openOnClick: false }), DirectionMarkdown.configure({ html: true })],
      editorProps: { attributes: { class: 'tiptap note-content' }, handleScrollToSelection: keepCaretComfortable } });
    instances.push(editor); return editor;
  };
  const blocks = (editor: Editor, type = 'taskItem') => {
    const found: { node: any; pos: number }[] = [];
    editor.state.doc.descendants((node, pos) => { if (node.type.name === type) found.push({ node, pos }); });
    return found;
  };
  const taskTexts = (editor: Editor) => blocks(editor).map(({ node }) => node.firstChild.textContent).join('|');
  const keyboard = (editor: Editor, key: string, extra: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true, ...extra });
    editor.view.dom.dispatchEvent(event); return event.defaultPrevented;
  };
  const taskHTML = (text: string, checked = false) => `<li data-type="taskItem" data-checked="${checked}"><p>${text}</p></li>`;
  const list = (...items: string[]) => `<ul data-type="taskList">${items.join('')}</ul>`;

  const dragPreviews = create(list(taskHTML('An English task'), taskHTML('לצאת להליכה בבוקר'), taskHTML('לתכנן את הפרויקט ב־Figma'), taskHTML('Send the summary to Alex')));
  await settle();
  for (const [index, label] of ['English', 'Hebrew', 'mixed Hebrew/English', 'English after Hebrew'].entries()) {
    const item = dragPreviews.view.dom.querySelectorAll<HTMLElement>('li[data-type="taskItem"]')[index];
    const handle = item.querySelector<HTMLElement>('.task-drag-handle')!;
    const itemBounds = item.getBoundingClientRect(), handleBounds = handle.getBoundingClientRect();
    const pointer = { x: handleBounds.left + handleBounds.width / 2, y: handleBounds.top + handleBounds.height / 2 };
    const transfer = new DataTransfer();
    let image: { element: Element; x: number; y: number } | null = null;
    transfer.setDragImage = (element, x, y) => { image = { element, x, y }; };
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: pointer.x, clientY: pointer.y }));
    const preview = image as { element: Element; x: number; y: number } | null;
    check(`${label} drag preview stays aligned with the grabbed task`, preview?.element === item && Math.abs(pointer.x - preview.x - itemBounds.left) <= 1 && Math.abs(pointer.y - preview.y - itemBounds.top) <= 1);
    if (index === 1 || index === 2) check(`${label} drag preview anchors at the right-hand handle`, item.dir === 'rtl' && preview !== null && preview.x >= itemBounds.width - 1);
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
  }

  const stable = create(`<p>Before</p>${list(taskHTML('First'), taskHTML('Second'), taskHTML('Third'))}${'<p>After</p>'.repeat(15)}`);
  await settle();
  stable.commands.setTextSelection(blocks(stable)[1].pos + 4);
  const caret = stable.state.selection.from;
  const scroller = stable.view.dom.closest<HTMLElement>('.note-scroller')!;
  scroller.scrollTop = 15;
  const scroll = scroller.scrollTop;
  (stable.view.dom.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
  check('completing a task leaves item order, caret, and scroll in place', taskTexts(stable) === 'First|Second|Third' && stable.state.selection.from === caret && scroller.scrollTop === scroll);
  check('completion is one undoable change', stable.commands.undo() && !blocks(stable)[0].node.attrs.checked && taskTexts(stable) === 'First|Second|Third');

  const automatic = create(list(taskHTML('First'), taskHTML('Second'), taskHTML('Third')), true);
  automatic.commands.setTextSelection(blocks(automatic)[1].pos + 4);
  (automatic.view.dom.querySelector('input') as HTMLInputElement).click();
  check('optional automatic sorting keeps the caret in the same task', taskTexts(automatic) === 'Second|Third|First' && automatic.state.selection.$from.parent.textContent === 'Second');
  check('one undo restores both automatic sorting and check state', automatic.commands.undo() && taskTexts(automatic) === 'First|Second|Third' && !blocks(automatic)[0].node.attrs.checked);
  automatic.commands.setTextSelection(blocks(automatic)[0].pos + 3);
  automatic.commands.toggleCurrentTask();
  check('completion commands preserve the current task when sorting', taskTexts(automatic) === 'Second|Third|First' && automatic.state.selection.$from.parent.textContent === 'First');

  const manual = create(list(taskHTML('Done first', true), taskHTML('To do'), taskHTML('Done last', true)) + '<p>Between</p>' + list(taskHTML('Also done', true), taskHTML('Another task')));
  manual.commands.setTextSelection(blocks(manual)[0].pos + 4);
  manual.commands.sortCompletedTasks();
  check('manual sorting is stable across separate checklists and retains the caret', taskTexts(manual) === 'To do|Done first|Done last|Another task|Also done' && manual.state.selection.$from.parent.textContent === 'Done first');
  check('undoing manual sorting retains the existing completion states', manual.commands.undo() && taskTexts(manual) === 'Done first|To do|Done last|Also done|Another task' && blocks(manual)[0].node.attrs.checked);

  const hidden = create(`<p>Before</p>${list(taskHTML('Finished', true), taskHTML('Still writing'), '<li data-type="taskItem" data-checked="true"><p>Parent</p>' + list(taskHTML('Child still to do')) + '</li>')}<p>After</p>`);
  hidden.commands.setTextSelection(1);
  const markdownBefore = hidden.storage.markdown.getMarkdown();
  hidden.commands.setCompletedTasksHidden(true);
  check('completed tasks hide without hiding unfinished descendants', hidden.view.dom.querySelectorAll('.task-completed-hidden').length === 1 && getComputedStyle(hidden.view.dom.querySelector('.task-completed-hidden')!).display === 'none');
  check('hiding tasks changes neither Markdown nor exported HTML', hidden.storage.markdown.getMarkdown() === markdownBefore && !hidden.getHTML().includes('task-completed-hidden') && !hidden.getHTML().includes('task-drag-handle'));
  hidden.commands.setTextSelection(blocks(hidden)[0].pos + 3);
  check('a completed task remains visible while being edited', !hidden.view.dom.querySelector('li')!.classList.contains('task-completed-hidden'));
  hidden.commands.setTextSelection(1);
  check('leaving the completed task reapplies the filter', hidden.view.dom.querySelector('li')!.classList.contains('task-completed-hidden'));
  hidden.commands.setCompletedTasksHidden(false);
  check('show completed restores every task', !hidden.view.dom.querySelector('.task-completed-hidden') && blocks(hidden).length === 4);

  const reordered = create(list('<li data-type="taskItem" data-checked="true" dir="rtl"><p>משימה ראשונה</p>' + list(taskHTML('Nested child')) + '</li>', taskHTML('English <a href="https://example.com">link</a>'), taskHTML('Third')));
  await settle();
  reordered.commands.setTextSelection(blocks(reordered)[2].pos + 5);
  const secondHandle = reordered.view.dom.querySelectorAll<HTMLButtonElement>('.task-drag-handle')[2];
  secondHandle.focus({ preventScroll: true });
  secondHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  check('keyboard reordering moves whole tasks with nested content and links intact', taskTexts(reordered) === 'English link|משימה ראשונה|Nested child|Third' && reordered.getHTML().includes('https://example.com') && blocks(reordered)[1].node.attrs.directionOverride === 'rtl');
  check('reordering preserves both the writing caret and handle focus', reordered.state.selection.$from.parent.textContent === 'English link' && document.activeElement?.getAttribute('aria-label') === 'Reorder task: English link');
  const serialized = reordered.storage.markdown.getMarkdown();
  const reopened = create(serialized);
  await settle();
  check('reordered tasks reopen with their nesting, directions, and completion intact', taskTexts(reopened) === taskTexts(reordered) && blocks(reopened)[1].node.attrs.checked && blocks(reopened)[1].node.attrs.directionOverride === 'rtl' && blocks(reopened)[2].node.attrs.checked === false);
  check('one undo restores the original task order', reordered.commands.undo() && taskTexts(reordered) === 'משימה ראשונה|Nested child|English link|Third');

  const dragged = create(list(taskHTML('First'), taskHTML('Second'), taskHTML('Third')));
  const transfer = new DataTransfer();
  const startDrag = () => dragged.view.dom.querySelector('.task-drag-handle')!.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  startDrag();
  let target = dragged.view.dom.querySelectorAll<HTMLElement>('li[data-type="taskItem"] > div > p')[2];
  let bounds = target.getBoundingClientRect();
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: bounds.left + 5, clientY: bounds.bottom - 1 }));
  check('dragging displays an insertion guide at a valid destination', !!document.querySelector('.task-drop-indicator'));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: bounds.left + 5, clientY: bounds.bottom - 1 }));
  check('dropping reorders tasks without copies and clears the guide', taskTexts(dragged) === 'Second|Third|First' && !document.querySelector('.task-drop-indicator') && checklistViewKey.getState(dragged.state)?.draggedPos === null);
  check('drag reordering can be undone in one step', dragged.commands.undo() && taskTexts(dragged) === 'First|Second|Third');
  dragged.commands.insertContentAt(dragged.state.doc.content.size, '<p>Between lists</p>' + list(taskHTML('Separate checklist')));
  const beforeInvalidDrop = JSON.stringify(dragged.getJSON());
  startDrag();
  target = dragged.view.dom.querySelectorAll<HTMLElement>('li[data-type="taskItem"] > div > p')[3];
  bounds = target.getBoundingClientRect();
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: bounds.left + 5, clientY: bounds.bottom - 1 }));
  check('dropping outside the source checklist never copies or loses a task', JSON.stringify(dragged.getJSON()) === beforeInvalidDrop && checklistViewKey.getState(dragged.state)?.draggedPos === null);

  // Exercise actual row geometry: a paragraph-only threshold puts the guide on
  // the wrong side of a parent when the pointer is over its nested children.
  const nestedDrag = create(list(taskHTML('First'), '<li data-type="taskItem"><p>Parent</p>' + list(taskHTML('Child one'), taskHTML('Child two'), taskHTML('Child three')) + '</li>', taskHTML('Last')));
  const nestedPane = nestedDrag.view.dom.closest<HTMLElement>('.note-scroller')!;
  nestedPane.style.cssText += 'position:fixed;top:10px;left:10px;height:500px;z-index:10;';
  await settle();
  const outerItems = () => Array.from(nestedDrag.view.dom.querySelectorAll<HTMLElement>('ul[data-type="taskList"] > li')).filter(item => item.parentElement?.parentElement === nestedDrag.view.dom);
  const nestedTransfer = new DataTransfer();
  const dragFrom = (index: number) => outerItems()[index].querySelector('.task-drag-handle')!.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: nestedTransfer }));
  const dragAt = (type: 'dragover' | 'drop', element: HTMLElement, x: number, y: number) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: nestedTransfer, clientX: x, clientY: y }));
  const guideY = () => document.querySelector('.task-drop-indicator')?.getBoundingClientRect().top;
  dragFrom(2);
  let children = outerItems()[1].querySelectorAll<HTMLElement>('ul p');
  let childBounds = children[0].getBoundingClientRect();
  dragAt('dragover', children[0], childBounds.left + 10, childBounds.top + 2);
  let rows = outerItems().map(item => item.getBoundingClientRect());
  let expectedY = (rows[0].bottom + rows[1].top) / 2 - 1;
  check('hovering over a nested child shows the gap before its whole parent', Math.abs((guideY() ?? -1000) - expectedY) < 1 && document.querySelectorAll('.task-drop-indicator').length === 1);
  const nativeCursors = nestedPane.querySelectorAll<HTMLElement>('.prosemirror-dropcursor-block, .prosemirror-dropcursor-inline');
  check('task dragging suppresses the competing text drop cursor', nativeCursors.length > 0 && Array.from(nativeCursors).every(cursor => getComputedStyle(cursor).display === 'none'));
  const gapY = (rows[0].bottom + rows[1].top) / 2;
  const listElement = outerItems()[0].parentElement!;
  dragAt('dragover', listElement, childBounds.left + 10, gapY);
  check('moving from task text into its gap keeps the same insertion guide', Math.abs((guideY() ?? -1000) - expectedY) < 1);
  dragAt('drop', listElement, childBounds.left + 10, gapY);
  check('dropping in the displayed gap places the entire task there', taskTexts(nestedDrag) === 'First|Last|Parent|Child one|Child two|Child three');
  nestedDrag.commands.undo();
  dragFrom(0);
  children = outerItems()[1].querySelectorAll<HTMLElement>('ul p');
  childBounds = children[2].getBoundingClientRect();
  dragAt('dragover', children[2], childBounds.left + 10, childBounds.bottom - 2);
  rows = outerItems().map(item => item.getBoundingClientRect());
  expectedY = (rows[1].bottom + rows[2].top) / 2 - 1;
  check('the gap after a parent includes the height of all its subtasks', Math.abs((guideY() ?? -1000) - expectedY) < 1);
  dragAt('drop', children[2], childBounds.left + 10, childBounds.bottom - 2);
  check('the drop matches the guide after a nested task group', taskTexts(nestedDrag) === 'Parent|Child one|Child two|Child three|First|Last');
  nestedDrag.commands.undo();
  dragFrom(0);
  const sourceBounds = outerItems()[0].getBoundingClientRect();
  dragAt('dragover', outerItems()[0], sourceBounds.left + 10, sourceBounds.top + 2);
  check('hovering at the original position shows no misleading move guide', !document.querySelector('.task-drop-indicator'));
  childBounds = outerItems()[2].getBoundingClientRect();
  dragAt('dragover', outerItems()[2], childBounds.left + 10, childBounds.bottom - 2);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  check('Escape clears the guide and restores normal text drag behavior', !document.querySelector('.task-drop-indicator') && !nestedPane.classList.contains('task-reordering') && checklistViewKey.getState(nestedDrag.state)?.draggedPos === null);
  nestedPane.style.position = 'relative';

  const keys = create(list('<li data-type="taskItem" data-checked="true" dir="rtl"><p>משימה</p></li>', taskHTML('Next')));
  await settle();
  keys.commands.setTextSelection(blocks(keys)[0].pos + blocks(keys)[0].node.nodeSize - 2);
  keyboard(keys, 'Enter');
  check('Enter after a completed task creates an unchecked item with the same direction', blocks(keys).length === 3 && !blocks(keys)[1].node.attrs.checked && blocks(keys)[1].node.attrs.directionOverride === 'rtl');
  check('Tab indents the new item and Shift-Tab restores its level', keyboard(keys, 'Tab') && keys.state.selection.$from.depth > 3 && keyboard(keys, 'Tab', { shiftKey: true }) && keys.state.selection.$from.depth === 3);
  keyboard(keys, 'Enter');
  check('Enter on an empty task exits the list without an empty checkbox', !keys.isActive('taskItem') && blocks(keys).length === 2 && keys.state.selection.$from.parent.type.name === 'paragraph');
  keys.commands.setTextSelection(blocks(keys)[0].pos + 2);
  check('Tab on the first task keeps focus in the note when it cannot indent', keyboard(keys, 'Tab') && keys.state.selection.$from.depth === 3);
  const automaticDirection = create(list(taskHTML('משימה בעברית')));
  await settle();
  automaticDirection.commands.setTextSelection(blocks(automaticDirection)[0].pos + blocks(automaticDirection)[0].node.nodeSize - 2);
  keyboard(automaticDirection, 'Enter');
  check('an empty task continued from Hebrew keeps its automatic RTL alignment', blocks(automaticDirection)[1].node.attrs.dir === 'rtl' && automaticDirection.view.dom.querySelectorAll('li')[1].getAttribute('dir') === 'rtl');
  const backspace = create(list(taskHTML('')));
  backspace.commands.setTextSelection(3); keyboard(backspace, 'Backspace');
  check('Backspace on an empty task returns to body text', !backspace.isActive('taskItem') && !blocks(backspace).length);
  for (const tag of ['ul', 'ol']) {
    const regular = create(`<${tag}><li><p>ראשון</p></li><li><p>Second</p></li></${tag}>`);
    regular.commands.setTextSelection(blocks(regular, 'listItem')[1].pos + 3);
    check(`${tag} list indentation and outdent preserve mixed text`, keyboard(regular, 'Tab') && regular.state.selection.$from.depth === 5 && keyboard(regular, 'Tab', { shiftKey: true }) && Number(regular.state.selection.$from.depth) === 3 && regular.getText().includes('ראשון') && regular.getText().includes('Second'));
    regular.commands.setTextSelection(blocks(regular, 'listItem')[1].pos + blocks(regular, 'listItem')[1].node.nodeSize - 2);
    keyboard(regular, 'Enter'); keyboard(regular, 'Enter');
    check(`${tag} Enter continues then exits an empty item`, !regular.isActive('listItem') && blocks(regular, 'listItem').length === 2);
  }

  const long = create(Array.from({ length: 40 }, (_, i) => `<p>Line ${i + 1} is a comfortable place to write.</p>`).join(''));
  await settle();
  long.view.dom.focus({ preventScroll: true });
  const pane = long.view.dom.closest<HTMLElement>('.note-scroller')!;
  pane.scrollTop = 0;
  long.commands.setTextSelection(blocks(long, 'paragraph')[15].pos + 4);
  long.commands.scrollIntoView();
  await settle();
  const bottomCaret = long.view.coordsAtPos(long.state.selection.head);
  const paneBounds = pane.getBoundingClientRect();
  check('typing near the bottom scrolls only the note pane and leaves breathing room', pane.scrollTop > 0 && bottomCaret.bottom <= paneBounds.bottom - 59);
  long.commands.setTextSelection(blocks(long, 'paragraph')[3].pos + 4); long.commands.scrollIntoView();
  await settle();
  check('moving above the viewport restores a comfortable top margin', long.view.coordsAtPos(long.state.selection.head).top >= paneBounds.top + 59);

  const format = create('<p>Start useful words finish</p>');
  const toolbarHost = document.createElement('div'); document.body.append(toolbarHost);
  const root = createRoot(toolbarHost);
  await act(async () => { root.render(<FormattingBar editor={format} noteFilePath="/writing-test.md" tableInsertTrigger={0} onAttach={() => {}} onEditLink={() => {}} />); });
  // TipTap restores editing focus on the next animation frame after a menu action.
  const click = async (element: HTMLElement) => { await act(async () => { element.click(); }); await settle(); };
  await act(async () => { format.commands.setTextSelection({ from: 7, to: 19 }); });
  await click(toolbarHost.querySelector('[aria-label="Text style and formatting"]')!);
  await act(async () => { format.commands.insertContentAt(1, 'Before '); format.commands.setTextSelection(1); });
  const bold = Array.from(document.querySelectorAll<HTMLButtonElement>('.scribe-popover button')).find(button => button.textContent?.startsWith('Bold'))!;
  await click(bold);
  let marked = '';
  format.state.doc.descendants(node => { if (node.isText && node.marks.some(mark => mark.type.name === 'bold')) marked += node.text; });
  check('formatting menus preserve the chosen words through focus changes and intervening edits', marked === 'useful words' && format.state.selection.to - format.state.selection.from === 12);
  await click(toolbarHost.querySelector('[aria-label="Text style and formatting"]')!);
  check('formatting menus identify the active mark', Array.from(document.querySelectorAll<HTMLButtonElement>('.scribe-popover button')).find(button => button.textContent?.startsWith('Bold'))?.getAttribute('aria-pressed') === 'true');
  const heading = Array.from(document.querySelectorAll<HTMLButtonElement>('.scribe-popover button')).find(button => button.textContent?.startsWith('Heading'))!;
  await click(heading);
  check('the toolbar reflects the current paragraph style', toolbarHost.querySelector('.formatting-style-label')?.textContent === 'Heading' && format.state.doc.firstChild?.type.name === 'heading');
  await act(async () => { root.render(<FormattingBar editor={hidden} noteFilePath="/checklist-test.md" tableInsertTrigger={0} onAttach={() => {}} onEditLink={() => {}} />); });
  await click(toolbarHost.querySelector('[aria-label="Checklist options"]')!);
  check('the checklist menu exposes only completed-task view and sorting actions', Array.from(document.querySelectorAll('.scribe-popover button')).map(button => button.textContent?.trim()).join('|') === 'Hide completed|Move completed to bottom' && !document.querySelector('.scribe-popover')?.textContent?.includes('Drag a task'));
  await act(async () => { root.unmount(); }); toolbarHost.remove();

  for (const editor of instances) { const pane = editor.view.dom.closest('.note-scroller'); editor.destroy(); pane?.remove(); }
  return results;
}
