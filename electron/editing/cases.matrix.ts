import type { EditCase, Key } from './types';

/**
 * Every block type × an English and a Hebrew word × common edits. Where the outcome is
 * obvious, the expected structure is derived from the starting one (for example, deleting
 * the only word must leave the same blocks with that word gone). Every case also gets the
 * runner's general checks: no errors, the DOM matches the document, and the note reopens
 * unchanged.
 */
const blocks: Record<string, string> = {
  paragraph: 'before\n\n{w}\n\nafter',
  'heading 1': 'before\n\n# {w}\n\nafter',
  'heading 3': 'before\n\n### {w}\n\nafter',
  bullet: '- before\n- {w}\n- after',
  'numbered item': '1. before\n2. {w}\n3. after',
  'checklist item': '- [ ] before\n- [ ] {w}\n- [ ] after',
  'checked item': '- [x] before\n- [x] {w}\n- [ ] after',
  'nested checklist item': '- [ ] before\n  - [ ] {w}\n- [ ] after',
  'last checklist item': '- [ ] before\n- [ ] {w}\n\nafter',
  quote: 'before\n\n> {w}\n\nafter',
  callout: '> [!note]\n> {w}\n\nafter',
  'code block': '```\n{w}\n```\n\nafter',
  'table cell': '| h1 | h2 |\n| --- | --- |\n| {w} | x |\n\nafter'
};

const words: Record<string, string> = { English: 'sdfl', Hebrew: 'שלום' };

type Placement = 'end' | 'start' | 'select';
interface Operation { placement: Placement; keys: (word: string) => Key[]; expect?: (before: string, word: string) => string }

const emptied = (marker: string) => (before: string, word: string) => before.replace(JSON.stringify(marker.replace('W', word)), JSON.stringify('‸'));
const operations: Record<string, Operation> = {
  'Option+Backspace deletes the only word': { placement: 'end', keys: () => ['A-Backspace'], expect: emptied('W‸') },
  'Backspace deletes the word letter by letter': { placement: 'end', keys: word => Array(word.length).fill('Backspace'), expect: emptied('W‸') },
  'Delete removes the word letter by letter': { placement: 'start', keys: word => Array(word.length).fill('Delete'), expect: emptied('‸W') },
  'Option+Delete deletes the only word': { placement: 'start', keys: () => ['A-Delete'], expect: emptied('‸W') },
  'Backspace over the selected word': { placement: 'select', keys: () => ['Backspace'], expect: emptied('«W»') },
  'typing over the selected word': { placement: 'select', keys: () => [{ type: 'z' }], expect: (before, word) => before.replace(JSON.stringify(`«${word}»`), JSON.stringify('z‸')) },
  'cutting the selected word': { placement: 'select', keys: () => ['CUT'], expect: emptied('«W»') },
  'typing at the end': { placement: 'end', keys: () => [{ type: 'z' }], expect: (before, word) => before.replace(JSON.stringify(`${word}‸`), JSON.stringify(`${word}z‸`)) },
  'pasting text at the end': { placement: 'end', keys: () => [{ paste: 'zz' }], expect: (before, word) => before.replace(JSON.stringify(`${word}‸`), JSON.stringify(`${word}zz‸`)) },
  'Enter at the end': { placement: 'end', keys: () => ['Enter'] },
  'Enter at the start': { placement: 'start', keys: () => ['Enter'] },
  'Backspace at the start': { placement: 'start', keys: () => ['Backspace'] },
  'Shift+Enter at the end': { placement: 'end', keys: () => ['S-Enter', { type: 'z' }] },
  'Tab at the start': { placement: 'start', keys: () => ['Tab'] }
};

/**
 * Known bugs the matrix runs into, by block and operation; none at present. To map new
 * failures, run with EDITING_VERBOSE=1 and flag them here.
 */
function knownBug(_block: string, _operation: string): string | undefined {
  return undefined;
}

export const matrixCases: EditCase[] = [];
for (const [block, template] of Object.entries(blocks)) {
  for (const [language, word] of Object.entries(words)) {
    for (const [operation, spec] of Object.entries(operations)) {
      const marked = spec.placement === 'end' ? `${word}‸` : spec.placement === 'start' ? `‸${word}` : `«${word}»`;
      const expect = spec.expect;
      matrixCases.push({
        name: `matrix: ${block}, ${language}: ${operation}`,
        md: template.replace('{w}', marked),
        keys: spec.keys(word),
        treeFrom: expect ? before => expect(before, word) : undefined,
        bug: knownBug(block, operation)
      });
    }
  }
}
