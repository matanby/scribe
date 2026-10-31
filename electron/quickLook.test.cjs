const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const buildQuickLook = require('./buildQuickLook.cjs');

async function main() {
  const projectDir = path.resolve(__dirname, '..');
  const appPath = path.join(projectDir, 'build/QuickLook-Tests.app');
  // Keep the compiled test extension outside an .app so Launch Services does
  // not register the test harness as the user's Markdown preview provider.
  const extension = await buildQuickLook({ appPath: path.join(projectDir, 'build/quicklook-extension-test'), projectDir, arch: process.arch,
    version: require('../package.json').version });
  const contents = path.join(appPath, 'Contents');
  await fs.cp(path.join(extension, 'Contents/Resources'), path.join(contents, 'Resources'), { recursive: true });
  await fs.mkdir(path.join(contents, 'MacOS'), { recursive: true });
  await fs.writeFile(path.join(contents, 'Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict>
    <key>CFBundleExecutable</key><string>QuickLookTests</string>
    <key>CFBundleIdentifier</key><string>com.scribe.quicklook.tests</string>
    <key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  const binary = path.join(contents, 'MacOS/QuickLookTests');
  execFileSync('xcrun', ['swiftc', path.join(projectDir, 'native/QuickLook/PreviewProvider.swift'),
    path.join(projectDir, 'native/QuickLookTests.swift'), '-parse-as-library', '-o', binary], { stdio: 'inherit' });
  execFileSync(binary, process.argv.slice(2), { stdio: 'inherit', timeout: 30000 });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
