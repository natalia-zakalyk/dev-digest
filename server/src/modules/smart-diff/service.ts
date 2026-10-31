import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { latestReviewPerAgent } from '../_shared/latest-review.js';
import { buildSmartDiff } from './domain/build.js';
import type { SmartDiffSource } from './ports.js';

export interface SmartDiffDeps {
  source: SmartDiffSource;
}

export class SmartDiffService {
  constructor(private deps: SmartDiffDeps) {}

  /**
   * Role-grouped files of a PR plus the findings that count: latest review per
   * agent (`kind = 'review'`), dismissed ones excluded.
   */
  async get(workspaceId: string, prId: string): Promise<SmartDiff> {
    const { source } = this.deps;
    const pull = await source.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, reviews] = await Promise.all([source.getPrFiles(prId), source.reviewsForPull(prId)]);
    const reviewOnly = reviews.filter((r) => r.review.kind === 'review');
    const keep = new Set(latestReviewPerAgent(reviewOnly.map((r) => r.review)).map((r) => r.id));
    const counted = reviewOnly.filter((r) => keep.has(r.review.id));
    const findings = counted.flatMap((r) => r.findings).filter((f) => f.dismissedAt == null);
    const runIds = counted.flatMap((r) => (r.review.runId ? [r.review.runId] : []));
    const sourceTokens = await this.sourceTokens(runIds);
    return { ...buildSmartDiff(files, findings), source_tokens: sourceTokens };
  }

  /**
   * tokens_in + tokens_out of the runs behind the counted reviews — what the view
   * is "built on". Smart Diff itself never calls a model. `null` when no run is known.
   */
  private async sourceTokens(runIds: string[]): Promise<number | null> {
    if (runIds.length === 0) return null;
    const runs = await this.deps.source.runTokens(runIds);
    if (runs.length === 0) return null;
    return runs.reduce((sum, r) => sum + (r.tokensIn ?? 0) + (r.tokensOut ?? 0), 0);
  }
}
