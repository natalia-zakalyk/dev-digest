/**
 * DB integrity (migration 0011 + transactional repositories), against a real
 * Postgres (Testcontainers):
 *  - run delete cascades to its review, findings and trace (reviews.run_id FK)
 *  - PR-list rollups unchanged after the multi-row syncPulls refactor
 *  - settings upsert conflict path (incl. NULL user_id, NULLS NOT DISTINCT)
 *  - repo-intel replace ops are atomic (failed insert keeps the old rows)
 *  - CHECK constraints reject bad status/severity values
 *  - run-id tenancy (cancel / trace scoped by workspace)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import type { PrMeta, RunTrace } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Postgres error code of a rejected statement (drizzle wraps the driver error). */
async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
}

let seq = 0;

d('DB integrity (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];
  let workspaceId: string;

  async function makeRepo() {
    const name = `integrity-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  async function makePr(repoId: string, number = 1) {
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number,
        title: 'T',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'sha1',
        status: 'open',
      })
      .returning();
    return pr!;
  }

  /** A done run + its review (2 findings) + trace, as the executor writes them. */
  async function makeRunWithReview(prId: string, ws = workspaceId) {
    const repo = new ReviewRepository(db);
    const runId = await repo.createAgentRun({
      workspaceId: ws,
      agentId: null,
      prId,
      provider: 'openai',
      model: 'm',
    });
    const review = await repo.transaction(async (tx) => {
      const r = await tx.insertReview({
        workspaceId: ws,
        prId,
        agentId: null,
        runId,
        kind: 'review',
        verdict: 'comment',
        summary: 's',
        score: 77,
        model: 'm',
      });
      await tx.insertFindings(r.id, [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'x',
          file: 'a.ts',
          start_line: 1,
          end_line: 1,
          rationale: 'r',
          confidence: 0.9,
          kind: 'finding',
        },
        {
          id: 'f2',
          severity: 'WARNING',
          category: 'bug',
          title: 'y',
          file: 'a.ts',
          start_line: 2,
          end_line: 2,
          rationale: 'r',
          confidence: 0.5,
          kind: 'finding',
        },
      ]);
      await tx.completeAgentRun(runId, {
        status: 'done',
        durationMs: 10,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0.25,
        findingsCount: 2,
        grounding: '2/2 passed',
        score: 77,
        blockers: 1,
      });
      return r;
    });
    await repo.saveRunTrace(runId, { log: [] } as unknown as RunTrace);
    return { runId, reviewId: review.id };
  }

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('deleting a run cascades to its review, findings and trace', async () => {
    const repo = await makeRepo();
    const pr = await makePr(repo.id);
    const { runId, reviewId } = await makeRunWithReview(pr.id);
    const reviews = new ReviewRepository(db);

    // Other workspace can't delete it.
    const [other] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    expect(await reviews.deleteAgentRun(other!.id, runId)).toBe(false);

    expect(await reviews.deleteAgentRun(workspaceId, runId)).toBe(true);
    expect(await db.select().from(t.reviews).where(eq(t.reviews.id, reviewId))).toHaveLength(0);
    expect(
      await db.select().from(t.findings).where(eq(t.findings.reviewId, reviewId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId)),
    ).toHaveLength(0);
  });

  it('deleting an agent keeps its reviews with agent_id nulled', async () => {
    const repo = await makeRepo();
    const pr = await makePr(repo.id);
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId, name: `tmp-${seq++}`, provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, agentId: agent!.id, kind: 'review' })
      .returning();
    await db.delete(t.agents).where(eq(t.agents.id, agent!.id));
    const [after] = await db.select().from(t.reviews).where(eq(t.reviews.id, review!.id));
    expect(after?.agentId).toBeNull();
  });

  it('run-id tenancy: trace and cancel are scoped to the workspace', async () => {
    const repo = await makeRepo();
    const pr = await makePr(repo.id);
    const reviews = new ReviewRepository(db);
    const { runId } = await makeRunWithReview(pr.id);
    const [other] = await db.insert(t.workspaces).values({ name: 'other2' }).returning();

    expect(await reviews.getRunTrace(workspaceId, runId)).toBeDefined();
    expect(await reviews.getRunTrace(other!.id, runId)).toBeUndefined();
    expect(await reviews.runInWorkspace(other!.id, runId)).toBe(false);

    const running = await reviews.createAgentRun({
      workspaceId,
      agentId: null,
      prId: pr.id,
      provider: null,
      model: null,
    });
    expect(await reviews.cancelRunIfRunning(other!.id, running)).toBe(false);
    expect(await reviews.cancelRunIfRunning(workspaceId, running)).toBe(true);
    const [row] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, running));
    expect(row?.status).toBe('cancelled');
  });

  it('a failed completion transaction leaves no review behind', async () => {
    const repo = await makeRepo();
    const pr = await makePr(repo.id);
    const reviews = new ReviewRepository(db);
    const runId = await reviews.createAgentRun({
      workspaceId,
      agentId: null,
      prId: pr.id,
      provider: null,
      model: null,
    });
    await expect(
      reviews.transaction(async (tx) => {
        const r = await tx.insertReview({
          workspaceId,
          prId: pr.id,
          agentId: null,
          runId,
          kind: 'review',
          verdict: null,
          summary: null,
          score: null,
          model: null,
        });
        // severity CHECK rejects lowercase → whole unit rolls back
        await tx.insertFindings(r.id, [
          {
            id: 'bad',
            severity: 'critical' as never,
            category: 'bug',
            title: 't',
            file: 'a.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'r',
            confidence: 1,
            kind: 'finding',
          },
        ]);
      }),
    ).rejects.toThrow();
    expect(await db.select().from(t.reviews).where(eq(t.reviews.runId, runId))).toHaveLength(0);
  });

  it('PR list: sync upserts once per PR and keeps score/cost/findings rollups', async () => {
    const repo = await makeRepo();
    const pulls: PrMeta[] = [
      {
        number: 10,
        title: 'first',
        author: 'a',
        branch: 'f',
        base: 'main',
        head_sha: 'h1',
        additions: 5,
        deletions: 1,
        files_count: 2,
        status: 'open',
        opened_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T01:00:00Z',
      },
      {
        number: 11,
        title: 'second',
        author: 'b',
        branch: 'g',
        base: 'main',
        head_sha: 'h2',
        additions: 3,
        deletions: 0,
        files_count: 1,
        status: 'open',
        opened_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T01:00:00Z',
      },
    ];
    const app = await buildApp({
      config: config(),
      db,
      overrides: { github: new MockGitHubClient({ pulls }) },
    });

    const poll = await app.inject({ method: 'POST', url: `/repos/${repo.id}/poll` });
    expect(poll.statusCode).toBe(200);
    expect(poll.json()).toEqual({ synced: 2, reviewTriggered: false });

    const [pr10] = await db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo.id))
      .orderBy(t.pullRequests.number);
    expect(pr10!.openedAt?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    await db
      .update(t.pullRequests)
      .set({ lastReviewedSha: 'h1' })
      .where(eq(t.pullRequests.id, pr10!.id));
    await makeRunWithReview(pr10!.id);

    // Second sync: GitHub changed title/head/status; diff stats on the list
    // payload are zero (as on GitHub) and must NOT overwrite stored ones.
    const app2 = await buildApp({
      config: config(),
      db,
      overrides: {
        github: new MockGitHubClient({
          pulls: [
            { ...pulls[0]!, title: 'first v2', head_sha: 'h1b', status: 'merged', additions: 0, deletions: 0, files_count: 0 },
            pulls[1]!,
          ],
        }),
      },
    });
    const res = await app2.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const list = (res.json() as PrMeta[]).sort((a, b) => a.number - b.number);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      number: 10,
      title: 'first v2',
      head_sha: 'h1b',
      additions: 5,
      score: 77,
      cost_usd: 0.25,
      findings: { critical: 1, warning: 1, suggestion: 0 },
    });
    const [row] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr10!.id));
    expect(row).toMatchObject({ status: 'merged', lastReviewedSha: 'h1', author: 'a' });
    expect(list[1]).toMatchObject({ number: 11, score: null, cost_usd: null, findings: null });
  });

  it('PR detail refresh replaces files and commits', async () => {
    const repo = await makeRepo();
    const pr = await makePr(repo.id, 482);
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'old.ts' });
    const app = await buildApp({ config: config(), db, overrides: { github: new MockGitHubClient() } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(res.statusCode).toBe(200);
    const files = await db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    expect(files.map((f) => f.path)).not.toContain('old.ts');
    expect(files.length).toBe((res.json() as { files: unknown[] }).files.length);
  });

  it('settings upsert hits the conflict path (also for a NULL user_id)', async () => {
    const app = await buildApp({ config: config(), db });
    for (const theme of ['light', 'dark', 'light']) {
      const res = await app.inject({ method: 'PUT', url: '/settings', payload: { theme } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ theme });
    }
    const rows = await db.select().from(t.settings).where(eq(t.settings.key, 'theme'));
    expect(rows.filter((r) => r.workspaceId === workspaceId)).toHaveLength(1);

    // Workspace-level (user_id NULL) rows are now unique per key too.
    const upsert = (value: string) =>
      db
        .insert(t.settings)
        .values({ workspaceId, userId: null, key: 'ws_level', value })
        .onConflictDoUpdate({
          target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
          set: { value },
        });
    await upsert('a');
    await upsert('b');
    const wsRows = await db.select().from(t.settings).where(eq(t.settings.key, 'ws_level'));
    expect(wsRows).toHaveLength(1);
    expect(wsRows[0]!.value).toBe('b');
  });

  it('repo-intel replace is atomic: a failed insert keeps the previous rows', async () => {
    const repo = await makeRepo();
    const ri = new RepoIntelRepository(db);
    await ri.replaceEdges(repo.id, [
      { fromFile: 'a.ts', toFile: 'b.ts' },
      { fromFile: 'b.ts', toFile: 'c.ts' },
    ]);
    // Duplicate edge violates the composite PK mid-replace → rolled back.
    await expect(
      ri.replaceEdges(repo.id, [
        { fromFile: 'x.ts', toFile: 'y.ts' },
        { fromFile: 'x.ts', toFile: 'y.ts' },
      ]),
    ).rejects.toThrow();
    const edges = await db.select().from(t.fileEdges).where(eq(t.fileEdges.repoId, repo.id));
    expect(edges.map((e) => e.fromFile).sort()).toEqual(['a.ts', 'b.ts']);

    // Happy path still replaces.
    await ri.replaceEdges(repo.id, [{ fromFile: 'x.ts', toFile: 'y.ts' }]);
    const after = await db.select().from(t.fileEdges).where(eq(t.fileEdges.repoId, repo.id));
    expect(after).toEqual([{ repoId: repo.id, fromFile: 'x.ts', toFile: 'y.ts' }]);
  });

  it('CHECK constraints reject bad status / severity values', async () => {
    const repo = await makeRepo();
    const pr = await makePr(repo.id);

    // agent_runs.status: NOT NULL DEFAULT 'running' + CHECK
    const [run] = await db.insert(t.agentRuns).values({ workspaceId, prId: pr.id }).returning();
    expect(run!.status).toBe('running');
    expect(
      await pgCode(
        db.update(t.agentRuns).set({ status: 'bogus' as never }).where(eq(t.agentRuns.id, run!.id)),
      ),
    ).toBe('23514');

    // findings.severity: exact casing of the Severity enum
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review' })
      .returning();
    const finding = (severity: string) =>
      db.insert(t.findings).values({
        reviewId: review!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity,
        category: 'bug',
        title: 't',
        rationale: 'r',
        confidence: 1,
      });
    expect(await pgCode(finding('critical'))).toBe('23514');
    expect(await pgCode(finding('SUGGESTION'))).toBeUndefined();

    // pull_requests.status: PrStatus values only
    expect(
      await pgCode(
        db.update(t.pullRequests).set({ status: 'weird' }).where(eq(t.pullRequests.id, pr.id)),
      ),
    ).toBe('23514');

    // reviews.run_id FK: a review can't point at a non-existent run
    expect(
      await pgCode(
        db.insert(t.reviews).values({
          workspaceId,
          prId: pr.id,
          kind: 'review',
          runId: '00000000-0000-0000-0000-000000000000',
        }),
      ),
    ).toBe('23503');
  });
});
