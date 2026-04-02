// Tests for the file walker — covers recursive walking, extension filtering,
// hash consistency, correct file count on sample-app, and error on bad path.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { walkRepo } from './index';

// Absolute path to the sample-app directory used for integration-style tests.
const SAMPLE_APP = path.resolve(__dirname, '../../..', 'sample-app');

describe('walkRepo — filtering and structure', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-walker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('walks nested folders and returns files from all depths', () => {
    // Create a two-level deep structure.
    fs.mkdirSync(path.join(tmpDir, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'root.ts'), 'const x = 1;');
    fs.writeFileSync(path.join(tmpDir, 'a', 'mid.js'), 'const y = 2;');
    fs.writeFileSync(path.join(tmpDir, 'a', 'b', 'deep.tsx'), 'const z = 3;');

    const files = walkRepo(tmpDir);
    const paths = files.map(f => f.filePath).sort();

    expect(paths).toEqual(['a/b/deep.tsx', 'a/mid.js', 'root.ts']);
  });

  it('filters out non JS/TS files', () => {
    // These should all be ignored by the walker.
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# docs');
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'data.log'), 'log entry');
    fs.writeFileSync(path.join(tmpDir, 'styles.css'), 'body {}');
    // Only this should be picked up.
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export {}');

    const files = walkRepo(tmpDir);

    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe('index.ts');
  });

  it('skips node_modules directories entirely', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'some-pkg'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'some-pkg', 'index.js'), 'module.exports = {}');
    fs.writeFileSync(path.join(tmpDir, 'src.ts'), 'export {}');

    const files = walkRepo(tmpDir);

    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe('src.ts');
  });

  it('returns an empty array when the directory has no matching files', () => {
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '# nothing here');
    expect(walkRepo(tmpDir)).toEqual([]);
  });

  it('throws a clear error when the repo path does not exist', () => {
    expect(() => walkRepo('/does/not/exist')).toThrow('Repo path does not exist');
  });
});

describe('walkRepo — ScannedFile shape and hashing', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-walker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns correct language for each supported extension', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.js'),  'x');
    fs.writeFileSync(path.join(tmpDir, 'b.jsx'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'c.ts'),  'x');
    fs.writeFileSync(path.join(tmpDir, 'd.tsx'), 'x');

    const files = walkRepo(tmpDir);
    const byPath = Object.fromEntries(files.map(f => [f.filePath, f.language]));

    expect(byPath['a.js']).toBe('js');
    expect(byPath['b.jsx']).toBe('jsx');
    expect(byPath['c.ts']).toBe('ts');
    expect(byPath['d.tsx']).toBe('tsx');
  });

  it('computes a consistent hash — same file always returns the same hash', () => {
    fs.writeFileSync(path.join(tmpDir, 'stable.ts'), 'const x = 1;');

    const [run1] = walkRepo(tmpDir);
    const [run2] = walkRepo(tmpDir);

    expect(run1.hash).toBe(run2.hash);
  });

  it('computes different hashes for different file content', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'const a = 1;');
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'const b = 2;');

    const files = walkRepo(tmpDir);
    const hashes = files.map(f => f.hash);

    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('each ScannedFile has non-empty content, hash, filePath, and language', () => {
    fs.writeFileSync(path.join(tmpDir, 'check.ts'), 'export const x = 1;');

    const [file] = walkRepo(tmpDir);

    expect(file.filePath).toBeTruthy();
    expect(file.content).toBeTruthy();
    expect(file.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(file.language).toBe('ts');
  });
});

describe('walkRepo — sample-app integration', () => {
  it('returns exactly 4 files from the sample-app', () => {
    const files = walkRepo(SAMPLE_APP);
    expect(files).toHaveLength(4);
  });

  it('finds all four expected sample-app files', () => {
    const files = walkRepo(SAMPLE_APP);
    const paths = files.map(f => f.filePath).sort();

    expect(paths).toEqual([
      'backend/logger.js',
      'backend/userModel.js',
      'backend/userRoutes.js',
      'frontend/RegisterForm.jsx',
    ]);
  });

  it('every sample-app file has non-empty content and a valid MD5 hash', () => {
    const files = walkRepo(SAMPLE_APP);
    for (const file of files) {
      expect(file.content.length).toBeGreaterThan(0);
      expect(file.hash).toMatch(/^[0-9a-f]{32}$/);
    }
  });
});
