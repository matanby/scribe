import { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } from 'electron';
import path from 'path';
import { 
  getNotesRoot, 
  setNotesRoot, 
  readAllNotesTree, 
  readNoteContent, 
  saveNoteContent, 
  createNote, 
  renameNote, 
  moveToTrash,
  restoreFromTrash,
  permanentDeleteNote,
  emptyTrash,
  startWatching
} from './fileSystem';

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 860,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST || path.join(__dirname, '../dist'), 'index.html'));
  }

  // Watch for external file changes in Google Drive
  startWatching(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notes:changed');
    }
  });
}

function setupMenu() {
  const isMac = process.platform === 'darwin';
  const template: any[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:newNote')
        },
        {
          label: 'Save Note',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:saveNote')
        },
        ...(isMac ? [{ role: 'close' }] : [{ role: 'quit' }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Format',
      submenu: [
        {
          label: 'Bold',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('format:bold')
        },
        {
          label: 'Italic',
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow?.webContents.send('format:italic')
        },
        {
          label: 'Toggle Checklist',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => mainWindow?.webContents.send('format:task')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  setupMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('notes:listTree', async () => {
  return await readAllNotesTree();
});

ipcMain.handle('notes:read', async (_, filePath: string) => {
  return await readNoteContent(filePath);
});

ipcMain.handle('notes:save', async (_, { filePath, markdown, frontmatter }) => {
  return await saveNoteContent(filePath, markdown, frontmatter);
});

ipcMain.handle('notes:create', async (_, { folderPath, title, content }) => {
  return await createNote(folderPath, title, content);
});

ipcMain.handle('notes:rename', async (_, { filePath, newTitle }) => {
  return await renameNote(filePath, newTitle);
});

ipcMain.handle('notes:delete', async (_, filePath: string) => {
  return await moveToTrash(filePath);
});

ipcMain.handle('notes:trash', async (_, filePath: string) => {
  return await moveToTrash(filePath);
});

ipcMain.handle('notes:restore', async (_, filePath: string) => {
  return await restoreFromTrash(filePath);
});

ipcMain.handle('notes:permanentDelete', async (_, filePath: string) => {
  return await permanentDeleteNote(filePath);
});

ipcMain.handle('notes:emptyTrash', async () => {
  return await emptyTrash();
});

ipcMain.handle('notes:getPath', () => {
  return getNotesRoot();
});

ipcMain.handle('notes:setPath', (_, newPath: string) => {
  setNotesRoot(newPath);
  return getNotesRoot();
});

ipcMain.handle('dialog:selectFolder', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (!res.canceled && res.filePaths.length > 0) {
    const selected = res.filePaths[0];
    setNotesRoot(selected);
    return selected;
  }
  return null;
});
