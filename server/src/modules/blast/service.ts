import type { BlastDegradedReason, BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { BlastResult } from '../repo-intel/types.js';
import { toBlastRadius } from './domain/map.js';
import type { BlastIntel, BlastLog, BlastSource } from './ports.js';

export interface BlastDeps {
  source: BlastSource;
  intel: BlastIntel;
  repoIntelEnabled: boolean;
}

const EMPTY: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };

/**
 * Blast radius of a PR, read from the prebuilt repo-intel index. The service decides
 * degraded/reason itself and never calls the facade when the index is unusable, because
 * the facade would then fall back to ripgrep and re-parse the clone.
 */
export class BlastService {
  constructor(private readonly deps: BlastDeps) {}

  async get(workspaceId: string, prId: string, log: BlastLog): Promise<BlastRadiusResponse> {
    const { source, intel, repoIntelEnabled } = this.deps;
    const pull = await source.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const skip = (reason: BlastDegradedReason, indexStatus: string | null): BlastRadiusResponse => {
      log.info({ prId, repoId: pull.repoId, index_status: indexStatus, reason }, 'blast: index unusable, skipped');
      return toBlastRadius(EMPTY, { degraded: true, reason });
    };

    if (!repoIntelEnabled) return skip('flag_off', null);

    const state = await intel.getIndexState(pull.repoId);
    if (state.status !== 'full' && state.status !== 'partial') {
      const fallback = state.status === 'failed' ? 'index_failed' : 'no_data';
      return skip(state.degradedReason ?? fallback, state.status);
    }

    const files = (await source.getPrFiles(prId)).map((f) => f.path);
    const result = files.length > 0 ? await intel.getBlastRadius(pull.repoId, files) : EMPTY;

    let degraded = state.status === 'partial';
    let reason: BlastDegradedReason | null = degraded ? 'index_partial' : null;
    if (result.degraded) {
      degraded = true;
      reason = result.reason ?? 'no_data';
    }

    const response = toBlastRadius(result, { degraded, reason });
    log.info(
      {
        prId,
        repoId: pull.repoId,
        source: 'repo_index',
        index_status: state.status,
        ...response.counts,
      },
      'blast: read prebuilt index',
    );
    return response;
  }
}
