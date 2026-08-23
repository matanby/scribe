# Scribe — Product Specification & Technical Architecture

> **Scribe** is a native macOS WYSIWYG notes application designed with the aesthetic polish of **Apple Notes & Craft**, the bidirectional typing fluidity required for **flawless Hebrew & English writing**, and direct local integration with **standard Markdown (`.md`) files stored in Google Drive**.

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
