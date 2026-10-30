# Plan: four workflow subagents (test-writer, architecture-reviewer, plan-verifier, doc-writer)

Slug `workflow-review-agents` · 2026-10-23 · Modules: `.claude/agents/` only (dev tooling, no product code) · Complexity M · Status: draft
Prepared by the `planner` agent from three parallel external research reports and a repo survey. Nothing has been created yet. On approval this text is also saved to `docs/plans/workflow-review-agents.md` (the folder does not exist yet).

## Context
`.claude/agents/` has `planner`, `implementer`, `researcher` and a `README.md`. The README leaves architecture/security review to "separate agents". We add four agents that extend the planner → implementer flow, using existing project skills and the current structure (server onion rings, client layering, `TESTING.md`, per-module `docs/` + `specs/`).

## Conventions applied (from existing agents + docs)
- Frontmatter keys only: `name`, `description`, `model`, `tools`, `maxTurns`. No `skills:` (it injects full skill text; skills load on demand via `Skill`). Typos in keys are ignored silently.
- Body: `# Skills used` routing table + "Not used:", `# Role`, Inputs, Process, Hard constraints, Stop conditions, exact Output template. English only.
- No `Agent` tool anywhere (main session chains agents; plan path + prior reports are passed in the prompt because subagents start with fresh context).
- Read-only is enforced by tool allowlist; Bash limits are prompt-enforced (hook is a separate decision, D-hook).
- `INSIGHTS*.md` never written by agents; they only report "insight candidates".
- Name clash: roadmap feature "Plan Verifier" (README L06) ≠ the `plan-verifier` agent; its description says so.

## Steps

### S1 `.claude/agents/test-writer.md`
- sonnet · tools `Read, Grep, Glob, Edit, Write, Bash, Skill` · maxTurns 40.
- Description: writes/extends tests for client/, server/, reviewer-core/, e2e flows; runs them and quotes output; writes only test files; no production code, review or plan verification.
- Skills: client tests → `next-best-practices`, `react-testing-library`, `typescript-expert` (+ `frontend-ui-architecture` for where to mock: hook / `lib/api.ts` seam); server hermetic → `typescript-expert`, `onion-architecture`, `fastify-best-practices` (`buildApp()` + `inject`, `close()`); `*.it.test.ts` → + `drizzle-orm-patterns` (pattern: `test/helpers/pg.ts`); contracts → `zod`; hardening/URL tests → `security`; reviewer-core → `onion-architecture`, `typescript-expert` (stubbed `LLMProvider`); e2e flows → locators `--url/--text/find`, never `chat`; `engineering-insights` read-only. Also reads the product test-quality rubric (`docs/agent-prompts/test-quality-reviewer.md`, `docs/skills/{uncovered-branches,missing-corner-cases,over-mocking,flaky-tests}`) as self-check.
- Process: read module INSIGHTS + TESTING.md → lowest pyramid level that catches the regression → happy path + meaningful edges → RTL query priority (role first, testid last), no implementation-detail tests → async Server Components flagged "not unit-testable → e2e" → run per-module commands and quote output → one line per test naming the regression it catches.
- Hard constraints: write scope only `server/test/**`, `client/src/**/*.test.{ts,tsx}`, `reviewer-core/test/**`, `e2e/specs/*.flow.json`, new doubles appended to `server/src/adapters/mocks.ts` (reported); never edit production code (bugs → "Production bug found", failing test kept); never delete/skip/weaken tests; no retries to hide flakes; Postgres tests named `*.it.test.ts`; offline, key-free; no git/lock-file/migration/secret actions.
- Output: Test Report (Scope, Tests added table, Verification table, Not unit-testable, Production bugs found, Skills applied, Insight candidates).

### S2 `.claude/agents/architecture-reviewer.md` (read-only)
- opus · tools `Read, Grep, Glob, Bash, Skill` (NO Edit/Write; Bash only for `pnpm lint:arch`, `scripts/check-shared-drift.sh`, read-only git, rg) · maxTurns 30.
- Description: checks architecture boundaries of a diff/scope; findings tied to a named rule with file:line evidence; not security, not style, not plan verification.
- Skills: server/reviewer-core → `onion-architecture` (`references/enforcement.md`); client → `next-best-practices` (RSC boundary only) + `frontend-ui-architecture`; contracts → `zod`; `engineering-insights` read.
- Rule catalog in body (each rule has id, source, because): the 11 dependency-cruiser rules in `server/.dependency-cruiser.cjs` (domain-is-pure, domain-no-io-builtins, application-no-persistence, orm-only-in-repositories, routes-no-persistence, infrastructure-not-to-interface, adapters-not-to-modules, no-cross-module-internals, reviewer-core-stays-pure, reviewer-core-no-io-builtins, no-circular); server conventions (module plugin, route Zod via type provider, adapter behind DI + mock); client (`ui-layering` component→hook→`lib/api.ts`, thin page, `_components`, barrels, next-intl, `'use client'` placement, no `@devdigest/ui` barrel in Server Components, `import type` only from `@devdigest/shared`); `shared-drift`.
- Process: read INSIGHTS → scope from git diff → deterministic checks first (lint:arch, drift), report only NEW violations, label baseline `pre-existing` → judgement only for untooled catalog rules → one finding per issue, no linter-catchable/nitpick/input-dependent maybes → runtime/holistic concerns go to "Not statically checkable".
- Finding schema: `A<n> · rule-id · severity error|warn|info · new|pre-existing` with Where (`path:line` → imported path), Rule (verbatim + source), Evidence (quoted code / tool line), Because, Fix direction (no patch), Confidence. No catalog rule ⇒ not a finding (max 3 "Observations").
- Output: verdict pass | pass-with-warnings | fail; Checks run; Findings; Pre-existing; Not statically checkable; Observations; Insight candidates.

### S3 `.claude/agents/plan-verifier.md` (read-only)
- opus · tools `Read, Grep, Glob, Bash, Skill` (NO Edit/Write) · maxTurns 40.
- Description states: dev-workflow agent, NOT the product "Plan Verifier" (L06); checks working tree against EVERY item of an approved `docs/plans/<slug>.md` plus spec acceptance criteria; no generic advice.
- Skills: `engineering-insights` read; a plan-named skill only to judge an item whose "done when" cites that skill's rule. Everything else out of scope by design.
- Process: extract items (steps S<n> + "done when", verification commands, contract/migration lines, spec acceptance criteria R<n>, user requirements U<n>) → all start `missing` → deterministic evidence first (read/grep, typecheck, tests, lint:arch) → "file exists"/"tests pass" alone is not `met` → test-integrity check from git diff (removed/edited/skipped tests) → reverse trace: changed files not covered by any item → un-runnable checks are `unknown`.
- Row: `ID | verbatim item | met|partial|missing|unknown | evidence (file:line / test / command+line) | gap | deterministic|judgement | confidence`. Implementer/test-writer reports are claims, not evidence.
- Output: Verdict verified | not verified | inconclusive; Traceability table; Test integrity; Untraced changes; Commands run; Unknowns.
- Note: the 4-value verdict scale is our own synthesis (no authoritative source).

### S4 `.claude/agents/doc-writer.md`
- sonnet · tools `Read, Grep, Glob, Edit, Write, Skill` (no Bash) · maxTurns 30.
- Description: documents implemented features / turns plan or materials into docs with Mermaid diagrams; verifies every claim against code; knows destinations; no code, plans, INSIGHTS, AGENTS.md, product seed content.
- Skills: `mermaid-diagram` (any diagram), `onion-architecture` (server/reviewer-core docs), `frontend-ui-architecture` (client docs), `zod` (contracts), `engineering-insights` read.
- Destination map (pick Diátaxis type first; prefer updating existing section): feature behaviour/acceptance → `<module>/specs/<feature-kebab>.md` (header `Status: … · cross-link`, see `server/specs/run-cost-badge.md`); how a module works → `server/docs/architecture.md`, `client/docs/ui-architecture.md`, `reviewer-core/docs/pipeline.md`, `e2e/docs/runner.md`, or new `<module>/docs/<topic-kebab>.md`; commands/env/route map → `<module>/README.md`; product overview + architecture diagram → root `README.md`; test strategy → `TESTING.md`; cross-module/tooling spec → `docs/specs/`; real choice recorded in plan → "Decision" section in spec; sub-component → e.g. `server/src/modules/repo-intel/README.md`.
- Off limits: `docs/skills/**`, `docs/agent-prompts/**`, `docs/research/**`, `docs/plans/**`, `INSIGHTS*.md`, `AGENTS.md`/`CLAUDE.md` (propose "Read When" link lines in report instead), code, `.claude/**`.
- Process: read plan/reports/code → choose type+destination → check each claim, record `path:line` → contradictions go to report (doc describes the code) → small diagrams, one C4 level / one flow each, GitHub-renderable → link, don't copy.
- Output: Doc Report (Files written, Claims verified, Contradictions, Proposed links, Insight candidates).

### S5 update `.claude/agents/README.md`
Add four rows to Overview/Artifacts tables; replace the "review is left to separate agents" lines; add Mermaid `flowchart LR` workflow: researcher → planner → (user approves) → implementer → test-writer → architecture-reviewer ∥ plan-verifier → doc-writer (verifier after test-writer so new tests count as evidence); extend Permissions (write scopes, read-only agents, no-Bash doc-writer; keep hook note → D-hook); add "Sources behind the rules" per agent and a "not backed by official guidance" list (verdict scale, client rule ids, destination map, agent order).

### S6 sync check (no edits)
Confirm `planner.md` routing table and `pr-self-review/skill-map.json` need no change (no new skills/globs).

## Verification
1. `claude --debug` / `/agents`: four agents listed; grep `tools:` — reviewers have no Edit/Write, no agent has `Agent`, only the five allowed keys.
2. Delegation prompts ("write tests for X", "check boundaries of my diff", "did we finish plan Y") route to the intended agent.
3. Dry runs, then `git status` to confirm only allowed paths changed: test-writer on a small util (e.g. `client/src/lib/format-cost.ts`); architecture-reviewer on a throwaway `routes.ts → src/db` import (expect `routes-no-persistence` with path:line); plan-verifier on a plan with one undone item (expect `missing` + untraced change); doc-writer on implemented run-cost-badge (every claim cites path:line).
4. Optional: `node --test .claude/skills/pr-self-review/scripts/pr-self-review.test.mjs` (skill-map unchanged).

## Open questions (all non-blocking, defaults given)
1. test-writer may append new doubles to `server/src/adapters/mocks.ts`? Default yes, reported.
2. doc-writer edits AGENTS.md "Read When" links? Default no, only proposes.
3. ADR location: default "Decision" section in spec (alternative `docs/adr/NNNN-*.md`, MADR).
4. D-hook (separate decision): PreToolUse hook enforcing test-writer/doc-writer path scopes and blocking write-like Bash for the two read-only agents; verify first whether hook input identifies the subagent and whether frontmatter `hooks:` works for subagents here.
5. opus for both reviewers costs more; fallback sonnet if dry runs show equal precision.
6. Client architecture findings are judgement-only (no client lint:arch), capped at medium confidence.
7. Optional follow-up: mention the new agents in planner "Left to other agents" and implementer "Handoff".

## Sources
Subagents/prompting: code.claude.com/docs/en/sub-agents · code.claude.com/docs/en/best-practices · anthropic.com/engineering/{multi-agent-research-system, effective-context-engineering-for-ai-agents, building-effective-agents, writing-tools-for-agents}
Reviewer/verifier: github.com/sverweij/dependency-cruiser doc/rules-reference.md · archunit.org/userguide/html/000_Index.html · O'Reilly *Building Evolutionary Architectures* ch.2 · github.com/anthropics/claude-code plugins/code-review/commands/code-review.md · anthropic.com/engineering/{effective-harnesses-for-long-running-agents, demystifying-evals-for-ai-agents} · arxiv.org/abs/2306.05685
Tests: testing-library.com/docs/queries/about/#priority · kentcdodds.com/blog/testing-implementation-details · nextjs.org/docs/app/guides/testing/vitest (cite pinned /docs/15/) · fastify.dev/docs/latest/Guides/Testing/ · martinfowler.com/articles/practical-test-pyramid.html
Docs: diataxis.fr · writethedocs.org/guide/docs-as-code/ · docs.github.com (creating diagrams) · c4model.com · adr.github.io/madr/
Gaps: no source for Drizzle/Postgres test setup (use repo's `test/helpers/pg.ts`), no source for failing-first as an agent rule, met/partial/missing scale is our own synthesis.
Repo: `.claude/agents/*`, `.claude/skills/README.md`, `skill-map.json`, `server/.dependency-cruiser.cjs`, `TESTING.md`, module AGENTS.md / INSIGHTS.md.
