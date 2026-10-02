import { app, BrowserWindow, ipcMain, dialog, Menu, shell, screen, clipboard, protocol, net, MenuItemConstructorOptions, globalShortcut } from 'electron';
import path from 'path';
import fsSync from 'fs';
import { pathToFileURL } from 'url';
import { 
  searchExcerpts, previewVersion, restoreVersion, listVersionSummaries,
  getWindowRoot,
  setWindowRoot,
  removeWindowTracking,
  loadSavedRoot,
  readAllNotesTree, 
  readNoteContent, 
  saveNoteContent, 
  createNote, 
  duplicateNote,
  createFolder,
  renameFolder,
  deleteFolder,
  renameNote, 
  moveNote,
  moveToTrash,
  restoreFromTrash,
  permanentDeleteNote,
  emptyTrash,
  startWatchingWindow,
  assertInsideRoot,
  withFileLock,
  saveAttachment,
  searchNotes,
  fromAssetUrl,
  isInsideAnyRoot,
  ASSET_SCHEME,
  NotesChangedPayload
} from './fileSystem';

// Must run before the app is ready for the renderer to treat asset URLs as loadable.
protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
]);

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');

const allWindows = new Set<BrowserWindow>();
const QUICK_CAPTURE_SHORTCUT = process.platform === 'darwin' ? 'Control+Alt+Command+N' : 'Control+Alt+N';

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
  attachWatcher(win, webContentsId, rootPath);

  return win;
}

function attachWatcher(win: BrowserWindow, webContentsId: number, rootPath: string) {
  startWatchingWindow(webContentsId, rootPath, (data: NotesChangedPayload) => {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send('notes:changed', data);
      } catch {}
    }
  });
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
          accelerator: 'CmdOrCtrl+Shift+O',
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
          label: 'Quick Capture…',
          accelerator: QUICK_CAPTURE_SHORTCUT,
          click: () => openCapture()
        },
        {
          label: 'Save Note',
          accelerator: 'CmdOrCtrl+S',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:saveNote', focusedWin as BrowserWindow)
        },
        {
          label: 'Move Note to Trash',
          accelerator: 'CmdOrCtrl+Backspace',
          click: (_item, focusedWin) => {
            if (focusedWin && allWindows.has(focusedWin as BrowserWindow)) sendToFocusedWindow('menu:trashNote', focusedWin as BrowserWindow);
          }
        },
        {
          label: 'Duplicate Note',
          accelerator: 'CmdOrCtrl+D',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:duplicateNote', focusedWin as BrowserWindow)
        },
        {
          label: 'Reveal in Finder',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:revealInFinder', focusedWin as BrowserWindow)
        },
        { type: 'separator' as const },
        {
          label: 'Export as PDF...',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:exportPDF', focusedWin as BrowserWindow)
        },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+P',
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
  // Serve note attachments, refusing anything outside a vault the user has opened.
  protocol.handle(ASSET_SCHEME, async (request) => {
    const filePath = fromAssetUrl(request.url);
    if (!filePath || !isInsideAnyRoot(filePath)) {
      return new Response('Not found', { status: 404 });
    }
    try {
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  setupMenu();
  createWindow();
  captureShortcutAvailable = globalShortcut.register(QUICK_CAPTURE_SHORTCUT, () => openCapture());

  app.on('activate', () => {
    if (allWindows.size === 0) createWindow();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());

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

ipcMain.handle('notes:read', async (event, filePath: string) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  return await withFileLock(filePath, () => readNoteContent(filePath));
});

ipcMain.handle('notes:save', async (event, { filePath, markdown }) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  return await withFileLock(filePath, () => saveNoteContent(filePath, markdown, event.sender.id));
});

ipcMain.handle('notes:create', async (event, { folderPath, title, content }) => {
  const root = getWindowRoot(event.sender.id);
  const targetFolder = folderPath || root;
  assertInsideRoot(root, targetFolder);
  return await createNote(root, targetFolder, title, content, event.sender.id);
});

ipcMain.handle('notes:rename', async (event, { filePath, newTitle }) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  return await renameNote(root, filePath, newTitle, event.sender.id);
});

ipcMain.handle('notes:move', async (event, { filePath, targetFolderPath }) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  assertInsideRoot(root, targetFolderPath);
  return await moveNote(root, filePath, targetFolderPath, event.sender.id);
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
  assertInsideRoot(root, filePath);
  return await withFileLock(filePath, () => moveToTrash(filePath, root, event.sender.id));
});

ipcMain.handle('notes:trash', async (event, filePath: string) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  return await withFileLock(filePath, () => moveToTrash(filePath, root, event.sender.id));
});

ipcMain.handle('notes:restore', async (event, filePath: string) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  return await restoreFromTrash(filePath, root, event.sender.id);
});

ipcMain.handle('notes:permanentDelete', async (event, filePath: string) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  return await permanentDeleteNote(filePath, root, event.sender.id);
});

ipcMain.handle('notes:emptyTrash', async (event) => {
  const root = getWindowRoot(event.sender.id);
  return await emptyTrash(root, event.sender.id);
});

ipcMain.handle('notes:getPath', (event) => {
  return getWindowRoot(event.sender.id);
});

ipcMain.handle('notes:setPath', (event, newPath: string) => {
  setWindowRoot(event.sender.id, newPath);
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      attachWatcher(win, event.sender.id, newPath);
      win.webContents.send('notes:rootChanged', getWindowRoot(event.sender.id));
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
        attachWatcher(win, event.sender.id, selected);
      }
      return selected;
    }
  } catch {}
  return null;
});

ipcMain.handle('dialog:confirm', async (event, { message, detail, confirmLabel }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const options = {
    type: 'warning' as const,
    buttons: [confirmLabel || 'Delete', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: message || 'Are you sure?',
    detail
  };
  const res = win && !win.isDestroyed()
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options);
  return res.response === 0;
});

ipcMain.handle('dialog:message', async (event, { message, detail, type }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const options = {
    type: (type || 'info') as 'info' | 'error' | 'warning',
    buttons: ['OK'],
    message: message || '',
    detail
  };
  if (win && !win.isDestroyed()) {
    await dialog.showMessageBox(win, options);
  } else {
    await dialog.showMessageBox(options);
  }
  return true;
});

ipcMain.handle('notes:search', async (event, query: string) => {
  const root = getWindowRoot(event.sender.id);
  return await searchNotes(root, query);
});

ipcMain.handle('assets:save', async (event, { noteFilePath, fileName, data }) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, noteFilePath);
  return await saveAttachment(root, noteFilePath, fileName, new Uint8Array(data), event.sender.id);
});

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('shell:showInFinder', async (_, filePath: string) => {
  if (filePath) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('notes:duplicate', async (event, filePath: string) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  return await duplicateNote(root, filePath, event.sender.id);
});

ipcMain.handle('folders:create', async (event, { parentPath, name }: { parentPath: string; name: string }) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, parentPath);
  return await createFolder(parentPath, name, event.sender.id);
});

ipcMain.handle('folders:rename', async (event, { folderPath, newName }: { folderPath: string; newName: string }) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, folderPath);
  return await renameFolder(folderPath, newName, event.sender.id);
});

ipcMain.handle('folders:delete', async (event, folderPath: string) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, folderPath);
  if (path.resolve(folderPath) === path.resolve(root)) {
    throw new Error('Refusing to delete the notes root folder');
  }
  return await deleteFolder(folderPath, root, event.sender.id);
});

ipcMain.handle('clipboard:writeText', async (_, text: string) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('contextMenu:note', async (event, { note, isPinned, isTrash, folders, position }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;

  return new Promise((resolve) => {
    const template: MenuItemConstructorOptions[] = [];

    if (!isTrash) {
      template.push(
        {
          label: isPinned ? 'Unpin Note' : 'Pin Note',
          click: () => resolve({ action: 'togglePin', filePath: note.filePath })
        },
        {
          label: 'Duplicate Note',
          accelerator: 'CmdOrCtrl+D',
          click: () => resolve({ action: 'duplicate', filePath: note.filePath })
        },
        { type: 'separator' },
        {
          label: 'Reveal in Finder',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            shell.showItemInFolder(note.filePath);
            resolve({ action: 'revealInFinder', filePath: note.filePath });
          }
        },
        {
          label: 'Open in New Window',
          click: () => {
            createWindow(path.dirname(note.filePath));
            resolve({ action: 'openInNewWindow', filePath: note.filePath });
          }
        },
        { type: 'separator' }
      );

      // Move to Folder Submenu
      if (folders && folders.length > 0) {
        const buildFolderSubmenu = (nodes: any[]): MenuItemConstructorOptions[] => {
          const items: MenuItemConstructorOptions[] = [];
          for (const node of nodes) {
            items.push({
              label: node.name,
              click: () => resolve({ action: 'moveToFolder', filePath: note.filePath, targetPath: node.path }),
              submenu: node.children && node.children.length > 0 ? buildFolderSubmenu(node.children) : undefined
            });
          }
          return items;
        };

        const folderItems = buildFolderSubmenu(folders[0]?.children || []);
        folderItems.unshift({
          label: 'All Notes (Root)',
          click: () => resolve({ action: 'moveToFolder', filePath: note.filePath, targetPath: folders[0]?.path })
        });

        template.push({
          label: 'Move to Folder',
          submenu: folderItems
        });
      }

      template.push(
        {
          label: 'Copy Note Link',
          click: () => {
            clipboard.writeText(`[[${note.title}]]`);
            resolve({ action: 'copyLink', filePath: note.filePath });
          }
        },
        {
          label: 'Copy File Path',
          click: () => {
            clipboard.writeText(note.filePath);
            resolve({ action: 'copyPath', filePath: note.filePath });
          }
        },
        { type: 'separator' },
        {
          label: 'Export as PDF...',
          click: () => resolve({ action: 'exportPDF', filePath: note.filePath })
        },
        { type: 'separator' },
        {
          label: 'Move to Trash',
          accelerator: 'CmdOrCtrl+Backspace',
          click: () => resolve({ action: 'trash', filePath: note.filePath })
        }
      );
    } else {
      template.push(
        {
          label: 'Restore Note',
          click: () => resolve({ action: 'restore', filePath: note.filePath })
        },
        {
          label: 'Reveal in Finder',
          click: () => {
            shell.showItemInFolder(note.filePath);
            resolve({ action: 'revealInFinder', filePath: note.filePath });
          }
        },
        { type: 'separator' },
        {
          label: 'Delete Permanently',
          click: () => resolve({ action: 'permanentDelete', filePath: note.filePath })
        }
      );
    }

    const menu = Menu.buildFromTemplate(template);
    const zoom = win.webContents.getZoomFactor();
    const bounds = win.getContentBounds();
    const anchor = position && Number.isFinite(position.x) && Number.isFinite(position.y)
      ? {
          x: Math.max(0, Math.min(bounds.width - 1, Math.round(position.x * zoom))),
          y: Math.max(0, Math.min(bounds.height - 1, Math.round(position.y * zoom)))
        }
      : {};
    menu.popup({
      window: win,
      ...anchor,
      callback: () => {
        setTimeout(() => resolve(null), 100);
      }
    });
  });
});

ipcMain.handle('contextMenu:folder', async (event, { folderPath, isRoot }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;

  return new Promise((resolve) => {
    const template: MenuItemConstructorOptions[] = [
      {
        label: 'New Note in Folder',
        click: () => resolve({ action: 'newNote', folderPath })
      },
      {
        label: 'New Subfolder...',
        click: () => resolve({ action: 'newSubfolder', folderPath })
      },
      { type: 'separator' },
      {
        label: 'Reveal in Finder',
        click: () => {
          shell.showItemInFolder(folderPath);
          resolve({ action: 'revealInFinder', folderPath });
        }
      }
    ];

    if (!isRoot) {
      template.push(
        { type: 'separator' },
        {
          label: 'Rename Folder...',
          click: () => resolve({ action: 'renameFolder', folderPath })
        },
        {
          label: 'Delete Folder',
          click: () => resolve({ action: 'deleteFolder', folderPath })
        }
      );
    }

    const menu = Menu.buildFromTemplate(template);
    menu.popup({
      window: win,
      callback: () => {
        setTimeout(() => resolve(null), 100);
      }
    });
  });
});

let captureWindow: BrowserWindow | null = null;
let captureShortcutAvailable = false;
let captureRoot = '';
let captureSaving = false;
function openCapture() {
  if (captureWindow && !captureWindow.isDestroyed()) { captureWindow.show(); captureWindow.focus(); return; }
  const focused = BrowserWindow.getFocusedWindow();
  captureRoot = focused && allWindows.has(focused) ? getWindowRoot(focused.webContents.id) : loadSavedRoot();
  const win = new BrowserWindow({ width: 520, height: 410, minWidth: 380, minHeight: 300,
    title: 'Quick Capture', titleBarStyle: 'hiddenInset', backgroundColor: '#fafafa',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  captureWindow = win;
  setWindowRoot(win.webContents.id, captureRoot);
  const captureId = win.webContents.id;
  win.on('closed', () => { removeWindowTracking(captureId); captureWindow = null; });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(`${process.env.VITE_DEV_SERVER_URL}?capture=1`);
  else win.loadFile(path.join(process.env.DIST!, 'index.html'), { query: { capture: '1' } });
}
ipcMain.handle('capture:open', () => openCapture());
ipcMain.handle('capture:info', () => ({ rootPath: captureRoot, shortcutAvailable: captureShortcutAvailable }));
ipcMain.handle('capture:close', event => {
  if (captureWindow?.webContents.id === event.sender.id) captureWindow.close();
});
ipcMain.handle('capture:save', async (event, title: string, content: string) => {
  if (event.sender.id !== captureWindow?.webContents.id || captureSaving) throw new Error('Capture is already saving.');
  if (!title.trim() && !content.trim()) throw new Error('Write something before saving.');
  captureSaving = true;
  try {
    const root = getWindowRoot(event.sender.id);
    await fsSync.promises.mkdir(root, { recursive: true });
    const note = await createNote(root, root, title.trim() || 'Quick Note', content, event.sender.id);
    for (const win of allWindows) {
      if (getWindowRoot(win.webContents.id) === root) win.webContents.send('notes:changed', { changedPaths: [note.filePath], structural: true });
    }
    return note;
  } finally { captureSaving = false; }
});
ipcMain.handle('notes:searchExcerpts', eventQuery);
async function eventQuery(event: Electron.IpcMainInvokeEvent, query: string) {
  return searchExcerpts(getWindowRoot(event.sender.id), query);
}
ipcMain.handle('notes:versions', async (event, filePath: string) => {
  assertInsideRoot(getWindowRoot(event.sender.id), filePath);
  return withFileLock(filePath, () => listVersionSummaries(filePath));
});
ipcMain.handle('notes:previewVersion', async (event, filePath: string, id: string) => {
  assertInsideRoot(getWindowRoot(event.sender.id), filePath);
  return withFileLock(filePath, () => previewVersion(filePath, id));
});
ipcMain.handle('notes:restoreVersion', async (event, filePath: string, id: string) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  await withFileLock(filePath, () => restoreVersion(filePath, id, event.sender.id));
  for (const win of allWindows) {
    if (getWindowRoot(win.webContents.id) === root) win.webContents.send('notes:changed', { changedPaths: [filePath], structural: false });
  }
});
