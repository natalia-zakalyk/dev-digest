import type { BlastDegradedReason } from "@/lib/types";

/** Local copy of the contract enum: a value import from `@devdigest/shared` breaks Next routes. */
export const BLAST_DEGRADED_REASONS = [
  "flag_off",
  "index_failed",
  "index_partial",
  "repo_too_large",
  "no_data",
] as const satisfies readonly BlastDegradedReason[];

/** Used when the server sends an unknown or missing reason. */
export const FALLBACK_DEGRADED_REASON: BlastDegradedReason = "no_data";

/** Reasons where a resync can help (switching the flag back on is not a button job). */
export const RESYNCABLE_REASONS: ReadonlySet<BlastDegradedReason> = new Set([
  "index_failed",
  "index_partial",
  "repo_too_large",
  "no_data",
]);

/** The two ways to show the same data; tree is the default. */
export const BLAST_VIEWS = ["tree", "graph"] as const;
export type BlastView = (typeof BLAST_VIEWS)[number];
export const DEFAULT_BLAST_VIEW: BlastView = "tree";

/** Graph caps: a PR can change ~100 symbols, the drawing stays readable with a handful. */
export const GRAPH_MAX_SYMBOLS = 8;
export const GRAPH_MAX_CALLERS_PER_SYMBOL = 4;
export const GRAPH_MAX_TARGETS = 12;
/** Node label length (characters, ellipsis included); the full text goes into an SVG <title>. */
export const GRAPH_LABEL_MAX = 18;

/** Graph geometry in SVG user units; the svg is drawn at this size and scrolls instead of shrinking. */
export const GRAPH_NODE_WIDTH = 150;
export const GRAPH_NODE_HEIGHT = 36;
export const GRAPH_ROW_GAP = 8;
export const GRAPH_COLUMN_GAP = 48;
/** Room above the first node row for the column headers. */
export const GRAPH_HEADER_HEIGHT = 26;
