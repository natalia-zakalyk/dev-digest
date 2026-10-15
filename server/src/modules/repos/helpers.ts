import { type Repo } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { AppError } from '../../platform/errors.js';
import { GITHUB_URL_REGEX, FORBIDDEN_REPO_SEGMENTS } from './constants.js';

/**
 * F1 — repos pure helpers (extracted from routes.ts; no behaviour change).
 * Pure functions only — no I/O, no DB, no container.
 */

/**
 * Parse `owner`/`name` from a GitHub URL (https or ssh form). Rejects anything
 * that isn't github.com (anchored regex) and `.`/`..` segments, which would
 * otherwise resolve outside the clone dir (path traversal → rm -rf of clones).
 */
export function parseRepoUrl(url: string): { owner: string; name: string } {
  // https://github.com/owner/repo(.git)  |  git@github.com:owner/repo.git
  const match = url.match(GITHUB_URL_REGEX);
  const owner = match?.[1];
  const name = match?.[2];
  if (
    !owner ||
    !name ||
    FORBIDDEN_REPO_SEGMENTS.has(owner) ||
    FORBIDDEN_REPO_SEGMENTS.has(name)
  ) {
    throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
  }
  return { owner, name };
}

/** Map a persisted repo row to the API `Repo` DTO. */
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    owner: row.owner,
    name: row.name,
    full_name: row.fullName,
    default_branch: row.defaultBranch,
    clone_path: row.clonePath,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    created_by: row.createdBy,
  };
}
