import { createHash } from 'node:crypto';

/** Stable sha256 over the normalised classifier inputs (key order fixed by the caller's object literal). */
export function computeInputHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
