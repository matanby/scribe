import React from 'react';
import { Folder, FolderSearch } from 'lucide-react';
import { NoteMeta } from '../types';
import { Popover } from './Popover';

interface NoteInfoProps {
  note: NoteMeta;
  wordCount: number;
  onHistory?: () => void;
  onSelectFolder?: (path: string) => void;
}

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString([], {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

export const NoteInfo: React.FC<NoteInfoProps> = ({ note, wordCount, onSelectFolder, onHistory }) => {
  const folder = note.folder && note.folder !== '/' ? note.folder : 'All Notes';
  return (
    <div className="no-print flex justify-center mb-5 text-xs text-[var(--text-secondary)] select-none">
      <Popover label="Note information" align="center"
        triggerClassName="px-2 py-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        trigger={<time dateTime={new Date(note.modifiedAt).toISOString()}>{formatDate(note.modifiedAt)}</time>}>
        {close => (
          <>
            <div className="px-2.5 py-2">
              <h2 className="text-xs font-semibold text-[var(--text-primary)] mb-3">Note information</h2>
              <dl className="space-y-3 text-xs">
                <div><dt className="mb-0.5">Created</dt><dd className="text-[var(--text-primary)]">{formatDate(note.createdAt)}</dd></div>
                <div><dt className="mb-0.5">Edited</dt><dd className="text-[var(--text-primary)]">{formatDate(note.modifiedAt)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Words</dt><dd className="text-[var(--text-primary)] tabular-nums">{wordCount}</dd></div>
              </dl>
            </div>
            <div className="h-px bg-[var(--border-subtle)] my-1" />
            {onHistory && <button type="button" onClick={() => { close(); onHistory(); }} className="w-full px-2.5 py-2 rounded-md text-left text-xs text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10">View Version History…</button>}
            {onSelectFolder && (
              <button type="button" title={`Go to ${folder}`} onClick={() => { close(); onSelectFolder(note.folder === '/' ? '' : note.folder); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10">
                <Folder size={14} className="shrink-0" /><span className="truncate" dir="auto">{folder}</span>
              </button>
            )}
            <button type="button" onClick={() => { close(); window.scribeAPI.showInFinder?.(note.filePath); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10">
              <FolderSearch size={14} /><span>Reveal in Finder</span>
            </button>
          </>
        )}
      </Popover>
    </div>
  );
};
