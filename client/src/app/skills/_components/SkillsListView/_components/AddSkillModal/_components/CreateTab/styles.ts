import type { CSSProperties } from "react";

export const s = {
  banner: { borderRadius: 8, overflow: "hidden", border: "1px solid var(--crit)", marginBottom: 16 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 14px" } satisfies CSSProperties,
} as const;
