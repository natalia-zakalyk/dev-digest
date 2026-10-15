# Errors and validation at the edges

Read this when you throw an error, validate input or an external payload, or map between DTO and domain types.

## Contents
1. Parse at the edge
2. DTO vs domain
3. Error taxonomy
4. Expected failures without throwing

## 1. Parse at the edge ("parse, don't validate")

Turn untrusted data into a precise type **once**, where it enters, then trust it inside (Alexis King).

| Edge | Who parses | How |
|---|---|---|
| HTTP request | Fastify (ring 4) | Route `schema` + `fastify-type-provider-zod` 4.x → 422 |
| Env / config | `platform/config.ts` | `EnvSchema` zod (empty `LOG_LEVEL` tolerated, see `server/INSIGHTS.md`) |
| GitHub / LLM / git output | The adapter (ring 3) | `safeParse` → map → contract or domain type; failure → `ExternalServiceError` |
| LLM structured output | reviewer-core `src/llm/` | `parseWithRepair`. Grounding then drops uncited findings |
| jsonb read from DB | The repository (ring 3) | `safeParse`; new fields `.nullish()` |

Inner rings never call `.parse()` on data that came through one of these edges. If they need to, an edge is missing.

## 2. DTO vs domain

- `@devdigest/shared` contracts are the **wire format** (snake_case, ISO strings, `null` instead of `undefined`). They're shared with the client and change rarely. Both vendored copies must stay in sync.
- The domain uses whatever is most precise (camelCase, `Date`, unions, branded ids). When domain == contract (common in this repo), using the contract type in rings 1–2 is fine. Don't invent a duplicate type "for purity" (principle 14).
- Mapping lives at the boundary that changes the shape: row→domain in the repository, domain→DTO in `helpers.ts` (`toXDto`) or the service. **Never map rows→DTO in a pure helper that imports `db/schema`.**

## 3. Error taxonomy

`platform/errors.ts` holds the semantic errors (`NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError`, base `AppError`). It's the one `platform/` file the domain may import.

Rules:
- Inner rings throw a **semantic subclass**, never `new AppError(code, msg, <status>)` with a literal status. `repos/helpers.ts` does `new AppError('invalid_repo_url', …, 400)` today. That's a smell: add `class InvalidInputError extends AppError` or reuse `ValidationError`.
- A new domain error → a new subclass in `platform/errors.ts` with its stable `code`. The status code assignment is a presentation decision. Keep it in the subclass constructor (current pattern) or the error handler, never at the throw site.
- The repository returns `null`. The service decides "not found" (`throw new NotFoundError('Repo not found')`).
- Adapters convert SDK or network errors to `ExternalServiceError` (502) or `ConfigError` (missing key → 500). They never let raw SDK errors bubble up.
- The `setErrorHandler` in `app.ts` is the only code that builds `{ error: { code, message, details? } }`. It handles `ZodError` from two zod copies by shape too.

## 4. Expected failures without throwing

For outcomes that are part of normal flow (a degraded repo-intel, an optional GitHub sync), return a value instead of throwing: an empty result, `null`, or a discriminated union `{ ok: true, value } | { ok: false, reason }` (Stemmler's `Result`). Examples already in the code: repo-intel facade degrades to `[]` when disabled or unindexed, and `pulls` serves persisted PRs when GitHub is unavailable. Exceptions are for bugs and broken contracts.
