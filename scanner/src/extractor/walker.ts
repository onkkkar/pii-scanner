// Recursively walks a repo directory, reads all JS/TS files, and returns ScannedFile objects

import { readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import { ScannedFile } from '../utils/types';
import { md5 } from '../utils/hash';
import { readFile } from '../utils/file';

// Only these 4 extensions are supported by the scanner
const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

// Strip leading dot and casts to the ScannedFile language union
function toLanguage(ext: string): ScannedFile['language'] {
  return ext.slice(1) as ScannedFile['language'];
}

// Recursively collects ScannedFile objects from dir and all subdirectories
function walkDir(dir: string, repoRoot: string): ScannedFile[] {
  const results: ScannedFile[] = [];

  for (const entry of readdirSync(dir)) {
    // Always skip node_modules — they are dependencies, not source files
    if (entry === 'node_modules') continue;

    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Recurse into subdirectory and collect its results
      results.push(...walkDir(fullPath, repoRoot));
    } else {
      const ext = extname(entry);
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      const content = readFile(fullPath);

      results.push({
        filePath: relative(repoRoot, fullPath), // path relative to repo root
        content,
        hash: md5(content),
        language: toLanguage(ext),
      });
    }
  }

  return results;
}

// Entry point — verifies the repo path exists then delegates to walkDir
export function walkRepo(repoPath: string): ScannedFile[] {
  try {
    statSync(repoPath);
  } catch {
    throw new Error(`Repo path does not exist: ${repoPath}`);
  }

  return walkDir(repoPath, repoPath);
}
