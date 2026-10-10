# Enforcement: `pnpm lint:arch` (dependency-cruiser)

Read this when `pnpm lint:arch` fails, when you add a new kind of file that should belong to a ring, or when you want to change a rule or the baseline.

## Contents
1. What runs
2. The rules
3. Fixing a violation
4. The baseline (known violations)
5. Changing rules

## 1. What runs

```bash
cd server
pnpm lint:arch            # depcruise src --config .dependency-cruiser.cjs --ignore-known .dependency-cruiser-known-violations.json
pnpm exec depcruise src --config .dependency-cruiser.cjs --no-ignore-known --output-type err   # see everything, incl. baseline
```

- `dependency-cruiser` ^17.4.3 is already a server dependency (repo-intel uses it as an adapter), so no new package was added.
- It follows the tsconfig `paths`, so `@devdigest/reviewer-core` resolves into `../reviewer-core/src`. **reviewer-core is checked from the server run**; reviewer-core has no lint script of its own.
- Type-only imports count (`tsPreCompilationDeps: true`). `import type { AgentRow }` in a service is a violation, because the type still couples the ring.
- Config: `server/.dependency-cruiser.cjs`. Ring patterns are constants at the top (`DOMAIN`, `APPLICATION`, `ROUTES`, `REPOSITORY`).

## 2. The rules

| Rule | Forbids | Principle |
|---|---|---|
| `domain-is-pure` | `helpers.ts`/`constants.ts`/`domain/**` → `db/`, `adapters/`, `platform/` (except `errors.ts`), repositories, services, routes, Drizzle, Fastify, SDKs | 1, 3 |
| `domain-no-io-builtins` | domain → `fs`, `child_process`, `net`, `http(s)` | 1, 7 |
| `application-no-persistence` | `service.ts`/`ports.ts`/`*-executor.ts` → `db/`, Drizzle, concrete `adapters/`, Fastify, routes | 3, 10 |
| `routes-no-persistence` | `routes.ts` → `db/`, Drizzle, repositories, adapters | 9 |
| `orm-only-in-repositories` | any other file in `modules/` → Drizzle or `db/schema` | 3 |
| `infrastructure-not-to-interface` | repositories, adapters, `db/` → routes, Fastify | 1 |
| `adapters-not-to-modules` | `src/adapters/**` → `src/modules/**` | 2, 7 |
| `no-cross-module-internals` | `modules/a/**` → `modules/b/**` except `constants`/`types`/`index` and `_shared` | 11 |
| `reviewer-core-stays-pure` | reviewer-core (except `src/llm/`) → server internals, Drizzle, Fastify, SDKs | 12 |
| `reviewer-core-no-io-builtins` | reviewer-core → `fs`, `child_process`, `net`, `http(s)` | 12 |
| `no-circular` | any import cycle | 1 |

## 3. Fixing a violation

The message names the rule and the edge (`from → to`). Fix the code, not the config:

| Message | Usual fix |
|---|---|
| `routes-no-persistence: …/routes.ts → src/db/schema.ts` | Move the query into `<m>/repository.ts`, call it from a service method |
| `application-no-persistence: …/service.ts → src/db/rows.ts` | Repository returns a domain/contract type; drop the row type from the service |
| `application-no-persistence: …/service.ts → src/adapters/…` | Depend on the port (`vendor/shared/adapters.ts` or a local interface); get the instance from the container / `Deps` |
| `domain-is-pure: …/helpers.ts → src/db/schema.ts` | The helper takes a row; map in the repository, the helper takes the domain type |
| `domain-is-pure: …/helpers.ts → …/repository.ts` | Usually a row type import; same fix. Or the helper belongs in the repository |
| `no-cross-module-internals` | Use the container port or export what's needed from the other module's `types.ts`/`constants.ts` |
| `adapters-not-to-modules` | Move the constant into the adapter or `vendor/shared` |
| `no-circular` via `platform/container.ts` | The service takes `Container`; give it a narrow `Deps` instead |

## 4. The baseline

`server/.dependency-cruiser-known-violations.json` lists the violations that already existed when the rules were introduced (2026-10-10): 26 entries in total. They break down as Drizzle in `pulls`/`settings`/`polling`/`workspace` routes, `settings/feature-models.ts`, `reviews/diff-loader.ts`, row types in `repos/helpers.ts`, `reviews/{service,run-executor}.ts` and `agents|reviews/helpers.ts`, concrete adapters in `repo-intel/service.ts`, `adapters/{astgrep,depgraph}` → `repo-intel/constants`, and the cycles through `platform/container.ts` and `agents/helpers ↔ repository`. Known violations are ignored, so only **new** edges fail.

- **Shrink it, never grow it.** After fixing a baseline violation, run `pnpm lint:arch:baseline` and commit the smaller file. Check the diff: it may only remove entries.
- Regenerating the baseline to hide a new violation defeats the check. If a new violation is truly intended (rare), change the rule with a comment explaining why, and say so in the PR.

## 5. Changing rules

- Adding a new ring file name (e.g. `*.use-case.ts`) means extending the matching constant in `.dependency-cruiser.cjs`, then updating the ring table in `SKILL.md` and [layers.md](layers.md).
- After any config change run `pnpm lint:arch`, then sanity-check that a deliberate violation fails, e.g. temporarily add `import { eq } from 'drizzle-orm'` to `modules/repos/service.ts`. It should fail with `application-no-persistence`.
- Alternatives we didn't pick: `eslint-plugin-boundaries` and `no-restricted-imports` (no ESLint in server yet), and `ts-arch`/`ArchUnitTS` (a new devDependency; Vitest-based arch tests). See README sources.
