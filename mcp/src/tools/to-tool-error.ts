import type { CallToolResult } from '@modelcontextprotocol/server';
import { MAX_LISTED_VALUES, TEXT_CAPS } from '../constants.js';
import {
  AgentNotFound,
  ApiError,
  ApiUnreachable,
  PrNotImported,
  RepoNotImported,
  RunNotFound,
  RunRateLimited,
} from '../errors.js';
import { originOf, truncateText } from '../shape/index.js';

/**
 * Error catalog (spec "Error catalog"): the ONLY place that holds error wording.
 * Every text names what is wrong and the next call. Semantic errors -> `isError:true` with one
 * text block and no `structuredContent`; anything else -> a generic message (no stack, no raw body).
 */

export const GENERIC_ERROR_TEXT =
  'DevDigest MCP server failed unexpectedly. Check the server logs on stderr, then retry the call.';

function errorResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** `a, b, …` when cut (the `…` is followed by a space in the sentence), `a, b.` when complete, `none.` when empty. */
function listText(shown: readonly string[], cut: boolean): string {
  if (shown.length === 0) return 'none.';
  return cut ? `${shown.join(', ')}, …` : `${shown.join(', ')}.`;
}

export function catalogText(err: unknown): string | undefined {
  if (err instanceof AgentNotFound) {
    const shown = err.validAgents
      .slice(0, MAX_LISTED_VALUES)
      .map((a) => `${truncateText(a.name, TEXT_CAPS.agentName)} (id ${a.id})`);
    const cut = err.totalAgents > shown.length;
    return `Agent "${err.agent}" not found. Valid agents: ${listText(shown, cut)} Call list_agents to see them.`;
  }
  if (err instanceof RepoNotImported) {
    const shown = err.importedRepos.slice(0, MAX_LISTED_VALUES);
    const cut = err.importedRepos.length > shown.length;
    return `Repo "${err.repo}" is not imported in DevDigest. Imported repos: ${listText(shown, cut)} Import it in the studio first.`;
  }
  if (err instanceof PrNotImported) {
    return `PR #${err.pr} is not imported for ${err.repo}. Open the repo in the DevDigest studio and refresh pull requests, then retry.`;
  }
  if (err instanceof RunRateLimited) {
    return `Review rate limit reached (10/min). Wait ~${err.retryAfterSeconds}s and call run_agent_on_pr again, or use get_findings for an existing run.`;
  }
  if (err instanceof ApiUnreachable) {
    return `DevDigest API is not reachable at ${originOf(err.base)}. Start it with ./scripts/dev.sh, then retry.`;
  }
  if (err instanceof RunNotFound) {
    return `Run "${err.runId}" not found for PR #${err.pr} of ${err.repo}. It may be from another PR or expired. Call run_agent_on_pr(repo, pr, agent) to start a new one.`;
  }
  if (err instanceof ApiError) {
    const message = truncateText(err.detail, TEXT_CAPS.apiMessage);
    return `DevDigest API returned ${err.status} for ${err.operation}: ${message}. Check the API logs, then retry.`;
  }
  return undefined;
}

export function toToolError(err: unknown): CallToolResult {
  const text = catalogText(err);
  if (text !== undefined) return errorResult(text);
  // Only the error class goes to stderr: never the message, stack or an API body.
  console.error(`[devdigest-mcp] unexpected error: ${err instanceof Error ? err.name : typeof err}`);
  return errorResult(GENERIC_ERROR_TEXT);
}
