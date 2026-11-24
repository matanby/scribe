/**
 * Editing behaviour tests against the real, built Scribe app.
 *
 * Opens a scratch note in the built app (run `npm run build` first), and for each case
 * loads Markdown into the live editor, sends real keyboard events through Electron,
 * and checks the caret, the saved Markdown, the structure, that the DOM matches the
 * document, that nothing logged an error, and that saving and reopening the note
 * changes nothing.
 *
 * Cases flagged with a known bug must fail; one that passes is reported so the flag
 * gets removed. Run a subset with EDITING_ONLY=<substring of the case name>.
 */
import { app, clipboard, BrowserWindow, Menu, MenuItem } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EditCase, Key, Snapshot } from './editing/types';
import { KNOWN_BUGS } from './editing/bugs';
import { editingCases } from './editing/cases.editing';
import { markdownCases } from './editing/cases.markdown';
import { matrixCases } from './editing/cases.matrix';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scribe-editing-tests-'));
const note = path.join(root, 'note.md');
fs.writeFileSync(note, 'x\n');
process.env.SCRIBE_PREVIEW_DATA = path.join(root, 'data');
process.argv.push(note);

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const MODIFIERS: Record<string, 'meta' | 'alt' | 'shift' | 'control'> = { M: 'meta', A: 'alt', S: 'shift', C: 'control' };
const finish = (code: number) => { fs.rmSync(root, { recursive: true, force: true }); app.exit(code); };

/** Shortcuts macOS text fields own. A menu accelerator on one of these steals it from the editor. */
const TEXT_EDITING_SHORTCUTS = ['Cmd+Backspace', 'Cmd+Delete', 'Alt+Backspace', 'Alt+Delete', 'Cmd+Left', 'Cmd+Right', 'Cmd+Up', 'Cmd+Down', 'Alt+Left', 'Alt+Right', 'Ctrl+A', 'Ctrl+E', 'Ctrl+K', 'Ctrl+H', 'Ctrl+D'];
const MENU_BUGS: Record<string, string> = {};

function canonical(accelerator: string) {
  return accelerator.split('+').map(part => ({ CmdOrCtrl: 'Cmd', CommandOrControl: 'Cmd', Command: 'Cmd', Control: 'Ctrl', Option: 'Alt' } as Record<string, string>)[part] || part).join('+');
}

/** An Edit menu item by its role or id. */
function findMenuItem(name: string): MenuItem | undefined {
  let found: MenuItem | undefined;
  const visit = (items: MenuItem[]) => items.forEach(item => {
    if (!found && (String(item.role || '').toLowerCase() === name || item.id === name)) found = item;
    if (item.submenu) visit(item.submenu.items);
  });
  visit(Menu.getApplicationMenu()?.items || []);
  return found;
}

function menuAccelerators() {
  const found: { label: string; accelerator: string }[] = [];
  const visit = (items: MenuItem[]) => items.forEach(item => {
    // An accelerator that is only displayed (registerAccelerator: false) leaves the key to the page.
    if (item.accelerator && (item as any).registerAccelerator !== false) found.push({ label: item.label, accelerator: canonical(String(item.accelerator)) });
    if (item.submenu) visit(item.submenu.items);
  });
  visit(Menu.getApplicationMenu()?.items || []);
  return found;
}

async function run(window: BrowserWindow) {
  const js = <T = any>(code: string): Promise<T> => window.webContents.executeJavaScript(code);
  for (let attempt = 0; attempt < 100 && !(await js('!!document.querySelector(".ProseMirror")?.editor')); attempt++) await wait(100);
  await js(fs.readFileSync(path.join(__dirname, 'editing.harness.js'), 'utf8') + ';0');
  window.focus();
  window.webContents.focus();

  const press = async (key: Key) => {
    const contents = window.webContents;
    if (typeof key === 'object') {
      if ('type' in key) {
        for (const char of key.type) {
          if (char === '\n') { await press('Enter'); continue; }
          contents.sendInputEvent({ type: 'keyDown', keyCode: char });
          contents.sendInputEvent({ type: 'char', keyCode: char });
          contents.sendInputEvent({ type: 'keyUp', keyCode: char });
          await wait(12);
        }
      } else if ('paste' in key) { clipboard.writeText(key.paste); contents.paste(); }
      else if ('html' in key) { clipboard.write({ html: key.html, text: key.text ?? key.html.replace(/<[^>]+>/g, '') }); contents.paste(); }
      else if ('wait' in key) await wait(key.wait);
      await wait(60);
      return;
    }
    const menuCommands: Record<string, string> = { UNDO: 'undo', REDO: 'redo', CUT: 'cut', COPY: 'copy', PASTE: 'paste', SELECT_ALL: 'selectall' };
    if (menuCommands[key]) {
      // Go through the Edit menu item, as the keyboard shortcut does.
      const item = findMenuItem(menuCommands[key]);
      if (!item) throw new Error(`No Edit menu item for ${key}`);
      // Built-in roles only act on real menu events, so run them the way the role does.
      const role = String(item.role || '').toLowerCase();
      const roles: Record<string, () => void> = { undo: () => contents.undo(), redo: () => contents.redo(), cut: () => contents.cut(), copy: () => contents.copy(), paste: () => contents.paste(), selectall: () => contents.selectAll() };
      if (roles[role]) roles[role]();
      else item.click(undefined, window, contents);
      await wait(80);
      return;
    }
    const parts = key.split('-');
    const code = parts.pop()!;
    const modifiers = parts.map(part => MODIFIERS[part]);
    contents.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers });
    const printable = code.length === 1 && !modifiers.includes('meta') && !modifiers.includes('control');
    if (printable) contents.sendInputEvent({ type: 'char', keyCode: code, modifiers });
    if (code === 'Enter') contents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
    contents.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers });
    await wait(50);
  };

  const check = async (test: EditCase): Promise<string[]> => {
    const before: string = await js(`__editingHarness.setup(${JSON.stringify(test.md)})`);
    await wait(40);
    for (const key of test.keys || []) await press(key);
    await wait(80);
    const after: Snapshot = await js('__editingHarness.snapshot()');
    const problems: string[] = [];
    const compare = (label: string, actual: string, expected: string | undefined) => {
      if (expected !== undefined && actual !== expected) problems.push(`${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
    };
    compare('Markdown with caret', after.caret, test.expect);
    compare('saved Markdown', after.markdown, test.markdown);
    compare('structure', after.tree, test.tree);
    if (test.treeFrom) compare('structure', after.tree, test.treeFrom(before));
    if (after.dom) problems.push(after.dom);
    if (after.errors.length) problems.push(`errors: ${after.errors.join(' | ')}`);
    if (!test.unstableReload || test.reloadTree) {
      const reopened: { markdown: string; tree: string } = await js('__editingHarness.reload()');
      // Markdown itself drops leading and trailing spaces and collapses runs of spaces in text.
      const settle = (markdown: string) => markdown
        .replace(/[ \t]+$/gm, '').replace(/(^|\n\n)[ \t]+(?=\S)/g, '$1')
        .replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ').replace(/(\S)\t(?=\S)/g, '$1 ').replace(/ +\]\(/g, '](');
      if (!test.unstableReload) compare('Markdown after saving and reopening', settle(reopened.markdown), settle(after.markdown));
      compare('structure after saving and reopening', reopened.tree, test.reloadTree);
    }
    return problems;
  };

  const only = process.env.EDITING_ONLY;
  const all = [...editingCases, ...markdownCases, ...matrixCases].filter(test => !only || test.name.includes(only));
  const names = new Set<string>();
  for (const test of all) { if (names.has(test.name)) throw new Error(`Duplicate case name: ${test.name}`); names.add(test.name); }

  let passed = 0;
  const failures: string[] = [], stillBuggy: Record<string, number> = {}, fixed: string[] = [];
  const record = (name: string, bug: string | undefined, problems: string[]) => {
    if (bug && !KNOWN_BUGS[bug]) problems = [`unknown bug id "${bug}"`];
    if (!bug && !problems.length) { passed++; return; }
    if (!bug) { failures.push(`FAIL ${name}\n    ${problems.join('\n    ')}`); return; }
    if (problems.length) { stillBuggy[bug] = (stillBuggy[bug] || 0) + 1; return; }
    fixed.push(`PASSES ${name} — remove its bug flag "${bug}"`);
  };

  const accelerators = menuAccelerators();
  for (const shortcut of TEXT_EDITING_SHORTCUTS) {
    const name = `menu: ${shortcut} is left to text editing`;
    if (only && !name.includes(only)) continue;
    const owner = accelerators.find(item => item.accelerator === shortcut);
    record(name, MENU_BUGS[shortcut], owner ? [`the "${owner.label}" menu item uses ${shortcut}`] : []);
  }

  for (const test of all) {
    let problems: string[];
    try { problems = await check(test); } catch (error: any) { problems = [`harness error: ${error.message}`]; }
    record(test.name, test.bug, problems);
    if (process.env.EDITING_VERBOSE) console.log(`${problems.length ? (test.bug ? 'bug ' : 'FAIL') : 'ok  '} ${test.name}${problems.length ? '\n    ' + problems.join('\n    ') : ''}`);
  }

  failures.forEach(failure => console.log(failure));
  fixed.forEach(line => console.log(line));
  const known = Object.entries(stillBuggy);
  if (known.length) {
    console.log('\nKnown bugs still present:');
    known.forEach(([bug, count]) => console.log(`  ${bug} (${count} case${count === 1 ? '' : 's'}): ${KNOWN_BUGS[bug]}`));
  }
  const buggy = known.reduce((sum, [, count]) => sum + count, 0);
  console.log(`\n${passed} editing checks passed, ${buggy} known-bug checks still failing, ${failures.length + fixed.length} unexpected`);
  return failures.length + fixed.length ? 1 : 0;
}

app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', () => {
    run(window).then(finish, error => { console.error(error); finish(1); });
  });
});

setTimeout(() => { console.error('Editing tests timed out'); finish(1); }, 15 * 60 * 1000).unref();

// The built main process opens the scratch note in a document window.
require(path.join(__dirname, 'main.js'));
