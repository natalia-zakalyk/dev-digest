import { toBlastResult, type BlastRadiusResult } from '../shape/index.js';
import type { Deps } from './deps.js';

export interface GetBlastRadiusArgs {
  repo: string;
  pr: number;
}

/** Resolve repo and PR (`PrNotImported` for an unknown PR), return the server's blast map as is. Read-only. */
export async function getBlastRadius(
  deps: Pick<Deps, 'api' | 'resolve'>,
  args: GetBlastRadiusArgs,
): Promise<BlastRadiusResult> {
  const repo = await deps.resolve.repo(args.repo);
  const pull = await deps.resolve.pull(repo, args.pr);
  const input = await deps.api.getBlast(pull.id);
  return toBlastResult(repo.fullName, pull.number, input);
}
