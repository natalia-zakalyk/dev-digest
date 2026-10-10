---
name: onion-architecture
description: "Onion Architecture (ports & adapters, dependency rule) for the backend modules server/ (Fastify 5, Drizzle 0.38 + Postgres/pgvector, Zod 3.24, Octokit, OpenAI/Anthropic SDKs, p-queue) and reviewer-core/ (pure review engine). Covers which ring a piece of code belongs to (domain, application/service, repository/adapter, routes), which imports are allowed, repository ports and row→domain mapping, transactions, where Zod parsing and DTO mapping happen, domain errors vs HTTP status, wrapping external APIs behind adapters, the container/composition root, testing with fakes, and the `pnpm lint:arch` dependency-cruiser check. Use it whenever you add or change a server module, endpoint, service, repository, adapter, job handler or reviewer-core code, move files in server/src, review a backend PR for structure, or someone asks 'where does this logic go on the backend?' / 'куди покласти бізнес-логіку?' / 'чи можна Drizzle в роуті?' / 'як тестувати сервіс без мавпопатчу?', even if they don't say 'architecture'. Not for Fastify API details (fastify-best-practices), query syntax (drizzle-orm-patterns), table design (postgresql-table-design) or Zod API (zod)."
metadata:
  version: "1.0.0"
  updated: "2026-10-10"
  scope: server/, reviewer-core/
  tags: onion-architecture, hexagonal, ports-and-adapters, clean-architecture, fastify, drizzle, zod, dependency-cruiser
---

# Onion Architecture (`server/`, `reviewer-core/`)

This skill answers three questions for the backend: **which ring does this code belong to**, **what may it import**, and **how do I check it**.

The baseline is the module layout that already exists (`server/src/modules/<name>/{routes,service,repository,helpers,constants}.ts`). We map the onion onto it. We don't add `domain/ application/ infrastructure/` folders to every module. Every rule traces back to a source in [README.md](README.md). The rules are enforced by `cd server && pnpm lint:arch` (dependency-cruiser, [references/enforcement.md](references/enforcement.md)).

## The rings (inner → outer)

| Ring | Files | May import |
|---|---|---|
| 1 · Domain | `modules/<m>/domain/*.ts`, `helpers.ts`, `constants.ts`; contract types in `vendor/shared/contracts`; `reviewer-core/src` (except `src/llm/`) | Only the same ring, `@devdigest/shared` and `platform/errors.ts` |
| 2 · Application | `modules/<m>/service.ts`, `*-executor.ts`, `ports.ts`; external ports in `vendor/shared/adapters.ts` | Domain and ports. No Drizzle, `db/*`, Fastify or concrete adapters |
| 3 · Infrastructure (driven adapters) | `modules/<m>/repository.ts`, `*.repo.ts`, `src/adapters/*`, `src/db/*`, `platform/jobs.ts`, `reviewer-core/src/llm/` | Inner rings, Drizzle, SDKs. Never routes or Fastify |
| 4 · Interface (driving adapter) | `modules/<m>/routes.ts`, the error handler in `app.ts` | Application and contracts. Never `db/*`, Drizzle or repositories |
| Composition root | `app.ts`, `platform/container.ts` | Everything. The only place that knows the concrete classes |

## Core principles (the why behind every rule)

1. **Dependencies point inward only.** Inner code compiles without outer code. An outer ring may use any inner ring, not just the next one. (Palermo parts 1, 3 and 4; Uncle Bob's Dependency Rule)
2. **The inner ring owns the interfaces.** A port (repository interface, `LLMProvider`, `GitHubClient`) is shaped by what the core needs, not mirrored from the tool's API. (Palermo; Graça; Sairyss)
3. **Repositories are the only door to Drizzle.** They return domain types, not `$inferSelect` rows. Row↔domain mapping lives in the repository. Rows and table objects never cross ring 3. (Fowler Repository; Uncle Bob: "don't pass database rows"; Stemmler mappers)
4. **The use case owns the transaction.** A service opens one transaction through a `withTx`/Unit-of-Work port, and repositories accept the `tx`. Routes never open transactions. (Fowler Unit of Work; Drizzle transactions)
5. **Parse at the edge, trust inside.** Zod parses HTTP input through the route `schema` (`fastify-type-provider-zod` 4.x, which fits Zod 3), env through `config.ts`, and LLM/GitHub payloads in the adapter. The core receives precise types and never re-validates. (Alexis King; `server/AGENTS.md`)
6. **API DTO ≠ domain model.** `@devdigest/shared` contracts are the snake_case wire format. They're mapped in the service or a `to<Name>Dto` helper, and their shape doesn't drive the domain. (Sairyss; Stemmler)
7. **Every external system sits behind an adapter that translates.** Octokit, OpenAI/Anthropic, simple-git, ripgrep, the fs and the clock are wrapped as anti-corruption adapters that return domain types. A new dependency means a port, an adapter, a mock in `mocks.ts` and a container entry. (Cockburn; Microsoft ACL; `server/AGENTS.md`)
8. **Errors carry meaning, not HTTP.** Inner rings throw semantic errors (`NotFoundError`, `ValidationError`, a domain error class). Only `setErrorHandler` in `app.ts` turns them into status codes. Never `new AppError(code, msg, 400)` from domain or application code. (Sairyss; Fastify Errors)
9. **Fastify is an outer adapter.** A handler parses (schema), resolves the context, calls a single service method and returns a DTO. No business branching, SQL or SDK calls in handlers. Feature plugins stay encapsulated; shared infrastructure goes through the `container` decorator. (Fastify Encapsulation, Decorators, Getting Started)
10. **One composition root, narrow dependencies.** `app.ts` and `platform/container.ts` build the graph. New services receive a small `Deps` object of ports, not the whole `Container`, so tests pass fakes through the constructor. (Seemann Composition Root; Fowler on DI)
11. **Modules talk through ports.** Reach another module through a container port (`agentsRepo`, `reviewRepo`, `repoIntel`) or its `constants.ts`/`types.ts`/`index.ts`. Never through its service, repository or helpers. (Fowler PresentationDomainDataLayering; `server/docs/architecture.md` §5)
12. **reviewer-core is the review domain core.** It has no IO except the injected `LLMProvider`, and contracts come from `@devdigest/shared`. `src/llm/` is its only adapter ring. (`reviewer-core/AGENTS.md`; Palermo part 4)
13. **Test each ring at its own level.** Domain and application get unit tests with in-memory fakes of ports, not `vi.mock` by path and not monkey-patching private fields. Routes get `buildApp({ overrides }) + app.inject()`. Repositories get `*.it.test.ts` against Testcontainers Postgres. (Cockburn; Fowler TestDouble; Fastify Testing; `TESTING.md`)
14. **Don't build onion theatre.** Add a port when there is a second implementation, a fake for tests, or an IO boundary to hide. Don't add one for pure helpers. (Palermo part 4: "with or without IoC")

## How to use this skill

1. **Placing new code:** use the ring table, then [references/layers.md](references/layers.md) ("what I'm adding → where it goes").
2. **Routes, plugins, validation, errors:** [references/fastify.md](references/fastify.md) and [references/errors-and-validation.md](references/errors-and-validation.md).
3. **Persistence, row mapping, transactions, pgvector:** [references/drizzle.md](references/drizzle.md).
4. **External APIs, container, `Deps`, reviewer-core:** [references/ports-and-adapters.md](references/ports-and-adapters.md).
5. **Tests:** [references/testing.md](references/testing.md).
6. **`pnpm lint:arch` fails, or you're changing rules or the baseline:** [references/enforcement.md](references/enforcement.md).
7. **Concrete before/after from this repo:** [references/examples.md](references/examples.md).
8. **When you answer**, name the ring, the path and a one-line reason (which principle applies). If existing code violates a rule, say so (most violations are already in the baseline), but don't refactor unrelated files unless the task asks. Never add a new violation to the baseline to make CI green. Fix the code instead.

## Final checklist

- [ ] Each new file is in the right ring. New pure rules go in `helpers.ts` or `domain/`, persistence goes in `repository.ts`, HTTP goes in `routes.ts`.
- [ ] `routes.ts` has no Drizzle, `db/*` or repository imports. Handlers are thin and validated by the route `schema`, not by `.parse(req.body)`.
- [ ] Services and executors import no `drizzle-orm`, `db/schema` or `db/rows`. Repositories return domain or contract types, not rows.
- [ ] Multi-write use cases run in one transaction, owned by the service.
- [ ] A new external API has a port, an adapter, a mock in `adapters/mocks.ts` and a `ContainerOverrides` entry.
- [ ] No HTTP status codes in inner rings. Errors are semantic classes.
- [ ] Tests use fakes injected through constructors or `overrides`. Repository tests are `*.it.test.ts`.
- [ ] `cd server && pnpm lint:arch && pnpm typecheck && pnpm test`. If reviewer-core changed, also `cd reviewer-core && npm run typecheck && npm test`.
- [ ] A changed contract means updating both vendored `shared` copies (root `AGENTS.md`).

## Related

- Current wiring (boot, container, adapters, error envelope): [server/docs/architecture.md](../../../server/docs/architecture.md) · reviewer-core pipeline: [reviewer-core/docs/pipeline.md](../../../reviewer-core/docs/pipeline.md)
- Tool details: `fastify-best-practices` · `drizzle-orm-patterns` · `postgresql-table-design` · `zod` · `typescript-expert`
- Sources, version history and how to update this skill: [README.md](README.md)
