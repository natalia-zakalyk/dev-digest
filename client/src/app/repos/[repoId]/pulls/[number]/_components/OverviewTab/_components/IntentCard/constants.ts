/** Local copy of the contract enum values (client code uses `import type` only from @devdigest/shared). */
export const INTENT_CONFIDENCE_COLORS = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  low: { color: "var(--warn)", bg: "var(--warn-bg)" },
} as const;

/** Source kinds shown in the footer, in display order; the rest are noise for a reader. */
export const VISIBLE_SOURCE_KINDS = [
  "description",
  "linked_issue",
  "linked_doc",
  "branch",
  "commits",
  "file_paths",
  "prior_prs",
] as const;

/** Maps a source kind to its `intent.sources.*` message key. */
export const SOURCE_MESSAGE_KEY = {
  title: "title",
  description: "description",
  linked_issue: "linkedIssue",
  linked_doc: "linkedDoc",
  branch: "branch",
  commits: "commits",
  file_paths: "filePaths",
  diff_stats: "diffStats",
  prior_prs: "priorPrs",
} as const;
