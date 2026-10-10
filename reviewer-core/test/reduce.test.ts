import { describe, it, expect } from 'vitest';
import type { Finding, Review } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../server/src/adapters/git/diff-parser.js';
import { reduceReviews, sliceDiff } from '../src/index.js';

/** Hermetic tests for the map-reduce helpers in src/review/reduce.ts. */

const block = (a: string, b: string, body = '@@ -1,1 +1,2 @@\n x\n+y') =>
  `diff --git a/${a} b/${b}\n--- ${a === '/dev/null' ? a : `a/${a}`}\n+++ ${b === '/dev/null' ? b : `b/${b}`}\n${body}`;

const RAW = [
  block('foo.ts', 'foo.ts', '@@ -1,1 +1,2 @@\n x\n+FOO_TS'),
  block('foo.tsx', 'foo.tsx', '@@ -1,1 +1,2 @@\n x\n+FOO_TSX'),
  block('sub/foo.ts', 'sub/foo.ts', '@@ -1,1 +1,2 @@\n x\n+SUB_FOO_TS'),
  // rename old.ts → renamed.ts (header + rename lines, then ---/+++)
  'diff --git a/old.ts b/renamed.ts\nsimilarity index 90%\nrename from old.ts\nrename to renamed.ts\n' +
    '--- a/old.ts\n+++ b/renamed.ts\n@@ -1,1 +1,2 @@\n x\n+RENAMED',
  // deletion: +++ /dev/null → identified by the a-path
  'diff --git a/gone.ts b/gone.ts\ndeleted file mode 100644\n--- a/gone.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-GONE',
].join('\n');

describe('sliceDiff — exact path match', () => {
  const diff = parseUnifiedDiff(RAW);

  it.each([
    { path: 'foo.ts', has: ['FOO_TS'], not: ['FOO_TSX', 'SUB_FOO_TS', 'RENAMED', 'GONE'] },
    { path: 'foo.tsx', has: ['FOO_TSX'], not: ['+FOO_TS\n', 'SUB_FOO_TS'] },
    { path: 'sub/foo.ts', has: ['SUB_FOO_TS'], not: ['FOO_TSX', '+FOO_TS\n'] },
    { path: 'renamed.ts', has: ['RENAMED'], not: ['FOO_TS', 'GONE'] },
    { path: 'gone.ts', has: ['-GONE'], not: ['FOO_TS', 'RENAMED'] },
  ])('slice for $path contains only its own block', ({ path, has, not }) => {
    const slice = sliceDiff(diff, path);
    expect(slice.startsWith('diff --git ')).toBe(true);
    expect(slice.match(/^diff --git /gm)).toHaveLength(1);
    for (const s of has) expect(slice).toContain(s);
    for (const s of not) expect(`${slice}\n`).not.toContain(s);
  });

  it('does not match a rename by its OLD path', () => {
    // old.ts is not a file in the diff → falls back to the whole raw diff
    expect(sliceDiff(diff, 'old.ts')).toBe(RAW);
  });

  it('falls back to the raw diff for an unknown path', () => {
    expect(sliceDiff(diff, 'nope.ts')).toBe(RAW);
  });

  it('matches a header-only block (no ---/+++ lines, e.g. a mode change)', () => {
    const raw = 'diff --git a/bin/run.sh b/bin/run.sh\nold mode 100644\nnew mode 100755\n' + block('x.ts', 'x.ts');
    const d = { raw, files: [{ path: 'bin/run.sh', additions: 0, deletions: 0, hunks: [] }] };
    const slice = sliceDiff(d, 'bin/run.sh');
    expect(slice).toContain('new mode 100755');
    expect(slice).not.toContain('x.ts');
  });
});

const finding = (id: string, severity: Finding['severity']): Finding => ({
  id,
  severity,
  category: 'bug',
  title: id,
  file: 'a.ts',
  start_line: 1,
  end_line: 1,
  rationale: 'r',
  confidence: 0.9,
});

const partial = (p: Partial<Review>): Review => ({
  verdict: 'approve',
  summary: '',
  score: 100,
  findings: [],
  ...p,
});

describe('reduceReviews', () => {
  it('returns a single partial unchanged', () => {
    const only = partial({ verdict: 'comment', summary: 's', score: 77, findings: [finding('a', 'WARNING')] });
    expect(reduceReviews([only])).toBe(only);
  });

  it('concats findings, takes the worst verdict, averages score, joins summaries', () => {
    const merged = reduceReviews([
      partial({ verdict: 'approve', summary: 'A ok.', score: 90, findings: [finding('a', 'SUGGESTION')] }),
      partial({ verdict: 'request_changes', summary: 'B bad.', score: 41, findings: [finding('b', 'CRITICAL')] }),
      partial({ verdict: 'comment', summary: '', score: 70, findings: [] }),
    ]);
    expect(merged.verdict).toBe('request_changes');
    expect(merged.score).toBe(67); // round((90 + 41 + 70) / 3)
    expect(merged.summary).toBe('A ok. B bad.');
    expect(merged.findings.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('comment beats approve when nothing requests changes', () => {
    const merged = reduceReviews([partial({ verdict: 'approve' }), partial({ verdict: 'comment' })]);
    expect(merged.verdict).toBe('comment');
  });

  it('empty input → approve, score 0, no findings', () => {
    expect(reduceReviews([])).toEqual({ verdict: 'approve', score: 0, summary: '', findings: [] });
  });
});
