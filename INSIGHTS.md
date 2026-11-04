# Insights — cross-cutting (multi-module, scripts/, docs/)

Non-obvious learnings, written by the `engineering-insights` skill (see `.claude/skills/engineering-insights/`).
Format: `- YYYY-MM-DD — <what> → <what to do / why> (<file:line | commit>)`. Append-only.
This is a draft under human review: spot-check new lines; once a month prune stale entries and resolve
contradictions. Past ~200 entries, split into domain files (`INSIGHTS-<domain>.md`).
Versioned in git: the history shows how knowledge evolved; revert a bad wrap-up with git.
Imported into CLAUDE.md, so it is loaded every session here — signal over volume.

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-10-07 — Course material says `LEARNINGS.md` in `apps/*`/`packages/*` → here it is `<module>/INSIGHTS.md` in `server/`, `client/`, `reviewer-core/`, `e2e/` (repo-intel lives in `server/src`) [supersedes the same entry without file:line] (CLAUDE.md:64)
- 2026-11-03 — A new module must be added to several hard-coded module lists, not only scripts/lib.sh and pr-self-review lib.mjs/skill-map.json: also the lock-file regex in run-checks.mjs; stop-insights-check.mjs has no list (fires on any dirty tree); architecture-reviewer, investigator, doc-writer, researcher, brainstorm, insight-curator still name only the old modules → grep for 'reviewer-core' when adding one (.claude/skills/pr-self-review/scripts/run-checks.mjs:100)

## Tool & Library Notes
- 2026-10-07 — A module's CLAUDE.md (and its `@INSIGHTS.md`) loads only after Claude touches files in that folder, not at session start from the root → read `<module>/INSIGHTS.md` explicitly before answering [supersedes the same entry without file:line] (CLAUDE.md:65)
- 2026-10-07 — Once `engineering-insights` is invoked, its PreToolUse hook blocks Write/Edit on every `INSIGHTS*.md` for the rest of the session → do the monthly prune by hand or in a session where the skill wasn't invoked [supersedes the same entry without file:line] (.claude/skills/engineering-insights/SKILL.md:6)
- 2026-10-10 — Project instructions are `AGENTS.md` (root + each module), no CLAUDE.md/symlinks; Claude Code ≥2.1.277 reads AGENTS.md natively (nested ones lazily, `@` imports expanded) but ONLY if no CLAUDE.md/CLAUDE.local.md exists in that dir or above → never add a CLAUDE.md (it silently disables AGENTS.md); older `(CLAUDE.md:NN)` pointers and 'Imported into CLAUDE.md' headers now mean AGENTS.md (AGENTS.md:10, code.claude.com/docs/en/memory.md#agents-md)
- 2026-10-10 — Background subagents spawned while the session is in plan mode stay read-only even after ExitPlanMode, and resuming them via SendMessage doesn't lift it → exit plan mode BEFORE spawning implementation agents, or spawn fresh ones after (AGENTS.md:46)
- 2026-10-11 — Local git is 2.15: no `git init -b`, `git switch`, `git restore`; and Node 22.14 `node --test <dir>` fails with MODULE_NOT_FOUND → in scripts/tests use `git init` + `git symbolic-ref HEAD refs/heads/main` and pass test files, not dirs, to node --test (.claude/skills/pr-self-review/scripts/pr-self-review.test.mjs:28)
- 2026-10-12 — L02 grading requires CLAUDE.md in root, server/, client/, reviewer-core/, e2e/ → they are SYMLINKS to AGENTS.md (same content, loaded as CLAUDE.md); never write a separate CLAUDE.md file; supersedes the 2026-10-10 'never add a CLAUDE.md' entry (CLAUDE.md:1)
- 2026-10-31 — dev.sh needs a docker CLI and Postgres in a container (pgvector/pgvector:pg16, volume devdigest_pgdata); without Docker Desktop, Colima works unchanged (user-space install of colima + lima binaries into ~/.local/bin, `colima start` after every reboot, `pg_dump -Fc` then `pg_restore` to move data) — never run Docker Desktop and Colima together (both bind :5432) and never `docker compose down -v` (scripts/dev.sh:37, docker-compose.yml:13)
- 2026-10-31 — Dev servers started from a Claude session run detached with stdout in that session's scratchpad (server-dev.log, client-dev.log) and no terminal, so a later `./scripts/dev.sh` fails with 'port already in use' and Ctrl+C cannot reach them → find them with `lsof -iTCP:3000 -iTCP:3001 -sTCP:LISTEN`, kill the pnpm/next/tsx tree by PID, then start the stack from your own terminal (scripts/dev.sh:42)

## Recurring Errors & Fixes

## Session Notes
- 2026-10-07 — `engineering-insights` capture is now enforced by a project Stop hook (once per session, only with uncommitted changes) and append-insight.mjs refuses entries without file:line; the 2026-10-06 "no Stop hook yet" note is obsolete [supersedes the same entry without file:line] (.claude/settings.json:3, .claude/skills/engineering-insights/scripts/stop-insights-check.mjs:1)

## Open Questions
