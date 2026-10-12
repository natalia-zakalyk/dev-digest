import type { CSSProperties } from "react";

/** Co-located styles for BodyEditor. */
const LINE = 21;
export const s = {
  box: { border: "1px solid var(--border-strong)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  file: { fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  unsaved: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 5,
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12 } satisfies CSSProperties,
  editor: { display: "flex", height: 360 } satisfies CSSProperties,
  gutter: {
    width: 44,
    flexShrink: 0,
    overflow: "hidden",
    padding: "12px 10px 12px 0",
    textAlign: "right",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 13,
    lineHeight: `${LINE}px`,
    color: "var(--text-muted)",
    userSelect: "none",
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    minWidth: 0,
    resize: "none",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    padding: "12px 14px 12px 0",
    fontSize: 13,
    lineHeight: `${LINE}px`,
    whiteSpace: "pre",
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
