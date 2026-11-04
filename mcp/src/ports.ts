import type { AgentInput, ConventionInput, ReviewInput, RunInput } from './shape/types.js';

/** Application-ring ports. Shaped by what the use cases need; implemented over REST in `src/api/`. */

export interface RepoRef {
  id: string;
  fullName: string;
}

export interface PullRef {
  /** DevDigest PR id (uuid). Present only for imported PRs. */
  id: string;
  number: number;
  title: string;
}

export interface StartedRun {
  runId: string;
  agentId: string;
  agentName: string;
}

/**
 * Domain-typed view of the DevDigest REST API. Adapters translate transport failures into the
 * semantic errors of `errors.ts`; they never return raw API payloads.
 */
export interface DevDigestApi {
  /** `GET /agents`. Never carries `system_prompt`. */
  listAgents(): Promise<AgentInput[]>;
  /** Case-insensitive match on `owner/name`. Throws `RepoNotImported` (with the imported list) when absent. */
  findRepo(fullName: string): Promise<RepoRef>;
  /** Throws `PrNotImported` when the number is unknown or the PR has no DevDigest id yet. */
  findPull(repo: RepoRef, number: number): Promise<PullRef>;
  /** `POST /pulls/:id/review`. Throws `RunRateLimited` on 429. Never retried. */
  startReview(prId: string, agentId: string): Promise<StartedRun>;
  /** `GET /pulls/:id/runs`. */
  listRuns(prId: string): Promise<RunInput[]>;
  /** `GET /pulls/:id/reviews` (all agents, dismissed findings included; the domain drops them). */
  listReviews(prId: string): Promise<ReviewInput[]>;
  /** `GET /repos/:id/conventions`, all statuses; the domain keeps `accepted`. */
  listConventions(repoId: string): Promise<ConventionInput[]>;
}

/** Time port so the wait loop is testable with a fake clock. */
export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
  sleep(ms: number): Promise<void>;
}
