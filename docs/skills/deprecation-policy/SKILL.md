---
name: deprecation-policy
description: "Use when a PR removes, replaces or renames anything public, or introduces a replacement. Check it is deprecated first — marked in code, docs and responses, with a replacement and a removal version — instead of deleted outright."
type: convention
---

# Deprecation policy

**Output rule:** start the title of the finding from this skill with `[deprecation]`. Set `category` to `bug` (the finding categories have no API-contract value).

Public things are never removed in the same release that introduces their replacement.
The order is: replacement ships → old one is marked deprecated → removed in a later MAJOR.

When the diff replaces or retires a route, field, query parameter or enum value, check:
1. **Marked in code**: `/** @deprecated use <replacement>, removed in vX */` on the schema
   field, handler or exported type.
2. **Marked on the wire** (for HTTP): `Deprecation: true` and, when a date is known,
   `Sunset: <HTTP-date>` response headers; `Link: <…>; rel="successor-version"`.
3. **Replacement documented**: the notice names the replacement and the removal version.
4. **Both work during the window**: old and new keep returning the same data.
5. **Removal only in a MAJOR** after at least one MINOR release carried the deprecation.

Flag when:
- something is deleted that was never marked deprecated (→ breaking-change CRITICAL/WARNING,
  cite this rule as the missing step);
- a deprecation notice has no replacement or no removal version;
- the replacement ships but the old path starts returning different data;
- a deprecated item is removed in a MINOR or PATCH release.

Severity: WARNING for a missing/incomplete deprecation step. Report it as its OWN finding —
name the removed/renamed item and the missing step (`@deprecated` tag, `Deprecation` / `Sunset`
headers, replacement, removal version) — even when the same change is also reported under
breaking-change. SUGGESTION to add headers or a removal version when the rest is handled.


## House rules (this repo)
- A deprecated item stays for at least ONE MINOR release before removal.
- The notice format is `/** @deprecated use <replacement>, removed in v0.<minor>.0 */`; an enum
  member being retired is kept in the enum with that comment, never silently dropped.
- Contract removals are never done in the same PR that adds the replacement.

## Bad
```ts
// route /v1/export removed; /v2/export added in the same PR, no notice anywhere
```

## Good
```ts
app.get('/v1/export', { schema }, async (req, reply) => {
  reply.header('Deprecation', 'true').header('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT')
       .header('Link', '</v2/export>; rel="successor-version"');
  return legacyExport(req);   // same payload as before
});
/** @deprecated use GET /v2/export; removed in v3.0.0 */
```
