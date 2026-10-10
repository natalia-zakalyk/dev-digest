# Examples: before/after from this repo

The "Before" snippets are real code from `client/src` (as of 2026-10-10). The "After" snippets show the shape the rules in [SKILL.md](../SKILL.md) and the other reference files point to. They are **illustrations, not applied refactors**. Change the real code only as part of a task that asks for it.

## 1. Inline constant in a page → colocated `constants.ts`

**Before**: `app/repos/[repoId]/pulls/page.tsx:25`. A sibling `constants.ts` already exists, but this constant was defined in the page:

```tsx
/** Open PRs carry a derived review status; everything else is merged/closed. */
const OPEN_STATUSES = new Set(["needs_review", "reviewed", "stale"]);
```

**After**: it goes in `app/repos/[repoId]/pulls/constants.ts`, next to `STATUS_META` / `STATUS_FILTERS`. It's typed with the contract enum, so a typo becomes a compile error and `.has(p.status)` keeps compiling:

```ts
import type { PrStatus } from "@/lib/types";

/** Open PRs carry a derived review status; everything else is merged/closed. */
export const OPEN_STATUSES: ReadonlySet<PrStatus> = new Set<PrStatus>(["needs_review", "reviewed", "stale"]);
```

Don't use `["needs_review", …] as const` here. The page tests membership with a wider `PrStatus` value, and `tuple.includes(p.status)` doesn't compile without a cast. See [data-and-logic.md](data-and-logic.md) §6.

Same issue: `VALID_TABS` in `app/agents/[id]/page.tsx:15`, and `WIDTH` / `GUTTER` in `components/severity-counts/FindingsPopover.tsx`.
*Rule: [placement.md](placement.md) §2 "Constant, one component or route"; SKILL checklist "page.tsx is thin".*

## 2. Derivation in the page → pure helper + unit test

**Before**: `app/repos/[repoId]/pulls/page.tsx:50-62`. The page filters, searches, sorts and counts inline:

```tsx
const filtered = (pulls ?? [])
  .filter((p) => status === "all" || p.status === status)
  .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
  .slice()
  .sort((a, b) => { /* by updated_at */ });
const openCount = (pulls ?? []).filter((p) => OPEN_STATUSES.has(p.status)).length;
```

**After**: the logic moves to the route's existing `helpers.ts`. It's pure TypeScript with no React import:

```ts
// app/repos/[repoId]/pulls/helpers.ts
export function filterPulls(pulls: PrMeta[], opts: { status: string; query: string; sort: "newest" | "oldest" }): PrMeta[] { … }
export function countOpen(pulls: PrMeta[]): number { … }
```

```tsx
// page.tsx: only composes
const visible = filterPulls(pulls ?? [], { status, query, sort });
```

`helpers.test.ts` covers the edge cases (empty query, number search, sort direction) without rendering anything.
*Rule: SKILL principle 3; [data-and-logic.md](data-and-logic.md) §1 Layers.*

## 3. Query keys built in a page → owned by the hook module

**Before**: `app/repos/[repoId]/pulls/[number]/page.tsx`. The page builds cache keys by hand:

```tsx
const invalidateActiveRuns = () => {
  if (prId) qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
};
const invalidateRunHistory = () => {
  if (prId) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
};
```

**After**: the key tuples live in `lib/hooks/reviews.ts`, the only place that knows them. New code exposes a `queryOptions` factory so the key and fn are reused together:

```ts
// lib/hooks/reviews.ts
export const prRunsOptions = (prId: string) =>
  queryOptions({ queryKey: ["pr-runs", prId] as const, queryFn: () => api.get<RunRecord[]>(`/prs/${prId}/runs`) });

export function usePrRuns(prId: string | null) {
  return useQuery({ ...prRunsOptions(prId!), enabled: !!prId /* + polling logic */ });
}

export function useInvalidateRunHistory(prId: string | null) {
  const qc = useQueryClient();
  return () => prId && qc.invalidateQueries({ queryKey: prRunsOptions(prId).queryKey });
}
```

The `queryFn` URL above is illustrative. Copy the real one from the existing hook.
*Rule: [data-and-logic.md](data-and-logic.md) §3 Queries (TkDodo "The Query Options API", "Creating Query Abstractions").*

## 4. A 185-line page → thin page + view components

**Before**: `app/repos/[repoId]/pulls/[number]/page.tsx` (185 lines). It resolves number → uuid, wires 7 hooks, builds cache-invalidation callbacks, manages `?tab` / `?trace` URL state, derives `allFindings` / `lethalTrifecta`, and renders three inline state branches (not-found / skeleton / error) plus the tabs.

**After** (sketch):

```
pulls/[number]/
  page.tsx                      ← params + state switch + <PrDetailView/>   (~40 lines)
  helpers.ts                    ← resolvePrId(pulls, number), collectFindings(reviews)
  _components/
    PrDetailSkeleton/           ← the loading branch's markup
    PrDetailView/               ← header + tabs; reads ?tab via a small use-pr-detail-params hook
    …existing tabs
```

- Data hooks stay in `lib/hooks`.
- Invalidation helpers move to `lib/hooks/reviews.ts` (example 3).
- URL-state glue becomes a colocated hook (`use-pr-detail-params.ts`) because only this route uses it.

*Rule: [components.md](components.md) §1 and §3. The trigger is the mixed responsibilities, not the line count.*

## 5. Boolean-prop sprawl → explicit variants / compound components

**Smell (hypothetical):** `<RunStatus running={…} failed={…} cancellable={…} compact={…} />`. Every new flag doubles the states the component has to handle.

**After:**

```tsx
<RunStatus.Running runIds={liveRunIds} onCancel={cancel} />
<RunStatus.Failed error={err} />
```

Or use small explicit components (`RunningRunStatus`, `FailedRunStatus`) that share a layout through `children`. Use compound parts with Context only when the parts share state.
*Rule: [components.md](components.md) §4 (Vercel composition-patterns; Kent C. Dodds compound components).*

For more "where does a new thing go" cases, see [placement.md](placement.md) §4.
