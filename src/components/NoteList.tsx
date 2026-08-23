import React from 'react';
import { NoteMeta } from '../types';
import { Trash2, FileText } from 'lucide-react';

interface NoteListProps {
  notes: NoteMeta[];
  selectedNoteId: string | null;
  onSelectNote: (note: NoteMeta) => void;
  onDeleteNote: (note: NoteMeta, e: React.MouseEvent) => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameYear) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString([], { year: '2-digit', month: 'short', day: 'numeric' });
}

export const NoteList: React.FC<NoteListProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
  onDeleteNote
}) => {
  if (notes.length === 0) {
    return (
      <div className="w-64 h-full bg-[var(--notelist-bg)] border-r border-[var(--border-color)] flex flex-col items-center justify-center p-6 text-center text-[var(--text-secondary)] select-none backdrop-blur-2xl">
        <FileText size={32} className="opacity-20 mb-2" />
        <p className="text-xs font-semibold text-[var(--text-primary)] opacity-80">No Notes</p>
        <p className="text-[11px] opacity-60 mt-1">Press ⌘N to create a note</p>
      </div>
    );
  }

  return (
    <div className="w-64 h-full bg-[var(--notelist-bg)] border-r border-[var(--border-color)] flex flex-col overflow-y-auto shrink-0 select-none p-1.5 space-y-1 backdrop-blur-2xl">
      {notes.map((note) => {
        const isSelected = selectedNoteId === note.id || selectedNoteId === note.filePath;
        const displayDate = formatDate(note.modifiedAt);

        return (
          <div
            key={note.id}
            onClick={() => onSelectNote(note)}
            className={`group relative px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-100 ${
              isSelected
                ? 'bg-[var(--card-active)] shadow-xs'
                : 'hover:bg-[var(--card-hover)]'
            }`}
          >
            {/* Note Title */}
            <div className="flex items-start justify-between gap-1.5 mb-0.5">
              <h3 
                dir="auto"
                className={`text-[13px] leading-tight truncate flex-1 ${
                  isSelected 
                    ? 'font-bold text-[var(--text-primary)]' 
                    : 'font-semibold text-[var(--text-primary)]'
                }`}
              >
                {note.title || 'Untitled Note'}
              </h3>
              
              <button
                onClick={(e) => onDeleteNote(note, e)}
                title="Delete note"
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-red-500 transition-opacity"
              >
                <Trash2 size={11.5} />
              </button>
            </div>

            {/* Note Metadata & Snippet */}
            <div className="flex items-baseline gap-1.5 text-[11.5px] text-[var(--text-secondary)]">
              <span className="font-medium shrink-0 text-[10.5px] opacity-80">{displayDate}</span>
              <p 
                dir="auto"
                className="truncate opacity-75 text-[11.5px] flex-1"
              >
                {note.snippet || 'No additional text'}
              </p>
            </div>

            {/* Subfolder label if applicable */}
            {note.folder && note.folder !== '/' && (
              <div className="text-[9.5px] text-[var(--accent-color)] opacity-80 truncate mt-0.5 font-medium">
                📁 {note.folder}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
