# Development Plan: Smart Diff (role-grouped Files tab + findings in the diff)
Slug: smart-diff · Date: 2026-10-31 · Modules: server, client · Spec: MISSING (S0 writes `server/specs/smart-diff.md` + `client/specs/smart-diff.md`) · Complexity: M
Status: implemented (revised after review, 2026-10-31: see "Deviations from the original plan")

All steps after S0 are **provisional** until the user approves the two specs.

## Goal and non-goals

**Goal.**
1. The "Files changed" tab groups PR files by role in a fixed order: **core, tests, wiring, docs, boilerplate**. Each group header shows a role label, a short description and "N files". The docs and boilerplate groups start collapsed. A "Smart order | Original order" toggle switches back to GitHub order.
2. Review findings show up inside the diff:
   - Group header: a red dot and the number of **files** in that group that have findings (2 files with 5 findings show "● 2"). It sits right before "N files".
   - File card header: a dot without a number next to the path. It looks different from the existing GitHub comment count, which uses a message icon.
   - Under the code line: the Agent-runs `FindingCard` (severity, title, rationale, suggestion, Accept/Dismiss). The line gets a coloured left bar and a right-aligned label: CRITICAL→`blocker`, WARNING→`warning`, SUGGESTION→`suggestion`.
3. A new server route `GET /pulls/:id/smart-diff` classifies and groups the files and attaches finding lines. The client reads it through a hook. The classifier `classifyFile(path)` is a pure function you can import without HTTP, because L08 reuses it as a prompt filter.

**Non-goals.**
- No change to the Agent runs tab, `FindingsPanel`, `FindingCard` behaviour, or the PR-list FINDINGS rollup.
- No LLM call. `pseudocode_summary` stays unset, and there is no real split proposal: `split_suggestion` is the minimal stub described in S5. The `largeTitle`/`largeBody` banner stays unrendered.
- No DB schema change and no migration.
- No new dependency (no picomatch/minimatch), so no lock-file change in this PR.
- ~~No refactor of the existing hard-coded English strings in `DiffTab.tsx`.~~ Reversed after the self-review flagged them (i18n warning): they now live under `prReview.diffTab` (see Deviations).

## What already exists vs. what is missing (verified in code)

| Area | Exists | Missing (this plan) |
|---|---|---|
| Contract | `SmartDiffRole = z.enum(['core','wiring','boilerplate'])` at `server/src/vendor/shared/contracts/brief.ts:127`. `SmartDiffFile{path,pseudocode_summary?,additions,deletions,finding_lines[]}` at `:130`, `SmartDiffGroup` at `:139`, `SmartDiff{groups,split_suggestion}` at `:151`. `SmartDiffResponse = SmartDiff` at `review-api.ts:84`. Client copy `client/src/vendor/shared/contracts/brief.ts:127` is identical for this block | 5-value role enum and `finding_ids[]` on `SmartDiffFile`, in **both copies** |
| Contract consumers | `server/test/contracts.test.ts:107` parses a 1-group SmartDiff. `client/src/lib/types.ts:35` re-exports the `SmartDiff` type. **No other consumer of `SmartDiffRole`.** The repo-intel hits are comments only (`repo-intel/service.ts:422`, `repository.ts:466`, `types.ts:7`), and so are `modules/index.ts:24` and `server/README.md:10` | update the fixture; re-export `SmartDiffRole`/`SmartDiffResponse` types |
| Route | **None.** Nothing is registered for `/pulls/:id/smart-diff` (`modules/index.ts:27-39`; grep for `smart-diff` in routes finds nothing) | new `smart-diff` module |
| Data | `container.reviewRepo` port (`platform/container.ts:109`) provides `getPull(ws, prId)` (workspace-scoped, `reviews/repository.ts:39`), `getPrFiles(prId)` (`:47`) and `reviewsForPull(prId)` (newest first, with findings, `:72`). `GET /pulls/:id` serves files from the same `pr_files` table (`pulls/routes.ts:193`) | nothing; no new SQL |
| "Which findings count" rule | `latestReviewPerAgent(rows)` in `server/src/modules/pulls/status.ts:40`, specified in `server/specs/findings-severity.md:15-23` (`kind='review'`; latest review per agent; agent-less seeded reviews only while no agent review exists) | made public via `pulls/index.ts` and reused |
| Validation / errors | `IdParams = {id: uuid}` at `modules/_shared/schemas.ts:11`. Zod validator and serializer are registered (`app.ts:130-131`), and validation failures return 422 (`app.ts:190`). `NotFoundError` maps to 404. Response-schema precedent: `repos/routes.ts:29,37` | — |
| Client hooks | `usePrReviews`, `prReviewsOptions` key `["reviews", prId]` at `client/src/lib/hooks/reviews.ts:45-76`. `useFindingAction` at `:184` and `useRunReview` at `:169` invalidate `["reviews", prId]`. `runSettled` at `:90` also invalidates it | `usePrSmartDiff` in a new `lib/hooks/smart-diff.ts` |
| Client API | `api.get<T>(path)` (`client/src/lib/api.ts:65`). Hooks call it directly (pattern at `hooks/reviews.ts:48`) | **no new api.ts method needed** |
| Diff viewer | `DiffViewer` (`components/diff-viewer/DiffViewer/DiffViewer.tsx:14`), `FileCard` (collapse via `AUTO_EXPAND_MAX_LINES=200` at `constants.ts:4`, comment count with `Icon.MessageSquare` at `FileCard.tsx:72`), `CodeLine`, `parsePatch`, `keysForLine` / `partitionThreads` / `lineKey` (`comments.ts:34,63,89`). Shared strings live in the `shell` namespace `diffViewer.*` (`messages/en/shell.json:35`). Also used by `src/test/smoke.test.tsx` | `findings` and `defaultCollapsed` props, a generic key partition, line bar and label, the file dot, an unanchored-findings list |
| FindingCard | Route-private: `app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:26`, props `f, defaultExpanded, onAction, pending, repoFullName, headSha` | reused **as is** through injection (no copy, no move) |
| Severity tokens | `SEV` in `client/src/vendor/ui/primitives/tokens.ts:6` (`c`, `bg`, `icon`, `label`; CRITICAL/WARNING/SUGGESTION/INFO). `SeverityBadge` at `primitives/Badge.tsx:52` | line bar and label use `SEV[sev].c` |
| DiffTab | `DiffTab({prId, filesCount, files, canComment})` (`DiffTab.tsx:18`), mounted in `PrDetailView.tsx:77-79` | smart/original modes, groups, findings wiring; new props `repoFullName`, `headSha` |
| i18n | `prReview.smartDiff` has `coreLabel, wiringLabel, boilerplateLabel, largeTitle, largeBody, filesCount, findingLines, groupedByRole` (`messages/en/prReview.json:65-74`) | `testsLabel, docsLabel`, five role descriptions, toggle labels, "files with findings" aria text; `shell.diffViewer` line labels and fallback-list title |
| Glob library | **None** in `server/package.json` (grep for picomatch/minimatch/micromatch/fast-glob/globby finds nothing) | small in-house matcher (S3) |

## Constraints applied
- Read `server/INSIGHTS.md` and `client/INSIGHTS.md`. Root `INSIGHTS.md` is already loaded. These entries apply:
  - GET routes without a response schema return unparsed data, so new fields must be handled as optional. This plan adds a zod `response` schema instead (`server/INSIGHTS.md:17`).
  - dep-cruiser checks only direct import edges. A domain file must not import a module barrel that pulls in services or SDKs, so `domain/` imports nothing outside the module (`server/INSIGHTS.md:22`).
  - ITs must inject every LLM provider plus `MockSecretsProvider`, even though this route never calls an LLM, because `buildApp` resolves real secrets otherwise (`server/INSIGHTS.md:32`).
  - Shared components need the `common` namespace (here `shell`, which is what diff-viewer uses) in test providers (`client/INSIGHTS.md:15`).
  - Client code uses `import type` only from `@devdigest/shared`. Role values (order, colours, collapsed set) are copied into local constants typed with `SmartDiffRole`. `src/shared-type-imports.test.ts` guards this (`client/INSIGHTS.md:25`).
  - Next 15, not 16, docs (`client/INSIGHTS.md:22`).
- No workspace. Commands run per module, with `pnpm` for server and client (root `AGENTS.md` Map).
- `@devdigest/shared` has two copies. The contract change edits **both** `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`, and they stay identical; `verify.sh --checks drift` checks that (root `AGENTS.md` Gotchas).
- No DB change, so no migration. Never edit `server/src/db/migrations/*` (root `AGENTS.md` Do not touch).
- Lock files stay untouched because no dependency is added (root `AGENTS.md` Do not touch). The demo PR in "How to verify" changes a lock file on purpose, in a throwaway branch, only through `pnpm add`.
- No outbound calls. The route reads only the DB. Tests are offline and need no keys (root `AGENTS.md` Gotchas; `TESTING.md:94`).
- Onion rings (`onion-architecture`; `server/.dependency-cruiser.cjs:12-18,92-101`):
  - The classifier and grouping live in `modules/smart-diff/domain/*` and `constants.ts`, which are pure and enforced by `domain-is-pure`.
  - `service.ts` depends on a `ports.ts` interface, never on Drizzle or row types.
  - Another module is reached only through the container port `reviewRepo` and the public `pulls/index.ts`.
- Route validation uses the zod `schema`. Invalid input returns 422, an unknown PR returns 404 via `NotFoundError` (`server/AGENTS.md` Conventions; `onion-architecture` principle 8).
- Client layering is component → `lib/hooks/*` → `lib/api.ts`. Shared `components/` never import route `_components/`, so FindingCard is **injected**, not imported (`frontend-ui-architecture` principle 2).
- Strings go through next-intl only. Feature strings live in `prReview`, shared diff-viewer strings in `shell` (`client/AGENTS.md` Conventions; `shell.json:35`).
- React rules (`react-best-practices`):
  - Keys come from finding `id` and file `path`.
  - No nested ternaries. Mode switching uses early returns or separate components.
  - Derived counts are computed during render, not stored in state.
  - `count > 0 &&`, never `count &&`.
- Naming (root `AGENTS.md` Naming): `kebab-case.ts` modules, `PascalCase/` component folders with `index.ts`, `UPPER_SNAKE` constants, snake_case contract fields (`finding_ids`).

## Skills for implementer
| Skill | Why | Steps |
|---|---|---|
| `engineering-insights` | step 0: read `server/INSIGHTS.md` and `client/INSIGHTS.md` (read-only) | all |
| `zod` | extend the enum and add `finding_ids`, kept identical in both copies; response schema | S1 |
| `typescript-expert` | rule-spec types, port types that `ReviewRepository` satisfies structurally, `ReadonlySet<SmartDiffRole>` constants | S1–S12 |
| `onion-architecture` | new module rings, port plus composition, cross-module reuse through `index.ts`, `pnpm lint:arch` | S3–S6 |
| `fastify-best-practices` | GET route with params and response schema, plugin registration, `inject` tests | S6, S7 |
| `drizzle-orm-patterns` | only to confirm **no** new queries are needed (`reviewRepo` is reused); no repository file is written | S5 (check only) |
| `security` | workspace scoping (IDOR) on the new route; findings are LLM output rendered through the existing `Markdown` | S5, S6, S10 |
| `frontend-ui-architecture` | where the hook, helpers, constants, `RoleGroup`/`OrderToggle`/`DiffFinding` and the diff-viewer extension go; injection instead of a shared→route import | S8–S11 |
| `react-best-practices` | stable keys, no derived state, no nested ternaries, component injection | S9–S11 |
| `next-best-practices` | `"use client"` on new interactive components, no RSC boundary change, Next 15 APIs only | S9–S11 |
| `react-testing-library` | DiffViewer and DiffTab flow tests (role and text queries, `userEvent`) | S12 |

`postgresql-table-design` is not needed because there is no schema change.

## Steps

0. **S0 · docs/spec**
   - Files: `server/specs/smart-diff.md` (new), `client/specs/smart-diff.md` (new).
   - Change: write the behavioural specs from the decisions in this plan.
     - Server spec: classifier rules and order with the edge-case table, route contract, the "which findings count" rule (latest review per agent, `kind='review'`, dismissed excluded), `finding_lines` / `finding_ids`, empty groups omitted, `split_suggestion` stub, 404/422.
     - Client spec: modes, group header anatomy, collapse defaults, counter semantics (files, not findings), file dot, line bar and label mapping, the unanchored fallback list, invalidation, the loading and error fallback.
     - Both specs end with acceptance criteria equal to the P1 list in "How to verify".
   - Depends on: — · Skills: `engineering-insights`.
   - Done when: the user marks both specs approved.

1. **S1 · server + client shared (contract)**
   - Files: `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts`, `server/test/contracts.test.ts`, `client/src/lib/types.ts`.
   - Change:
     - Set `SmartDiffRole = z.enum(['core','tests','wiring','docs','boilerplate'])`. Enum order equals display order and is documented in a comment.
     - Add `finding_ids: z.array(z.string())` to `SmartDiffFile`. The server picks which findings count, and the client joins ids to `FindingRecord`s from `usePrReviews`, so the counting rule exists only on the server.
     - Make byte-identical edits in both copies.
     - Update the contracts test fixture (add `finding_ids`) and add one assertion that `'tests'` and `'docs'` parse.
     - Add `SmartDiffRole` and `SmartDiffResponse` to the type re-exports in `client/src/lib/types.ts`.
   - Depends on: S0 · Skills: `zod`, `typescript-expert`.
   - Done when: the drift check passes, the two files diff identically, and `contracts.test.ts` is green.

2. **S2 · server (test first: classifier table)**
   - Files: `server/test/smart-diff-classify.test.ts` (new).
   - Change: write an `it.each` table of `path → role` **before** S3. It fails until S3 lands. Cases:

     | Path | Role | Why it's in the table |
     |---|---|---|
     | `__tests__/__snapshots__/x.snap` | boilerplate | order: boilerplate beats tests |
     | `.claude/skills/security/SKILL.md` | wiring | order: wiring beats docs |
     | `e2e/README.md` | tests | order: tests beats docs (decision pinned) |
     | `pnpm-lock.yaml`, `client/pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `Cargo.lock` | boilerplate | lock files |
     | `package.json`, `server/package.json` | wiring | decision: a manifest wires deps and scripts, and is reviewable and hand-written |
     | `client/dist/app.js`, `build/out.js` | boilerplate | `dist`/`build` as a whole path segment |
     | `src/distance.ts`, `src/rebuild.ts`, `src/dist-utils/a.ts` | core | substring is not a dir |
     | `x.generated.ts`, `vendor/lib.min.js` | boilerplate | |
     | `a.test.ts`, `A.test.tsx`, `server/test/x.it.test.ts`, `src/a.spec.ts`, `src/__tests__/a.ts`, `server/test/helpers/pg.ts`, `tests/fixtures/data.json`, `e2e/flows/01-login.flow.json` | tests | |
     | `src/index.ts`, `src/index.js` | wiring | barrels |
     | `src/components/Foo/index.tsx` | core | decision: `.tsx` index holds JSX, so it's real code |
     | `vitest.config.ts`, `next.config.mjs`, `tsconfig.json`, `tsconfig.build.json`, `.eslintrc.cjs`, `.env`, `.env.example`, `docker-compose.yml`, `docker-compose.dev.yaml`, `.github/workflows/ci.yml` | wiring | |
     | `docs/plans/x.md`, `README.md`, `readme.MD`, `CHANGELOG.md`, `LICENSE`, `server/docs/a.md` | docs | |
     | `server/src/modules/reviews/service.ts`, `client/src/app/page.tsx` | core | |
     | `server\\src\\a.test.ts` (windows), `/src/a.ts`, `./src/a.ts` | tests / core / core | normalization |

   - Depends on: S1 · Skills: `typescript-expert`.
   - Done when: the file exists, runs in the hermetic lane, and fails only because `classifyFile` is missing.

3. **S3 · server (classifier, pure)**
   - Files: `server/src/modules/smart-diff/constants.ts`, `server/src/modules/smart-diff/domain/classify.ts` (new).
   - Change:
     - `constants.ts`:
       - `ROLE_DISPLAY_ORDER` = core, tests, wiring, docs, boilerplate.
       - `CLASSIFY_ORDER` = boilerplate, tests, wiring, docs (core is the fallback).
       - `ROLE_RULES: Readonly<Record<Exclude<SmartDiffRole,'core'>, readonly PathRule[]>>`. The rules are typed specs, not glob strings: `{kind:'basename', names}`, `{kind:'suffix', values}`, `{kind:'segment', names}` (any directory segment equals one of the names), `{kind:'basenamePrefix', values}`, `{kind:'basenameInfix', values}` (e.g. `.config.`, `.generated.`), `{kind:'topDir', names}` (`.github`, `.claude`).
       - This avoids a glob dependency and regex built from strings (no ReDoS), and each rule reads like the spec list.
     - `domain/classify.ts`:
       - `normalizePath(p)`: `\` → `/`, strip leading `./` and `/`, lowercase for matching only.
       - `matchesRule(norm, rule)`.
       - `classifyFile(path): SmartDiffRole`: the first role in `CLASSIFY_ORDER` with a matching rule wins, otherwise `'core'`.
     - Only `@devdigest/shared` type imports.
   - Depends on: S2 · Skills: `onion-architecture`, `typescript-expert`.
   - Done when: the S2 table is green and `pnpm lint:arch` reports no new violation.

4. **S4 · server (public surface for reuse)**
   - Files: `server/src/modules/pulls/index.ts`, `server/src/modules/smart-diff/index.ts` (new).
   - Change:
     - ~~Add `export { latestReviewPerAgent } from './status.js'` to `pulls/index.ts`.~~ Replaced: `latestReviewPerAgent` and `ReviewRow` moved to `server/src/modules/_shared/latest-review.ts` (pure, no ORM); `pulls/status.ts` re-exports them and `pulls/index.ts` is unchanged. The pulls barrel would have pulled `PullsService` and Drizzle into smart-diff (architecture-reviewer observation).
     - ~~`smart-diff/index.ts` exports `classifyFile`, `normalizePath` and `createSmartDiffService`.~~ Trimmed to `classifyFile` and `normalizePath`; the service factory stays in `compose.ts`, registered through `routes.ts`.
   - Depends on: S3 · Skills: `onion-architecture`.
   - Done when: `lint:arch` is clean (no `no-cross-module-internals`, no cycle).

5. **S5 · server (grouping domain + service + port)**
   - Files: `server/src/modules/smart-diff/domain/build.ts`, `ports.ts`, `service.ts`, `compose.ts` (all new); `server/test/smart-diff.test.ts` (new).
   - Change:
     - `ports.ts` declares narrow domain types that `ReviewRepository` satisfies **structurally**, so the service never imports `db/rows`:
       - `SmartDiffSource { getPull(ws, prId): Promise<{id:string}|undefined>; getPrFiles(prId): Promise<{path;additions;deletions}[]>; reviewsForPull(prId): Promise<{review:{id;prId;agentId;kind}; findings:{id;file;startLine;dismissedAt:Date|null}[]}[]> }`
     - `domain/build.ts`: `buildSmartDiff(files, findings)`, pure.
       - Classify each file and group in `ROLE_DISPLAY_ORDER`. **Omit empty groups.**
       - Keep files in GitHub order (input order) inside a group.
       - Per file: `finding_lines` = sorted, deduplicated `start_line`s of its findings, and `finding_ids` in the same order (by line, then id).
       - Ignore findings whose `file` is not among the PR files.
       - `split_suggestion = {too_big:false, total_lines: Σ(additions+deletions), proposed_splits:[]}`.
       - `pseudocode_summary` is left out.
     - `service.ts`, `SmartDiffService.get(workspaceId, prId)`:
       - `getPull` returns nothing → `NotFoundError('Pull request not found')`.
       - Load files and reviews in parallel.
       - Keep `kind==='review'`, then apply `latestReviewPerAgent` (from `../_shared/latest-review.js`) to the newest-first reviews.
       - Collect their findings, **drop `dismissedAt != null`**, then call `buildSmartDiff`.
     - `compose.ts`: `createSmartDiffService(c)` = `new SmartDiffService({ source: c.reviewRepo })`.
     - Tests in the hermetic lane, with an in-memory fake `SmartDiffSource`:
       - Fixed group order, empty groups omitted, dedupe and sort of lines.
       - 2 files with 5 findings give 2 files with non-empty `finding_ids`.
       - A rerun of the same agent replaces its old findings; two agents add up.
       - Agent-less review ignored once an agent review exists; `summary` reviews ignored; dismissed excluded; accepted kept.
       - Finding on an unknown file ignored; `total_lines` sum; unknown PR throws `NotFoundError`.
   - Depends on: S4 · Skills: `onion-architecture`, `typescript-expert`, `security` (the workspace scope comes from `getPull(ws, …)`), `drizzle-orm-patterns` (confirm no query is needed).
   - Done when: the unit tests are green and `lint:arch` is clean.

6. **S6 · server (route + registration + docs)**
   - Files: `server/src/modules/smart-diff/routes.ts` (new), `server/src/modules/index.ts`, `server/README.md` (API map).
   - Change:
     - `GET /pulls/:id/smart-diff` with `schema: { params: IdParams, response: { 200: SmartDiffResponse } }`.
     - The handler is `getContext` → `service.get(workspaceId, id)`, nothing else.
     - Register `smartDiff` in `modules`.
     - Add one README line for the route.
   - Depends on: S5 · Skills: `fastify-best-practices`, `onion-architecture`, `security`.
   - Done when: `pnpm typecheck` and `lint:arch` pass and the route appears in `server/README.md`.

7. **S7 · server (route tests)**
   - Files: `server/test/smart-diff.test.ts` (extend), `server/test/smart-diff.it.test.ts` (new).
   - Change:
     - Hermetic: `buildApp({config})` + `inject GET /pulls/not-a-uuid/smart-diff` → 422 (validation runs before the handler, same as `routes-smoke.test.ts:57`).
     - IT (Testcontainers):
       - Seed a repo, a PR and `pr_files` (lock, core, test, barrel, README), then insert two `reviews` (two agents) and `findings` directly. No review run and no LLM call.
       - `buildApp` gets `MockSecretsProvider` and mock `openai`/`anthropic`/`openrouter` per `server/INSIGHTS.md:32`.
       - Assert 200, that the body parses with `SmartDiffResponse`, the group order, the lock file in boilerplate, `finding_ids`, and that a dismissed finding is excluded.
       - A random uuid → 404. A PR from another workspace → 404.
   - Depends on: S6 · Skills: `fastify-best-practices`, `typescript-expert`.
   - Done when: `./scripts/verify.sh --module server` is green with Docker.

8. **S8 · client (data hook)**
   - Files: `client/src/lib/hooks/smart-diff.ts` (new).
   - Change:
     - `prSmartDiffOptions(prId)` = `queryOptions({ queryKey: ["reviews", prId, "smart-diff"] as const, queryFn: () => api.get<SmartDiffResponse>(\`/pulls/${prId}/smart-diff\`) })` and `usePrSmartDiff(prId)` with `enabled: !!prId`.
     - The key is **nested under `["reviews", prId]`** on purpose. TanStack prefix invalidation then refreshes dots and cards after `useRunReview`, `useFindingAction`, `runSettled`, `useDeleteRun` and `useDeleteReview` with no edits to `hooks/reviews.ts`.
     - Document the nesting in a comment.
   - Depends on: S1, S6 · Skills: `frontend-ui-architecture`, `typescript-expert`, `security`.
   - Done when: typecheck passes and the S12 test proves that invalidating `prReviewsOptions(prId).queryKey` refetches smart-diff.

9. **S9 · client (diff-viewer: findings support, generic)**
   - Files: `client/src/components/diff-viewer/comments.ts`, `findings.ts` (new), `constants.ts`, `styles.ts`, `index.ts`, `DiffViewer/DiffViewer.tsx`, `FileCard/FileCard.tsx`, `CodeLine/CodeLine.tsx`, `UnanchoredFindings/` (new: `UnanchoredFindings.tsx`, `index.ts`), `client/messages/en/shell.json`.
   - Change:
     - `comments.ts`: extract a generic `partitionByLineKey<T>(items, keyOf, renderedKeys)`. `partitionThreads` becomes a thin wrapper, its behaviour and the existing `comments.test.ts` unchanged. This is the requested reuse.
     - `findings.ts` (pure):
       - `findingLineKey(f) = lineKey("RIGHT", f.start_line)`.
       - `topSeverity(list)` (CRITICAL > WARNING > SUGGESTION; INFO and unknown get no bar).
       - `export interface DiffFindingApi { byPath: ReadonlyMap<string, FindingRecord[]>; renderFinding: (f: FindingRecord) => React.ReactNode }`.
       - `renderFinding` must return a real component element (`<DiffFinding …/>`), never an inline JSX tree.
     - `constants.ts`: `SEVERITY_LINE_LABEL = { CRITICAL: "blocker", WARNING: "warning", SUGGESTION: "suggestion" } as const`. These are i18n keys under `shell.diffViewer.severityLine.*`.
     - `DiffViewer`: new optional props `findings?: DiffFindingApi` and `defaultCollapsed?: boolean`, passed through to `FileCard`.
     - `FileCard`:
       - The initial `open` is `!defaultCollapsed && lines <= AUTO_EXPAND_MAX_LINES`.
       - Partition this file's findings with `keysForLine` + `partitionByLineKey`.
       - When the file has findings, show the header dot (`aria-label`/`title` = `t("diffViewer.hasFindings")`, colour `var(--crit)`, no number) right after the path. It must not look like the `MessageSquare` comment count.
       - Render `UnanchoredFindings` (findings whose line isn't rendered) at the end of the body, **always visible** and not tied to `showComments`. This is the fallback so findings never vanish.
     - `CodeLine`: new optional props `findings?: FindingRecord[]` and `renderFinding?`. When the list is non-empty:
       - Add a left bar (`boxShadow inset 3px 0 0 SEV[top].c` or a border-left).
       - Add a right-aligned label `t(\`diffViewer.severityLine.${SEVERITY_LINE_LABEL[top]}\`)` in `SEV[top].c`.
       - Render each finding under the line, keyed by `f.id`, sorted by severity, before the comment threads.
     - `shell.json`: `diffViewer.severityLine.{blocker,warning,suggestion}`, `diffViewer.hasFindings`, `diffViewer.unanchoredFindings` ("Findings outside the shown lines").
     - The barrel exports `DiffFindingApi`.
     - Diff-viewer must not import anything from `app/**`.
   - Depends on: S1 · Skills: `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`.
   - Done when: typecheck passes, the existing `comments.test.ts`, `helpers.test.ts` and `smoke.test.tsx` are green, and the S12 viewer tests pass.

10. **S10 · client (DiffTab: smart mode)**
    - Files under `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/`:
      - `DiffTab.tsx`, `constants.ts` (new), `helpers.ts` (new), `helpers.test.ts` (new)
      - `_components/RoleGroup/` (new: `RoleGroup.tsx`, `index.ts`, `styles.ts`)
      - `_components/OrderToggle/` (new: `OrderToggle.tsx`, `index.ts`)
      - `_components/DiffFinding/` (new: `DiffFinding.tsx`, `index.ts`)
    - Other files: `PrDetailView/PrDetailView.tsx` (pass `repoFullName`, `headSha`), `client/messages/en/prReview.json`.
    - Change:
      - `constants.ts`, local values typed with `SmartDiffRole` and no shared value import:
        - `ROLE_LABEL_KEY`, `ROLE_DESCRIPTION_KEY`.
        - `ROLE_COLOR` (existing `var(--…)` tokens only).
        - `COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs","boilerplate"])`.
        - `DIFF_ORDERS = ["smart","original"] as const`.
      - `helpers.ts` (pure):
        - `groupPrFiles(prFiles, smartDiff)` joins by path to `PrFile`, since the patch lives only on `PrFile`, and keeps the server group order. Files missing from the response go to `core`, the server default.
        - `findingsByPath(smartDiff, reviews)` maps `finding_ids` → `FindingRecord` from `usePrReviews`.
        - `filesWithFindings(group)` counts **files**, not findings.
      - `DiffTab.tsx` (container):
        - `usePrSmartDiff`, `usePrReviews`, `useState<"smart"|"original">("smart")`, the existing comments wiring.
        - While smart-diff is loading or errored, it renders the current `DiffViewer` in original order without findings (graceful fallback).
        - Each mode is rendered by an early return, no nested ternary.
        - `findings` is passed in **both** modes.
      - `RoleGroup`:
        - A `<button aria-expanded>` header with a chevron, the role colour square, the label and the description.
        - `{count > 0 && <span aria-label=…>● {count}</span>}` right before `t("smartDiff.filesCount")`.
        - The body is `<DiffViewer files defaultCollapsed={COLLAPSED_ROLES.has(role)} …/>`.
      - `OrderToggle`: two `Button`s with `aria-pressed`, labels "Smart order" / "Original order".
      - `DiffFinding`: `useFindingAction()` + `FindingCard f={finding} defaultExpanded repoFullName headSha onAction={(a)=>mutate({findingId:f.id, action:a, prId})} pending={isPending}`.
      - `prReview.json` `smartDiff`:
        - Labels: `testsLabel`, `docsLabel`.
        - Descriptions: `coreDescription` ("The substance of the change — review closely"), `testsDescription`, `wiringDescription`, `docsDescription`, `boilerplateDescription`.
        - Toggle: `orderSmart`, `orderOriginal`, `orderLabel`.
        - `filesWithFindings` ("{count, plural, one {# file} other {# files}} with findings", the aria text for the dot).
    - Depends on: S8, S9 · Skills: `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`.
    - Done when: typecheck passes, the Agent runs tab and its tests are unchanged and green, and the manual demo P1 items hold.

11. **S11 · client (docs)**
    - Files: `client/specs/pages.md` (Files changed row and `usePrSmartDiff` in Data), `client/docs/ui-architecture.md` (query-key note about `["reviews", prId, "smart-diff"]`; the section is **unverified**, find the query-keys part).
    - Depends on: S10 · Skills: `frontend-ui-architecture`.
    - Done when: the docs describe the new behaviour and link `client/specs/smart-diff.md`.

12. **S12 · client (tests)**
    - Files:
      - `components/diff-viewer/comments.test.ts` (extend)
      - `components/diff-viewer/DiffViewer/DiffViewer.test.tsx` (new)
      - `DiffTab/helpers.test.ts`
      - `DiffTab/DiffTab.test.tsx` (new)
    - Change:
      - `comments.test.ts`: `partitionByLineKey` with findings keyed `RIGHT:${start_line}` against `keysForLine`; a deleted-line-only key does not match; an unanchored finding lands in the fallback; `topSeverity`.
      - `DiffViewer.test.tsx` (provider with `shell` + `common`):
        - The file dot shows for a file with findings and is distinct from the comment count.
        - The finding renders under the right line with the label "blocker".
        - An unanchored finding appears in the fallback list.
        - `defaultCollapsed` gives `aria-expanded="false"`.
      - `helpers.test.ts`: join and fallback to core; 2 files with 5 findings → 2; id → record mapping.
      - `DiffTab.test.tsx`: mock at the API boundary, following the existing PR-detail tests (FindingsTab/PrDetailView pattern; **unverified** whether they mock `api` or hooks). One flow:
        - Groups in core → tests → wiring → docs → boilerplate order, with labels and counts.
        - Docs and boilerplate files collapsed, and the lock file shown under Boilerplate.
        - Counter "● 2" on core.
        - Expanding a core file shows the finding card; Accept calls `/findings/:id/accept`.
        - Switching to "Original order" removes the group headers and shows GitHub order.
      - A second test: invalidating `["reviews", prId]` refetches smart-diff.
    - Depends on: S9, S10 · Skills: `react-testing-library`, `typescript-expert`.
    - Done when: `./scripts/verify.sh --module client` is green.

## Contract / migration impact
- Shared copies to sync: **both**, `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`. They are identical today for the SmartDiff block and stay identical. `review-api.ts` needs no change because `SmartDiffResponse = SmartDiff` follows automatically.
- New migration: **no**. Only `pr_files`, `reviews` and `findings` are read, through the existing `reviewRepo`.
- Lock files: **no change**.

## Tests and verification
- Fast gate (hermetic, no Docker): `./scripts/verify.sh --module server --module client --hermetic`. This runs typecheck, tests, lint (`lint:arch`) and drift.
- Full gate (needs Docker for `*.it.test.ts`): `./scripts/verify.sh --module server --module client --force`.
- Per-module equivalents:
  - `cd server && pnpm typecheck && pnpm lint:arch && pnpm exec vitest run --exclude '**/*.it.test.ts'` (hermetic)
  - `cd server && pnpm exec vitest run .it.test` (needs Postgres via Testcontainers)
  - `cd client && pnpm typecheck && pnpm test` (hermetic)
- New tests:
  - server: `server/test/smart-diff-classify.test.ts` (hermetic), `server/test/smart-diff.test.ts` (hermetic: domain + service fake + 422), `server/test/smart-diff.it.test.ts` (Postgres).
  - client: `components/diff-viewer/DiffViewer/DiffViewer.test.tsx`, `DiffTab/helpers.test.ts`, `DiffTab/DiffTab.test.tsx`; extend `comments.test.ts`.
- Updated: `server/test/contracts.test.ts`.
- Must stay green: `client/src/shared-type-imports.test.ts`, `client/src/test/smoke.test.tsx`.

## How to verify / demo script

**Branching (only the user runs git; agents run no git write commands).** `origin/main` is `1c14a21` (the L02 merge). `L03` is `5b36ca1`, three commits ahead and **not merged** yet.
- Recommended: `git checkout L03 && git checkout -b L03-smart-diff` (git 2.15: no `switch`). Open the PR with base `L03` (stacked) and retarget it to `main` once L03 merges.
- If L03 is squash-merged first, rebase with `git rebase --onto main L03 L03-smart-diff`.
- Alternative: branch from `main` if you want the PR diff to contain only this feature and are fine resolving conflicts in the `PrDetailView` and `OverviewTab` area later.

**Test PR for the demo (in the user's fork, separate throwaway branch, never merged).** For example `demo/smart-diff-sample` off the homework branch, containing:
1. A lock file: `cd server && pnpm add <tiny-dep>`, which changes `server/pnpm-lock.yaml` and `server/package.json` through the package manager only.
2. A core file: a small new function in `server/src/...` or `client/src/...` with a deliberate defect (unvalidated input or an off-by-one) so the reviewer flags it.
3. A test file: `server/test/<topic>.test.ts`.
4. A config or barrel: an `index.ts` re-export or a `*.config.ts` tweak.
5. Optionally a `README.md` line (docs group).

Push it, open the PR on GitHub, add the fork in DevDigest (`/onboarding`), Refresh, and open the PR. In Agent settings pick a stronger model so at least one finding lands in the core file, then **Run review**.

**Demo script (1–3 min video, recorded by the user):**
1. Files changed tab, Smart order: groups appear in Core → Tests → Wiring → Docs → Boilerplate, each with a role label and "N files". Docs and Boilerplate are collapsed, and `pnpm-lock.yaml` is under Boilerplate.
2. Run review → wait for done → back to Files changed: the Core header shows "● 1" (files with findings), and the core file header shows a dot.
3. Expand the core file: the finding card sits under the cited line, with a coloured left bar and a "blocker"/"warning"/"suggestion" label. Accept or Dismiss works, and Dismiss removes the dot and counter after the refetch.
4. Toggle to Original order: GitHub order, no groups, findings still inline. Toggle back.
5. Agent runs tab: unchanged.

**P1 criteria → proof:**

| P1 criterion | Code | Test |
|---|---|---|
| Groups in fixed order with role label + file count | `smart-diff/constants.ts` `ROLE_DISPLAY_ORDER`, `domain/build.ts`; `RoleGroup.tsx` | `smart-diff.test.ts` (order, empty omitted); `DiffTab.test.tsx` (order + labels + counts) |
| Docs & boilerplate collapsed; lock file in boilerplate | `domain/classify.ts` + `ROLE_RULES`; `COLLAPSED_ROLES`; `FileCard` `defaultCollapsed` | `smart-diff-classify.test.ts` (lock rows); `DiffViewer.test.tsx` (`aria-expanded=false`); `DiffTab.test.tsx`; `smart-diff.it.test.ts` (lock in boilerplate) |
| After Run review: group counter (files, not findings) + file dot | `service.ts` (latest per agent, dismissed excluded), `filesWithFindings`, FileCard dot; query key nested under `["reviews", prId]` | `smart-diff.test.ts` (2 files / 5 findings); `helpers.test.ts`; `DiffViewer.test.tsx` (dot); `DiffTab.test.tsx` (invalidation) |
| Expanded file shows the finding under the right line, like Agent runs | `findings.ts` `findingLineKey`, `partitionByLineKey`, `CodeLine` bar + label, `DiffFinding` → `FindingCard` | `comments.test.ts` (key match + fallback); `DiffViewer.test.tsx` (under line, "blocker"); `DiffTab.test.tsx` (Accept) |
| Original order toggle | `OrderToggle`, `DiffTab` mode state | `DiffTab.test.tsx` (toggle) |

P2/P3 polish (colours, descriptions, split banner) does not block.

**PR description (written by the user).** Cover what was built, the decisions (role order and edge cases, which findings count, `finding_ids`, fallback list), how to verify (the script above) and the video link. Also state **which subagent did what**: planner (this plan) → implementer → architecture-reviewer ∥ plan-verifier, plus what plan-verifier found and how it was resolved. Run `/pr-self-review` (manual skill, user only) before opening it.

## Deviations from the original plan
Recorded after the architecture-reviewer and plan-verifier passes, so the plan matches the code:
- **S4 / S5 (barrel):** the pure helper `latestReviewPerAgent` lives in `server/src/modules/_shared/latest-review.ts`; `pulls/status.ts` re-exports it, `pulls/index.ts` is untouched, `smart-diff/index.ts` exports only `classifyFile` and `normalizePath`. Reason: a barrel that re-exports a service loads the ORM at runtime while `lint:arch` stays green, and `no-cross-module-internals` forbids a deep import.
- **S10 (DiffTab):** the old hard-coded strings (title, show/hide comments, post-failure toast) now come from `prReview.diffTab.*`, and the layout styles moved to `DiffTab/styles.ts`. This reverses the original non-goal; both were `pr-self-review` warnings.
- **Polish (P2 toggle, 2026-10-31):** the toolbar button now hides/shows GitHub comments AND findings together (`DiffFindingApi.showFindings`, default on; dot and counter stay); the `UnanchoredFindings` list is therefore hidden with them instead of "always visible". The finding action label is "Dismiss" (was "Reject"; key `finding.dismiss` unchanged).
- **Classifier:** `vendor` is excluded from the `dist`/`build` boilerplate segments, otherwise `server/src/vendor/shared/**` contract changes would be classified as boilerplate.
- **S10a (accepted partial):** the mode switch in `DiffTab` is one flat ternary in a single return, not an early return per mode. It is not nested, so the intent of the rule holds.
- **S12 (accepted partial):** DiffTab tests use `fireEvent` because `@testing-library/user-event` is not installed and a dependency change was out of scope. Not asserted in tests: the left severity bar, the per-group "N files" values, and that the file dot is distinct from the comment count (all covered by code and by the manual demo).
- **Open for the user:** S0b (approve the specs), S2b (test-first order is not visible in an uncommitted tree), S10b (manual browser demo / video).

## Left to other agents
- **Architecture review:**
  - Is reusing `latestReviewPerAgent` through `pulls/index.ts` acceptable, given it drags `PullsService` into the import graph of the smart-diff service, or should it move to a shared domain spot? **Answered: it moved to `modules/_shared/`.**
  - Does `SmartDiffSource` match `ReviewRepository` structurally, with no `db/rows` imports in `service.ts`?
  - Are `domain/` files pure, and is `lint:arch` clean with no baseline growth?
  - Does diff-viewer stay generic (no `app/**` import), is `renderFinding` used only with a real component, and is the DiffTab split sensible (under 200 lines per component)?
  - Does the nested query key look like an intentional, documented choice?
- **Security review:**
  - Workspace scoping on `GET /pulls/:id/smart-diff`: another workspace's PR must return 404, which the IT covers.
  - Uuid validation returns 422.
  - The response schema doesn't leak extra fields.
  - Finding rationale and suggestion (LLM output) still render only through the existing `Markdown` primitive; no `dangerouslySetInnerHTML` is added.
  - No new outbound calls.
  - Paths are matched with constant rule specs, so there is no regex from input.

## Risks and open questions
- non-blocking, **which findings count**:
  - Default: the latest review per agent, the same as the PR-list rule in `server/specs/findings-severity.md:17`. The homework says "latest review", which with "Run all agents" would show only one agent.
  - **Dismissed findings are excluded** from the dots, counters, lines and cards, so Dismiss in the diff makes the card leave the diff after the refetch. Undo stays on the Agent runs tab. Accepted findings stay.
  - This differs from the PR-list rule (which counts dismissed findings) on purpose: the diff guides attention, and the list reports what the review found. The specs state it.
- non-blocking, **collapse semantics**: Default is that every group header is visible and expanded, and in docs/boilerplate the **file cards** start collapsed (so the lock-file path is visible without a click). Each group header can also collapse the whole group. The alternative is to collapse the whole docs/boilerplate group by default.
- non-blocking, **toggle persistence**: Default is local state, reset on reload, with Smart as the default. The alternative is a `?order=` URL param, which matches the existing `?tab` pattern.
- non-blocking:
  - Contract addition `finding_ids` goes beyond the starter contract. It keeps the counting rule on the server only; the alternative is the client re-implementing the rule.
  - A `PrFile` missing from the smart-diff response (refresh race) falls back to `core`.
  - Findings whose `file` is not in `pr_files` are ignored by the server. Grounding normally prevents them.
  - `dist`/`build` as any path segment can misclassify a real source folder named `build/`. It is pinned in tests; revisit if it bites.
  - `.dependency-cruiser.cjs`-style dotfiles without `.config.` fall to core.
- risk: `DiffTab.test.tsx` mocking style is **unverified**; follow the existing PR-detail tests.
- risk: the `client/docs/ui-architecture.md` query-key section and the role colour token names are **unverified**.
- risk: L03 is not merged, so a stacked PR can conflict on a squash merge (see Branching).
