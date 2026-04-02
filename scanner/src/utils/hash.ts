// MD5 hashing utility for file change detection in incremental re-runs

import { createHash } from 'crypto';

export function md5(content: string): string {
  return createHash('md5').update(content).digest('hex');
}
