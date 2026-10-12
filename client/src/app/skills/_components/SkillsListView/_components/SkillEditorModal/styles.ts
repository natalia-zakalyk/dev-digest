import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorModal. */
export const s = {
  body: { padding: "20px 24px 4px" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 } satisfies CSSProperties,
  invalid: { marginRight: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
