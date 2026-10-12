import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView. */
export const s = {
  page: { padding: "28px 32px", maxWidth: 960, margin: "0 auto", width: "100%" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent)" } satisfies CSSProperties,
  sub: { margin: "6px 0 0", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { marginLeft: "auto" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  stats: { fontSize: 12, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
} as const;
