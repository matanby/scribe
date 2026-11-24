# Repository guidance

## Product and architecture

- Keep notes as interoperable Markdown files. Do not introduce a proprietary note store.
- Hebrew and English text direction is a core behavior. Preserve mixed right-to-left and left-to-right text, list markers, and checklist alignment.
- Keep filesystem access in Electron's main process behind the existing preload API. The renderer uses `nodeIntegration: false` and `contextIsolation: true`; preserve that boundary.
- Keep attachment links relative to the notes folder and store attachments under its `assets` directory.
- `package.json` and the source code are authoritative. Do not rely on the removed, outdated product specification.

## Build and checks

- `npm run build` builds the app.
- `npm test` runs the filesystem, protocol, bidirectional text, UI, and editing checks.
- `npm run test:editing` builds the app and drives the real editor with keyboard events (about 3 minutes; it opens a Scribe window). Cases live in `electron/editing/`; set `EDITING_ONLY=<name substring>` to run a subset and `EDITING_VERBOSE=1` to list every case. Record a bug before fixing it with a `bug` flag and an entry in `electron/editing/bugs.ts`.
- `npm run dist` packages the arm64 and x64 macOS DMGs into `release/`; run it on macOS.

## Releases

- Keep the versions in `package.json` and `Casks/scribe.rb` aligned.
- Add release notes at `release-notes/v<version>.md`; the release workflow uses that file as the GitHub release description.
- Push a matching `v<version>` tag to trigger `.github/workflows/release.yml` and publish the DMGs.
