const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs/promises')
const { Arch } = require('builder-util')
const buildQuickLook = require('./buildQuickLook.cjs')

/**
 * Ad-hoc sign the packed .app (identity "-") so Apple Silicon will launch it.
 * This is free and does not require the Apple Developer Program. Other Macs
 * still hit Gatekeeper; users bypass it with right-click → Open or --no-quarantine.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )
  const entitlements = path.join(
    context.packager.projectDir,
    'electron/entitlements.mac.plist'
  )

  // electron-builder 25 filters top-level localizations, but leaves Chromium's
  // copies in the framework. Keep the same language set in both locations.
  const localeDirectory = path.join(appPath, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources')
  const languages = new Set(context.packager.config.electronLanguages || ['en', 'en_GB', 'he'])
  for (const entry of await fs.readdir(localeDirectory)) {
    if (entry.endsWith('.lproj') && !languages.has(entry.slice(0, -6))) {
      await fs.rm(path.join(localeDirectory, entry), { recursive: true })
    }
  }

  execFileSync(
    'codesign',
    [
      '--sign', '-',
      '--force',
      '--deep',
      '--timestamp=none',
      '--entitlements', entitlements,
      appPath
    ],
    { stdio: 'inherit' }
  )

  // Add the sandboxed extension after signing Electron's nested helpers, then
  // re-seal the host without --deep so the extension keeps its own entitlements.
  await buildQuickLook({ appPath, projectDir: context.packager.projectDir,
    arch: Arch[context.arch], version: context.packager.appInfo.version })
  execFileSync('codesign', ['--sign', '-', '--force', '--timestamp=none',
    '--entitlements', entitlements, appPath], { stdio: 'inherit' })
}
