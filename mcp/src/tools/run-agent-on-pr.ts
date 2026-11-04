import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { RunAgentOnPrOutput } from '../shape/index.js';
import { runAgentOnPr, type Deps } from '../use-cases/index.js';
import { agentField, detailField, limitField, prField, repoField } from './inputs.js';
import { respond } from './result.js';

export const RUN_AGENT_ON_PR = {
  name: 'run_agent_on_pr',
  config: {
    description:
      'Run one review agent on a pull request and return verdict, score, severity counts and findings. Waits up to ~100 s; if still running it returns run_id, then call get_findings. Starts an LLM run (costs tokens, max 10/min). Needs repo (owner/name), pr, and an agent id from list_agents.',
    inputSchema: z.strictObject({
      repo: repoField,
      pr: prField,
      agent: agentField,
      detail: detailField,
      limit: limitField,
    }),
    outputSchema: RunAgentOnPrOutput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
} as const;

export const runAgentOnPrHandler =
  (deps: Deps) =>
  (args: z.infer<typeof RUN_AGENT_ON_PR.config.inputSchema>): Promise<CallToolResult> =>
    respond(() => runAgentOnPr(deps, args));
