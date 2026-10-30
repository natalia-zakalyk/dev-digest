import type { PriorPr, PrInputs, PullInfo, StoredIntent } from './types.js';

/** Persistence port owned by the service; `IntentRepository` implements it. */
export interface IntentRepo {
  /** Workspace-scoped PR lookup. */
  getPull(workspaceId: string, prId: string): Promise<PullInfo | undefined>;
  get(prId: string): Promise<StoredIntent | undefined>;
  upsert(prId: string, intent: StoredIntent): Promise<void>;
  loadInputs(pull: PullInfo): Promise<PrInputs>;
  priorPrsTouching(repoId: string, prId: string, paths: string[], limit: number): Promise<PriorPr[]>;
}
