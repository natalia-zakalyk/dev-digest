import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorModal. */
export const s = {
  body: { padding: "20px 24px 4px" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 } satisfies CSSProperties,
  invalid: { marginRight: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
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
