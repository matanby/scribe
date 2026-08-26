export interface NoteMeta {
  id: string;
  filePath: string;
  fileName: string;
  title: string;
  snippet: string;
  folder: string;
  /** Set for folders shown in the Trash view, which can be restored as a unit. */
  isFolder?: boolean;
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
  trashNotes: NoteMeta[];
  trashCount: number;
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

export interface RestoreNotePayload {
  filePath: string;
}

