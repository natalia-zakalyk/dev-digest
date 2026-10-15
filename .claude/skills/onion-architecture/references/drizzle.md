# Drizzle behind repositories

Read this when you write a query, add a repository, map rows, need a transaction, or touch pgvector search.

## Contents
1. The rule
2. Repository shape (port + implementation)
3. Row → domain mapping
4. Transactions (Unit of Work)
5. Tenancy, jsonb, pgvector
6. What stays outside ring 3

## 1. The rule

Inside `modules/`, only `repository.ts` and `*.repo.ts` import `drizzle-orm` or `db/schema` (lint rules `routes-no-persistence`, `application-no-persistence`, `orm-only-in-repositories`). Drizzle has no official "repository pattern" page. The pattern comes from Fowler's Repository ("mediates between the domain and data mapping layers using a collection-like interface") and Stemmler's repository/mapper split.

## 2. Repository shape

```ts
// modules/repos/ports.ts — ring 2, owned by the use case
export interface RepoStore {
  findByFullName(workspaceId: string, fullName: string): Promise<Repo | null>;
  list(workspaceId: string): Promise<Repo[]>;
  insert(input: NewRepo): Promise<Repo>;
}

// modules/repos/repository.ts — ring 3
export class RepoRepository implements RepoStore {
  constructor(private db: Db | Tx) {}
  async list(workspaceId: string): Promise<Repo[]> {
    const rows = await this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
    return rows.map(toRepo);           // mapper lives here
  }
}
```

- Method names speak the domain (`findByFullName`, `markCloned`), not SQL (`selectWhere`).
- Return `null` for "not found". The **service** decides whether that's a `NotFoundError`.
- Add the `ports.ts` interface when a service needs a fake in tests, or when another module consumes the repository through the container. Until then a concrete class with domain-typed methods is fine (principle 14).

## 3. Row → domain mapping

- `$inferSelect`/`$inferInsert`, `db/rows.ts` types and table objects (`t.repos`) are **ring 3 vocabulary**. They may appear in repositories, `db/*` and infrastructure adapters only.
- Today `RepoRow`/`AgentRow` leak upward (`repos/helpers.ts` `toRepoDto(row)`, `reviews/service.ts` → `AgentRow`, `run-executor.ts`). These are baseline violations. New code maps in the repository:
  - Repository returns a domain type (or a `@devdigest/shared` contract type when domain = contract, as `run.repo.ts` already does for `RunSummary`).
  - Convert dates to whatever the domain needs. Convert camelCase→snake_case only at the DTO edge.
- **Parse jsonb on the way out.** A jsonb column is untyped input. `getRunTrace` casts it without parsing (`server/INSIGHTS.md`). For new jsonb reads, `Schema.safeParse` in the repository, and make new fields `.nullish()` for old rows.

## 4. Transactions

The use case owns the boundary (Fowler Unit of Work). Repositories just accept whatever executor they're given.

```ts
// platform/tx.ts — ring 3 helper, exposed on the container
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export const withTx = <T>(db: Db, fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

// service.ts — ring 2
await this.deps.withTx(async (tx) => {
  const review = await this.deps.reviews(tx).insert(…);
  await this.deps.findings(tx).insertMany(review.id, findings);
});
```

- A transaction never spans an LLM or GitHub call. Do the slow IO first, then write in a short transaction.
- `tx.rollback()` throws. Don't catch it inside the callback.
- No transactions in routes or in reviewer-core.
- The codebase has no `db.transaction` yet. The first multi-table write (e.g. review + findings) should introduce `withTx` as above, not inline `container.db.transaction` in a service.

## 5. Tenancy, jsonb, pgvector

- Every repository method takes `workspaceId` and filters on it. That's the tenancy guard, and it belongs in ring 3 so no caller can forget it. Unscoped methods are named as such (`workspaceIdFor`).
- pgvector (`vector` columns, `cosineDistance`, HNSW) is a persistence detail. Similarity search is a repository method (`findSimilarChunks(workspaceId, embedding, k)`). The embedding comes from the `Embedder` port. The service orchestrates the two.

## 6. Outside ring 3

- `db/schema/*`, migrations and seed are infrastructure. Never edit applied migrations; run `pnpm db:generate`.
- `platform/jobs.ts` and `adapters/auth/local.ts` use Drizzle directly. That's acceptable: they **are** infrastructure adapters.
- Drizzle-kit, `drizzle.config.ts` → tooling, out of scope for the rings.
