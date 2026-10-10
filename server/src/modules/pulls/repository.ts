import { eq, sql } from 'drizzle-orm';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { DbExecutor } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Rows per multi-row INSERT (keeps bind params well under Postgres' 65k cap). */
const UPSERT_CHUNK_SIZE = 500;

/**
 * F1 — pull-request persistence (pulls + polling modules). Owns the GitHub →
 * `pull_requests` sync and the PR detail (files/commits) refresh.
 */
export class PullsRepository {
  constructor(private db: DbExecutor) {}

  /**
   * Upsert a GitHub PR list into `pull_requests` for one repo in ONE
   * transaction, as multi-row `INSERT … ON CONFLICT (repo_id, number) DO
   * UPDATE` statements (DB-8; was one round-trip per PR).
   *
   * Semantics are those of the old per-PR loop: a new PR is inserted with
   * every field from GitHub; an existing PR only refreshes title, head_sha,
   * status and updated_at (author/branch/base/diff stats/opened_at and
   * last_reviewed_sha are kept). If GitHub lists the same number twice, the
   * last entry wins — as it did when the loop upserted them in order.
   * Returns how many PR entries were processed (= `pulls.length`).
   */
  async syncPulls(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<number> {
    const byNumber = new Map<number, PrMeta>();
    for (const pr of pulls) byNumber.set(pr.number, pr);
    const values = [...byNumber.values()].map((pr) => ({
      workspaceId,
      repoId,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      branch: pr.branch,
      base: pr.base,
      headSha: pr.head_sha,
      additions: pr.additions,
      deletions: pr.deletions,
      filesCount: pr.files_count,
      status: pr.status,
      openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
      updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
    }));
    if (values.length > 0) {
      await this.db.transaction(async (tx) => {
        for (let i = 0; i < values.length; i += UPSERT_CHUNK_SIZE) {
          await tx
            .insert(t.pullRequests)
            .values(values.slice(i, i + UPSERT_CHUNK_SIZE))
            .onConflictDoUpdate({
              target: [t.pullRequests.repoId, t.pullRequests.number],
              set: {
                title: sql`excluded.title`,
                headSha: sql`excluded.head_sha`,
                status: sql`excluded.status`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        }
      });
    }
    return pulls.length;
  }

  /** Stamp the repo's `last_polled_at` (manual poll). */
  async markRepoPolled(repoId: string, at: Date = new Date()): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: at }).where(eq(t.repos.id, repoId));
  }

  /**
   * Replace a PR's files + commits with a fresh GitHub detail and backfill its
   * body/diff stats — atomically, so a failure mid-way can't leave a PR with
   * its files deleted and nothing re-inserted (DB-2).
   */
  async replaceDetail(prId: string, detail: PrDetail): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (detail.files.length > 0) {
        await tx.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (detail.commits.length > 0) {
        await tx.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await tx
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          // Diff stats aren't on GitHub's PR-list payload — backfill them from
          // the detail fetch so the Pull Requests list shows real size/files.
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, prId));
    });
  }
}
