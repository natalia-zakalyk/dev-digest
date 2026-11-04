import type { Container } from '../../platform/container.js';
import { BlastService } from './service.js';

/** Composition root of the module: reads through the container's review repository and repo-intel facade. */
export function createBlastService(c: Container): BlastService {
  return new BlastService({
    source: c.reviewRepo,
    // Resolved lazily: tests may swap the repoIntel override after plugin load.
    intel: {
      getBlastRadius: (repoId, files) => c.repoIntel.getBlastRadius(repoId, files),
      getIndexState: (repoId) => c.repoIntel.getIndexState(repoId),
    },
    repoIntelEnabled: c.config.repoIntelEnabled,
  });
}
