/**
 * Built-in skills used by the seed (L02). Mirrors `docs/skills/<name>/SKILL.md`
 * (frontmatter → name/description/type, the rest → body). Keep the two in sync.
 * The DB row is the source of truth at run time — editing here only affects
 * freshly seeded workspaces. `flaky-tests` is deliberately NOT seeded: it is the
 * skill imported live through the UI (docs/skills/flaky-tests.zip).
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
  /** Agent (by seeded name) the skill is linked to, in this array's order. */
  agent: string;
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'uncovered-branches',
    description:
      "Use on every PR that changes production logic. Map each new or changed branch to a test that exercises it and flag every branch with no test.",
    type: 'rubric',
    agent: 'Test Quality Reviewer',
    body: `# Uncovered branches

For every production function changed in the diff:

1. **List its branches**: each \`if\` / \`else\`, ternary, \`switch\` case, \`??\` / \`||\` fallback,
   early \`return\`, \`throw\`, \`catch\`, and loop that can run zero times.
2. **Find the test** in the same diff (or obviously existing test file) whose input drives
   execution down that branch. A test only covers a branch if its *input* forces it — a
   test name that mentions it is not enough.
3. **Flag each branch with no such test.** Cite the production line of the branch, name the
   input that would reach it, and give the one-line assertion the missing test should make.

Rules:
- A PR whose tests only call the happy path while the change adds an \`if\` / \`throw\` /
  early-return has an uncovered branch — report it (WARNING; CRITICAL when the branch
  guards money, auth, data deletion or persistence).
- Error paths count: a new \`throw\` or rejected promise with no \`expect(...).toThrow\` /
  \`rejects\` test is uncovered.
- Do not ask for tests of trivial getters, pure re-exports or type-only changes.`,
  },
  {
    name: 'missing-corner-cases',
    description:
      "Use when a PR changes code that takes numbers, strings, collections, dates or optional values. Check that tests hit the boundaries, not just one typical value.",
    type: 'rubric',
    agent: 'Test Quality Reviewer',
    body: `# Missing corner cases

For each input of a changed function, check the tests include the boundary values that
the code's own conditions create:

| Input kind | Cases a test must hit |
|---|---|
| Numeric threshold (\`>\`, \`>=\`, \`<\`, limits) | exactly at the limit, one below, one above; \`0\`; negative |
| String | empty \`''\`, whitespace only, very long, non-ASCII |
| Array / collection | empty, one element, duplicates, very large |
| Optional / nullable | \`undefined\`, \`null\`, missing key |
| Dates / time | month/year boundary, DST change, time zone other than UTC |
| Money / percentages | rounding (\`0.1 + 0.2\`), currency with no minor unit, 100 % / 0 % |

Rules:
- Compare the **operator in the code** with the **values in the test**: \`amount > 100\`
  tested only with \`50\` and \`500\` misses the boundary \`100\` — flag it and name the value.
- One finding per function, listing every missing boundary — do not split into many.
- WARNING by default; SUGGESTION when the function is on a cold, low-risk path.`,
  },
  {
    name: 'over-mocking',
    description:
      "Use when tests in the PR call vi.mock, vi.fn, vi.spyOn or hand-written fakes. Flag mocks that replace the very behaviour the test claims to verify.",
    type: 'convention',
    agent: 'Test Quality Reviewer',
    body: `# Over-mocking

Our convention: **mock only at the edges** — network (GitHub, LLM), clock, randomness,
filesystem of user repos. Everything inside the module under test runs for real; DB tests
use the Testcontainers Postgres helpers, not a mocked repository.

Flag a test when:
- It mocks the unit under test itself, or a function in the same module it is supposed to
  exercise (the test then only checks the mock).
- The only assertions are \`toHaveBeenCalled\` / \`toHaveBeenCalledWith\` on mocks, with no
  assertion on the returned value or resulting state.
- A mock returns a value the real dependency can never return (wrong shape, impossible
  status), so the test passes against a fiction.
- \`vi.mock\` of an internal helper is used to dodge setting up real input data.

Suggest the replacement: use the real function with a small input, or a fake from
\`server/src/adapters/mocks.ts\` at the adapter edge. WARNING; SUGGESTION when the mock is
merely redundant.`,
  },
  {
    name: 'api-contract-breaking-change',
    description:
      "Use when a PR changes an HTTP route, its Zod schemas or a shared contract. Detect changes that break existing clients and require them to be versioned or made backward compatible.",
    type: 'convention',
    agent: 'General Reviewer',
    body: `# API contract — breaking changes

Treat every route (\`app.get/post/put/patch/delete\`), its \`schema\` (params, querystring,
body, response) and every Zod contract in \`@devdigest/shared\` as a public contract with
existing clients (web UI, CI runner, scripts).

Flag as a breaking change when the diff:
- **Renames or removes a path / method**, or changes a path parameter's name or type.
- **Request side**: adds a *required* field, makes an optional field required, narrows a
  type or enum, tightens a limit (\`max\`, \`min\`, regex), or renames a field.
- **Response side**: removes or renames a field, changes its type, turns a value nullable,
  removes an enum member clients may receive, or changes the status code / error envelope.
- **Changes semantics silently**: same field name, different unit, meaning or default.

Not breaking: adding an optional request field, adding a response field, adding a new route.

For each finding, cite the changed line, name which existing client call breaks and how,
and propose the compatible alternative (keep the old field as deprecated, make the new field
optional with a default, or add a new route/version). CRITICAL when an existing in-repo client
(client/, reviewer-core, scripts) is not updated in the same diff; otherwise WARNING.`,
  },
];
