import { TEXT_CAPS } from '../constants.js';
import { fitToBudget } from './budget.js';
import { resolveLimit } from './limit.js';
import { shapeFindings } from './findings.js';
import type {
  DetailLevel,
  ReviewEntry,
  ReviewsResult,
  RunDoneResult,
  RunFailedResult,
  RunRunningResult,
  ShapedFinding,
} from './schemas.js';
import { truncateText } from './text.js';
import type { ReviewInput, RunInput } from './types.js';

export interface ShapeOptions {
  detail?: DetailLevel;
  limit?: number;
}

function truncationHint(shown: number, total: number): string {
  return (
    `Showing ${shown} of ${total} findings, most severe first. ` +
    'Narrow with a smaller limit, the agent argument, or detail:"concise".'
  );
}

function unreadableHint(count: number): string | undefined {
  return count > 0 ? `${count} finding${count === 1 ? '' : 's'} could not be read from the API and ${count === 1 ? 'is' : 'are'} not counted.` : undefined;
}

const joinHints = (...hints: Array<string | undefined>): string | undefined => {
  const parts = hints.filter((h): h is string => !!h);
  return parts.length > 0 ? parts.join(' ') : undefined;
};

/** One review of one run -> `{status:"done", run_id, verdict, score, counts, findings[], truncated?, total?, hint?}`. */
export function shapeReview(review: ReviewInput, runId: string, options: ShapeOptions = {}): RunDoneResult {
  const { findings, counts } = shapeFindings(review.findings, options.detail ?? 'concise');
  const total = findings.length;
  const limited = Math.min(total, resolveLimit(options.limit));
  return fitToBudget(limited, (keep): RunDoneResult => {
    const base = {
      status: 'done' as const,
      run_id: runId,
      verdict: review.verdict,
      score: review.score,
      counts,
      findings: findings.slice(0, keep),
    };
    const hint = joinHints(keep < total ? truncationHint(keep, total) : undefined, unreadableHint(review.unreadableFindings ?? 0));
    if (keep < total) return { ...base, truncated: true, total, ...(hint ? { hint } : {}) };
    return hint ? { ...base, hint } : base;
  });
}

/** Latest `kind:"review"` of each agent (by `createdAt`, ties keep the later list entry), stable by first appearance. */
export function latestReviewPerAgent(reviews: readonly ReviewInput[]): ReviewInput[] {
  const latest = new Map<string, ReviewInput>();
  for (const r of reviews) {
    if (r.kind !== 'review') continue;
    const key = r.agentId ?? `run:${r.runId ?? r.id}`;
    const prev = latest.get(key);
    if (!prev || r.createdAt >= prev.createdAt) latest.set(key, r);
  }
  return [...latest.values()];
}

/** Several reviews (latest of each agent) -> `{status:"done", pr, reviews[], truncated?, total?, hint?}`. */
export function shapeReviews(pr: number, reviews: readonly ReviewInput[], options: ShapeOptions = {}): ReviewsResult {
  const detail = options.detail ?? 'concise';
  const perReviewLimit = resolveLimit(options.limit);
  const shaped = reviews.map((r) => {
    const { findings, counts } = shapeFindings(r.findings, detail);
    return { review: r, counts, findings: findings.slice(0, perReviewLimit), total: findings.length };
  });
  const total = shaped.reduce((sum, s) => sum + s.total, 0);
  const limitedCount = shaped.reduce((sum, s) => sum + s.findings.length, 0);

  return fitToBudget(limitedCount, (keep): ReviewsResult => {
    let remaining = keep;
    const entries: ReviewEntry[] = shaped.map((s) => {
      const take = Math.min(remaining, s.findings.length);
      remaining -= take;
      const findings: ShapedFinding[] = s.findings.slice(0, take);
      return {
        agent: s.review.agentName ?? s.review.agentId,
        run_id: s.review.runId,
        verdict: s.review.verdict,
        score: s.review.score,
        counts: s.counts,
        findings,
      };
    });
    const base = { status: 'done' as const, pr, reviews: entries };
    const shown = entries.reduce((sum, e) => sum + e.findings.length, 0);
    const hint = joinHints(
      shown < total ? truncationHint(shown, total) : undefined,
      unreadableHint(reviews.reduce((sum, r) => sum + (r.unreadableFindings ?? 0), 0)),
    );
    if (shown < total) return { ...base, truncated: true, total, ...(hint ? { hint } : {}) };
    return hint ? { ...base, hint } : base;
  });
}

/** Empty `get_findings` answer for a PR without a finished review (spec, proposed). */
export function noReviewsResult(pr: number): ReviewsResult {
  return {
    status: 'done',
    pr,
    reviews: [],
    hint: 'No finished review yet. Call run_agent_on_pr(repo, pr, agent).',
  };
}

export type RunPhase = 'running' | 'done' | 'failed';

/** `done` -> done; `failed` and `cancelled` -> failed; anything else (running, null, unknown) -> still running. */
export function classifyRun(status: string | null): RunPhase {
  if (status === 'done') return 'done';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return 'running';
}

export function runningResult(repo: string, pr: number, runId: string): RunRunningResult {
  return {
    status: 'running',
    run_id: runId,
    next: `call get_findings(repo: "${repo}", pr: ${pr}, run_id: "${runId}")`,
  };
}

/** A run that finished `done` but has no review row for its `run_id`: a normal `failed` result. */
export function noReviewForRunResult(runId: string): RunFailedResult {
  return { status: 'failed', run_id: runId, error: 'Run finished but produced no review.' };
}

/** `failed` keeps the run's error text (truncated); `cancelled` becomes "Run was cancelled." (spec, proposed). */
export function failedResult(run: Pick<RunInput, 'runId' | 'status' | 'error'>): RunFailedResult {
  const error =
    run.status === 'cancelled'
      ? 'Run was cancelled.'
      : truncateText(run.error?.trim() || 'Run failed without an error message.', TEXT_CAPS.runError);
  return { status: 'failed', run_id: run.runId, error };
}
