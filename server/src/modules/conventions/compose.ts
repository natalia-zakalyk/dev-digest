import type { Container } from '../../platform/container.js';
import { resolveFeatureModel } from '../settings/index.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';

/** Composition root of the module: wires the service to the container's adapters (routes stay persistence-free). */
export function createConventionsService(c: Container): ConventionsService {
  return new ConventionsService({
    repo: new ConventionsRepository(c.db),
    git: c.git,
    // Resolved lazily: tests may swap the repoIntel override after plugin load.
    repoIntel: { getConventionSamples: (repoId, n) => c.repoIntel.getConventionSamples(repoId, n) },
    llm: (provider) => c.llm(provider),
    resolveModel: (workspaceId) => resolveFeatureModel(c, workspaceId, 'conventions'),
  });
}
