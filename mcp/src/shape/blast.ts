import { BLAST_LIMITS, BLAST_REASONS, TEXT_CAPS } from '../constants.js';
import { fitToBudget } from './budget.js';
import type { BlastDownstream, BlastRadiusResult } from './schemas.js';
import { truncateText } from './text.js';
import type { BlastInput } from './types.js';

const OVERSIZE_HINT = 'Output cut to fit the size limit; counts describe the full map.';

/** Known `reason` values pass through; anything else is shown as `unknown` (never echo free text into the hint). */
function safeReason(reason: string | null): string {
  return (BLAST_REASONS as readonly string[]).includes(reason ?? '') ? (reason as string) : 'unknown';
}

/** Hint for a degraded index. A success, not an error; MCP never calls resync (spec). */
export function degradedHint(reason: string): string {
  return `Index incomplete (${reason}): open the repo in the DevDigest studio and run Re-analyze, then retry.`;
}

/**
 * The same map as the API, capped: repo-derived strings are untrusted data (security rule 3), so names,
 * paths, endpoint/cron text and list lengths are bounded; the response is cut under the hard cap by dropping
 * trailing callers (then trailing symbols) and setting `truncated`. `counts` always describe the full map.
 */
export function shapeBlast(repo: string, pr: number, input: BlastInput): BlastRadiusResult {
  const changedAll = input.changedSymbols;
  const changed = changedAll.slice(0, BLAST_LIMITS.changedSymbols).map((s) => ({
    name: truncateText(s.name, TEXT_CAPS.symbolName),
    file: truncateText(s.file, TEXT_CAPS.file),
  }));
  const groups: BlastDownstream[] = input.downstream.slice(0, BLAST_LIMITS.downstream).map((d) => ({
    symbol: truncateText(d.symbol, TEXT_CAPS.symbolName),
    callers: d.callers.slice(0, BLAST_LIMITS.callersPerSymbol).map((c) => ({
      name: truncateText(c.name, TEXT_CAPS.symbolName),
      file: truncateText(c.file, TEXT_CAPS.file),
      line: Math.trunc(c.line),
    })),
    endpoints_affected: d.endpointsAffected
      .slice(0, BLAST_LIMITS.factsPerSymbol)
      .map((e) => truncateText(e, TEXT_CAPS.endpointOrCron)),
    crons_affected: d.cronsAffected
      .slice(0, BLAST_LIMITS.factsPerSymbol)
      .map((e) => truncateText(e, TEXT_CAPS.endpointOrCron)),
  }));

  const reason = input.degraded ? safeReason(input.reason) : undefined;
  const cutInput =
    changedAll.length > changed.length ||
    input.downstream.length > groups.length ||
    input.downstream.some((d, i) => d.callers.length > (groups[i]?.callers.length ?? 0));

  // Units in output order: a symbol header, then its callers. Dropping from the end cuts callers first.
  const units = groups.reduce((n, g) => n + 1 + g.callers.length, 0);
  const render = (keep: number): BlastRadiusResult => {
    let left = keep;
    const downstream: BlastDownstream[] = [];
    for (const g of groups) {
      if (left <= 0) break;
      left -= 1;
      const callers = g.callers.slice(0, left);
      left -= callers.length;
      downstream.push({ ...g, callers });
    }
    const cut = cutInput || keep < units;
    const hints = [
      ...(reason !== undefined ? [degradedHint(reason)] : []),
      ...(cut ? [OVERSIZE_HINT] : []),
    ];
    return {
      repo,
      pr,
      summary: truncateText(input.summary, TEXT_CAPS.blastSummary),
      counts: input.counts,
      degraded: input.degraded,
      ...(reason !== undefined ? { reason } : {}),
      ...(hints.length > 0 ? { hint: hints.join(' ') } : {}),
      changed_symbols: changed,
      downstream,
      ...(cut ? { truncated: true } : {}),
    };
  };
  return fitToBudget(units, render);
}
