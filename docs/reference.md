# Scribe feature reference

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

### Finding and navigating long notes

- **⌘F** finds text within the current note, including across bold, italic, and link boundaries. **Enter / Shift+Enter** move between matches; **Escape** returns to editing. **⌘⇧F** opens replacement controls.
- Each note remembers its cursor and scroll position across switches and restarts. Restoring the scroll position accounts for images that load after the editor appears; scrolling or typing takes control immediately.
- The **outline icon** beside Export opens a heading list. Choose a heading to jump to it; folded parent sections are revealed. Headings use the existing **Aa** menu.

### Checklists

**⌘⇧C** toggles checklist formatting. **⌘⇧U** checks or unchecks the task containing the caret. **Aa → Move Completed to Bottom** (or the Format menu) sorts the current checklist while keeping the caret with its task. Automatic sorting remains optional in Settings.

### Images and files

Drop one or more files into a note, paste clipboard files/images, or choose **Insert (+) → Image or File…**. Originals are stored in the notes folder’s `assets` directory. Click a file attachment to open it in its default macOS app. Select an image to reveal its resize handle and Open/Original size controls; double-click also opens the original. The resize handle supports left/right arrow keys.

Attachment links stay relative on disk, including after moving or trashing/restoring a note. Resized images use an HTML `<img width="…">` in Markdown so their size survives reopening. **Export Markdown / Export HTML** now use a Save dialog and copy referenced attachments into a companion assets folder. Keep that folder beside the exported note when sharing it.

### Keyboard reference and capture placement

**Help → Keyboard Shortcuts** opens a reference including your current Quick Capture combination. Pressing **Enter** in a note title saves the title and moves into the body, including after a rename. Quick Capture remembers its size and location across launches, adjusting to available displays; Enter from its title also moves into the body.

### Tables

The table button opens a size picker: hover or use arrow keys over the grid, or enter a custom number of columns and rows. Tables start with a simple 2×2 preview; a header row is optional. `/table` opens the same picker.

Click a cell to reveal a small row menu at the left and a column menu above the table. These menus insert before/after, move, or delete the corresponding row or column. The **+** at the bottom appends a row; the **+** at the right appends a column. New rows and columns are ready for typing. The toolbar’s **Table options** menu provides the same insert/delete actions and header, clear, and delete-table controls. Menus stay within the window when working near its edges.

**Tab / Shift+Tab** navigate cells; Tab from the last cell adds a row. Row/column deletion is undoable with **⌘Z**. Deleting the entire table (including its last row or column) asks for confirmation. Moving rows/columns is disabled for merged tables to preserve their structure.

### Open individual Markdown documents

Scribe registers as a macOS editor for `.md` and `.markdown` files. In Finder, choose **Open With → Scribe**, drag a Markdown file onto Scribe’s Dock icon, or use **File → Open Markdown File…** (**⌘⌥O**). Files open in focused document windows and edits are saved to the original file. Reopening the same document focuses its existing window. Opening a document does not switch the default notes library or scan its parent folder.

To make double-clicking `.md` files open Scribe, select an `.md` file in Finder, press **⌘I**, choose **Scribe** under **Open with**, then click **Change All…**. Repeat for `.markdown` if desired. You can also change just one file’s Open with setting without using Change All.

The document window shows the filename in the titlebar and edits only the Markdown body. Formatting, tables, attachments, Find, and version history are available. Its More actions menu offers Rename File, Version History, Reveal in Finder, and Open Notes Library. The library opens separately, keeping the document in its own window. New Note, Duplicate, Trash, and library navigation are removed from this mode, including their native menu shortcuts. File renaming is explicit, rather than tied to an editable title above the document.

Single-file document windows remember their size, position, and maximized state separately from the notes library. Resize once to choose your preferred layout; subsequent document windows reuse it across restarts. Saved placement is adjusted to the current displays when a monitor is removed.

### Editing files alongside other apps

Scribe reloads external edits when the editor has no pending changes, keeping your cursor and scroll position. If both versions have changes, autosave pauses and offers **Use version on disk** or **Keep my edits**. Saves also check the last known file contents so delayed file notifications cannot silently overwrite changes. Single-file windows wait for pending saves before closing, and stay open if a conflict or save failure needs attention.

The title bar shows **Saving…**, **Saved**, **Review changes**, or **Couldn't save**. Save failures keep your content in the editor and offer Retry. If a standalone file is removed or becomes unavailable, its open buffer remains available to copy.

Use **⌘F** to find or **⌘⇧F** to find and replace. Standalone file windows also offer both actions in the More menu. Expand **Replace** for a replacement field, **Replace** and **Replace All**; replacement feedback includes an Undo button. Each replacement operation can also be undone with the Edit menu.
