import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const domainFiles = [
  join(SRC, 'errors.ts'),
  join(SRC, 'constants.ts'),
  ...readdirSync(join(SRC, 'shape')).map((f) => join(SRC, 'shape', f)),
];

describe('domain ring purity (shape/*, errors.ts, constants.ts)', () => {
  it('imports only zod and relative domain files; no fetch, node:, SDK, process', () => {
    for (const file of domainFiles) {
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1]!;
        expect(spec === 'zod' || spec.startsWith('./') || spec.startsWith('../'), `${file}: ${spec}`).toBe(true);
        expect(spec.includes('ports') || spec.includes('api/'), `${file}: ${spec}`).toBe(false);
      }
      expect(code, file).not.toMatch(/\bfetch\s*\(|node:|@modelcontextprotocol|process\./);
    }
  });
});
