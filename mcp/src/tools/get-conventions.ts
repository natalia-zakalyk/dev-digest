import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ConventionsResult } from '../shape/index.js';
import { getConventions, type Deps } from '../use-cases/index.js';
import { limitField, repoField } from './inputs.js';
import { respond } from './result.js';

export const GET_CONVENTIONS = {
  name: 'get_conventions',
  config: {
    description:
      "Get a repository's accepted coding conventions (rule, category, evidence path:line) to check code against. Empty until conventions are accepted in the DevDigest studio.",
    inputSchema: z.strictObject({ repo: repoField, limit: limitField }),
    outputSchema: ConventionsResult,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
} as const;

export const getConventionsHandler =
  (deps: Deps) =>
  (args: z.infer<typeof GET_CONVENTIONS.config.inputSchema>): Promise<CallToolResult> =>
    respond(() => getConventions(deps, args));
