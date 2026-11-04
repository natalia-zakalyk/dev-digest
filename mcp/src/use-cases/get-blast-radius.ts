import type { BlastRadiusResult } from '../shape/index.js';

/** Stub with the final input contract (spec `get_blast_radius`): no API call, not an error. */

export interface GetBlastRadiusArgs {
  repo: string;
  pr: number;
}

export function getBlastRadius(_args: GetBlastRadiusArgs): BlastRadiusResult {
  return {
    implemented: false,
    message:
      'get_blast_radius is not implemented yet. Do not retry. Use get_findings for review results or get_conventions for the repo rules.',
    alternatives: ['get_findings', 'get_conventions'],
  };
}
