import type { CSSProperties } from "react";

export const s = {
  // minWidth 0 on every level: grid/flex items default to min-content and would be pushed
  // wider than their track by a long unbreakable path.
  root: { minWidth: 0 } satisfies CSSProperties,
  card: { width: "100%", minWidth: 0 } satisfies CSSProperties,
  statsRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 14,
    marginBottom: 6,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  notice: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
    fontSize: 13,
    color: "var(--warn)",
  } satisfies CSSProperties,
  stats: {
    display: "flex",
    flexWrap: "wrap",
    gap: 24,
  } satisfies CSSProperties,
  stat: { display: "flex", alignItems: "baseline", gap: 6 } satisfies CSSProperties,
  statValue: { fontSize: 20, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  statLabel: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, minWidth: 0 } satisfies CSSProperties,
} as const;
