import type { CSSProperties } from "react";

/** Co-located styles for SkillsPanel. */
export const s = {
  noMatch: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 } satisfies CSSProperties,
  list: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 } satisfies CSSProperties,
  ctaLink: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 13px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    textDecoration: "none",
  } satisfies CSSProperties,
} as const;
