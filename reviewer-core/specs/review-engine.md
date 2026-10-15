# Spec — review engine contract

Status: **implemented** (describes current behaviour; change it deliberately). Mechanics:
[../docs/pipeline.md](../docs/pipeline.md). Contracts (`Review`, `Finding`, `UnifiedDiff`,
`LLMProvider`, `PromptAssembly`, …) come from `@devdigest/shared` =
`../server/src/vendor/shared` — never redefine them here.

## Public API (`src/index.ts`)

Anything not exported from `src/index.ts` is internal (e.g. `scoreFromFindings`, `buildRangeIndex`,
`INJECTION_GUARD`, `SEV_RANK`). The server compiles against this source, so renaming or removing
an export breaks `server` typecheck.

| Export | Signature (simplified) | File |
|---|---|---|
| `reviewPullRequest` | `(ReviewInput) => Promise<ReviewOutcome>` | `review/run.ts` |
| `DEFAULT_MAP_THRESHOLD_LINES` | `400` | `review/run.ts` |
| `DEFAULT_REVIEW_MAX_RETRIES` | `2` | `review/run.ts` |
| `DEFAULT_REVIEW_MAX_TOKENS` | `16_000` | `review/run.ts` |
| `assemblePrompt` | `(PromptParts) => { messages: ChatMessage[]; assembly: PromptAssembly }` | `prompt.ts` |
| `wrapUntrusted` | `(label, content) => string` | `prompt.ts` |
| `groundFindings` | `(Finding[], UnifiedDiff, { source?: 'llm' \| 'scanner' }?) => { kept; dropped: {finding, reason}[] }` | `grounding.ts` |
| `MAX_FINDING_SPAN_LINES` | `500` | `grounding.ts` |
| `groundingSummary` | `(GroundingResult) => "k/n passed"` | `grounding.ts` |
| `toJsonSchema` | `(ZodType, name) => { schema, name }` | `llm/structured.ts` |
| `extractJson` | `(text) => string` | `llm/structured.ts` |
| `parseWithRepair` | `(ZodType<T>, raw) => {ok:true,data} \| {ok:false,error,repromptMessage}` | `llm/structured.ts` |
| `reduceReviews` / `sliceDiff` | `(Review[]) => Review` / `(UnifiedDiff, path) => string` | `review/reduce.ts` |
| `toReviewPayload` | `(Review, ToReviewOptions?) => GitHubReviewPayload` | `output/to-review.ts` |
| `gateTriggered` / `countBlockers` | `(Finding[], CiFailOn) => boolean / number` | `output/to-review.ts` |
| `OpenRouterProvider` | `new (apiKey, OpenRouterProviderOptions?)` implements `LLMProvider` | `llm/openrouter.ts` |

Types: `PromptParts`, `AssembledPrompt`, `GroundingResult`, `GroundingOptions`, `JsonSchema`, `ParseResult`,
`ReviewInput`, `ReviewOutcome`, `ReviewEvent`, `ReviewStrategy`, `ReviewMode`, `ToReviewOptions`,
`OpenRouterProviderOptions`.

### `ReviewInput` (`review/run.ts:44-98`)

Required: `systemPrompt`, `model`, `diff: UnifiedDiff` (parsed, hunks carry new-side lines),
`llm: LLMProvider`.
Optional: `strategy` (`'auto'` default | `'single-pass'` | `'map-reduce'`), `skills[]`, `memory[]`,
`specs[]`, `callers`, `repoMap`, `prDescription`, `task`, `maxRetries`, `maxTokens` (default
`DEFAULT_REVIEW_MAX_TOKENS`, sent on every LLM call), `mapThresholdLines`,
`sessionId`, `onEvent(ReviewEvent)`, `checkCancelled()`, `onUsage({tokensIn, tokensOut, costUsd})`.

### `ReviewOutcome` (`review/run.ts:100-118`)

`review: Review` (grounded) · `grounding: string` · `dropped: {finding, reason}[]` ·
`mode: 'single-pass' | 'map-reduce'` · `assembly: PromptAssembly` · `chunks: {label}[]` ·
`tokensIn` · `tokensOut` · `costUsd: number | null` · `raw` (chunk raws joined by `\n---\n`).

## Invariants

1. **Every returned finding is grounded.** `review.findings` is exactly `groundFindings(...).kept`
   (`run.ts`): its `file` is a path in `diff.files`, `start_line <= end_line`, the span is at
   most `MAX_FINDING_SPAN_LINES` (500) lines, and its `[start_line, end_line]` range contains at
   least one new-side diff line of that file. `reviewPullRequest` grounds with the default
   `source: 'llm'`, so **no** `kind` exempts an LLM finding. Only callers passing
   `{ source: 'scanner' }` (deterministic full-file scanners) get the exemption for
   `secret_leak | lethal_trifecta | phantom | hook` (file presence suffices; range checks still
   apply). Everything else is in `dropped` with a reason, and
   `grounding === "${kept}/${kept + dropped} passed"`.
2. **Score is deterministic from surviving findings** (`reduce.ts:13-30`, applied at `run.ts:214`):
   ```ts
   score = Math.max(0, Math.min(100, 100 - Σ penalty(f.severity)))
   // penalty: CRITICAL 35, WARNING 12, SUGGESTION 3
   ```
   0 findings → 100; one CRITICAL → 65. The model's self-reported `score` (and the reduce mean) is
   never returned. `verdict` and `summary` are passed through from the model / `reduceReviews`
   (worst verdict wins) — they are **not** recomputed.
3. **Unknown cost → `null`, never 0.** Totals start at 0; once any chunk returns `costUsd: null`
   the outcome's `costUsd` is `null` (`run.ts:189`). `OpenRouterProvider` returns API cost, else
   the injected `estimateCost`, else `null` (`openrouter.ts:107`).
4. **Usage is reported per chunk.** `onUsage` fires after every successful chunk with running
   totals, so callers keep partial usage when a later chunk throws.
5. **No I/O besides the injected LLM.** `reviewPullRequest` and all helpers touch no DB, GitHub,
   filesystem or env. The only network code is inside `OpenRouterProvider` (an `LLMProvider`
   implementation, used only when the caller injects it).
6. **Prompt hardening.** Every `assemblePrompt` system message ends with `INJECTION_GUARD`; the
   diff and all repo/author-derived slots (PR description, repo map, specs, callers) are wrapped
   with `wrapUntrusted`, whose content cannot contain a real opening or closing `untrusted` tag
   (any case, whitespace or attributes). The diff section is
   always last. Empty optional slots produce no section. PR description is capped at 4000 chars.
7. **Deterministic output event.** `toReviewPayload().event` depends only on findings and `failOn`
   (default `'critical'`): none → `APPROVE`, gate tripped → `REQUEST_CHANGES`, else `COMMENT`.
   With `opts.diff`, inline comments anchor only to real new-side lines.
8. **Mode selection** follows `selectMode` (`run.ts:120`); `'map-reduce'` never runs on a 1-file diff.

## Error behaviour

| Situation | Behaviour |
|---|---|
| `checkCancelled` throws | Propagates the caller's error before the next LLM call; no outcome. |
| Provider `completeStructured` throws (network, 429, quota) | Propagates; earlier chunks' usage already sent via `onUsage`. No partial outcome. |
| Model output fails JSON/schema | Provider's job: `OpenRouterProvider` reprompts up to `maxRetries` (default 2 → 3 attempts), then throws `…failed schema validation for Review: <last error, ≤500 chars>`. |
| OpenRouter `/models` payload malformed | `listModels` throws `OpenRouter /models returned an unexpected shape: <issues>`. |
| OpenRouter 200 with no `choices` | `OpenRouterProvider` throws `OpenRouter returned no choices for Review[: msg]`. |
| All findings ungrounded | Not an error: empty `findings`, score 100, drops listed + emitted as `info` events. |
| `OpenRouterProvider.complete` / `embed` | Throw `OpenRouterProvider only implements completeStructured`. |

## Test coverage

Run with `npm test` (vitest, `test/**/*.test.ts`); all hermetic — stubbed `LLMProvider`, no keys.

| Behaviour | Test |
|---|---|
| Single-pass run, hallucinated finding dropped, `1/2 passed`, score 65 from survivors | `test/run.test.ts` — "single-pass: assembles, grounds…" |
| Model score ignored: clean approve → 100 | `test/run.test.ts` — "score is deterministic…" |
| `checkCancelled` aborts before LLM call | `test/run.test.ts` — "checkCancelled throwing…" |
| `onUsage` running totals; partial usage kept when chunk 2 throws (map-reduce) | `test/run.test.ts` — "onUsage reports running totals…" |
| `sessionId` forwarded to every call | `test/run.test.ts` — "forwards sessionId…" |
| `INJECTION_GUARD` appended; anti-descoping wording | `test/prompt.test.ts` — "shared injection guard" |
| PR description: wrapped, before diff, omitted when blank, 4000 cap | `test/prompt.test.ts` — "## PR description" |
| Deterministic event + `failOn` policies + default | `test/to-review.test.ts` — "deterministic CI gate" |
| `countBlockers` / `gateTriggered` | `test/to-review.test.ts` |
| Inline anchoring (nearest in-diff line, drop when none, legacy fallback) | `test/to-review.test.ts` — "inline comment line anchoring" |
| Grounding: range intersection across hunk gaps, declared-range fallback, reversed / >500-line spans dropped, fast huge-range reject, scanner-only `kind` exemption | `test/grounding.test.ts` |
| `wrapUntrusted` neutralizes case/space/attribute variants of the tag | `test/prompt.test.ts` — "wrapUntrusted" |
| `sliceDiff` exact match (foo.ts vs foo.tsx vs sub/foo.ts, rename, deletion, fallbacks); `reduceReviews` merge | `test/reduce.test.ts` |
| Map-reduce: one chunk per file, each prompt only its slice; `maxTokens` default + override; LLM `secret_leak` off-hunk dropped | `test/run.test.ts` — "map-reduce + output cap" |
| `OpenRouterProvider`: repair loop (attempts, usage sum, reprompt), exhausted → error with issues, no-choices guard, `listModels` mapping + malformed payload + non-2xx | `test/openrouter.test.ts` |

Covered only from the server suite (`cd ../server && pnpm test`), via its re-exports:
grounding with the real diff parser (`server/test/grounding.test.ts`), `toJsonSchema` / `extractJson` / `parseWithRepair` (`server/test/prompt-structured.test.ts`),
callers section ordering/omission (`server/test/prompt-callers.test.ts`).

**Not covered by any test:** `OpenRouterProvider` cost precedence (API cost vs `estimateCost`), `auto` threshold selection,
`costUsd` → `null` propagation, `repoMap` / `skills` / `memory` / `specs` section rendering in this package.
