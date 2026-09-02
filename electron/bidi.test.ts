/**
 * Behavioural tests for bidirectional (BiDi) RTL and list direction detection.
 *
 * Run with:  npx tsx electron/bidi.test.ts
 */
import {
  getDirection,
  getDocDirection,
  getListDirection
} from '../src/extensions/BiDiExtension';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function testTextDirectionDetection() {
  console.log('\ntext direction detection');

  eq('hebrew word is rtl', getDirection('שלום'), 'rtl');
  eq('english word is ltr', getDirection('hello'), 'ltr');
  eq('numbers leading with hebrew is rtl', getDirection('123 שלום'), 'rtl');
  eq('numbers leading with english is ltr', getDirection('123 hello'), 'ltr');
  eq('parentheses leading with hebrew is rtl', getDirection('(א) סעיף ראשון'), 'rtl');
  eq('empty string is auto', getDirection(''), 'auto');
  eq('whitespace only is auto', getDirection('   '), 'auto');
}

function testDocDirectionDetection() {
  console.log('\ndoc direction detection');

  const mockDoc = (textContent: string) => ({ textContent });

  eq('hebrew doc is rtl', getDocDirection(mockDoc('כותרת בעברית וטקסט')), 'rtl');
  eq('english doc is ltr', getDocDirection(mockDoc('Title in English and text')), 'ltr');
  eq('empty doc defaults to ltr', getDocDirection(mockDoc('')), 'ltr');
  eq('doc with neutral prefix and hebrew is rtl', getDocDirection(mockDoc('123. שלום')), 'rtl');
}

function testListDirectionDetection() {
  console.log('\nlist direction detection');

  const mockList = (items: string[], overallText?: string) => {
    const children = items.map(text => ({ textContent: text }));
    return {
      textContent: overallText ?? items.join(' '),
      forEach: (cb: (child: any) => void) => children.forEach(cb)
    };
  };

  // Pure Hebrew list
  const hebrewList = mockList(['פריט ראשון', 'פריט שני']);
  eq('all hebrew items list is rtl', getListDirection(hebrewList, 'ltr'), 'rtl');

  // Pure English list
  const englishList = mockList(['first item', 'second item']);
  eq('all english items list is ltr', getListDirection(englishList, 'rtl'), 'ltr');

  // Mixed list in Hebrew note (Hebrew items + English tech term like "iPhone")
  const mixedList = mockList(['קניות בסופר', 'iPhone 16 cable', 'לחם וגבינה']);
  eq('hebrew list containing english item is rtl', getListDirection(mixedList, 'ltr'), 'rtl');

  // Empty list inherits fallback direction
  const emptyList = mockList(['', ''], '');
  eq('empty list in hebrew context inherits rtl', getListDirection(emptyList, 'rtl'), 'rtl');
  eq('empty list in english context inherits ltr', getListDirection(emptyList, 'ltr'), 'ltr');

  // Numbers-only items in Hebrew context inherits fallback
  const numericList = mockList(['100', '200'], '100 200');
  eq('numeric items list in hebrew context inherits rtl', getListDirection(numericList, 'rtl'), 'rtl');
  eq('numeric items list in english context inherits ltr', getListDirection(numericList, 'ltr'), 'ltr');
}

async function run() {
  testTextDirectionDetection();
  testDocDirectionDetection();
  testListDirectionDetection();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

void run();
