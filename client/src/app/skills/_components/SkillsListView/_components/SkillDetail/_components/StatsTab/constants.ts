/** Donut segment colour per finding category; anything else falls back to muted. */
export const CATEGORY_COLORS: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "#a855f7",
  style: "var(--accent)",
};

export const FALLBACK_CATEGORY_COLOR = "var(--text-muted)";
