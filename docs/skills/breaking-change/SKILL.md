---
name: breaking-change
description: "Use when a PR renames, removes or tightens a route, request field, response field, enum, status code or error shape. Flag every change that breaks an existing consumer and propose the compatible alternative."
type: convention
---

# Breaking changes to a public contract

**Output rule:** start the title of every finding from this skill with `[breaking-change]`. Set `category` to `bug` (the finding categories have no API-contract value). Do not mention client/server copy drift here; the drift rule below reports it once.

Treat routes, their schemas (params, query, body, response), status codes, the error
envelope and exported contract types as promises to existing consumers.

Flag as BREAKING when the diff:
- removes or renames a path, method, path parameter, query parameter or header;
- adds a REQUIRED request field, makes an optional one required, or renames one;
- narrows a request type or enum, or tightens a limit (`min`, `max`, regex, length);
- removes or renames a response field, or removes an enum member consumers may receive;
- changes a success/error status code or the error body shape.

Not breaking: a new route, a new optional request field, a new response field,
a new enum member on a request the server only produces rarely handled by consumers
(call it out as WARNING if consumers switch exhaustively).

For each finding: cite the changed line, name the consumer call that fails and how,
and propose the compatible path: keep the old name as a deprecated alias, make the new
field optional with a default, or ship it as a new route/version.
CRITICAL when an in-repo consumer is not updated in the same diff; otherwise WARNING.


## House rules (this repo)
- `@devdigest/shared` exists in TWO copies: `server/src/vendor/shared` (canonical) and
  `client/src/vendor/shared`. A diff that changes a contract in one copy and not the other is
  ONE finding titled `[contract-drift] …` per PR (not one per change): list every changed
  place in its rationale and cite the first one. WARNING; CRITICAL if the client reads a changed
  field. Set `category` to `bug`.
- Consumers live in `client/src`, `reviewer-core/` and `scripts/` — check whether they are
  updated in the same diff before choosing the severity.

## Bad
```ts
// before: GET /orders/:id → { customerId: string }
// after:
app.get('/orders/:id', { schema: { response: { 200: z.object({ customer_id: z.string() }) } } }, …)
```
`customerId` disappears → every client reading `order.customerId` gets `undefined`.

## Good
```ts
z.object({
  customer_id: z.string(),
  /** @deprecated use customer_id; removed in v3 */
  customerId: z.string(),
})
```
Both names are returned during the deprecation window.
