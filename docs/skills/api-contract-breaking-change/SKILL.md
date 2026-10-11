---
name: api-contract-breaking-change
description: Use when a PR changes an HTTP route, its Zod schemas or a shared contract. Detect changes that break existing clients and require them to be versioned or made backward compatible.
type: convention
---

# API contract — breaking changes

Treat every route (`app.get/post/put/patch/delete`), its `schema` (params, querystring,
body, response) and every Zod contract in `@devdigest/shared` as a public contract with
existing clients (web UI, CI runner, scripts).

Flag as a breaking change when the diff:
- **Renames or removes a path / method**, or changes a path parameter's name or type.
- **Request side**: adds a *required* field, makes an optional field required, narrows a
  type or enum, tightens a limit (`max`, `min`, regex), or renames a field.
- **Response side**: removes or renames a field, changes its type, turns a value nullable,
  removes an enum member clients may receive, or changes the status code / error envelope.
- **Changes semantics silently**: same field name, different unit, meaning or default.

Not breaking: adding an optional request field, adding a response field, adding a new route.

For each finding, cite the changed line, name which existing client call breaks and how,
and propose the compatible alternative (keep the old field as deprecated, make the new field
optional with a default, or add a new route/version). CRITICAL when an existing in-repo client
(client/, reviewer-core, scripts) is not updated in the same diff; otherwise WARNING.
