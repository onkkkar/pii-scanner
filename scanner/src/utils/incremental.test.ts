// Group 1 — loadHashes / saveHashes: file I/O
// Group 2 — filterChangedFiles: detecting what changed
// Group 3 — buildHashMap: building the hash index

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ScannedFile } from './types';
import { loadHashes, saveHashes, filterChangedFiles, buildHashMap } from './incremental';

function makeFile(filePath: string, hash: string): ScannedFile {
  return { filePath, hash, content: '', language: 'js' };
}

// Group 1 — loadHashes / saveHashes

describe('loadHashes / saveHashes — file I/O', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-incremental-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('loadHashes returns empty object when file does not exist', () => {
    const hashes = loadHashes(path.join(tmpDir, 'nope.json'));
    expect(hashes).toEqual({});
  });

  it('saveHashes + loadHashes round-trip preserves the map', () => {
    const filePath = path.join(tmpDir, 'hashes.json');
    const original = { 'src/index.ts': 'abc123', 'src/app.ts': 'def456' };

    saveHashes(original, filePath);
    const loaded = loadHashes(filePath);

    expect(loaded).toEqual(original);
  });

  it('saveHashes creates the directory if it does not exist', () => {
    const filePath = path.join(tmpDir, 'nested', 'deep', 'hashes.json');
    saveHashes({ 'file.ts': 'hash' }, filePath);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

// Group 2 — filterChangedFiles

describe('filterChangedFiles — detecting what changed', () => {
  it('returns all files when savedHashes is empty (first run)', () => {
    const files = [makeFile('a.ts', 'hash1'), makeFile('b.ts', 'hash2')];
    const changed = filterChangedFiles(files, {});
    expect(changed).toHaveLength(2);
  });

  it('returns empty array when nothing changed', () => {
    const files = [makeFile('a.ts', 'hash1'), makeFile('b.ts', 'hash2')];
    const saved = { 'a.ts': 'hash1', 'b.ts': 'hash2' };
    const changed = filterChangedFiles(files, saved);
    expect(changed).toHaveLength(0);
  });

  it('returns only the file whose hash changed', () => {
    const files = [makeFile('a.ts', 'hash1'), makeFile('b.ts', 'hash2-new')];
    const saved = { 'a.ts': 'hash1', 'b.ts': 'hash2-old' };
    const changed = filterChangedFiles(files, saved);
    expect(changed).toHaveLength(1);
    expect(changed[0].filePath).toBe('b.ts');
  });

  it('treats a new file with no prior hash as changed', () => {
    const files = [makeFile('new.ts', 'hash1')];
    const changed = filterChangedFiles(files, {});
    expect(changed).toHaveLength(1);
  });
});

// Group 3 — buildHashMap

describe('buildHashMap — building the hash index', () => {
  it('returns a map of filePath to hash', () => {
    const files = [makeFile('a.ts', 'hash1'), makeFile('b.ts', 'hash2')];
    const map = buildHashMap(files);
    expect(map['a.ts']).toBe('hash1');
    expect(map['b.ts']).toBe('hash2');
  });

  it('returns empty object for empty file list', () => {
    expect(buildHashMap([])).toEqual({});
  });

  it('last file wins if filePaths are duplicated', () => {
    const files = [makeFile('a.ts', 'hash1'), makeFile('a.ts', 'hash2')];
    const map = buildHashMap(files);
    expect(map['a.ts']).toBe('hash2');
  });
});
