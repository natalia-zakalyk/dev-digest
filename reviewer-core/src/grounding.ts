import type { Finding, UnifiedDiff } from '@devdigest/shared';

/**
 * Citation grounding — the mandatory mechanical gate for diff-findings.
 *
 * A diff-finding is kept ONLY if its [start_line, end_line] range intersects a
 * real hunk in the unified diff for the same file. Findings that fail are
 * dropped (the model "hallucinated" a location). A finding is also dropped when
 * its range is malformed: reversed (`end_line < start_line`) or wider than
 * MAX_FINDING_SPAN_LINES (a "whole file" citation is not a citation).
 *
 * EXCEPTION — only for deterministic full-file scanners (`source: 'scanner'`,
 * e.g. hooks / blast / onboarding): findings whose `kind` is in
 * {secret_leak, lethal_trifecta, phantom, hook} are not tied to a diff hunk and
 * only require the file to be present in the diff. LLM findings (the default
 * `source: 'llm'`) never get this exemption, whatever `kind` the model emits —
 * otherwise a model could ground any location just by labelling it `secret_leak`.
 */

const FULL_FILE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

/** Widest [start_line, end_line] span (inclusive) a finding may cite. */
export const MAX_FINDING_SPAN_LINES = 500;

export type FindingSource = 'llm' | 'scanner';

export interface GroundingOptions {
  /**
   * Where the findings came from. Default 'llm'. Only 'scanner' findings may use
   * the full-file `kind` exemption.
   */
  source?: FindingSource;
}

export interface GroundingResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
}

/** Inclusive new-side line range covered by a hunk. */
type LineRange = readonly [lo: number, hi: number];

/** Collapse a list of line numbers into sorted inclusive [lo, hi] runs. */
function runsOf(lines: number[]): LineRange[] {
  const sorted = [...lines].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && n <= last[1] + 1) last[1] = Math.max(last[1], n);
    else out.push([n, n]);
  }
  return out;
}

/** Sort + merge overlapping/adjacent ranges. */
function mergeRanges(ranges: LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [lo, hi] of sorted) {
    const last = out[out.length - 1];
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

/** file → sorted, merged new-side line ranges covered by hunks. */
function buildRangeIndex(diff: UnifiedDiff): Map<string, LineRange[]> {
  const idx = new Map<string, LineRange[]>();
  for (const f of diff.files) {
    const ranges: LineRange[] = [];
    for (const h of f.hunks) {
      if (h.newLineNumbers && h.newLineNumbers.length > 0) {
        ranges.push(...runsOf(h.newLineNumbers));
      } else {
        // fall back to the hunk's declared new range
        ranges.push([h.newStart, h.newStart + Math.max(h.newLines, 1) - 1]);
      }
    }
    idx.set(f.path, mergeRanges([...(idx.get(f.path) ?? []), ...ranges]));
  }
  return idx;
}

/** O(log n) check: does [start, end] overlap any of the sorted, disjoint ranges? */
function rangeIntersects(ranges: LineRange[], start: number, end: number): boolean {
  // find the first range whose hi >= start
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ranges[mid]![1] < start) lo = mid + 1;
    else hi = mid;
  }
  const r = ranges[lo];
  return r !== undefined && r[0] <= end;
}

/**
 * Apply the grounding gate to a set of findings against a unified diff.
 * Returns the kept findings and the dropped ones with reasons (for the trace).
 */
export function groundFindings(
  findings: Finding[],
  diff: UnifiedDiff,
  opts: GroundingOptions = {},
): GroundingResult {
  const source: FindingSource = opts.source ?? 'llm';
  const rangeIndex = buildRangeIndex(diff);
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];

  for (const finding of findings) {
    const { start_line: start, end_line: end, file } = finding;

    if (!rangeIndex.has(file)) {
      dropped.push({ finding, reason: `file '${file}' not present in diff` });
      continue;
    }

    if (end < start) {
      dropped.push({
        finding,
        reason: `invalid line range ${start}-${end} in '${file}': end_line is before start_line`,
      });
      continue;
    }

    const span = end - start + 1;
    if (span > MAX_FINDING_SPAN_LINES) {
      dropped.push({
        finding,
        reason: `line range ${start}-${end} in '${file}' spans ${span} lines (max ${MAX_FINDING_SPAN_LINES})`,
      });
      continue;
    }

    if (source === 'scanner' && finding.kind && FULL_FILE_KINDS.has(finding.kind)) {
      // full-file scanners only need the file to be in the diff
      kept.push(finding);
      continue;
    }

    if (rangeIntersects(rangeIndex.get(file)!, start, end)) {
      kept.push(finding);
    } else {
      dropped.push({
        finding,
        reason: `lines ${start}-${end} do not intersect any diff hunk in '${file}'`,
      });
    }
  }

  return { kept, dropped };
}

/** Human-readable summary, e.g. "3/3 passed" used in run-trace stats. */
export function groundingSummary(result: GroundingResult): string {
  const total = result.kept.length + result.dropped.length;
  return `${result.kept.length}/${total} passed`;
}
