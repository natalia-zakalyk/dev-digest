# Data and business logic layering

Read this for anything involving data fetching, queries, state, errors, constants, env or types.

## Contents
1. Layers
2. Why there is no DAL, Server Actions or Route Handlers
3. Queries (TanStack Query)
4. Kinds of state
5. Errors
6. Constants, env, types

## 1. Layers

```
component (JSX only)
   │ calls
   ▼
hook in lib/hooks/<domain>.ts      ← TanStack Query glue: keys, polling, invalidation
   │ calls
   ▼
lib/api.ts                          ← the only HTTP client; ApiError taxonomy
   │ HTTP JSON / SSE
   ▼
Fastify API (server/)               ← the real domain logic

component ──▶ pure helpers (.ts, no React): derive · filter · group · format · validate
```

- **Components** render and handle events. No `fetch`, no `api.*` calls, no cache keys.
- **Hooks** combine queries, URL state and helpers into what a component needs. They stay thin.
- **Pure helpers** hold the client's presentation rules. They import no React, so they are unit-testable in isolation (`lib/findings.test.ts`, `lib/format-cost.test.ts`).
- **`lib/api.ts`** is the gateway. Base URL, headers and error mapping live here once.

This is the view → hooks → domain → gateway split from Juntao Qiu's "Modularizing React Applications" (martinfowler.com), adapted to a client whose real domain lives on the server.

## 2. Why there is no DAL, Server Actions or Route Handlers

Next.js names three data models: **HTTP API** (separate backend), **Data Access Layer** (new full-stack apps) and **component-level** (prototypes). It says to pick one and not mix them (Sebastian Markbåge; the Next.js data-security guide).

`client/` is firmly in the **HTTP API** camp: data comes from the browser through TanStack Query, from the Fastify API. Consequences:
- Don't add Server Actions or Route Handlers for app data. They would create a second backend. Next.js also advises against Server Components fetching your own Route Handlers, and against using Server Actions for reads.
- Don't move fetching into Server Components piecemeal. If server-side rendering of data is ever wanted, follow TanStack's Advanced SSR guide (prefetch in the RSC + `HydrationBoundary`) and write a spec first.
- If a module must never reach the browser, mark it with `import "server-only"`.

## 3. Queries (TanStack Query)

- **Keys** are `[resource, id]` tuples (`["pr-runs", prId]`), defined in the hook module that owns them. Mutations invalidate the same tuple. Components and pages never build key arrays by hand, because a typo silently breaks invalidation.
- **New query code:** write a `queryOptions` factory and let the hook wrap it:
  ```ts
  export const prRunsOptions = (prId: string) =>
    queryOptions({ queryKey: ["pr-runs", prId] as const, queryFn: () => api.get<…>(`…`) });
  export const usePrRuns = (prId: string | null) =>
    useQuery({ ...prRunsOptions(prId!), enabled: !!prId });
  ```
  Key and fn then travel together for `invalidateQueries`, `prefetchQuery` and `setQueryData`. TkDodo (TanStack maintainer) moved from "always wrap `useQuery` in a custom hook" (2020) to "`queryOptions` first" (2024 and Feb 2026). Don't rewrite existing hooks just for this; apply it to new and touched code.
- **Polling and SSE** belong in the hook (`refetchInterval`, `useRunEvents`). Components just consume the data.
- **The query cache is the server-state store.** Don't copy query data into `useState` or context; it goes stale and drifts. Derive from it during render instead.

## 4. Kinds of state

| Kind | Home | Example |
|---|---|---|
| Server cache | TanStack Query | pulls, runs, reviews |
| URL state (shareable, survives reload) | `searchParams` (`?status`, `?tab`, `?trace`) | PR list filter, PR detail tab |
| App-wide UI state | a provider in `lib/` | theme, active repo, toasts |
| Local UI state | `useState` in the component that owns it | search box text, hover |
| Form state | local state in the form component | agent editor |

Keep each piece as local as possible, and lift it only to the closest common parent (react.dev; Bulletproof React). Store IDs, not copies of objects.

## 5. Errors

The policy is global and lives in `lib/providers.tsx`:
- Network errors and 5xx from queries → toast.
- Expected 4xx → handled inline (empty or not-found state).
- Mutations always toast.

Components don't add their own toast logic for queries. They render `ErrorState` / `RepoNotFound` from the hook's `isError` / `error`. Check `error instanceof ApiError` to read the server's message.

## 6. Constants, env, types

- **Constants:** keep them colocated (`constants.ts`), named `UPPER_SNAKE` and readonly. Pick the typing by how the constant is *used*:
  - **The values already exist in a contract type** (statuses, severities, kinds): type the constant with that type, so a typo fails `typecheck` and the constant can't drift from the API.
    ```ts
    import type { PrStatus } from "@/lib/types";
    /** Membership test → Set. Typed with the contract enum, not string. */
    export const OPEN_STATUSES: ReadonlySet<PrStatus> = new Set<PrStatus>(["needs_review", "reviewed", "stale"]);
    // usage: OPEN_STATUSES.has(p.status)  ✓ compiles, p.status is PrStatus
    ```
  - **A new closed set the client owns** (tab ids, column keys): use `as const` and derive the union type from it.
    ```ts
    export const PR_DETAIL_TABS = ["overview", "findings", "diff"] as const;
    export type PrDetailTab = (typeof PR_DETAIL_TABS)[number];
    ```
  - **Watch out:** an `as const` tuple used for *membership* with a wider value fails to compile. `OPEN_STATUSES.includes(p.status)` is an error when `p.status: PrStatus` is wider than the tuple. Use a typed `ReadonlySet` (above) or a type guard (`isPrDetailTab(x): x is PrDetailTab`) instead of casting.
  - Prefer these over `enum`: they're plain values, tree-shakable, and line up with Zod enums.

  Global constants live beside the domain helper they belong to. Use a `lib/constants.ts` only as a last resort.
- **Env:** only `NEXT_PUBLIC_*` reaches the browser, and its value is inlined at build time. Read it in one module (today `API_BASE` in `lib/api.ts`). If env grows, a single validated `env.ts` (T3 Env + Zod) is the pattern.
- **Types:**
  - API shapes come from `@devdigest/shared` (Zod schema + `z.infer`) via `lib/types.ts`. Never redeclare them.
  - Component-local types stay in the component file.
  - Use `import type` for type-only imports; they are fully erased.
  - Don't create a global `types.ts` dump.
  - `vendor/shared` is a copy of `server/src/vendor/shared` (canonical) and has drifted. A contract change means editing both copies and saying so.
