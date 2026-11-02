# Spec — Intent layer (PR motivation → review context)

Status: implemented (L03). Client side: [../../client/specs/intent-layer.md](../../client/specs/intent-layer.md).
Reviewer prompt side: [../../reviewer-core/specs/review-engine.md](../../reviewer-core/specs/review-engine.md) (invariant 6).

## Goal

Before the agents review a PR, work out what it is **for**: intent, in scope, out of scope, risk areas, and how sure
we are. A cheap model (feature model `review_intent`, default `openrouter` / `deepseek/deepseek-v4-flash`) does the
classification. The result is stored per PR (`pr_intent`), added to **every** agent's review prompt and shown as the
Intent card on the PR Overview tab.

Non-goals: no Blast Radius card, no new finding categories, no "scope violation" gate, no Jira/Linear/Notion fetch,
no per-agent opt-out, intent cost is **not** added to `agent_runs.cost_usd` / the PR-list COST (one call is shared
by N runs; it would be counted N times).

## A. Sources and weights

| Source | Origin | Tier |
|---|---|---|
| title | `pull_requests.title` | always; alone gives **low** |
| description | `pull_requests.body`, PR-template boilerplate stripped (HTML comments, headings, empty checklist lines) | **documented** when >= 80 meaningful chars (`MIN_DESCRIPTION_CHARS`) |
| linked issue | keyword-prefixed ref (`closes/fixes/resolves/refs/relates to/part of/implements/see #N`) or same-repo `github.com/<o>/<r>/issues/N` -> `GitHubClient.getIssue` (<= 1) | documented |
| linked plan/spec | repo-relative `*.md` path, same-repo GitHub blob/raw URL, other-repo/gist `.md/.markdown/.txt` URL (<= 3) | documented |
| branch, commit subjects (<= 30), changed paths (<= 200), diff stats, prior PRs on the same files (<= 5) | DB | indirect |
| any other link (Jira, Linear, Notion, Confluence, `example.com`, `127.0.0.1`, `http://`, ...) and other-repo issues | detected in the body | **never requested**, recorded `fetched:false` with a note (host only, at most 5) |

Bare `#N` ("step #2") is not a ticket link (stricter than the octokit `linked_issue` regex).

**Confidence ceiling (deterministic, the model cannot exceed it):** `high` = documented description AND >= 1 linked
issue/doc fetched; `medium` = documented description only; `low` = anything else (`basis = inferred`).
Stored confidence = `min(model, ceiling)`.

## B. Sequence

`ReviewRunExecutor.executeRuns`, after "Diff ready" and before the agent loop, once per trigger, on the fan-out
logger (every Live Log + persisted trace shows it): `runLog.step('Deriving PR intent', ...)` ->
`IntentService.derive(workspaceId, prId, { log })`. It is **best-effort**: any error logs an `info` line and the
reviews run without intent (never `failAll`).

`derive`:
1. Load PR inputs + prior PRs (`IntentRepo`).
2. `extractLinks(body)` (pure), then fetch (each failure is recorded in `sources`, never thrown):
   - same-repo doc: `GitClient.readFileAt(repo, headSha, path)` (`git show <sha>:<path>`, local, works for private
     repos; if the head is not fetched yet, `fetchPullHead` once and retry);
   - other-repo/gist doc: `container.docFetcher` (`SafeHttpsFetcher` with the doc validator);
   - issue: `GitHubClient.getIssue`.
3. Resolve the model (`resolveFeatureModel(ws, 'review_intent')`); `inputHash = sha256(PROMPT_VERSION, model,
   title, body, branch, base, commit subjects, paths, doc texts, issue text)`.
4. **Cache:** stored row with the same `input_hash`, `method='llm'`, and no `force` -> reuse (0 tokens). A body edit,
   a new commit/file, a new model or a prompt-version bump invalidates it.
5. `completeStructured({ schema: IntentClassification, temperature: 0, maxTokens: 800, maxRetries: 1 })`, trim lists
   (<= 8 scope items, <= 6 risk areas, each <= 140 chars), clamp confidence, upsert.
6. **Fallback** (model error, schema failure, missing key, no model): `heuristicIntent` (title + branch type,
   top-level dirs, path-rule risks), `method='heuristic'`, `confidence='low'`, stored **without** `input_hash` so the
   next run retries the model.

`reviewPullRequest({ ..., intent })` receives a `ReviewIntent`; `RunTrace.intent` records
`{ method, confidence, cached, provider, model, tokens_in, tokens_out, cost_usd }` (cost null when cached/unknown).

## C. Schema (migration `0015_*`)

`pr_intent` gains `risk_areas`, `confidence`, `basis`, `method` (CHECK-constrained), `sources`, `head_sha`,
`input_hash`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd` (NULL = unknown), `generated_at`. Existing
columns unchanged; access is by PK only.

## D. API

| Method | Path | Notes |
|---|---|---|
| GET | `/pulls/:id/intent` | `IntentResponse`; `{intent:null}` when not derived; never calls the model; 404 outside the workspace; `stale = head_sha != pull.head_sha` |
| POST | `/pulls/:id/intent` | body `{force?}` (absent body allowed); derives synchronously; rate limit 10/min; a missing key gives a heuristic, not an error |

Contracts (both `@devdigest/shared` copies): `IntentConfidence/Basis/Method/SourceKind`, `IntentSource`,
`IntentClassification` (LLM output), `ReviewIntent`, `PrIntentRecord` (extended), `IntentResponse`,
`DeriveIntentBody`, `PromptAssembly.intent`, `RunTrace.intent` (both `nullish`: old traces lack them),
`GitClient.readFileAt`.

## E. Safety

- All classifier input blocks are `wrapUntrusted`; the output is again untrusted in the reviewer prompt
  (`pr-intent` wrapper) with a trusted rule "out-of-scope never exempts code from review".
- Outbound: docs only from `raw.githubusercontent.com`, `gist.githubusercontent.com`, `github.com` (rewritten to raw);
  https, no credentials/ports, manual redirects (<= 3) re-validated, private-IP check, 256 KB cap, text content
  types only. Private cross-repo links return 404 and are recorded as not fetched; the token is never sent.
- `readFileAt`: ref must look like a sha/branch (never an option), path normalised (no absolute/`..`), symlink blobs
  refused, 256 KB cap.
- Logs carry refs/counts/tokens only, never document bodies, the PR body or keys.
- Before a real classifier call (not on a cache hit or the heuristic fallback) the executor logs one
  `prompt.assembled` record (`call: intent_classifier`, stdout only) from `buildClassifierPrompt`'s section
  metadata; see [prompt-assembly-logging.md](prompt-assembly-logging.md). The manual `POST /pulls/:id/intent` logs none.

## Acceptance criteria

1. A run on a PR with a documented description writes `pr_intent` and every agent prompt contains `## PR intent (derived)`.
2. Re-running with unchanged inputs makes no intent model call (`trace.intent.cached = true`).
3. Model/key failure never fails a run; a low-confidence heuristic intent is used.
4. A non-allow-listed link is never requested and appears in `sources` with `fetched:false`.
5. `GET` for another workspace's PR is 404; bad id is 422; `POST` is rate-limited.
