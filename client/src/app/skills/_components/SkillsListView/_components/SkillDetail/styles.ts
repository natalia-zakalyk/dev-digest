import type { CSSProperties } from "react";

/** Co-located styles for SkillDetail. */
export const s = {
  root: { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100%" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 4px" } satisfies CSSProperties,
  iconBox: (color: string, bg: string): CSSProperties => ({
    width: 34,
    height: 34,
    borderRadius: 8,
    background: bg,
    color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  spacer: { flex: 1 } satisfies CSSProperties,
  name: { fontSize: 20, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  version: {
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    padding: "3px 10px",
    borderRadius: 6,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  body: { flex: 1, overflowY: "auto", padding: "24px 28px 40px" } satisfies CSSProperties,
  empty: { padding: 40, fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
