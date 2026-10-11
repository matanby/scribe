import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 800, height: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: true } });
  try {
    await window.loadURL('about:blank');
    await window.webContents.insertCSS(fs.readFileSync(path.resolve('src/styles/index.css'), 'utf8'));
    await window.webContents.executeJavaScript(fs.readFileSync(path.resolve('dist-electron/direction.renderer.test.js'), 'utf8'));
    const results: string[] = await window.webContents.executeJavaScript('window.runDirectionTests()');
    results.forEach(result => console.log(`  ok   ${result}`));
    console.log(`\n${results.length} direction integration checks passed`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
