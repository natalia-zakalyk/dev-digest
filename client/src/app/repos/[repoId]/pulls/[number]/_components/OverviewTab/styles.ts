import type { CSSProperties } from "react";

export const s = {
  cardsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
    gap: 18,
    alignItems: "start",
  } satisfies CSSProperties,
  // Grid items default to min-width:auto; without 0 a long path stretches the track.
  cardCell: { minWidth: 0 } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
