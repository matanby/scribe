import { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme, shell, screen } from 'electron';
import path from 'path';
import fsSync from 'fs';
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

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

function getWindowStateConfigPath(): string {
  try {
    if (app && app.getPath) {
      return path.join(app.getPath('userData'), 'scribe-window-state.json');
    }
  } catch {}
  return path.join(process.env.HOME || '', '.scribe-window-state.json');
}

function loadWindowState(): WindowState {
  const defaultState: WindowState = {
    width: 1240,
    height: 820,
  };

  try {
    const configPath = getWindowStateConfigPath();
    if (fsSync.existsSync(configPath)) {
      const data = JSON.parse(fsSync.readFileSync(configPath, 'utf-8'));
      if (typeof data.width === 'number' && typeof data.height === 'number') {
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          const visible = screen.getAllDisplays().some(display => {
            const { x, y, width, height } = display.bounds;
            return (
              data.x >= x - 100 &&
              data.x <= x + width - 100 &&
              data.y >= y - 50 &&
              data.y <= y + height - 50
            );
          });
          if (visible) {
            return {
              x: data.x,
              y: data.y,
              width: Math.max(860, data.width),
              height: Math.max(520, data.height),
              isMaximized: !!data.isMaximized
            };
          }
        }
        return {
          width: Math.max(860, data.width),
          height: Math.max(520, data.height),
          isMaximized: !!data.isMaximized
        };
      }
    }
  } catch (e) {
    console.error('Failed to load window state:', e);
  }

  return defaultState;
}

function saveWindowState(state: WindowState) {
  try {
    const configPath = getWindowStateConfigPath();
    fsSync.writeFileSync(configPath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save window state:', e);
  }
}

function createWindow() {
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 860,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true
    }
  });

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Persist window position, size, and scale
  let saveTimeout: NodeJS.Timeout | null = null;
  const trackWindowState = () => {
    if (!mainWindow) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (!mainWindow) return;
      const isMax = mainWindow.isMaximized();
      if (isMax) {
        saveWindowState({ width: windowState.width, height: windowState.height, isMaximized: true });
      } else if (!mainWindow.isFullScreen() && !mainWindow.isMinimized()) {
        const bounds = mainWindow.getBounds();
        saveWindowState({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          isMaximized: false
        });
      }
    }, 250);
  };

  mainWindow.on('resize', trackWindowState);
  mainWindow.on('move', trackWindowState);
  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isFullScreen() && !mainWindow.isMinimized()) {
      if (mainWindow.isMaximized()) {
        saveWindowState({ width: windowState.width, height: windowState.height, isMaximized: true });
      } else {
        const bounds = mainWindow.getBounds();
        saveWindowState({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          isMaximized: false
        });
      }
    }
  });

  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(path.join(__dirname, '../public/icon.png'));
    } catch (e) {
      console.error('Could not set dock icon:', e);
    }
  }

  // Open external web links in user's default browser (Safari, Chrome, etc.)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST || path.join(__dirname, '../dist'), 'index.html'));
  }

  // Watch for external file changes in workspace folder
  startWatching((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notes:changed', data);
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
          label: 'Quick Switcher...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:quickSwitcher')
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            if (!mainWindow) return;
            const res = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory', 'createDirectory']
            });
            if (!res.canceled && res.filePaths.length > 0) {
              setNotesRoot(res.filePaths[0]);
              mainWindow.webContents.send('notes:rootChanged', res.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
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
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find in Note',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow?.webContents.send('menu:find')
        }
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

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});
