import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import { countBySeverity, latestReviewPerAgent } from "./findings";

describe("countBySeverity", () => {
  it("tallies critical / warning / suggestion and ignores other severities", () => {
    expect(
      countBySeverity([
        { severity: "CRITICAL" },
        { severity: "CRITICAL" },
        { severity: "WARNING" },
        { severity: "SUGGESTION" },
        { severity: "INFO" },
      ] as never),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it("is all-zero for no findings", () => {
    expect(countBySeverity([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe("latestReviewPerAgent", () => {
  const rv = (id: string, agent_id: string | null, kind: "review" | "summary" = "review") =>
    ({ id, agent_id, kind }) as ReviewRecord;

  it("keeps the newest review of each agent and skips summaries", () => {
    const reviews = [rv("r4", "sec"), rv("s1", "gen", "summary"), rv("r3", "gen"), rv("r2", "sec")];
    expect(latestReviewPerAgent(reviews).map((r) => r.id)).toEqual(["r4", "r3"]);
  });

  it("skips agent-less (seeded) reviews once the PR has an agent review", () => {
    expect(latestReviewPerAgent([rv("r2", "sec"), rv("seed", null)]).map((r) => r.id)).toEqual(["r2"]);
    expect(latestReviewPerAgent([rv("seed", null)]).map((r) => r.id)).toEqual(["seed"]);
  });
});
