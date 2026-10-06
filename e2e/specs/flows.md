# Flows — behavioural contract

What the browser suite guarantees about the web app. Each section maps to one
`specs/NN-name.flow.json` file. All assertions are agent-browser `wait`s
(URL substring, visible text, or network idle) and clicks via `find`; see
[`../docs/runner.md`](../docs/runner.md) for mechanics.

**Shared precondition:** a freshly seeded DB (`server/src/db/seed.ts`) in which
`acme/payments-api` is the only repo. Seeded facts used below: PR **#482** titled
"Add rate limiting to public API endpoints", changed file `src/config.ts`, a review
run with verdict `request_changes` and 2 findings including "Hardcoded Stripe secret
key in commit", and an agent named "Security Reviewer".

```mermaid
flowchart TD
  root["/"] -->|redirect to repos[0]| pulls["/repos/:id/pulls"]
  pulls -->|click PR title| detail["/repos/:id/pulls/482"]
  detail -->|Agent runs| findings["?tab=findings"]
  detail -->|Files changed| diff["?tab=diff"]
  agents["/agents"]
  onboarding["/onboarding"]
  settings["/settings/api-keys → /settings/models"]
```

## 01 — App boot (`01-app-boot.flow.json`)

Whole-stack smoke: client loads, API returns repos, root redirects.

1. Open `{BASE}/`, wait for network idle.
2. URL contains `/pulls` — proves the API returned ≥1 repo (zero repos shows the
   "No repositories yet" empty state instead, `client/src/app/page.tsx`).
3. Text `Pull Requests` (list heading) is visible.

Independent of which repo is first; seeded-PR specifics are left to 02. Note that
"Pull Requests" is also a shell nav label (`client/messages/en/shell.json:18`), so the
text check is weak — the `/pulls` URL wait carries the real signal.

## 02 — PR list → PR detail (`02-repo-pulls-detail.flow.json`)

1. Open `{BASE}/`, URL contains `/pulls`.
2. Text `Add rate limiting to public API endpoints` is visible in the list.
3. Click that text (`find text … click`).
4. URL contains `/pulls/482`; network idle.
5. The same PR title is visible on the detail page.

Covers nested routing `/repos/<id>/pulls/<number>` and the per-PR detail fetch.

## 03 — Agents list (`03-agents.flow.json`)

1. Open `{BASE}/agents`, URL contains `/agents`, network idle.
2. Text `Security Reviewer` (a seeded agent card) is visible.

Does not depend on the single-repo precondition.

## 04 — PR findings (`04-pr-findings.flow.json`)

1. Open `{BASE}/`, land on `/pulls`, click the PR #482 title, URL contains `/pulls/482`, network idle.
2. Click button with accessible name `Agent runs` (`find role button click --name`).
3. URL contains `tab=findings`.
4. Text `request changes` (verdict in the run accordion header) is visible.
5. Text `2 findings` (finding count in the header) is visible.
6. Text `Hardcoded Stripe secret key in commit` is visible — no extra click, because the
   newest run's accordion is open by default.

Exercises ReviewRunAccordion / VerdictBanner / FindingsPanel / FindingCard.

## 05 — PR diff (`05-pr-diff.flow.json`)

1. Same path to `/pulls/482` as 04, network idle.
2. Click button named `Files changed`.
3. URL contains `tab=diff`.
4. Text `src/config.ts` (seeded file path) is visible in the diff viewer.

Exercises DiffViewer → FileCard → CodeLine; asserts only the file path, not line content.

## 06 — Onboarding (`06-onboarding.flow.json`)

1. Open `{BASE}/onboarding`, URL contains `/onboarding`.
2. Text `Add a repository` (heading) is visible.
3. Text `Repository URL` (field label) is visible.

Read-only: the form is never submitted (no clone/import, no backend mutation).

## 07 — Settings (`07-settings.flow.json`)

1. Open `{BASE}/settings/api-keys`, URL contains `/settings/api-keys`, network idle.
2. Text `API Keys` is visible.
3. Open `{BASE}/settings/models`, URL contains `/settings/models`.
4. Text `Feature Models` is visible.

Only section titles are asserted; no key is entered or saved.

## Summary of assertions

| Flow | URL asserts | Text asserts | Interactions |
|---|---|---|---|
| 01 | `/pulls` | `Pull Requests` | — |
| 02 | `/pulls`, `/pulls/482` | PR title (list + detail) | click PR title |
| 03 | `/agents` | `Security Reviewer` | — |
| 04 | `/pulls`, `/pulls/482`, `tab=findings` | `request changes`, `2 findings`, finding title | click PR title, `Agent runs` |
| 05 | `/pulls`, `/pulls/482`, `tab=diff` | `src/config.ts` | click PR title, `Files changed` |
| 06 | `/onboarding` | `Add a repository`, `Repository URL` | — |
| 07 | `/settings/api-keys`, `/settings/models` | `API Keys`, `Feature Models` | — |

## Intentionally NOT covered

- **Anything that calls an LLM**: starting a review run, chat, agent test runs, embeddings.
- **Mutations**: importing/cloning a repo (onboarding submit), saving API keys or model
  choices, creating/editing/deleting agents, posting to GitHub.
- **GitHub integration**: no outbound GitHub calls; PR data is seeded.
- **Empty and error states**: the zero-repo empty state, API-down or 4xx/5xx handling.
- **Content depth**: finding severity/body, diff line content, verdict banner details,
  run history beyond the newest run, agent detail pages.
- **Multi-repo setups**: flows 02/04/05 assume the seeded repo is `repos[0]`.
- **Visual/layout regressions, accessibility audits, mobile viewports** — screenshots are
  taken only on failure, never compared.
- Unit/component behaviour — covered by Vitest in `client/` and `server/` (see `../../TESTING.md`).
