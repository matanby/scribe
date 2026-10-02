export const FLUSH_NOTE_EVENT = 'scribe:flush-note';
export interface FlushNoteRequest { filePath: string; pending: Promise<void>[] }
export async function flushNote(filePath: string) {
  const request: FlushNoteRequest = { filePath, pending: [] };
  window.dispatchEvent(new CustomEvent(FLUSH_NOTE_EVENT, { detail: request }));
  await Promise.all(request.pending);
}
