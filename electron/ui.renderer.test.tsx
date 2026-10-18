import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Popover } from '../src/components/Popover';
import { LinkEditor } from '../src/components/LinkEditor';
import { NoteList } from '../src/components/NoteList';
import { Titlebar } from '../src/components/Titlebar';
import { createPortal } from 'react-dom';

// Isolated component checks; these never open a visible window or touch user notes.
(window as any).runUIPolishTests = async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const results: string[] = [];
  const check = (name: string, condition: unknown) => {
    if (!condition) throw new Error(name);
    results.push(name);
  };
  const host = document.createElement('div');
  const outside = document.createElement('button');
  outside.textContent = 'Outside';
  document.body.append(host, outside);
  const root = createRoot(host);
  const render = async (element: React.ReactNode) => { await act(async () => { root.render(element); }); };
  const click = async (element: Element) => { await act(async () => { (element as HTMLElement).click(); }); };
  const key = async (element: Element, value: string) => { await act(async () => { element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })); }); };
  const fill = async (element: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const listProps: React.ComponentProps<typeof NoteList> = {
    currentFolder: 'All Notes', showFolderLabels: false, onNewNote: () => {},
    isSearching: false, searchError: false, searchScope: 'all', onSearchScopeChange: () => {},
    canSearchFolder: false, onClearSearch: () => {}, compact: false, onToggleCompact: () => {},
    notes: [], selectedNoteId: null, onSelectNote: () => {}, onEditNote: () => {}, onDeleteNote: () => {},
    sortMode: 'date-edited-desc', onSortChange: () => {}, pinnedIds: new Set(), onTogglePin: () => {}
  };
  host.style.width = '320px';
  const textWidth = (element: Element) => {
    const range = document.createRange(); range.selectNodeContents(element);
    return range.getBoundingClientRect().width;
  };
  for (const [title, term] of [['מחשבות', 'מחש'], ['מחשבות', 'שב'], ['thoughtful', 'thought'], ['Mississippi', 'iss'], ['מחשבות about Monday', 'about']]) {
    const note = { id: 'example', filePath: '/example.md', fileName: 'example.md', title, snippet: title, folder: '/', modifiedAt: Date.now(), createdAt: Date.now() };
    await render(<NoteList {...listProps} notes={[note]} searchQuery="" />);
    const width = textWidth(host.querySelector('.note-list-row h3')!);
    await render(<NoteList {...listProps} notes={[note]} searchQuery={term} />);
    const highlighted = host.querySelector('.note-list-row h3')!;
    check(`search preserves word spacing: ${title} / ${term}`, highlighted.textContent === title && Math.abs(textWidth(highlighted) - width) < .5);
  }
  await render(null);
  let zoomRequests = 0;
  (window as any).scribeAPI = { titleBarDoubleClick: async () => { zoomRequests++; } };
  await render(<Titlebar currentFolder="All Notes" searchQuery="" onSearchChange={() => {}} onSearchSubmit={() => {}}
    onNewNote={() => {}} onSelectFolder={() => {}} isSaving={false} lastSavedText="Saved" isDark={false} onToggleTheme={() => {}}
    showSidebar={true} onToggleSidebar={() => {}} writingFocus={false} onToggleFocus={() => {}} libraryWidth={420} toolbarRef={() => {}} />);
  const header = host.querySelector('header')!;
  const doubleClick = async (element: Element) => { await act(async () => { element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0 })); }); };
  await doubleClick(header);
  check('title-bar background requests native window zoom', zoomRequests === 1);
  await doubleClick(host.querySelector('input')!);
  await doubleClick(host.querySelector('button')!);
  check('double-clicking search and toolbar controls does not zoom the window', zoomRequests === 1);
  const slot = host.querySelector('#editor-toolbar-slot')!;
  const PortalProbe = () => createPortal(<span data-testid="portal-background">Toolbar background</span>, slot);
  const portalHost = document.createElement('div'); document.body.append(portalHost);
  const portalRoot = createRoot(portalHost);
  await act(async () => { portalRoot.render(<PortalProbe />); });
  await doubleClick(slot.querySelector('span')!);
  check('title-bar zoom covers content from a separate React portal', zoomRequests === 2);
  await act(async () => { portalRoot.unmount(); }); portalHost.remove();
  await render(null);
  await render(<><Popover label="Menu A" trigger={<span>A</span>}>
    {close => <><button onClick={close}>First action</button><button onClick={close}>Second action</button></>}
  </Popover><Popover label="Menu B" trigger={<span>B</span>}>{close => <button onClick={close}>Other action</button>}</Popover></>);
  const triggerA = host.querySelector('[aria-label="Menu A"]')!;
  const triggerB = host.querySelector('[aria-label="Menu B"]')!;
  await click(triggerA);
  check('opening a menu focuses its first action', document.activeElement?.textContent === 'First action');
  await key(document.activeElement!, 'ArrowDown');
  check('arrow navigation moves to the next menu action', document.activeElement?.textContent === 'Second action');
  await key(document.activeElement!, 'Escape');
  check('Escape closes the menu and restores its trigger', !document.querySelector('[role="dialog"]') && document.activeElement === triggerA);
  await click(triggerA); await click(triggerB);
  check('only the most recently opened menu remains', document.querySelectorAll('[role="dialog"]').length === 1 && document.querySelector('[role="dialog"]')?.getAttribute('aria-label') === 'Menu B');
  await act(async () => { outside.focus(); });
  check('tabbing outside dismisses a menu', !document.querySelector('[role="dialog"]'));

  const editorHost = document.createElement('div');
  document.body.append(editorHost);
  const editor = new Editor({ element: editorHost, extensions: [StarterKit, Link.configure({ openOnClick: false })], content: '<p>Start useful words finish</p>' });
  let closed = 0;
  let serial = 0;
  const openLink = async () => render(<LinkEditor key={++serial} editor={editor} anchor={{ left: 120, top: 80, bottom: 100 }} onClose={() => { closed++; }} />);
  const submit = async () => { await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };
  const linkedText = () => {
    let value = '';
    editor.state.doc.descendants(node => { if (node.isText && node.marks.some(mark => mark.type.name === 'link')) value += node.text; });
    return value;
  };
  editor.commands.setTextSelection({ from: 7, to: 19 });
  await openLink();
  check('link panel focuses and labels its address field', document.activeElement === document.querySelector('#link-address'));
  await fill(document.querySelector('#link-address')!, 'example.com/notes');
  // A transaction while the panel is open must not move the link onto other words.
  editor.commands.insertContentAt(1, 'Before ');
  await submit();
  check('link insertion preserves the selected words through intervening edits', linkedText() === 'useful words' && editor.getText() === 'Before Start useful words finish');
  check('typed web domains receive a scheme', editor.getHTML().includes('href="https://example.com/notes"'));
  check('saving a link closes its panel', closed === 1);

  editor.commands.setTextSelection(16);
  editor.commands.extendMarkRange('link');
  await openLink();
  check('editing a link loads its existing address', (document.querySelector('#link-address') as HTMLInputElement).value === 'https://example.com/notes');
  await fill(document.querySelector('#link-address')!, 'javascript:alert(1)');
  await submit();
  check('unsafe link input gives an error and leaves the note intact', !!document.querySelector('[role="alert"]') && !editor.getHTML().includes('javascript:') && closed === 1);
  await fill(document.querySelector('#link-address')!, 'https://example.org/updated');
  await submit();
  check('editing changes the address without replacing the label', linkedText() === 'useful words' && editor.getHTML().includes('https://example.org/updated'));
  editor.commands.setTextSelection(16); editor.commands.extendMarkRange('link');
  await openLink();
  await click(document.querySelector('[aria-label="Remove link"]')!);
  check('removing a link preserves its text', linkedText() === '' && editor.getText().includes('useful words'));
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  await openLink();
  await fill(document.querySelector('#link-address')!, '../Other.md');
  await submit();
  check('relative Markdown links remain relative', editor.getHTML().includes('href="../Other.md"'));
  await openLink();
  const beforeEscape = closed;
  await key(document.querySelector('#link-address')!, 'Escape');
  check('Escape dismisses link editing without changing content', closed === beforeEscape + 1 && editor.getText().includes('useful words'));
  await act(async () => { root.unmount(); });
  editor.destroy(); host.remove(); outside.remove(); editorHost.remove();
  return results;
};
