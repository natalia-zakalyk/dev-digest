# Severity rubric — pr-self-review

One scale for every skill: the repo's own `Severity` contract
(`server/src/vendor/shared/contracts/findings.ts:11`): **CRITICAL · WARNING · SUGGESTION**.
A single active CRITICAL blocks `git push` (`failOn: critical` in `skill-map.json`), so CRITICAL
must mean "this must not reach main", not "I'd do it differently". Editing this file invalidates the review cache.

## Skills with their own scale
`security`, `react-best-practices`, `zod` (and any skill that says CRITICAL/HIGH/MEDIUM/LOW) map through
`severityMap` in `skill-map.json`: CRITICAL → CRITICAL · HIGH/MEDIUM → WARNING · LOW → SUGGESTION.
Use the skill's own label for its own rule; don't promote a HIGH rule to CRITICAL.

## CRITICAL — blocks the push (needs confidence ≥ 0.8 and a passed refutation step)
- **Security:** injection (SQL/command/path), missing auth/ownership check (no `workspaceId` scoping),
  a secret or key in code, untrusted input reaching a sink, SSRF/outbound call to anything but GitHub or LLM providers.
- **Data loss / corruption:** destructive query without a scope, editing an applied migration,
  writes outside a transaction where the skill requires one, schema change with no migration.
- **Broken contract:** API/Zod contract changed in only one of the two `vendor/shared` copies,
  response no longer matches its schema, a renamed field still used elsewhere.
- **Architecture (backend, onion-architecture):** a *new* dependency-rule violation — Drizzle/`db` in
  `routes.ts` or `service.ts`, domain importing an adapter/SDK, `reviewer-core` importing `server`.
- **Architecture (UI, frontend-ui-architecture):** raw `fetch` in a component (must go through
  `client/src/lib/api.ts` + a hook), importing from a sibling route's `_components`, a Next.js 16-only API.
- **Correctness:** a change that certainly breaks behaviour (wrong condition, unhandled promise that
  drops an error, a hook rule violation that crashes at runtime), or tests deleted/skipped to make CI green.

## WARNING — should fix before merge, does not block
- Logic in the wrong ring/layer that still works (business rule in a route, fat `page.tsx`).
- Missing tests for new behaviour, missing error handling at a boundary, N+1 queries, needless re-renders
  on a hot path, user-visible string not in `messages/` (i18n), `any` leaking through a public type.
- A HIGH/MEDIUM rule from a skill's own scale.

## SUGGESTION — optional polish
Naming, small simplifications, a clearer type, a better test name, LOW rules.

## Never report
- Things outside the changed lines, unless the change breaks them.
- Pre-existing violations listed in the lint:arch baseline (`server/.dependency-cruiser-known-violations.json`).
- Style the repo doesn't use (no ESLint/Prettier here), or advice that conflicts with the module's AGENTS.md.
- Speculation ("might be slow", "could be insecure") without a concrete path in the diff.
