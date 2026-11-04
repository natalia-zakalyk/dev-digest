import type { McpServer } from '@modelcontextprotocol/server';
import type { Deps } from '../use-cases/index.js';
import { GET_BLAST_RADIUS, getBlastRadiusHandler } from './get-blast-radius.js';
import { GET_CONVENTIONS, getConventionsHandler } from './get-conventions.js';
import { GET_FINDINGS, getFindingsHandler } from './get-findings.js';
import { LIST_AGENTS, listAgentsHandler } from './list-agents.js';
import { RUN_AGENT_ON_PR, runAgentOnPrHandler } from './run-agent-on-pr.js';

export { GET_BLAST_RADIUS, GET_CONVENTIONS, GET_FINDINGS, LIST_AGENTS, RUN_AGENT_ON_PR };
export { toToolError } from './to-tool-error.js';

/** Fixed tool order (spec design rule 6): clients may cache the list. */
export const TOOL_NAMES = [
  LIST_AGENTS.name,
  RUN_AGENT_ON_PR.name,
  GET_FINDINGS.name,
  GET_CONVENTIONS.name,
  GET_BLAST_RADIUS.name,
] as const;

/** Registers the five tools, in the fixed order, on an `McpServer`. Deps come from the composition root. */
export function registerTools(server: McpServer, deps: Deps): void {
  server.registerTool(LIST_AGENTS.name, LIST_AGENTS.config, listAgentsHandler(deps));
  server.registerTool(RUN_AGENT_ON_PR.name, RUN_AGENT_ON_PR.config, runAgentOnPrHandler(deps));
  server.registerTool(GET_FINDINGS.name, GET_FINDINGS.config, getFindingsHandler(deps));
  server.registerTool(GET_CONVENTIONS.name, GET_CONVENTIONS.config, getConventionsHandler(deps));
  server.registerTool(GET_BLAST_RADIUS.name, GET_BLAST_RADIUS.config, getBlastRadiusHandler());
}
