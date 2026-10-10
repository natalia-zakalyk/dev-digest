import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { groundFindings, MAX_FINDING_SPAN_LINES } from '../src/index.js';

/**
 * Hermetic tests for the citation-grounding gate (range intersection, malformed
 * ranges, and the scanner-only full-file exemption). Broader end-to-end cases
 * with the real diff parser live in server/test/grounding.test.ts.
 */

// Two hunks in a.ts with a gap: new-side lines 10–12 and 50–51; b.ts uses the
// declared-range fallback (no newLineNumbers): 100..104.
const DIFF: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'a.ts',
      additions: 5,
      deletions: 0,
      hunks: [
        { file: 'a.ts', oldStart: 50, oldLines: 0, newStart: 50, newLines: 2, newLineNumbers: [51, 50] },
        { file: 'a.ts', oldStart: 10, oldLines: 0, newStart: 10, newLines: 3, newLineNumbers: [10, 11, 12] },
      ],
    },
    {
      path: 'b.ts',
      additions: 5,
      deletions: 0,
      hunks: [{ file: 'b.ts', oldStart: 100, oldLines: 0, newStart: 100, newLines: 5, newLineNumbers: [] }],
    },
  ],
};

const f = (p: Partial<Finding>): Finding => ({
  id: 'x',
  severity: 'WARNING',
  category: 'bug',
  title: 't',
  file: 'a.ts',
  start_line: 11,
  end_line: 11,
  rationale: 'r',
  confidence: 0.8,
  ...p,
});

const keeps = (p: Partial<Finding>, opts?: Parameters<typeof groundFindings>[2]) =>
  groundFindings([f(p)], DIFF, opts).kept.length === 1;

describe('groundFindings — range intersection', () => {
  it.each([
    { start: 10, end: 10, kept: true, why: 'first line of hunk 1' },
    { start: 12, end: 12, kept: true, why: 'last line of hunk 1' },
    { start: 13, end: 49, kept: false, why: 'entirely inside the gap between hunks' },
    { start: 1, end: 9, kept: false, why: 'before every hunk' },
    { start: 5, end: 10, kept: true, why: 'overlaps hunk 1 start' },
    { start: 30, end: 60, kept: true, why: 'spans the gap into hunk 2 (unsorted hunks/lines)' },
    { start: 52, end: 99, kept: false, why: 'after the last hunk' },
  ])('a.ts $start-$end → kept=$kept ($why)', ({ start, end, kept }) => {
    expect(keeps({ start_line: start, end_line: end })).toBe(kept);
  });

  it('falls back to the declared hunk range when newLineNumbers is empty', () => {
    expect(keeps({ file: 'b.ts', start_line: 104, end_line: 104 })).toBe(true);
    expect(keeps({ file: 'b.ts', start_line: 105, end_line: 110 })).toBe(false);
    expect(keeps({ file: 'b.ts', start_line: 90, end_line: 100 })).toBe(true);
  });

  it('drops a file not present in the diff', () => {
    const res = groundFindings([f({ file: 'nope.ts' })], DIFF);
    expect(res.dropped[0]!.reason).toMatch(/not present in diff/);
  });

  it('keeps the "do not intersect" reason for non-intersecting ranges', () => {
    const res = groundFindings([f({ start_line: 20, end_line: 20 })], DIFF);
    expect(res.dropped[0]!.reason).toMatch(/do not intersect/);
  });
});

describe('groundFindings — malformed ranges', () => {
  it('drops a reversed range (no longer swapped), even if it would intersect', () => {
    const res = groundFindings([f({ start_line: 12, end_line: 10 })], DIFF);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/end_line is before start_line/);
    expect(res.dropped[0]!.reason).not.toMatch(/do not intersect/);
  });

  it(`keeps an intersecting span of exactly ${MAX_FINDING_SPAN_LINES} lines`, () => {
    expect(keeps({ start_line: 1, end_line: MAX_FINDING_SPAN_LINES })).toBe(true);
  });

  it(`drops an intersecting span of ${MAX_FINDING_SPAN_LINES + 1} lines`, () => {
    const res = groundFindings([f({ start_line: 1, end_line: MAX_FINDING_SPAN_LINES + 1 })], DIFF);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/spans 501 lines \(max 500\)/);
  });

  it('rejects a huge range quickly (no per-line iteration)', () => {
    const t0 = performance.now();
    const res = groundFindings(
      Array.from({ length: 1000 }, () => f({ start_line: 0, end_line: 1_000_000 })),
      DIFF,
    );
    expect(res.kept).toHaveLength(0);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('applies the range checks to scanner findings too', () => {
    expect(keeps({ kind: 'secret_leak', start_line: 9, end_line: 1 }, { source: 'scanner' })).toBe(false);
  });
});

describe('groundFindings — full-file kinds are a scanner-only exemption', () => {
  it.each(['secret_leak', 'lethal_trifecta', 'phantom', 'hook'] as const)(
    'LLM %s outside every hunk is dropped (default source)',
    (kind) => {
      expect(keeps({ kind, start_line: 1, end_line: 1 })).toBe(false);
      expect(keeps({ kind, start_line: 1, end_line: 1 }, { source: 'llm' })).toBe(false);
    },
  );

  it('scanner secret_leak outside every hunk is kept (file present)', () => {
    expect(keeps({ kind: 'secret_leak', start_line: 1, end_line: 1 }, { source: 'scanner' })).toBe(true);
  });

  it('scanner findings without a full-file kind still need a hunk', () => {
    expect(keeps({ kind: 'finding', start_line: 1, end_line: 1 }, { source: 'scanner' })).toBe(false);
  });

  it('scanner full-file findings still need the file in the diff', () => {
    expect(keeps({ kind: 'secret_leak', file: 'nope.ts' }, { source: 'scanner' })).toBe(false);
  });
});
