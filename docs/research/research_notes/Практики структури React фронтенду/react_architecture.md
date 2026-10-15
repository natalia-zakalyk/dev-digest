# React frontend architecture — curated sources (architecture, not performance)

Research date: 2026-10-10. 25 WebFetch calls, 24 resolved; Dan Abramov's Medium post returned 403 — its 2019 update was confirmed via quoting search results and a mirror.
Tiers: **[Official]** docs · **[Expert]** widely-cited expert · **[Community]**.

## 1. Folder structure, colocation, shared vs feature components

| # | Source | Author/Org · Year | Tier | Rule |
|---|---|---|---|---|
| 1 | [File Structure FAQ (legacy)](https://legacy.reactjs.org/docs/faq-structure.html) | React team · ~2019 | Official (legacy) | Feature/route grouping and file-type grouping equally valid. Max 3–4 nested folders. Keep files that change together close. ≤5 minutes choosing a structure. |
| 2 | [Next.js – Project structure](https://nextjs.org/docs/app/getting-started/project-structure) | Vercel · 2026 | Official | Unopinionated; three strategies; `_private` folders to colocate; "Choose a strategy and be consistent." |
| 3 | [Bulletproof React – Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Alan Alickovic | Expert | `src/{app,components,features,hooks,lib,stores,types,utils,config}`; per-feature `api/ components/ hooks/ stores/ types/ utils/`; **no cross-feature imports**; **shared → features → app** via `import/no-restricted-paths`; barrels **not recommended**. |
| 4 | [FSD – Overview](https://feature-sliced.design/docs/get-started/overview) | FSD · v2 | Expert | app → pages → widgets → features → entities → shared; slices = domains; segments `ui/ api/ model/ lib/ config`; import only strictly lower layers; no same-layer slice imports. |
| 5 | [FSD – Public API](https://feature-sliced.design/docs/reference/public-api) | FSD | Expert | Index per slice as contract; `@x` cross-imports for entities; relative inside slice, absolute across; `shared/ui` one index per component; Steiger. |
| 6 | [Colocation](https://kentcdodds.com/blog/colocation) | Kent C. Dodds · 2019 | Expert | "Place code as close to where it's relevant as possible." Tests next to source, state near UI, helper stays in file until reused. E2E is the exception. |
| 7 | [React Folder Structure](https://www.robinwieruch.de/react-folder-structure/) | Robin Wieruch · May 2026 | Expert | Grow step by step: file → component folders → technical folders → `features/` → `domains/` → packages. shared → features → pages; mutual needs move up to shared. Folder `index` public API. |
| 8 | [Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | Josh W. Comeau · 2022 (upd.) | Expert | **Type-based** on purpose (`components/ hooks/ helpers/ utils/ constants/`); folder per component + `index.ts`; **utils** = generic portable, **helpers** = project-specific; barrels negligible in web apps. |
| 9 | [Tao of React](https://alexkondov.com/tao-of-react/) | Alex Kondov · 2021 | Community | `modules/common`, `modules/<feature>`; no top-level containers/components split; absolute imports; wrap third-party libs; refactor on too many props. |

## 2. Splitting components: responsibility, composition, hooks

| # | Source | Author/Org · Year | Tier | Rule |
|---|---|---|---|---|
| 10 | [Thinking in React](https://react.dev/learn/thinking-in-react) | React team | Official | Hierarchy, one job per component (may mirror data model). Minimal state, derive the rest; state in closest common parent; data down, callbacks up. |
| 11 | [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | React team | Official | Hooks share logic, not state. `use` prefix only if it calls hooks. No lifecycle hooks (`useMount`); concrete use-case hooks (`useChatRoom`, `useOnlineStatus`). |
| 12 | [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | React team | Official | Derive in render; user actions in handlers; reset with `key`; `useSyncExternalStore`. "Code that runs because a component was *displayed* → Effect; everything else → event handlers." |
| 13 | [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | React team | Official | Group related state; avoid contradictions, redundancy, duplication, deep nesting; store IDs not copies. |
| 14 | [Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | Dan Abramov · 2015, **2019 update** | Expert | 2019: "I don't suggest splitting your components like this anymore" — hooks do it. 403 to fetchers; [mirror](https://readmedium.com/smart-and-dumb-components-7ca2f9a7c7d0). |
| 15 | [When to break up a component](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) | Kent C. Dodds · ~2020 | Expert | Split on real pain (reuse, state complexity, testing, perf), not ahead of time. |
| 16 | [AHA Programming](https://kentcdodds.com/blog/aha-programming) | Kent C. Dodds · 2020 | Expert | "Avoid Hasty Abstractions"; "prefer duplication over the wrong abstraction". |
| 17 | [Compound Components with React Hooks](https://kentcdodds.com/blog/compound-components-with-react-hooks) | Kent C. Dodds · 2019 | Expert | Parent + subcomponents share implicit state via Context + guarded `useXContext`. |
| 18 | [Compound Pattern](https://www.patterns.dev/react/compound-pattern/) | patterns.dev (Hallie & Osmani) | Expert | Context preferred over `Children.map`/`cloneElement` (breaks on wrapped children). |
| 19 | [Component Composition is great btw](https://tkdodo.eu/blog/component-composition-is-great-btw) | TkDodo · Sep 2024 | Expert | Replace tangled conditional JSX with early returns + extracted layout component; repeating `<Layout>` per state is fine. |

## 3. Constants, utils/helpers/lib, barrel files

| # | Source | Author/Org · Year | Tier | Rule |
|---|---|---|---|---|
| 20 | [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | TkDodo · Jul 2024 | Expert | Internal barrels → cycles, whole graph loaded; 11k → 3.5k modules. Exception: library entry point. |
| 21 | [75% faster builds by removing barrel files](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files) | Atlassian · Jun 2025 | Expert (case study) | −75% build, ~−50% local tests, −88% CI tests; ESLint codemod; trade-off: lost package-level encapsulation. |
| 22 | [The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/) | Marvin Hagemeister · Oct 2023 | Expert | Measures module-graph cost; remove barrels. |
| — | [Optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) | Vercel · Oct 2023 | Official | `optimizePackageImports` for *third-party* barrels; context, not a rule. |

Constants/utils: clearest concrete guidance is Comeau (#8), Bulletproof (#3: `lib/` preconfigured wrappers, `utils/` shared functions, `config/` env/global), FSD (#4: `lib`/`config` per slice), Kent (#6). No official React source.

## 4. Where business logic and state live

| # | Source | Author/Org · Year | Tier | Rule |
|---|---|---|---|---|
| 23 | [Modularizing React Applications](https://martinfowler.com/articles/modularizing-react-apps.html) | Juntao Qiu · Feb 2023 | Expert | "React is a humble library for building views." View → Hooks → Domain (plain TS) → Gateway/API (anti-corruption). Strategy pattern vs scattered conditionals. Domain must not depend on React. |
| 24 | [Practical React Query](https://tkdodo.eu/blog/practical-react-query) + [React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager) | TkDodo · 2020/2021 | Expert | Server state is "borrowed"; never copy into `useState`; (then) wrap `useQuery` in custom hooks; keys like dependency arrays; no `setQueryData` as general store. |
| 25 | [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | Kent C. Dodds · 2020 | Expert | Separate **server cache** from **UI state**; local state, several scoped providers; composition before Context. |
| — | [Bulletproof – State Management](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md) | Alan Alickovic | Expert | Component, application, server cache, form, URL state — each with its tool, as local as possible. |

## 5. Import boundaries and enforcement

| Source | Author/Org | Tier | Rule |
|---|---|---|---|
| [`import/no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | import-js | Official (tool) | `zones: [{ target, from, except, message }]`, resolved paths. Bulletproof uses it. |
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) / [jsboundaries.dev](https://www.jsboundaries.dev/) | Javier Brea | Expert/tool | Element types by pattern + allow/deny rules; restrict external modules per layer; block private/non-entry imports. Rule names changed across majors. |
| Steiger | FSD | Tool | FSD layer/public-API linter. |

## Where sources disagree
1. **Feature vs type layout** — feature-first: Bulletproof, FSD, Wieruch, Kondov, Kent; type-based: Comeau; neutral: legacy React docs, Next.js.
2. **Barrels** — against: TkDodo, Atlassian, Hagemeister, Bulletproof (reversed). For: Comeau (negligible), FSD & Wieruch (index as public API). All allow library entry points; Atlassian names the cost (lost encapsulation).
3. **Layer count/strictness** — FSD 6 layers; Bulletproof 3 tiers; Wieruch gradual; Kent/React docs: no structure before pain.
4. **Where logic lives** — Abramov: hooks replace containers; Fowler/Qiu: domain in plain TS outside React; TkDodo/Kent: server-state logic in colocated query hooks.
5. **When to extract** — React docs: hierarchy up front; Kent: wait for pain; TkDodo: extract layout, accept duplicated JSX.

Excluded: generic listicles; Kent's "State Colocation will make your React app faster" and Abramov's "Before You memo()" (performance-focused).
