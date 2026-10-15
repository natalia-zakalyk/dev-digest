# onion-architecture

A project skill that applies and enforces Onion Architecture (dependency rule, ports & adapters) in the backend modules:
- which ring code belongs to (domain → application → infrastructure / interface);
- which imports are allowed;
- how Fastify, Drizzle, Zod and external SDKs fit into the rings;
- how to test each ring;
- the `pnpm lint:arch` check that fails on new violations.

Tool APIs are out of scope on purpose. They're covered by `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design` and `zod`.

| | |
|---|---|
| **Version** | 1.0.0 (see `metadata.version` in [SKILL.md](SKILL.md)) |
| **Updated** | 2026-10-10 |
| **Applies to** | `server/`: Fastify 5 · Drizzle 0.38 + Postgres 16/pgvector · Zod 3.24 + fastify-type-provider-zod 4 · Octokit · OpenAI/Anthropic SDKs · p-queue · Vitest 2 · `reviewer-core/` (pure engine) |
| **Enforced by** | `server/.dependency-cruiser.cjs` + `server/.dependency-cruiser-known-violations.json` → `cd server && pnpm lint:arch` |

## Files

| File | Loaded | Purpose |
|---|---|---|
| [SKILL.md](SKILL.md) | when the skill triggers | Rings table, 14 principles, routing, checklist |
| [references/layers.md](references/layers.md) | on demand | Placement map, allowed-imports matrix, ambiguous cases |
| [references/fastify.md](references/fastify.md) | on demand | Routes as a driving adapter, plugins/encapsulation, decorators, zod type provider, error mapping |
| [references/drizzle.md](references/drizzle.md) | on demand | Repository port + implementation, row→domain mapping, transactions, tenancy, pgvector |
| [references/ports-and-adapters.md](references/ports-and-adapters.md) | on demand | Existing ports, adding an external dependency, composition root and `Deps`, cross-module access, reviewer-core |
| [references/errors-and-validation.md](references/errors-and-validation.md) | on demand | Parse at the edge, DTO vs domain, error taxonomy, Result-style flows |
| [references/testing.md](references/testing.md) | on demand | Test type per ring, fakes over mocks, `inject()`, `*.it.test.ts`, smells |
| [references/enforcement.md](references/enforcement.md) | on demand | dependency-cruiser rules, fixing violations, baseline policy |
| [references/examples.md](references/examples.md) | on demand | Real before / illustrative after from `server/src` |
| [evals/evals.json](evals/evals.json) | never (for testing) | Test prompts for checking the skill's behaviour |
| README.md | never (for humans) | This file: version, changelog, sources |

## Changelog

- **1.0.0 (2026-10-10)**
  - First release. Onion is mapped onto the existing `modules/<name>/{routes,service,repository,helpers,constants}.ts` layout. No per-module `domain/application/infrastructure` folders.
  - Added dependency-cruiser enforcement with a baseline of 26 pre-existing violations.

## Updating the skill

- Bump `metadata.version` in SKILL.md and add a changelog line.
  - Patch: wording or fixes.
  - Minor: a new rule, reference file or lint rule.
  - Major: a changed ring assignment.
- Every new rule needs a source in the table below. Add the source here first.
- A rule change in `.dependency-cruiser.cjs` must be mirrored in `SKILL.md` (rings table) and `references/enforcement.md` (rules table), and the reverse.
- When a baseline violation is fixed, run `pnpm lint:arch:baseline` (the file may only shrink) and update `references/examples.md` if the example was one of them.
- Keep SKILL.md under ~150 lines. Detail goes in `references/`.

## Sources

Researched 2026-10-10.

**Legend**
- Tier: **O** official docs · **E** recognised expert or maintainer · **C** community.
- Verification:
  - **[V]** content fetched and read.
  - **[R]** URL resolves, content not read.
  - **[S]** seen only in search results.
  - **[✗]** broken or blocked at check time.
- ⚠ marks a pre-2020 source that is still canonical.

### Onion / Clean / Hexagonal (originals)

| Source | Tier | | Used for |
|---|---|---|---|
| Jeffrey Palermo, [The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) ⚠ | E | V | Dependencies point to the centre; repository interfaces in the core, implementations at the edge; DB is external (principles 1–3) |
| Jeffrey Palermo, [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) ⚠ | E | V | Worked example, runtime wiring at the edge (10) |
| Jeffrey Palermo, [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) ⚠ | E | V | Outer rings may use any inner ring; infrastructure changes most (1) |
| Jeffrey Palermo, [part 4: after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) ⚠ | E | V | Four tenets; core compiles without infrastructure; with or without IoC (1, 10, 12, 14) |
| Alistair Cockburn, [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) ⚠ | E | V | Ports & adapters; driving the app from tests (7, 9, 13) |
| Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) ⚠ | E | V | Dependency Rule; don't pass database rows across boundaries (1, 3) |
| Herberto Graça, [DDD, Hexagonal, Onion, Clean, CQRS… how I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) ⚠ | E | V | Ports fit the core, not the tool; driving vs driven adapters (2, 7) |
| Martin Fowler, [Repository](https://martinfowler.com/eaaCatalog/repository.html) ⚠ | E | V | Collection-like interface between domain and data mapping (3) |
| Martin Fowler, [Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html) ⚠ | E | V | The use case owns the transaction (4) |
| Martin Fowler, [PresentationDomainDataLayering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) | E | V | Feature modules layered inside (11) |
| Brett Schuchert on martinfowler.com, [DIP in the Wild](https://martinfowler.com/articles/dipInTheWild.html) | E | V | Abstractions named in domain terms (2) |
| Martin Fowler, [Inversion of Control Containers and the DI pattern](https://martinfowler.com/articles/injection.html) ⚠ | E | V | Configuration separated from use; service locator vs DI (10) |
| Martin Fowler, [TestDouble](https://martinfowler.com/bliki/TestDouble.html) | E | V | Fakes vs mocks vs stubs (13) |
| Mark Seemann, [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) ⚠ | E | V | One place composes the graph (10) |
| Microsoft, [Anti-Corruption Layer pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer) | O | V | Adapters translate external models (7) |

### TypeScript / Node

| Source | Tier | | Used for |
|---|---|---|---|
| [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) | C | V | Domain/persistence/DTO models + mappers; domain errors not HTTP; dependency-cruiser config (3, 6, 8) |
| Khalil Stemmler, [Organizing app logic](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/) | E | V | Clean layering in TS (1) |
| Khalil Stemmler, [Repository, DTO, Mapper](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) | E | V | Mapper per boundary (3, 6) |
| Khalil Stemmler, [Entities](https://khalilstemmler.com/articles/typescript-domain-driven-design/entities/) | E | V | Factories enforcing invariants (domain modelling) |
| Khalil Stemmler, [Handling errors with a Result class](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/handling-errors-result-class/) | E | V | Expected failures as values (8) |
| [jbuget/nodejs-clean-architecture-app](https://github.com/jbuget/nodejs-clean-architecture-app) | C | V | Reference Node layout (Hapi) |
| Marcos Schead, [Clean Architecture + Unit of Work in Node](https://dev.to/schead/using-clean-architecture-and-the-unit-of-work-pattern-on-a-nodejs-application-3pc9) | C | V | UoW across repositories (4) |

### Fastify

| Source | Tier | | Used for |
|---|---|---|---|
| [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) | O | V | Child scopes; `fastify-plugin` breaks encapsulation on purpose (9) |
| [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) | O | V | `register` creates a scope (9) |
| [Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/) | O | V | "Everything is a plugin"; load order (9) |
| [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) | O | V | No objects in `decorateRequest` (9) |
| [TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/) | O | V | Declaration merging for decorators (9) |
| [Errors](https://fastify.dev/docs/latest/Reference/Errors/) | O | V | `setErrorHandler` scoping: the only HTTP mapping (8) |
| [Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) | O | V | Zod type provider (5) |
| [Testing](https://fastify.dev/docs/latest/Guides/Testing/) | O | V | App builder separate from `listen()`; `inject()` (13) |
| [fastify-plugin](https://github.com/fastify/fastify-plugin) | O | V | Sharing infrastructure with the parent scope (9) |
| [@fastify/awilix](https://github.com/fastify/fastify-awilix) | O | V | Considered and not adopted: DI container with request scopes (10) |
| [@fastify/autoload](https://github.com/fastify/fastify-autoload) | O | V | Installed but not used (static registry) |
| Platformatic, [Fastify fundamentals: plugins & encapsulation](https://blog.platformatic.dev/fastify-fundamentals-a-quick-guide-to-plugins-and-encapsulation-with-platformatic) | E | V | Plugins + encapsulation in practice (author not shown on page) |
| Matteo Collina, [1, 2, 3… Fastify!](https://gitnation.com/contents/1-2-3-fastify) | E | S | `build()` for testability, autoload |

### Drizzle

| Source | Tier | | Used for |
|---|---|---|---|
| [Transactions](https://orm.drizzle.team/docs/transactions) | O | V | `db.transaction(tx => …)`, rollback, savepoints (4) |
| [Type inference / goodies](https://orm.drizzle.team/docs/goodies) | O | V | `$inferSelect` / `$inferInsert`: ring-3 vocabulary (3) |
| [Schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration) | O | V | `schema/` folder layout |
| [Vector similarity search](https://orm.drizzle.team/docs/guides/vector-similarity-search) | O | V | pgvector queries stay in repositories |

No official Drizzle page on the repository pattern exists; the pattern is from Fowler, Stemmler and Sairyss.

### Zod / validation at the edges

| Source | Tier | | Used for |
|---|---|---|---|
| Alexis King, [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) ⚠ | E | V | Parse once at the boundary (5) |
| [turkerdev/fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod) | C | V | Version table: v4.x works with Zod 3; v5+ needs Zod 4 (5) |
| [fastify/fastify-type-provider-zod](https://github.com/fastify/fastify-type-provider-zod) (`@fastify/type-provider-zod`) | O | V | Needs Zod 4.2+: not usable on Zod 3.24 |

### Enforcement

| Source | Tier | | Used for |
|---|---|---|---|
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | O | V | Chosen tool (already a dependency) |
| [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | O | V | `from`/`to`/`pathNot`, `$1` groups, `circular`, `dependencyTypes`. Read via raw.githubusercontent (blob view returned 503) |
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | C | V | Alternative (needs ESLint in server) |
| [ESLint no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports) | O | V | Alternative |
| [ts-arch](https://github.com/ts-arch/ts-arch) | C | V | Alternative (Jest-first) |
| [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) | C | V | Alternative (Vitest arch tests, new devDependency) |

### Testing

| Source | Tier | | Used for |
|---|---|---|---|
| [Vitest — Mocking](https://vitest.dev/guide/mocking) | O | V | Prefer injected fakes; mock only external access (13) |

### Repo-internal sources

`server/docs/architecture.md` (boot, container, ports table, error envelope) · `server/AGENTS.md` (zod in route schema, adapter + mock rule) · `reviewer-core/AGENTS.md` (no side effects except `LLMProvider`) · `TESTING.md` · `server/INSIGHTS.md` / `reviewer-core/INSIGHTS.md`.
