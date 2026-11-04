import { shapeAgents, type ListAgentsResult } from '../shape/index.js';
import type { Deps } from './deps.js';

export async function listAgents(deps: Pick<Deps, 'resolve'>): Promise<ListAgentsResult> {
  return shapeAgents(await deps.resolve.agents());
}
