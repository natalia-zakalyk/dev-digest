import { describe, it, expect } from "vitest";
import type { PrCommit, RunSummary } from "@devdigest/shared";
import { buildTimeline, outcomeOf, tsOf } from "./helpers";

const run = (o: Partial<RunSummary>) => ({ run_id: "r", status: "done", ...o }) as RunSummary;
const commit = (sha: string, committed_at: string | null) => ({ sha, committed_at }) as PrCommit;

describe("outcomeOf", () => {
  it("maps lifecycle statuses", () => {
    expect(outcomeOf(run({ status: "running" })).key).toBe("running");
    expect(outcomeOf(run({ status: "failed" })).key).toBe("error");
    expect(outcomeOf(run({ status: "cancelled" })).key).toBe("cancelled");
  });
  it("colors a settled run by blockers, then findings", () => {
    expect(outcomeOf(run({ blockers: 2, findings_count: 3 })).key).toBe("rejected");
    expect(outcomeOf(run({ blockers: 0, findings_count: 3 })).key).toBe("reviewed");
    expect(outcomeOf(run({ blockers: null, findings_count: null })).key).toBe("approved");
  });
});

describe("tsOf", () => {
  it("parses ISO and falls back to 0", () => {
    expect(tsOf("2026-01-01T00:00:00.000Z")).toBe(Date.UTC(2026, 0, 1));
    expect(tsOf(null)).toBe(0);
    expect(tsOf("not a date")).toBe(0);
  });
});

describe("buildTimeline", () => {
  it("interleaves runs and commits newest first; undated items sort last", () => {
    const items = buildTimeline(
      [run({ run_id: "r1", ran_at: "2026-01-02T00:00:00Z" }), run({ run_id: "r0", ran_at: null })],
      [commit("c1", "2026-01-03T00:00:00Z"), commit("c0", "2026-01-01T00:00:00Z")],
    );
    expect(items.map((i) => (i.kind === "run" ? i.run.run_id : i.commit.sha))).toEqual(["c1", "r1", "c0", "r0"]);
  });
});
