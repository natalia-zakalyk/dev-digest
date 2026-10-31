/**
 * GET /pulls/:id/smart-diff against real Postgres. Reviews and findings are
 * inserted directly — no review run, no LLM call. Providers are still mocked
 * because buildApp would otherwise resolve real secrets (server/INSIGHTS.md).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SmartDiffResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('smart-diff route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let foreignPrId: string;
  let dismissedId: string;
  const ids: Record<string, string> = {};

  async function makePr(ws: string, number: number) {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `sd-${number}`, fullName: `acme/sd-${number}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number,
        title: 'T',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'sha',
        status: 'open',
      })
      .returning();
    return pr!;
  }

  const finding = (reviewId: string, file: string, startLine: number) => ({
    reviewId,
    file,
    startLine,
    endLine: startLine,
    severity: 'WARNING',
    category: 'bug',
    title: 'x',
    rationale: 'r',
    confidence: 0.5,
  });

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const agents = await db.select().from(t.agents);

    const pr = await makePr(workspaceId, 9001);
    prId = pr.id;
    await db.insert(t.prFiles).values(
      ['pnpm-lock.yaml', 'src/a.ts', 'src/a.test.ts', 'src/index.ts', 'README.md'].map((path) => ({ prId, path })),
    );
    const review = async (agentId: string) => {
      const [r] = await db
        .insert(t.reviews)
        .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 50, model: 'm' })
        .returning();
      return r!;
    };
    const r1 = await review(agents[0]!.id);
    const r2 = await review(agents[1]!.id);
    const inserted = await db
      .insert(t.findings)
      .values([finding(r1.id, 'src/a.ts', 4), finding(r2.id, 'src/a.test.ts', 2), finding(r2.id, 'src/a.ts', 4)])
      .returning();
    ids.a1 = inserted[0]!.id;
    ids.t1 = inserted[1]!.id;
    const [dismissed] = await db
      .insert(t.findings)
      .values({ ...finding(r1.id, 'README.md', 1), dismissedAt: new Date() })
      .returning();
    dismissedId = dismissed!.id;

    // PR of another workspace
    const [other] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    foreignPrId = (await makePr(other!.id, 9002)).id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const app = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        secrets: new MockSecretsProvider(),
        llm: {
          openai: new MockLLMProvider('openai', {}),
          anthropic: new MockLLMProvider('anthropic', {}),
          openrouter: new MockLLMProvider('openai', {}),
        },
      },
    });

  it('groups files by role, keeps the lock file in boilerplate and excludes dismissed findings', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiffResponse.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(body.groups.at(-1)!.files[0]!.path).toBe('pnpm-lock.yaml');
    const files = body.groups.flatMap((g) => g.files);
    const core = files.find((f) => f.path === 'src/a.ts')!;
    expect(core.finding_lines).toEqual([4]);
    expect(core.finding_ids).toHaveLength(2);
    expect(core.finding_ids).toContain(ids.a1);
    expect(files.find((f) => f.path === 'src/a.test.ts')!.finding_ids).toEqual([ids.t1]);
    expect(files.find((f) => f.path === 'README.md')!.finding_ids).not.toContain(dismissedId);
    expect(files.find((f) => f.path === 'README.md')!.finding_ids).toEqual([]);
    await a.close();
  });

  it('404 for an unknown PR and for a PR of another workspace', async () => {
    const a = await app();
    const unknown = await a.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-8000-000000000000/smart-diff' });
    expect(unknown.statusCode).toBe(404);
    const foreign = await a.inject({ method: 'GET', url: `/pulls/${foreignPrId}/smart-diff` });
    expect(foreign.statusCode).toBe(404);
    await a.close();
  });
});
