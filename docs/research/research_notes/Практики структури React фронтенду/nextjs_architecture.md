# Next.js 15 App Router + React 19 architecture — curated sources

Research date: 2026-10-10. **[V]** = fetched; **[U]** = from memory/search only, needs a check.
`nextjs.org/docs/...` now serves **Next.js 16.4**; for Next 15 wording use the pinned `nextjs.org/docs/15/...` (confirmed, v15.5.27).
Tiers: official / expert / community.

## A. Project organization

| # | Source | Org / Author | URL | Year | Concrete rule(s) | Tier |
|---|---|---|---|---|---|---|
| 1 | Project structure and organization [V] | Next.js docs | https://nextjs.org/docs/app/getting-started/project-structure (v15: https://nextjs.org/docs/15/app/getting-started/project-structure) | 2025–26 | A route is public only with `page`/`route`, so colocation is safe. `_folder` opts out of routing (separate UI from routing, avoid future clashes). `(group)` organises by section/team, scopes layouts, multiple root layouts, no URL change. Three strategies: outside `app`, top-level inside `app`, split by feature/route. "Pick one and be consistent." Render order: layout > template > error > loading > not-found > page. | official |
| 2 | FSD: Usage with Next.js [V] | FSD team | https://feature-sliced.design/docs/guides/tech/with-nextjs | 2024–25 | Next `app/` at root, FSD layers in `src/`; rename FSD `app`/`pages` to `_app`/`_pages`; route files only re-export from `@/_pages/*`; server-only exports in `index.server.ts`. | community |
| 3 | Bulletproof React project-structure.md [V] + `apps/nextjs-app` | Alan Alickovic | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md · https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app | 2024–25 | Feature folder holds only what it needs. **shared → features → app**. No cross-feature imports; compose at app layer. ESLint `import/no-restricted-paths`. | expert/community |
| 4 | next-forge: Structure [V] | Vercel (Hayden Bleasel) | https://www.next-forge.com/docs/structure | 2024–26 | Turborepo; `apps/*` independently deployable, `packages/*` isolate shared code; each app composes its own `env.ts`; `turbo boundaries`. | official-adjacent |
| 5 | Taxonomy [V], archived | shadcn | https://github.com/shadcn-ui/taxonomy | 2023 | **Anti-reference**: Next 13 preview; README says it "does not reflect current best practices". | community (deprecated) |
| 6 | vercel/next.js `examples/` [U] | Vercel | https://github.com/vercel/next.js/tree/canary/examples | ongoing | Official small examples; quality varies — prefer docs patterns. | official |

## B. Server/Client Component boundaries

| # | Source | Org / Author | URL | Year | Concrete rule(s) | Tier |
|---|---|---|---|---|---|---|
| 7 | Server and Client Components [V] | Next.js docs | https://nextjs.org/docs/app/getting-started/server-and-client-components | 2025–26 | `'use client'` on interactive leaves, not big subtrees. Everything a client file imports joins the client bundle; Server Components passed as `children`/props do not. Pass server UI through `children` slots (`<Modal><Cart/></Modal>`). Providers in a client file, rendered as deep as possible. Wrap third-party client components in your own `'use client'` file. `import 'server-only'`/`'client-only'` against "environment poisoning". Props must be serializable. | official |
| 8 | The Server and Client Boundary (guide) [U] | Next.js docs | https://nextjs.org/docs/app/guides/server-and-client-boundary | 2026 | Deeper explanation; linked from #7 in 16.x docs. | official |
| 9 | `'use client'` reference [V] | React team | https://react.dev/reference/rsc/use-client | 2024–25 | Marks a **module-graph** boundary, not render-tree. Same component can be server or client depending on importer. Serializable props: primitives, plain objects, Date/Map/Set, JSX, Promises, Server Functions; not functions or class instances. | official |
| 10 | Server Components / `'use server'` / Server Functions [U] | React team | https://react.dev/reference/rsc/server-components · https://react.dev/reference/rsc/use-server · https://react.dev/reference/rsc/server-functions | 2024–25 | Server Components default and may be async. `'use server'` marks Server Functions; their args are untrusted input. | official |
| 11 | vercel-labs/agent-skills: `composition-patterns`, `react-best-practices` [V] | Vercel | https://github.com/vercel-labs/agent-skills | 2025–26 | Compound components, no boolean-prop sprawl, state in providers, `children` over render props. `react-best-practices` is **performance-focused**. | official (Labs) |

## C. Data access, business logic, Server Actions vs Route Handlers

| # | Source | Org / Author | URL | Year | Concrete rule(s) | Tier |
|---|---|---|---|---|---|---|
| 12 | How to Think About Security in Next.js [V] | Sebastian Markbåge / Vercel | https://nextjs.org/blog/security-nextjs-server-components-actions | Oct 2023 | Pick **one** data model: HTTP APIs (existing orgs), **DAL** (new projects), component-level (prototypes). DAL checks user, returns **DTOs**; only DAL touches `process.env`/DB. No mutations during render. Audit `"use client"` props, `"use server"` args, `[param]` folders, middleware/route files. | official/expert |
| 13 | Data security guide [V] | Next.js docs | https://nextjs.org/docs/app/guides/data-security | 2025–26 | Current version of #12. DAL server-only, authz, DTOs. **DAL for mutations too; `'use server'` actions thin** (validate → DAL → `revalidatePath`). Every exported action is a public POST endpoint — re-check authn **and** authz. | official |
| 14 | Authentication guide [V] | Next.js docs | https://nextjs.org/docs/app/guides/authentication | 2025–26 | `app/lib/dal.ts` with `verifySession = cache(...)` + `server-only`. Proxy/middleware only optimistic cookie checks. Don't rely on layout auth checks (layouts don't re-render on navigation). Actions in `app/actions/auth.ts`. | official |
| 15 | Fetching Data [V] | Next.js docs | https://nextjs.org/docs/app/getting-started/fetching-data | 2025–26 | Fetch in the Server Component that needs data; `fetch` memoized, ORM calls in `React.cache`; `Promise.all`; un-awaited promise → client `use()`; `preload()` next to consumer; SWR/React Query only when client fetching is needed. | official |
| 16 | Backend for Frontend [V] | Next.js docs | https://nextjs.org/docs/app/guides/backend-for-frontend | 2025–26 | **Server Components should not fetch your own Route Handlers.** Route Handlers = public HTTP endpoints (webhooks, OAuth callbacks, non-HTML, proxying). Server Actions = **mutations only** (queued → sequential if used for fetching). Client fetching for browser-only APIs/polling. | official |
| 17 | Error Handling [V] | Next.js docs | https://nextjs.org/docs/app/getting-started/error-handling | 2025–26 | Expected errors = **return values** (`useActionState`). Unexpected → nearest `error.tsx` (`'use client'`). `notFound()` + `not-found.tsx`. `global-error.tsx` needs own `<html>/<body>`. Boundaries don't catch event-handler errors. | official |
| 18 | `loading.js` / streaming (in #15) [V] | Next.js docs | (same as #15) | 2025–26 | `loading.tsx` wraps `page` **only**; a layout reading `cookies()`/uncached data blocks navigation. `<Suspense>` close to dynamic access; route groups to scope `loading.tsx`. | official |

## D. TanStack Query in the App Router

| # | Source | Org / Author | URL | Year | Concrete rule(s) | Tier |
|---|---|---|---|---|---|---|
| 19 | Advanced Server Rendering [V] | TanStack (TkDodo) | https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr | 2024–26 | `getQueryClient()` new on server, singleton in browser. Prefetch in RSC → `<HydrationBoundary state={dehydrate(qc)}>`. v5.40+ streams pending queries. "Treat Server Components as a place to prefetch data, nothing more." Don't also render query data in the RSC. | official (lib) |
| 20 | You Might Not Need React Query [V] | TkDodo | https://tkdodo.eu/blog/you-might-not-need-react-query | May 2023 | New Next app: RSC fetching + Server Actions usually enough. Add React Query for infinite/client pagination, polling/refetch-on-focus, offline, interactive client caches. | expert |

## E. Agent skills / knowledge packs

| # | Source | Org | URL | Year | Notes | Tier |
|---|---|---|---|---|---|---|
| 21 | vercel-labs/next-skills → `next-best-practices` [V, relocated] | Vercel Labs | https://github.com/vercel-labs/next-skills | 2025–26 | Moved into vercel/next.js (`npx skills add vercel/next.js`). Next 16.3+ generates `AGENTS.md`/`CLAUDE.md`, docs at `next/dist/docs/`. `next-best-practices` already installed locally — don't duplicate. | official (experimental) |
| 22 | vercel-labs/agent-skills [V] | Vercel | https://github.com/vercel-labs/agent-skills | 2025–26 | See #11. | official (Labs) |

Optional [U]: Dan Abramov overreacted.io 2025 ("JSX Over the Wire", "Impossible Components"); Josh Comeau "Making Sense of React Server Components" (2023).

## Next.js 15 vs 16 — architecture-relevant differences
- **`middleware.ts` → `proxy.ts`** (Next 16, 2025-10-21, https://nextjs.org/blog/next-16 [V]); Node runtime; `middleware.ts` deprecated (Edge). Both: optimistic checks only.
- **Cache Components / `"use cache"`** (`cacheComponents: true`, replaces `experimental.dynamicIO`/`ppr`): caching opt-in. Next 15: implicit rules + `unstable_cache`. `'use cache: private'` for per-request values.
- **Cache APIs:** `revalidateTag(tag, profile)` needs a cacheLife profile; new `updateTag()` (Server Actions, read-your-writes) and `refresh()`.
- **Async request APIs:** 15 made `params`/`searchParams`/`cookies()`/`headers()` async with sync fallback; 16 removes sync access.
- **Parallel routes:** every slot needs `default.js` in 16.
- **Error boundaries:** 16.4 `error.tsx` receives `retry` (15: `reset`); new `catchError()` from `next/error` (minor version unchecked).
- **`next lint` removed** in 16 → use ESLint directly.
- **React 19.2** in 16: `<Activity>`, `useEffectEvent`, View Transitions. Next 15 ships React 19.0/19.1.

## Gaps
- Use pinned `/docs/15/` URLs for Next 15 behaviour.
- #12–14 (DAL) and #16 (don't fetch own Route Handlers / via Server Actions) are the strongest official sources for "where business logic lives".
- No official source prescribes a single folder layout — opinion must come from #2–#4.
