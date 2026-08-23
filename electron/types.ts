export interface NoteMeta {
  id: string;
  filePath: string;
  fileName: string;
  title: string;
  snippet: string;
  folder: string;
  modifiedAt: number;
  createdAt: number;
  frontmatter?: Record<string, any>;
}

export interface FolderNode {
  name: string;
  path: string;
  relativePath: string;
  noteCount: number;
  children: FolderNode[];
}

export interface NotesTree {
  rootPath: string;
  folders: FolderNode[];
  allNotes: NoteMeta[];
}

export interface SaveNotePayload {
  filePath: string;
  markdown: string;
  frontmatter?: Record<string, any>;
}

export interface CreateNotePayload {
  folderPath: string;
  title?: string;
  content?: string;
}

export interface RenameNotePayload {
  filePath: string;
  newTitle: string;
}
