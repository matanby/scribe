import type { EditCase } from './types';

/**
 * Markdown fidelity: a note is opened and an edit is made at the very end, so the whole
 * file is saved again. `saved` is what should be written (defaults to the original plus
 * the edit). Harmless normalisations (bullet characters, fence style) are expected;
 * changes in meaning are flagged as bugs.
 */
const fidelity = (name: string, original: string, options: { saved?: string; bug?: string } = {}): EditCase => ({
  name: `markdown: ${name}`,
  md: `${original}\n\nend‸`,
  keys: [{ type: '!' }],
  markdown: `${options.saved ?? original}\n\nend!`,
  bug: options.bug
});

export const markdownCases: EditCase[] = [
  // Kept exactly.
  fidelity('paragraphs', 'one\n\ntwo'),
  fidelity('ordered list starting at 5', '5. five\n6. six'),
  fidelity('loose list', '- a\n\n- b'),
  fidelity('nested ordered list in a bullet', '- a\n  1. one\n  2. two'),
  fidelity('checklist with a continuation paragraph', '- [ ] task\n\n  more text'),
  fidelity('fenced code with blank lines and trailing spaces', '```py\ndef f():\n\n    return 1  \n```'),
  fidelity('backslash line break', 'line one\\\nline two'),
  fidelity('nested quote', '> a\n>\n> > b'),
  fidelity('callout of an unknown type', '> [!faq]\n> q'),
  fidelity('emoji and symbols', '🎉 done ✓ → next'),
  fidelity('ampersands', 'Tom & Jerry & co'),
  fidelity('angle-bracket autolink', '<https://a.com>'),
  fidelity('bare URLs become links', 'visit https://a.com/path_with_underscores?q=1', { saved: 'visit <https://a.com/path_with_underscores?q=1>' }),
  fidelity('hashtags', '#idea #todo/later text'),
  fidelity('Hebrew paragraph ending in English', 'שלום world!'),
  fidelity('mixed-direction list', '- אחד\n- two\n- שלוש'),
  fidelity('inline math', 'eq $x^2$ ok'),
  fidelity('highlight', '==hl=='),
  fidelity('underline', '<u>u</u>'),
  fidelity('relative note link', '[n](other%20note.md)'),
  fidelity('checked and unchecked items', '- [x] done\n- [ ] todo'),
  fidelity('nested checklist', '- [ ] a\n  - [x] b\n    - [ ] c'),
  fidelity('table', '| a | b |\n| --- | --- |\n| 1 | 2 |'),
  fidelity('Hebrew table', '| שם | גיל |\n| --- | --- |\n| דני | 5 |'),
  fidelity('bold, italic, strike and code together', '**b** *i* ~~s~~ `c`'),
  fidelity('link with parentheses in the URL', '[a](https://en.wikipedia.org/wiki/Foo_\\(bar\\))'),

  // Harmless normalisations.
  fidelity('star bullets become dashes', '* a\n* b', { saved: '- a\n- b' }),
  fidelity('plus bullets become dashes', '+ a\n+ b', { saved: '- a\n- b' }),
  fidelity('"1)" lists become "1."', '1) one\n2) two', { saved: '1. one\n2. two' }),
  fidelity('four-space nesting becomes two', '- a\n    - b', { saved: '- a\n  - b' }),
  fidelity('tab nesting becomes two spaces', '- a\n\t- b', { saved: '- a\n  - b' }),
  fidelity('uppercase [X] becomes [x]', '- [X] done', { saved: '- [x] done' }),
  fidelity('star checklist becomes a dash', '* [ ] task', { saved: '- [ ] task' }),
  fidelity('setext headings become #', 'Title\n=====\n\nSub\n---', { saved: '# Title\n\n## Sub' }),
  fidelity('closing #s are dropped', '## Title ##', { saved: '## Title' }),
  fidelity('indented code becomes fenced', 'para\n\n    code line\n    more', { saved: 'para\n\n```\ncode line\nmore\n```' }),
  fidelity('tilde fences become backticks', '~~~\ncode\n~~~', { saved: '```\ncode\n```' }),
  fidelity('underscore emphasis becomes stars', '_it_ and __bold__', { saved: '*it* and **bold**' }),
  fidelity('trailing-space break becomes a backslash', 'line one  \nline two', { saved: 'line one\\\nline two' }),
  fidelity('<br> becomes a backslash break', 'a<br>b', { saved: 'a\\\nb' }),
  fidelity('*** and ___ rules become ---', 'a\n\n***\n\nb\n\n___\n\nc', { saved: 'a\n\n---\n\nb\n\n---\n\nc' }),
  fidelity('reference links become inline', '[text][ref]\n\n[ref]: https://a.com', { saved: '[text](https://a.com)' }),
  fidelity('lists numbered past 9 are aligned', '9. a\n10. b', { saved: ' 9. a\n10. b' }),
  fidelity('Windows line endings', 'a\r\n\r\nb', { saved: 'a\n\nb' }),

  // Changes in meaning.
  fidelity('wiki links', 'See [[Other Note]] and [[Note|alias]].'),
  fidelity('footnotes', 'Text with note[^1].\n\n[^1]: The note.'),
  fidelity('headings 4 to 6', '#### Four\n\n##### Five\n\n###### Six'),
  fidelity('single line breaks', 'line one\nline two'),
  fidelity('block math', '$$\nx^2\n$$'),
  fidelity('HTML comments', 'a\n\n<!-- hidden note -->\n\nb'),
  fidelity('inline HTML tags', 'press <kbd>Cmd</kbd> for x<sup>2</sup>'),
  fidelity('details blocks', '<details>\n<summary>More</summary>\n\nHidden\n\n</details>'),
  fidelity('angle brackets', 'a < b > c and x->y'),
  fidelity('literal asterisks', '5 * 3 = 15'),
  fidelity('single tildes are escaped (GitHub reads ~a~ as strikethrough)', '~a~', { saved: '\\~a\\~' }),
  fidelity('numbered checklist', '1. [ ] task'),
  fidelity('callout with a title', '> [!warning] Be careful\n> body'),
  fidelity('table alignment', '| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |', { saved: '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |' }),
  fidelity('pipe inside inline code in a table', '| a | b |\n| --- | --- |\n| `x \\| y` | 2 |'),
  fidelity('link titles', '[a](https://a.com "t")'),
  fidelity('images', '![alt](assets/a.png)'),
  fidelity('images with titles', '![alt](assets/a.png "title")'),
  fidelity('images with spaces in the path', '![alt](<assets/my image.png>)', { saved: '![alt](assets/my%20image.png)' }),
  fidelity('several blank lines', 'one\n\n\n\ntwo'),
  fidelity('empty checklist item mid-list', '- [ ] a\n- [ ] \n- [ ] c'),
];
