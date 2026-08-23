import { contextBridge, ipcRenderer } from 'electron';

export const scribeAPI = {
  listNotesTree: () => ipcRenderer.invoke('notes:listTree'),
  readNote: (filePath: string) => ipcRenderer.invoke('notes:read', filePath),
  saveNote: (payload: { filePath: string; markdown: string; frontmatter?: Record<string, any> }) => 
    ipcRenderer.invoke('notes:save', payload),
  createNote: (payload: { folderPath?: string; title?: string; content?: string }) => 
    ipcRenderer.invoke('notes:create', payload),
  renameNote: (payload: { filePath: string; newTitle: string }) => 
    ipcRenderer.invoke('notes:rename', payload),
  deleteNote: (filePath: string) => ipcRenderer.invoke('notes:delete', filePath),
  trashNote: (filePath: string) => ipcRenderer.invoke('notes:trash', filePath),
  restoreNote: (filePath: string) => ipcRenderer.invoke('notes:restore', filePath),
  permanentDeleteNote: (filePath: string) => ipcRenderer.invoke('notes:permanentDelete', filePath),
  emptyTrash: () => ipcRenderer.invoke('notes:emptyTrash'),
  getNotesPath: () => ipcRenderer.invoke('notes:getPath'),
  setNotesPath: (path: string) => ipcRenderer.invoke('notes:setPath', path),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  onNotesChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('notes:changed', handler);
    return () => {
      ipcRenderer.removeListener('notes:changed', handler);
    };
  }
};

contextBridge.exposeInMainWorld('scribeAPI', scribeAPI);

declare global {
  interface Window {
    scribeAPI: typeof scribeAPI;
  }
}
