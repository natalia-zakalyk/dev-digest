# Insights — server

Non-obvious learnings, written by the `engineering-insights` skill (see `.claude/skills/engineering-insights/`).
Format: `- YYYY-MM-DD — <what> → <what to do / why> (<file:line | commit>)`. Append-only.
This is a draft under human review: spot-check new lines; once a month prune stale entries and resolve
contradictions. Past ~200 entries, split into domain files (`INSIGHTS-<domain>.md`).
Versioned in git: the history shows how knowledge evolved; revert a bad wrap-up with git.
Imported into CLAUDE.md, so it is loaded every session here — signal over volume.

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-10-07 — `LOG_LEVEL` can arrive as an empty string from `.env` → config schema must accept it [supersedes the same entry without file:line] (server/src/platform/config.ts:33, e993f25)
- 2026-10-07 — Server boot needs `reviewer-core/node_modules` installed — it compiles reviewer-core source via path alias [supersedes the same entry without file:line] (scripts/dev.sh:78, e993f25)
- 2026-10-07 — `getRunTrace` returns the stored `run_traces` jsonb cast to `RunTrace` without parsing, and GET routes have no zod response schema → any new field on `RunStats`/`RunTrace` must be `.nullish()` (old traces lack it) and clients must handle `undefined` [supersedes the same entry without file:line] (server/src/modules/reviews/repository/run.repo.ts:187)
- 2026-10-07 — Seeded demo reviews have `agent_id` and `run_id` NULL → they never appear on the run timeline; PR-list FINDINGS skip them once the PR has any agent review [supersedes the same entry without file:line] — replaces both seeded-review lines (server/src/modules/pulls/status.ts:41)
- 2026-10-10 — SSE /runs/:id/events now ends a completed run with a terminal `event: done`; without it a clean end looks like a network blip and EventSource reconnects forever while the server replays the whole buffer → clients must close on `done` and dedupe by seq (server/src/modules/reviews/routes.ts:93)
- 2026-10-11 — 'Never edit applied migrations' does not cover `migrations/meta/_journal.json`: `pnpm db:generate` legitimately appends an entry to it (plus a new NNNN_snapshot.json) → a check for edited migrations must allow append-only journal changes and only flag edits to existing .sql/snapshot files or removed journal entries (.claude/skills/pr-self-review/scripts/run-checks.mjs:91)
- 2026-10-11 — The run executor flips `agent_runs` to `done` inside the persist transaction but writes `run_traces` AFTER it (best-effort) → `waitForPrRuns` can return before the trace exists; integration tests that read `/runs/:id/trace` must poll for it (flaked once under the full suite) (server/test/skills.it.test.ts:236)
- 2026-10-30 — dep-cruiser rules check direct import edges only, so importing the @devdigest/reviewer-core barrel from a domain/ file passes domain-is-pure while pulling in the openai SDK via the barrel's re-exports → import the specific file through the alias (@devdigest/reviewer-core/prompt) (server/src/modules/intent/domain/prompt.ts:2)
- 2026-10-30 — RunLogger.event() sends `data` to SSE, run_traces.log AND pino, so anything that must stay out of the browser stream and the persisted trace (prompt-assembly records) has to go through RunLogger.ops(), which writes to pino only → never put ops-only data in info/tool/result (server/src/platform/run-logger.ts:56, :64)
- 2026-10-30 — The prompt-log section-name union is declared three times (reviewer-core PromptSectionName, intent ClassifierSectionName, platform PromptLogSectionName) and only assignability at the call sites links them → when adding a prompt section update all three; a stale name in the log union is not caught (server/src/platform/prompt-log.ts:17)
- 2026-10-31 — A module barrel that re-exports a service (pulls/index.ts → PullsService → repository → drizzle) pulls the ORM into every consumer's import graph while lint:arch stays green, and no-cross-module-internals forbids deep imports (pulls/status.ts) → put a pure helper two modules need in modules/_shared/ (latest-review.ts), not in a barrel (server/src/modules/_shared/latest-review.ts:15, server/src/modules/smart-diff/service.ts:3)
- 2026-11-04 — repoIntel.getBlastRadius falls back to ripgrep over the clone not only when the index is missing/flag is off but also when changedFiles is empty, and it reports reason 'no_data' even for a flag-off/partial index → a caller that must stay index-only (modules/blast) has to read getIndexState itself and skip the facade for an unusable index or an empty file list (server/src/modules/repo-intel/service.ts:226, server/src/modules/blast/service.ts:29)
- 2026-11-05 — toBlastRadius no longer caps callers: repoIntel.getBlastRadius already slices the whole flat list at MAX_CALLERS_PER_SYMBOL, so the limit lives only in the facade (server/src/modules/blast/domain/map.ts:41, server/src/modules/repo-intel/service.ts:391)

## Tool & Library Notes
- 2026-10-12 — Fastify answers 400 to DELETE (or any body-less request) sent with Content-Type: application/json and an empty body → scripts/clients calling DELETE /skills/:id must omit the JSON content-type header (server/src/modules/skills/routes.ts:55)
- 2026-11-04 — ContainerOverrides has no reviewRepo slot and the container caches the repo instance, so a hermetic route test that needs PR data can vi.spyOn(app.container.reviewRepo, …) (plugins capture the same cached instance) and must pass auth: new MockAuthProvider() because LocalNoAuthProvider queries the DB; set REPO_INTEL_ENABLED explicitly so the test does not depend on .env (server/src/platform/container.ts:109, server/test/blast.test.ts)

## Recurring Errors & Fixes
- 2026-10-11 — Run-trace jsonb: `skills_used` lives at `trace->'prompt_assembly'->'skills_used'` (not the trace root) → a jsonb filter on the root silently matches nothing, so skill Stats showed 0 findings while runs had many; keep the IT assertion on /skills/:id/stats after a real run (server/src/modules/skills/repository.ts:161, server/test/skills.it.test.ts:299)
- 2026-10-12 — A skill's injection flag is derived on read from name+description+body (no column): linking, prompt assembly and the DTO must all call detectInjection, and a re-save of an agent's skill set must still allow already-linked flagged skills or reordering other skills 422s → keep the three enforcement points in sync (server/src/modules/agents/service.ts:190, server/src/modules/reviews/run-executor.ts:360, server/src/modules/skills/helpers.ts:35)
- 2026-10-30 — ITs build config with loadConfig(process.env), so an unmocked provider resolves through the developer's real ~/.devdigest/secrets.json and can hit a live API; once review_intent defaulted to openrouter, runs needed an openrouter mock → in every IT that triggers a review inject all providers a run can resolve plus MockSecretsProvider, with structuredBySchema fixtures (server/test/reviews.it.test.ts:132)
- 2026-10-31 — Rolling a PR's review back by hand (to re-run it) needs three things: delete its agent_runs (cascades reviews, findings, run_traces), delete its pr_intent row, AND null pull_requests.last_reviewed_sha — otherwise deriveReviewStatus still reads 'Reviewed' with no score or findings (server/src/modules/pulls/status.ts:44)

## Session Notes
- 2026-10-07 — Run Cost Badge: re-added `agent_runs.cost_usd` (migration 0010, after 0009 dropped it); partial cost on failed runs comes from reviewer-core `onUsage` [supersedes the same entry without file:line] (server/src/db/schema/runs.ts:22, server/src/modules/reviews/run-executor.ts:216)

## Open Questions
