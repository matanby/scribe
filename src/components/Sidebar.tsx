import React, { useState } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FolderPlus,
  Layers,
  Trash2,
  ChevronRight, 
  ChevronDown, 
  Sliders,
  FolderInput
} from 'lucide-react';
import { FolderNode, NotesTree } from '../types';

interface SidebarProps {
  tree: NotesTree | null;
  selectedFolder: string;
  onSelectFolder: (folderRelativePath: string) => void;
  allNotesCount: number;
  onOpenFolderDialog: () => void;
  onOpenAppearance: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  tree,
  selectedFolder,
  onSelectFolder,
  allNotesCount,
  onOpenFolderDialog,
  onOpenAppearance
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const rootFolderName = tree?.rootPath ? tree.rootPath.split('/').filter(Boolean).pop() || 'Notes' : 'Notes';

  const renderFolderNode = (node: FolderNode, depth = 0) => {
    const isSelected = selectedFolder === node.relativePath;
    const isExpanded = !collapsed[node.path];
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.path} className="select-none">
        <div
          onClick={() => onSelectFolder(node.relativePath)}
          style={{ paddingLeft: `${Math.max(10, depth * 12 + 10)}px` }}
          className={`folder-item group flex items-center justify-between pr-2.5 py-1 rounded-md text-xs cursor-pointer transition-all ${
            isSelected
              ? 'bg-[var(--card-active)] text-[var(--text-primary)] font-semibold shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 opacity-90'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
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
            
            <span className="truncate">{node.name}</span>
          </div>

          <span className="text-[10px] text-[var(--text-secondary)] font-normal px-1 rounded-full opacity-60">
            {node.noteCount}
          </span>
        </div>

        {hasChildren && (
          <div 
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
    <aside className="w-full h-full bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] flex flex-col p-2 shrink-0 overflow-y-auto select-none backdrop-blur-2xl">
      {/* Smart Views */}
      <div className="space-y-0.5 mb-3">
        <div className="text-[9.5px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider px-2.5 py-1">
          Views
        </div>
        <div
          onClick={() => onSelectFolder('')}
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-all ${
            selectedFolder === ''
              ? 'bg-[var(--card-active)] text-[var(--text-primary)] font-semibold shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 opacity-90'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-[var(--accent-color)]" />
            <span>All Notes</span>
          </div>
          <span className="text-[10.5px] text-[var(--text-secondary)] font-normal opacity-70">
            {allNotesCount}
          </span>
        </div>

        {/* Recently Deleted */}
        <div
          onClick={() => onSelectFolder('__TRASH__')}
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-all ${
            selectedFolder === '__TRASH__'
              ? 'bg-red-500/10 text-red-500 font-semibold shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 opacity-90'
          }`}
        >
          <div className="flex items-center gap-2">
            <Trash2 size={14} className={selectedFolder === '__TRASH__' ? 'text-red-500' : 'text-[var(--text-secondary)]'} />
            <span>Recently Deleted</span>
          </div>
          <span className="text-[10.5px] text-[var(--text-secondary)] font-normal opacity-70">
            {tree?.trashCount || 0}
          </span>
        </div>
      </div>

      {/* Folders hierarchy */}
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[9.5px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider truncate">
            {rootFolderName}
          </span>
          <button
            onClick={onOpenFolderDialog}
            className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Open another folder..."
          >
            <FolderInput size={12} />
          </button>
        </div>

        {tree?.folders.map(rootNode => 
          rootNode.children.length > 0 ? (
            rootNode.children.map(child => renderFolderNode(child, 0))
          ) : (
            <div key="empty" className="px-2.5 py-2 text-[11px] text-[var(--text-secondary)] italic opacity-60">
              No subfolders
            </div>
          )
        )}
      </div>

      {/* Footer Controls: Open Folder & Appearance */}
      <div className="pt-2 border-t border-[var(--border-color)] px-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <button
          onClick={onOpenFolderDialog}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors text-[11px] font-medium"
          title="Open notes folder"
        >
          <Folder size={13} className="text-[var(--accent-color)]" />
          <span className="truncate max-w-[110px]">{rootFolderName}</span>
        </button>

        <button
          onClick={onOpenAppearance}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors"
          title="Appearance & Typography"
        >
          <Sliders size={13} />
        </button>
      </div>
    </aside>
  );
};
