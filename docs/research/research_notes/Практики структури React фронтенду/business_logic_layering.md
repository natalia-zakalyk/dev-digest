# Business logic, utils, constants, types, API layer and barrel files in a modern React/Next.js frontend (2023–2026)

Research date: 2026-10-10. Every URL fetched and resolved during the session unless marked "(search snippet only, not fetched)".
Authority: **A** = official docs / framework maintainers / primary engineering blog with data · **B** = recognised individual expert or widely used reference repo · **C** = community post / opinion.

## Annotated source list

| # | Source | Author | Date | Authority |
|---|---|---|---|---|
| 1 | [Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | Juntao Qiu (martinfowler.com) | 2023-02-16 | A/B |
| 2 | [Headless Component: a pattern for composing React UIs](https://martinfowler.com/articles/headless-component.html) | Juntao Qiu (martinfowler.com) | 2023-11-07 | A/B |
| 3 | [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | React team | living doc | A |
| 4 | [The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | Dominik Dorfmeister (TkDodo) | 2024-01-17 | B (maintainer) |
| 5 | [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | TkDodo | 2021-06-13, upd. 2022-04-23 (**pre-2023**) | B |
| 6 | [How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security) | Next.js docs | 2026-10-06 (v16.4) | A |
| 7 | [Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | Next.js docs | 2026-07-21 | A |
| 8 | [How to use environment variables in Next.js](https://nextjs.org/docs/app/guides/environment-variables) | Next.js docs | 2026-08-25 | A |
| 9 | [T3 Env: Introduction](https://env.t3.gg/docs/introduction) / [Next.js](https://env.t3.gg/docs/nextjs) | T3 OSS | living doc | B |
| 10 | [Zod: Basic usage](https://zod.dev/basics) | Zod docs | living doc (v4) | A |
| 11 | [TypeScript 3.4: const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html) | Microsoft TS team | 2019 (**pre-2023, canonical**) | A |
| 12 | [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | TkDodo | 2024-07-26 | B |
| 13 | [The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/) | Marvin Hagemeister | 2023-10-08 | B (measured) |
| 14 | [How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) | Shu Ding (Vercel) | 2023-10-13 | A |
| 15 | [75% Faster Builds by Removing Barrel Files](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files) | Tim Sebastian (Atlassian) | 2025-06-26 | A (primary data) |
| 16 | [Bulletproof React: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Alan Alickovic | living | B |
| 17 | [FSD: Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) | FSD | no date | B |
| 18 | [React Folder Structure in 5 Steps](https://www.robinwieruch.de/react-folder-structure/) | Robin Wieruch | 2026-05-05 | B |
| 19 | [Colocation](https://kentcdodds.com/blog/colocation) | Kent C. Dodds | 2019-06-17 (**pre-2023**) | B |

## 1. What is "business logic" on the frontend and where does it go?

### Takeaway
Dominant 2023–2026 position (Fowler/Qiu, React docs, TkDodo): **view (JSX) → hooks (state/effects glue) → domain model (pure TS) → network/gateway**. Business rules live in plain TypeScript without React/HTTP, so they are unit-testable and survive UI rewrites. Hooks are thin "headless" adapters; components render.

### Cited Findings
- "Frontend applications should not be treated too differently from regular software applications... you still use separation of concerns in general to arrange the code structure." [#1]
- Evolves one payment component into presentation (views), domain (models, business logic) and data access (network/gateway) to avoid "shotgun surgery". [#1]
- "Views are changing more frequently than non-view logic... separating them allows you to focus on a particular self-contained module." [#1]
- A domain class "doesn't have any UI-related information. So testing and potentially modifying logic here is much easier than when embedded in a view." [#1]
- The view layer is replaceable "because the domain logic is encapsulated in pure JavaScript (or TypeScript) code." [#1]
- Headless Component = usually a custom hook that "extracts all non-visual logic and state management, separating the brain of a component from its looks"; tied to Fowler's Presentation Model. [#2]
- Fetching in `useEffect` → races, no cache, SSR/waterfall problems; "modern frameworks provide more efficient built-in data fetching mechanisms than fetching data in Effects"; otherwise "consider extracting your fetching logic into a custom Hook". [#3]
- FSD `model` segment = "the data model: schemas, interfaces, stores, and business logic". [#17]
- Next.js keeps "internal business logic... on the server" with `import 'server-only'` (build error if imported into a client bundle). [#6]

### Inferences
- Rules: pure derive/compute/validate/format → `*.ts` without React; custom hook combines them with state/query; component renders. Test pure layer with unit tests, hooks with `renderHook`, components for render/interaction.
- In App Router, split by trust boundary: auth/secret-dependent rules server-side (DAL / server-only); presentational derivation (sort, group, format, UI state machines) client-side in pure modules.
- In DevDigest the backend (`server/`, `reviewer-core/`) owns review logic; the client's "business logic" is mostly deriving/formatting API contract data → "pure helper + thin hook" (`format-cost.ts` + `useXxx` in `client/src/lib/hooks/*`).

### Gaps
- No quantitative study on bug rates from extracting domain logic. Kent's custom-hook-around-query writing not fetched.

## 2. utils vs helpers vs lib vs services

### Takeaway
No standard definitions. Experts agree: **colocate first; promote on 2+ consumers; name by purpose, not by technical kind**. Convention: `lib/` = pre-configured third-party libraries / infra wrappers, `utils/` = small generic pure functions. A catch-all `utils.ts` is called a junk drawer by community posts.

### Cited Findings
- Dodds: "Place code as close to where it's relevant as possible", "Things that change together should be located as close as reasonable"; keeping utilities near usage "helps you avoid problems." [#19]
- Wieruch: "if exactly one feature uses a util, it lives inside that feature; once two or more features need it, it moves up to the shared layer." [#18]
- Wieruch (as team choice): "_utils/_ is generic and copy-pasteable across projects, _helpers/_ is project-specific"; `api/` = "Centralized API client code when many features share the same endpoints"; `config/` = "Environment variables, app-level constants, runtime configuration". [#18]
- Bulletproof: `lib` = "Preconfigured reusable libraries", `utils` = "Shared utility functions", `config` = "Global configurations and environment variables", `types` = "Shared TypeScript types"; features may have own `api/hooks/types/utils`; "shared -> features -> app", cross-feature imports banned by ESLint. [#16]
- FSD: "components, hooks, and types are bad segment names because they aren't that helpful when you're looking for code." Standard segments `ui`, `api`, `model`, `lib`, `config`. [#17]
- Next.js: `components`/`lib` are "generalized placeholders, their naming has no special framework significance and your projects might use other folders like `ui`, `utils`, `hooks`"; `_lib/data.ts` inside a route is a "safe place for utils". [#7]
- "Junk drawer" critique (C, search snippet only, not fetched): [dev.to/nurrehman](https://dev.to/nurrehman/your-utils-folder-is-a-crime-scene-5095), [peerlist.io/nunosilva](https://peerlist.io/nunosilva/articles/the-global-utils-trap).

### Inferences
- `lib/` = infra singletons/wrappers (API client, query client, i18n); purpose-named files for pure functions; skip `helpers/` unless adopting Wieruch's distinction; "services" on the frontend usually = API/data-access layer.
- Purpose-named files (`format-cost.ts`, `diff-loader.ts`) = lightweight FSD "name by purpose"; DevDigest AGENTS.md already requires it.

### Gaps
- No A-level definition of utils vs helpers vs lib.

## 3. Constants and config

### Takeaway
Feature constants colocated; app-wide constants/env config in `config/`. `as const` for literal readonly types. Validate env once at build time (t3-env + Zod). Only `NEXT_PUBLIC_` vars reach the client and are inlined at build.

### Cited Findings
- `config/` role: Wieruch "Environment variables, app-level constants, runtime configuration" [#18]; Bulletproof "Global configurations and environment variables" [#16]; FSD "configuration files and feature flags" [#17].
- `as const`: no literal widening, readonly properties, readonly tuples; "types that would otherwise be used just to hint immutability to the compiler can often be omitted." [#11]
- "By default, environment variables are only available on the server. To expose an environment variable to the browser, it must be prefixed with `NEXT_PUBLIC_`"; inlined at `next build`, "frozen with the value evaluated at build time"; dynamic `process.env[varName]` is not inlined. [#8]
- "only the Data Access Layer should access `process.env`." [#6]
- T3 Env: `src/env.ts` with `createEnv({ server, client, runtimeEnv })`; "Your server variables will be undefined on the client, and attempting to access one will throw a descriptive error message."; import in `next.config.ts` so vars "are validated at build time". [#9]

### Inferences
- UPPER_SNAKE for module constants is convention, not mandated by sources. `as const` objects replace enums.
- One validated `env.ts` replaces scattered `process.env.X`.

### Gaps
- No authoritative ruling on colocated constants vs `constants.ts`.

## 4. Types placement

### Takeaway
Types live with the code that owns them; only truly shared types in a shared place. At boundaries (API, forms, env) define a Zod schema and derive the type with `z.infer`.

### Cited Findings
- "Zod infers a static type from your schema definitions. You can extract this type with the `z.infer<>` utility"; `z.input<>`/`z.output<>` for transforms. [#10]
- Bulletproof: shared `types/` + per-feature `types/`. [#16]
- FSD: `api` holds "request functions, data types, mappers", `model` holds "schemas, interfaces, stores"; `types` is a bad segment name. [#17]
- Next.js audit checklist: "Are the type signatures overly broad?" (don't pass whole records to client components). [#6]

### Inferences
- Common ground: no global `types.ts` dump. DevDigest already follows Zod single-source-of-truth (`export const PrMeta = z.object(…)` + `export type PrMeta`).

### Gaps
- No A-level 2023–2026 article on the "global types.ts anti-pattern".

## 5. API client / data-access layer

### Takeaway
No network calls in components. One configured fetch client in `lib/`; typed endpoint functions per feature; TanStack Query `queryOptions` + key factories colocated with the feature. In App Router server code, a `server-only` DAL does auth and returns minimal DTOs.

### Cited Findings
- Fowler/Qiu end with a network/gateway layer separate from domain and views. [#1]
- Next.js DAL for new projects: "an internal library that controls how and when data is fetched"; "Only run on the server", "Perform authorization checks", "Return safe, minimal Data Transfer Objects (DTOs)"; pick one approach, don't mix; mutations: auth/DB in `server-only` DAL "while `"use server"` actions stay thin". Existing apps with a separate backend → "External HTTP APIs" (Zero Trust). [#6]
- TkDodo 2024: "Separating QueryKey from QueryFunction was a mistake"; prefer `queryOptions`; on thin wrapper hooks: "I wouldn't immediately reach for it like I did before." [#4]
- TkDodo 2021/22: "I keep my Query Keys next to their respective queries, co-located in a feature directory"; "one Query Key factory per feature"; keys "from most generic to most specific". [#5]
- Bulletproof: feature `api/` + preconfigured clients in `lib/`. [#16]
- React docs: avoid raw fetching in effects. [#3]

### Inferences
- Shift: pre-2024 "wrap every `useQuery` in a custom hook" → 2024 `queryOptions` factories as main abstraction; custom hook only when it adds logic.
- DevDigest talks to a separate Fastify API → Next "External HTTP APIs" model applies, not a DB DAL. Equivalent: typed client validated against shared Zod contracts.

### Gaps
- Kent's current writing on API clients not fetched.

## 6. Barrel files (index.ts)

### Takeaway
Strong measured consensus: avoid internal barrels in apps — they inflate the module graph (slower dev server, tests, TS), cause circular imports, break tree-shaking. Acceptable: a library's public entry point; arguably a tiny per-component barrel.

### Cited Findings
- "Barrel files are files that only export other files and contain no code themselves." Loading 10k/25k/50k empty modules: 3.12 s / 16.81 s / 48.44 s; removing barrels made many tasks 60–80% faster; "It's a common misconception... that modules would only be loaded when needed." [#13]
- "If you want to use one single export from a barrel file that imports thousands of other things, you are still paying the price"; "Tree-shaking is a bundler feature... not a JavaScript runtime feature"; `optimizePackageImports`: up to 40% faster cold starts, 28% faster builds, 15–70% faster local dev. [#14]
- TkDodo: own-folder `index.ts` imports create cycles; one Next project 11k → 3.5k loaded modules; Next can only optimise "pure" barrels; "the best thing is to just avoid barrel files"; exception: "Where barrels are necessary is when you are writing a library." [#12]
- Atlassian (Jira): −75% build time per commit, −88% unit tests run (1,600 → 200), +30% faster TS highlighting, +50% faster local tests; "When you import even a small component through a barrel file, tools like TypeScript and Jest need to process the entire barrel file." [#15]
- Bulletproof: feature barrels "cause issues for Vite to do tree shaking and can lead to performance issues". [#16]
- Counterpoint — Wieruch: index re-exporting "only the public API" is good "because you don't leak implementation details"; barrels "are getting out of fashion... because they make tree shaking harder." [#18]

### Inferences
- One-line `index.ts` per component folder (`FindingCard/index.ts` → `FindingCard.tsx`) is low-risk. Harmful: aggregating barrels (`components/index.ts`, `features/x/index.ts`, `lib/hooks/index.ts` with `export *`) and importing through your own folder's index.
- Lint options (unverified): `import/no-cycle`; `no-restricted-imports` for deep barrel imports.

### Gaps
- No official statement whether `optimizePackageImports` covers the app's own barrels.
