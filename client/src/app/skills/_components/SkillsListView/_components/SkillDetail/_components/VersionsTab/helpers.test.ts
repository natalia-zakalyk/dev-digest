import { describe, it, expect } from "vitest";
import { diffLines, summarizeChange, formatDate } from "./helpers";

describe("diffLines", () => {
  it("marks identical text as unchanged", () => {
    expect(diffLines("a\nb", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
    ]);
  });
  it("detects additions and removals", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });
  it("handles empty sides", () => {
    expect(diffLines("", "a")).toEqual([{ kind: "add", text: "a" }]);
    expect(diffLines("a", "")).toEqual([{ kind: "del", text: "a" }]);
    expect(diffLines("", "")).toEqual([]);
  });
});

describe("summarizeChange", () => {
  it("counts added and removed lines", () => {
    expect(summarizeChange("a\nb\nc", "a\nx\ny\nc")).toEqual({ added: 2, removed: 1 });
  });
  it("is zero for equal bodies", () => {
    expect(summarizeChange("a", "a")).toEqual({ added: 0, removed: 0 });
  });
});

describe("formatDate", () => {
  it("keeps the date part", () => {
    expect(formatDate("2026-10-11T08:00:00.000Z")).toBe("2026-10-11");
  });
});
