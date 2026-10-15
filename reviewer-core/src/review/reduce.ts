import type { Finding, Review, UnifiedDiff } from '@devdigest/shared';

/**
 * Reduce + slice helpers for map-reduce reviews. Pure (no DB / `this`), so they
 * live in the engine and are shared by the server and the CI runner.
 */

/**
 * Per-severity penalty subtracted from a perfect 100. Chosen so the score
 * tracks the findings the UI actually shows: 0 findings ⇒ 100, one suggestion
 * ⇒ 97, one warning ⇒ 88, one critical ⇒ 65.
 */
const SEVERITY_PENALTY: Record<Finding['severity'], number> = {
  CRITICAL: 35,
  WARNING: 12,
  SUGGESTION: 3,
};

/**
 * Deterministic 0–100 quality score derived from the (grounded) findings —
 * NOT the model's self-reported `score`, which has no anchor and drifts wildly
 * between models (a cheap model can "approve" with zero findings yet emit 10).
 * This mirrors how the review *event* is already computed from severities in
 * `to-review.ts`, so the number on screen can never contradict the findings
 * beneath it.
 */
export function scoreFromFindings(findings: Finding[]): number {
  const penalty = findings.reduce((sum, f) => sum + (SEVERITY_PENALTY[f.severity] ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

/** Verdict severity order for the reduce step (worst verdict wins). */
const VERDICT_RANK: Record<string, number> = {
  request_changes: 2,
  comment: 1,
  approve: 0,
};

/**
 * Merge N partial Reviews (one per mapped file/chunk) into a single Review:
 * concat findings, take the worst verdict, mean score, joined summaries.
 */
export function reduceReviews(partials: Review[]): Review {
  if (partials.length === 1) return partials[0]!;
  const findings = partials.flatMap((p) => p.findings);
  let verdict: Review['verdict'] = 'approve';
  for (const p of partials) {
    if ((VERDICT_RANK[p.verdict] ?? 0) > (VERDICT_RANK[verdict] ?? 0)) verdict = p.verdict;
  }
  const score = partials.length
    ? Math.round(partials.reduce((s, p) => s + p.score, 0) / partials.length)
    : 0;
  const summary = partials.map((p) => p.summary).filter(Boolean).join(' ');
  return { verdict, score, summary, findings };
}

/**
 * Resolve the file path a `diff --git` block is about: the new-side (b/) path,
 * or the old-side (a/) path when the file was deleted (`+++ /dev/null`).
 * `---`/`+++` lines win over the header (unambiguous even with spaces), then
 * `rename to`, then the header itself.
 */
function blockPath(block: string[]): string | null {
  let aPath: string | null = null;
  let bPath: string | null = null;
  let renameTo: string | null = null;
  for (const line of block) {
    if (line.startsWith('@@')) break; // headers end at the first hunk
    if (line.startsWith('--- ')) aPath = stripPrefix(line.slice(4), 'a/');
    else if (line.startsWith('+++ ')) bPath = stripPrefix(line.slice(4), 'b/');
    else if (line.startsWith('rename to ')) renameTo = line.slice('rename to '.length).trim();
  }
  if (bPath && bPath !== '/dev/null') return bPath;
  if (bPath === '/dev/null' && aPath && aPath !== '/dev/null') return aPath;
  if (renameTo) return renameTo;
  return headerPath(block[0] ?? '');
}

function stripPrefix(p: string, prefix: string): string {
  const t = p.replace(/\t.*$/, '').trim(); // drop optional timestamp
  return t.startsWith(prefix) ? t.slice(prefix.length) : t;
}

/** Parse `diff --git a/X b/Y` → Y (prefers the symmetric X === Y split). */
function headerPath(header: string): string | null {
  const rest = header.slice('diff --git '.length);
  if (!rest.startsWith('a/')) return null;
  // symmetric case: "a/P b/P" → length = 2*len(P) + 5
  const pLen = (rest.length - 5) / 2;
  if (Number.isInteger(pLen) && pLen > 0) {
    const a = rest.slice(2, 2 + pLen);
    const b = rest.slice(2 + pLen + 3);
    if (rest.slice(2 + pLen, 2 + pLen + 3) === ' b/' && a === b) return b;
  }
  const m = rest.match(/^a\/.+? b\/(.+)$/);
  return m?.[1] ?? null;
}

/**
 * Extract the slice of the unified diff for a single file (for map chunks).
 * Matches the file path EXACTLY (not by substring), so `foo.ts` never pulls in
 * `foo.tsx` or `sub/foo.ts`.
 */
export function sliceDiff(diff: UnifiedDiff, path: string): string {
  const lines = diff.raw.split('\n');
  const out: string[] = [];
  let block: string[] | null = null;
  const flush = () => {
    if (block && blockPath(block) === path) out.push(...block);
    block = null;
  };
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush();
      block = [line];
    } else if (block) {
      block.push(line);
    }
  }
  flush();
  if (out.length > 0) return out.join('\n');
  // fallback: synthesize from the file's hunks
  const f = diff.files.find((x) => x.path === path);
  if (!f) return diff.raw;
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}`;
}
