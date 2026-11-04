import type { CSSProperties } from "react";

export const s = {
  row: { borderBottom: "1px solid var(--border)", padding: "10px 0", minWidth: 0 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "var(--text-primary)",
    textAlign: "left",
  } satisfies CSSProperties,
  name: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  body: { marginTop: 8, paddingLeft: 20, minWidth: 0 } satisfies CSSProperties,
  callers: { listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4, minWidth: 0 } satisfies CSSProperties,
  caller: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    minWidth: 0,
    fontSize: 13,
    color: "var(--text-secondary)",
    // Inherited by the link: a long path wraps instead of pushing the card wider.
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  // Arrow stays full size and lines up with the first text line.
  callerText: { minWidth: 0 } satisfies CSSProperties,
  callerIcon: { flexShrink: 0, display: "inline-flex", marginTop: 3 } satisfies CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0, margin: "10px 0 0", minWidth: 0 } satisfies CSSProperties,
  chip: { minWidth: 0, maxWidth: "100%" } satisfies CSSProperties,
  // Badge is nowrap by default; a very long endpoint must wrap inside the chip.
  chipBadge: { whiteSpace: "normal", maxWidth: "100%", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
