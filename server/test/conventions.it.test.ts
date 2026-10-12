import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ConventionsRepository } from '../src/modules/conventions/repository.js';
import type { VerifiedCandidate } from '../src/modules/conventions/domain/verify.js';

const d = (await dockerAvailable()) ? describe : describe.skip;

const item = (over: Partial<VerifiedCandidate> = {}): VerifiedCandidate => ({
  rule: 'Use async/await',
  category: 'async',
  evidencePath: 'src/a.ts',
  evidenceLineStart: 1,
  evidenceLineEnd: 2,
  evidenceSnippet: 'old',
  confidence: 0.8,
  ...over,
});

/** Conventions repository: a re-scan upserts evidence but keeps the user's decision. */
d('conventions repository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: ConventionsRepository;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'o', name: 'conv', fullName: 'o/conv' })
      .returning();
    repoId = r!.id;
    repo = new ConventionsRepository(pg.handle.db);
  });
  afterAll(async () => pg?.stop());

  it('upsert keeps status, refreshes evidence; update flips accepted', async () => {
    await repo.upsertCandidates(workspaceId, repoId, crypto.randomUUID(), [item()]);
    const [first] = await repo.listByRepo(workspaceId, repoId);
    expect(first?.status).toBe('pending');

    await repo.update(workspaceId, first!.id, { status: 'accepted' });
    await repo.upsertCandidates(workspaceId, repoId, crypto.randomUUID(), [item({ evidenceSnippet: 'new', confidence: 0.95 })]);

    const rows = await repo.listByRepo(workspaceId, repoId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'accepted', accepted: true, evidenceSnippet: 'new', confidence: 0.95 });
  });

  it('is workspace-scoped', async () => {
    const [row] = await repo.listByRepo(workspaceId, repoId);
    expect(await repo.getById(crypto.randomUUID(), row!.id)).toBeUndefined();
    expect(await repo.getRepo(crypto.randomUUID(), repoId)).toBeUndefined();
  });
});
