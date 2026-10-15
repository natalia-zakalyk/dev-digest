import type { CSSProperties } from "react";

/** Co-located styles for SkillForm (the preview pane of the Body field). */
export const s = {
  preview: {
    minHeight: 240,
    maxHeight: 420,
    overflow: "auto",
    fontSize: 14,
    border: "1px solid var(--border-strong)",
    borderRadius: 7,
    padding: "10px 14px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
