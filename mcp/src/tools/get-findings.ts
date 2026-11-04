import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { GetFindingsOutput } from '../shape/index.js';
import { getFindings, type Deps } from '../use-cases/index.js';
import { agentField, detailField, limitField, prField, repoField, runIdField } from './inputs.js';
import { respond } from './result.js';

export const GET_FINDINGS = {
  name: 'get_findings',
  config: {
    description:
      'Get verdict, score and findings of an already finished review run on a pull request (latest run of each agent by default, or one run_id). Never starts a run. detail=full adds rationale and suggestion.',
    inputSchema: z.strictObject({
      repo: repoField,
      pr: prField,
      run_id: runIdField.optional(),
      agent: agentField.optional(),
      detail: detailField,
      limit: limitField,
    }),
    outputSchema: GetFindingsOutput,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  },
} as const;

export const getFindingsHandler =
  (deps: Deps) =>
  (args: z.infer<typeof GET_FINDINGS.config.inputSchema>): Promise<CallToolResult> =>
    respond(() => getFindings(deps, args));
