# Fastify as the outer (driving) adapter

Read this when you add or change a route, a plugin, a decorator or the error handler in `server/`.

## Contents
1. What a handler may do
2. Module plugin shape
3. Encapsulation, `fastify-plugin` and decorators
4. Validation with `fastify-type-provider-zod` 4.x
5. Error mapping
6. Anti-patterns

## 1. What a handler may do

A handler is a translator between HTTP and a use case (Cockburn's "driving adapter"). It does exactly four things:

1. Gets **parsed** input. The route `schema: { params, querystring, body }` does the parsing, not the handler.
2. Resolves the request context: `const { workspaceId, userId } = await getContext(container, req)`.
3. Calls **one** service method.
4. Returns the DTO (contract type), or sets a status (`reply.code(201)`).

Anything else (`if` on business state, loops over rows, SDK calls, `container.db`) belongs in a service or repository.

## 2. Module plugin shape (current, keep it)

```ts
// modules/<m>/routes.ts — ring 4
export default async function fooRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new FooService(app.container);        // or a Deps object, see ports-and-adapters.md

  app.post('/foos', { schema: { body: FooInput } }, async (req, reply) => {
    const ctx = await getContext(app.container, req);
    const foo = await service.create(ctx.workspaceId, req.body);
    return reply.code(201).send(foo);
  });
}
```

Registered statically in `modules/index.ts`. `@fastify/autoload` is installed but not used, so the same code runs under tsx, vitest and the bundler (`server/docs/architecture.md` §5).

## 3. Encapsulation, `fastify-plugin` and decorators

- Every `register` creates a child scope. A feature plugin's hooks and decorators don't leak to siblings (Fastify Encapsulation). Keep feature modules **encapsulated** and don't wrap them in `fastify-plugin`.
- Shared infrastructure (the DI container) is decorated on the root instance in `app.ts` (`app.decorate('container', …)`) and typed by declaration merging (`declare module 'fastify' { interface FastifyInstance { container: Container } }`). If you ever extract it into a plugin, *that* plugin uses `fastify-plugin` so the decorator reaches the parent scope.
- `decorateRequest` with an object or array is shared across requests. Use a getter or an `onRequest` hook. Per-request data (workspace, user) comes from `getContext`, not a mutable decorator.
- Fastify types (`FastifyRequest`, `FastifyReply`, `FastifyInstance`) never go past `routes.ts`. A service that takes `req` is coupled to HTTP. Pass `workspaceId` and values instead. `AuthProvider` already takes `req: unknown` for this reason.

## 4. Validation (Zod 3.24)

- We are on `fastify-type-provider-zod` **^4** (Zod 3). v5+ and `@fastify/type-provider-zod` require Zod 4, so **don't upgrade one without the other**.
- Compilers are set once in `app.ts` (`validatorCompiler`/`serializerCompiler`). Routes declare `schema`; never `Schema.parse(req.body)` in a handler (`server/AGENTS.md`). Invalid input → 422 automatically. The only exception is `POST /pulls/:id/review` (tolerant body, documented).
- Use `IdParams` from `modules/_shared/schemas.ts` for `:id`, so a bad uuid is a 422, not a DB 500.
- Adding a `response` schema makes the serializer strip extra fields. That's a cheap guard against leaking row columns.

## 5. Error mapping

`setErrorHandler` in `app.ts` is the **only** place that knows HTTP status codes. It maps validation errors → 422, `AppError` subclasses → their status, `ZodError` → 422 and anything else → 500 with the `{ error: { code, message, details? } }` envelope. Inner rings throw `NotFoundError`, `ValidationError` or `ExternalServiceError`, or a new semantic subclass in `platform/errors.ts`. They never throw `reply.code(...)` or a raw number. See [errors-and-validation.md](errors-and-validation.md).

## 6. Anti-patterns (seen in this repo)

| Smell | Where today | Fix |
|---|---|---|
| Drizzle queries in handlers | `pulls/routes.ts` (GitHub sync + upserts), `settings/routes.ts`, `polling/routes.ts`, `workspace/routes.ts` | `PullsService.syncFromGitHub()` + `PullsRepository.upsertMany()` |
| Business branching in the handler | `pulls/routes.ts` local-first fallback when `container.github()` throws | Move the policy into the service; the handler just calls it |
| SSE bridge in the handler | `reviews/routes.ts` subscribes to `runBus` | Acceptable: streaming *is* transport. Keep it free of business rules |
