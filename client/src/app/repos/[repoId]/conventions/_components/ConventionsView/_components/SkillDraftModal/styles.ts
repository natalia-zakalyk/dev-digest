import type { CSSProperties } from "react";

/** Co-located styles for SkillDraftModal. */
export const s = {
  body: { padding: "20px 24px 4px" } satisfies CSSProperties,
  banner: {
    padding: "12px 14px",
    marginBottom: 20,
    borderRadius: 8,
    fontSize: 13,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 } satisfies CSSProperties,
  meta: { marginRight: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
