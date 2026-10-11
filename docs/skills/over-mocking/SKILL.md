---
name: over-mocking
description: Use when tests in the PR call vi.mock, vi.fn, vi.spyOn or hand-written fakes. Flag mocks that replace the very behaviour the test claims to verify.
type: convention
---

# Over-mocking

Our convention: **mock only at the edges** — network (GitHub, LLM), clock, randomness,
filesystem of user repos. Everything inside the module under test runs for real; DB tests
use the Testcontainers Postgres helpers, not a mocked repository.

Flag a test when:
- It mocks the unit under test itself, or a function in the same module it is supposed to
  exercise (the test then only checks the mock).
- The only assertions are `toHaveBeenCalled` / `toHaveBeenCalledWith` on mocks, with no
  assertion on the returned value or resulting state.
- A mock returns a value the real dependency can never return (wrong shape, impossible
  status), so the test passes against a fiction.
- `vi.mock` of an internal helper is used to dodge setting up real input data.

Suggest the replacement: use the real function with a small input, or a fake from
`server/src/adapters/mocks.ts` at the adapter edge. WARNING; SUGGESTION when the mock is
merely redundant.
