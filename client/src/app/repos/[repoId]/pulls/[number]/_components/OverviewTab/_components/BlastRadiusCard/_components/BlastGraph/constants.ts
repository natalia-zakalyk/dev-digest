import type { BlastRadiusResponse } from "@/lib/types";
import type { GraphNodeKind } from "../../helpers";

/** Node colours per kind: symbol accent, callers neutral, endpoints green, crons amber. */
export const NODE_COLORS: Record<GraphNodeKind, { fill: string; stroke: string; text: string; strokeWidth: number }> = {
  symbol: { fill: "var(--accent-bg)", stroke: "var(--accent)", text: "var(--accent-text)", strokeWidth: 1.5 },
  caller: { fill: "var(--bg-elevated)", stroke: "var(--border)", text: "var(--text-secondary)", strokeWidth: 1 },
  endpoint: { fill: "var(--ok-bg)", stroke: "var(--ok)", text: "var(--ok)", strokeWidth: 1 },
  cron: { fill: "var(--warn-bg)", stroke: "var(--warn)", text: "var(--warn)", strokeWidth: 1 },
};

/** Column header colour, its blast.json key under `graph.column` and the card count it is compared with. */
export const COLUMN_HEADERS: Record<GraphNodeKind, { color: string; key: string; countKey: keyof BlastRadiusResponse["counts"] }> = {
  symbol: { color: "var(--accent-text)", key: "symbols", countKey: "symbols" },
  caller: { color: "var(--text-muted)", key: "callers", countKey: "callers" },
  endpoint: { color: "var(--ok)", key: "endpoints", countKey: "endpoints" },
  cron: { color: "var(--warn)", key: "crons", countKey: "crons" },
};

export const NODE_TEXT_X = 8;
export const NODE_FONT_SIZE = 11;
export const NODE_SUBLABEL_FONT_SIZE = 9.5;
export const HEADER_FONT_SIZE = 10;
