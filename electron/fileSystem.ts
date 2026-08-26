import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import matter from 'gray-matter';
import chokidar, { FSWatcher } from 'chokidar';
import { app } from 'electron';
import { NoteMeta, FolderNode, NotesTree } from './types';

function getDefaultNotesPath(): string {
  try {
    if (app && app.getPath) {
      return path.join(app.getPath('documents'), 'Scribe Notes');
    }
  } catch {}
  return path.join(process.env.HOME || process.cwd(), 'Documents', 'Scribe Notes');
}

function getConfigPath(): string {
  try {
    if (app && app.getPath) {
      return path.join(app.getPath('userData'), 'scribe-config.json');
    }
  } catch {}
  return path.join(process.env.HOME || '', '.scribe-config.json');
}

export function loadSavedRoot(): string {
  try {
    const cfg = getConfigPath();
    if (fsSync.existsSync(cfg)) {
      const parsed = JSON.parse(fsSync.readFileSync(cfg, 'utf-8'));
      if (parsed.notesPath && fsSync.existsSync(parsed.notesPath)) {
        return parsed.notesPath;
      }
    }
  } catch {}
  return getDefaultNotesPath();
}

export function saveSavedRoot(p: string) {
  try {
    const cfg = getConfigPath();
    fsSync.writeFileSync(cfg, JSON.stringify({ notesPath: p }, null, 2), 'utf-8');
  } catch {}
}

const windowRoots = new Map<number, string>();
const windowWatchers = new Map<number, FSWatcher>();

/**
 * Self-write bookkeeping.
 *
 * Every filesystem mutation the app performs is echoed back to us by the watcher a
 * short time later. Those echoes must not be reported as external edits, otherwise the
 * renderer reloads the note the user is currently typing into and discards their work.
 *
 * Content writes are matched by hash so that a genuine external edit landing inside the
 * suppression window is still reported. Structural operations (rename/move/delete) have
 * no content to compare, so they fall back to a time-boxed path match.
 */
const SELF_WRITE_TTL_MS = 8000;
const selfWrites = new Map<string, { hash: string; until: number }>();
const selfOps = new Map<string, number>();

function hashContent(content: string): string {
  return crypto.createHash('sha1').update(content, 'utf-8').digest('hex');
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath);
}

function markSelfWrite(filePath: string, content: string) {
  selfWrites.set(normalizePath(filePath), {
    hash: hashContent(content),
    until: Date.now() + SELF_WRITE_TTL_MS
  });
}

function markSelfOp(...filePaths: string[]) {
  const until = Date.now() + SELF_WRITE_TTL_MS;
  for (const p of filePaths) {
    if (p) selfOps.set(normalizePath(p), until);
  }
}

function pruneSelfTracking() {
  const now = Date.now();
  for (const [key, entry] of selfWrites) {
    if (entry.until < now) selfWrites.delete(key);
  }
  for (const [key, until] of selfOps) {
    if (until < now) selfOps.delete(key);
  }
}

/**
 * Returns true when this watcher event was caused by our own write and carries nothing new.
 */
async function isSelfInflicted(filePath: string, eventType: string): Promise<boolean> {
  pruneSelfTracking();
  const key = normalizePath(filePath);
  const now = Date.now();

  const op = selfOps.get(key);
  if (op !== undefined && op >= now) {
    selfOps.delete(key);
    return true;
  }

  const write = selfWrites.get(key);
  if (!write || write.until < now) return false;

  if (eventType === 'unlink' || eventType === 'unlinkDir') {
    selfWrites.delete(key);
    return true;
  }

  try {
    const current = await fs.readFile(filePath, 'utf-8');
    if (hashContent(current) === write.hash) {
      // Exactly what we wrote. Keep the entry: macOS can emit several events per write.
      return true;
    }
    // Someone else has touched the file since our write; report it.
    selfWrites.delete(key);
    return false;
  } catch {
    return false;
  }
}

const fileLocks = new Map<string, Promise<unknown>>();

/**
 * Serializes operations on a single file so that a read issued right after a save is
 * guaranteed to observe that save. Without this, the editor could remount and reload
 * stale content while its own flush was still in flight.
 */
export function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = normalizePath(filePath);
  const previous = fileLocks.get(key) ?? Promise.resolve();
  const result = previous.then(fn, fn);
  const tracked = result.catch(() => undefined);
  fileLocks.set(key, tracked);
  void tracked.then(() => {
    if (fileLocks.get(key) === tracked) fileLocks.delete(key);
  });
  return result;
}

/**
 * Guards against a compromised or buggy renderer asking the main process to touch files
 * outside the folder the user actually opened.
 */
export function assertInsideRoot(rootDir: string, target: string): string {
  const root = normalizePath(rootDir);
  const resolved = normalizePath(target);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to operate on a path outside the notes folder: ${target}`);
  }
  return resolved;
}

export function getWindowRoot(webContentsId?: number): string {
  if (webContentsId && windowRoots.has(webContentsId)) {
    return windowRoots.get(webContentsId)!;
  }
  return loadSavedRoot();
}

export function setWindowRoot(webContentsId: number, newPath: string) {
  if (fsSync.existsSync(newPath)) {
    windowRoots.set(webContentsId, newPath);
    saveSavedRoot(newPath);
  }
}

export function removeWindowTracking(webContentsId: number) {
  const watcher = windowWatchers.get(webContentsId);
  if (watcher) {
    watcher.close();
    windowWatchers.delete(webContentsId);
  }
  windowRoots.delete(webContentsId);
}

export function getNotesRoot(webContentsId?: number): string {
  const root = getWindowRoot(webContentsId);
  if (!fsSync.existsSync(root)) {
    try {
      fsSync.mkdirSync(root, { recursive: true });
    } catch (e) {
      console.error('Failed to create notes path:', e);
    }
  }
  return root;
}

export function setNotesRoot(newPath: string, webContentsId?: number) {
  if (fsSync.existsSync(newPath)) {
    if (webContentsId) {
      setWindowRoot(webContentsId, newPath);
    }
    saveSavedRoot(newPath);
  }
}

function cleanMarkdownSnippet(raw: string): string {
  return raw
    .replace(/^---[\s\S]*?---/, '') // remove frontmatter
    .replace(/<br\s*\/?>/gi, ' ')   // remove <br>
    .replace(/<[^>]*>/g, '')        // remove html
    .replace(/#+\s+/g, '')          // remove headings
    .replace(/[-*+]\s+\[[ x]\]\s+/g, '') // remove task checkboxes
    .replace(/[-*+]\s+/g, '')       // remove list bullets
    .replace(/\*\*(.*?)\*\*/g, '$1') // bold
    .replace(/\*(.*?)\*/g, '$1')    // italic
    .replace(/`{1,3}.*?`{1,3}/g, '') // inline code
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // links
    .replace(/\n+/g, ' ')           // newlines
    .trim()
    .slice(0, 120);
}

function extractTitleFromContent(fileName: string): string {
  return fileName.replace(/\.md$/i, '');
}

function getTrashDir(rootDir: string): string {
  const trashPath = path.join(rootDir, '.trash');
  if (!fsSync.existsSync(trashPath)) {
    fsSync.mkdirSync(trashPath, { recursive: true });
  }
  return trashPath;
}

interface TrashRecord {
  originalPath: string;
  deletedAt: number;
}

/**
 * Trash is a flat directory, so two notes named the same in different folders would
 * collide. We rename on collision and remember where each item came from, which also
 * lets restore put the note back where the user deleted it from.
 */
function getTrashIndexPath(rootDir: string): string {
  return path.join(getTrashDir(rootDir), '.scribe-trash.json');
}

function readTrashIndex(rootDir: string): Record<string, TrashRecord> {
  try {
    const indexPath = getTrashIndexPath(rootDir);
    if (fsSync.existsSync(indexPath)) {
      const parsed = JSON.parse(fsSync.readFileSync(indexPath, 'utf-8'));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

function writeTrashIndex(rootDir: string, index: Record<string, TrashRecord>) {
  try {
    fsSync.writeFileSync(getTrashIndexPath(rootDir), JSON.stringify(index, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to persist trash index:', e);
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim() || 'Untitled Note';
}

function uniqueTarget(dir: string, fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let target = path.join(dir, fileName);
  let counter = 1;
  while (fsSync.existsSync(target)) {
    target = path.join(dir, `${base} ${counter}${ext}`);
    counter++;
  }
  return target;
}

const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Splits a note into its verbatim frontmatter block and its markdown body.
 *
 * The block is kept as raw text rather than re-serialized YAML so that saving a note
 * never reorders keys, drops comments, or destroys frontmatter that YAML can't parse.
 */
function splitFrontmatter(raw: string): { block: string; body: string } {
  const match = raw.match(FRONTMATTER_BLOCK);
  if (!match) return { block: '', body: raw };
  return { block: match[0], body: raw.slice(match[0].length) };
}

function safeParseFrontmatter(raw: string): { content: string; data: Record<string, any> } {
  const { block, body } = splitFrontmatter(raw);
  if (!block) return { content: raw, data: {} };

  try {
    const parsed = matter(raw);
    return { content: parsed.content, data: parsed.data };
  } catch {
    // Malformed YAML: still keep it out of the body so the editor never renders it as
    // content (and therefore never rewrites it as horizontal rules).
    return { content: body, data: {} };
  }
}

interface DerivedNoteData {
  snippet: string;
  frontmatter: Record<string, any>;
}

const derivedCache = new Map<string, DerivedNoteData & { mtimeMs: number; size: number }>();

/**
 * Reading every note in full on each rescan was the single largest cost in the refresh
 * path, and the reason a self-inflicted save could take longer than the old 1.5s
 * "was this me?" window. Derived data only changes when the file does.
 */
async function getDerivedNoteData(
  fullPath: string,
  stats: { mtimeMs: number; size: number }
): Promise<DerivedNoteData> {
  const key = normalizePath(fullPath);
  const cached = derivedCache.get(key);
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    return { snippet: cached.snippet, frontmatter: cached.frontmatter };
  }

  let derived: DerivedNoteData = { snippet: '', frontmatter: {} };
  try {
    const rawContent = await fs.readFile(fullPath, 'utf-8');
    const parsed = safeParseFrontmatter(rawContent);
    derived = {
      snippet: cleanMarkdownSnippet(parsed.content),
      frontmatter: parsed.data
    };
  } catch (err) {
    console.error(`Error reading note ${fullPath}:`, err);
  }

  derivedCache.set(key, { ...derived, mtimeMs: stats.mtimeMs, size: stats.size });
  return derived;
}

function invalidateDerived(...filePaths: string[]) {
  for (const p of filePaths) {
    if (p) derivedCache.delete(normalizePath(p));
  }
}

/**
 * Folder identity used by the renderer is the path relative to the vault root, so that
 * nested folders filter and breadcrumb correctly. Every NoteMeta producer must agree.
 */
function relativeFolder(rootDir: string, filePath: string): string {
  const rel = path.relative(rootDir, path.dirname(filePath));
  return rel === '' ? '/' : rel;
}

export async function readAllNotesTree(rootDir: string): Promise<NotesTree> {
  const allNotes: NoteMeta[] = [];
  const trashNotes: NoteMeta[] = [];

  async function scanDir(dir: string, relative = ''): Promise<FolderNode> {
    const dirName = path.basename(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const children: FolderNode[] = [];
    let noteCount = 0;

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relative, entry.name);

      if (entry.isDirectory()) {
        const subFolder = await scanDir(fullPath, relPath);
        children.push(subFolder);
        noteCount += subFolder.noteCount;
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        try {
          const stats = await fs.stat(fullPath);
          const derived = await getDerivedNoteData(fullPath, stats);

          allNotes.push({
            id: fullPath,
            filePath: fullPath,
            fileName: entry.name,
            title: extractTitleFromContent(entry.name),
            snippet: derived.snippet,
            folder: relative || '/',
            modifiedAt: stats.mtimeMs,
            createdAt: stats.birthtimeMs || stats.mtimeMs,
            frontmatter: derived.frontmatter
          });

          noteCount++;
        } catch (err) {
          console.error(`Error reading note ${fullPath}:`, err);
        }
      }
    }

    return {
      name: relative === '' ? 'Notes' : dirName,
      path: dir,
      relativePath: relative,
      noteCount,
      children
    };
  }

  // Scan main notes
  const rootFolder = await scanDir(rootDir);

  // Scan .trash directory
  const trashDir = getTrashDir(rootDir);
  try {
    const trashEntries = await fs.readdir(trashDir, { withFileTypes: true });
    for (const entry of trashEntries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        try {
          const fullPath = path.join(trashDir, entry.name);
          const stats = await fs.stat(fullPath);
          const derived = await getDerivedNoteData(fullPath, stats);

          trashNotes.push({
            id: fullPath,
            filePath: fullPath,
            fileName: entry.name,
            title: extractTitleFromContent(entry.name),
            snippet: derived.snippet,
            folder: 'Trash',
            modifiedAt: stats.mtimeMs,
            createdAt: stats.birthtimeMs || stats.mtimeMs,
            frontmatter: derived.frontmatter
          });
        } catch (e) {
          console.error('Error reading trash item:', e);
        }
      }
    }
  } catch (e) {
    console.error('Error reading trash directory:', e);
  }

  // Sort notes by modifiedAt desc
  allNotes.sort((a, b) => b.modifiedAt - a.modifiedAt);
  trashNotes.sort((a, b) => b.modifiedAt - a.modifiedAt);

  return {
    rootPath: rootDir,
    folders: [rootFolder],
    allNotes,
    trashNotes,
    trashCount: trashNotes.length
  };
}

export async function readNoteContent(filePath: string): Promise<{ markdown: string; frontmatter: Record<string, any> }> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = safeParseFrontmatter(raw);
  return {
    markdown: parsed.content,
    frontmatter: parsed.data
  };
}

export async function saveNoteContent(filePath: string, markdown: string): Promise<void> {
  // A save aimed at a path that no longer exists means the note was renamed, moved or
  // deleted while the write was queued. Writing would resurrect it as a duplicate.
  if (!fsSync.existsSync(filePath)) {
    throw new Error(`Note no longer exists at ${filePath}; save discarded`);
  }

  // Re-attach whatever frontmatter is currently on disk, verbatim. The editor never owns
  // frontmatter, so round-tripping it through YAML would only lose comments and ordering.
  let block = '';
  try {
    const existing = await fs.readFile(filePath, 'utf-8');
    block = splitFrontmatter(existing).block;
  } catch {
    // Unreadable but present; write the body alone rather than losing the edit.
  }

  const fileContent = block ? `${block}${markdown}` : markdown;
  markSelfWrite(filePath, fileContent);
  await fs.writeFile(filePath, fileContent, 'utf-8');
  invalidateDerived(filePath);
}

export async function createNote(
  rootDir: string,
  folderPath: string,
  title = 'Untitled Note',
  initialContent = ''
): Promise<NoteMeta> {
  const sanitizedTitle = sanitizeFileName(title);
  const filePath = uniqueTarget(folderPath, `${sanitizedTitle}.md`);
  const fileName = path.basename(filePath);

  // The title already lives in the filename; a duplicate H1 would just be noise the
  // user has to delete every time.
  const content = initialContent ?? '';
  markSelfWrite(filePath, content);
  await fs.writeFile(filePath, content, 'utf-8');
  const stats = await fs.stat(filePath);

  return {
    id: filePath,
    filePath,
    fileName,
    title: extractTitleFromContent(fileName),
    snippet: cleanMarkdownSnippet(content),
    folder: relativeFolder(rootDir, filePath),
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.mtimeMs,
    frontmatter: {}
  };
}

export async function renameNote(rootDir: string, filePath: string, newTitle: string): Promise<NoteMeta> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath) || '.md';
  const sanitizedTitle = sanitizeFileName(newTitle);
  let newFilePath = path.join(dir, `${sanitizedTitle}${ext}`);

  if (path.resolve(filePath) !== path.resolve(newFilePath)) {
    newFilePath = uniqueTarget(dir, `${sanitizedTitle}${ext}`);
    markSelfOp(filePath, newFilePath);
    await fs.rename(filePath, newFilePath);
    invalidateDerived(filePath);
  }

  const newFileName = path.basename(newFilePath);
  const raw = await fs.readFile(newFilePath, 'utf-8');
  const parsed = safeParseFrontmatter(raw);
  const stats = await fs.stat(newFilePath);

  return {
    id: newFilePath,
    filePath: newFilePath,
    fileName: newFileName,
    title: extractTitleFromContent(newFileName),
    snippet: cleanMarkdownSnippet(parsed.content),
    folder: relativeFolder(rootDir, newFilePath),
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.mtimeMs,
    frontmatter: parsed.data
  };
}

export async function moveNote(rootDir: string, filePath: string, targetFolderPath: string): Promise<NoteMeta> {
  const fileName = path.basename(filePath);
  let targetPath = path.join(targetFolderPath, fileName);

  if (path.resolve(filePath) !== path.resolve(targetPath)) {
    targetPath = uniqueTarget(targetFolderPath, fileName);
    markSelfOp(filePath, targetPath);
    await fs.rename(filePath, targetPath);
    invalidateDerived(filePath);
  }

  const raw = await fs.readFile(targetPath, 'utf-8');
  const parsed = safeParseFrontmatter(raw);
  const stats = await fs.stat(targetPath);
  const finalFileName = path.basename(targetPath);

  return {
    id: targetPath,
    filePath: targetPath,
    fileName: finalFileName,
    title: extractTitleFromContent(finalFileName),
    snippet: cleanMarkdownSnippet(parsed.content),
    folder: relativeFolder(rootDir, targetPath),
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.mtimeMs,
    frontmatter: parsed.data
  };
}

export async function moveToTrash(filePath: string, rootDir: string): Promise<void> {
  const trashDir = getTrashDir(rootDir);
  const targetPath = uniqueTarget(trashDir, path.basename(filePath));

  markSelfOp(filePath, targetPath);
  await fs.rename(filePath, targetPath);
  invalidateDerived(filePath);

  const index = readTrashIndex(rootDir);
  index[path.basename(targetPath)] = {
    originalPath: filePath,
    deletedAt: Date.now()
  };
  writeTrashIndex(rootDir, index);
}

export async function restoreFromTrash(filePath: string, rootDir: string): Promise<string> {
  const trashedName = path.basename(filePath);
  const index = readTrashIndex(rootDir);
  const record = index[trashedName];

  // Put it back where it came from when we know, falling back to the vault root.
  let targetDir = rootDir;
  if (record?.originalPath) {
    const originalDir = path.dirname(record.originalPath);
    try {
      assertInsideRoot(rootDir, originalDir);
      await fs.mkdir(originalDir, { recursive: true });
      targetDir = originalDir;
    } catch {
      targetDir = rootDir;
    }
  }

  const desiredName = record?.originalPath ? path.basename(record.originalPath) : trashedName;
  const targetPath = uniqueTarget(targetDir, desiredName);

  markSelfOp(filePath, targetPath);
  await fs.rename(filePath, targetPath);
  invalidateDerived(filePath);

  if (record) {
    delete index[trashedName];
    writeTrashIndex(rootDir, index);
  }

  return targetPath;
}

export async function permanentDeleteNote(filePath: string, rootDir?: string): Promise<void> {
  markSelfOp(filePath);
  await fs.rm(filePath, { recursive: true, force: true });
  invalidateDerived(filePath);

  if (rootDir) {
    const index = readTrashIndex(rootDir);
    const key = path.basename(filePath);
    if (index[key]) {
      delete index[key];
      writeTrashIndex(rootDir, index);
    }
  }
}

export async function emptyTrash(rootDir: string): Promise<void> {
  const trashDir = getTrashDir(rootDir);
  const indexName = path.basename(getTrashIndexPath(rootDir));
  const entries = await fs.readdir(trashDir);

  for (const entry of entries) {
    if (entry === indexName) continue;
    const target = path.join(trashDir, entry);
    markSelfOp(target);
    // Deleted folders land in the trash too, so this has to handle directories.
    await fs.rm(target, { recursive: true, force: true });
    invalidateDerived(target);
  }

  writeTrashIndex(rootDir, {});
}

export async function duplicateNote(rootDir: string, filePath: string): Promise<NoteMeta> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath) || '.md';
  const baseName = path.basename(filePath, ext);

  const newFilePath = uniqueTarget(dir, `${baseName} copy${ext}`);
  const newFileName = path.basename(newFilePath);

  const raw = await fs.readFile(filePath, 'utf-8');
  markSelfWrite(newFilePath, raw);
  await fs.writeFile(newFilePath, raw, 'utf-8');

  const parsed = safeParseFrontmatter(raw);
  const stats = await fs.stat(newFilePath);

  return {
    id: newFilePath,
    filePath: newFilePath,
    fileName: newFileName,
    title: extractTitleFromContent(newFileName),
    snippet: cleanMarkdownSnippet(parsed.content),
    folder: relativeFolder(rootDir, newFilePath),
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.mtimeMs,
    frontmatter: parsed.data
  };
}

export async function createFolder(parentPath: string, folderName: string): Promise<string> {
  const sanitized = folderName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'New Folder';
  const target = uniqueTarget(parentPath, sanitized);
  markSelfOp(target);
  await fs.mkdir(target, { recursive: true });
  return target;
}

export async function renameFolder(folderPath: string, newName: string): Promise<string> {
  const parent = path.dirname(folderPath);
  const sanitized = newName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Folder';
  let target = path.join(parent, sanitized);
  if (path.resolve(folderPath) !== path.resolve(target)) {
    target = uniqueTarget(parent, sanitized);
    markSelfOp(folderPath, target);
    await fs.rename(folderPath, target);
    derivedCache.clear();
  }
  return target;
}

export async function deleteFolder(folderPath: string, rootDir: string): Promise<void> {
  const trashDir = getTrashDir(rootDir);
  const finalTarget = uniqueTarget(trashDir, path.basename(folderPath));

  markSelfOp(folderPath, finalTarget);
  await fs.rename(folderPath, finalTarget);
  derivedCache.clear();

  const index = readTrashIndex(rootDir);
  index[path.basename(finalTarget)] = {
    originalPath: folderPath,
    deletedAt: Date.now()
  };
  writeTrashIndex(rootDir, index);
}

export interface NotesChangedPayload {
  changedPaths: string[];
  structural: boolean;
}

const WATCH_DEBOUNCE_MS = 180;

export function startWatchingWindow(
  webContentsId: number,
  rootDir: string,
  onChange: (data: NotesChangedPayload) => void
) {
  if (windowWatchers.has(webContentsId)) {
    windowWatchers.get(webContentsId)?.close();
  }

  const watcher = chokidar.watch(rootDir, {
    // A predicate works across chokidar 3 and 4; the regex form was glob-based and
    // silently stopped matching in v4.
    ignored: (target: string) =>
      path
        .relative(rootDir, target)
        .split(path.sep)
        .some(segment => segment.startsWith('.') || segment === 'node_modules'),
    persistent: true,
    ignoreInitial: true,
    depth: 10,
    // Cloud-sync daemons and atomic-save editors write in bursts; wait for quiescence
    // so we don't scan the vault against a half-written file.
    awaitWriteFinish: {
      stabilityThreshold: 250,
      pollInterval: 50
    }
  });

  let pending: Map<string, boolean> = new Map();
  let flushTimer: NodeJS.Timeout | null = null;

  const flush = () => {
    flushTimer = null;
    const batch = pending;
    pending = new Map();
    if (batch.size === 0) return;
    onChange({
      changedPaths: Array.from(batch.keys()),
      structural: Array.from(batch.values()).some(Boolean)
    });
  };

  const queue = async (filePath: string, eventType: string) => {
    if (await isSelfInflicted(filePath, eventType)) return;
    const structural = eventType !== 'change';
    pending.set(filePath, (pending.get(filePath) || false) || structural);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, WATCH_DEBOUNCE_MS);
  };

  watcher
    .on('add', (filePath) => void queue(filePath, 'add'))
    .on('change', (filePath) => void queue(filePath, 'change'))
    .on('unlink', (filePath) => void queue(filePath, 'unlink'))
    .on('addDir', (dirPath) => void queue(dirPath, 'addDir'))
    .on('unlinkDir', (dirPath) => void queue(dirPath, 'unlinkDir'))
    .on('error', (err) => console.error('Notes watcher error:', err));

  const originalClose = watcher.close.bind(watcher);
  watcher.close = async () => {
    if (flushTimer) clearTimeout(flushTimer);
    return originalClose();
  };

  windowWatchers.set(webContentsId, watcher);
}
