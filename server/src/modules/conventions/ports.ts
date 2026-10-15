import type { ConventionStatus } from '@devdigest/shared';
import type { VerifiedCandidate } from './domain/verify.js';

/** A stored convention candidate — the domain shape, never a Drizzle row. */
export interface Convention {
  id: string;
  rule: string;
  category: string | null;
  evidencePath: string | null;
  evidenceSnippet: string | null;
  evidenceLineStart: number | null;
  evidenceLineEnd: number | null;
  confidence: number | null;
  status: ConventionStatus;
  createdAt: Date;
}

/** What the extractor needs to know about a repository. */
export interface RepoInfo {
  id: string;
  owner: string;
  name: string;
}

/** Persistence port owned by the service; `ConventionsRepository` implements it. */
export interface ConventionsRepo {
  getRepo(workspaceId: string, repoId: string): Promise<RepoInfo | undefined>;
  listByRepo(workspaceId: string, repoId: string): Promise<Convention[]>;
  listByIds(workspaceId: string, repoId: string, ids: string[]): Promise<Convention[]>;
  /** Insert verified candidates; an existing rule keeps its status (a re-scan never resets decisions). */
  upsertCandidates(workspaceId: string, repoId: string, scanId: string, items: VerifiedCandidate[]): Promise<void>;
  /** Throws `ConflictError` when `rule` already exists in the repo. */
  update(
    workspaceId: string,
    id: string,
    patch: { status?: ConventionStatus; rule?: string; category?: string },
  ): Promise<Convention | undefined>;
}
