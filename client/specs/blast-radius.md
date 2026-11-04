# Spec — Blast radius (client side)

Status: approved (2026-11-04, user approved D1-D5 in chat) · Plan: [docs/plans/blast-radius.md](../../docs/plans/blast-radius.md) · Server side: [server/specs/blast-radius.md](../../server/specs/blast-radius.md)

## Goal
A "Blast radius" card on the PR **Overview** tab next to the Intent card: changed symbols, their callers (linked to GitHub at the head sha), and the endpoints and crons that may depend on them.

## Where it renders
- `OverviewTab` (`app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:8-11`) currently takes `{prId, prBody}`; it gets two new props, `repoFullName: string | null` and `headSha: string`, passed from `PrDetailView.tsx` (values exist at `PrDetailView.tsx:28,58,69`).
- The Intent card and the Blast card share a 2-column row (comment at `OverviewTab.tsx:16`); the description stays below.
- Card: `BlastRadiusCard/` under `OverviewTab/_components/`, a client component inside the existing `"use client"` tree (`OverviewTab.tsx:1`); `Card` + `SectionLabel` from `@devdigest/ui` like `IntentCard.tsx:7,141-147`.

## Data
`usePrBlast(prId)` in `lib/hooks/blast.ts`: key `["blast", prId]` (not nested under `["reviews", …]`: blast does not depend on reviews), `api.get<BlastRadiusResponse>("/pulls/<prId>/blast")`, `enabled: !!prId`; pattern `lib/hooks/smart-diff.ts:15-23`.
Type comes from `lib/types.ts` (`import type` only; a value import from `@devdigest/shared` breaks Next routes, `client/INSIGHTS.md:26`, guard `src/shared-type-imports.test.ts`).
Degraded reasons are copied into a local readonly tuple `BLAST_DEGRADED_REASONS` in the card's `constants.ts`.

## States
1. **Loading**: muted `blast.loading` text. 2. **Error**: `blast.loadError`, the rest of the Overview stays usable.
3. **Degraded** (`degraded: true`): a `role="note"` row with a warning `Badge` and text `blast.degraded.reason.<reason>` (`flag_off | index_failed | index_partial | repo_too_large | no_data`; unknown/missing reason falls back to `no_data`). With `index_partial` the data below is still shown; for every other reason there is no tree (the server returns empty data and does not fall back to a ripgrep result).
4. **Stat row** from `counts`: `{n} symbols · {n} callers · {n} endpoints · {n} cron/jobs` (existing `blast.stat.*` keys, `messages/en/blast.json:1-6`).
5. **No callers** (`downstream` empty, not degraded): `blast.noDownstream` with the symbol count.
6. **Tree**: per `downstream` entry the symbol as `name()` + `callerCount`; callers `↳ file:line`. A muted line states how many changed symbols have no callers (`symbolsWithoutCallers`: `changed_symbols` not in `downstream`).
7. **Chips**: endpoint chips (globe icon) and cron chips (clock icon) via `Badge`, with `aria-label` from `blast.chip.endpoint` / `blast.chip.cron`.

## Layout safety
The card sits in the Overview `cardsRow` grid (`repeat(auto-fit, minmax(380px, 1fr))`). Grid and flex items default to `min-width: auto`, so one long unbreakable path (`client/src/app/repos/[repoId]/...:LINE`) would stretch the column past the card. Every level therefore has `minWidth: 0` (grid cell wrapper in `OverviewTab`, section, card, list, symbol row, caller row); the caller row has `overflowWrap: "anywhere"` (inherited by the link) and its arrow icon `flexShrink: 0`, aligned to the first line; chips are `maxWidth: 100%` with a wrapping `Badge`.

## Plurals
`callerCount`, `noDownstream`, `noCallersRest` and the `graph.*NotDrawn` / `graph.summary` keys use ICU `plural` (`1 caller`, `2 callers`).

## Caller link
`githubBlobUrl(repoFullName, headSha, file, line)` (`lib/github-urls.ts:24-37`, fixed host, encoded path, `#L{line}`), rendered with `MonoLink` (`FindingsSection.tsx:7,57`), new tab, `rel="noopener noreferrer"` (verify what `MonoLink` already sets). When `repoFullName` is null the caller is plain mono text. Symbol names, paths, endpoint and cron text come from the repo: rendered only as escaped React text.
The index reflects the default branch, links use the PR head sha: for caller files the PR did not touch the line matches head; otherwise it can drift (R4).

## i18n (`messages/en/blast.json`)
Existing keys stay (`stat.*`, `view.*`, `callerCount`, `noDownstream`, `graph.*`). Add `title`, `loading`, `loadError`, `degraded.title`, `degraded.reason.{flag_off,index_failed,index_partial,repo_too_large,no_data}`, `noCallersRest`, `chip.endpoint`, `chip.cron`. No hardcoded user-visible string; colours via `var(--token)`.

## Optional (P3), recommended by the plan
- **O1 Collapse/expand per symbol** (recommended, do it): a button with `aria-expanded`, state local to the row, default expanded.
- **O5 Resync button** next to the degraded marker (recommended): `useResyncRepoIntel(repoId)` (`lib/hooks/repo-intel.ts:41-49`), invalidate `["blast"]` on success; needs a `repoId` prop. Shown for degraded states other than `flag_off`.
- **O6 Tree/Graph toggle** (implemented): `ViewToggle` (two buttons in a `role="group"`, `aria-pressed`, state local to the card, tree is the default) sits next to the stat row and is hidden when only the degraded note is shown. The graph is `BlastGraph/`, an SVG (`role="img"`, `aria-label` from `graph.ariaLabel`, `<desc>` with a plural summary) with four columns, each with a small coloured header carrying its drawn count (`graph.column.{symbols,callers,endpoints,crons}`, ICU plurals; symbols accent, callers muted, endpoints green, crons amber): changed symbols, callers (two-line node: name, then `basename:line`), endpoints, crons. Layout is the pure `layoutBlastGraph` in `helpers.ts` (nodes with x/y/label/sublabel/kind, edges as from/to ids, `columns` for the headers); the component only draws it. The SVG is drawn at its natural size inside a horizontally scrolling wrapper (text never shrinks); edges are thin grey bezier curves behind the nodes, and hovering a node highlights its edges (decorative, mouse only).
  - **Edges**: symbol -> each of its callers; caller -> each endpoint and cron reached through that caller's file (per-caller `endpoints_affected` / `crons_affected` on `BlastCallerWithFacts`), so a job caller connects straight to its cron and a caller without targets has no outgoing edge. Endpoint and cron nodes are deduplicated by text (one node, many incoming edges).
  - **Fallback (honesty rule)**: a caller with both per-caller fields `undefined` (older server) never gets invented caller -> target edges. Its group draws symbol -> endpoint/cron edges from the group union and the `graph.attribution` note is shown, only in that case. Per-caller arrays (even empty) mean real data: caller -> target edges, no note.
  - **Symbol selection**: among symbols that have callers, those that reach any endpoint or cron come first (per-caller facts when present, otherwise the group-level union), then the rest; each part keeps `downstream` (tree) order, i.e. best rank first as the server sorts. The cap is applied to that sequence, so a PR with many symbols still shows the ones that matter. Drawn symbols may therefore appear in a different order than in the tree; this is intended.
  - **Caps** (constants.ts): the first `GRAPH_MAX_SYMBOLS` (8) symbols of that sequence, at most `GRAPH_MAX_CALLERS_PER_SYMBOL` (4) callers each and `GRAPH_MAX_TARGETS` (12) endpoint/cron nodes together. What is cut is stated in text (`graph.symbolsNotDrawn`, `callersNotDrawn`, `targetsNotDrawn`, plural keys). Endpoint/cron nodes are deduplicated by text and, because endpoint-reaching symbols are drawn first, the target cap is spent on them first.
  - **Column headers**: when a column draws fewer nodes than the card total (`data.counts.symbols/callers/endpoints/crons`) the header reads `N OF M` via `graph.column.{symbols,callers,endpoints,crons}Of` (`{drawn} OF {total, plural, ...}`, e.g. `8 OF 98 SYMBOLS`); otherwise the plain count (`graph.column.symbols` etc.). The symbols total includes symbols without callers, so it can read `1 OF 2 SYMBOLS` even when every symbol with callers is drawn.
  - Labels are cut to `GRAPH_LABEL_MAX` characters with an ellipsis; the full text is an SVG `<title>` (only when something is cut or a path was shortened to its basename). The column headers replace the former HTML legend. Empty `downstream`: `graph.empty`.
- **O7 "Prior PRs touching these files"**: out of scope (needs new GitHub reads and a new endpoint).
- O2 (crons as separate chips), O3 (rank order, server), O4 (labels from `blast.json`) are part of the core.

## Acceptance criteria
P1
- The Overview tab shows the card next to Intent with symbol, ≥2 caller links, ≥1 endpoint chip and the cron chip for a prepared PR.
- A caller link `href` ends with `/blob/<headSha>/<file>#L<line>`; clicking opens that exact line in a new tab.
- No callers → the `noDownstream` text.
P2
- `degraded` + `index_partial` → note with the reason text and the data still shown; `flag_off` → note and no tree.
- Loading and error states do not break the rest of the tab.
- No hardcoded user-visible strings; `src/shared-type-imports.test.ts` and `src/app/server-entries.test.ts` stay green.
- Tests: `BlastRadiusCard.test.tsx` (mock only `@/lib/api`, `NextIntlClientProvider` with `blast` + `common`, `fireEvent`; `@testing-library/user-event` is not installed), `helpers.test.ts`, updated `PrDetailView.test.tsx`.
