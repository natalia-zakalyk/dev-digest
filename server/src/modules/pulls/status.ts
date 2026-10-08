import type { PrStatus, SeverityCounts } from '@devdigest/shared';

/**
 * PR-list rollup helpers (pure — no DB / `this`, so they unit-test cleanly).
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, a FINDINGS
 * severity breakdown, and a review STATUS. The DB `status` column holds
 * GitHub's merge state (open/merged/closed); the review status
 * (needs_review / reviewed / stale) is DERIVED here for OPEN PRs from the
 * commit a review last ran against (`lastReviewedSha`) vs the PR head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one review. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}

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

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `needs_review` — never reviewed, OR head moved since the last review
 *  - `stale`        — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`     — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}

export interface RunCostRow {
  prId: string | null;
  agentId: string | null;
  status: string | null;
  costUsd: number | null;
}

/**
 * PR-list COST: per PR, the sum of the cost of every SUCCESSFUL (`done`) run.
 * Running, failed and cancelled runs are left out, as are unknown (null) costs;
 * a PR with no successful priced run is absent from the map (→ null, rendered "—").
 */
export function rollupCostPerPr(rows: RunCostRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.prId || r.status !== 'done' || r.costUsd == null) continue;
    totals.set(r.prId, (totals.get(r.prId) ?? 0) + r.costUsd);
  }
  return totals;
}
