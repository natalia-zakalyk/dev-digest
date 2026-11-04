import { DEFAULT_LIMIT, TEXT_CAPS } from '../constants.js';
import { fitToBudget } from './budget.js';
import { resolveLimit } from './limit.js';
import type { ConventionEntry, ConventionsResult } from './schemas.js';
import { truncateText } from './text.js';
import type { ConventionInput } from './types.js';

/** `path:line` or `path:start-end` when the range spans lines. */
export function formatEvidence(c: Pick<ConventionInput, 'evidencePath' | 'evidenceLineStart' | 'evidenceLineEnd'>): string {
  const { evidenceLineStart: start, evidenceLineEnd: end } = c;
  const path = truncateText(c.evidencePath, TEXT_CAPS.evidencePath);
  if (start == null) return path;
  return end != null && end > start ? `${path}:${start}-${end}` : `${path}:${start}`;
}

/** Only `status = accepted` (D3), API order kept, `limit` (default 20), `total` before the limit. */
export function shapeConventions(
  repo: string,
  inputs: readonly ConventionInput[],
  options: { limit?: number } = {},
): ConventionsResult {
  const accepted: ConventionEntry[] = inputs
    .filter((c) => c.status === 'accepted')
    .map((c) => ({
      rule: truncateText(c.rule, TEXT_CAPS.conventionRule),
      category: c.category == null ? null : truncateText(c.category, TEXT_CAPS.category),
      evidence: formatEvidence(c),
    }));
  const total = accepted.length;
  if (total === 0) {
    return {
      repo,
      conventions: [],
      total: 0,
      hint: 'No accepted conventions yet. Accept candidates in the DevDigest studio.',
    };
  }
  const limited = Math.min(total, resolveLimit(options.limit ?? DEFAULT_LIMIT));
  return fitToBudget(limited, (keep): ConventionsResult => {
    const base = { repo, conventions: accepted.slice(0, keep), total };
    return keep < total
      ? {
          ...base,
          truncated: true,
          hint: `Showing ${keep} of ${total} conventions. Raise limit (max 100) to see more.`,
        }
      : base;
  });
}
