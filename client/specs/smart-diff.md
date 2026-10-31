# Spec — Smart Diff (client side)

Status: implemented · Lab L03 homework · Server side: [server/specs/smart-diff.md](../../server/specs/smart-diff.md)

## Goal
The "Files changed" tab groups files by role and shows review findings inside the diff.

## Modes
- **Smart order** (default on load, local state, not persisted): groups in the order core, tests,
  wiring, docs, boilerplate. **Original order**: GitHub order, no groups, findings still inline.
- Toggle: two buttons "Smart order" / "Original order" (`aria-pressed`).
- While `GET /pulls/:id/smart-diff` is loading or failed, the tab renders the original-order viewer
  without findings (graceful fallback).

## Group header
Role colour square, label, short description, then `● N` (red dot + number of **files** in the group
that have findings, not findings; hidden at 0) right before "N files". The header is a button
(`aria-expanded`) that collapses the whole group. In **docs** and **boilerplate** the file cards start
collapsed while the header stays visible, so a lock-file path is readable without a click.

## Findings in the diff
- File card header: a red dot (no number, `aria-label` "has findings") after the path; distinct from
  the GitHub comment count (message icon).
- Under the code line (RIGHT side, `start_line`): the Agent-runs `FindingCard` (injected through
  `DiffFindingApi`, so `components/` never imports route code). The line gets a left bar in the
  severity colour and a right-aligned label: CRITICAL → `blocker`, WARNING → `warning`,
  SUGGESTION → `suggestion` (INFO: no bar).
- A finding whose line is not rendered goes to an always-visible list "Findings outside the shown lines"
  at the end of the file body.
- Dismiss removes the card (the server excludes dismissed findings); Accept keeps it.

## Data
`usePrSmartDiff(prId)` with key `["reviews", prId, "smart-diff"]`, nested under the reviews key so
every existing invalidation (`useRunReview`, `useFindingAction`, run settle, deletes) refreshes dots
and cards. Finding records come from `usePrReviews`, joined by `finding_ids`.

## Acceptance criteria
- Groups in fixed order with label, description and file count.
- Docs and boilerplate file cards are collapsed; the lock file path is visible under Boilerplate.
- After Run review: group counter (files) and file dot appear.
- Expanded file shows the finding under the right line with bar and label; Accept/Dismiss work.
- Original order toggle removes groups and keeps findings inline.
- Agent runs tab is unchanged.
