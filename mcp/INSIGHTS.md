# Insights — mcp

Non-obvious learnings, written by the `engineering-insights` skill (see `.claude/skills/engineering-insights/`).
Format: `- YYYY-MM-DD — <what> → <what to do / why> (<file:line | commit>)`. Append-only.
This is a draft under human review: spot-check new lines; once a month prune stale entries and resolve
contradictions. Past ~200 entries, split into domain files (`INSIGHTS-<domain>.md`).
Versioned in git: the history shows how knowledge evolved; revert a bad wrap-up with git.
Imported into CLAUDE.md, so it is loaded every session here — signal over volume.

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-11-03 — `GET /repos/:id/pulls` syncs from GitHub and upserts PRs when a token exists, and returns only persisted rows → an un-imported PR is ABSENT from the list (never `id: null`) and this read is not side-effect free, which conflicts with spec D4 'no side effects' (server/src/modules/pulls/routes.ts:29, mcp/src/api/http-devdigest-api.ts)
- 2026-11-03 — Finding `severity` from the API is uppercase (CRITICAL|WARNING|SUGGESTION) while `SeverityCounts` is lowercase, findings have only start_line/end_line, and `GET /repos/:id/conventions` returns {candidates,last_scan_at,sample_files}, not an array → normalize in the domain, map line from start_line (server/src/vendor/shared/contracts/findings.ts:12, server/src/modules/conventions/service.ts:45)

## Tool & Library Notes
- 2026-11-03 — npm `@modelcontextprotocol/sdk` (1.32.2) is the v1 maintenance line (spec up to 2025-11-25 per its README); spec 2026-07-28 needs v2 `@modelcontextprotocol/server` (2.4.0, zod ^4) → decide the package before S1 install; plain `npm install` also failed with EACCES because ~/.npm has root-owned files, use `--cache <dir>` (mcp/package.json:1, docs/plans/mcp-server.md:166)
- 2026-11-03 — SDK v2 `@modelcontextprotocol/server`: registerTool defaults tools.listChanged to true (pass capabilities.tools.listChanged:false), StdioServerTransport is imported from `@modelcontextprotocol/server/stdio`, there is no Client class (tests drive InMemoryTransport.createLinkedPair with raw JSON-RPC), and a non-object-root outputSchema gets wrapped as {result:…} → use one merged object envelope with a status field (mcp/src/server.ts, mcp/src/index.ts:1, mcp/src/shape/schemas.ts)
- 2026-11-03 — .mcp.json runs mcp/node_modules/.bin/tsx directly, never `npm start`: npm's banner on stdout corrupts the stdio protocol; paths are relative so Claude Code must start at the repo root, and `claude mcp list` was not verified (the CLI was not on PATH in the agent's shell) (.mcp.json:5)
- 2026-11-03 — SDK v2 returns invalid tool arguments and unknown keys as an isError:true tool result ('Input validation error: …'), not a JSON-RPC error, and Node fetch with redirect:'error' rejects with a TypeError that looks like a network failure → the spec/tests treat both as tool results / ApiUnreachable (mcp/test/server.test.ts:48, mcp/src/api/http-devdigest-api.ts:250)
- 2026-11-04 — Plain `npx @modelcontextprotocol/inspector` resolves to the deprecated v1 line (security fixes only) and warns about it, while this server runs on SDK v2 (spec 2026-07-28) → the `inspect` script pins `@inspector@latest`; if the UI fails to connect, check the inspector major first (mcp/package.json:11)
- 2026-11-04 — Inspector UI differs by line: plain `npx @modelcontextprotocol/inspector` (v1, shows 'v0.22.0' with the Command/Arguments sidebar and a Tools tab) connects to this SDK v2 server fine, while `@latest` opens a read-only multi-server catalog page with the server Disconnected → keep the `inspect` script unpinned and ignore the v1 deprecation warning; supersedes the 2026-11-04 '@latest' entry (mcp/package.json:14)
- 2026-11-04 — Unpinned `npx @modelcontextprotocol/inspector` is NOT the v0.22.0 UI: it opened v1.0.3 (empty page, manual Connect, no tool list until connected) and `@latest` (dist-tag 2.13.0) opens a read-only server catalog; the sidebar-with-Tools UI is 0.22.0 → pin `@0.22.0` in the `inspect` script; supersedes the previous 'keep unpinned' entry (mcp/package.json:14)

## Recurring Errors & Fixes
- 2026-11-03 — BSD `sed -i` on macOS silently ignores patterns containing `\n` → use the Edit tool for multi-line changes; a test caught an unchanged cap (mcp/src/resolve.ts:55)
- 2026-11-04 — The `agent` argument of get_findings/run_agent_on_pr is matched by id only (`a.id === id`), yet the AgentNotFound message lists "Name (id …)", so passing the listed name ("Security Reviewer") fails with 'not found' again → pass the UUID from list_agents; consider accepting names or wording the error 'agent id' (mcp/src/resolve.ts:54, mcp/src/tools/to-tool-error.ts:39)

## Session Notes

## Open Questions
- 2026-11-03 — Serialized tools/list is ~10.3k chars (outputSchemas ~6.7k) vs the 6000 draft budget in the plan → set the S7 budget from the S9 measurement in Claude Code, not from the guess (mcp/src/tools/*.ts, docs/plans/mcp-server.md:178)
