import { ApiError, ApiUnreachable } from '../errors.js';
import {
  classifyRun,
  failedResult,
  noReviewForRunResult,
  runningResult,
  shapeReview,
  type DetailLevel,
  type RunDoneResult,
  type RunFailedResult,
  type RunRunningResult,
} from '../shape/index.js';
import type { ReviewInput, RunInput } from '../shape/index.js';
import type { PullRef } from '../ports.js';
import type { Deps } from './deps.js';

export interface RunAgentOnPrArgs {
  repo: string;
  pr: number;
  agent: string;
  detail?: DetailLevel;
  limit?: number;
}

export type RunAgentOnPrResult = RunDoneResult | RunRunningResult | RunFailedResult;

/** Review of a run: any kind matches by `run_id`; prefer the full `review` over a `summary`. */
export function pickRunReview(reviews: readonly ReviewInput[], runId: string): ReviewInput | undefined {
  const mine = reviews.filter((r) => r.runId === runId);
  return mine.find((r) => r.kind === 'review') ?? mine[0];
}

/** resolve -> start -> poll runs until terminal or wait budget -> reviews of that run -> shape. */
export async function runAgentOnPr(deps: Deps, args: RunAgentOnPrArgs): Promise<RunAgentOnPrResult> {
  const { api, resolve } = deps;
  const repo = await resolve.repo(args.repo);
  const pull = await resolve.pull(repo, args.pr);
  const agent = await resolve.agent(args.agent);

  // Never retried: a second POST would start (and bill) a second run.
  const started = await api.startReview(pull.id, agent.id);
  const runId = started.runId;

  // The run now exists and is billed. If following it fails, the run_id is the only handle the
  // model has: return it as `running` so it calls get_findings instead of starting a second run.
  try {
    return await awaitResult(deps, args, repo.fullName, pull, runId);
  } catch (err) {
    if (err instanceof ApiUnreachable || err instanceof ApiError) {
      return runningResult(repo.fullName, pull.number, runId);
    }
    throw err;
  }
}

/** Poll runs until terminal or the wait budget is spent, then fetch and shape the run's review. */
async function awaitResult(
  deps: Deps,
  args: RunAgentOnPrArgs,
  repoName: string,
  pull: PullRef,
  runId: string,
): Promise<RunAgentOnPrResult> {
  const { api, clock } = deps;
  const startedAt = clock.now();
  let run: RunInput | undefined;
  for (;;) {
    const runs = await api.listRuns(pull.id);
    run = runs.find((r) => r.runId === runId);
    // A run that is not listed yet counts as still running.
    if (run && classifyRun(run.status) !== 'running') break;
    const remaining = deps.runWaitMs - (clock.now() - startedAt);
    if (remaining <= 0) return runningResult(repoName, pull.number, runId);
    await clock.sleep(Math.min(deps.pollIntervalMs, remaining));
  }

  if (classifyRun(run.status) === 'failed') return failedResult(run);

  const review = pickRunReview(await api.listReviews(pull.id), runId);
  if (!review) return noReviewForRunResult(runId);
  return shapeReview(review, runId, { detail: args.detail, limit: args.limit });
}
