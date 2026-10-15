# Placement: where does X live?

Read this when the quick map in SKILL.md doesn't settle it. Paths are relative to `client/src`.

## Contents
1. Folder roles
2. Full decision table
3. Promotion rule (when code moves up)
4. Worked decisions

## 1. Folder roles

| Folder | Role | Imports allowed from |
|---|---|---|
| `vendor/ui` (`@devdigest/ui`) | Design system: primitives, kit, shell, icons, tokens. Atomic-style grouping is fine *here only*. | nothing app-level |
| `vendor/shared` (`@devdigest/shared`) | Zod contracts and types, a copy of `server/src/vendor/shared` | nothing app-level |
| `lib/` | App infrastructure: `api.ts` (HTTP), `hooks/` (TanStack Query), providers (`providers.tsx`, `theme.tsx`, `toast.tsx`, `repo-context.tsx`), purpose-named pure helpers (`format-cost.ts`, `findings.ts`, `github-urls.ts`) | `vendor/*` |
| `components/<kebab>/` | UI shared by 2+ routes (`app-shell`, `diff-viewer`, `run-cost-badge`, …) | `vendor/*`, `lib/` |
| `app/<route>/` | Routing plus everything private to that route (`_components/`, `constants.ts`, `helpers.ts`, `styles.ts`) | everything above + its **parent** route's `_components` |

`lib/` and `components/` are names, not framework features. Next.js calls them "generalized placeholders". What matters is that each folder has one role, applied consistently.

## 2. Full decision table

| What | Where | Why / note |
|---|---|---|
| Route entry | `app/<route>/page.tsx` | Thin: read params and `searchParams`, choose a state (repo-not-found / loading / error / empty / data), compose `_components`. |
| Thin server entry for a client view | `page.tsx` without `"use client"` rendering `<XView/>` | Existing pattern: `agents/page.tsx`, `settings/[section]/page.tsx`. |
| Component used by one route | `app/<route>/_components/<Name>/Name.tsx` + one-line `index.ts` + `Name.test.tsx` | The `_` prefix opts the folder out of routing (Next.js private folders). |
| Its styles / constants / helpers | `<Name>/styles.ts`, `<Name>/constants.ts`, `<Name>/helpers.ts` | Created only when needed. |
| Child used by one component | `<Name>/_components/<Child>/` | Nest; don't flatten into the route. |
| Component shared by a route and its child routes | parent route's `_components` | `agents/[id]` importing `agents/_components/AgentCard` is fine (parent → child). |
| Component used by 2+ unrelated routes | `components/<kebab-name>/` | Strings from the `common` namespace. Its tests must pass `common` to `NextIntlClientProvider`. |
| UI primitive (Button, Tabs, Drawer) | `vendor/ui` | No app logic, no data hooks. |
| Query / mutation hook | `lib/hooks/<domain>.ts` (`core`, `agents`, `reviews`, `trace`, `repo-intel`) | Key tuples are defined and invalidated here, and only here. |
| UI-only hook for one component | same file as the component; sibling `use-xxx.ts` if large | "Hooks only used by one component should remain in the component's file" (Wieruch). |
| URL-state hook / screen hook for one route (e.g. `?tab`/`?trace`, or "all data this page needs") | `app/<route>/use-xxx.ts` | Not `lib/hooks/`. That folder is for API data hooks; AGENTS.md's "every data hook" means `useQuery`/`useMutation` wrappers. |
| UI-only hook for one shared area | `<area>/hooks/` (e.g. `components/app-shell/hooks/`) | |
| UI-only hook used app-wide | `lib/hooks/` | |
| Provider / context | `lib/<name>.tsx`; mount in `lib/providers.tsx` only if app-wide | A provider for one subtree is mounted in that subtree, as deep as possible. |
| HTTP | `lib/api.ts` only (`api.get/post/put/patch/del`, `ApiError`) | SSE `EventSource` lives in the hook that owns the stream (`useRunEvents`). |
| Pure helper, one component | `<Name>/helpers.ts` | No React import. |
| Pure helper, one route | `app/<route>/helpers.ts` | |
| Pure helper, 2+ routes | `lib/<purpose>.ts` + `lib/<purpose>.test.ts` | Name by purpose (`format-duration.ts`). A `utils.ts` / `helpers.ts` grab-bag in `lib/` becomes a junk drawer. |
| Constant, one component or route | `<Name>/constants.ts` / `app/<route>/constants.ts` | Not inline in `page.tsx` once it's a named, meaningful value. |
| Constant, 2+ routes | beside its domain helper (`lib/findings.ts`), else `lib/constants.ts` | Prefer a domain home over a global constants file. |
| Env / config | read `NEXT_PUBLIC_*` in one module (today `lib/api.ts`) | Values are inlined at build time; scattered reads are hard to audit. |
| Contract type (API request / response) | `vendor/shared` → re-exported by `lib/types.ts` | Single source of truth (Zod). Never redeclare. |
| Props / local types | in the component file | Export only when a second file needs it. Use `import type`. |
| View-model type used by one route | `app/<route>/constants.ts` or `helpers.ts` beside the code that produces it | e.g. `PrSize`, `SizeInfo` in `pulls/constants.ts`. |
| i18n strings | `messages/en/<namespace>.json` | One namespace per feature, `camelCase` keys. |
| Tests | colocated `Name.test.tsx` / `helper.test.ts` | Browser journeys live in `../e2e`. |
| Spec for a new feature | `client/specs/<feature-kebab>.md` | Write it first if missing. |

## 3. Promotion rule

Move code **up** exactly when a second consumer appears outside its current scope:

```
<Name>/helpers.ts  ──(another component in the same route needs it)──▶ app/<route>/helpers.ts
app/<route>/…      ──(another route needs it)──────────────────────────▶ lib/<purpose>.ts  or  components/<kebab>/
```

When promoting:
- Move the test along with the code.
- Update imports to use the `@/` alias.
- Move i18n strings to `common` if it's a component.
- Don't leave a re-export behind.

If the two consumers only *look* similar, keep two copies. That is the AHA principle.

**Planned consumers don't count.** "The agents page will need it next sprint" is not a second consumer. Keep the code where it is today and promote it in the PR that adds the real import. It's a one-line `git mv` + import fix, and plans change. Promoting early puts route-specific assumptions into shared code.

## 4. Worked decisions

| New thing | Decision |
|---|---|
| Cost sparkline used only inside the RunHistory row | `pulls/[number]/_components/RunHistory/_components/CostSparkline/` |
| …later needed on the agents page too | Promote to `components/cost-sparkline/`; strings → `common`. |
| `formatDuration(ms)` used by RunHistory and RunTraceDrawer (same route) | `pulls/[number]/helpers.ts` |
| …then also by `/agents/[id]` (in the PR that adds that import, not before) | `lib/format-duration.ts` + test |
| `usePrDetailParams()` (reads/writes `?tab` / `?trace`) for the PR detail page | `pulls/[number]/use-pr-detail-params.ts`, not `lib/hooks/` |
| A new repo-intel query | `lib/hooks/repo-intel.ts`: a `queryOptions` factory plus a hook |
| `useHover()` for one row | inside that row component's file |
| `MAX_FINDINGS_PREVIEW` used by the PR-list popover and the PR detail page | `lib/findings.ts`, next to the findings helpers |
| A modal used only by the settings page | `settings/[section]/_components/<Name>Modal/` |
| A new page that needs the active repo | `useActiveRepo()` from `lib/repo-context.tsx`; don't re-fetch repos |
