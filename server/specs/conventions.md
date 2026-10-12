# Spec — Conventions Extractor (server side)

Status: server implemented (UI pending) · Lab L02 (extension) · UI side: [client/specs/conventions.md](../../client/specs/conventions.md)

## Goal
Analyse a repo, propose code-style conventions as **evidence-backed candidates**, let the user
accept / reject / edit them, then merge the accepted ones into a `convention` **skill** (reusing the
Skills module) that can be linked to agents.

## What already exists (reuse, don't rebuild)
- Table `conventions(id, workspace_id, repo_id, rule, evidence_path, evidence_snippet, confidence, accepted)`.
- Contract `ConventionCandidate` (shared) · feature-model id `conventions` (`FEATURE_MODELS`, overridable in Settings).
- `repoIntel.getConventionSamples(repoId, n)` → top-ranked non-junk file paths.
- `MockLLMProvider.structuredBySchema` fixtures (`ConventionExtraction`).
- Skills: `POST /skills` (`type: 'convention'`, `source`), `POST /agents/:id/skills` to link.

## Data changes (new migration — never edit applied ones)
- `conventions` += `category text` (e.g. naming, error-handling, async, imports, typing, testing, structure),
  `evidence_line_start int`, `evidence_line_end int`, `status text` (`pending | accepted | rejected`,
  replaces the `accepted` boolean semantics; keep the column, derive it), `scan_id uuid`, `created_at`.
- Unique `(repo_id, rule)` so a re-scan upserts and keeps the user's earlier decision.
- Contract `ConventionCandidate` += `category`, `evidence_line_start/end`, `status` — update **both** vendored
  copies of `@devdigest/shared` (server canonical + client) and say so in the change.

## API (`server/src/modules/conventions/` — new plugin, registered in `modules/index.ts`)
| Method | Path | Notes |
|---|---|---|
| POST | `/repos/:id/conventions/extract` | runs the pipeline below, upserts candidates, returns `{scan_id, candidates, stats:{proposed, verified, dropped}}` |
| GET | `/repos/:id/conventions` | candidates of the repo (all statuses) + last scan time + sample-file count |
| PATCH | `/conventions/:id` | `{status?, rule?, category?}` — accept / reject / edit text; renaming onto another rule of the same repo → **409 `conflict`** |
| POST | `/repos/:id/conventions/skill-draft` | accepted ids → `{name, description, type:'convention', body}`; **writes nothing** |

Saving the skill = existing `POST /skills`; linking = existing `POST /agents/:id/skills`. No new write path.
All routes workspace-scoped (404 outside the workspace); Zod bodies/params from `@devdigest/shared`.

## Pipeline (`extract`)
1. **Sampling — code only, no model.** Config files present in the clone (`.eslintrc*`/`eslint.config.*`,
   `tsconfig*.json`, `.prettierrc*`, `.editorconfig`, `biome.json`) + top **12** files from
   `getConventionSamples(repoId, 12)`. Each file capped (~200 lines / 8 KB), lines numbered so the model can cite them.
   Path-traversal guard: resolve inside the clone root only.
2. **Model call (cheap, `resolveFeatureModel(…,'conventions')`).** One `completeStructured` call, schema
   `ConventionExtraction`: `candidates[] {category, rule, evidence:{path, line_start, line_end}, confidence 0..1}`.
   Prompt: only conventions *visible in ≥2 places or enforced by config*; no generic best practices; cite exact lines.
3. **Evidence verification — code only.** For each candidate: file exists in the clone and was among the samples ·
   line range within the file · snippet is **read from disk** (never trusted from the model). Drop on failure;
   count in `stats.dropped`. Also drop duplicates (normalised rule text) and `confidence < 0.5`.
4. **Persist** verified candidates as `pending` (existing rule → keep status/edits, refresh evidence).
- Outbound calls: LLM provider only. Tests use `MockLLMProvider` — key-free, offline.

## Skill draft
Body = `# <name>` + intro line + one `## <rule slug>` section per accepted convention: rule text, category,
`Detected in \`path:start-end\`` + snippet. Name default `<repo>-conventions`; description is a directive
("Flag changes that violate…"). The user edits everything in the UI before the real `POST /skills`.

## Acceptance criteria
1. Extract on a fixture repo with a mock LLM returns only candidates whose file+lines exist; a candidate citing
   a missing file or out-of-range lines is dropped and counted.
2. Snippet in the response equals the real file lines, not the model's text.
3. Re-scan does not duplicate rules and does not reset accepted/rejected/edited ones.
4. `skill-draft` with 3 accepted ids contains all 3 sections; with 0 → 422.
5. Everything is covered by hermetic tests in `server/test/conventions.test.ts` (+ `.it.test.ts` for the repo).

## Implementation notes
- Module `server/src/modules/conventions/` (domain: `sampling`, `verify`, `skill-draft`; wiring via `createConventionsService`).
  Migration `0014` adds the columns, backfills `status` from `accepted`, adds unique `(repo_id, rule)`.
- `GET /repos/:id/conventions`: `last_scan_at` = newest row's `created_at` (re-scans don't bump existing rows) and
  `sample_files` is `null` — only `extract` knows the sample count (`stats.sample_files`).
- Layers: `service.ts` depends on the `ConventionsRepo` port (`ports.ts`, domain types `Convention` / `RepoInfo`); `repository.ts` maps Drizzle rows to them; `compose.ts` wires the concrete classes.
- Models are read through `settings/index.ts` (`resolveFeatureModel(…, 'conventions')`).
- Tests: `test/conventions.test.ts` (hermetic, fakes) · `test/conventions.it.test.ts` (repository, Postgres).

## Product improvements (more / better findings) — proposed, not in v1
- **Deterministic mining first:** count patterns in the AST (ast-grep adapter exists): `.then` vs `await`, default vs
  named exports, error-class usage, naming casing → feed *counts* ("await 41× / .then 3×") to the model as evidence;
  consistency ratio becomes the confidence instead of a model guess.
- **Mine review history:** recurring accepted/dismissed findings and PR review comments are real conventions.
- **Two-step dialogue** (the mock already anticipates it): model picks files from the repo map
  (`ConventionFileSelection`), then extracts from them — better coverage than top-12-by-rank.
- **Multiple skills:** group by category → one skill per category (`naming`, `error-handling`, …) with a smaller prompt each.
- **Counter-examples:** also store a violating line when one exists — makes a stronger review rule.
- **Drift:** re-scan diff ("2 new, 1 no longer holds") and auto-flag stale accepted rules.
- **Per-package scan** for monorepos; **import from `AGENTS.md`/CLAUDE.md** rules as pre-verified candidates.
