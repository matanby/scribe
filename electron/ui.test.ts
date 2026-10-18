import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'scribe-ui-tests-'));
app.setPath('userData', profile);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1100, height: 780, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  try {
    await window.loadURL('about:blank');
    window.webContents.focus();
    await window.webContents.insertCSS(fs.readFileSync(path.resolve('dist-electron/ui-test.css'), 'utf8'));
    await window.webContents.executeJavaScript(fs.readFileSync(path.resolve('dist-electron/ui.renderer.test.js'), 'utf8'));
    const results: string[] = await window.webContents.executeJavaScript('window.runUIPolishTests()');
    results.forEach(result => console.log(`  ok   ${result}`));
    console.log(`\n${results.length} UI interaction checks passed`);
    window.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(0);
  } catch (error) { console.error(error); window.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(1); }
});
