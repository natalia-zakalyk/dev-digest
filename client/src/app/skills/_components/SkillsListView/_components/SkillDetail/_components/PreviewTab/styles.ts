import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  title: { fontSize: 22, fontWeight: 600 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 22px" } satisfies CSSProperties,
  card: {
    fontSize: 14,
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 28,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
