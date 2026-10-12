import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, RepoRow } from '../../db/rows.js';
import type { ConventionStatus } from '@devdigest/shared';
import { ConflictError } from '../../platform/errors.js';
import type { VerifiedCandidate } from './domain/verify.js';
import type { Convention, ConventionsRepo, RepoInfo } from './ports.js';

const toConvention = (r: ConventionRow): Convention => ({
  id: r.id,
  rule: r.rule,
  category: r.category,
  evidencePath: r.evidencePath,
  evidenceSnippet: r.evidenceSnippet,
  evidenceLineStart: r.evidenceLineStart,
  evidenceLineEnd: r.evidenceLineEnd,
  confidence: r.confidence,
  status: r.status,
  createdAt: r.createdAt,
});

const toRepoInfo = (r: RepoRow): RepoInfo => ({ id: r.id, owner: r.owner, name: r.name });

const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (err: unknown): boolean =>
  (err as { code?: string; cause?: { code?: string } } | null)?.code === UNIQUE_VIOLATION ||
  (err as { cause?: { code?: string } } | null)?.cause?.code === UNIQUE_VIOLATION;

/** Conventions data-access. Owns `conventions`; reads `repos` only to scope by workspace. */
export class ConventionsRepository implements ConventionsRepo {
  constructor(private db: DbExecutor) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoInfo | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row && toRepoInfo(row);
  }

  async listByRepo(workspaceId: string, repoId: string): Promise<Convention[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence));
    return rows.map(toConvention);
  }

  async getById(workspaceId: string, id: string): Promise<Convention | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row && toConvention(row);
  }

  async listByIds(workspaceId: string, repoId: string, ids: string[]): Promise<Convention[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      );
    return rows.map(toConvention);
  }

  /**
   * Insert verified candidates; an existing rule keeps its status and gets fresh
   * evidence + confidence, so a re-scan never resets the user's decisions.
   */
  async upsertCandidates(
    workspaceId: string,
    repoId: string,
    scanId: string,
    items: VerifiedCandidate[],
  ): Promise<void> {
    if (items.length === 0) return;
    await this.db
      .insert(t.conventions)
      .values(
        items.map((c) => ({
          workspaceId,
          repoId,
          scanId,
          rule: c.rule,
          category: c.category,
          evidencePath: c.evidencePath,
          evidenceSnippet: c.evidenceSnippet,
          evidenceLineStart: c.evidenceLineStart,
          evidenceLineEnd: c.evidenceLineEnd,
          confidence: c.confidence,
        })),
      )
      .onConflictDoUpdate({
        target: [t.conventions.repoId, t.conventions.rule],
        set: {
          scanId,
          category: sql`excluded.category`,
          evidencePath: sql`excluded.evidence_path`,
          evidenceSnippet: sql`excluded.evidence_snippet`,
          evidenceLineStart: sql`excluded.evidence_line_start`,
          evidenceLineEnd: sql`excluded.evidence_line_end`,
          confidence: sql`excluded.confidence`,
        },
      });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { status?: ConventionStatus; rule?: string; category?: string },
  ): Promise<Convention | undefined> {
    const set: Partial<typeof t.conventions.$inferInsert> = {};
    if (patch.status) {
      set.status = patch.status;
      set.accepted = patch.status === 'accepted';
    }
    if (patch.rule !== undefined) set.rule = patch.rule;
    if (patch.category !== undefined) set.category = patch.category;
    if (Object.keys(set).length === 0) return this.getById(workspaceId, id);
    try {
      const [row] = await this.db
        .update(t.conventions)
        .set(set)
        .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
        .returning();
      return row && toConvention(row);
    } catch (err) {
      // Renaming onto another rule of the same repo hits conventions_repo_rule_uq.
      if (isUniqueViolation(err)) throw new ConflictError('A convention with this rule already exists');
      throw err;
    }
  }
}
