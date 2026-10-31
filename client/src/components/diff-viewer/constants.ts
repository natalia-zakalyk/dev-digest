/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Line label per severity — i18n keys under `shell.diffViewer.severityLine.*`. INFO gets no bar/label. */
export const SEVERITY_LINE_LABEL = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
} as const;

/** Lower = more severe. */
export const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 } as const;
