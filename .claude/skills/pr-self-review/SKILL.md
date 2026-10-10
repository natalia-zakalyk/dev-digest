---
name: pr-self-review
description: "Self-review of ALL local changes before opening a GitHub PR: the branch vs main plus staged, unstaged and untracked files. Routes every changed file to the project skills that own its layer (frontend-ui-architecture / react / next on client/, onion-architecture / fastify / drizzle / postgres on server/ and reviewer-core/, zod on contracts, security on routes and api), runs one read-only reviewer per skill batch, adds deterministic checks (lint:arch, shared-contract drift, secrets, AGENTS.md 'Do not touch', missing tests) and writes a report whose verdict the git pre-push hook enforces: any CRITICAL blocks the push. Also produces a PR description. Use it whenever the user is about to open/create a PR, push a branch, asks 'review my changes', 'self review', 'pr self review', 'чи можна відкривати PR?', 'перевір мої зміни перед PR', or when the pre-push hook says 'blocked by pr-self-review'. Not for reviewing someone else's PR on GitHub (that is DevDigest itself / code-review)."
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
metadata:
  version: "1.0.0"
  updated: "2026-10-11"
  scope: whole repo
---

# PR Self Review

Review exactly what a PR from this branch would contain, through the lenses of our own skills, and leave a
report the **git pre-push hook** (`scripts/git-hooks/pre-push` → `scripts/pre-push.mjs`) can enforce offline.
State lives in `<git-dir>/pr-self-review/` (never committed). Severity scale and what counts as CRITICAL:
[rubric.md](rubric.md). Which skill reviews which file: [skill-map.json](skill-map.json).

**This skill only reviews.** Never commit, push, stash or edit code as part of it, unless the user asks
for fixes afterwards.

## Workflow

1. **Collect** — `node ${CLAUDE_SKILL_DIR}/scripts/collect-diff.mjs`.
   `"empty": true` → say there is nothing to review vs main and stop.
2. **Route** — `node ${CLAUDE_SKILL_DIR}/scripts/route-skills.mjs` (`--full` if the user asks for a full re-review).
   It writes `batches.json`: one batch per (skill, module, ≤15 files). Pairs already reviewed with the same file
   content and the same skill/rubric version come from the cache, so a re-run after fixes only reviews changed files.
   Relay any `warnings` (an installed skill missing from skill-map.json) to the user.
3. **Checks** — `node ${CLAUDE_SKILL_DIR}/scripts/run-checks.mjs` (add `--verify` when the user asks for it, or
   before the final push of a large change: runs typecheck + unit tests per changed module; slow).
4. **Review batches in waves.** Read `<state>/batches.json`. If there are no batches, skip to step 7.
   - **More than 20 batches:** before spawning, tell the user the count and the biggest modules. Ask whether to
     review everything or split the change into smaller PRs first, because every batch is a separate agent run.
   - **Spawn** one `general-purpose` subagent per batch, using the prompt below. Each agent writes its own findings
     file, so 60 replies don't flood this conversation.
   - **At most 20 agents run at once** (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). Spawn the first 20 in one message.
     Then, every time completions arrive, spawn as many of the remaining batches as there are free slots. Never
     retry a spawn that was refused for the limit; wait for a completion instead.
   - Before the next step, check that every batch has `<findings_dir>/<batch id>.json`. Re-spawn any batch whose
     file is missing or isn't a JSON array.
5. **Refute every CRITICAL.** Grep the findings files for `"CRITICAL"`. For each one, spawn a fresh read-only
   agent whose only job is to disprove it: read the actual file, the skill rule cited and the rubric. Does the
   problem really exist in the changed code, and is it really CRITICAL under rubric.md? Then edit that finding in
   its file:
   - confirmed → keep it and set `"verified": true`;
   - refuted, or real but not CRITICAL → set `"severity": "WARNING"` (or remove it if it is not a problem at all),
     `"verified": true` and `"verification": "<one line why>"`.

   `write-report.mjs` refuses any LLM CRITICAL without `"verified": true`.
6. **Findings files.** Every batch needs a file (`[]` for a clean batch), or the report is not written.
7. **Report** — `node ${CLAUDE_SKILL_DIR}/scripts/write-report.mjs` (exit 0 = PASS, 3 = BLOCKED, 1 = invalid
   input → fix the findings files as the error says and rerun). It re-checks that the tree didn't change during the
   review, dedupes, applies earlier dismissals, refreshes the cache and writes `report.md` and `pr-description.md`.
8. **Tell the user**, short:
   - the verdict line: **✅ PASS** / **⛔ BLOCKED (N critical)**, plus "N files not reviewed" if any;
   - CRITICAL findings with `file:line`, the skill and the id; then WARNINGs in one line each; SUGGESTION count only;
   - the "Not reviewed" files (no skill covers them) and any `dismissal_hints`;
   - where the PR description is (`<state>/pr-description.md`) — show it if PASS;
   - if BLOCKED: fix and rerun this skill, or, for a proven false positive,
     `node ${CLAUDE_SKILL_DIR}/scripts/dismiss.mjs <id> "<reason>"`. Dismiss only when the **user** agrees
     the finding is wrong — never dismiss on your own to get a PASS.
9. **Repeated false positives** — if `dismissal_hints` is non-empty, propose (don't apply) tightening
   rubric.md / skill-map.json for that skill, or recording the rule in that module's INSIGHTS.md with the
   engineering-insights `append-insight.mjs` script (with `file:line`).

## Reviewer prompt (step 4)

The full instructions live in [reviewer-prompt.md](reviewer-prompt.md) and are shared by every batch, so each
spawn prompt stays three lines long. Fill in `<…>`; `<state>` and `<findings_dir>` come from the `collect-diff`
and `route-skills` output:

```
Batch id: <batch id>
Follow ${CLAUDE_SKILL_DIR}/reviewer-prompt.md. batches.json: <state>/batches.json
Output file: <findings_dir>/<batch id>.json
```

## The gate (pre-push)

- Installed by `scripts/install-git-hooks.sh` (sets `core.hooksPath=scripts/git-hooks`; `scripts/dev.sh` runs it).
- Per pushed branch it recomputes the content fingerprint of `merge-base(main)..<sha>` (sha256 of sorted
  `path\tblob` lines) and compares it with `report.json`. A review done before `git commit` still matches after
  the commit if the contents are the same. Any later edit, or reviewed changes that were not committed → "stale".
- Blocks on: no report, stale report, or any active finding at/above `failOn` (default `critical`).
- `git push --no-verify` bypasses it — that is git, not a bug. Don't suggest it to get around findings.

## Files

| Path | Role |
|---|---|
| `skill-map.json` | globs → skills, `ignoreSkills`, `ignorePaths`, `failOn`, `severityMap`, per-module test/verify commands |
| `rubric.md` | CRITICAL / WARNING / SUGGESTION definitions shared by every reviewer |
| `reviewer-prompt.md` | the instructions every batch reviewer follows (spawn prompt is just batch id + paths) |
| `scripts/collect-diff.mjs` | changed files + patches + fingerprint → `diff.json` |
| `scripts/route-skills.mjs` | batches, cache hits, coverage, unmapped-skill warnings → `batches.json` |
| `scripts/run-checks.mjs` | deterministic findings → `checks.json` |
| `scripts/write-report.mjs` | merge, validate, gate → `report.json`, `report.md`, `pr-description.md`, `cache.json` |
| `scripts/dismiss.mjs` | false positive → `dismissals.jsonl`, re-render the report |
| `scripts/pre-push.mjs` | the git gate |
| `scripts/*.test.mjs` | `node --test .claude/skills/pr-self-review/scripts/pr-self-review.test.mjs` (offline, temp git repos) |

Adding a skill to the project → add it to a rule in `skill-map.json` (or `ignoreSkills` with a reason);
`route-skills.mjs` warns until you do.
