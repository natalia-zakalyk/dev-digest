import type { CSSProperties } from "react";

export const s = {
  hint: { fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.5 } satisfies CSSProperties,
} as const;
