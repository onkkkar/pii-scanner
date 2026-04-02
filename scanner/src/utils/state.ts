import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function readState<T>(filePath: string): T {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export function writeState<T>(filePath: string, data: T): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
