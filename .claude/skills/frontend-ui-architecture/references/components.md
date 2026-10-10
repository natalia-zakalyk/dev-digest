# Components: when and how to split, composition, naming

Read this before splitting a component or slimming down a `page.tsx`.

## Contents
1. When to split
2. When not to split
3. How to split (order of operations)
4. Composition patterns
5. Hooks
6. Naming

## 1. When to split

Split when at least one of these holds:
- **More than one job.** For example, it resolves data *and* lays out a screen *and* runs a multi-step interaction. react.dev: "a component should ideally only be concerned with one thing".
- **Reuse.** A piece is needed elsewhere. Then apply the promotion rule in `placement.md`.
- **Independent state.** A piece has state the rest doesn't care about. Move that state down into the piece; the parent stops re-rendering for it and gets simpler.
- **Testing friction.** Testing one behaviour forces you to mock unrelated concerns.
- **Conditional tangle.** JSX is a maze of ternaries for loading / error / empty / data. Use early returns per state, and extract a shared layout component if the states share chrome (TkDodo). Repeating `<Layout>` in each branch is fine.

## 2. When not to split

- **Line count alone.** No authoritative limit exists. Around 200+ lines is a reason to *look*, not a rule. A cohesive 250-line component beats five anaemic files.
- **Container vs presentational.** Dan Abramov retracted this pattern in 2019: "I don't suggest splitting your components like this anymore". Hooks replace it, and patterns.dev agrees.
- **Speculative reuse.** "Prefer duplication over the wrong abstraction" (Kent C. Dodds, quoting Sandi Metz).

## 3. How to split (order of operations)

1. **Pull pure logic out first.** Filtering, sorting, grouping, labelling and number→uuid resolution go into `helpers.ts`, with a unit test. This alone often halves a page.
2. **Pull glue into a hook.** URL-state handling, combinations of several queries, and invalidation callbacks go into a custom hook (the "headless" brain, per Juntao Qiu). Keep it colocated if only this route uses it.
3. **Then split JSX by responsibility.** Extract each state branch (skeleton, error) or visual region (header, tabs) into its own `_components/<Name>/`.
4. **Keep `page.tsx` as the orchestrator.** It reads params, picks the state and renders the pieces.

## 4. Composition patterns

- **Pass content as `children`** ("lift content up"). A wrapper that accepts `children` doesn't need to know about its contents, and data doesn't get threaded through intermediate props. react.dev describes a `children` component as having "a hole that can be filled in by its parent".
- **Explicit variants over boolean props.** Each boolean doubles the states a component must handle. Prefer `<RunningStatus/>` / `<FailedStatus/>`, or a `variant` union, over `isRunning isFailed compact` flags (Vercel composition-patterns; Fernando Rojo's 2025 talk "Composition Is All You Need").
- **Compound components for related parts that share state.** `<Tabs><Tabs.List/><Tabs.Panel/></Tabs>` share state through Context plus a guarded `useTabsContext()` that throws outside the provider. Use Context, not `cloneElement`, which breaks when children get wrapped (Kent C. Dodds; patterns.dev).
- **Wrap third-party components** in your own component, so the library can be swapped in one place (Alex Kondov).
- **Never define a component inside another component's body.** It remounts on every render and loses state. The React Compiler lint rules flag this.

## 5. Hooks

- A function that calls no hooks is a helper. Give it no `use` prefix and put it in a `.ts` file. The prefix is a promise to React's rules of hooks.
- Write hooks for concrete use cases (`useRunEvents`, `useActiveRepo`), not lifecycle wrappers (`useMount`, `useUpdateEffect`). Lifecycle wrappers hide what the effect synchronises with.
- Not every duplicated snippet needs a hook. react.dev: "You don't need to extract a custom Hook for every little duplicated bit of code."
- Hooks share logic, not state. Two components calling the same hook get independent state. For shared state, use the query cache (server data), URL params or a provider.
- **Derive, don't store.** If a value can be computed from props, state or query data, compute it during render. An effect that sets state from other state is a bug magnet (react.dev, "You Might Not Need an Effect").

## 6. Naming

House rules from root `AGENTS.md` take precedence over the sources, which disagree on file casing:

| Thing | Convention | Example |
|---|---|---|
| Module / helper file | kebab-case | `format-cost.ts`, `repo-context.tsx` |
| Component | PascalCase folder + file + one-line `index.ts` | `FindingCard/FindingCard.tsx` |
| Shared component folder | kebab-case under `components/` | `run-cost-badge/RunCostBadge.tsx` |
| Hook | `useXxx` | `usePrRuns` |
| Event handler / handler prop | `handleX` / `onX` (react.dev) | `handleCancel`, `onCancel` |
| Constant | `UPPER_SNAKE` | `SKELETON_ROWS` |
| Zod schema + type | same PascalCase name | `export const PrMeta = z.object(…)` + `export type PrMeta` |
| Test | colocated `Name.test.tsx` | `FindingCard.test.tsx` |
