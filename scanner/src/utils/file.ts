import { readFileSync } from 'fs';

export function readFile(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read file: ${filePath} — ${(err as NodeJS.ErrnoException).message}`);
  }
}
