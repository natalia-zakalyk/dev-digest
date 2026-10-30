# Development Plan: Safe structured logging of prompt assembly
Slug: prompt-assembly-logging · Date: 2026-10-30 · Modules: reviewer-core, server · Spec: MISSING (S0 writes `server/specs/prompt-assembly-logging.md`; everything after S0 is provisional until the spec is accepted) · Complexity: M
Status: draft

## Goal and non-goals

**Goal.** Every LLM prompt that DevDigest builds gets one structured, metadata-only log record (`event: "prompt.assembled"`). This covers each review call: one per agent run in single-pass mode, one per file chunk in map-reduce mode. It also covers the intent-classifier call. Each record lists every section of the prompt (section name, source, trust, chars, tokens, item count, truncated flag), the selected provider and model, and a correlation ID that ties together all records and log lines of one review trigger. A **verbose mode** adds item-level metadata (per skill, per spec chunk, per linked doc, optional short content hashes). It turns on only on a local developer machine.

**Non-goals.**
- No change to `PromptAssembly` / `run_traces`. The trace keeps storing the full prompt text, as it does today. A persisted debug store, read through `GET /runs/:id/trace` and shown in the studio, is a different thing from an ops log written to stdout. This plan only adds to the ops log. It does not make the trace safer and does not shrink it.
- No logging of bodies, ever: no diff, PR description, intent text, skill bodies, spec or memory content, system prompt text or secrets, in any mode.
- No new UI and no change to the SSE event schema.
- No clean-up of the existing `RunLogger` `data` passthrough for unrelated events (see Risks). Only the new record is hardened.
- No new DB table or migration. No new dependency.
- No CI runner / GitHub Action wiring. The reviewer-core API is additive, so the runner can opt in later.

## Constraints applied
- reviewer-core stays pure: no logger, env, fs or IO. Only the injected `LLMProvider` and injected callbacks. — source: `reviewer-core/AGENTS.md` (Conventions "No side effects"), `server/.dependency-cruiser.cjs:104-121` (`reviewer-core-stays-pure`, `reviewer-core-no-io-builtins`), `onion-architecture` principle 12.
- Hashing and token counting therefore live in the server and are injected into the core as a pure `measure` function, the same way intent already injects `countTokens`. — source: `server/src/modules/intent/compose.ts:15`, `server/src/modules/intent/domain/prompt.ts:52`.
- Use the existing token estimator `container.tokenizer` (js-tiktoken `cl100k_base`, falls back to `ceil(chars/4)`, never throws). Do not add a new one. — source: `server/src/adapters/tokenizer/index.ts:16-40`, `server/src/platform/container.ts:153`, `run-executor.ts:345,423`.
- Secrets never go into `AppConfig`, the DB or logs. Only `SecretsProvider` reads keys. — source: `server/AGENTS.md` Conventions, `server/src/platform/config.ts:9-14`.
- `RunLogger.event()` sends `data` to SSE and to pino unfiltered (`run-logger.ts:51-52`). `run_traces.log` keeps only `t/kind/msg` (`run-logger.ts:94-96`). So `msg` reaches all three sinks and `data` reaches SSE and stdout. The new record must not ride on `event()`.
- Pino `redact` is a path deny-list (`app.ts:43-64`, `*.key` matches only one level deep). It is a backstop, not the design. The record is built from an allow-list.
- Importing the reviewer-core barrel from a server `domain/` file pulls in the openai SDK. Import the specific file (`@devdigest/reviewer-core/prompt`) where purity matters. — source: `server/INSIGHTS.md:22`.
- Any new field on `RunTrace` / `PromptAssembly` must be `.nullish()`. This plan adds none, so the rule only applies if the Q2 fallback is chosen. — source: `server/INSIGHTS.md:17`.
- Two copies of `@devdigest/shared`. This plan intentionally avoids contract changes, so neither copy is touched. — source: root `AGENTS.md` Gotchas.
- No workspace. Commands run per module: `npm` in `reviewer-core/`, `pnpm` in `server/`. The server compiles reviewer-core source through a path alias, so a reviewer-core export change can break the server typecheck. — source: root `AGENTS.md` Map, `reviewer-core/AGENTS.md` Gotchas.
- Tests stay hermetic: offline, no keys. ITs that trigger a review must mock every provider. — source: root `AGENTS.md` Gotchas, `server/INSIGHTS.md:30`.
- Server bind default is loopback (`API_HOST` default `127.0.0.1`). `NODE_ENV` is in {development, test, production}, with test → `logLevel` silent. — source: `server/src/platform/config.ts:32-41,82`.
- Onion rings: the record builder is pure (platform helper, no IO). The executor and services are the application ring and only call ports and callbacks. Config is parsed only in `config.ts`. — source: `onion-architecture` ring table, principles 5 and 10.
- Intent logs already promise "refs/counts/tokens only, never document bodies, the PR body or keys". The new classifier record keeps that promise. — source: `server/specs/intent-layer.md:88`, `server/src/modules/intent/service.ts:35`.

## Skills for implementer
| Skill | Why | Steps |
|---|---|---|
| `engineering-insights` | Step 0: read `server/INSIGHTS.md` and `reviewer-core/INSIGHTS.md` before coding (read-only for the planner; the implementer follows the skill). | all |
| `onion-architecture` | Keep reviewer-core pure (metadata via return value and callback), place the record builder in a pure ring, keep the executor and intent service free of logger internals, run `pnpm lint:arch`. | S1, S2, S4, S5, S6, S7, S8 |
| `typescript-expert` | Closed literal unions for section names and sources, an exhaustive `Record<PromptSectionName, …>` source table, `satisfies`, an additive non-breaking public API. | S1–S8 |
| `fastify-best-practices` | Pino logger config, `req.log` child bindings (`reqId`), the startup warning in `app.ts`. | S3, S6 |
| `security` | A09 logging failures: allow-list record, secret patterns, local-only gating (fail closed), ref sanitizing. | S3, S4, S5, S7, S8 |
| `zod` | Only for the env schema addition in `config.ts` (`z.preprocess`, like `LOG_LEVEL`). No shared contract changes. | S3 |

Not needed: `drizzle-orm-patterns`, `postgresql-table-design` (no DB change); client skills (no client change).

## 1. Data model of a log record

One record per assembled prompt that is actually sent to a model. It is emitted as a pino object at `info` level with message `prompt assembled`.

```
PromptLogRecord {
  event: 'prompt.assembled'            // literal
  schema_version: 1                    // literal number
  call: 'review' | 'intent_classifier'
  correlation_id: string               // UUID v4, see §3
  run_id: string | null                // agent_runs.id (uuid); null for the intent call (it is shared by every run)
  run_ids: string[] | null             // intent call only: the fan-out target runIds
  agent_id: string | null              // uuid; null for intent
  pr_id: string                        // uuid (already logged today as prId)
  provider: 'openai' | 'anthropic' | 'openrouter' | …  // the Provider enum value only
  model: string                        // model id; sanitized: /^[A-Za-z0-9._:/@-]{1,120}$/, else '[invalid]'
  mode: 'single-pass' | 'map-reduce' | null   // null for intent
  chunk: { index: number; count: number; label: string | null }  // label = sanitized file path (map-reduce) | 'all files'
  sections: SectionRecord[]            // in prompt order, only sections that are present
  totals: { chars: number; tokens: number | null; sections: number }
  verbose: boolean
  items?: ItemRecord[]                 // ONLY when verbose
}

SectionRecord {
  name: PromptSectionName              // closed enum, see below
  source: PromptSectionSource          // closed enum, fixed per name (table below)
  trust: 'trusted' | 'untrusted'
  wrapped: boolean                     // inside <untrusted …>
  chars: number                        // length of the rendered section (incl. heading + wrapper)
  tokens: number | null                // container.tokenizer.count; null if no measure was injected
  items: number                        // number of skills / spec chunks / memory items / docs; 1 for scalar sections
  truncated: boolean                   // pr_description (>4000), intent (>1200), classifier clips
  dropped?: boolean                    // intent classifier only: removed by the token budget
}

ItemRecord (verbose only) {
  section: PromptSectionName
  index: number
  ref: string | null                   // ONLY identifiers: skill `name@vN` + id, `spec-<i>` (or a spec file path if the caller provides one), linked doc ref (sanitized URL/path), `#<issue>`; never content
  chars: number
  tokens: number | null
  sha256_12?: string                   // first 12 hex chars of sha256(item text); only if PROMPT_LOG_HASHES is on (§5)
}
```

**Section names and fixed sources (review call)**, in `assemblePrompt` order (`reviewer-core/src/prompt.ts:121-160`):

| name | source | trust | wrapped |
|---|---|---|---|
| `system` | `agent_config` (agent system prompt + engine `INJECTION_GUARD`) | trusted | no |
| `task` | `engine` (task line + rank note) | trusted | no |
| `pr_description` | `pr_author` | untrusted | yes |
| `pr_intent` | `intent_llm` | untrusted | yes |
| `skills` | `skills_db` | trusted | no |
| `memory` | `memory` | trusted | no |
| `repo_map` | `repo_intel` | untrusted | yes |
| `specs` | `project_specs` | untrusted | yes |
| `callers` | `repo_intel` | untrusted | yes |
| `diff` | `git_diff` | untrusted | yes |

**Intent classifier sections** (`server/src/modules/intent/domain/prompt.ts:56-94`): `system` (`engine`), `header` (`pr_metadata`, trusted, holds the PR title, so it is only measured, never logged), `pr_description` (`pr_author`), `linked_issue` (`github_issue`), `linked_doc` (`linked_doc`, items = docs), `commits` (`git_log`), `changed_files` (`git_diff`), `prior_prs` (`db`). Each one carries `dropped: true` when the budget loop removed it.

**Allowed values.** Numbers, booleans, closed enum strings, UUIDs, the `Provider` enum, a regex-sanitized model id, and sanitized refs/labels (§4). Nothing else.

**Explicitly forbidden, in every mode:**
- any substring of section content: diff hunks, PR title/body, rendered intent, skill bodies, memory items, spec text, repo map, callers digest, linked doc/issue text, commit subjects, the system prompt or `INJECTION_GUARD`;
- secrets: API keys, tokens, `Authorization` headers, URL userinfo, query strings on refs;
- free-text error messages (provider errors can echo request config);
- the OpenRouter `sessionId` (it includes owner/repo/PR/agent name; there is no need for it, since correlation_id covers it);
- full prompts or message arrays.

## 2. Emission points and call sequence

```
POST /pulls/:id/review (routes.ts:44, req.log with reqId)
└─ ReviewService.runReview            → generate correlation_id (S6)
   └─ executeRuns(…, logger, { correlationId })
      ├─ RunLogger(fan-out, ctx { prId, correlationId })
      ├─ Loading PR diff               (existing)
      ├─ deriveIntent → IntentService.derive(…, { log, onClassifierPrompt })   (S8)
      │    └─ cache miss + model chosen → buildClassifierPrompt → onClassifierPrompt(meta)
      │         └─ executor: buildPromptLogRecord(call='intent_classifier', run_id=null, run_ids=[…]) → runLog.ops()
      │       (cache hit / heuristic fallback → no record: no prompt was sent; existing Live Log line stays)
      └─ for each agent job
         └─ runOneAgent → runLog.forRun(runId, { agent })
            └─ reviewPullRequest({ …, measure, onPromptAssembled })   (S2)
               └─ for each chunk (1 in single-pass, N in map-reduce)
                  ├─ checkCancelled()
                  ├─ assemblePrompt(parts, { measure }) → { messages, assembly, sections }   (S1)
                  ├─ onPromptAssembled({ chunkIndex, chunkCount, label, mode, sections })     ← BEFORE the LLM call
                  │    └─ executor: buildPromptLogRecord(call='review') → runLog.ops(record)  (pino only)
                  │                 + runLog.info('prompt: 7 sections · ~14.2k tokens (diff ~11.0k)')  (msg only, no data)
                  ├─ llm.completeStructured(…)
                  └─ onUsage(…)                      (existing, unchanged)
```

- Emit **before** the LLM call, so a call that fails or is cancelled still has its prompt-size record (this is the useful case for debugging "prompt too large" errors).
- The whole-diff `assemblePrompt` at `run.ts:161` only feeds the trace and sends no call. It gets no `measure` and causes no record, so the diff is not tokenized twice for nothing.
- The Live Log summary line is `msg` only. It contains counts and tokens, which is safe for SSE and `run_traces.log`. It reuses the existing `repo map: N token(s)` style (`run-executor.ts:486`).
- Map-reduce: one record per chunk. Only `diff` (and its `chars/tokens`) differs between chunks. That is acceptable (≤ ~1 KB per record). Volume is discussed in §8.

## 3. Correlation ID

- **Generation.** `ReviewService.runReview` (`server/src/modules/reviews/service.ts:111`) creates `correlationId = randomUUID()` (`node:crypto`) once per review trigger, before the `agent_runs` rows are created. The application ring may use `node:crypto`: `domain-no-io-builtins` does not list it, and this file is not domain. Inject a generator only if tests need determinism. The default is a constructor-level `newId = randomUUID`.
- **Propagation.**
  - `executeRuns(workspaceId, pull, repo, jobs, logger, { correlationId })`: a new optional trailing options object, so existing callers and tests still compile.
  - Fan-out `RunLogger` ctx `{ prId, correlationId }` (`run-executor.ts:73-78`). `forRun()` merges ctx (`run-logger.ts:45-47`), so every per-agent stdout line also carries it, plus `runId`/`agent`. All existing mirrored lines (`Loading PR diff`, intent steps, chunk lines) become correlatable for free.
  - The direct `logger?.info(...)` calls in `executeRuns` (`run-executor.ts:122-145`) and the crash log in `service.ts:142` get `correlationId` added to their object.
  - Intent: the executor's `onClassifierPrompt` closure captures `correlationId` and the job runIds. `IntentService` itself never sees the ID (it stays a pure port consumer).
  - Map-reduce chunks: the core does not know the ID. The executor's `onPromptAssembled` closure adds it, with `chunk.index`/`count`.
- **Relation to pino `reqId`.** `req.log` is a pino child bound to Fastify's `reqId` (`req-1`, `req-2`, …, which restarts at 1 on every boot and is not unique across restarts). Since `executeRuns` receives `req.log` (`routes.ts:48`), every background line already carries `reqId` as a binding. `correlation_id` is the durable, globally unique key. `reqId` stays as is (one HTTP request maps to exactly one correlation_id). Do not replace `reqId` or set `genReqId`, which would be out of scope.
- **Relation to existing IDs.** `run_id` is per agent. `correlation_id` is per trigger (1 → N runs + 1 intent call). The OpenRouter `sessionId` stays a provider-side grouping and is not logged.
- **Not persisted** (no `run_traces` change, see the non-goals). Q2 covers whether it should also appear in the trace.

## 4. Redaction / safety design

1. **Allow-list by construction.** `buildPromptLogRecord(input): PromptLogRecord` (pure, S4) builds a fresh object literal from typed scalar inputs. It never spreads or copies caller objects (`{...x}` is banned in this file). The core's `PromptSectionMeta` carries only `name`, `chars`, `tokens`, `items`, `truncated`, `wrapped` and `itemsMeta[]` (chars/tokens/hash). It never carries text, so the server cannot leak what it never receives.
2. **No free text.** Section names and sources come from closed unions (exhaustive `Record<PromptSectionName, …>` tables in the core, a compile-time check). The only strings that come from outside are refs/labels and the model id, and all of them go through sanitizers:
   - `safeRef(s)`: strip `?query` and `#fragment`, apply `redactCredentials` (`server/src/platform/redact.ts:11`, which covers URL userinfo, `Authorization:` values and GitHub tokens), cap at 200 chars, and replace control characters.
   - `SECRET_PATTERNS` defense in depth (new constant in the builder file): `sk-[A-Za-z0-9_-]{20,}`, `sk-ant-[A-Za-z0-9_-]{20,}`, `sk-or-[A-Za-z0-9_-]{20,}`, `AKIA[0-9A-Z]{16}`, `gh[pousr]_…`/`github_pat_…`, `-----BEGIN .* PRIVATE KEY-----`, `xox[bpsa]-…`. If any of them matches a ref, the ref becomes `'[redacted]'`.
   - model id regex (§1), else `'[invalid]'`.
3. **Specs: names and paths vs content.** Specs today are `string[]` with labels `spec-<i>` (`prompt.ts:131`) and `specs_read: []` (`run-executor.ts:355`). The record logs `spec-<i>` plus chars/tokens. A spec file path may be logged in verbose `items[].ref` only if the caller passes it separately (an optional `specRefs?: string[]` on the executor side, not in the core). Spec content is never logged.
4. **The `RunLogger` passthrough.** Add `RunLogger.ops(msg, record)`. It writes **only** to the pino base (`this.base?.info({...ctx, runIds, ...record}, msg)`). It does not call `bus.publish`, so it reaches neither SSE nor the event buffer that becomes `run_traces.log`. The record never goes through `event()`/`info(msg, data)`. The Live Log gets a separate `msg`-only summary. This keeps the browser stream unchanged and the persisted trace log free of records.
5. **Pino redact as backstop.** Leave `LOG_REDACT_PATHS` unchanged. The record has no `key/token/secret` field names, so it cannot collide. Optionally add `'*.*.apiKey'`. Skip that unless the security reviewer asks for it (non-blocking).
6. **Sizes only.** Chars are from `string.length` and tokens from `container.tokenizer.count`. With `ceil(chars/4)` as the fallback, nothing can throw.
7. **Optional content hashes.** These are off by default, even in verbose mode. Hashing low-entropy content (a short secret in a PR body, a one-line memory item) allows offline guessing, so hashes are 12-hex-char truncated sha256 behind their own flag `PROMPT_LOG_HASHES=true`. That flag only works when verbose is effective. The hash function is supplied by the server's `measure` (`node:crypto`, like `intent/domain/hash.ts:1`), not by the core. Their use: telling whether two runs sent the same skill/spec block.
8. **Size cap.** If `JSON.stringify(record).length > 16_384`, drop `items` and set `items_truncated: true`. This guards pathological item counts.
9. **Fail-safe.** `onPromptAssembled` and the record builder run inside a try/catch in the executor. A logging failure logs `prompt log failed` (no data) and never fails the run.

## 5. Verbose mode (local only)

- **What it adds (metadata only):** `items[]` per section:
  - skills: `ref = "<name>@v<version>"` + skill id, mapped by index from `skills.used` (`run-executor.ts:422`), with chars/tokens per skill block;
  - specs: `spec-<i>` (+ path if supplied), chars/tokens;
  - memory: index + chars/tokens;
  - intent classifier: per linked doc/issue sanitized ref + chars + `dropped`;
  - map-reduce: nothing extra beyond what default already has (the chunk label is already in the default record and already in the Live Log today, `run.ts:186-190`);
  - optional `sha256_12` per item (only with `PROMPT_LOG_HASHES`).
  
  Never: diff, spec or skill bodies, PR text, secrets. Verbose changes **how granular** the record is, not **what kind** of data it holds.
- **Config keys** (in `server/src/platform/config.ts` `EnvSchema`, with the same `z.preprocess('' → undefined)` pattern as `LOG_LEVEL`, `config.ts:38`):
  - `PROMPT_LOG_VERBOSE`: `'true'` requests verbose mode.
  - `PROMPT_LOG_HASHES`: `'true'` requests hashes (needs effective verbose).
  - `AppConfig.promptLog: { verbose: boolean; hashes: boolean; ignored: 'production' | 'test' | 'non_loopback_host' | null }`.
- **Gate (fail closed).** `verbose = requested && nodeEnv === 'development' && isLoopbackHost(host)`, where `isLoopbackHost` ∈ {`127.0.0.1`, `::1`, `localhost`} and also any `127.x.x.x`. `0.0.0.0`/`::` count as **not** loopback. Computed once in `loadConfig` as a pure helper. In `test` and `production` it is always false, so ITs that call `loadConfig(process.env)` (`server/INSIGHTS.md:30`) can never turn it on by accident.
- **Startup warning** in `buildApp` after the Fastify instance is created (`app.ts:111`):
  - effective: `app.log.warn({ promptLog: { verbose, hashes } }, 'prompt-assembly verbose logging ON (local only, metadata only)')`;
  - requested but ignored: `app.log.warn({ reason: config.promptLog.ignored }, 'PROMPT_LOG_VERBOSE ignored: only honored with NODE_ENV=development on a loopback API_HOST')`.
- **Runtime toggle:** none (no API route, no settings UI). Changing it needs a restart. That is deliberate: it keeps the attack surface at zero.
- `server/.env.example` gets both keys, commented out and empty (`.env.example:25-29` area).

## Steps
1. **S0 · server (spec)**: files: `server/specs/prompt-assembly-logging.md` (new), `server/specs/review-flow.md` (one link line in the steps section + §4 note "trace ≠ ops log") · change: write the spec from §1–§5 of this plan (record schema, section/source table, emission points, correlation ID, redaction rules, verbose gating, acceptance criteria, test table) · depends on: — · skill(s): `engineering-insights` (read), `security` · done when: the spec exists, is linked from `review-flow.md`, and states the PromptAssembly-vs-log distinction.
2. **S1 · reviewer-core (prompt metadata)**: files: `reviewer-core/src/prompt.ts`, `reviewer-core/src/index.ts` · change: add exported types `PromptSectionName`, `PromptSectionMeta`, `PromptItemMeta`, `PromptMeasure = (text: string) => { tokens: number | null; hash?: string }`. `assemblePrompt(parts, opts?: { measure?: PromptMeasure })` also returns `sections: PromptSectionMeta[]`, built alongside the existing `userSections` pushes: same order, present sections only, chars of the rendered section, `truncated` for the PR description (>4000) and intent (>1200), item metas for skills/specs/memory. Source/trust/wrapped come from a `const SECTION_INFO = {…} satisfies Record<PromptSectionName, …>`. `messages` and `assembly` stay byte-identical · depends on: S0 · skill(s): `onion-architecture`, `typescript-expert` · done when: `cd reviewer-core && npm run typecheck && npm test` pass, and the existing prompt tests are unchanged and green.
3. **S2 · reviewer-core (engine callback)**: files: `reviewer-core/src/review/run.ts`, `reviewer-core/src/index.ts` (export `PromptAssembledEvent`), `reviewer-core/docs/pipeline.md` (§1 events, §3 sections), `reviewer-core/specs/review-engine.md` (API table + invariant "no content leaves via onPromptAssembled" + test-coverage rows) · change: `ReviewInput.measure?: PromptMeasure` and `ReviewInput.onPromptAssembled?: (e: { chunkIndex; chunkCount; label; mode; sections }) => void`. Pass `measure` only to the per-chunk `assemblePrompt` (`run.ts:191`), not to the trace one (`run.ts:161`). Call `onPromptAssembled` after assembly and before `completeStructured` · depends on: S1 · skill(s): `onion-architecture`, `typescript-expert` · done when: reviewer-core typecheck + tests pass and `cd server && pnpm typecheck` still passes (alias consumer).
4. **S3 · server (config + startup warning)**: files: `server/src/platform/config.ts`, `server/src/app.ts`, `server/.env.example`, `server/README.md` (env table), `server/docs/architecture.md` (config table, `:72` area) · change: `PROMPT_LOG_VERBOSE` / `PROMPT_LOG_HASHES` in `EnvSchema`, the pure `isLoopbackHost` + gate, `AppConfig.promptLog`, and the two warnings in `buildApp` · depends on: S0 · skill(s): `zod`, `fastify-best-practices`, `security`, `typescript-expert` · done when: the config unit tests (S10) pass and `pnpm typecheck` is green.
5. **S4 · server (pure record builder)**: files: `server/src/platform/prompt-log.ts` (new: `PromptLogRecord` type, `buildPromptLogRecord`, `safeRef`, `SECRET_PATTERNS`, `MAX_PROMPT_LOG_BYTES`) · change: build the allow-list record from `PromptSectionMeta[]` + typed context (call, correlationId, runId/runIds, agentId, prId, provider, model, mode, chunk, verbose, optional item refs). Without verbose it drops `items`. Size cap. Imports only `platform/redact.ts` and types (type-only import from `@devdigest/reviewer-core/prompt`, not the barrel, `server/INSIGHTS.md:22`) · depends on: S1 · skill(s): `security`, `typescript-expert`, `onion-architecture` · done when: the builder unit tests (S10) pass and `pnpm lint:arch` adds no new violations.
6. **S5 · server (RunLogger ops sink)**: files: `server/src/platform/run-logger.ts` · change: add `ops(msg: string, record: object): void`, which logs pino `info` only with `{...ctx, runIds, ...record}` and never touches the bus. Update the header comment (the "single sink" doc now names the one exception) · depends on: — · skill(s): `onion-architecture`, `security` · done when: a unit test with a fake `RunBus` + fake `PinoLike` shows that `ops` publishes 0 bus events and 1 pino call.
7. **S6 · server (correlation ID)**: files: `server/src/modules/reviews/service.ts`, `server/src/modules/reviews/run-executor.ts` · change: generate `correlationId` in `runReview`, pass `{ correlationId }` to `executeRuns` (optional trailing param), add it to the fan-out `RunLogger` ctx and to the direct `logger?.…` objects (`run-executor.ts:122-145`, `service.ts:142`) · depends on: S5 · skill(s): `onion-architecture`, `fastify-best-practices` · done when: typecheck passes and the existing `reviews.it.test.ts` is green (unchanged behaviour).
8. **S7 · server (review-call wiring)**: files: `server/src/modules/reviews/run-executor.ts` · change: in `runOneAgent`, pass `measure` (tokens via `this.container.tokenizer.count`, plus `sha256_12` only if `config.promptLog.hashes`) and `onPromptAssembled`. That callback runs `buildPromptLogRecord(...)` with `skills.used` as item refs in verbose mode, then `runLog.ops('prompt assembled', record)` and a `msg`-only `runLog.info` summary, all inside try/catch · depends on: S2, S4, S5, S6 · skill(s): `onion-architecture`, `security`, `typescript-expert` · done when: a run in dev shows one stdout `prompt.assembled` line per chunk with no diff/PR text, and the SSE `data` of every event is unchanged.
9. **S8 · server (intent classifier)**: files: `server/src/modules/intent/domain/prompt.ts`, `server/src/modules/intent/service.ts`, `server/src/modules/reviews/run-executor.ts` (`deriveIntent`), `server/specs/intent-layer.md` (Logs bullet, `:88`) · change: add `buildClassifierPrompt(input, countTokens, budget)` → `{ messages, sections }`. Each block keeps `{ name, source, chars, tokens, items, truncated, dropped, refs }`. `buildClassifierMessages` stays as a thin wrapper, so callers are unaffected. Add `DeriveOptions.onClassifierPrompt?: (meta: { provider; model; sections }) => void`, called just before `completeStructured` (`service.ts:174`). The executor builds an `intent_classifier` record (`run_id: null`, `run_ids: jobs`) and calls `runLog.ops` (fan-out ctx carries correlationId). The `POST /pulls/:id/intent` route passes no callback (no record; see Q4) · depends on: S4, S5, S6 · skill(s): `onion-architecture`, `security`, `typescript-expert` · done when: unit tests (S10) pass and the classifier messages are byte-identical to before.
10. **S9 · docs**: files: `server/README.md` (env vars + "Observability: prompt-assembly log" paragraph linking the spec), `reviewer-core/README.md` (only if it lists the `ReviewInput` callbacks; unverified) · change: describe the record, the flags and the gate · depends on: S3–S8 · skill(s): — · done when: the docs mention `PROMPT_LOG_VERBOSE`, `PROMPT_LOG_HASHES` and the trace-vs-log distinction.
11. **S10 · tests (proposed; implement only if the user approves tests for this iteration)**: see §7 for the files · depends on: S1–S8 · skill(s): `typescript-expert`, `security` · done when: all listed tests pass hermetically.

## 6. Contract / migration impact
- Shared copies to sync: **none**. The new types live in reviewer-core (`PromptSectionMeta`, engine-API types like `PromptParts`) and server (`PromptLogRecord`, an ops-log shape that is not an API contract). `PromptAssembly`, `RunTrace`, `RunEvent` and `RunLogLine` are unchanged, so the `.nullish()` rule for traces is untouched.
- If the user picks Q2 (persist `correlation_id` in the trace): add `RunTrace.correlation_id: z.string().nullish()` to **both** `server/src/vendor/shared/contracts/trace.ts` and `client/src/vendor/shared/contracts/trace.ts`, and keep it nullish (old traces lack it, `server/INSIGHTS.md:17`).
- New migration: **no**.

## 7. Tests and verification

Commands:
- reviewer-core: `cd reviewer-core && npm run typecheck && npm test` (hermetic).
- server unit: `cd server && pnpm typecheck && pnpm lint:arch && pnpm exec vitest run --exclude '**/*.it.test.ts'` (hermetic).
- server full: `cd server && pnpm test` (needs Postgres/Docker for `*.it.test.ts`). Also run it after S1/S2, since grounding/prompt tests live in the server suite (`reviewer-core/INSIGHTS.md:17`).

Proposed new tests (the user previously asked for no tests; they are listed as S10 for approval). All are hermetic and use sentinel strings such as `SENTINEL_DIFF_7f3a`, `SENTINEL_PR_BODY_c91e`, `SENTINEL_SPEC_BODY_44d0`, `SENTINEL_SKILL_BODY_aa12`, `sk-or-v1-SENTINELSECRET0000000000000000`, `ghp_SENTINEL000000000000000000000000`, put into every part:
- `reviewer-core/test/prompt.test.ts` (extend): `sections` order and presence match the user message; chars equal the rendered section length; `truncated` is set for a 5000-char PR body; `JSON.stringify(sections)` contains no sentinel; `messages`/`assembly` are unchanged with and without `measure`.
- `reviewer-core/test/run.test.ts` (extend): `onPromptAssembled` fires once in single-pass and N times in map-reduce, **before** each `completeStructured` (stub LLM records call order); it still fires for the chunk whose LLM call throws; the payload has no sentinel.
- `server/test/prompt-log.test.ts` (new): `buildPromptLogRecord` default vs verbose (`items` present only in verbose); no sentinel in `JSON.stringify(record)` in either mode; `safeRef` strips query/fragment/userinfo and replaces secret-pattern refs with `[redacted]`; invalid model ids become `[invalid]`; the size cap drops `items`; the object has only allow-listed keys (deep key snapshot).
- `server/test/run-logger.test.ts` (new): `ops()` → 0 `RunBus` events, so 0 `logFor()` lines, and 1 pino call carrying ctx (`correlationId`, `runIds`); `event()` behaviour is unchanged.
- `server/test/prompt-log-config.test.ts` (new): `loadConfig({...})` gate matrix: dev+127.0.0.1 → on; dev+`::1`/`localhost` → on; dev+`0.0.0.0` → off with `ignored: 'non_loopback_host'`; production → off; test → off; `PROMPT_LOG_HASHES` without verbose → off; empty string → off.
- `server/test/intent-prompt-log.test.ts` (new): `buildClassifierPrompt` sections and `dropped` flags under a tiny budget; refs are sanitized; no doc/issue/body sentinel; `buildClassifierMessages` output is unchanged.
- Optional IT (`server/test/reviews.it.test.ts`, extend): capture pino output via a stream logger, run a mocked review, and assert that `prompt.assembled` lines exist with one shared `correlation_id`, and that neither the stdout capture, the SSE buffer nor the stored `run_traces.log` contains the diff sentinel outside the trace's `prompt_assembly`. Unverified whether the IT harness can inject a logger stream. Default: skip if it can't.

Manual check (implementer, local): run `./scripts/dev.sh` with `PROMPT_LOG_VERBOSE=true` and look for the startup warning and the per-chunk lines. Then set `API_HOST=0.0.0.0` and confirm the "ignored" warning appears and no `items` are logged.

## Left to other agents
- **Architecture review:** reviewer-core purity (only metadata leaves; `measure` is injected; no `node:crypto` in the core); the `platform/prompt-log.ts` placement and its imports (no barrel import); executor/intent-service coupling through callbacks rather than a logger; the additive public API in `reviewer-core/src/index.ts`; `pnpm lint:arch` baseline not grown.
- **Security review:** the allow-list completeness of `buildPromptLogRecord`; the `safeRef` + `SECRET_PATTERNS` coverage; that `ops()` really bypasses SSE and `run_traces.log`; that the verbose gate fails closed (`0.0.0.0`, `::`, IPv6-mapped, production/test); the hash flag's guessing risk; that no free-text error message enters the record; that the intent `header` (PR title) is never logged.

## 8. Risks and open questions
- non-blocking: **Existing `data` passthrough.** Other `RunLogger` calls already send `data` to SSE and stdout. For example, intent `reason: errMsg(e).slice(0,160)` (`intent/service.ts:118,128`) may echo fetch errors. That is out of scope. It should be a follow-up (wrap `reason` in `redactCredentials`), and the security reviewer should know about it.
- non-blocking: **Volume.** Map-reduce over 87 files gives 87 `info` records per agent. Default: keep `info` (one per LLM call is the useful granularity). Alternative: per-chunk at `debug`, with one `info` per-run summary.
- non-blocking: **Tokenizer cost.** `cl100k` encoding of each chunk's diff adds CPU per call (the diff is already tokenized nowhere else). Default: accept. If it is slow, the fallback is `approxTokens` for `diff` only.
- non-blocking: **Token counts are approximate** (cl100k ≠ every provider's tokenizer). The record field is named `tokens` but the spec documents it as an estimate. Provider-reported `tokensIn` stays the billing truth.
- non-blocking: `reviewer-core/README.md` content is unverified (S9). Intent unit-test location: none were found under `server/test/`, so S10 creates the first one (unverified that none exist elsewhere).
- Q1 (non-blocking): Should the record level be `info` or `debug`? Default: `info`.
- Q2 (non-blocking): Should `correlation_id` also be persisted into `run_traces` / returned by `POST /review`? Default: **no** (keeps contracts and both shared copies untouched; the logs alone answer it).
- Q3 (non-blocking): Should hashes exist at all? Default: yes, behind `PROMPT_LOG_HASHES`, verbose-only, 12 hex chars.
- Q4 (non-blocking): Should the manual `POST /pulls/:id/intent` call also log a classifier record (with `correlation_id = reqId`-derived UUID)? Default: no. Only review-triggered derivations log in this iteration.
- Q5 (non-blocking): Should tests be implemented now (S10)? Default: list them only, per the user's previous instruction. The implementer asks before writing them.
- BLOCKING: none.
