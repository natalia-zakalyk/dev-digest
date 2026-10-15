/**
 * Guard for the Server/Client boundary: files that render as Server Components
 * (page/layout/not-found without "use client", and the modules they import for
 * route guards) must not import the `@devdigest/ui` barrel. The barrel pulls
 * client-only code (class components, hooks) into the RSC graph and the route
 * 500s at render ("Super expression must either be null or a function").
 * Import pure data modules directly instead (e.g. `@devdigest/ui/nav`).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP_DIR = join(__dirname);
const SERVER_ENTRY = /^(page|layout|not-found|template|default)\.tsx?$/;
const BARREL_IMPORT = /from\s+["']@devdigest\/ui["']/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function isClientModule(src: string): boolean {
  return /^\s*(\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(src);
}

/** Resolve a relative import specifier to a file on disk. */
function resolveLocal(fromFile: string, spec: string): string | null {
  const base = join(fromFile, "..", spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    try {
      if (statSync(cand).isFile()) return cand;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/**
 * Every module in the server graph of `entry` reachable through relative
 * imports. Traversal stops at "use client" modules: their imports are client
 * code, which is exactly where the UI barrel belongs.
 */
function serverGraph(entry: string): string[] {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    const src = readFileSync(file, "utf8");
    if (isClientModule(src)) continue;
    seen.add(file);
    for (const [, spec] of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const next = resolveLocal(file, spec!);
      if (next) stack.push(next);
    }
  }
  return [...seen];
}

describe("server entries", () => {
  const entries = walk(APP_DIR).filter((f) => SERVER_ENTRY.test(f.split("/").pop()!));

  it("finds the route entry files", () => {
    expect(entries.length).toBeGreaterThan(5);
  });

  for (const file of entries) {
    const src = readFileSync(file, "utf8");
    if (isClientModule(src)) continue;
    it(`${relative(APP_DIR, file)} does not pull the @devdigest/ui barrel into the server graph`, () => {
      const offenders = serverGraph(file).filter((f) => BARREL_IMPORT.test(readFileSync(f, "utf8")));
      expect(offenders.map((f) => relative(APP_DIR, f))).toEqual([]);
    });
  }
});
