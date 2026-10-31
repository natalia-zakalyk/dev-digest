import { describe, it, expect } from "vitest";
import type { PrReviewComment } from "@/lib/types";
import type { FindingRecord } from "@devdigest/shared";
import { buildThreads, commentTargetFor, keysForLine, partitionByLineKey, partitionThreads } from "./comments";
import { findingLineKey, topSeverity } from "./findings";

function comment(o: Partial<PrReviewComment>): PrReviewComment {
  return {
    id: 1,
    path: "src/a.ts",
    line: 10,
    original_line: 10,
    side: "RIGHT",
    body: "",
    user: "u",
    created_at: "2026-01-01T00:00:00Z",
    html_url: "",
    in_reply_to_id: null,
    is_outdated: false,
    ...o,
  };
}

describe("buildThreads", () => {
  it("groups replies under their root, oldest first, anchored to the root's line", () => {
    const threads = buildThreads([
      comment({ id: 2, in_reply_to_id: 1, created_at: "2026-01-02T00:00:00Z", line: null }),
      comment({ id: 1, line: 10, side: "LEFT" }),
      comment({ id: 3, line: null, created_at: "2026-01-03T00:00:00Z" }),
    ]);
    expect(threads).toHaveLength(2);
    const root = threads.find((t) => t.rootId === 1)!;
    expect(root.comments.map((c) => c.id)).toEqual([1, 2]);
    expect(root).toMatchObject({ line: 10, side: "LEFT", isOutdated: false });
    expect(threads.find((t) => t.rootId === 3)).toMatchObject({ line: null, isOutdated: true });
  });
});

describe("partitionThreads", () => {
  it("matches threads to rendered line keys and puts the rest in outdated", () => {
    const threads = buildThreads([
      comment({ id: 1, line: 10, side: "RIGHT" }),
      comment({ id: 2, line: 99, side: "RIGHT" }),
      comment({ id: 3, line: null }),
    ]);
    const { matched, outdated } = partitionThreads(threads, new Set(["RIGHT:10"]));
    expect(matched.get("RIGHT:10")?.map((t) => t.rootId)).toEqual([1]);
    expect(outdated.map((t) => t.rootId).sort()).toEqual([2, 3]);
  });
});

describe("keysForLine / commentTargetFor", () => {
  it("anchors context lines on both sides and add/del lines on one", () => {
    expect(keysForLine({ kind: "ctx", text: "", oldNo: 4, newNo: 5 })).toEqual(["RIGHT:5", "LEFT:4"]);
    expect(keysForLine({ kind: "add", text: "", newNo: 6 })).toEqual(["RIGHT:6"]);
    expect(keysForLine({ kind: "del", text: "", oldNo: 7 })).toEqual(["LEFT:7"]);
    expect(keysForLine({ kind: "hunk", text: "@@" })).toEqual([]);
  });

  it("targets the new side for add/ctx lines, the old side for deletions, nothing for hunks", () => {
    expect(commentTargetFor({ kind: "ctx", text: "", oldNo: 4, newNo: 5 })).toEqual({ line: 5, side: "RIGHT" });
    expect(commentTargetFor({ kind: "del", text: "", oldNo: 7 })).toEqual({ line: 7, side: "LEFT" });
    expect(commentTargetFor({ kind: "hunk", text: "@@" })).toBeNull();
  });
});

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "src/a.ts",
    start_line: 2,
    end_line: 2,
    rationale: "r",
    confidence: 0.5,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe("findings on lines", () => {
  const rendered = new Set([
    ...keysForLine({ kind: "add", newNo: 2, oldNo: null, text: "x" } as never),
    ...keysForLine({ kind: "del", newNo: null, oldNo: 7, text: "y" } as never),
  ]);

  it("matches RIGHT:<start_line> against rendered keys; a deleted-line-only key does not match; the rest is unanchored", () => {
    const onLine = finding({ id: "a", start_line: 2 });
    const onDeleted = finding({ id: "b", start_line: 7 }); // only LEFT:7 is rendered
    const missing = finding({ id: "c", start_line: 99 });
    const { matched, unmatched } = partitionByLineKey([onLine, onDeleted, missing], findingLineKey, rendered);
    expect(matched.get("RIGHT:2")).toEqual([onLine]);
    expect(unmatched.map((f) => f.id)).toEqual(["b", "c"]);
  });

  it("topSeverity ranks CRITICAL > WARNING > SUGGESTION and ignores INFO", () => {
    expect(topSeverity([finding({ severity: "SUGGESTION" }), finding({ severity: "CRITICAL" })])).toBe("CRITICAL");
    expect(topSeverity([finding({ severity: "SUGGESTION" }), finding({ severity: "WARNING" })])).toBe("WARNING");
    expect(topSeverity([finding({ severity: "INFO" as never })])).toBeNull();
    expect(topSeverity([])).toBeNull();
  });
});
