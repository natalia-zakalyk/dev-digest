/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import { deriveReviewStatus, latestReviewPerAgent, rollupCostPerPr, rollupSeverities, STALE_DAYS } from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('rollupSeverities', () => {
  it('tallies findings into critical / warning / suggestion buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('latestReviewPerAgent', () => {
  // Rows are newest-first, as the route queries them.
  const rv = (id: string, prId: string, agentId: string | null) => ({ id, prId, agentId });

  it('keeps the latest review of each agent per PR (a rerun replaces, other agents add up)', () => {
    const rows = [
      rv('r4', 'pr-1', 'sec'), // newest Security rerun
      rv('r3', 'pr-1', 'gen'),
      rv('r2', 'pr-1', 'sec'), // older Security run → replaced
      rv('r1', 'pr-2', 'sec'), // same agent, other PR → kept
    ];
    expect(latestReviewPerAgent(rows).map((r) => r.id)).toEqual(['r4', 'r3', 'r1']);
  });

  it('counts agent-less (seeded) reviews only on PRs without an agent review', () => {
    const rows = [
      rv('r3', 'pr-1', 'sec'),
      rv('r2', 'pr-1', null), // seeded, PR has an agent review → skipped
      rv('r1', 'pr-2', null), // seeded, only review on the PR → kept
      rv('r0', 'pr-2', null),
    ];
    expect(latestReviewPerAgent(rows).map((r) => r.id)).toEqual(['r3', 'r1']);
  });
});

describe('rollupCostPerPr', () => {
  // Rows are newest-first, as the route queries them.
  const row = (prId: string, agentId: string | null, status: string, costUsd: number | null) => ({
    prId,
    agentId,
    status,
    costUsd,
  });

  it('sums every successful run, reruns included', () => {
    const totals = rollupCostPerPr([
      row('pr1', 'sec', 'done', 0.0013),
      row('pr1', 'perf', 'done', 0.0014),
      row('pr1', 'sec', 'done', 0.05), // older Security rerun — also paid for
    ]);
    expect(totals.get('pr1')).toBeCloseTo(0.0527, 10);
  });

  it('leaves out running, failed and cancelled runs', () => {
    const totals = rollupCostPerPr([
      row('pr1', 'sec', 'running', null),
      row('pr1', 'sec', 'failed', 0.0006),
      row('pr1', 'gen', 'cancelled', 0.0004),
      row('pr1', 'sec', 'done', 0.002),
    ]);
    expect(totals.get('pr1')).toBe(0.002);
  });

  it('leaves unknown costs out; a PR without a successful priced run is absent (→ null)', () => {
    const totals = rollupCostPerPr([
      row('pr1', 'sec', 'done', null),
      row('pr1', 'perf', 'done', 0.001),
      row('pr2', 'sec', 'done', null),
      row('pr3', 'sec', 'failed', 0.003),
    ]);
    expect(totals.get('pr1')).toBe(0.001);
    expect(totals.has('pr2')).toBe(false);
    expect(totals.has('pr3')).toBe(false);
  });

  it('keeps PRs apart', () => {
    const totals = rollupCostPerPr([row('pr1', null, 'done', 0.001), row('pr2', 'sec', 'done', 0.003)]);
    expect(totals.get('pr1')).toBe(0.001);
    expect(totals.get('pr2')).toBe(0.003);
  });
});
