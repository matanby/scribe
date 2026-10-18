import { readStored, writeStored } from '../utils/session';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FolderPlus,
  Layers,
  Trash2,
  ChevronRight, 
  Sliders
} from 'lucide-react';
import { FolderNode, NotesTree } from '../types';

import { FolderDialog, FolderDialogState } from './FolderDialog';
import { confirmDestructive } from '../utils/dialogs';

interface SidebarProps {
  tree: NotesTree | null;
  selectedFolder: string;
  onSelectFolder: (folderRelativePath: string) => void;
  allNotesCount: number;
  onOpenFolderDialog: () => void;
  onOpenAppearance: () => void;
  onMoveNote?: (filePath: string, targetFolderPath: string) => void;
  onTrashNote?: (filePath: string) => void;
  onNewNoteInFolder?: (folderPath: string) => void;
  onCreateFolder?: (parentPath: string, name: string) => void;
  onRenameFolder?: (folderPath: string, newName: string) => void;
  onDeleteFolder?: (folderPath: string) => void;
  onRevealInFinder?: (path: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  tree,
  selectedFolder,
  onSelectFolder,
  allNotesCount,
  onOpenFolderDialog,
  onOpenAppearance,
  onMoveNote,
  onTrashNote,
  onNewNoteInFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onRevealInFinder
}) => {
  const sidebarRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => readStored(`scribe_folders:${tree?.rootPath}`, {}));
  useEffect(() => { if (tree) writeStored(`scribe_folders:${tree.rootPath}`, collapsed); }, [tree?.rootPath, collapsed]);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<FolderDialogState>({
    isOpen: false,
    mode: 'newFolder',
    parentPath: '',
    initialValue: '',
    title: 'New Folder'
  });

  const handleDialogConfirm = (name: string) => {
    if (dialogState.mode === 'newFolder' || dialogState.mode === 'newSubfolder') {
      onCreateFolder?.(dialogState.parentPath, name);
      // Auto-expand parent folder so user sees the new folder
      setCollapsed(prev => ({ ...prev, [dialogState.parentPath]: false }));
    } else if (dialogState.mode === 'renameFolder') {
      onRenameFolder?.(dialogState.parentPath, name);
    }
  };

  const handleFolderContextMenu = async (folderPath: string, folderName: string, isRoot: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (window.scribeAPI.showFolderContextMenu) {
      let res: any = null;
      try {
        res = await window.scribeAPI.showFolderContextMenu({
          folderPath,
          isRoot
        });
      } catch (err) {
        console.error('Failed to open folder context menu:', err);
        return;
      }

      if (res?.action) {
        if (res.action === 'newNote') {
          onNewNoteInFolder?.(folderPath);
        } else if (res.action === 'newSubfolder') {
          setDialogState({
            isOpen: true,
            mode: 'newSubfolder',
            parentPath: folderPath,
            initialValue: '',
            title: `New Subfolder in "${folderName}"`
          });
        } else if (res.action === 'revealInFinder') {
          if (onRevealInFinder) {
            onRevealInFinder(folderPath);
          } else {
            window.scribeAPI.showInFinder?.(folderPath);
          }
        } else if (res.action === 'renameFolder') {
          setDialogState({
            isOpen: true,
            mode: 'renameFolder',
            parentPath: folderPath,
            initialValue: folderName,
            title: `Rename "${folderName}"`
          });
        } else if (res.action === 'deleteFolder') {
          const confirmDelete = await confirmDestructive(
            `Move folder "${folderName}" to Trash?`,
            'Its notes go to Recently Deleted and can be restored.',
            'Move to Trash'
          );
          if (confirmDelete) {
            onDeleteFolder?.(folderPath);
          }
        }
      }
    }
  };

  const toggleCollapse = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleDragOver = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTarget !== targetId) {
      setDragOverTarget(targetId);
    }
  };

  const handleDragLeave = (targetId: string, e: React.DragEvent) => {
    // Moving onto a child element fires dragleave on the parent; ignore those so the
    // drop highlight doesn't flicker while the cursor is still inside the target.
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    if (dragOverTarget === targetId) {
      setDragOverTarget(null);
    }
  };

  const handleDrop = (targetPath: string, isTrash: boolean, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTarget(null);
    const filePath = e.dataTransfer.getData('text/plain');
    if (!filePath) return;

    if (isTrash) {
      onTrashNote?.(filePath);
    } else {
      onMoveNote?.(filePath, targetPath);
    }
  };

  const rootFolderName = tree?.rootPath ? tree.rootPath.split('/').filter(Boolean).pop() || 'Notes' : 'Notes';

  const renderFolderNode = (node: FolderNode, depth = 0) => {
    const isSelected = selectedFolder === node.relativePath;
    const isExpanded = !collapsed[node.path];
    const hasChildren = node.children && node.children.length > 0;
    const isDragOver = dragOverTarget === node.path;

    return (
      <div key={node.path} className="select-none">
        <div
          role="treeitem"
          tabIndex={0}
          data-folder-path={node.relativePath}
          aria-label={node.name}
          aria-selected={isSelected}
          aria-expanded={hasChildren ? isExpanded : undefined}
          onKeyDown={event => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectFolder(node.relativePath); }
            if (event.key === 'ArrowRight' && hasChildren) { event.preventDefault(); setCollapsed(previous => ({ ...previous, [node.path]: false })); }
            if (event.key === 'ArrowLeft' && hasChildren && isExpanded) { event.preventDefault(); setCollapsed(previous => ({ ...previous, [node.path]: true })); }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const rows = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') || []).filter(row => !row.closest('[aria-hidden="true"]'));
              const index = rows.indexOf(event.currentTarget);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
              rows[next]?.focus();
            }
          }}
          onClick={() => onSelectFolder(node.relativePath)}
          onContextMenu={(e) => handleFolderContextMenu(node.path, node.name, false, e)}
          onDragOver={(e) => handleDragOver(node.path, e)}
          onDragLeave={(e) => handleDragLeave(node.path, e)}
          onDrop={(e) => handleDrop(node.path, false, e)}
          style={{ paddingLeft: `${Math.max(10, depth * 12 + 10)}px` }}
          className={`folder-item group flex items-center justify-between pr-2.5 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors ${
            isDragOver
              ? 'ring-2 ring-[var(--accent-color)] bg-[var(--card-active)]'
              : isSelected
              ? 'bg-[var(--sidebar-selected)] text-[var(--text-primary)]'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                tabIndex={-1}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`}
                onClick={(e) => toggleCollapse(node.path, e)}
                className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)] transition-transform duration-200"
              >
                <ChevronRight 
                  size={11} 
                  className={`transition-transform duration-200 ease-out ${isExpanded ? 'rotate-90' : 'rotate-0'}`} 
                />
              </button>
            ) : (
              <span className="w-3" />
            )}
            
            {isSelected ? (
              <FolderOpen size={14} className="text-[var(--accent-color)] shrink-0 transition-transform duration-150" />
            ) : (
              <Folder size={14} className="text-[var(--accent-color)] shrink-0 opacity-90 transition-transform duration-150" />
            )}
            
            <span className="truncate text-start" dir="auto">{node.name}</span>
          </div>

          <span className="text-[11px] text-[var(--text-secondary)] font-normal px-1">
            {node.noteCount}
          </span>
        </div>

        {hasChildren && (
          <div 
            role="group"
            aria-hidden={!isExpanded}
            {...(!isExpanded ? { inert: '' } : {})}
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
              isExpanded ? 'grid-rows-[1fr] opacity-100 mt-0.5' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
            }`}
          >
            <div className="overflow-hidden">
              {node.children.map(child => renderFolderNode(child, depth + 1))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside ref={sidebarRef} aria-label="Notes sidebar" className="w-full h-full bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] flex flex-col p-2 pt-4 shrink-0 overflow-hidden select-none backdrop-blur-2xl">
      {/* Smart Views */}
      <div className="space-y-0.5 mb-3">
        <div className="text-[11px] font-semibold text-[var(--text-secondary)] px-2.5 py-1">
          Views
        </div>
        <button
          type="button"
          aria-current={selectedFolder === '' ? 'page' : undefined}
          onClick={() => onSelectFolder('')}
          onDragOver={(e) => handleDragOver('__ALL_NOTES__', e)}
          onDragLeave={(e) => handleDragLeave('__ALL_NOTES__', e)}
          onDrop={(e) => handleDrop(tree?.rootPath || '', false, e)}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-[13px] cursor-pointer transition-colors ${
            dragOverTarget === '__ALL_NOTES__'
              ? 'ring-2 ring-[var(--accent-color)] bg-[var(--card-active)]'
              : selectedFolder === ''
              ? 'bg-[var(--sidebar-selected)] text-[var(--text-primary)]'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-[var(--accent-color)]" />
            <span>All Notes</span>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] font-normal">
            {allNotesCount}
          </span>
        </button>

        {/* Recently Deleted */}
        <button
          type="button"
          aria-current={selectedFolder === '__TRASH__' ? 'page' : undefined}
          onClick={() => onSelectFolder('__TRASH__')}
          onDragOver={(e) => handleDragOver('__TRASH__', e)}
          onDragLeave={(e) => handleDragLeave('__TRASH__', e)}
          onDrop={(e) => handleDrop('', true, e)}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-[13px] cursor-pointer transition-colors ${
            dragOverTarget === '__TRASH__'
              ? 'ring-2 ring-red-500 bg-red-500/20 text-red-500'
              : selectedFolder === '__TRASH__'
              ? 'bg-[var(--sidebar-selected)] text-[var(--text-primary)]'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-2">
            <Trash2 size={14} className="text-[var(--text-secondary)]" />
            <span>Recently Deleted</span>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] font-normal">
            {tree?.trashCount || 0}
          </span>
        </button>
      </div>

      {/* Folders hierarchy */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pb-3">
        <div 
          onContextMenu={(e) => tree?.rootPath && handleFolderContextMenu(tree.rootPath, rootFolderName, true, e)}
          className="flex items-center justify-between px-2.5 py-1"
        >
          <span className="text-[11px] font-semibold text-[var(--text-secondary)] truncate">
            {rootFolderName}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                if (tree?.rootPath) {
                  setDialogState({
                    isOpen: true,
                    mode: 'newFolder',
                    parentPath: tree.rootPath,
                    initialValue: '',
                    title: 'New Folder'
                  });
                }
              }}
              className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              title="New Folder..."
              aria-label="New folder"
            >
              <FolderPlus size={12} />
            </button>
          </div>
        </div>

        <div role="tree" aria-label="Notes folders">{tree?.folders.map(rootNode =>
          rootNode.children.length > 0 ? (
            rootNode.children.map(child => renderFolderNode(child, 0))
          ) : (
            <div
              key={`empty-${rootNode.path}`}
              className="px-2.5 py-2 text-[11px] text-[var(--text-secondary)] italic opacity-60"
            >
              No subfolders
            </div>
          )
        )}</div>
      </div>

      {/* Footer Controls: Open Folder & Appearance */}
      <div className="pt-2 border-t border-[var(--border-color)] px-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <button
          onClick={onOpenFolderDialog}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors text-[11px] font-medium"
          title="Open notes folder"
          aria-label="Open notes folder"
        >
          <Folder size={13} className="text-[var(--accent-color)]" />
          <span className="truncate max-w-[110px]">{rootFolderName}</span>
        </button>

        <button
          onClick={onOpenAppearance}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          <Sliders size={13} />
        </button>
      </div>

      {/* Folder Create & Rename Modal Dialog */}
      <FolderDialog
        state={dialogState}
        onClose={() => setDialogState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleDialogConfirm}
      />
    </aside>
  );
};
