import { BLAST_REASONS } from '../constants.js';
import type { BlastRadiusResult } from './schemas.js';
import type { BlastInput } from './types.js';

/** Known `reason` values pass through; anything else is shown as `unknown` (never echo free text into the hint). */
function safeReason(reason: string | null): string {
  return (BLAST_REASONS as readonly string[]).includes(reason ?? '') ? (reason as string) : 'unknown';
}

/** Hint for a degraded index. A success, not an error; MCP never calls resync (spec). */
export function degradedHint(reason: string): string {
  return `Index incomplete (${reason}): open the repo in the DevDigest studio and run Re-analyze, then retry.`;
}

/**
 * The server's blast map as is (the route already bounds it), plus the repo and PR it answers for and, for a
 * degraded index, the `reason` and the re-analyze `hint`. Nothing is dropped, renamed or truncated here.
 */
export function toBlastResult(repo: string, pr: number, input: BlastInput): BlastRadiusResult {
  const reason = input.degraded ? safeReason(input.reason) : undefined;
  return {
    repo,
    pr,
    summary: input.summary,
    counts: input.counts,
    degraded: input.degraded,
    ...(reason !== undefined ? { reason, hint: degradedHint(reason) } : {}),
    changed_symbols: [...input.changed_symbols],
    downstream: input.downstream.map((d) => ({ ...d, callers: [...d.callers] })),
  };
}
