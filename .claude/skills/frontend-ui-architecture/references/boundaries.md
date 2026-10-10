# Boundaries: imports, barrel files, Server/Client, enforcement

Read this when adding imports or `index.ts` files, deciding on `"use client"`, or proposing lint rules.

## Contents
1. Import direction
2. Barrel files
3. Server / Client boundary
4. Next.js 15 vs 16
5. Enforcement (proposal only)

## 1. Import direction

```
vendor/ui, vendor/shared  →  lib/  →  components/  →  app/**
```

- An arrow means "may be imported by". Code never imports against the arrow.
- Sibling routes never import each other's `_components`. A parent route's `_components` may be used by its child routes.
- Two routes needing the same thing triggers a promotion to `components/` or `lib/`. Don't reach across.
- Use the `@/` alias for anything outside the current folder. Relative paths only for siblings and children (`./styles`, `./_components/X`). When you touch a file with `../../../../lib/...` chains, switch it to `@/lib/...`.

Why: one-directional dependencies keep shared code reusable and any route deletable. This is Bulletproof React's shared → features → app, which Wieruch and Feature-Sliced Design also follow.

## 2. Barrel files

A barrel is a file that only re-exports other modules.

- **OK:** the one-line `index.ts` in each component folder (`export { FindingCard } from "./FindingCard";`). It's the house convention, it re-exports one module, and it gives readable import paths. Comeau and FSD both endorse per-component index files.
- **Avoid adding:** aggregating barrels (`export *` over many modules, e.g. a `components/index.ts`). Measured costs:
  - Barrels load the whole module graph even for one import. TkDodo saw 11k → 3.5k modules after removing them; Atlassian cut build time per commit by 75%.
  - They create import cycles.
  - Tree-shaking can't help, because it is a bundler feature, not a runtime feature (Vercel).

  `lib/hooks/index.ts` is an existing aggregating barrel. Don't extend the pattern, and prefer importing from the domain file (`@/lib/hooks/reviews`).
- **Never** import through your own folder's `index.ts` from inside that folder. It's the classic cycle.

## 3. Server / Client boundary

Facts about today's client:
- Almost everything is a Client Component.
- `app/layout.tsx` and `i18n/request.ts` run on the server.
- `agents/page.tsx` and `settings/[section]/page.tsx` are thin server entries that render a client view.

Rules:
- `"use client"` marks a **module-graph** boundary: every module a client file imports becomes client code. Put the directive at the highest file that needs interactivity, and no higher. For new pages, prefer the thin-server-entry → client-view shape.
- Server Components passed as `children` or props to a client component stay server-rendered. That's how to keep server content inside a client wrapper.
- Providers are client components that wrap `{children}`, mounted as deep as possible. A provider only one subtree needs is mounted in that subtree.
- Props crossing the boundary must be serializable: primitives, plain objects, arrays, Date/Map/Set, JSX, promises. Not functions or class instances.
- Server-only modules (secrets, `node:fs`) get `import "server-only"`, so an accidental client import fails the build.

## 4. Next.js 15 vs 16

`nextjs.org/docs/*` now shows Next **16**. For Next 15 behaviour use the pinned `nextjs.org/docs/15/...` pages. These are **16-only and must not be suggested here**:

| Next 16 | Next 15 equivalent |
|---|---|
| `proxy.ts` | `middleware.ts` |
| `"use cache"` / Cache Components / `updateTag` / `refresh` | `fetch` cache options, `unstable_cache`, `revalidateTag(tag)` |
| `error.tsx` receives `retry` | `reset` |
| Sync request APIs removed | `params` / `searchParams` / `cookies()` async, with a deprecated sync fallback |
| `next lint` removed | `next lint` still exists; plain ESLint works too |
| React 19.2 (`<Activity>`, `useEffectEvent`) | React 19.0 / 19.1 |

## 5. Enforcement (proposal only)

`client/` has no import-boundary lint today. If drift becomes a problem, propose these to the user, because adding a dev dependency changes the lock file:

| Tool | What it enforces |
|---|---|
| `import/no-restricted-paths` (eslint-plugin-import) | Zones: `lib` ↛ `app`, `components` ↛ `app`, `app/<a>` ↛ `app/<b>`. Cheapest option; used by Bulletproof React. |
| `import/no-cycle` | Import cycles (slow on big graphs). |
| eslint-plugin-boundaries | Element types with allow/deny rules; more expressive than zones. |
| dependency-cruiser | Same rules from the CLI, plus graphs and orphan detection. |
| Knip | Unused files and exports; has a Next.js plugin. |
| eslint-plugin-unicorn `filename-case` | kebab-case modules; can also allow PascalCase for component files. |
| Steiger | Only if the project ever adopts Feature-Sliced Design. Beta. |
