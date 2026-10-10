import type { GitHubClient, PrDetail } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { PullsRepository } from './repository.js';

/** The repo fields a PR sync needs. */
export interface SyncRepoRef {
  id: string;
  owner: string;
  name: string;
}

/**
 * F1 — PR sync use cases, shared by the pulls module (GET /repos/:id/pulls,
 * GET /pulls/:id) and the polling module (POST /repos/:id/poll), which reaches
 * it through `pulls/index.ts`.
 */
export class PullsService {
  private repo: PullsRepository;

  constructor(container: Pick<Container, 'db'>) {
    this.repo = new PullsRepository(container.db);
  }

  /**
   * Fetch the repo's PR list from GitHub and upsert it (one transaction,
   * multi-row upsert). Throws on GitHub/DB errors — callers decide whether a
   * failed sync is fatal (poll) or degrades to persisted data (list read).
   * Returns the number of PRs GitHub listed.
   */
  async syncPulls(
    gh: GitHubClient,
    workspaceId: string,
    repo: SyncRepoRef,
  ): Promise<number> {
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    return this.repo.syncPulls(workspaceId, repo.id, pulls);
  }

  /** Manual poll: sync the PR list, then stamp `last_polled_at`. */
  async poll(gh: GitHubClient, workspaceId: string, repo: SyncRepoRef): Promise<number> {
    const synced = await this.syncPulls(gh, workspaceId, repo);
    await this.repo.markRepoPolled(repo.id);
    return synced;
  }

  /** Persist a fresh GitHub PR detail (files, commits, body, diff stats). */
  async saveDetail(prId: string, detail: PrDetail): Promise<void> {
    await this.repo.replaceDetail(prId, detail);
  }
}
