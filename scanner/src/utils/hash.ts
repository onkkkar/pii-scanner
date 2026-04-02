import { createHash } from 'crypto';

export function md5(content: string): string {
  return createHash('md5').update(content).digest('hex');
}
