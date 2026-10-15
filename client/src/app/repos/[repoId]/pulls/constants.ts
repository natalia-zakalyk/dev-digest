import type { PrMeta, PrStatus } from "@/lib/types";

/** Constants for the PR list page (/repos/:repoId/pulls). */

/** Open PRs carry a derived review status; everything else is merged/closed. */
export const OPEN_STATUSES: ReadonlySet<PrStatus> = new Set<PrStatus>([
  "needs_review",
  "reviewed",
  "stale",
]);

/**
 * Review status → colour token + i18n label key (under `list.status`). Open PRs
 * carry a derived review status (needs_review / reviewed / stale); merged/closed
 * keep their GitHub merge state.
 */
export const STATUS_META: Readonly<Record<PrStatus, { c: string; labelKey: PrStatus }>> = {
  needs_review: { c: "var(--warn)", labelKey: "needs_review" },
  reviewed: { c: "var(--ok)", labelKey: "reviewed" },
  stale: { c: "var(--stale)", labelKey: "stale" },
  open: { c: "var(--warn)", labelKey: "open" },
  merged: { c: "var(--ok)", labelKey: "merged" },
  closed: { c: "var(--stale)", labelKey: "closed" },
};

/** Size bucket → colour token. */
export const SIZE_COLOR: Readonly<Record<PrSize, string>> = {
  S: "var(--ok)",
  M: "var(--warn)",
  L: "var(--crit)",
};

/** Grid template for both the header row and PR rows. */
export const GRID = "1fr 132px 92px 60px 130px 118px 80px 78px";

/** Line-count thresholds for the S/M/L size bucket. */
export const SIZE_SMALL_MAX = 100;
export const SIZE_MEDIUM_MAX = 400;

/** Status filter value: a concrete PR status or "all". */
export type StatusFilter = "all" | PrStatus;

/** Sort order for the list. */
export const SORT_ORDERS = ["newest", "oldest"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Filter chips: status key + i18n label key (under `list.filter`). */
export const STATUS_FILTERS: readonly { key: StatusFilter; labelKey: string }[] = [
  { key: "all", labelKey: "all" },
  { key: "needs_review", labelKey: "needs_review" },
  { key: "reviewed", labelKey: "reviewed" },
  { key: "stale", labelKey: "stale" },
];

/** Column header i18n keys (under `list.columns`), in display order. */
export const COLUMN_KEYS = [
  "pullRequest",
  "author",
  "size",
  "score",
  "findings",
  "status",
  "cost",
  "updated",
] as const;

/** Number of skeleton rows shown while loading. */
export const SKELETON_ROWS = 4;

export type PrSize = "S" | "M" | "L";
export type SizeInfo = { size: PrSize; lines: number };

/** Re-exported for helpers that consume PrMeta. */
export type { PrMeta };
