# frontend-ui-architecture

A project skill with UI architecture and code-organization rules for `client/`:
- where things live;
- how to split components;
- data and logic layering;
- import and Server/Client boundaries.

Performance is out of scope on purpose. It's covered by `react-best-practices` and `next-best-practices`.

| | |
|---|---|
| **Version** | 1.1.0 (see `metadata.version` in [SKILL.md](SKILL.md)) |
| **Updated** | 2026-10-10 |
| **Applies to** | `client/`: Next.js 15 App Router · React 19 · TanStack Query 5 · next-intl |

## Files

| File | Loaded | Purpose |
|---|---|---|
| [SKILL.md](SKILL.md) | when the skill triggers | Principles, quick placement map, workflow, checklist |
| [references/placement.md](references/placement.md) | on demand | Full "where does X live" table, promotion rule, worked decisions |
| [references/components.md](references/components.md) | on demand | When and how to split, composition, hooks, naming |
| [references/data-and-logic.md](references/data-and-logic.md) | on demand | Layers, queries, kinds of state, errors, constants, env, types |
| [references/boundaries.md](references/boundaries.md) | on demand | Import direction, barrels, Server/Client, Next 15 vs 16, lint tools |
| [references/examples.md](references/examples.md) | on demand | Before/after examples from real `client/src` files |
| [evals/evals.json](evals/evals.json) | never (for testing) | Test prompts for checking the skill's behaviour |
| README.md | never (for humans) | This file: version, changelog, sources |

## Changelog

- **1.1.0 (2026-10-10)** — iteration 2, based on eval findings:
  - Fixed: constants whose values come from a contract enum are typed with it (`ReadonlySet<PrStatus>`). An `as const` tuple broke `.includes(p.status)` (checked with `tsc`).
  - Added: route-private URL-state and screen hooks go to `app/<route>/use-xxx.ts`, not `lib/hooks/`. Clarified that AGENTS.md "every data hook" means API hooks.
  - Added: a *planned* future consumer doesn't justify promotion. Promote in the PR that adds the real import.
  - Evals: replaced non-discriminating prompts with ones where the repo docs alone point the wrong way.
  - Result (4 new prompts, 1 run each): with skill 12/12 assertions vs 11/12 without, ~7 s faster on average. Main gain: house-convention consistency (`use-xxx.ts` route hooks, `@/` alias). The model already handles the big calls (no Server Action, no premature promotion) from the repo docs.

- **1.0.0 (2026-10-10)**
  - First versioned release.
  - Renamed from the `frontend-architecture` draft.
  - Split into a lean SKILL.md plus `references/`, following progressive disclosure.
  - Added `evals/`.

## Updating the skill

- Bump `metadata.version` in SKILL.md and add a changelog line.
  - Patch: wording or fixes.
  - Minor: a new rule or reference file.
  - Major: a changed placement rule.
- Every new rule needs a source in the table below. Add the source here first.
- When `client/` structure changes (new top-level folder, Next 16 upgrade), update `placement.md` / `boundaries.md` and bump the minor version.
- Keep SKILL.md under ~150 lines. Detail goes in `references/`.

## Sources

Every rule in the skill traces back to a source listed here.
Researched 2026-10-10. Full per-topic notes, with quotes, are in
[docs/research/research_notes/Практики структури React фронтенду/](../../../docs/research/research_notes/Практики%20структури%20React%20фронтенду/):

| Note | Covers |
|---|---|
| `folder_structure_methodologies.md` | Bulletproof, FSD, colocation, Wieruch, Comeau, Kondov, Screaming Architecture, Atomic Design |
| `business_logic_layering.md` | Layers, utils/lib, constants/env, types, API layer, barrels |
| `components_and_enforcement.md` | When to split, composition, naming, lint tools, existing agent skills |
| `official_docs.md` | react.dev, Next.js docs, TanStack/TkDodo, TypeScript |
| `nextjs_architecture.md` | App Router organisation, RSC boundary, DAL, Server Actions vs Route Handlers, 15→16 changes |
| `react_architecture.md` | Annotated React sources and where they disagree |

**Legend**
- Tier: **O** official docs · **E** recognised expert or maintainer · **C** community.
- ⚠ marks a pre-2023 source that is still canonical.
- Verification:
  - **[V]** content fetched and read.
  - **[R]** URL resolves (HTTP 200), content not read.
  - **[S]** seen only in search results (URL may resolve, content not read).
  - **[✗]** broken or blocked at check time.
- Scope: architecture only. Performance is covered by `react-best-practices` / `next-best-practices`.
- The fetch tool paraphrases. Re-check any quote against the page before using it verbatim.

## 1. Folder structure & colocation

| # | Source | Tier · Date | Ver | Rule it contributes |
|---|---|---|---|---|
| 1 | [Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) ([v15](https://nextjs.org/docs/15/app/getting-started/project-structure)) | O · 2026 | V | Unopinionated, offering 3 strategies (outside `app`, top-level inside `app`, split by route). `_private` folders aren't routable, so colocating there is safe. `(group)` folders organise without changing the URL. "Pick one and be consistent." |
| 2 | [Bulletproof React: project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | E · living | V | `features/<x>/{api,components,hooks,types,utils}` holds only the folders it needs. Imports flow **shared → features → app** and features don't import each other. Enforced with `import/no-restricted-paths`. Barrels are discouraged. |
| 3 | [Bulletproof React: project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md) | E · living | V | kebab-case files and folders (via `check-file`). A single `@/*` alias. |
| 4 | [Robin Wieruch: React Folder Structure](https://www.robinwieruch.de/react-folder-structure/) | E · 2026-05 | V | Grow the structure in stages. One-feature code lives in that feature and moves to shared once a 2nd feature needs it. `lib/` holds library wrappers, `utils/` shared helpers, `constants.ts` per feature. "Code flows in one direction." |
| 5 | [Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | E · 2025-12 | V | Organises by *type*, not feature. PascalCase component folder plus a one-line `index.ts`. `utils` = generic, `helpers` = project-specific. |
| 6 | [Kent C. Dodds: Colocation](https://kentcdodds.com/blog/colocation) | E · 2019 ⚠ | V | "Place code as close to where it's relevant as possible." Tests, state and helpers stay near where they're used. |
| 7 | [Kent C. Dodds: AHA Programming](https://kentcdodds.com/blog/aha-programming) | E · 2020 ⚠ | V | "Avoid Hasty Abstractions": prefer duplication over the wrong abstraction. |
| 8 | [Dan Abramov: react-file-structure.surge.sh](https://react-file-structure.surge.sh/) | E · ⚠ | V | "Move files around until it feels right." Don't over-design up front. |
| 9 | [Alex Kondov: Tao of React](https://alexkondov.com/tao-of-react/) | E/C · 2021 ⚠ | V | Group by module. Wrap third-party libraries. Use absolute imports. |
| 10 | [Robert C. Martin: Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html) | E · 2011 ⚠ | V | The top-level structure should name the domain, not the framework. |
| 11 | [Legacy React FAQ: File Structure](https://legacy.reactjs.org/docs/faq-structure.html) | O · superseded ⚠ | V | Feature and type grouping are both OK. Max 3–4 nesting levels. Spend ≤5 minutes choosing. |
| 12 | [Brad Frost: Atomic Web Design](https://bradfrost.com/blog/post/atomic-web-design/) | E · 2013 ⚠ | V | For a design system only (our `vendor/ui`). Not an app folder structure. |
| 12a | [Bulletproof React: repo README](https://github.com/alan2207/bulletproof-react) | E | V | "An opinionated guide", not a template. Ships Vite, Next App Router and Next Pages samples. |
| 12b | [Bulletproof React: `apps/nextjs-app` sample](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app) | E | R | Reference App Router app using `features/`. |
| 12c | [dev.to: Screaming Architecture for frontend](https://dev.to/sergioazoc/screaming-architecture-the-key-to-a-scalable-frontend-1e8l) | C | S | `components/ hooks/ utils/` "scream React". Name top-level folders by domain. |
| 12d | [Andela: Atomic Design in React](https://andela.com/insights/structuring-your-react-application-atomic-design-principles) | C | S | Atomic folders for apps: shared vocabulary, but categorisation pain. |
| 12e | [dev.to: A better way to structure React projects](https://dev.to/krisguzman_dev/a-better-way-to-structure-react-projects-96a) | C | S | Atomic-folder critique (navigation, subjectivity). |

## 2. Feature-Sliced Design (FSD)

| # | Source | Tier | Ver | Rule |
|---|---|---|---|---|
| 13 | [FSD: Overview](https://feature-sliced.design/docs/get-started/overview) | E | V | Layers app → pages → widgets → features → entities → shared. Imports only go to lower layers. No imports between slices on the same layer. |
| 14 | [FSD: Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) | E | V | Segments `ui / api / model / lib / config`. Name folders by purpose; "components, hooks, types are bad segment names". |
| 15 | [FSD: Public API](https://feature-sliced.design/docs/reference/public-api) | E | V | An index file per slice acts as its contract. No wildcard re-exports. `shared/ui` gets one index per component. |
| 16 | [FSD: Migration v2.0 → v2.1](https://feature-sliced.design/docs/guides/migration/from-v2-0) | E | V | "Pages first": keep UI and logic in the page and extract only on reuse. |
| 17 | [FSD: Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) | E | V | Uses `_app`/`_pages` layers. `index.server.ts` keeps server code out of client bundles. |
| 17a | [Habr: FSD criticism](https://habr.com/ru/post/904426) | C | S | "Architectural overkill on small projects", high entry threshold. |

## 3. Component design & splitting

| # | Source | Tier · Date | Ver | Rule |
|---|---|---|---|---|
| 18 | [react.dev: Thinking in React](https://react.dev/learn/thinking-in-react) | O | V | "A component should ideally only be concerned with one thing." Keep state minimal and put it in the closest common parent. |
| 19 | [react.dev: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | O | V | Hooks share logic, not state. Use the `use` prefix only if the function calls hooks. No `useMount`-style hooks. Not every duplicate needs a hook. |
| 20 | [react.dev: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | O | V | Derive values in render. User actions go in handlers. Effects are only for syncing with external systems. |
| 21 | [react.dev: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | O | V | No redundant or duplicated state. Store IDs, not copies. |
| 22 | [Dan Abramov: Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | E · 2019 note ⚠ | V (via [mirror](https://readmedium.com/smart-and-dumb-components-7ca2f9a7c7d0)) | "I don't suggest splitting your components like this anymore": hooks replace the split. |
| 23 | [Dan Abramov: Before You memo()](https://overreacted.io/before-you-memo/) | E · 2021 ⚠ | R | Move state down. Lift content up through `children`. Cited here as a composition technique. |
| 24 | [Kent C. Dodds: When to break up a component](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) | E · ~2020 ⚠ | V | Split when it hurts (reuse, state complexity, testing), not before. |
| 25 | [Kent C. Dodds: Compound Components with Hooks](https://kentcdodds.com/blog/compound-components-with-react-hooks) | E · 2019 ⚠ | V | Parent and children share implicit state through Context with a guarded `useXContext`. |
| 26 | [patterns.dev: Compound Pattern](https://www.patterns.dev/react/compound-pattern/) | E | V | Use Context, not `cloneElement`, for compound components. |
| 27 | [TkDodo: Component Composition is great btw](https://tkdodo.eu/blog/component-composition-is-great-btw) | E · 2024 | V | Early returns plus an extracted layout component instead of tangled conditionals. |
| 28 | [Vercel agent-skills: composition-patterns](https://github.com/vercel-labs/agent-skills) | O-Labs · 2025 | V | Avoid boolean props. Use compound components, explicit variants, and `children` over `renderX`. |
| 29 | [Juntao Qiu: Headless Component](https://martinfowler.com/articles/headless-component.html) | E · 2023 | V | A custom hook holds the "brain" (state and logic); the component is the "looks". |
| 30 | [Kent C. Dodds: Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | E · 2020 ⚠ | V | Server cache is separate from UI state. Keep state local and providers scoped. |
| 31 | [Bulletproof React: state-management.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md) | E | V | 5 kinds of state: component / app / server cache / form / URL. Each gets its own tool and stays as local as possible. |
| 31a | [react.dev: Importing and Exporting Components](https://react.dev/learn/importing-and-exporting-components) | O | V | Split into files to "keep your files easy to scan and reuse components in more places". |
| 31b | [react.dev: Keeping Components Pure](https://react.dev/learn/keeping-components-pure) | O | V | Same inputs → same JSX. Side effects go in handlers. |
| 31c | [react.dev: Passing Props (children)](https://react.dev/learn/passing-props-to-a-component) | O | V | A `children` prop is a "hole" the parent fills. Use it for visual wrappers. |
| 31d | [react.dev: Responding to Events](https://react.dev/learn/responding-to-events) | O | V | `handleX` for handlers, `onX` for handler props, named after app interactions. |
| 31e | [react.dev: Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) | O | V | Lift state to the closest common parent. One source of truth per piece of state. |
| 31f | [react.dev: React Compiler](https://react.dev/learn/react-compiler/introduction) | O · 2025 | V | Auto-memoization means memoization shouldn't drive how components are split. |
| 31g | [patterns.dev: Container/Presentational](https://www.patterns.dev/react/presentational-container-pattern/) | E | V | "Can be replaced with React Hooks." |
| 31h | [Vercel: composition-patterns SKILL (dir)](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns) · [raw](https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/composition-patterns/SKILL.md) | O-Labs | V | Boolean props, compound components, providers, `children` over render props. |
| 31i | [Fernando Rojo: "Composition Is All You Need" (summary)](https://www.issoh.co.jp/tech/details/10199/) | C | ✗ (403) | Each boolean prop doubles the states. Talk itself not watched. |
| 31j | [TkDodo: React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager) | E · 2021 ⚠ | V | The query cache is the server-state store. Don't copy it into local state. |

## 4. Business logic, layering, data access

| # | Source | Tier · Date | Ver | Rule |
|---|---|---|---|---|
| 32 | [Juntao Qiu: Modularizing React Applications](https://martinfowler.com/articles/modularizing-react-apps.html) | E · 2023 | V | View → hooks → domain (plain TS, no React) → gateway/API. Domain code is unit-testable without UI. |
| 33 | [TkDodo: The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | E · 2024 | V | Bundle key and fn in `queryOptions`. "Separating QueryKey from QueryFunction was a mistake." |
| 34 | [TkDodo: Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) | E · 2026-02 | V | "custom hooks are just not the right abstraction here". `queryOptions` comes first; build hooks on top only if they add logic. |
| 35 | [TkDodo: Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | E · 2021/22 ⚠ | V | Keys live with the feature. One key factory per feature. Order keys from generic to specific. |
| 36 | [TkDodo: Practical React Query](https://tkdodo.eu/blog/practical-react-query) | E · 2020/23 ⚠ | V | Don't copy query data into `useState`. Server state is "borrowed". Its "always wrap in a custom hook" advice is superseded by #34. |
| 37 | [TkDodo: You Might Not Need React Query](https://tkdodo.eu/blog/you-might-not-need-react-query) | E · 2023 | V | With RSC, add React Query only for polling, infinite lists or interactive caches (our case: polling and SSE). |
| 38 | [TanStack Query: Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) | O-lib | V | Server Components only prefetch. Use `HydrationBoundary`. `getQueryClient()` creates a new client on the server and reuses a singleton in the browser. |
| 39 | [TanStack Query: Query Options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options) / [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) | O-lib | R | Official reference for #33/#35. |

## 5. Next.js App Router architecture

| # | Source | Tier · Date | Ver | Rule |
|---|---|---|---|---|
| 40 | [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | O | V | `'use client'` on interactive leaves. Pass server UI as `children`. Providers go as deep as possible. Use `server-only` / `client-only`. Props must be serializable. |
| 41 | [Next.js: The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | O · 2026 | R | Deeper treatment of #40. |
| 42 | [react.dev: 'use client'](https://react.dev/reference/rsc/use-client) | O | V | A module-graph boundary, not a render-tree one. Lists which props are serializable. |
| 43 | [react.dev: Server Components](https://react.dev/reference/rsc/server-components) | O | R | Server Components are the default and can be async. `'use server'` arguments are untrusted. |
| 44 | [Next.js: Data security guide](https://nextjs.org/docs/app/guides/data-security) | O · 2026 | V | DAL with `server-only`, auth checks and minimal DTOs. Actions stay thin. "Only the DAL should access `process.env`". Pick one data model and don't mix. |
| 45 | [Sebastian Markbåge: How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) | O/E · 2023 | V | Original DAL / HTTP-API / component-level models. Our client follows the **HTTP API** model. |
| 46 | [Next.js: Authentication guide](https://nextjs.org/docs/app/guides/authentication) | O | V | `lib/dal.ts` with `verifySession = cache(…)`. Don't rely on auth checks in layouts. |
| 47 | [Next.js: Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) | O | V | Fetch in the component that needs the data. Use client libraries only when client fetching is needed. `loading.tsx` wraps only the page. |
| 48 | [Next.js: Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) | O | V | Server Components shouldn't fetch your own Route Handlers. Server Actions are for mutations only. |
| 49 | [Next.js: Error Handling](https://nextjs.org/docs/app/getting-started/error-handling) | O | V | Expected errors are return values. Unexpected ones go to `error.tsx` (client). Use `notFound()`. |
| 50 | [Next.js: Environment variables](https://nextjs.org/docs/app/guides/environment-variables) | O | V | Only `NEXT_PUBLIC_*` reaches the browser, and it's inlined at build time. |
| 51 | [Next.js 16 release notes](https://nextjs.org/blog/next-16) | O · 2025-10 | V | 16-only: `proxy.ts`, `"use cache"`, sync request APIs removed, `next lint` removed. **We are on Next 15.** |
| 52 | [next-forge: Structure](https://www.next-forge.com/docs/structure) | O-adj | V | Monorepo `apps/*` + `packages/*`. Each app has its own `env.ts`. |
| 53 | [shadcn: Taxonomy](https://github.com/shadcn-ui/taxonomy) | C · 2023 | V | **Anti-reference**: archived, "does not reflect current best practices". |
| 53a | [react.dev: 'use server'](https://react.dev/reference/rsc/use-server) · [Server Functions](https://react.dev/reference/rsc/server-functions) | O | R | Server Function arguments are untrusted input. |
| 53b | [vercel/next.js examples](https://github.com/vercel/next.js/tree/canary/examples) | O | R | Official small examples. Quality varies; prefer the docs. |
| 53c | [Vercel blog: How to think about security in Next.js](https://vercel.com/blog/how-to-think-about-security-in-next-js) | O | ✗ (404) | Moved. Use #44 / #45. |
| 53d | [Next.js: ESLint config](https://nextjs.org/docs/app/api-reference/config/eslint) | O | V | `eslint-config-next` presets. `next lint` removed in 16. |
| 53e | [Next.js: optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports) | O | V | Barrel optimisation for third-party packages only. |

## 6. Constants, types, config

| # | Source | Tier · Date | Ver | Rule |
|---|---|---|---|---|
| 54 | [TypeScript 3.4: const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html) | O · 2019 ⚠ | V | `as const` gives literal, readonly types. |
| 55 | [Zod: Basics](https://zod.dev/basics) | O | V | Use `z.infer<typeof Schema>` so the schema is the single source of truth. |
| 56 | [T3 Env](https://env.t3.gg/docs/introduction) | E | V | One validated `env.ts`. Server variables throw if read on the client. |
| 57 | [Total TypeScript: Where to put your types](https://www.totaltypescript.com/where-to-put-your-types-in-application-code) | E | R | Colocate single-use types and share multi-use ones. No app types in `.d.ts`. |
| 57a | [T3 Env: Next.js](https://env.t3.gg/docs/nextjs) | E | V | Import `env.ts` in `next.config` so env is validated at build time. |
| 57b | [TypeScript 3.8: `import type`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html) | O · 2020 ⚠ | V | Type-only imports are fully erased at runtime. |
| 57c | [Total TypeScript: declaration files for types?](https://totaltypescript.com/workshops/typescript-pro-essentials/types-you-don't-control/should-you-use-declaration-files-to-store-your-types) | E | S | Putting app types in `.d.ts` "is a mistake". |
| 57d | [dev.to: Your utils folder is a crime scene](https://dev.to/nurrehman/your-utils-folder-is-a-crime-scene-5095) | C | S | A catch-all `utils/` loses domain context. |
| 57e | [Peerlist: The global utils trap](https://peerlist.io/nunosilva/articles/the-global-utils-trap) | C | ✗ (403) | Same junk-drawer argument. |

## 7. Barrel files

| # | Source | Tier · Date | Ver | Rule |
|---|---|---|---|---|
| 58 | [TkDodo: Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | E · 2024 | V | They cause cycles and load the whole module graph (11k → 3.5k modules after removal). OK only for a library entry point. |
| 59 | [Marvin Hagemeister: The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/) | E · 2023 | V | Module-graph cost measured. Removing barrels made tasks 60–80% faster. |
| 60 | [Vercel: How we optimized package imports](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) | O · 2023 | V | "Tree-shaking is a bundler feature… not a runtime feature." |
| 61 | [Atlassian: 75% faster builds by removing barrel files](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files) | O-data · 2025 | V | Build time per commit −75%, CI tests −88%. Trade-off: lost encapsulation. |

## 8. Enforcement tools

| # | Tool | Ver | Use |
|---|---|---|---|
| 62 | [eslint-plugin-import `no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | V | Zones `{target, from, except}`. Cheapest way to enforce shared → route. |
| 63 | [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | V | Element types plus allow/deny rules. More expressive. |
| 64 | [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | V | Forbidden/allowed rules, cycles, orphans, graphs. |
| 65 | [Steiger](https://github.com/feature-sliced/steiger) | V | FSD linter (beta). |
| 66 | [Knip](https://knip.dev) | V | Unused files and exports. Has a Next plugin. |
| 67 | [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks) | R | Includes Compiler rules, e.g. no components defined inside components. |
| 67a | [eslint-plugin-import `no-cycle`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md) | V | Detects cycles. "Comparatively computationally expensive". |
| 67b | [jsboundaries.dev](https://www.jsboundaries.dev/) | V | Docs site for eslint-plugin-boundaries. |
| 67c | [eslint-plugin-unicorn `filename-case`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/filename-case.md) | V | Enforce kebab-case. `cases` can allow kebab + Pascal together. |

## 9. Existing skills (to avoid duplication)

| # | Source | Note |
|---|---|---|
| 68 | [vercel-labs/next-skills](https://github.com/vercel-labs/next-skills) | Moved into vercel/next.js. Already installed here as `next-best-practices`. |
| 69 | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `react-best-practices` is performance-only. `composition-patterns` is #28. |
| 70 | [anthropics/skills](https://github.com/anthropics/skills) | `SKILL.md` frontmatter format. |
| 71 | [InfoQ: Vercel's React Best Practices skill](https://www.infoq.com/news/2026/02/vercel-react-best-practices/) | (B · 2026-02) Confirms Vercel's skill is performance-oriented. |
| 72 | [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) | (C) Community `.mdc` rule sets (React, Next 15, TanStack). Not inspected per file. |
| 73 | [cursor.directory: React rules](https://cursor.directory/rules/react) | (C) ✗ (429), not verified. |
| 74 | [skills.sh: react-composition-patterns](https://www.skills.sh/tech-leads-club/agent-skills/react-composition-patterns) | (C) Third-party repackaging of Vercel's composition skill. |
| 75 | [Vercel react-best-practices SKILL (raw)](https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/SKILL.md) | (O-Labs) Performance rules. Not duplicated here. |

## 10. File naming (where sources disagree)

| # | Source | Tier | Ver | Position |
|---|---|---|---|---|
| 76 | [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react) | E · class-era ⚠ | V | PascalCase filenames (`ReservationCard.jsx`). |
| 77 | [Very: The design behind kebab-case-ing our React apps](https://www.verytechnology.com/insights/the-design-behind-kebab-case-ing-our-react-apps) | C · undated | V | kebab-case avoids case-sensitivity rename bugs across OSes. |
| 78 | [zenn.dev: file naming in React](https://zenn.dev/suba/articles/3fe4ba681233da?locale=en) | C | S | Match your UI library: shadcn kebab-case vs MUI PascalCase. |

The house rule (root `AGENTS.md`) is kebab-case for modules and PascalCase for component folders and files. The skill follows it.

## Where the sources disagree (and what the skill picks)

| Topic | Side A | Side B | Skill's choice for `client/` |
|---|---|---|---|
| Feature vs type folders | Feature: Bulletproof, Wieruch, Kondov, FSD | Type: Comeau | **Route-first colocation** (`app/<route>/_components`), plus type-named shared folders (`components/`, `lib/`). This is the existing layout. |
| Barrel files | Against: TkDodo, Atlassian, Hagemeister, Bulletproof | Allowed: Comeau (per component), FSD and Wieruch (public API) | A one-line per-component `index.ts` is OK (house convention). No new aggregating `export *` barrels. |
| File casing | kebab-case: Bulletproof, Wieruch, Next docs, shadcn | PascalCase: Comeau, Airbnb | **House rule** (root AGENTS.md): kebab-case modules, PascalCase component folders and files. |
| Query abstraction | Wrap each `useQuery` in a custom hook (TkDodo 2020, current `lib/hooks`) | `queryOptions` first (TkDodo 2024/2026) | Keep the existing hooks. New queries should prefer `queryOptions` factories that a hook wraps. |
| How much structure | FSD: formal layers | Abramov, Kent, legacy React: don't over-design | Lightweight: colocate, then promote on 2nd use. No FSD. |
| Where logic lives | Fowler/Qiu: domain in plain TS | Abramov, TkDodo: logic in hooks | Both. Pure derivation goes in `.ts` helpers; hooks only glue them to state or queries. |
