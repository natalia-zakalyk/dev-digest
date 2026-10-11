---
name: flaky-tests
description: Use when tests in the PR touch time, timers, randomness, async work, ordering or shared state. Flag tests whose pass/fail depends on anything but the code.
type: convention
---

# Flaky tests

A test is flaky when the same code can pass or fail between runs. Flag:

- **Real time**: `Date.now()`, `new Date()`, `setTimeout` waits, or `sleep(…)` without
  `vi.useFakeTimers()` / an injected clock. Fixed waits ("wait 100 ms then assert") are
  always flaky under CI load.
- **Randomness**: `Math.random`, `crypto.randomUUID` in expected values without a seed or stub.
- **Unawaited async**: an `expect` after a promise that is not awaited, a missing
  `await expect(...).rejects`, event handlers asserted before they fire.
- **Ordering**: asserting on the order of `Promise.all` side effects, object key order from
  the DB without `ORDER BY`, or `Set` / `Map` iteration produced by concurrent work.
- **Shared state**: module-level variables, singletons or DB rows mutated by one test and
  read by another; missing `beforeEach` reset; tests that only pass in file order.
- **Environment**: dependence on local time zone, locale, network, or a developer's files.

For each finding, name the source of nondeterminism and the deterministic replacement
(fake timers, injected clock, seeded RNG, explicit sort, per-test fixture). WARNING by default.
