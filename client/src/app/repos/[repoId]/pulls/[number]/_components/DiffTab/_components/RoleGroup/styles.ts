import type { CSSProperties } from "react";

export const s = {
  group: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 2px",
    border: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  description: { fontSize: 12, color: "var(--text-muted)", flex: 1, minWidth: 0 } satisfies CSSProperties,
  findingsCount: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--crit)",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,
  filesCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

export function chevronFor(open: boolean): CSSProperties {
  return { color: "var(--text-muted)", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" };
}

export function swatchFor(color: string): CSSProperties {
  return { width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 };
}
