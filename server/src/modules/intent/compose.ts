import type { Container } from '../../platform/container.js';
import { resolveFeatureModel } from '../settings/index.js';
import { IntentRepository } from './repository.js';
import { IntentService } from './service.js';

/** Composition root of the module: wires the service to the container's adapters (routes stay persistence-free). */
export function createIntentService(c: Container): IntentService {
  return new IntentService({
    repo: new IntentRepository(c.db),
    git: c.git,
    github: () => c.github(),
    urlFetcher: c.docFetcher,
    llm: (provider) => c.llm(provider),
    resolveModel: (workspaceId) => resolveFeatureModel(c, workspaceId, 'review_intent'),
    countTokens: (text) => c.tokenizer.count(text),
  });
}
