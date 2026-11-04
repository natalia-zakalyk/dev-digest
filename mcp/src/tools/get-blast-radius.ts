import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { BlastRadiusResult } from '../shape/index.js';
import { getBlastRadius } from '../use-cases/index.js';
import { prField, repoField } from './inputs.js';
import { respond } from './result.js';

export const GET_BLAST_RADIUS = {
  name: 'get_blast_radius',
  config: {
    description:
      'STUB, not implemented yet: will map which parts of the codebase a pull request affects. Returns implemented:false and alternatives now; do not retry.',
    inputSchema: z.strictObject({ repo: repoField, pr: prField }),
    outputSchema: BlastRadiusResult,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
} as const;

/** Stub: no API call, so it needs no `Deps`. */
export const getBlastRadiusHandler =
  () =>
  (args: z.infer<typeof GET_BLAST_RADIUS.config.inputSchema>): Promise<CallToolResult> =>
    respond(() => getBlastRadius(args));
