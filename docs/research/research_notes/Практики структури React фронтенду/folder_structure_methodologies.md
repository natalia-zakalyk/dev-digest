# React frontend folder-structure methodologies (2023–2026) → mapping to a mid-size Next.js 15 App Router app

Research date: 2026-10-10. URLs fetched and resolved unless marked "(not fetched)".
Authority: **A** = official maintainer docs / widely known author · **B** = known practitioner · **C** = random blog / aggregator (corroboration only).
Target context: `app/` routes, shared `src/components`, `src/lib/hooks`, `lib/` with `api.ts`, formatters and types.

## Bulletproof React — features/ layout, unidirectional imports, ESLint, barrels

### Takeaway
Hybrid structure: technical top-level folders for shared code plus `features/<name>/` with its own api/components/hooks/types/utils. Enforces **shared → features → app** and forbids cross-feature imports via `import/no-restricted-paths`. Discourages barrel files, mandates kebab-case files/folders. Ships a Next.js App Router example.

### Cited Findings
- Source: `docs/project-structure.md`, alan2207 (Alan Alickovic), ~36k★, actively maintained. Authority A. — [project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Top-level `src/`: `app`, `assets`, `components`, `config`, `features`, `hooks`, `lib`, `stores`, `testing`, `types`, `utils`.
- Features may contain `api`, `assets`, `components`, `hooks`, `stores`, `types`, `utils` — "You don't need all of these folders for every feature. Only include the ones that are necessary."
- "the code should flow in one direction, from shared parts of the code to the application (shared -> features -> app)."
- "It might not be a good idea to import across the features. Instead, compose different features at the application level." Enforced with ESLint `import/no-restricted-paths` zones.
- Barrels "can cause issues for Vite to do tree shaking and can lead to performance issues. Therefore, it is recommended to import the files directly."
- Naming: ESLint `check-file` enforces KEBAB_CASE for files and folders under `src/`; single alias `@/*` → `./src/*` to avoid "messy import paths such as `../../../component`". — [project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)
- Repo contains `apps/react-vite`, `apps/nextjs-app`, `apps/nextjs-pages`; "not supposed to be a template, boilerplate or a framework. It is an opinionated guide…" — [README](https://github.com/alan2207/bulletproof-react)

### Assessment
- **Pros:** easy to learn; maps almost 1:1 onto `src/components`, `src/lib` + `app/` routes; lint-enforceable; real App Router reference app.
- **Cons:** features/ vs shared is a judgement call; kebab-case component files conflict with PascalCase (Comeau, this repo's `FindingCard/FindingCard.tsx`); discourages per-component `index.ts` this repo uses.
- **Fits:** mid-size SPA / Next apps with a handful of domains — lowest-ceremony feature-folder option.

### Inferences
- Adopting it here = add `features/<domain>/` (pr-review, repos, runs) for domain code, keep `components/`, `lib/`, `hooks/` as shared. `no-restricted-paths` zones are the cheapest enforcement.

### Gaps
- `apps/nextjs-app` tree not fetched — exact `app/` → `features/` imports unchecked.

## Feature-Sliced Design — layers/slices/segments, public API, Next.js guide, Steiger, criticism

### Takeaway
Most formal methodology: layers (app, [processes — deprecated], pages, widgets, features, entities, shared) → slices (business domains) → segments (ui, model, api, lib, config). Strict downward imports, no same-layer slice imports, public API per slice. v2.1 softened to "pages first". Official Next.js guide renames FSD layers to `_app`/`_pages`. Linter Steiger is beta. Widely seen as overkill for small apps.

### Cited Findings
- Official docs, feature-sliced.design. Authority A (maintainers).
- Layers top→bottom: App, Processes (deprecated), Pages, Widgets, Features, Entities, Shared. "Layers App and Shared, unlike other layers, do not have slices and are divided into segments directly." — [Overview](https://feature-sliced.design/docs/get-started/overview)
- "A module on one layer cannot use other modules on the same layer, or the layers above." / "Slices cannot use other slices on the same layer, and that helps with high cohesion and low coupling."
- Segments: `ui` (UI components, formatters, styles), `model` (schemas, stores, business logic), `api` (backend requests), `lib` (library code for the slice), `config` (configuration, feature flags).
- Public API = index with re-exports as the slice contract; discourages wildcard re-exports ("This hurts the discoverability of a slice…"). Warns about circular imports and tree-shaking in `shared/ui`/`shared/lib`; recommends "a separate index file for each component". Cross-entity imports via `@x` notation (`entities/A/@x/B`), Entities layer only. — [Public API](https://feature-sliced.design/docs/reference/public-api)
- v2.1 "pages first": "In v2.1, we recommend starting with pages, and possibly even stopping there"; "keep most of the UI and logic in each individual page, maintaining a reusable foundation in Shared." No breaking changes. — [Migration from v2.0](https://feature-sliced.design/docs/guides/migration/from-v2-0)
- Next.js guide: rename `app`/`pages` FSD layers to `_app`/`_pages`; Next `app/` stays at root for routing only and re-exports pages from `src/_pages`. Warns "server-only side effects can propagate into the client module graph when a Client Component imports that slice" → use `index.server.ts`. `middleware`/`instrumentation` stay at root; Route Handlers in an `api-routes` segment of `_app`. — [With Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- Steiger: "universal file structure and project architecture linter", beta v0.5.x, `npm i -D steiger`, 19+ rules (`fsd/public-api`, `fsd/forbidden-imports`, `fsd/no-public-api-sidestep`, `fsd/no-segmentless-slices`, `fsd/inconsistent-naming`). — [Steiger](https://github.com/feature-sliced/steiger)
- FSD says it's not for libraries and not to migrate if "the current architecture works".
- Criticism: "architectural overkill on small projects", high entry threshold. Authority C, Habr (not fetched; search-summary wording). — [Habr](https://habr.com/ru/post/904426)

### Assessment
- **Pros:** explicit home for everything (API in `api`, business logic in `model`, constants in `config`); lintable; good for big teams.
- **Cons:** steep learning curve; features/widgets/entities split is subjective; clashes with Next folder names (`_app`/`_pages` + re-exports); server/client leaks need `index.server.ts`; barrel overhead; Steiger beta.
- **Fits:** large, long-lived, multi-team apps. Mid-size → at most v2.1 "pages first" + `shared`.

### Inferences
- FSD v2.1 "pages first" and Next "split by route" converge: keep code next to the route, extract to shared on reuse.

### Gaps
- No authoritative English critique from a well-known author; only community posts.

## Colocation, AHA, "move files until it feels right", Wieruch, Comeau, Tao of React, Screaming Architecture

### Takeaway
Influential authors converge: start simple and colocate (Dodds, Abramov), avoid hasty abstraction (AHA), grow toward feature folders (Wieruch 2026, Kondov). Main dissenter: Comeau — organize by function (type), per-component `index` barrels.

### Cited Findings
- **Kent C. Dodds, "Colocation"** (2019-06-17, older). A. "Place code as close to where it's relevant as possible."; colocate tests; "Localizing state has even more benefits than maintainability, it also improves the performance." — [Colocation](https://kentcdodds.com/blog/colocation)
- **Kent C. Dodds, "AHA Programming"** (2020-06-22, older). A. "Avoid Hasty Abstractions"; quotes Sandi Metz "prefer duplication over the wrong abstraction"; "Optimize for change first". — [AHA](https://kentcdodds.com/blog/aha-programming)
- **Dan Abramov, react-file-structure.surge.sh** (~2016–18, older). A. Whole content: "move files around until it feels right" + "not a joke". — [link](https://react-file-structure.surge.sh/)
- **Robin Wieruch, "React Folder Structure in 5 Steps"** (updated 2026-05-05). A/B.
  - Steps: single file → multiple files → component folders → technical folders (`components/`, `hooks/`, `context/`, `utils/`) → feature folders (`features/project/{components,queries,actions}`).
  - "React Hooks which are still only used by one component should remain in the component's file."
  - `lib/` for library wrappers, `utils/` for shared helpers; central `api/` "when many features share the same endpoints"; `constants.ts` per feature or top-level.
  - Recommends kebab-case, `-action.ts` suffix for server actions, `get-` prefix for queries.
  - "Code flows in one direction. From shared utilities into features, and from features into pages. Never the other way around."
  — [robinwieruch.de](https://www.robinwieruch.de/react-folder-structure/)
- **Josh W. Comeau, "Delightful React File/Directory Structure"** (2022-03-15, upd. 2025-12-03). A.
  - `src/components/`, `hooks/`, `helpers/`, `utils.ts`, `constants.ts`; PascalCase component folder + `index.ts` re-exporting `./FileViewer` (editor tabs show real names).
  - Rejects feature folders: "I want things to be organized by function, not by feature"; "Real life isn't nicely segmented like this, and categorization is actually really hard."
  - Defends barrels: "the bundler will spend most of its time dealing with third-party dependencies".
  — [joshwcomeau.com](https://www.joshwcomeau.com/react/file-structure/)
- **Alex Kondov, "Tao of React"** (2021, older). B. "Group by route/module from the start"; `modules/common`, `modules/dashboard`; generic UI to common; absolute aliases ("Absolute ones don't change"); colocate styles/tests; wrap external libraries "so we can change the library in a single place." — [Tao of React](https://alexkondov.com/tao-of-react/)
- **Robert C. Martin, Screaming Architecture** (2011, older). A. "When you look at the top level directory structure… do they scream: Health Care System, or Accounting System…?" — [blog](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html)
- Frontend Screaming Architecture: `components/ services/ hooks/ utils/ types/` scream "React", not the business; use `features/authentication/` etc. C (dev.to, not fetched). — [dev.to](https://dev.to/sergioazoc/screaming-architecture-the-key-to-a-scalable-frontend-1e8l)
- **Next.js docs** (v16.4, upd. 2026-07-21). A. "Next.js is unopinionated about how you organize and colocate your project files."; three strategies (outside `app`, top-level inside `app`, split by feature/route); private `_folder`s like `app/blog/_components/Post.tsx`, `app/blog/_lib/data.ts` are "Not routable"; "Choose a strategy that works for you and your team and be consistent across the project."; `components`/`lib` "have no special framework significance". — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)

### Assessment
| Approach | Pros | Cons | Fits |
|---|---|---|---|
| Colocation / AHA / Abramov | Minimal ceremony; refactor-friendly | No guidance at scale | Always, as default |
| Wieruch | Explicit growth path; 2026; Next-aware | kebab-case vs Comeau | Any size, staged |
| Comeau (by type) | Simple; no categorization debates | Big flat folders at scale | Small–mid, solo/small teams |
| Kondov | Pragmatic module grouping | Older | Mid-size |
| Screaming Architecture | Top level communicates the domain | Abstract | Domain-heavy apps |

### Inferences
- **Consensus:** colocate by default, promote to shared only after real reuse (Dodds, Wieruch, FSD v2.1, Next docs).
- **Disagreements:** feature vs type grouping (Comeau vs Wieruch/Kondov/Bulletproof); barrels (Comeau/FSD per-component OK vs Bulletproof no; FSD against big aggregate barrels); casing (kebab vs PascalCase).
- **Where things live:** constants → colocated `constants.ts`, global in top-level `constants.ts`/`config/`; `lib/` wraps third-party libraries, `utils/`/`helpers/` pure app helpers; API → central `api/`/`lib/api` when shared, else per-feature `api/`.
- **Best fit for this repo — "Bulletproof-lite":** keep `src/components`, `src/lib`, `src/lib/hooks` as shared; route-private `_components` inside `app/`; add `features/` only for domains used across routes; enforce with `import/no-restricted-paths`.

### Gaps
- No single "official" consensus document exists; consensus is inferred.

## Atomic Design as a folder structure

### Takeaway
Brad Frost's Atomic Design (2013) is a **design-system** methodology, not an app folder structure. atoms/molecules/organisms folders for app code are mostly promoted (and criticised) in community blogs.

### Cited Findings
- Frost (2013-06-10, older). A. "Atomic design is methodology for creating design systems"; "We're not designing pages, we're designing systems of components." — [Atomic Web Design](https://bradfrost.com/blog/post/atomic-web-design/)
- Community posts report reuse/shared vocabulary benefits, but categorization inconsistencies and harder navigation as apps grow. C, not fetched. — [Andela](https://andela.com/insights/structuring-your-react-application-atomic-design-principles), [dev.to](https://dev.to/krisguzman_dev/a-better-way-to-structure-react-projects-96a)

### Assessment
- Good for a component library / `components/ui`. Classifies by visual granularity, not domain; says nothing about hooks, API or business logic; atom-vs-molecule is subjective. Use only for the shared UI-kit layer.

### Inferences
- None of the major guides (Bulletproof, FSD, Wieruch, Comeau, Kondov, Next.js) recommends atomic folders for app code — the absence is a signal.

### Gaps
- No authoritative 2023–2026 critique from a well-known author.
