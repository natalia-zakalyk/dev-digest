import { SEVERITIES, TEXT_CAPS } from '../constants.js';
import type { Counts, DetailLevel, Severity, ShapedFinding } from './schemas.js';
import { truncateText } from './text.js';
import type { FindingInput } from './types.js';

const RANK: Record<Severity, number> = { critical: 0, warning: 1, suggestion: 2 };

/**
 * The API sends `CRITICAL | WARNING | SUGGESTION` (server/src/vendor/shared/contracts/findings.ts:12);
 * we expose lowercase. Matching is case-insensitive; an unknown value degrades to `suggestion`
 * (lowest rank) instead of failing the whole response.
 */
export function normalizeSeverity(raw: string): Severity {
  const value = raw.trim().toLowerCase();
  return (SEVERITIES as readonly string[]).includes(value) ? (value as Severity) : 'suggestion';
}

export interface ShapedFindings {
  /** All kept (non-dismissed) findings, shaped and sorted. Not yet limited. */
  findings: ShapedFinding[];
  /** Counts over all kept findings (before `limit`). */
  counts: Counts;
}

/** Drop dismissed, map severity, truncate text, sort (severity, file, line, id). Accepted findings stay. */
export function shapeFindings(inputs: readonly FindingInput[], detail: DetailLevel): ShapedFindings {
  const counts: Counts = { critical: 0, warning: 0, suggestion: 0 };
  const kept: ShapedFinding[] = [];
  for (const f of inputs) {
    if (f.dismissedAt) continue;
    const severity = normalizeSeverity(f.severity);
    counts[severity] += 1;
    const base = {
      id: f.id,
      severity,
      file: truncateText(f.file, TEXT_CAPS.file),
      line: f.startLine,
      title: truncateText(f.title, TEXT_CAPS.title),
    };
    kept.push(
      detail === 'full'
        ? {
            ...base,
            rationale: truncateText(f.rationale, TEXT_CAPS.rationale),
            suggestion: f.suggestion ? truncateText(f.suggestion, TEXT_CAPS.suggestion) : null,
            confidence: f.confidence,
          }
        : base,
    );
  }
  kept.sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      cmp(a.file, b.file) ||
      a.line - b.line ||
      cmp(a.id, b.id),
  );
  return { findings: kept, counts };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
