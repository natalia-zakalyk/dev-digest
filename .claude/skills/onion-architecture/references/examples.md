# Examples from this repo

Read this when you want a concrete before/after. **Before** snippets are real code with `file:line`, as of 2026-10-10. **After** snippets are illustrative: they show the target shape, not an applied refactor. All the "before" cases are in the lint baseline.

## Contents
1. Drizzle in a route handler (`pulls`)
2. A pure helper typed by a Drizzle row (`repos`)
3. HTTP status in the domain (`repos`)
4. Service that builds its own repository → monkey-patched tests (`repo-intel`)
5. Good reference: `repos` routes → service → repository

## 1. Drizzle in a route handler

Before: `server/src/modules/pulls/routes.ts:27-60`:

```ts
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db.select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');
  let gh: GitHubClient | null = null;
  try { gh = await container.github(); } catch (err) { app.log.warn(…) }
  if (gh) { const pulls = await gh.listPullRequests(…); for (const pr of pulls) await container.db.insert(t.pullRequests)… }
```

Mixed into one handler: SQL (ring 3), the local-first sync policy (ring 2) and HTTP (ring 4). None of it is testable without Postgres.

After:

```ts
// routes.ts — ring 4
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.listForRepo(workspaceId, req.params.id);
});

// service.ts — ring 2: the policy, testable with InMemoryPullStore + MockGitHubClient
async listForRepo(ws: string, repoId: string): Promise<PrMeta[]> {
  const repo = await this.deps.repos.getById(ws, repoId);
  if (!repo) throw new NotFoundError('Repo not found');
  const gh = await this.deps.github().catch(() => null);        // offline → serve persisted
  if (gh) await this.deps.pulls.upsertMany(ws, repo.id, await gh.listPullRequests(repo));
  return this.deps.pulls.listForRepo(ws, repo.id);              // returns PrMeta, not rows
}

// repository.ts — ring 3: the only Drizzle
async upsertMany(ws: string, repoId: string, prs: PrMeta[]) { … onConflictDoUpdate … }
```

## 2. A pure helper typed by a Drizzle row

Before: `server/src/modules/repos/helpers.ts:2` and `:33`:

```ts
import * as t from '../../db/schema.js';
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo { … }
```

The file says "pure functions only — no DB", but the type import ties ring 1 to the schema.

After: the repository maps `RepoRow → Repo` (the contract is precise enough to be the domain type here). `toRepoDto` disappears, or takes a domain value. `helpers.ts` keeps `parseRepoUrl` and `withGitHubToken` and no longer imports `db/`.

## 3. HTTP status in the domain

Before: `server/src/modules/repos/helpers.ts:27`:

```ts
throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
```

After:

```ts
// platform/errors.ts
export class InvalidInputError extends AppError {
  constructor(code: string, message: string, details?: unknown) { super(code, message, 400, details); }
}
// helpers.ts
throw new InvalidInputError('invalid_repo_url', `Could not parse owner/repo from '${url}'`);
```

The status lives with the error class. The throw site states *what* went wrong, not *how HTTP shows it*.

## 4. Service builds its own repository

Before: `server/test/repo-intel-resync.test.ts:43-51`:

```ts
const container = { git: opts.git, db: {}, depgraph: {…}, tokenizer: {…} } as unknown as Container;
const service = new RepoIntelService(container);
(service as unknown as { repo: RepoIntelRepository }).repo = repo;
```

The test has to reach into a private field because `RepoIntelService` does `new RepoIntelRepository(container.db)` itself and takes the whole container.

After:

```ts
export interface RepoIntelDeps { store: RepoIntelStore; git: GitClient; depgraph: DepGraph; tokenizer: Tokenizer; enabled: boolean }
export class RepoIntelService implements RepoIntel { constructor(private deps: RepoIntelDeps) {} }

// test
const service = new RepoIntelService({ store: new InMemoryRepoIntelStore(state), git: new MockGitClient(), depgraph: fakeGraph, tokenizer: charTokenizer, enabled: true });
```

This also breaks the `repo-intel/service ↔ platform/container` cycle.

## 5. Good reference to copy: `repos`

- `server/src/modules/repos/routes.ts:20`: transport only, one service call per handler.
- `server/src/modules/repos/service.ts:33-38`: no SQL. Ports via the container (`git`, `secrets`, `jobs`). Clone runs as a job.
- `server/src/modules/repos/repository.ts`: the only file touching `repos`, every query workspace-scoped.

Remaining gaps vs the target: the service takes `Container` (§4), and the repository returns rows (§2).
