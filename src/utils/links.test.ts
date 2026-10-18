import assert from 'node:assert/strict';
import { normalizeLink } from './links';

for (const [input, expected] of [
  [' example.com/notes ', 'https://example.com/notes'],
  ['https://example.com/a?q=one#two', 'https://example.com/a?q=one#two'],
  ['http://localhost:3000', 'http://localhost:3000'],
  ['mailto:hello@example.com', 'mailto:hello@example.com'],
  ['tel:+441234567890', 'tel:+441234567890'],
  ['../Other%20Note.md#heading', '../Other%20Note.md#heading'],
  ['./assets/reference.pdf', './assets/reference.pdf'],
  ['MyNote.md', 'MyNote.md'],
  ['#מחשבות', '#מחשבות'],
  ['https://example.com/עברית', 'https://example.com/עברית']
]) assert.equal(normalizeLink(input), expected);
for (const input of ['', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', 'java\nscript:alert(1)', 'https://', 'example.com/a b']) {
  assert.throws(() => normalizeLink(input), input);
}
console.log('18 link destination checks passed');
