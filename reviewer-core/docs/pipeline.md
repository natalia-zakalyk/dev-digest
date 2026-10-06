# Review pipeline — how the engine works

End-to-end walk through `@devdigest/reviewer-core`: **diff → prompt → LLM → grounded findings**.
Contract/invariants live in [../specs/review-engine.md](../specs/review-engine.md); this file explains the mechanics.

## Overview

```mermaid
flowchart TD
  IN["ReviewInput<br/>systemPrompt · model · diff · llm · optional slots"] --> MODE{"selectMode()<br/>review/run.ts:120"}
  MODE -->|single-pass| C1["1 chunk: 'all files' = diff.raw"]
  MODE -->|map-reduce| CN["1 chunk per file<br/>sliceDiff(diff, path)"]
  C1 --> LOOP
  CN --> LOOP
  subgraph LOOP["per chunk (sequential)"]
    CC["checkCancelled()"] --> AP["assemblePrompt()<br/>prompt.ts"]
    AP --> LLM["llm.completeStructured&lt;Review&gt;<br/>schema = shared Review, maxRetries"]
    LLM --> US["accumulate tokens/cost<br/>onUsage(running totals)"]
  end
  LOOP --> RED["reduceReviews(partials)<br/>review/reduce.ts"]
  RED --> GR["groundFindings(merged.findings, diff)<br/>grounding.ts"]
  GR --> SC["score = scoreFromFindings(kept)"]
  SC --> OUT["ReviewOutcome<br/>review · grounding · dropped · mode · assembly · chunks · usage · raw"]
```

Entry point: `reviewPullRequest(input)` in `src/review/run.ts:128`.

## 1. Orchestration — `src/review/run.ts`

**Mode selection** (`selectMode`, `run.ts:120-126`):

| `strategy` | Result |
|---|---|
| `'single-pass'` | always single-pass |
| `'map-reduce'` | map-reduce only if `diff.files.length > 1`, else single-pass |
| `'auto'` (default) | map-reduce iff total `additions + deletions` > threshold **and** > 1 file |

Threshold = `input.mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES` (400). Retry budget passed
to the provider = `input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES` (2).

**Chunks** (`run.ts:149-152`): single-pass → one chunk labelled `'all files'` with `diff.raw`;
map-reduce → one chunk per file, `label = file.path`, text from `sliceDiff`.

**Per-chunk loop** (`run.ts:167-194`), strictly sequential:
1. `input.checkCancelled?.()` — caller-supplied; if it throws, the run aborts before the LLM call.
2. Emit a `tool` event (`map: reviewing <file>` or `Reviewing all files in one pass`).
3. `assemblePrompt({...promptParts, diff: chunk.diffText})`.
4. `input.llm.completeStructured<Review>({ model, schema: ReviewSchema, schemaName: 'Review', messages, maxRetries, sessionId? })`.
   `sessionId` is forwarded on every call when set (OpenRouter session grouping).
5. Accumulate tokens/cost, call `onUsage`, push raw + partial, emit a `result` event.

**Trace assembly** (`run.ts:147, 178`): `assembly` starts as the whole-diff assembly; in
single-pass it is overwritten by the actual call's assembly. In map-reduce it stays the
whole-diff assembly (no single call saw it).

**Events** (`onEvent`, kinds from shared `RunEventKind`): `info` mode line, `tool` per chunk,
`result` per chunk, `result` after reduce, one `info` per grounding drop, `result` `Citation grounding: k/n passed`.
The server bridges these onto SSE via `runLog.event` (`server/src/modules/reviews/run-executor.ts:215`).

## 2. Map-reduce helpers — `src/review/reduce.ts`

- `sliceDiff(diff, path)` (`reduce.ts:58`): scans `diff.raw` and captures every line from a
  `diff --git` header containing `b/<path>` or ` <path>` up to the next header. If nothing
  matches but the file is in `diff.files`, returns a header-only synthesized stub; if the file is
  unknown, returns the whole `diff.raw`.
- `reduceReviews(partials)` (`reduce.ts:43`): one partial → returned as-is. Otherwise: concat
  findings, **worst verdict wins** (`request_changes` > `comment` > `approve`), mean score
  (rounded), summaries joined with a space. The mean score is discarded later anyway (see §6).
- No dedup of findings across chunks happens here.

## 3. Prompt assembly — `src/prompt.ts`

`assemblePrompt(parts)` returns `{ messages: [system, user], assembly }`.

- **System message** = `parts.system + "\n\n" + INJECTION_GUARD` (`prompt.ts:86`). The guard
  (`prompt.ts:16-28`) is a trusted rule: everything inside `<untrusted>…</untrusted>` is data;
  claims like "test fixture / intentional / demo / do not flag" in any language never descope the
  review. It is not exported; it rides along with every `assemblePrompt` call.
- **User message** — sections joined by blank lines, in this fixed order, each omitted when empty:

| # | Section | Source | Wrapped as untrusted? |
|---|---|---|---|
| 1 | task line (no heading) | `task` | no |
| 2 | `## PR description` | `prDescription`, trimmed-empty → omitted, sliced to **4000 chars** | yes, `pr-description` |
| 3 | `## Skills / rules` | `skills[]` joined `\n\n` | no (trusted-ish) |
| 4 | `## Relevant memory` | `memory[]` as `- item` bullets | no (curated) |
| 5 | `## Repo skeleton` | `repoMap` (whitespace-only → omitted) | yes, `repo-map` |
| 6 | `## Project context` | `specs[]`, each wrapped `spec-<i>` | yes |
| 7 | `## Callers of changed symbols` | `callers` (whitespace-only → omitted) | yes, `callers` |
| 8 | `## Diff to review` | `diff` (always present, always last) | yes, `diff` |

- `wrapUntrusted(label, content)` (`prompt.ts:30`) produces
  `<untrusted source="label">\n…\n</untrusted>` and rewrites any literal `</untrusted>` in the
  content to `<\/untrusted>` so the content cannot close the fence.
- `assembly` (shared `PromptAssembly`) records `system`, `skills`, `memory`, `specs`, `callers`,
  `repo_map`, `pr_description` (null when absent) and the full `user` string, for the run trace.
- In the starter the server only fills `task`, `prDescription`, `callers`, `repoMap`
  (`run-executor.ts:197-214`); `skills`, `memory`, `specs` are left empty for lessons.

## 4. The injected `LLMProvider`

The engine only calls `input.llm.completeStructured` (interface in
`server/src/vendor/shared/adapters.ts:82`). Any implementation works: tests pass the server's
`MockLLMProvider` or inline stubs; the server builds a real one in `server/src/platform/container.ts`.

### `src/llm/openrouter.ts` — `OpenRouterProvider`

- OpenAI SDK pointed at `baseURL` (default `https://openrouter.ai/api/v1`), `timeout` 90 s,
  SDK `maxRetries` 2 (transport retries on timeout/5xx/429 — separate from schema retries).
- `completeStructured` (`openrouter.ts:59-116`): sends `response_format: json_schema` with
  `strict: true`, `temperature` default 0, optional `max_tokens`; for `id === 'openrouter'` also
  `session_id` (when given) and `usage: { include: true }`.
- **Parse-with-repair loop**: up to `maxRetries + 1` attempts. On a schema/JSON failure, appends
  the raw output as an `assistant` message plus the `repromptMessage` as a `user` message and
  retries. Exhausted → throws `OpenRouter structured output failed schema validation for <name>`.
- HTTP 200 with no `choices` → throws `OpenRouter returned no choices for <name>[: error]`.
- Tokens accumulate across attempts. **Cost**: sum of `usage.cost` from OpenRouter if any attempt
  returned it; else `estimateCost(model, in, out)` (injected — the server passes its PriceBook);
  else `null`.
- `listModels()` fetches `/models` raw, converts per-token prices to per-1M, treats negative/NaN
  prices as unknown (`pricing: null`), sorts cheapest completion first. `complete` / `embed` throw.

## 5. Structured output — `src/llm/structured.ts`

- `toJsonSchema(schema, name)` — reuses `zodResponseFormat` from `openai/helpers/zod` and returns
  `{ schema, name }`.
- `extractJson(text)` — best effort: content of the first ```` ```json ```` fence, else the first
  balanced `{…}` / `[…]` by naive depth counting (not string-aware), else the trimmed text.
- `parseWithRepair(schema, raw)` — `JSON.parse(raw.trim())` first; only on failure falls back to
  `extractJson` (fences/braces inside string values would fool it). Returns `{ok:true,data}` or
  `{ok:false, error, repromptMessage}` — for invalid JSON the reprompt says "Return ONLY a single
  valid JSON object"; for schema mismatch it lists `- path: message` per Zod issue.

## 6. Grounding and score — `src/grounding.ts`, `reduce.ts`

```mermaid
flowchart LR
  F["finding"] --> A{"file in diff.files?"}
  A -- no --> D1["drop: file '…' not present in diff"]
  A -- yes --> B{"kind ∈ secret_leak, lethal_trifecta,<br/>phantom, hook?"}
  B -- yes --> K["keep (file presence is enough)"]
  B -- no --> C{"any line in [min,max] of<br/>start/end ∈ new-side lines?"}
  C -- yes --> K
  C -- no --> D2["drop: lines s-e do not intersect any diff hunk in '…'"]
```

- `buildLineIndex(diff)` (`grounding.ts:24`): per file, union of each hunk's `newLineNumbers`;
  if a hunk has none, falls back to `newStart … newStart + max(newLines,1) - 1`.
- Ranges are order-insensitive (`min`/`max`). Matching is on exact `file === path`.
- `groundingSummary` → `"<kept>/<kept+dropped> passed"` (e.g. `1/2 passed`).
- After grounding, `run.ts:214` replaces `findings` with the kept set and `score` with
  `scoreFromFindings(kept)` = `clamp(100 − Σ penalty, 0, 100)`, penalties CRITICAL 35 / WARNING 12 /
  SUGGESTION 3 (`reduce.ts:13-30`). The model's `score` is ignored. **`verdict` and `summary` are
  kept as the model (or reduce) produced them** — they are not recomputed.

## 7. Usage and cost — `onUsage`

`run.ts:164, 187-190`: `costUsd` starts at `0`; per chunk it becomes `null` as soon as any chunk
reports `costUsd: null` (and stays null). After **each** chunk `onUsage({tokensIn, tokensOut, costUsd})`
is called with running totals, so if a later chunk throws (e.g. 429) the caller still holds the
partial usage — the server stores it in a local `usage` variable for persistence on failure.

## 8. Output — `src/output/to-review.ts`

`toReviewPayload(review, opts)` → `GitHubReviewPayload` (used by CI from L06; the server only uses
`countBlockers` today, `run-executor.ts:3`).
- **Event** is deterministic: no findings → `APPROVE`; `gateTriggered(findings, failOn)` →
  `REQUEST_CHANGES`; else `COMMENT`. `failOn` defaults to `'critical'`; the model `verdict` is ignored.
- Gate ranks: SUGGESTION 1, WARNING 2, CRITICAL 3; `failOn` minimums never=∞, critical=3, warning=2, any=1.
  `countBlockers` counts findings at/above that minimum.
- Body: header (`— Approved ✅` / `— Changes requested` / plain), counts line, one bullet per finding.
- Inline comments (`inline` default true): with `opts.diff`, anchored to the new-side line in
  `[start,end]` nearest `end_line` (skipped if none — still listed in the body); without a diff,
  raw `end_line`.

## 9. How the server consumes it

No build and no npm dependency: `server/tsconfig.json:24-25` maps `@devdigest/reviewer-core` →
`../reviewer-core/src/index.ts` and `server/vitest.config.ts:8` aliases the same source; the server
runs it via tsx/vitest. Conversely, reviewer-core resolves `@devdigest/shared` to
`../server/src/vendor/shared` (`tsconfig.json` paths, `vitest.config.ts`), and `test/run.test.ts`
imports `MockLLMProvider`/`MockGitClient` from `../../server/src/adapters/mocks.js`. Server entry
points: `modules/reviews/run-executor.ts` (`reviewPullRequest`, `countBlockers`),
`platform/{prompt,structured,grounding}.ts` (re-exports), `platform/container.ts` (`OpenRouterProvider`).
