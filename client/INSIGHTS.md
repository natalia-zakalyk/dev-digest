# Insights — client

Non-obvious learnings, written by the `engineering-insights` skill (see `.claude/skills/engineering-insights/`).
Format: `- YYYY-MM-DD — <what> → <what to do / why> (<file:line | commit>)`. Append-only.
This is a draft under human review: spot-check new lines; once a month prune stale entries and resolve
contradictions. Past ~200 entries, split into domain files (`INSIGHTS-<domain>.md`).
Versioned in git: the history shows how knowledge evolved; revert a bad wrap-up with git.
Imported into CLAUDE.md, so it is loaded every session here — signal over volume.

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-10-07 — Shared components in `src/components/*` take strings from the `common` namespace → feature tests that render them must pass `common` to `NextIntlClientProvider` alongside their own namespace, or next-intl throws on the missing key [supersedes the same entry without file:line] (client/src/components/run-cost-badge/RunCostBadge.tsx:23)
- 2026-10-07 — The PR list table card has `overflow: hidden` → popovers inside rows must render through a portal with fixed positioning or they get clipped [supersedes the same entry without file:line] (client/src/app/repos/[repoId]/pulls/styles.ts:90, client/src/components/severity-counts/FindingsPopover.tsx:89)
- 2026-10-10 — `@devdigest/ui` (vendor/ui) has no "use client" and its barrel pulls class components/hooks → any Server Component (page/layout/not-found, or a guard module they import) that imports the barrel 500s with 'Super expression must either be null or a function'; import pure modules directly (`@devdigest/ui/nav`) — guarded by src/app/server-entries.test.ts (client/src/app/settings/[section]/_components/SettingsView/constants.ts:4)
- 2026-10-10 — The root layout wraps children in <Suspense>, so `notFound()` in a server page streams the not-found UI with HTTP 200 (+noindex, NEXT_HTTP_ERROR_FALLBACK;404 marker), not a 404 status → assert on rendered content, not status, in e2e/tests (client/src/app/layout.tsx:29)

## Tool & Library Notes
- 2026-10-10 — nextjs.org/docs/* now serves Next 16.x (proxy.ts, "use cache", error.tsx `retry`) while client/ is on Next 15 → cite/check the pinned nextjs.org/docs/15/… pages before applying doc advice, or you'll suggest 16-only APIs (.claude/skills/frontend-architecture/SKILL.md:105)
- 2026-10-10 — nextjs.org/docs/* now serves Next 16.x (proxy.ts, "use cache", error.tsx `retry`) while client/ is on Next 15 → check the pinned nextjs.org/docs/15/… pages before applying doc advice, or you'll suggest 16-only APIs [supersedes the same entry pointing at frontend-architecture/SKILL.md:105 — skill renamed] (.claude/skills/frontend-ui-architecture/references/boundaries.md:52)

## Recurring Errors & Fixes
- 2026-10-11 — A VALUE import from `@devdigest/shared` (e.g. `SkillType.options`) 500s every Next route with "Can't resolve './contracts/findings.js'" while typecheck + vitest stay green — the vendored barrel's `.js` specifiers don't resolve under Next's bundler → client code uses `import type` only and copies values into a local constant; guarded by src/shared-type-imports.test.ts (client/src/app/skills/_components/SkillsListView/constants.ts:4)

## Session Notes

## Open Questions
