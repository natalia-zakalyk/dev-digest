import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab. */
export const s = {
  row: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" } satisfies CSSProperties,
  enabled: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  notice: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 16,
  } satisfies CSSProperties,
  h3: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    margin: "4px 0 8px",
  } satisfies CSSProperties,
  description: { fontSize: 14, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.5 } satisfies CSSProperties,
  actions: { display: "flex", justifyContent: "space-between", gap: 8, marginTop: 24 } satisfies CSSProperties,
} as const;
