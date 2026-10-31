# Spec — Smart Diff (server side)

Status: implemented · Lab L03 homework · UI side: [client/specs/smart-diff.md](../../client/specs/smart-diff.md)

## Goal
`GET /pulls/:id/smart-diff` groups the PR's files by role and tells the client which findings sit on
which file, so the Files changed tab can show a role-grouped view with findings inline.
No LLM call, no DB schema change.

## Classifier (`modules/smart-diff/domain/classify.ts`, pure)
`classifyFile(path): SmartDiffRole` with roles `core | tests | wiring | docs | boilerplate`.
- Path is normalized first: `\` → `/`, leading `./` and `/` stripped, lowercased for matching only.
- Precedence: **boilerplate → tests → wiring → docs**; anything else is `core`.
- Rules are typed specs in `constants.ts` (basename, suffix, directory segment, basename prefix/infix,
  top directory). No glob library, no regex built from strings.
- Edge cases pinned in `server/test/smart-diff-classify.test.ts`: lock files and `dist`/`build`
  segments are boilerplate; `package.json` is wiring; `src/index.ts` is wiring but `index.tsx` is core
  (JSX is real code); `e2e/README.md` is tests (tests beat docs); `.claude/**` is wiring (wiring beats
  docs); `src/distance.ts` is core (a segment is matched whole, never as a substring).
- `classifyFile` and `normalizePath` are exported from `modules/smart-diff/index.ts` for reuse (L08 prompt filter).

## Route
`GET /pulls/:id/smart-diff` → `SmartDiffResponse` (`SmartDiff` in `@devdigest/shared`).
- `:id` is a uuid (422 otherwise). Unknown PR or a PR of another workspace → 404.
- Groups follow the fixed display order core, tests, wiring, docs, boilerplate; **empty groups are omitted**.
- Files keep GitHub order inside a group.
- `SmartDiffFile.finding_lines`: sorted, de-duplicated `start_line`s of the file's counted findings.
  `finding_ids`: the ids of those findings, ordered by line then id. The client joins ids to
  `FindingRecord`s, so the counting rule lives only here.
- `split_suggestion` is a stub: `{ too_big: false, total_lines: Σ(additions+deletions), proposed_splits: [] }`.
  `pseudocode_summary` is left out.

## Which findings count
- Reviews of `kind = 'review'` only; the **latest review of each agent** (`latestReviewPerAgent`,
  same rule as [findings-severity.md](findings-severity.md)); agent-less seeded reviews only while the
  PR has no agent review.
- **Dismissed findings are excluded** (unlike the PR-list rollup): the diff guides attention, dismissing
  a card removes it. Accepted findings stay.
- Findings whose `file` is not among the PR files are ignored.

## Implementation
`modules/smart-diff/`: `constants.ts`, `domain/{classify,build}.ts` (pure), `ports.ts`
(`SmartDiffSource`, satisfied structurally by `ReviewRepository`), `service.ts`, `compose.ts`, `routes.ts`.

## Acceptance criteria
- Groups appear in fixed order with role and file count; empty groups are omitted.
- Lock files land in `boilerplate`, docs in `docs`.
- 2 files carrying 5 findings give 2 files with non-empty `finding_ids`.
- A rerun of one agent replaces its findings; two agents add up; dismissed are excluded.
- Unknown PR / other workspace → 404; invalid id → 422.
