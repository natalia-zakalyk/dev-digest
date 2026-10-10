/** Verdict → header badge colour. */
export const VERDICT_COLOR: Readonly<Record<string, string>> = {
  request_changes: "var(--crit)",
  comment: "var(--warn)",
  approve: "var(--ok)",
};

export const VERDICT_COLOR_FALLBACK = "var(--text-muted)";
