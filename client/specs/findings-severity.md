# Spec — Findings by severity (client side)

Status: implemented · Lab L01 · Data/API: [server/specs/findings-severity.md](../../server/specs/findings-severity.md)

## Where it shows (3 places)
1. **Pull Requests list** — `FINDINGS` column between SCORE and STATUS
   (value = `PrMeta.findings`, latest review of each agent). Hover → popover "N FINDINGS IN THIS RUN".
2. **PR Detail → Agent runs → Timeline** — on a finished run row, **read-only** severity icons
   replace the text "N finding(s)" (no click, no tooltip); "· N blockers" stays next to them
   (value = findings of the review whose `run_id` is this run). No review → the old text.
3. **PR Detail → Agent runs → Review runs** — in an expanded run card, under the verdict and PR
   SCORE: a row of pills `N CRITICAL · N WARNING · N SUGGESTION` (only severities present), then
   filter buttons **Critical / Warning / Suggestion**. A filter keeps only that level's finding
   cards; clicking the active filter again restores the full list. Pills count the cards the list
   shows (respecting "Hide low confidence"), so a pill always equals its cards below.
   Counting is a plain group-by over the loaded findings — no LLM call, no extra request.

## Look
- One counter per severity: icon + number, colored, dotted underline.
  `CRITICAL` → AlertOctagon `--crit` · `WARNING` → AlertTriangle `--warn` · `SUGGESTION` → Lightbulb `--sugg`
  (icons/colors from `SEV` in `@devdigest/ui`).
- Severities with 0 are hidden. All zero / `null` → `—`.

## Behaviour (PR list popover)
- **Hover** a counter (or focus it with the keyboard, or tap it on a touch screen) → tooltip under
  the counters, header "N findings in this run" (rendered uppercase), listing **only that severity's** findings: severity badge,
  title, category, `file:start-end`, confidence, rationale clamped to 2 lines. Read-only: no buttons (Accept / Reject live only on the finding
  cards in Review runs; Reject persists as `dismiss`).
- Moving to another counter switches the severity. Leaving the counter closes the tooltip after
  150 ms, so the pointer can move into the tooltip (it stays open while hovered, and scrolls).
  Esc, an outside click or a page scroll close it too.
- In the PR list a tap on a counter does not open the PR (the row is a link).
- PR list loads findings lazily when the tooltip first opens via `usePrReviews(prId)` (shared cache with the PR
  detail page) and applies the same "latest review of each agent" rule
  (`src/lib/findings.ts`), including skipping agent-less (seeded) reviews once the PR has an agent review. The timeline already has the reviews loaded.

## Components
- `src/components/severity-counts/` — `SeverityCounts` (counters; read-only icons without `onSelect`),
  `FindingsPopover` (list), `FindingsSeverity` (counters + popover, owns the open state).
- Review runs pills + filters: `FindingsPanel` (`visibleFindings(findings, hideLow, severity)`).
- i18n: `common.findings.*` (shared component); column label `prReview.list.columns.findings`.
