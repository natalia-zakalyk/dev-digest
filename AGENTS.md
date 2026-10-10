# DevDigest

Local-first AI pull-request review (course starter). Overview & architecture: [README.md](README.md).
Testing strategy: [TESTING.md](TESTING.md). Agent prompts: [docs/agent-prompts/](docs/agent-prompts/README.md).

## Stack
Node ≥22 · TypeScript 5.9 · Zod 3.25 · Vitest 2.1 · Postgres 16 + pgvector (Docker only).
Server: Fastify 5 + Drizzle 0.38. Client: Next.js 15 (App Router) + React 19 + TanStack Query 5 + Tailwind 4.

## Map — each module has its own AGENTS.md (loaded when you work there)
| Folder | Package | Pkg manager | Port |
|---|---|---|---|
| `server/` | `@devdigest/api` — Fastify API + DB + repo-intel | pnpm | 3001 |
| `client/` | `@devdigest/web` — Next.js studio | pnpm | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core` — pure review engine | **npm** | — |
| `e2e/` | `@devdigest/e2e` — agent-browser flows | **npm** | — |
| `scripts/` | `dev.sh` (full local stack), `e2e.sh` (hermetic e2e) | | |
| `docs/` | cross-cutting docs (agent prompts, model choice) | | |

## Commands
- Whole stack from zero: `./scripts/dev.sh` (flags: `--no-seed` `--no-client` `--db-only`)
- Per module: `cd <module>` first — there is **no root package.json / workspace**.
- Before finishing any change: `typecheck` + `test` in every module you touched.

## Non-default conventions
- No monorepo workspace: packages share code via **tsconfig path aliases**, not published modules.
- Zod contracts in `@devdigest/shared` are the single source of request/response types.
- Lessons add features as new `server/src/modules/<name>/` plugins; DB schema already has every table.

## Naming conventions
- **Files & folders:** `kebab-case.ts` for modules/helpers (`format-cost.ts`, `run-executor.ts`,
  `diff-loader.ts`); server repositories `<entity>.repo.ts`. React components: `PascalCase/` folder
  with `PascalCase.tsx` + `index.ts` barrel (`FindingCard/FindingCard.tsx`); shared ones live in a
  `kebab-case/` folder under `client/src/components/` (`run-cost-badge/RunCostBadge.tsx`).
- **Next.js routes:** `page.tsx` / `layout.tsx`, params as `[repoId]`; route-private components in `_components/`.
- **Tests:** colocated `<Name>.test.tsx` (client) · `server/test/<topic>.test.ts` (hermetic) ·
  `<topic>.it.test.ts` (needs Postgres) · e2e flows `NN-name.flow.json`.
- **Code:** React components & Zod schemas `PascalCase` with a same-name type
  (`export const PrMeta = z.object(…)` + `export type PrMeta`); hooks `useXxx` in `client/src/lib/hooks/*`;
  functions/vars `camelCase`; constants `UPPER_SNAKE` (`STALE_DAYS`, `COLUMN_KEYS`).
- **Data:** DB tables/columns `snake_case` (`agent_runs.cost_usd`), Drizzle fields `camelCase` (`costUsd`);
  API/contract fields `snake_case` (`cost_usd`, `findings_count`).
- **i18n:** one namespace per feature file (`messages/en/prReview.json`), keys `camelCase`;
  shared-component strings in `common`.
- **Docs:** specs `<module>/specs/<feature-kebab>.md`, docs `<module>/docs/<topic-kebab>.md`.

## Gotchas
- `@devdigest/shared` exists in **two copies**: `server/src/vendor/shared` (canonical, also used by
  reviewer-core) and `client/src/vendor/shared`. They have already drifted — when changing a
  contract, update both and say so.
- Migrations do **not** run on boot: `cd server && pnpm db:migrate`.
- The only outbound calls allowed: GitHub + LLM providers. Tests must stay key-free and offline.

## Do not touch
- `server/src/db/migrations/*` — never edit applied migrations; generate a new one.
- Lock files — `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`, `reviewer-core/package-lock.json`,
  `e2e/package-lock.json`: never edit by hand; they change only via the package manager
  (`pnpm add/remove` / `npm install <pkg>`) when a dependency change was asked for.
- `server/clones/` — user's imported repo checkouts (git-ignored).
- `docker compose down -v` — wipes the dev DB volume with real data. Never run it.
- `.env`, `~/.devdigest/secrets.json` — never read out or commit secrets.

## Documentation loop (every module)
Each module has `README.md` · `docs/` (how it works) · `specs/` (what we build) · `INSIGHTS.md` (gotchas learned).
0. **Before answering any request** → read the `INSIGHTS.md` of the module(s) it concerns (root `INSIGHTS.md` is already loaded below) and treat it as high-confidence guidance unless told otherwise; follow the `engineering-insights` skill.
1. Before a feature → find its spec in `<module>/specs/`; if none, propose one first.
2. While working → read `<module>/docs/` / `README.md` instead of guessing architecture.
3. Capture insights with the `engineering-insights` skill as you go and check at the end of every
   session — do not skip the check. Re-read the file first; record only what is new and substantial,
   otherwise write nothing (cross-module → root `INSIGHTS.md`). `INSIGHTS*.md` are append-only: add lines
   only via `node .claude/skills/engineering-insights/scripts/append-insight.mjs`, never Write/Edit them.
4. After a task → update `docs/`/`README.md` if behaviour changed. Don't copy docs into AGENTS.md — link them.

## Insights
@INSIGHTS.md
