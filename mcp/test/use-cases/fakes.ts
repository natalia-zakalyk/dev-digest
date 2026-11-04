import {
  PrNotImported,
  RepoNotImported,
  type AgentInput,
  type BlastInput,
  type Clock,
  type ConventionInput,
  type DevDigestApi,
  type PullRef,
  type RepoRef,
  type ReviewInput,
  type RunInput,
  type StartedRun,
} from './imports.js';

export class FakeClock implements Clock {
  t = 1_000_000;
  sleeps: number[] = [];
  now(): number {
    return this.t;
  }
  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.t += ms;
  }
}

export const REPO: RepoRef = { id: 'repo-1', fullName: 'Acme/Shop' };
export const PULL: PullRef = { id: 'pr-uuid', number: 12, title: 'Add cart' };

export function agent(over: Partial<AgentInput> = {}): AgentInput {
  return { id: 'a1', name: 'security-reviewer', description: 'd', model: 'm', enabled: true, ...over };
}

export function run(over: Partial<RunInput> = {}): RunInput {
  return { runId: 'run-1', agentId: 'a1', agentName: 'security-reviewer', status: 'running', error: null, ...over };
}

/** In-memory DevDigestApi. `runsByPoll[i]` is returned by the i-th `listRuns` call (last one repeats). */
export class FakeApi implements DevDigestApi {
  agents: AgentInput[] = [agent()];
  repos: RepoRef[] = [REPO];
  pulls: PullRef[] = [PULL];
  conventions: ConventionInput[] = [];
  reviews: ReviewInput[] = [];
  runsByPoll: RunInput[][] = [[run({ status: 'done' })]];
  started: StartedRun = { runId: 'run-1', agentId: 'a1', agentName: 'security-reviewer' };
  blast: BlastInput = {
    changedSymbols: [{ name: 'rateLimit', file: 'src/lib/rate-limit.ts' }],
    downstream: [
      {
        symbol: 'rateLimit',
        callers: [{ name: 'listItems', file: 'src/api/items.ts', line: 7 }],
        endpointsAffected: ['GET /api/public/items'],
        cronsAffected: [],
      },
    ],
    summary: '1 symbol changed · 1 caller · 1 endpoint',
    counts: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
    degraded: false,
    reason: null,
  };
  calls: string[] = [];
  private polls = 0;

  async listAgents() {
    this.calls.push('listAgents');
    return this.agents;
  }
  async findRepo(fullName: string) {
    this.calls.push('findRepo');
    const r = this.repos.find((x) => x.fullName.toLowerCase() === fullName.toLowerCase());
    if (!r) throw new RepoNotImported(fullName, this.repos.map((x) => x.fullName));
    return r;
  }
  async findPull(repo: RepoRef, number: number) {
    this.calls.push('findPull');
    const p = this.pulls.find((x) => x.number === number);
    if (!p) throw new PrNotImported(repo.fullName, number);
    return p;
  }
  async startReview() {
    this.calls.push('startReview');
    return this.started;
  }
  async listRuns() {
    this.calls.push('listRuns');
    const i = Math.min(this.polls++, this.runsByPoll.length - 1);
    return this.runsByPoll[i]!;
  }
  async listReviews() {
    this.calls.push('listReviews');
    return this.reviews;
  }
  async listConventions() {
    this.calls.push('listConventions');
    return this.conventions;
  }
  async getBlast(prId: string) {
    this.calls.push(`getBlast:${prId}`);
    return this.blast;
  }
  count(name: string): number {
    return this.calls.filter((c) => c === name).length;
  }
}
