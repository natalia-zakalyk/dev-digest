---
name: response-schema
description: "Use when a PR changes the shape of a response: field types, nullability, optionality, defaults or units. Flag changes that make consumers' parsing or null-handling wrong, even if the field name is unchanged."
type: rubric
---

# Response schema changes

**Output rule:** start the title of every finding from this skill with `[response-schema]`. Set `category` to `bug` (the finding categories have no API-contract value).

Consumers parse responses with fixed expectations. A same-name field that changes
type, nullability or meaning is a break even though nothing was "removed".

Flag when the diff:
- changes a field's TYPE (`string` → `number`, `number` → `string`, scalar → array/object);
- makes a field NULLABLE or OPTIONAL (consumers dereference it without a check);
- makes a previously optional field ALWAYS present with a different default or format
  (acceptable) — but flag the reverse: a field that was always present may now be absent;
- changes unit, scale, timezone or format (`cents` → `dollars`, epoch → ISO string,
  `0..1` → `0..100`) under the same field name;
- changes array ordering guarantees, pagination envelope or default page size;
- returns a different shape on error vs success without a documented envelope.

Allowed without comment: ADDING a new field, tightening a response type (e.g. nullable →
non-nullable), adding a documented enum value that consumers are told to ignore.

Severity: CRITICAL when an in-repo consumer reads the field and is not updated in the
same diff; WARNING for a silent semantic change (same type, new meaning); SUGGESTION to
document a new field or default.


## House rules (this repo)
- API/contract fields are `snake_case`; a new or renamed field in camelCase is a finding.
- Rates in `SkillStats` / `SkillSummary` are percent (0–100), `null` without data. Changing
  the unit or the window they are computed over (e.g. the "30 days" in `findings_30d`)
  is a silent semantic change: WARNING, name the field whose meaning changed.
- GET routes have no response schema and stored traces are not re-parsed: a new field on a
  stored shape such as `RunStats` / `RunTrace` must be `.nullish()`.

## Bad
```ts
// before
total: z.number()            // integer cents, e.g. 1999
// after
total: z.number()            // dollars, e.g. 19.99   ← same type, different unit
```

## Good
```ts
total_cents: z.number().int(),   // new, explicit unit
total: z.number().int(),         // unchanged, @deprecated, same meaning as before
