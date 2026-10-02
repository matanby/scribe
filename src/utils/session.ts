export interface NotePosition { from: number; to: number; scroll: number }
export function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
export function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* A full preference store must not interrupt editing. */ }
}
export function readPosition(file: string): NotePosition | null {
  const position = readStored<Record<string, NotePosition>>('scribe_note_positions', {})[file];
  return position && [position.from, position.to, position.scroll].every(Number.isFinite) ? position : null;
}
export function savePosition(file: string, position: NotePosition) {
  const positions = readStored<Record<string, NotePosition>>('scribe_note_positions', {});
  delete positions[file]; positions[file] = position;
  writeStored('scribe_note_positions', Object.fromEntries(Object.entries(positions).slice(-100)));
}
export function remapPosition(oldPath: string, newPath: string) {
  const positions = readStored<Record<string, NotePosition>>('scribe_note_positions', {});
  if (positions[oldPath]) { positions[newPath] = positions[oldPath]; delete positions[oldPath]; writeStored('scribe_note_positions', positions); }
}
