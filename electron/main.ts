import { app, BrowserWindow, ipcMain, dialog, Menu, shell, screen, clipboard, protocol, net, MenuItemConstructorOptions, globalShortcut, systemPreferences } from 'electron';
import { CaptureShortcut, captureAccelerator, captureShortcutState, loadCaptureShortcut, registerCaptureShortcut, updateCaptureShortcut } from './shortcuts';
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
  readSingleNoteTree,
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
  rewriteImageReferences,
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

// A development preview can keep preferences, history, and sample notes separate.
if (!app.isPackaged && process.env.SCRIBE_PREVIEW_DATA) {
  fsSync.mkdirSync(process.env.SCRIBE_PREVIEW_DATA, { recursive: true });
  app.setPath('userData', process.env.SCRIBE_PREVIEW_DATA);
  app.setName('Scribe Preview');
}

const allWindows = new Set<BrowserWindow>();
const documentFiles = new Map<number, string>();
const pendingFiles = new Set<string>();
const openingFiles = new Set<string>();
let fileOpeningReady = false;

// Finder may deliver documents before Electron is ready.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (!fileOpeningReady) pendingFiles.add(filePath);
  else void openMarkdownFile(filePath);
});

async function openMarkdownFile(filePath: string) {
  const key = path.resolve(filePath);
  if (openingFiles.has(key)) return;
  openingFiles.add(key);
  try {
    if (!/\.(md|markdown)$/i.test(filePath)) throw new Error('Choose a Markdown (.md or .markdown) file.');
    const resolved = await fsSync.promises.realpath(path.resolve(filePath));
    if (!(await fsSync.promises.stat(resolved)).isFile()) throw new Error('This is not a file.');
    await fsSync.promises.access(resolved, fsSync.constants.R_OK);
    const existing = Array.from(allWindows).find(win => !win.isDestroyed() && documentFiles.get(win.webContents.id) === resolved);
    if (existing) { if (existing.isMinimized()) existing.restore(); existing.show(); existing.focus(); return; }
    const win = createWindow(path.dirname(resolved), false, false, resolved);
    win.setRepresentedFilename(resolved);
    win.setTitle(path.basename(resolved));
    app.addRecentDocument(resolved);
  } catch (error: any) {
    await dialog.showMessageBox({ type: 'error', message: 'Could not open Markdown file', detail: error.message || 'The file is unavailable.' });
  } finally { openingFiles.delete(key); }
}

function trackDocument(winId: number, filePath: string) {
  if (!documentFiles.has(winId)) return;
  documentFiles.set(winId, filePath);
  const win = Array.from(allWindows).find(win => win.webContents.id === winId);
  if (win) {
    win.setRepresentedFilename(filePath); win.setTitle(path.basename(filePath));
    attachWatcher(win, winId, getWindowRoot(winId));
    app.addRecentDocument(filePath);
  }
}

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
  zoomFactor?: number;
}

const ZOOM_STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5] as const;
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];
let currentZoomFactor: number | null = null;

function normalizeZoomFactor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  return Math.round(clamped * 100) / 100;
}

function stepZoomFactor(current: number, direction: 1 | -1): number {
  const normalized = normalizeZoomFactor(current);
  if (direction > 0) {
    return ZOOM_STEPS.find(step => step > normalized + 0.001) ?? MAX_ZOOM;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < normalized - 0.001) return ZOOM_STEPS[i];
  }
  return MIN_ZOOM;
}

function getWindowStateConfigPath(documentMode = false): string {
  try {
    if (app && app.getPath) {
      return path.join(app.getPath('userData'), documentMode ? 'scribe-document-window-state.json' : 'scribe-window-state.json');
    }
  } catch {}
  return path.join(process.env.HOME || '', documentMode ? '.scribe-document-window-state.json' : '.scribe-window-state.json');
}

function loadWindowState(documentMode = false): WindowState {
  const defaultState: WindowState = {
    width: documentMode ? 980 : 1240,
    height: 820,
  };

  try {
    const configPath = getWindowStateConfigPath(documentMode);
    if (fsSync.existsSync(configPath)) {
      const data = JSON.parse(fsSync.readFileSync(configPath, 'utf-8'));
      const zoomFactor = typeof data.zoomFactor === 'number' && Number.isFinite(data.zoomFactor) ? normalizeZoomFactor(data.zoomFactor) : undefined;
      if (Number.isFinite(data.width) && Number.isFinite(data.height)) {
        if (documentMode) {
          const hasPosition = Number.isFinite(data.x) && Number.isFinite(data.y);
          const area = (hasPosition ? screen.getDisplayMatching({ x: data.x, y: data.y, width: Math.max(1, data.width), height: Math.max(1, data.height) }) : screen.getPrimaryDisplay()).workArea;
          const width = Math.min(area.width, Math.max(620, data.width));
          const height = Math.min(area.height, Math.max(520, data.height));
          return { width, height, isMaximized: !!data.isMaximized, zoomFactor, ...(hasPosition ? { x: Math.max(area.x, Math.min(data.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(data.y, area.y + area.height - height)) } : {}) };
        }
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
              isMaximized: !!data.isMaximized,
              zoomFactor
            };
          }
        }
        return {
          width: Math.max(860, data.width),
          height: Math.max(520, data.height),
          isMaximized: !!data.isMaximized,
          zoomFactor
        };
      }
      if (zoomFactor !== undefined) {
        return { ...defaultState, zoomFactor };
      }
    }
  } catch (e) {
    console.error('Failed to load window state:', e);
  }

  return defaultState;
}

function saveWindowState(state: WindowState, documentMode = false) {
  try {
    const configPath = getWindowStateConfigPath(documentMode);
    fsSync.writeFileSync(configPath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save window state:', e);
  }
}

function getCurrentZoomFactor(): number {
  if (currentZoomFactor === null) {
    currentZoomFactor = loadWindowState(false).zoomFactor ?? loadWindowState(true).zoomFactor ?? 1;
  }
  return currentZoomFactor;
}

function getTrafficLightPosition(factor = getCurrentZoomFactor()): { x: number; y: number } {
  return { x: 18, y: Math.max(10, Math.round(27 * factor - 9)) };
}

function applyZoomToWindow(win: BrowserWindow, factor = getCurrentZoomFactor(), adjustTrafficLights = true) {
  if (win.isDestroyed()) return;
  try {
    win.webContents.setZoomFactor(factor);
    if (adjustTrafficLights && process.platform === 'darwin' && typeof win.setWindowButtonPosition === 'function') {
      win.setWindowButtonPosition(getTrafficLightPosition(factor));
    }
    win.webContents.send('zoom:changed', factor);
  } catch {}
}

function syncZoomMenu() {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  const factor = getCurrentZoomFactor();
  const zoomInItem = menu.getMenuItemById('zoom-in');
  if (zoomInItem) zoomInItem.enabled = factor < MAX_ZOOM - 0.001;
  const zoomOutItem = menu.getMenuItemById('zoom-out');
  if (zoomOutItem) zoomOutItem.enabled = factor > MIN_ZOOM + 0.001;
  const zoomResetItem = menu.getMenuItemById('zoom-reset');
  if (zoomResetItem) zoomResetItem.enabled = Math.abs(factor - 1) > 0.001;
}

function setAppZoomFactor(factor: number): number {
  const next = normalizeZoomFactor(factor);
  currentZoomFactor = next;
  for (const documentMode of [false, true]) {
    const state = loadWindowState(documentMode);
    saveWindowState({ ...state, zoomFactor: next }, documentMode);
  }
  for (const win of allWindows) {
    applyZoomToWindow(win, next, true);
  }
  if (captureWindow && !captureWindow.isDestroyed()) {
    applyZoomToWindow(captureWindow, next, false);
  }
  syncZoomMenu();
  return next;
}

function stepAppZoom(direction: 1 | -1): number {
  return setAppZoomFactor(stepZoomFactor(getCurrentZoomFactor(), direction));
}

function bindZoomShortcuts(win: BrowserWindow, adjustTrafficLights = true) {
  win.webContents.on('did-finish-load', () => {
    applyZoomToWindow(win, getCurrentZoomFactor(), adjustTrafficLights);
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const primaryModifier = process.platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
    if (!primaryModifier || input.alt) return;
    if (input.key === '=' || input.key === '+' || input.code === 'Equal' || input.code === 'NumpadAdd') {
      event.preventDefault();
      stepAppZoom(1);
    } else if ((input.key === '-' || input.code === 'Minus' || input.code === 'NumpadSubtract') && !input.shift) {
      event.preventDefault();
      stepAppZoom(-1);
    } else if ((input.key === '0' || input.code === 'Digit0' || input.code === 'Numpad0') && !input.shift) {
      event.preventDefault();
      setAppZoomFactor(1);
    }
  });
}

export function createWindow(targetFolderPath?: string, openSettings = false, openShortcuts = false, documentFile?: string): BrowserWindow {
  const documentMode = !!documentFile;
  const windowState = loadWindowState(documentMode);
  const similarWindows = Array.from(allWindows).filter(window => documentFiles.has(window.webContents.id) === documentMode).length;
  const cascadeOffset = (similarWindows * 25) % 150;

  const zoomFactor = getCurrentZoomFactor();
  const win = new BrowserWindow({
    x: windowState.x !== undefined ? windowState.x + cascadeOffset : undefined,
    y: windowState.y !== undefined ? windowState.y + cascadeOffset : undefined,
    width: windowState.width,
    height: windowState.height,
    minWidth: documentFile ? 620 : 860,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: getTrafficLightPosition(zoomFactor),
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
      zoomFactor
    }
  });
  bindZoomShortcuts(win, true);

  win.on('page-title-updated', event => {
    const file = documentFiles.get(win.webContents.id);
    if (file) { event.preventDefault(); win.setTitle(path.basename(file)); }
    else if (!app.isPackaged && process.env.SCRIBE_PREVIEW_DATA) { event.preventDefault(); win.setTitle('Scribe Preview'); }
  });
  allWindows.add(win);
  const webContentsId = win.webContents.id;

  // Set the folder path for this window
  const rootPath = targetFolderPath || loadSavedRoot();
  setWindowRoot(webContentsId, rootPath, !documentFile);
  if (documentFile) documentFiles.set(webContentsId, documentFile);

  if (windowState.isMaximized && (documentMode || allWindows.size === 1)) {
    win.maximize();
  }

  // Each window type has its own preferences; closing flushes the resize debounce.
  let saveTimeout: NodeJS.Timeout | null = null;
  const persistWindowState = () => {
    if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
    try { saveWindowState({ ...win.getNormalBounds(), isMaximized: win.isMaximized(), zoomFactor: getCurrentZoomFactor() }, documentMode); }
    catch (error) { console.error('Could not remember window placement:', error); }
  };
  const trackWindowState = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(persistWindowState, 250);
  };
  win.on('resize', trackWindowState);
  win.on('move', trackWindowState);
  win.on('maximize', trackWindowState);
  win.on('unmaximize', trackWindowState);
  win.on('close', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    persistWindowState();
  });
  win.on('closed', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    allWindows.delete(win);
    documentFiles.delete(webContentsId);
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
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}${documentFile ? '?document=1' : openSettings ? '?settings=1' : openShortcuts ? '?shortcuts=1' : ''}`);
  } else {
    win.loadFile(path.join(process.env.DIST || path.join(__dirname, '../dist'), 'index.html'), { query: documentFile ? { document: '1' } : openSettings ? { settings: '1' } : openShortcuts ? { shortcuts: '1' } : {} });
  }

  // Watch for external file changes in this window's workspace folder
  attachWatcher(win, webContentsId, rootPath);
  syncDocumentMenu(win);

  return win;
}

function attachWatcher(win: BrowserWindow, webContentsId: number, rootPath: string) {
  startWatchingWindow(webContentsId, rootPath, (data: NotesChangedPayload) => {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send('notes:changed', data);
      } catch {}
    }
  }, documentFiles.get(webContentsId) || rootPath);
}

function sendToFocusedWindow(channel: string, focusedWin?: BrowserWindow) {
  const win = focusedWin || BrowserWindow.getFocusedWindow() || Array.from(allWindows)[0];
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send(channel);
    } catch {}
  }
}

function openLibraryWindow() {
  const root = loadSavedRoot();
  const existing = Array.from(allWindows).find(win => !win.isDestroyed() && !documentFiles.has(win.webContents.id) && getWindowRoot(win.webContents.id) === root);
  if (existing) { if (existing.isMinimized()) existing.restore(); existing.show(); existing.focus(); }
  else createWindow(root);
}

function syncDocumentMenu(win: BrowserWindow | null) {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  const documentMode = !!win && documentFiles.has(win.webContents.id);
  for (const id of ['new-note', 'quick-switcher', 'trash-note', 'duplicate-note', 'history-back', 'history-forward', 'search-notes']) {
    const item = menu.getMenuItemById(id);
    if (item) { item.visible = !documentMode; item.enabled = !documentMode; }
  }
  for (const id of ['open-library', 'rename-document', 'document-history']) {
    const item = menu.getMenuItemById(id);
    if (item) { item.visible = documentMode; item.enabled = documentMode; }
  }
  const save = menu.getMenuItemById('save-note');
  if (save) save.label = documentMode ? 'Save File' : 'Save Note';
}

app.on('browser-window-focus', (_event, win) => syncDocumentMenu(win));

function setupMenu() {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        {
          label: 'Settings…', accelerator: 'CmdOrCtrl+,',
          click: (_item: Electron.MenuItem, focusedWin: Electron.BaseWindow | undefined) => {
            const win = focusedWin && allWindows.has(focusedWin as BrowserWindow) ? focusedWin as BrowserWindow : Array.from(allWindows)[0];
            if (win) { win.show(); win.focus(); sendToFocusedWindow('menu:settings', win); }
            else createWindow(undefined, true);
          }
        },
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
          id: 'new-note', label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:newNote', focusedWin as BrowserWindow)
        },
        {
          id: 'quick-switcher', label: 'Quick Switcher...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:quickSwitcher', focusedWin as BrowserWindow)
        },
        { type: 'separator' as const },
        {
          label: 'Open Markdown File…', accelerator: 'CmdOrCtrl+Alt+O',
          click: async (_item, focusedWin) => {
            const options: Electron.OpenDialogOptions = { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] };
            const result = focusedWin ? await dialog.showOpenDialog(focusedWin as BrowserWindow, options) : await dialog.showOpenDialog(options);
            for (const file of result.filePaths) await openMarkdownFile(file);
          }
        },
        { id: 'open-library', label: 'Open Notes Library', visible: false, click: () => openLibraryWindow() },
        { id: 'rename-document', label: 'Rename File…', visible: false, click: (_item, focusedWin) => sendToFocusedWindow('menu:renameFile', focusedWin as BrowserWindow) },
        { id: 'document-history', label: 'Version History…', visible: false, click: (_item, focusedWin) => sendToFocusedWindow('menu:documentHistory', focusedWin as BrowserWindow) },
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
          id: 'quick-capture',
          label: 'Quick Capture…',
          accelerator: captureAccelerator(),
          click: () => openCapture()
        },
        {
          id: 'save-note', label: 'Save Note',
          accelerator: 'CmdOrCtrl+S',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:saveNote', focusedWin as BrowserWindow)
        },
        {
          id: 'trash-note', label: 'Move Note to Trash',
          accelerator: 'CmdOrCtrl+Backspace',
          click: (_item, focusedWin) => {
            if (focusedWin && allWindows.has(focusedWin as BrowserWindow)) sendToFocusedWindow('menu:trashNote', focusedWin as BrowserWindow);
          }
        },
        {
          id: 'duplicate-note', label: 'Duplicate Note',
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
          id: 'history-back', label: 'Back in History',
          accelerator: 'CmdOrCtrl+[',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:goBack', focusedWin as BrowserWindow)
        },
        {
          id: 'history-forward', label: 'Forward in History',
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
          label: 'Search Notes…',
          id: 'search-notes',
          accelerator: 'CmdOrCtrl+Alt+F',
          click: (_item, focusedWin) => sendToFocusedWindow('menu:searchNotes', focusedWin as BrowserWindow)
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
        { label: 'Add or Edit Link…', accelerator: 'CmdOrCtrl+K', click: (_item, focusedWin) => sendToFocusedWindow('format:link', focusedWin as BrowserWindow) },
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
        },
        { label: 'Check / Uncheck Current Task', accelerator: 'CmdOrCtrl+Shift+U', click: (_item, focusedWin) => sendToFocusedWindow('format:checkTask', focusedWin as BrowserWindow) },
        { label: 'Move Completed Tasks to Bottom', click: (_item, focusedWin) => sendToFocusedWindow('format:sortTasks', focusedWin as BrowserWindow) },
        { type: 'separator' as const },
        { label: 'Bigger Text', accelerator: 'CmdOrCtrl+Alt+Plus', click: (_item, focusedWin) => sendToFocusedWindow('format:fontLarger', focusedWin as BrowserWindow) },
        { label: 'Smaller Text', accelerator: 'CmdOrCtrl+Alt+-', click: (_item, focusedWin) => sendToFocusedWindow('format:fontSmaller', focusedWin as BrowserWindow) },
        { label: 'Default Text Size', click: (_item, focusedWin) => sendToFocusedWindow('format:fontReset', focusedWin as BrowserWindow) }
      ]
    },
    {
      label: 'View',
      submenu: [
        { id: 'zoom-reset', label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => { setAppZoomFactor(1); } },
        { id: 'zoom-in', label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => { stepAppZoom(1); } },
        { id: 'zoom-out', label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => { stepAppZoom(-1); } },
        { type: 'separator' as const },
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
    },
    { label: 'Help', role: 'help', submenu: [{ label: 'Keyboard Shortcuts', click: (_item, focusedWin) => {
      const win = focusedWin && allWindows.has(focusedWin as BrowserWindow) ? focusedWin as BrowserWindow : Array.from(allWindows)[0];
      if (win) { win.show(); win.focus(); sendToFocusedWindow('menu:shortcuts', win); }
      else createWindow(undefined, false, true);
    } }] }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  syncDocumentMenu(BrowserWindow.getFocusedWindow());
  syncZoomMenu();
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

  loadCaptureShortcut();
  setupMenu();
  fileOpeningReady = true;
  const files = Array.from(pendingFiles);
  pendingFiles.clear();
  // Command-line file opening complements Finder's open-file event.
  const argumentsToCheck = process.argv.slice(app.isPackaged ? 1 : 2);
  for (const argument of argumentsToCheck) if (!argument.startsWith('-') && /\.(md|markdown)$/i.test(argument)) files.push(argument);
  if (files.length) { for (const file of new Set(files)) void openMarkdownFile(file); }
  else createWindow(!app.isPackaged ? process.env.SCRIBE_PREVIEW_ROOT : undefined);
  registerCaptureShortcut(() => openCapture());

  app.on('activate', () => {
    if (allWindows.size === 0 && pendingFiles.size === 0 && openingFiles.size === 0) createWindow();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers scoped per window
ipcMain.handle('windows:titleBarDoubleClick', event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !allWindows.has(win) || win.isFullScreen()) return;
  // The draggable region handles this natively. Noninteractive web content in
  // the unified header uses the same policy through the narrow preload bridge.
  const action = process.platform === 'darwin' ? systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string') : '';
  if (action === 'None') return;
  if (action === 'Minimize') { win.minimize(); return; }
  if (!win.isMaximizable()) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.handle('windows:openLibrary', () => openLibraryWindow());
ipcMain.handle('windows:closeEditor', event => { BrowserWindow.fromWebContents(event.sender)?.close(); });
ipcMain.handle('zoom:get', () => getCurrentZoomFactor());
ipcMain.handle('zoom:set', (_event, factor: number) => setAppZoomFactor(factor));
ipcMain.handle('zoom:in', () => stepAppZoom(1));
ipcMain.handle('zoom:out', () => stepAppZoom(-1));
ipcMain.handle('zoom:reset', () => setAppZoomFactor(1));
const scribeConfigFileName = '.scribe.json';
const legacyFolderAppearancesFileName = '.scribe-folder-appearances.json';
type ScribeNotesConfig = Record<string, unknown> & { version: number; folderAppearances?: Record<string, { icon?: string; color?: string; emoji?: string }> };

function sanitizeFolderAppearances(value: unknown): Record<string, { icon?: string; color?: string; emoji?: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, { icon?: string; color?: string; emoji?: string }> = {};
  for (const [folder, item] of Object.entries(value as Record<string, unknown>).slice(0, 1000)) {
    if (folder.length > 2048 || !item || typeof item !== 'object' || Array.isArray(item)) continue;
    const data = item as Record<string, unknown>;
    const appearance: { icon?: string; color?: string; emoji?: string } = {};
    if (typeof data.icon === 'string' && data.icon.length <= 64) appearance.icon = data.icon;
    if (typeof data.color === 'string' && /^#[0-9a-f]{6}$/i.test(data.color)) appearance.color = data.color;
    if (typeof data.emoji === 'string' && data.emoji.length <= 32) appearance.emoji = data.emoji;
    if (Object.keys(appearance).length) output[folder] = appearance;
  }
  return output;
}

async function readScribeNotesConfig(filePath: string): Promise<ScribeNotesConfig | null> {
  try {
    const parsed = JSON.parse(await fsSync.promises.readFile(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid Scribe notes configuration.');
    return parsed as ScribeNotesConfig;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeScribeNotesConfig(root: string, config: ScribeNotesConfig): Promise<void> {
  const filePath = path.join(root, scribeConfigFileName);
  assertInsideRoot(root, filePath);
  const temporary = path.join(root, `.${scribeConfigFileName}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await fsSync.promises.writeFile(temporary, JSON.stringify(config, null, 2), 'utf8');
    await fsSync.promises.rename(temporary, filePath);
  } catch (error) {
    await fsSync.promises.unlink(temporary).catch(() => {});
    throw error;
  }
}

ipcMain.handle('folders:appearances:load', async event => {
  const root = await fsSync.promises.realpath(getWindowRoot(event.sender.id));
  const filePath = path.join(root, scribeConfigFileName);
  assertInsideRoot(root, filePath);
  const config = await readScribeNotesConfig(filePath);
  if (config) return sanitizeFolderAppearances(config.folderAppearances);

  const legacyPath = path.join(root, legacyFolderAppearancesFileName);
  assertInsideRoot(root, legacyPath);
  const legacyFile = await readScribeNotesConfig(legacyPath);
  if (!legacyFile) return null;
  const legacyValue = legacyFile.version === 1 ? legacyFile.folders : legacyFile;
  const folderAppearances = sanitizeFolderAppearances(legacyValue);
  await writeScribeNotesConfig(root, { version: 1, folderAppearances });
  await fsSync.promises.unlink(legacyPath).catch(() => {});
  return folderAppearances;
});

ipcMain.handle('folders:appearances:save', async (event, value: unknown) => {
  const root = await fsSync.promises.realpath(getWindowRoot(event.sender.id));
  const appearances = sanitizeFolderAppearances(value);
  const current = await readScribeNotesConfig(path.join(root, scribeConfigFileName));
  await writeScribeNotesConfig(root, { ...current, version: current?.version || 1, folderAppearances: appearances });
});

ipcMain.handle('notes:listTree', async (event) => {
  const root = getWindowRoot(event.sender.id);
  const document = documentFiles.get(event.sender.id);
  return document ? await readSingleNoteTree(document, root) : await readAllNotesTree(root);
});

ipcMain.handle('notes:read', async (event, filePath: string) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  return await withFileLock(filePath, () => readNoteContent(filePath));
});

ipcMain.handle('notes:save', async (event, { filePath, markdown, expectedMarkdown }) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  return await withFileLock(filePath, () => saveNoteContent(filePath, markdown, event.sender.id, expectedMarkdown));
});

ipcMain.handle('notes:create', async (event, { folderPath, title, content }) => {
  if (documentFiles.has(event.sender.id)) throw new Error('Create new notes from the notes library.');
  const root = getWindowRoot(event.sender.id);
  const targetFolder = folderPath || root;
  assertInsideRoot(root, targetFolder);
  const note = await createNote(root, targetFolder, title, content, event.sender.id);
  trackDocument(event.sender.id, note.filePath);
  return note;
});

ipcMain.handle('notes:rename', async (event, { filePath, newTitle }) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  const note = await withFileLock(filePath, () => renameNote(root, filePath, newTitle, event.sender.id));
  trackDocument(event.sender.id, note.filePath);
  return note;
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
  if (documentFiles.has(event.sender.id)) throw new Error('Manage standalone files in Finder.');
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
  documentFiles.delete(event.sender.id);
  setWindowRoot(event.sender.id, newPath);
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      syncDocumentMenu(win);
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
      documentFiles.delete(event.sender.id);
      setWindowRoot(event.sender.id, selected);
      if (win && !win.isDestroyed()) {
        syncDocumentMenu(win);
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

ipcMain.handle('notes:exportDocument', async (event, payload: { filePath: string; content: string; format: 'md' | 'html' }) => {
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, payload.filePath);
  if (payload.format !== 'md' && payload.format !== 'html') throw new Error('Unsupported export format.');
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('The note window is no longer available.');
  const result = await dialog.showSaveDialog(win, {
    defaultPath: `${path.basename(payload.filePath, '.md')}.${payload.format}`,
    filters: [{ name: payload.format === 'md' ? 'Markdown' : 'HTML', extensions: [payload.format] }]
  });
  if (result.canceled || !result.filePath) return false;
  const destination = result.filePath;
  let assetFolder = '';
  let temporary = '';
  const copied = new Map<string, string>();
  const filesToCopy: { source: string; target: string }[] = [];
  try {
    const content = rewriteImageReferences(payload.content, url => {
      const source = fromAssetUrl(url);
      if (!source) return url;
      assertInsideRoot(root, source);
      const actual = fsSync.realpathSync(source);
      assertInsideRoot(fsSync.realpathSync(root), actual);
      if (copied.has(actual)) return copied.get(actual)!;
      if (!assetFolder) assetFolder = fsSync.mkdtempSync(path.join(path.dirname(destination), `${path.basename(destination, path.extname(destination))}-assets-`));
      const target = path.join(assetFolder, `${copied.size + 1}-${path.basename(actual)}`);
      filesToCopy.push({ source: actual, target });
      const relative = path.relative(path.dirname(destination), target).split(path.sep).map(encodeURIComponent).join('/');
      copied.set(actual, relative);
      return relative;
    });
    temporary = path.join(path.dirname(destination), `.scribe-export-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const file of filesToCopy) await fsSync.promises.copyFile(file.source, file.target);
    await fsSync.promises.writeFile(temporary, content, 'utf8');
    await fsSync.promises.rename(temporary, destination);
    return true;
  } catch (error) {
    if (temporary && fsSync.existsSync(temporary)) fsSync.unlinkSync(temporary);
    if (assetFolder) fsSync.rmSync(assetFolder, { recursive: true, force: true });
    throw error;
  }
});

ipcMain.handle('assets:open', async (event, url: string) => {
  const target = fromAssetUrl(url);
  if (!target) throw new Error('Invalid attachment.');
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, target);
  const actual = fsSync.realpathSync(target);
  const actualRoot = fsSync.realpathSync(root);
  assertInsideRoot(actualRoot, actual);
  const error = await shell.openPath(actual);
  if (error) throw new Error(error);
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
  if (documentFiles.has(event.sender.id)) throw new Error('Duplicate notes from the notes library.');
  const root = getWindowRoot(event.sender.id);
  assertInsideRoot(root, filePath);
  const note = await duplicateNote(root, filePath, event.sender.id);
  trackDocument(event.sender.id, note.filePath);
  return note;
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
          id: 'duplicate-note', label: 'Duplicate Note',
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
        label: 'Customize Folder Icon...',
        click: () => resolve({ action: 'customizeIcon', folderPath })
      },
      { type: 'separator' },
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
let captureRoot = '';
let captureSaving = false;
function openCapture() {
  if (captureWindow && !captureWindow.isDestroyed()) { captureWindow.show(); captureWindow.focus(); return; }
  const focused = BrowserWindow.getFocusedWindow();
  captureRoot = focused && allWindows.has(focused) && !documentFiles.has(focused.webContents.id) ? getWindowRoot(focused.webContents.id) : loadSavedRoot();
  const boundsFile = path.join(app.getPath('userData'), 'scribe-capture-bounds.json');
  let placement: Partial<Electron.Rectangle> = {};
  try {
    const saved = JSON.parse(fsSync.readFileSync(boundsFile, 'utf8'));
    if (['x', 'y', 'width', 'height'].every(key => Number.isFinite(saved[key]))) {
      const area = screen.getDisplayMatching(saved).workArea;
      const width = Math.min(area.width, Math.max(380, saved.width));
      const height = Math.min(area.height, Math.max(300, saved.height));
      placement = { width, height, x: Math.max(area.x, Math.min(saved.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(saved.y, area.y + area.height - height)) };
    }
  } catch { /* First launch uses the default placement. */ }
  const win = new BrowserWindow({ width: 520, height: 410, ...placement, minWidth: 380, minHeight: 300,
    title: 'Quick Capture', titleBarStyle: 'hiddenInset', backgroundColor: '#fafafa',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, zoomFactor: getCurrentZoomFactor() } });
  bindZoomShortcuts(win, false);
  captureWindow = win;
  setWindowRoot(win.webContents.id, captureRoot);
  const captureId = win.webContents.id;
  win.on('close', () => {
    try { fsSync.writeFileSync(boundsFile, JSON.stringify(win.getNormalBounds())); }
    catch (error) { console.error('Could not remember Quick Capture placement:', error); }
  });
  win.on('closed', () => { removeWindowTracking(captureId); captureWindow = null; });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(`${process.env.VITE_DEV_SERVER_URL}?capture=1`);
  else win.loadFile(path.join(process.env.DIST!, 'index.html'), { query: { capture: '1' } });
}
ipcMain.handle('capture:open', () => openCapture());
ipcMain.handle('capture:info', () => ({ rootPath: captureRoot, shortcutAvailable: captureShortcutState().available, shortcutLabel: captureShortcutState().label }));
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

ipcMain.handle('shortcuts:get', () => captureShortcutState());
ipcMain.handle('shortcuts:setCapture', (_event, config: CaptureShortcut) => {
  const state = updateCaptureShortcut(config, () => openCapture());
  setupMenu();
  for (const win of [...allWindows, ...(captureWindow ? [captureWindow] : [])]) {
    if (!win.isDestroyed()) win.webContents.send('shortcuts:changed', state);
  }
  return state;
});
