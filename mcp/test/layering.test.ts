import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');

function filesOf(p: string): string[] {
  const full = join(SRC, p);
  return statSync(full).isDirectory() ? readdirSync(full).map((f) => join(full, f)) : [full];
}

/** Rings that must stay free of transport, SDK, node built-ins and the infrastructure ring. */
const INNER = ['shape', 'errors.ts', 'constants.ts', 'use-cases', 'resolve.ts', 'ports.ts'].flatMap(filesOf);

describe('layering: inner rings import no infrastructure', () => {
  it('covers the expected files', () => {
    expect(INNER.length).toBeGreaterThan(10);
    expect(INNER.some((f) => f.endsWith('resolve.ts'))).toBe(true);
  });

  for (const file of INNER) {
    it(`${file.slice(SRC.length + 1)} has no fetch/node:/SDK/process./api/ dependency`, () => {
      const source = readFileSync(file, 'utf8');
      // Comments may mention `process.` or `node:`; only real code counts.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const m of code.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1]!;
        expect(spec.startsWith('node:'), spec).toBe(false);
        expect(spec.startsWith('@modelcontextprotocol'), spec).toBe(false);
        expect(/(^|\/)api\//.test(spec), spec).toBe(false);
        expect(/(^|\/)(tools|server|config)(\.js)?$/.test(spec), spec).toBe(false);
      }
      expect(code).not.toMatch(/\bfetch\s*\(|node:|@modelcontextprotocol|process\./);
    });
  }
});
