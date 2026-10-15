# DevDigest — project-wide improvement plan (audit 2026-10-10)

## Context
Ask: analyse the whole project (not only the frontend) with the new `frontend-ui-architecture` skill plus the existing best-practice skills, and produce an improvement plan.

Five read-only audits ran in parallel. Each finding was verified in code with a file:line. Several were reproduced (regex, sliceDiff, wrapUntrusted).

| Area | Skills applied | Health |
|---|---|---|
| client architecture | frontend-ui-architecture, next-best-practices | typecheck ✓ |
| client React + tests | react-best-practices, react-testing-library, typescript-expert | 54/54 tests ✓ |
| server API + security | fastify-best-practices, security, zod | typecheck ✓, 107/107 hermetic ✓ (`*.it` not run: needs Docker) |
| server DB | drizzle-orm-patterns, postgresql-table-design | read-only review |
| reviewer-core, e2e, scripts, CI, docs | typescript-expert, zod, security | reviewer-core 24/24 ✓ |

**Overall:** a solid base. It already has strict TS, Zod at the edges, adapters with mocks, CI workflows, a pure reviewer-core and clean colocation. The gaps cluster in five places:
- **2 real security holes** in `POST /repos`;
- **no DB transactions or indexes** on the hot path;
- **live-run correctness bugs** (SSE + `onDone`);
- **reviewer-core diff/grounding bugs** that distort scores;
- **missing lint**, plus test gaps around the riskiest code.

The IDs below refer to the audit reports: FE-A = client architecture, FE-R/FE-T = React and tests, BE-F = server, DB = database, X = cross-cutting. Duplicates are merged.

## Constraints (from AGENTS.md)
- Never edit applied migrations. Every schema fix is a **new** migration (`pnpm db:generate` → `pnpm db:migrate`).
- A contract change goes into **both** `@devdigest/shared` copies. The server copy is canonical.
- Lock files change only via a package manager, and **only with user approval**. That applies to: `@testing-library/user-event`, eslint/biome.
- Tests stay offline and key-free. Each phase ends with `typecheck` + `test` in every touched module.
- Commits and pushes happen only on request.

---

## Phase 0 — Security & correctness hotfixes (S each, ~1 day total)

| # | ID | Fix | Files |
|---|---|---|---|
| 0.1 | BE-F1 🔒 High | **Path traversal → `rm -rf` of all clones.** `https://github.com/../workspace` parses as owner `..`. Anchor `GITHUB_URL_REGEX` with `^`, restrict owner/name to `[A-Za-z0-9_.-]+` excluding `.`/`..`. `clone()` asserts `resolve(dest)` stays inside `cloneDir`. | `server/src/modules/repos/constants.ts:19`, `adapters/git/simple-git.ts:57-64` |
| 0.2 | BE-F2 🔒 High | **Clone from any host** (`file://`, evil hosts) breaks the outbound allowlist. Rebuild `https://github.com/${owner}/${name}.git` the same way `refresh()` already does, and store only that. | `repos/service.ts:54,97` |
| 0.3 | BE-F3 🔒 | Listen on `127.0.0.1` by default, with an env override. There is no auth today. | `server/src/server.ts:29` |
| 0.4 | BE-F5/F6 | 5xx returns a generic message. 422 only for *request* validation; internal `ZodError` → 500. | `server/src/app.ts:136-163` |
| 0.5 | BE-F12 | `test-connection` tests the key **before** saving it, and calls `getContext`. | `settings/routes.ts:75-84` |
| 0.6 | BE-F16/F17 🔒 | Pino `redact` for auth headers, tokens and keys. Pass `rg` args as `['-e', pattern, '--', root]`. | `app.ts:50-59`, `adapters/codeindex/ripgrep.ts:60` |
| 0.7 | X-1 High | `sliceDiff` matches by substring, so `foo.ts` also pulls in `foo.tsx` and `sub/foo.ts`, giving duplicated findings and score. Match the `diff --git` header path exactly. | `reviewer-core/src/review/reduce.ts:63-64` |
| 0.8 | X-2/X-3/X-4/X-5 | Grounding hardening:<br>• bound `start_line`/`end_line` (`.int().positive()`, max span) and check range intersection instead of looping;<br>• ignore the LLM-supplied `kind` for the full-file exemption;<br>• escape `untrusted` tags case-insensitively;<br>• default `maxTokens`. | `reviewer-core/src/grounding.ts:16,41-70`, `prompt.ts:32`, `review/run.ts:179-186`, `server/src/vendor/shared/contracts/findings.ts:53-54` (+ client copy) |
| 0.9 | FE-R2/FE-R12 High | **Live-run loop:**<br>• `RunStatus` re-fires `onDone` on every parent render; fire only on the true→false transition and keep the callback in a ref;<br>• SSE `onerror` always closes, which kills reconnect; close only on `CLOSED` or a terminal event. | `client/src/app/repos/[repoId]/pulls/[number]/_components/RunStatus/RunStatus.tsx:23-26`, `client/src/lib/hooks/reviews.ts:200-204` |
| 0.10 | FE-R10 (=FE-A19) | Pass `running={liveRunIds.includes(traceRunId)}` to `RunTraceDrawer`. Today live runs never get the live log. | `pulls/[number]/page.tsx:174-181` |
| 0.11 | FE-R1 High | The FindingsPanel keydown handler fires on `g a` / Cmd+A / Ctrl+D. Ignore modifier keys and `defaultPrevented`, and reuse `isTextInput`. | `FindingsPanel/FindingsPanel.tsx:45-57`, `components/app-shell/helpers.ts:17` |

Each fix gets a regression test:
- `parseRepoUrl` with the 3 verified bad URLs (hermetic `inject()`);
- table tests for `sliceDiff`;
- the `onDone` once-only transition, against a fake `EventSource`.

## Phase 1 — Data integrity & DB (one new migration + repo-layer work)

| # | ID | Fix |
|---|---|---|
| 1.1 | DB-1, DB-7 | Add indexes:<br>• `reviews(pr_id, created_at desc)`<br>• `findings(review_id)`<br>• `agent_runs(pr_id, ran_at desc)` (optional partial `WHERE status='running'`)<br>• `pr_files(pr_id)`, `pr_commits(pr_id)` |
| 1.2 | DB-6, DB-10 | CHECK constraints on `agent_runs.status` (+ `NOT NULL DEFAULT 'running'`), `findings.severity`/`kind`, `pull_requests.status`. Unique indexes on nullable columns → `NULLS NOT DISTINCT` (`settings`, `symbols_*_uq`). |
| 1.3 | DB-2, DB-3, BE-F13 | Introduce `db.transaction` and let repo functions accept `tx`:<br>• the run-completion write (`reviews/run-executor.ts:228-264`);<br>• repo-intel replace ops (`repo-intel/repository.ts:244-382`);<br>• agent skills replace (`agents/repository.ts:228-235`);<br>• PR files/commits replace. |
| 1.4 | DB-8, BE-F13 | Extract a `PullsService.syncPulls()` with one multi-row upsert, shared by `pulls/routes.ts:47-75` and `polling/routes.ts:31-59`. GET handlers stop writing. |
| 1.5 | DB-4 | FKs `reviews.run_id → agent_runs ON DELETE CASCADE` and `reviews.agent_id → agents ON DELETE SET NULL`, after cleaning up orphans. Simplify `deleteAgentRun` (`run.repo.ts:83-89`). |
| 1.6 | DB-12, DB-13 | Agent version bump inside a transaction (`version = version + 1 RETURNING`). Pool `idle_timeout`/`connect_timeout`/`statement_timeout` via `AppConfig` (`db/client.ts:18`). |
| 1.7 | DB-14 | Add a `db:check` script (`drizzle-kit check`) and a CI step. Review generated SQL for `DROP`, since 0009/0010 lost `cost_usd` history. |
| 1.8 | DB-15 | `*.it.test.ts` for the run-delete cascade, PR-list rollups, the settings upsert and repo-intel replace. |
| later | DB-5, DB-9, DB-11 | `cost_usd` → `numeric(12,6)` (touches the contract and `specs/run-cost-badge.md`). Cursor pagination for PRs/runs/reviews (needs client changes). HNSW index when RAG lands. |

## Phase 2 — Server robustness

| # | ID | Fix |
|---|---|---|
| 2.1 | BE-F9 | RunBus/SSE lifecycle:<br>• 404 for unknown runs, or replay the stored trace and close;<br>• resolve the pending await on `req.raw` close;<br>• evict buffers some time after `complete`. |
| 2.2 | BE-F10 | Graceful shutdown: an `onClose` that ends SSE streams and waits for `jobs.onIdle()` with a deadline, plus a force-exit timeout. |
| 2.3 | BE-F7, BE-F8 | `RunRequest` moves into the route `schema.body`. Response schemas from `@devdigest/shared`, starting with `/runs/:id/trace`, `/pulls/:id`, `/repos`. |
| 2.4 | BE-F4 🔒 | Clone auth via `http.extraheader`/credential helper instead of the token in the URL; `remote set-url` afterwards; strip URLs from `jobs.error`. |
| 2.5 | BE-F11 🔒 | Filter `cancelRun`, `getRunTrace` and repo-intel `index-state`/`resync` by `workspaceId`. This prevents IDOR once auth exists. |
| 2.6 | BE-F15, BE-F18 | `setNotFoundHandler` + correct `code` for 4xx such as 429. The workspace module gets the Zod type provider and a test. |
| 2.7 | BE-F14 | Fix the dependency direction: `platform/`/`adapters/` must not import `modules/*`. Move shared repos/constants to `platform/` or `_shared/`. |
| 2.8 | BE-F19 | Hermetic `inject()` tests for repos/polling/workspace routes and the error handler. |

## Phase 3 — Client structure (frontend-ui-architecture) & quality

**3a. PR detail route decomposition** (FE-A1, A2, A9, A10, R16). Follow `.claude/skills/frontend-ui-architecture/references/examples.md` §3–4:
- `pulls/[number]/helpers.ts` (+ test): `resolvePrId`, `collectFindings`, `findRun`, `buildPrCrumb`;
- `use-pr-detail-params.ts` (`?tab`/`?trace`, with an `isPrDetailTab` guard, FE-A14);
- `useInvalidatePrRuns(prId)` / `queryOptions` factories in `lib/hooks/reviews.ts`;
- `_components/PrDetailSkeleton/`, `_components/PrDetailView/`;
- `FindingsTab` calls `useCancelRun` itself (no `UseMutationResult<any…>` prop);
- `RunHistory` split into `helpers.ts`, `styles.ts`, `index.ts` and a child component.

**3b. Smaller structure fixes.**
- **Constants:** `OPEN_STATUSES: ReadonlySet<PrStatus>` → `pulls/constants.ts`; `filterPulls`/`countOpen` → `pulls/helpers.ts` (FE-A4). Tighten `Record<string,…>` to `Record<PrStatus|Verdict,…>` (FE-A17).
- **Agent editor:** slim `agents/[id]/page.tsx` with `AGENT_TABS`, `AgentSidebar/`, `AgentEditorHeader/` (FE-A5). `<ConfigTab key={agent.id}>` instead of the reset effect (FE-R8).
- **Imports:** sweep to `@/` (≈45 imports), optionally adding a `@messages/*` alias (FE-A11). Import hooks from `lib/hooks/<domain>`, not the barrel; split `severity-counts` into PascalCase folders (FE-A12).
- **Exports and dead code:** named exports only (FE-A18). Delete the unused `mermaid-diagram` and `PrRowView` (FE-A16, FE-A20).
- **Small React fixes:** stable keys in the diff viewer (FE-R11), `FindingsPanel` state reset in handlers (FE-R9), memoised `repo-context` value (FE-R18).

**3c. Next.js conventions** (FE-A3 = FE-R13, FE-A15):
- `app/error.tsx` (Next 15 `reset`, not `retry`), `app/global-error.tsx`, `app/not-found.tsx`, plus a route-level error boundary for `pulls/[number]`;
- thin server `page.tsx` entries with per-route `metadata`, starting with `onboarding`, `/`, `pulls`, `agents/[id]`;
- settings: `notFound()` for an unknown `:section`.

**3d. Accessibility & UX** (FE-R3, R4, R5, R6, R17):
- clickable `div`s → `<button aria-expanded>`; navigation → `next/link` (PRRow, AgentCard);
- `RunHistory` delete becomes a real button;
- fix the nested button in `ReviewRunAccordion`;
- a shared `ConfirmDialog` (i18n) replaces `window.confirm` in 4 places;
- the reveal toggle and diff "+" become keyboard-reachable.

**3e. i18n** (FE-A6 = FE-R7): about 45 hardcoded strings, migrated one screen at a time. Order: PR detail (`prReview`), then `app/page.tsx`/onboarding, then agents. Use ICU plurals instead of `finding{s}`.

## Phase 4 — Contracts, tooling, tests, docs

| # | ID | Fix |
|---|---|---|
| 4.1 | X-6 = FE-A13 = BE-F20 | Re-sync `client/src/vendor/shared` from server: `openrouter` provider, `AgentManifest`, `AgentVersionConfig`, `CommitFilesPayload`, …. Then **remove the copy**: point the client tsconfig `paths` at `../server/src/vendor/shared`, the way reviewer-core does. Fallback: a CI `diff -rq` check. |
| 4.2 | X-14 | Lint in all 4 modules: typescript-eslint type-aware rules (`no-explicit-any`, `no-floating-promises`, `react-hooks`, `import/no-restricted-paths` for the frontend-ui-architecture import direction) or biome. Add a CI step and an e2e typecheck job. *(dependency change → ask first)* |
| 4.3 | FE-T1, FE-T2, FE-T3 | Add `@testing-library/user-event` *(ask first)* and migrate off `fireEvent`. Test `useRunEvents` against a fake `EventSource` instead of `vi.mock` of whole hook modules. Use `getByRole` queries. |
| 4.4 | FE-A7, FE-A8 | Unit tests for 8 untested `helpers.ts` (start with `pulls/helpers.ts`, `diff-viewer/helpers.ts` `parsePatch`, `comments.ts`). Then RTL tests for interactive components: FindingsTab, ReviewRunAccordion, AddRepoView, ConfigTab, InlineComposer, useGlobalShortcuts. |
| 4.5 | X-7, X-8 | reviewer-core tests: `sliceDiff`, `reduceReviews`, the map-reduce path, the OpenRouter repair loop with a stubbed client. Zod schema for the `/models` response, and include the last issues in the error. |
| 4.6 | X-9…X-13 | Scripts:<br>• `e2e.sh`: temp `HOME`, unset `*_API_KEY`, install `e2e/` deps, port preflight;<br>• `dev.sh`: `kill_tree` + port check;<br>• `pnpm install --frozen-lockfile` in both scripts. |
| 4.7 | X-15, X-16, X-19, X-20 | CI path filters include `reviewer-core/**` (+ `scripts/**` for e2e). Pin `agent-browser`. Zod `Flow` schema in `e2e/run.ts` with at least 1 step. Align the e2e tsconfig with the strict baseline. |
| 4.8 | X-17, X-18, X-20 | Docs:<br>• README manual steps + `reviewer-core npm ci`;<br>• remove the stale `skip-worktree` claim (TESTING.md + workflows);<br>• AGENTS.md stack → TS 5.9 / Zod 3.25;<br>• update `client/docs/ui-architecture.md` and `server/docs/*` after phases 1–3. |

---

## Suggested order & sizing
1. **Phase 0** (≈1 day): one PR per module (server, reviewer-core, client), each with regression tests.
2. **Phase 1.1–1.2** (one migration) + **1.3–1.4** (transactions, sync service): ≈2–3 days.
3. **Phase 4.1** (contract single-source) before any contract change in Phase 1 "later" or 2.3.
4. **Phase 3a + 3c** (PR detail route + error boundaries): ≈2 days. Then 3b/3d/3e incrementally.
5. **Phase 2** and the rest of **Phase 4** in parallel, as capacity allows. 4.2 (lint) early, so it guards later refactors.

## Deliverable for this request
Save this plan as `docs/research/reports/project-improvement-plan.md`, which the empty `reports/` folder is meant for. Add the full per-area audit tables as an appendix. No code changes until a phase is picked.

## Verification (per phase, when executed)
- `cd server && pnpm typecheck && pnpm test`. For DB phases, also `pnpm test:it` (Testcontainers) + `pnpm db:generate` and a review of the generated SQL.
- `cd client && pnpm typecheck && pnpm test`.
- `cd reviewer-core && npm run typecheck && npm test`.
- `./scripts/e2e.sh` for the client/route changes in Phase 3.
- Security fixes: hermetic `inject()` tests asserting 422 for `https://github.com/../workspace`, `https://evil.example/x/github.com/o/r` and `file:///tmp/github.com/o/r`.
- Live-run fixes: manual check through `./scripts/dev.sh`: start a review, watch the live log, toggle the network, confirm reconnect and that `onDone` fires once.
