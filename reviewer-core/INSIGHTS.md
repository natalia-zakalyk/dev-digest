# Insights — reviewer-core

Non-obvious learnings, written by the `engineering-insights` skill (see `.claude/skills/engineering-insights/`).
Format: `- YYYY-MM-DD — <what> → <what to do / why> (<file:line | commit>)`. Append-only.
This is a draft under human review: spot-check new lines; once a month prune stale entries and resolve
contradictions. Past ~200 entries, split into domain files (`INSIGHTS-<domain>.md`).
Versioned in git: the history shows how knowledge evolved; revert a bad wrap-up with git.
Imported into CLAUDE.md, so it is loaded every session here — signal over volume.

## What Works

## What Doesn't Work
- 2026-10-09 — The review LLM call sends no `max_tokens`, so output is unbounded: General Reviewer on an 87-file single-pass diff produced 101,638 output tokens in 1057 s, and another run sat `running` 20+ min with 0 tokens despite the 90 s SDK timeout (+2 SDK retries, +2 repair retries) → don't rely on `timeoutMs` to bound a run; for big diffs use map-reduce or pass `maxTokens` (reviewer-core/src/review/run.ts:179, reviewer-core/src/llm/openrouter.ts:54)

## Codebase Patterns
- 2026-10-09 — The engine recomputes only `score` from grounded findings; `verdict` and `summary` are passed through from the model → never treat `verdict` as deterministic (the timeline colours runs by `blockers`/`findings_count` for that reason) (reviewer-core/src/review/run.ts:214)
- 2026-10-09 — Direct unit tests for `groundFindings` and `parseWithRepair` live in the server suite (via the `platform/grounding.ts` re-export shim), not in reviewer-core → after changing grounding or structured output run `cd server && pnpm test` too; reviewer-core's own `npm test` won't catch it (server/test/grounding.test.ts:3, server/src/platform/grounding.ts:6)

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
