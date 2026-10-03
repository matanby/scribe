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

export interface NoteFocusRequest {
  filePath: string;
  requestId: number;
  target?: 'title' | 'body';
  search?: string;
  focus?: boolean;
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

export type SortMode = 
  | 'date-edited-desc'
  | 'date-edited-asc'
  | 'date-created-desc'
  | 'date-created-asc'
  | 'title-asc'
  | 'title-desc';

export type SaveResult = { conflict: false; markdown: string } | { conflict: true; markdown: string };
