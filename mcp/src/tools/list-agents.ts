import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ListAgentsResult } from '../shape/index.js';
import { listAgents, type Deps } from '../use-cases/index.js';
import { respond } from './result.js';

export const LIST_AGENTS = {
  name: 'list_agents',
  config: {
    description:
      'List the configured DevDigest review agents (id, name, description, model, enabled). Call this first to get a valid agent id for run_agent_on_pr.',
    inputSchema: z.strictObject({}),
    outputSchema: ListAgentsResult,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
} as const;

export const listAgentsHandler = (deps: Deps) => (): Promise<CallToolResult> => respond(() => listAgents(deps));
