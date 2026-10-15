import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard. */
export const s = {
  card: (status: string): CSSProperties => ({
    display: "flex",
    gap: 20,
    padding: "16px 18px",
    borderRadius: 10,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopColor: "var(--border)",
    borderRightColor: "var(--border)",
    borderBottomColor: "var(--border)",
    borderLeftColor:
      status === "accepted" ? "var(--ok)" : status === "rejected" ? "var(--border-strong)" : "var(--accent)",
    background: "var(--bg-surface)",
    opacity: status === "rejected" ? 0.55 : 1,
  }),
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } satisfies CSSProperties,
  rule: { margin: 0, fontSize: 15, fontWeight: 600, fontStyle: "italic" } satisfies CSSProperties,
  editRow: { display: "flex", gap: 8, alignItems: "center", flex: 1 } satisfies CSSProperties,
  evidence: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    padding: "6px 10px",
    fontSize: 12,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  path: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  snippet: { margin: 0, padding: "10px 12px", fontSize: 12.5, overflow: "auto", maxHeight: 180 } satisfies CSSProperties,
  confidence: { display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  bar: { width: 110 } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", gap: 8, width: 150, flexShrink: 0 } satisfies CSSProperties,
} as const;
