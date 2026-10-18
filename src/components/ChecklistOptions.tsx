import React, { useEffect } from 'react';
import { Editor, useEditorState } from '@tiptap/react';
import { ArrowDownToLine, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { checklistSummary, checklistViewKey } from '../extensions/checklist';
import { readStored, writeStored } from '../utils/session';
import { Popover } from './Popover';

export const ChecklistOptions: React.FC<{ editor: Editor; noteFilePath: string; beforeRun: () => void }> = ({ editor, noteFilePath, beforeRun }) => {
  const state = useEditorState({ editor, selector: ({ editor }) => editor.state, equalityFn: Object.is });
  const { total, completed } = checklistSummary(state.doc);
  const hidden = checklistViewKey.getState(state)?.hideCompleted ?? false;
  useEffect(() => {
    editor.commands.setCompletedTasksHidden(readStored<Record<string, boolean>>('scribe_hidden_completed', {})[noteFilePath] === true);
  }, [editor, noteFilePath]);
  if (!total) return null;
  const run = (close: () => void, action: () => void) => { close(); beforeRun(); action(); };
  return <Popover label="Checklist options" triggerClassName={`chrome-button checklist-options-trigger ${hidden ? 'checklist-filter-active' : ''}`}
    trigger={<><ChevronDown size={11} />{hidden && <span className="checklist-filter-dot" aria-hidden="true" />}</>}>
    {close => <>
      <div className="checklist-progress">
        <div><span>Checklist</span><span>{completed} of {total} completed</span></div>
        <progress aria-label="Completed tasks in this note" value={completed} max={total} />
      </div>
      <button className="menu-item" aria-pressed={hidden} onClick={() => run(close, () => {
        const next = !hidden;
        editor.commands.setCompletedTasksHidden(next);
        const preferences = readStored<Record<string, boolean>>('scribe_hidden_completed', {});
        delete preferences[noteFilePath]; preferences[noteFilePath] = next;
        writeStored('scribe_hidden_completed', Object.fromEntries(Object.entries(preferences).slice(-100)));
        editor.commands.focus(undefined, { scrollIntoView: false });
      })}>{hidden ? <Eye size={14} /> : <EyeOff size={14} />}<span>{hidden ? 'Show completed' : 'Hide completed'}</span></button>
      <button className="menu-item" disabled={!completed || completed === total} onClick={() => run(close, () => { editor.chain().focus(undefined, { scrollIntoView: false }).sortCompletedTasks().run(); })}><ArrowDownToLine size={14} /><span>Move completed to bottom</span></button>

    </>}
  </Popover>;
};
