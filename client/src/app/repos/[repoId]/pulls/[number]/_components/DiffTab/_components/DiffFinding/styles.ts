import type { CSSProperties } from "react";

/** Diff-specific layout of the finding card; the shared look lives in FindingCard/styles. */
export const s = {
  card: (sevColor: string, muted: boolean): CSSProperties => ({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "12px 16px 14px 14px",
    borderStyle: "solid",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: "var(--border)",
    borderLeftColor: sevColor,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    opacity: muted ? 0.6 : 1,
    transition: "opacity .2s",
  }),
  header: { display: "flex", alignItems: "flex-start", gap: 10 } satisfies CSSProperties,
  headText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } satisfies CSSProperties,
  line: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
