---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for client/ (Next.js 15 App Router, React 19, TanStack Query 5). Covers where a component, hook, constant, helper/util, type, API call or business rule belongs; route-private (_components) vs shared code and when to promote it; how and when to split a component or a fat page.tsx; the data/logic layering (component → hook → lib/api.ts); barrel files and import direction; and where to put 'use client'. Use it whenever you create, move or rename files in client/src, refactor a large component or page, review a client PR for structure, or someone asks 'where should this live?' / 'куди це покласти?' / 'як розбити компонент?', even if they don't say 'architecture'. Not for rendering performance or Next.js API details (use react-best-practices / next-best-practices)."
metadata:
  version: "1.1.0"
  updated: "2026-10-10"
  scope: client/
  tags: react, nextjs, app-router, architecture, folder-structure, code-organization
---

# Frontend UI Architecture (`client/`)

This skill answers two questions for `client/src`: **where does this code go**, and **how should it be split**.

The baseline is the layout that already exists. Next.js doesn't prescribe a structure, and every major guide says consistency matters more than any methodology. So don't restructure toward Feature-Sliced Design, a `features/` folder or atomic folders unless a spec asks for it. Every rule here traces back to a source in [README.md](README.md).

## Core principles (the why behind every rule)

1. **Colocate first; promote on the second consumer.** Code lives next to its only user. It moves to a shared folder when a *second* route or feature actually imports it, in the same change. A consumer that's only *planned* ("next sprint the agents page will need it") doesn't count. Moving code up later is one `git mv`, and plans change. Moving it down after others depend on it is expensive, and premature sharing creates the wrong abstraction. (Kent C. Dodds; Robin Wieruch; FSD v2.1 "pages first"; Next.js docs)
2. **Imports flow one way: shared → route.** The order is `vendor/*` → `lib/` → `components/` → `app/**`. Shared code never imports route code, and sibling routes never import each other. That keeps any route deletable and any shared module reusable. (Bulletproof React)
3. **Separate rendering, glue and rules.** JSX renders. Hooks connect state and queries to it. Pure `.ts` functions hold the rules (derive, filter, format). Pure functions are trivially unit-testable and outlive UI rewrites. (Juntao Qiu on martinfowler.com; react.dev)
4. **Avoid hasty abstractions.** Duplication is cheaper than the wrong abstraction. Split or extract when there is a concrete reason, not "for cleanliness". (Kent C. Dodds, "AHA Programming")
5. **The domain lives on the server.** Reviews, runs and costs are computed by `server/` and `reviewer-core/`. The client calls an HTTP API, so its "business logic" is presentation logic. That's why there is no data access layer, no Server Actions and no Route Handlers here.

## Quick placement map

| What you're adding | Where it goes |
|---|---|
| Route entry | `src/app/<route>/page.tsx`. Keep it **thin**: params, state switch, composition. |
| Component used by one route | `src/app/<route>/_components/<Name>/` with `Name.tsx` · `index.ts` · `Name.test.tsx` (plus `styles.ts` / `constants.ts` / `helpers.ts` as needed) |
| Child of one component | `…/<Name>/_components/<Child>/` |
| Component used by 2+ routes | `src/components/<kebab-name>/` (strings from the `common` namespace) |
| UI primitive | `src/vendor/ui` (`@devdigest/ui`) |
| Query / mutation hook (talks to the API) | `src/lib/hooks/<domain>.ts` → `src/lib/api.ts` (the only HTTP client) |
| Any other hook (URL state, UI behaviour, composing several data hooks for one screen) | Next to its user: inside the component file, or `app/<route>/use-xxx.ts` for one route. **Not `lib/hooks/`** until 2+ routes use it. |
| Pure helper | `<Name>/helpers.ts`, or `src/lib/<purpose>.ts` once shared. Never `utils.ts`. |
| Constant | `<Name>/constants.ts`, or `app/<route>/constants.ts`, or beside its shared helper in `lib/`. `UPPER_SNAKE` and readonly. If its values come from a contract enum, type it with that enum (`ReadonlySet<PrStatus>`); otherwise use `as const` (see data-and-logic.md §6). |
| Contract type | `src/vendor/shared` (Zod + `z.infer`), re-exported via `src/lib/types.ts`. Never redeclare it. |
| User-visible text | `messages/en/<namespace>.json` |

The full table, including edge cases and worked decisions, is in [references/placement.md](references/placement.md).

**How to read the repo docs.** `client/AGENTS.md` says "`src/lib/hooks/*` — every data hook". That means hooks that fetch or mutate through `lib/api.ts`. It does **not** mean every hook in the app. A URL-state hook or a screen-specific hook that combines several data hooks belongs to the route that uses it. Putting route-private hooks in `lib/hooks/` turns it into a grab-bag and hides which screen owns the logic.

## How to use this skill

1. **Placing or moving code:** find the row in the map above. If it's ambiguous, read `references/placement.md`. When still unsure, put it next to its user.
2. **Splitting a component or a fat `page.tsx`:** read [references/components.md](references/components.md). Split on *mixed responsibilities*, not line count. Pull logic out first (helpers, then a hook), JSX second.
3. **Anything touching data, queries, state, errors, env or types:** read [references/data-and-logic.md](references/data-and-logic.md).
4. **Imports, barrel files, `'use client'`, or lint enforcement:** read [references/boundaries.md](references/boundaries.md).
5. **Want a concrete before/after from this repo:** see [references/examples.md](references/examples.md).
6. **When you answer**, name the target path and the one-line reason (which principle applies). When the existing code violates a rule, say so, but don't refactor unrelated files unless the task asks for it.

## Final checklist

- [ ] Each new file is where the map says; only a 2nd consumer justified promoting it.
- [ ] `page.tsx` is thin: no named constants, derivation or cache-key logic inline.
- [ ] No raw `fetch`; data goes through `lib/hooks` → `lib/api.ts`.
- [ ] No sibling-route imports, no new `export *` barrels, `@/` alias for non-local imports.
- [ ] Pure logic is in a `.ts` helper with a unit test; the component has a colocated RTL test.
- [ ] Strings are in `messages/`, colours use `var(--token)`, contract types come from `@devdigest/shared`. A changed contract means updating both vendored copies.
- [ ] Naming follows root `AGENTS.md`: kebab-case modules, PascalCase component folder and file, `useXxx`, `UPPER_SNAKE`.
- [ ] No Next 16-only API (`proxy.ts`, `"use cache"`, the `error.tsx` `retry` prop). We are on Next 15.

## Related

- Current wiring facts (providers, query keys, SSE, error→toast policy): [client/docs/ui-architecture.md](../../../client/docs/ui-architecture.md)
- Performance and React anti-patterns: `react-best-practices` · Next.js file conventions and APIs: `next-best-practices` · Tests: `react-testing-library`
- Sources, version history and how to update this skill: [README.md](README.md)
