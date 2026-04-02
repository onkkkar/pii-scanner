// Safe file reading wrapper used by the file walker throughout the scanner
// Re-throws Node's low-level errors with a clear message including the file path

import { readFileSync } from 'fs';

export function readFile(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read file: ${filePath} — ${(err as NodeJS.ErrnoException).message}`);
  }
}
