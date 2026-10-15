import { describe, it, expect } from "vitest";
import { parsePatch, renderKeyFor } from "./helpers";

describe("parsePatch", () => {
  it("returns no lines for an empty or missing patch", () => {
    expect(parsePatch(null)).toEqual([]);
    expect(parsePatch(undefined)).toEqual([]);
    expect(parsePatch("")).toEqual([]);
  });

  it("tracks old/new line numbers across hunks", () => {
    const patch = [
      "@@ -1,2 +1,3 @@",
      " const a = 1;",
      "-const b = 2;",
      "+const b = 3;",
      "+const c = 4;",
      "@@ -10,1 +11,1 @@",
      " tail();",
    ].join("\n");
    expect(parsePatch(patch)).toEqual([
      { kind: "hunk", text: "@@ -1,2 +1,3 @@" },
      { kind: "ctx", text: "const a = 1;", oldNo: 1, newNo: 1 },
      { kind: "del", text: "const b = 2;", oldNo: 2 },
      { kind: "add", text: "const b = 3;", newNo: 2 },
      { kind: "add", text: "const c = 4;", newNo: 3 },
      { kind: "hunk", text: "@@ -10,1 +11,1 @@" },
      { kind: "ctx", text: "tail();", oldNo: 10, newNo: 11 },
    ]);
  });
});

describe("renderKeyFor", () => {
  it("gives every line of a patch a unique key", () => {
    const lines = parsePatch(
      ["@@ -1,2 +1,2 @@", " a", "-b", "+b2", "@@ -9,1 +9,1 @@", "-x", "+y"].join("\n"),
    );
    const keys = lines.map(renderKeyFor);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
