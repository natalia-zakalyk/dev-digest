import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord } from "@devdigest/shared";
import type { SmartDiffResponse } from "@/lib/types";
import { filesWithFindings, findingsByPath, groupPrFiles } from "./helpers";

const pf = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: "" });
const sf = (path: string, ids: string[] = []) => ({
  path,
  additions: 1,
  deletions: 0,
  finding_lines: ids.map((_, i) => i + 1),
  finding_ids: ids,
});
const diff = (groups: SmartDiffResponse["groups"]): SmartDiffResponse => ({
  groups,
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
});
const rec = (id: string, file: string): FindingRecord => ({
  id,
  severity: "WARNING",
  category: "bug",
  title: id,
  file,
  start_line: 1,
  end_line: 1,
  rationale: "r",
  confidence: 0.5,
  review_id: "r",
  accepted_at: null,
  dismissed_at: null,
});

describe("smart-diff helpers", () => {
  it("joins groups to PR files keeping server order, and sends unknown files to core", () => {
    const files = [pf("README.md"), pf("src/a.ts"), pf("late.ts")];
    const groups = groupPrFiles(
      files,
      diff([
        { role: "core", files: [sf("src/a.ts")] },
        { role: "docs", files: [sf("README.md")] },
      ]),
    );
    expect(groups.map((g) => [g.role, g.files.map((f) => f.path)])).toEqual([
      ["core", ["src/a.ts", "late.ts"]],
      ["docs", ["README.md"]],
    ]);
    // no core group on the server → a core group is created first
    expect(groupPrFiles([pf("x.ts")], diff([])).map((g) => g.role)).toEqual(["core"]);
  });

  it("counts files, not findings: 2 files with 5 findings → 2", () => {
    const d = diff([
      { role: "core", files: [sf("a.ts", ["1", "2", "3"]), sf("b.ts", ["4", "5"]), sf("c.ts")] },
    ]);
    const reviews = [
      {
        findings: [rec("1", "a.ts"), rec("2", "a.ts"), rec("3", "a.ts"), rec("4", "b.ts"), rec("5", "b.ts")],
      },
    ] as ReviewRecord[];
    const byPath = findingsByPath(d, reviews);
    expect(byPath.get("a.ts")!.map((f) => f.id)).toEqual(["1", "2", "3"]);
    expect(filesWithFindings([pf("a.ts"), pf("b.ts"), pf("c.ts")], byPath)).toBe(2);
  });

  it("skips ids whose record is not loaded yet", () => {
    const d = diff([{ role: "core", files: [sf("a.ts", ["gone"])] }]);
    expect(findingsByPath(d, []).size).toBe(0);
  });
});
