import type { CSSProperties } from "react";

/** Co-located styles for FileTab. */
export const s = {
  file: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", margin: "8px 0 0" } satisfies CSSProperties,
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
    margin: "4px 0 16px",
  } satisfies CSSProperties,
  trustIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  trustTitle: { fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 } satisfies CSSProperties,
  box: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 16,
    background: "var(--bg-elevated)",
    fontSize: 13,
  } satisfies CSSProperties,
  boxTitle: { fontWeight: 600, marginBottom: 4 } satisfies CSSProperties,
  list: { margin: "6px 0 0", paddingLeft: 18 } satisfies CSSProperties,
  ignored: { fontSize: 12.5, color: "var(--text-secondary)", textDecoration: "line-through" } satisfies CSSProperties,
  banner: { borderRadius: 8, overflow: "hidden", border: "1px solid var(--crit)", marginBottom: 16 } satisfies CSSProperties,
} as const;
