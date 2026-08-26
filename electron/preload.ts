import { contextBridge, ipcRenderer } from 'electron';

export const scribeAPI = {
  listNotesTree: () => ipcRenderer.invoke('notes:listTree'),
  readNote: (filePath: string) => ipcRenderer.invoke('notes:read', filePath),
  saveNote: (payload: { filePath: string; markdown: string }) =>
    ipcRenderer.invoke('notes:save', payload),
  createNote: (payload: { folderPath?: string; title?: string; content?: string }) => 
    ipcRenderer.invoke('notes:create', payload),
  renameNote: (payload: { filePath: string; newTitle: string }) => 
    ipcRenderer.invoke('notes:rename', payload),
  moveNote: (payload: { filePath: string; targetFolderPath: string }) =>
    ipcRenderer.invoke('notes:move', payload),
  deleteNote: (filePath: string) => ipcRenderer.invoke('notes:delete', filePath),
  trashNote: (filePath: string) => ipcRenderer.invoke('notes:trash', filePath),
  restoreNote: (filePath: string) => ipcRenderer.invoke('notes:restore', filePath),
  permanentDeleteNote: (filePath: string) => ipcRenderer.invoke('notes:permanentDelete', filePath),
  emptyTrash: () => ipcRenderer.invoke('notes:emptyTrash'),
  getNotesPath: () => ipcRenderer.invoke('notes:getPath'),
  setNotesPath: (path: string) => ipcRenderer.invoke('notes:setPath', path),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  searchNotes: (query: string) => ipcRenderer.invoke('notes:search', query) as Promise<string[]>,
  confirmDestructive: (payload: { message: string; detail?: string; confirmLabel?: string }) =>
    ipcRenderer.invoke('dialog:confirm', payload) as Promise<boolean>,
  showMessage: (payload: { message: string; detail?: string; type?: 'info' | 'error' | 'warning' }) =>
    ipcRenderer.invoke('dialog:message', payload) as Promise<boolean>,
  saveAttachment: (payload: { noteFilePath: string; fileName: string; data: Uint8Array }) =>
    ipcRenderer.invoke('assets:save', payload) as Promise<{ absolutePath: string; assetUrl: string }>,
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  showInFinder: (filePath: string) => ipcRenderer.invoke('shell:showInFinder', filePath),
  duplicateNote: (filePath: string) => ipcRenderer.invoke('notes:duplicate', filePath),
  createFolder: (payload: { parentPath: string; name: string }) => ipcRenderer.invoke('folders:create', payload),
  renameFolder: (payload: { folderPath: string; newName: string }) => ipcRenderer.invoke('folders:rename', payload),
  deleteFolder: (folderPath: string) => ipcRenderer.invoke('folders:delete', folderPath),
  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  showNoteContextMenu: (payload: { note: any; isPinned: boolean; isTrash: boolean; folders: any[] }) =>
    ipcRenderer.invoke('contextMenu:note', payload),
  showFolderContextMenu: (payload: { folderPath: string; isRoot: boolean }) =>
    ipcRenderer.invoke('contextMenu:folder', payload),
  exportPDF: (defaultTitle: string) => ipcRenderer.invoke('notes:exportPDF', defaultTitle),
  printNote: () => ipcRenderer.invoke('notes:print'),
  onNotesChanged: (callback: (data: { changedPaths: string[]; structural: boolean }) => void) => {
    const handler = (_: any, data: any) =>
      callback({ changedPaths: data?.changedPaths ?? [], structural: !!data?.structural });
    ipcRenderer.on('notes:changed', handler);
    return () => {
      ipcRenderer.removeListener('notes:changed', handler);
    };
  },
  onRootChanged: (callback: (newPath: string) => void) => {
    const handler = (_: any, p: string) => callback(p);
    ipcRenderer.on('notes:rootChanged', handler);
    return () => {
      ipcRenderer.removeListener('notes:rootChanged', handler);
    };
  },
  onMenuEvent: (channel: string, callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  }
};

contextBridge.exposeInMainWorld('scribeAPI', scribeAPI);

declare global {
  interface Window {
    scribeAPI: typeof scribeAPI;
  }
}
