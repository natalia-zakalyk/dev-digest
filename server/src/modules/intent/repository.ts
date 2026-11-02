import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { IntentBasis, IntentConfidence, IntentMethod, IntentSource } from '@devdigest/shared';
import { MAX_COMMITS, MAX_FILES } from './constants.js';
import type { IntentRepo } from './ports.js';
import type { PriorPr, PrInputs, PullInfo, StoredIntent } from './types.js';

const toStored = (r: typeof t.prIntent.$inferSelect): StoredIntent => ({
  intent: r.intent,
  inScope: r.inScope,
  outOfScope: r.outOfScope,
  riskAreas: r.riskAreas,
  confidence: r.confidence as IntentConfidence,
  basis: r.basis as IntentBasis,
  method: r.method as IntentMethod,
  sources: r.sources as IntentSource[],
  headSha: r.headSha,
  inputHash: r.inputHash,
  provider: r.provider,
  model: r.model,
  tokensIn: r.tokensIn,
  tokensOut: r.tokensOut,
  costUsd: r.costUsd,
  generatedAt: r.generatedAt,
});

const toValues = (i: StoredIntent) => ({
  intent: i.intent,
  inScope: i.inScope,
  outOfScope: i.outOfScope,
  riskAreas: i.riskAreas,
  confidence: i.confidence,
  basis: i.basis,
  method: i.method,
  sources: i.sources,
  headSha: i.headSha,
  inputHash: i.inputHash,
  provider: i.provider,
  model: i.model,
  tokensIn: i.tokensIn,
  tokensOut: i.tokensOut,
  costUsd: i.costUsd,
  generatedAt: i.generatedAt,
});

/** Intent data-access. Owns `pr_intent`; reads PR tables (workspace-scoped) for the classifier inputs. */
export class IntentRepository implements IntentRepo {
  constructor(private db: DbExecutor) {}

  async getPull(workspaceId: string, prId: string): Promise<PullInfo | undefined> {
    const [row] = await this.db
      .select({ pr: t.pullRequests, owner: t.repos.owner, repoName: t.repos.name })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    const p = row.pr;
    return {
      id: p.id,
      repoId: p.repoId,
      owner: row.owner,
      repoName: row.repoName,
      number: p.number,
      title: p.title,
      body: p.body,
      branch: p.branch,
      base: p.base,
      headSha: p.headSha,
      additions: p.additions,
      deletions: p.deletions,
      filesCount: p.filesCount,
    };
  }

  async get(prId: string): Promise<StoredIntent | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row ? toStored(row) : undefined;
  }

  /** One statement; last write wins when two triggers derive at once. */
  async upsert(prId: string, intent: StoredIntent): Promise<void> {
    const values = toValues(intent);
    await this.db
      .insert(t.prIntent)
      .values({ prId, ...values })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
  }

  async loadInputs(pull: PullInfo): Promise<PrInputs> {
    const [files, commits] = await Promise.all([
      this.db
        .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
        .from(t.prFiles)
        .where(eq(t.prFiles.prId, pull.id))
        .limit(MAX_FILES),
      this.db
        .select({ message: t.prCommits.message })
        .from(t.prCommits)
        .where(eq(t.prCommits.prId, pull.id))
        .orderBy(t.prCommits.committedAt)
        .limit(MAX_COMMITS),
    ]);
    return {
      pull,
      files,
      commitSubjects: commits.map((c) => (c.message.split('\n')[0] ?? '').trim()).filter((s) => s.length > 0),
    };
  }

  async priorPrsTouching(repoId: string, prId: string, paths: string[], limit: number): Promise<PriorPr[]> {
    if (paths.length === 0) return [];
    const overlap = sql<number>`count(distinct ${t.prFiles.path})::int`;
    const rows = await this.db
      .select({ number: t.pullRequests.number, title: t.pullRequests.title, overlap })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(and(eq(t.pullRequests.repoId, repoId), ne(t.pullRequests.id, prId), inArray(t.prFiles.path, paths)))
      .groupBy(t.pullRequests.id, t.pullRequests.number, t.pullRequests.title, t.pullRequests.openedAt)
      .orderBy(desc(t.pullRequests.openedAt), desc(t.pullRequests.number))
      .limit(limit);
    return rows.map((r) => ({ number: r.number, title: r.title, overlap: r.overlap }));
  }
}
