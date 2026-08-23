import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import matter from 'gray-matter';
import chokidar, { FSWatcher } from 'chokidar';
import { app } from 'electron';
import { NoteMeta, FolderNode, NotesTree } from './types';

const DEFAULT_NOTES_PATH = path.join(process.env.HOME || '', 'Notes');

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
  return DEFAULT_NOTES_PATH;
}

export function saveSavedRoot(p: string) {
  try {
    const cfg = getConfigPath();
    fsSync.writeFileSync(cfg, JSON.stringify({ notesPath: p }, null, 2), 'utf-8');
  } catch {}
}

const windowRoots = new Map<number, string>();
const windowWatchers = new Map<number, FSWatcher>();

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

function extractTitleFromContent(content: string, fileName: string): string {
  return fileName.replace(/\.md$/i, '');
}

function getTrashDir(rootDir: string): string {
  const trashPath = path.join(rootDir, '.trash');
  if (!fsSync.existsSync(trashPath)) {
    fsSync.mkdirSync(trashPath, { recursive: true });
  }
  return trashPath;
}

function safeParseFrontmatter(raw: string): { content: string; data: Record<string, any> } {
  try {
    if (raw.startsWith('---\n') || raw.startsWith('---\r\n')) {
      return matter(raw);
    }
  } catch {
    // Fallback if YAML parsing fails on horizontal rules
  }
  return { content: raw, data: {} };
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
          const rawContent = await fs.readFile(fullPath, 'utf-8');
          const parsed = safeParseFrontmatter(rawContent);
          const title = extractTitleFromContent(parsed.content, entry.name);
          const snippet = cleanMarkdownSnippet(parsed.content);

          allNotes.push({
            id: fullPath,
            filePath: fullPath,
            fileName: entry.name,
            title,
            snippet,
            folder: relative || '/',
            modifiedAt: stats.mtimeMs,
            createdAt: stats.birthtimeMs || stats.mtimeMs,
            frontmatter: parsed.data
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
          const rawContent = await fs.readFile(fullPath, 'utf-8');
          const parsed = safeParseFrontmatter(rawContent);
          const title = extractTitleFromContent(parsed.content, entry.name);
          const snippet = cleanMarkdownSnippet(parsed.content);

          trashNotes.push({
            id: fullPath,
            filePath: fullPath,
            fileName: entry.name,
            title,
            snippet,
            folder: 'Trash',
            modifiedAt: stats.mtimeMs,
            createdAt: stats.birthtimeMs || stats.mtimeMs,
            frontmatter: parsed.data
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

export async function saveNoteContent(filePath: string, markdown: string, frontmatter?: Record<string, any>): Promise<void> {
  let fileContent = markdown;
  if (frontmatter && Object.keys(frontmatter).length > 0) {
    fileContent = matter.stringify(markdown, frontmatter);
  }
  await fs.writeFile(filePath, fileContent, 'utf-8');
}

export async function createNote(folderPath: string, title = 'Untitled Note', initialContent = ''): Promise<NoteMeta> {
  let fileName = `${title}.md`;
  let filePath = path.join(folderPath, fileName);
  let counter = 1;

  while (fsSync.existsSync(filePath)) {
    fileName = `${title} ${counter}.md`;
    filePath = path.join(folderPath, fileName);
    counter++;
  }

  const content = initialContent || `# ${title}\n\n`;
  await fs.writeFile(filePath, content, 'utf-8');
  const stats = await fs.stat(filePath);

  return {
    id: filePath,
    filePath,
    fileName,
    title,
    snippet: '',
    folder: path.basename(folderPath),
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.mtimeMs,
    frontmatter: {}
  };
}

export async function renameNote(filePath: string, newTitle: string): Promise<NoteMeta> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath) || '.md';
  const sanitizedTitle = newTitle.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Untitled Note';
  const newFileName = `${sanitizedTitle}${ext}`;
  const newFilePath = path.join(dir, newFileName);

  if (filePath !== newFilePath) {
    await fs.rename(filePath, newFilePath);
  }

  const raw = await fs.readFile(newFilePath, 'utf-8');
  const parsed = safeParseFrontmatter(raw);
  const stats = await fs.stat(newFilePath);

  return {
    id: newFilePath,
    filePath: newFilePath,
    fileName: newFileName,
    title: sanitizedTitle,
    snippet: cleanMarkdownSnippet(parsed.content),
    folder: path.basename(dir),
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.mtimeMs,
    frontmatter: parsed.data
  };
}

export async function moveNote(filePath: string, targetFolderPath: string): Promise<NoteMeta> {
  const fileName = path.basename(filePath);
  let targetPath = path.join(targetFolderPath, fileName);

  if (filePath !== targetPath) {
    let counter = 1;
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    while (fsSync.existsSync(targetPath)) {
      targetPath = path.join(targetFolderPath, `${base} ${counter}${ext}`);
      counter++;
    }
    await fs.rename(filePath, targetPath);
  }

  const raw = await fs.readFile(targetPath, 'utf-8');
  const parsed = safeParseFrontmatter(raw);
  const stats = await fs.stat(targetPath);
  const finalFileName = path.basename(targetPath);

  return {
    id: targetPath,
    filePath: targetPath,
    fileName: finalFileName,
    title: extractTitleFromContent(parsed.content, finalFileName),
    snippet: cleanMarkdownSnippet(parsed.content),
    folder: path.basename(targetFolderPath),
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.mtimeMs,
    frontmatter: parsed.data
  };
}

export async function moveToTrash(filePath: string, rootDir: string): Promise<void> {
  const trashDir = getTrashDir(rootDir);
  const fileName = path.basename(filePath);
  const targetPath = path.join(trashDir, fileName);
  await fs.rename(filePath, targetPath);
}

export async function restoreFromTrash(filePath: string, rootDir: string): Promise<string> {
  const fileName = path.basename(filePath);
  const targetPath = path.join(rootDir, fileName);
  await fs.rename(filePath, targetPath);
  return targetPath;
}

export async function permanentDeleteNote(filePath: string): Promise<void> {
  await fs.unlink(filePath);
}

export async function emptyTrash(rootDir: string): Promise<void> {
  const trashDir = getTrashDir(rootDir);
  const entries = await fs.readdir(trashDir);
  for (const entry of entries) {
    await fs.unlink(path.join(trashDir, entry));
  }
}

export function startWatchingWindow(
  webContentsId: number,
  rootDir: string,
  onChange: (data: { filePath: string; eventType: string }) => void
) {
  if (windowWatchers.has(webContentsId)) {
    windowWatchers.get(webContentsId)?.close();
  }
  const watcher = chokidar.watch(rootDir, {
    ignored: /(^|[\/\\])\..|node_modules/,
    persistent: true,
    ignoreInitial: true,
    depth: 10
  });

  watcher
    .on('add', (filePath) => onChange({ filePath, eventType: 'add' }))
    .on('change', (filePath) => onChange({ filePath, eventType: 'change' }))
    .on('unlink', (filePath) => onChange({ filePath, eventType: 'unlink' }))
    .on('addDir', (dirPath) => onChange({ filePath: dirPath, eventType: 'addDir' }))
    .on('unlinkDir', (dirPath) => onChange({ filePath: dirPath, eventType: 'unlinkDir' }));

  windowWatchers.set(webContentsId, watcher);
}
