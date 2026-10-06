/* findings.ts — severity rollups shared by the PR list FINDINGS column and the
   Agent runs timeline. Spec: client/specs/findings-severity.md. */
import type { FindingRecord, ReviewRecord, SeverityCounts } from "@devdigest/shared";

/** Severities that get a counter, in display order. */
export const COUNTED_SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;
export type CountedSeverity = (typeof COUNTED_SEVERITIES)[number];

/** SeverityCounts key for each counted severity. */
export const SEVERITY_KEY: Record<CountedSeverity, keyof SeverityCounts> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

/** Tally findings per severity (unknown severities are ignored). */
export function countBySeverity(findings: Pick<FindingRecord, "severity">[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    const key = SEVERITY_KEY[f.severity as CountedSeverity];
    if (key) c[key] += 1;
  }
  return c;
}

/**
 * The reviews the PR list counts: the latest review of each agent (a rerun
 * replaces that agent's previous one). Agent-less reviews (seeded demo data)
 * count only while the PR has no agent review. Mirrors `latestReviewPerAgent`
 * in server/src/modules/pulls/status.ts. `reviews` must be newest-first, as
 * GET /pulls/:id/reviews returns them.
 */
export function latestReviewPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  const hasAgentReview = reviews.some((r) => r.kind === "review" && r.agent_id != null);
  const seen = new Set<string>();
  const latest: ReviewRecord[] = [];
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    if (r.agent_id == null && hasAgentReview) continue;
    const key = r.agent_id ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }
  return latest;
}
