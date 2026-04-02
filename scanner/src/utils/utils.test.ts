// Unit tests for all shared utils: hash determinism, state round-trip, and safe file reading.

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { md5 } from './hash';
import { readState, writeState } from './state';
import { readFile } from './file';

describe('hash', () => {
  it('returns the same hash for the same content', () => {
    expect(md5('hello')).toBe(md5('hello'));
  });

  it('returns different hashes for different content', () => {
    expect(md5('hello')).not.toBe(md5('world'));
  });

  it('returns a 32-character hex string', () => {
    expect(md5('test')).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('state', () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-scanner-test-'));
    tmpFile = path.join(tmpDir, 'state.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('write then read returns the same object', () => {
    const data = { hashes: { 'foo.ts': 'abc123' }, graphFragments: {}, activities: {} };
    writeState(tmpFile, data);
    const result = readState<typeof data>(tmpFile);
    expect(result).toEqual(data);
  });

  it('creates parent directories if they do not exist', () => {
    const nested = path.join(tmpDir, 'a', 'b', 'state.json');
    writeState(nested, { ok: true });
    expect(fs.existsSync(nested)).toBe(true);
  });
});

describe('file', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-scanner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('reads file content correctly', () => {
    const filePath = path.join(tmpDir, 'sample.ts');
    fs.writeFileSync(filePath, 'const x = 1;', 'utf-8');
    expect(readFile(filePath)).toBe('const x = 1;');
  });

  it('throws a clear error when file does not exist', () => {
    expect(() => readFile(path.join(tmpDir, 'missing.ts'))).toThrow('Failed to read file');
  });
});
