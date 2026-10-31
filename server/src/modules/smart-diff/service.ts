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
    const findings = reviewOnly
      .filter((r) => keep.has(r.review.id))
      .flatMap((r) => r.findings)
      .filter((f) => f.dismissedAt == null);
    return buildSmartDiff(files, findings);
  }
}
