# Spec — PR self-review gate

**Status:** implemented (v1.0.0, 2026-10-11) · **Skill:** [`.claude/skills/pr-self-review/`](../../.claude/skills/pr-self-review/SKILL.md)

## Problem
Nothing stops a PR with critical problems from being opened: there are no git hooks, no PR template, and no
CI job applies the project skills (`onion-architecture`, `frontend-ui-architecture`, `security`, …) to a diff.
`pnpm lint:arch` runs in no workflow.

## Behaviour
1. **Scope:** everything a PR from the branch would contain: `merge-base(HEAD, origin/main|main)` → working tree
   (committed + staged + unstaged) plus untracked files. Renames are tracked. Git-ignored paths are excluded.
2. **Routing:** `skill-map.json` maps globs to skills: UI skills for `client/`, backend architecture skills for
   `server/` + `reviewer-core/`, `zod` for contracts, `security` for routes, adapters and the API client.
   Every installed skill must be routed or listed in `ignoreSkills`. Changed files that match no rule are reported
   as **not reviewed**; they don't block.
3. **Review:** one read-only agent per (skill, module, ≤15 files) batch reviews only the changed lines, using the
   skill plus [`rubric.md`](../../.claude/skills/pr-self-review/rubric.md). Every LLM CRITICAL then goes through a
   separate refutation agent before it counts.
4. **Deterministic checks** (no LLM):
   - **CRITICAL:**
     - `lint:arch` (new violations only);
     - shared-contract drift;
     - an edited applied migration;
     - a lock file changed without `package.json`;
     - `.env` / `secrets.json` / `server/clones/` / `CLAUDE.md` in the diff;
     - secret-like strings in added lines (reported without the value).
   - **WARNING:** source changed in a module with no test changes.
   - **Optional `--verify`:** typecheck + unit tests per module.
5. **Severity:** the repo's `Severity` contract, CRITICAL · WARNING · SUGGESTION. Skills with their own scale map
   via `severityMap` (HIGH/MEDIUM → WARNING, LOW → SUGGESTION). Gate: `failOn` (default `critical`, as `CiFailOn`),
   with the same logic as `reviewer-core` `gateTriggered`.
6. **Outputs** in `<git-dir>/pr-self-review/` (never committed):
   - `report.json`, `report.md`, with coverage per file;
   - `pr-description.md`;
   - `cache.json`, so a re-run reviews only files whose content changed, unless the skill, rubric or map changed;
   - `dismissals.jsonl` for user-approved false positives. When a skill is dismissed ≥3× for the same reason, the
     report suggests fixing the lens.
7. **Gate:** the git `pre-push` hook (`scripts/git-hooks/pre-push`, installed by `scripts/install-git-hooks.sh`,
   which `scripts/dev.sh` calls). For each pushed branch it recomputes the content fingerprint (sha256 of sorted
   `path\tblob` over the changed paths) and blocks if:
   - there is no report;
   - the report is for different content (stale);
   - the report has any active finding at or above `failOn`.

   A review of uncommitted work stays valid after committing the same content. The hook fails closed on errors.
   `git push --no-verify` bypasses it; this is documented, not hidden.

## Non-goals (next steps)
- **CI parity** (the same gate as a required GitHub check). It would close the `--no-verify` gap, but it needs the
  report published with the branch and branch protection.
- **Running the review through DevDigest's own `reviewer-core`.** That needs LLM keys and a running server, while
  tests must stay offline.

## Verification
- `node --test .claude/skills/pr-self-review/scripts/pr-self-review.test.mjs`: offline, temp git repos.
  Covers fingerprint stability across commit, routing, cache, checks, report validation, dismiss and the pre-push
  cases.
- Manual: a raw `fetch` in a `client/` page plus Drizzle in a `server/` route → BLOCKED → push refused → fix →
  PASS → push allowed → edit one line → "stale".
