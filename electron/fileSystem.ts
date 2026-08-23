import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import matter from 'gray-matter';
import chokidar, { FSWatcher } from 'chokidar';
import { NoteMeta, FolderNode, NotesTree } from './types';

const DEFAULT_NOTES_PATH = path.join(process.env.HOME || '', 'Notes');

let currentNotesPath = DEFAULT_NOTES_PATH;
let activeWatcher: FSWatcher | null = null;

export function getNotesRoot(): string {
  if (!fsSync.existsSync(currentNotesPath)) {
    try {
      fsSync.mkdirSync(currentNotesPath, { recursive: true });
    } catch (e) {
      console.error('Failed to create default notes path:', e);
    }
  }
  return currentNotesPath;
}

export function setNotesRoot(newPath: string) {
  if (fsSync.existsSync(newPath)) {
    currentNotesPath = newPath;
  }
}

function cleanMarkdownSnippet(raw: string): string {
  return raw
    .replace(/^---[\s\S]*?---/, '') // remove frontmatter
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
  const baseName = fileName.replace(/\.md$/i, '');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.replace(/^#\s+/, '').trim();
    }
  }
  return baseName;
}

function getTrashDir(): string {
  const trashPath = path.join(getNotesRoot(), '.trash');
  if (!fsSync.existsSync(trashPath)) {
    fsSync.mkdirSync(trashPath, { recursive: true });
  }
  return trashPath;
}

export async function readAllNotesTree(rootDir = getNotesRoot()): Promise<NotesTree> {
  const allNotes: NoteMeta[] = [];
  const trashNotes: NoteMeta[] = [];

  async function scanDir(dir: string, relative = ''): Promise<FolderNode> {
    const dirName = path.basename(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const children: FolderNode[] = [];
    let noteCount = 0;

    for (const entry of entries) {
      // Ignore hidden files and .trash / .obsidian / .git folders
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
          const parsed = matter(rawContent);
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
  const trashDir = getTrashDir();
  try {
    const trashEntries = await fs.readdir(trashDir, { withFileTypes: true });
    for (const entry of trashEntries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const fullPath = path.join(trashDir, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          const rawContent = await fs.readFile(fullPath, 'utf-8');
          const parsed = matter(rawContent);
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
  const parsed = matter(raw);
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

export async function createNote(folderPath = getNotesRoot(), title = 'New Note', initialContent = ''): Promise<NoteMeta> {
  let finalTitle = title.trim() || 'New Note';
  let fileName = `${finalTitle}.md`;
  let filePath = path.join(folderPath, fileName);
  let counter = 1;

  while (fsSync.existsSync(filePath)) {
    finalTitle = `${title} ${counter}`;
    fileName = `${finalTitle}.md`;
    filePath = path.join(folderPath, fileName);
    counter++;
  }

  const content = initialContent ? initialContent : `# ${finalTitle}\n\n`;
  await fs.writeFile(filePath, content, 'utf-8');
  const stats = await fs.stat(filePath);

  return {
    id: filePath,
    filePath,
    fileName,
    title: finalTitle,
    snippet: '',
    folder: path.relative(getNotesRoot(), folderPath) || '/',
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.mtimeMs
  };
}

export async function renameNote(filePath: string, newTitle: string): Promise<{ newPath: string; newFileName: string }> {
  const dir = path.dirname(filePath);
  const cleanTitle = newTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled Note';
  const newFileName = `${cleanTitle}.md`;
  const newPath = path.join(dir, newFileName);

  if (newPath !== filePath) {
    if (fsSync.existsSync(newPath)) {
      throw new Error(`A note with the name "${newFileName}" already exists.`);
    }
    await fs.rename(filePath, newPath);
  }

  return { newPath, newFileName };
}

export async function moveToTrash(filePath: string): Promise<void> {
  const trashDir = getTrashDir();
  const fileName = path.basename(filePath);
  const targetPath = path.join(trashDir, fileName);
  await fs.rename(filePath, targetPath);
}

export async function restoreFromTrash(filePath: string): Promise<string> {
  const fileName = path.basename(filePath);
  const root = getNotesRoot();
  const targetPath = path.join(root, fileName);
  await fs.rename(filePath, targetPath);
  return targetPath;
}

export async function permanentDeleteNote(filePath: string): Promise<void> {
  await fs.unlink(filePath);
}

export async function emptyTrash(): Promise<void> {
  const trashDir = getTrashDir();
  const entries = await fs.readdir(trashDir);
  for (const entry of entries) {
    await fs.unlink(path.join(trashDir, entry));
  }
}

export function startWatching(onChange: () => void) {
  if (activeWatcher) {
    activeWatcher.close();
  }
  const root = getNotesRoot();
  activeWatcher = chokidar.watch(root, {
    ignored: /(^|[\/\\])\..|node_modules/,
    persistent: true,
    ignoreInitial: true,
    depth: 10
  });

  activeWatcher
    .on('add', () => onChange())
    .on('change', () => onChange())
    .on('unlink', () => onChange())
    .on('addDir', () => onChange())
    .on('unlinkDir', () => onChange());
}

