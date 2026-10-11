import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  fileRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
  fileName: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" } satisfies CSSProperties,
  trust: {
    display: "flex",
    gap: 10,
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 14,
  } satisfies CSSProperties,
  trustIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  trustTitle: { fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 } satisfies CSSProperties,
  box: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 16,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  boxTitle: { fontSize: 13, fontWeight: 600, marginBottom: 4 } satisfies CSSProperties,
  list: { margin: "6px 0 0", paddingLeft: 18 } satisfies CSSProperties,
  ignored: { fontSize: 12.5, color: "var(--text-secondary)", textDecoration: "line-through" } satisfies CSSProperties,
  warning: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  body: {
    maxHeight: 360,
    overflow: "auto",
    fontSize: 14,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 16px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
