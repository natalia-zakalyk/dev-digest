/** Pure review-rollup rule shared by pulls (PR list) and smart-diff — no DB / ORM imports. */

export interface ReviewRow {
  id: string;
  prId: string;
  agentId: string | null;
}

/**
 * PR-list FINDINGS: which reviews count — the latest review of each agent per PR
 * (same rule as COST: a rerun replaces that agent's previous findings, different
 * agents add up). Agent-less reviews (seeded demo data) count only on PRs that
 * have no agent review yet — otherwise they'd show findings no timeline run has.
 * `rows` must be newest-first and `kind = 'review'` only.
 */
export function latestReviewPerAgent(rows: ReviewRow[]): ReviewRow[] {
  const withAgent = new Set(rows.filter((r) => r.agentId != null).map((r) => r.prId));
  const seen = new Set<string>();
  const latest: ReviewRow[] = [];
  for (const r of rows) {
    if (r.agentId == null && withAgent.has(r.prId)) continue;
    const key = `${r.prId}:${r.agentId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }
  return latest;
}
