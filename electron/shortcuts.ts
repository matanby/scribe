import { app, globalShortcut, Menu } from 'electron';
import fs from 'fs';
import path from 'path';

export interface CaptureShortcut { command: boolean; control: boolean; alt: boolean; shift: boolean; key: string }
export interface CaptureShortcutState { config: CaptureShortcut; defaultConfig: CaptureShortcut; available: boolean; label: string; isMac: boolean }
export const defaultCaptureShortcut: CaptureShortcut = { command: process.platform === 'darwin', control: true, alt: true, shift: false, key: 'N' };
let current = { ...defaultCaptureShortcut };
let available = false;
const location = () => path.join(app.getPath('userData'), 'scribe-shortcuts.json');
function validate(value: CaptureShortcut): CaptureShortcut {
  if (!value || ['command', 'control', 'alt', 'shift'].some(key => typeof (value as any)[key] !== 'boolean') || typeof value.key !== 'string') throw new Error('Choose modifiers and a key.');
  if (!value.command && !value.control) throw new Error('Include Command or Control in the shortcut.');
  if (!/^(?:[A-Z0-9]|Space|F(?:[1-9]|1[0-2]))$/.test(value.key)) throw new Error('Choose a letter, number, Space, or function key.');
  return { command: value.command, control: value.control, alt: value.alt, shift: value.shift, key: value.key };
}
export function captureAccelerator(config = current) {
  return [...new Set([config.control && 'Control', config.alt && 'Alt', config.shift && 'Shift', config.command && (process.platform === 'darwin' ? 'Command' : 'Control')].filter(Boolean)), config.key].join('+');
}
export function captureShortcutState(): CaptureShortcutState {
  const label = `${current.control ? '⌃' : ''}${current.alt ? '⌥' : ''}${current.shift ? '⇧' : ''}${current.command ? '⌘' : ''}${current.key}`;
  return { config: { ...current }, defaultConfig: { ...defaultCaptureShortcut }, available, label, isMac: process.platform === 'darwin' };
}
export function loadCaptureShortcut() {
  try { current = validate(JSON.parse(fs.readFileSync(location(), 'utf8'))); } catch { current = { ...defaultCaptureShortcut }; }
}
export function registerCaptureShortcut(open: () => void) {
  try { available = globalShortcut.register(captureAccelerator(), open); } catch { available = false; }
}
function canonical(accelerator: string) {
  return accelerator.split('+').map(part => {
    if (/^(CmdOrCtrl|CommandOrControl)$/i.test(part)) return process.platform === 'darwin' ? 'command' : 'control';
    if (/^cmd$/i.test(part)) return 'command';
    if (/^ctrl$/i.test(part)) return 'control';
    if (/^option$/i.test(part)) return 'alt';
    return part.toLowerCase();
  }).sort().join('+');
}
function conflictsWithMenu(accelerator: string) {
  const wanted = canonical(accelerator);
  const builtIn = ['A', 'C', 'V', 'X', 'Z', 'Y', 'Q', 'W', 'M', 'H'].map(key => `CmdOrCtrl+${key}`);
  builtIn.push('CmdOrCtrl+Shift+Z', 'CmdOrCtrl+Alt+H');
  const visit = (items: Electron.MenuItem[]): boolean => items.some(item =>
    item.id !== 'quick-capture' && ((item.accelerator && canonical(item.accelerator) === wanted) || (item.submenu && visit(item.submenu.items))));
  return builtIn.some(value => canonical(value) === wanted) || visit(Menu.getApplicationMenu()?.items || []);
}
export function updateCaptureShortcut(value: CaptureShortcut, open: () => void) {
  const config = validate(value), next = captureAccelerator(config), previous = captureAccelerator();
  if (canonical(next) === canonical(previous) && available) return captureShortcutState();
  if (conflictsWithMenu(next)) throw new Error('Scribe already uses that shortcut. Choose another combination.');
  let registered = false;
  try { registered = globalShortcut.register(next, open); } catch { /* Report unavailable combinations below. */ }
  if (!registered) throw new Error('That shortcut is unavailable. Choose another combination.');
  const temporary = `${location()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(config)); fs.renameSync(temporary, location()); }
  catch { globalShortcut.unregister(next); try { fs.unlinkSync(temporary); } catch {} throw new Error('Could not save the shortcut. Please try again.'); }
  if (canonical(next) !== canonical(previous)) globalShortcut.unregister(previous);
  current = config; available = true;
  return captureShortcutState();
}
