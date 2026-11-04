import { shapeConventions, type ConventionsResult } from '../shape/index.js';
import type { Deps } from './deps.js';

export interface GetConventionsArgs {
  repo: string;
  limit?: number;
}

export async function getConventions(
  deps: Pick<Deps, 'api' | 'resolve'>,
  args: GetConventionsArgs,
): Promise<ConventionsResult> {
  const repo = await deps.resolve.repo(args.repo);
  const inputs = await deps.api.listConventions(repo.id);
  return shapeConventions(repo.fullName, inputs, { limit: args.limit });
}
