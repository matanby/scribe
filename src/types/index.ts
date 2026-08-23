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
  trashNotes: NoteMeta[];
  trashCount: number;
}
