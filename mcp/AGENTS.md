# mcp — @devdigest/mcp

Local **stdio MCP server** that lets an MCP client (Claude Code first) use DevDigest's review agents. It only calls the existing REST API on loopback (`DEVDIGEST_API_BASE`, default `http://localhost:3001`). TypeScript 5.9 + Zod 4 + Vitest 2.1. Package manager: **npm**. Status: implemented (steps S1-S8 of [../docs/plans/mcp-server.md](../docs/plans/mcp-server.md); live check S9 pending); MCP SDK: `@modelcontextprotocol/server` v2 (see Gotchas).

## Read When
- [../docs/plans/mcp-server.md](../docs/plans/mcp-server.md) — before any implementation: tool contracts, frozen tool descriptions, ring layout, steps S0-S9.
- `specs/` — before changing a tool contract (spec is written in step S0; find/extend it before implementing).
- [README.md](README.md) — first orientation. [docs/design.md](docs/design.md) — rings and the `run_agent_on_pr` flow, before moving code between folders.
- [../TESTING.md](../TESTING.md) — before writing tests (offline, key-free).

## Commands
- `npm run typecheck` · `npm test` · `npm start` (stdio server; stdout is protocol only, logs go to stderr)

## Where things live
- `src/shape/` `errors.ts` `constants.ts` — domain (pure) · `ports.ts` `resolve.ts` `use-cases/` — application · `api/` — REST adapter · `tools/` `server.ts` — MCP edge · `index.ts` `config.ts` — composition root (rings: [docs/design.md](docs/design.md))
- `test/` — Vitest tests (`*.test.ts`), including `layering.test.ts` (import direction) and `token-budget.test.ts`
- Env: `DEVDIGEST_API_BASE` (default `http://localhost:3001`) · `DEVDIGEST_ALLOW_REMOTE=1` (allow non-loopback) · `MCP_RUN_WAIT_MS` (default 100000) — `src/config.ts:29-63` (base URL must also be plain `http(s)`: no credentials, query or hash)
- Registered for Claude Code by `../.mcp.json` (runs `tsx` directly: `npm start` would print an npm banner on stdout and break the protocol)

## Conventions
- Does **not** import `@devdigest/shared` or anything from `server/`/`client/`; declares minimal tolerant Zod schemas for the API fields it reads.
- Tests are offline and key-free: fakes through constructors, no real API, no real provider.
- Files `kebab-case.ts`, code `camelCase`, tool names `snake_case`.

## Gotchas
- The plan names `@modelcontextprotocol/sdk`, but its latest (1.32.2) is the v1 maintenance line (spec 2025-11-25). Spec 2026-07-28 is implemented by v2, published as `@modelcontextprotocol/server`. Decided 2026-11-03: use v2 (`@modelcontextprotocol/server`, needs Zod 4).

## Do not touch
- `package-lock.json` — only via `npm install <pkg>`.

## Insights
@INSIGHTS.md
