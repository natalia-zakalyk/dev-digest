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
collapsed while the header stays visible, so a lock-file path is readable without a click. A file that
carries a finding always starts open, whatever its group or size, so a finding is never hidden.

## Findings in the diff
- File card header: a red dot (no number, `aria-label` "has findings") after the path; distinct from
  the GitHub comment count (message icon).
- Under the code line (RIGHT side, `start_line`): the Agent-runs `FindingCard` (injected through
  `DiffFindingApi`, so `components/` never imports route code). The line gets a left bar in the
  top-severity colour and right-aligned labels, **one per finding** on that line (stacked, most severe
  first): a small icon (`SEV[sev].icon`, colour `SEV[sev].c`) + a lowercase word, CRITICAL → `blocker`,
  WARNING → `warning`, SUGGESTION → `suggestion` (INFO: no bar, no label). Icons are decorative
  (`aria-hidden`); the word is the accessible name. Labels are `nowrap` / `flex-shrink: 0`.
- A finding whose line is not rendered goes to a list "Findings outside the shown lines"
  at the end of the file body (visible whenever findings are shown).
- Two independent toolbar buttons: "Hide / Show comments (N)" for GitHub comments (`showComments`, default off,
  rendered when N > 0) and "Hide / Show findings (N)" for review findings (`showFindings`, default on,
  rendered when N > 0). Posting a comment still turns comments on.
  Hidden findings drop cards, bars, labels and the fallback list; the file dot and group counter stay.
- Dismiss removes the card (the server excludes dismissed findings); Accept keeps it.

## Token note
Directly under the "Files changed" row, in BOTH orders: `⚡ 0 new tokens · built on 108,089 from last review`
(`DiffTab/_components/TokenNote`, key `prReview.smartDiff.tokenNote`, ICU plural). "New tokens" is the
documented constant `SMART_DIFF_NEW_TOKENS = 0`: grouping is local and deterministic, Smart Diff never calls
a model. N is `SmartDiff.source_tokens` (server-computed, see the server spec), formatted with
`formatTokenCount`. Hidden when `source_tokens` is null/absent (no review run yet), never "0".
Computed on the server rather than from `usePrReviews`: review DTOs carry no token counts, and the server
already owns the "latest review per agent" rule, so the number cannot drift from the findings it describes.
It refreshes with the nested smart-diff key.

## Data
`usePrSmartDiff(prId)` with key `["reviews", prId, "smart-diff"]`, nested under the reviews key so
every existing invalidation (`useRunReview`, `useFindingAction`, run settle, deletes) refreshes dots
and cards. Finding records come from `usePrReviews`, joined by `finding_ids`.

## Acceptance criteria
- Groups in fixed order with label, description and file count.
- Docs and boilerplate file cards are collapsed (unless the file has a finding); the lock file path is visible under Boilerplate.
- After Run review: group counter (files) and file dot appear.
- Expanded file shows the finding under the right line with bar and label; Accept/Dismiss work.
- Findings visible by default; the toolbar button hides them (dot and counter stay) and shows them again with the comments.
- The token note shows in both orders when a review exists and is absent otherwise.
- A line with two findings shows two labels.
- Original order toggle removes groups and keeps findings inline.
- Agent runs tab is unchanged.
