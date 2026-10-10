# Testing each ring

Read this when you write or restructure backend tests. Conventions (naming, hermetic vs Docker) come from [TESTING.md](../../../../TESTING.md). This file maps them onto the rings.

## Contents
1. Which test for which ring
2. Fakes over module mocks
3. Route tests through the composition root
4. Repository integration tests
5. Smells

## 1. Which test for which ring

| Ring | Test type | File | Needs |
|---|---|---|---|
| 1 · domain (`helpers.ts`, `domain/*`, reviewer-core) | Pure unit | `server/test/<topic>.test.ts`, `reviewer-core/test/*` | Nothing: plain inputs → outputs |
| 2 · service / executor | Unit with fakes of ports | `server/test/<topic>.test.ts` | In-memory fakes via constructor `Deps` or `ContainerOverrides` |
| 4 · routes | HTTP via `buildApp({ config, overrides })` + `app.inject()` | `server/test/<topic>.test.ts` | No port: `inject()` doesn't listen; postgres-js connects lazily |
| 3 · repository | Integration against real Postgres + pgvector | `server/test/<topic>.it.test.ts` | Testcontainers (`test/helpers/pg.ts`), self-skips without Docker |
| 3 · adapter | Contract test of the mapper with recorded payloads | `server/test/<adapter>.test.ts` | Fixture JSON; **no network** (tests stay key-free and offline) |

## 2. Fakes over module mocks

A **fake** has working, simplified behaviour (an in-memory repository backed by a `Map`). A **mock** only records calls (Fowler TestDouble). Ports make fakes cheap:

```ts
class InMemoryRepoStore implements RepoStore {
  private rows = new Map<string, Repo>();
  async list(ws: string) { return [...this.rows.values()].filter(r => r.workspaceId === ws); }
  async insert(r: NewRepo) { const repo = { ...r, id: randomUUID() }; this.rows.set(repo.id, repo); return repo; }
  // …
}
const svc = new RepoService({ repos: new InMemoryRepoStore(), github: async () => new MockGitHubClient([...]), jobs });
```

- Reuse the adapters in `src/adapters/mocks.ts` (`MockLLMProvider`, `MockGitHubClient`, …).
- `vi.mock('../src/modules/…')` by path couples the test to the file layout. Use it only for genuinely external modules, never to stub our own repositories (Vitest mocking guide: mock external access).
- reviewer-core tests use a stubbed `LLMProvider`. Note that grounding and structured-output unit tests live in the **server** suite (`reviewer-core/INSIGHTS.md`).

## 3. Route tests

```ts
const app = await buildApp({ config: testConfig, overrides: { github: new MockGitHubClient(...), llm: { openai: new MockLLMProvider(...) } } });
const res = await app.inject({ method: 'POST', url: '/repos', payload: { url: 'https://github.com/a/b' } });
expect(res.statusCode).toBe(201);
```

These test the HTTP adapter: schema → 422, error envelope, status codes. Business rules are tested one ring in.

## 4. Repository integration tests

`*.it.test.ts` files import `test/helpers/pg.ts`. They migrate and seed a throwaway pgvector container. Assert the mapping (domain types out, not rows), the tenancy filter (another workspace's rows are invisible) and transaction rollback.

## 5. Smells that mean the ring boundary is missing

- `(svc as unknown as { repo }).repo = {...}` → the service builds its own repository. Inject a port. (`test/repo-intel-facade-degraded.test.ts:33`, `test/repo-intel-resync.test.ts:51`)
- `{ … } as unknown as Container` → the service depends on the whole container. Give it a `Deps` object. (`test/indexer-pipeline.test.ts:137`)
- A business rule that can only be tested with Docker → the rule lives in a route or repository. Move it to a helper or service.
