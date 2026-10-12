import type { CSSProperties } from "react";

/** Co-located styles for SkillRow (rows follow the Agent Editor · Skills design). */
export const s = {
  row: ({
    linked,
    dragging,
    over,
    flagged = false,
  }: {
    linked: boolean;
    dragging: boolean;
    over: boolean;
    flagged?: boolean;
  }): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid " + (over ? "var(--accent)" : flagged ? "var(--crit)" : "var(--border)"),
    background: flagged ? "var(--crit-bg)" : linked ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: dragging ? 0.5 : 1,
    cursor: linked ? "grab" : "default",
  }),
  handle: {
    display: "inline-flex",
    padding: 2,
    border: "none",
    background: "none",
    color: "var(--text-muted)",
    cursor: "grab",
  } satisfies CSSProperties,
  handlePlaceholder: { width: 18, flexShrink: 0 } satisfies CSSProperties,
  name: (enabled: boolean): CSSProperties => ({
    fontSize: 14,
    fontWeight: 600,
    color: enabled ? "var(--text-primary)" : "var(--text-muted)",
    textDecoration: enabled ? "none" : "line-through",
  }),
  typeCell: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
