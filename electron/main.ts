import { app, BrowserWindow, ipcMain, dialog, Menu, shell, screen, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import fsSync from 'fs';
import { 
  getWindowRoot,
  setWindowRoot,
  removeWindowTracking,
  loadSavedRoot,
  readAllNotesTree, 
  readNoteContent, 
  saveNoteContent, 
  createNote, 
  renameNote, 
  moveNote,
  moveToTrash,
  restoreFromTrash,
  permanentDeleteNote,
  emptyTrash,
  startWatchingWindow
} from './fileSystem';

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');

const allWindows = new Set<BrowserWindow>();

function getAppIconPath(): string {
  const possiblePaths = [
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(process.env.VITE_PUBLIC || '', 'icon.png'),
    path.join(process.env.DIST || '', 'icon.png')
  ];
  for (const p of possiblePaths) {
    if (p && fsSync.existsSync(p)) return p;
  }
  return path.join(__dirname, '../public/icon.png');
}

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

export function createWindow(targetFolderPath?: string): BrowserWindow {
  const windowState = loadWindowState();
  const cascadeOffset = (allWindows.size * 25) % 150;

  const win = new BrowserWindow({
    x: windowState.x !== undefined ? windowState.x + cascadeOffset : undefined,
    y: windowState.y !== undefined ? windowState.y + cascadeOffset : undefined,
    width: windowState.width,
    height: windowState.height,
    minWidth: 860,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true
    }
  });

  allWindows.add(win);
  const webContentsId = win.webContents.id;

  // Set the folder path for this window
  const rootPath = targetFolderPath || loadSavedRoot();
  setWindowRoot(webContentsId, rootPath);

  if (windowState.isMaximized && allWindows.size === 1) {
    win.maximize();
  }

  // Persist window position, size, and scale
  let saveTimeout: NodeJS.Timeout | null = null;
  const trackWindowState = () => {
    if (!win || win.isDestroyed()) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      try {
        const isMax = win.isMaximized();
        if (isMax) {
          saveWindowState({ width: windowState.width, height: windowState.height, isMaximized: true });
        } else if (!win.isFullScreen() && !win.isMinimized()) {
          const bounds = win.getBounds();
          saveWindowState({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            isMaximized: false
          });
        }
      } catch {}
    }, 250);
  };

  win.on('resize', trackWindowState);
  win.on('move', trackWindowState);
  win.on('closed', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    allWindows.delete(win);
    removeWindowTracking(webContentsId);
  });

  if (process.platform === 'darwin' && app.dock) {
    try {
      const iconPath = getAppIconPath();
      if (fsSync.existsSync(iconPath)) {
        app.dock.setIcon(iconPath);
      }
    } catch (e) {
      console.error('Could not set dock icon:', e);
    }
  }

  // Open external web links in user's default browser (Safari, Chrome, etc.)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST || path.join(__dirname, '../dist'), 'index.html'));
  }

  // Watch for external file changes in this window's workspace folder
  startWatchingWindow(webContentsId, rootPath, (data) => {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send('notes:changed', data);
      } catch {}
    }
  });

  return win;
}

function sendToFocusedWindow(channel: string, focusedWin?: BrowserWindow) {
  const win = focusedWin || BrowserWindow.getFocusedWindow() || Array.from(allWindows)[0];
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send(channel);
    } catch {}
  }
}

function setupMenu() {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:newNote', focusedWin as BrowserWindow)
        },
        {
          label: 'Quick Switcher...',
          accelerator: 'CmdOrCtrl+P',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:quickSwitcher', focusedWin as BrowserWindow)
        },
        { type: 'separator' as const },
        {
          label: 'Open Folder in New Window...',
          accelerator: 'CmdOrCtrl+O',
          click: async (_item, focusedWin) => {
            const win = focusedWin as BrowserWindow | undefined;
            const res = (win && !win.isDestroyed())
              ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
              : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
            if (!res.canceled && res.filePaths.length > 0) {
              createWindow(res.filePaths[0]);
            }
          }
        },
        { type: 'separator' as const },
        {
          label: 'Save Note',
          accelerator: 'CmdOrCtrl+S',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:saveNote', focusedWin as BrowserWindow)
        },
        { type: 'separator' as const },
        {
          label: 'Export as PDF...',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:exportPDF', focusedWin as BrowserWindow)
        },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:printNote', focusedWin as BrowserWindow)
        },
        { type: 'separator' as const },
        {
          label: 'Back in History',
          accelerator: 'CmdOrCtrl+[',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:goBack', focusedWin as BrowserWindow)
        },
        {
          label: 'Forward in History',
          accelerator: 'CmdOrCtrl+]',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:goForward', focusedWin as BrowserWindow)
        },
        ...(isMac ? [{ role: 'close' as const }] : [{ role: 'quit' as const }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
        { type: 'separator' as const },
        {
          label: 'Find in Note...',
          accelerator: 'CmdOrCtrl+F',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:find', focusedWin as BrowserWindow)
        },
        {
          label: 'Find and Replace...',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:findReplace', focusedWin as BrowserWindow)
        }
      ]
    },
    {
      label: 'Format',
      submenu: [
        {
          label: 'Bold',
          accelerator: 'CmdOrCtrl+B',
          click: (_item, focusedWin) => sendToFocusedWindow('format:bold', focusedWin as BrowserWindow)
        },
        {
          label: 'Italic',
          accelerator: 'CmdOrCtrl+I',
          click: (_item, focusedWin) => sendToFocusedWindow('format:italic', focusedWin as BrowserWindow)
        },
        {
          label: 'Toggle Checklist',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: (_item, focusedWin) => sendToFocusedWindow('format:task', focusedWin as BrowserWindow)
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = getAppIconPath();
    if (fsSync.existsSync(iconPath)) {
      app.dock.setIcon(iconPath);
    }
  }
  setupMenu();
  createWindow();

  app.on('activate', () => {
    if (allWindows.size === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers scoped per window
ipcMain.handle('notes:listTree', async (event) => {
  const root = getWindowRoot(event.sender.id);
  return await readAllNotesTree(root);
});

ipcMain.handle('notes:read', async (_, filePath: string) => {
  return await readNoteContent(filePath);
});

ipcMain.handle('notes:save', async (_, { filePath, markdown, frontmatter }) => {
  return await saveNoteContent(filePath, markdown, frontmatter);
});

ipcMain.handle('notes:create', async (event, { folderPath, title, content }) => {
  const root = getWindowRoot(event.sender.id);
  const targetFolder = folderPath || root;
  return await createNote(targetFolder, title, content);
});

ipcMain.handle('notes:rename', async (_, { filePath, newTitle }) => {
  return await renameNote(filePath, newTitle);
});

ipcMain.handle('notes:move', async (_, { filePath, targetFolderPath }) => {
  return await moveNote(filePath, targetFolderPath);
});

ipcMain.handle('notes:exportPDF', async (event, defaultTitle: string) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No active window' };
    const res = await dialog.showSaveDialog(win, {
      title: 'Export Note as PDF',
      defaultPath: `${defaultTitle || 'Note'}.pdf`,
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    });
    if (res.canceled || !res.filePath) return { success: false, canceled: true };

    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5
      }
    });
    await fsSync.promises.writeFile(res.filePath, pdfBuffer);
    return { success: true, filePath: res.filePath };
  } catch (err: any) {
    console.error('Failed to export PDF:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('notes:print', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.webContents.print({ silent: false });
    return true;
  }
  return false;
});

ipcMain.handle('notes:delete', async (event, filePath: string) => {
  const root = getWindowRoot(event.sender.id);
  return await moveToTrash(filePath, root);
});

ipcMain.handle('notes:trash', async (event, filePath: string) => {
  const root = getWindowRoot(event.sender.id);
  return await moveToTrash(filePath, root);
});

ipcMain.handle('notes:restore', async (event, filePath: string) => {
  const root = getWindowRoot(event.sender.id);
  return await restoreFromTrash(filePath, root);
});

ipcMain.handle('notes:permanentDelete', async (_, filePath: string) => {
  return await permanentDeleteNote(filePath);
});

ipcMain.handle('notes:emptyTrash', async (event) => {
  const root = getWindowRoot(event.sender.id);
  return await emptyTrash(root);
});

ipcMain.handle('notes:getPath', (event) => {
  return getWindowRoot(event.sender.id);
});

ipcMain.handle('notes:setPath', (event, newPath: string) => {
  setWindowRoot(event.sender.id, newPath);
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      startWatchingWindow(event.sender.id, newPath, (data) => {
        if (!win.isDestroyed()) {
          try {
            win.webContents.send('notes:changed', data);
          } catch {}
        }
      });
    }
  } catch {}
  return getWindowRoot(event.sender.id);
});

ipcMain.handle('dialog:selectFolder', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = (win && !win.isDestroyed())
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
      
    if (!res.canceled && res.filePaths.length > 0) {
      const selected = res.filePaths[0];
      setWindowRoot(event.sender.id, selected);
      if (win && !win.isDestroyed()) {
        startWatchingWindow(event.sender.id, selected, (data) => {
          if (!win.isDestroyed()) {
            try {
              win.webContents.send('notes:changed', data);
            } catch {}
          }
        });
      }
      return selected;
    }
  } catch {}
  return null;
});

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});
