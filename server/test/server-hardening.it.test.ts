import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

/** DB-backed regressions for the server-hardening batch (BE-F2, BE-F4, BE-F9). */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('server hardening (pg)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('POST /repos clones from the canonical URL, never the raw input (BE-F2)', async () => {
    const git = new MockGitClient();
    const app = await buildApp({ config, db: pg.handle.db, overrides: { git, github: new MockGitHubClient() } });
    const res = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://github.com/Acme/Gadgets/' },
    });
    expect(res.statusCode).toBe(201);
    await app.container.jobs.onIdle();
    const clone = git.cloned.find((c) => c.repo.name === 'Gadgets');
    expect(clone?.url).toBe('https://github.com/Acme/Gadgets.git');
    const [job] = await pg.handle.db
      .select()
      .from(t.jobs)
      .where(eq(t.jobs.kind, 'clone'));
    expect((job!.payload as { url: string }).url).toMatch(/^https:\/\/github\.com\/[^@]+\.git$/);
    await app.close();
  });

  it('a failed job never persists credentials in jobs.error (BE-F4)', async () => {
    const app = await buildApp({ config, db: pg.handle.db, overrides: { git: new MockGitClient() } });
    app.container.jobs.register('leaky', async () => {
      throw new Error("fatal: unable to access 'https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz012345@github.com/o/r.git/'");
    });
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const job = await app.container.jobs.enqueue(ws!.id, 'leaky', {});
    await job.done.catch(() => undefined);
    const [row] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, job.id));
    expect(row!.status).toBe('failed');
    expect(row!.error).toContain('https://***@github.com/o/r.git/');
    expect(row!.error).not.toContain('ghp_');
    await app.close();
  }, 30_000);

  it('GET /runs/:id/events for an unknown run → 404 (BE-F9)', async () => {
    const app = await buildApp({ config, db: pg.handle.db, overrides: { git: new MockGitClient() } });
    const res = await app.inject({
      method: 'GET',
      url: '/runs/00000000-0000-4000-8000-000000000000/events',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });

  it('repo-intel index-state / resync are scoped to the workspace (BE-F11)', async () => {
    const app = await buildApp({ config, db: pg.handle.db, overrides: { git: new MockGitClient() } });
    const unknown = '00000000-0000-4000-8000-000000000000';
    for (const [method, url] of [
      ['GET', `/repos/${unknown}/index-state`],
      ['POST', `/repos/${unknown}/resync`],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    }
    const [repo] = await pg.handle.db.select({ id: t.repos.id }).from(t.repos);
    const ok = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/index-state` });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it('a completed run replays its events and ends with a terminal `done` event', async () => {
    const app = await buildApp({ config, db: pg.handle.db, overrides: { git: new MockGitClient() } });
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId: ws!.id, status: 'done' })
      .returning({ id: t.agentRuns.id });
    app.container.runBus.publish(run!.id, 'info', 'Reviewing');
    app.container.runBus.complete(run!.id);

    const res = await app.inject({ method: 'GET', url: `/runs/${run!.id}/events` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('event: info');
    expect(res.body).toContain('Reviewing');
    // `done` comes last, after the replayed events.
    expect(res.body.indexOf('event: done')).toBeGreaterThan(res.body.indexOf('Reviewing'));
    await app.close();
  });
});
