# Server architecture (`@devdigest/api`)

How the Fastify API boots, wires its dependencies and is organised. Every claim below
points at the file that implements it. For the API map and env-var table see
[../README.md](../README.md); for the review pipeline see
[../specs/review-flow.md](../specs/review-flow.md).

## 1. Boot sequence

`pnpm dev` runs `tsx watch src/server.ts`.

- `src/server.ts` — `loadConfig()` → `buildApp({ config })` → `app.listen({ port: config.apiPort,
  host: config.host })` — **loopback `127.0.0.1` by default** (the API has no auth; set
  `API_HOST=0.0.0.0` only inside a container). SIGTERM/SIGINT call `app.close()` once (guarded by a
  `closing` flag) with a 20 s force-exit backstop. Shutdown order: end open SSE streams
  (`runBus.shutdown()`) → `onClose` waits for in-flight jobs (`jobs.drain`, bounded) → close the
  postgres pool.
- `src/app.ts` `buildApp(opts)` — exported so tests can `app.inject()` without a port. Accepts
  optional `config`, `db` and `overrides` (DI mocks).

```mermaid
sequenceDiagram
  participant S as server.ts
  participant A as buildApp (app.ts)
  participant C as Container
  participant DB as Postgres
  S->>S: loadConfig() (zod-validated env)
  S->>A: buildApp({config})
  A->>DB: createDb(databaseUrl) (unless opts.db given)
  A->>A: Fastify({bodyLimit 1MB, pino logger})
  A->>A: set zod validator + serializer compilers
  A->>C: new Container(config, db, overrides); decorate('container')
  A->>DB: ReviewService.reapStaleRuns() — awaited, non-fatal
  A->>A: register helmet → cors → SSE → rate-limit (non-test)
  A->>A: GET /health, GET /health/ready
  A->>A: setErrorHandler (structured envelope)
  A->>A: register every plugin from modules/index.ts
  A->>A: onClose → handle.close() (only if app created the db)
  S->>A: listen(:3001)
```

Order in `src/app.ts`, and why it matters:

| Step | Lines | Notes |
|---|---|---|
| Fastify instance | `app.ts:46-60` | `bodyLimit: 1_048_576`; logger off when `logLevel === 'silent'`; `pino-pretty` only in `development`. |
| Zod compilers | `app.ts:64-65` | `validatorCompiler` / `serializerCompiler` from `fastify-type-provider-zod`. |
| DI container | `app.ts:67-68` | `app.container` is declared on `FastifyInstance` (`app.ts:22-26`). |
| Reap orphaned runs | `app.ts:80-85` | Every `agent_runs` row still `running` is set to `failed` (`reviews/repository/run.repo.ts:105` `reapStaleRunningRuns`). **Awaited before listening**, so no new run can be reaped by mistake. Assumes a single API instance per DB. Failure is logged as a warning, not fatal. |
| Plugins | `app.ts:89-97` | `@fastify/helmet`, `@fastify/cors` (`origin: [config.webOrigin]`, credentials), `fastify-sse-v2`, then `@fastify/rate-limit` global **120 req/min** — skipped when `nodeEnv === 'test'`. |
| Health | `app.ts:100-112` | `/health` → `{status:'ok'}`; `/health/ready` runs `select 1` → `{ready:true}` or **503** `{ready:false}`. Both `rateLimit: false`. |
| Error handler | `app.ts:116-164` | See §6. Registered before modules so encapsulated plugins inherit it. |
| Modules | `app.ts:168-170` | `for (const plugin of Object.values(modules)) await app.register(plugin)`. |

Per-route rate-limit overrides live on the routes: `POST /pulls/:id/review` 10/min
(`modules/reviews/routes.ts:29`), `POST /settings/test-connection` 20/min
(`modules/settings/routes.ts:72`); `GET /runs/:id/events` opts out (`rateLimit: false`).

## 2. Config — `src/platform/config.ts`

`loadConfig(env = process.env)` parses `EnvSchema` (zod) and returns `AppConfig`:

| Field | Source / default |
|---|---|
| `databaseUrl` | `DATABASE_URL`, default `postgres://devdigest:devdigest@localhost:5432/devdigest` |
| `apiPort` / `webPort` | `API_PORT` 3001 / `WEB_PORT` 3000 (coerced ints) |
| `host` | `API_HOST`, default `127.0.0.1` (bind address) |
| `webOrigin` | `http://localhost:${WEB_PORT}` (CORS) |
| `cloneDir` | `DEVDIGEST_CLONE_DIR` resolved to absolute, else `~/.devdigest/workspace` |
| `secretsPath` | always `~/.devdigest/secrets.json` |
| `nodeEnv` | `development` \| `test` \| `production` |
| `logLevel` | `LOG_LEVEL`; empty string → default (`silent` in test, else `info`) |
| `embeddingsEnabled` | `EMBEDDINGS_ENABLED === 'true'` (default **off**) |
| `repoIntelEnabled` | `REPO_INTEL_ENABLED !== 'false'` (default **on**) |

API keys are deliberately **not** in `AppConfig` (`config.ts:9-14`) — see §7.

## 3. DI container — `src/platform/container.ts`

One `Container` per app instance; services receive it and resolve ports from it.

- **Eager:** `config`, `db`, `secrets` (`LocalSecretsProvider`), `auth` (`LocalNoAuthProvider`),
  `jobs` (`JobRunner`, p-queue + `jobs` table, `platform/jobs.ts`), `runBus` (the module-level
  `runBus` singleton from `platform/sse.ts`).
- **Lazy getters (memoised):** `git` (`SimpleGitClient(cloneDir)`), `codeIndex`
  (`RipgrepCodeIndex`), `repoIntel` (`RepoIntelService`), `depgraph` (`DepCruiseGraph`),
  `tokenizer` (`TiktokenTokenizer`), `priceBook` (live OpenRouter prices + static
  `estimateCost` fallback), `agentsRepo`, `reviewRepo`.
- **Async, secret-backed:** `github()` needs `GITHUB_TOKEN`; `llm('openai'|'anthropic'|'openrouter')`
  builds a provider from its key and caches it; `embedder()` throws `ConfigError` unless
  `embeddingsEnabled` (so zero OpenAI calls by default). Missing key → `ConfigError` (HTTP 500,
  `config_error`).
- `invalidateSecretCaches()` drops cached LLM/GitHub/embedder clients after a key changes.
- `llmWithKey(provider, key)` / `githubWithToken(token)` build an **uncached** client from a
  candidate key — used by `POST /settings/test-connection`, which tests first and persists only on
  success.
- **`ContainerOverrides`** (`container.ts:40-54`) lets tests inject `secrets`, `auth`, `github`,
  `git`, `codeIndex`, `embedder`, `llm` (per provider), `repoIntel`, `depgraph`, `tokenizer`, `runBus`.
  An override always wins over construction.

## 4. Adapters (ports) and mocks

Port interfaces live in the shared package (`src/vendor/shared/adapters.ts`: `LLMProvider`,
`Embedder`, `GitHubClient`, `GitClient`, `CodeIndex`, `AuthProvider`, `SecretsProvider`). Real
implementations are in `src/adapters/*` (barrel: `src/adapters/index.ts`):

| Port | Real impl | Mock (`src/adapters/mocks.ts`) |
|---|---|---|
| `LLMProvider` | `llm/openai.ts`, `llm/anthropic.ts`; OpenRouter comes from `@devdigest/reviewer-core` | `MockLLMProvider` |
| `Embedder` | `embedder/openai.ts` | `MockEmbedder` |
| `GitHubClient` | `github/octokit.ts` | `MockGitHubClient` |
| `GitClient` | `git/simple-git.ts` (+ `git/diff-parser.ts`) | `MockGitClient` |
| `CodeIndex` | `codeindex/ripgrep.ts` (+ regex `extract.ts`) | `MockCodeIndex` |
| `AuthProvider` | `auth/local.ts` — always the seeded user `you@local` + workspace `default` | `MockAuthProvider` |
| `SecretsProvider` | `secrets/local.ts` | `MockSecretsProvider` |

Repo-intel-only adapters (interfaces declared next to the impl, overridable via the container):
`depgraph/index.ts` (dependency-cruiser), `tokenizer/index.ts` (js-tiktoken, falls back to
`chars/4`), `astgrep/index.ts` (tree-sitter symbol extraction). `llm/pricing.ts` is the static
cost table. Rule (AGENTS.md): a new external dependency = a new adapter behind DI + a mock.

## 5. Module-plugin pattern

```mermaid
flowchart LR
  IDX["modules/index.ts<br/>static registry"] --> R["modules/&lt;name&gt;/routes.ts<br/>default async plugin"]
  R -->|"getContext() → workspaceId"| CTX["modules/_shared/context.ts"]
  R --> SVC["service.ts<br/>business logic"]
  SVC --> REPO["repository.ts<br/>only layer touching Drizzle"]
  SVC --> CONT["app.container (ports)"]
  REPO --> DB[("db/schema")]
```

- `modules/index.ts` exports `modules: Record<string, FastifyPluginAsync>`: `settings, repos,
  pulls, polling, workspace, agents, reviews, repoIntel`. Static imports (no autoload) so the
  same code runs under tsx, the bundler and vitest. **Add a module** = new
  `modules/<name>/routes.ts` default export + one import + one entry.
- A routes file calls `appBase.withTypeProvider<ZodTypeProvider>()`, builds its service from
  `app.container`, and keeps handlers thin (e.g. `modules/repos/routes.ts`,
  `modules/reviews/routes.ts`). Job handlers are registered at plugin load
  (`repos/routes.ts:24` clone, `repo-intel/routes.ts:30` index/refresh/resync).
- Every handler scopes by tenant via `getContext(container, req)` → `{ workspaceId, userId }`.
- Repositories own SQL (`modules/reviews/repository.ts` composes `repository/{review,run,pull}.repo.ts`).
  Cross-module repositories (`agentsRepo`, `reviewRepo`) are exposed on the container instead of
  importing another module's folder.
- Not every module has all three layers: `workspace` and `settings` still query in the routes file /
  helpers directly. `pulls` has `service.ts` + `repository.ts`; `syncPulls()` (one multi-row upsert
  in a transaction) is shared by the pulls and polling routes.
- **Onion rings & enforcement.** The layering above is the onion: `helpers.ts`/`constants.ts`/`domain/*`
  (pure) ← `service.ts`/`*-executor.ts`/`ports.ts` ← `repository.ts`/`*.repo.ts`/`adapters/*` and
  `routes.ts`; `app.ts` + `platform/container.ts` are the composition root. `pnpm lint:arch`
  (dependency-cruiser, `server/.dependency-cruiser.cjs`) fails on new violations; the pre-existing ones
  (the modules above that query in routes, row types in helpers/services, the container cycles) are listed
  in `.dependency-cruiser-known-violations.json`. Rules and how to fix a violation:
  [onion-architecture skill](../../.claude/skills/onion-architecture/SKILL.md).

## 6. Schema-first validation and shared contracts

- Routes declare `schema: { params, body }` with zod; `IdParams = { id: uuid }`
  (`modules/_shared/schemas.ts`) turns bad ids into 422 instead of a DB 500.
- Error handler (`app.ts`) returns `{ error: { code, message, details? } }`
  (`ApiErrorBody` in `contracts/platform.ts`):
  - zod **request** validation (route schema) → **422** `validation_error`;
  - a `ZodError` from server-side data (DB rows, stored traces) → **500** `internal_error` — the
    client is not blamed for bad server data;
  - `AppError` → its `statusCode` and its own message (`platform/errors.ts`: `NotFoundError` 404,
    `ValidationError` 422, `ExternalServiceError` 502, `ConfigError` 500);
  - other 4xx get a matching code (e.g. 429 → `rate_limited`, malformed JSON → `bad_request`);
  - anything else → **500** with a generic message; the detail is only logged;
  - unknown routes → `setNotFoundHandler` → 404 `not_found` in the same envelope.
- `POST /pulls/:id/review` validates its tolerant body in the route schema
  (`RunRequest.nullish()` → `{}`), so an empty body is still accepted.
- Pino `redact` removes authorization headers, tokens and API keys from logs; `platform/redact.ts`
  strips credentials from stored job errors.
- **`@devdigest/shared` = `src/vendor/shared`** (barrel `index.ts`: `contracts/*` + `adapters.ts`).
  Resolved by tsconfig path alias, not a package: `server/tsconfig.json` and
  `reviewer-core/tsconfig.json` both point at **this** copy (canonical). `client/src/vendor/shared`
  is a separate copy that has already drifted — when changing a contract, update both.
- `@devdigest/reviewer-core` is likewise aliased to `../reviewer-core/src/index.ts`, so the server
  compiles reviewer-core source (needs `reviewer-core/node_modules` installed).

## 7. Secrets — `LocalSecretsProvider`

`src/adapters/secrets/local.ts`: reads `~/.devdigest/secrets.json` once (cached), falls back to
`process.env`; stored value wins over env. `GITHUB_TOKEN` falls back to `GITHUB_PAT`. `set()`
writes the file with mode `0600`. It is the only reader of key env vars; nothing secret goes into
`AppConfig`, the DB or logs. Keys entered in Settings are tested first (`test-connection`) and only
then go through `set()` + `container.invalidateSecretCaches()`. Git clones never embed the token in
the URL: `git/simple-git.ts` passes it as an `http.extraheader` scoped to `https://github.com/` and
resets `origin` on re-fetch. Repo URLs must match `^https://github.com/` / `git@github.com:`; the
clone URL is always rebuilt as `https://github.com/<owner>/<name>.git`, and clone paths must stay
inside `cloneDir`.

## 8. DB layer

- `src/db/client.ts` — `createDb(url, opts)` → Drizzle over `postgres-js`, plus `close()`. Pool
  defaults: `max` 10, idle 30 s, connect 10 s, `statement_timeout` 60 s. `DbExecutor` = the db or an
  open transaction: repositories accept it and expose `transaction(fn)`, so multi-step writes
  (run completion, PR files/commits, agent skills, repo-intel replaces, agent version bump) are
  atomic without services importing Drizzle.
- `src/db/schema.ts` — barrel over `src/db/schema/*` (`core, repos, pulls, reviews, skills,
  agents, knowledge, context, eval, ci, runs, ops, repo-intel`) and the `schema` object used for
  typing. It already contains **every** table later lessons use; most sit empty in the starter.
  Tenancy: domain tables carry `workspace_id`.
- Migrations: `drizzle.config.ts` → `src/db/migrations` (0000–0011; 0011 adds hot-path indexes,
  CHECKs on statuses/severity, FKs `reviews.run_id` (cascade) / `agent_id` (set null) and
  `NULLS NOT DISTINCT` uniques). `pnpm db:check` (drizzle-kit check) runs in CI. `pnpm db:generate` after a
  schema change, `pnpm db:migrate` (`src/db/migrate.ts`: `CREATE EXTENSION IF NOT EXISTS vector`,
  then drizzle `migrate`). **Not run on boot.** Never edit an applied migration.
- `pnpm db:seed` (`src/db/seed.ts`) — idempotent: workspace `default`, user `you@local` (required by
  `LocalNoAuthProvider`), demo repo/PR and built-in agents.

## 9. Repo-intel

`src/modules/repo-intel/` is both a module plugin (`GET /repos/:id/index-state`,
`POST /repos/:id/resync`) and a **facade** (`RepoIntel` interface in `types.ts`, implemented by
`service.ts`) exposed as `container.repoIntel`. Flow:

1. `repos` clone job finishes → enqueues `INDEX_JOB_KIND` (`repos/service.ts:60-77`).
2. `JobRunner` runs `runFullIndex` / incremental (`pipeline/{walk,full,incremental,rank,repo-map}.ts`)
   writing symbols, `file_edges`, `file_rank`, `repo_map_cache`.
3. On review, `run-executor.ts` only **reads**: `getCallerSignatures`, `getRepoMap`, `getFileRank`.

`REPO_INTEL_ENABLED=false` or an unindexed repo → the facade degrades to empty results and the
prompt is diff-only. Details: [../src/modules/repo-intel/README.md](../src/modules/repo-intel/README.md).
