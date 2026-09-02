cask "scribe" do
  arch arm: "arm64", intel: "x64"

  version "1.0.0"
  sha256 :no_check

  url "https://github.com/matanby/scribe/releases/download/v#{version}/Scribe-#{version}-#{arch}.dmg"
  name "Scribe"
  desc "WYSIWYG Markdown notes app with Hebrew and English RTL"
  homepage "https://github.com/matanby/scribe"

  depends_on macos: ">= :big_sur"

  app "Scribe.app"

  zap trash: [
    "~/Library/Application Support/scribe",
    "~/Library/Preferences/com.scribe.notes.plist",
    "~/Library/Logs/scribe",
  ]

  caveats <<~EOS
    Scribe is ad-hoc signed (no Apple Developer Program / notarization).
    Install with --no-quarantine so Gatekeeper does not block the first launch:

      brew install --cask --no-quarantine matanby/scribe/scribe

    If macOS still refuses to open it: System Settings → Privacy & Security → Open Anyway,
    or: xattr -cr /Applications/Scribe.app
  EOS
end
