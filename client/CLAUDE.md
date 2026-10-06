# client — @devdigest/web

Next.js 15 (App Router) + React 19 + TanStack Query 5 + Tailwind 4 + next-intl 3, port 3000. Package manager: **pnpm**.

## Read When
- [README.md](README.md) — when you need the route map at a glance or which API endpoints a page hits.
- [docs/ui-architecture.md](docs/ui-architecture.md) — before adding a page, hook, provider or shared component (server/client boundary, query keys, error→toast policy, SSE, styling, i18n).
- [specs/pages.md](specs/pages.md) — before changing a route's query params, data, UI states or interactions.
- [specs/run-cost-badge.md](specs/run-cost-badge.md) — before touching cost display (PR list COST, run timeline, trace stats) or `src/lib/format-cost.ts`.
- [specs/findings-severity.md](specs/findings-severity.md) — before touching severity counters, the findings popover or Review-run pills/filters.
- [../TESTING.md](../TESTING.md) — before writing or restructuring tests.
- New feature with no spec in [specs/](specs/) → propose one first.

## Commands
- `pnpm dev` · `pnpm typecheck` · `pnpm test` (vitest + jsdom, fetch mocked — no API needed)

## Where things live
- `src/app/**/page.tsx` — routes; pages are thin
- `src/app/**/_components/<Name>/` — feature components, each with a colocated `*.test.tsx`
- `src/lib/api.ts` — the only HTTP client · `src/lib/hooks/*` — every data hook (TanStack Query)
- `src/components/app-shell` — nav, breadcrumbs, keyboard shortcuts
- `messages/<locale>/*.json` — i18n strings · `src/vendor/ui` — UI primitives (`@devdigest/ui`)

## Conventions
- Data access only through hooks in `src/lib/hooks` → `src/lib/api.ts`; no raw `fetch` in components.
- All user-visible text goes through `next-intl` messages, not hardcoded strings.
- New component → colocated test (React Testing Library, query by role/text).

## Gotchas
- `src/vendor/shared` is a **copy** of `server/src/vendor/shared` (canonical) and has drifted.
  Contract change → update both.
- API base comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Insights
@INSIGHTS.md
