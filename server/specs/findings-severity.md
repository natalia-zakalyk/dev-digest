# Spec — Findings by severity (server side)

Status: implemented · Lab L01 · UI side: [client/specs/findings-severity.md](../../client/specs/findings-severity.md)

## Goal
The Pull Requests list shows, per PR, how many findings of each severity the current review state
has (CRITICAL / WARNING / SUGGESTION), so the user can triage without opening every PR.

## API
- `GET /repos/:id/pulls` → `PrMeta.findings?: { critical: number; warning: number; suggestion: number } | null`
  (list endpoint only).
- The PR Detail timeline needs **no** server change: `GET /pulls/:id/reviews` already returns each
  review's findings and its `run_id`.

## Aggregation rule
- Reviews of `kind = 'review'` only (summaries carry no findings).
- **Latest review of each agent**, summed (same rule as `cost_usd`): an agent's rerun replaces its
  previous findings, two different agents add up.
- Agent-less reviews (`agent_id` NULL — seeded demo data, no timeline run) count only while the PR
  has no agent review; once a real agent has reviewed it they are left out.
- **Dismissed and accepted findings are counted** (the count is what the review found, not the
  triage state).
- Unknown severities (e.g. `INFO`) are ignored.
- PR never reviewed → `findings: null`. Reviewed with no findings → `{0, 0, 0}`.

## Implementation
- `modules/pulls/status.ts`: `latestReviewPerAgent(rows)` (pure; rows newest-first) +
  existing `rollupSeverities(rows)`.
- `modules/pulls/routes.ts` list handler: the existing reviews IN-query also selects `id` and
  `agentId`; one more IN-query on `findings` for the selected review ids.
- `PrMeta.findings` is `.nullish()` in both copies of `@devdigest/shared` (server + client).

## Acceptance criteria
- The numbers in the list equal the per-severity counts of the latest review of each agent on the
  PR detail page.
- Rerunning one agent does not double its findings.
