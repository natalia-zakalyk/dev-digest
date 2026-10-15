---
name: uncovered-branches
description: Use on every PR that changes production logic. Map each new or changed branch to a test that exercises it and flag every branch with no test.
type: rubric
---

# Uncovered branches

For every production function changed in the diff:

1. **List its branches**: each `if` / `else`, ternary, `switch` case, `??` / `||` fallback,
   early `return`, `throw`, `catch`, and loop that can run zero times.
2. **Find the test** in the same diff (or obviously existing test file) whose input drives
   execution down that branch. A test only covers a branch if its *input* forces it — a
   test name that mentions it is not enough.
3. **Flag each branch with no such test.** Cite the production line of the branch, name the
   input that would reach it, and give the one-line assertion the missing test should make.

Rules:
- A PR whose tests only call the happy path while the change adds an `if` / `throw` /
  early-return has an uncovered branch — report it (WARNING; CRITICAL when the branch
  guards money, auth, data deletion or persistence).
- Error paths count: a new `throw` or rejected promise with no `expect(...).toThrow` /
  `rejects` test is uncovered.
- Do not ask for tests of trivial getters, pure re-exports or type-only changes.
