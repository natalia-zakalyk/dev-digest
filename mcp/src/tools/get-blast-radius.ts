import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { BlastRadiusResult } from '../shape/index.js';
import { getBlastRadius, type Deps } from '../use-cases/index.js';
import { prField, repoField } from './inputs.js';
import { respond } from './result.js';

export const GET_BLAST_RADIUS = {
  name: 'get_blast_radius',
  config: {
    // FROZEN text (mcp/specs/mcp-server.md, "Final descriptions"): change the spec first, never only here.
    description:
      "Map the blast radius of a pull request: symbols declared in its changed files, who calls them (file:line), and HTTP endpoints and cron jobs that may depend on them. Reads DevDigest's prebuilt code index, no LLM. Call before reviewing or merging a risky change. Needs repo (owner/name) and pr.",
    inputSchema: z.strictObject({ repo: repoField, pr: prField }),
    outputSchema: BlastRadiusResult,
    // openWorldHint: resolving the PR goes through GET /repos/:id/pulls, which may sync from GitHub.
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
} as const;

export const getBlastRadiusHandler =
  (deps: Deps) =>
  (args: z.infer<typeof GET_BLAST_RADIUS.config.inputSchema>): Promise<CallToolResult> =>
    respond(() => getBlastRadius(deps, args));
