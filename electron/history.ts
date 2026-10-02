import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';

export interface NoteVersion { id: string; savedAt: number; capturedAt?: number; raw: string; sourcePath: string }
const directory = () => path.join(app.getPath('userData'), 'note-history');
const key = (file: string) => crypto.createHash('sha256').update(path.resolve(file)).digest('hex');
const location = (file: string) => path.join(directory(), `${key(file)}.json`);
export async function readVersions(file: string): Promise<NoteVersion[]> {
  try { return JSON.parse(await fs.readFile(location(file), 'utf8')).versions || []; }
  catch (error: any) { if (error.code === 'ENOENT') return []; throw error; }
}
async function writeVersions(file: string, versions: NoteVersion[]) {
  await fs.mkdir(directory(), { recursive: true });
  const destination = location(file);
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ filePath: file, versions: versions.slice(-100) }), 'utf8');
  await fs.rename(temporary, destination);
}
// Preserve the baseline, then one checkpoint per five minutes of changed content.
// Explicit restores always preserve the outgoing version.
export async function checkpoint(file: string, raw: string, savedAt: number, force = false) {
  const versions = await readVersions(file);
  const latest = versions[versions.length - 1];
  if (latest?.raw === raw) return;
  if (!force && latest && Date.now() - (latest.capturedAt || latest.savedAt) < 5 * 60_000) return;
  versions.push({ id: crypto.randomUUID(), savedAt, capturedAt: Date.now(), raw, sourcePath: file });
  await writeVersions(file, versions);
}
export async function remapVersions(oldPath: string, newPath: string) {
  if (oldPath === newPath) return;
  let names: string[];
  try { names = await fs.readdir(directory()); } catch (e: any) { if (e.code === 'ENOENT') return; throw e; }
  for (const name of names.filter(name => name.endsWith('.json'))) {
    const source = path.join(directory(), name);
    const stored = JSON.parse(await fs.readFile(source, 'utf8'));
    if (stored.filePath !== oldPath && !stored.filePath.startsWith(oldPath + path.sep)) continue;
    const target = newPath + stored.filePath.slice(oldPath.length);
    await writeVersions(target, stored.versions);
    await fs.unlink(source);
  }
}

export async function forgetVersions(filePath: string) {
  let names: string[];
  try { names = await fs.readdir(directory()); } catch (e: any) { if (e.code === 'ENOENT') return; throw e; }
  for (const name of names.filter(name => name.endsWith('.json'))) {
    const file = path.join(directory(), name);
    const stored = JSON.parse(await fs.readFile(file, 'utf8'));
    if (stored.filePath === filePath || stored.filePath.startsWith(filePath + path.sep)) await fs.unlink(file);
  }
}
