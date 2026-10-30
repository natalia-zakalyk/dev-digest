# Spec — Prompt-assembly logging (ops log)

Status: implemented (tests deferred, see Acceptance). Modules: `reviewer-core`, `server`.

## Goal

Every LLM prompt DevDigest builds gets ONE structured, metadata-only log record
(`event: "prompt.assembled"`): each review call (one per agent run in single-pass, one per file
chunk in map-reduce) and the intent-classifier call. The record lists every prompt section
(name, source, trust, chars, tokens, items, truncated), provider/model and a `correlation_id`
shared by every record and log line of one review trigger.

## Trace is not the ops log

| | `run_traces.prompt_assembly` (existing) | `prompt.assembled` (this spec) |
|---|---|---|
| Content | the FULL prompt text (debug document) | sizes, flags, identifiers only |
| Sink | Postgres, read via `GET /runs/:id/trace`, shown in the studio | pino stdout only |
| Changed here | no | new |

This feature does not change `PromptAssembly`, `RunTrace`, `RunEvent` or the SSE schema, and does not
make the trace safer or smaller. It only adds to the ops log. No shared contract is touched.

## Record (`server/src/platform/prompt-log.ts`)

`{ event, schema_version: 1, call: 'review' | 'intent_classifier', correlation_id, run_id | null,
run_ids | null (intent only), agent_id | null, pr_id, provider, model, mode | null, chunk: { index,
count, label }, sections[], totals: { chars, tokens, sections }, verbose, items? , items_truncated? }`.
Emitted at `info` with message `prompt assembled`.

Section `{ name, source, trust, wrapped, chars, tokens, items, truncated, dropped? }`; `tokens` is an
estimate (`container.tokenizer`, cl100k or `ceil(chars/4)`), not the provider-billed count.

| Review section | source | trust |
|---|---|---|
| `system` | `agent_config` | trusted |
| `task` | `engine` | trusted |
| `pr_description` | `pr_author` | untrusted |
| `pr_intent` | `intent_llm` | untrusted |
| `skills` | `skills_db` | trusted |
| `memory` | `memory` | trusted |
| `repo_map`, `callers` | `repo_intel` | untrusted |
| `specs` | `project_specs` | untrusted |
| `diff` | `git_diff` | untrusted |

Classifier sections: `system` (engine), `header` (`pr_metadata`, holds the PR title: measured, never
logged), `pr_description`, `linked_issue`, `linked_doc` (items = docs), `commits`, `changed_files`,
`prior_prs`; `dropped: true` when the token budget removed it.

## Emission points

- Review: `reviewPullRequest` calls `onPromptAssembled` after assembly and BEFORE each chunk's LLM call
  (so a failing call still has its record). The whole-diff trace assembly sends no call and logs nothing.
  The executor (`run-executor.ts`) builds the record and calls `RunLogger.ops()`, plus a counts-only
  `runLog.info('prompt: N sections · ~T tokens (diff ~D)')` for the Live Log.
- Intent classifier: `IntentService.derive` calls `onClassifierPrompt` just before `completeStructured`
  (real model calls only: no record on a cache hit or the heuristic fallback). The manual
  `POST /pulls/:id/intent` route passes no callback and logs no record.
- Both callbacks run inside try/catch: a logging failure logs `prompt log failed` and never fails the run.

## Correlation id

`ReviewService.runReview` creates `randomUUID()` once per trigger and passes `{ correlationId }` to
`executeRuns`. It is in the fan-out `RunLogger` context (so every per-run stdout line carries it) and in
the direct `logger` lines. Not persisted (not in `run_traces`, not returned by the API). Pino `reqId`
stays as is (one HTTP request = one correlation id).

## Safety rules (every mode)

- Allow-list by construction: `buildPromptLogRecord` builds a fresh object from typed scalars; no
  spreading of caller objects. reviewer-core's `PromptSectionMeta` carries sizes/flags only, so the
  server never receives text.
- Forbidden in every mode: diff, PR title/body, intent text, skill/spec/memory bodies, repo map, callers,
  linked doc/issue text, commit subjects, the system prompt, secrets, free-text error messages, the
  OpenRouter `sessionId`, full prompts.
- Strings from outside go through sanitizers: model id regex (else `[invalid]`), ids regex, refs/labels
  via `redactCredentials`, control-char stripping, 200-char cap, `SECRET_PATTERNS` (match → `[redacted]`);
  refs also lose `?query` and `#fragment`.
- `RunLogger.ops()` writes to pino only and never touches the bus: not SSE, not `run_traces.log`.
- Size cap 16 KiB: over it, `items` is dropped and `items_truncated: true` set.
- reviewer-core stays pure: no logger/env/IO; tokenizing and hashing are an injected `measure` function.

## Verbose mode (local only)

Adds `items[]` per skill / spec chunk / memory item / linked doc: `{ section, index, ref, chars,
tokens, sha256_12? }`. `ref` is an identifier only (`name@vN (id)`, `spec-<i>`, `#<issue>`, a sanitized
doc URL/path).

- `PROMPT_LOG_VERBOSE=true` requests it; `PROMPT_LOG_HASHES=true` additionally requests 12-hex-char
  sha256 prefixes (only with effective verbose; low-entropy content can be guessed offline).
- Gate (fail closed, `config.ts#resolvePromptLog`): effective only when `NODE_ENV=development` AND
  `API_HOST` is loopback (`127.x.x.x`, `::1`, `localhost`). `0.0.0.0`, `::` and anything else are not
  loopback. In `production`/`test` it is ignored.
- `buildApp` logs a startup warning in both cases: `prompt-assembly verbose logging ON (local only,
  metadata only)` or `PROMPT_LOG_VERBOSE ignored: only honored with NODE_ENV=development on a loopback
  API_HOST`. No runtime toggle; a restart is required.

## Acceptance criteria

1. One `prompt.assembled` stdout line per LLM call (per chunk in map-reduce, one for the classifier).
2. No sentinel diff/PR body/spec/skill/secret string appears in any record, in default or verbose mode.
3. `ops()` publishes 0 bus events; SSE data and `run_traces.log` are unchanged.
4. `messages` and `assembly` are byte-identical with and without `measure`; classifier messages unchanged.
5. Verbose is off in test/production and on a non-loopback host.

Test plan (deferred this iteration, no test files written): reviewer-core `prompt`/`run` tests for
`sections` and callback order; server tests for the builder (sentinels, `safeRef`, size cap), `RunLogger.ops`,
the config gate matrix and `buildClassifierPrompt`.
