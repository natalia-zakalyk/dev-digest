# Spec — Blast radius (server side)

Status: approved (2026-11-04, user approved D1-D5 in chat) · Plan: [docs/plans/blast-radius.md](../../docs/plans/blast-radius.md) · UI side: [client/specs/blast-radius.md](../../client/specs/blast-radius.md) · MCP side: [mcp/specs/mcp-server.md](../../mcp/specs/mcp-server.md) (`get_blast_radius`)

## Goal
`GET /pulls/:id/blast` tells which symbols a PR's changed files declare, who calls them (`file:line`) and which
HTTP endpoints and crons may depend on them. Two consumers: the PR Overview card and the MCP tool `get_blast_radius`.
It only **reads** the prebuilt repo-intel index through the existing facade (`repoIntel.getBlastRadius`,
`repoIntel.getIndexState`). No LLM, no new parsing, no new outbound host, no DB schema change, no migration.

## What exists
- Facade `getBlastRadius(repoId, changedFiles) → BlastResult` (`modules/repo-intel/service.ts:225`, type `repo-intel/types.ts:74-87`),
  exposed as `container.repoIntel` (`platform/container.ts:124-127`, test override `:52`).
- It serves the persistent index only when `config.repoIntelEnabled` and `repo_index_state.status` is `full|partial`
  (`service.ts:228-231`); otherwise it **falls back to ripgrep + reading the clone** (`service.ts:241-299`). The fallback
  re-parses, so this feature must not reach it (D2).
- `BlastResult.reason` is only ever `'no_data'` (`service.ts:238`, `:307`) and the persistent path returns `degraded:false`
  even for a `partial` index (`service.ts:343`, `:394`). Real status comes from `getIndexState` (`service.ts:194-210`, never throws).
- The persistent path does **not** exclude references from the declaring file (`repo-intel/repository.ts:530-557`; only the
  ripgrep fallback does, `service.ts:278`), so the mapping drops them.
- Callers are capped globally, not per symbol: `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` on the whole flat list
  (`service.ts:391`), constant `repo-intel/constants.ts:30`. Facade left as is (Q2); with many symbols some can show 0 callers.
- `factsByFile` (endpoints, crons per caller file) exists on the persistent path only (`service.ts:379-387`, `repository.ts:561-576`);
  callers need a `file_rank` row (inner join, `repository.ts:544-550`).
- Endpoint detection is line-based (`adapters/codeindex/extract.ts:182-195`): a multi-line `app.get(` yields no endpoint.
- PR + files: `reviewRepo.getPull(workspaceId, prId)` is workspace-scoped (`modules/reviews/repository/pull.repo.ts:8-18`), `getPrFiles(prId)` (`:28-33`).
- Flag `repoIntelEnabled` is on by default (`platform/config.ts:129`).

## Contract (`@devdigest/shared`, `contracts/review-api.ts`, both copies updated, identical)
`BlastRadius` and `PrBrief` (`contracts/brief.ts`) are unchanged.
```ts
export const BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data']);
export const BlastCounts = z.object({ symbols: z.number().int(), callers: z.number().int(), endpoints: z.number().int(), crons: z.number().int() });
export const BlastRadiusResponse = BlastRadius.extend({
  counts: BlastCounts,
  degraded: z.boolean(),
  reason: BlastDegradedReason.nullish(),
});
```
`BlastRadius` = `{ changed_symbols: {name,file,kind}[], downstream: {symbol, callers:{name,file,line}[], endpoints_affected: string[], crons_affected: string[]}[], summary: string }`.
`BlastRadiusResponse.downstream[].callers` is `BlastCallerWithFacts[]` = `BlastCaller.extend({ endpoints_affected: string[].optional(), crons_affected: string[].optional() })`:
the endpoints/crons reached through that caller's file. The server always sends both (`[]` = known to have none; absent = unknown, e.g. an older server).
The group-level `endpoints_affected`/`crons_affected` stay as the union of its callers' facts.

Example response (one changed symbol, two callers):
```json
{
  "changed_symbols": [{ "name": "rateLimit", "file": "src/lib/rate-limit.ts", "kind": "function" }],
  "downstream": [{
    "symbol": "rateLimit",
    "callers": [
      { "name": "listItems", "file": "src/api/items.ts", "line": 4, "endpoints_affected": ["GET /api/public/items"], "crons_affected": [] },
      { "name": "cleanup", "file": "src/jobs/cleanup.ts", "line": 6, "endpoints_affected": [], "crons_affected": ["0 * * * *"] }
    ],
    "endpoints_affected": ["GET /api/public/items"],
    "crons_affected": ["0 * * * *"]
  }],
  "summary": "1 symbol changed · 2 callers · 1 endpoint · 1 cron",
  "counts": { "symbols": 1, "callers": 2, "endpoints": 1, "crons": 1 },
  "degraded": false,
  "reason": null
}
```
Every `DegradedReason` of `repo-intel/types.ts:27-32` must stay assignable to `BlastDegradedReason` (compile-time check in the mapper).

## Route
`GET /pulls/:id/blast` → `BlastRadiusResponse`; schema `{ params: IdParams, response: { 200: BlastRadiusResponse } }`.
- `:id` is a uuid (422 otherwise). Unknown PR or a PR of another workspace → 404 (`NotFoundError('Pull request not found')`), via `getPull(workspaceId, id)`.
- Thin handler: `getContext` → `service.get(workspaceId, id, req.log)`.

## Degraded / index decision (D2, approved)
The service never trusts `BlastResult.reason`. Order:

| Condition | Facade call | `degraded` | `reason` | Data |
|---|---|---|---|---|
| `repoIntelEnabled` false | none | true | `flag_off` | empty |
| index status `full` | `getBlastRadius` once | false | none | yes |
| index status `partial` | `getBlastRadius` once | true | `index_partial` | yes (shown with a marker) |
| status `degraded` / `failed` / no row | none | true | `state.degradedReason ?? (status==='failed' ? 'index_failed' : 'no_data')` | empty |
| facade still returns `degraded:true` (race) | already called | true | `result.reason ?? 'no_data'` | whatever it returned |

At most one `getBlastRadius` call per request, so the ripgrep fallback is not reached in the normal flow.
Unindexed repos (e.g. the seed repo, `db/seed.ts:89`, `clonePath: null`) therefore show a degraded marker, not a best-effort result.

## Mapping (`modules/blast/domain/map.ts`, pure)
`toBlastRadius(result, {degraded, reason, capPerSymbol = MAX_CALLERS_PER_SYMBOL}) → BlastRadiusResponse`.
1. `changed_symbols` from `result.changedSymbols`.
2. Group `callers` by `viaSymbol`; drop a caller whose `file` declares that symbol (declaring files from `changedSymbols`, so a same name declared in two changed files is handled); dedupe by `file:line:name`.
3. Sort callers by rank desc, then file, then line; cap **per symbol** at `MAX_CALLERS_PER_SYMBOL` (imported from `repo-intel/constants.ts`, not copied).
4. Per kept caller: `endpoints_affected` / `crons_affected` = sorted, deduplicated `factsByFile[caller.file]` (`[]` when the file has no facts or `factsByFile` is absent). Per group: `endpoints_affected` / `crons_affected` = sorted union of its kept callers' arrays.
5. `downstream` (D3): one entry per **unique changed symbol name with at least one caller** after filtering, sorted by best caller rank desc, then name. Symbols without callers stay only in `changed_symbols`.
6. `counts` = `{symbols: changed_symbols.length, callers: Σ callers in downstream, endpoints: unique endpoints across downstream, crons: unique crons}`.
7. `summary` from numbers only, joined with ` · `: `<n> symbol(s) changed`, `<n> caller(s)`, `<n> endpoint(s)`, `<n> cron(s)` (singular when n = 1, e.g. `2 symbols changed · 14 callers · 3 endpoints · 1 cron`); suffix ` · index partial` when `reason === 'index_partial'`.
Imports: only types from `repo-intel/types.ts` and the constant from `repo-intel/constants.ts` (never the module barrel, `INSIGHTS.md:25`).

## Logging (D5)
One info line per request through a narrow log port passed by the route (`req.log`):
`{ prId, repoId, source: 'repo_index', index_status, symbols, callers, endpoints, crons }` with message `blast: read prebuilt index`,
or `blast: index unusable, skipped` with the reason. No payloads, no file contents.

## Implementation
`modules/blast/`: `domain/map.ts` (pure), `ports.ts` (`BlastSource` = `getPull` + `getPrFiles`, satisfied by `c.reviewRepo`; `BlastIntel = Pick<RepoIntel,'getBlastRadius'|'getIndexState'>`; `BlastLog`),
`service.ts` (`Deps = {source, intel, repoIntelEnabled}`), `compose.ts` (intel resolved lazily like `conventions/compose.ts:11-12` so test overrides work), `routes.ts`, `index.ts`; registered in `modules/index.ts`.

## Acceptance criteria
P1
- A PR editing a file whose symbol has 2 callers (one with a route, one with a cron) returns ≥2 callers, ≥1 endpoint and the cron in `downstream`, and the declaring file is never among its own callers.
- Callers carry `file` and `line`; the response parses with `BlastRadiusResponse`.
- Unknown PR / other workspace → 404; non-uuid → 422.
- Index `partial` → data plus `degraded:true`, `reason:'index_partial'`.
P2
- Flag off, or status `degraded`/`failed`/no row → no `getBlastRadius` call, right `reason`, empty data (no re-parsing, no clone reads).
- One info log line per request with `source:'repo_index'`.
- Per-symbol cap equals `MAX_CALLERS_PER_SYMBOL` (the test imports the constant).
- Tests: `test/blast-map.test.ts`, `test/blast.test.ts` (hermetic), `test/blast.it.test.ts` (Postgres; seeds `file_rank` too).

## Out of scope
Changing the index build, BFS/transitive callers, facade per-symbol cap (Q2), exposing `indexed_sha` (R4), "Prior PRs touching these files" (O7: needs new GitHub reads and an endpoint), writes/resync from this route.

## Known limits
R1 path-alias imports may not resolve (fewer callers than expected); R2 multi-line route registrations yield no endpoints; R3 the index badge elsewhere treats `partial` as not degraded while this card marks it; R4 the index reflects the default branch at its last indexed sha while links use the PR head sha.
