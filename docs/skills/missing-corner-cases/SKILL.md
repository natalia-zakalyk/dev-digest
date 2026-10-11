---
name: missing-corner-cases
description: Use when a PR changes code that takes numbers, strings, collections, dates or optional values. Check that tests hit the boundaries, not just one typical value.
type: rubric
---

# Missing corner cases

For each input of a changed function, check the tests include the boundary values that
the code's own conditions create:

| Input kind | Cases a test must hit |
|---|---|
| Numeric threshold (`>`, `>=`, `<`, limits) | exactly at the limit, one below, one above; `0`; negative |
| String | empty `''`, whitespace only, very long, non-ASCII |
| Array / collection | empty, one element, duplicates, very large |
| Optional / nullable | `undefined`, `null`, missing key |
| Dates / time | month/year boundary, DST change, time zone other than UTC |
| Money / percentages | rounding (`0.1 + 0.2`), currency with no minor unit, 100 % / 0 % |

Rules:
- Compare the **operator in the code** with the **values in the test**: `amount > 100`
  tested only with `50` and `500` misses the boundary `100` — flag it and name the value.
- One finding per function, listing every missing boundary — do not split into many.
- WARNING by default; SUGGESTION when the function is on a cold, low-risk path.
