/**
 * GET /pulls/:id/blast against real Postgres with a hand-seeded repo-intel index
 * (symbols, references, file_rank, file_facts, repo_index_state). The real facade
 * reads it; no clone, no LLM. Providers are mocked because buildApp would otherwise
 * resolve real secrets (server/INSIGHTS.md).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DECL = 'src/lib/rate-limit.ts';
const API = 'src/api/items.ts';
const JOB = 'src/jobs/cleanup.ts';

d('blast route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let foreignPrId: string;
  let partialPrId: string;
  let unindexedPrId: string;

  async function makePr(ws: string, number: number, files: string[]) {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `bl-${number}`, fullName: `acme/bl-${number}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({ workspaceId: ws, repoId: repo!.id, number, title: 'T', author: 'a', branch: 'b', base: 'main', headSha: 'sha', status: 'open' })
      .returning();
    await db.insert(t.prFiles).values(files.map((path) => ({ prId: pr!.id, path })));
    return { pr: pr!, repoId: repo!.id };
  }

  async function seedIndex(repoId: string, status: 'full' | 'partial') {
    const db = pg.handle.db;
    await db.insert(t.repoIndexState).values({ repoId, lastIndexedSha: 'sha', indexerVersion: 2, status });
    await db.insert(t.symbols).values([
      { repoId, path: DECL, name: 'rateLimit', kind: 'function', line: 1, endLine: 10, exported: true, signature: 'rateLimit()' },
      { repoId, path: API, name: 'listItems', kind: 'function', line: 1, endLine: 9, exported: true, signature: 'listItems()' },
      { repoId, path: JOB, name: 'cleanup', kind: 'function', line: 1, endLine: 9, exported: true, signature: 'cleanup()' },
    ]);
    await db.insert(t.references).values([
      { repoId, fromPath: API, toSymbol: 'rateLimit', line: 4, declFile: DECL },
      { repoId, fromPath: JOB, toSymbol: 'rateLimit', line: 6, declFile: DECL },
      { repoId, fromPath: DECL, toSymbol: 'rateLimit', line: 8, declFile: DECL }, // self-reference
    ]);
    await db.insert(t.fileRank).values(
      [
        [API, 0.4],
        [JOB, 0.3],
        [DECL, 0.9],
      ].map(([filePath, rank]) => ({ repoId, filePath: filePath as string, pagerank: rank as number, hotness: 0, rank: rank as number, percentile: 50 })),
    );
    await db.insert(t.fileFacts).values([
      { repoId, filePath: API, endpoints: ['GET /api/public/items'], crons: [] },
      { repoId, filePath: JOB, endpoints: [], crons: ['0 * * * *'] },
    ]);
  }

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;

    const full = await makePr(workspaceId, 9101, [DECL]);
    prId = full.pr.id;
    await seedIndex(full.repoId, 'full');
    const partial = await makePr(workspaceId, 9102, [DECL]);
    partialPrId = partial.pr.id;
    await seedIndex(partial.repoId, 'partial');
    unindexedPrId = (await makePr(workspaceId, 9103, [DECL])).pr.id;

    const [other] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    foreignPrId = (await makePr(other!.id, 9104, [DECL])).pr.id;
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

  it('maps callers, endpoint and cron from the prebuilt index; never the declaring file', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    expect(body.degraded).toBe(false);
    const ds = body.downstream.find((x) => x.symbol === 'rateLimit')!;
    expect(ds.callers.map((c) => c.file).sort()).toEqual([JOB, API].sort());
    expect(ds.callers.every((c) => c.file !== DECL && c.line > 0)).toBe(true);
    expect(ds.endpoints_affected).toEqual(['GET /api/public/items']);
    expect(ds.crons_affected).toEqual(['0 * * * *']);
    const byFile = Object.fromEntries(ds.callers.map((c) => [c.file, c]));
    expect(byFile[API]).toMatchObject({ endpoints_affected: ['GET /api/public/items'], crons_affected: [] });
    expect(byFile[JOB]).toMatchObject({ endpoints_affected: [], crons_affected: ['0 * * * *'] });
    expect(body.counts).toMatchObject({ callers: 2, endpoints: 1, crons: 1 });
    await a.close();
  });

  it('partial index: data plus degraded index_partial', async () => {
    const a = await app();
    const body = BlastRadiusResponse.parse((await a.inject({ method: 'GET', url: `/pulls/${partialPrId}/blast` })).json());
    expect(body).toMatchObject({ degraded: true, reason: 'index_partial' });
    expect(body.counts.callers).toBe(2);
    await a.close();
  });

  it('repo without an index: degraded no_data and empty data', async () => {
    const a = await app();
    const body = BlastRadiusResponse.parse((await a.inject({ method: 'GET', url: `/pulls/${unindexedPrId}/blast` })).json());
    expect(body).toMatchObject({ degraded: true, reason: 'no_data', downstream: [], changed_symbols: [] });
    await a.close();
  });

  it('404 for an unknown PR and for a PR of another workspace', async () => {
    const a = await app();
    const unknown = await a.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-8000-000000000000/blast' });
    expect(unknown.statusCode).toBe(404);
    const foreign = await a.inject({ method: 'GET', url: `/pulls/${foreignPrId}/blast` });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toMatchObject({ error: { code: 'not_found' } });
    await a.close();
  });
});
