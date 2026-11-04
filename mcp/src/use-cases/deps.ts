import { DEFAULT_RUN_WAIT_MS, POLL_INTERVAL_MS } from '../constants.js';
import type { Clock, DevDigestApi } from '../ports.js';
import { createResolver, type Resolver } from '../resolve.js';

/** Narrow dependencies shared by the use cases. Built once by the composition root. */
export interface Deps {
  api: DevDigestApi;
  clock: Clock;
  resolve: Resolver;
  /** Max wait inside `run_agent_on_pr` (`MCP_RUN_WAIT_MS`). */
  runWaitMs: number;
  pollIntervalMs: number;
}

export interface DepsOptions {
  api: DevDigestApi;
  clock: Clock;
  runWaitMs?: number;
  pollIntervalMs?: number;
  cacheTtlMs?: number;
}

export function createDeps(o: DepsOptions): Deps {
  return {
    api: o.api,
    clock: o.clock,
    resolve: createResolver(o.api, o.clock, o.cacheTtlMs),
    runWaitMs: o.runWaitMs ?? DEFAULT_RUN_WAIT_MS,
    pollIntervalMs: o.pollIntervalMs ?? POLL_INTERVAL_MS,
  };
}
