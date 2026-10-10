import {
  OPEN_STATUSES,
  SIZE_MEDIUM_MAX,
  SIZE_SMALL_MAX,
  type PrMeta,
  type SizeInfo,
  type SortOrder,
} from "./constants";

/** Bucket a PR into S/M/L by total changed lines. */
export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}

/** Compact relative time for the list's UPDATED column (e.g. "3h", "2d"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * Filter by status ("all" keeps every PR) and a free-text query matched against
 * the title and the PR number, then sort by `updated_at` (missing dates sort as 0).
 */
export function filterPulls(
  pulls: readonly PrMeta[],
  opts: { status: string; query: string; sort: SortOrder },
): PrMeta[] {
  const q = opts.query.trim().toLowerCase();
  return pulls
    .filter((p) => opts.status === "all" || p.status === opts.status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? "") || 0;
      const tb = Date.parse(b.updated_at ?? "") || 0;
      return opts.sort === "oldest" ? ta - tb : tb - ta;
    });
}

/** PRs that are still open (derived review status), regardless of the active filter. */
export function countOpen(pulls: readonly PrMeta[]): number {
  return pulls.filter((p) => OPEN_STATUSES.has(p.status)).length;
}

/** PRs waiting for a review. */
export function countNeedsReview(pulls: readonly PrMeta[]): number {
  return pulls.filter((p) => p.status === "needs_review").length;
}
