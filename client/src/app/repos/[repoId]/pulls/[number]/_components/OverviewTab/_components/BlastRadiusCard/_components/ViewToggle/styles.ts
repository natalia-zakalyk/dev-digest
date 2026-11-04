import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
    flexShrink: 0,
  } satisfies CSSProperties,
};

export function buttonStyle(active: boolean): CSSProperties {
  return {
    border: "none",
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    color: active ? "var(--accent-text)" : "var(--text-muted)",
    background: active ? "var(--accent-bg)" : "transparent",
  };
}
