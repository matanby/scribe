/**
 * Verifies the custom asset protocol inside a real Electron process.
 *
 * Run with:  npm run test:protocol
 *
 * This is separate from fileSystem.test.ts because it needs Electron's protocol module,
 * which only exists in an Electron runtime.
 */
import { app, protocol, net } from 'electron';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

import {
  ASSET_SCHEME,
  fromAssetUrl,
  isInsideAnyRoot,
  saveAttachment,
  setWindowRoot,
  toAssetUrl
} from './fileSystem';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
]);

app.whenReady().then(async () => {
  console.log('\nasset protocol');

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

  const vault = fsSync.mkdtempSync(path.join(os.tmpdir(), 'scribe-proto-'));
  setWindowRoot(1, vault);
  fsSync.writeFileSync(path.join(vault, 'Note.md'), '# note\n', 'utf-8');

  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03
  ]);

  try {
    // A file with a space in the name, to exercise URL encoding.
    const { absolutePath, assetUrl } = await saveAttachment(
      vault,
      path.join(vault, 'Note.md'),
      'my screen shot.png',
      png
    );

    check('url round-trips through encoding', fromAssetUrl(assetUrl) === absolutePath);

    const res = await net.fetch(assetUrl);
    check('protocol serves the attachment', res.status === 200, `status ${res.status}`);

    const bytes = new Uint8Array(await res.arrayBuffer());
    check('served bytes match what was written', bytes.length === png.length && bytes[1] === 0x50);

    // Anything outside an opened vault must be refused, even though it exists.
    const outsidePath = path.join(os.tmpdir(), 'scribe-outside-secret.txt');
    fsSync.writeFileSync(outsidePath, 'secret', 'utf-8');
    const denied = await net.fetch(toAssetUrl(outsidePath));
    check('files outside the vault are refused', denied.status === 404, `status ${denied.status}`);

    const traversal = await net.fetch(toAssetUrl(path.join(vault, '..', 'scribe-outside-secret.txt')));
    check('path traversal is refused', traversal.status === 404, `status ${traversal.status}`);

    fsSync.rmSync(outsidePath, { force: true });
  } catch (err) {
    failed++;
    console.error('  FAIL protocol test threw:', err);
  }

  fsSync.rmSync(vault, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failed} failed`);
  app.exit(failed === 0 ? 0 : 1);
});
