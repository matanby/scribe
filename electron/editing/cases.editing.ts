import type { EditCase } from './types';

/**
 * Hand-written editing cases. `md` is the starting note (‸ caret, «…» selection) and
 * `expect` is the Markdown Scribe should save afterwards, with the caret drawn in.
 */
const T = '- [ ] ';
const X = '- [x] ';
const F = '```';
const TABLE = '| a | b |\n| --- | --- |\n';

const checklists: EditCase[] = [
  { name: 'checklist: Option+Backspace deletes the only word', md: `${T}first\n${T}sdfl‸`, keys: ['A-Backspace'], expect: `${T}first\n${T}‸` },
  { name: 'checklist: Option+Backspace deletes the only Hebrew word', md: `${T}ראשון\n${T}שלום‸`, keys: ['A-Backspace'], expect: `${T}ראשון\n${T}‸` },
  { name: 'checklist: Option+Backspace keeps earlier words', md: `${T}buy some milk‸`, keys: ['A-Backspace'], expect: `${T}buy some ‸` },
  { name: 'checklist: Option+Delete deletes the only word', md: `${T}first\n${T}‸sdfl`, keys: ['A-Delete'], expect: `${T}first\n${T}‸` },
  { name: 'checklist: Backspace over a selected item text', md: `${T}first\n${T}«sdfl»`, keys: ['Backspace'], expect: `${T}first\n${T}‸` },
  { name: 'checklist: Delete over a selected item text', md: `${T}first\n${T}«sdfl»`, keys: ['Delete'], expect: `${T}first\n${T}‸` },
  { name: 'checklist: typing over a selected item text', md: `${T}first\n${T}«sdfl»`, keys: [{ type: 'x' }], expect: `${T}first\n${T}x‸` },
  { name: 'checklist: cutting the whole item text', md: `${T}first\n${T}«sdfl»`, keys: ['CUT'], expect: `${T}first\n${T}‸` },
  { name: 'checklist: Backspace twice empties a two-letter item', md: `${T}first\n${T}ab‸`, keys: ['Backspace', 'Backspace'], expect: `${T}first\n${T}‸` },
  { name: 'checklist: Delete twice empties a two-letter item', md: `${T}first\n${T}‸ab`, keys: ['Delete', 'Delete'], expect: `${T}first\n${T}‸` },
  { name: 'checklist: Backspace on an emptied item turns it into text', md: `${T}first\n${T}ab‸`, keys: ['Backspace', 'Backspace', 'Backspace'], expect: `${T}first\n\n‸`, unstableReload: true },
  { name: 'checklist: Backspace over a selection across items joins them', md: `${T}fi«rst\n${T}sec»ond`, keys: ['Backspace'], expect: `${T}fi‸ond` },
  { name: 'checklist: typing over a selection across items joins them', md: `${T}fi«rst\n${T}sec»ond`, keys: [{ type: 'X' }], expect: `${T}fiX‸ond` },
  { name: 'checklist: Enter at the end adds an item', md: `${T}first‸`, keys: ['Enter', { type: 'next' }], expect: `${T}first\n${T}next‸` },
  { name: 'checklist: Enter in the middle splits the item', md: `${T}fir‸st`, keys: ['Enter'], expect: `${T}fir\n${T}‸st` },
  { name: 'checklist: Enter at the start adds an item above', md: `${T}‸first`, keys: ['Enter'], expect: `${T}\n${T}‸first` },
  { name: 'checklist: Enter on an empty last item leaves the list', md: `${T}first\n${T}‸`, keys: ['Enter', { type: 'para' }], expect: `${T}first\n\npara‸` },
  { name: 'checklist: Enter on an empty middle item splits the list', md: `${T}a\n${T}‸\n${T}c`, keys: ['Enter', { type: 'b' }], expect: `${T}a\n\nb‸\n\n${T}c` },
  { name: 'checklist: Enter after a checked item adds an unchecked one', md: `${X}done‸`, keys: ['Enter', { type: 'n' }], expect: `${X}done\n${T}n‸` },
  { name: 'checklist: Shift+Enter adds a line break inside the item', md: `${T}first‸`, keys: ['S-Enter', { type: 'more' }], expect: `${T}first\\\n  more‸` },
  { name: 'checklist: Backspace at the start of the first item turns it into text', md: `${T}‸first`, keys: ['Backspace'], expect: '‸first' },
  { name: 'checklist: Backspace at the start of the last item turns it into text', md: `${T}first\n${T}‸second`, keys: ['Backspace'], expect: `${T}first\n\n‸second` },
  { name: 'checklist: Backspace at the start of a middle item splits the list', md: `${T}a\n${T}‸b\n${T}c`, keys: ['Backspace'], expect: `${T}a\n\n‸b\n\n${T}c` },
  { name: 'checklist: Backspace at the start of a nested item outdents it', md: `${T}a\n  ${T}‸b`, keys: ['Backspace'], expect: `${T}a\n${T}‸b` },
  { name: 'checklist: Delete at the end joins the next item', md: `${T}first‸\n${T}second`, keys: ['Delete'], expect: `${T}first‸second` },
  { name: 'checklist: Delete at the end of the list joins the paragraph after', md: `${T}first‸\n\npara`, keys: ['Delete'], expect: `${T}first‸para` },
  { name: 'checklist: Backspace in the paragraph after the list joins the last item', md: `${T}first\n\n‸para`, keys: ['Backspace'], expect: `${T}first‸para` },
  { name: 'checklist: Tab nests an item', md: `${T}first\n${T}‸second`, keys: ['Tab'], expect: `${T}first\n  ${T}‸second` },
  { name: 'checklist: Shift+Tab outdents an item', md: `${T}first\n  ${T}‸second`, keys: ['S-Tab'], expect: `${T}first\n${T}‸second` },
  { name: 'checklist: Tab on the first item keeps it', md: `${T}‸first`, keys: ['Tab'], expect: `${T}‸first` },
  { name: 'checklist: Enter on an empty nested item outdents it', md: `${T}first\n  ${T}sub\n  ${T}‸`, keys: ['Enter'], expect: `${T}first\n  ${T}sub\n${T}‸` },
  { name: 'checklist: ArrowUp moves to the item above', md: `${T}first line\n${T}sec‸ond`, keys: ['Up', { type: 'X' }], expect: `${T}firsX‸t line\n${T}second` },
  { name: 'checklist: Home goes to the start of the item', md: `${T}first line‸`, keys: ['Home', { type: 'X' }], expect: `${T}X‸first line` },
  { name: 'checklist: typing "[ ] " makes a checklist item', md: '‸', keys: [{ type: '[ ] hi' }], expect: `${T}hi‸` },
  { name: 'checklist: typing "- [ ] " makes a checklist item', md: '‸', keys: [{ type: '- [ ] hi' }], expect: `${T}hi‸` },
  { name: 'checklist: typing "- [x] " makes a checked item', md: '‸', keys: [{ type: '- [x] hi' }], expect: `${X}hi‸` },
  { name: 'checklist: an empty middle item survives reopening', md: `${T}a\n${T}‸\n${T}c`, keys: [], expect: `${T}a\n${T}‸\n${T}c` },
  { name: 'checklist: an empty last item survives reopening', md: `${T}a\n${T}‸`, keys: [], expect: `${T}a\n${T}‸` },
  { name: 'checklist: pasting lines makes one item per line', md: `${T}a‸`, keys: [{ paste: 'one\ntwo\nthree' }], expect: `${T}aone\n${T}two\n${T}three‸` },
  { name: 'checklist: copying a checked item and pasting it keeps it checked', md: `${X}«done item»\n${T}b`, keys: ['COPY', 'Down', 'End', 'Enter', 'PASTE'], expect: `${X}done item\n${T}b\n${X}done item‸` },
  { name: 'checklist: Hebrew items stay right-to-left after Enter', md: `${T}שלום‸`, keys: ['Enter', { type: 'עולם' }], tree: 'doc(taskList(taskItem[ ](paragraph("שלום")) taskItem[ ](paragraph("עולם‸"))))' },
];

const lists: EditCase[] = [
  { name: 'bullets: Option+Backspace deletes the only word', md: '- first\n- sdfl‸', keys: ['A-Backspace'], expect: '- first\n- ‸' },
  { name: 'bullets: Backspace over a selected item text', md: '- first\n- «sdfl»', keys: ['Backspace'], expect: '- first\n- ‸' },
  { name: 'bullets: Enter at the end adds an item', md: '- first‸', keys: ['Enter', { type: 'two' }], expect: '- first\n- two‸' },
  { name: 'bullets: Enter on an empty item leaves the list', md: '- first\n- ‸', keys: ['Enter', { type: 'p' }], expect: '- first\n\np‸' },
  { name: 'bullets: Backspace at the start of the first item turns it into text', md: '- ‸first\n- second', keys: ['Backspace'], expect: '‸first\n\n- second' },
  { name: 'bullets: Backspace at the start of the last item turns it into text', md: '- first\n- ‸second', keys: ['Backspace'], expect: '- first\n\n‸second' },
  { name: 'bullets: Backspace at the start of a middle item splits the list', md: '- a\n- ‸b\n- c', keys: ['Backspace'], expect: '- a\n\n‸b\n\n- c' },
  { name: 'bullets: Backspace on an empty last item turns it into text', md: '- first\n- ‸', keys: ['Backspace', { type: 'p' }], expect: '- first\n\np‸' },
  { name: 'bullets: Backspace at the start of a nested item outdents it', md: '- a\n  - ‸b', keys: ['Backspace'], expect: '- a\n- ‸b' },
  { name: 'bullets: Delete at the end joins the next item', md: '- a‸\n- b', keys: ['Delete'], expect: '- a‸b' },
  { name: 'bullets: Backspace in the paragraph after the list joins the last item', md: '- a\n\n‸para', keys: ['Backspace'], expect: '- a‸para' },
  { name: 'bullets: Tab nests an item', md: '- one\n- ‸two', keys: ['Tab'], expect: '- one\n  - ‸two' },
  { name: 'bullets: Shift+Tab outdents an item', md: '- one\n  - ‸two', keys: ['S-Tab'], expect: '- one\n- ‸two' },
  { name: 'bullets: typing "- " makes a list', md: '‸', keys: [{ type: '- item' }], expect: '- item‸' },
  { name: 'bullets: typing "* " makes a list', md: '‸', keys: [{ type: '* item' }], expect: '- item‸' },
  { name: 'bullets: Backspace right after "- " restores the text', md: '‸', keys: [{ type: '- ' }, 'Backspace'], expect: '‸' },
  { name: 'bullets: an empty middle item survives reopening', md: '- a\n- ‸\n- c', keys: [], expect: '- a\n- ‸\n- c' },
  { name: 'bullets: Hebrew items stay right-to-left after Enter', md: '- שלום‸', keys: ['Enter', { type: 'עולם' }], expect: '- שלום\n- עולם‸' },
  { name: 'numbers: typing "1. " makes a numbered list', md: '‸', keys: [{ type: '1. item' }, 'Enter', { type: 'two' }], expect: '1. item\n2. two‸' },
  { name: 'numbers: Enter on an empty item leaves the list', md: '1. one\n2. ‸', keys: ['Enter', { type: 'p' }], expect: '1. one\n\np‸' },
  { name: 'numbers: Tab nests an item', md: '1. one\n2. ‸two', keys: ['Tab'], expect: '1. one\n   1. ‸two' },
  { name: 'numbers: Backspace on an empty last item turns it into text', md: '1. one\n2. ‸', keys: ['Backspace', { type: 'p' }], expect: '1. one\n\np‸' },
  { name: 'numbers: a list starting at 5 keeps its numbering', md: '5. five\n6. six‸', keys: ['Enter', { type: 'seven' }], expect: '5. five\n6. six\n7. seven‸' },
];

const headings: EditCase[] = [
  { name: 'headings: typing "# " makes a heading', md: '‸', keys: [{ type: '# Title' }], expect: '# Title‸' },
  { name: 'headings: typing "### " makes a level-3 heading', md: '‸', keys: [{ type: '### Title' }], expect: '### Title‸' },
  { name: 'headings: typing "# " mid-line stays text', md: 'some ‸text', keys: [{ type: '# ' }], expect: 'some # ‸text' },
  { name: 'headings: Enter at the end starts a paragraph', md: '## Title‸', keys: ['Enter', { type: 'body' }], expect: '## Title\n\nbody‸' },
  { name: 'headings: Enter in the middle splits the heading', md: '## Ti‸tle', keys: ['Enter'], expect: '## Ti\n\n## ‸tle' },
  { name: 'headings: Enter at the start keeps the heading', md: 'para\n\n## ‸Title', keys: ['Enter'], tree: 'doc(paragraph("para") paragraph() heading2("‸Title"))', unstableReload: true },
  { name: 'headings: Option+Backspace deletes the only word', md: 'para\n\n## Title‸', keys: ['A-Backspace'], expect: 'para\n\n## ‸' },
  { name: 'headings: Backspace over the selected heading text', md: 'para\n\n## «Title»', keys: ['Backspace'], expect: 'para\n\n## ‸' },
  { name: 'headings: Backspace at the start turns the heading into text', md: 'para\n\n## ‸Title', keys: ['Backspace'], expect: 'para\n\n‸Title' },
  { name: 'headings: Backspace at the start of the paragraph after joins it', md: '## Title\n\n‸body', keys: ['Backspace'], expect: '## Title‸body' },
  { name: 'headings: Hebrew heading is right-to-left', md: '‸', keys: [{ type: '# כותרת' }], expect: '# כותרת‸' },
];

const quotes: EditCase[] = [
  { name: 'quotes: typing "> " makes a quote', md: '‸', keys: [{ type: '> quoted' }], expect: '> quoted‸' },
  { name: 'quotes: Enter twice leaves the quote', md: '> quoted‸', keys: ['Enter', 'Enter', { type: 'out' }], expect: '> quoted\n\nout‸' },
  { name: 'quotes: Backspace at the start lifts the text out', md: '> ‸quoted', keys: ['Backspace'], expect: '‸quoted' },
  { name: 'quotes: Option+Backspace deletes the only word', md: 'para\n\n> word‸', keys: ['A-Backspace'], expect: 'para\n\n> ‸' },
  { name: 'callouts: Enter adds a paragraph inside', md: '> [!note]\n> body‸', keys: ['Enter', { type: 'more' }], expect: '> [!note]\n> body\n>\n> more‸' },
  { name: 'callouts: Backspace at the start lifts the text out', md: '> [!warning]\n> ‸body', keys: ['Backspace'], expect: '‸body' },
  { name: 'callouts: the type survives editing', md: '> [!tip]\n> body‸', keys: [{ type: ' more' }], expect: '> [!tip]\n> body more‸' },
];

const paragraphs: EditCase[] = [
  { name: 'text: Option+Backspace deletes the last word', md: 'hello world foo‸', keys: ['A-Backspace'], expect: 'hello world ‸' },
  { name: 'text: Option+Backspace twice', md: 'hello world foo‸', keys: ['A-Backspace', 'A-Backspace'], expect: 'hello ‸' },
  { name: 'text: Option+Backspace in a Hebrew sentence', md: 'שלום עולם טוב‸', keys: ['A-Backspace'], expect: 'שלום עולם ‸' },
  { name: 'text: Option+Backspace in mixed Hebrew and English', md: 'שלום world‸', keys: ['A-Backspace'], expect: 'שלום ‸' },
  { name: 'text: Option+Backspace deletes punctuation, then the word', md: 'hello, world‸', keys: ['A-Backspace', 'A-Backspace'], expect: 'hello‸' },
  { name: 'text: Option+Backspace mid-word deletes its start', md: 'hello wor‸ld', keys: ['A-Backspace'], expect: 'hello ‸ld' },
  { name: 'text: Option+Backspace at the start of a paragraph joins it', md: 'first\n\n‸second', keys: ['A-Backspace'], expect: 'first‸second' },
  { name: 'text: Option+Backspace keeps bold on what remains', md: 'a **bold word**‸', keys: ['A-Backspace'], expect: 'a **bold** ‸' },
  { name: 'text: Option+Delete deletes the next word', md: '‸next para', keys: ['A-Delete'], expect: '‸ para' },
  { name: 'text: Option+Backspace on the only word keeps the paragraph', md: 'a\n\nsdfl‸\n\nb', keys: ['A-Backspace'], tree: 'doc(paragraph("a") paragraph("‸") paragraph("b"))', unstableReload: true },
  { name: 'text: Backspace over a selected paragraph keeps it', md: 'a\n\n«sdfl»\n\nb', keys: ['Backspace'], tree: 'doc(paragraph("a") paragraph("‸") paragraph("b"))', unstableReload: true },
  { name: 'text: Backspace at the start joins the paragraph above', md: 'a\n\n‸b', keys: ['Backspace'], expect: 'a‸b' },
  { name: 'text: Delete at the end joins the paragraph below', md: 'a‸\n\nb', keys: ['Delete'], expect: 'a‸b' },
  { name: 'text: Shift+Enter then Backspace removes the break', md: 'line‸', keys: ['S-Enter', 'Backspace'], expect: 'line‸' },
  { name: 'text: typing after a trailing line break', md: 'a\\\n‸', keys: [{ type: 'b' }], expect: 'a\\\nb‸' },
  { name: 'text: double spaces are kept', md: 'a‸', keys: [{ type: '  b' }], expect: 'a  b‸' },
  { name: 'text: English typed into a Hebrew paragraph', md: 'שלום ‸', keys: [{ type: 'abc' }], expect: 'שלום abc‸' },
  { name: 'text: Select All then typing replaces the note', md: 'para\n\n- a\n- b\n\n‸text', keys: ['SELECT_ALL', { type: 'new' }], expect: 'new‸' },
  { name: 'text: Select All then Backspace empties the note', md: '# Title\n\n- [ ] a\n- [ ] b\n\n‸text', keys: ['SELECT_ALL', 'Backspace'], expect: '‸' },
  { name: 'text: Select All inside a checklist then Backspace', md: `${T}a‸\n${T}b`, keys: ['SELECT_ALL', 'Backspace'], expect: '‸' },
  { name: 'text: Select All then Backspace when the note starts with a table', md: `${TABLE}| c‸ | d |\n\nafter`, keys: ['SELECT_ALL', 'Backspace'], expect: '‸' },
  { name: 'text: Tab in a paragraph keeps the text', md: 'te‸xt', keys: ['Tab'], expect: 'te‸xt' },
  { name: 'text: blank paragraphs survive saving', md: 'a\n\n‸', keys: ['Enter', { type: 'b' }], tree: 'doc(paragraph("a") paragraph() paragraph("b‸"))', reloadTree: 'doc(paragraph("a") paragraph() paragraph("b"))', unstableReload: true },
];

const code: EditCase[] = [
  { name: 'code: typing ``` makes a code block', md: '‸', keys: [{ type: F + ' ' }, { type: 'let a = 1' }], expect: `${F}\nlet a = 1‸\n${F}` },
  { name: 'code: typing ```js and Enter sets the language', md: '‸', keys: [{ type: F + 'js' }, 'Enter', { type: 'let a' }], expect: `${F}js\nlet a‸\n${F}` },
  { name: 'code: Enter adds a line', md: `${F}\nline1‸\n${F}`, keys: ['Enter', { type: 'line2' }], expect: `${F}\nline1\nline2‸\n${F}` },
  { name: 'code: Enter three times at the end leaves the block', md: `${F}\nline1‸\n${F}`, keys: ['Enter', 'Enter', 'Enter', { type: 'out' }], expect: `${F}\nline1\n${F}\n\nout‸` },
  { name: 'code: ArrowDown at the end of the note leaves the block', md: `${F}\nline1‸\n${F}`, keys: ['Down', 'Down', { type: 'out' }], expect: `${F}\nline1\n${F}\n\nout‸` },
  { name: 'code: Tab indents the line', md: `${F}\n‸line1\n${F}`, keys: ['Tab'], expect: `${F}\n  ‸line1\n${F}` },
  { name: 'code: Shift+Tab outdents the line', md: `${F}\n  ‸line1\n${F}`, keys: ['S-Tab'], expect: `${F}\n‸line1\n${F}` },
  { name: 'code: Backspace at the start keeps the code', md: `para\n\n${F}\n‸line1\nline2\n${F}`, keys: ['Backspace'], expect: 'para\n\n‸line1\n\nline2' },
  { name: 'code: Backspace in an empty block turns it into text', md: `para\n\n${F}\n‸\n${F}`, keys: ['Backspace', { type: 'x' }], expect: 'para\n\nx‸' },
  { name: 'code: ArrowUp from a block at the top makes room above', md: `${F}\n‸code\n${F}`, keys: ['Up', { type: 'x' }], expect: `x‸\n\n${F}\ncode\n${F}` },
  { name: 'code: Option+Backspace deletes a word', md: `${F}\nfoo.bar(baz)‸\n${F}`, keys: ['A-Backspace'], expect: `${F}\nfoo.bar(baz‸\n${F}` },
  { name: 'code: smart typography is off', md: `${F}\n‸\n${F}`, keys: [{ type: 'a -- b "q" (c) -> 1/2 ...' }], expect: `${F}\na -- b "q" (c) -> 1/2 ...‸\n${F}` },
  { name: 'code: Hebrew in a code block', md: `${F}\n‸\n${F}`, keys: [{ type: 'שלום' }], expect: `${F}\nשלום‸\n${F}` },
  { name: 'code: pasting keeps blank lines and indentation', md: `${F}\n‸\n${F}`, keys: [{ paste: 'def f():\n    return 1\n\n\nx = 2' }], expect: `${F}\ndef f():\n    return 1\n\n\nx = 2‸\n${F}` },
];

const marks: EditCase[] = [
  { name: 'marks: **bold** as typed', md: '‸', keys: [{ type: 'a **bold** c' }], expect: 'a **bold** c‸' },
  { name: 'marks: *italic* as typed', md: '‸', keys: [{ type: 'a *it* c' }], expect: 'a *it* c‸' },
  { name: 'marks: snake_case stays plain', md: '‸', keys: [{ type: 'snake_case_name ok' }], expect: 'snake_case_name ok‸' },
  { name: 'marks: `code` as typed', md: '‸', keys: [{ type: 'run `npm i` now' }], expect: 'run `npm i` now‸' },
  { name: 'marks: ==highlight== as typed', md: '‸', keys: [{ type: 'a ==hl== c' }], expect: 'a ==hl== c‸' },
  { name: 'marks: ~~strike~~ as typed', md: '‸', keys: [{ type: 'a ~~s~~ c' }], expect: 'a ~~s~~ c‸' },
  { name: 'marks: bold in Hebrew as typed', md: '‸', keys: [{ type: 'שלום **עולם** טוב' }], expect: 'שלום **עולם** טוב‸' },
  { name: 'marks: Cmd+B then typing', md: 'a ‸', keys: ['M-b', { type: 'bold' }], expect: 'a **bold**‸' },
  { name: 'marks: typing after bold continues it', md: 'a **bold**‸', keys: [{ type: 'X' }], expect: 'a **boldX**‸' },
  { name: 'marks: typing after inline code at the end is plain', md: 'run `npm`‸', keys: [{ type: ' now' }], expect: 'run `npm` now‸' },
];

const links: EditCase[] = [
  { name: 'links: typing after a link is not linked', md: '[site](https://a.com)‸', keys: [{ type: ' more' }], expect: '[site](https://a.com) more‸' },
  { name: 'links: typing right after a link is not linked', md: '[site](https://a.com)‸', keys: [{ type: 'X' }], expect: '[site](https://a.com)X‸' },
  { name: 'links: Enter after a link', md: '[site](https://a.com)‸', keys: ['Enter', { type: 'next' }], expect: '[site](https://a.com)\n\nnext‸' },
  { name: 'links: a typed URL becomes a link', md: '‸', keys: [{ type: 'see https://example.com now' }], expect: 'see <https://example.com> now‸' },
  { name: 'links: editing an auto-linked URL updates the address', md: '‸', keys: [{ type: 'https://example.com ' }, 'Backspace', 'Backspace', { type: 'g' }], markdown: '<https://example.cog>' },
  { name: 'links: a typed Markdown link stays text', md: '‸', keys: [{ type: '[site](https://a.com) ' }], markdown: '\\[site\\](https://a.com) ' },
  { name: 'links: Option+Backspace inside a link', md: 'go [my site](https://a.com)‸', keys: ['A-Backspace'], markdown: 'go [my ](https://a.com)' },
  { name: 'links: pasting a URL over selected text links it', md: 'go «here» now', keys: [{ paste: 'https://a.com' }], markdown: 'go [here](https://a.com) now' },
  { name: 'links: relative links keep their address', md: 'see [n](other%20note.md)‸', keys: [{ type: '!' }], expect: 'see [n](other%20note.md)!‸' },
];

const tables: EditCase[] = [
  { name: 'tables: Tab moves to the next cell', md: `${TABLE}| c‸ | d |`, keys: ['Tab', { type: 'X' }], markdown: `${TABLE}| c | X |\n` },
  { name: 'tables: Tab in the last cell adds a row', md: `${TABLE}| c | d‸ |`, keys: ['Tab', { type: 'X' }], markdown: `${TABLE}| c | d |\n| X |  |\n` },
  { name: 'tables: Option+Backspace empties a cell', md: `${TABLE}| cell‸ | d |`, keys: ['A-Backspace'], markdown: `${TABLE}|  | d |\n` },
  { name: 'tables: Backspace in an empty cell does nothing', md: `${TABLE}| ‸ | d |`, keys: ['Backspace', 'Backspace'], markdown: `${TABLE}|  | d |\n` },
  { name: 'tables: ArrowDown leaves a table at the end of the note', md: `${TABLE}| c‸ | d |`, keys: ['Down', 'Down', { type: 'out' }], markdown: `${TABLE}| c | d |\n\nout` },
  { name: 'tables: ArrowUp from a table at the top makes room above', md: `| a‸ | b |\n| --- | --- |\n| c | d |`, keys: ['Up', 'Up', { type: 'x' }], markdown: `x\n\n${TABLE}| c | d |\n` },
  { name: 'tables: a typed | is kept as text', md: `${TABLE}| c‸ | d |`, keys: [{ type: ' | x' }], markdown: `${TABLE}| c \\| x | d |\n` },
  { name: 'tables: Enter in a cell keeps the table Markdown', md: `${TABLE}| c‸ | d |`, keys: ['Enter', { type: 'X' }], markdown: `${TABLE}| c<br>X | d |\n` },
  { name: 'tables: Hebrew table', md: `| שם | גיל |\n| --- | --- |\n| דני‸ | 5 |`, keys: [{ type: 'אל' }], markdown: '| שם | גיל |\n| --- | --- |\n| דניאל | 5 |\n' },
];

const typography: EditCase[] = [
  { name: 'typography: English quotes become curly', md: '‸', keys: [{ type: 'say "hi" it\'s' }], expect: 'say “hi” it’s‸' },
  { name: 'typography: -- and -> become symbols', md: '‸', keys: [{ type: 'a -- b -> c' }], expect: 'a — b → c‸' },
  { name: 'typography: dates are not turned into fractions', md: '‸', keys: [{ type: 'version 1/2/2024 ' }], expect: 'version 1/2/2024 ‸' },
  { name: 'typography: ../.. stays a path', md: '‸', keys: [{ type: 'cd ../.. and wait...' }], expect: 'cd ../.. and wait…‸' },
  { name: 'typography: Hebrew gershayim stay straight', md: '‸', keys: [{ type: 'צה"ל ו-ת"א' }], expect: 'צה"ל ו-ת"א‸' },
  { name: 'typography: Hebrew geresh stays straight', md: '‸', keys: [{ type: "ג'ירפה" }], expect: "ג'ירפה‸" },
  { name: 'typography: math is left alone', md: '‸', keys: [{ type: 'eq $x^2$ ok' }], expect: 'eq $x^2$ ok‸' },
  { name: 'typography: 2*3*4 stays as typed', md: '‸', keys: [{ type: '2*3*4 = 24' }], markdown: '2\\*3\\*4 = 24' },
  { name: 'typography: 1920x1080 stays as typed', md: '‸', keys: [{ type: '1920x1080 ' }], expect: '1920x1080 ‸' },
  { name: 'typography: << and >> stay as typed', md: '‸', keys: [{ type: 'a << b >> c' }], markdown: 'a << b >> c' },
  { name: 'typography: prices are not math', md: '‸', keys: [{ type: 'cost $5 and $10 total' }], expect: 'cost $5 and $10 total‸' },
];

const other: EditCase[] = [
  { name: 'rules: typing --- makes a horizontal rule', md: 'a\n\n‸', keys: [{ type: '---' }, { type: 'x' }], expect: 'a\n\n---\n\nx‸' },
  { name: 'rules: Backspace after a rule removes it', md: 'a\n\n---\n\n‸b', keys: ['Backspace'], expect: 'a\n\n‸b' },
  { name: 'rules: ArrowDown past a rule at the end of the note', md: 'a‸\n\n---', keys: ['Down', 'Down', { type: 'x' }], expect: 'a\n\n---\n\nx‸' },
  { name: 'images: Backspace after an image deletes it', md: 'text ![alt](assets/a.png)‸', keys: ['Backspace'], expect: 'text ‸' },
  { name: 'images: Enter after an image', md: 'a\n\n![alt](assets/a.png)‸', keys: ['Enter', { type: 'x' }], markdown: 'a\n\n![alt](assets/a.png)\n\nx' },
  { name: 'paste: plain lines become paragraphs', md: 'start ‸', keys: [{ paste: 'line one\nline two\n\nline three' }], expect: 'start line one\n\nline two\n\nline three‸' },
  { name: 'paste: Markdown is formatted', md: '‸', keys: [{ paste: '# Head\n\n- [ ] task\n- item **b**' }], markdown: '# Head\n\n- [ ] task\n\n- item **b**' },
  { name: 'paste: web HTML keeps its formatting', md: '‸', keys: [{ html: '<p style="color:red">Hello <b>bold</b></p><ul><li>one</li></ul>' }], markdown: 'Hello **bold**\n\n- one' },
  { name: 'paste: styled spans keep bold', md: 'x ‸', keys: [{ html: '<meta charset="utf-8"><span style="font-weight:700">heavy</span>' }], markdown: 'x **heavy**' },
  { name: 'paste: tabs are kept', md: '‸', keys: [{ paste: 'a\tb\tc' }], expect: 'a\tb\tc‸' },
  { name: 'paste: Hebrew lines become paragraphs', md: '‸', keys: [{ paste: 'שלום\nעולם' }], expect: 'שלום\n\nעולם‸' },
  { name: 'undo: one undo removes a burst of typing', md: 'a‸', keys: [{ type: ' one two' }, 'UNDO'], expect: 'a‸' },
  { name: 'undo: a pause starts a new undo step', md: 'a‸', keys: [{ type: ' one' }, { wait: 1200 }, { type: ' two' }, 'UNDO'], expect: 'a one‸' },
  { name: 'undo: undoing a split checklist item', md: `${T}a‸`, keys: ['Enter', { type: 'b' }, { wait: 600 }, 'UNDO', 'UNDO'], expect: `${T}a‸` },
  { name: 'undo: Option+Backspace', md: 'hello world‸', keys: ['A-Backspace', 'UNDO'], expect: 'hello world‸' },
  { name: 'undo: paste', md: 'a‸', keys: [{ paste: 'XYZ' }, 'UNDO'], expect: 'a‸' },
  { name: 'undo: direction detection is not its own step', md: '‸', keys: [{ type: 'שלום' }, 'UNDO'], expect: '‸' },
  { name: 'undo: Cmd+Z', md: 'a‸', keys: [{ type: 'bc' }, 'M-z'], expect: 'a‸' },
  { name: 'redo: Cmd+Shift+Z', md: 'a‸', keys: [{ type: 'bc' }, { wait: 600 }, 'M-z', 'M-S-z'], expect: 'abc‸' },
  { name: 'redo: Edit ▸ Redo', md: 'a‸', keys: [{ type: 'bc' }, { wait: 600 }, 'UNDO', 'REDO'], expect: 'abc‸' },
];

export const editingCases: EditCase[] = [...checklists, ...lists, ...headings, ...quotes, ...paragraphs, ...code, ...marks, ...links, ...tables, ...typography, ...other];
