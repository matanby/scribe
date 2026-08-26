/**
 * Behavioural tests for the notes filesystem layer.
 *
 * Run with:  npx tsx electron/fileSystem.test.ts
 *
 * These cover the cases that previously caused silent data loss: watcher echoes being
 * mistaken for external edits, trash collisions overwriting notes, and frontmatter being
 * destroyed on save.
 */
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';

import {
  assertInsideRoot,
  createFolder,
  createNote,
  deleteFolder,
  duplicateNote,
  emptyTrash,
  moveNote,
  moveToTrash,
  readAllNotesTree,
  readNoteContent,
  renameNote,
  restoreFromTrash,
  saveNoteContent,
  startWatchingWindow,
  withFileLock,
  NotesChangedPayload
} from './fileSystem';

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function makeVault(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'scribe-test-'));
}

async function testFrontmatterPreservation() {
  console.log('\nfrontmatter preservation');
  const root = await makeVault();
  const filePath = path.join(root, 'note.md');

  const original = [
    '---',
    '# a comment YAML round-tripping would drop',
    'zzz: last',
    'aaa: first',
    'tags: [a, b]',
    '---',
    'body text'
  ].join('\n');
  await fs.writeFile(filePath, original, 'utf-8');

  const read = await readNoteContent(filePath);
  eq('body excludes frontmatter', read.markdown.trim(), 'body text');

  await saveNoteContent(filePath, 'edited body');
  const after = await fs.readFile(filePath, 'utf-8');

  check('comment survives save', after.includes('# a comment YAML round-tripping would drop'));
  check('key order preserved', after.indexOf('zzz: last') < after.indexOf('aaa: first'));
  check('new body written', after.includes('edited body'));
  check('old body gone', !after.includes('body text'));

  // Malformed YAML must not leak into the body, or the editor would render it as
  // horizontal rules and the next save would destroy it.
  const brokenPath = path.join(root, 'broken.md');
  await fs.writeFile(brokenPath, '---\nkey: [unclosed\n---\nreal body\n', 'utf-8');
  const brokenRead = await readNoteContent(brokenPath);
  eq('malformed yaml kept out of body', brokenRead.markdown.trim(), 'real body');

  await saveNoteContent(brokenPath, 'new body\n');
  const brokenAfter = await fs.readFile(brokenPath, 'utf-8');
  check('malformed yaml still on disk', brokenAfter.includes('key: [unclosed'));

  await fs.rm(root, { recursive: true, force: true });
}

async function testGhostFileGuard() {
  console.log('\nsave guard for vanished notes');
  const root = await makeVault();
  const filePath = path.join(root, 'gone.md');

  let threw = false;
  try {
    await saveNoteContent(filePath, 'content');
  } catch {
    threw = true;
  }
  check('save to a missing path is rejected', threw);
  check('no file was resurrected', !fsSync.existsSync(filePath));

  await fs.rm(root, { recursive: true, force: true });
}

async function testTrashCollisions() {
  console.log('\ntrash collisions and restore');
  const root = await makeVault();
  const workDir = await createFolder(root, 'Work');
  const personalDir = await createFolder(root, 'Personal');

  const a = await createNote(root, workDir, 'Notes', 'work content');
  const b = await createNote(root, personalDir, 'Notes', 'personal content');

  await moveToTrash(a.filePath, root);
  await moveToTrash(b.filePath, root);

  const tree = await readAllNotesTree(root);
  eq('both notes are in the trash', tree.trashNotes.length, 2);

  const contents = await Promise.all(
    tree.trashNotes.map(n => fs.readFile(n.filePath, 'utf-8'))
  );
  check('work content survived', contents.some(c => c.includes('work content')));
  check('personal content survived', contents.some(c => c.includes('personal content')));

  // Restore should return each note to the folder it was deleted from.
  const workTrashed = tree.trashNotes.find((_, i) => contents[i].includes('work content'))!;
  const restored = await restoreFromTrash(workTrashed.filePath, root);
  eq('restored to original folder', path.dirname(restored), workDir);

  await fs.rm(root, { recursive: true, force: true });
}

async function testEmptyTrashWithFolders() {
  console.log('\nempty trash with folders present');
  const root = await makeVault();
  const folder = await createFolder(root, 'Archive');
  await createNote(root, folder, 'Inside', 'x');
  const loose = await createNote(root, root, 'Loose', 'y');

  await deleteFolder(folder, root);
  await moveToTrash(loose.filePath, root);

  await emptyTrash(root);

  const remaining = await fs.readdir(path.join(root, '.trash'));
  const realEntries = remaining.filter(e => e !== '.scribe-trash.json');
  eq('trash is empty including directories', realEntries.length, 0);

  await fs.rm(root, { recursive: true, force: true });
}

async function testFolderMetadata() {
  console.log('\nrelative folder metadata');
  const root = await makeVault();
  const parent = await createFolder(root, 'Parent');
  const child = await createFolder(parent, 'Child');

  const created = await createNote(root, child, 'Deep', 'content');
  eq('createNote reports nested relative folder', created.folder, path.join('Parent', 'Child'));

  const rootNote = await createNote(root, root, 'Top', 'content');
  eq('root notes report "/"', rootNote.folder, '/');

  const renamed = await renameNote(root, created.filePath, 'Renamed');
  eq('renameNote keeps nested folder', renamed.folder, path.join('Parent', 'Child'));

  const moved = await moveNote(root, renamed.filePath, parent);
  eq('moveNote reports new relative folder', moved.folder, 'Parent');

  const duplicated = await duplicateNote(root, moved.filePath);
  eq('duplicateNote reports relative folder', duplicated.folder, 'Parent');

  const tree = await readAllNotesTree(root);
  const scanned = tree.allNotes.find(n => n.filePath === moved.filePath);
  eq('tree scan agrees with moveNote', scanned?.folder, 'Parent');

  await fs.rm(root, { recursive: true, force: true });
}

async function testTitleAndCollisionHandling() {
  console.log('\nnote naming');
  const root = await makeVault();

  const first = await createNote(root, root, 'Same', 'one');
  const second = await createNote(root, root, 'Same', 'two');
  check('duplicate titles get distinct files', first.filePath !== second.filePath);
  eq('first keeps the plain name', path.basename(first.filePath), 'Same.md');

  const renamed = await renameNote(root, second.filePath, 'Same');
  check('rename onto an existing name does not clobber', fsSync.existsSync(first.filePath));
  eq('original content intact', (await fs.readFile(first.filePath, 'utf-8')).trim(), 'one');
  eq('renamed content intact', (await fs.readFile(renamed.filePath, 'utf-8')).trim(), 'two');

  const sanitized = await renameNote(root, renamed.filePath, 'a/b:c');
  check('illegal characters sanitized', !path.basename(sanitized.filePath).includes('/'));

  await fs.rm(root, { recursive: true, force: true });
}

async function testPathContainment() {
  console.log('\npath containment');
  const root = await makeVault();

  check('inside root allowed', (() => {
    try {
      assertInsideRoot(root, path.join(root, 'a', 'b.md'));
      return true;
    } catch {
      return false;
    }
  })());

  check('escape via .. rejected', (() => {
    try {
      assertInsideRoot(root, path.join(root, '..', 'secrets.md'));
      return false;
    } catch {
      return true;
    }
  })());

  check('absolute outside path rejected', (() => {
    try {
      assertInsideRoot(root, '/etc/passwd');
      return false;
    } catch {
      return true;
    }
  })());

  await fs.rm(root, { recursive: true, force: true });
}

async function testFileLockOrdering() {
  console.log('\nper-file operation ordering');
  const root = await makeVault();
  const note = await createNote(root, root, 'Ordered', 'initial');

  // A read issued immediately after a save must observe the save, which is what lets the
  // editor remount safely while its own flush is still in flight.
  const savePromise = withFileLock(note.filePath, () => saveNoteContent(note.filePath, 'flushed content'));
  const readPromise = withFileLock(note.filePath, () => readNoteContent(note.filePath));

  await savePromise;
  const read = await readPromise;
  eq('read observes the preceding write', read.markdown.trim(), 'flushed content');

  await fs.rm(root, { recursive: true, force: true });
}

async function testWatcherSelfWriteSuppression() {
  console.log('\nwatcher echo suppression');
  const root = await makeVault();
  const note = await createNote(root, root, 'Watched', 'initial content');

  const events: NotesChangedPayload[] = [];
  startWatchingWindow(1, root, payload => events.push(payload));

  // chokidar needs a moment to prime its watch on the directory.
  await sleep(600);

  await saveNoteContent(note.filePath, 'edited by the app');
  await sleep(1200);
  eq('our own save produces no external-change event', events.length, 0);

  // A write from another process must still be reported.
  await fs.writeFile(note.filePath, 'edited by another app', 'utf-8');
  await sleep(1500);

  check('external edit is reported', events.length > 0);
  check(
    'external edit names the changed file',
    events.some(e => e.changedPaths.some(p => path.resolve(p) === path.resolve(note.filePath)))
  );

  // A rapid burst should coalesce rather than triggering a rescan per event.
  const before = events.length;
  for (let i = 0; i < 5; i++) {
    await fs.writeFile(note.filePath, `burst ${i}`, 'utf-8');
    await sleep(20);
  }
  await sleep(1500);
  check('burst of writes is coalesced', events.length - before <= 2, `got ${events.length - before} events`);

  const { removeWindowTracking } = await import('./fileSystem');
  removeWindowTracking(1);
  await fs.rm(root, { recursive: true, force: true });
}

async function main() {
  await testFrontmatterPreservation();
  await testGhostFileGuard();
  await testTrashCollisions();
  await testEmptyTrashWithFolders();
  await testFolderMetadata();
  await testTitleAndCollisionHandling();
  await testPathContainment();
  await testFileLockOrdering();
  await testWatcherSelfWriteSuppression();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
