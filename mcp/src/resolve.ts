import { AgentNotFound } from './errors.js';
import { MAX_LISTED_VALUES } from './constants.js';
import type { Clock, DevDigestApi, PullRef, RepoRef } from './ports.js';
import type { AgentInput } from './shape/index.js';

/** Cache lifetime for repos and agents (spec: ~60 s). */
export const CACHE_TTL_MS = 60_000;

/** Turns the model's flat arguments (`owner/name`, PR number, agent id) into DevDigest entities. */
export interface Resolver {
  repo(fullName: string): Promise<RepoRef>;
  pull(repo: RepoRef, number: number): Promise<PullRef>;
  agent(id: string): Promise<AgentInput>;
  /** Agents for `list_agents`, through the same cache. */
  agents(): Promise<AgentInput[]>;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * The API port already throws `RepoNotImported` / `PrNotImported`, so repo and PR lookups delegate.
 * Only `agent` raises its own miss (`AgentNotFound` with a capped list). Repos and agents are cached
 * for `ttlMs` using the injected clock; failures are never cached. PRs are not cached (they change).
 */
export function createResolver(api: DevDigestApi, clock: Clock, ttlMs: number = CACHE_TTL_MS): Resolver {
  const repos = new Map<string, Entry<RepoRef>>();
  let agentList: Entry<AgentInput[]> | undefined;

  const fresh = <T>(e: Entry<T> | undefined): e is Entry<T> => e !== undefined && e.expiresAt > clock.now();

  async function loadAgents(force: boolean): Promise<AgentInput[]> {
    if (!force && fresh(agentList)) return agentList.value;
    const value = await api.listAgents();
    agentList = { value, expiresAt: clock.now() + ttlMs };
    return value;
  }

  return {
    async repo(fullName) {
      const key = fullName.toLowerCase();
      const hit = repos.get(key);
      if (fresh(hit)) return hit.value;
      const value = await api.findRepo(fullName);
      repos.set(key, { value, expiresAt: clock.now() + ttlMs });
      return value;
    },
    pull: (repo, number) => api.findPull(repo, number),
    agents: () => loadAgents(false),
    async agent(id) {
      let list = await loadAgents(false);
      let found = list.find((a) => a.id === id);
      if (!found) {
        // A cached list may predate a newly created agent: refresh once before failing.
        list = await loadAgents(true);
        found = list.find((a) => a.id === id);
      }
      if (!found) {
        throw new AgentNotFound(
          id,
          list.slice(0, MAX_LISTED_VALUES).map((a) => ({ id: a.id, name: a.name })),
          list.length,
        );
      }
      return found;
    },
  };
}
