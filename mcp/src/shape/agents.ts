import { TEXT_CAPS } from '../constants.js';
import { fitToBudget } from './budget.js';
import type { AgentSummary, ListAgentsResult } from './schemas.js';
import { truncateText } from './text.js';
import type { AgentInput } from './types.js';

/**
 * Copies exactly five fields. `system_prompt` is never copied, even if a caller passes an object
 * that still carries it: fields are picked, not spread. Name and description are untrusted text and
 * are capped; the list as a whole is kept under the response budget (the contract has no
 * `truncated` field, so trailing agents are dropped silently in that unlikely case).
 */
export function shapeAgents(agents: readonly AgentInput[]): ListAgentsResult {
  const out: AgentSummary[] = agents.map((a) => ({
    id: a.id,
    name: truncateText(a.name, TEXT_CAPS.agentName),
    description: truncateText(a.description, TEXT_CAPS.agentDescription),
    model: a.model,
    enabled: a.enabled,
  }));
  return fitToBudget(out.length, (keep): ListAgentsResult => ({ agents: out.slice(0, keep) }));
}
