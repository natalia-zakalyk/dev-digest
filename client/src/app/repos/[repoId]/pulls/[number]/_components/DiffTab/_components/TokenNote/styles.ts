import type { CSSProperties } from "react";

export const s = {
  note: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    margin: "0 0 12px",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
};
