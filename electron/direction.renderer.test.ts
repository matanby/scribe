import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import { CustomTaskItem } from '../src/extensions/CustomTaskItem';
import { BiDiExtension } from '../src/extensions/BiDiExtension';
import { DirectionMarkdown } from '../src/extensions/DirectionMarkdown';

// Runs in Chromium so the actual Markdown parser, DOM, and editor commands are tested.
(window as any).runDirectionTests = async () => {
  const results: string[] = [];
  const check = (name: string, condition: unknown) => {
    if (!condition) throw new Error(name);
    results.push(name);
  };
  const create = (content: string) => {
    const element = document.createElement('div');
    document.body.append(element);
    return new Editor({ element, content, extensions: [StarterKit, TaskList,
      CustomTaskItem.configure({ nested: true, autoSort: false }), BiDiExtension,
      DirectionMarkdown.configure({ html: true })] });
  };
  const blocks = (editor: Editor, type: string) => {
    const found: { node: any; pos: number }[] = [];
    editor.state.doc.descendants((node, pos) => { if (node.type.name === type) found.push({ node, pos }); });
    return found;
  };
  const wait = () => new Promise(resolve => setTimeout(resolve, 20));
  const editor = create('Before\n\n- [ ] HDD 3 * למחשב נייד\n- [x] Malm 400 - גדול\n- [ ] פריט נוסף\n\nAfter');
  await wait();
  check('ordinary notes remain Markdown', editor.storage.markdown.getMarkdown().includes('- [ ] HDD'));
  const items = blocks(editor, 'taskItem');
  editor.commands.setTextSelection(items[0].pos + 2);
  editor.chain().setTextDirection('rtl').run();
  check('cursor affects only current checklist item', blocks(editor, 'taskItem')[0].node.attrs.dir === 'rtl'
    && blocks(editor, 'taskItem')[1].node.attrs.directionOverride === null);
  editor.commands.insertContent('English ');
  check('editing does not undo RTL', blocks(editor, 'taskItem')[0].node.attrs.dir === 'rtl');
  check('undo restores content without losing override', editor.commands.undo()
    && blocks(editor, 'taskItem')[0].node.attrs.directionOverride === 'rtl');
  check('undo direction restores automatic', editor.commands.undo()
    && blocks(editor, 'taskItem')[0].node.attrs.directionOverride === null);
  editor.commands.redo();
  const current = blocks(editor, 'taskItem');
  editor.commands.setTextSelection({ from: current[0].pos + 2, to: current[2].pos + current[2].node.nodeSize - 2 });
  editor.chain().setTextDirection('rtl').run();
  check('selection forces every selected task RTL', blocks(editor, 'taskItem').every(({ node }) => node.attrs.dir === 'rtl'));
  check('outside paragraphs unaffected', blocks(editor, 'paragraph').filter(({ node }) => ['Before', 'After'].includes(node.textContent)).every(({ node }) => node.attrs.directionOverride === null));
  const markdown = editor.storage.markdown.getMarkdown();
  check('saved HTML includes standard RTL markup', markdown.includes('dir="rtl"'));
  check('saved HTML omits computed directions and override metadata', !markdown.includes('data-dir=') && !markdown.includes('data-direction-override'));
  const reopened = create(markdown);
  await wait();
  check('Markdown round trip preserves text', reopened.state.doc.textContent === editor.state.doc.textContent);
  check('Markdown round trip preserves checked state', blocks(reopened, 'taskItem').map(({ node }) => node.attrs.checked).join() === 'false,true,false');
  check('Markdown round trip preserves manual direction', blocks(reopened, 'taskItem').every(({ node }) => node.attrs.directionOverride === 'rtl' && node.attrs.dir === 'rtl'));
  check('saving again is stable', reopened.storage.markdown.getMarkdown() === markdown);
  const first = blocks(reopened, 'taskItem')[0];
  reopened.commands.setTextSelection(first.pos + first.node.nodeSize - 2);
  check('Enter splits checklist item', reopened.commands.splitListItem('taskItem'));
  check('new checklist item inherits RTL', blocks(reopened, 'taskItem')[1].node.attrs.directionOverride === 'rtl');
  reopened.commands.insertContent('USB כבל');
  check('English-first new item remains RTL', blocks(reopened, 'taskItem')[1].node.attrs.dir === 'rtl');
  reopened.commands.setTextDirection('auto');
  check('Automatic resumes first-letter detection', blocks(reopened, 'taskItem')[1].node.attrs.directionOverride === null && blocks(reopened, 'taskItem')[1].node.attrs.dir === 'ltr');

  editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });
  editor.commands.setTextDirection('auto');
  check('removing overrides returns to ordinary Markdown', !editor.storage.markdown.getMarkdown().includes('dir='));
  const paragraphs = create('English עברית\n\nעברית English');
  await wait();
  paragraphs.commands.setTextSelection(1);
  paragraphs.commands.setTextDirection('rtl');
  const paragraphReload = create(paragraphs.storage.markdown.getMarkdown());
  await wait();
  check('paragraph direction round trips', paragraphReload.state.doc.firstChild?.attrs.directionOverride === 'rtl');
  paragraphs.commands.setTextDirection('auto');
  const secondParagraph = blocks(paragraphs, 'paragraph')[1];
  paragraphs.commands.setTextSelection({ from: 1, to: secondParagraph.pos + 1 });
  paragraphs.commands.setTextDirection('rtl');
  check('selection ending at next paragraph start excludes that paragraph', paragraphs.state.doc.lastChild?.attrs.directionOverride === null);
  paragraphs.commands.setTextSelection(paragraphs.state.doc.content.size - 1);
  paragraphs.commands.setTextDirection('ltr');
  check('explicit LTR beats Hebrew first letter', paragraphs.state.doc.lastChild?.attrs.dir === 'ltr');
  const nested = create('- Parent\n  - English עברית\n- Sibling');
  await wait();
  const child = blocks(nested, 'paragraph')[1];
  nested.commands.setTextSelection(child.pos + 1);
  nested.commands.setTextDirection('rtl');
  check('nested item override does not affect its ancestor', blocks(nested, 'listItem')[0].node.attrs.directionOverride === null);
  const nestedReload = create(nested.storage.markdown.getMarkdown());
  await wait();
  check('nested lists and overrides survive reopening', blocks(nestedReload, 'listItem').length === 3
    && blocks(nestedReload, 'paragraph')[1].node.attrs.directionOverride === 'rtl');

  // Keep one example for layout verification, removing the other editor instances.
  for (const instance of [editor, paragraphs, paragraphReload, nested, nestedReload]) {
    const host = instance.options.element;
    instance.destroy();
    host.remove();
  }
  const task = reopened.view.dom.querySelector('li[data-type="taskItem"]')!;
  const checkbox = task.querySelector('label')!.getBoundingClientRect();
  const content = task.querySelector('div')!.getBoundingClientRect();
  check('RTL checkbox sits to the right of text', checkbox.left >= content.right - 1);
  check('forced mixed paragraph uses explicit bidi base', getComputedStyle(task.querySelector('p')!).unicodeBidi === 'isolate');
  return results;
};
