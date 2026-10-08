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

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes
- 2026-10-07 — Run Cost Badge: re-added `agent_runs.cost_usd` (migration 0010, after 0009 dropped it); partial cost on failed runs comes from reviewer-core `onUsage` [supersedes the same entry without file:line] (server/src/db/schema/runs.ts:22, server/src/modules/reviews/run-executor.ts:216)

## Open Questions
