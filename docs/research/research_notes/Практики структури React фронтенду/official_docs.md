# Official / maintainer guidance on frontend code organization (Next.js 15-16 App Router + React 19 + TanStack Query 5 + TypeScript)

Research date: 2026-10-10. Every URL marked "fetched" was fetched successfully during this session. Quotes are verbatim from the fetched page unless marked "(paraphrase)". Fetches were done through a summarizing fetch tool, so a few quotes may differ from the page in punctuation. Re-check any quote before using it as a verbatim citation in the skill.

## Q1. What react.dev says about splitting components, extracting hooks, and where logic belongs

### Takeaway
React's official docs do not prescribe folders. They give rules for where logic goes. Split a component when it does more than one thing. Keep render pure. Derive values during render. Put interaction logic in event handlers. Use Effects only to sync with external systems. Extract a custom hook for a concrete, high-level use case, and don't extract one for every small duplication. State lives in the closest common parent, with one owner per piece of state.

### Cited Findings

**Thinking in React** — https://react.dev/learn/thinking-in-react (React team, react.dev, current docs; fetched)
- Splitting components: "a component should ideally only be concerned with one thing. If it ends up growing, it should be decomposed into smaller subcomponents." — [Thinking in React](https://react.dev/learn/thinking-in-react)
- Where state lives: "Find their closest common parent component"; "If you can't find a component where it makes sense to own the state, create a new component solely for holding the state and add it somewhere in the hierarchy above the common parent component." — [Thinking in React](https://react.dev/learn/thinking-in-react)
- Props vs state: "Props are like arguments you pass to a function"; "State is like a component's memory." — [Thinking in React](https://react.dev/learn/thinking-in-react)

**Keeping Components Pure** — https://react.dev/learn/keeping-components-pure (fetched)
- A pure component "minds its own business" and returns the same JSX for the same inputs ("Same inputs, same output"). — [Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- Side effects don't belong in render. Event handlers are the preferred place, and `useEffect` is the last resort. Mutating a local variable created during render is fine. Mutating variables or props that already existed is not. (paraphrase of page structure) — [Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- Purity enables server rendering, caching/skipping renders and interruptible rendering. This matters for Server Components and the React Compiler. (paraphrase) — [Keeping Components Pure](https://react.dev/learn/keeping-components-pure)

**Reusing Logic with Custom Hooks** — https://react.dev/learn/reusing-logic-with-custom-hooks (fetched)
- "You don't need to extract a custom Hook for every little duplicated bit of code. Some duplication is fine." — [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- "whenever you write an Effect, consider whether it would be clearer to also wrap it in a custom Hook." — [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- "Custom Hooks let you share stateful logic but not state itself. Each call to a Hook is completely independent from every other call to the same Hook." — [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- "Keep your custom Hooks focused on concrete high-level use cases." "Avoid creating and using custom 'lifecycle' Hooks" (for example `useMount`). — [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Naming: "Hook names must start with `use` followed by a capital letter". A function that calls no Hooks should be a regular function, not `useX`. The page's example marks `useSorted`, which calls no Hooks, as "Avoid" and prefers `getSorted`. This is a direct rule for separating `hooks/` from `utils/`. — [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Wrapping data fetching in a custom hook (`useData`) "will require fewer changes to migrate to the eventually recommended approach than if you write raw Effects in every component manually." — [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)

**You Might Not Need an Effect** — https://react.dev/learn/you-might-not-need-an-effect (fetched)
- Don't use an Effect to transform data for rendering. Compute it during render (`const fullName = firstName + ' ' + lastName`). Use `useMemo` only when the calculation is expensive. (paraphrase plus code from page) — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- Decision rule: ask "why does this code need to run?" If a particular user interaction causes it, it belongs in an event handler. If the component being displayed causes it, it belongs in an Effect. (near-verbatim) — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- To share logic between handlers, extract a plain function (`buyProduct()`) that the handlers call. Don't use an Effect for this. — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- For data fetching the page prefers a framework or library mechanism. A raw `useEffect` fetch needs an `ignore` flag in cleanup to avoid race conditions. (paraphrase) — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

**Choosing the State Structure** — https://react.dev/learn/choosing-the-state-structure (fetched)
- Five principles: group related state; avoid contradictions; "If you can calculate some information from the component's props or its existing state variables during rendering, you should not put that information into that component's state"; avoid duplication (store `selectedId`, not the selected object); "prefer to structure state in a flat way." — [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- Don't mirror props in state. If you deliberately ignore later updates, name the prop `initialX` / `defaultX`. — [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- "Make your state as simple as it can be--but no simpler." — [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)

**Sharing State Between Components** — https://react.dev/learn/sharing-state-between-components (fetched)
- "For each unique piece of state, you will choose the component that 'owns' it… Instead of duplicating shared state between components, lift it up to their common shared parent, and pass it down to the children that need it." — [Sharing State](https://react.dev/learn/sharing-state-between-components)
- Controlled and uncontrolled components are a design trade-off. Uncontrolled components are easier to use, and controlled ones are "maximally flexible" (paraphrase). — [Sharing State](https://react.dev/learn/sharing-state-between-components)

**Importing and Exporting Components** — https://react.dev/learn/importing-and-exporting-components (fetched)
- Why split into files: "This lets you keep your files easy to scan and reuse components in more places." — [Importing and Exporting Components](https://react.dev/learn/importing-and-exporting-components)
- "A file can have no more than one default export, but it can have as many named exports as you like." "People often use default exports if the file exports only one component, and use named exports if it exports multiple components and values." — [Importing and Exporting Components](https://react.dev/learn/importing-and-exporting-components)
- "Components without names, like `export default () => {}`, are discouraged because they make debugging harder." — [Importing and Exporting Components](https://react.dev/learn/importing-and-exporting-components)

**Legacy React FAQ "File Structure"** — https://legacy.reactjs.org/docs/faq-structure.html (fetched; the page carries the banner "This site is no longer updated. Go to react.dev". It is SUPERSEDED/legacy, but react.dev has no replacement page.)
- "React doesn't have opinions on how you put files into folders" (paraphrase of the page's intro; the fetch tool reported "React has no official opinions on project structure"). — [Legacy FAQ](https://legacy.reactjs.org/docs/faq-structure.html)
- By feature: "One common way to structure projects is to locate CSS, JS, and tests together inside folders grouped by feature or route." By type: "group similar files together, for example: api/, components/". — [Legacy FAQ](https://legacy.reactjs.org/docs/faq-structure.html)
- Nesting: "consider limiting yourself to a maximum of three or four nested folders." — [Legacy FAQ](https://legacy.reactjs.org/docs/faq-structure.html)
- "If you're just starting a project, don't spend more than five minutes on choosing a file structure." — [Legacy FAQ](https://legacy.reactjs.org/docs/faq-structure.html)

**React Compiler (2025-2026)** — https://react.dev/learn/react-compiler/introduction (fetched)
- The compiler is a build-time tool that memoizes automatically and removes the need for manual `useMemo`, `useCallback` and `React.memo` "in most cases". It depends on the code following the Rules of React. (paraphrase) — [React Compiler intro](https://react.dev/learn/react-compiler/introduction)
- "In most cases, this memoization will be as precise, or moreso, than what you may have written." Guidance: in new code, rely on the compiler and use `useMemo`/`useCallback` as an escape hatch (for example to control Effect dependencies). In existing code, leave manual memoization in place or test carefully before removing it. (partly paraphrase) — [React Compiler intro](https://react.dev/learn/react-compiler/introduction)
- Next.js 16 (Oct 21, 2025): "Built-in support for the React Compiler is now stable in Next.js 16 following the React Compiler's 1.0 release." The `reactCompiler` option is stable but "not enabled by default", and it increases compile times because it uses Babel. — [Next.js 16 blog](https://nextjs.org/blog/next-16)

### Inferences
- React's docs give a decision procedure, not a folder layout. A skill can turn this into rules such as "if a function calls no hooks, it goes in utils/lib, not hooks", "derived values go in render, not useEffect plus useState", and "an Effect is a reason to consider a custom hook".
- With the React Compiler (opt-in in Next 16), memoization no longer shapes structure. Don't split components or extract hooks just to memoize.

### Gaps
- I found no current react.dev page that replaces the legacy "File Structure" FAQ. The legacy page is still the only official React text on folder layout.
- I didn't fetch the react.dev "Rules of React" page separately. The compiler page links to it.

## Q2. What nextjs.org says about project structure, colocation, Server/Client composition, the DAL and barrels

### Takeaway
Next.js says it is "unopinionated" about organization. It offers three equally valid strategies: files outside `app/`, top-level folders inside `app/`, or split by feature/route. Pick one and be consistent. Files in `app/` are safe to colocate. `_private` folders and `(groups)` help with organization. For Server/Client components: push `"use client"` down to interactive leaves, pass server UI as `children`, put providers as deep as possible, and guard server code with `server-only`. For new projects Next.js recommends a server-only Data Access Layer.

### Cited Findings

**Project structure and organization** — https://nextjs.org/docs/app/getting-started/project-structure (Vercel/Next.js docs, version 16.4.0, lastUpdated 2026-07-21; fetched)
- "Next.js is **unopinionated** about how you organize and colocate your project files." — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Colocation: "project files can be safely colocated inside route segments in the `app` directory without accidentally being routable." "While you can colocate your project files in `app` you don't have to." — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Private folders (`_folderName`) opt "the folder and all its subfolders out of routing". They are useful for "Separating UI logic from routing logic", "Consistently organizing internal files", "Sorting and grouping files in code editors" and "Avoiding potential naming conflicts with future Next.js file conventions." The examples are `app/blog/_components/Post.tsx` and `app/blog/_lib/data.ts` ("safe place for UI utilities" / "safe place for utils"). — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Route groups `(folderName)` are "for organizational purposes and should not be included in the route's URL path". Uses include organizing "by site section, intent, or team", per-group layouts, and multiple root layouts. — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- `src` folder: "This separates application code from project configuration files". — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Strategies: (1) "Store project files outside of `app`… keeps the `app` directory purely for routing purposes"; (2) "Store project files in top-level folders inside of `app`"; (3) "Split project files by feature or route… stores globally shared application code in the root `app` directory and splits more specific application code into the route segments that use them." Also: "choose a strategy that works for you and your team and be consistent across the project." `components` and `lib` "naming has no special framework significance and your projects might use other folders like `ui`, `utils`, `hooks`, `styles`". — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)

**Server and Client Components** — https://nextjs.org/docs/app/getting-started/server-and-client-components (version 16.4.0, lastUpdated 2026-10-05; fetched)
- Use Client Components for state/event handlers, lifecycle logic, browser APIs and "Custom hooks". Use Server Components to "Fetch data from databases or APIs close to the source", use secrets, and "Reduce the amount of JavaScript sent to the browser". — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- Boundary: "Once a file is marked with `"use client"`, all of its imports and the components it directly renders are included in the client bundle." This "does not apply to Server Components passed as children or other props." — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- Bundle size: "add `'use client'` at the top of the files that define your interactive components instead of marking large parts of your UI as Client Components." The example keeps `<Layout>` as a server component with only `<Search/>` as a client component. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- Interleaving: "A common pattern is to use `children` to create a slot in a `<ClientComponent>`." — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- Providers: "You should render providers as deep as possible in the tree". Wrap third-party client-only components in your own `'use client'` file. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- Environment poisoning: "it's possible to accidentally import server-only code into the client". Use `import 'server-only'` to get a build-time error. `client-only` marks modules that access `window`. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- Example placement in the docs: page in `app/[id]/page.tsx`, client UI in `app/ui/like-button.tsx`, data function `getPost` in `@/lib/data`. — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

**How to think about data security in Next.js** (guide) — https://nextjs.org/docs/app/guides/data-security (version 16.4.0, lastUpdated 2026-10-06; fetched)
- Three approaches: "HTTP APIs: for existing large applications and organizations"; "Data Access Layer: for new projects"; "Component-Level Data Access: for prototypes and learning." "We recommend choosing one data fetching approach and avoiding mixing them." — [Data security](https://nextjs.org/docs/app/guides/data-security)
- DAL: "an internal library that controls how and when data is fetched, and what gets passed to your render context." It should "Only run on the server", "Perform authorization checks", and "Return safe, minimal Data Transfer Objects (DTOs)." "only the Data Access Layer should access `process.env`." The example files are `data/auth.ts` and `data/user-dto.tsx` (with `import 'server-only'`). — [Data security](https://nextjs.org/docs/app/guides/data-security)
- Mutations: keep auth and DB logic "in a dedicated `server-only` module, while `"use server"` actions stay thin" (`data/posts.ts` plus `app/actions.ts`). — [Data security](https://nextjs.org/docs/app/guides/data-security)
- Client props should be narrow: a client component that accepts the whole `user` object is called a "bad props interface". Pass "a limited object with just the fields necessary". — [Data security](https://nextjs.org/docs/app/guides/data-security)
- The audit checklist asks: "Verify that database packages and environment variables are not imported outside the Data Access Layer." — [Data security](https://nextjs.org/docs/app/guides/data-security)

**optimizePackageImports** — https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports (version 16.4.0, lastUpdated 2025-12-19; fetched)
- "Some packages can export hundreds or thousands of modules, which can cause performance issues". Adding a package "will only load the modules you are actually using". The page carries an experimental banner. It lists packages optimized by default (for example `lucide-react`, `date-fns`, `lodash-es`, `@mui/material`, `recharts`). — [optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)
- Vercel blog "How we optimized package imports in Next.js" (Shu Ding, Oct 13, 2023; OLDER, but the original rationale): popular libraries can take "200~800ms just to import" because of barrel files. Example: `@material-ui/icons` went from 11,738 to 632 modules. The post suggests an ESLint rule to discourage barrel imports. — [Vercel blog](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)

**Next.js 16 release (Oct 21, 2025)** — https://nextjs.org/blog/next-16 (fetched)
- `proxy.ts` replaces `middleware.ts`, which is deprecated. Cache Components (`"use cache"`, `cacheComponents: true`) make caching opt-in. React 19.2 adds `useEffectEvent`, `<Activity/>` and View Transitions. Turbopack is the default. Sync `params`/`cookies()` were removed and must be awaited. — [Next.js 16](https://nextjs.org/blog/next-16)

### Inferences
- Our app uses Next 15 with a separate Fastify API. Next's "HTTP APIs" approach applies (call the external API, Zero Trust), not a DB-level DAL. The DAL idea still maps to "one module that owns all API calls".
- Next's own example uses `@/lib/data` for data functions and `app/ui/*` or `_components` for UI. Both are explicitly "placeholders", so the project's existing convention wins as long as it is consistent.
- The barrel-file guidance comes from Vercel and concerns library barrels. Applying it to a project's own `index.ts` barrels is an inference, not an official rule.

### Gaps
- I couldn't fetch https://vercel.com/blog/how-to-think-about-security-in-next-js (permission denied mid-session). Its content now lives in the data-security docs guide cited above.
- I didn't verify the Next.js 15-specific version of the project-structure page. The fetched page is 16.4.0. The structure conventions (`_folder`, `(group)`, `src`, three strategies) predate 15, but I didn't confirm that against a 15 snapshot.

## Q3. What TanStack Query v5 docs and TkDodo (maintainer) say about query keys, queryOptions, custom hooks and colocation

### Takeaway
Keep query keys and query functions together, per feature. Since v5 the maintainer's recommended building block is `queryOptions` factories. Custom hooks wrapping `useQuery` are now optional sugar built on top of them. This supersedes TkDodo's 2020-2023 advice to always wrap `useQuery` in a custom hook. Don't copy query data into local state.

### Cited Findings

**TanStack Query docs, Query Options guide** — https://tanstack.com/query/latest/docs/framework/react/guides/query-options (TanStack, v5 "latest"; fetched)
- `queryOptions` lets you "share `queryKey` and `queryFn` between multiple places, yet keep them co-located to one another." It is a runtime no-op used for type inference. — [Query Options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options)
- One definition works with `useQuery(groupOptions(1))`, `useSuspenseQuery(...)` and `queryClient.setQueryData(groupOptions(42).queryKey, …)`. You can "define all possible options for a query in one place". Options can be overridden per component, for example a per-component `select`. — [Query Options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options)

**TkDodo, "Creating Query Abstractions"** — https://tkdodo.eu/blog/creating-query-abstractions (Dominik Dorfmeister, TanStack Query maintainer; Feb 23, 2026; fetched)
- "I've come to the conclusion that custom hooks are just not the right abstraction here". The reasons: hooks only run in components or hooks, not in loaders, server code or event handlers; they tie you to `useQuery` rather than `useSuspenseQuery` or `useQueries`; and query abstractions share configuration, not component logic. (quote verbatim; reasons paraphrased) — [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions)
- "You can of course still create custom hooks if you want to, but they should likely be built on top of `queryOptions`, as that's the first abstraction building block you should be reaching for. Simplicity is king". — [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions)
- Keep `queryOptions` minimal and compose at the call site: `useQuery({ ...invoiceOptions(1), throwOnError: true, select: … })`. — [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions)
- The post doesn't say which file or folder the options should live in. — [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions)

**TkDodo, "The Query Options API"** — https://tkdodo.eu/blog/the-query-options-api (Jan 17, 2024; fetched)
- "Separating QueryKey from QueryFunction was a mistake. The queryKey defines the dependencies to our queryFn." Query factories should mix key-only entries (for invalidation hierarchy) with full `queryOptions` entries. — [The Query Options API](https://tkdodo.eu/blog/the-query-options-api)
- "There's nothing wrong with calling useQuery in your component directly" when a wrapper would add no logic (fetch-tool rendering; check before quoting verbatim). — [The Query Options API](https://tkdodo.eu/blog/the-query-options-api)

**TkDodo, "Effective React Query Keys"** — https://tkdodo.eu/blog/effective-react-query-keys (Jun 13, 2021, last updated 2022-04-23; OLDER, but its key/colocation advice still stands. The factory shape is extended by the 2024 queryOptions post.)
- "I keep my Query Keys next to their respective queries, co-located in a feature directory". Example: `src/features/Profile/queries.ts`, `src/features/Todos/queries.ts`. — [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
- "I recommend one Query Key factory per feature." "Structure your Query Keys from most generic to most specific". Example: `todoKeys.all / lists() / list(filters) / details() / detail(id)`. — [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)

**TkDodo, "Practical React Query"** — https://tkdodo.eu/blog/practical-react-query (Nov 16, 2020, last updated 2023-10-21; PARTLY SUPERSEDED)
- "Even if it's only for wrapping one `useQuery` call, creating a custom hook usually pays off". **Superseded** by the 2026 "Creating Query Abstractions" post, which makes `queryOptions` the primary abstraction. — [Practical React Query](https://tkdodo.eu/blog/practical-react-query); contradicted by [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions)
- Still valid: "If you get data from `useQuery`, try not to put that data into local state." Keep server state and client state separate. — [Practical React Query](https://tkdodo.eu/blog/practical-react-query)

### Inferences
- For the skill: put one `queries.ts` (or similar) per feature, exporting a key factory plus `xxxOptions()` built with `queryOptions`. Components call `useQuery(xxxOptions(id))` directly. Add a `useXxx` hook only when it adds real logic. This combines TkDodo 2021 (colocation per feature) with 2024/2026 (queryOptions first).
- API fetch functions (`queryFn` targets) sit beside or under the options. No official source mandates a separate `api/` folder.

### Gaps
- I couldn't fetch https://tanstack.com/query/latest/docs/framework/react/guides/query-keys or https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr (permission denied mid-session). So I have no verified quotes on where to create the `QueryClient` and provider in the App Router (`app/providers.tsx`, `getQueryClient`, one client per request on the server and a singleton in the browser). Re-fetch before citing.
- The official TanStack docs don't prescribe a folder structure. Folder-level advice comes only from TkDodo's blog.

## Q4. Where TypeScript types should live, and `import type`

### Takeaway
Total TypeScript (Matt Pocock) says: colocate single-use types with their code (inline is fine), move a type to a shared module only when several places use it, and don't use `.d.ts` files for application types. TypeScript's `import type` is always erased, so it marks imports that exist only for types.

### Cited Findings
- **Total TypeScript, "Where To Put Your Types in Application Code"**, https://www.totaltypescript.com/where-to-put-your-types-in-application-code (Matt Pocock; date not verified). **Seen only via search snippet; the direct fetch was denied.** The snippet says to put single-use types (for example component props) in the same file. A separate `MyComponent.types.ts` "makes it harder to work with" because you edit implementation and types together. Inlining is "absolutely fine", and refactoring to a named type later is low-cost. Multi-use types go in a shared location. — [Total TypeScript](https://www.totaltypescript.com/where-to-put-your-types-in-application-code) (UNVERIFIED FETCH)
- Total TypeScript workshop, "Should you use declaration files to store your types": putting all types in `.d.ts` "is a mistake. Declaration files are really about making global alterations to the scope". (search snippet, unverified) — [Total TypeScript workshop](https://totaltypescript.com/workshops/typescript-pro-essentials/types-you-don't-control/should-you-use-declaration-files-to-store-your-types)
- TypeScript 3.8 release notes: "`import type` only imports declarations to be used for type annotations and declarations. It always gets fully erased, so there's no remnant of it at runtime." `export type` works the same way. — [TS 3.8 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html) (fetched; 2020, still current behavior)

### Inferences
- In this repo, Zod contracts in `@devdigest/shared` already act as the shared multi-use type location. Component-local prop types should stay colocated in the component file.

### Gaps
- I couldn't fetch the Total TypeScript article directly, so quotes and date are unverified. Re-fetch before citing verbatim.
- I didn't check the `verbatimModuleSyntax` tsconfig docs (the modern way to enforce `import type`).

## Q5. Notable 2025-2026 updates affecting structure

### Takeaway
The big changes: the React Compiler is 1.0 and stable in Next 16 (opt-in), so memoization no longer drives component splitting. Next 16 renames middleware to `proxy.ts`, adds opt-in `"use cache"` Cache Components and React 19.2 (`useEffectEvent`). TkDodo's Feb 2026 post makes `queryOptions`, not custom hooks, the primary query abstraction.

### Cited Findings
- React Compiler 1.0 and stable Next 16 support: `reactCompiler: true`, not enabled by default. — [Next.js 16](https://nextjs.org/blog/next-16); [React Compiler intro](https://react.dev/learn/react-compiler/introduction)
- `proxy.ts` replaces `middleware.ts` (deprecated). Cache Components are opt-in. Async `params`/`cookies()` are required. React 19.2 brings `useEffectEvent`, which the custom-hooks page also uses to keep event handlers out of Effect deps. — [Next.js 16](https://nextjs.org/blog/next-16); [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- The custom-hooks advice from TkDodo is superseded as of Feb 23, 2026. — [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions)
- The Next.js docs pages fetched here are version 16.4.0 (2026). The project uses Next 15, so 16-only items (`proxy.ts`, `cacheComponents`, stable `reactCompiler` key) don't apply directly. — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure)

### Inferences
- The skill should target Next 15 behavior and note Next 16 deltas, so the advice doesn't break on upgrade.

### Gaps
- I didn't fetch the React 19 / 19.2 release blog posts (react.dev/blog/2024/12/05/react-19, react.dev/blog/2025/10/01/react-19-2) to confirm details. They are only linked from the Next 16 post.
- Several fetches were denied late in the session: Total TypeScript, TanStack advanced-ssr and query-keys guides, and the Vercel security blog. Re-verify those before using them.
