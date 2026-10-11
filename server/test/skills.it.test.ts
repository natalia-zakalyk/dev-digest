import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  retries: 3,
   redisUrl: x,`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

/**
 * L02 — skills: CRUD + versioning, workspace-scoped agent links, the import
 * preview (writes nothing), and prompt assembly (only linked AND globally
 * enabled skills reach the prompt, in link order).
 */
d('skills (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: EMPTY_REVIEW }) },
      },
    });
  }

  const skillBody = (name: string, body = `Rule from ${name}.`) => ({
    name,
    description: `Use when testing ${name}.`,
    type: 'rubric' as const,
    body,
  });

  it('seeds the Test Quality Reviewer with its skills linked', async () => {
    const app = await makeApp();
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();
    const tq = agents.find((a: { name: string }) => a.name === 'Test Quality Reviewer');
    expect(tq).toBeDefined();
    expect(tq.skills_count).toBe(3);
    await app.close();
  });

  it('CRUD: create v1, metadata edit keeps version, body edit bumps + snapshots', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: skillBody('crud') });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ version: 1, source: 'manual', enabled: true });

    const toggled = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } })
    ).json();
    expect(toggled).toMatchObject({ enabled: false, version: 1 });

    const edited = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'New rule.' } })
    ).json();
    expect(edited).toMatchObject({ body: 'New rule.', version: 2 });

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('persists change_note on create/update and returns it from /versions', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody('noted'), change_note: 'first cut' } })
    ).json();
    // metadata-only edit: no snapshot, note ignored
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false, change_note: 'ignored' } });
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'v2 body', change_note: 'tighten' } });
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'v3 body' } });
    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number; change_note: string | null }) => [v.version, v.change_note])).toEqual([
      [3, null],
      [2, 'tighten'],
      [1, 'first cut'],
    ]);
    const plain = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody('plain') })).json();
    const pv = (await app.inject({ method: 'GET', url: `/skills/${plain.id}/versions` })).json();
    expect(pv[0].change_note).toBeNull();
    await app.close();
  });

  it('GET /skills/summary returns one rollup per workspace skill', async () => {
    const app = await makeApp();
    const skill = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody('summ') })).json();
    const res = await app.inject({ method: 'GET', url: '/skills/summary' });
    expect(res.statusCode).toBe(200);
    const all = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const rows = res.json();
    expect(rows).toHaveLength(all.length);
    expect(rows.find((r: { skill_id: string }) => r.skill_id === skill.id)).toEqual({
      skill_id: skill.id,
      agents_count: 0,
      pull_frequency: null,
      accept_rate: null,
    });
    await app.close();
  });

  it('rejects invalid bodies with 422', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: '', type: 'nope', body: '' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('import preview parses a zip, lists ignored files and writes nothing', async () => {
    const app = await makeApp();
    const before = (await pg.handle.db.select().from(t.skills)).length;
    const zip = zipSync({
      'pkg/SKILL.md': strToU8('---\nname: imported\ndescription: Use when x.\n---\nBody.'),
      'pkg/scripts/run.sh': strToU8('echo pwned'),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'pkg.zip', content_base64: Buffer.from(zip).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'imported',
      body: 'Body.',
      ignored_files: ['pkg/scripts/run.sh'],
    });
    expect((await pg.handle.db.select().from(t.skills)).length).toBe(before);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.zip', content_base64: Buffer.from('nope').toString('base64') },
    });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });

  it('agent links reject skills from another workspace', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: otherWs!.id, name: 'f', description: '', type: 'custom', source: 'manual', body: 'x' })
      .returning();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Linker', provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
      })
    ).json();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [foreign!.id] },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('prompt gets linked + enabled skills in link order; a globally disabled one is left out', async () => {
    const app = await makeApp();
    const create = async (name: string) =>
      (await app.inject({ method: 'POST', url: '/skills', payload: skillBody(name) })).json();
    const first = await create('alpha-skill');
    const second = await create('beta-skill');
    const disabled = await create('gamma-skill');
    await app.inject({ method: 'PUT', url: `/skills/${disabled.id}`, payload: { enabled: false } });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled', provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
      })
    ).json();
    // Link order: beta, gamma (disabled), alpha.
    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [second.id, disabled.id, first.id] },
    });
    expect(linked.json().map((l: { skill_id: string }) => l.skill_id)).toEqual([
      second.id,
      disabled.id,
      first.id,
    ]);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().skills_count).toBe(3);

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-repo', fullName: 'acme/skills-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add retries',
        author: 'dev',
        branch: 'feat/retries',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  retries: 3,\n   redisUrl: x,',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    // The trace is written best-effort AFTER the run row flips to `done`, so poll for it.
    let trace;
    for (let i = 0; i < 200; i++) {
      const r = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (r.statusCode === 200 && r.json().prompt_assembly?.skills_used) {
        trace = r.json();
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const skills: string = trace.prompt_assembly.skills;
    expect(skills).toContain('### beta-skill');
    expect(skills).toContain('### alpha-skill');
    expect(skills).not.toContain('gamma-skill');
    expect(skills.indexOf('beta-skill')).toBeLessThan(skills.indexOf('alpha-skill'));
    expect(trace.prompt_assembly.user).toContain('## Skills / rules');
    expect(trace.prompt_assembly.skills_used.map((s: { name: string }) => s.name)).toEqual([
      'beta-skill',
      'alpha-skill',
    ]);
    expect(trace.prompt_assembly.skills_tokens).toBeGreaterThan(0);
    expect(trace.log.some((l: { msg: string }) => l.msg.startsWith('skills: 2 attached'))).toBe(true);

    // Stats read `trace.prompt_assembly.skills_used` — the run above must count as a pull.
    const stats = (await app.inject({ method: 'GET', url: `/skills/${first.id}/stats` })).json();
    expect(stats.pull_frequency).toBe(100);
    expect(stats.agents.map((a: { id: string }) => a.id)).toContain(agent.id);

    // The workspace-wide summary must agree with each skill's own /stats.
    const summary: { skill_id: string; agents_count: number; pull_frequency: number | null; accept_rate: number | null }[] =
      (await app.inject({ method: 'GET', url: '/skills/summary' })).json();
    for (const skill of [first, second, disabled]) {
      const s = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
      expect(summary.find((x) => x.skill_id === skill.id)).toEqual({
        skill_id: skill.id,
        agents_count: s.agents.length,
        pull_frequency: s.pull_frequency,
        accept_rate: s.accept_rate,
      });
    }
    await app.close();
  });
});
