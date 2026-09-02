const { execFileSync } = require('child_process')
const path = require('path')

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
}
