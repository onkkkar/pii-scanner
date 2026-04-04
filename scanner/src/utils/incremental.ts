import { ScannedFile } from './types';
import { readState, writeState } from './state';

const DEFAULT_HASHES_PATH = 'state/hashes.json';

// loads hashes from the previous run — empty object means first run
export function loadHashes(filePath: string = DEFAULT_HASHES_PATH): Record<string, string> {
  try {
    return readState<Record<string, string>>(filePath);
  } catch {
    return {};
  }
}

// saves current file hashes so the next run can compare
export function saveHashes(hashes: Record<string, string>, filePath: string = DEFAULT_HASHES_PATH): void {
  writeState(filePath, hashes);
}

// returns only files whose hash differs from what we saved last time
// on first run savedHashes is empty so all files come back as changed
export function filterChangedFiles(
  files: ScannedFile[],
  savedHashes: Record<string, string>,
): ScannedFile[] {
  return files.filter(f => savedHashes[f.filePath] !== f.hash);
}

// builds a { filePath → hash } map from a list of scanned files
export function buildHashMap(files: ScannedFile[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of files) {
    map[f.filePath] = f.hash;
  }
  return map;
}
