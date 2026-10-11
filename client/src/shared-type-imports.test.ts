/**
 * Guard: client code may only `import type` from `@devdigest/shared`. The vendored
 * barrel re-exports with `.js` specifiers (`./contracts/findings.js`) that Next's
 * bundler can't resolve to the `.ts` sources, so ANY value import (e.g. a Zod
 * enum's `.options`) 500s every route at build time while typecheck and vitest
 * stay green. Copy the values you need into a local constant instead.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname);
const SKIP_DIRS = new Set(["vendor", "node_modules"]);
// `import { … } from "@devdigest/shared"` without the `type` keyword (multi-line aware).
const VALUE_IMPORT = /import\s+(?!type\b)[^;]*?from\s+["']@devdigest\/shared(\/[^"']*)?["']/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return SKIP_DIRS.has(name) ? [] : walk(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

/** Drop `type X` specifiers; a value import remains only if a non-type name is left. */
function hasValueSpecifier(statement: string): boolean {
  const braces = /\{([\s\S]*)\}/.exec(statement);
  if (!braces) return true; // default / namespace import
  return braces[1]!
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .some((x) => !x.startsWith("type "));
}

describe("@devdigest/shared is type-only in the client", () => {
  it("no source file imports runtime values from the vendored contracts", () => {
    const offenders = walk(SRC).flatMap((file) => {
      const src = readFileSync(file, "utf8");
      return [...src.matchAll(VALUE_IMPORT)]
        .filter((m) => hasValueSpecifier(m[0]))
        .map(() => relative(SRC, file));
    });
    expect(offenders).toEqual([]);
  });
});
