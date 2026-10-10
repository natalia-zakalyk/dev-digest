# server — @devdigest/api

Fastify 5 API + Drizzle ORM 0.38 over Postgres (pgvector), port 3001. Package manager: **pnpm**.

## Read When
- [README.md](README.md) — first look at the package: API map, env vars, review-context overview.
- [docs/architecture.md](docs/architecture.md) — before touching boot (`app.ts`/`server.ts`), config, DI container, adapters/mocks, error handling, the DB layer, or adding a module.
- [specs/review-flow.md](specs/review-flow.md) — before changing anything in the review/run pipeline (`modules/reviews/`, run executor, RunBus/SSE) or its endpoints.
- [specs/run-cost-badge.md](specs/run-cost-badge.md) — before changing tokens/`cost_usd` on `agent_runs`, run traces or pricing.
- [specs/findings-severity.md](specs/findings-severity.md) — before changing PR-list severity rollups (`modules/pulls/status.ts`).
- [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md) — before touching indexing or the `repoIntel.*` facade.
- [../TESTING.md](../TESTING.md) — before writing or reorganising tests (unit vs `*.it.test.ts`).
- `onion-architecture` skill ([../.claude/skills/onion-architecture/SKILL.md](../.claude/skills/onion-architecture/SKILL.md)) — before adding/moving a route, service, repository, adapter or job handler: which ring, which imports are allowed.
- New feature without a spec in [specs/](specs/) → propose one first.

## Commands
- `pnpm dev` · `pnpm typecheck` · `pnpm test` (unit + integration)
- `pnpm lint:arch` — onion import rules (dependency-cruiser, `.dependency-cruiser.cjs`); only new violations fail, known ones are in `.dependency-cruiser-known-violations.json` (shrink it, never grow it)
- Unit only (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker): `pnpm exec vitest run .it.test`
- DB: `pnpm db:generate` (after schema change) → `pnpm db:migrate` → `pnpm db:seed` (idempotent)

## Where things live
- `src/modules/<name>/` — one Fastify plugin per feature (`routes.ts` + service); registered in `src/modules/index.ts`
- `src/adapters/` — ports (llm, github, git, astgrep, secrets…); test doubles in `src/adapters/mocks.ts`
- `src/platform/` — config, DI container · `src/db/` — schema, migrations, seed · `src/vendor/shared` — Zod contracts

## Conventions
- Route validation via Zod schemas (`fastify-type-provider-zod`); never `Schema.parse(req.body)` in handlers. Invalid → 422.
- New external dependency → new adapter behind DI + a mock in `mocks.ts`.
- Onion rings: Drizzle/`db/*` only in `repository.ts`/`*.repo.ts`; routes and services never import them; `helpers.ts`/`constants.ts` stay pure.
- Tests importing `test/helpers/pg.ts` **must** be named `*.it.test.ts`.
- Secrets only via `SecretsProvider`, never in `AppConfig`, DB or logs.

## Gotchas
- Migrations are not applied on boot.
- Unindexed repo → reviewer silently degrades to diff-only context.
- Prompt-injection defense is `INJECTION_GUARD` in reviewer-core — don't add keyword scanning.
- Grounding drops findings that cite lines not in the diff; score is recomputed, model score ignored.

## Do not touch
- `src/db/migrations/*` already applied — add a new migration instead.
- `clones/` — user's repo checkouts.

## Insights
@INSIGHTS.md
