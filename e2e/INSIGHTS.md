# Insights — e2e

Non-obvious learnings, written by the `engineering-insights` skill (see `.claude/skills/engineering-insights/`).
Format: `- YYYY-MM-DD — <what> → <what to do / why> (<file:line | commit>)`. Append-only.
This is a draft under human review: spot-check new lines; once a month prune stale entries and resolve
contradictions. Past ~200 entries, split into domain files (`INSIGHTS-<domain>.md`).
Versioned in git: the history shows how knowledge evolved; revert a bad wrap-up with git.
Imported into CLAUDE.md, so it is loaded every session here — signal over volume.

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-10-09 — The e2e stack is key-free only by convention: `scripts/e2e.sh` does not isolate secrets, and the API always reads the real `~/.devdigest/secrets.json` plus env keys → a new flow that clicks Run Review would make real, paid LLM calls with the developer's key; keep flows away from review runs or stub the provider first (server/src/platform/config.ts:74, scripts/e2e.sh:35)
- 2026-10-09 — Flows assert on UI copy: 04 waits for `2 findings` in the Review runs accordion header, and 01's `Pull Requests` also matches the nav label so it proves little → renaming UI text can break or silently weaken e2e; grep `e2e/specs` before changing copy and prefer URL waits (e2e/specs/04-pr-findings.flow.json:13, client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:97, client/messages/en/shell.json:18)

## Tool & Library Notes
- 2026-10-09 — `run.ts` adds no step types: each `cmd` goes straight to agent-browser, flow JSON is not schema-validated (a mistyped key is silently ignored), and the failure screenshot is taken only when a command throws, not when `assert.stdoutIncludes` fails → check new flows by making them fail once on purpose (e2e/run.ts:59, e2e/run.ts:73, e2e/run.ts:86)
- 2026-10-10 — agent-browser isn't installed globally on this machine → run scripts/e2e.sh with a PATH shim `exec npx -y agent-browser@0.39.0 "$@"` (version pinned in CI); never `pkill -f 'tsx src/server.ts'` while e2e runs — it kills the e2e API too (.github/workflows/e2e-web.yml:122)

## Recurring Errors & Fixes

## Session Notes

## Open Questions
