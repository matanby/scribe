# Scribe — Product Specification & Technical Architecture

> **Scribe** is a native macOS WYSIWYG notes application designed with the aesthetic polish of **Apple Notes & Craft**, the bidirectional typing fluidity required for **flawless Hebrew & English writing**, and direct local integration with **standard Markdown (`.md`) files stored in Google Drive**.

## Install (macOS)

Builds are **ad-hoc signed** (no Apple Developer Program, not notarized). Gatekeeper will warn on first open; that is expected.

**From a DMG**

1. Open `Scribe-*-arm64.dmg` (Apple Silicon) or `Scribe-*-x64.dmg` (Intel).
2. Drag **Scribe** into Applications.
3. Right-click **Scribe** → **Open** → **Open**. If macOS still blocks it: System Settings → Privacy & Security → **Open Anyway**, or run `xattr -cr /Applications/Scribe.app`.

**Homebrew (personal tap, not official Homebrew Cask)**

```bash
brew tap matanby/scribe https://github.com/matanby/scribe
brew install --cask --no-quarantine scribe
```

`--no-quarantine` is required so Gatekeeper does not quarantine the unsigned download.

**Build locally**

```bash
npm ci
npm run dist
```

DMGs land in `release/`. Publishing: tag `v1.0.0` (matching `package.json`) and push; GitHub Actions attaches the DMGs to the release. Bump `version` in `package.json` and `Casks/scribe.rb` together.

Official `brew install --cask` on Homebrew’s own tap is not possible without a paid, notarized Developer ID build.

---

## 1. Executive Summary & Vision

* **Problem Statement:** Existing Markdown editors either force raw syntax on the user (Obsidian), have broken/awkward Right-to-Left (RTL) list behavior (Typora, MarkText), or lock notes into proprietary database formats (Apple Notes, Bear, Craft).
* **Our Solution:** A standalone, native macOS desktop application that acts as a pure **Word / Google Docs / Apple Notes-style rich text editor** while maintaining standard flat `.md` files on the local filesystem (in Google Drive).

---

## 2. Core Requirements

### A. Editing & WYSIWYG
* **Zero Visible Markdown Syntax:** Headers, bolding, italics, links, and lists render visually on screen. Users never have to type `#` or `**` (though standard Markdown markdown shortcuts will auto-convert on the fly if typed).
* **Interactive Task Lists:** Checkboxes (`[ ]` / `[x]`) are clickable UI elements that toggle state with smooth animation and auto-update the underlying `.md` file.
* **Apple Notes / Google Docs Toolbar:** Floating formatting bubble menu upon selecting text, plus a clean top toolbar.
* **Slash Commands (`/`):** Quick insertion menu (like Craft/Notion) for Headings, To-Do lists, Bullet Lists, Numbered Lists, Quotes, Tables, and Dividers.

### B. First-Class Hebrew / RTL Support
* **Per-Block BiDi Auto-Detection:** Automatically detects whether a paragraph, heading, or list item is Hebrew/Arabic or English/Latin based on first strong character (`dir="auto"`).
* **Proper List Marker Positioning:**
  * **Hebrew lists:** Numbers (`1.`) and bullets (`•`) anchor firmly to the **right margin**.
  * **English lists:** Numbers and bullets anchor firmly to the **left margin**.
* **Mixed-language text:** Hebrew and English remain in their natural reading order.
* **Checklist Alignment:** Checkboxes sit on the right side for Hebrew tasks, and on the left side for English tasks.

### C. macOS Native UI & Design Polish
* **3-Pane Apple Notes Layout:**
  * **Pane 1 (Left):** Translucent folders / tags sidebar with note counts and custom icons.
  * **Pane 2 (Middle):** Note list cards displaying Note Title, Last Modified Date, and 2-line preview snippet.
  * **Pane 3 (Right):** Clean, distraction-free paper editor canvas.
* **macOS Integration:**
  * Native macOS `hiddenInset` title bar with native window traffic lights.
  * macOS vibrancy/blur backdrop styling.
  * Global keyboard shortcuts (`Cmd + N`, `Cmd + S`, `Cmd + F`, `Cmd + Shift + L`, `Cmd + B`, `Cmd + I`, `Cmd + K`).
  * Dock icon and native macOS application menus.

### D. Local File System & Google Drive Bridge
* **Direct File System Access:** Reads and writes `.md` files directly in Google Drive.
* **Two-Way Live Sync:** File watcher (`chokidar`) detects changes if files are modified outside the app or synced via Google Drive.
* **Instant Auto-Save:** Debounced auto-save (e.g., 500ms after last keystroke) with visual save status indicator (`Saved`).

---

## 3. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Desktop Shell** | **Electron (v34+)** | Provides native macOS window, vibrancy, Dock integration, and menu bar. |
| **Frontend Framework** | **React 19 + TypeScript** | High-performance reactive UI for notes management and state. |
| **Build & Bundler** | **Vite (v6+)** | Instant hot-reloading and optimized production builds. |
| **Styling & Design System** | **Tailwind CSS v3 + Lucide Icons** | Apple Human Interface Guidelines (SF Pro typography, translucent blur, smooth borders). |
| **WYSIWYG Editor Core** | **TipTap v2 (ProseMirror)** | Industry-standard headless rich-text editor engine (used by Linear, Notion, Substack). |
| **Markdown Conversion** | **`tiptap-markdown` / `unified`** | Lossless serialization between TipTap JSON/DOM and standard Markdown `.md` text. |
| **File System Bridge** | **Node.js `fs/promises` + `chokidar`** | Real-time file scanning, reading, writing, and directory watching in Google Drive. |

---

## 4. Detailed Feature Breakdown

### 1. Folder Management (Pane 1)
* "All Notes" smart view.
* Nested subfolder tree with collapsible disclosure arrows.
* Create, rename, delete folders directly on disk.
* Note count badges per folder.

### 2. Note List & Search (Pane 2)
* Live instant search filtering across note titles and file contents.
* Sort notes by: Date Modified (default), Date Created, or Alphabetical.
* Card previews with clean relative dates (e.g., *Today, Yesterday, 23 באוג׳*).
* New Note button (`Cmd + N`) and Delete note action.

### 3. Editor Canvas (Pane 3)
* Inline editable note title (renames file on disk).
* Auto-expanding clean paper canvas with comfortable reading width (720px max-width).
* Floating bubble menu on text selection (Bold, Italic, Strikethrough, Code, Link, Heading levels).
* Interactive Task List items with click-to-check and strikethrough.
* Code blocks with syntax highlighting and LTR isolation.
* Tables with column/row insertion and resizing.

### 4. RTL & BiDi Custom Extensions
* Custom TipTap node extensions with automatic `dir="auto"` attribute injection.
* CSS rules specifically configured for WebKit/Chromium bidirectional list layouts.

---

## 5. Directory Structure in `~/Desktop/scribe`

```
~/Desktop/scribe/
├── SPECIFICATION.md          # This complete product specification
├── README.md                 # Quickstart and overview
├── package.json              # Project dependencies and scripts
├── vite.config.ts            # Vite bundler configuration
├── tailwind.config.js        # Apple UI theme & typography configuration
├── postcss.config.js         # PostCSS plugins
├── electron/
│   ├── main.ts               # Electron main process (macOS window, vibrancy, IPC)
│   ├── preload.ts            # Secure context bridge exposing FileSystem APIs
│   └── fileSystem.ts         # Google Drive folder reading/writing & chokidar watcher
└── src/
    ├── main.tsx              # React entry point
    ├── App.tsx               # 3-pane layout shell & routing
    ├── components/
    │   ├── Titlebar.tsx      # macOS hiddenInset window title bar & search
    │   ├── Sidebar.tsx       # Pane 1: Folders & navigation
    │   ├── NoteList.tsx      # Pane 2: Note card list & search results
    │   ├── Editor.tsx        # Pane 3: TipTap WYSIWYG canvas
    │   ├── BubbleMenu.tsx    # Floating Google Docs-style formatting bar
    │   └── SlashCommand.tsx  # Notion/Craft-style `/` menu
    ├── extensions/
    │   └── BiDiExtension.ts  # Custom TipTap extension for dynamic Hebrew/English RTL/LTR
    ├── types/
    │   └── notes.ts          # TypeScript interfaces for Note, Folder, FileSystem
    └── styles/
        └── index.css         # Apple design system, vibrancy, RTL list styling
```

---

## 6. Development Milestones

- [x] **Milestone 0:** Product specification & requirements definition.
- [ ] **Milestone 1:** Initialize Electron + Vite + React + Tailwind project.
- [ ] **Milestone 2:** Implement Node.js File System Bridge connected to Google Drive `Notes`.
- [ ] **Milestone 3:** Build 3-pane Apple Notes UI with translucent sidebar & note list.
- [ ] **Milestone 4:** Implement TipTap WYSIWYG editor with Markdown serialization.
- [ ] **Milestone 5:** Build and verify dynamic BiDi/RTL engine for Hebrew & English.
- [ ] **Milestone 6:** Launch, test with real notes, and package native app.


## Capture, search, history, and returning to work

- **Quick Capture:** press **⌃⌥⌘N** (default) while Scribe is running, or choose **File → Quick Capture** (also available in the toolbar’s More actions). Save with **⌘Return**. Escape dismisses the window and retains its draft. Captured notes go to the current notes folder’s root; when another app is active, the most recently opened notes folder is used.
- **Search:** matching passages appear in the note list, including in compact view while searching. Select a result to scroll to the first matching passage. Search uses the selected folder or Recently Deleted as its scope.
- **Version History:** click the date above a note’s title and choose **View Version History**. Browse dated versions with excerpts, preview the formatted note next to the version list, and restore a previous version. The current note is also available for comparison. Scribe preserves the initial content before editing, then takes checkpoints at five-minute intervals when content changes, retaining up to 100 versions per note. Restoring always preserves the outgoing version. History is local to this Mac in Scribe’s application data; it starts with edits made in this version and is not synced with the Markdown files. App-initiated moves and renames carry history along. Permanent deletion also removes that note’s history.
- **Resume:** each notes folder remembers its selected note and folder; the last 100 notes remember their cursor and scroll positions. Expanded folders are restored when you return.


## Startup and packaging

Renderer dependencies live in `devDependencies`: Vite bundles them into `dist`, so shipping their original `node_modules` copies is unnecessary. Only the filesystem watcher and frontmatter parser remain runtime dependencies. The package includes English and Hebrew Chromium localizations and a single native icon source.

The main shell and Quick Capture load independently from the editor. History, appearance, the quick switcher, and formula rendering load when needed. Note scans use bounded parallel reads and a local, disposable snippet index; each file's modification time and size are checked before cached metadata is reused.

For repeatable startup measurements with 500 synthetic bilingual notes and an isolated profile (Node 22+):

```sh
node scripts/measure-startup.cjs /Applications/Scribe.app/Contents/MacOS/Scribe baseline reuse
```

The script records three fresh-process launches, measuring the shell and the editor with all 500 rows loaded. `reuse` reopens the same profile to include normal session/index reuse. Omit it for a new profile on each run. Results are saved under the system temporary directory in `scribe-startup`. Measurements use an OS file cache that may already be warm; they are not power-on measurements. The first launch of a newly built bundle can take longer than subsequent launches.

On the development Mac, the repeated-profile median editor-ready time improved from 883 ms to 767 ms. The arm64 bundle shrank from about 292 MiB to 199 MiB. Results depend on the note collection, disk, and OS cache.


## Shortcuts and Undo deletion

Open **Scribe → Settings…** (**⌘,**) or the sidebar’s Settings button. Under **Keyboard shortcuts**, choose **Change…** beside Quick Capture, select modifiers and a key, then save. Scribe checks for conflicts with its own shortcuts and other apps before replacing the current shortcut. The selection is saved on this Mac and appears immediately in the File menu. **Use default** selects the original combination; save it to apply the reset.

Moving a note to Trash shows a brief **Undo** notification. Undo restores the exact trashed file to its original folder, including when multiple notes have the same name. The notification pauses while hovered or focused, and recent deletions can be undone in reverse order. This covers ⌘Delete, note-menu actions, and dragging a note to Trash. Dismissal or timeout leaves the note recoverable in Recently Deleted.
