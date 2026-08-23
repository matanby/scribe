import React, { useState } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  Layers,
  Sparkles
} from 'lucide-react';
import { FolderNode, NotesTree } from '../types';

interface SidebarProps {
  tree: NotesTree | null;
  selectedFolder: string;
  onSelectFolder: (folderRelativePath: string) => void;
  allNotesCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  tree,
  selectedFolder,
  onSelectFolder,
  allNotesCount
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const renderFolderNode = (node: FolderNode, depth = 0) => {
    const isSelected = selectedFolder === node.relativePath;
    const isExpanded = !collapsed[node.path];
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.path} className="select-none">
        <div
          onClick={() => onSelectFolder(node.relativePath)}
          style={{ paddingLeft: `${Math.max(10, depth * 12 + 10)}px` }}
          className={`group flex items-center justify-between pr-2.5 py-1 rounded-md text-xs cursor-pointer transition-all ${
            isSelected
              ? 'bg-[var(--card-active)] text-[var(--text-primary)] font-semibold shadow-xs'
              : 'text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 opacity-90'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                onClick={(e) => toggleCollapse(node.path, e)}
                className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)]"
              >
                {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
            ) : (
              <span className="w-3" />
            )}
            
            {isSelected ? (
              <FolderOpen size={14} className="text-[var(--accent-color)] shrink-0" />
            ) : (
              <Folder size={14} className="text-[var(--accent-color)] shrink-0 opacity-90" />
            )}
            
            <span className="truncate">{node.name}</span>
          </div>

          <span className="text-[10px] text-[var(--text-secondary)] font-normal px-1 rounded-full opacity-60">
            {node.noteCount}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-0.5">
            {node.children.map(child => renderFolderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-52 h-full bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] flex flex-col p-2 shrink-0 overflow-y-auto select-none backdrop-blur-2xl">
      {/* Quick filters / Smart Views */}
      <div className="space-y-0.5 mb-3">
        <div className="text-[9.5px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider px-2.5 py-1">
          Smart Views
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
      </div>

      {/* Folders hierarchy */}
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[9.5px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Google Drive Folders
          </span>
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

      {/* Footer Info */}
      <div className="pt-2 border-t border-[var(--border-color)] px-2 flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        <span className="truncate">Google Drive Connected</span>
      </div>
    </aside>
  );
};
