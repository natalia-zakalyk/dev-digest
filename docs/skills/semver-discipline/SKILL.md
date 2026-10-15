---
name: semver-discipline
description: "Use when a PR changes a public contract or a published package. Check that the version bump matches the change: breaking → major, backward-compatible feature → minor, fix → patch, and the breaking-change noted in the PR description."
type: rubric
---

# Semver discipline

**Output rule:** start the title of the finding from this skill with `[semver]`. Set `category` to `bug` (the finding categories have no API-contract value).
Every finding must point at a line that exists in the diff. If the version file is NOT changed in the
diff, do not cite it (no line 0, no untouched `package.json`): cite the first changed contract line
that required the bump, and say in the rationale that the version file is unchanged.

The version number is part of the contract: it tells consumers whether upgrading is safe.

Map the diff to the required bump:
- **MAJOR** — any breaking change (removed/renamed route or field, new required request
  field, narrowed type, changed status code or error shape, removed deprecated item).
- **MINOR** — backward-compatible addition (new route, new optional field, new response
  field) or the START of a deprecation.
- **PATCH** — behaviour fix with no contract change.

Flag when:
- a breaking change ships without a MAJOR bump (or without a new `/v2` path / version
  header if the API is URL-versioned instead of package-versioned);
- a MAJOR bump is used for a non-breaking change (needless churn), or a breaking change
  is hidden in a MINOR/PATCH bump;
- the diff touches a contract but does not change the version file (`package.json`,
  OpenAPI `info.version`);
- a pre-1.0 package breaks without a breaking-change note in the PR description.

Severity: WARNING when the bump is missing or too small for a breaking change. Report it
as its OWN finding — cite the version file line and quote old → new — separate from the
breaking-change findings, because the fix is different (version bump vs. compat shim).
If the diff changes a contract but no version file at all, say "no version change in this
diff" and flag it (WARNING when a breaking change ships, otherwise SUGGESTION). Before
claiming "no version bump", check the diff for a `package.json` / `info.version` change.
SUGGESTION to add the breaking-change note to the PR description.


## House rules (this repo)
- The version lives in `server/package.json` (`version`) and `client/package.json`. There is no
  CHANGELOG: put the breaking-change note in the PR description.
- The packages are pre-1.0 (`0.y.z`): a breaking change needs a MINOR bump (`0.y+1.0`), a
  backward-compatible addition or fix needs a PATCH bump. A patch bump that hides a breaking
  change is a WARNING.

## Bad
```diff
- "version": "2.3.1",
+ "version": "2.3.2",
  // …and the diff removes `GET /v1/orders/:id/items`
```
Removing a route is MAJOR, not PATCH.

## Good
```diff
- "version": "2.3.1",
+ "version": "3.0.0",
```
and the PR description says: "Removed `GET /v1/orders/:id/items`; use `GET /v1/orders/:id?include=items`."
