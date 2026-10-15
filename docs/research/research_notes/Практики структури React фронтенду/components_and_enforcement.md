# React component splitting, composition, naming and automated enforcement of frontend architecture (2023-2026) + existing agent skills

Research date: 2026-10-10. Every URL below was fetched during research unless marked "(not directly fetched)".
Authority scale: **A** = official docs / framework maintainers / tool's own repo; **B** = recognised expert author or widely adopted style guide; **C** = secondary/community/aggregator.

## (a) When and how to split a component — decomposition heuristics

### Takeaway
The official React guidance is "one component = one concern; decompose when it grows" and "match components to the data model", but the expert consensus adds a strong counterweight: split only when a concrete problem appears (re-renders, reuse, testing, merge pain), not pre-emptively. The container/presentational split is officially recanted by its author in favour of custom hooks.

### Cited Findings
- **react.dev — "Thinking in React"** (React team, living doc, authority A). "a component should ideally only be concerned with one thing. If it ends up growing, it should be decomposed into smaller subcomponents." Also: "Start by drawing boxes around every component and subcomponent in the mockup and naming them", and "Separate your UI into components, where each component matches one piece of your data model." Gives three lenses for boundaries: programming (separation of concerns), CSS (what you would make class selectors for), design (layers). — [Thinking in React](https://react.dev/learn/thinking-in-react)
- **Kent C. Dodds — "When to break up a component into multiple components"** (19 Jul 2019, **older than 2023 — flag**, authority B). Lists the problems that justify splitting: performance (whole-component re-renders), reusability, state-management confusion, testing difficulty, team friction (merge conflicts/massive diffs), library integration, API abstraction. Core rule: "When you experience one of the problems above, that's when you break your component into multiple smaller components. NOT BEFORE." Quotes Sandi Metz: "Duplication is far cheaper than the wrong abstraction." — [kentcdodds.com](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components)
- **Dan Abramov — "Presentational and Container Components" with 2019 update** (original 2015, update 2019, **older — flag**, authority B; Medium original returned HTTP 403, quote verified via mirror). "Update from 2019: … I don't suggest splitting your components like this anymore. If you find it natural in your codebase, this pattern can be handy. But I've seen it enforced without any necessity and with almost dogmatic fervor far too many times. The main reason I found it useful was because it let me separate complex stateful logic from other aspects of the component. Hooks let me do the same thing without an arbitrary division." — [Medium original](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) (403 to bots); verified text at [readmedium mirror](https://readmedium.com/smart-and-dumb-components-7ca2f9a7c7d0)
- **patterns.dev — Container/Presentational pattern** (Lydia Hallie & Addy Osmani, living doc, authority B). "In many cases, the Container/Presentational pattern can be replaced with React Hooks." — logic moves into a custom hook (e.g. `useDogImages()`) used directly by the presentational component. — [patterns.dev](https://www.patterns.dev/react/presentational-container-pattern/)
- **Dan Abramov — "Before You memo()"** (23 Feb 2021, **older — flag**, authority B). Two structural splitting heuristics driven by state: (1) "Move state down": "Extract that part into a `Form` component and move state _down_ into it" so only the stateful part re-renders; (2) "Lift content up": pass state-independent subtrees as `children`; when state changes the child "still has the same `children` prop … so React doesn't visit that subtree." This is the canonical source for "extract when a piece owns its own state". — [overreacted.io](https://overreacted.io/before-you-memo/)
- **eslint-plugin-react-hooks `static-components` / `component-hook-factories` rules** (React team, authority A) — validate "that components are static, not recreated every render" and flag "higher order functions defining nested components or hooks", i.e. a component extracted *inside* another component's body is a lint error; extraction must be to module scope. — [react.dev eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks)

### Inferences
- A practical, defensible rule set for an agent skill: split when (i) a subtree owns state that the rest does not need (move state down), (ii) a part is reused or needs its own tests, (iii) a server/client boundary is needed (see b), (iv) the file mixes data fetching with rendering — move logic into a `useXxx` hook rather than a "container" component. Do not split purely by line count.
- Hard numeric size thresholds (e.g. "max 200/300 lines") were not found in any authoritative source; they are team conventions only.

### Gaps
- No authoritative source (React docs, Vercel, Kent C. Dodds) gives a numeric line/JSX-depth threshold for splitting. `eslint-plugin-react` has `max-lines`-style rules via core ESLint (`max-lines`, `max-lines-per-function`) but I did not verify any React-specific recommendation for values.
- No 2023-2026 rewrite by Kent C. Dodds of the 2019 article was found.

## (b) Composition patterns, boolean-prop explosion, Server vs Client splitting

### Takeaway
2025-2026 guidance (Vercel's composition-patterns skill, derived from Fernando Rojo's React Universe Conf 2025 talk) treats boolean-prop proliferation as the main smell and replaces it with compound components + a provider holding state + explicit variants + `children`. In Next.js App Router the official rule is: mark only interactive leaves `'use client'`, and pass Server Components into Client Components as `children`/props.

### Cited Findings
- **vercel-labs/agent-skills — `composition-patterns` skill** (Vercel, v1.0.0, MIT, 2026, authority A for Vercel guidance). Description: "React composition patterns that scale. Use when refactoring components with boolean prop proliferation, building flexible component libraries, or designing reusable APIs." Rules (file names `rules/<prefix>-<rule>.md`): Component Architecture — "Avoid boolean props for behavior customization", "Structure as compound components with shared context"; State Management — "Lift state into provider components", "Define clear context interfaces (state/actions/meta)", "Decouple state management from UI rendering"; Implementation — "Prefer children over renderX props", "Create explicit component variants" (e.g. `ThreadComposer` and `EditComposer` instead of one component with flags); React 19 APIs — `ref` as a prop instead of `forwardRef`, `use()` instead of `useContext`. — [skill folder](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns), [SKILL.md](https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/composition-patterns/SKILL.md)
  - Conflict note: the repo tree page summarised Component Architecture as CRITICAL; the SKILL.md fetch reported HIGH. Treat priority as "highest category in the skill".
- **Fernando Rojo — "Composition Is All You Need"** (React Universe Conf 2025, authority B). Argues against flags like `isThread`, `isEditing`, `isDMThread`; each boolean doubles possible states. Sources are secondary summaries (talk video not fetched). — [issoh.co.jp summary](https://www.issoh.co.jp/tech/details/10199/) (authority C, not directly fetched beyond search snippet)
- **patterns.dev — Compound pattern** (authority B). Parent owns state, children (`Flyout.Toggle`, `Flyout.List`) read it via Context. Pro: "Compound components manage their own internal state, which they share among the several child components." Con of the older `React.Children.map`+`cloneElement` variant: "only direct children of the parent component will have access to the props" and shallow-merge prop collisions → prefer Context implementation. — [patterns.dev compound](https://www.patterns.dev/react/compound-pattern/)
- **react.dev — Passing JSX as children** (authority A). "You can think of a component with a `children` prop as having a 'hole' that can be 'filled in' by its parent components with arbitrary JSX. You will often use the `children` prop for visual wrappers: panels, grids, etc." — [react.dev](https://react.dev/learn/passing-props-to-a-component)
- **Next.js docs — Server and Client Components** (Vercel, v16.4.0, lastUpdated 2026-10-05, authority A).
  - Bundle size: "add `'use client'` at the top of the files that define your interactive components instead of marking large parts of your UI as Client Components" (example: static `<Layout>` with only `<Search />` as client).
  - Boundary semantics: "Once a file is marked with `"use client"`, all of its imports and the components it directly renders are included in the client bundle … It does not apply to Server Components passed as children or other props."
  - Interleaving: "A common pattern is to use `children` to create a *slot* in a `<ClientComponent>`" (server `<Cart>` inside client `<Modal>`).
  - Providers: "render providers as deep as possible in the tree".
  - Poisoning: `import 'server-only'` turns accidental client import into a build-time error; `client-only` is the mirror.
  — [nextjs.org](https://nextjs.org/docs/app/getting-started/server-and-client-components)

### Inferences
- The same "lift content up / children slot" technique serves three goals at once: re-render isolation (Abramov), composition over booleans (Vercel), and keeping server-rendered subtrees out of client bundles (Next.js). A skill can teach it once and cite all three.
- `server-only`/`client-only` imports are the cheapest automated enforcement of the RSC boundary — no ESLint config needed.

### Gaps
- Could not fetch the Rojo talk video/transcript; claims rely on secondary summaries.
- No official lint rule found that flags "'use client' too high in the tree"; only `@next/next/no-async-client-component` exists.

## (c) Naming conventions

### Takeaway
Universal: components and their identifiers PascalCase, hooks `useXxx`, internal handlers `handleX`, handler props `onX`, props camelCase. File names are genuinely contested: Airbnb says PascalCase files; shadcn/ui, Next.js routes and eslint-plugin-unicorn default to kebab-case. The consensus is "pick one and enforce it with a linter".

### Cited Findings
- **react.dev — Responding to Events** (authority A). Handler functions: "`handleClick`, `handleMouseEnter`, `handleSubmit`"; custom handler props "should start with `on`, followed by a capital letter" (`onSmash`, `onPlayMovie`), named after app interactions rather than DOM events so implementation can change without changing the contract. — [react.dev](https://react.dev/learn/responding-to-events)
- **Airbnb React/JSX Style Guide** (Airbnb, still the most-cited guide but content largely pre-hooks / class-era, **date not shown; treat as older — flag**, authority B). "Use PascalCase for filenames. E.g., `ReservationCard.jsx`"; "Use PascalCase for React components and camelCase for their instances"; one component per file; root component of a directory → `index.jsx` with directory name as component name; "Always use camelCase for prop names, or PascalCase if the prop value is a React component"; no underscore-prefixed "private" methods; class ordering puts `handle*` then `on*` handlers. — [github.com/airbnb/javascript/react](https://github.com/airbnb/javascript/tree/master/react)
- **eslint-plugin-unicorn `filename-case`** (sindresorhus, authority A for tool). "Enforce a case style for filenames and directory names"; default `kebabCase`; options `case`, `cases` (e.g. allow both kebab and Pascal in React projects), `ignore` (regex), `multipleFileExtensions`. — [rule docs](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/filename-case.md)
- **Very (Andrew Frank) — "The design behind kebab-case-ing our React apps"** (undated, authority C). Arguments for kebab-case: avoids git case-sensitivity rename problems across OSes; one name instead of two for each component. — [verytechnology.com](https://www.verytechnology.com/insights/the-design-behind-kebab-case-ing-our-react-apps)
- **Community summary (zenn.dev, authority C)**: practical approach is to align with the UI library in use — "shadcn/ui uses kebab-case while Material UI uses UpperCamelCase". — [zenn.dev](https://zenn.dev/suba/articles/3fe4ba681233da?locale=en) (search snippet only, not fetched)
- **Next.js docs** use kebab-case files for components in examples (`app/ui/like-button.tsx`, `app/ui/search.tsx`) while component identifiers are PascalCase (`LikeButton`). — [nextjs.org](https://nextjs.org/docs/app/getting-started/server-and-client-components)

### Inferences
- For DevDigest specifically, the repo convention (PascalCase component folder + `PascalCase.tsx` + `index.ts` barrel; kebab-case for shared folders/helpers) can be enforced with `unicorn/filename-case` using `cases: { kebabCase: true, pascalCase: true }` plus overrides per glob, or with `eslint-plugin-check-file` (not researched here).
- Hook naming `useXxx` is mechanically enforced already by `react-hooks/rules-of-hooks` (only `use`-prefixed functions may call hooks).

### Gaps
- Did not verify `eslint-plugin-check-file` (folder-pattern naming enforcement) — a likely better fit for "PascalCase folder + index.ts" rules.
- No 2023-2026 official React statement on file-name casing exists; react.dev is silent.

## (d) Tooling that enforces boundaries and architecture

### Takeaway
Layered toolset: `eslint-plugin-boundaries` or `import/no-restricted-paths` for in-editor layer rules; `import/no-cycle` (expensive) or dependency-cruiser for cycles and CI-level graph rules; Steiger if the project adopts Feature-Sliced Design; Knip for dead files/exports/deps; `eslint-plugin-react-hooks` (React Compiler rules) and `eslint-config-next` for React/Next correctness.

### Cited Findings
- **eslint-plugin-boundaries** (javierbrea, ~1k stars, flat config supported, authority A for tool). Classifies files into "architectural elements" by pattern; rules `boundaries/dependencies` (allowed/disallowed element-to-element imports; older versions named `element-types`), `boundaries/entry-point` (which file of an element may be imported — enforces barrels/public API), `boundaries/no-private`, `boundaries/no-unknown`. "Every file or dependency in your project can be described across three independent dimensions simultaneously" (element type, file category, origin). — [GitHub](https://github.com/javierbrea/eslint-plugin-boundaries)
- **eslint-plugin-import `no-restricted-paths`** (authority A). Zones with `target` (files in the zone), `from` (folders the zone may not import), `except`, `message`. Note: "`from` matches against resolved file paths, not literal import strings." Simplest way to say e.g. "`components/` may not import from `app/`". — [rule docs](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md)
- **eslint-plugin-import `no-cycle`** (authority A). "Ensures that there is no resolvable path back to this module via its dependencies"; `maxDepth` option; warns it is "comparatively computationally expensive". — [rule docs](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md)
- **dependency-cruiser** (Sander Verweij, ~7.3k stars, MIT, authority A for tool). "Validate and visualise dependencies. With your rules." Rule kinds: forbidden / allowed / required; built-ins for circular deps, orphans, missing package.json deps, prod depending on dev deps; outputs dot/SVG/HTML/mermaid/JSON. Runs outside ESLint → good for CI and architecture diagrams. — [GitHub](https://github.com/sverweij/dependency-cruiser)
- **Steiger** (Feature-Sliced Design team, **beta**, v0.5 changed config format, authority A for FSD). "a universal file structure and project architecture linter"; FSD plugin rules include `public-api`, `forbidden-imports` (no imports from higher layers / cross-slice), `no-public-api-sidestep`, `insignificant-slice`, `inconsistent-naming`; config `steiger.config.ts` with `fsd.configs.recommended`. Only relevant if adopting FSD. — [GitHub](https://github.com/feature-sliced/steiger)
- **Knip** (authority A for tool). Finds unused files, unused exports, unused dependencies; 190+ framework plugins incl. Next.js; site testimonial from a Vercel engineer: it "helped us delete ~300k lines of unused code." — [knip.dev](https://knip.dev/)
- **eslint-plugin-react-hooks (React Compiler rules)** (React team, authority A). `recommended` preset includes `rules-of-hooks`, `exhaustive-deps` plus compiler-powered rules: `static-components`, `component-hook-factories`, `purity`, `immutability`, `refs`, `set-state-in-effect`, `set-state-in-render`, `globals`, `use-memo`, `incompatible-library`, `preserve-manual-memoization`, `error-boundaries`, `unsupported-syntax`, `config`, `gating`. Violating components are skipped by the compiler, so "you don't need to fix all violations immediately." — [react.dev](https://react.dev/reference/eslint-plugin-react-hooks)
- **eslint-config-next** (Vercel, docs v16.4.0, authority A). Bundles `@next/eslint-plugin-next` + recommended `eslint-plugin-react` + `eslint-plugin-react-hooks`; presets `eslint-config-next`, `/core-web-vitals`, `/typescript`; flat config via `eslint.config.mjs`. "Starting with Next.js 16, `next lint` is removed" in favour of the ESLint CLI (codemod available). Next's own rules are about fonts/scripts/images/`no-async-client-component`, not architecture. — [nextjs.org](https://nextjs.org/docs/app/api-reference/config/eslint)

### Inferences
- For a small Next.js client (like DevDigest `client/`), the lowest-friction stack is: `eslint-config-next/core-web-vitals` + `/typescript` → add `import/no-restricted-paths` (or `boundaries`) for "app → components → lib" direction → `unicorn/filename-case` for naming → Knip in CI → `server-only` imports for RSC boundary. dependency-cruiser is an alternative to `no-cycle` if lint time matters.
- Next.js already ships `eslint-plugin-react-hooks`; whether the compiler-powered rules are on depends on the bundled plugin version (not verified).

### Gaps
- Did not verify latest version numbers/release dates for eslint-plugin-boundaries, dependency-cruiser, Knip (pages showed stars but not dates).
- Did not verify whether `eslint-plugin-import-x` (the maintained fork) is now preferred over `eslint-plugin-import` for flat config / performance.
- `react.dev` labelled the plugin page "rc"; exact stable version with compiler rules not confirmed.

## (e) Existing agent skills / rule files about React architecture

### Takeaway
The most mature and structurally reusable examples are Vercel's `agent-skills` (`react-best-practices`, `composition-patterns`): a short `SKILL.md` with a prioritised category table, one Markdown file per rule (`rules/<prefix>-<name>.md`, each with incorrect/correct examples), compiled into one `AGENTS.md`. Notably, none of them covers folder structure/file organization — that is an open niche. Cursor rule collections are large but unstructured community content.

### Cited Findings
- **vercel-labs/agent-skills repo** (Vercel, MIT, 21k+ stars per InfoQ, authority A). Skills: `react-best-practices`, `composition-patterns`, `web-design-guidelines`, `react-native-guidelines`, `react-view-transitions`, `writing-guidelines`, `vercel-optimize`, `vercel-deploy-claimable`. Each skill = `SKILL.md` + optional `scripts/`, `references/`; repo has its own `AGENTS.md`/`CLAUDE.md`. Install: `npx skills add vercel-labs/agent-skills`. — [GitHub](https://github.com/vercel-labs/agent-skills)
- **`react-best-practices` SKILL.md** (v1.0.0, authority A). Categories with impact & prefix: 1 Eliminating Waterfalls CRITICAL `async-`; 2 Bundle Size CRITICAL `bundle-`; 3 Server-Side Performance HIGH `server-`; 4 Client-Side Data Fetching MEDIUM-HIGH `client-`; 5 Re-render Optimization MEDIUM `rerender-`; 6 Rendering Performance MEDIUM `rendering-`; 7 JavaScript Performance LOW-MEDIUM `js-`; 8 Advanced Patterns LOW `advanced-`. Performance-only — does **not** address component organization or file structure. — [SKILL.md](https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/SKILL.md)
  - Conflict note: InfoQ (Feb 2026) and the repo README say "40+ rules"; current SKILL.md says "70 rules across 8 categories" — the skill grew after launch.
- **InfoQ — "Vercel's React Best Practices skill"** (Daniel Curtis, 27 Feb 2026, authority B). Highest-priority categories target "the most common root causes of performance issues across production applications"; rules compiled into one `AGENTS.md` for agent consumption; positioned as complementing ESLint plugins and React Compiler v1.0. — [infoq.com](https://www.infoq.com/news/2026/02/vercel-react-best-practices/)
- **anthropics/skills** (Anthropic, authority A for format). Defines the Agent Skills format: folder with `SKILL.md` whose YAML frontmatter has required `name` (lowercase, hyphens) and `description` ("what this skill does and when to use it"); repo has `skills/`, `spec/`, `template/`. "These skills are meant to illustrate patterns and possibilities." The fetched README did not surface a React-architecture skill. — [GitHub](https://github.com/anthropics/skills)
- **PatrickJS/awesome-cursorrules** (~40.9k stars, CC0, authority C). `rules/` folder of `.mdc` files copied into `.cursor/rules/`; 20+ Next.js and 10+ React rule sets (e.g. "Next.js 15 (React 19, Vercel AI, Tailwind)", "React Components Creation", TanStack Query). Content is community-written and varies in quality. — [GitHub](https://github.com/PatrickJS/awesome-cursorrules)
- **cursor.directory React rules** — fetch returned HTTP 429; could not verify contents. — [cursor.directory/rules/react](https://cursor.directory/rules/react) (unverified)
- **Third-party re-packagings** of Vercel's composition skill exist across skill directories (skills.sh, playbooks.com, mdskills.ai, mintlify), showing it is a de-facto reference (authority C, search results only). — e.g. [skills.sh react-composition-patterns](https://www.skills.sh/tech-leads-club/agent-skills/react-composition-patterns)

### Inferences
- Structure worth copying for a DevDigest "react-architecture" skill: frontmatter `name`/`description` with explicit triggers ("use when creating/splitting a component, adding a route, …"); a priority table; one rule per file with ❌/✅ examples and a source link; a compiled `AGENTS.md`; and — unlike Vercel's — a pointer to the lint rules that mechanically enforce each guideline, so the skill and the linter agree.
- Gap in the ecosystem: no authoritative skill found covering folder structure, file naming and import-boundary rules for React/Next apps; this is where a project-specific skill adds value.

### Gaps
- cursor.directory content not verified (rate-limited).
- Did not inspect individual awesome-cursorrules React `.mdc` files for their organization advice.
- Did not find an official Anthropic React/frontend-architecture skill; the `frontend-design` skill (if present in anthropics/skills) is about visual design, not code architecture — not verified.
