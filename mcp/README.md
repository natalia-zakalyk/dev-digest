# `@devdigest/mcp` — DevDigest MCP server

A local, stdio [MCP](https://modelcontextprotocol.io) server that exposes DevDigest's review agents to an MCP client such as Claude Code. It does not touch the database or import from `server/`: it calls the existing REST API on loopback, so the stack must be running (`./scripts/dev.sh`).

Tools (`src/tools/index.ts:13-19`): `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius` (callers, endpoints and crons a PR affects; reads the server's `GET /pulls/:id/blast`, read-only). Contracts: [specs/mcp-server.md](specs/mcp-server.md). Design, rings and the `run_agent_on_pr` flow: [docs/design.md](docs/design.md). Plan: [../docs/plans/mcp-server.md](../docs/plans/mcp-server.md).

## Rings

`shape/` + `errors.ts` + `constants.ts` (domain) -> `ports.ts` + `resolve.ts` + `use-cases/` (application) -> `api/` (REST adapter) -> `tools/` + `server.ts` (MCP edge) -> `index.ts` + `config.ts` (composition root). Inner rings never import outer ones; `test/layering.test.ts` checks it.

## Commands

```
npm install
npm run typecheck
npm test
npm start      # stdio server: stdout is protocol only, logs go to stderr
npm run inspect  # MCP Inspector UI (http://localhost:6274) on top of the stdio server; needs the API on :3001
```

## Configuration (`src/config.ts:29-63`)

| Env var | Default | Meaning |
|---|---|---|
| `DEVDIGEST_API_BASE` | `http://localhost:3001` | API base URL; must be loopback and a plain `http(s)` URL: no username, password, query or hash (a path is fine) |
| `DEVDIGEST_ALLOW_REMOTE` | unset | `1` allows a non-loopback host (the API has no auth); the URL rules above still apply |
| `MCP_RUN_WAIT_MS` | `100000` | how long `run_agent_on_pr` waits for a run before returning its `run_id` |

The server never follows HTTP redirects (a 3xx is reported as unreachable), and error texts and the startup log show only the origin (`scheme://host:port`) of the base URL.

## Register in Claude Code

The repo-root [`../.mcp.json`](../.mcp.json) registers a stdio server `devdigest` that runs `mcp/node_modules/.bin/tsx mcp/src/index.ts` (relative to the repo root, so start Claude Code there). Steps:

1. `cd mcp && npm ci` (creates `node_modules/.bin/tsx`).
2. Start the stack: `./scripts/dev.sh` (API on `:3001`).
3. Start Claude Code in the repo root and approve the project MCP server; `/mcp` should list `devdigest`.

`tsx` is called directly, not through `npm start`, because the npm banner would pollute stdout. Manual alternative: `claude mcp add devdigest -- mcp/node_modules/.bin/tsx mcp/src/index.ts`.

## Status

Implemented (steps S1-S8); the live end-to-end check in Claude Code (S9) is pending. Uses `@modelcontextprotocol/server` v2 (MCP spec 2026-07-28); see `AGENTS.md` Gotchas.
