/** Domain constants (spec "Size budgets"). Pure: no imports. */

export const SEVERITIES = ['critical', 'warning', 'suggestion'] as const;
export const DETAIL_LEVELS = ['concise', 'full'] as const;

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Text caps for untrusted, PR/model-derived strings (characters, ellipsis included). */
export const TEXT_CAPS = {
  title: 200,
  rationale: 1_000,
  suggestion: 1_000,
  runError: 500,
  conventionRule: 300,
  agentName: 100,
  agentDescription: 300,
  file: 300,
  category: 100,
  evidencePath: 300,
  /** Short text taken from API error bodies. */
  apiMessage: 200,
} as const;

/** Hard cap on one serialized tool response (spec: below Claude Code's 25 000-token ceiling). */
export const MAX_RESPONSE_CHARS = 20_000;

/** Valid-values lists in error texts show at most this many entries, then `, …`. */
export const MAX_LISTED_VALUES = 10;

/** Run wait (spec D2): default of `MCP_RUN_WAIT_MS` and the poll interval. */
export const DEFAULT_RUN_WAIT_MS = 100_000;

/** Upper bound accepted for `MCP_RUN_WAIT_MS` (10 minutes). */
export const MAX_RUN_WAIT_MS = 600_000;
export const POLL_INTERVAL_MS = 2_000;

/** Fallback for `Retry-After` on a 429. */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

export const ELLIPSIS = '…';
