import { describe, it, expect } from "vitest";
import type { PrReviewComment } from "@/lib/types";
import { buildThreads, commentTargetFor, keysForLine, partitionThreads } from "./comments";

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
