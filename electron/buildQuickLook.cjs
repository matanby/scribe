const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');

module.exports = async function buildQuickLook({ appPath, projectDir, arch, version }) {
  const target = { arm64: 'arm64', x64: 'x86_64' }[arch];
  if (!target) throw new Error(`Unsupported Quick Look architecture: ${arch}`);
  const source = path.join(projectDir, 'native/QuickLook');
  const extension = path.join(appPath, 'Contents/PlugIns/ScribeQuickLook.appex');
  const contents = path.join(extension, 'Contents');
  await fs.mkdir(path.join(contents, 'MacOS'), { recursive: true });
  await fs.mkdir(path.join(contents, 'Resources'), { recursive: true });
  const sdk = execFileSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], { encoding: 'utf8' }).trim();
  execFileSync('xcrun', ['swiftc', path.join(source, 'PreviewProvider.swift'),
    '-sdk', sdk, '-target', `${target}-apple-macos12.0`, '-O',
    '-module-name', 'ScribeQuickLook', '-application-extension', '-parse-as-library',
    '-Xlinker', '-e', '-Xlinker', '_NSExtensionMain',
    '-framework', 'Cocoa', '-framework', 'QuickLookUI', '-framework', 'JavaScriptCore',
    '-o', path.join(contents, 'MacOS/ScribeQuickLook')], { stdio: 'inherit' });
  await build({ entryPoints: [path.join(projectDir, 'src/quicklook/render.ts')],
    outfile: path.join(contents, 'Resources/preview.js'), bundle: true, minify: true,
    platform: 'browser', format: 'iife', globalName: 'ScribePreview', target: 'safari15' });
  await fs.copyFile(path.join(source, 'preview.html'), path.join(contents, 'Resources/preview.html'));
  const plist = (await fs.readFile(path.join(source, 'Info.plist'), 'utf8')).replaceAll('__VERSION__', version);
  await fs.writeFile(path.join(contents, 'Info.plist'), plist);
  // Sign separately: --deep on the host would give it Electron's entitlements.
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none',
    '--entitlements', path.join(source, 'entitlements.plist'), extension], { stdio: 'inherit' });
  return extension;
};
