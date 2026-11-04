import { describe, expect, it } from 'vitest';
import { createDeps } from '../../src/use-cases/index.js';
import {
  getBlastRadius,
  getConventions,
  getFindings,
  listAgents,
  runAgentOnPr,
} from '../../src/use-cases/index.js';
import { AgentNotFound, ApiError, ApiUnreachable, PrNotImported, RepoNotImported, RunNotFound, RunRateLimited } from './imports.js';
import { finding, review } from '../fixtures/reviews.js';
import { agent, FakeApi, FakeClock, run } from './fakes.js';

function setup(over: { runWaitMs?: number } = {}) {
  const api = new FakeApi();
  const clock = new FakeClock();
  const deps = createDeps({ api, clock, ...over });
  return { api, clock, deps };
}
const args = { repo: 'acme/shop', pr: 12, agent: 'a1' };

describe('runAgentOnPr', () => {
  it('returns the done result of that run only, any review kind matched by run_id', async () => {
    const { api, deps } = setup();
    api.reviews = [
      review([finding({ id: 'other' })], { runId: 'run-0', id: 'r0' }),
      review([finding({ id: 'mine', severity: 'CRITICAL' }), finding({ id: 'gone', dismissedAt: '2026-01-01' })], {
        runId: 'run-1',
        id: 'r1',
        kind: 'summary',
      }),
    ];
    const res = await runAgentOnPr(deps, args);
    expect(res).toMatchObject({ status: 'done', run_id: 'run-1', counts: { critical: 1, warning: 0, suggestion: 0 } });
    expect(res.status === 'done' && res.findings.map((f) => f.id)).toEqual(['mine']);
    expect(api.count('startReview')).toBe(1);
  });

  describe('run_id is not lost once startReview succeeded', () => {
    const expectedRunning = {
      status: 'running',
      run_id: 'run-1',
      next: 'call get_findings(repo: "Acme/Shop", pr: 12, run_id: "run-1")',
    };

    it('listRuns failing with ApiUnreachable returns the running result, POST called once', async () => {
      const { api, deps } = setup();
      api.listRuns = async () => {
        api.calls.push('listRuns');
        throw new ApiUnreachable('http://localhost:3001');
      };
      expect(await runAgentOnPr(deps, args)).toEqual(expectedRunning);
      expect(api.count('startReview')).toBe(1);
      expect(api.count('listRuns')).toBe(1);
    });

    it('listRuns failing with ApiError after a few polls still returns running', async () => {
      const { api, deps } = setup();
      let n = 0;
      api.listRuns = async () => {
        api.calls.push('listRuns');
        if (++n < 3) return [run({ status: 'running' })];
        throw new ApiError(500, 'GET /pulls/:id/runs', 'boom');
      };
      expect(await runAgentOnPr(deps, args)).toEqual(expectedRunning);
      expect(api.count('startReview')).toBe(1);
    });

    it('listReviews failing after the run is done returns running with next', async () => {
      const { api, deps } = setup();
      api.listReviews = async () => {
        api.calls.push('listReviews');
        throw new ApiError(502, 'GET /pulls/:id/reviews', 'bad gateway');
      };
      expect(await runAgentOnPr(deps, args)).toEqual(expectedRunning);
      expect(api.count('startReview')).toBe(1);
    });

    it('other (non-API) errors are not swallowed', async () => {
      const { api, deps } = setup();
      api.listRuns = async () => {
        throw new Error('bug');
      };
      await expect(runAgentOnPr(deps, args)).rejects.toThrow('bug');
    });

    it('startReview itself failing stays an error (no run exists)', async () => {
      const { api, deps } = setup();
      api.startReview = async () => {
        api.calls.push('startReview');
        throw new ApiUnreachable('http://localhost:3001');
      };
      await expect(runAgentOnPr(deps, args)).rejects.toBeInstanceOf(ApiUnreachable);
      expect(api.count('startReview')).toBe(1);
      expect(api.count('listRuns')).toBe(0);
    });
  });

  it('polls every interval until the run is done', async () => {
    const { api, clock, deps } = setup();
    api.runsByPoll = [[run()], [run()], [run({ status: 'done' })]];
    api.reviews = [review([finding()])];
    const res = await runAgentOnPr(deps, args);
    expect(res.status).toBe('done');
    expect(clock.sleeps).toEqual([2000, 2000]);
  });

  it('treats a run not yet listed as running', async () => {
    const { api, deps } = setup();
    api.runsByPoll = [[], [run({ status: 'done' })]];
    api.reviews = [review([finding()])];
    expect((await runAgentOnPr(deps, args)).status).toBe('done');
  });

  it('on timeout returns running with next and keeps the run (single POST)', async () => {
    const { api, clock, deps } = setup({ runWaitMs: 5000 });
    api.runsByPoll = [[run()]];
    const res = await runAgentOnPr(deps, args);
    expect(res).toMatchObject({ status: 'running', run_id: 'run-1' });
    expect(res.status === 'running' && res.next).toContain('Acme/Shop');
    expect(res.status === 'running' && res.next).toContain('12');
    expect(res.status === 'running' && res.next).toContain('run-1');
    expect(clock.sleeps).toEqual([2000, 2000, 1000]);
    expect(api.count('startReview')).toBe(1);
    expect(api.count('listReviews')).toBe(0);
  });

  it('failed run is a failed result, cancelled maps to "Run was cancelled."', async () => {
    const { api, deps } = setup();
    api.runsByPoll = [[run({ status: 'failed', error: 'boom' })]];
    expect(await runAgentOnPr(deps, args)).toEqual({ status: 'failed', run_id: 'run-1', error: 'boom' });
    const s2 = setup();
    s2.api.runsByPoll = [[run({ status: 'cancelled' })]];
    expect(await runAgentOnPr(s2.deps, args)).toEqual({ status: 'failed', run_id: 'run-1', error: 'Run was cancelled.' });
  });

  it('done run without a review becomes a failed result', async () => {
    const { deps } = setup();
    expect(await runAgentOnPr(deps, args)).toEqual({
      status: 'failed',
      run_id: 'run-1',
      error: 'Run finished but produced no review.',
    });
  });

  it('propagates repo, PR, agent and rate-limit errors without starting a run', async () => {
    const { api, deps } = setup();
    await expect(runAgentOnPr(deps, { ...args, repo: 'x/y' })).rejects.toBeInstanceOf(RepoNotImported);
    await expect(runAgentOnPr(deps, { ...args, pr: 99 })).rejects.toBeInstanceOf(PrNotImported);
    await expect(runAgentOnPr(deps, { ...args, agent: 'zz' })).rejects.toBeInstanceOf(AgentNotFound);
    expect(api.count('startReview')).toBe(0);
    api.startReview = async () => {
      throw new RunRateLimited(30);
    };
    await expect(runAgentOnPr(deps, args)).rejects.toBeInstanceOf(RunRateLimited);
  });
});

describe('getFindings', () => {
  const gf = { repo: 'acme/shop', pr: 12 };

  it('run_id: done run, never starts a run', async () => {
    const { api, deps } = setup();
    api.reviews = [review([finding()])];
    const res = await getFindings(deps, { ...gf, run_id: 'run-1' });
    expect(res).toMatchObject({ status: 'done', run_id: 'run-1' });
    expect(api.count('startReview')).toBe(0);
  });

  it('run_id: unknown -> RunNotFound; running -> running; failed -> failed', async () => {
    const { api, deps } = setup();
    await expect(getFindings(deps, { ...gf, run_id: 'nope' })).rejects.toBeInstanceOf(RunNotFound);
    api.runsByPoll = [[run()]];
    expect(await getFindings(deps, { ...gf, run_id: 'run-1' })).toMatchObject({ status: 'running', run_id: 'run-1' });
    api.runsByPoll = [[run({ status: 'failed', error: 'x' })]];
    expect(await getFindings(deps, { ...gf, run_id: 'run-1' })).toMatchObject({ status: 'failed' });
  });

  it('run_id: done run with no review -> failed result (same as run_agent_on_pr)', async () => {
    const { deps } = setup();
    expect(await getFindings(deps, { ...gf, run_id: 'run-1' })).toEqual({
      status: 'failed',
      run_id: 'run-1',
      error: 'Run finished but produced no review.',
    });
  });

  it('default: latest review of each agent (summaries ignored)', async () => {
    const { api, deps } = setup();
    api.reviews = [
      review([finding({ id: 'old' })], { id: 'r1', createdAt: '2026-11-01T00:00:00Z' }),
      review([finding({ id: 'new' })], { id: 'r2', createdAt: '2026-11-02T00:00:00Z', runId: 'run-2' }),
      review([finding({ id: 'b' })], { id: 'r3', agentId: 'a2', agentName: 'perf', runId: 'run-3' }),
      review([], { id: 'r4', kind: 'summary', agentId: 'a3' }),
    ];
    const res = await getFindings(deps, gf);
    expect(res.status === 'done' && 'reviews' in res && res.reviews.map((r) => r.run_id)).toEqual(['run-2', 'run-3']);
  });

  it('agent filter restricts to that agent; unknown agent -> AgentNotFound', async () => {
    const { api, deps } = setup();
    api.agents = [agent(), agent({ id: 'a2', name: 'perf' })];
    api.reviews = [review([finding()]), review([finding()], { id: 'r3', agentId: 'a2', runId: 'run-3' })];
    const res = await getFindings(deps, { ...gf, agent: 'a2' });
    expect(res.status === 'done' && 'reviews' in res && res.reviews.map((r) => r.run_id)).toEqual(['run-3']);
    await expect(getFindings(deps, { ...gf, agent: 'zz' })).rejects.toBeInstanceOf(AgentNotFound);
  });

  it('no finished review -> empty list with hint', async () => {
    const { deps } = setup();
    expect(await getFindings(deps, gf)).toMatchObject({ reviews: [], hint: expect.stringContaining('run_agent_on_pr') });
  });

  it('propagates repo and PR errors', async () => {
    const { deps } = setup();
    await expect(getFindings(deps, { repo: 'x/y', pr: 12 })).rejects.toBeInstanceOf(RepoNotImported);
    await expect(getFindings(deps, { repo: 'acme/shop', pr: 99 })).rejects.toBeInstanceOf(PrNotImported);
  });
});

describe('listAgents / getConventions / getBlastRadius', () => {
  it('listAgents shapes the agents (empty is fine)', async () => {
    const { api, deps } = setup();
    expect((await listAgents(deps)).agents).toHaveLength(1);
    api.agents = [];
    // cached for 60 s, so advance the clock
    await deps.clock.sleep(61_000);
    expect(await listAgents(deps)).toEqual({ agents: [] });
  });

  it('getConventions keeps accepted only, evidence as path:line', async () => {
    const { api, deps } = setup();
    api.conventions = [
      { rule: 'Use X', category: 'style', evidencePath: 'a.ts', evidenceLineStart: 3, status: 'accepted' },
      { rule: 'Skip', evidencePath: 'b.ts', status: 'pending' },
    ];
    const res = await getConventions(deps, { repo: 'ACME/shop' });
    expect(res).toEqual({
      repo: 'Acme/Shop',
      conventions: [{ rule: 'Use X', category: 'style', evidence: 'a.ts:3' }],
      total: 1,
    });
    await expect(getConventions(deps, { repo: 'x/y' })).rejects.toBeInstanceOf(RepoNotImported);
  });

  it('getBlastRadius resolves repo and PR, reads the blast map of that PR id, never starts a run', async () => {
    const { api, deps } = setup();
    const res = await getBlastRadius(deps, { repo: 'ACME/shop', pr: 12 });
    expect(res).toMatchObject({
      repo: 'Acme/Shop',
      pr: 12,
      degraded: false,
      counts: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
      changed_symbols: [{ name: 'rateLimit', file: 'src/lib/rate-limit.ts' }],
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [{ name: 'listItems', file: 'src/api/items.ts', line: 7 }],
          endpoints_affected: ['GET /api/public/items'],
          crons_affected: [],
        },
      ],
    });
    expect(api.calls).toContain('getBlast:pr-uuid');
    expect(api.count('startReview')).toBe(0);
  });

  it('getBlastRadius: unknown PR is PrNotImported, unknown repo is RepoNotImported, no blast call', async () => {
    const { api, deps } = setup();
    await expect(getBlastRadius(deps, { repo: 'acme/shop', pr: 99 })).rejects.toBeInstanceOf(PrNotImported);
    await expect(getBlastRadius(deps, { repo: 'x/y', pr: 12 })).rejects.toBeInstanceOf(RepoNotImported);
    expect(api.calls.some((c) => c.startsWith('getBlast'))).toBe(false);
  });

  it('getBlastRadius: a degraded index is a success with the re-analyze hint', async () => {
    const { api, deps } = setup();
    api.blast = { ...api.blast, degraded: true, reason: 'index_failed', downstream: [] };
    const res = await getBlastRadius(deps, { repo: 'acme/shop', pr: 12 });
    expect(res.degraded).toBe(true);
    expect(res.reason).toBe('index_failed');
    expect(res.hint).toBe(
      'Index incomplete (index_failed): open the repo in the DevDigest studio and run Re-analyze, then retry.',
    );
  });
});
