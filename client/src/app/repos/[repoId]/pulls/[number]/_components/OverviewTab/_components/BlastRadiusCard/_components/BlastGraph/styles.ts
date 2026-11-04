import type { CSSProperties } from "react";

export const s = {
  root: { minWidth: 0, marginTop: 12 } satisfies CSSProperties,
  scroller: { overflowX: "auto", minWidth: 0 } satisfies CSSProperties,
  svg: { display: "block", maxWidth: "none" } satisfies CSSProperties,
  note: { marginTop: 6, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  edge: { fill: "none", stroke: "var(--border)", strokeWidth: 1.25 } satisfies CSSProperties,
  edgeActive: { fill: "none", stroke: "var(--text-muted)", strokeWidth: 2 } satisfies CSSProperties,
} as const;
