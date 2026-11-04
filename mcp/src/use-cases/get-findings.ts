import { RunNotFound } from '../errors.js';
import {
  classifyRun,
  failedResult,
  latestReviewPerAgent,
  noReviewForRunResult,
  noReviewsResult,
  runningResult,
  shapeReview,
  shapeReviews,
  type DetailLevel,
  type ReviewsResult,
} from '../shape/index.js';
import type { Deps } from './deps.js';
import { pickRunReview, type RunAgentOnPrResult } from './run-agent-on-pr.js';

export interface GetFindingsArgs {
  repo: string;
  pr: number;
  run_id?: string;
  agent?: string;
  detail?: DetailLevel;
  limit?: number;
}

export type GetFindingsResult = RunAgentOnPrResult | ReviewsResult;

/** Never starts a run. `run_id` wins over `agent`; neither -> latest review of each agent. */
export async function getFindings(deps: Deps, args: GetFindingsArgs): Promise<GetFindingsResult> {
  const { api, resolve } = deps;
  const repo = await resolve.repo(args.repo);
  const pull = await resolve.pull(repo, args.pr);
  const options = { detail: args.detail, limit: args.limit };

  if (args.run_id !== undefined) {
    const runId = args.run_id;
    const run = (await api.listRuns(pull.id)).find((r) => r.runId === runId);
    if (!run) throw new RunNotFound(runId, repo.fullName, pull.number);
    const phase = classifyRun(run.status);
    if (phase === 'running') return runningResult(repo.fullName, pull.number, runId);
    if (phase === 'failed') return failedResult(run);
    const review = pickRunReview(await api.listReviews(pull.id), runId);
    if (!review) return noReviewForRunResult(runId);
    return shapeReview(review, runId, options);
  }

  const agentId = args.agent !== undefined ? (await resolve.agent(args.agent)).id : undefined;
  let latest = latestReviewPerAgent(await api.listReviews(pull.id));
  if (agentId !== undefined) latest = latest.filter((r) => r.agentId === agentId);
  if (latest.length === 0) return noReviewsResult(pull.number);
  return shapeReviews(pull.number, latest, options);
}
