import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import matter from 'gray-matter';
import chokidar, { FSWatcher } from 'chokidar';
import { app } from 'electron';
import { checkpoint, remapVersions, readVersions, forgetVersions } from './history';
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
const selfWrites = new Map<string, { hash: string; until: number; originId?: number }>();
const selfOps = new Map<string, { until: number; originId?: number }>();

function hashContent(content: string): string {
  return crypto.createHash('sha1').update(content, 'utf-8').digest('hex');
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath);
}

function markSelfWrite(filePath: string, content: string, originId?: number) {
  selfWrites.set(normalizePath(filePath), {
    hash: hashContent(content),
    until: Date.now() + SELF_WRITE_TTL_MS,
    originId
  });
}

function markSelfOp(originId: number | undefined, ...filePaths: string[]) {
  const until = Date.now() + SELF_WRITE_TTL_MS;
  for (const p of filePaths) {
    if (p) selfOps.set(normalizePath(p), { until, originId });
  }
}

function pruneSelfTracking() {
  const now = Date.now();
  for (const [key, entry] of selfWrites) {
    if (entry.until < now) selfWrites.delete(key);
  }
  for (const [key, entry] of selfOps) {
    if (entry.until < now) selfOps.delete(key);
  }
}

/**
 * Returns true when this watcher event was caused by *this* window's own write and
 * carries nothing new.
 *
 * The origin check matters when two windows have the same vault open: a save made in one
 * window is genuinely an external change from the other window's point of view, and must
 * still be delivered there. Entries are therefore never consumed by a non-matching
 * window; they simply expire.
 */
async function isSelfInflicted(
  watcherWindowId: number,
  filePath: string,
  eventType: string
): Promise<boolean> {
  pruneSelfTracking();
  const key = normalizePath(filePath);
  const now = Date.now();

  const op = selfOps.get(key);
  if (op && op.until >= now && op.originId === watcherWindowId) {
    return true;
  }

  const write = selfWrites.get(key);
  if (!write || write.until < now || write.originId !== watcherWindowId) return false;

  if (eventType === 'unlink' || eventType === 'unlinkDir') {
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

export const ASSET_SCHEME = 'scribe-asset';
export const ASSETS_DIR_NAME = 'assets';

/**
 * Images are stored as real files in <vault>/assets and referenced from the markdown by
 * a path relative to the note, which keeps the .md portable and readable in any other
 * editor. Inside the app those references are swapped for a custom-protocol URL, because
 * a relative path means nothing to the renderer (and file:// is blocked in dev).
 */
export function toAssetUrl(absolutePath: string): string {
  const encoded = absolutePath.split(path.sep).map(encodeURIComponent).join('/');
  return `${ASSET_SCHEME}://asset${encoded.startsWith('/') ? '' : '/'}${encoded}`;
}

export function fromAssetUrl(url: string): string | null {
  if (!url.startsWith(`${ASSET_SCHEME}://`)) return null;
  try {
    const withoutScheme = url.slice(`${ASSET_SCHEME}://`.length);
    const firstSlash = withoutScheme.indexOf('/');
    if (firstSlash === -1) return null;
    return decodeURIComponent(withoutScheme.slice(firstSlash));
  } catch {
    return null;
  }
}

// Matches markdown images and raw <img src="..."> so both survive the round-trip.
const IMAGE_REFERENCE = /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))|(<img\b[^>]*?\ssrc=")([^"]+)(")/g;

function rewriteImageReferences(markdown: string, rewrite: (src: string) => string): string {
  return markdown.replace(IMAGE_REFERENCE, (match, mdOpen, mdSrc, mdClose, imgOpen, imgSrc, imgClose) => {
    if (mdOpen !== undefined) return `${mdOpen}${rewrite(mdSrc)}${mdClose}`;
    if (imgOpen !== undefined) return `${imgOpen}${rewrite(imgSrc)}${imgClose}`;
    return match;
  });
}

function isExternalReference(src: string): boolean {
  return /^(https?:|data:|mailto:)/i.test(src);
}

/** Disk form (relative path) -> in-app form (asset URL). */
export function toDisplayMarkdown(markdown: string, noteFilePath: string): string {
  const noteDir = path.dirname(noteFilePath);
  return rewriteImageReferences(markdown, src => {
    if (isExternalReference(src) || src.startsWith(`${ASSET_SCHEME}://`)) return src;
    const absolute = path.resolve(noteDir, decodeURIComponent(src));
    return toAssetUrl(absolute);
  });
}

/** In-app form (asset URL) -> disk form (path relative to the note). */
export function toDiskMarkdown(markdown: string, noteFilePath: string): string {
  const noteDir = path.dirname(noteFilePath);
  return rewriteImageReferences(markdown, src => {
    const absolute = fromAssetUrl(src);
    if (!absolute) return src;
    const relative = path.relative(noteDir, absolute).split(path.sep).join('/');
    return relative.split('/').map(encodeURIComponent).join('/');
  });
}

/**
 * Rewrites a note's relative image links after it has been moved, so they keep pointing
 * at the same files from the note's new location.
 */
export async function rebaseImageLinks(
  noteFilePath: string,
  previousDir: string,
  originId?: number
): Promise<void> {
  try {
    const raw = await fs.readFile(noteFilePath, 'utf-8');
    const newDir = path.dirname(noteFilePath);
    if (path.resolve(previousDir) === path.resolve(newDir)) return;

    const rewritten = rewriteImageReferences(raw, src => {
      if (isExternalReference(src) || path.isAbsolute(src)) return src;
      const absolute = path.resolve(previousDir, decodeURIComponent(src));
      const relative = path.relative(newDir, absolute).split(path.sep).join('/');
      return relative.split('/').map(encodeURIComponent).join('/');
    });

    if (rewritten !== raw) {
      markSelfWrite(noteFilePath, rewritten, originId);
      await fs.writeFile(noteFilePath, rewritten, 'utf-8');
      invalidateDerived(noteFilePath);
    }
  } catch (err) {
    console.error('Failed to rebase image links:', err);
  }
}

export function getAssetsDir(rootDir: string): string {
  const dir = path.join(rootDir, ASSETS_DIR_NAME);
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function saveAttachment(
  rootDir: string,
  noteFilePath: string,
  fileName: string,
  data: Uint8Array,
  originId?: number
): Promise<{ absolutePath: string; assetUrl: string }> {
  const assetsDir = getAssetsDir(rootDir);
  const ext = path.extname(fileName) || '.png';
  const base = sanitizeFileName(path.basename(fileName, ext)) || 'image';
  const stamp = new Date().toISOString().slice(0, 10);
  const target = uniqueTarget(assetsDir, `${stamp}-${base}${ext}`);

  // Binary content, so time+path suppression rather than a text hash.
  markSelfOp(originId, target);
  await fs.writeFile(target, Buffer.from(data));

  return { absolutePath: target, assetUrl: toAssetUrl(target) };
}

export function listKnownRoots(): string[] {
  const roots = new Set<string>(windowRoots.values());
  roots.add(loadSavedRoot());
  return Array.from(roots);
}

/** The asset protocol must only ever serve files from inside a vault the user opened. */
export function isInsideAnyRoot(target: string): boolean {
  const resolved = normalizePath(target);
  return listKnownRoots().some(root => {
    const r = normalizePath(root);
    return resolved === r || resolved.startsWith(r + path.sep);
  });
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

async function countMarkdownFiles(dir: string): Promise<number> {
  let count = 0;
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        count += await countMarkdownFiles(path.join(dir, entry.name));
      } else if (entry.name.toLowerCase().endsWith('.md')) {
        count++;
      }
    }
  } catch {}
  return count;
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
  trimCache(derivedCache);
  return derived;
}

const MAX_CACHE_ENTRIES = 2000;

/** Keeps the caches from growing without bound over a long session. */
function trimCache<K, V>(cache: Map<K, V>) {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

const bodyCache = new Map<string, { mtimeMs: number; size: number; text: string }>();

/**
 * Full-text search over note bodies. Previously only the title and the 120-character
 * snippet were searched, so a word in the middle of a note was unfindable.
 */
export async function searchNotes(rootDir: string, query: string): Promise<string[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const tree = await readAllNotesTree(rootDir);
  const matches: string[] = [];

  for (const note of [...tree.allNotes, ...tree.trashNotes]) {
    if (note.title.toLowerCase().includes(needle)) {
      matches.push(note.filePath);
      continue;
    }

    try {
      const key = normalizePath(note.filePath);
      const cached = bodyCache.get(key);
      let text: string;

      if (cached && cached.mtimeMs === note.modifiedAt) {
        text = cached.text;
      } else {
        const stats = await fs.stat(note.filePath);
        const raw = await fs.readFile(note.filePath, 'utf-8');
        text = safeParseFrontmatter(raw).content;
        bodyCache.set(key, { mtimeMs: stats.mtimeMs, size: stats.size, text });
        trimCache(bodyCache);
      }

      if (text.toLowerCase().includes(needle)) matches.push(note.filePath);
    } catch {
      // Unreadable file; just don't match it.
    }
  }

  return matches;
}

function invalidateDerived(...filePaths: string[]) {
  for (const p of filePaths) {
    if (p) {
      derivedCache.delete(normalizePath(p));
      bodyCache.delete(normalizePath(p));
    }
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
      // The attachments folder is app plumbing, not somewhere the user files notes.
      if (relative === '' && entry.isDirectory() && entry.name === ASSETS_DIR_NAME) continue;

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
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(trashDir, entry.name);

      if (entry.isDirectory()) {
        // Deleted folders live here too. Surfacing them makes them restorable instead of
        // only recoverable through Finder.
        try {
          const stats = await fs.stat(fullPath);
          const contained = await countMarkdownFiles(fullPath);
          trashNotes.push({
            id: fullPath,
            filePath: fullPath,
            fileName: entry.name,
            title: entry.name,
            snippet: `Folder — ${contained} note${contained === 1 ? '' : 's'}`,
            folder: 'Trash',
            isFolder: true,
            modifiedAt: stats.mtimeMs,
            createdAt: stats.birthtimeMs || stats.mtimeMs,
            frontmatter: {}
          });
        } catch (e) {
          console.error('Error reading trashed folder:', e);
        }
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        try {
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
    markdown: toDisplayMarkdown(parsed.content, filePath),
    frontmatter: parsed.data
  };
}

export async function saveNoteContent(filePath: string, markdown: string, originId?: number): Promise<void> {
  // A save aimed at a path that no longer exists means the note was renamed, moved or
  // deleted while the write was queued. Writing would resurrect it as a duplicate.
  if (!fsSync.existsSync(filePath)) {
    throw new Error(`Note no longer exists at ${filePath}; save discarded`);
  }

  // Re-attach whatever frontmatter is currently on disk, verbatim. The editor never owns
  // frontmatter, so round-tripping it through YAML would only lose comments and ordering.
  const existing = await fs.readFile(filePath, 'utf-8');
  const block = splitFrontmatter(existing).block;
  const body = toDiskMarkdown(markdown, filePath);
  const fileContent = block ? `${block}${body}` : body;
  if (existing === fileContent) return;
  await checkpoint(filePath, existing, (await fs.stat(filePath)).mtimeMs);
  markSelfWrite(filePath, fileContent, originId);
  await fs.writeFile(filePath, fileContent, 'utf-8');
  invalidateDerived(filePath);
}

export async function createNote(
  rootDir: string,
  folderPath: string,
  title = 'Untitled Note',
  initialContent = '',
  originId?: number
): Promise<NoteMeta> {
  const sanitizedTitle = sanitizeFileName(title);
  const filePath = uniqueTarget(folderPath, `${sanitizedTitle}.md`);
  const fileName = path.basename(filePath);

  // The title already lives in the filename; a duplicate H1 would just be noise the
  // user has to delete every time.
  const content = initialContent ?? '';
  markSelfWrite(filePath, content, originId);
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

export async function renameNote(rootDir: string, filePath: string, newTitle: string, originId?: number): Promise<NoteMeta> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath) || '.md';
  const sanitizedTitle = sanitizeFileName(newTitle);
  let newFilePath = path.join(dir, `${sanitizedTitle}${ext}`);

  if (path.resolve(filePath) !== path.resolve(newFilePath)) {
    newFilePath = uniqueTarget(dir, `${sanitizedTitle}${ext}`);
    markSelfOp(originId, filePath, newFilePath);
    await fs.rename(filePath, newFilePath);
    await remapVersions(filePath, newFilePath);
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

export async function moveNote(rootDir: string, filePath: string, targetFolderPath: string, originId?: number): Promise<NoteMeta> {
  const fileName = path.basename(filePath);
  let targetPath = path.join(targetFolderPath, fileName);

  if (path.resolve(filePath) !== path.resolve(targetPath)) {
    targetPath = uniqueTarget(targetFolderPath, fileName);
    markSelfOp(originId, filePath, targetPath);
    await fs.rename(filePath, targetPath);
    await remapVersions(filePath, targetPath);
    invalidateDerived(filePath);

    // Image links are relative to the note, so moving it to another folder invalidates
    // them. Re-anchor them against the new location.
    await rebaseImageLinks(targetPath, path.dirname(filePath), originId);
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

export async function moveToTrash(filePath: string, rootDir: string, originId?: number): Promise<void> {
  const trashDir = getTrashDir(rootDir);
  const targetPath = uniqueTarget(trashDir, path.basename(filePath));

  markSelfOp(originId, filePath, targetPath);
  await fs.rename(filePath, targetPath);
  await remapVersions(filePath, targetPath);
  invalidateDerived(filePath);

  const index = readTrashIndex(rootDir);
  index[path.basename(targetPath)] = {
    originalPath: filePath,
    deletedAt: Date.now()
  };
  writeTrashIndex(rootDir, index);
}

export async function restoreFromTrash(filePath: string, rootDir: string, originId?: number): Promise<string> {
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

  markSelfOp(originId, filePath, targetPath);
  await fs.rename(filePath, targetPath);
  await remapVersions(filePath, targetPath);
  invalidateDerived(filePath);

  if (record) {
    delete index[trashedName];
    writeTrashIndex(rootDir, index);
  }

  return targetPath;
}

export async function permanentDeleteNote(filePath: string, rootDir?: string, originId?: number): Promise<void> {
  markSelfOp(originId, filePath);
  await forgetVersions(filePath);
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

export async function emptyTrash(rootDir: string, originId?: number): Promise<void> {
  const trashDir = getTrashDir(rootDir);
  const indexName = path.basename(getTrashIndexPath(rootDir));
  const entries = await fs.readdir(trashDir);

  for (const entry of entries) {
    if (entry === indexName) continue;
    const target = path.join(trashDir, entry);
    markSelfOp(originId, target);
    // Deleted folders land in the trash too, so this has to handle directories.
    await forgetVersions(target);
    await fs.rm(target, { recursive: true, force: true });
    invalidateDerived(target);
  }

  writeTrashIndex(rootDir, {});
}

export async function duplicateNote(rootDir: string, filePath: string, originId?: number): Promise<NoteMeta> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath) || '.md';
  const baseName = path.basename(filePath, ext);

  const newFilePath = uniqueTarget(dir, `${baseName} copy${ext}`);
  const newFileName = path.basename(newFilePath);

  const raw = await fs.readFile(filePath, 'utf-8');
  markSelfWrite(newFilePath, raw, originId);
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

export async function createFolder(parentPath: string, folderName: string, originId?: number): Promise<string> {
  const sanitized = folderName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'New Folder';
  const target = uniqueTarget(parentPath, sanitized);
  markSelfOp(originId, target);
  await fs.mkdir(target, { recursive: true });
  return target;
}

export async function renameFolder(folderPath: string, newName: string, originId?: number): Promise<string> {
  const parent = path.dirname(folderPath);
  const sanitized = newName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Folder';
  let target = path.join(parent, sanitized);
  if (path.resolve(folderPath) !== path.resolve(target)) {
    target = uniqueTarget(parent, sanitized);
    markSelfOp(originId, folderPath, target);
    await fs.rename(folderPath, target);
    await remapVersions(folderPath, target);
    derivedCache.clear();
  }
  return target;
}

export async function deleteFolder(folderPath: string, rootDir: string, originId?: number): Promise<void> {
  const trashDir = getTrashDir(rootDir);
  const finalTarget = uniqueTarget(trashDir, path.basename(folderPath));

  markSelfOp(originId, folderPath, finalTarget);
  await fs.rename(folderPath, finalTarget);
  await remapVersions(folderPath, finalTarget);
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
    if (await isSelfInflicted(webContentsId, filePath, eventType)) return;
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

export async function previewVersion(filePath: string, id: string) {
  const version = (await readVersions(filePath)).find(item => item.id === id);
  if (!version) throw new Error('This version is no longer available.');
  return toDisplayMarkdown(safeParseFrontmatter(version.raw).content, version.sourcePath);
}
export async function restoreVersion(filePath: string, id: string, originId?: number) {
  const version = (await readVersions(filePath)).find(item => item.id === id);
  if (!version) throw new Error('This version is no longer available.');
  const current = await fs.readFile(filePath, 'utf8');
  await checkpoint(filePath, current, (await fs.stat(filePath)).mtimeMs, true);
  const raw = toDiskMarkdown(toDisplayMarkdown(version.raw, version.sourcePath), filePath);
  markSelfWrite(filePath, raw, originId);
  await fs.writeFile(filePath, raw, 'utf8');
  invalidateDerived(filePath);
}
export async function searchExcerpts(rootDir: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const tree = await readAllNotesTree(rootDir);
  const results: { filePath: string; excerpt: string }[] = [];
  for (const note of [...tree.allNotes, ...tree.trashNotes].filter(note => !note.isFolder)) {
    try {
      const key = normalizePath(note.filePath);
      const cached = bodyCache.get(key);
      let body: string;
      if (cached && cached.mtimeMs === note.modifiedAt) body = cached.text;
      else {
        const stats = await fs.stat(note.filePath);
        body = safeParseFrontmatter(await fs.readFile(note.filePath, 'utf8')).content;
        bodyCache.set(key, { mtimeMs: stats.mtimeMs, size: stats.size, text: body });
        trimCache(bodyCache);
      }
      const text = body
        .replace(/<[^>]*>/g, '')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^\s{0,3}(?:#{1,6} |[-*+] (?:\[[ x]\] )?)/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ');
      const index = text.toLowerCase().indexOf(needle);
      if (index < 0 && !note.title.toLowerCase().includes(needle)) continue;
      const start = index < 0 ? 0 : Math.max(0, index - 65);
      const end = index < 0 ? 160 : Math.min(text.length, index + needle.length + 95);
      results.push({ filePath: note.filePath, excerpt: `${start ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}` });
    } catch { /* An unreadable note should not prevent other results. */ }
  }
  return results;
}

export async function listVersionSummaries(filePath: string) {
  return (await readVersions(filePath)).reverse().map(({ id, savedAt, raw }) => {
    const content = safeParseFrontmatter(raw).content;
    return { id, savedAt, excerpt: cleanMarkdownSnippet(content), wordCount: content.trim() ? content.trim().split(/\s+/u).length : 0 };
  });
}
